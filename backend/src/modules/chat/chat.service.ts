import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CHAT_HISTORY_DEFAULT_LIMIT,
  CHAT_MESSAGE_MAX_LENGTH,
} from './chat.constants';
import { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';

const chatMessageInclude = {
  character: {
    select: {
      id: true,
      name: true,
      level: true,
      avatarKey: true,
      class: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.ChatMessageInclude;

type ChatMessageWithCharacter = Prisma.ChatMessageGetPayload<{
  include: typeof chatMessageInclude;
}>;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async listGeneralMessages(userId: string, query: ListChatMessagesQueryDto) {
    await this.assertActiveUser(userId);

    const limit = query.limit ?? CHAT_HISTORY_DEFAULT_LIMIT;
    const messages = await this.prisma.chatMessage.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.before
        ? {
            cursor: { id: query.before },
            skip: 1,
          }
        : {}),
      include: chatMessageInclude,
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    const nextCursor = hasMore ? (messages.at(-1)?.id ?? null) : null;

    return {
      messages: messages
        .reverse()
        .map((message) => this.formatMessage(message)),
      nextCursor,
      serverNow: new Date().toISOString(),
    };
  }

  async assertCharacterOwnership(userId: string, characterId: string) {
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
      throw new NotFoundException('Personagem não encontrado para o chat.');
    }

    return character;
  }

  async createGeneralMessage(params: {
    userId: string;
    characterId: string;
    content: string;
  }) {
    await this.assertCharacterOwnership(params.userId, params.characterId);
    const content = this.normalizeContent(params.content);

    const message = await this.prisma.chatMessage.create({
      data: {
        userId: params.userId,
        characterId: params.characterId,
        content,
      },
      include: chatMessageInclude,
    });

    return this.formatMessage(message);
  }

  private normalizeContent(value: unknown) {
    if (typeof value !== 'string') {
      throw new BadRequestException('Digite uma mensagem válida.');
    }

    const content = value.trim().replace(/\s+/g, ' ');

    if (!content) {
      throw new BadRequestException('A mensagem não pode ficar vazia.');
    }

    if (content.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(
        `A mensagem pode ter no máximo ${CHAT_MESSAGE_MAX_LENGTH} caracteres.`,
      );
    }

    return content;
  }

  private async assertActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isSuspended: false },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado para o chat.');
    }
  }

  private formatMessage(message: ChatMessageWithCharacter) {
    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      character: {
        id: message.character.id,
        name: message.character.name,
        level: message.character.level,
        avatarKey: message.character.avatarKey,
        className: message.character.class.name,
      },
    };
  }
}
