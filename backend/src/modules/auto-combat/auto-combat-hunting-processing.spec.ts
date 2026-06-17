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
    autoCombatHuntBatch: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const activityGuard = {
    ensureCanStartAutoCombat: jest.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    emitSessionUpdated: jest.fn(),
    emitStatus: jest.fn(),
    emitFinished: jest.fn(),
    emitStopped: jest.fn(),
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
    prisma,
    activityGuard,
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
  });

  it('reativa lote preservado em nova sessao pronta para batalha apos cura', async () => {
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

    const response = await (service as any).resumeDefeatedHuntBatchIfAvailable({
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
    });

    expect(response).toEqual({
      active: true,
      session: {
        id: 'session-1',
      },
    });
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
