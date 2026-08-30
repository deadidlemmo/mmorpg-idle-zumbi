import type {
  AutoCombatRealtimePotionEvent,
  CharacterPotionConfigWithItem,
  PotionInventoryOption,
} from "../types/auto-combat-page.types";
import type { AutoCombatRealtimeEvent } from "../types/auto-combat.types";

function getOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getNormalizedQuantity(value: unknown) {
  const quantity = getOptionalNumber(value);

  if (quantity === undefined) {
    return undefined;
  }

  return Math.max(0, Math.floor(quantity));
}

export function getPotionQuantity(
  potionConfig: CharacterPotionConfigWithItem | null,
  availablePotions: PotionInventoryOption[],
) {
  const potionItem = potionConfig?.potion ?? potionConfig?.potionItem ?? null;

  if (!potionItem?.id) return 0;

  const inventoryPotion = availablePotions.find(
    (potion) => potion.itemId === potionItem.id || potion.id === potionItem.id,
  );

  return Math.max(
    0,
    getOptionalNumber(
      inventoryPotion?.quantity ??
        potionItem.availableQuantity ??
        potionItem.quantity,
    ) ?? 0,
  );
}

export function resolvePotionEventItemId(
  payload: AutoCombatRealtimeEvent,
  fallbackPotionItemId?: string | null,
) {
  const event = payload as AutoCombatRealtimePotionEvent;

  if (typeof event.potionItemId === "string" && event.potionItemId.trim()) {
    return event.potionItemId.trim();
  }

  if (typeof fallbackPotionItemId === "string" && fallbackPotionItemId.trim()) {
    return fallbackPotionItemId.trim();
  }

  return "";
}

export function resolvePotionQuantityAfter(
  payload: AutoCombatRealtimeEvent,
  currentQuantity: number,
) {
  const event = payload as AutoCombatRealtimePotionEvent;

  const explicitQuantity =
    getNormalizedQuantity(event.potionQuantityRemaining) ??
    getNormalizedQuantity(event.potionQuantityAfter);

  if (explicitQuantity !== undefined) {
    return explicitQuantity;
  }

  const quantityBefore = getNormalizedQuantity(event.potionQuantityBefore);
  const usedQuantity = getNormalizedQuantity(event.potionUsedQuantity) ?? 1;

  if (quantityBefore !== undefined) {
    return Math.max(0, quantityBefore - usedQuantity);
  }

  return Math.max(0, Math.floor(currentQuantity) - usedQuantity);
}
