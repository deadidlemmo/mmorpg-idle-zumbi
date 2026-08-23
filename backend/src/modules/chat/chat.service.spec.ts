import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';

const character = {
  id: 'character-1',
  name: 'Lutador',
  level: 8,
  avatarKey: 'lutador-01',
  class: { name: 'Lutador' },
};

describe('ChatService', () => {
  it('retorna o histórico em ordem cronológica e informa o próximo cursor', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'message-3',
            content: 'Terceira',
            createdAt: new Date('2026-08-21T21:00:03.000Z'),
            character,
          },
          {
            id: 'message-2',
            content: 'Segunda',
            createdAt: new Date('2026-08-21T21:00:02.000Z'),
            character,
          },
          {
            id: 'message-1',
            content: 'Primeira',
            createdAt: new Date('2026-08-21T21:00:01.000Z'),
            character,
          },
        ]),
      },
    };
    const service = new ChatService(prisma as never);

    const result = await service.listGeneralMessages('user-1', { limit: 2 });

    expect(result.messages.map((message) => message.id)).toEqual([
      'message-2',
      'message-3',
    ]);
    expect(result.nextCursor).toBe('message-2');
  });

  it('normaliza o conteúdo e usa somente personagem da conta autenticada', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: character.id,
          name: character.name,
        }),
      },
      chatMessage: {
        create: jest.fn((params: { data: { content: string } }) =>
          Promise.resolve({
            id: 'message-1',
            content: params.data.content,
            createdAt: new Date('2026-08-21T21:00:00.000Z'),
            character,
          }),
        ),
      },
    };
    const service = new ChatService(prisma as never);

    const result = await service.createGeneralMessage({
      userId: 'user-1',
      characterId: character.id,
      content: '  Olá   sobreviventes  ',
    });

    expect(result.content).toBe('Olá sobreviventes');
  });

  it('rejeita personagem que não pertence ao usuário autenticado', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      chatMessage: {
        create: jest.fn(),
      },
    };
    const service = new ChatService(prisma as never);

    await expect(
      service.createGeneralMessage({
        userId: 'user-1',
        characterId: 'foreign-character',
        content: 'Mensagem indevida',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });
});
