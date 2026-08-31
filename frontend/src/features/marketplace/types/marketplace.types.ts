import type {
  InventoryItemDetails,
  InventoryItemType,
} from "../../inventory/types/inventory.types";

export type MarketListingStatus = "ACTIVE" | "SOLD_OUT" | "CANCELLED";
export type MarketListingSort =
  "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "QUANTITY_DESC";
export type MarketItemClassFilter =
  | "GENERAL"
  | "LUTADOR"
  | "ASSASSINO"
  | "ATIRADOR"
  | "MEDICO";

export interface MarketCharacterSummary {
  id: string;
  name: string;
  gold: number;
}

export interface MarketListing {
  id: string;
  type: InventoryItemType;
  status: MarketListingStatus;
  quantityInitial: number;
  quantityRemaining: number;
  quantityCancelled: number;
  quantitySold: number;
  unitPrice: number;
  totalRemaining: number;
  goldEarned: number;
  createdAt: string;
  closedAt?: string | null;
  item: InventoryItemDetails;
  seller: {
    id: string;
    name: string;
  };
}

export interface MarketPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MarketListingsResponse {
  character: MarketCharacterSummary;
  listings: MarketListing[];
  pagination: MarketPagination;
}

export interface MarketSellableItem {
  id: string;
  characterId: string;
  itemId: string;
  quantity: number;
  type: InventoryItemType;
  createdAt: string;
  updatedAt: string;
  item: InventoryItemDetails;
}

export interface MarketSellableItemsResponse {
  character: MarketCharacterSummary;
  activeListings: number;
  maxActiveListings: number;
  items: MarketSellableItem[];
}

export interface MyMarketListingsResponse extends MarketListingsResponse {
  activeListings: number;
  maxActiveListings: number;
}

export interface CreateMarketListingPayload {
  characterId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  requestId: string;
}

export interface BuyMarketListingPayload {
  characterId: string;
  quantity: number;
  requestId: string;
}

export interface MarketListingMutationResponse {
  message: string;
  listing: MarketListing;
}

export interface MarketPurchaseResponse {
  message: string;
  purchase: {
    id: string;
    listingId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    createdAt: string;
    buyerGold: number;
    item: InventoryItemDetails;
    seller: {
      id: string;
      name: string;
    };
    listing: MarketListing;
  };
}

export interface MarketListingsQuery {
  search?: string;
  type?: string;
  tier?: number;
  rarity?: string;
  itemClass?: MarketItemClassFilter;
  status?: MarketListingStatus;
  sort?: MarketListingSort;
  page?: number;
  pageSize?: number;
}

export interface MarketApiErrorResponse {
  message?: string | string[];
  error?: string;
}
