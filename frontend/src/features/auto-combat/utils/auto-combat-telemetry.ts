import type {
  AutoCombatClientTelemetryPayload,
  AutoCombatRealtimeEvent,
  AutoCombatTelemetryContext,
  AutoCombatTelemetryMetadata,
} from "../types/auto-combat.types";

type BuildEventTelemetryParams = {
  characterId: string;
  event: AutoCombatRealtimeEvent;
  receivedAtMs: number;
  queueDepth: number;
  previousSequence?: number | null;
  metadata?: AutoCombatTelemetryMetadata;
};

export type AutoCombatEventTelemetryResult = {
  payload: AutoCombatClientTelemetryPayload;
  sequence: number | null;
};

export function buildAutoCombatEventTelemetry(
  params: BuildEventTelemetryParams,
): AutoCombatEventTelemetryResult {
  const sequence = toNonNegativeInteger(params.event.sequence);
  const previousSequence = toNonNegativeInteger(params.previousSequence);
  const eventTimestampMs = getEventTimestampMs(params.event);
  const transitDelayMs =
    eventTimestampMs === null
      ? null
      : Math.max(0, params.receivedAtMs - eventTimestampMs);
  const sequenceGap =
    sequence !== null &&
    previousSequence !== null &&
    sequence > previousSequence + 1
      ? sequence - previousSequence - 1
      : 0;

  return {
    sequence,
    payload: {
      characterId: params.characterId,
      kind: "EVENT_RECEIVED",
      ...(params.metadata?.context
        ? { context: params.metadata.context }
        : {}),
      eventType: String(params.event.type ?? "UNKNOWN").toUpperCase(),
      transitDelayMs,
      queueDepth: Math.max(0, Math.floor(Number(params.queueDepth) || 0)),
      sequenceGap,
      outOfOrder:
        sequence !== null &&
        previousSequence !== null &&
        sequence < previousSequence,
      ...(params.metadata?.afterVisibilityReturn
        ? { afterVisibilityReturn: true }
        : {}),
    },
  };
}

export function resolveAutoCombatTelemetryContext(params?: {
  pathname?: string | null;
  hidden?: boolean;
  reconnected?: boolean;
}): AutoCombatTelemetryContext {
  if (params?.reconnected) {
    return "reconnected";
  }

  const hidden = params?.hidden ??
    (typeof document !== "undefined" && document.visibilityState === "hidden");

  if (hidden) {
    return "tab-hidden";
  }

  const pathname =
    params?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");

  return /\/dashboard\/[^/]+\/auto-combat\/?$/i.test(pathname)
    ? "combat-page"
    : "other-page";
}

function getEventTimestampMs(event: AutoCombatRealtimeEvent) {
  const candidates = [event.serverTime, event.createdAt];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const timestamp = Date.parse(candidate);

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return null;
}

function toNonNegativeInteger(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}
