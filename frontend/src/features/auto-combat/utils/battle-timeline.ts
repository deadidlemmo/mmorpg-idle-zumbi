export type TimelineTimestamp = string | number | Date | null | undefined;

export type BattleTimelineSource = {
  cycleStartedAt?: TimelineTimestamp;
  cycleDurationMs?: number | string | null;
  cycleDurationSeconds?: number | string | null;
  progressSeconds?: number | string | null;
  estimatedKillTimeSeconds?: number | string | null;
  progressUpdatedAt?: TimelineTimestamp;
  serverNow?: TimelineTimestamp;
};

export type CycleProgress = {
  progress: number;
  progressPercent: number;
  elapsedMs: number;
  cycleElapsedMs: number;
  remainingMs: number;
  completedCycles: number;
  isComplete: boolean;
};

export type CountdownTimeline = {
  animationKey: string;
  durationSeconds: number;
  elapsedSeconds: number;
  progressPercent: number;
  remainingPercent: number;
};

export type SecondTickCycleProgress = {
  durationSeconds: number;
  elapsedSeconds: number;
  progressPercent: number;
  remainingPercent: number;
};

export type BattleTargetDisplayCounts = {
  total: number;
  remaining: number;
  defeated: number;
  snapshotRemaining: number;
  snapshotDefeated: number;
};

export type BattleBatchCountdown = {
  totalSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
};

export type HuntDisplayCounts = {
  found: number;
  remainingCapacity: number;
  projectedFinds: number;
  snapshotFound: number;
  snapshotRemainingCapacity: number;
  isLimitReached: boolean;
};

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(1, value));
}

