import { createContext, useContext } from 'react';

export interface LootNotificationPayload {
  idempotencyKey: string;
  itemId?: string | null;
  itemName: string;
  quantity: number;
  imageUrl?: string | null;
  rarity?: string | null;
  source?: 'auto-combat' | 'gathering' | 'system' | string;
}

export interface LootNotificationContextValue {
  notifyLoot: (payload: LootNotificationPayload) => void;
  notifyLootBatch: (payloads: LootNotificationPayload[]) => void;
}

export const LootNotificationContext =
  createContext<LootNotificationContextValue | null>(null);

export function useLootNotifications() {
  const context = useContext(LootNotificationContext);

  if (!context) {
    throw new Error(
      'useLootNotifications deve ser usado dentro de LootNotificationProvider.',
    );
  }

  return context;
}
