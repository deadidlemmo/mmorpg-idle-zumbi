import { ConflictException } from '@nestjs/common';
import { CharacterStatus, WorldBossEventStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityGuardService } from './activity-guard.service';

function createPrisma(activeWorldBossParticipation: unknown = null) {
  let worldBossQuery: unknown = null;
  const findWorldBossParticipation = jest.fn((query: unknown) => {
    worldBossQuery = query;
    const statuses = (
      query as {
        where?: { event?: { status?: { in?: WorldBossEventStatus[] } } };
      }
    ).where?.event?.status?.in;
    const participationStatus = (
      activeWorldBossParticipation as {
        event?: { status?: WorldBossEventStatus };
      } | null
    )?.event?.status;
    if (
      participationStatus &&
      statuses &&
      !statuses.includes(participationStatus)
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(activeWorldBossParticipation);
  });
  const prisma = {
    character: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'character-1',
        name: 'Nilcruz',
        status: CharacterStatus.ACTIVE,
        level: 10,
        currentHp: 100,
        maxHp: 100,
      }),
    },
    autoCombatSession: { findFirst: jest.fn().mockResolvedValue(null) },
    gatheringSession: { findFirst: jest.fn().mockResolvedValue(null) },
    craftingSession: { findFirst: jest.fn().mockResolvedValue(null) },
    characterIncursionSession: { findFirst: jest.fn().mockResolvedValue(null) },
    worldBossParticipant: {
      findFirst: findWorldBossParticipation,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    getWorldBossQuery: () => worldBossQuery,
  };
}

describe('ActivityGuardService world boss registration', () => {
  it('ignora inscricao antecipada e permite iniciar auto-combate e gathering', async () => {
    const { prisma, getWorldBossQuery } = createPrisma();
    const service = new ActivityGuardService(prisma);

    await expect(
      service.ensureCanStartAutoCombat({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ hasActiveWorldBoss: false });
    await expect(
      service.ensureCanStartGathering({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ hasActiveWorldBoss: false });

    const query = getWorldBossQuery() as {
      where: {
        characterId: string;
        leftAt: null;
        confirmedAt: { not: null };
        event: { status: { in: WorldBossEventStatus[] } };
      };
    };
    expect(query.where).toMatchObject({
      characterId: 'character-1',
      leftAt: null,
      confirmedAt: { not: null },
      event: {
        status: {
          in: [WorldBossEventStatus.ACTIVE],
        },
      },
    });
  });

  it('não bloqueia atividades durante a preparação, mesmo com dado legado confirmado', async () => {
    const { prisma } = createPrisma({
      id: 'participant-1',
      event: { id: 'event-1', status: WorldBossEventStatus.LOBBY_OPEN },
    });
    const service = new ActivityGuardService(prisma);

    await expect(
      service.ensureCanStartAutoCombat({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ hasActiveWorldBoss: false });
  });

  it('bloqueia novas atividades quando a batalha está ativa', async () => {
    const { prisma } = createPrisma({
      id: 'participant-1',
      event: { id: 'event-1', status: WorldBossEventStatus.ACTIVE },
    });
    const service = new ActivityGuardService(prisma);

    await expect(
      service.ensureCanStartAutoCombat({
        characterId: 'character-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
