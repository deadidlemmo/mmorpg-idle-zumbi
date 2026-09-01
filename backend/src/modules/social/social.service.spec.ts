import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MaterialOrigin } from '@prisma/client';
import { SocialService } from './social.service';

describe('SocialService', () => {
  const prisma = {
    character: { findFirst: jest.fn(), findMany: jest.fn() },
    friendship: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    characterCraftingSkill: { findMany: jest.fn() },
    characterHuntingSkill: { findMany: jest.fn() },
    characterGatheringSkill: { findMany: jest.fn() },
  };
  const cosmeticsService = {
    getResolvedAppearance: jest.fn(),
    getResolvedAppearances: jest.fn(),
  };
  const service = new SocialService(prisma as never, cosmeticsService as never);

  const socialCharacter = {
    id: 'character-target',
    name: 'Sobrevivente',
    level: 12,
    avatarKey: 'lutador-01',
    class: { id: 'class-1', name: 'Lutador' },
    map: { id: 'map-1', name: 'Subúrbio Silencioso', tier: 1 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cosmeticsService.getResolvedAppearances.mockResolvedValue({});
  });

  it('retorna perfil público sem expor o usuário proprietário', async () => {
    prisma.character.findFirst.mockResolvedValue({
      ...socialCharacter,
      userId: 'user-target',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      class: {
        id: 'class-1',
        name: 'Lutador',
        description: 'Linha de frente.',
      },
      equipment: {
        mainHand: {
          id: 'item-1',
          name: 'Machado Reforçado +2',
          tier: 2,
          rarity: 'COMMON',
          slot: 'MAIN_HAND',
          enhancementLevel: 2,
        },
      },
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
    expect(result.character.equipment.mainHand.enhancementLevel).toBe(2);

    const profileCalls = prisma.character.findFirst.mock.calls as unknown[][];
    const profileCall = profileCalls[0]?.[0] as {
      select: {
        equipment: {
          select: Record<string, { select: Record<string, boolean> }>;
        };
      };
    };
    expect(
      Object.values(profileCall.select.equipment.select).every(
        (slot) => slot.select.enhancementLevel,
      ),
    ).toBe(true);
  });

  it('lista aliados sem expor e-mail e anexa a aparência pública', async () => {
    prisma.friendship.findMany.mockResolvedValue([
      {
        id: 'friendship-1',
        requesterId: 'user-viewer',
        addresseeId: 'user-target',
        pairKey: 'user-target:user-viewer',
        status: 'ACCEPTED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        acceptedAt: new Date('2026-01-02T00:00:00.000Z'),
        requester: { id: 'user-viewer', characters: [] },
        addressee: {
          id: 'user-target',
          characters: [socialCharacter],
        },
      },
    ]);
    cosmeticsService.getResolvedAppearances.mockResolvedValue({
      'character-target': { avatarKey: 'avatar-premium' },
    });

    const result = await service.list('user-viewer');

    expect(result.friends).toHaveLength(1);
    expect(result.friends[0].user).not.toHaveProperty('email');
    expect(result.friends[0].user.characters[0].appearance).toEqual({
      avatarKey: 'avatar-premium',
    });
  });

  it('busca por apelido, prioriza a correspondência exata e oculta userId', async () => {
    prisma.character.findMany.mockResolvedValueOnce([
      {
        ...socialCharacter,
        userId: 'user-target',
        name: 'Sobrevivente',
      },
    ]);
    prisma.character.findMany.mockResolvedValueOnce([
      {
        ...socialCharacter,
        id: 'character-prefix',
        userId: 'user-prefix',
        name: 'Sobrevivente Alfa',
        level: 30,
      },
    ]);
    prisma.friendship.findMany.mockResolvedValue([]);
    cosmeticsService.getResolvedAppearances.mockResolvedValue({
      'character-target': { avatarKey: 'avatar-premium' },
    });

    const result = await service.searchCharacters(
      'user-viewer',
      'Sobrevivente',
    );

    expect(result.results[0].character.id).toBe('character-target');
    expect(result.results[0].character).not.toHaveProperty('userId');
    expect(result.results[0].character.appearance).toEqual({
      avatarKey: 'avatar-premium',
    });
    const searchCalls = prisma.character.findMany.mock.calls as unknown[][];
    const exactSearchCall = searchCalls[0]?.[0] as {
      where: {
        userId: { not: string };
        user: {
          NOT: Array<{
            email: { endsWith: string; mode: string };
          }>;
        };
        name: { equals: string; mode: string };
      };
    };
    const partialSearchCall = searchCalls[1]?.[0] as {
      where: {
        userId: { not: string };
        name: { contains: string; mode: string };
      };
    };
    expect(exactSearchCall.where).toMatchObject({
      userId: { not: 'user-viewer' },
      name: { equals: 'Sobrevivente', mode: 'insensitive' },
    });
    expect(exactSearchCall.where.user.NOT).toEqual([
      { email: { endsWith: '@local.test', mode: 'insensitive' } },
      { email: { endsWith: '@dead-idle.test', mode: 'insensitive' } },
    ]);
    expect(partialSearchCall.where).toMatchObject({
      userId: { not: 'user-viewer' },
      name: { contains: 'Sobrevivente', mode: 'insensitive' },
    });
  });

  it('usa a mesma chave para pedidos nos dois sentidos', async () => {
    prisma.character.findFirst.mockResolvedValue({ userId: 'user-a' });
    prisma.friendship.findUnique.mockResolvedValue({ id: 'friendship-1' });

    await expect(
      service.sendRequest('user-z', 'character-target'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.friendship.findUnique).toHaveBeenCalledWith({
      where: { pairKey: 'user-a:user-z' },
    });
    expect(prisma.friendship.create).not.toHaveBeenCalled();
  });

  it('cria o pedido para a conta proprietária do personagem escolhido', async () => {
    prisma.character.findFirst.mockResolvedValue({ userId: 'user-target' });
    prisma.friendship.findUnique.mockResolvedValue(null);
    prisma.friendship.create.mockResolvedValue({ id: 'friendship-1' });

    await service.sendRequest('user-viewer', 'character-target');

    expect(prisma.friendship.create).toHaveBeenCalledWith({
      data: {
        requesterId: 'user-viewer',
        addresseeId: 'user-target',
        pairKey: 'user-target:user-viewer',
      },
    });
  });

  it('consulta a origem correta e inclui a aparência no ranking', async () => {
    prisma.characterGatheringSkill.findMany.mockResolvedValue([
      {
        level: 8,
        xp: 42,
        totalXp: 1_450,
        character: socialCharacter,
      },
    ]);
    cosmeticsService.getResolvedAppearances.mockResolvedValue({
      'character-target': { profileBanner: { key: 'banner-helix' } },
    });

    const result = await service.getRanking('CONTENCAO', 25);

    const rankingCalls = prisma.characterGatheringSkill.findMany.mock
      .calls as unknown[][];
    const rankingCall = rankingCalls[0]?.[0] as {
      where: {
        origin: MaterialOrigin;
        character: {
          user: {
            NOT: Array<{
              email: { endsWith: string; mode: string };
            }>;
          };
        };
      };
      take: number;
    };
    expect(rankingCall).toMatchObject({
      where: {
        origin: MaterialOrigin.CONTENCAO,
      },
      take: 25,
    });
    expect(rankingCall.where.character.user.NOT).toEqual([
      { email: { endsWith: '@local.test', mode: 'insensitive' } },
      { email: { endsWith: '@dead-idle.test', mode: 'insensitive' } },
    ]);
    expect(result.label).toBe('Contenção');
    expect(result.entries[0]).toMatchObject({
      rank: 1,
      score: { level: 8, totalXp: 1_450 },
      appearance: { profileBanner: { key: 'banner-helix' } },
    });
  });

  it('permite aceitar o pedido apenas ao destinatário', async () => {
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
