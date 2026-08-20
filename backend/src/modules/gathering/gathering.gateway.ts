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
import { StartGatheringDto } from './dto/start-gathering.dto';
import { GatheringService } from './gathering.service';

interface GatheringSocketPayload {
  characterId?: string;
}

type GatheringSocketData = {
  userId?: string;
  gatheringCharacterIds?: Set<string>;
};

type GatheringSocket = Omit<Socket, 'data'> & {
  data: GatheringSocketData;
};

const GATHERING_NAMESPACE = '/gathering';
const GATHERING_TICK_MS = 1000;

@WebSocketGateway({
  namespace: GATHERING_NAMESPACE,
})
export class GatheringGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(GatheringGateway.name);
  private readonly clientsByCharacterId = new Map<string, Set<string>>();
  private readonly userIdByCharacterId = new Map<string, string>();
  private readonly intervalsByCharacterId = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly prisma: PrismaService,
    private readonly gatheringService: GatheringService,
  ) {}

  async handleConnection(client: GatheringSocket) {
    client.data.gatheringCharacterIds = new Set<string>();

    try {
      const token = this.extractToken(client);

      if (!token) {
        client.emit('gathering:error', {
          message: 'Token de autenticação não enviado no WebSocket.',
        });
        client.disconnect(true);
        return;
      }

      const user = await this.socketAuth.authenticate(token);

      client.data.userId = user.id;
      client.emit('gathering:connected', {
        socketId: client.id,
        userId: user.id,
      });

      const rawCharacterId = client.handshake.query.characterId;
      const characterId = Array.isArray(rawCharacterId)
        ? rawCharacterId[0]
        : rawCharacterId;

      if (typeof characterId === 'string' && characterId.trim().length > 0) {
        await this.joinCharacterRoom(client, characterId);
      }
    } catch (error) {
      this.emitError(client, error, 'Não foi possível autenticar o WebSocket.');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: GatheringSocket) {
    const characterIds = client.data.gatheringCharacterIds ?? new Set<string>();

    for (const characterId of characterIds) {
      this.removeClientFromCharacter(client.id, characterId);
    }

    client.data.gatheringCharacterIds?.clear();
  }

  @SubscribeMessage('gathering:join')
  async handleJoin(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: GatheringSocketPayload,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);

    if (!characterId) {
      client.emit('gathering:error', {
        message: 'characterId inválido para entrar no gathering em tempo real.',
      });
      return null;
    }

    return this.joinCharacterRoom(client, characterId);
  }

  @SubscribeMessage('gathering:leave')
  async handleLeave(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: GatheringSocketPayload,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);

    if (!characterId) {
      return null;
    }

    await client.leave(this.getRoomName(characterId));
    client.data.gatheringCharacterIds?.delete(characterId);
    this.removeClientFromCharacter(client.id, characterId);

    return { ok: true };
  }

  @SubscribeMessage('gathering:status:request')
  async handleStatusRequest(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: GatheringSocketPayload,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);

    if (!characterId) {
      client.emit('gathering:error', {
        message: 'characterId inválido para buscar status do gathering.',
      });
      return null;
    }

    return this.emitStatusToClient(client, characterId, 'gathering:status');
  }

  @SubscribeMessage('gathering:refresh')
  async handleRefresh(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: GatheringSocketPayload,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);

    if (!characterId) {
      client.emit('gathering:error', {
        message: 'characterId inválido para atualizar gathering.',
      });
      return null;
    }

    return this.emitStatusToClient(client, characterId, 'gathering:status');
  }

  @SubscribeMessage('gathering:start')
  async handleStart(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: StartGatheringDto,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);
    const userId = this.getAuthenticatedUserId(client);

    if (!characterId || !userId) {
      client.emit('gathering:error', {
        message: userId
          ? 'characterId inválido para iniciar gathering.'
          : 'Socket não autenticado.',
      });
      return null;
    }

    try {
      await this.gatheringService.start(userId, payload);
      await this.joinCharacterRoom(client, characterId);

      return this.emitStatusToRoom(characterId, 'gathering:started');
    } catch (error) {
      this.emitError(client, error);
      return null;
    }
  }

  @SubscribeMessage('gathering:collect')
  async handleCollect(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: GatheringSocketPayload,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);
    const userId = this.getAuthenticatedUserId(client);

    if (!characterId || !userId) {
      client.emit('gathering:error', {
        message: userId
          ? 'characterId inválido para coletar gathering.'
          : 'Socket não autenticado.',
      });
      return null;
    }

    try {
      const result = await this.gatheringService.collect(userId, characterId);
      await this.emitStatusToRoom(characterId, 'gathering:collected');

      return result;
    } catch (error) {
      this.emitError(client, error);
      return null;
    }
  }

  @SubscribeMessage('gathering:stop')
  async handleStop(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: GatheringSocketPayload,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);
    const userId = this.getAuthenticatedUserId(client);

    if (!characterId || !userId) {
      client.emit('gathering:error', {
        message: userId
          ? 'characterId inválido para parar gathering.'
          : 'Socket não autenticado.',
      });
      return null;
    }

    try {
      const result = await this.gatheringService.stop(userId, characterId);
      await this.emitStatusToRoom(characterId, 'gathering:stopped');
      await this.stopCharacterIntervalIfInactive(userId, characterId);

      return result;
    } catch (error) {
      this.emitError(client, error);
      return null;
    }
  }

  private async joinCharacterRoom(
    client: GatheringSocket,
    characterId: string,
  ) {
    const normalizedCharacterId = this.normalizeCharacterId(characterId);
    const userId = this.getAuthenticatedUserId(client);

    if (!normalizedCharacterId || !userId) {
      client.emit('gathering:error', { message: 'Socket não autenticado.' });
      return { ok: false, message: 'Socket não autenticado.' };
    }

    const character = await this.prisma.character.findFirst({
      where: { id: normalizedCharacterId, userId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!character) {
      client.emit('gathering:error', {
        message: 'Personagem não encontrado para este usuário.',
      });
      return {
        ok: false,
        message: 'Personagem não encontrado para este usuário.',
      };
    }

    const roomName = this.getRoomName(character.id);

    if (!client.data.gatheringCharacterIds) {
      client.data.gatheringCharacterIds = new Set<string>();
    }

    if (!client.data.gatheringCharacterIds.has(character.id)) {
      await client.join(roomName);
      client.data.gatheringCharacterIds.add(character.id);
      this.addClientToCharacter(client.id, character.id, userId);
    }

    this.ensureCharacterInterval(character.id);

    client.emit('gathering:joined', {
      characterId: character.id,
      characterName: character.name,
      room: roomName,
    });

    this.logger.log(
      `Socket ${client.id} entrou na sala ${roomName} | personagem=${character.name}`,
    );

    await this.emitStatusToClient(client, character.id, 'gathering:status');

    return { ok: true, characterId: character.id, room: roomName };
  }

  private addClientToCharacter(
    clientId: string,
    characterId: string,
    userId: string,
  ) {
    const currentSet =
      this.clientsByCharacterId.get(characterId) ?? new Set<string>();

    currentSet.add(clientId);
    this.clientsByCharacterId.set(characterId, currentSet);
    this.userIdByCharacterId.set(characterId, userId);
  }

  private removeClientFromCharacter(clientId: string, characterId: string) {
    const currentSet = this.clientsByCharacterId.get(characterId);

    if (!currentSet) {
      return;
    }

    currentSet.delete(clientId);

    if (currentSet.size > 0) {
      this.clientsByCharacterId.set(characterId, currentSet);
      return;
    }

    this.clientsByCharacterId.delete(characterId);
    this.userIdByCharacterId.delete(characterId);
    this.clearCharacterInterval(characterId);
  }

  private ensureCharacterInterval(characterId: string) {
    if (this.intervalsByCharacterId.has(characterId)) {
      return;
    }

    const intervalId = setInterval(() => {
      void this.emitStatusToRoom(characterId, 'gathering:progress');
    }, GATHERING_TICK_MS);

    this.intervalsByCharacterId.set(characterId, intervalId);
  }

  private clearCharacterInterval(characterId: string) {
    const intervalId = this.intervalsByCharacterId.get(characterId);

    if (!intervalId) {
      return;
    }

    clearInterval(intervalId);
    this.intervalsByCharacterId.delete(characterId);
  }

  private async stopCharacterIntervalIfInactive(
    userId: string,
    characterId: string,
  ) {
    try {
      const status = await this.gatheringService.getStatus(userId, characterId);

      if (!status.active) {
        this.clearCharacterInterval(characterId);
      }
    } catch {
      this.clearCharacterInterval(characterId);
    }
  }

  private async emitStatusToClient(
    client: GatheringSocket,
    characterId: string,
    eventName: string,
  ) {
    const userId = this.getAuthenticatedUserId(client);

    if (!userId) {
      client.emit('gathering:error', { message: 'Socket não autenticado.' });
      return null;
    }

    try {
      const status = await this.gatheringService.getStatus(userId, characterId);
      client.emit(eventName, status);
      return status;
    } catch (error) {
      this.emitError(client, error);
      return null;
    }
  }

  private async emitStatusToRoom(characterId: string, eventName: string) {
    const userId = this.userIdByCharacterId.get(characterId);

    if (!userId) {
      return null;
    }

    try {
      const status = await this.gatheringService.getStatus(userId, characterId);
      this.server.to(this.getRoomName(characterId)).emit(eventName, status);

      if (!status.active) {
        this.clearCharacterInterval(characterId);
      }

      return status;
    } catch (error) {
      this.server.to(this.getRoomName(characterId)).emit('gathering:error', {
        message: this.extractErrorMessage(error),
      });
      this.clearCharacterInterval(characterId);
      return null;
    }
  }

  private extractToken(client: GatheringSocket) {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken = auth?.token;

    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }

    const header = client.handshake.headers.authorization;

    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    return null;
  }

  private getAuthenticatedUserId(client: GatheringSocket) {
    return typeof client.data.userId === 'string' &&
      client.data.userId.length > 0
      ? client.data.userId
      : null;
  }

  private emitError(
    client: GatheringSocket,
    error: unknown,
    fallback = 'Erro inesperado no gathering em tempo real.',
  ) {
    client.emit('gathering:error', {
      message: this.extractErrorMessage(error, fallback),
    });
  }

  private extractErrorMessage(
    error: unknown,
    fallback = 'Erro inesperado no gathering em tempo real.',
  ): string {
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

    return fallback;
  }

  private normalizeCharacterId(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private getRoomName(characterId: string): string {
    return `gathering:${characterId}`;
  }
}
