import { createContext, useContext } from 'react';

export type LootNotificationSource =
  | 'auto-combat'
  | 'gathering'
  | 'crafting'
  | 'incursion'
  | 'world-boss'
  | 'system'
  | (string & {});

export type LootNotificationKind =
  | 'loot'
  | 'combat-result'
  | (string & {});

export interface LootNotificationPayload {
  idempotencyKey: string;
  itemId?: string | null;
  itemName: string;
  quantity: number;
  imageUrl?: string | null;
  rarity?: string | null;
  source?: LootNotificationSource;
  kind?: LootNotificationKind;
  eyebrow?: string | null;
  description?: string | null;
  displayQuantity?: boolean;
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
