import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoCombatRealtimeReducer,
  initialAutoCombatRealtimeState,
  type AutoCombatRealtimeState,
} from './autoCombatRealtime.reducer';
import type { AutoCombatRealtimeEvent } from '../types/auto-combat.types';

function makeState(): AutoCombatRealtimeState {
  return {
    ...initialAutoCombatRealtimeState,
    characterId: 'char-1',
    hasLoadedOnce: true,
    session: {
      id: 'session-1',
      characterId: 'char-1',
      status: 'ACTIVE',
      currentRound: 1,
      currentCombatIndex: 1,
    },
    character: {
      id: 'char-1',
      name: 'Sobrevivente',
      currentHp: 100,
      maxHp: 100,
      hpPercent: 100,
    },
    mob: {
      id: 'mob-1',
      name: 'Zumbi',
      currentHp: 100,
      maxHp: 100,
      hpPercent: 100,
    },
  };
}

function makeHit(sequence: number, mobCurrentHp: number): AutoCombatRealtimeEvent {
  return {
    characterId: 'char-1',
    sessionId: 'session-1',
    type: 'PLAYER_HIT',
    actor: 'PLAYER',
    target: 'MOB',
    mobId: 'mob-1',
    mobName: 'Zumbi',
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
    type: 'ENQUEUE_EVENT',
    characterId: 'char-1',
    event,
  });

  return autoCombatRealtimeReducer(queued, {
    type: 'PROCESS_NEXT_EVENT',
  });
}

test('processa dano visual junto com o evento ativo', () => {
  const event = makeHit(1, 70);
  const started = enqueueAndProcess(makeState(), event);

  assert.equal(started.activeEvent, event);
  assert.equal(started.activeEventImpactApplied, true);
  assert.equal(started.mob?.currentHp, 70);
  assert.equal(started.battleLogEvents.at(0), event);
});

test('status durante evento ativo não faz rollback do HP visual', () => {
  const started = enqueueAndProcess(makeState(), makeHit(1, 70));

  const hydrated = autoCombatRealtimeReducer(started, {
    type: 'HYDRATE_STATUS',
    characterId: 'char-1',
    status: {
      active: true,
      hasActiveAutoCombat: true,
      character: { id: 'char-1', currentHp: 100, maxHp: 100 },
      session: {
        id: 'session-1',
        characterId: 'char-1',
        status: 'ACTIVE',
        currentRound: 1,
        currentCombatIndex: 1,
      },
      currentMob: {
        id: 'mob-1',
        name: 'Zumbi',
        currentHp: 70,
        maxHp: 100,
      },
    } as never,
  });

  assert.equal(hydrated.mob?.currentHp, 70);
  assert.equal(hydrated.activeEventImpactApplied, true);
});

test('múltiplas ações em autocombat avançam em sequência monotônica', () => {
  const firstImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(makeState(), makeHit(1, 70)),
    { type: 'APPLY_ACTIVE_EVENT_IMPACT' },
  );
  const firstCleared = autoCombatRealtimeReducer(firstImpact, {
    type: 'CLEAR_ACTIVE_EVENT',
  });

  const secondImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(firstCleared, makeHit(2, 30)),
    { type: 'APPLY_ACTIVE_EVENT_IMPACT' },
  );

  assert.equal(secondImpact.mob?.currentHp, 30);
  assert.deepEqual(
    secondImpact.battleLogEvents.map((event) => (event as { sequence?: number }).sequence),
    [2, 1],
  );
});

test('eventos atrasados não reordenam nem restauram estado antigo', () => {
  const firstImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(makeState(), makeHit(1, 70)),
    { type: 'APPLY_ACTIVE_EVENT_IMPACT' },
  );
  const firstCleared = autoCombatRealtimeReducer(firstImpact, {
    type: 'CLEAR_ACTIVE_EVENT',
  });
  const secondImpact = autoCombatRealtimeReducer(
    enqueueAndProcess(firstCleared, makeHit(2, 30)),
    { type: 'APPLY_ACTIVE_EVENT_IMPACT' },
  );

  const restored = autoCombatRealtimeReducer(secondImpact, {
    type: 'HYDRATE_RECENT_EVENTS',
    characterId: 'char-1',
    sessionId: 'session-1',
    events: [makeHit(1, 70)],
    applySnapshot: true,
  });

  assert.equal(restored.mob?.currentHp, 30);
  assert.deepEqual(
    restored.battleLogEvents.map((event) => (event as { sequence?: number }).sequence),
    [2, 1],
  );
});

