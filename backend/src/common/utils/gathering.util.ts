import { GATHERING_RATE_BY_TIER } from '../config/gathering.config';
import { FREE_IDLE_PROGRESS_LIMIT_SECONDS } from '../config/membership.config';

type CalculateGatheringRewardParams = {
  elapsedSeconds: number;
  tier: number;
  progressRemainder: number;
  rateMultiplier?: number;
  maxElapsedSeconds?: number;
};

export function calculateGatheringReward({
  elapsedSeconds,
  tier,
  progressRemainder,
  rateMultiplier = 1,
  maxElapsedSeconds = FREE_IDLE_PROGRESS_LIMIT_SECONDS,
}: CalculateGatheringRewardParams) {
  const maxElapsedHours = Math.max(0, maxElapsedSeconds) / 3600;
  const elapsedHours = Math.min(elapsedSeconds / 3600, maxElapsedHours);

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
