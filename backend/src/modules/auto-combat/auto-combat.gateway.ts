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

type JwtSocketPayload = {
  sub: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
};

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
};

type AuthenticatedSocket = Socket & {
  data: Socket['data'] & AutoCombatSocketData;
};

type RealtimePayloadLike = {
  type?: string | null;
};

type AutoCombatStatusPayloadLike = {
  active?: boolean | null;
  hasActiveAutoCombat?: boolean | null;
  session?: {
    status?: string | null;
  } | null;
};

@WebSocketGateway({
  namespace: '/auto-combat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class AutoCombatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AutoCombatGateway.name);

  /**
   * Evita spam de auto-combat:status quando não existe combate ativo.
   *
   * O gateway não cria intervalo por conta própria, mas alguns fluxos do
   * provider/service podem pedir status repetidamente. Se o status inativo
   * for exatamente igual ao último já enviado para o personagem, não reenviamos.
   */
  private readonly lastInactiveStatusSignatureByCharacterId = new Map<
    string,
    string
  >();

  private readonly socketIdsByUserId = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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

      const payload =
        await this.jwtService.verifyAsync<JwtSocketPayload>(token);

      if (!payload?.sub) {
        client.emit('auto-combat:error', {
          message: 'Token de autenticação inválido no WebSocket.',
        });

        client.disconnect(true);
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },
        select: {
          id: true,
          email: true,
        },
      });

      if (!user) {
        client.emit('auto-combat:error', {
          message: 'Usuário do WebSocket não encontrado.',
        });

        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      client.data.email = user.email;
      client.data.joinedCharacterRooms = new Set<string>();

      this.registerPresence(user.id, client.id);

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

  emitStatus(characterId: string, payload: unknown) {
    const normalizedCharacterId = this.normalizeId(characterId);

    if (!normalizedCharacterId) {
      return;
    }

    if (
      this.shouldSuppressDuplicateInactiveStatus(normalizedCharacterId, payload)
    ) {
      return;
    }

    this.emitToCharacter(normalizedCharacterId, 'auto-combat:status', payload);
  }

  emitSessionUpdated(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);
    this.emitToCharacter(characterId, 'auto-combat:session-updated', payload);
  }

  emitHit(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);

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
    this.clearInactiveStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:mob-spawned',
      payload,
    );
  }

  emitMobDefeated(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:mob-defeated',
      payload,
    );
  }

  emitPlayerDefeated(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:player-defeated',
      payload,
    );
  }

  emitPotionUsed(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:potion-used',
      payload,
    );
  }

  emitAutoRest(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);

    this.emitRealtimeEventToCharacter(
      characterId,
      'auto-combat:auto-rest',
      payload,
    );
  }

  emitFinished(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);
    this.emitToCharacter(characterId, 'auto-combat:finished', payload);
  }

  emitStopped(characterId: string, payload: unknown) {
    this.clearInactiveStatusCache(characterId);
    this.emitToCharacter(characterId, 'auto-combat:stopped', payload);
  }

  emitError(characterId: string, message: string) {
    this.emitToCharacter(characterId, 'auto-combat:error', {
      message,
    });
  }

  private emitRealtimeEventToCharacter(
    characterId: string,
    event: string,
    payload: unknown,
  ) {
    this.emitToCharacter(characterId, event, payload);
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

    this.server
      .to(this.getCharacterRoom(normalizedCharacterId))
      .emit(event, payload);
  }

  private shouldSuppressDuplicateInactiveStatus(
    characterId: string,
    payload: unknown,
  ): boolean {
    if (!this.isInactiveAutoCombatStatusPayload(payload)) {
      this.clearInactiveStatusCache(characterId);
      return false;
    }

    const signature = this.getPayloadSignature(payload);
    const previousSignature =
      this.lastInactiveStatusSignatureByCharacterId.get(characterId);

    if (previousSignature === signature) {
      return true;
    }

    this.lastInactiveStatusSignatureByCharacterId.set(characterId, signature);

    return false;
  }

  private isInactiveAutoCombatStatusPayload(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const statusPayload = payload as AutoCombatStatusPayloadLike;
    const sessionStatus = String(statusPayload.session?.status ?? '')
      .trim()
      .toUpperCase();

    if (statusPayload.active === false) {
      return true;
    }

    if (statusPayload.hasActiveAutoCombat === false) {
      return true;
    }

    return [
      'STOPPED',
      'FINISHED',
      'COMPLETED',
      'DEFEATED',
      'EXPIRED',
      'CANCELLED',
      'CANCELED',
    ].includes(sessionStatus);
  }

  private clearInactiveStatusCache(characterId: string) {
    const normalizedCharacterId = this.normalizeId(characterId);

    if (!normalizedCharacterId) {
      return;
    }

    this.lastInactiveStatusSignatureByCharacterId.delete(normalizedCharacterId);
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

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return this.normalizeBearerToken(authToken);
    }

    const authAccessToken = client.handshake.auth?.accessToken;

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

  private getUserRoom(userId: string) {
    return `user:${userId}`;
  }

  private getCharacterRoom(characterId: string) {
    return `auto-combat:character:${characterId}`;
  }
}
