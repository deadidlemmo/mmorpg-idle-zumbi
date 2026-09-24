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
import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
} from '@prisma/client';
import { ObservabilityService } from '../../common/observability/observability.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SocketAuthService } from '../auth/socket-auth.service';
import {
  buildAutoCombatRealtimeStatusPayload,
  getSerializedPayloadBytes,
} from './auto-combat-realtime-payload';
import { HuntingVisualPositionService } from './hunting-visual-position.service';

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
  joinedCharacterIds?: Set<string>;
  telemetryWindowStartedAt?: number;
  telemetryReportsInWindow?: number;
  huntingVisual?: HuntingVisualPresence;
  huntingVisualCheckedAt?: number;
  huntingVisualSentAt?: number;
  huntingVisualSessionId?: string;
  huntingVisualSavedAt?: number;
  huntingVisualCombat?: HuntingVisualCombatState;
};

type HuntingVisualAreaId = 'suburbio' | 'casa-abandonada';
type HuntingVisualDirection = 'up' | 'down' | 'left' | 'right';
type HuntingVisualState =
  | 'walking'
  | 'approaching'
  | 'investigating'
  | 'alert'
  | 'found'
  | 'continuing'
  | 'combat';
type HuntingVisualPose = {
  characterId: string;
  areaId: HuntingVisualAreaId;
  tileX: number;
  tileY: number;
  direction: HuntingVisualDirection;
  visualState: HuntingVisualState;
  moving: boolean;
  combatMobName?: string | null;
  combatCycleKey?: string | null;
  combatEventType?: HuntingVisualCombatEventType | null;
  combatEventKey?: string | null;
};
type HuntingVisualPresence = HuntingVisualPose & {
  displayName: string;
  mapId: string;
  subMapId: string;
  updatedAt: number;
};
type HuntingVisualCombatEventType =
  | 'MOB_SPAWNED'
  | 'MOB_HIT'
  | 'PLAYER_HIT'
  | 'DODGE'
  | 'POTION_USED'
  | 'MOB_DEFEATED'
  | 'PLAYER_DEFEATED';
type HuntingVisualCombatState = {
  active: boolean;
  mobName: string | null;
  cycleKey: string | null;
  eventType: HuntingVisualCombatEventType | null;
  eventKey: string | null;
};

