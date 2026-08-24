export type ActivityTimelineDirection = 'fill' | 'drain';

export interface ActivityTimelineSnapshot {
  activityInstanceId: string;
  cycleId: string;
  serverNow: string;
  startedAt: string;
  endsAt: string;
  durationMs: number;
  direction: ActivityTimelineDirection;
  version: number;
}

export interface ActivityTimelineClockSample {
  monotonicNowMs: number;
  wallClockNowMs: number;
  serverObservedAtMonotonicMs?: number | null;
}

export interface ActivityTimeline {
  key: string;
  snapshot: ActivityTimelineSnapshot;
  activityInstanceId: string;
  cycleId: string;
  version: number;
  direction: ActivityTimelineDirection;
  durationMs: number;
  serverNowMs: number;
  startedAtServerMs: number;
  endsAtServerMs: number;
  startedAtMonotonicMs: number;
  endsAtMonotonicMs: number;
  observedAtMonotonicMs: number;
  serverClockOffsetMs: number;
}

export interface ActivityTimelineFrame {
  elapsedMs: number;
  remainingMs: number;
  progress: number;
  progressPercent: number;
  fillScale: number;
  fillPercent: number;
  isPending: boolean;
  isComplete: boolean;
}

export interface ActivityTimelineCssAnimation {
  key: string;
  durationMs: number;
  delayMs: number;
  fromScale: number;
  toScale: number;
  currentScale: number;
}

export interface ActivityTimelineProviderState {
  snapshot: ActivityTimelineSnapshot;
  timeline: ActivityTimeline;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeIdentifier(value: string, field: string) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new Error(`${field} deve ser informado.`);
  }

  return normalized;
}

