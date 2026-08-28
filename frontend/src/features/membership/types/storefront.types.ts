export type StorefrontProviderKey = "MERCADO_PAGO" | "STRIPE";
export type StorefrontOfferKind =
  "SUBSCRIPTION" | "PREMIUM_ITEM" | "CASH_PACKAGE" | "PERMANENT_PACKAGE";
export type StorefrontOfferKey =
  | "premium-abrigo-monthly"
  | "premium-abrigo-30d-item"
  | "cash-100"
  | "cash-200"
  | "cash-500"
  | "pacote-nucleo-helix"
  | "pacote-protocolo-carmesim";

export type StorefrontCosmeticType =
  | "AVATAR"
  | "AVATAR_FRAME"
  | "PROFILE_BANNER"
  | "OVERVIEW_BACKGROUND"
  | "PROFILE_EFFECT"
  | "TITLE"
  | "BADGE";

export interface StorefrontCosmeticItem {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: StorefrontCosmeticType;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  assetKey?: string | null;
  effectPreset?: string | null;
  displayText?: string | null;
  accentColor?: string | null;
  class?: { id: string; name: string } | null;
}

export interface StorefrontOffer {
  key: StorefrontOfferKey;
  kind: StorefrontOfferKind;
  name: string;
  eyebrow: string;
  description: string;
  collectionKey: string;
  billingLabel: string;
  accentColor: string;
  benefits: string[];
  cashAmount?: number;
  premiumDays?: number;
  tradeable?: boolean;
  price: {
    amountCents: number;
    currency: "BRL";
    formatted: string;
  };
  collection: {
    key: string;
    name: string;
    description?: string | null;
    coverAssetKey?: string | null;
    items: StorefrontCosmeticItem[];
  } | null;
  ownership: {
    isOwned: boolean;
    ownedItemCount: number;
    totalItemCount: number;
    activeUntil?: string | null;
  };
}

export interface StorefrontCatalogResponse {
  checkout: {
    state: "COMING_SOON" | "AVAILABLE";
    enabled: boolean;
    message: string;
    providers: Array<{
      key: StorefrontProviderKey;
      name: string;
      state: "PLANNED" | "AVAILABLE" | "UNAVAILABLE";
    }>;
  };
  membership: {
    isPremiumActive: boolean;
    premiumUntil?: string | null;
  };
  offers: StorefrontOffer[];
}

export interface CreateStorefrontCheckoutPayload {
  characterId: string;
  offerKey: StorefrontOfferKey;
  provider: StorefrontProviderKey;
}

export interface CreateStorefrontCheckoutResponse {
  checkoutId: string;
  checkoutUrl: string;
  expiresAt?: string | null;
}
