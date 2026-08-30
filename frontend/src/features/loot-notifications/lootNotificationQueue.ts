export function selectLatestNotification<T>(
  notifications: readonly T[],
): T | null {
  return notifications.at(-1) ?? null;
}

export function enqueueNotifications<T>(
  queue: readonly T[],
  notifications: readonly T[],
  maxQueueSize: number,
  isPriorityNotification: (notification: T) => boolean = () => false,
): T[] {
  const safeMaxQueueSize = Math.max(0, Math.floor(maxQueueSize));

  if (notifications.length <= 0 || safeMaxQueueSize <= 0) {
    return [...queue];
  }

  const priorityNotifications = notifications.filter(isPriorityNotification);
  const regularNotifications = notifications.filter(
    (notification) => !isPriorityNotification(notification),
  );
  const appended =
    priorityNotifications.length > 0 &&
    queue.length > 0 &&
    !isPriorityNotification(queue[0])
      ? [...priorityNotifications, ...queue, ...regularNotifications]
      : [...queue, ...notifications];

  if (appended.length <= safeMaxQueueSize) {
    return appended;
  }

  if (safeMaxQueueSize === 1) {
    return [appended[0]];
  }

  return [appended[0], ...appended.slice(-(safeMaxQueueSize - 1))];
}
