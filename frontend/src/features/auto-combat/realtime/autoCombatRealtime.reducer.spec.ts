import assert from "node:assert/strict";
import test from "node:test";
import {
  autoCombatRealtimeReducer,
  initialAutoCombatRealtimeState,
  type AutoCombatRealtimeState,
} from "./autoCombatRealtime.reducer";
import type { AutoCombatRealtimeEvent } from "../types/auto-combat.types";

function makeState(): AutoCombatRealtimeState {
  return {
    ...initialAutoCombatRealtimeState,
    characterId: "char-1",
    hasLoadedOnce: true,
    session: {
      id: "session-1",
      characterId: "char-1",
      status: "ACTIVE",
      currentRound: 1,
      currentCombatIndex: 1,
    },
    character: {
      id: "char-1",
      name: "Sobrevivente",
      currentHp: 100,
      maxHp: 100,
      hpPercent: 100,
    },
    mob: {
      id: "mob-1",
      name: "Zumbi",
      currentHp: 100,
      maxHp: 100,
      hpPercent: 100,
    },
  };
}

function makeHit(
  sequence: number,
  mobCurrentHp: number,
): AutoCombatRealtimeEvent {
  return {
    characterId: "char-1",
    sessionId: "session-1",
    type: "PLAYER_HIT",
    actor: "PLAYER",
    target: "MOB",
    mobId: "mob-1",
    mobName: "Zumbi",
    mobCurrentHp,
    mobMaxHp: 100,
    characterCurrentHp: 100,
    characterMaxHp: 100,
    damage: 100 - mobCurrentHp,
    round: sequence,
    combatIndex: 1,
    createdAt: `2026-05-11T00:00:0${sequence}.000Z`,
    sequence,
  } as AutoCombatRealtimeEvent;
}

function enqueueAndProcess(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const queued = autoCombatRealtimeReducer(state, {
    type: "ENQUEUE_EVENT",
    characterId: "char-1",
    event,
  });

  return autoCombatRealtimeReducer(queued, {
    type: "PROCESS_NEXT_EVENT",
  });
}

function makeDefeatedStatus(preservedTrackedEnemiesCount = 4) {
  return {
    active: false,
    hasActiveAutoCombat: false,
    shouldRedirectToInfirmary: true,
    endReason: "PLAYER_DEFEATED",
    character: {
      id: "char-1",
      currentHp: 0,
      maxHp: 100,
    },
    session: {
      id: "session-1",
      characterId: "char-1",
      status: "DEFEATED",
      phase: "PLAYER_DEFEATED",
      preservedTrackedEnemiesCount,
      autoCombatRecovery: {
        hasPreservedTrackedEnemies: preservedTrackedEnemiesCount > 0,
        preservedTrackedEnemiesCount,
        huntBatchId: "batch-1",
      },
    },
    autoCombatRecovery: {
      hasPreservedTrackedEnemies: preservedTrackedEnemiesCount > 0,
      preservedTrackedEnemiesCount,
      huntBatchId: "batch-1",
    },
  } as never;
}

test("agenda dano visual antes de aplicar o impacto", () => {
  const event = makeHit(1, 70);
  const started = enqueueAndProcess(makeState(), event);

  assert.equal(started.activeEvent, event);
  assert.equal(started.activeEventImpactApplied, false);
  assert.equal(started.mob?.currentHp, 100);
  assert.equal(started.battleLogEvents.length, 0);

  const impacted = autoCombatRealtimeReducer(started, {
    type: "APPLY_ACTIVE_EVENT_IMPACT",
  });

  assert.equal(impacted.activeEventImpactApplied, true);
  assert.equal(impacted.mob?.currentHp, 70);
  assert.equal(impacted.battleLogEvents.at(0), event);
});

test("status durante evento ativo não faz rollback do HP visual", () => {
  const started = enqueueAndProcess(makeState(), makeHit(1, 70));

  const hydrated = autoCombatRealtimeReducer(started, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: {
      active: true,
      hasActiveAutoCombat: true,
      character: { id: "char-1", currentHp: 100, maxHp: 100 },
      session: {
        id: "session-1",
        characterId: "char-1",
        status: "ACTIVE",
        currentRound: 1,
        currentCombatIndex: 1,
      },
      currentMob: {
        id: "mob-1",
        name: "Zumbi",
        currentHp: 70,
        maxHp: 100,
      },
    } as never,
  });

  assert.equal(hydrated.mob?.currentHp, 100);
  assert.equal(hydrated.activeEventImpactApplied, false);
});

