export type EconomyCurrency = "INCURSION_TOKEN" | "WORLD_BOSS_FRAGMENT";

export interface EconomyBalance {
  currency: EconomyCurrency;
  label: string;
  balance: number;
}

export interface EconomyExchangeItem {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  tier: number;
  rarity: string;
  materialOrigin?: string | null;
}

export interface EconomyExchangeOffer {
  id: string;
  source:
    | "INCURSION_REINFORCEMENT"
    | "INCURSION_EMERGENCY_MATERIAL"
    | "WORLD_BOSS_COCOON"
    | "WORLD_BOSS_EMERGENCY_DROP";
  category: "PRIMARY" | "EMERGENCY";
  purpose: string;
  tier: number;
  currency: EconomyCurrency;
  currencyLabel: string;
  cost: number;
  quantity: number;
  item: EconomyExchangeItem;
}

export interface EconomyExchangeOffersResponse {
  character: { id: string; name: string };
  tier: number;
  balances: EconomyBalance[];
  offers: EconomyExchangeOffer[];
}

export interface EconomyExchangeResponse {
  applied: boolean;
  message: string;
  offer: EconomyExchangeOffer;
  balance: number;
}
