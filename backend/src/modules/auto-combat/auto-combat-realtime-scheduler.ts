import { AutoCombatSessionPhase } from '@prisma/client';

const MIN_REALTIME_DELAY_MS = 50;
const MAX_REALTIME_DELAY_MS = 30_000;

type AutoCombatRealtimeSnapshot = {
  active?: boolean | null;
  hasActiveAutoCombat?: boolean | null;
  phase?: string | null;
  serverNow?: string | Date | null;
  battleProgress?: {
    remainingMs?: number | null;
    cycleEndsAt?: string | Date | null;
    serverNow?: string | Date | null;
  } | null;
  hunting?: {
    nextFindAt?: string | Date | null;
    timeline?: {
      endsAt?: string | Date | null;
      serverNow?: string | Date | null;
    } | null;
  } | null;
  session?: {
    phase?: string | null;
    battleProgress?: AutoCombatRealtimeSnapshot['battleProgress'];
  } | null;
};

function toTimestamp(value?: string | Date | null) {
  if (!value) return null;

  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function toPositiveDelay(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return null;

  return Math.min(
    MAX_REALTIME_DELAY_MS,
    Math.max(MIN_REALTIME_DELAY_MS, Math.ceil(parsed)),
  );
}

export function getAutoCombatNextRealtimeTickDelayMs(
  snapshot: AutoCombatRealtimeSnapshot | null | undefined,
  fallbackDelayMs: number,
) {
  if (!snapshot) return null;

  if (snapshot.active === false || snapshot.hasActiveAutoCombat === false) {
    return null;
  }

  const phase = String(snapshot.session?.phase ?? snapshot.phase ?? '')
    .trim()
    .toUpperCase();

  if (phase === AutoCombatSessionPhase.HUNTING) {
    const huntingEndsAtMs = toTimestamp(
      snapshot.hunting?.timeline?.endsAt ?? snapshot.hunting?.nextFindAt,
    );
    const huntingServerNowMs = toTimestamp(
      snapshot.hunting?.timeline?.serverNow ?? snapshot.serverNow,
    );

    if (huntingEndsAtMs !== null && huntingServerNowMs !== null) {
      return toPositiveDelay(huntingEndsAtMs - huntingServerNowMs);
    }

    return toPositiveDelay(fallbackDelayMs);
  }

  if (phase !== AutoCombatSessionPhase.COMBAT_ACTIVE) {
    return toPositiveDelay(fallbackDelayMs);
  }

  const battleProgress =
    snapshot.battleProgress ?? snapshot.session?.battleProgress ?? null;
  const explicitRemainingMs = toPositiveDelay(battleProgress?.remainingMs);

  if (explicitRemainingMs !== null) {
    return explicitRemainingMs;
  }

  const cycleEndsAtMs = toTimestamp(battleProgress?.cycleEndsAt);
  const serverNowMs = toTimestamp(
    battleProgress?.serverNow ?? snapshot.serverNow,
  );

  if (cycleEndsAtMs !== null && serverNowMs !== null) {
    return toPositiveDelay(cycleEndsAtMs - serverNowMs);
  }

  return toPositiveDelay(fallbackDelayMs);
}
