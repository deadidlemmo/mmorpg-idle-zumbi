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
