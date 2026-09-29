import { ConflictException } from '@nestjs/common';
import { ActivityStatus, CharacterStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityGuardService } from './activity-guard.service';

function createPrisma() {
  return {
    character: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'character-1',
        name: 'Nilcruz',
        status: CharacterStatus.ACTIVE,
        level: 10,
        mapId: 'map-1',
        currentHp: 100,
        maxHp: 100,
        infirmaryStartedAt: null,
        infirmaryEndsAt: null,
      }),
    },
    autoCombatSession: { findFirst: jest.fn().mockResolvedValue(null) },
    gatheringSession: { findFirst: jest.fn().mockResolvedValue(null) },
    craftingSession: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'crafting-1',
        status: ActivityStatus.ACTIVE,
        quantity: 1,
        outputQuantity: 1,
        startedAt: new Date(),
        completesAt: new Date(Date.now() + 60_000),
        outputItem: {
          id: 'item-1',
          name: 'Item de teste',
          tier: 1,
          slot: 'MAIN_HAND',
        },
      }),
    },
    characterIncursionSession: { findFirst: jest.fn().mockResolvedValue(null) },
    worldBossParticipant: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
}

describe('ActivityGuardService crafting queue', () => {
  it('permite adicionar na propria fila sem liberar outras atividades', async () => {
    const service = new ActivityGuardService(createPrisma());

    await expect(
      service.ensureCanStartCrafting({
        characterId: 'character-1',
        userId: 'user-1',
        allowActiveCrafting: true,
      }),
    ).resolves.toMatchObject({ hasActiveCrafting: true });

    await expect(
      service.ensureCanStartCrafting({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
