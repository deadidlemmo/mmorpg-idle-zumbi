export type HuntingCombatVisualCue =
  | "approach"
  | "player-attack"
  | "mob-attack"
  | "finisher"
  | "defeated";

export type HuntingCombatVisualStep = Readonly<{
  cue: HuntingCombatVisualCue;
  key: string;
}>;

export function normalizeHuntingMobName(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’´`]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getHuntingCombatVisualStep(params: {
  durationMs: number;
  progressPercent: number;
  isDefeated?: boolean;
}): HuntingCombatVisualStep {
  if (params.isDefeated) return { cue: "defeated", key: "defeated" };

  const durationMs = Math.max(1, Number(params.durationMs) || 1);
  const progress = clamp((Number(params.progressPercent) || 0) / 100, 0, 1);
  const elapsedMs = progress * durationMs;
  const approachMs = Math.min(320, durationMs * 0.18);
  const finisherMs = Math.max(approachMs, durationMs - Math.min(480, durationMs * 0.2));

  if (elapsedMs < approachMs) return { cue: "approach", key: "approach" };
  if (elapsedMs >= finisherMs) return { cue: "finisher", key: "finisher" };

  const cadenceMs = clamp(durationMs / 6, 150, 850);
  const sequence = Math.floor((elapsedMs - approachMs) / cadenceMs);
  return {
    cue: sequence % 2 === 0 ? "player-attack" : "mob-attack",
    key: `exchange-${sequence}`,
  };
}

export function getHuntingCombatAnimationTimeScale(durationMs: number) {
  const safeDurationMs = Math.max(1, Number(durationMs) || 1);
  return clamp(900 / safeDurationMs, 1, 3);
}

export function getHuntingMobDeathPresentationDuration(
  prefersReducedMotion: boolean,
) {
  return prefersReducedMotion ? 450 : 1_050;
}

export function shouldReplaceHuntingThreat(params: {
  battleCycleChanged: boolean;
  eventType?: string | null;
  hasThreat: boolean;
  isCombatActive: boolean;
  isFreshEvent: boolean;
  isThreatReady: boolean;
  mobChanged: boolean;
  wasCombatActive: boolean;
}) {
  if (!params.hasThreat) return false;
  if (params.isCombatActive) {
    if (!params.wasCombatActive) return true;
    return (
      params.isFreshEvent &&
      String(params.eventType ?? "").trim().toUpperCase() === "MOB_SPAWNED" &&
      (params.mobChanged || params.battleCycleChanged)
    );
  }

  return params.isThreatReady && !params.wasCombatActive && params.mobChanged;
}

export function shouldPresentHuntingMobDeath(params: {
  battleCycleChanged: boolean;
  eventType?: string | null;
  isCombatActive: boolean;
  isFreshEvent: boolean;
  mobChanged: boolean;
  wasCombatActive: boolean;
}) {
  const eventType = String(params.eventType ?? "")
    .trim()
    .toUpperCase();

  if (eventType === "PLAYER_DEFEATED") return false;
  if (eventType === "MOB_DEFEATED" && params.isFreshEvent) return true;
  if (!params.wasCombatActive) return false;

  return !params.isCombatActive;
}
