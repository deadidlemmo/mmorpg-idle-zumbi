const TERMINAL_AUTO_COMBAT_STATUSES = new Set([
  "STOPPED",
  "FINISHED",
  "COMPLETED",
  "DEFEATED",
  "FAILED",
  "EXPIRED",
  "CLAIMED",
  "CANCELLED",
  "CANCELED",
]);

const RUNNING_AUTO_COMBAT_PHASES = new Set([
  "HUNTING",
  "COMBAT_ACTIVE",
  "HUNT_TARGET_FOUND",
]);

export interface AutoCombatActivityStateEvidence {
  statusActive?: boolean | null;
  hasActiveAutoCombat?: boolean | null;
  sessionStatus?: string | null;
  sessionPhase?: string | null;
  hasCombatTarget?: boolean;
  hasSession?: boolean;
}

function normalizeStateValue(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function isAutoCombatActivityActive(
  evidence: AutoCombatActivityStateEvidence,
) {
  const sessionStatus = normalizeStateValue(evidence.sessionStatus);
  const sessionPhase = normalizeStateValue(evidence.sessionPhase);

  if (
    TERMINAL_AUTO_COMBAT_STATUSES.has(sessionStatus) ||
    sessionPhase === "ENCOUNTER_READY" ||
    evidence.hasActiveAutoCombat === false
  ) {
    return false;
  }

  if (
    evidence.hasActiveAutoCombat === true ||
    RUNNING_AUTO_COMBAT_PHASES.has(sessionPhase) ||
    evidence.hasCombatTarget === true
  ) {
    return true;
  }

  if (evidence.statusActive === false) {
    return false;
  }

  return evidence.statusActive === true && evidence.hasSession === true;
}
