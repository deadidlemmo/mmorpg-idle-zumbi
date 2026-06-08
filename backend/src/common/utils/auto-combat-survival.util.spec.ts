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
});
