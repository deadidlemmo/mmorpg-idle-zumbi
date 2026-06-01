export const FREE_IDLE_PROGRESS_LIMIT_SECONDS = 6 * 60 * 60;
export const PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS = 12 * 60 * 60;

export function getIdleProgressLimitSeconds(isPremium: boolean) {
  return isPremium
    ? PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS
    : FREE_IDLE_PROGRESS_LIMIT_SECONDS;
}

export function getIdleProgressLimitHours(isPremium: boolean) {
  return getIdleProgressLimitSeconds(isPremium) / 3600;
}
