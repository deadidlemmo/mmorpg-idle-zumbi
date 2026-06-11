export type MobType = 'MONSTER' | 'ELITE';

export type MobCombatProfile =
  | 'balanced'
  | 'agile'
  | 'resistant'
  | 'offensive'
  | 'elite';

export type MobStatsInput = {
  tier: number;
  level: number;
  mobName: string;
  mobType: MobType;
  autoCombatRank?: number | null;
};

export type MobCombatStats = {
  level: number;
  tier: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  xpReward: number;
};

type MobStatPreset = {
  hpMin: number;
  hpMax: number;
  attackMin: number;
  attackMax: number;
  defenseMin: number;
  defenseMax: number;
  speedMin: number;
  speedMax: number;
  xpMin: number;
  xpMax: number;
};

type MobTierPressure = {
  hp: number;
  attack: number;
  defense: number;
  xpReward: number;
};

export const mobStatPresetsByTier: Record<number, MobStatPreset> = {
  1: {
    hpMin: 45,
    hpMax: 145,
    attackMin: 7,
    attackMax: 22,
    defenseMin: 2,
    defenseMax: 10,
    speedMin: 3,
    speedMax: 12,
    xpMin: 7,
    xpMax: 11,
  },
  2: {
    hpMin: 130,
    hpMax: 300,
    attackMin: 20,
    attackMax: 44,
    defenseMin: 8,
    defenseMax: 22,
    speedMin: 7,
    speedMax: 18,
    xpMin: 12,
    xpMax: 18,
  },
  3: {
    hpMin: 270,
    hpMax: 540,
    attackMin: 36,
    attackMax: 72,
    defenseMin: 16,
    defenseMax: 38,
    speedMin: 10,
    speedMax: 22,
    xpMin: 22,
    xpMax: 32,
  },
  4: {
    hpMin: 480,
    hpMax: 880,
    attackMin: 60,
    attackMax: 110,
    defenseMin: 28,
    defenseMax: 58,
    speedMin: 13,
    speedMax: 26,
    xpMin: 36,
    xpMax: 50,
  },
  5: {
    hpMin: 760,
    hpMax: 1320,
    attackMin: 92,
    attackMax: 164,
    defenseMin: 44,
    defenseMax: 86,
    speedMin: 16,
    speedMax: 30,
    xpMin: 56,
    xpMax: 76,
  },
  6: {
    hpMin: 1100,
    hpMax: 1900,
    attackMin: 132,
    attackMax: 230,
    defenseMin: 64,
    defenseMax: 120,
    speedMin: 18,
    speedMax: 34,
    xpMin: 84,
    xpMax: 112,
  },
  7: {
    hpMin: 1580,
    hpMax: 2700,
    attackMin: 186,
    attackMax: 320,
    defenseMin: 92,
    defenseMax: 170,
    speedMin: 20,
    speedMax: 38,
    xpMin: 124,
    xpMax: 164,
  },
  8: {
    hpMin: 2240,
    hpMax: 3800,
    attackMin: 260,
    attackMax: 440,
    defenseMin: 130,
    defenseMax: 235,
    speedMin: 22,
    speedMax: 42,
    xpMin: 180,
    xpMax: 235,
  },
  9: {
    hpMin: 3160,
    hpMax: 5300,
    attackMin: 360,
    attackMax: 600,
    defenseMin: 182,
    defenseMax: 320,
    speedMin: 24,
    speedMax: 46,
    xpMin: 260,
    xpMax: 335,
  },
  10: {
    hpMin: 4400,
    hpMax: 7600,
    attackMin: 500,
    attackMax: 840,
    defenseMin: 252,
    defenseMax: 440,
    speedMin: 26,
    speedMax: 50,
    xpMin: 370,
    xpMax: 480,
  },
};

export const mobTierPressureByTier: Record<number, MobTierPressure> = {
  1: {
    hp: 1.05,
    attack: 1,
    defense: 1,
    xpReward: 1,
  },
  2: {
    hp: 1.3,
    attack: 1.25,
    defense: 1.15,
    xpReward: 1,
  },
  3: {
    hp: 1.9,
    attack: 1.9,
    defense: 1.45,
    xpReward: 1,
  },
  4: {
    hp: 2.1,
    attack: 2.05,
    defense: 1.6,
    xpReward: 1,
  },
  5: {
    hp: 2.25,
    attack: 2.2,
    defense: 1.75,
    xpReward: 1,
  },
  6: {
    hp: 2.4,
    attack: 2.3,
    defense: 1.85,
    xpReward: 1,
  },
  7: {
    hp: 2.55,
    attack: 2.4,
    defense: 1.95,
    xpReward: 1,
  },
  8: {
    hp: 2.7,
    attack: 2.5,
    defense: 2.05,
    xpReward: 1,
  },
  9: {
    hp: 2.85,
    attack: 2.6,
    defense: 2.15,
    xpReward: 1,
  },
  10: {
    hp: 3,
    attack: 2.7,
    defense: 2.25,
    xpReward: 1,
  },
};

export const mobProfileMultipliers: Record<
  MobCombatProfile,
  Omit<MobCombatStats, 'level' | 'tier'>