export function getTimestampMs(value: TimelineTimestamp) {
  if (value instanceof Date) {
    const timestamp = value.getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getServerClientOffsetMs(
  serverNow: TimelineTimestamp,
  clientNowMs: number,
) {
  const serverNowMs = getTimestampMs(serverNow);

  return serverNowMs === null ? 0 : serverNowMs - clientNowMs;
}

export function getCycleProgress(params: {
  nowMs: number;
  cycleStartedAtMs: number;
  cycleDurationMs: number;
}): CycleProgress {
  const durationMs = Math.max(0, params.cycleDurationMs);

  if (!durationMs) {
    return {
      progress: 0,
      progressPercent: 0,
      elapsedMs: 0,
      cycleElapsedMs: 0,
      remainingMs: 0,
      completedCycles: 0,
      isComplete: false,
    };
  }

  const elapsedMs = Math.max(0, params.nowMs - params.cycleStartedAtMs);
  const progress = clamp01(elapsedMs / durationMs);

  return {
    progress,
    progressPercent: progress * 100,
    elapsedMs,
    cycleElapsedMs: Math.min(elapsedMs, durationMs),
    remainingMs: Math.max(0, durationMs - elapsedMs),
    completedCycles: Math.floor(elapsedMs / durationMs),
    isComplete: elapsedMs >= durationMs,
  };
}

export function getRepeatingCycleProgress(params: {
  nowMs: number;
  cycleStartedAtMs: number;
  cycleDurationMs: number;
}): CycleProgress {
  const durationMs = Math.max(0, params.cycleDurationMs);

  if (!durationMs) {
    return {
      progress: 0,
      progressPercent: 0,
      elapsedMs: 0,
      cycleElapsedMs: 0,
      remainingMs: 0,
      completedCycles: 0,
      isComplete: false,
    };
  }

  const elapsedMs = Math.max(0, params.nowMs - params.cycleStartedAtMs);
  const completedCycles = Math.floor(elapsedMs / durationMs);
  const currentCycleElapsedMs = elapsedMs % durationMs;
  const progress = currentCycleElapsedMs / durationMs;

  return {
    progress,
    progressPercent: progress * 100,
    elapsedMs,
    cycleElapsedMs: currentCycleElapsedMs,
    remainingMs: Math.max(0, durationMs - currentCycleElapsedMs),
    completedCycles,
    isComplete: completedCycles > 0 && currentCycleElapsedMs === 0,
  };
}

function getBattleTimelineBasis(params: {
  source?: BattleTimelineSource | null;
  nowMs: number;
  fallbackServerNow?: TimelineTimestamp;
  fallbackProgressUpdatedAt?: TimelineTimestamp;
}): { cycleStartedAtMs: number; cycleDurationMs: number } | null {
  const { source, nowMs, fallbackServerNow, fallbackProgressUpdatedAt } =
    params;

  if (!source) return null;

  const cycleDurationSeconds = toFiniteNumber(source.cycleDurationSeconds);
  const estimatedKillTimeSeconds = toFiniteNumber(
    source.estimatedKillTimeSeconds,
  );
  const rawDurationMs =
    toFiniteNumber(source.cycleDurationMs) ??
    (cycleDurationSeconds !== null ? cycleDurationSeconds * 1000 : null) ??
    (estimatedKillTimeSeconds !== null
      ? estimatedKillTimeSeconds * 1000
      : null);

  if (!rawDurationMs || rawDurationMs <= 0) {
    return null;
  }

  const durationMs = Math.max(1, Math.ceil(rawDurationMs / 1000)) * 1000;

  const progressUpdatedAtMs =
    getTimestampMs(source.progressUpdatedAt) ??
    getTimestampMs(source.serverNow) ??
    getTimestampMs(fallbackProgressUpdatedAt) ??
    getTimestampMs(fallbackServerNow) ??
    nowMs;

  const progressSeconds = toFiniteNumber(source.progressSeconds);
  const cycleStartedAtMs =
    getTimestampMs(source.cycleStartedAt) ??
    (progressSeconds !== null
      ? progressUpdatedAtMs - Math.max(0, progressSeconds) * 1000
      : null);

  if (cycleStartedAtMs === null) {
    return null;
  }

  return {
    cycleStartedAtMs,
    cycleDurationMs: durationMs,
  };
}

export function getBattleTimelineProgress(params: {
  source?: BattleTimelineSource | null;
  nowMs: number;
  fallbackServerNow?: TimelineTimestamp;
  fallbackProgressUpdatedAt?: TimelineTimestamp;
}):
  | (CycleProgress & { cycleStartedAtMs: number; cycleDurationMs: number })
  | null {
  const basis = getBattleTimelineBasis(params);

  if (!basis) return null;

  return {
    ...getCycleProgress({
      nowMs: params.nowMs,
      cycleStartedAtMs: basis.cycleStartedAtMs,
      cycleDurationMs: basis.cycleDurationMs,
    }),
    ...basis,
  };
}

export function getRepeatingBattleTimelineProgress(params: {
  source?: BattleTimelineSource | null;
  nowMs: number;
  fallbackServerNow?: TimelineTimestamp;
  fallbackProgressUpdatedAt?: TimelineTimestamp;
}):
  | (CycleProgress & { cycleStartedAtMs: number; cycleDurationMs: number })
  | null {
  const basis = getBattleTimelineBasis(params);

  if (!basis) return null;

  return {
    ...getRepeatingCycleProgress({
      nowMs: params.nowMs,
      cycleStartedAtMs: basis.cycleStartedAtMs,
      cycleDurationMs: basis.cycleDurationMs,
    }),
    ...basis,
  };
}

export function getCountdownTimeline(
  progress:
    | (CycleProgress & { cycleStartedAtMs: number; cycleDurationMs: number })
    | null
    | undefined,
): CountdownTimeline | null {
  if (!progress || progress.cycleDurationMs <= 0) {
    return null;
  }

  const durationSeconds = progress.cycleDurationMs / 1000;
  const elapsedSeconds = Math.max(
    0,
    Math.min(progress.cycleElapsedMs / 1000, durationSeconds),
  );
  const progressPercent = clamp01(elapsedSeconds / durationSeconds) * 100;

  return {
    animationKey: `${progress.cycleStartedAtMs}:${progress.cycleDurationMs}:${progress.completedCycles}`,
    durationSeconds,
    elapsedSeconds,
    progressPercent,
    remainingPercent: 100 - progressPercent,
  };
}

export function getSecondTickCycleProgress(
  progress:
    | (CycleProgress & { cycleStartedAtMs: number; cycleDurationMs: number })
    | null
    | undefined,
): SecondTickCycleProgress | null {
  if (!progress || progress.cycleDurationMs <= 0) {
    return null;
  }

  const durationSeconds = Math.max(
    1,
    Math.ceil(progress.cycleDurationMs / 1000),
  );
  const elapsedSeconds = Math.max(
    0,
    Math.min(Math.floor(progress.cycleElapsedMs / 1000), durationSeconds),
  );
  const progressPercent = clamp01(elapsedSeconds / durationSeconds) * 100;

  return {
    durationSeconds,
    elapsedSeconds,
    progressPercent,
    remainingPercent: 100 - progressPercent,
  };
}

export function getRepeatingSecondTickFillPercent(params: {
  cycleElapsedMs: number;
  cycleDurationMs: number;
  completedCycles?: number | null;
}) {
  const durationMs = Math.max(0, toFiniteNumber(params.cycleDurationMs) ?? 0);

  if (durationMs <= 0) return 0;

  const completedCycles = Math.max(
    0,
    Math.floor(toFiniteNumber(params.completedCycles) ?? 0),
  );
  const cycleElapsedMs = Math.max(
    0,
    Math.min(toFiniteNumber(params.cycleElapsedMs) ?? 0, durationMs),
  );

  if (completedCycles > 0 && cycleElapsedMs === 0) {
    return 100;
  }

  const durationSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const elapsedSeconds = Math.max(
    0,
    Math.min(Math.floor(cycleElapsedMs / 1000), durationSeconds),
  );

  return clamp01(elapsedSeconds / durationSeconds) * 100;
}

export function getNextSecondTickDelayMs(
  progress:
    | (CycleProgress & { cycleStartedAtMs: number; cycleDurationMs: number })
    | null
    | undefined,
) {
  if (!progress || progress.cycleDurationMs <= 0) {
    return null;
  }

  const cycleElapsedMs = Math.max(0, progress.cycleElapsedMs);
  const cycleDurationMs = Math.max(1, progress.cycleDurationMs);
  const nextSecondBoundaryMs = Math.min(
    cycleDurationMs,
    (Math.floor(cycleElapsedMs / 1000) + 1) * 1000,
  );
  const delayMs = nextSecondBoundaryMs - cycleElapsedMs;

  if (!Number.isFinite(delayMs)) {
    return null;
  }

  return Math.max(16, Math.min(1000, Math.ceil(delayMs)));
}

export function getBattleTargetDisplayCounts(params: {
  total: number;
  remaining: number;
  defeated?: number | null;
  completedCycles?: number | null;
}): BattleTargetDisplayCounts {
  const total = Math.max(0, Math.floor(toFiniteNumber(params.total) ?? 0));
  const snapshotRemaining = Math.max(
    0,
    Math.min(total, Math.floor(toFiniteNumber(params.remaining) ?? total)),
  );
  const defeatedFromRemaining = Math.max(0, total - snapshotRemaining);
  const explicitDefeated = Math.max(
    0,
    Math.floor(toFiniteNumber(params.defeated) ?? 0),
  );
  const snapshotDefeated = Math.max(
    0,
    Math.min(total, Math.max(defeatedFromRemaining, explicitDefeated)),
  );
  const completedCycles = Math.max(
    0,
    Math.floor(toFiniteNumber(params.completedCycles) ?? 0),
  );
  const defeated = Math.max(
    0,
    Math.min(total, snapshotDefeated + completedCycles),
  );

  return {
    total,
    remaining: Math.max(0, total - defeated),
    defeated,
    snapshotRemaining,
    snapshotDefeated,
  };
}

export function getStableBattleTargetDisplayCounts(params: {
  current: BattleTargetDisplayCounts;
  previous?: BattleTargetDisplayCounts | null;
}): BattleTargetDisplayCounts {
  const { current, previous } = params;

  if (!previous || current.total <= 0 || previous.total !== current.total) {
    return current;
  }

  const defeated = Math.max(
    current.defeated,
    Math.min(current.total, previous.defeated),
  );

  return {
    ...current,
    defeated,
    remaining: Math.max(0, current.total - defeated),
  };
}

export function getBattleBatchCountdown(params: {
  total: number;
  defeated: number;
  cycleDurationSeconds: number;
  currentCycleRemainingSeconds: number;
}): BattleBatchCountdown {
  const total = Math.max(0, Math.floor(toFiniteNumber(params.total) ?? 0));
  const defeated = Math.max(
    0,
    Math.min(total, Math.floor(toFiniteNumber(params.defeated) ?? 0)),
  );
  const cycleDurationSeconds = Math.max(
    0,
    Math.ceil(toFiniteNumber(params.cycleDurationSeconds) ?? 0),
  );
  const currentCycleRemainingSeconds = Math.max(
    0,
    Math.min(
      cycleDurationSeconds,
      Math.ceil(toFiniteNumber(params.currentCycleRemainingSeconds) ?? 0),
    ),
  );
  const totalSeconds = total * cycleDurationSeconds;

  if (total <= 0 || cycleDurationSeconds <= 0 || defeated >= total) {
    return {
      totalSeconds,
      remainingSeconds: 0,
      elapsedSeconds: totalSeconds,
    };
  }

  const remainingAfterCurrent = Math.max(0, total - defeated - 1);
  const remainingSeconds =
    remainingAfterCurrent * cycleDurationSeconds + currentCycleRemainingSeconds;

  return {
    totalSeconds,
    remainingSeconds,
    elapsedSeconds: Math.max(0, totalSeconds - remainingSeconds),
  };
}

export function getDisplayBattleBatchCountdown(params: {
  current: BattleBatchCountdown;
  previous?: BattleBatchCountdown | null;
  hasUnresolvedTargets?: boolean | null;
  fallbackRemainingSeconds?: number | null;
}): BattleBatchCountdown {
  const current = params.current;
  const previous = params.previous;

  if (
    current.totalSeconds <= 0 ||
    !params.hasUnresolvedTargets
  ) {
    return current;
  }

  if (
    previous &&
    previous.totalSeconds === current.totalSeconds &&
    previous.remainingSeconds > 0 &&
    current.remainingSeconds > previous.remainingSeconds
  ) {
    return previous;
  }

  if (current.remainingSeconds > 0) {
    return current;
  }

  if (
    previous &&
    previous.totalSeconds === current.totalSeconds &&
    previous.remainingSeconds > 0
  ) {
    return previous;
  }

  const fallbackRemainingSeconds = Math.max(
    0,
    Math.ceil(toFiniteNumber(params.fallbackRemainingSeconds) ?? 0),
  );

  if (fallbackRemainingSeconds <= 0) {
    return current;
  }

  const remainingSeconds = Math.min(
    current.totalSeconds,
    fallbackRemainingSeconds,
  );

  return {
    totalSeconds: current.totalSeconds,
    remainingSeconds,
    elapsedSeconds: Math.max(0, current.totalSeconds - remainingSeconds),
  };
}

export function getHuntDisplayCounts(params: {
  found: number;
  maxTrackedEnemies?: number | null;
  remainingCapacity?: number | null;
  completedCycles?: number | null;
  isLimitReached?: boolean | null;
}): HuntDisplayCounts {
  const snapshotFound = Math.max(
    0,
    Math.floor(toFiniteNumber(params.found) ?? 0),
  );
  const maxTrackedEnemies = Math.max(
    0,
    Math.floor(toFiniteNumber(params.maxTrackedEnemies) ?? 0),
  );
  const fallbackRemainingCapacity =
    maxTrackedEnemies > 0 ? Math.max(0, maxTrackedEnemies - snapshotFound) : 0;
  const snapshotRemainingCapacity = Math.max(
    0,
    Math.floor(
      toFiniteNumber(params.remainingCapacity) ?? fallbackRemainingCapacity,
    ),
  );
  const completedCycles = Math.max(
    0,
    Math.floor(toFiniteNumber(params.completedCycles) ?? 0),
  );
  const projectedFinds = params.isLimitReached
    ? 0
    : Math.min(snapshotRemainingCapacity, completedCycles);
  const rawFound = snapshotFound + projectedFinds;
  const found =
    maxTrackedEnemies > 0 ? Math.min(maxTrackedEnemies, rawFound) : rawFound;
  const remainingCapacity =
    maxTrackedEnemies > 0
      ? Math.max(0, maxTrackedEnemies - found)
      : Math.max(0, snapshotRemainingCapacity - projectedFinds);

  return {
    found,
    remainingCapacity,
    projectedFinds,
    snapshotFound,
    snapshotRemainingCapacity,
    isLimitReached:
      Boolean(params.isLimitReached) ||
      (maxTrackedEnemies > 0 && found >= maxTrackedEnemies),
  };
}