const HUNTING_VISUAL_BOUNDS: Record<HuntingVisualAreaId, [number, number]> = {
  suburbio: [48, 32],
  'casa-abandonada': [44, 28],
};
const HUNTING_VISUAL_STATES: HuntingVisualState[] = [
  'walking',
  'approaching',
  'investigating',
  'alert',
  'found',
  'continuing',
  'combat',
];
const HUNTING_VISUAL_DIRECTIONS: HuntingVisualDirection[] = [
  'up',
  'down',
  'left',
  'right',
];
const HUNTING_VISUAL_COMBAT_EVENTS = new Set<HuntingVisualCombatEventType>([
  'MOB_SPAWNED',
  'MOB_HIT',
  'PLAYER_HIT',
  'DODGE',
  'POTION_USED',
  'MOB_DEFEATED',
  'PLAYER_DEFEATED',
]);

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

  private readonly socketIdsByCharacterId = new Map<string, Set<string>>();

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
    private readonly huntingVisualPosition: HuntingVisualPositionService,
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
      client.data.joinedCharacterIds = new Set<string>();
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

  async handleDisconnect(client: AuthenticatedSocket) {
    await this.leaveHuntingVisual(client);
    if (client.data.userId) {
      this.unregisterPresence(client.data.userId, client.id);
      this.observability.recordAutoCombatSocketConnection(false);
    }

    for (const characterId of client.data.joinedCharacterIds ?? []) {
      this.unregisterCharacterPresence(characterId, client.id);
    }

    client.data.joinedCharacterRooms?.clear();
    client.data.joinedCharacterIds?.clear();

    this.logger.log(`Socket desconectado: ${client.id}`);
  }

  getOnlinePlayersCount() {
    return this.socketIdsByUserId.size;
  }

  getOnlineCharacterIds() {
    return new Set(this.socketIdsByCharacterId.keys());
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

  private registerCharacterPresence(characterId: string, socketId: string) {
    const socketIds =
      this.socketIdsByCharacterId.get(characterId) ?? new Set<string>();

    socketIds.add(socketId);
    this.socketIdsByCharacterId.set(characterId, socketIds);
  }

  private unregisterCharacterPresence(characterId: string, socketId: string) {
    const socketIds = this.socketIdsByCharacterId.get(characterId);

    if (!socketIds) {
      return;
    }

    socketIds.delete(socketId);

    if (socketIds.size > 0) {
      return;
    }

    this.socketIdsByCharacterId.delete(characterId);
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

    if (!client.data.joinedCharacterIds) {
      client.data.joinedCharacterIds = new Set<string>();
    }

    if (!client.data.joinedCharacterRooms.has(room)) {
      await client.join(room);
      client.data.joinedCharacterRooms.add(room);
      client.data.joinedCharacterIds.add(character.id);
      this.registerCharacterPresence(character.id, client.id);
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

    const wasJoined = client.data.joinedCharacterRooms?.has(room) === true;

    await client.leave(room);

    client.data.joinedCharacterRooms?.delete(room);
    client.data.joinedCharacterIds?.delete(characterId);

    if (wasJoined) {
      if (client.data.huntingVisual?.characterId === characterId) {
        await this.leaveHuntingVisual(client);
      }
      this.unregisterCharacterPresence(characterId, client.id);
    }

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

  @SubscribeMessage('auto-combat:visual:join')
  async handleHuntingVisualJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: HuntingVisualPose,
  ) {
    const pose = this.parseHuntingVisualPose(payload);
    if (
      !pose ||
      !client.data.userId ||
      !client.data.joinedCharacterIds?.has(pose.characterId)
    ) {
      return { ok: false };
    }
    const session = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId: pose.characterId,
        character: {
          userId: client.data.userId,
          status: CharacterStatus.ACTIVE,
          deletedAt: null,
        },
        status: AutoCombatSessionStatus.ACTIVE,
        phase: {
          in: [
            AutoCombatSessionPhase.HUNTING,
            AutoCombatSessionPhase.ENCOUNTER_READY,
            AutoCombatSessionPhase.COMBAT_ACTIVE,
          ],
        },
        endsAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        mapId: true,
        subMapId: true,
        phase: true,
        currentCombatIndex: true,
        currentMobId: true,
        currentMob: { select: { name: true } },
        character: { select: { name: true } },
      },
    });
    if (!session) {
      await this.leaveHuntingVisual(client);
      return { ok: false };
    }
    await this.leaveHuntingVisual(client);
    const combatState = this.getHuntingVisualCombatState(session);
    const presence: HuntingVisualPresence = {
      ...this.applyCanonicalHuntingVisualCombat(pose, combatState),
      displayName: session.character.name,
      mapId: session.mapId,
      subMapId: session.subMapId,
      updatedAt: Date.now(),
    };
    client.data.huntingVisual = presence;
    client.data.huntingVisualCombat = combatState;
    client.data.huntingVisualSessionId = session.id;
    client.data.huntingVisualCheckedAt = Date.now();
    client.data.huntingVisualSentAt = 0;
    client.data.huntingVisualSavedAt = Date.now();
    await this.huntingVisualPosition.save(session.id, pose);
    const room = this.getHuntingVisualRoom(presence);
    await client.join(room);
    const sockets = await this.server.in(room).fetchSockets();
    const players = new Map<string, HuntingVisualPresence>();
    for (const socket of sockets) {
      const other = socket.data.huntingVisual as
        | HuntingVisualPresence
        | undefined;
      if (
        other &&
        other.characterId !== pose.characterId &&
        Date.now() - other.updatedAt < 15_000 &&
        (!players.has(other.characterId) ||
          players.get(other.characterId)!.updatedAt < other.updatedAt)
      ) {
        players.set(other.characterId, other);
      }
    }
    client.emit('auto-combat:visual:snapshot', {
      areaId: pose.areaId,
      players: [...players.values()].slice(0, 24),
    });
    client.to(room).emit('auto-combat:visual:pose', presence);
    return { ok: true };
  }

  @SubscribeMessage('auto-combat:visual:pose')
  async handleHuntingVisualPose(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: HuntingVisualPose,
  ) {
    const previous = client.data.huntingVisual;
    const pose = this.parseHuntingVisualPose(payload);
    if (
      !previous ||
      !pose ||
      pose.characterId !== previous.characterId ||
      pose.areaId !== previous.areaId ||
      !client.data.joinedCharacterIds?.has(pose.characterId)
    ) {
      return { ok: false };
    }
    const now = Date.now();
    if (now - (client.data.huntingVisualSentAt ?? 0) < 120) {
      return { ok: false };
    }
    if (now - (client.data.huntingVisualCheckedAt ?? 0) > 10_000) {
      const active = await this.prisma.autoCombatSession.findFirst({
        where: {
          characterId: pose.characterId,
          mapId: previous.mapId,
          subMapId: previous.subMapId,
          status: AutoCombatSessionStatus.ACTIVE,
          phase: {
            in: [
              AutoCombatSessionPhase.HUNTING,
              AutoCombatSessionPhase.ENCOUNTER_READY,
              AutoCombatSessionPhase.COMBAT_ACTIVE,
            ],
          },
          endsAt: { gt: new Date() },
        },
        select: {
          id: true,
          phase: true,
          currentCombatIndex: true,
          currentMobId: true,
          currentMob: { select: { name: true } },
        },
      });
      if (!active) {
        await this.leaveHuntingVisual(client);
        return { ok: false };
      }
      client.data.huntingVisualCombat =
        this.getHuntingVisualCombatState(active);
      client.data.huntingVisualCheckedAt = now;
    }
    const distance = Math.hypot(
      pose.tileX - previous.tileX,
      pose.tileY - previous.tileY,
    );
    if (
      distance >
      1.5 + (Math.min(now - previous.updatedAt, 3000) / 1000) * 3.5
    ) {
      return { ok: false };
    }
    const canonicalPose = this.applyCanonicalHuntingVisualCombat(
      pose,
      client.data.huntingVisualCombat ?? {
        active: false,
        mobName: null,
        cycleKey: null,
        eventType: null,
        eventKey: null,
      },
    );
    const presence = { ...previous, ...canonicalPose, updatedAt: now };
    client.data.huntingVisual = presence;
    client.data.huntingVisualSentAt = now;
    if (
      client.data.huntingVisualSessionId &&
      now - (client.data.huntingVisualSavedAt ?? 0) >= 1000
    ) {
      client.data.huntingVisualSavedAt = now;
      void this.huntingVisualPosition.save(
        client.data.huntingVisualSessionId,
        pose,
      );
    }
    client
      .to(this.getHuntingVisualRoom(presence))
      .emit('auto-combat:visual:pose', presence);
    return { ok: true };
  }

  @SubscribeMessage('auto-combat:visual:leave')
  async handleHuntingVisualLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    await this.leaveHuntingVisual(client);
    return { ok: true };
  }

  private async leaveHuntingVisual(client: AuthenticatedSocket) {
    const presence = client.data.huntingVisual;
    if (!presence) return;
    if (client.data.huntingVisualSessionId) {
      await this.huntingVisualPosition.save(
        client.data.huntingVisualSessionId,
        presence,
      );
    }
    const room = this.getHuntingVisualRoom(presence);
    client
      .to(room)
      .emit('auto-combat:visual:left', { characterId: presence.characterId });
    await client.leave(room);
    client.data.huntingVisual = undefined;
    client.data.huntingVisualSessionId = undefined;
    client.data.huntingVisualCombat = undefined;
  }

  private getHuntingVisualRoom(presence: HuntingVisualPresence) {
    return `auto-combat:visual:${presence.mapId}:${presence.subMapId ?? ''}:${presence.areaId}`;
  }

  private parseHuntingVisualPose(
    value: HuntingVisualPose | undefined,
  ): HuntingVisualPose | null {
    if (!value || typeof value !== 'object') return null;
    const characterId = this.normalizeId(value.characterId);
    const validArea =
      value.areaId === 'suburbio' || value.areaId === 'casa-abandonada';
    const bounds = validArea ? HUNTING_VISUAL_BOUNDS[value.areaId] : null;
    if (
      !characterId ||
      !bounds ||
      !HUNTING_VISUAL_DIRECTIONS.includes(value.direction) ||
      !HUNTING_VISUAL_STATES.includes(value.visualState) ||
      typeof value.moving !== 'boolean' ||
      typeof value.tileX !== 'number' ||
      typeof value.tileY !== 'number' ||
      !Number.isFinite(value.tileX) ||
      !Number.isFinite(value.tileY) ||
      value.tileX < 0 ||
      value.tileY < 0 ||
      value.tileX >= bounds[0] ||
      value.tileY >= bounds[1]
    )
      return null;
    return {
      characterId,
      areaId: value.areaId,
      tileX: Math.round(value.tileX * 100) / 100,
      tileY: Math.round(value.tileY * 100) / 100,
      direction: value.direction,
      visualState: value.visualState,
      moving: value.moving,
      ...(value.visualState === 'combat'
        ? {
            combatMobName: this.normalizeVisualLabel(value.combatMobName, 100),
            combatCycleKey: this.normalizeVisualLabel(
              value.combatCycleKey,
              160,
            ),
            combatEventType: this.normalizeHuntingVisualCombatEventType(
              value.combatEventType,
            ),
            combatEventKey: this.normalizeVisualLabel(
              value.combatEventKey,
              180,
            ),
          }
        : {}),
    };
  }

  private normalizeVisualLabel(value: unknown, maxLength: number) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private normalizeHuntingVisualCombatEventType(
    value: unknown,
  ): HuntingVisualCombatEventType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    return HUNTING_VISUAL_COMBAT_EVENTS.has(
      normalized as HuntingVisualCombatEventType,
    )
      ? (normalized as HuntingVisualCombatEventType)
      : null;
  }

  private getHuntingVisualCombatState(session: {
    id: string;
    phase: AutoCombatSessionPhase;
    currentCombatIndex: number;
    currentMobId: string | null;
    currentMob: { name: string } | null;
  }): HuntingVisualCombatState {
    const active =
      session.phase === AutoCombatSessionPhase.COMBAT_ACTIVE &&
      Boolean(session.currentMobId && session.currentMob);
    return {
      active,
      mobName: active ? (session.currentMob?.name ?? null) : null,
      cycleKey: active
        ? `${session.id}:${session.currentCombatIndex}:${session.currentMobId}`
        : null,
      eventType: null,
      eventKey: null,
    };
  }

  private applyCanonicalHuntingVisualCombat(
    pose: HuntingVisualPose,
    combat: HuntingVisualCombatState,
  ): HuntingVisualPose {
    if (combat.active) {
      return {
        ...pose,
        visualState: 'combat',
        moving: false,
        combatMobName: combat.mobName,
        combatCycleKey: combat.cycleKey,
        combatEventType: combat.eventType,
        combatEventKey: combat.eventKey,
      };
    }

    const canonical: HuntingVisualPose = {
      ...pose,
      visualState: pose.visualState === 'combat' ? 'walking' : pose.visualState,
      moving: pose.visualState === 'combat' ? false : pose.moving,
    };
    delete canonical.combatMobName;
    delete canonical.combatCycleKey;
    delete canonical.combatEventType;
    delete canonical.combatEventKey;
    return canonical;
  }

  private emitHuntingVisualCombatEvent(characterId: string, payload: unknown) {
    const sockets = this.server?.sockets?.sockets;
    if (!sockets) return;
    const record =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : null;
    const eventType = this.normalizeHuntingVisualCombatEventType(record?.type);
    if (!eventType) return;

    const rawEventKey =
      record?.eventKey ?? record?.eventId ?? record?.id ?? record?.sequence;
    const normalizedRawEventKey =
      typeof rawEventKey === 'string' || typeof rawEventKey === 'number'
        ? String(rawEventKey)
        : null;
    const eventKey = this.normalizeVisualLabel(normalizedRawEventKey, 180);
    const incomingMobName = this.normalizeVisualLabel(record?.mobName, 100);
    const incomingCycleKey = this.normalizeVisualLabel(
      record?.enemyInstanceId ?? record?.combatCycleKey,
      160,
    );
    const terminal =
      eventType === 'MOB_DEFEATED' || eventType === 'PLAYER_DEFEATED';

    for (const socket of sockets.values()) {
      const client = socket as AuthenticatedSocket;
      const presence = client.data.huntingVisual;
      if (!presence || presence.characterId !== characterId) continue;

      const previousCombat = client.data.huntingVisualCombat;
      const eventCombat: HuntingVisualCombatState = {
        active: true,
        mobName:
          incomingMobName ??
          previousCombat?.mobName ??
          presence.combatMobName ??
          null,
        cycleKey:
          incomingCycleKey ??
          previousCombat?.cycleKey ??
          presence.combatCycleKey ??
          null,
        eventType,
        eventKey,
      };
      const nextPresence: HuntingVisualPresence = {
        ...this.applyCanonicalHuntingVisualCombat(presence, eventCombat),
        displayName: presence.displayName,
        mapId: presence.mapId,
        subMapId: presence.subMapId,
        updatedAt: Date.now(),
      };
      client.data.huntingVisual = nextPresence;
      client.data.huntingVisualCombat = terminal
        ? {
            active: false,
            mobName: null,
            cycleKey: null,
            eventType: null,
            eventKey: null,
          }
        : eventCombat;
      client
        .to(this.getHuntingVisualRoom(nextPresence))
        .emit('auto-combat:visual:pose', nextPresence);
    }
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

  emitHuntTargetFound(characterId: string, payload: unknown) {
    this.clearStatusCache(characterId);
    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:hunt-target-found',
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
    this.emitHuntingVisualCombatEvent(characterId, payload);
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
