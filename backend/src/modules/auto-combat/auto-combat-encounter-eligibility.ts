export const LEGACY_AUTO_COMBAT_E2E_MOB_NAME_PREFIX = 'Ameaça E2E';

type AutoCombatMobIdentity = {
  name?: string | null;
};

export function isAutoCombatGameplayMob(
  mob?: AutoCombatMobIdentity | null,
): boolean {
  const name = mob?.name?.trim();

  if (!name) {
    return true;
  }

  return !name.startsWith(LEGACY_AUTO_COMBAT_E2E_MOB_NAME_PREFIX);
}
