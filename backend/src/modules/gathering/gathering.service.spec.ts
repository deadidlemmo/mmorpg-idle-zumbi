import { NotFoundException } from '@nestjs/common';
import { ItemSlot, MaterialOrigin } from '@prisma/client';
import { GatheringService } from './gathering.service';

describe('GatheringService ownership', () => {
  it('não expõe o status de um personagem fora da conta autenticada', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      gatheringSession: {
        findFirst: jest.fn(),
      },
    };
    const service = new GatheringService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getStatus('user-1', 'foreign-character'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.character.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-character',
        userId: 'user-1',
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(prisma.gatheringSession.findFirst).not.toHaveBeenCalled();
  });
});

describe('GatheringService map and profession access', () => {
  const dto = {
    characterId: 'character-1',
    mapId: 'map-t2',
    origin: MaterialOrigin.COLETA,
    targetMaterialId: 'material-t2-advanced',
  };

  function createService(params: {
    characterMapId: string;
    characterLevel?: number;
    gatheringLevel?: number;
  }) {
    const prisma = {
      gameMap: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'map-t2',
          name: 'Distrito da Ferrugem',
          tier: 2,
          minLevel: 11,
          maxLevel: 20,
        }),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'material-t2-advanced',
          name: 'Tecido Industrial',
          slug: 'tecido-industrial',
          tier: 2,
          slot: ItemSlot.MATERIAL,
          mapId: 'map-t2',
          materialOrigin: MaterialOrigin.COLETA,
          materialSlot: null,
          isGatheringMaterial: true,
          requiredGatheringLevel: 10,
          gatheringXpPerUnit: 6,
          baseGatheringRatePerHour: null,
        }),
      },
      characterGatheringSkill: {
        upsert: jest.fn().mockResolvedValue({
          id: 'skill-1',
          characterId: 'character-1',
          origin: MaterialOrigin.COLETA,
          level: params.gatheringLevel ?? 9,
          xp: 0,
          totalXp: 0,
        }),
      },
    };
    const activityGuard = {
      ensureCanStartGathering: jest.fn().mockResolvedValue({
        character: {
          id: 'character-1',
          level: params.characterLevel ?? 1,
          mapId: params.characterMapId,
        },
        hasActiveGathering: false,
        activeGatheringSession: null,
      }),
    };
    const service = new GatheringService(
      prisma as never,
      activityGuard as never,
      {} as never,
      {} as never,
    );

    return { service, prisma };
  }

  it('exige que o personagem esteja fisicamente no mapa do material', async () => {
    const { service, prisma } = createService({
      characterMapId: 'map-t1',
      characterLevel: 50,
      gatheringLevel: 50,
    });

    await expect(service.start('user-1', dto)).rejects.toMatchObject({
      response: {
        message: 'Viaje para Distrito da Ferrugem antes de iniciar a coleta.',
        currentMapId: 'map-t1',
        requiredMapId: 'map-t2',
      },
    });
    expect(prisma.characterGatheringSkill.upsert).not.toHaveBeenCalled();
  });

  it('ignora o nível do personagem e valida somente a profissão no mapa atual', async () => {
    const { service } = createService({
      characterMapId: 'map-t2',
      characterLevel: 1,
      gatheringLevel: 9,
    });

    await expect(service.start('user-1', dto)).rejects.toMatchObject({
      response: {
        currentGatheringLevel: 9,
        requiredGatheringLevel: 10,
      },
    });
  });
});