function normalizeTimestamp(value: string, field: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} deve ser uma data valida.`);
  }

  return timestamp;
}

function normalizeClockSample(clock: ActivityTimelineClockSample) {
  if (
    !Number.isFinite(clock.monotonicNowMs) ||
    !Number.isFinite(clock.wallClockNowMs)
  ) {
    throw new Error('A amostra de relogio deve conter valores finitos.');
  }

  const observedAtMonotonicMs =
    clock.serverObservedAtMonotonicMs === null ||
    clock.serverObservedAtMonotonicMs === undefined
      ? clock.monotonicNowMs
      : clock.serverObservedAtMonotonicMs;

  if (
    !Number.isFinite(observedAtMonotonicMs) ||
    observedAtMonotonicMs > clock.monotonicNowMs
  ) {
    throw new Error('serverObservedAtMonotonicMs deve ser uma ancora valida.');
  }

  return {
    ...clock,
    observedAtMonotonicMs,
  };
}

export function getActivityTimelineMonotonicNowMs() {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now();
  }

  return Date.now();
}

export function createActivityTimelineClockSample(params?: {
  requestStartedAtMonotonicMs?: number | null;
}): ActivityTimelineClockSample {
  const monotonicNowMs = getActivityTimelineMonotonicNowMs();
  const requestStartedAtMonotonicMs = params?.requestStartedAtMonotonicMs;
  const hasValidRequestStart =
    requestStartedAtMonotonicMs !== null &&
    requestStartedAtMonotonicMs !== undefined &&
    Number.isFinite(requestStartedAtMonotonicMs) &&
    requestStartedAtMonotonicMs <= monotonicNowMs;

  return {
    monotonicNowMs,
    wallClockNowMs: Date.now(),
    serverObservedAtMonotonicMs: hasValidRequestStart
      ? (requestStartedAtMonotonicMs + monotonicNowMs) / 2
      : monotonicNowMs,
  };
}

export function normalizeActivityTimelineSnapshot(
  snapshot: ActivityTimelineSnapshot,
): ActivityTimelineSnapshot {
  const activityInstanceId = normalizeIdentifier(
    snapshot.activityInstanceId,
    'activityInstanceId',
  );
  const cycleId = normalizeIdentifier(snapshot.cycleId, 'cycleId');
  const serverNowMs = normalizeTimestamp(snapshot.serverNow, 'serverNow');
  const startedAtMs = normalizeTimestamp(snapshot.startedAt, 'startedAt');
  const endsAtMs = normalizeTimestamp(snapshot.endsAt, 'endsAt');

  if (!Number.isInteger(snapshot.durationMs) || snapshot.durationMs <= 0) {
    throw new Error('durationMs deve ser um inteiro positivo.');
  }

  if (endsAtMs <= startedAtMs) {
    throw new Error('endsAt deve ser posterior a startedAt.');
  }

  if (endsAtMs - startedAtMs !== snapshot.durationMs) {
    throw new Error(
      'durationMs deve corresponder exatamente ao intervalo entre startedAt e endsAt.',
    );
  }

  if (snapshot.direction !== 'fill' && snapshot.direction !== 'drain') {
    throw new Error('direction deve ser fill ou drain.');
  }

  if (!Number.isInteger(snapshot.version) || snapshot.version < 1) {
    throw new Error('version deve ser um inteiro positivo.');
  }

  return {
    activityInstanceId,
    cycleId,
    serverNow: new Date(serverNowMs).toISOString(),
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    durationMs: snapshot.durationMs,
    direction: snapshot.direction,
    version: snapshot.version,
  };
}

export function buildActivityTimeline(
  rawSnapshot: ActivityTimelineSnapshot,
  rawClock: ActivityTimelineClockSample = createActivityTimelineClockSample(),
): ActivityTimeline {
  const snapshot = normalizeActivityTimelineSnapshot(rawSnapshot);
  const clock = normalizeClockSample(rawClock);
  const serverNowMs = Date.parse(snapshot.serverNow);
  const startedAtServerMs = Date.parse(snapshot.startedAt);
  const endsAtServerMs = Date.parse(snapshot.endsAt);
  const observedAtWallClockMs =
    clock.wallClockNowMs - (clock.monotonicNowMs - clock.observedAtMonotonicMs);
  const serverClockOffsetMs = serverNowMs - observedAtWallClockMs;
  const startedAtMonotonicMs =
    clock.observedAtMonotonicMs + (startedAtServerMs - serverNowMs);
  const endsAtMonotonicMs =
    clock.observedAtMonotonicMs + (endsAtServerMs - serverNowMs);

  return {
    key: `${snapshot.activityInstanceId}:${snapshot.cycleId}:v${snapshot.version}`,
    snapshot,
    activityInstanceId: snapshot.activityInstanceId,
    cycleId: snapshot.cycleId,
    version: snapshot.version,
    direction: snapshot.direction,
    durationMs: snapshot.durationMs,
    serverNowMs,
    startedAtServerMs,
    endsAtServerMs,
    startedAtMonotonicMs,
    endsAtMonotonicMs,
    observedAtMonotonicMs: clock.observedAtMonotonicMs,
    serverClockOffsetMs,
  };
}

export function getActivityTimelineFrame(
  timeline: ActivityTimeline,
  monotonicNowMs = getActivityTimelineMonotonicNowMs(),
): ActivityTimelineFrame {
  const rawElapsedMs = monotonicNowMs - timeline.startedAtMonotonicMs;
  const elapsedMs = Math.max(0, Math.min(timeline.durationMs, rawElapsedMs));
  const progress = clamp01(elapsedMs / timeline.durationMs);
  const fillScale =
    timeline.direction === 'fill' ? progress : clamp01(1 - progress);

  return {
    elapsedMs,
    remainingMs: Math.max(0, timeline.durationMs - elapsedMs),
    progress,
    progressPercent: progress * 100,
    fillScale,
    fillPercent: fillScale * 100,
    isPending: rawElapsedMs < 0,
    isComplete: rawElapsedMs >= timeline.durationMs,
  };
}

export function getActivityTimelineCssAnimation(
  timeline: ActivityTimeline,
  monotonicNowMs = getActivityTimelineMonotonicNowMs(),
): ActivityTimelineCssAnimation {
  const frame = getActivityTimelineFrame(timeline, monotonicNowMs);

  return {
    key: timeline.key,
    durationMs: timeline.durationMs,
    delayMs: timeline.startedAtMonotonicMs - monotonicNowMs,
    fromScale: timeline.direction === 'fill' ? 0 : 1,
    toScale: timeline.direction === 'fill' ? 1 : 0,
    currentScale: frame.fillScale,
  };
}

export function reconcileActivityTimelineProviderState(
  current: ActivityTimelineProviderState | null,
  snapshot: ActivityTimelineSnapshot | null,
  clock: ActivityTimelineClockSample = createActivityTimelineClockSample(),
): ActivityTimelineProviderState | null {
  if (!snapshot) return null;

  const normalizedSnapshot = normalizeActivityTimelineSnapshot(snapshot);

  if (
    current?.snapshot.activityInstanceId ===
      normalizedSnapshot.activityInstanceId &&
    normalizedSnapshot.version <= current.snapshot.version
  ) {
    return current;
  }

  const timeline = buildActivityTimeline(normalizedSnapshot, clock);

  return {
    snapshot: timeline.snapshot,
    timeline,
  };
}
