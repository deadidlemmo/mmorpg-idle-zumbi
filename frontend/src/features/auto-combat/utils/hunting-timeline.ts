import type { AutoCombatStatusResponse } from '../types/auto-combat.types';

export type AutoCombatHuntingTimelineRollout = 'off' | 'admin' | 'all';

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
