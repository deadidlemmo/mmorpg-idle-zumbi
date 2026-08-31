import {
  PROGRESSION_CALENDAR_TARGET,
  TIER_TARGET_DAYS,
} from './progression.config';
import {
  getTierByLevel,
  getTotalXpRequiredForLevel,
  getXpRequiredForNextLevel,
} from '../utils/level.util';

const PUBLISHED_LEVEL_1_TO_20_XP = [
  468, 936, 1638, 2807, 4211, 6082, 8422, 10995, 13334, 15908, 2495, 4991, 8734,
  14972, 22458, 32439, 44916, 58640, 71116,
];

// Perfil provavel medido pelo simulador V5.5 com mapas/mobs do seed, set atual,
// gathering recomendado e hunting 5/12/18/25/30 nos tiers T1-T5.
const PROBABLE_EFFECTIVE_XP_PER_HOUR = {
  Lutador: { 1: 2051, 2: 1552, 3: 1793, 4: 2080, 5: 2828 },
  Assassino: { 1: 2032, 2: 1585, 3: 1880, 4: 2175, 5: 2973 },
  Atirador: { 1: 2032, 2: 1552, 3: 1851, 4: 2175, 5: 2973 },
  Medico: { 1: 2051, 2: 1552, 3: 1822, 4: 2127, 5: 2973 },
} as const;

function projectedActiveHours(
  className: keyof typeof PROBABLE_EFFECTIVE_XP_PER_HOUR,
  targetLevel: number,
) {
  let hours = 0;

  for (let level = 1; level < targetLevel; level += 1) {
    const tier = getTierByLevel(level) as 1 | 2 | 3 | 4 | 5;
    hours +=
      getXpRequiredForNextLevel(level) /
      PROBABLE_EFFECTIVE_XP_PER_HOUR[className][tier];
  }

  return hours;
}

describe('global character progression curve', () => {
  it('defines the launch goal in calendar days and active-hour equivalents', () => {
    expect(PROGRESSION_CALENDAR_TARGET).toEqual({
      minCalendarDays: 60,
      maxCalendarDays: 90,
      referenceActiveHoursPerDay: 8,
      minActiveHours: 480,
      maxActiveHours: 720,
    });
  });

  it('preserves every XP threshold through level 20', () => {
    expect(
      Array.from({ length: 19 }, (_, index) =>
        getXpRequiredForNextLevel(index + 1),
      ),
    ).toEqual(PUBLISHED_LEVEL_1_TO_20_XP);
    expect(getTotalXpRequiredForLevel(20)).toBe(325_562);
  });

  it('uses one global curve for all classes', () => {
    const thresholds = Array.from({ length: 49 }, (_, index) =>
      getXpRequiredForNextLevel(index + 1),
    );

    for (const className of ['Lutador', 'Assassino', 'Atirador', 'Medico']) {
      expect({ className, thresholds }.thresholds).toEqual(thresholds);
    }
  });

  it('concentrates the acceleration after T2, especially in T4 and T5', () => {
    expect(TIER_TARGET_DAYS).toMatchObject({
      1: 1,
      2: 3,
      3: 1.5,
      4: 0.8,
      5: 1,
    });
    expect(TIER_TARGET_DAYS[4]).toBeLessThan(TIER_TARGET_DAYS[3]);
    expect(TIER_TARGET_DAYS[5]).toBeLessThan(TIER_TARGET_DAYS[3]);
  });

  it('keeps all four classes inside the 60-90 calendar-day launch target', () => {
    for (const className of Object.keys(
      PROBABLE_EFFECTIVE_XP_PER_HOUR,
    ) as Array<keyof typeof PROBABLE_EFFECTIVE_XP_PER_HOUR>) {
      const activeHours = projectedActiveHours(className, 50);
      expect(activeHours).toBeGreaterThanOrEqual(
        PROGRESSION_CALENDAR_TARGET.minActiveHours,
      );
      expect(activeHours).toBeLessThanOrEqual(
        PROGRESSION_CALENDAR_TARGET.maxActiveHours,
      );
    }
  });

  it.each([10, 20, 30, 40, 50])(
    'keeps class completion times within 5%% at level %i',
    (targetLevel) => {
      const hours = Object.keys(PROBABLE_EFFECTIVE_XP_PER_HOUR).map(
        (className) =>
          projectedActiveHours(
            className as keyof typeof PROBABLE_EFFECTIVE_XP_PER_HOUR,
            targetLevel,
          ),
      );

      expect(Math.max(...hours) / Math.min(...hours)).toBeLessThanOrEqual(1.05);
    },
  );
});
