import { PREMIUM_XP_BONUS_MULTIPLIER } from '../config/membership.config';

type PremiumUserLike =
  | {
      premiumUntil?: Date | string | null;
    }
  | null
  | undefined;

export function isPremiumActive(user: PremiumUserLike, now = new Date()) {
  if (!user?.premiumUntil) {
    return false;
  }

  const premiumUntil =
    user.premiumUntil instanceof Date
      ? user.premiumUntil
      : new Date(user.premiumUntil);

  return !Number.isNaN(premiumUntil.getTime()) && premiumUntil > now;
}

export function applyPremiumXpBonus(baseXp: number, isPremium: boolean) {
  const safeBaseXp = Math.max(0, Math.floor(baseXp));

  if (!isPremium || safeBaseXp <= 0) {
    return safeBaseXp;
  }

  return Math.max(
    safeBaseXp,
    Math.ceil(safeBaseXp * PREMIUM_XP_BONUS_MULTIPLIER),
  );
}

export function calculatePremiumXpBreakdown(
  baseXp: number,
  isPremium: boolean,
) {
  const safeBaseXp = Math.max(0, Math.floor(baseXp));
  const premiumTotalXp = applyPremiumXpBonus(safeBaseXp, true);
  const availablePremiumBonusXp = Math.max(0, premiumTotalXp - safeBaseXp);
  const premiumBonusXp = isPremium ? availablePremiumBonusXp : 0;

  return {
    baseXp: safeBaseXp,
    premiumBonusXp,
    premiumPotentialBonusXp: isPremium ? 0 : availablePremiumBonusXp,
    premiumTotalXp,
    totalXp: safeBaseXp + premiumBonusXp,
    isPremiumActive: isPremium,
  };
}
