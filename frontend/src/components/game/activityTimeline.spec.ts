import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildActivityTimeline,
  getActivityTimelineCssAnimation,
  getActivityTimelineFrame,
  getActivityTimelineReconciliationDelayMs,
  isActivityTimelineReconciliationDue,
  reconcileActivityTimelineProviderState,
  type ActivityTimelineSnapshot,
} from './activityTimeline.ts';

function buildSnapshot(
  overrides: Partial<ActivityTimelineSnapshot> = {},
): ActivityTimelineSnapshot {
  return {
    activityInstanceId: 'gathering-1',
    cycleId: 'cycle-1',
    serverNow: '2026-08-23T15:00:01.000Z',
    startedAt: '2026-08-23T15:00:00.000Z',
    endsAt: '2026-08-23T15:00:03.000Z',
    durationMs: 3_000,
    direction: 'fill',
    version: 1,
    ...overrides,
  };
}

test('converte a ancora do servidor para o relogio monotono', () => {
  const timeline = buildActivityTimeline(buildSnapshot(), {
    monotonicNowMs: 10_000,
    wallClockNowMs: Date.parse('2026-08-23T15:00:05.000Z'),
    serverObservedAtMonotonicMs: 9_750,
  });

  assert.equal(timeline.startedAtMonotonicMs, 8_750);
  assert.equal(timeline.endsAtMonotonicMs, 11_750);
  assert.equal(timeline.observedAtMonotonicMs, 9_750);
});

test('usa o mesmo eixo monotono mesmo se o relogio civil mudar depois', () => {
  const timeline = buildActivityTimeline(buildSnapshot(), {
    monotonicNowMs: 5_000,
    wallClockNowMs: 500_000,
  });

  const firstFrame = getActivityTimelineFrame(timeline, 5_500);
  const laterFrame = getActivityTimelineFrame(timeline, 7_000);

  assert.equal(firstFrame.progressPercent, 50);
  assert.equal(laterFrame.progressPercent, 100);
});

test('calcula barras crescentes e decrescentes pela mesma timeline', () => {
  const clock = {
    monotonicNowMs: 10_000,
    wallClockNowMs: 500_000,
  };
  const fillTimeline = buildActivityTimeline(buildSnapshot(), clock);
  const drainTimeline = buildActivityTimeline(
    buildSnapshot({ direction: 'drain' }),
    clock,
  );

  assert.equal(getActivityTimelineFrame(fillTimeline, 10_500).fillPercent, 50);
  assert.equal(getActivityTimelineFrame(drainTimeline, 10_500).fillPercent, 50);
});

test('repete atividades ciclicas sem permanecer travado no fim', () => {
  const timeline = buildActivityTimeline(buildSnapshot(), {
    monotonicNowMs: 10_000,
    wallClockNowMs: 500_000,
  });

  const onceFrame = getActivityTimelineFrame(timeline, 12_750);
  const repeatingFrame = getActivityTimelineFrame(timeline, 12_750, {
    repeat: true,
  });
  const repeatingAnimation = getActivityTimelineCssAnimation(
    timeline,
    12_750,
    { repeat: true },
  );

  assert.equal(onceFrame.progressPercent, 100);
  assert.equal(repeatingFrame.progressPercent, 25);
  assert.equal(repeatingFrame.remainingMs, 2_250);
  assert.equal(repeatingFrame.isComplete, false);
  assert.equal(repeatingAnimation.currentScale, 0.25);
});

test('gera uma unica animacao CSS ancorada no ciclo', () => {
  const timeline = buildActivityTimeline(buildSnapshot(), {
    monotonicNowMs: 10_000,
    wallClockNowMs: 500_000,
  });
  const animation = getActivityTimelineCssAnimation(timeline, 10_500);

  assert.deepEqual(animation, {
    key: 'gathering-1:cycle-1:v1',
    durationMs: 3_000,
    delayMs: -1_500,
    fromScale: 0,
    toScale: 1,
    currentScale: 0.5,
  });
});

test('agenda uma única reconciliação após o prazo canônico', () => {
  const timeline = buildActivityTimeline(buildSnapshot(), {
    monotonicNowMs: 10_000,
    wallClockNowMs: 500_000,
  });

  assert.equal(getActivityTimelineReconciliationDelayMs(timeline, 10_500), 1_900);
  assert.equal(isActivityTimelineReconciliationDue(timeline, 12_399), false);
  assert.equal(isActivityTimelineReconciliationDue(timeline, 12_400), true);
});

