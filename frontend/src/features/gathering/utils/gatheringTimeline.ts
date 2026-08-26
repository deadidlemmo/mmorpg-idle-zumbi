import {
  getActivityTimelineMonotonicNowMs,
  getActivityTimelineFrame,
  type ActivityTimeline,
  type ActivityTimelineSnapshot,
} from '../../../components/game/activityTimeline';
import type { GatheringStatusResponse } from '../types/gathering.types';

export const GATHERING_CYCLE_RECONCILIATION_GRACE_MS = 400;

export function getGatheringTimelineSnapshot(
  status: GatheringStatusResponse | null,
): ActivityTimelineSnapshot | null {
  if (!status || status.active !== true) return null;

  return (
    status.timeline ??
    status.session.timeline ??
    status.productionPreview.timeline ??
    null
  );
}

export function getGatheringTimelinePresentation(
  timeline: ActivityTimeline,
  monotonicNowMs?: number,
) {
  const frame = getActivityTimelineFrame(timeline, monotonicNowMs, {
    repeat: true,
  });

  return {
    progressPercent: frame.progressPercent,
    secondsToNextUnit: Math.ceil(frame.remainingMs / 1_000),
    timePerUnitSeconds: Math.ceil(timeline.durationMs / 1_000),
  };
}

export function getGatheringCycleReconciliationDelayMs(
  timeline: ActivityTimeline,
  monotonicNowMs = getActivityTimelineMonotonicNowMs(),
) {
  return Math.max(
    0,
    Math.ceil(
      timeline.endsAtMonotonicMs -
        monotonicNowMs +
        GATHERING_CYCLE_RECONCILIATION_GRACE_MS,
    ),
  );
}

export function isGatheringCycleResolutionDue(
  timeline: ActivityTimeline,
  monotonicNowMs = getActivityTimelineMonotonicNowMs(),
) {
  return monotonicNowMs >=
    timeline.endsAtMonotonicMs + GATHERING_CYCLE_RECONCILIATION_GRACE_MS;
}
