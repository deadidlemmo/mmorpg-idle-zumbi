export const INCURSION_APPROACHES = [
  'CAUTIOUS',
  'BALANCED',
  'AGGRESSIVE',
] as const;

export const INCURSION_SUCCESS_ENTRY_REFUND_PERCENT = 100;
export const INCURSION_FAILURE_ENTRY_REFUND_PERCENT = 90;

export type IncursionApproach = (typeof INCURSION_APPROACHES)[number];

export type IncursionRiskProfile = {
  approach: IncursionApproach;
  successChance: number;
  rewardMultiplier: number;
  durationMultiplier: number;
  failureHpRatio: number;
};

const APPROACH_MODIFIERS: Record<
  IncursionApproach,
  Omit<IncursionRiskProfile, 'approach' | 'successChance'> & {
    chanceModifier: number;
  }
> = {
  CAUTIOUS: {
    chanceModifier: 12,
    rewardMultiplier: 0.8,
    durationMultiplier: 1.25,
    failureHpRatio: 0.1,
  },
  BALANCED: {
    chanceModifier: 0,
    rewardMultiplier: 1,
    durationMultiplier: 1,
    failureHpRatio: 0.16,
  },
  AGGRESSIVE: {
    chanceModifier: -15,
    rewardMultiplier: 1.35,
    durationMultiplier: 0.75,
    failureHpRatio: 0.22,
  },
};

export function getIncursionRiskProfile(
  riskLevel: number,
  approach: IncursionApproach = 'BALANCED',
): IncursionRiskProfile {
  const safeRiskLevel = Math.min(10, Math.max(1, Math.round(riskLevel || 1)));
  const modifiers = APPROACH_MODIFIERS[approach];
  const baseChance = Math.min(95, Math.max(40, 96 - safeRiskLevel * 5));

  return {
    approach,
    successChance: Math.min(
      98,
      Math.max(25, baseChance + modifiers.chanceModifier),
    ),
    rewardMultiplier: modifiers.rewardMultiplier,
    durationMultiplier: modifiers.durationMultiplier,
    failureHpRatio: Math.min(
      0.5,
      modifiers.failureHpRatio + safeRiskLevel * 0.012,
    ),
  };
}

export function calculateIncursionFailureDamage(
  maxHp: number,
  riskLevel: number,
  approach: IncursionApproach,
) {
  const profile = getIncursionRiskProfile(riskLevel, approach);
  return Math.max(1, Math.round(Math.max(1, maxHp) * profile.failureHpRatio));
}

export function calculateIncursionSuccessEntryRefund(goldCostPaid: number) {
  return calculateIncursionEntryRefund(
    goldCostPaid,
    INCURSION_SUCCESS_ENTRY_REFUND_PERCENT,
  );
}

export function calculateIncursionFailureEntryRefund(goldCostPaid: number) {
  return calculateIncursionEntryRefund(
    goldCostPaid,
    INCURSION_FAILURE_ENTRY_REFUND_PERCENT,
  );
}

function calculateIncursionEntryRefund(
  goldCostPaid: number,
  refundPercent: number,
) {
  const safeGoldCost = Math.max(0, Math.floor(Number(goldCostPaid) || 0));

  return Math.floor((safeGoldCost * refundPercent) / 100);
}