test("status adiantado aguarda o evento de abate antes de trocar a instancia visual", () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    snapshotSequence: 3,
    lastAppliedEventSequence: 3,
    session: {
      ...makeState().session,
      currentCombatIndex: 1,
      enemyInstanceId: "enemy-1",
      currentEnemyInstanceId: "enemy-1",
      battleTargetTotal: 4,
      battleTargetRemaining: 4,
      battleProgress: {
        cycleStartedAt: "2026-05-11T00:00:00.000Z",
        cycleDurationMs: 8_000,
      },
      phase: "COMBAT_ACTIVE",
    },
    mob: {
      ...makeState().mob,
      enemyInstanceId: "enemy-1",
      battleProgress: {
        cycleStartedAt: "2026-05-11T00:00:00.000Z",
        cycleDurationMs: 8_000,
      },
    },
  };
  const status = {
    active: true,
    hasActiveAutoCombat: true,
    snapshotSequence: 4,
    latestEventSequence: 4,
    character: { id: "char-1", currentHp: 99, maxHp: 100 },
    session: {
      id: "session-1",
      characterId: "char-1",
      status: "ACTIVE",
      currentRound: 2,
      currentCombatIndex: 2,
      enemyInstanceId: "enemy-2",
      currentEnemyInstanceId: "enemy-2",
      battleTargetTotal: 4,
      battleTargetRemaining: 3,
      battleProgress: {
        cycleStartedAt: "2026-05-11T00:00:08.000Z",
        cycleDurationMs: 8_000,
      },
      snapshotSequence: 4,
      latestEventSequence: 4,
      phase: "COMBAT_ACTIVE",
    },
    currentMob: {
      id: "mob-1",
      name: "Zumbi",
      enemyInstanceId: "enemy-2",
      currentHp: 100,
      maxHp: 100,
      battleProgress: {
        cycleStartedAt: "2026-05-11T00:00:08.000Z",
        cycleDurationMs: 8_000,
      },
    },
  } as never;

  const deferred = autoCombatRealtimeReducer(state, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status,
  });

  assert.equal(deferred.mob?.enemyInstanceId, "enemy-1");
  assert.equal(deferred.session?.currentEnemyInstanceId, "enemy-1");
  assert.equal(deferred.session?.currentCombatIndex, 1);
  assert.equal(deferred.session?.battleTargetRemaining, 4);
  assert.equal(
    deferred.session?.battleProgress?.cycleStartedAt,
    "2026-05-11T00:00:00.000Z",
  );
  assert.equal(deferred.character?.currentHp, 100);

  const defeatEvent = {
    characterId: "char-1",
    sessionId: "session-1",
    type: "MOB_DEFEATED",
    actor: "PLAYER",
    target: "MOB",
    mobId: "mob-1",
    mobName: "Zumbi",
    enemyInstanceId: "enemy-1",
    mobCurrentHp: 0,
    mobMaxHp: 100,
    characterCurrentHp: 99,
    characterMaxHp: 100,
    combatIndex: 1,
    battleTargetTotal: 4,
    battleTargetRemaining: 3,
    cycleStartedAt: "2026-05-11T00:00:08.000Z",
    cycleDurationMs: 8_000,
    sequence: 4,
  } as AutoCombatRealtimeEvent;
  const impacted = autoCombatRealtimeReducer(
    enqueueAndProcess(deferred, defeatEvent),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );
  const hydratedDuringDefeat = autoCombatRealtimeReducer(impacted, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status,
  });

  assert.equal(hydratedDuringDefeat.mob?.enemyInstanceId, "enemy-1");
  assert.equal(hydratedDuringDefeat.session?.currentEnemyInstanceId, "enemy-1");
  assert.equal(hydratedDuringDefeat.session?.currentCombatIndex, 1);
  assert.equal(hydratedDuringDefeat.session?.battleTargetRemaining, 3);

  const released = autoCombatRealtimeReducer(hydratedDuringDefeat, {
    type: "CLEAR_ACTIVE_EVENT",
  });

  assert.equal(released.mob?.enemyInstanceId, "enemy-2");
  assert.equal(released.session?.currentEnemyInstanceId, "enemy-2");
  assert.equal(released.session?.currentCombatIndex, 2);
  assert.equal(released.session?.battleTargetRemaining, 3);
  assert.equal(released.visualCycleEnemyInstanceId, "enemy-2");
  assert.ok(released.visualCycleStartedAtMs);
});

