import { ConflictException } from '@nestjs/common';
import { CharacterStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityGuardService } from './activity-guard.service';

function createPrisma(infirmaryEndsAt: Date | null) {
  const callOrder: string[] = [];
  const prisma = {
    character: {
      updateMany: jest.fn().mockImplementation(() => {
        callOrder.push('lock');
        return Promise.resolve({ count: 1 });
      }),
      findFirst: jest.fn().mockImplementation(() => {
        callOrder.push('read');
        return Promise.resolve({
          id: 'character-1',
          name: 'Nilcruz',
          status: CharacterStatus.ACTIVE,
          level: 10,
          mapId: 'map-1',
          currentHp: 100,
          maxHp: 100,
          infirmaryStartedAt: infirmaryEndsAt
            ? new Date(infirmaryEndsAt.getTime() - 60_000)
            : null,
          infirmaryEndsAt,
        });
      }),
    },
    autoCombatSession: { findFirst: jest.fn().mockResolvedValue(null) },
    gatheringSession: { findFirst: jest.fn().mockResolvedValue(null) },
    craftingSession: { findFirst: jest.fn().mockResolvedValue(null) },
    characterIncursionSession: { findFirst: jest.fn().mockResolvedValue(null) },
    worldBossParticipant: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  return { prisma, callOrder };
}

const guardedActivityMethods = [
  'ensureCanStartGathering',
  'ensureCanCollectGathering',
  'ensureCanStartCrafting',
  'ensureCanStartAutoCombat',
  'ensureCanStartIncursion',
  'ensureCanStartWorldBoss',
  'ensureCanStartManualCombat',
  'ensureCanTravelMap',
] as const;

describe('ActivityGuardService infirmary exclusivity', () => {
  it.each(guardedActivityMethods)(
    'bloqueia %s enquanto existe atendimento',
    async (method) => {
      const { prisma } = createPrisma(new Date(Date.now() + 60_000));
      const service = new ActivityGuardService(prisma);

      await expect(
        service[method]({
          characterId: 'character-1',
          userId: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    },
  );

  it('mantem o bloqueio quando o tempo acabou ate a cura ser concluida', async () => {
    const { prisma } = createPrisma(new Date(Date.now() - 60_000));
    const service = new ActivityGuardService(prisma);

    await expect(
      service.ensureCanStartCrafting({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('permite gerenciar a propria enfermaria durante o atendimento', async () => {
    const { prisma } = createPrisma(new Date(Date.now() + 60_000));
    const service = new ActivityGuardService(prisma);

    await expect(
      service.ensureCanUseInfirmary({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ hasActiveInfirmary: true });
  });

  it('bloqueia a linha do personagem antes de ler as atividades', async () => {
    const { prisma, callOrder } = createPrisma(null);
    const service = new ActivityGuardService(prisma);

    await service.getCharacterActivityState({
      characterId: 'character-1',
      userId: 'user-1',
      lockCharacter: true,
    });

    expect(callOrder.slice(0, 2)).toEqual(['lock', 'read']);
  });
});
