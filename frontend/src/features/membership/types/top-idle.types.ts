export interface TopIdleRewardStatus {
  enabled: boolean;
  voteUrl?: string | null;
  reward: {
    premiumDays: number;
    cooldownHours: number;
  };
  canReceiveReward: boolean;
  nextRewardAt?: string | null;
  lastRewardAt?: string | null;
  premiumUntil?: string | null;
}