> = {
  balanced: {
    hp: 1,
    attack: 1,
    defense: 1,
    speed: 1,
    xpReward: 1,
  },
  agile: {
    hp: 0.78,
    attack: 1.05,
    defense: 0.75,
    speed: 1.22,
    xpReward: 1,
  },
  resistant: {
    hp: 1.2,
    attack: 0.96,
    defense: 1.22,
    speed: 0.82,
    xpReward: 1.05,
  },
  offensive: {
    hp: 0.95,
    attack: 1.18,
    defense: 0.9,
    speed: 1.02,
    xpReward: 1.03,
  },
  elite: {
    hp: 1.28,
    attack: 1.18,
    defense: 1.2,
    speed: 0.88,
    xpReward: 1.38,
  },
};

export const activeAutoCombatRankMultipliers: Record<
  number,
  Omit<MobCombatStats, 'level' | 'tier'>
> = {
  1: {
    hp: 0.9,
    attack: 0.42,
    defense: 0.85,
    speed: 0.9,
    xpReward: 0.88,
  },
  2: {
    hp: 0.96,
    attack: 0.5,
    defense: 0.88,
    speed: 1,
    xpReward: 0.96,
  },
  3: {
    hp: 1.04,
    attack: 0.54,
    defense: 1.02,
    speed: 0.96,
    xpReward: 1.06,
  },
  4: {
    hp: 1.08,
    attack: 0.62,
    defense: 1,
    speed: 1.08,
    xpReward: 1.16,
  },
  5: {
    hp: 1.18,
    attack: 0.7,
    defense: 1.16,
    speed: 1.04,
    xpReward: 1.28,
  },
  6: {
    hp: 1.35,
    attack: 0.86,
    defense: 1.28,
    speed: 1.1,
    xpReward: 1.62,
  },
};

const agileKeywords = [
  'aranha',
  'barata',
  'besouro',
  'caranguejo',
  'carrapato',
  'centopeia',
  'cervideo',
  'cao',
  'escorpiao',
  'farejador',
  'gato',
  'lacraia',
  'larva',
  'lesma',
  'morcego',
  'mosca',
  'predador',
  'rato',
  'salamandra',
  'sanguessuga',
];

const resistantKeywords = [
  'amontoado',
  'besta',
  'carcaca',
  'cobaia',
  'colosso',
  'corpo-parede',
  'corpo saturado',
  'forjado',
  'forma primaria',
  'gemeos',
  'guardiao',
  'soberano',
  'tanque',
  'turbina',
];

const offensiveKeywords = [
  'arameiro',
  'cacador',
  'cobrador',
  'instrumentador',
  'mandibulado',
  'motorista',
  'oficial',
  'operador',
  'sentinela',
  'serafim',
  'sinaleiro',
  'soldador',
];

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase();
}

function includesAnyKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function lerp(min: number, max: number, factor: number): number {
  return min + (max - min) * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundStat(value: number): number {
  return Math.max(1, Math.round(value));
}

export function inferMobCombatProfile(input: {
  mobName: string;
  mobType: MobType;
}): MobCombatProfile {
  if (input.mobType === 'ELITE') {
    return 'elite';
  }

  const normalizedName = normalizeSearchText(input.mobName);

  if (includesAnyKeyword(normalizedName, agileKeywords)) {
    return 'agile';
  }

  if (includesAnyKeyword(normalizedName, resistantKeywords)) {
    return 'resistant';
  }

  if (includesAnyKeyword(normalizedName, offensiveKeywords)) {
    return 'offensive';
  }

  return 'balanced';
}

export function buildMobCombatStats(input: MobStatsInput): MobCombatStats {
  const preset = mobStatPresetsByTier[input.tier];

  if (!preset) {
    throw new Error(`Preset de stats ausente para o tier ${input.tier}.`);
  }

  const tierStartLevel = (input.tier - 1) * 10 + 1;
  const tierProgress = clamp((input.level - tierStartLevel) / 9, 0, 1);
  const profile = inferMobCombatProfile(input);
  const activeRank = Math.max(
    0,
    Math.floor(Number(input.autoCombatRank) || 0),
  );
  const multiplier =
    activeAutoCombatRankMultipliers[activeRank] ??
    mobProfileMultipliers[profile];
  const tierPressure =
    mobTierPressureByTier[input.tier] ?? mobTierPressureByTier[10];

  return {
    level: input.level,
    tier: input.tier,
    hp: roundStat(
      lerp(preset.hpMin, preset.hpMax, tierProgress) *
        multiplier.hp *
        tierPressure.hp,
    ),
    attack: roundStat(
      lerp(preset.attackMin, preset.attackMax, tierProgress) *
        multiplier.attack *
        tierPressure.attack,
    ),
    defense: roundStat(
      lerp(preset.defenseMin, preset.defenseMax, tierProgress) *
        multiplier.defense *
        tierPressure.defense,
    ),
    speed: roundStat(
      lerp(preset.speedMin, preset.speedMax, tierProgress) * multiplier.speed,
    ),
    xpReward: roundStat(
      lerp(preset.xpMin, preset.xpMax, tierProgress) *
        multiplier.xpReward *
        tierPressure.xpReward,
    ),
  };
}