test("mantém a âncora visual do segundo mob durante os golpes", () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    visualCycleEnemyInstanceId: "enemy-2",
    visualCycleStartedAtMs: 10_000,
    session: {
      ...makeState().session,
      currentCombatIndex: 2,
      enemyInstanceId: "enemy-2",
      currentEnemyInstanceId: "enemy-2",
    },
    mob: {
      ...makeState().mob,
      enemyInstanceId: "enemy-2",
    },
  };
  const firstHit = {
    ...makeHit(5, 80),
    combatIndex: 2,
    enemyInstanceId: "enemy-2",
    mobHpBefore: 100,
    mobHpAfter: 80,
    targetHpBefore: 100,
    targetHpAfter: 80,
  } as AutoCombatRealtimeEvent;
  const started = enqueueAndProcess(state, firstHit);

  assert.equal(started.mob?.currentHp, 100);
  assert.equal(started.visualCycleEnemyInstanceId, "enemy-2");
  assert.equal(started.visualCycleStartedAtMs, 10_000);

  const impacted = autoCombatRealtimeReducer(started, {
    type: "APPLY_ACTIVE_EVENT_IMPACT",
  });

  assert.equal(impacted.mob?.currentHp, 80);
  assert.equal(impacted.visualCycleEnemyInstanceId, "enemy-2");
  assert.equal(impacted.visualCycleStartedAtMs, 10_000);
  assert.equal(impacted.activeEventImpactApplied, true);
});

test("snapshot terminal aguarda o impacto e o recibo do ultimo mob", () => {
  const killingHit = {
    ...makeHit(5, 0),
    enemyInstanceId: "enemy-2",
    combatIndex: 2,
    mobHpBefore: 100,
    mobHpAfter: 0,
    targetHpBefore: 100,
    targetHpAfter: 0,
  } as AutoCombatRealtimeEvent;
  const defeated = {
    ...killingHit,
    type: "MOB_DEFEATED",
    sequence: 6,
    battleTargetTotal: 2,
    battleTargetRemaining: 0,
  } as AutoCombatRealtimeEvent;
  const terminalStatus = {
    active: false,
    hasActiveAutoCombat: false,
    snapshotSequence: 6,
    character: { id: "char-1", currentHp: 100, maxHp: 100 },
    session: {
      id: "session-1",
      characterId: "char-1",
      status: "FINISHED",
      currentRound: 5,
      currentCombatIndex: 2,
      enemyInstanceId: "enemy-2",
      currentEnemyInstanceId: "enemy-2",
      battleTargetTotal: 2,
      battleTargetRemaining: 0,
      snapshotSequence: 6,
      latestEventSequence: 6,
      phase: "MOB_DEFEATED",
    },
    currentMob: {
      id: "mob-1",
      name: "Zumbi",
      enemyInstanceId: "enemy-2",
      currentHp: 0,
      maxHp: 100,
    },
  } as never;
  const queued = autoCombatRealtimeReducer(makeState(), {
    type: "ENQUEUE_EVENT",
    characterId: "char-1",
    event: killingHit,
  });
  const withDefeatQueued = autoCombatRealtimeReducer(queued, {
    type: "ENQUEUE_EVENT",
    characterId: "char-1",
    event: defeated,
  });
  const started = autoCombatRealtimeReducer(withDefeatQueued, {
    type: "PROCESS_NEXT_EVENT",
  });
  const deferredTerminal = autoCombatRealtimeReducer(started, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: terminalStatus,
  });

  assert.equal(deferredTerminal.session?.status, "ACTIVE");
  assert.equal(deferredTerminal.mob?.currentHp, 100);
  assert.equal(deferredTerminal.pendingTerminalStatus, terminalStatus);

  const hitImpacted = autoCombatRealtimeReducer(deferredTerminal, {
    type: "APPLY_ACTIVE_EVENT_IMPACT",
  });
  assert.equal(hitImpacted.mob?.currentHp, 0);

  const hitReleased = autoCombatRealtimeReducer(hitImpacted, {
    type: "CLEAR_ACTIVE_EVENT",
  });
  assert.equal(hitReleased.session?.status, "ACTIVE");
  assert.equal(hitReleased.eventQueue.length, 1);

  const defeatStarted = autoCombatRealtimeReducer(hitReleased, {
    type: "PROCESS_NEXT_EVENT",
  });
  const defeatImpacted = autoCombatRealtimeReducer(defeatStarted, {
    type: "APPLY_ACTIVE_EVENT_IMPACT",
  });
  const finished = autoCombatRealtimeReducer(defeatImpacted, {
    type: "CLEAR_ACTIVE_EVENT",
  });

  assert.equal(finished.session?.status, "FINISHED");
  assert.equal(finished.pendingTerminalStatus, null);
  assert.equal(finished.eventQueue.length, 0);
  assert.equal(finished.mob?.currentHp, 0);
});

test("ressincronizacao limpa mob visual antigo sem apagar sessao ativa", () => {
  const state = makeState();
  const syncing = autoCombatRealtimeReducer(state, {
    type: "SET_SYNCHRONIZING",
    isSynchronizing: true,
    clearCombatView: true,
  });

  assert.equal(syncing.isSynchronizing, true);
  assert.equal(syncing.session?.id, state.session?.id);
  assert.equal(syncing.mob, null);
  assert.equal(syncing.visual, null);
  assert.equal(syncing.activeEvent, null);
  assert.equal(syncing.eventQueue.length, 0);
});

