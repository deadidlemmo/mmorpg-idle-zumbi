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

test('aplica dano visual somente no impacto da animação', () => {
  const event = makeHit(1, 70);
  const started = enqueueAndProcess(makeState(), event);

  assert.equal(started.activeEvent, event);
  assert.equal(started.activeEventImpactApplied, false);
  assert.equal(started.mob?.currentHp, 100);
  assert.equal(started.battleLogEvents.length, 0);

  const impacted = autoCombatRealtimeReducer(started, {
    type: 'APPLY_ACTIVE_EVENT_IMPACT',
  });

  assert.equal(impacted.activeEventImpactApplied, true);
  assert.equal(impacted.mob?.currentHp, 70);
  assert.equal(impacted.battleLogEvents.at(0), event);
});

test('snapshots/status durante animação não antecipam HP visual', () => {
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

  assert.equal(hydrated.mob?.currentHp, 100);
  assert.equal(hydrated.activeEventImpactApplied, false);
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
