import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from "../types/auto-combat.types";
import {
  getStatusSession,
  normalizeRealtimeEventType,
  normalizeSessionStatus,
} from "./autoCombatRealtime.utils";

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === "object"
    ? (value as LooseRecord)
    : null;
}

function toNonNegativeInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Math.floor(Number(value));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readBoolean(source: unknown, key: string) {
  return asRecord(source)?.[key] === true;
}

function readString(source: unknown, key: string) {
  const value = asRecord(source)?.[key];

  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

function readRecoveryCount(source: unknown) {
  const record = asRecord(source);
  const recovery = asRecord(record?.autoCombatRecovery);

  return Math.max(
    0,
    toNonNegativeInteger(record?.preservedTrackedEnemiesCount) ?? 0,
    toNonNegativeInteger(recovery?.preservedTrackedEnemiesCount) ?? 0,
  );
}

export function isAutoCombatDefeatEvent(
  event?: AutoCombatRealtimeEvent | null,
) {
  return Boolean(
    event &&
      (normalizeRealtimeEventType(event) === "PLAYER_DEFEATED" ||
        normalizeSessionStatus(event.sessionStatus) === "DEFEATED" ||
        normalizeSessionStatus(event.endReason) === "PLAYER_DEFEATED" ||
        event.shouldRedirectToInfirmary === true),
  );
}

export function isAutoCombatDefeatStatus(
  status?: AutoCombatStatusResponse | null,
) {
  if (!status) return false;

  const session = getStatusSession(status);

  return Boolean(
    normalizeSessionStatus(session?.status) === "DEFEATED" ||
      normalizeSessionStatus(status.endReason) === "PLAYER_DEFEATED" ||
      status.shouldRedirectToInfirmary === true ||
      status.sessionSummary?.defeated === true,
  );
}

export function shouldRedirectAutoCombatToInfirmary(params: {
  status?: AutoCombatStatusResponse | null;
  event?: AutoCombatRealtimeEvent | null;
  fallbackCurrentHp?: unknown;
}) {
  const { status = null, event = null, fallbackCurrentHp } = params;
  const session = getStatusSession(status);
  const statusCharacterHp = toNonNegativeInteger(status?.character?.currentHp);
  const eventCharacterHp =
    toNonNegativeInteger(event?.characterCurrentHp) ??
    toNonNegativeInteger(event?.characterHpAfter);
  const fallbackHp = toNonNegativeInteger(fallbackCurrentHp);
  const hasDefeatSignal = Boolean(
    isAutoCombatDefeatStatus(status) ||
      isAutoCombatDefeatEvent(event) ||
      readBoolean(session, "shouldRedirectToInfirmary") ||
      normalizeSessionStatus(readString(session, "endReason")) ===
        "PLAYER_DEFEATED",
  );

  if (!hasDefeatSignal) {
    return false;
  }

  const orderedHpSources = isAutoCombatDefeatEvent(event)
    ? [eventCharacterHp, statusCharacterHp, fallbackHp]
    : [statusCharacterHp, eventCharacterHp, fallbackHp];

  for (const hp of orderedHpSources) {
    if (hp !== null) {
      return hp <= 0;
    }
  }

  return true;
}

export function getPreservedTrackedEnemiesCount(
  status?: AutoCombatStatusResponse | null,
) {
  if (!status) return 0;

  const session = getStatusSession(status);
  const huntBatch = asRecord(status.huntBatch);

  return Math.max(
    readRecoveryCount(status),
    readRecoveryCount(session),
    readRecoveryCount(huntBatch),
  );
}
