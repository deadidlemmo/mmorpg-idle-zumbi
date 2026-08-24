import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
} from '@prisma/client';

import {
  buildActivityTimelineSnapshot,
  type ActivityTimelineSnapshot,
} from '../../common/utils/activity-timeline.util';
import { buildHuntCycleKey } from './auto-combat-state-machine';

interface BuildAutoCombatHuntingTimelineParams {
  sessionId: string;
  huntBatchId?: string | null;
  status: AutoCombatSessionStatus;
  phase: AutoCombatSessionPhase;
  isLimitReached: boolean;
  foundEnemiesCount: number;
  serverNow: Date;
  lastFindAt: Date;
  nextFindAt: Date;
}

export function buildAutoCombatHuntingTimeline(
  params: BuildAutoCombatHuntingTimelineParams,
): ActivityTimelineSnapshot | null {
  if (
    params.status !== AutoCombatSessionStatus.ACTIVE ||
    params.phase !== AutoCombatSessionPhase.HUNTING ||
    params.isLimitReached
  ) {
    return null;
  }

  const startedAtMs = params.lastFindAt.getTime();
  const endsAtMs = params.nextFindAt.getTime();
  const durationMs = endsAtMs - startedAtMs;

  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(endsAtMs) ||
    !Number.isInteger(durationMs) ||
    durationMs <= 0
  ) {
    return null;
  }

  const cycleVersion = Math.max(
    1,
    Math.floor(Number(params.foundEnemiesCount) || 0) + 1,
  );

  return buildActivityTimelineSnapshot({
    activityInstanceId: params.huntBatchId ?? params.sessionId,
    cycleId: buildHuntCycleKey(params.sessionId, cycleVersion),
    serverNow: params.serverNow,
    startedAt: params.lastFindAt,
    endsAt: params.nextFindAt,
    durationMs,
    direction: 'fill',
    version: cycleVersion,
  });
}
