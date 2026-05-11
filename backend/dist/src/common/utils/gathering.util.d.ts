type CalculateGatheringRewardParams = {
    elapsedSeconds: number;
    tier: number;
    progressRemainder: number;
    rateMultiplier?: number;
};
export declare function calculateGatheringReward({ elapsedSeconds, tier, progressRemainder, rateMultiplier, }: CalculateGatheringRewardParams): {
    quantity: number;
    newProgressRemainder: number;
    elapsedHours: number;
    ratePerHour: number;
    rawAmount: number;
};
export {};
