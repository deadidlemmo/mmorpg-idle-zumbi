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
import { CraftingService } from './crafting.service';

type CraftingSocketData = {
  userId?: string;
  joinedCraftingRooms?: Set<string>;
  craftingCharacterIds?: Set<string>;
};

type CraftingSocket = Socket & {
  data: Socket['data'] & CraftingSocketData;
};

type CraftingRoomPayload = {
  characterId?: string;
};

const CRAFTING_NAMESPACE = '/crafting';
const CRAFTING_COMPLETION_SETTLE_MS = 75;
const CRAFTING_STATUS_HEARTBEAT_MS = 30_000;
const CRAFTING_MIN_SCHEDULE_DELAY_MS = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getCraftingStatusScheduleDelayMs(
  status: unknown,
  nowMs = Date.now(),
) {
  if (!isRecord(status) || status.active !== true) {
    return null;
  }

  const activeSession = isRecord(status.activeSession)
    ? status.activeSession
    : null;
  const timeline =
    activeSession && isRecord(activeSession.timeline)
      ? activeSession.timeline
      : null;
  const completesAt =
    timeline && typeof timeline.endsAt === 'string'
      ? timeline.endsAt
      : activeSession && typeof activeSession.completesAt === 'string'
        ? activeSession.completesAt
        : null;
  const completesAtMs = completesAt ? Date.parse(completesAt) : Number.NaN;

  if (!Number.isFinite(completesAtMs)) {
    return CRAFTING_STATUS_HEARTBEAT_MS;
  }

  return Math.max(
    CRAFTING_MIN_SCHEDULE_DELAY_MS,
    Math.min(
      CRAFTING_STATUS_HEARTBEAT_MS,
      Math.ceil(completesAtMs - nowMs + CRAFTING_COMPLETION_SETTLE_MS),
    ),
  );
}

