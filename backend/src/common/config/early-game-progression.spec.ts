import { classDefinitions } from '../../../prisma/seed-data/classes.seed-data';
import {
  equipmentDefinitions,
  starterEquipmentDefinitions,
} from '../../../prisma/seed-data/items.seed-data';
import { mobDefinitions } from '../../../prisma/seed-data/mobs.seed-data';
import { calculateAutoCombatTtk } from '../utils/auto-combat-ttk.util';
import { calculateFullStats } from '../utils/stats.util';

function selectLoadout<T extends { slot: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.slot, item])).values());
}

describe('early game equipment progression', () => {
  it.each(classDefinitions)(
    'makes a complete T1 loadout clearly stronger for $name',
    (gameClass) => {
      const comparisonMob = mobDefinitions.find(
        (mob) => mob.name === 'Síndico Devorado',
      );

      expect(comparisonMob).toBeDefined();

      const starterLoadout = selectLoadout(
        starterEquipmentDefinitions.filter(
          (item) => item.className === gameClass.name,
        ),
      );
      const tierOneLoadout = selectLoadout(
        equipmentDefinitions.filter(
          (item) => item.className === gameClass.name && item.tier === 1,
        ),
      );
      const starterStats = calculateFullStats(gameClass, starterLoadout, 4);
      const tierOneStats = calculateFullStats(gameClass, tierOneLoadout, 4);
      const calculateTtk = (stats: ReturnType<typeof calculateFullStats>) =>
        calculateAutoCombatTtk({
          mob: comparisonMob!,
          playerStats: {
            className: gameClass.name,
            attack: stats.derivedCombatStats.attack,
            speed: stats.derivedCombatStats.speed,
            precision: stats.totalPrimaryStats.precision,
            technique: stats.totalPrimaryStats.technique,
            agility: stats.totalPrimaryStats.agility,
            equipmentTier: stats.equipmentProgression.effectiveTier,
          },
        });
      const starterTtk = calculateTtk(starterStats);
      const tierOneTtk = calculateTtk(tierOneStats);

      expect(tierOneLoadout).toHaveLength(6);
      expect(tierOneStats.equipmentProgression).toMatchObject({
        craftedPieces: 6,
        bonusPercent: 12,
      });
      expect(tierOneTtk.killsPerMinute).toBeGreaterThanOrEqual(
        starterTtk.killsPerMinute * 1.3,
      );
      expect(tierOneStats.derivedCombatStats.defense).toBeGreaterThan(
        starterStats.derivedCombatStats.defense,
      );
      expect(tierOneStats.derivedCombatStats.maxHp).toBeGreaterThan(
        starterStats.derivedCombatStats.maxHp,
      );

      if (gameClass.name === 'Lutador') {
        expect(tierOneTtk.estimatedKillTimeSeconds).toBeLessThanOrEqual(21);
        expect(tierOneTtk.killsPerMinute).toBeGreaterThanOrEqual(2.8);
      }
    },
  );
});
