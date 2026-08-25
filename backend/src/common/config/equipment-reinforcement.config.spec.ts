import {
  buildReinforcedEquipmentStats,
  EQUIPMENT_REINFORCEMENT_CONFIG,
  getEquipmentBaseStatBudget,
  getEquipmentReinforcementStatBudget,
  type EquipmentReinforcementSlot,
  type EquipmentReinforcementStats,
} from './economy.config';

const slots: EquipmentReinforcementSlot[] = [
  'MAIN_HAND',
  'OFF_HAND',
  'HEAD',
  'ARMOR',
  'PANTS',
  'BOOTS',
];

function buildRepresentativeBaseStats(
  total: number,
): EquipmentReinforcementStats {
  return {
    strengthBonus: Math.ceil(total * 0.4),
    vitalityBonus: Math.floor(total * 0.35),
    agilityBonus: 0,
    precisionBonus: 0,
    techniqueBonus: Math.max(
      0,
      total - Math.ceil(total * 0.4) - Math.floor(total * 0.35),
    ),
    willpowerBonus: 0,
  };
}

describe('equipment reinforcement balance', () => {
  it.each([1, 2, 3, 4] as const)(
    'mantem T%s+3 acima do proximo tier base e abaixo do proximo tier +1',
    (tier) => {
      for (const slot of slots) {
        const baseStats = buildRepresentativeBaseStats(
          getEquipmentBaseStatBudget(tier, slot),
        );
        const nextBaseStats = buildRepresentativeBaseStats(
          getEquipmentBaseStatBudget(tier + 1, slot),
        );
        const reinforcedThree = getEquipmentReinforcementStatBudget(
          baseStats,
          tier,
          slot,
          3,
        );
        const nextBase = getEquipmentBaseStatBudget(tier + 1, slot);
        const nextPlusOne = getEquipmentReinforcementStatBudget(
          nextBaseStats,
          tier + 1,
          slot,
          1,
        );

        expect(reinforcedThree).toBeGreaterThan(nextBase);
        expect(nextPlusOne).toBeGreaterThan(reinforcedThree);
      }
    },
  );

  it('cresce os atributos a cada reforco e preserva o total calculado', () => {
    const baseStats = buildRepresentativeBaseStats(8);
    let previousTotal = 8;

    for (const level of [1, 2, 3]) {
      const stats = buildReinforcedEquipmentStats(baseStats, 1, 'ARMOR', level);
      const total = Object.values(stats).reduce((sum, value) => sum + value, 0);

      expect(total).toBe(
        getEquipmentReinforcementStatBudget(baseStats, 1, 'ARMOR', level),
      );
      expect(total).toBeGreaterThan(previousTotal);
      previousTotal = total;
    }
  });

  it('mantem custos incrementais e positivos do T1 ao T5', () => {
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const levels: ReadonlyArray<{
        level: number;
        fragmentCost: number;
        goldCost: number;
      }> = EQUIPMENT_REINFORCEMENT_CONFIG[tier].levels;
      expect(levels.map((entry) => entry.level)).toEqual([1, 2, 3]);
      expect(levels.every((entry) => entry.fragmentCost > 0)).toBe(true);
      expect(levels.every((entry) => entry.goldCost > 0)).toBe(true);
    }
  });
});
