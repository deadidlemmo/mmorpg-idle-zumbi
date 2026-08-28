import type { AutoCombatStatusResponse } from '../types/auto-combat.types';

export type AutoCombatHuntingTimelineRollout = 'off' | 'admin' | 'all';

const MIN_HUNTING_CYCLE_DURATION_MS = 1_000;

function normalizeCountdownMilliseconds(value?: number | null) {
  if (value === null || value === undefined) return null;

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.ceil(parsed));
}

function getCountdownParts(value?: number | null) {
  const totalMilliseconds = normalizeCountdownMilliseconds(value);

  if (totalMilliseconds === null) return null;

  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;

  return {
    hours,
    minutes,
    seconds,
    milliseconds,
    totalSeconds: Math.floor(totalMilliseconds / 1_000),
  };
}

export function formatAutoCombatHuntingCountdown(value?: number | null) {
  const parts = getCountdownParts(value);

  if (!parts) return '--';

  return `${parts.totalSeconds},${String(parts.milliseconds).padStart(3, '0')}s`;
}

export function formatAutoCombatHuntingCountdownClock(
  value?: number | null,
) {
  const parts = getCountdownParts(value);

  if (!parts) return '--:--';

  const seconds = `${String(parts.seconds).padStart(2, '0')},${String(
    parts.milliseconds,
  ).padStart(3, '0')}`;

  if (parts.hours > 0) {
    return `${parts.hours}:${String(parts.minutes).padStart(2, '0')}:${seconds}`;
  }

  return `${parts.minutes}:${seconds}`;
}

export function resolveAutoCombatHuntingCycleDurationMs(params: {
  lastFindAtMs?: number | null;
  nextFindAtMs?: number | null;
  secondsPerFind?: number | null;
}) {
  const hasTimestampWindow =
    params.lastFindAtMs !== null &&
    params.lastFindAtMs !== undefined &&
    params.nextFindAtMs !== null &&
    params.nextFindAtMs !== undefined;
  const lastFindAtMs = Number(params.lastFindAtMs);
  const nextFindAtMs = Number(params.nextFindAtMs);
  const timestampDurationMs = nextFindAtMs - lastFindAtMs;

  if (
    hasTimestampWindow &&
    Number.isFinite(lastFindAtMs) &&
    Number.isFinite(nextFindAtMs) &&
    timestampDurationMs > 0
  ) {
    return Math.max(
      MIN_HUNTING_CYCLE_DURATION_MS,
      Math.ceil(timestampDurationMs),
    );
  }

  const secondsPerFind = Number(params.secondsPerFind);
  const durationMs = Number.isFinite(secondsPerFind)
    ? Math.ceil(secondsPerFind * 1_000)
    : MIN_HUNTING_CYCLE_DURATION_MS;

  return Math.max(MIN_HUNTING_CYCLE_DURATION_MS, durationMs);
}

export function resolveAutoCombatHuntingTimelineRollout(
  flagValue?: string | boolean | null,
): AutoCombatHuntingTimelineRollout {
  if (flagValue === true) return 'all';
  if (flagValue === false) return 'off';

  const normalizedFlag = String(flagValue ?? '')
    .trim()
    .toLowerCase();

  if (['all', 'on', 'true'].includes(normalizedFlag)) return 'all';
  if (['off', 'false', 'none'].includes(normalizedFlag)) return 'off';

  return 'admin';
}

export function isAutoCombatHuntingTimelineEnabled(params: {
  flagValue?: string | boolean | null;
  userRole?: string | null;
}) {
  const rollout = resolveAutoCombatHuntingTimelineRollout(params.flagValue);

  if (rollout === 'all') return true;
  if (rollout === 'off') return false;

  return String(params.userRole ?? '')
    .trim()
    .toUpperCase() === 'ADMIN';
}

export function getAutoCombatHuntingTimelineSnapshot(
  status: AutoCombatStatusResponse | null,
) {
  return status?.hunting?.timeline ?? null;
}
