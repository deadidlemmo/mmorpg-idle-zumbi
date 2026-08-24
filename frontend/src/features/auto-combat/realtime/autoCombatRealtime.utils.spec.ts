import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from '../types/auto-combat.types.ts';
import {
  AUTO_COMBAT_REALTIME_DEFEATED_EVENT_DELAY_MS,
  buildMobSpawnedEventFromStatus,
  buildMobStateFromStatus,
  buildMobStateFromRealtimeEvent,
  getRealtimeEventDelay,
  getRealtimeEventImpactDelay,
  getRealtimeEventPlaybackTiming,
} from './autoCombatRealtime.utils.ts';

function buildEvent(
  type: AutoCombatRealtimeEvent['type'],
): AutoCombatRealtimeEvent {
  return {
    type,
    actionStartedAt: '2026-08-21T12:00:00.000Z',
    nextActionAt: '2026-08-21T12:00:01.000Z',
  } as AutoCombatRealtimeEvent;
}

test('mantem a derrota visivel por mais de um segundo apos o impacto', () => {
  const event = buildEvent('MOB_DEFEATED');
  const eventDelay = getRealtimeEventDelay(event);
  const impactDelay = getRealtimeEventImpactDelay(event, eventDelay);

  assert.equal(eventDelay, AUTO_COMBAT_REALTIME_DEFEATED_EVENT_DELAY_MS);
  assert.ok(eventDelay - impactDelay >= 1_000);
});

test('nao atrasa a derrota por um ciclo visual local defasado', () => {
  const timing = getRealtimeEventPlaybackTiming({
    event: buildEvent('MOB_DEFEATED'),
  });

  assert.equal(timing.impactDelay, 160);
  assert.ok(timing.visibleAfterImpactDelay >= 1_000);
  assert.equal(
    timing.totalDelay,
    timing.impactDelay + timing.visibleAfterImpactDelay,
  );
});

test('libera o proximo mob sem acumular a animacao de derrota', () => {
  const timing = getRealtimeEventPlaybackTiming({
    event: buildEvent('MOB_DEFEATED'),
    nextEvent: buildEvent('MOB_SPAWNED'),
  });

  assert.equal(timing.impactDelay, 160);
  assert.ok(timing.visibleAfterImpactDelay >= 1_000);
  assert.equal(timing.totalDelay, AUTO_COMBAT_REALTIME_DEFEATED_EVENT_DELAY_MS);
});

test('preserva a leitura da derrota mesmo com hit e spawn enfileirados', () => {
  const killingHit = getRealtimeEventPlaybackTiming({
    event: buildEvent('PLAYER_HIT'),
    nextEvent: buildEvent('MOB_DEFEATED'),
  });
  const defeat = getRealtimeEventPlaybackTiming({
    event: buildEvent('MOB_DEFEATED'),
    nextEvent: buildEvent('MOB_SPAWNED'),
  });
  const spawn = getRealtimeEventPlaybackTiming({
    event: buildEvent('MOB_SPAWNED'),
    nextEvent: buildEvent('PLAYER_HIT'),
  });

  assert.ok(defeat.visibleAfterImpactDelay >= 1_000);
  assert.ok(killingHit.totalDelay + defeat.totalDelay + spawn.totalDelay < 2_000);
});

test('preserva o ritmo normal de impacto nos demais eventos', () => {
  const event = buildEvent('PLAYER_HIT');
  const eventDelay = getRealtimeEventDelay(event);

  assert.equal(eventDelay, 1_000);
  assert.equal(getRealtimeEventImpactDelay(event, eventDelay), 550);
});

test('reinicia a linha do tempo no timestamp do novo mob', () => {
  const cycleStartedAt = '2026-08-21T12:00:20.000Z';
  const mob = buildMobStateFromRealtimeEvent(
    {
      ...buildEvent('MOB_SPAWNED'),
      actionStartedAt: cycleStartedAt,
      serverTime: '2026-08-21T12:00:20.050Z',
      mobId: 'mob-novo',
      mobName: 'Mob novo',
      mobCurrentHp: 100,
      mobMaxHp: 100,
      battleProgressSeconds: 0,
      estimatedKillTimeSeconds: 15,
    },
    {
      id: 'mob-anterior',
      name: 'Mob anterior',
      currentHp: 0,
      maxHp: 100,
      battleProgress: {
        progressSeconds: 15,
        estimatedKillTimeSeconds: 15,
        cycleStartedAt: '2026-08-21T12:00:00.000Z',
      },
    },
  );

  assert.equal(mob?.battleProgress?.cycleStartedAt, cycleStartedAt);
  assert.equal(mob?.battleProgress?.progressSeconds, 0);
});

test('ignora o ultimo mob da batalha em snapshots da fase de caca', () => {
  const status = {
    active: true,
    hasActiveAutoCombat: true,
    phase: 'HUNTING',
    character: {
      id: 'char-1',
      currentHp: 100,
      maxHp: 100,
    },
    session: {
      id: 'session-1',
      characterId: 'char-1',
      status: 'ACTIVE',
      phase: 'HUNTING',
      currentCombatIndex: 3,
    },
    currentMob: {
      id: 'mob-anterior',
      name: 'Mob anterior',
      currentHp: 0,
      maxHp: 100,
    },
  } as AutoCombatStatusResponse;

  assert.equal(buildMobStateFromStatus(status), null);
  assert.equal(
    buildMobSpawnedEventFromStatus({
      status,
      session: status.session,
    }),
    null,
  );
});
