import {
  calculateAutoCombatAttackOpportunities,
  getAutoCombatEquipmentTierGap,
  getAutoCombatIncomingDamageMultiplier,
  getAutoCombatOffensiveReadinessMultiplier,
  resolveAutoCombatAttackAttempts,
} from './auto-combat-pressure.util';

describe('auto-combat pressure util', () => {
  it('keeps legacy callers neutral when equipment tier is unavailable', () => {
    expect(
      getAutoCombatEquipmentTierGap({ mobTier: 4, equipmentTier: null }),
    ).toBe(0);
    expect(getAutoCombatOffensiveReadinessMultiplier({ mobTier: 4 })).toBe(1);
  });

  it('reduces offensive readiness for each missing equipment tier', () => {
    expect(
      getAutoCombatOffensiveReadinessMultiplier({
        mobTier: 3,
        equipmentTier: 2,
      }),
    ).toBe(0.88);
    expect(
      getAutoCombatOffensiveReadinessMultiplier({
        mobTier: 3,
        equipmentTier: 1,
      }),
    ).toBeCloseTo(0.7744);
  });

  it('adds exposure for longer fights, faster mobs and equipment gaps', () => {
    const baseline = calculateAutoCombatAttackOpportunities({
      killTimeSeconds: 10,
      mobSpeed: 10,
      mobTier: 2,
      equipmentTier: 2,
    });
    const longer = calculateAutoCombatAttackOpportunities({
      killTimeSeconds: 24,
      mobSpeed: 10,
      mobTier: 2,
      equipmentTier: 2,
    });
    const faster = calculateAutoCombatAttackOpportunities({
      killTimeSeconds: 10,
      mobSpeed: 24,
      mobTier: 2,
      equipmentTier: 2,
    });
    const undergeared = calculateAutoCombatAttackOpportunities({
      killTimeSeconds: 10,
      mobSpeed: 10,
      mobTier: 2,
      equipmentTier: 1,
    });

    expect(longer).toBeGreaterThan(baseline);
    expect(faster).toBeGreaterThan(baseline);
    expect(undergeared).toBeGreaterThan(baseline);
  });

  it('keeps adjacent tiers viable and penalizes gaps above one tier', () => {
    expect(
      getAutoCombatIncomingDamageMultiplier({
        mobTier: 3,
        equipmentTier: 2,
      }),
    ).toBe(1);
    expect(
      getAutoCombatIncomingDamageMultiplier({
        mobTier: 3,
        equipmentTier: 1,
      }),
    ).toBe(4);
  });

  it('resolves fractional exposure deterministically without losing its average', () => {
    const firstPass = Array.from({ length: 100 }, (_, index) =>
      resolveAutoCombatAttackAttempts({
        attackOpportunities: 2.25,
        combatIndex: index + 1,
      }),
    );
    const secondPass = Array.from({ length: 100 }, (_, index) =>
      resolveAutoCombatAttackAttempts({
        attackOpportunities: 2.25,
        combatIndex: index + 1,
      }),
    );
    const average =
      firstPass.reduce((total, attempts) => total + attempts, 0) /
      firstPass.length;

    expect(secondPass).toEqual(firstPass);
    expect(average).toBeGreaterThanOrEqual(2.2);
    expect(average).toBeLessThanOrEqual(2.3);
  });
});