test('status canônico não antecipa EXP antes do MOB_DEFEATED visual', () => {
  const pendingHit = makeHit(4, 10);
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    activeEvent: pendingHit,
    activeEventImpactApplied: true,
    character: {
      id: 'char-1',
      name: 'Sobrevivente',
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
      sessionId: 'session-1',
      totalKills: 0,
      totalCombats: 0,
      totalRounds: 4,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    },
  };

  const hydrated = autoCombatRealtimeReducer(state, {
    type: 'HYDRATE_STATUS',
    characterId: 'char-1',
    status: {
      active: true,
      hasActiveAutoCombat: true,
      character: {
        id: 'char-1',
        name: 'Sobrevivente',
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
        id: 'session-1',
        characterId: 'char-1',
        status: 'ACTIVE',
        currentRound: 5,
        currentCombatIndex: 1,
        totalCombatsResolved: 1,
        totalRoundsResolved: 5,
        totalXpGained: 50,
      },
      currentMob: {
        id: 'mob-1',
        name: 'Zumbi',
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

test('POTION_USED não herda EXP canônica pendente de status antes do abate', () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    character: {
      id: 'char-1',
      name: 'Sobrevivente',
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
      sessionId: 'session-1',
      totalKills: 1,
      totalCombats: 1,
      totalRounds: 5,
      totalXpGained: 50,
      totalLoot: 0,
      potionsUsed: 1,
    },
    displayTotals: {
      sessionId: 'session-1',
      totalKills: 0,
      totalCombats: 0,
      totalRounds: 4,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    },
  };

  const potionEvent = {
    characterId: 'char-1',
    sessionId: 'session-1',
    type: 'POTION_USED',
    actor: 'PLAYER',
    target: 'PLAYER',
    mobId: 'mob-1',
    mobName: 'Zumbi',
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
    createdAt: '2026-05-11T00:00:05.000Z',
    sequence: 5,
  } as AutoCombatRealtimeEvent;

  const afterPotion = autoCombatRealtimeReducer(
    enqueueAndProcess(state, potionEvent),
    { type: 'CLEAR_ACTIVE_EVENT' },
  );

  assert.equal(afterPotion.character?.totalXp, 100);
  assert.equal(afterPotion.character?.currentLevelXp, 100);
  assert.equal(afterPotion.character?.xpProgressPercent, 50);
  assert.equal(afterPotion.displayTotals?.totalXpGained, 0);

  const defeatEvent = {
    characterId: 'char-1',
    sessionId: 'session-1',
    type: 'MOB_DEFEATED',
    actor: 'PLAYER',
    target: 'MOB',
    mobId: 'mob-1',
    mobName: 'Zumbi',
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
    createdAt: '2026-05-11T00:00:06.000Z',
    sequence: 6,
  } as AutoCombatRealtimeEvent;

  const afterDefeat = enqueueAndProcess(afterPotion, defeatEvent);

  assert.equal(afterDefeat.character?.totalXp, 150);
  assert.equal(afterDefeat.character?.currentLevelXp, 150);
  assert.equal(afterDefeat.character?.xpProgressPercent, 75);
  assert.equal(afterDefeat.displayTotals?.totalXpGained, 50);
});

test('overview canônico não antecipa EXP durante timeline visual pendente', () => {
  const pendingHit = makeHit(5, 10);
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    activeEvent: pendingHit,
    activeEventImpactApplied: true,
    character: {
      id: 'char-1',
      name: 'Sobrevivente',
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
    type: 'HYDRATE_OVERVIEW',
    characterId: 'char-1',
    overview: {
      character: {
        id: 'char-1',
        name: 'Sobrevivente',
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

test('descanso automatico pode atualizar HP visual em tempo real', () => {
  const damagedState: AutoCombatRealtimeState = {
    ...makeState(),
    character: {
      id: 'char-1',
      name: 'Sobrevivente',
      currentHp: 45,
      maxHp: 100,
      hpPercent: 45,
    },
  };

  const restEvent = {
    characterId: 'char-1',
    sessionId: 'session-1',
    type: 'AUTO_REST',
    actor: 'SYSTEM',
    target: 'PLAYER',
    mobId: 'mob-1',
    mobName: 'Zumbi',
    mobCurrentHp: 100,
    mobMaxHp: 100,
    characterCurrentHp: 52,
    characterMaxHp: 100,
    healedAmount: 7,
    round: 1,
    combatIndex: 1,
    createdAt: '2026-05-11T00:00:02.000Z',
    sequence: 2,
  } as AutoCombatRealtimeEvent;

  const rested = enqueueAndProcess(damagedState, restEvent);

  assert.equal(rested.character?.currentHp, 52);
  assert.equal(rested.character?.hpPercent, 52);
  assert.equal(rested.activeEvent, restEvent);
});

test('status canônico reconcilia totais quando não há timeline visual pendente', () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    character: {
      id: 'char-1',
      name: 'Sobrevivente',
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
      sessionId: 'session-1',
      totalKills: 0,
      totalCombats: 0,
      totalRounds: 4,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    },
  };

  const hydrated = autoCombatRealtimeReducer(state, {
    type: 'HYDRATE_STATUS',
    characterId: 'char-1',
    status: {
      active: true,
      hasActiveAutoCombat: true,
      character: {
        id: 'char-1',
        name: 'Sobrevivente',
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
        id: 'session-1',
        characterId: 'char-1',
        status: 'ACTIVE',
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
        id: 'mob-2',
        name: 'Zumbi Novo',
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

test('MOB_DEFEATED soma Base e Premium sobre totais canônicos após F5', () => {
  const state: AutoCombatRealtimeState = {
    ...makeState(),
    totals: {
      sessionId: 'session-1',
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
    characterId: 'char-1',
    sessionId: 'session-1',
    type: 'MOB_DEFEATED',
    actor: 'PLAYER',
    target: 'MOB',
    mobId: 'mob-16',
    mobName: 'Zumbi',
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
    createdAt: '2026-05-11T00:00:07.000Z',
    sequence: 61,
  } as AutoCombatRealtimeEvent;

  const afterDefeat = enqueueAndProcess(state, defeatEvent);

  assert.equal(afterDefeat.displayTotals?.totalKills, 16);
  assert.equal(afterDefeat.displayTotals?.totalXpGained, 83);
  assert.equal(afterDefeat.displayTotals?.baseXpGained, 73);
  assert.equal(afterDefeat.displayTotals?.premiumBonusXp, 10);
  assert.equal(afterDefeat.displayTotals?.premiumTotalXp, 83);
});
