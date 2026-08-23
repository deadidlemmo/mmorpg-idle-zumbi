import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SocialService } from './social.service';

describe('SocialService', () => {
  const prisma = {
    character: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    friendship: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const cosmeticsService = { getResolvedAppearance: jest.fn() };
  const service = new SocialService(prisma as never, cosmeticsService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna perfil público sem expor o usuário proprietário', async () => {
    prisma.character.findFirst.mockResolvedValue({
      id: 'character-target',
      userId: 'user-target',
      name: 'Sobrevivente',
      level: 12,
      status: 'ACTIVE',
      avatarKey: 'lutador-01',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      class: {
        id: 'class-1',
        name: 'Lutador',
        description: 'Linha de frente.',
      },
      map: { id: 'map-1', name: 'Subúrbio Silencioso', tier: 1 },
      equipment: {},
    });
    cosmeticsService.getResolvedAppearance.mockResolvedValue({
      avatarKey: 'avatar-premium-lutador-vanguarda',
    });

    const result = await service.getPublicCharacterProfile(
      'user-viewer',
      'character-target',
    );

    expect(result.character).not.toHaveProperty('userId');
    expect(result.viewer.isOwner).toBe(false);
    expect(result.appearance).toEqual({
      avatarKey: 'avatar-premium-lutador-vanguarda',
    });
  });

  it('usa a mesma chave para pedidos nos dois sentidos', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      isSuspended: false,
    });
    prisma.friendship.findUnique.mockResolvedValue({ id: 'friendship-1' });

    await expect(
      service.sendRequest('user-z', 'survivor@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.friendship.findUnique).toHaveBeenCalledWith({
      where: { pairKey: 'user-a:user-z' },
    });
    expect(prisma.friendship.create).not.toHaveBeenCalled();
  });

  it('permite aceitar o pedido apenas ao destinatario', async () => {
    prisma.friendship.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.accept('intruso', 'friendship-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const [updateInput] = prisma.friendship.updateMany.mock
      .calls[0] as unknown as [
      {
        where: {
          id: string;
          addresseeId: string;
          status: string;
        };
        data: { status: string; acceptedAt: Date };
      },
    ];

    expect(updateInput.where).toEqual({
      id: 'friendship-1',
      addresseeId: 'intruso',
      status: 'PENDING',
    });
    expect(updateInput.data.status).toBe('ACCEPTED');
    expect(updateInput.data.acceptedAt).toBeInstanceOf(Date);
  });
});
