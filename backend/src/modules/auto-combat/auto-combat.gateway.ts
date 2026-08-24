import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ObservabilityService } from '../../common/observability/observability.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SocketAuthService } from '../auth/socket-auth.service';
import {
  buildAutoCombatRealtimeStatusPayload,
  getSerializedPayloadBytes,
} from './auto-combat-realtime-payload';

type AutoCombatJoinPayload = {
  characterId?: string;
};

type AutoCombatLeavePayload = {
  characterId?: string;
};

type AutoCombatSocketData = {
  userId?: string;
  email?: string | null;
  joinedCharacterRooms?: Set<string>;
  telemetryWindowStartedAt?: number;
  telemetryReportsInWindow?: number;
};

type AuthenticatedSocket = Omit<Socket, 'data'> & {
  data: AutoCombatSocketData;
};

type RealtimePayloadLike = {
  type?: string | null;
};

type AutoCombatTelemetryPayload = {
  characterId?: string;
  kind?:
    | 'EVENT_RECEIVED'
    | 'EVENT_DISPOSITION'
    | 'VISUAL_CYCLE'
    | 'VISIBILITY'
    | 'RECONCILIATION'
    | 'LIFECYCLE';
  context?: string | null;
  eventType?: string | null;
  transitDelayMs?: number | null;
  queueDepth?: number | null;
  sequenceGap?: number | null;
  outOfOrder?: boolean;
  disposition?: 'DUPLICATE' | 'SUPPRESSED' | null;
  reconciledEvents?: number | null;
  realSequenceGaps?: number | null;
  hiddenDurationMs?: number | null;
  lifecycle?: 'RECONNECTED' | null;
  visualDurationMs?: number | null;
  expectedDurationMs?: number | null;
  afterVisibilityReturn?: boolean;
};

const AUTO_COMBAT_TELEMETRY_WINDOW_MS = 60_000;
const AUTO_COMBAT_TELEMETRY_MAX_REPORTS_PER_WINDOW = 600;