test("ressincronizacao de visibilidade preserva o mob e a ancora do ciclo atual", () => {
  const visualCycleStartedAtMs = Date.now() - 1_250;
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    session: {
      ...makeState().session,
      phase: "COMBAT_ACTIVE",
      enemyInstanceId: "enemy-1",
      currentEnemyInstanceId: "enemy-1",
    },
    mob: {
      ...makeState().mob,
      enemyInstanceId: "enemy-1",
    },
    visualCycleEnemyInstanceId: "enemy-1",
    visualCycleStartedAtMs,
  };
  const syncing = autoCombatRealtimeReducer(state, {
    type: "SET_SYNCHRONIZING",
    isSynchronizing: true,
    clearCombatView: false,
  });
  const hydrated = autoCombatRealtimeReducer(syncing, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: {
      active: true,
      hasActiveAutoCombat: true,
      serverNow: new Date().toISOString(),
      character: { id: "char-1", currentHp: 100, maxHp: 100 },
      session: {
        id: "session-1",
        characterId: "char-1",
        status: "ACTIVE",
        phase: "COMBAT_ACTIVE",
        enemyInstanceId: "enemy-1",
        currentEnemyInstanceId: "enemy-1",
      },
      currentMob: {
        id: "mob-1",
        name: "Zumbi",
        enemyInstanceId: "enemy-1",
        currentHp: 100,
        maxHp: 100,
        battleProgress: {
          progressSeconds: 2,
          cycleDurationMs: 8_000,
        },
      },
    } as never,
  });

  assert.equal(syncing.mob?.enemyInstanceId, "enemy-1");
  assert.equal(hydrated.visualCycleEnemyInstanceId, "enemy-1");
  assert.equal(hydrated.visualCycleStartedAtMs, visualCycleStartedAtMs);
});

test("ressincronizacao ancora um novo mob no progresso do snapshot", () => {
  const snapshotNowMs = Date.now();
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    session: {
      ...makeState().session,
      phase: "COMBAT_ACTIVE",
      enemyInstanceId: "enemy-1",
      currentEnemyInstanceId: "enemy-1",
    },
    mob: {
      ...makeState().mob,
      enemyInstanceId: "enemy-1",
    },
    visualCycleEnemyInstanceId: "enemy-1",
    visualCycleStartedAtMs: snapshotNowMs - 7_000,
    isSynchronizing: true,
  };
  const hydrated = autoCombatRealtimeReducer(state, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: {
      active: true,
      hasActiveAutoCombat: true,
      serverNow: new Date(snapshotNowMs).toISOString(),
      character: { id: "char-1", currentHp: 99, maxHp: 100 },
      session: {
        id: "session-1",
        characterId: "char-1",
        status: "ACTIVE",
        phase: "COMBAT_ACTIVE",
        enemyInstanceId: "enemy-2",
        currentEnemyInstanceId: "enemy-2",
        battleProgress: {
          progressSeconds: 2,
          progressUpdatedAt: new Date(snapshotNowMs).toISOString(),
          serverNow: new Date(snapshotNowMs).toISOString(),
          cycleDurationMs: 8_000,
        },
      },
      currentMob: {
        id: "mob-1",
        name: "Zumbi",
        enemyInstanceId: "enemy-2",
        currentHp: 100,
        maxHp: 100,
        battleProgress: {
          progressSeconds: 2,
          progressUpdatedAt: new Date(snapshotNowMs).toISOString(),
          serverNow: new Date(snapshotNowMs).toISOString(),
          cycleDurationMs: 8_000,
        },
      },
    } as never,
  });
  const resumedElapsedMs = Date.now() - (hydrated.visualCycleStartedAtMs ?? 0);

  assert.equal(hydrated.visualCycleEnemyInstanceId, "enemy-2");
  assert.ok(resumedElapsedMs >= 1_900);
  assert.ok(resumedElapsedMs <= 2_200);
});

test("primeiro snapshot ancora a barra no relogio absoluto do servidor", () => {
  const snapshotNowMs = Date.now();
  const hydrated = autoCombatRealtimeReducer(
    {
      ...initialAutoCombatRealtimeState,
      characterId: "char-1",
    },
    {
      type: "HYDRATE_STATUS",
      characterId: "char-1",
      status: {
        active: true,
        hasActiveAutoCombat: true,
        serverNow: new Date(snapshotNowMs).toISOString(),
        character: { id: "char-1", currentHp: 100, maxHp: 100 },
        session: {
          id: "session-1",
          characterId: "char-1",
          status: "ACTIVE",
          phase: "COMBAT_ACTIVE",
          enemyInstanceId: "enemy-1",
          currentEnemyInstanceId: "enemy-1",
          battleProgress: {
            cycleStartedAt: new Date(snapshotNowMs - 3_000).toISOString(),
            cycleDurationMs: 8_000,
            serverNow: new Date(snapshotNowMs).toISOString(),
          },
        },
        currentMob: {
          id: "mob-1",
          name: "Zumbi",
          enemyInstanceId: "enemy-1",
          currentHp: 100,
          maxHp: 100,
          battleProgress: {
            cycleStartedAt: new Date(snapshotNowMs - 3_000).toISOString(),
            cycleDurationMs: 8_000,
            serverNow: new Date(snapshotNowMs).toISOString(),
          },
        },
      } as never,
    },
  );
  const elapsedMs = Date.now() - (hydrated.visualCycleStartedAtMs ?? 0);

  assert.equal(hydrated.visualCycleEnemyInstanceId, "enemy-1");
  assert.ok(elapsedMs >= 2_900);
  assert.ok(elapsedMs <= 3_200);
});

