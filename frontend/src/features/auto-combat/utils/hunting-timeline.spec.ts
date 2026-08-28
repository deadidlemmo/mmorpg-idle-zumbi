import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAutoCombatHuntingCountdown,
  formatAutoCombatHuntingCountdownClock,
  getAutoCombatHuntingTimelineSnapshot,
  isAutoCombatHuntingTimelineEnabled,
  resolveAutoCombatHuntingCycleDurationMs,
  resolveAutoCombatHuntingTimelineRollout,
} from './hunting-timeline';

test('preserva a duracao fracionada do rastreio aplicado pelo pet', () => {
  assert.equal(
    resolveAutoCombatHuntingCycleDurationMs({
      lastFindAtMs: Date.parse('2026-08-28T12:00:00.000Z'),
      nextFindAtMs: Date.parse('2026-08-28T12:00:14.550Z'),
      secondsPerFind: 15,
    }),
    14_550,
  );
  assert.equal(
    resolveAutoCombatHuntingCycleDurationMs({ secondsPerFind: 13.875 }),
    13_875,
  );
  assert.equal(
    resolveAutoCombatHuntingCycleDurationMs({
      lastFindAtMs: null,
      nextFindAtMs: Date.parse('2026-08-28T12:00:14.550Z'),
      secondsPerFind: 14.55,
    }),
    14_550,
  );
});

test('exibe a contagem da caca com precisao de milissegundos', () => {
  assert.equal(formatAutoCombatHuntingCountdown(13_875), '13,875s');
  assert.equal(formatAutoCombatHuntingCountdownClock(13_875), '0:13,875');
  assert.equal(formatAutoCombatHuntingCountdownClock(61_005), '1:01,005');
  assert.equal(formatAutoCombatHuntingCountdown(null), '--');
});

test('mantem o rollout da timeline de caca restrito ao admin por padrao', () => {
  assert.equal(resolveAutoCombatHuntingTimelineRollout(undefined), 'admin');
  assert.equal(
    isAutoCombatHuntingTimelineEnabled({ userRole: 'ADMIN' }),
    true,
  );
  assert.equal(
    isAutoCombatHuntingTimelineEnabled({ userRole: 'PLAYER' }),
    false,
  );
});

test('permite liberar para todos ou desligar sem alterar codigo', () => {
  assert.equal(
    isAutoCombatHuntingTimelineEnabled({
      flagValue: 'all',
      userRole: 'PLAYER',
    }),
    true,
  );
  assert.equal(
    isAutoCombatHuntingTimelineEnabled({
      flagValue: 'off',
      userRole: 'ADMIN',
    }),
    false,
  );
});

test('extrai o mesmo snapshot canonico recebido por REST ou WebSocket', () => {
  const timeline = {
    activityInstanceId: 'hunt-batch-1',
    cycleId: 'session-1:hunt:4',
    serverNow: '2026-08-23T12:00:02.000Z',
    startedAt: '2026-08-23T12:00:00.000Z',
    endsAt: '2026-08-23T12:00:15.000Z',
    durationMs: 15_000,
    direction: 'fill' as const,
    version: 4,
  };

  assert.strictEqual(
    getAutoCombatHuntingTimelineSnapshot({ hunting: { timeline } }),
    timeline,
  );
});
