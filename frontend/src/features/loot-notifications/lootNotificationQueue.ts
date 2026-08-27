export function selectLatestNotification<T>(
  notifications: readonly T[],
): T | null {
  return notifications.at(-1) ?? null;
}
