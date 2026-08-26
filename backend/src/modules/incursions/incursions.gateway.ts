/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
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
import { PrismaService } from '../../prisma/prisma.service';
import { SocketAuthService } from '../auth/socket-auth.service';
import { IncursionsService } from './incursions.service';

type IncursionSocketData = {
  userId?: string;
  joinedIncursionRooms?: Set<string>;
  incursionCharacterIds?: Set<string>;
};

type IncursionSocket = Socket & {
  data: Socket['data'] & IncursionSocketData;
};

type IncursionRoomPayload = {
  characterId?: string;
};

const INCURSION_NAMESPACE = '/incursions';
const INCURSION_COMPLETION_SETTLE_MS = 75;
const INCURSION_STATUS_HEARTBEAT_MS = 30_000;
const INCURSION_MIN_SCHEDULE_DELAY_MS = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getIncursionStatusScheduleDelayMs(
  status: unknown,
  nowMs = Date.now(),
) {
  if (!isRecord(status)) return null;

  const activeSession = isRecord(status.activeSession)
    ? status.activeSession
    : isRecord(status.session)
      ? status.session
      : null;

  if (!activeSession || activeSession.status !== 'ACTIVE') {
    return null;
  }

  const timeline = isRecord(activeSession.timeline)
    ? activeSession.timeline
    : null;
  const endsAt =
    timeline && typeof timeline.endsAt === 'string'
      ? timeline.endsAt
      : typeof activeSession.endsAt === 'string'
        ? activeSession.endsAt
        : null;
  const endsAtMs = endsAt ? Date.parse(endsAt) : Number.NaN;

  if (!Number.isFinite(endsAtMs)) {
    return INCURSION_STATUS_HEARTBEAT_MS;
  }

  return Math.max(
    INCURSION_MIN_SCHEDULE_DELAY_MS,
    Math.min(
      INCURSION_STATUS_HEARTBEAT_MS,
      Math.ceil(endsAtMs - nowMs + INCURSION_COMPLETION_SETTLE_MS),
    ),
  );
}

