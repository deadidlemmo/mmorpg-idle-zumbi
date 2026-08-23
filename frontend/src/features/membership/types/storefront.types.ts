export type StorefrontProviderKey = "MERCADO_PAGO" | "STRIPE";
export type StorefrontOfferKind = "SUBSCRIPTION" | "PERMANENT_PACKAGE";
export type StorefrontOfferKey =
  | "premium-abrigo-monthly"
  | "pacote-nucleo-helix"
  | "pacote-protocolo-carmesim";

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
  price: {
    amountCents: number | null;
    currency: "BRL";
    formatted: string;
  };
  collection: {
    key: string;
    name: string;
    description?: string | null;
    coverAssetKey?: string | null;
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
