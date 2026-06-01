import {
  FREE_IDLE_PROGRESS_LIMIT_SECONDS,
  PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS,
} from './membership.config';

export const GATHERING_RATE_BY_TIER: Record<number, number> = {
  1: 90,
  2: 75,
  3: 60,
  4: 50,
  5: 40,
  6: 32,
  7: 26,
  8: 20,
  9: 16,
  10: 12,
};

export const MAX_GATHERING_HOURS_PER_RESOLVE =
  FREE_IDLE_PROGRESS_LIMIT_SECONDS / 3600;
export const MAX_PREMIUM_GATHERING_HOURS_PER_RESOLVE =
  PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS / 3600;

export const GATHERING_LEVEL_CAP = 50;
export const GATHERING_STAT_BONUS_PER_LEVEL = 2;
export const GATHERING_PRODUCTION_BONUS_PER_LEVEL = 0.015;
export const GATHERING_AFFINITY_XP_MULTIPLIER = 1.15;
export const GATHERING_AFFINITY_PRODUCTION_MULTIPLIER = 1.05;

export const GATHERING_XP_PER_UNIT_BY_TIER: Record<number, number> = {
  1: 4,
  2: 6,
  3: 9,
  4: 12,
  5: 16,
  6: 21,
  7: 27,
  8: 34,
  9: 43,
  10: 53,
};

export function getGatheringXpPerUnitForTier(tier: number) {
  const safeTier = Math.max(1, Math.floor(Number(tier) || 1));

  return GATHERING_XP_PER_UNIT_BY_TIER[safeTier] ?? safeTier * 2;
}

export function getGatheringXpToNextLevel(level: number) {
  if (level >= GATHERING_LEVEL_CAP) {
    return null;
  }

  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

  return Math.round(300 + safeLevel * 100 + safeLevel * safeLevel * 15);
}

export function getGatheringRateMultiplier(level: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

  return Number(
    (
      1 +
      Math.max(0, safeLevel - 1) * GATHERING_PRODUCTION_BONUS_PER_LEVEL
    ).toFixed(4),
  );
}

export function getGatheringStatBonus(level: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

  return Math.max(0, safeLevel - 1) * GATHERING_STAT_BONUS_PER_LEVEL;
}

export function getGatheringXpProgressPercent(
  xp: number,
  xpToNextLevel: number | null,
) {
  if (!xpToNextLevel || xpToNextLevel <= 0) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.floor((xp / xpToNextLevel) * 100)));
}
