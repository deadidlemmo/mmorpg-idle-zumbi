import {
    GATHERING_RATE_BY_TIER,
    MAX_GATHERING_HOURS_PER_RESOLVE,
} from '../config/gathering.config';

type CalculateGatheringRewardParams = {
  elapsedSeconds: number;
  tier: number;
  progressRemainder: number;
  rateMultiplier?: number;
};

export function calculateGatheringReward({
  elapsedSeconds,
  tier,
  progressRemainder,
  rateMultiplier = 1,
}: CalculateGatheringRewardParams) {
  const elapsedHours = Math.min(
    elapsedSeconds / 3600,
    MAX_GATHERING_HOURS_PER_RESOLVE,
  );

  const ratePerHour = GATHERING_RATE_BY_TIER[tier] ?? 1;

  const rawAmount =
    elapsedHours * ratePerHour * rateMultiplier + progressRemainder;

  const quantity = Math.floor(rawAmount);
  const newProgressRemainder = rawAmount - quantity;

  return {
    quantity,
    newProgressRemainder,
    elapsedHours,
    ratePerHour,
    rawAmount,
  };
}