test("spawn recebido com atraso preserva a ancora enviada pelo servidor", () => {
  const serverNowMs = Date.now();
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    visualCycleEnemyInstanceId: "enemy-1",
    visualCycleStartedAtMs: serverNowMs - 8_000,
    session: {
      ...makeState().session,
      phase: "COMBAT_ACTIVE",
      enemyInstanceId: "enemy-1",
      currentEnemyInstanceId: "enemy-1",
    },
    mob: {
      ...makeState().mob,
      enemyInstanceId: "enemy-1",
    },
  };
  const spawnEvent = {
    characterId: "char-1",
    sessionId: "session-1",
    type: "MOB_SPAWNED",
    sequence: 2,
    combatIndex: 2,
    mobId: "mob-1",
    mobName: "Zumbi",
    enemyInstanceId: "enemy-2",
    mobCurrentHp: 100,
    mobMaxHp: 100,
    cycleStartedAt: new Date(serverNowMs - 2_000).toISOString(),
    cycleDurationMs: 8_000,
    serverTime: new Date(serverNowMs).toISOString(),
  } as AutoCombatRealtimeEvent;
  const impacted = autoCombatRealtimeReducer(
    enqueueAndProcess(state, spawnEvent),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );
  const elapsedMs = Date.now() - (impacted.visualCycleStartedAtMs ?? 0);

  assert.equal(impacted.visualCycleEnemyInstanceId, "enemy-2");
  assert.ok(elapsedMs >= 1_900);
  assert.ok(elapsedMs <= 2_200);
});

test("múltiplas ações em autocombat avançam em sequência monotônica", () => {
  const firstImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(makeState(), makeHit(1, 70)),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );
  const firstCleared = autoCombatRealtimeReducer(firstImpact, {
    type: "CLEAR_ACTIVE_EVENT",
  });

  const secondImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(firstCleared, makeHit(2, 30)),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );

  assert.equal(secondImpact.mob?.currentHp, 30);
  assert.deepEqual(
    secondImpact.battleLogEvents.map(
      (event) => (event as { sequence?: number }).sequence,
    ),
    [2, 1],
  );
});

test("eventos atrasados não reordenam nem restauram estado antigo", () => {
  const firstImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(makeState(), makeHit(1, 70)),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );
  const firstCleared = autoCombatRealtimeReducer(firstImpact, {
    type: "CLEAR_ACTIVE_EVENT",
  });
  const secondImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(firstCleared, makeHit(2, 30)),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );

  const restored = autoCombatRealtimeReducer(secondImpact, {
    type: "HYDRATE_RECENT_EVENTS",
    characterId: "char-1",
    sessionId: "session-1",
    events: [makeHit(1, 70)],
    applySnapshot: true,
  });

  assert.equal(restored.mob?.currentHp, 30);
  assert.deepEqual(
    restored.battleLogEvents.map(
      (event) => (event as { sequence?: number }).sequence,
    ),
    [2, 1],
  );
});

test("status canônico não antecipa EXP antes do MOB_DEFEATED visual", () => {
  const pendingHit = makeHit(4, 10);
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    activeEvent: pendingHit,
    activeEventImpactApplied: true,
    character: {
      id: "char-1",
      name: "Sobrevivente",
      currentHp: 60,
      maxHp: 100,
      hpPercent: 60,
      level: 1,
      xp: 100,
      totalXp: 100,
      currentLevelXp: 100,
      xpToNextLevel: 200,
      xpProgressPercent: 50,
    },
    displayTotals: {
      sessionId: "session-1",
      totalKills: 0,
      totalCombats: 0,
      totalRounds: 4,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    },
  };

  const hydrated = autoCombatRealtimeReducer(state, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: {
      active: true,
      hasActiveAutoCombat: true,
      character: {
        id: "char-1",
        name: "Sobrevivente",
        level: 1,
        xp: 150,
        totalXp: 150,
        currentHp: 90,
        maxHp: 100,
        currentLevelXp: 150,
        xpToNextLevel: 200,
        xpProgressPercent: 75,
      },
      session: {
        id: "session-1",
        characterId: "char-1",
        status: "ACTIVE",
        currentRound: 5,
        currentCombatIndex: 1,
        totalCombatsResolved: 1,
        totalRoundsResolved: 5,
        totalXpGained: 50,
      },
      currentMob: {
        id: "mob-1",
        name: "Zumbi",
        currentHp: 0,
        maxHp: 100,
      },
    } as never,
  });

  assert.equal(hydrated.character?.totalXp, 100);
  assert.equal(hydrated.character?.currentLevelXp, 100);
  assert.equal(hydrated.character?.xpProgressPercent, 50);
  assert.equal(hydrated.displayTotals?.totalXpGained, 0);
});

