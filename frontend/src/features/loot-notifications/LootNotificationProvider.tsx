import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import {
  LootNotificationContext,
  type LootNotificationContextValue,
  type LootNotificationPayload,
} from './lootNotificationContext';
import { enqueueNotifications } from './lootNotificationQueue';
import './loot-notifications.css';

interface LootNotificationToast extends LootNotificationPayload {
  id: string;
  createdAt: number;
}

interface LootNotificationProviderProps {
  children: ReactNode;
}


const MAX_PROCESSED_KEYS = 240;
const MAX_NOTIFICATION_QUEUE_SIZE = 5;
const LOOT_NOTIFICATION_TTL_MS = 4200;

function getSourceLabel(source?: string | null) {
  switch (source) {
    case 'auto-combat':
      return 'Combate automático';
    case 'gathering':
      return 'Item coletado';
    case 'crafting':
      return 'Item criado';
    case 'incursion':
      return 'Incursão';
    case 'world-boss':
      return 'World Boss';
    default:
      return 'Item recebido';
  }
}

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

  const removeNotification = useCallback((id: string) => {
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
        const source = String(payload.source ?? 'system')
          .trim()
          .toLowerCase();
        const kind = String(payload.kind ?? 'loot').trim().toLowerCase();
        const eyebrow = payload.eyebrow?.trim() || null;
        const description = payload.description?.trim() || null;

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
          source,
          kind: kind || 'loot',
          eyebrow,
          description,
          displayQuantity: payload.displayQuantity ?? true,
          createdAt,
        });
      }

      if (nextToasts.length <= 0) {
        return;
      }

      processedKeysRef.current = trimProcessedKeys(processedKeysRef.current);
      setNotifications((current) =>
        enqueueNotifications(
          current,
          nextToasts,
          MAX_NOTIFICATION_QUEUE_SIZE,
          (notification) => notification.kind === 'combat-result',
        ),
      );
    },
    [],
  );

  const notifyLoot = useCallback(
    (payload: LootNotificationPayload) => {
      notifyLootBatch([payload]);
    },
    [notifyLootBatch],
  );

  const activeNotificationId = notifications[0]?.id ?? null;

  useEffect(() => {
    if (!activeNotificationId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      removeNotification(activeNotificationId);
    }, LOOT_NOTIFICATION_TTL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeNotificationId, removeNotification]);

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
        aria-atomic="true"
        aria-relevant="additions text"
      >
        {notifications.slice(0, 1).map((notification) => (
          <article
            key={notification.id}
            className="loot-notification-card"
            data-rarity={String(notification.rarity ?? 'COMMON').toLowerCase()}
            data-source={String(notification.source ?? 'system').toLowerCase()}
            data-kind={String(notification.kind ?? 'loot').toLowerCase()}
            data-notification-key={notification.idempotencyKey}
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
                {notification.eyebrow ?? getSourceLabel(notification.source)}
              </span>
              <strong className="loot-notification-card__name">
                {notification.displayQuantity !== false &&
                notification.quantity > 1
                  ? `+${notification.quantity} ${notification.itemName}`
                  : notification.itemName}
              </strong>
              {notification.description ? (
                <span className="loot-notification-card__description">
                  {notification.description}
                </span>
              ) : null}
            </span>

            <button
              type="button"
              className="loot-notification-card__close"
              aria-label={`Fechar notificação de ${notification.itemName}`}
              onClick={() => removeNotification(notification.id)}
            >
              <X aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </LootNotificationContext.Provider>
  );
}
