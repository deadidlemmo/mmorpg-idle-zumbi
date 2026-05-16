/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { IncursionsService } from './incursions.service';

type JwtSocketPayload = {
  sub: string;
  email?: string;
  role?: string;
};

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
const INCURSION_TICK_MS = 1000;

@WebSocketGateway({
  namespace: INCURSION_NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class IncursionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(IncursionsGateway.name);
  private readonly clientsByCharacterId = new Map<string, Set<string>>();
  private readonly userIdByCharacterId = new Map<string, string>();
  private readonly intervalsByCharacterId = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  constructor(
    private readonly jwtService: JwtService,
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

      const payload =
        await this.jwtService.verifyAsync<JwtSocketPayload>(token);

      if (!payload?.sub) {
        client.emit('incursion:error', {
          message: 'Token de autenticação inválido no WebSocket.',
        });
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      client.emit('incursion:connected', {
        socketId: client.id,
        userId: payload.sub,
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
    this.ensureCharacterInterval(characterId);
  }

  emitProgress(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:progress', payload);
  }

  emitCompleted(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:completed', payload);
  }

  emitClaimed(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:claimed', payload);
    this.clearCharacterInterval(characterId);
  }

  emitCancelled(characterId: string, payload: unknown) {
    this.emitToCharacter(characterId, 'incursion:cancelled', payload);
    this.clearCharacterInterval(characterId);
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
    this.ensureCharacterInterval(character.id);

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
    this.clearCharacterInterval(characterId);
  }

  private ensureCharacterInterval(characterId: string) {
    if (this.intervalsByCharacterId.has(characterId)) return;

    const intervalId = setInterval(() => {
      void this.emitStatusToRoom(characterId, 'incursion:progress');
    }, INCURSION_TICK_MS);

    this.intervalsByCharacterId.set(characterId, intervalId);
  }

  private clearCharacterInterval(characterId: string) {
    const intervalId = this.intervalsByCharacterId.get(characterId);

    if (!intervalId) return;

    clearInterval(intervalId);
    this.intervalsByCharacterId.delete(characterId);
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
    return status;
  }

  private async emitStatusToRoom(characterId: string, eventName: string) {
    const userId = this.userIdByCharacterId.get(characterId);

    if (!userId) return null;

    const status = await this.safeGetStatus(userId, characterId);

    if (!status) return null;

    const activeSession = status.activeSession;
    const effectiveEventName =
      activeSession?.status === 'COMPLETED' &&
      eventName === 'incursion:progress'
        ? 'incursion:completed'
        : eventName;

    this.emitToCharacter(characterId, effectiveEventName, status);

    if (!activeSession || activeSession.status !== 'ACTIVE') {
      this.clearCharacterInterval(characterId);
    }

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
