import { calculateFullStats, getEquipmentProgression } from './stats.util';

const gameClass = {
  name: 'Lutador',
  baseStrength: 50,
  baseVitality: 10,
  baseAgility: 10,
  basePrecision: 10,
  baseTechnique: 10,
  baseWillpower: 10,
};

function buildEquipment(count: number, tier = 1) {
  return Array.from({ length: count }, () => ({ tier }));
}

function buildStatEquipment(count: number, tier = 1, enhancementLevel = 0) {
  return Array.from({ length: count }, () => ({
    tier,
    enhancementLevel,
    strengthBonus: 10,
    vitalityBonus: 10,
    agilityBonus: 10,
    precisionBonus: 10,
    techniqueBonus: 10,
    willpowerBonus: 10,
  }));
}

describe('equipment progression', () => {
  it('normalizes the Assassino opening without changing later levels', () => {
    const assassinClass = {
      name: 'Assassino',
      baseStrength: 5,
      baseVitality: 2,
      baseAgility: 8,
      basePrecision: 8,
      baseTechnique: 5,
      baseWillpower: 2,
    };

    expect(
      calculateFullStats(assassinClass, [], 1).derivedCombatStats.attack,
    ).toBe(17);
    expect(
      calculateFullStats(assassinClass, [], 2).derivedCombatStats.attack,
    ).toBe(20);
  });

  it('unlocks combat bonuses at two, four and six crafted pieces', () => {
    expect(getEquipmentProgression(buildEquipment(1))).toMatchObject({
      craftedPieces: 1,
      bonusPercent: 0,
      nextMilestone: 2,
    });
    expect(getEquipmentProgression(buildEquipment(2))).toMatchObject({
      craftedPieces: 2,
      bonusPercent: 4,
      nextMilestone: 4,
    });
    expect(getEquipmentProgression(buildEquipment(4))).toMatchObject({
      craftedPieces: 4,
      bonusPercent: 8,
      nextMilestone: 6,
    });
    expect(getEquipmentProgression(buildEquipment(6))).toMatchObject({
      craftedPieces: 6,
      bonusPercent: 12,
      nextMilestone: null,
    });
  });

  it('does not count apprentice equipment as crafted progression', () => {
    expect(getEquipmentProgression(buildEquipment(6, 0))).toMatchObject({
      craftedPieces: 0,
      bonusPercent: 0,
    });
  });

  it('requires pieces from the same tier for set milestones', () => {
    const mixedProgression = getEquipmentProgression([
      ...buildEquipment(3, 1),
      ...buildEquipment(3, 2),
    ]);

    expect(mixedProgression).toMatchObject({
      craftedPieces: 6,
      coherentPieces: 3,
      coherentTier: 2,
      activeMilestone: 2,
      nextMilestone: 4,
      bonusPercent: 4,
      averageTier: 1.5,
    });
  });

  it('counts reinforcement as partial tier readiness', () => {
    expect(getEquipmentProgression(buildStatEquipment(6, 2, 3))).toMatchObject({
      averageTier: 2,
      averageEnhancementLevel: 3,
      effectiveTier: 2.75,
    });
  });

  it('applies the milestone only to equipment stats', () => {
    const apprenticeAtLevelOne = calculateFullStats(
      gameClass,
      buildEquipment(6, 0),
      1,
    );
    const craftedAtLevelOne = calculateFullStats(
      gameClass,
      buildStatEquipment(6, 1),
      1,
    );
    const apprenticeAtLevelFifty = calculateFullStats(
      gameClass,
      buildEquipment(6, 0),
      50,
    );
    const craftedAtLevelFifty = calculateFullStats(
      gameClass,
      buildStatEquipment(6, 1),
      50,
    );

    expect(craftedAtLevelOne.equipmentBonusStats).toEqual({
      strength: 67,
      vitality: 67,
      agility: 67,
      precision: 67,
      technique: 67,
      willpower: 67,
    });
    expect(
      craftedAtLevelOne.derivedCombatStats.attack -
        apprenticeAtLevelOne.derivedCombatStats.attack,
    ).toBe(
      craftedAtLevelFifty.derivedCombatStats.attack -
        apprenticeAtLevelFifty.derivedCombatStats.attack,
    );
    expect(
      craftedAtLevelOne.derivedCombatStats.maxHp -
        apprenticeAtLevelOne.derivedCombatStats.maxHp,
    ).toBe(
      craftedAtLevelFifty.derivedCombatStats.maxHp -
        apprenticeAtLevelFifty.derivedCombatStats.maxHp,
    );
  });

  it('does not apply a lower-tier milestone to equipment from another tier', () => {
    const stats = calculateFullStats(
      gameClass,
      [
        ...buildStatEquipment(4, 1),
        ...buildStatEquipment(2, 5).map((item) => ({
          ...item,
          strengthBonus: 100,
        })),
      ],
      1,
    );

    expect(stats.equipmentProgression).toMatchObject({
      coherentTier: 1,
      coherentPieces: 4,
      bonusPercent: 8,
    });
    expect(stats.equipmentBonusStats.strength).toBe(243);
  });
});
