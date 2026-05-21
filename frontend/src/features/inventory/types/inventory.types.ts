export type InventoryItemType = 'EQUIPMENT' | 'MATERIAL' | 'CONSUMABLE' | string;

export type InventoryItemRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'EPIC'
  | 'LEGENDARY'
  | string;

export type InventoryItemSlot =
  | 'MAIN_HAND'
  | 'OFF_HAND'
  | 'HEAD'
  | 'ARMOR'
  | 'PANTS'
  | 'BOOTS'
  | 'MATERIAL'
  | 'CONSUMABLE'
  | string;

export interface InventoryCharacterSummary {
  id: string;
  name: string;
  level: number;
  xp?: number | null;
  currentHp?: number | null;
  maxHp?: number | null;
}

export interface InventoryItemClassSummary {
  id: string;
  name: string;
}

export interface InventoryItemMapSummary {
  id: string;
  name: string;
  tier: number;
  minLevel?: number | null;
  maxLevel?: number | null;
}

export interface InventoryItemDetails {
  id: string;
  name: string;
  description?: string | null;
  tier?: number | null;
  rarity?: InventoryItemRarity | null;
  slot?: InventoryItemSlot | null;
  family?: string | null;
  materialOrigin?: string | null;
  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;
  healFlat?: number | null;
  healPercent?: number | null;
  usableInCombat?: boolean | null;
  usableOutOfCombat?: boolean | null;
  minTier?: number | null;
  maxTier?: number | null;
  isCraftable?: boolean | null;
  class?: InventoryItemClassSummary | null;
  map?: InventoryItemMapSummary | null;
}

export interface InventoryEntry {
  inventoryItemId: string;
  quantity: number;
  type: InventoryItemType;
  item: InventoryItemDetails;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryResponse {
  character: InventoryCharacterSummary;
  totalItems: number;
  items: InventoryEntry[];
}

export type InventoryFilterKey =
  | 'ALL'
  | 'MATERIAL'
  | 'EQUIPMENT'
  | 'CONSUMABLE'
  | 'RESOURCE'
  | 'OTHER';

export interface InventoryFilterOption {
  key: InventoryFilterKey;
  label: string;
  count: number;
}

export type InventoryItemActionKind =
  | 'equip'
  | 'consume'
  | 'unequip'
  | 'deposit'
  | 'withdraw';

export interface InventoryItemActionViewModel {
  kind: InventoryItemActionKind;
  label: string;
  description: string;
}

export interface InventoryItemActionFeedback {
  tone: 'success' | 'error';
  message: string;
}
