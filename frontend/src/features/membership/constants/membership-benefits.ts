export const MEMBERSHIP_BENEFIT_VALUES = {
  xpBonusPercent: 20,
  freeIdleHours: 6,
  premiumIdleHours: 12,
} as const;

export const MEMBERSHIP_BENEFIT_LABELS = {
  xpBonus: `+${MEMBERSHIP_BENEFIT_VALUES.xpBonusPercent}%`,
  freeIdleLimit: `${MEMBERSHIP_BENEFIT_VALUES.freeIdleHours} horas`,
  premiumIdleLimit: `${MEMBERSHIP_BENEFIT_VALUES.premiumIdleHours} horas`,
} as const;
