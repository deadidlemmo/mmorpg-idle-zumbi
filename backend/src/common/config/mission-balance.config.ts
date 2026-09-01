import { getTierByLevel } from '../utils/level.util';

export const MISSION_BALANCE_TIERS = [1, 2, 3, 4, 5] as const;

export type MissionBalanceTier = (typeof MISSION_BALANCE_TIERS)[number];

type MissionReward = {
  gold: number;
  xp: number;
};

type MissionRewardMatrix = Record<
  string,
  Record<MissionBalanceTier, MissionReward>
>;

export const MISSION_REWARD_MATRIX: MissionRewardMatrix = {
  'story-first-supplies': {
    1: { gold: 40, xp: 80 },
    2: { gold: 80, xp: 160 },
    3: { gold: 180, xp: 320 },
    4: { gold: 320, xp: 560 },
    5: { gold: 600, xp: 880 },
  },
  'daily-clear-threats': {
    1: { gold: 70, xp: 120 },
    2: { gold: 140, xp: 240 },
    3: { gold: 300, xp: 480 },
    4: { gold: 550, xp: 840 },
    5: { gold: 950, xp: 1_320 },
  },
  'daily-field-crafting': {
    1: { gold: 110, xp: 90 },
    2: { gold: 900, xp: 180 },
    3: { gold: 3_200, xp: 360 },
    4: { gold: 5_000, xp: 630 },
    5: { gold: 13_000, xp: 990 },
  },
  'daily-incursion-return': {
    1: { gold: 100, xp: 180 },
    2: { gold: 180, xp: 360 },
    3: { gold: 350, xp: 720 },
    4: { gold: 650, xp: 1_260 },
    5: { gold: 1_100, xp: 1_980 },
  },
  'weekly-stockpile': {
    1: { gold: 500, xp: 900 },
    2: { gold: 1_000, xp: 1_800 },
    3: { gold: 2_200, xp: 3_600 },
    4: { gold: 3_800, xp: 6_300 },
    5: { gold: 7_000, xp: 9_900 },
  },
  'weekly-clear-horde': {
    1: { gold: 210, xp: 360 },
    2: { gold: 420, xp: 720 },
    3: { gold: 900, xp: 1_440 },
    4: { gold: 1_650, xp: 2_520 },
    5: { gold: 2_850, xp: 3_960 },
  },
  'weekly-incursion-patrol': {
    1: { gold: 200, xp: 360 },
    2: { gold: 360, xp: 720 },
    3: { gold: 700, xp: 1_440 },
    4: { gold: 1_300, xp: 2_520 },
    5: { gold: 2_200, xp: 3_960 },
  },
  'monthly-stockpile': {
    1: { gold: 1_500, xp: 2_700 },
    2: { gold: 3_000, xp: 5_400 },
    3: { gold: 6_600, xp: 10_800 },
    4: { gold: 11_400, xp: 18_900 },
    5: { gold: 21_000, xp: 29_700 },
  },
  'monthly-eradication': {
    1: { gold: 350, xp: 600 },
    2: { gold: 700, xp: 1_200 },
    3: { gold: 1_500, xp: 2_400 },
    4: { gold: 2_750, xp: 4_200 },
    5: { gold: 4_750, xp: 6_600 },
  },
  'monthly-incursion-campaign': {
    1: { gold: 300, xp: 540 },
    2: { gold: 540, xp: 1_080 },
    3: { gold: 1_050, xp: 2_160 },
    4: { gold: 1_950, xp: 3_780 },
    5: { gold: 3_300, xp: 5_940 },
  },
};

const FALLBACK_GOLD_MULTIPLIER: Record<MissionBalanceTier, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 12,
};

const FALLBACK_XP_MULTIPLIER: Record<MissionBalanceTier, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 11,
};

export function getMissionBalanceTier(level: number): MissionBalanceTier {
  const tier = Math.min(5, Math.max(1, getTierByLevel(level)));
  return tier as MissionBalanceTier;
}

export function getMissionReward(params: {
  missionKey: string;
  tier: number;
  baseGold: number;
  baseXp: number;
}): MissionReward & { tier: MissionBalanceTier } {
  const tier = Math.min(
    5,
    Math.max(1, Math.floor(params.tier || 1)),
  ) as MissionBalanceTier;
  const configured = MISSION_REWARD_MATRIX[params.missionKey]?.[tier];

  if (configured) {
    return { tier, gold: configured.gold, xp: configured.xp };
  }

  return {
    tier,
    gold: Math.max(
      0,
      Math.round(params.baseGold * FALLBACK_GOLD_MULTIPLIER[tier]),
    ),
    xp: Math.max(0, Math.round(params.baseXp * FALLBACK_XP_MULTIPLIER[tier])),
  };
}
