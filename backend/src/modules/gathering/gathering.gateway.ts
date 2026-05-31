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
import { StartGatheringDto } from './dto/start-gathering.dto';
import { GatheringService } from './gathering.service';

interface GatheringSocketPayload {
  characterId?: string;
}

type GatheringSocket = Socket & {
  data: {
    gatheringCharacterIds?: Set<string>;
  };
};

const GATHERING_NAMESPACE = '/gathering';
const GATHERING_TICK_MS = 1000;

@WebSocketGateway({
  namespace: GATHERING_NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class GatheringGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly clientsByCharacterId = new Map<string, Set<string>>();
  private readonly intervalsByCharacterId = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  constructor(private readonly gatheringService: GatheringService) {}

  handleConnection(client: GatheringSocket) {
    client.data.gatheringCharacterIds = new Set<string>();

    const rawCharacterId = client.handshake.query.characterId;
    const characterId = Array.isArray(rawCharacterId)
      ? rawCharacterId[0]
      : rawCharacterId;

    if (typeof characterId === 'string' && characterId.trim().length > 0) {
      void this.joinCharacterRoom(client, characterId);
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
  handleLeave(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: GatheringSocketPayload,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);

    if (!characterId) {
      return null;
    }

    client.leave(this.getRoomName(characterId));
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

    return this.emitStatusToRoom(characterId, 'gathering:status');
  }

  @SubscribeMessage('gathering:start')
  async handleStart(
    @ConnectedSocket() client: GatheringSocket,
    @MessageBody() payload: StartGatheringDto,
  ) {
    const characterId = this.normalizeCharacterId(payload?.characterId);

    if (!characterId) {
      client.emit('gathering:error', {
        message: 'characterId inválido para iniciar gathering.',
      });
      return null;
    }

    try {
      await this.gatheringService.start(payload);
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

    if (!characterId) {
      client.emit('gathering:error', {
        message: 'characterId inválido para coletar gathering.',
      });
      return null;
    }

    try {
      const result = await this.gatheringService.collect(characterId);
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

    if (!characterId) {
      client.emit('gathering:error', {
        message: 'characterId inválido para parar gathering.',
      });
      return null;
    }

    try {
      const result = await this.gatheringService.stop(characterId);
      await this.emitStatusToRoom(characterId, 'gathering:stopped');

      this.stopCharacterIntervalIfInactive(characterId);

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

    if (!normalizedCharacterId) {
      return null;
    }

    const roomName = this.getRoomName(normalizedCharacterId);

    client.join(roomName);

    if (!client.data.gatheringCharacterIds) {
      client.data.gatheringCharacterIds = new Set<string>();
    }

    client.data.gatheringCharacterIds.add(normalizedCharacterId);
    this.addClientToCharacter(client.id, normalizedCharacterId);
    this.ensureCharacterInterval(normalizedCharacterId);

    return this.emitStatusToClient(
      client,
      normalizedCharacterId,
      'gathering:status',
    );
  }

  private addClientToCharacter(clientId: string, characterId: string) {
    const currentSet =
      this.clientsByCharacterId.get(characterId) ?? new Set<string>();

    currentSet.add(clientId);
    this.clientsByCharacterId.set(characterId, currentSet);
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

  private async stopCharacterIntervalIfInactive(characterId: string) {
    const status = await this.safeGetStatus(characterId);

    if (!status?.active) {
      this.clearCharacterInterval(characterId);
    }
  }

  private async emitStatusToClient(
    client: GatheringSocket,
    characterId: string,
    eventName: string,
  ) {
    const status = await this.safeGetStatus(characterId);

    if (!status) {
      client.emit('gathering:error', {
        message: 'Não foi possível carregar o status do gathering.',
      });
      return null;
    }

    client.emit(eventName, status);

    return status;
  }

  private async emitStatusToRoom(characterId: string, eventName: string) {
    const status = await this.safeGetStatus(characterId);

    if (!status) {
      this.server.to(this.getRoomName(characterId)).emit('gathering:error', {
        message: 'Não foi possível carregar o status do gathering.',
      });

      return null;
    }

    this.server.to(this.getRoomName(characterId)).emit(eventName, status);

    return status;
  }

  private async safeGetStatus(characterId: string) {
    try {
      return await this.gatheringService.getStatus(characterId);
    } catch (error) {
      const message = this.extractErrorMessage(error);

      this.server.to(this.getRoomName(characterId)).emit('gathering:error', {
        message,
      });

      return null;
    }
  }

  private emitError(client: GatheringSocket, error: unknown) {
    client.emit('gathering:error', {
      message: this.extractErrorMessage(error),
    });
  }

  private extractErrorMessage(error: unknown): string {
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

    return 'Erro inesperado no gathering em tempo real.';
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
