import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAutoCombatHuntingTimelineSnapshot,
  isAutoCombatHuntingTimelineEnabled,
  resolveAutoCombatHuntingTimelineRollout,
} from './hunting-timeline';

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
