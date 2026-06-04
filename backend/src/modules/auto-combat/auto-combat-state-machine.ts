import { AutoCombatSessionPhase } from '@prisma/client';

const AUTO_COMBAT_ALLOWED_PHASE_TRANSITIONS: Record<
  AutoCombatSessionPhase,
  AutoCombatSessionPhase[]
> = {
  [AutoCombatSessionPhase.HUNTING]: [AutoCombatSessionPhase.ENCOUNTER_READY],
  [AutoCombatSessionPhase.ENCOUNTER_READY]: [
    AutoCombatSessionPhase.HUNTING,
    AutoCombatSessionPhase.COMBAT_ACTIVE,
  ],
  [AutoCombatSessionPhase.COMBAT_ACTIVE]: [],
};

export function isAutoCombatPhaseTransitionAllowed(
  currentPhase: AutoCombatSessionPhase,
  nextPhase: AutoCombatSessionPhase,
) {
  if (currentPhase === nextPhase) {
    return true;
  }

  return AUTO_COMBAT_ALLOWED_PHASE_TRANSITIONS[currentPhase].includes(
    nextPhase,
  );
}

export function assertAutoCombatPhaseTransition(
  currentPhase: AutoCombatSessionPhase,
  nextPhase: AutoCombatSessionPhase,
) {
  if (isAutoCombatPhaseTransitionAllowed(currentPhase, nextPhase)) {
    return;
  }

  throw new Error(
    `Transicao invalida de AutoCombat: ${currentPhase} -> ${nextPhase}`,
  );
}

export function buildHuntCycleKey(sessionId: string, findIndex: number) {
  const safeFindIndex = Math.max(1, Math.floor(Number(findIndex) || 1));

  return `${sessionId}:hunt:${safeFindIndex}`;
}
