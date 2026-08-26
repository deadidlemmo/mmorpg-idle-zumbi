import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActivityTimelineSnapshot } from '../../../components/game/activityTimeline';
import { buildActivityTimeline } from '../../../components/game/activityTimeline';
import type { GatheringStatusResponse } from '../types/gathering.types';
import {
  GATHERING_CYCLE_RECONCILIATION_GRACE_MS,
  getGatheringCycleReconciliationDelayMs,
  getGatheringTimelinePresentation,
  getGatheringTimelineSnapshot,
  isGatheringCycleResolutionDue,
} from './gatheringTimeline';

function buildTimeline(version: number): ActivityTimelineSnapshot {
  return {
    activityInstanceId: 'gathering-session-1',
    cycleId: `gathering-session-1:gathering:${version}`,
    serverNow: '2026-08-26T12:00:05.000Z',
    startedAt: '2026-08-26T12:00:00.000Z',
    endsAt: '2026-08-26T12:00:40.000Z',
    durationMs: 40_000,
    direction: 'fill',
    version,
  };
}

function buildStatus(
  timeline: ActivityTimelineSnapshot,
): GatheringStatusResponse {
  return {
    active: true,
    timeline,
    session: {
      id: 'gathering-session-1',
      status: 'ACTIVE',
      origin: 'COLETA',
      startedAt: '2026-08-26T12:00:00.000Z',
      timeline,
    },
    productionPreview: {
      elapsedSeconds: 5,
      elapsedHours: 0,
      ratePerHour: 90,
      estimatedQuantityToCollect: 0,
      currentProgressRemainder: 0,
      estimatedNewProgressRemainder: 0.125,
      timeline,
    },
  };
}

test('preserva a mesma referencia canonica do status para os dois cards', () => {
  const timeline = buildTimeline(1);

  assert.strictEqual(
    getGatheringTimelineSnapshot(buildStatus(timeline)),
    timeline,
  );
});

test('aceita o snapshot da sessao em respostas de compatibilidade', () => {
  const timeline = buildTimeline(2);
  const status = buildStatus(timeline);
  delete status.timeline;

  assert.strictEqual(getGatheringTimelineSnapshot(status), timeline);
});

test('limpa a timeline quando nao existe gathering ativo', () => {
  assert.equal(
    getGatheringTimelineSnapshot({
      active: false,
      message: 'Nenhum gathering ativo.',
    }),
    null,
  );
});

test('deriva percentual e contador da mesma timeline monotônica', () => {
  const timeline = buildActivityTimeline(buildTimeline(3), {
    monotonicNowMs: 5_000,
    wallClockNowMs: Date.parse('2026-08-26T12:00:05.000Z'),
  });

  assert.deepEqual(getGatheringTimelinePresentation(timeline, 20_000), {
    progressPercent: 50,
    secondsToNextUnit: 20,
    timePerUnitSeconds: 40,
  });
});

test('inicia o ciclo visual seguinte enquanto aguarda a reconciliacao', () => {
  const timeline = buildActivityTimeline(buildTimeline(4), {
    monotonicNowMs: 5_000,
    wallClockNowMs: Date.parse('2026-08-26T12:00:05.000Z'),
  });

  assert.deepEqual(getGatheringTimelinePresentation(timeline, 45_000), {
    progressPercent: 12.5,
    secondsToNextUnit: 35,
    timePerUnitSeconds: 40,
  });
});

test('agenda a reconciliacao logo apos o prazo canonico do ciclo', () => {
  const timeline = buildActivityTimeline(buildTimeline(5), {
    monotonicNowMs: 5_000,
    wallClockNowMs: Date.parse('2026-08-26T12:00:05.000Z'),
  });

  assert.equal(
    getGatheringCycleReconciliationDelayMs(timeline, 39_750),
    250 + GATHERING_CYCLE_RECONCILIATION_GRACE_MS,
  );
  assert.equal(
    isGatheringCycleResolutionDue(
      timeline,
      40_000 + GATHERING_CYCLE_RECONCILIATION_GRACE_MS - 1,
    ),
    false,
  );
  assert.equal(
    isGatheringCycleResolutionDue(
      timeline,
      40_000 + GATHERING_CYCLE_RECONCILIATION_GRACE_MS,
    ),
    true,
  );
});

test('reconcilia imediatamente ao retornar depois do fim do ciclo', () => {
  const timeline = buildActivityTimeline(buildTimeline(6), {
    monotonicNowMs: 5_000,
    wallClockNowMs: Date.parse('2026-08-26T12:00:05.000Z'),
  });

  assert.equal(
    getGatheringCycleReconciliationDelayMs(timeline, 60_000),
    0,
  );
});
