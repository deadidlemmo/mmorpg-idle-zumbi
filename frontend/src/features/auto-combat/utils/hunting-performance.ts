import { formatAutoCombatTtkSeconds } from "./battle-timeline";

export type HuntingPerformanceProjection = {
  averageCombatDurationSeconds?: number;
  xpPerMinute?: number;
};

function positiveSeconds(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function formatHuntingDuration(value: number | null | undefined) {
  const seconds = positiveSeconds(value);
  return seconds === null ? "—" : formatAutoCombatTtkSeconds(seconds);
}

export function buildHuntingPerformance(
  secondsPerFind: number | null | undefined,
  projection: HuntingPerformanceProjection | null,
) {
  const trackingSeconds = positiveSeconds(secondsPerFind);
  const averageTtkSeconds = positiveSeconds(
    projection?.averageCombatDurationSeconds,
  );
  const cycleSeconds =
    trackingSeconds !== null && averageTtkSeconds !== null
      ? trackingSeconds + averageTtkSeconds
      : null;
  const encountersPerHour =
    cycleSeconds !== null ? Math.round(3600 / cycleSeconds) : null;
  const xpPerHour =
    typeof projection?.xpPerMinute === "number" &&
    Number.isFinite(projection.xpPerMinute) &&
    projection.xpPerMinute >= 0
      ? Math.round(projection.xpPerMinute * 60)
      : null;

  return {
    trackingSeconds,
    averageTtkSeconds,
    cycleSeconds,
    encountersPerHour,
    xpPerHour,
  };
}
