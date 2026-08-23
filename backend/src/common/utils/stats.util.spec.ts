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

describe('equipment progression', () => {
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

  it('applies the active milestone to attack, defense and maximum hp', () => {
    const apprentice = calculateFullStats(gameClass, buildEquipment(6, 0));
    const crafted = calculateFullStats(gameClass, buildEquipment(6, 1));

    expect(crafted.derivedCombatStats.attack).toBe(
      Math.round(apprentice.derivedCombatStats.attack * 1.12),
    );
    expect(crafted.derivedCombatStats.defense).toBe(
      Math.round(apprentice.derivedCombatStats.defense * 1.12),
    );
    expect(crafted.derivedCombatStats.maxHp).toBe(
      Math.round(apprentice.derivedCombatStats.maxHp * 1.12),
    );
  });
});
