import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { WorldBossEventStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { SocketAuthService } from '../auth/socket-auth.service';
import { WorldBossesService } from './world-bosses.service';

const WORLD_BOSS_STATUS_TICK_MS = 1000;

type WorldBossSocketSubscription = {
  eventId: string;
  characterId: string;
  lastStatus?: WorldBossEventStatus | null;
};

type WorldBossSocket = Socket & {
  data: {
    userId?: string;
    worldBossAuthentication?: Promise<string>;
    joinedWorldBossRooms?: Set<string>;
    worldBossSubscriptions?: Map<string, WorldBossSocketSubscription>;
    worldBossStatusInterval?: NodeJS.Timeout;
  };
};

@WebSocketGateway({
  namespace: '/world-bosses',
})
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class WorldBossesGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly worldBossesService: WorldBossesService,
  ) {}

  async handleConnection(client: WorldBossSocket) {
    const authentication = this.authenticateClient(client);
    client.data.worldBossAuthentication = authentication;

    try {
      await authentication;
    } catch (error) {
      client.emit('worldBoss:error', {
        message: this.extractErrorMessage(error),
      });
      client.disconnect(true);
    } finally {
      if (client.data.worldBossAuthentication === authentication) {
        client.data.worldBossAuthentication = undefined;
      }
    }
  }

  handleDisconnect(client: WorldBossSocket) {
    client.data.joinedWorldBossRooms?.clear();
    client.data.worldBossSubscriptions?.clear();
    this.clearStatusInterval(client);
  }

  @SubscribeMessage('worldBoss:join')
  async handleJoin(
    @ConnectedSocket() client: WorldBossSocket,
    @MessageBody() payload: { eventId?: string; characterId?: string },
  ) {
    const userId = await this.resolveAuthenticatedUserId(client);
    if (!userId) return null;

    const eventId = this.normalizeId(payload?.eventId);
    if (!eventId) {
      client.emit('worldBoss:error', {
        message: 'eventId inválido para entrar na sala da ameaça.',
      });
      return null;
    }
    const room = this.getEventRoom(eventId);
    await client.join(room);
    client.data.joinedWorldBossRooms?.add(room);
    client.emit('worldBoss:joinedRoom', { eventId, room });

    const characterId = this.normalizeId(payload?.characterId);
    if (characterId) {
      client.data.worldBossSubscriptions ??= new Map();
      client.data.worldBossSubscriptions.set(eventId, { eventId, characterId });
      await this.emitStatusToClient(client, eventId, characterId);
      this.ensureStatusInterval(client);
    }

    return { ok: true, eventId, room };
  }

  @SubscribeMessage('worldBoss:leave')
  async handleLeave(
    @ConnectedSocket() client: WorldBossSocket,
    @MessageBody() payload: { eventId?: string },
  ) {
    const userId = await this.resolveAuthenticatedUserId(client);
    if (!userId) return null;

    const eventId = this.normalizeId(payload?.eventId);
    if (!eventId) return null;
    const room = this.getEventRoom(eventId);
    await client.leave(room);
    client.data.joinedWorldBossRooms?.delete(room);
    client.data.worldBossSubscriptions?.delete(eventId);
    this.clearStatusIntervalIfIdle(client);
    client.emit('worldBoss:leftRoom', { eventId, room });
    return { ok: true, eventId, room };
  }

  emitProgress(eventId: string, payload: unknown) {
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:progress', this.toPublicStatus(payload));
  }

  emitRegistered(eventId: string, payload: unknown) {
    const publicPayload = this.toPublicStatus(payload);
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:registered', publicPayload);
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:lobbyUpdated', publicPayload);
  }

  emitConfirmed(eventId: string, payload: unknown) {
    const publicPayload = this.toPublicStatus(payload);
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:joinedLobby', publicPayload);
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:lobbyUpdated', publicPayload);
  }

  emitLeft(eventId: string, payload: unknown) {
    const publicPayload = this.toPublicStatus(payload);
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:leftLobby', publicPayload);
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:lobbyUpdated', publicPayload);
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:left', publicPayload);
  }

  emitBattleStarted(eventId: string, payload: unknown) {
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:battleStarted', this.toPublicStatus(payload));
  }

  emitDamage(eventId: string, payload: unknown) {
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:damage', this.toPublicStatus(payload));
  }

  emitDefeated(eventId: string, payload: unknown) {
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:defeated', this.toPublicStatus(payload));
  }

  emitExpired(eventId: string, payload: unknown) {
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:expired', this.toPublicStatus(payload));
  }

  emitRewarded(eventId: string, payload: unknown) {
    this.server
      .to(this.getEventRoom(eventId))
      .emit('worldBoss:rewarded', this.toPublicStatus(payload));
  }

  private ensureStatusInterval(client: WorldBossSocket) {
    if (client.data.worldBossStatusInterval) return;

    client.data.worldBossStatusInterval = setInterval(() => {
      void this.emitSubscribedStatuses(client);
    }, WORLD_BOSS_STATUS_TICK_MS);
  }

  private clearStatusIntervalIfIdle(client: WorldBossSocket) {
    if ((client.data.worldBossSubscriptions?.size ?? 0) > 0) return;
    this.clearStatusInterval(client);
  }

  private clearStatusInterval(client: WorldBossSocket) {
    const interval = client.data.worldBossStatusInterval;
    if (!interval) return;

    clearInterval(interval);
    client.data.worldBossStatusInterval = undefined;
  }

  private async emitSubscribedStatuses(client: WorldBossSocket) {
    const subscriptions: WorldBossSocketSubscription[] = client.data
      .worldBossSubscriptions
      ? Array.from(client.data.worldBossSubscriptions.values())
      : [];

    await Promise.all(
      subscriptions.map((subscription) =>
        this.emitStatusToClient(
          client,
          subscription.eventId,
          subscription.characterId,
          subscription,
        ),
      ),
    );
  }

  private async emitStatusToClient(
    client: WorldBossSocket,
    eventId: string,
    characterId: string,
    subscription = client.data.worldBossSubscriptions?.get(eventId),
  ) {
    const userId = await this.resolveAuthenticatedUserId(client);
    if (!userId) return null;

    try {
      const status = await this.worldBossesService.getEventStatus(
        userId,
        characterId,
        eventId,
      );
      const nextStatus = status.event?.status ?? null;
      const previousStatus = subscription?.lastStatus;

      client.emit('worldBoss:statusUpdated', status);

      if (nextStatus && previousStatus && previousStatus !== nextStatus) {
        client.emit(this.getStatusEventName(nextStatus), status);
      }

      if (subscription) subscription.lastStatus = nextStatus;
      return status;
    } catch (error) {
      client.emit('worldBoss:error', {
        message: this.extractErrorMessage(error),
      });
      client.data.worldBossSubscriptions?.delete(eventId);
      this.clearStatusIntervalIfIdle(client);
      return null;
    }
  }

  private getStatusEventName(status: WorldBossEventStatus) {
    if (status === WorldBossEventStatus.LOBBY_OPEN)
      return 'worldBoss:lobbyUpdated';
    if (status === WorldBossEventStatus.ACTIVE)
      return 'worldBoss:battleStarted';
    if (status === WorldBossEventStatus.DEFEATED) return 'worldBoss:defeated';
    if (status === WorldBossEventStatus.EXPIRED) return 'worldBoss:expired';
    if (status === WorldBossEventStatus.REWARDED) return 'worldBoss:rewarded';
    return 'worldBoss:statusUpdated';
  }

  private getEventRoom(eventId: string) {
    return `world-boss:${eventId}`;
  }

  private toPublicStatus(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return payload;
    }

    const publicPayload = { ...(payload as Record<string, unknown>) };
    delete publicPayload.participant;
    delete publicPayload.rewardsGranted;
    delete publicPayload.stoppedActivities;
    delete publicPayload.eligible;
    delete publicPayload.message;
    return publicPayload;
  }

  private async authenticateClient(client: WorldBossSocket) {
    const token = this.extractToken(client);
    if (!token) {
      throw new Error('Token de autenticação ausente no WebSocket.');
    }

    const user = await this.socketAuth.authenticate(token);
    client.data.userId = user.id;
    client.data.joinedWorldBossRooms = new Set<string>();
    client.data.worldBossSubscriptions = new Map();
    client.emit('worldBoss:connected', {
      socketId: client.id,
      userId: user.id,
    });
    return user.id;
  }

  private async resolveAuthenticatedUserId(client: WorldBossSocket) {
    if (client.data.userId) return client.data.userId;

    if (client.data.worldBossAuthentication) {
      try {
        return await client.data.worldBossAuthentication;
      } catch {
        return null;
      }
    }

    client.emit('worldBoss:error', { message: 'Socket não autenticado.' });
    return null;
  }

  private normalizeId(value?: string | null) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized.length > 0 ? normalized : null;
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim())
      return authToken.trim();
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer '))
      return header.slice(7).trim();
    return null;
  }

  private extractErrorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Erro inesperado no WebSocket de Ameaças Globais.';
  }
}
