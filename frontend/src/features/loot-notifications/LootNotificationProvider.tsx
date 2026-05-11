import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LootNotificationContext,
  type LootNotificationContextValue,
  type LootNotificationPayload,
} from './lootNotificationContext';
import './loot-notifications.css';

interface LootNotificationToast extends LootNotificationPayload {
  id: string;
  createdAt: number;
}

interface LootNotificationProviderProps {
  children: ReactNode;
}


const MAX_VISIBLE_LOOT_NOTIFICATIONS = 5;
const MAX_PROCESSED_KEYS = 240;
const LOOT_NOTIFICATION_TTL_MS = 4200;

function normalizeQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) {
    return 0;
  }

  return Math.max(0, Math.floor(quantity));
}

function getItemInitials(itemName: string) {
  const words = itemName.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 0) return '?';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function trimProcessedKeys(keys: Set<string>) {
  if (keys.size <= MAX_PROCESSED_KEYS) {
    return keys;
  }

  return new Set(Array.from(keys).slice(-Math.floor(MAX_PROCESSED_KEYS / 2)));
}

export function LootNotificationProvider({
  children,
}: LootNotificationProviderProps) {
  const [notifications, setNotifications] = useState<LootNotificationToast[]>(
    [],
  );
  const processedKeysRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, number>>(new Map());

  const removeNotification = useCallback((id: string) => {
    const timeoutId = timersRef.current.get(id);

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timersRef.current.delete(id);
    }

    setNotifications((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notifyLootBatch = useCallback(
    (payloads: LootNotificationPayload[]) => {
      if (payloads.length <= 0) {
        return;
      }

      const createdAt = Date.now();
      const nextToasts: LootNotificationToast[] = [];

      for (const payload of payloads) {
        const quantity = normalizeQuantity(payload.quantity);
        const itemName = payload.itemName.trim();
        const idempotencyKey = payload.idempotencyKey.trim();

        if (!idempotencyKey || !itemName || quantity <= 0) {
          continue;
        }

        if (processedKeysRef.current.has(idempotencyKey)) {
          continue;
        }

        processedKeysRef.current.add(idempotencyKey);

        nextToasts.push({
          ...payload,
          id: `${idempotencyKey}-${createdAt}-${nextToasts.length}`,
          idempotencyKey,
          itemName,
          quantity,
          createdAt,
        });
      }

      if (nextToasts.length <= 0) {
        return;
      }

      processedKeysRef.current = trimProcessedKeys(processedKeysRef.current);

      setNotifications((current) =>
        [...nextToasts, ...current].slice(0, MAX_VISIBLE_LOOT_NOTIFICATIONS),
      );

      for (const toast of nextToasts) {
        const timeoutId = window.setTimeout(() => {
          removeNotification(toast.id);
        }, LOOT_NOTIFICATION_TTL_MS);

        timersRef.current.set(toast.id, timeoutId);
      }
    },
    [removeNotification],
  );

  const notifyLoot = useCallback(
    (payload: LootNotificationPayload) => {
      notifyLootBatch([payload]);
    },
    [notifyLootBatch],
  );

  useEffect(() => {
    const activeTimers = timersRef.current;

    return () => {
      for (const timeoutId of activeTimers.values()) {
        window.clearTimeout(timeoutId);
      }

      activeTimers.clear();
    };
  }, []);

  const value = useMemo<LootNotificationContextValue>(
    () => ({ notifyLoot, notifyLootBatch }),
    [notifyLoot, notifyLootBatch],
  );

  return (
    <LootNotificationContext.Provider value={value}>
      {children}

      <div
        className="loot-notification-stack"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
      >
        {notifications.map((notification) => (
          <article
            key={notification.id}
            className="loot-notification-card"
            data-rarity={String(notification.rarity ?? 'COMMON').toLowerCase()}
          >
            <span className="loot-notification-card__icon" aria-hidden="true">
              {notification.imageUrl ? (
                <img src={notification.imageUrl} alt="" loading="lazy" />
              ) : (
                <span>{getItemInitials(notification.itemName)}</span>
              )}
            </span>

            <span className="loot-notification-card__body">
              <span className="loot-notification-card__eyebrow">
                Item recebido
              </span>
              <strong className="loot-notification-card__name">
                {notification.quantity > 1
                  ? `+${notification.quantity} ${notification.itemName}`
                  : notification.itemName}
              </strong>
            </span>
          </article>
        ))}
      </div>
    </LootNotificationContext.Provider>
  );
}
