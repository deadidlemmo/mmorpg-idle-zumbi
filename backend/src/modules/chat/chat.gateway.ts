import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { REDIS_COORDINATION_CLIENT } from '../../common/redis/redis.constants';
import { SocketAuthService } from '../auth/socket-auth.service';
import {
  CHAT_NAMESPACE,
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  GENERAL_CHAT_ROOM,
} from './chat.constants';
import { ChatService } from './chat.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

type ChatSocketData = {
  userId?: string;
  characterId?: string;
};

type ChatSocket = Omit<Socket, 'data'> & {
  data: ChatSocketData;
};

@WebSocketGateway({ namespace: CHAT_NAMESPACE })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly localRateLimits = new Map<string, number[]>();

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly chatService: ChatService,
    @Inject(REDIS_COORDINATION_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  async handleConnection(client: ChatSocket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        client.emit('chat:error', {
          message: 'Token de autenticação não enviado no WebSocket.',
        });
        client.disconnect(true);
        return;
      }

      const user = await this.socketAuth.authenticate(token);
      client.data.userId = user.id;
      client.emit('chat:connected', { socketId: client.id });

      const rawCharacterId = client.handshake.query.characterId;
      const characterId = Array.isArray(rawCharacterId)
        ? rawCharacterId[0]
        : rawCharacterId;

      if (typeof characterId === 'string' && characterId.trim()) {
        await this.joinGeneralChat(client, characterId);
      }
    } catch (error) {
      this.emitError(client, error, 'Não foi possível autenticar o chat.');
      client.disconnect(true);
    }
  }

  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: { characterId?: string },
  ) {
    return this.joinGeneralChat(client, payload?.characterId);
  }

  @SubscribeMessage('chat:message:send')
  async handleSendMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: SendChatMessageDto,
  ) {
    const userId = client.data.userId;
    const characterId = client.data.characterId;

    if (!userId || !characterId) {
      return this.emitError(
        client,
        new Error('Entre no chat geral antes de enviar mensagens.'),
      );
    }

    if (payload?.characterId !== characterId) {
      return this.emitError(
        client,
        new Error('O personagem do chat não corresponde à sessão atual.'),
      );
    }

    if (!(await this.consumeRateLimit(userId))) {
      return this.emitError(
        client,
        new Error('Muitas mensagens em sequência. Aguarde alguns segundos.'),
      );
    }

    try {
      const message = await this.chatService.createGeneralMessage({
        userId,
        characterId,
        content: payload?.content,
      });

      this.server.to(GENERAL_CHAT_ROOM).emit('chat:message:new', message);
      return { ok: true, message };
    } catch (error) {
      return this.emitError(client, error);
    }
  }

  private async joinGeneralChat(
    client: ChatSocket,
    rawCharacterId?: string | null,
  ) {
    const userId = client.data.userId;
    const characterId = rawCharacterId?.trim();

    if (!userId || !characterId) {
      return this.emitError(
        client,
        new Error('Personagem inválido para entrar no chat.'),
      );
    }

    try {
      const character = await this.chatService.assertCharacterOwnership(
        userId,
        characterId,
      );
      client.data.characterId = character.id;
      await client.join(GENERAL_CHAT_ROOM);
      client.emit('chat:joined', {
        room: GENERAL_CHAT_ROOM,
        characterId: character.id,
        characterName: character.name,
      });

      return { ok: true, characterId: character.id };
    } catch (error) {
      return this.emitError(client, error);
    }
  }

  private async consumeRateLimit(userId: string) {
    if (this.redis?.status === 'ready') {
      try {
        const windowId = Math.floor(Date.now() / CHAT_RATE_WINDOW_MS);
        const key = `chat:rate:${userId}:${windowId}`;
        const count = await this.redis.incr(key);

        if (count === 1) {
          await this.redis.pexpire(key, CHAT_RATE_WINDOW_MS * 2);
        }

        return count <= CHAT_RATE_LIMIT;
      } catch (error) {
        this.logger.warn(
          `Rate limit do chat caiu para memória local: ${this.extractErrorMessage(error)}`,
        );
      }
    }

    const now = Date.now();
    const recent = (this.localRateLimits.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < CHAT_RATE_WINDOW_MS,
    );

    if (recent.length >= CHAT_RATE_LIMIT) {
      this.localRateLimits.set(userId, recent);
      return false;
    }

    recent.push(now);
    this.localRateLimits.set(userId, recent);
    return true;
  }

  private extractToken(client: ChatSocket) {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken = auth?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const header = client.handshake.headers.authorization;

    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    return null;
  }

  private emitError(
    client: ChatSocket,
    error: unknown,
    fallback = 'Não foi possível executar a ação no chat.',
  ) {
    const payload = {
      ok: false as const,
      error: this.extractErrorMessage(error, fallback),
    };
    client.emit('chat:error', { message: payload.error });
    return payload;
  }

  private extractErrorMessage(error: unknown, fallback = 'Erro no chat.') {
    if (error instanceof Error && error.message.trim()) {
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
}