test("POTION_USED não herda EXP canônica pendente de status antes do abate", () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    character: {
      id: "char-1",
      name: "Sobrevivente",
      currentHp: 40,
      maxHp: 100,
      hpPercent: 40,
      level: 1,
      xp: 100,
      totalXp: 100,
      currentLevelXp: 100,
      xpToNextLevel: 200,
      xpProgressPercent: 50,
    },
    totals: {
      sessionId: "session-1",
      totalKills: 1,
      totalCombats: 1,
      totalRounds: 5,
      totalXpGained: 50,
      totalLoot: 0,
      potionsUsed: 1,
    },
    displayTotals: {
      sessionId: "session-1",
      totalKills: 0,
      totalCombats: 0,
      totalRounds: 4,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    },
  };

  const potionEvent = {
    characterId: "char-1",
    sessionId: "session-1",
    type: "POTION_USED",
    actor: "PLAYER",
    target: "PLAYER",
    mobId: "mob-1",
    mobName: "Zumbi",
    mobCurrentHp: 10,
    mobMaxHp: 100,
    characterCurrentHp: 90,
    characterMaxHp: 100,
    healedAmount: 50,
    round: 5,
    combatIndex: 1,
    totalKills: 0,
    totalXpGained: 0,
    potionsUsed: 1,
    createdAt: "2026-05-11T00:00:05.000Z",
    sequence: 5,
  } as AutoCombatRealtimeEvent;

  const afterPotion = autoCombatRealtimeReducer(
    enqueueAndProcess(state, potionEvent),
    { type: "CLEAR_ACTIVE_EVENT" },
  );

  assert.equal(afterPotion.character?.totalXp, 100);
  assert.equal(afterPotion.character?.currentLevelXp, 100);
  assert.equal(afterPotion.character?.xpProgressPercent, 50);
  assert.equal(afterPotion.displayTotals?.totalXpGained, 0);

  const defeatEvent = {
    characterId: "char-1",
    sessionId: "session-1",
    type: "MOB_DEFEATED",
    actor: "PLAYER",
    target: "MOB",
    mobId: "mob-1",
    mobName: "Zumbi",
    mobCurrentHp: 0,
    mobMaxHp: 100,
    characterCurrentHp: 90,
    characterMaxHp: 100,
    xpGained: 50,
    characterXp: 150,
    totalXp: 150,
    currentLevelXp: 150,
    xpToNextLevel: 200,
    xpProgressPercent: 75,
    round: 5,
    combatIndex: 1,
    totalKills: 1,
    totalXpGained: 50,
    potionsUsed: 1,
    createdAt: "2026-05-11T00:00:06.000Z",
    sequence: 6,
  } as AutoCombatRealtimeEvent;

  const afterDefeat = autoCombatRealtimeReducer(
    enqueueAndProcess(afterPotion, defeatEvent),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );

  assert.equal(afterDefeat.character?.totalXp, 150);
  assert.equal(afterDefeat.character?.currentLevelXp, 150);
  assert.equal(afterDefeat.character?.xpProgressPercent, 75);
  assert.equal(afterDefeat.displayTotals?.totalXpGained, 50);
});

test("overview canônico não antecipa EXP durante timeline visual pendente", () => {
  const pendingHit = makeHit(5, 10);
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    activeEvent: pendingHit,
    activeEventImpactApplied: true,
    character: {
      id: "char-1",
      name: "Sobrevivente",
      currentHp: 70,
      maxHp: 100,
      hpPercent: 70,
      level: 1,
      xp: 100,
      totalXp: 100,
      currentLevelXp: 100,
      xpToNextLevel: 200,
      xpProgressPercent: 50,
    },
  };

  const hydrated = autoCombatRealtimeReducer(state, {
    type: "HYDRATE_OVERVIEW",
    characterId: "char-1",
    overview: {
      character: {
        id: "char-1",
        name: "Sobrevivente",
        level: 1,
        xp: 150,
        totalXp: 150,
        currentHp: 90,
        maxHp: 100,
        currentLevelXp: 150,
        xpToNextLevel: 200,
        xpProgressPercent: 75,
      },
    } as never,
  });

  assert.equal(hydrated.character?.totalXp, 100);
  assert.equal(hydrated.character?.currentLevelXp, 100);
  assert.equal(hydrated.character?.xpProgressPercent, 50);
});

