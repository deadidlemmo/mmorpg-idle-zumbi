import {
  buildActivityTimelineSnapshot,
  type ActivityTimelineSnapshot,
} from '../../common/utils/activity-timeline.util';

export const MIN_GATHERING_CYCLE_DURATION_MS = 1_000;

export type GatheringCycleState = {
  startedAt: Date;
  endsAt: Date;
  durationMs: number;
  version: number;
};

export type GatheringCycleResolution = {
  quantity: number;
  progressRemainder: number;
  elapsedMs: number;
  wasIdleCapped: boolean;
  cycle: GatheringCycleState;
};

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999_999, value));
}

function normalizePositiveInteger(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} deve ser positivo.`);
  }

  return Math.max(1, Math.ceil(value));
}

function normalizeTimestamp(value: Date, field: string) {
  const timestamp = value.getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} deve ser uma data valida.`);
  }

  return timestamp;
}

export function getGatheringCycleDurationMs(
  ratePerHour: number,
  minimumDurationMs = MIN_GATHERING_CYCLE_DURATION_MS,
) {
  if (!Number.isFinite(ratePerHour) || ratePerHour <= 0) {
    throw new Error('ratePerHour deve ser positivo.');
  }

  const minimum = normalizePositiveInteger(
    minimumDurationMs,
    'minimumDurationMs',
  );

  return Math.max(minimum, Math.ceil(3_600_000 / ratePerHour));
}

export function getGatheringRatePerHour(cycleDurationMs: number) {
  const durationMs = normalizePositiveInteger(
    cycleDurationMs,
    'cycleDurationMs',
  );

  return Number((3_600_000 / durationMs).toFixed(4));
}

export function createGatheringCycleFromProgress(params: {
  anchorAt: Date;
  durationMs: number;
  progressRemainder: number;
  version: number;
}): GatheringCycleState {
  const anchorAtMs = normalizeTimestamp(params.anchorAt, 'anchorAt');
  const durationMs = normalizePositiveInteger(params.durationMs, 'durationMs');
  const version = normalizePositiveInteger(params.version, 'version');
  const elapsedMs = Math.min(
    durationMs - 1,
    Math.floor(durationMs * clampProgress(params.progressRemainder)),
  );
  const startedAtMs = anchorAtMs - elapsedMs;

  return {
    startedAt: new Date(startedAtMs),
    endsAt: new Date(startedAtMs + durationMs),
    durationMs,
    version,
  };
}

export function resolveGatheringCycle(params: {
  serverNow: Date;
  lastResolvedAt: Date;
  idleProgressLimitSeconds: number;
  currentCycle: GatheringCycleState;
  nextCycleDurationMs: number;
}): GatheringCycleResolution {
  const serverNowMs = normalizeTimestamp(params.serverNow, 'serverNow');
  const lastResolvedAtMs = normalizeTimestamp(
    params.lastResolvedAt,
    'lastResolvedAt',
  );
  const cycleStartedAtMs = normalizeTimestamp(
    params.currentCycle.startedAt,
    'cycleStartedAt',
  );
  const cycleEndsAtMs = normalizeTimestamp(
    params.currentCycle.endsAt,
    'cycleEndsAt',
  );
  const cycleDurationMs = normalizePositiveInteger(
    params.currentCycle.durationMs,
    'cycleDurationMs',
  );
  const nextCycleDurationMs = normalizePositiveInteger(
    params.nextCycleDurationMs,
    'nextCycleDurationMs',
  );
  const version = normalizePositiveInteger(
    params.currentCycle.version,
    'cycleVersion',
  );

  if (cycleEndsAtMs - cycleStartedAtMs !== cycleDurationMs) {
    throw new Error(
      'O intervalo do ciclo deve corresponder a cycleDurationMs.',
    );
  }

  const idleLimitMs = Math.max(
    0,
    Math.floor(Number(params.idleProgressLimitSeconds) * 1_000),
  );
  const processingNowMs = Math.min(serverNowMs, lastResolvedAtMs + idleLimitMs);
  const elapsedMs = Math.max(0, processingNowMs - lastResolvedAtMs);
  const wasIdleCapped = processingNowMs < serverNowMs;

  if (processingNowMs < cycleEndsAtMs) {
    return {
      quantity: 0,
      progressRemainder: clampProgress(
        (processingNowMs - cycleStartedAtMs) / cycleDurationMs,
      ),
      elapsedMs,
      wasIdleCapped,
      cycle: {
        startedAt: new Date(cycleStartedAtMs),
        endsAt: new Date(cycleEndsAtMs),
        durationMs: cycleDurationMs,
        version,
      },
    };
  }

  const elapsedAfterFirstCycleMs = Math.max(0, processingNowMs - cycleEndsAtMs);
  const additionalQuantity = Math.floor(
    elapsedAfterFirstCycleMs / nextCycleDurationMs,
  );
  const quantity = 1 + additionalQuantity;
  const remainderMs =
    elapsedAfterFirstCycleMs - additionalQuantity * nextCycleDurationMs;
  const progressRemainder = clampProgress(remainderMs / nextCycleDurationMs);
  const naturalCycleStartedAtMs =
    cycleEndsAtMs + additionalQuantity * nextCycleDurationMs;
  const nextCycleStartedAtMs = wasIdleCapped
    ? serverNowMs - remainderMs
    : naturalCycleStartedAtMs;

  return {
    quantity,
    progressRemainder,
    elapsedMs,
    wasIdleCapped,
    cycle: {
      startedAt: new Date(nextCycleStartedAtMs),
      endsAt: new Date(nextCycleStartedAtMs + nextCycleDurationMs),
      durationMs: nextCycleDurationMs,
      version: version + quantity,
    },
  };
}

export function buildGatheringTimeline(params: {
  active: boolean;
  sessionId: string;
  serverNow: Date;
  cycle: GatheringCycleState;
}): ActivityTimelineSnapshot | null {
  if (!params.active) return null;

  return buildActivityTimelineSnapshot({
    activityInstanceId: params.sessionId,
    cycleId: `${params.sessionId}:gathering:${params.cycle.version}`,
    serverNow: params.serverNow,
    startedAt: params.cycle.startedAt,
    endsAt: params.cycle.endsAt,
    durationMs: params.cycle.durationMs,
    direction: 'fill',
    version: params.cycle.version,
  });
}
