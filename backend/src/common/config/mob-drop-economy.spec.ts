import {
  getAutoCombatDropYieldMultiplier,
  mobDropTables,
} from '../../../prisma/seed-data/mob-drops.seed-data';
import {
  getActiveAutoCombatMobRank,
  isActiveAutoCombatMob,
  mobBaseDefinitions,
} from '../../../prisma/seed-data/mobs.seed-data';

function getActiveTierMobs(tier: number) {
  return mobBaseDefinitions
    .filter((mob) => mob.tier === tier && isActiveAutoCombatMob(mob))
    .sort(
      (a, b) =>
        (getActiveAutoCombatMobRank(a) ?? 0) -
        (getActiveAutoCombatMobRank(b) ?? 0),
    );
}

describe('auto-combat drop economy progression', () => {
  it('applies the calibrated T2 and T4 position multipliers', () => {
    expect(getActiveTierMobs(2).map(getAutoCombatDropYieldMultiplier)).toEqual([
      2, 2, 3, 3, 4.5, 4.5,
    ]);
    expect(getActiveTierMobs(4).map(getAutoCombatDropYieldMultiplier)).toEqual([
      2, 2, 2.5, 2.5, 3.4, 3.4,
    ]);
    expect(getActiveTierMobs(5).map(getAutoCombatDropYieldMultiplier)).toEqual([
      1.3, 1.3, 1.3, 1.3, 1.3, 1.3,
    ]);
  });

  it('does not change the other launch tiers', () => {
    for (const tier of [1, 3]) {
      expect(
        getActiveTierMobs(tier).map(getAutoCombatDropYieldMultiplier),
      ).toEqual([1, 1, 1, 1, 1, 1]);
    }
  });

  it('keeps every canonical drop chance and quantity valid', () => {
    for (const table of mobDropTables) {
      for (const drop of table.drops) {
        expect(drop.dropChance).toBeGreaterThan(0);
        expect(drop.dropChance).toBeLessThanOrEqual(100);
        expect(Number.isInteger(drop.minQuantity)).toBe(true);
        expect(Number.isInteger(drop.maxQuantity)).toBe(true);
        expect(drop.minQuantity).toBeGreaterThanOrEqual(1);
        expect(drop.maxQuantity).toBeGreaterThanOrEqual(drop.minQuantity);
      }
    }
  });
});
