import { InventoryItemType, Rarity } from '@prisma/client';

export const BLACK_MARKET_BASE_VALUE_BY_TIER: Readonly<Record<number, number>> =
  Object.freeze({
    1: 3,
    2: 6,
    3: 12,
    4: 20,
    5: 32,
    6: 50,
    7: 76,
    8: 112,
    9: 160,
    10: 225,
  });

export const BLACK_MARKET_TYPE_MULTIPLIER: Readonly<
  Record<InventoryItemType, number>
> = Object.freeze({
  [InventoryItemType.MATERIAL]: 1,
  [InventoryItemType.CONSUMABLE]: 2,
  [InventoryItemType.EQUIPMENT]: 8,
});

export const BLACK_MARKET_FAMILY_MULTIPLIER: Readonly<Record<string, number>> =
  Object.freeze({
    'Resíduo Infecto': 0.55,
  });

export const CRAFTABLE_EQUIPMENT_BLACK_MARKET_FLOOR_BY_TIER: Readonly<
  Partial<Record<number, number>>
> = Object.freeze({
  // T3-T5 recuperam 30% do valor NPC dos ingredientes das receitas canonicas.
  3: 760,
  4: 1_226,
  5: 3_226,
});

export function getItemRarityByTier(tier: number): Rarity {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) return Rarity.COMMON;
  if (safeTier >= 9) return Rarity.LEGENDARY;
  if (safeTier >= 7) return Rarity.EPIC;
  if (safeTier >= 5) return Rarity.RARE;
  if (safeTier >= 3) return Rarity.UNCOMMON;

  return Rarity.COMMON;
}

export function getBlackMarketRarityMultiplier(rarity: Rarity) {
  switch (rarity) {
    case Rarity.UNCOMMON:
      return 1.35;
    case Rarity.RARE:
      return 1.85;
    case Rarity.EPIC:
      return 2.6;
    case Rarity.LEGENDARY:
      return 3.75;
    case Rarity.COMMON:
    default:
      return 1;
  }
}

export function calculateBlackMarketSellValue(params: {
  tier: number;
  rarity: Rarity;
  inventoryType: InventoryItemType;
  family?: string | null;
  isCraftable?: boolean | null;
  isSellable?: boolean | null;
}) {
  if (params.isSellable === false) return 0;

  const tier = Math.min(10, Math.max(1, Math.floor(params.tier)));
  const baseValue = BLACK_MARKET_BASE_VALUE_BY_TIER[tier] ?? 3;
  const typeMultiplier =
    BLACK_MARKET_TYPE_MULTIPLIER[params.inventoryType] ?? 1;
  const familyMultiplier = params.family
    ? (BLACK_MARKET_FAMILY_MULTIPLIER[params.family] ?? 1)
    : 1;
  const canonicalValue = Math.max(
    1,
    Math.floor(
      baseValue *
        typeMultiplier *
        getBlackMarketRarityMultiplier(params.rarity),
    ),
  );

  const canonicalFamilyValue = Math.max(
    1,
    Math.round(canonicalValue * familyMultiplier),
  );
  const craftableEquipmentFloor =
    params.inventoryType === InventoryItemType.EQUIPMENT &&
    params.isCraftable === true
      ? CRAFTABLE_EQUIPMENT_BLACK_MARKET_FLOOR_BY_TIER[tier]
      : undefined;

  return Math.max(canonicalFamilyValue, craftableEquipmentFloor ?? 0);
}
