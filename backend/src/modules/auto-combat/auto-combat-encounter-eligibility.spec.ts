import {
  isAutoCombatGameplayMob,
  LEGACY_AUTO_COMBAT_E2E_MOB_NAME_PREFIX,
} from './auto-combat-encounter-eligibility';

describe('auto-combat encounter eligibility', () => {
  it('mantem mobs normais elegiveis', () => {
    expect(isAutoCombatGameplayMob({ name: 'Errante do Subúrbio' })).toBe(true);
  });

  it('bloqueia fixtures letais antigas do teste E2E', () => {
    expect(
      isAutoCombatGameplayMob({
        name: `${LEGACY_AUTO_COMBAT_E2E_MOB_NAME_PREFIX}fixture-antiga`,
      }),
    ).toBe(false);
  });
});
