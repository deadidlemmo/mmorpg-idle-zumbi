import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
} from '@prisma/client';

import { AutoCombatService } from './auto-combat.service';

const HUNTING_XP_PER_ENEMY = 5;
const HUNTING_MAX_EVENTS_PER_PROCESS = 500;
const LEVEL_1_HUNTING_SECONDS_PER_ENEMY = 15;

function createEncounter(id: string, mobId: string, level = 1) {
  return {
    id,
    mobId,
    isActive: true,
    weight: 100,
    mob: {
      id: mobId,
      name: `Mob ${mobId}`,
      level,
      hp: 10,
      attack: 1,
      defense: 1,
      speed: 1,
    },
  };
}

function createSession(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-02T12:00:00.000Z');
  const lastProcessedAt = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  return {
    id: 'session-1',
    characterId: 'character-1',
    status: AutoCombatSessionStatus.ACTIVE,
    phase: AutoCombatSessionPhase.HUNTING,
    startedAt: lastProcessedAt,
    huntStartedAt: lastProcessedAt,
    lastProcessedAt,
    lastHuntProcessedAt: lastProcessedAt,
    endsAt: new Date(now.getTime() + 60 * 60 * 1000),
    foundEnemiesCount: 0,
    huntingXpGained: 0,
    selectedEncounterId: null,
    selectedEncounterMobId: null,
    selectedEncounter: null,
    subMap: {
      encounters: [
        createEncounter('encounter-1', 'mob-1', 1),
        createEncounter('encounter-2', 'mob-2', 3),
      ],
    },
    ...overrides,
  };
}

function createServiceHarness(updateCount = 1) {
  const tx = {
    autoCombatSession: {
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'session-1' }),
    },
    characterHuntingSkill: {
      update: jest.fn().mockResolvedValue({}),
    },
    autoCombatSessionMobSummary: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    autoCombatSessionEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const activityGuard = {};
  const gateway = {
    emitSessionUpdated: jest.fn(),
    emitStatus: jest.fn(),
    emitFinished: jest.fn(),
  };
  const service = new AutoCombatService(
    prisma as never,
    activityGuard as never,
    gateway as never,
  );

  jest.spyOn(service as any, 'getOrCreateHuntingSkill').mockResolvedValue({
    id: 'hunting-skill-1',
    level: 1,
    xp: 0,
    totalXp: 0,
  });
  jest.spyOn(service as any, 'buildSessionResponse').mockResolvedValue({
    active: true,
    session: {
      id: 'session-1',
    },
  });

  return {
    service,
    tx,
    gateway,
  };
}

