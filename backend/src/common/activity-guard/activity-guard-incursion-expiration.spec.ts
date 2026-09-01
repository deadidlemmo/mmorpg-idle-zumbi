import { ConflictException } from '@nestjs/common';
import { CharacterStatus, IncursionSessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityGuardService } from './activity-guard.service';

function createPrisma(incursionEndsAt: Date | null) {
  let incursionQuery: unknown = null;
  const characterIncursionSession = {
    findFirst: jest.fn().mockImplementation((query: unknown) => {
      incursionQuery = query;
      if (!incursionEndsAt) return Promise.resolve(null);

      const cutoff = (query as { where?: { endsAt?: { gt?: Date } } }).where
        ?.endsAt?.gt;

      if (!cutoff || incursionEndsAt.getTime() <= cutoff.getTime()) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        id: 'incursion-session-1',
        status: IncursionSessionStatus.ACTIVE,
        startedAt: new Date(incursionEndsAt.getTime() - 60_000),
        endsAt: incursionEndsAt,
        completedAt: null,
        incursion: {
          id: 'incursion-1',
          name: 'Incursão de teste',
          tier: 1,
          map: { id: 'map-1', name: 'Subúrbio', tier: 1 },
        },
      });
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = {
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
    autoCombatSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    gatheringSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    craftingSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    characterIncursionSession,
    worldBossParticipant: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;

  return {
    prisma,
    characterIncursionSession,
    getIncursionQuery: () => incursionQuery,
  };
}

describe('ActivityGuardService incursion expiration', () => {
  it('não bloqueia uma nova atividade por incursão cujo endsAt já venceu', async () => {
    const { prisma, getIncursionQuery } = createPrisma(
      new Date(Date.now() - 60_000),
    );
    const service = new ActivityGuardService(prisma);

    await expect(
      service.ensureCanStartCrafting({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ hasActiveIncursion: false });

    const query = getIncursionQuery() as {
      where: { endsAt: { gt: Date } };
    };
    expect(query.where.endsAt.gt).toBeInstanceOf(Date);
  });

  it('continua bloqueando enquanto a incursão ainda não terminou', async () => {
    const { prisma } = createPrisma(new Date(Date.now() + 60_000));
    const service = new ActivityGuardService(prisma);

    await expect(
      service.ensureCanStartCrafting({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('não cancela uma incursão vencida quando outra atividade derrota o personagem', async () => {
    const { prisma, characterIncursionSession } = createPrisma(null);
    const service = new ActivityGuardService(prisma);
    const now = new Date('2026-09-01T18:00:00.000Z');

    await service.stopActivitiesForDefeatedCharacter({
      characterId: 'character-1',
      client: prisma,
      now,
    });

    expect(characterIncursionSession.updateMany).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        status: IncursionSessionStatus.ACTIVE,
        endsAt: { gt: now },
      },
      data: {
        status: IncursionSessionStatus.CANCELLED,
        completedAt: null,
      },
    });
  });
});