test("status canônico reconcilia totais quando não há timeline visual pendente", () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    character: {
      id: "char-1",
      name: "Sobrevivente",
      currentHp: 60,
      maxHp: 100,
      hpPercent: 60,
      level: 1,
      xp: 100,
      totalXp: 100,
      currentLevelXp: 100,
      xpToNextLevel: 200,
      xpProgressPercent: 50,
    },
    displayTotals: {
      sessionId: "session-1",
      totalKills: 0,
      totalCombats: 0,
      totalRounds: 4,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    },
  };

  const hydrated = autoCombatRealtimeReducer(state, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: {
      active: true,
      hasActiveAutoCombat: true,
      character: {
        id: "char-1",
        name: "Sobrevivente",
        level: 1,
        xp: 150,
        totalXp: 150,
        currentHp: 90,
        maxHp: 100,
        currentLevelXp: 150,
        xpToNextLevel: 200,
        xpProgressPercent: 75,
      },
      session: {
        id: "session-1",
        characterId: "char-1",
        status: "ACTIVE",
        currentRound: 5,
        currentCombatIndex: 2,
        totalCombatsResolved: 1,
        totalRoundsResolved: 5,
        totalXpGained: 50,
      },
      sessionSummary: {
        combat: {
          currentCombatIndex: 2,
          totalCombats: 1,
          totalRounds: 5,
        },
        mobs: { totalKills: 1 },
        progression: {
          totalXpGained: 50,
          baseXpGained: 45,
          premiumBonusXp: 5,
          premiumPotentialBonusXp: 0,
          premiumTotalXp: 50,
          isPremiumActive: true,
        },
      },
      currentMob: {
        id: "mob-2",
        name: "Zumbi Novo",
        currentHp: 100,
        maxHp: 100,
      },
    } as never,
  });

  assert.equal(hydrated.character?.totalXp, 150);
  assert.equal(hydrated.character?.currentLevelXp, 150);
  assert.equal(hydrated.character?.xpProgressPercent, 75);
  assert.equal(hydrated.displayTotals?.totalKills, 1);
  assert.equal(hydrated.displayTotals?.totalXpGained, 50);
  assert.equal(hydrated.displayTotals?.baseXpGained, 45);
  assert.equal(hydrated.displayTotals?.premiumBonusXp, 5);
});

test("MOB_DEFEATED soma Base e Premium sobre totais canônicos após F5", () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    totals: {
      sessionId: "session-1",
      currentCombatIndex: 16,
      totalKills: 15,
      totalCombats: 15,
      totalRounds: 60,
      totalXpGained: 75,
      baseXpGained: 66,
      premiumBonusXp: 9,
      premiumPotentialBonusXp: 0,
      premiumTotalXp: 75,
      isPremiumActive: true,
      totalLoot: 21,
      potionsUsed: 0,
    },
    displayTotals: null,
  };

  const defeatEvent = {
    characterId: "char-1",
    sessionId: "session-1",
    type: "MOB_DEFEATED",
    actor: "PLAYER",
    target: "MOB",
    mobId: "mob-16",
    mobName: "Zumbi",
    mobCurrentHp: 0,
    mobMaxHp: 100,
    characterCurrentHp: 90,
    characterMaxHp: 100,
    xpGained: 8,
    baseXpGained: 7,
    premiumBonusXp: 1,
    premiumPotentialBonusXp: 0,
    premiumTotalXp: 8,
    isPremiumActive: true,
    round: 61,
    combatIndex: 16,
    totalKills: 16,
    totalCombats: 16,
    totalRounds: 61,
    totalXpGained: 83,
    totalLoot: 21,
    potionsUsed: 0,
    createdAt: "2026-05-11T00:00:07.000Z",
    sequence: 61,
  } as AutoCombatRealtimeEvent;

  const afterDefeat = autoCombatRealtimeReducer(
    enqueueAndProcess(state, defeatEvent),
    { type: "APPLY_ACTIVE_EVENT_IMPACT" },
  );

  assert.equal(afterDefeat.displayTotals?.totalKills, 16);
  assert.equal(afterDefeat.displayTotals?.totalXpGained, 83);
  assert.equal(afterDefeat.displayTotals?.baseXpGained, 73);
  assert.equal(afterDefeat.displayTotals?.premiumBonusXp, 10);
  assert.equal(afterDefeat.displayTotals?.premiumTotalXp, 83);
});

