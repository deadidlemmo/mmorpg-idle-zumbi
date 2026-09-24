import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  LootNotificationContext,
  type LootNotificationContextValue,
  type LootNotificationPayload,
} from './lootNotificationContext';
import { enqueueNotifications } from './lootNotificationQueue';
import {
  getPerformanceDiagnostics,
  getPerformanceExperiment,
  type PerformanceDiagnosticsSession,
} from '../performance/performanceDiagnostics';
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

function recordToastAnimationStart(
  diagnostics: PerformanceDiagnosticsSession,
  id: string,
  name: string,
  element: HTMLElement,
) {
  const style = window.getComputedStyle(element);
  const names = style.animationName.split(',').map((value) => value.trim());
  const durations = style.animationDuration.split(',').map((value) => value.trim());
  const index = names.indexOf(name);
  const duration = durations[index % durations.length] ?? '0ms';
  const expectedMs = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
  diagnostics.animationStarted(id, name, expectedMs, performance.now());
}

export function LootNotificationProvider({
  children,
}: LootNotificationProviderProps) {
  const [notifications, setNotifications] = useState<LootNotificationToast[]>(
    [],
  );
  const [autoCombatHudTarget, setAutoCombatHudTarget] =
    useState<HTMLElement | null>(null);
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
  const activeNotificationKey = notifications[0]?.idempotencyKey ?? null;
  const diagnostics = getPerformanceDiagnostics();
  const performanceExperiment = getPerformanceExperiment();

  useEffect(() => {
    if (!diagnostics) return;
    diagnostics.setToastCounts(activeNotificationId ? 1 : 0, Math.max(0, notifications.length - 1));
  }, [diagnostics, activeNotificationId, notifications.length]);

  useLayoutEffect(() => {
    if (!diagnostics || !activeNotificationId) return;
    const now = performance.now();
    diagnostics.recordReactCommit('React aviso', now);
    diagnostics.toastShown(activeNotificationId, now, activeNotificationKey ?? undefined);
    return () => diagnostics.toastHidden(activeNotificationId, LOOT_NOTIFICATION_TTL_MS, performance.now());
  }, [diagnostics, activeNotificationId, activeNotificationKey]);


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
    () => ({ notifyLoot, notifyLootBatch, setAutoCombatHudTarget }),
    [notifyLoot, notifyLootBatch],
  );

  const activeNotification = notifications[0] ?? null;
  const notificationCard = activeNotification ? (
    <article
      key={activeNotification.id}
      className={`loot-notification-card${autoCombatHudTarget && activeNotification.source === 'auto-combat' ? ' loot-notification-card--hud' : ''}${diagnostics && !performanceExperiment.noticeEffects ? ' loot-notification-card--perf-no-animation' : ''}`}
      onAnimationStart={diagnostics ? (event) => recordToastAnimationStart(diagnostics, activeNotification.id, event.animationName, event.currentTarget) : undefined}
      onAnimationEnd={diagnostics ? (event) => diagnostics.animationEnded(activeNotification.id, event.animationName, performance.now()) : undefined}
      data-rarity={String(activeNotification.rarity ?? 'COMMON').toLowerCase()}
      data-source={String(activeNotification.source ?? 'system').toLowerCase()}
      data-kind={String(activeNotification.kind ?? 'loot').toLowerCase()}
      data-notification-key={activeNotification.idempotencyKey}
    >
      <span className="loot-notification-card__icon" aria-hidden="true">
        {activeNotification.imageUrl ? (
          <img src={activeNotification.imageUrl} alt="" loading="lazy" />
        ) : (
          <span>{getItemInitials(activeNotification.itemName)}</span>
        )}
      </span>

      <span className="loot-notification-card__body">
        <span className="loot-notification-card__eyebrow">
          {activeNotification.eyebrow ?? getSourceLabel(activeNotification.source)}
        </span>
        <strong className="loot-notification-card__name">
          {activeNotification.displayQuantity !== false && activeNotification.quantity > 1
            ? `+${activeNotification.quantity} ${activeNotification.itemName}`
            : activeNotification.itemName}
        </strong>
        {activeNotification.description ? (
          <span className="loot-notification-card__description">
            {activeNotification.description}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        className="loot-notification-card__close"
        aria-label={`Fechar notificação de ${activeNotification.itemName}`}
        onClick={() => removeNotification(activeNotification.id)}
      >
        <X aria-hidden="true" />
      </button>
    </article>
  ) : null;

  const shouldUseAutoCombatHud = Boolean(
    notificationCard &&
      autoCombatHudTarget &&
      activeNotification?.source === 'auto-combat',
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
        {shouldUseAutoCombatHud ? null : notificationCard}
      </div>
      {shouldUseAutoCombatHud && autoCombatHudTarget
        ? createPortal(notificationCard, autoCombatHudTarget)
        : null}
    </LootNotificationContext.Provider>
  );
}
