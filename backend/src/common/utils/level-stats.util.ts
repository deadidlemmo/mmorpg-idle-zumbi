export type PrimaryStatKey =
  | 'strength'
  | 'vitality'
  | 'agility'
  | 'precision'
  | 'technique'
  | 'willpower';

export type PrimaryStats = Record<PrimaryStatKey, number>;

export type ClassStatAffinity = {
  primary: [PrimaryStatKey, PrimaryStatKey];
  secondary: [PrimaryStatKey, PrimaryStatKey];
  ignored: [PrimaryStatKey, PrimaryStatKey];
  hpBonus: number;
};

export const LEVEL_ONE_TOTAL_POINTS = 30;
export const LEVEL_UP_TOTAL_POINTS = 6;

export const PRIMARY_STAT_LEVEL_GAIN = 2;
export const SECONDARY_STAT_LEVEL_GAIN = 1;

export const LEVEL_ONE_PRIMARY_STAT_VALUE = 8;
export const LEVEL_ONE_SECONDARY_STAT_VALUE = 5;
export const LEVEL_ONE_IGNORED_STAT_VALUE = 2;

export const CLASS_STAT_AFFINITY: Record<string, ClassStatAffinity> = {
  Lutador: {
    primary: ['strength', 'vitality'],
    secondary: ['technique', 'willpower'],
    ignored: ['agility', 'precision'],
    hpBonus: 35,
  },

  Assassino: {
    primary: ['agility', 'precision'],
    secondary: ['technique', 'strength'],
    ignored: ['vitality', 'willpower'],
    hpBonus: 0,
  },

  Atirador: {
    primary: ['precision', 'agility'],
    secondary: ['strength', 'technique'],
    ignored: ['vitality', 'willpower'],
    hpBonus: 10,
  },

  Médico: {
    primary: ['technique', 'willpower'],
    secondary: ['vitality', 'precision'],
    ignored: ['strength', 'agility'],
    hpBonus: 20,
  },
};

export function createEmptyPrimaryStats(): PrimaryStats {
  return {
    strength: 0,
    vitality: 0,
    agility: 0,
    precision: 0,
    technique: 0,
    willpower: 0,
  };
}

export function getClassStatAffinity(className: string): ClassStatAffinity {
  const affinity = CLASS_STAT_AFFINITY[className];

  if (!affinity) {
    throw new Error(`Afinidade de atributos não configurada para ${className}.`);
  }

  return affinity;
}

export function calculateLevelOneStatsByClass(className: string): PrimaryStats {
  const affinity = getClassStatAffinity(className);

  const stats = createEmptyPrimaryStats();

  for (const stat of affinity.primary) {
    stats[stat] = LEVEL_ONE_PRIMARY_STAT_VALUE;
  }

  for (const stat of affinity.secondary) {
    stats[stat] = LEVEL_ONE_SECONDARY_STAT_VALUE;
  }

  for (const stat of affinity.ignored) {
    stats[stat] = LEVEL_ONE_IGNORED_STAT_VALUE;
  }

  return stats;
}

export function calculateLevelBonusStatsByClass(
  className: string,
  level: number,
): PrimaryStats {
  const safeLevel = Math.max(1, level);
  const levelUps = safeLevel - 1;

  const affinity = getClassStatAffinity(className);

  const stats = createEmptyPrimaryStats();

  for (const stat of affinity.primary) {
    stats[stat] += levelUps * PRIMARY_STAT_LEVEL_GAIN;
  }

  for (const stat of affinity.secondary) {
    stats[stat] += levelUps * SECONDARY_STAT_LEVEL_GAIN;
  }

  return stats;
}

export function calculateClassStatsAtLevel(
  className: string,
  level: number,
): PrimaryStats {
  const levelOneStats = calculateLevelOneStatsByClass(className);
  const levelBonusStats = calculateLevelBonusStatsByClass(className, level);

  return {
    strength: levelOneStats.strength + levelBonusStats.strength,
    vitality: levelOneStats.vitality + levelBonusStats.vitality,
    agility: levelOneStats.agility + levelBonusStats.agility,
    precision: levelOneStats.precision + levelBonusStats.precision,
    technique: levelOneStats.technique + levelBonusStats.technique,
    willpower: levelOneStats.willpower + levelBonusStats.willpower,
  };
}

export function getClassHpBonus(className: string): number {
  return getClassStatAffinity(className).hpBonus;
}

export function addPrimaryStats(
  baseStats: PrimaryStats,
  bonusStats: PrimaryStats,
): PrimaryStats {
  return {
    strength: baseStats.strength + bonusStats.strength,
    vitality: baseStats.vitality + bonusStats.vitality,
    agility: baseStats.agility + bonusStats.agility,
    precision: baseStats.precision + bonusStats.precision,
    technique: baseStats.technique + bonusStats.technique,
    willpower: baseStats.willpower + bonusStats.willpower,
  };
}