test('preserva a mesma timeline para snapshots repetidos e ignora versoes antigas', () => {
  const clock = {
    monotonicNowMs: 10_000,
    wallClockNowMs: 500_000,
  };
  const initial = reconcileActivityTimelineProviderState(
    null,
    buildSnapshot({ version: 2 }),
    clock,
  );
  const repeated = reconcileActivityTimelineProviderState(
    initial,
    buildSnapshot({ version: 2, serverNow: '2026-08-23T15:00:02.000Z' }),
    { ...clock, monotonicNowMs: 11_000 },
  );
  const stale = reconcileActivityTimelineProviderState(
    repeated,
    buildSnapshot({ version: 1 }),
    { ...clock, monotonicNowMs: 12_000 },
  );

  assert.strictEqual(repeated, initial);
  assert.strictEqual(stale, initial);
  assert.strictEqual(repeated?.timeline, initial?.timeline);
});

test('substitui atomicamente a timeline quando a versao avanca', () => {
  const initial = reconcileActivityTimelineProviderState(
    null,
    buildSnapshot(),
    { monotonicNowMs: 10_000, wallClockNowMs: 500_000 },
  );
  const next = reconcileActivityTimelineProviderState(
    initial,
    buildSnapshot({
      cycleId: 'cycle-2',
      serverNow: '2026-08-23T15:00:04.000Z',
      startedAt: '2026-08-23T15:00:03.000Z',
      endsAt: '2026-08-23T15:00:06.000Z',
      version: 2,
    }),
    { monotonicNowMs: 13_000, wallClockNowMs: 503_000 },
  );

  assert.notStrictEqual(next, initial);
  assert.equal(next?.timeline.key, 'gathering-1:cycle-2:v2');
});

test('mantem o mesmo objeto visual em navegacao, F5 e snapshot repetido do socket', () => {
  const snapshot = buildSnapshot({
    activityInstanceId: 'hunt-batch-1',
    cycleId: 'session-1:hunt:8',
    version: 8,
  });
  const initial = reconcileActivityTimelineProviderState(null, snapshot, {
    monotonicNowMs: 10_000,
    wallClockNowMs: 500_000,
  });
  const afterNavigation = reconcileActivityTimelineProviderState(
    initial,
    snapshot,
    { monotonicNowMs: 11_000, wallClockNowMs: 501_000 },
  );
  const afterRestReload = reconcileActivityTimelineProviderState(
    afterNavigation,
    { ...snapshot, serverNow: '2026-08-23T15:00:02.000Z' },
    { monotonicNowMs: 12_000, wallClockNowMs: 502_000 },
  );
  const afterSocketReconnect = reconcileActivityTimelineProviderState(
    afterRestReload,
    snapshot,
    { monotonicNowMs: 13_000, wallClockNowMs: 503_000 },
  );

  assert.strictEqual(afterNavigation?.timeline, initial?.timeline);
  assert.strictEqual(afterRestReload?.timeline, initial?.timeline);
  assert.strictEqual(afterSocketReconnect?.timeline, initial?.timeline);
});

test('reconstroi o ciclo corrente apos alt-tab sem reproduzir ciclos antigos', () => {
  const initial = reconcileActivityTimelineProviderState(
    null,
    buildSnapshot({
      activityInstanceId: 'hunt-batch-1',
      cycleId: 'session-1:hunt:8',
      version: 8,
    }),
    { monotonicNowMs: 10_000, wallClockNowMs: 500_000 },
  );
  const afterVisibilityReturn = reconcileActivityTimelineProviderState(
    initial,
    buildSnapshot({
      activityInstanceId: 'hunt-batch-1',
      cycleId: 'session-1:hunt:12',
      serverNow: '2026-08-23T15:01:01.000Z',
      startedAt: '2026-08-23T15:01:00.000Z',
      endsAt: '2026-08-23T15:01:03.000Z',
      version: 12,
    }),
    { monotonicNowMs: 70_000, wallClockNowMs: 560_000 },
  );

  assert.equal(afterVisibilityReturn?.timeline.cycleId, 'session-1:hunt:12');
  assert.equal(
    getActivityTimelineFrame(afterVisibilityReturn!.timeline, 70_500)
      .fillPercent,
    50,
  );
});

test('rejeita snapshot com duracao divergente', () => {
  assert.throws(
    () =>
      buildActivityTimeline(buildSnapshot({ durationMs: 2_000 }), {
        monotonicNowMs: 10_000,
        wallClockNowMs: 500_000,
      }),
    /durationMs deve corresponder exatamente/,
  );
});