test("PLAYER_DEFEATED encerra atomicamente toda a apresentação", () => {
  const queuedEvent = makeHit(2, 40);
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    isConnected: true,
    isJoined: true,
    eventQueue: [queuedEvent],
    activeEvent: makeHit(1, 70),
    activeEventImpactApplied: true,
    battleLogEvents: [makeHit(1, 70)],
    visual: { lastEventType: "PLAYER_HIT", updatedAt: Date.now() },
    totals: { sessionId: "session-1", totalKills: 3 },
    displayTotals: { sessionId: "session-1", totalKills: 3 },
    queuedEventKeys: ["queued-event"],
    processedEventKeys: ["processed-event"],
  };
  const event = {
    characterId: "char-1",
    sessionId: "session-1",
    type: "PLAYER_DEFEATED",
    actor: "MOB",
    target: "PLAYER",
    characterCurrentHp: 0,
    characterMaxHp: 100,
    sessionStatus: "DEFEATED",
    endReason: "PLAYER_DEFEATED",
    shouldRedirectToInfirmary: true,
    sequence: 3,
  } as AutoCombatRealtimeEvent;

  const defeated = autoCombatRealtimeReducer(state, {
    type: "TERMINATE_DEFEATED",
    characterId: "char-1",
    source: "event",
    event,
  });

  assert.equal(defeated.session?.status, "DEFEATED");
  assert.equal(defeated.session?.phase, "PLAYER_DEFEATED");
  assert.equal(defeated.character?.currentHp, 0);
  assert.equal(defeated.mob, null);
  assert.equal(defeated.visual, null);
  assert.equal(defeated.totals, null);
  assert.equal(defeated.displayTotals, null);
  assert.equal(defeated.activeEvent, null);
  assert.deepEqual(defeated.eventQueue, []);
  assert.deepEqual(defeated.battleLogEvents, []);
  assert.deepEqual(defeated.queuedEventKeys, []);
  assert.deepEqual(defeated.processedEventKeys, []);
  assert.equal(defeated.isJoined, false);
  assert.equal(defeated.isSynchronizing, false);
  assert.equal(defeated.terminalDefeat?.source, "event");
  assert.equal(defeated.terminalDefeat?.shouldRedirectToInfirmary, true);
});

test("snapshot DEFEATED preserva a contagem e não aguarda a fila visual", () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    eventQueue: [makeHit(2, 40)],
    activeEvent: makeHit(1, 70),
    activeEventImpactApplied: false,
  };

  const defeated = autoCombatRealtimeReducer(state, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: makeDefeatedStatus(7),
  });

  assert.equal(defeated.session?.status, "DEFEATED");
  assert.equal(defeated.terminalDefeat?.source, "status");
  assert.equal(defeated.terminalDefeat?.preservedTrackedEnemiesCount, 7);
  assert.equal(defeated.terminalDefeat?.shouldRedirectToInfirmary, true);
  assert.equal(defeated.activeEvent, null);
  assert.deepEqual(defeated.eventQueue, []);
});

test("cura confirmada pela enfermaria libera a navegação global", () => {
  const defeated = autoCombatRealtimeReducer(makeState(), {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: makeDefeatedStatus(5),
  });

  const recovered = autoCombatRealtimeReducer(defeated, {
    type: "HYDRATE_CHARACTER_HEALTH",
    characterId: "char-1",
    currentHp: 100,
    maxHp: 100,
    isDefeated: false,
  });

  assert.equal(recovered.character?.currentHp, 100);
  assert.equal(recovered.character?.maxHp, 100);
  assert.equal(recovered.terminalDefeat, null);
  assert.equal(recovered.status?.shouldRedirectToInfirmary, false);
});

test("snapshot ACTIVE antigo não reabre a sessão derrotada", () => {
  const defeated = autoCombatRealtimeReducer(makeState(), {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: makeDefeatedStatus(5),
  });
  const staleActiveStatus = {
    active: true,
    hasActiveAutoCombat: true,
    character: { id: "char-1", name: "Sobrevivente", currentHp: 100, maxHp: 100 },
    session: {
      id: "session-1",
      characterId: "char-1",
      status: "ACTIVE",
      phase: "COMBAT_ACTIVE",
    },
  } as never;

  const stale = autoCombatRealtimeReducer(defeated, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: staleActiveStatus,
  });

  assert.equal(stale.session?.status, "DEFEATED");
  assert.equal(stale.terminalDefeat?.shouldRedirectToInfirmary, true);

  const replacement = autoCombatRealtimeReducer(defeated, {
    type: "HYDRATE_STATUS",
    characterId: "char-1",
    status: {
      ...staleActiveStatus,
      session: { ...staleActiveStatus.session, id: "session-2" },
    },
  });

  assert.equal(replacement.session?.id, "session-2");
  assert.equal(replacement.session?.status, "ACTIVE");
  assert.equal(replacement.terminalDefeat, null);
});
