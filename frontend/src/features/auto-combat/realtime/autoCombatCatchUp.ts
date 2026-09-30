import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from "../types/auto-combat.types";
import { getStatusSession, isStatusActive } from "./autoCombatRealtime.utils";

const HISTORICAL_CYCLE_GRACE_MS = 2_500;

function toTimestamp(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isHistoricalAutoCombatStatus(
  status: AutoCombatStatusResponse | null,
  nowMs = Date.now(),
) {
  if (!status || !isStatusActive(status)) return false;

  const session = getStatusSession(status);
  const phase = String(session?.phase ?? status.phase ?? "").toUpperCase();
  const serverNowMs = toTimestamp(status.serverNow) ?? nowMs;
  const cycleEndsAt =
    phase === "HUNTING"
      ? (status.hunting?.timeline?.endsAt ??
        status.hunting?.cycleEndsAt ??
        status.hunting?.nextFindAt)
      : phase === "COMBAT_ACTIVE"
        ? (status.battleProgress?.cycleEndsAt ??
          session?.battleProgress?.cycleEndsAt ??
          status.currentMob?.battleProgress?.cycleEndsAt)
        : null;
  const cycleEndsAtMs = toTimestamp(cycleEndsAt);

  return (
    cycleEndsAtMs !== null &&
    serverNowMs - cycleEndsAtMs > HISTORICAL_CYCLE_GRACE_MS
  );
}

export function isHistoricalAutoCombatEvent(
  event: AutoCombatRealtimeEvent,
  nowMs = Date.now(),
) {
  const eventType = String(event.type ?? "").toUpperCase();
  const serverNowMs =
    eventType === "HUNT_TARGET_FOUND"
      ? nowMs
      : (toTimestamp(event.serverTime) ?? nowMs);
  let activityAtMs: number | null = null;

  if (eventType === "HUNT_TARGET_FOUND") {
    activityAtMs = toTimestamp(event.actionStartedAt);
  } else if (eventType === "MOB_SPAWNED") {
    const startedAtMs = toTimestamp(event.actionStartedAt);
    const durationMs = Number(
      event.estimatedKillTimeMs ??
        Number(event.estimatedKillTimeSeconds) * 1_000,
    );
    activityAtMs =
      startedAtMs !== null && Number.isFinite(durationMs) && durationMs > 0
        ? startedAtMs + durationMs
        : toTimestamp(event.nextActionAt);
  } else if (
    ["PLAYER_HIT", "MOB_HIT", "DODGE", "POTION_USED", "MOB_DEFEATED"].includes(
      eventType,
    )
  ) {
    activityAtMs =
      toTimestamp(event.nextActionAt) ?? toTimestamp(event.actionStartedAt);
  }

  return (
    activityAtMs !== null &&
    serverNowMs - activityAtMs > HISTORICAL_CYCLE_GRACE_MS
  );
}