@WebSocketGateway({
  namespace: '/auto-combat',
})
export class AutoCombatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AutoCombatGateway.name);

  /** Evita enviar duas vezes o mesmo snapshot canônico no mesmo ciclo. */
  private readonly lastStatusSignatureByCharacterId = new Map<string, string>();

  private readonly socketIdsByUserId = new Map<string, Set<string>>();

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        client.emit('auto-combat:error', {
          message: 'Token de autenticação não enviado no WebSocket.',
        });

        client.disconnect(true);
        return;
      }

      const user = await this.socketAuth.authenticate(token);

      client.data.userId = user.id;
      client.data.email = user.email;
      client.data.joinedCharacterRooms = new Set<string>();
      client.data.telemetryWindowStartedAt = Date.now();
      client.data.telemetryReportsInWindow = 0;

      this.registerPresence(user.id, client.id);
      this.observability.recordAutoCombatSocketConnection(true);

      await client.join(this.getUserRoom(user.id));

      client.emit('auto-combat:connected', {
        socketId: client.id,
        userId: user.id,
      });

      this.logger.log(`Socket conectado: ${client.id} | userId=${user.id}`);
    } catch {
      client.emit('auto-combat:error', {
        message: 'Não foi possível autenticar o WebSocket.',
      });

      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.data.userId) {
      this.unregisterPresence(client.data.userId, client.id);
      this.observability.recordAutoCombatSocketConnection(false);
    }

    client.data.joinedCharacterRooms?.clear();

    this.logger.log(`Socket desconectado: ${client.id}`);
  }

  getOnlinePlayersCount() {
    return this.socketIdsByUserId.size;
  }

  private registerPresence(userId: string, socketId: string) {
    const socketIds = this.socketIdsByUserId.get(userId) ?? new Set<string>();

    socketIds.add(socketId);
    this.socketIdsByUserId.set(userId, socketIds);
  }

  private unregisterPresence(userId: string, socketId: string) {
    const socketIds = this.socketIdsByUserId.get(userId);

    if (!socketIds) {
      return;
    }

    socketIds.delete(socketId);

    if (socketIds.size > 0) {
      this.socketIdsByUserId.set(userId, socketIds);
      return;
    }

    this.socketIdsByUserId.delete(userId);
  }

  @SubscribeMessage('auto-combat:join')
  async handleJoinAutoCombatRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: AutoCombatJoinPayload,
  ) {
    const userId = client.data.userId;
    const characterId = this.normalizeId(payload?.characterId);

    if (!userId) {
      client.emit('auto-combat:error', {
        message: 'Socket não autenticado.',
      });

      return {
        ok: false,
        message: 'Socket não autenticado.',
      };
    }

    if (!characterId) {
      client.emit('auto-combat:error', {
        message: 'ID do personagem não enviado para entrar na sala.',
      });

      return {
        ok: false,
        message: 'ID do personagem não enviado para entrar na sala.',
      };
    }

    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!character) {
      client.emit('auto-combat:error', {
        message: 'Personagem não encontrado para este usuário.',
      });

      return {
        ok: false,
        message: 'Personagem não encontrado para este usuário.',
      };
    }

    const room = this.getCharacterRoom(character.id);

    if (!client.data.joinedCharacterRooms) {
      client.data.joinedCharacterRooms = new Set<string>();
    }

    if (!client.data.joinedCharacterRooms.has(room)) {
      await client.join(room);
      client.data.joinedCharacterRooms.add(room);
    }

    client.emit('auto-combat:joined', {
      characterId: character.id,
      characterName: character.name,
      room,
    });

    this.logger.log(
      `Socket ${client.id} entrou na sala ${room} | personagem=${character.name}`,
    );

    return {
      ok: true,
      characterId: character.id,
      characterName: character.name,
      room,
    };
  }

  @SubscribeMessage('auto-combat:leave')
  async handleLeaveAutoCombatRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: AutoCombatLeavePayload,
  ) {
    const userId = client.data.userId;
    const characterId = this.normalizeId(payload?.characterId);

    if (!userId) {
      client.emit('auto-combat:error', {
        message: 'Socket não autenticado.',
      });

      return {
        ok: false,
        message: 'Socket não autenticado.',
      };
    }

    if (!characterId) {
      return {
        ok: false,
        message: 'ID do personagem não enviado para sair da sala.',
      };
    }

    const room = this.getCharacterRoom(characterId);

    await client.leave(room);

    client.data.joinedCharacterRooms?.delete(room);

    client.emit('auto-combat:left', {
      characterId,
      room,
    });

    this.logger.log(`Socket ${client.id} saiu da sala ${room}`);

    return {
      ok: true,
      characterId,
      room,
    };
  }

  @SubscribeMessage('auto-combat:telemetry')
  handleTelemetry(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: AutoCombatTelemetryPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (
      !client.data.userId ||
      !characterId ||
      !client.data.joinedCharacterRooms?.has(
        this.getCharacterRoom(characterId),
      ) ||
      !this.consumeTelemetryQuota(client)
    ) {
      return { ok: false };
    }

    if (payload.kind === 'EVENT_RECEIVED') {
      this.observability.recordAutoCombatClientTelemetry({
        kind: payload.kind,
        context: payload.context,
        eventType: payload.eventType,
        transitDelayMs: this.normalizeMetric(payload.transitDelayMs, 60_000),
        queueDepth: this.normalizeMetric(payload.queueDepth, 1000),
        sequenceGap: this.normalizeMetric(payload.sequenceGap, 1000),
        outOfOrder: payload.outOfOrder === true,
      });

      return { ok: true };
    }

    if (payload.kind === 'EVENT_DISPOSITION') {
      this.observability.recordAutoCombatClientTelemetry({
        kind: payload.kind,
        context: payload.context,
        eventType: payload.eventType,
        disposition:
          payload.disposition === 'DUPLICATE' ||
          payload.disposition === 'SUPPRESSED'
            ? payload.disposition
            : null,
      });

      return { ok: true };
    }

    if (payload.kind === 'VISUAL_CYCLE') {
      this.observability.recordAutoCombatClientTelemetry({
        kind: payload.kind,
        context: payload.context,
        visualDurationMs: this.normalizeMetric(
          payload.visualDurationMs,
          60_000,
        ),
        expectedDurationMs: this.normalizeMetric(
          payload.expectedDurationMs,
          60_000,
        ),
        afterVisibilityReturn: payload.afterVisibilityReturn === true,
      });

      return { ok: true };
    }

    if (payload.kind === 'VISIBILITY') {
      this.observability.recordAutoCombatClientTelemetry({
        kind: payload.kind,
        context: payload.context,
        hiddenDurationMs: this.normalizeMetric(
          payload.hiddenDurationMs,
          24 * 60 * 60 * 1000,
        ),
      });

      return { ok: true };
    }

    if (payload.kind === 'RECONCILIATION') {
      this.observability.recordAutoCombatClientTelemetry({
        kind: payload.kind,
        context: payload.context,
        reconciledEvents: this.normalizeMetric(
          payload.reconciledEvents,
          10_000,
        ),
        realSequenceGaps: this.normalizeMetric(
          payload.realSequenceGaps,
          10_000,
        ),
      });

      return { ok: true };
    }

    if (payload.kind === 'LIFECYCLE') {
      this.observability.recordAutoCombatClientTelemetry({
        kind: payload.kind,
        context: payload.context,
        lifecycle: payload.lifecycle === 'RECONNECTED' ? 'RECONNECTED' : null,
      });

      return { ok: true };
    }

    return { ok: false };
  }

  emitStatus(characterId: string, payload: unknown) {
    const normalizedCharacterId = this.normalizeId(characterId);

    if (!normalizedCharacterId) {
      return;
    }

    const realtimePayload = buildAutoCombatRealtimeStatusPayload(payload);

    if (
      this.shouldSuppressDuplicateStatus(normalizedCharacterId, realtimePayload)
    ) {
      return;
    }

    this.emitToCharacter(
      normalizedCharacterId,
      'auto-combat:status',
      realtimePayload,
    );
  }

  emitSessionUpdated(characterId: string, payload: unknown) {
    this.emitStatus(characterId, payload);
  }

  emitHit(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);

    const type = this.getPayloadType(payload);

    if (type === 'DODGE') {
      this.emitRealtimeEventToCharacter(
        characterId,
        'auto-combat:dodge',
        payload,
      );
      return;
    }

    this.emitRealtimeEventToCharacter(characterId, 'auto-combat:hit', payload);
  }

  emitMobSpawned(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:mob-spawned',
      payload,
    );
  }

  emitMobDefeated(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:mob-defeated',
      payload,
    );
  }

  emitPlayerDefeated(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:player-defeated',
      payload,
    );
  }

  emitPotionUsed(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:potion-used',
      payload,
    );
  }

  emitFinished(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);
    this.emitToCharacter(
      characterId,
      'auto-combat:finished',
      buildAutoCombatRealtimeStatusPayload(payload),
    );
  }

  emitStopped(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);
    this.emitToCharacter(
      characterId,
      'auto-combat:stopped',
      buildAutoCombatRealtimeStatusPayload(payload),
    );
  }

  emitError(characterId: string, message: string) {
    this.emitToCharacter(characterId, 'auto-combat:error', {
      message,
    });
  }

  private emitRealtimeEventToCharacter(
    characterId: string,
    _event: string,
    payload: unknown,
  ) {
    this.emitToCharacter(characterId, 'auto-combat:event', payload);
  }

  private emitToCharacter(
    characterId: string,
    event: string,
    payload: unknown,
  ) {
    if (!this.server) {
      return;
    }

    const normalizedCharacterId = this.normalizeId(characterId);

    if (!normalizedCharacterId) {
      return;
    }

    this.observability.recordAutoCombatSocketEmission({
      eventName: event,
      payloadBytes: getSerializedPayloadBytes(payload),
    });

    this.server
      .to(this.getCharacterRoom(normalizedCharacterId))
      .emit(event, payload);
  }

  private shouldSuppressDuplicateStatus(
    characterId: string,
    payload: unknown,
  ): boolean {
    const signature = this.getPayloadSignature(payload);
    const previousSignature =
      this.lastStatusSignatureByCharacterId.get(characterId);

    if (previousSignature === signature) {
      return true;
    }

    this.lastStatusSignatureByCharacterId.set(characterId, signature);

    return false;
  }

  private clearStatusCache(characterId: string) {
    const normalizedCharacterId = this.normalizeId(characterId);

    if (!normalizedCharacterId) {
      return;
    }

    this.lastStatusSignatureByCharacterId.delete(normalizedCharacterId);
  }

  private getPayloadSignature(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return String(Date.now());
    }
  }

  private getPayloadType(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      return '';
    }

    const typedPayload = payload as RealtimePayloadLike;

    return String(typedPayload.type ?? '')
      .trim()
      .toUpperCase();
  }

  private extractToken(client: AuthenticatedSocket) {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken = auth?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return this.normalizeBearerToken(authToken);
    }

    const authAccessToken = auth?.accessToken;

    if (typeof authAccessToken === 'string' && authAccessToken.trim()) {
      return this.normalizeBearerToken(authAccessToken);
    }

    const queryToken = client.handshake.query?.token;

    if (typeof queryToken === 'string' && queryToken.trim()) {
      return this.normalizeBearerToken(queryToken);
    }

    const queryAccessToken = client.handshake.query?.accessToken;

    if (typeof queryAccessToken === 'string' && queryAccessToken.trim()) {
      return this.normalizeBearerToken(queryAccessToken);
    }

    const authorizationHeader = client.handshake.headers.authorization;

    if (typeof authorizationHeader === 'string' && authorizationHeader.trim()) {
      return this.normalizeBearerToken(authorizationHeader);
    }

    return null;
  }

  private normalizeBearerToken(value: string) {
    const token = value.trim();

    if (token.toLowerCase().startsWith('bearer ')) {
      return token.slice(7).trim();
    }

    return token;
  }

  private normalizeId(value?: string | null) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private consumeTelemetryQuota(client: AuthenticatedSocket) {
    const now = Date.now();
    const windowStartedAt = client.data.telemetryWindowStartedAt ?? now;

    if (now - windowStartedAt >= AUTO_COMBAT_TELEMETRY_WINDOW_MS) {
      client.data.telemetryWindowStartedAt = now;
      client.data.telemetryReportsInWindow = 1;
      return true;
    }

    const reports = client.data.telemetryReportsInWindow ?? 0;

    if (reports >= AUTO_COMBAT_TELEMETRY_MAX_REPORTS_PER_WINDOW) {
      return false;
    }

    client.data.telemetryReportsInWindow = reports + 1;
    return true;
  }

  private normalizeMetric(value: unknown, maximum: number) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.min(maximum, Math.max(0, parsed));
  }

  private getUserRoom(userId: string) {
    return `user:${userId}`;
  }

  private getCharacterRoom(characterId: string) {
    return `auto-combat:character:${characterId}`;
  }
}
