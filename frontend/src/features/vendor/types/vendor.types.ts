export type VendorCategory =
  | "ALL"
  | "CONSUMABLE"
  | "GATHERING"
  | "MOB_DROP";

export interface VendorNpc {
  name: string;
  title: string;
  description: string;
}

export interface VendorCharacter {
  id: string;
  name: string;
  level: number;
  gold: number;
}

export interface VendorCategorySummary {
  key: VendorCategory;
  label: string;
  count: number;
}

export interface VendorItemEffect {
  key: string;
  label: string;
  value: number;
}

export interface VendorItemSummary {
  id: string;
  name: string;
  description?: string | null;
  tier: number;
  rarity: string;
  slot: string;
  family: string;
  category: Exclude<VendorCategory, "ALL">;
  stackable: boolean;
  buyPrice: number;
  healFlat: number;
  healPercent: number;
  minTier?: number | null;
  maxTier?: number | null;
  effects: VendorItemEffect[];
  class?: {
    id: string;
    name: string;
  } | null;
  map?: {
    id: string;
    name: string;
    tier: number;
  } | null;
}

export interface VendorShopResponse {
  npc: VendorNpc;
  character: VendorCharacter;
  gold: number;
  categories: VendorCategorySummary[];
  items: VendorItemSummary[];
}

export interface VendorTransactionPayload {
  itemId?: string;
  quantity?: number;
}

export interface VendorTransactionResponse {
  message: string;
  gold: number;
  character: VendorCharacter;
  transaction: {
    type: "BUY";
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  };
  item: VendorItemSummary;
}

export interface VendorApiErrorResponse {
  message?: string | string[];
  error?: string;
}
