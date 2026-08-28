import {
  AutoCombatHuntBatchStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
} from '@prisma/client';

import { getAutoCombatHuntingXpForEncounter } from '../../common/utils/auto-combat-hunting.util';
import { AutoCombatService } from './auto-combat.service';

const HUNTING_XP_PER_ENEMY = 5;
const HUNTING_MAX_EVENTS_PER_PROCESS = 500;
const LEVEL_1_HUNTING_SECONDS_PER_ENEMY = 15;

function createEncounter(
  id: string,
  mobId: string,
  level = 1,
  tier = 1,
  weight = 100,
) {
  return {
    id,
    mobId,
    isActive: true,
    weight,
    mob: {
      id: mobId,
      name: `Mob ${mobId}`,
      tier,
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
      create: jest.fn().mockResolvedValue({ id: 'session-resumed' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'session-1' }),
    },
    character: {
      update: jest.fn().mockResolvedValue({}),
    },
    characterHuntingSkill: {
      update: jest.fn().mockResolvedValue({}),
    },
    autoCombatSessionMobSummary: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    autoCombatHuntBatch: {
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'hunt-batch-created' }),
    },
    autoCombatHuntBatchMob: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    autoCombatHuntBatchEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    character: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    autoCombatSession: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    subMap: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    autoCombatHuntBatch: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
    },
  };
  const activityGuard = {
    ensureCanStartAutoCombat: jest.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    emitSessionUpdated: jest.fn(),
    emitStatus: jest.fn(),
    emitHuntTargetFound: jest.fn(),
    emitFinished: jest.fn(),
    emitStopped: jest.fn(),
  };
  const distributedLock = {
    runExclusive: jest.fn(
      async (_key: string, _ttlMs: number, task: () => Promise<unknown>) => ({
        acquired: true,
        value: await task(),
      }),
    ),
  };
  const observability = {
    setAutoCombatActiveLoops: jest.fn(),
    recordAutoCombatProcessingLockWait: jest.fn(),
    recordAutoCombatTick: jest.fn(),
    recordAutoCombatTickError: jest.fn(),
    recordAutoCombatRealtimeEvent: jest.fn(),
  };
  const calculateHuntingDuration = jest.fn();
  calculateHuntingDuration.mockImplementation(
    (_characterId: string, baseDurationMs: number) =>
      Promise.resolve({
        durationMs: baseDurationMs,
        bonus: null,
      }),
  );
  const petBonuses = {
    calculateHuntingDuration,
  };
  const service = new AutoCombatService(
    prisma as never,
    activityGuard as never,
    gateway as never,
    distributedLock as never,
    observability as never,
    petBonuses as never,
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
    prisma,
    activityGuard,
    tx,
    gateway,
    petBonuses,
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

  it('mantem a duracao congelada quando o pet muda durante o rastreio', async () => {
    const { service, petBonuses, tx } = createServiceHarness();
    const cycleStartedAt = new Date('2026-06-02T11:59:50.000Z');
    const cycleTargetEncounter = createEncounter('encounter-1', 'mob-1', 1);
    const session = createSession({
      startedAt: cycleStartedAt,
      huntStartedAt: cycleStartedAt,
      lastProcessedAt: cycleStartedAt,
      lastHuntProcessedAt: cycleStartedAt,
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.HUNTING,
        lastProcessedAt: cycleStartedAt,
        foundEnemiesCount: 0,
        huntingXpGained: 0,
        selectedEncounter: null,
        selectedEncounterId: null,
        selectedEncounterMobId: null,
        cycleTargetEncounterId: cycleTargetEncounter.id,
        cycleTargetEncounter,
        huntSequence: 0,
        cycleStartedAt,
        cycleEndsAt: new Date('2026-06-02T12:00:05.000Z'),
        cycleDurationMs: 15_000,
        cycleVersion: 1,
        appliedPetDefinitionId: null,
        appliedPetEffectBasisPoints: 0,
        mobs: [],
      },
    });

    petBonuses.calculateHuntingDuration.mockResolvedValue({
      durationMs: 14_550,
      bonus: {
        petDefinitionId: 'pet-hunting-t1',
        effectBasisPoints: 300,
      },
    });

    await (service as any).processHuntingSession(session);

    expect(petBonuses.calculateHuntingDuration).not.toHaveBeenCalled();
    expect(tx.autoCombatSession.updateMany).not.toHaveBeenCalled();
    expect(tx.autoCombatHuntBatch.updateMany).not.toHaveBeenCalled();
  });

  it('aplica o pet ao proximo rastreio com precisao em milissegundos', async () => {
    const { service, petBonuses, tx } = createServiceHarness();
    const cycleStartedAt = new Date('2026-06-02T11:59:45.000Z');
    const cycleTargetEncounter = createEncounter('encounter-1', 'mob-1', 1);
    const session = createSession({
      startedAt: cycleStartedAt,
      huntStartedAt: cycleStartedAt,
      lastProcessedAt: cycleStartedAt,
      lastHuntProcessedAt: cycleStartedAt,
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.HUNTING,
        lastProcessedAt: cycleStartedAt,
        foundEnemiesCount: 0,
        huntingXpGained: 0,
        selectedEncounter: null,
        selectedEncounterId: null,
        selectedEncounterMobId: null,
        cycleTargetEncounterId: cycleTargetEncounter.id,
        cycleTargetEncounter,
        huntSequence: 0,
        cycleStartedAt,
        cycleEndsAt: new Date('2026-06-02T12:00:00.000Z'),
        cycleDurationMs: 15_000,
        cycleVersion: 1,
        appliedPetDefinitionId: null,
        appliedPetEffectBasisPoints: 0,
        mobs: [],
      },
    });

    petBonuses.calculateHuntingDuration.mockResolvedValue({
      durationMs: 14_550,
      bonus: {
        petDefinitionId: 'pet-hunting-t1',
        effectBasisPoints: 300,
      },
    });

    await (service as any).processHuntingSession(session);

    expect(tx.autoCombatHuntBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          foundEnemiesCount: { increment: 1 },
          cycleStartedAt: new Date('2026-06-02T12:00:00.000Z'),
          cycleEndsAt: new Date('2026-06-02T12:00:14.550Z'),
          cycleDurationMs: 14_550,
          cycleVersion: 2,
          cycleTargetEncounterId: expect.any(String),
          appliedPetDefinitionId: 'pet-hunting-t1',
          appliedPetEffectBasisPoints: 300,
        }),
      }),
    );

    const createManyPayload =
      tx.autoCombatSessionEvent.createMany.mock.calls[0][0];
    expect(createManyPayload.data[0].payloadJson).toMatchObject({
      targetEncounterId: 'encounter-1',
      targetMobId: 'mob-1',
      foundAt: '2026-06-02T12:00:00.000Z',
      nextFindAt: '2026-06-02T12:00:14.550Z',
      secondsPerFind: 14.55,
    });
    expect(
      (service as any).autoCombatGateway.emitHuntTargetFound,
    ).toHaveBeenCalledWith(
      'character-1',
      expect.objectContaining({
        type: 'HUNT_TARGET_FOUND',
        targetEncounterId: 'encounter-1',
        targetMobId: 'mob-1',
      }),
    );
  });

  it('entrega o alvo persistido do ciclo e sorteia o proximo apenas depois', async () => {
    const { service, tx, gateway } = createServiceHarness();
    const cycleStartedAt = new Date('2026-06-02T11:59:45.000Z');
    const previousEncounter = createEncounter('encounter-1', 'mob-1', 1);
    const cycleTargetEncounter = createEncounter('encounter-2', 'mob-2', 3);
    const session = createSession({
      startedAt: cycleStartedAt,
      huntStartedAt: cycleStartedAt,
      lastProcessedAt: cycleStartedAt,
      lastHuntProcessedAt: cycleStartedAt,
      selectedEncounter: previousEncounter,
      selectedEncounterId: previousEncounter.id,
      selectedEncounterMobId: previousEncounter.mobId,
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.HUNTING,
        lastProcessedAt: cycleStartedAt,
        foundEnemiesCount: 0,
        huntingXpGained: 0,
        selectedEncounter: previousEncounter,
        selectedEncounterId: previousEncounter.id,
        selectedEncounterMobId: previousEncounter.mobId,
        cycleTargetEncounterId: cycleTargetEncounter.id,
        cycleTargetEncounter,
        huntSequence: 0,
        cycleStartedAt,
        cycleEndsAt: new Date('2026-06-02T12:00:00.000Z'),
        cycleDurationMs: 15_000,
        cycleVersion: 1,
        appliedPetDefinitionId: null,
        appliedPetEffectBasisPoints: 0,
        mobs: [],
      },
    });

    jest.mocked(Math.random).mockReturnValue(0);

    await (service as any).processHuntingSession(session);

    expect(tx.autoCombatHuntBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selectedEncounterId: cycleTargetEncounter.id,
          selectedEncounterMobId: cycleTargetEncounter.mobId,
          cycleTargetEncounterId: previousEncounter.id,
        }),
      }),
    );
    expect(tx.autoCombatHuntBatchMob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batchId_mobId: {
            batchId: 'hunt-batch-1',
            mobId: cycleTargetEncounter.mobId,
          },
        },
      }),
    );
    expect(gateway.emitHuntTargetFound).toHaveBeenCalledWith(
      'character-1',
      expect.objectContaining({
        targetEncounterId: cycleTargetEncounter.id,
        targetMobId: cycleTargetEncounter.mobId,
      }),
    );
  });

  it('preenche um alvo canonico ausente sem adiantar a recompensa', async () => {
    const { service, prisma, tx, gateway } = createServiceHarness();
    const cycleStartedAt = new Date('2026-06-02T11:59:50.000Z');
    const session = createSession({
      startedAt: cycleStartedAt,
      huntStartedAt: cycleStartedAt,
      lastProcessedAt: cycleStartedAt,
      lastHuntProcessedAt: cycleStartedAt,
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.HUNTING,
        lastProcessedAt: cycleStartedAt,
        foundEnemiesCount: 0,
        huntingXpGained: 0,
        selectedEncounter: createEncounter('encounter-2', 'mob-2', 3),
        selectedEncounterId: 'encounter-2',
        selectedEncounterMobId: 'mob-2',
        cycleTargetEncounterId: null,
        cycleTargetEncounter: null,
        huntSequence: 0,
        cycleStartedAt,
        cycleEndsAt: new Date('2026-06-02T12:00:05.000Z'),
        cycleDurationMs: 15_000,
        cycleVersion: 1,
        appliedPetDefinitionId: null,
        appliedPetEffectBasisPoints: 0,
        mobs: [],
      },
    });

    jest.mocked(Math.random).mockReturnValue(0);

    await (service as any).processHuntingSession(session);

    expect(prisma.autoCombatHuntBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cycleTargetEncounterId: 'encounter-1',
        }),
      }),
    );
    expect(tx.autoCombatHuntBatchMob.upsert).not.toHaveBeenCalled();
    expect(gateway.emitHuntTargetFound).not.toHaveBeenCalled();
  });

  it('reconstroi a mesma janela persistida em F5 e reconexao', () => {
    const { service } = createServiceHarness();
    const timing = (service as any).buildHuntingTimingViewModel(
      {
        phase: AutoCombatSessionPhase.HUNTING,
        huntStartedAt: new Date('2026-06-02T11:00:00.000Z'),
        lastHuntProcessedAt: new Date('2026-06-02T11:59:59.000Z'),
        foundEnemiesCount: 12,
        cycleStartedAt: new Date('2026-06-02T11:59:58.450Z'),
        cycleEndsAt: new Date('2026-06-02T12:00:13.000Z'),
        cycleDurationMs: 14_550,
        cycleVersion: 13,
      },
      { secondsPerEnemy: 15 },
      new Date('2026-06-02T12:00:00.000Z'),
    );

    expect(timing).toMatchObject({
      lastFindAt: new Date('2026-06-02T11:59:58.450Z'),
      nextFindAt: new Date('2026-06-02T12:00:13.000Z'),
      cycleDurationMs: 14_550,
      cycleVersion: 13,
      secondsPerFind: 14.55,
    });
  });

  it('aplica bonus premium de 20% no XP da skill de caca', async () => {
    const { service, tx } = createServiceHarness();
    const session = createSession({
      character: {
        user: {
          premiumUntil: new Date('2026-06-03T12:00:00.000Z'),
        },
      },
    });

    await (service as any).processHuntingSession(session);

    const expectedFoundEnemies = 600;
    const expectedPremiumHuntingXpPerEnemy = 6;

    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          huntingXpGained: {
            increment: expectedFoundEnemies * expectedPremiumHuntingXpPerEnemy,
          },
        }),
      }),
    );

    const createManyPayload =
      tx.autoCombatSessionEvent.createMany.mock.calls[0][0];

    expect(createManyPayload.data[0].payloadJson.huntingXpGained).toBe(
      expectedPremiumHuntingXpPerEnemy,
    );
  });

  it('escala XP da skill de caca pelo tier do mob rastreado', async () => {
    const { service, tx } = createServiceHarness();
    const tierTenEncounter = createEncounter(
      'encounter-t10',
      'mob-t10',
      91,
      10,
    );
    const session = createSession({
      subMap: {
        encounters: [tierTenEncounter],
      },
    });
    const expectedFoundEnemies = 600;
    const expectedHuntingXpPerEnemy =
      getAutoCombatHuntingXpForEncounter(tierTenEncounter);

    await (service as any).processHuntingSession(session);

    expect(expectedHuntingXpPerEnemy).toBeGreaterThan(HUNTING_XP_PER_ENEMY);
    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          huntingXpGained: {
            increment: expectedFoundEnemies * expectedHuntingXpPerEnemy,
          },
        }),
      }),
    );

    const createManyPayload =
      tx.autoCombatSessionEvent.createMany.mock.calls[0][0];

    expect(createManyPayload.data[0].payloadJson.huntingXpGained).toBe(
      expectedHuntingXpPerEnemy,
    );
  });

  it('mantem progressao de caca longa para cerca de 2 meses ate o cap', () => {
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
    expect(progress.xp).toBe(4505);
    expect(progress.xpToNextLevel).toBe(7614);
    expect((service as any).getHuntingSecondsPerEnemy(progress.level)).toBe(13);
  });

  it('usa mobs pendentes, nao total historico, para liberar capacidade da caca', async () => {
    const { service, tx } = createServiceHarness();
    const now = new Date('2026-06-02T12:00:00.000Z');
    const lastProcessedAt = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const session = createSession({
      foundEnemiesCount: 590,
      lastProcessedAt,
      lastHuntProcessedAt: lastProcessedAt,
      huntBatch: {
        id: 'hunt-batch-1',
        status: 'HUNTING',
        lastProcessedAt,
        foundEnemiesCount: 590,
        huntingXpGained: 0,
        selectedEncounter: null,
        selectedEncounterId: null,
        selectedEncounterMobId: null,
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 590,
            remainingCount: 500,
            weightSnapshot: 100,
          },
        ],
      },
    });

    await (service as any).processHuntingSession(session);

    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          foundEnemiesCount: {
            increment: 100,
          },
        }),
      }),
    );
    expect(tx.autoCombatHuntBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          foundEnemiesCount: {
            increment: 100,
          },
        }),
      }),
    );
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
      (service as any).getTrackedEnemiesRemainingAfterKill(session, 'mob-1', 1),
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

  it('respeita a selecao de mob e quantidade ao iniciar batalha', () => {
    const { service } = createServiceHarness();
    const session = createSession({
      huntBatch: {
        id: 'hunt-batch-1',
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 5,
            remainingCount: 5,
            weightSnapshot: 100,
          },
          {
            mobId: 'mob-2',
            encounterId: 'encounter-2',
            foundCount: 3,
            remainingCount: 3,
            weightSnapshot: 100,
          },
        ],
      },
    });

    const selection = (service as any).resolveBattleSelection(session, {
      mobId: 'mob-2',
      quantity: 2,
    });

    expect(selection.encounter.mobId).toBe('mob-2');
    expect(selection.quantity).toBe(2);
    expect(selection.availableCount).toBe(3);
  });

  it('bloqueia batalha com quantidade maior que a fila rastreada', () => {
    const { service } = createServiceHarness();
    const session = createSession({
      huntBatch: {
        id: 'hunt-batch-1',
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 2,
            remainingCount: 2,
            weightSnapshot: 100,
          },
        ],
      },
    });

    expect(() =>
      (service as any).resolveBattleSelection(session, {
        mobId: 'mob-1',
        quantity: 3,
      }),
    ).toThrow();
  });

  it('zera apenas o alvo de batalha selecionado sem consumir toda fila', () => {
    const { service } = createServiceHarness();
    const session = createSession({
      battleTargetMobId: 'mob-1',
      battleTargetRemaining: 1,
      huntBatch: {
        id: 'hunt-batch-1',
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 2,
            remainingCount: 2,
            weightSnapshot: 100,
          },
          {
            mobId: 'mob-2',
            encounterId: 'encounter-2',
            foundCount: 3,
            remainingCount: 3,
            weightSnapshot: 100,
          },
        ],
      },
    });

    expect(
      (service as any).getBattleTargetRemainingAfterKill(session, 'mob-1', 1),
    ).toBe(0);
    expect(
      (service as any).getTrackedEnemiesRemainingAfterKill(session, 'mob-1', 1),
    ).toBe(4);
  });

  it('preserva a fila rastreada restante quando o personagem morre', () => {
    const { service } = createServiceHarness();
    const terminalAt = new Date('2026-06-02T12:01:00.000Z');
    const session = createSession({
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.CONSUMED,
        consumedAt: new Date('2026-06-02T12:00:00.000Z'),
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 2,
            remainingCount: 2,
            weightSnapshot: 100,
          },
          {
            mobId: 'mob-2',
            encounterId: 'encounter-2',
            foundCount: 3,
            remainingCount: 3,
            weightSnapshot: 100,
          },
        ],
      },
    });
    const result = {
      finalStatus: AutoCombatSessionStatus.DEFEATED,
      newLastProcessedAt: terminalAt,
      finishedAt: terminalAt,
      mobSummaries: new Map([
        [
          'mob-1',
          {
            mobId: 'mob-1',
            kills: 1,
          },
        ],
      ]),
    };

    expect(
      (service as any).getTrackedEnemiesRemainingAfterResult(session, result),
    ).toBe(4);
    expect(
      (service as any).buildTerminalHuntBatchUpdateData(session, result),
    ).toEqual({
      status: AutoCombatHuntBatchStatus.READY,
      consumedAt: null,
      cancelledAt: null,
      lastProcessedAt: terminalAt,
    });
  });

  it('expõe resumo de ameaças preservadas para a UI pós-derrota', () => {
    const { service } = createServiceHarness();
    const finishedAt = new Date('2026-06-02T12:01:00.000Z');
    const session = createSession({
      status: AutoCombatSessionStatus.DEFEATED,
      finishedAt,
      mapId: 'map-1',
      subMapId: 'submap-1',
      map: {
        name: 'Subúrbio Silencioso',
      },
      subMap: {
        name: 'Bloco A',
        map: {
          name: 'Subúrbio Silencioso',
        },
        encounters: [
          createEncounter('encounter-1', 'mob-1', 1),
          createEncounter('encounter-2', 'mob-2', 3),
        ],
      },
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.READY,
        mobs: [
          {
            mobId: 'mob-1',
            encounterId: 'encounter-1',
            foundCount: 2,
            remainingCount: 1,
            weightSnapshot: 100,
          },
          {
            mobId: 'mob-2',
            encounterId: 'encounter-2',
            foundCount: 3,
            remainingCount: 3,
            weightSnapshot: 100,
          },
        ],
      },
    });

    expect(
      (service as any).buildPreservedTrackedEnemiesViewModel(session),
    ).toEqual({
      hasPreservedTrackedEnemies: true,
      preservedTrackedEnemiesCount: 4,
      huntBatchId: 'hunt-batch-1',
      sessionId: 'session-1',
      mapId: 'map-1',
      subMapId: 'submap-1',
      mapName: 'Subúrbio Silencioso',
      subMapName: 'Bloco A',
      defeatedAt: finishedAt.toISOString(),
    });

    expect(
      (service as any).buildPreservedTrackedEnemiesViewModel({
        ...session,
        status: AutoCombatSessionStatus.STOPPED,
      }),
    ).toEqual({
      hasPreservedTrackedEnemies: true,
      preservedTrackedEnemiesCount: 4,
      huntBatchId: 'hunt-batch-1',
      sessionId: 'session-1',
      mapId: 'map-1',
      subMapId: 'submap-1',
      mapName: 'Subúrbio Silencioso',
      subMapName: 'Bloco A',
      defeatedAt: null,
    });
  });

  it('reativa lote preservado do mesmo mapa em nova sessao pronta para batalha', async () => {
    const { service, prisma, tx, activityGuard, gateway } =
      createServiceHarness();
    const now = new Date('2026-06-02T12:10:00.000Z');
    const endsAt = new Date('2026-06-02T18:10:00.000Z');

    prisma.autoCombatHuntBatch.findFirst.mockResolvedValue({
      id: 'hunt-batch-1',
      characterId: 'character-1',
      mapId: 'map-1',
      status: AutoCombatHuntBatchStatus.READY,
      startedAt: new Date('2026-06-02T12:00:00.000Z'),
      stoppedAt: new Date('2026-06-02T12:01:00.000Z'),
      lastProcessedAt: new Date('2026-06-02T12:01:00.000Z'),
      huntingLevelAtStart: 2,
      huntingXpGained: 25,
      foundEnemiesCount: 5,
      bonusEnemiesFound: 0,
      selectedEncounterId: 'encounter-2',
      selectedEncounterMobId: 'mob-2',
      session: {
        id: 'defeated-session-1',
        subMapId: 'submap-1',
      },
      selectedEncounter: {
        id: 'encounter-2',
        mobId: 'mob-2',
      },
      mobs: [
        {
          mobId: 'mob-1',
          encounterId: 'encounter-1',
          remainingCount: 0,
        },
        {
          mobId: 'mob-2',
          encounterId: 'encounter-2',
          remainingCount: 4,
        },
      ],
    });
    tx.autoCombatSession.create.mockResolvedValue({ id: 'session-resumed' });

    const response = await (service as any).resumePreservedHuntBatchIfAvailable(
      {
        userId: 'user-1',
        character: {
          id: 'character-1',
        },
        mapId: 'map-1',
        characterStats: {
          hp: 100,
          maxHp: 100,
        },
        huntingLevel: 2,
        now,
        endsAt,
        sessionDurationSeconds: 21600,
      },
    );

    expect(response).toEqual({
      active: true,
      session: {
        id: 'session-1',
      },
    });
    expect(prisma.autoCombatHuntBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          characterId: 'character-1',
          mapId: 'map-1',
          status: AutoCombatHuntBatchStatus.READY,
          session: {
            is: {
              status: {
                in: [
                  AutoCombatSessionStatus.DEFEATED,
                  AutoCombatSessionStatus.STOPPED,
                ],
              },
            },
          },
        }),
      }),
    );
    expect(activityGuard.ensureCanStartAutoCombat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        characterId: 'character-1',
      }),
    );
    expect(tx.autoCombatSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AutoCombatSessionStatus.ACTIVE,
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          subMapId: 'submap-1',
          selectedEncounterId: 'encounter-2',
          selectedEncounterMobId: 'mob-2',
        }),
      }),
    );
    expect(tx.autoCombatHuntBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'hunt-batch-1',
        },
        data: expect.objectContaining({
          sessionId: 'session-resumed',
          status: AutoCombatHuntBatchStatus.READY,
          consumedAt: null,
          selectedEncounterId: 'encounter-2',
          selectedEncounterMobId: 'mob-2',
        }),
      }),
    );
    expect(gateway.emitStatus).toHaveBeenCalled();
  });

  it('estaciona a sessao pronta sem consumir os mobs rastreados', async () => {
    const { service, tx, activityGuard } = createServiceHarness();

    const wasParked = await (
      service as any
    ).parkEncounterReadySessionForMapChange({
      userId: 'user-1',
      characterId: 'character-1',
      sessionId: 'session-map-1',
    });

    expect(wasParked).toBe(true);
    expect(activityGuard.ensureCanStartAutoCombat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        characterId: 'character-1',
        client: tx,
        lockCharacter: true,
      }),
    );
    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'session-map-1',
          status: AutoCombatSessionStatus.ACTIVE,
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
        }),
        data: expect.objectContaining({
          status: AutoCombatSessionStatus.STOPPED,
        }),
      }),
    );
    expect(tx.autoCombatHuntBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId: 'session-map-1',
          status: AutoCombatHuntBatchStatus.READY,
        },
        data: expect.objectContaining({
          consumedAt: null,
          cancelledAt: null,
        }),
      }),
    );
  });

  it('inicia a caca do mapa novo e mantem estacionado o lote pronto do mapa anterior', async () => {
    const { service, prisma, tx } = createServiceHarness();
    const mapTwoEncounter = createEncounter('encounter-map-2', 'mob-map-2');

    prisma.character.findFirst.mockResolvedValue({
      id: 'character-1',
      level: 12,
      user: {
        premiumUntil: null,
      },
    });
    prisma.autoCombatSession.findFirst
      .mockResolvedValueOnce({
        id: 'session-map-1',
        mapId: 'map-1',
        phase: AutoCombatSessionPhase.ENCOUNTER_READY,
        endsAt: new Date('2026-06-02T18:00:00.000Z'),
      })
      .mockResolvedValueOnce(null);
    prisma.subMap.findUnique.mockResolvedValue({ id: 'submap-map-2' });
    jest
      .spyOn(service as any, 'resolveAutoCombatHuntTarget')
      .mockResolvedValue({
        map: {
          id: 'map-2',
          minLevel: 1,
        },
        subMap: {
          id: 'submap-map-2',
        },
        encounters: [mapTwoEncounter],
      });
    jest
      .spyOn(service as any, 'calculateCharacterFighterStats')
      .mockReturnValue({ hp: 100, maxHp: 100 });
    jest
      .spyOn(service as any, 'createHuntingCycleWithPetBonus')
      .mockResolvedValue({
        cycle: {
          startedAt: new Date('2026-06-02T12:00:00.000Z'),
          endsAt: new Date('2026-06-02T12:00:15.000Z'),
          durationMs: 15_000,
          version: 1,
        },
        appliedPetBonus: null,
      });
    jest
      .spyOn(service as any, 'startRealtimeProcessingLoop')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'scheduleImmediateSessionProcessing')
      .mockImplementation(() => undefined);

    await service.start('user-1', {
      characterId: 'character-1',
      mapId: 'map-2',
    });

    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'session-map-1',
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
        }),
        data: expect.objectContaining({
          status: AutoCombatSessionStatus.STOPPED,
        }),
      }),
    );
    expect(tx.autoCombatSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          characterId: 'character-1',
          mapId: 'map-2',
          subMapId: 'submap-map-2',
          phase: AutoCombatSessionPhase.HUNTING,
        }),
      }),
    );
    expect(tx.autoCombatHuntBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          characterId: 'character-1',
          mapId: 'map-2',
          status: AutoCombatHuntBatchStatus.HUNTING,
        }),
      }),
    );
  });

  it('exibe somente a sessao inativa do mapa atual e reencontra o lote ao retornar', async () => {
    const { service, prisma } = createServiceHarness();
    const character = {
      id: 'character-1',
      userId: 'user-1',
      name: 'Sobrevivente',
      level: 12,
      xp: 250,
      currentHp: 100,
      maxHp: 100,
    };

    prisma.character.findFirst
      .mockResolvedValueOnce({ ...character, mapId: 'map-2' })
      .mockResolvedValueOnce({ ...character, mapId: 'map-1' });
    prisma.autoCombatSession.findFirst.mockImplementation(
      (query: { where?: { status?: string; mapId?: string } }) => {
        if (query.where?.status === AutoCombatSessionStatus.ACTIVE) {
          return Promise.resolve(null);
        }

        return Promise.resolve(
          query.where?.mapId === 'map-1'
            ? { id: 'preserved-session-map-1' }
            : null,
        );
      },
    );

    const statusOnMapTwo = await service.getStatus('user-1', 'character-1');

    expect(statusOnMapTwo).toEqual(
      expect.objectContaining({
        active: false,
        hasActiveAutoCombat: false,
      }),
    );
    expect((service as any).buildSessionResponse).not.toHaveBeenCalled();
    expect(prisma.autoCombatSession.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          characterId: 'character-1',
          status: AutoCombatSessionStatus.ACTIVE,
          OR: expect.arrayContaining([
            {
              mapId: 'map-2',
              phase: AutoCombatSessionPhase.ENCOUNTER_READY,
            },
          ]),
        }),
      }),
    );
    expect(prisma.autoCombatSession.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          characterId: 'character-1',
          mapId: 'map-2',
        },
      }),
    );

    await service.getStatus('user-1', 'character-1');

    expect(prisma.autoCombatSession.findFirst).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        where: {
          characterId: 'character-1',
          mapId: 'map-1',
        },
      }),
    );
    expect((service as any).buildSessionResponse).toHaveBeenCalledWith(
      'preserved-session-map-1',
      expect.any(Object),
    );
  });

  it('cancela batalha preservando os mobs rastreados restantes', async () => {
    const { service, prisma, tx, gateway } = createServiceHarness();
    const lastProcessedAt = new Date('2026-06-02T12:02:00.000Z');
    const loadedSession = createSession({
      phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
      lastProcessedAt,
      currentMobId: 'mob-2',
      currentMobHp: 5,
      currentMobMaxHp: 10,
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.CONSUMED,
        lastProcessedAt,
        mobs: [
          {
            mobId: 'mob-2',
            encounterId: 'encounter-2',
            remainingCount: 3,
          },
        ],
      },
    });

    (prisma as any).character = {
      findFirst: jest.fn().mockResolvedValue({ id: 'character-1' }),
    };
    (prisma as any).autoCombatSession = {
      findFirst: jest.fn().mockResolvedValue({ id: 'session-1' }),
    };
    jest
      .spyOn(service as any, 'loadAutoCombatSession')
      .mockResolvedValue(loadedSession);

    await service.stop('user-1', 'character-1');

    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          currentMobId: null,
          battleTargetRemaining: 0,
        }),
      }),
    );
    expect(tx.autoCombatHuntBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AutoCombatHuntBatchStatus.READY,
          consumedAt: null,
          cancelledAt: null,
        }),
      }),
    );
    expect(gateway.emitStopped).toHaveBeenCalled();
  });

  it('consome a fila quando a sessao termina sem mobs rastreados restantes', () => {
    const { service } = createServiceHarness();
    const terminalAt = new Date('2026-06-02T12:01:00.000Z');
    const session = createSession({
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.CONSUMED,
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
    const result = {
      finalStatus: AutoCombatSessionStatus.DEFEATED,
      newLastProcessedAt: terminalAt,
      finishedAt: terminalAt,
      mobSummaries: new Map([
        [
          'mob-1',
          {
            mobId: 'mob-1',
            kills: 1,
          },
        ],
      ]),
    };

    expect(
      (service as any).buildTerminalHuntBatchUpdateData(session, result),
    ).toEqual({
      status: AutoCombatHuntBatchStatus.CONSUMED,
      consumedAt: terminalAt,
      lastProcessedAt: terminalAt,
    });
  });

  it('preserva os rastreados quando o limite da caca e atingido', async () => {
    const { service, tx, gateway } = createServiceHarness();
    const now = new Date('2026-06-02T12:00:00.000Z');
    const session = createSession({
      startedAt: new Date(now.getTime() - 90_000),
      huntStartedAt: new Date(now.getTime() - 90_000),
      lastProcessedAt: new Date(now.getTime() - 90_000),
      lastHuntProcessedAt: new Date(now.getTime() - 90_000),
      endsAt: now,
      huntBatch: {
        id: 'hunt-batch-1',
        status: AutoCombatHuntBatchStatus.HUNTING,
        lastProcessedAt: new Date(now.getTime() - 90_000),
        foundEnemiesCount: 1,
        huntingXpGained: 0,
        selectedEncounter: null,
        selectedEncounterId: null,
        selectedEncounterMobId: null,
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

    await (service as any).processHuntingSession(session);

    expect(tx.autoCombatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          huntStoppedAt: now,
        }),
      }),
    );
    expect(tx.autoCombatHuntBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AutoCombatHuntBatchStatus.READY,
          stoppedAt: now,
          consumedAt: null,
          cancelledAt: null,
        }),
      }),
    );
    expect(gateway.emitFinished).not.toHaveBeenCalled();
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