@WebSocketGateway({
  namespace: CRAFTING_NAMESPACE,
})
export class CraftingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CraftingGateway.name);
  private readonly clientsByCharacterId = new Map<string, Set<string>>();
  private readonly userIdByCharacterId = new Map<string, string>();
  private readonly timersByCharacterId = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly prisma: PrismaService,
    private readonly craftingService: CraftingService,
  ) {}

  async handleConnection(client: CraftingSocket) {
    client.data.joinedCraftingRooms = new Set<string>();
    client.data.craftingCharacterIds = new Set<string>();

    try {
      const token = this.extractToken(client);

      if (!token) {
        client.emit('crafting:error', {
          message: 'Token de autenticação não enviado no WebSocket.',
        });
        client.disconnect(true);
        return;
      }

      const user = await this.socketAuth.authenticate(token);

      client.data.userId = user.id;
      client.emit('crafting:connected', {
        socketId: client.id,
        userId: user.id,
      });
    } catch (error) {
      client.emit('crafting:error', {
        message: this.extractErrorMessage(error),
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: CraftingSocket) {
    const characterIds = client.data.craftingCharacterIds ?? new Set<string>();

    for (const characterId of characterIds) {
      this.removeClientFromCharacter(client.id, characterId);
    }

    client.data.joinedCraftingRooms?.clear();
    client.data.craftingCharacterIds?.clear();
  }

  @SubscribeMessage('crafting:join')
  async handleJoin(
    @ConnectedSocket() client: CraftingSocket,
    @MessageBody() payload: CraftingRoomPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (!characterId) {
      client.emit('crafting:error', {
        message: 'characterId inválido para entrar na sala de criação.',
      });
      return null;
    }

    return this.joinCharacterRoom(client, characterId);
  }

  @SubscribeMessage('crafting:leave')
  async handleLeave(
    @ConnectedSocket() client: CraftingSocket,
    @MessageBody() payload: CraftingRoomPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (!characterId) return null;

    const room = this.getCharacterRoom(characterId);
    await client.leave(room);
    client.data.joinedCraftingRooms?.delete(room);
    client.data.craftingCharacterIds?.delete(characterId);
    this.removeClientFromCharacter(client.id, characterId);

    client.emit('crafting:left', { characterId, room });

    return { ok: true, characterId, room };
  }

  @SubscribeMessage('crafting:status:request')
  async handleStatusRequest(
    @ConnectedSocket() client: CraftingSocket,
    @MessageBody() payload: CraftingRoomPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (!characterId) {
      client.emit('crafting:error', {
        message: 'characterId inválido para buscar status de criação.',
      });
      return null;
    }

    return this.emitStatusToClient(client, characterId, 'crafting:status');
  }

  @SubscribeMessage('crafting:refresh')
  async handleRefresh(
    @ConnectedSocket() client: CraftingSocket,
    @MessageBody() payload: CraftingRoomPayload,
  ) {
    const characterId = this.normalizeId(payload?.characterId);

    if (!characterId) return null;

    return this.emitStatusToClient(client, characterId, 'crafting:snapshot');
  }

  async emitStartedForCharacter(characterId: string, userId: string) {
    return this.emitStatusForCharacter(characterId, userId, 'crafting:started');
  }

  async emitStoppedForCharacter(characterId: string, userId: string) {
    return this.emitStatusForCharacter(characterId, userId, 'crafting:stopped');
  }

  async emitStatusForCharacter(
    characterId: string,
    userId: string,
    eventName = 'crafting:status',
  ) {
    const normalizedCharacterId = this.normalizeId(characterId);

    if (!normalizedCharacterId) return null;

    this.userIdByCharacterId.set(normalizedCharacterId, userId);

    const status = await this.safeGetStatus(userId, normalizedCharacterId);

    if (!status) return null;

    this.emitToCharacter(normalizedCharacterId, eventName, status);

    this.scheduleCharacterTimer(normalizedCharacterId, status);

    return status;
  }

  private async joinCharacterRoom(client: CraftingSocket, characterId: string) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('crafting:error', { message: 'Socket não autenticado.' });
      return { ok: false, message: 'Socket não autenticado.' };
    }

    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!character) {
      client.emit('crafting:error', {
        message: 'Personagem não encontrado para este usuário.',
      });
      return {
        ok: false,
        message: 'Personagem não encontrado para este usuário.',
      };
    }

    const room = this.getCharacterRoom(character.id);

    if (!client.data.joinedCraftingRooms) {
      client.data.joinedCraftingRooms = new Set<string>();
    }

    if (!client.data.craftingCharacterIds) {
      client.data.craftingCharacterIds = new Set<string>();
    }

    if (!client.data.joinedCraftingRooms.has(room)) {
      await client.join(room);
      client.data.joinedCraftingRooms.add(room);
    }

    client.data.craftingCharacterIds.add(character.id);
    this.addClientToCharacter(client.id, character.id, userId);
    client.emit('crafting:joined', {
      characterId: character.id,
      characterName: character.name,
      room,
    });

    this.logger.log(
      `Socket ${client.id} entrou na sala ${room} | personagem=${character.name}`,
    );

    await this.emitStatusToClient(client, character.id, 'crafting:status');

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

    const delayMs = getCraftingStatusScheduleDelayMs(status);

    if (delayMs === null) return;

    const timerId = setTimeout(() => {
      this.timersByCharacterId.delete(characterId);
      void this.emitStatusToRoom(characterId, 'crafting:progress');
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
    client: CraftingSocket,
    characterId: string,
    eventName: string,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('crafting:error', { message: 'Socket não autenticado.' });
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

    const completedSessions = status.completedSessions ?? [];
    const effectiveEventName =
      completedSessions.length > 0 && !status.activeSession
        ? 'crafting:completed'
        : eventName;

    this.emitToCharacter(characterId, effectiveEventName, status);

    this.scheduleCharacterTimer(characterId, status);

    return status;
  }

  private async safeGetStatus(userId: string, characterId: string) {
    try {
      return await this.craftingService.getCharacterCraftingStatus(
        userId,
        characterId,
      );
    } catch (error) {
      this.emitToCharacter(characterId, 'crafting:error', {
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
    return `character:${characterId}:crafting`;
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

    return 'Erro inesperado no realtime de criação.';
  }
}