describe('AutoCombatService hunting processing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('consolida 6h offline sem persistir replay completo de eventos antigos', async () => {
    const { service, tx } = createServiceHarness();
    const session = createSession();

    await (service as any).processHuntingSession(session);

    const expectedFoundEnemies = 600;
    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          foundEnemiesCount: {
            increment: expectedFoundEnemies,
          },
          huntingXpGained: {
            increment: expectedFoundEnemies * HUNTING_XP_PER_ENEMY,
          },
        }),
      }),
    );

    const createManyPayload =
      tx.autoCombatSessionEvent.createMany.mock.calls[0][0];

    expect(createManyPayload.skipDuplicates).toBe(true);
    expect(createManyPayload.data).toHaveLength(HUNTING_MAX_EVENTS_PER_PROCESS);
    expect(createManyPayload.data[0].eventKey).toBe('session-1:hunt:101');
    expect(
      createManyPayload.data[createManyPayload.data.length - 1].eventKey,
    ).toBe('session-1:hunt:600');

    const foundCountIncrements =
      tx.autoCombatSessionMobSummary.upsert.mock.calls.reduce(
        (total: number, call: any[]) => total + call[0].create.foundCount,
        0,
      );

    expect(foundCountIncrements).toBe(expectedFoundEnemies);
  });

  it('mantem progressao de caca moderada para dificil em 24h offline', () => {
    const { service } = createServiceHarness();
    const levelOneSecondsPerEnemy = (service as any).getHuntingSecondsPerEnemy(
      1,
    );
    const foundEnemiesIn24h = (24 * 60 * 60) / levelOneSecondsPerEnemy;
    const progress = (service as any).calculateHuntingSkillProgress(
      {
        id: 'hunting-skill-1',
        characterId: 'character-1',
        level: 1,
        xp: 0,
        totalXp: 0,
      },
      foundEnemiesIn24h * HUNTING_XP_PER_ENEMY,
    );

    expect(levelOneSecondsPerEnemy).toBe(LEVEL_1_HUNTING_SECONDS_PER_ENEMY);
    expect(foundEnemiesIn24h).toBe(5760);
    expect(progress.level).toBe(7);
    expect(progress.xp).toBe(3291);
    expect(progress.xpToNextLevel).toBe(9644);
    expect((service as any).getHuntingSecondsPerEnemy(progress.level)).toBe(13);
  });

  it('seleciona o proximo combate apenas entre mobs rastreados pendentes', () => {
    const { service } = createServiceHarness();
    const session = createSession({
      selectedEncounterMobId: 'mob-1',
      huntBatch: {
        id: 'hunt-batch-1',
        selectedEncounterMobId: 'mob-1',
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 1,
            remainingCount: 0,
            weightSnapshot: 100,
          },
          {
            mobId: 'mob-2',
            encounterId: 'encounter-2',
            foundCount: 2,
            remainingCount: 2,
            weightSnapshot: 100,
          },
        ],
      },
    });

    const encounter = (service as any).getNextCombatEncounter(session);

    expect(encounter.mobId).toBe('mob-2');
  });

  it('detecta quando o ultimo abate zera a fila rastreada', () => {
    const { service } = createServiceHarness();
    const session = createSession({
      huntBatch: {
        id: 'hunt-batch-1',
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 1,
            remainingCount: 1,
            weightSnapshot: 100,
          },
        ],
      },
    });

    expect(
      (service as any).getTrackedEnemiesRemainingAfterKill(
        session,
        'mob-1',
        1,
      ),
    ).toBe(0);
  });

  it('nao seleciona novo mob quando toda fila rastreada foi consumida', () => {
    const { service } = createServiceHarness();
    const session = createSession({
      huntBatch: {
        id: 'hunt-batch-1',
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 1,
            remainingCount: 0,
            weightSnapshot: 100,
          },
          {
            mobId: 'mob-2',
            encounterId: 'encounter-2',
            foundCount: 2,
            remainingCount: 0,
            weightSnapshot: 100,
          },
        ],
      },
    });

    expect((service as any).getTrackedEnemiesRemaining(session)).toBe(0);
    expect((service as any).getNextCombatEncounter(session)).toBeNull();
  });

  it('decrementa a fila rastreada em memoria ao abater mobs do batch', () => {
    const { service } = createServiceHarness();
    const result = {
      mobSummaries: new Map([
        [
          'mob-1',
          {
            kills: 1,
          },
        ],
      ]),
    };

    const updatedMobs = (service as any).applyMobSummaryResultToHuntBatchMobs(
      [
        {
          mobId: 'mob-1',
          remainingCount: 2,
        },
        {
          mobId: 'mob-2',
          remainingCount: 3,
        },
      ],
      result,
    );

    expect(updatedMobs).toEqual([
      {
        mobId: 'mob-1',
        remainingCount: 1,
      },
      {
        mobId: 'mob-2',
        remainingCount: 3,
      },
    ]);
  });

  it('finaliza a caca quando o limite da sessao e atingido durante o processamento', async () => {
    const { service, tx, gateway } = createServiceHarness();
    const now = new Date('2026-06-02T12:00:00.000Z');
    const session = createSession({
      startedAt: new Date(now.getTime() - 90_000),
      huntStartedAt: new Date(now.getTime() - 90_000),
      lastProcessedAt: new Date(now.getTime() - 90_000),
      lastHuntProcessedAt: new Date(now.getTime() - 90_000),
      endsAt: now,
    });

    await (service as any).processHuntingSession(session);

    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AutoCombatSessionStatus.FINISHED,
          finishedAt: now,
        }),
      }),
    );
    expect(gateway.emitFinished).toHaveBeenCalled();
  });

  it('aborta sem duplicar contadores quando outra chamada ja processou o mesmo intervalo', async () => {
    const { service, tx } = createServiceHarness(0);
    const session = createSession();

    await expect(
      (service as any).processHuntingSession(session),
    ).rejects.toThrow('Processamento abortado');

    expect(tx.characterHuntingSkill.update).not.toHaveBeenCalled();
    expect(tx.autoCombatSessionMobSummary.upsert).not.toHaveBeenCalled();
    expect(tx.autoCombatSessionEvent.createMany).not.toHaveBeenCalled();
  });
});
