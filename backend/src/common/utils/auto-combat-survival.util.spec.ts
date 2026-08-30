import {
  getExpectedIncomingDamagePerKill,
  projectAutoCombatSurvival,
} from './auto-combat-survival.util';

describe('auto-combat survival util', () => {
  it('reduces expected damage when player defense increases', () => {
    const lowDefense = getExpectedIncomingDamagePerKill({
      mobAttack: 40,
      mobPrecision: 8,
      mobTechnique: 3,
      playerDefense: 5,
      playerAgility: 8,
    });
    const highDefense = getExpectedIncomingDamagePerKill({
      mobAttack: 40,
      mobPrecision: 8,
      mobTechnique: 3,
      playerDefense: 60,
      playerAgility: 8,
    });

    expect(highDefense.expectedDamagePerKill).toBeLessThan(
      lowDefense.expectedDamagePerKill,
    );
  });

  it('improves survival when player agility increases', () => {
    const slowPlayer = projectAutoCombatSurvival({
      currentHp: 140,
      maxHp: 140,
      playerDefense: 10,
      playerAgility: 1,
      mobAttack: 35,
      mobPrecision: 14,
      mobTechnique: 4,
      projectedKills: 20,
    });
    const agilePlayer = projectAutoCombatSurvival({
      currentHp: 140,
      maxHp: 140,
      playerDefense: 10,
      playerAgility: 60,
      mobAttack: 35,
      mobPrecision: 14,
      mobTechnique: 4,
      projectedKills: 20,
    });

    expect(agilePlayer.expectedDodgeChancePercent).toBeGreaterThan(
      slowPlayer.expectedDodgeChancePercent,
    );
    expect(agilePlayer.safeKillsWithPotions).toBeGreaterThanOrEqual(
      slowPlayer.safeKillsWithPotions,
    );
  });

  it('extends sustainable kills with configured potions', () => {
    const withoutPotion = projectAutoCombatSurvival({
      currentHp: 90,
      maxHp: 120,
      playerDefense: 8,
      playerAgility: 8,
      mobAttack: 32,
      mobPrecision: 8,
      mobTechnique: 2,
      projectedKills: 20,
    });
    const withPotion = projectAutoCombatSurvival({
      currentHp: 90,
      maxHp: 120,
      playerDefense: 8,
      playerAgility: 8,
      mobAttack: 32,
      mobPrecision: 8,
      mobTechnique: 2,
      projectedKills: 20,
      potion: {
        availableQuantity: 3,
        healAmount: 40,
        hpThresholdPercent: 35,
      },
    });

    expect(withPotion.safeKillsWithPotions).toBeGreaterThan(
      withoutPotion.safeKillsWithPotions,
    );
    expect(withPotion.expectedPotionsUsed).toBeGreaterThan(0);
    expect(withPotion.extraKillsFromPotions).toBeGreaterThan(0);
  });

  it('converts longer TTK and equipment gaps into more damage per kill', () => {
    const aligned = getExpectedIncomingDamagePerKill({
      mobAttack: 30,
      mobPrecision: 10,
      mobTechnique: 10,
      mobSpeed: 10,
      mobTier: 2,
      equipmentTier: 2,
      killTimeSeconds: 10,
      playerDefense: 30,
      playerAgility: 10,
    });
    const undergeared = getExpectedIncomingDamagePerKill({
      mobAttack: 30,
      mobPrecision: 10,
      mobTechnique: 10,
      mobSpeed: 10,
      mobTier: 2,
      equipmentTier: 1,
      killTimeSeconds: 14,
      playerDefense: 30,
      playerAgility: 10,
    });

    expect(undergeared.expectedDamagePerAttack).toBe(
      aligned.expectedDamagePerAttack,
    );
    expect(undergeared.expectedAttacksPerKill).toBeGreaterThan(
      aligned.expectedAttacksPerKill,
    );
    expect(undergeared.expectedDamagePerKill).toBeGreaterThan(
      aligned.expectedDamagePerKill,
    );
  });

  it('limits automatic potion use to one dose per kill', () => {
    const projection = projectAutoCombatSurvival({
      currentHp: 120,
      maxHp: 120,
      playerDefense: 0,
      playerAgility: 0,
      mobAttack: 20,
      mobPrecision: 20,
      mobTechnique: 10,
      mobSpeed: 30,
      mobTier: 2,
      equipmentTier: 1,
      killTimeSeconds: 60,
      projectedKills: 3,
      potion: {
        availableQuantity: 20,
        healAmount: 30,
        hpThresholdPercent: 90,
      },
    });

    expect(projection.expectedAttacksPerKill).toBeGreaterThan(3);
    expect(projection.expectedPotionsUsed).toBeLessThanOrEqual(3);
  });
});
