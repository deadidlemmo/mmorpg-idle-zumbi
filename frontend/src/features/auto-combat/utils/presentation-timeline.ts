import type {
  AutoCombatBattleProgressViewModel,
  AutoCombatRealtimeEvent,
} from "../types/auto-combat.types";
import { getCycleProgress, type CycleProgress } from "./battle-timeline";

const MIN_PRESENTATION_DURATION_MS = 1_000;

export type AutoCombatPresentationTimeline = {
  key: string;
  sessionId: string | null;
  enemyInstanceId: string;
  startedAtMs: number;
  durationMs: number;
};

export type AutoCombatPresentationProgress = CycleProgress & {
  key: string;
  startedAtMs: number;
  durationMs: number;
  cycleStartedAtMs: number;
  cycleDurationMs: number;
  remainingPercent: number;
};

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEventType(event?: AutoCombatRealtimeEvent | null) {
  return String(event?.type ?? "")
    .trim()
    .toUpperCase();
}

function normalizeScope(value: unknown) {
  const normalized = String(value ?? "").trim();

  return normalized || null;
}

export function getAutoCombatPresentationNowMs() {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
}

export function getAutoCombatPresentationWallClockNowMs() {
  return Date.now();
}

export function getAutoCombatPresentationStartedAtMs(params: {
  monotonicNowMs: number;
  wallClockNowMs: number;
  visualCycleStartedAtMs?: number | null;
}) {
  const monotonicNowMs = toFiniteNumber(params.monotonicNowMs);

  if (monotonicNowMs === null) {
    return null;
  }

  const wallClockNowMs = toFiniteNumber(params.wallClockNowMs);
  const visualCycleStartedAtMs = toFiniteNumber(
    params.visualCycleStartedAtMs,
  );

  if (wallClockNowMs === null || visualCycleStartedAtMs === null) {
    return monotonicNowMs;
  }

  const elapsedMs = Math.max(0, wallClockNowMs - visualCycleStartedAtMs);

  return monotonicNowMs - elapsedMs;
}

export function isAutoCombatPresentationTimelineEnabled(params: {
  userRole?: string | null;
  flagValue?: string | boolean | null;
}) {
  const flagEnabled =
    params.flagValue === true ||
    String(params.flagValue ?? "")
      .trim()
      .toLowerCase() === "true";

  return flagEnabled && params.userRole?.trim().toUpperCase() === "ADMIN";
}

export function getAutoCombatPresentationDurationMs(
  ...sources: Array<AutoCombatBattleProgressViewModel | null | undefined>
) {
  for (const source of sources) {
    if (!source) continue;

    const durationSeconds = toFiniteNumber(source.cycleDurationSeconds);
    const estimatedKillTimeSeconds = toFiniteNumber(
      source.estimatedKillTimeSeconds,
    );
    const rawDurationMs =
      toFiniteNumber(source.cycleDurationMs) ??
      (durationSeconds !== null ? durationSeconds * 1_000 : null) ??
      (estimatedKillTimeSeconds !== null
        ? estimatedKillTimeSeconds * 1_000
        : null);

    if (rawDurationMs === null || rawDurationMs <= 0) continue;

    const roundedDurationMs = Math.ceil(rawDurationMs / 1_000) * 1_000;

    return Math.max(MIN_PRESENTATION_DURATION_MS, roundedDurationMs);
  }

  return null;
}

export function buildAutoCombatPresentationTimeline(params: {
  sessionId?: string | null;
  enemyInstanceId?: string | null;
  startedAtMs?: number | null;
  durationMs?: number | null;
}): AutoCombatPresentationTimeline | null {
  const enemyInstanceId = normalizeScope(params.enemyInstanceId);
  const startedAtMs = toFiniteNumber(params.startedAtMs);
  const durationMs = toFiniteNumber(params.durationMs);

  if (!enemyInstanceId || startedAtMs === null || !durationMs || durationMs <= 0) {
    return null;
  }

  const sessionId = normalizeScope(params.sessionId);
  const safeDurationMs = Math.max(
    MIN_PRESENTATION_DURATION_MS,
    Math.ceil(durationMs),
  );

  return {
    key: `${sessionId ?? "session"}:${enemyInstanceId}:${startedAtMs}:${safeDurationMs}`,
    sessionId,
    enemyInstanceId,
    startedAtMs,
    durationMs: safeDurationMs,
  };
}

export function getAutoCombatPresentationProgress(params: {
  timeline?: AutoCombatPresentationTimeline | null;
  nowMs: number;
}): AutoCombatPresentationProgress | null {
  const { timeline } = params;

  if (!timeline) return null;

  const progress = getCycleProgress({
    nowMs: params.nowMs,
    cycleStartedAtMs: timeline.startedAtMs,
    cycleDurationMs: timeline.durationMs,
  });

  return {
    ...progress,
    key: timeline.key,
    startedAtMs: timeline.startedAtMs,
    durationMs: timeline.durationMs,
    cycleStartedAtMs: timeline.startedAtMs,
    cycleDurationMs: timeline.durationMs,
    remainingPercent: Math.max(0, 100 - progress.progressPercent),
  };
}

export function isAutoCombatMobCompletionEvent(params: {
  event?: AutoCombatRealtimeEvent | null;
  nextEvent?: AutoCombatRealtimeEvent | null;
}) {
  const eventType = normalizeEventType(params.event);

  if (eventType === "MOB_DEFEATED") {
    return true;
  }

  if (eventType !== "PLAYER_HIT") {
    return false;
  }

  const event = params.event;
  const target = String(event?.target ?? "")
    .trim()
    .toUpperCase();
  const mobHpAfter =
    toFiniteNumber(event?.mobHpAfter) ??
    (target === "MOB" ? toFiniteNumber(event?.targetHpAfter) : null);

  return (
    (mobHpAfter !== null && mobHpAfter <= 0) ||
    normalizeEventType(params.nextEvent) === "MOB_DEFEATED"
  );
}

export function getAutoCombatPresentationQueueDelayMs(params: {
  timeline?: AutoCombatPresentationTimeline | null;
  event?: AutoCombatRealtimeEvent | null;
  nextEvent?: AutoCombatRealtimeEvent | null;
  nowMs: number;
}) {
  const { timeline, event } = params;

  if (
    !timeline ||
    !event ||
    !isAutoCombatMobCompletionEvent({
      event,
      nextEvent: params.nextEvent,
    })
  ) {
    return 0;
  }

  const eventEnemyInstanceId = normalizeScope(event.enemyInstanceId);

  if (
    eventEnemyInstanceId &&
    eventEnemyInstanceId !== timeline.enemyInstanceId
  ) {
    return 0;
  }

  const progress = getAutoCombatPresentationProgress({
    timeline,
    nowMs: params.nowMs,
  });

  return Math.max(0, Math.ceil(progress?.remainingMs ?? 0));
}

export function getAutoCombatPresentationCssTimeline(params: {
  timeline?: AutoCombatPresentationTimeline | null;
  nowMs: number;
}) {
  const progress = getAutoCombatPresentationProgress(params);

  if (!progress) return null;

  return {
    key: progress.key,
    durationSeconds: progress.durationMs / 1_000,
    elapsedSeconds: progress.cycleElapsedMs / 1_000,
    direction: "drain" as const,
    timingFunction: "linear",
    iterationCount: 1 as const,
  };
}