@WebSocketGateway({
  namespace: INCURSION_NAMESPACE,
})
export class IncursionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(IncursionsGateway.name);
  private readonly clientsByCharacterId = new Map<string, Set<string>>();
  private readonly userIdByCharacterId = new Map<string, string>();
  private readonly timersByCharacterId = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly prisma: PrismaService,
    private readonly incursionsService: IncursionsService,
  ) {}

  async handleConnection(client: IncursionSocket) {
    client.data.joinedIncursionRooms = new Set<string>();
    client.data.incursionCharacterIds = new Set<string>();

    try {
      const token = this.extractToken(client);

      if (!token) {
        client.emit('incursion:error', {
          message: 'Token de autenticação não enviado no WebSocket.',
        });
        client.disconnect(true);
        return;
      }

      const user = await this.socketAuth.authenticate(token);

      client.data.userId = user.id;
      client.emit('incursion:connected', {
        socketId: client.id,
        userId: user.id,
      });
    } catch (error) {
      client.emit('incursion:error', {
        message: this.extractErrorMessage(error),
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: IncursionSocket) {
    const characterIds = client.data.incursionCharacterIds ?? new Set<string>();

    for (const characterId of characterIds) {
      this.removeClientFromCharacter(client.id, characterId);
    }

    client.data.joinedIncursionRooms?.clear();
    client.data.incursionCharacterIds?.clear();
  }

  @SubscribeMessage('incursion:join')
  async handleJoin(
    @ConnectedSocket() client: IncursionSocket,
    @MessageBody() payload: IncursionRoomPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (!characterId) {
      client.emit('incursion:error', {
        message: 'characterId inválido para entrar na sala de incursões.',
      });
      return null;
    }

    return this.joinCharacterRoom(client, characterId);
  }

  @SubscribeMessage('incursion:leave')
  async handleLeave(
    @ConnectedSocket() client: IncursionSocket,
    @MessageBody() payload: IncursionRoomPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (!characterId) return null;

    const room = this.getCharacterRoom(characterId);
    await client.leave(room);
    client.data.joinedIncursionRooms?.delete(room);
    client.data.incursionCharacterIds?.delete(characterId);
    this.removeClientFromCharacter(client.id, characterId);

    client.emit('incursion:left', { characterId, room });

    return { ok: true, characterId, room };
  }

  @SubscribeMessage('incursion:status:request')
  async handleStatusRequest(
    @ConnectedSocket() client: IncursionSocket,
    @MessageBody() payload: IncursionRoomPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (!characterId) {
      client.emit('incursion:error', {
        message: 'characterId inválido para buscar status de incursões.',
      });
      return null;
    }

    return this.emitStatusToClient(client, characterId, 'incursion:status');
  }

  emitStarted(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:started', payload);
    this.scheduleCharacterTimer(characterId, payload);
  }

  emitProgress(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:progress', payload);
    this.scheduleCharacterTimer(characterId, payload);
  }

  emitCompleted(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:completed', payload);
    this.clearCharacterTimer(characterId);
  }

  emitRewarded(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:rewarded', payload);
    this.emitToCharacter(characterId, 'incursion:claimed', payload);
    this.clearCharacterTimer(characterId);
  }

  emitClaimed(characterId: string, payload: unknown) {
    this.emitRewarded(characterId, payload);
  }

  emitCancelled(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:cancelled', payload);
    this.clearCharacterTimer(characterId);
  }

  private async joinCharacterRoom(
    client: IncursionSocket,
    characterId: string,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('incursion:error', { message: 'Socket não autenticado.' });
      return { ok: false, message: 'Socket não autenticado.' };
    }

    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!character) {
      client.emit('incursion:error', {
        message: 'Personagem não encontrado para este usuário.',
      });
      return {
        ok: false,
        message: 'Personagem não encontrado para este usuário.',
      };
    }

    const room = this.getCharacterRoom(character.id);

    if (!client.data.joinedIncursionRooms) {
      client.data.joinedIncursionRooms = new Set<string>();
    }

    if (!client.data.incursionCharacterIds) {
      client.data.incursionCharacterIds = new Set<string>();
    }

    if (!client.data.joinedIncursionRooms.has(room)) {
      await client.join(room);
      client.data.joinedIncursionRooms.add(room);
    }

    client.data.incursionCharacterIds.add(character.id);
    this.addClientToCharacter(client.id, character.id, userId);
    client.emit('incursion:joined', {
      characterId: character.id,
      characterName: character.name,
      room,
    });

    this.logger.log(
      `Socket ${client.id} entrou na sala ${room} | personagem=${character.name}`,
    );

    await this.emitStatusToClient(client, character.id, 'incursion:status');

    return { ok: true, characterId: character.id, room };
  }

  private addClientToCharacter(
    clientId: string,
    characterId: string,
    userId: string,
  ) {
    const clients = this.clientsByCharacterId.get(characterId) ?? new Set();
    clients.add(clientId);
    this.clientsByCharacterId.set(characterId, clients);
    this.userIdByCharacterId.set(characterId, userId);
  }

  private removeClientFromCharacter(clientId: string, characterId: string) {
    const clients = this.clientsByCharacterId.get(characterId);

    if (!clients) return;

    clients.delete(clientId);

    if (clients.size > 0) {
      this.clientsByCharacterId.set(characterId, clients);
      return;
    }

    this.clientsByCharacterId.delete(characterId);
    this.userIdByCharacterId.delete(characterId);
    this.clearCharacterTimer(characterId);
  }

  private scheduleCharacterTimer(characterId: string, status: unknown) {
    this.clearCharacterTimer(characterId);

    if (!this.clientsByCharacterId.has(characterId)) return;

    const delayMs = getIncursionStatusScheduleDelayMs(status);

    if (delayMs === null) return;

    const timerId = setTimeout(() => {
      this.timersByCharacterId.delete(characterId);
      void this.emitStatusToRoom(characterId, 'incursion:progress');
    }, delayMs);

    this.timersByCharacterId.set(characterId, timerId);
  }

  private clearCharacterTimer(characterId: string) {
    const timerId = this.timersByCharacterId.get(characterId);

    if (!timerId) return;

    clearTimeout(timerId);
    this.timersByCharacterId.delete(characterId);
  }

  private async emitStatusToClient(
    client: IncursionSocket,
    characterId: string,
    eventName: string,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('incursion:error', { message: 'Socket não autenticado.' });
      return null;
    }

    const status = await this.safeGetStatus(userId, characterId);

    if (!status) return null;

    client.emit(eventName, status);
    this.scheduleCharacterTimer(characterId, status);
    return status;
  }

  private async emitStatusToRoom(characterId: string, eventName: string) {
    const userId = this.userIdByCharacterId.get(characterId);

    if (!userId) return null;

    const status = await this.safeGetStatus(userId, characterId);

    if (!status) return null;

    const activeSession = status.activeSession;
    const rewardedSession = (status as { rewardedSession?: unknown | null })
      .rewardedSession;
    const effectiveEventName = rewardedSession
      ? 'incursion:rewarded'
      : activeSession?.status === 'COMPLETED' &&
          eventName === 'incursion:progress'
        ? 'incursion:completed'
        : eventName;

    this.emitToCharacter(characterId, effectiveEventName, status);

    if (rewardedSession) {
      this.emitToCharacter(characterId, 'incursion:completed', status);
    }

    this.scheduleCharacterTimer(characterId, status);

    return status;
  }

  private async safeGetStatus(userId: string, characterId: string) {
    try {
      return await this.incursionsService.getStatus(userId, characterId);
    } catch (error) {
      this.emitToCharacter(characterId, 'incursion:error', {
        message: this.extractErrorMessage(error),
      });
      return null;
    }
  }

  private emitToCharacter(
    characterId: string,
    eventName: string,
    payload: unknown,
  ) {
    const normalizedCharacterId = this.normalizeId(characterId);

    if (!normalizedCharacterId) return;

    this.server
      .to(this.getCharacterRoom(normalizedCharacterId))
      .emit(eventName, payload);
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }

    const header = client.handshake.headers.authorization;

    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    return null;
  }

  private normalizeId(value?: string | null): string | null {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private getCharacterRoom(characterId: string) {
    return `character:${characterId}:incursions`;
  }

  private extractErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }

    return 'Erro inesperado no realtime de incursões.';
  }
}
