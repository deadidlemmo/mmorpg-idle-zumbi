import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
} from '@prisma/client';
import type { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import type { ObservabilityService } from '../../common/observability/observability.service';
import type { DistributedLockService } from '../../common/redis/distributed-lock.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PetBonusesService } from '../pets/pet-bonuses.service';
import type { AutoCombatGateway } from './auto-combat.gateway';
import { AutoCombatService } from './auto-combat.service';

function createService() {
  const prisma = {
    autoCombatSession: {
      findUnique: jest.fn().mockResolvedValue({
        characterId: 'character-1',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const runExclusive = jest.fn(
    async (_key: string, _ttl: number, task: () => Promise<unknown>) => ({
      acquired: true,
      value: await task(),
    }),
  );
  const distributedLock = {
    runExclusive,
  } as unknown as DistributedLockService;
  const service = new AutoCombatService(
    prisma,
    {} as ActivityGuardService,
    {} as AutoCombatGateway,
    distributedLock,
    {} as ObservabilityService,
    {} as PetBonusesService,
  );

  return { service, prisma, runExclusive };
}

describe('AutoCombatService expired session recovery', () => {
  const expiredAt = new Date('2026-08-31T10:00:00.000Z');
  const now = new Date('2026-08-31T10:01:00.000Z');

  it('finaliza ENCOUNTER_READY vencido usando o lock do personagem', async () => {
    const { service, runExclusive } = createService();
    const session = {
      id: 'session-1',
      characterId: 'character-1',
      status: AutoCombatSessionStatus.ACTIVE,
      phase: AutoCombatSessionPhase.ENCOUNTER_READY,
      endsAt: expiredAt,
    };
    const internals = service as unknown as {
      loadAutoCombatSession: jest.Mock;
      finishExpiredSession: jest.Mock;
    };
    internals.loadAutoCombatSession = jest.fn().mockResolvedValue(session);
    internals.finishExpiredSession = jest.fn().mockResolvedValue({
      active: false,
    });

    await expect(
      service.reconcileExpiredSession('user-1', session.id, now),
    ).resolves.toBe(true);
    expect(runExclusive).toHaveBeenCalledWith(
      'dead-idle:auto-combat:character-1',
      120_000,
      expect.any(Function),
    );
    expect(internals.finishExpiredSession).toHaveBeenCalledWith(
      session,
      expect.stringContaining('limite de tempo'),
    );
  });

  it('processa o progresso pendente antes de encerrar uma sessao vencida', async () => {
    const { service } = createService();
    const session = {
      id: 'session-2',
      characterId: 'character-1',
      status: AutoCombatSessionStatus.ACTIVE,
      phase: AutoCombatSessionPhase.HUNTING,
      endsAt: expiredAt,
    };
    const internals = service as unknown as {
      loadAutoCombatSession: jest.Mock;
      processActiveSessionById: jest.Mock;
    };
    internals.loadAutoCombatSession = jest.fn().mockResolvedValue(session);
    internals.processActiveSessionById = jest
      .fn()
      .mockResolvedValue({ active: false });

    await expect(
      service.reconcileExpiredSession('user-1', session.id, now),
    ).resolves.toBe(true);
    expect(internals.processActiveSessionById).toHaveBeenCalledWith(
      'user-1',
      session.id,
      {
        emitRealtimeEvents: false,
        waitForActiveProcessing: true,
      },
    );
  });

  it('varre apenas sessoes ACTIVE cujo endsAt ja passou', async () => {
    const { service, prisma } = createService();
    const findMany = (
      prisma.autoCombatSession.findMany as unknown as jest.Mock
    ).mockResolvedValue([
      {
        id: 'session-3',
        characterId: 'character-1',
        character: { userId: 'user-1' },
      },
    ]);
    service.reconcileExpiredSession = jest.fn().mockResolvedValue(true);

    await expect(service.reconcileExpiredSessions(now)).resolves.toEqual({
      found: 1,
      finished: 1,
      failed: 0,
      skipped: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: AutoCombatSessionStatus.ACTIVE,
          endsAt: { lte: now },
        },
        take: 100,
      }),
    );
  });
});
