export type CharacterPetStatus = "INCUBATING" | "READY" | "AVAILABLE";

export type PetSpecialization =
  | "GATHERING_DESMANCHE"
  | "GATHERING_COLETA"
  | "GATHERING_PATRULHA"
  | "GATHERING_ARSENAL"
  | "GATHERING_TECNOVARREDURA"
  | "GATHERING_CONTENCAO"
  | "AUTO_COMBAT_TTK"
  | "AUTO_COMBAT_HUNTING";

export type PetEffectType =
  | "GATHERING_TIME_REDUCTION"
  | "AUTO_COMBAT_TTK_REDUCTION"
  | "HUNTING_TIME_REDUCTION";

export interface PetSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  tier: number;
  rarity: string;
  assetKey?: string | null;
  specialization: PetSpecialization;
  specializationLabel: string;
  effectType: PetEffectType;
  effectBasisPoints: number;
  effectPercent: number;
  npcSaleGold: number;
}

export interface CharacterPet {
  id: string;
  status: CharacterPetStatus;
  incubationStartedAt: string;
  incubationEndsAt: string;
  hatchedAt?: string | null;
  remainingSeconds: number;
  isEquipped: boolean;
  pet: PetSummary;
}

export interface PetDefinitionState extends PetSummary {
  incubationSeconds: number;
  costs: {
    cocoon: number;
    fragments: number;
    gold: number;
  };
  balances: {
    cocoons: number;
    duplicateCocoons: number;
    fragments: number;
    gold: number;
  };
  duplicateRecovery: {
    convertFragmentsPerCocoon: number;
    sellGoldPerCocoon: number;
  } | null;
  cocoonItem: {
    id: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    tier: number;
    rarity: string;
    family: string;
  };
  fragmentItem: {
    id: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    tier: number;
    rarity: string;
    family: string;
  };
  characterPet: CharacterPet | null;
  canEquip: boolean;
  canSell: boolean;
  canIncubate: boolean;
  reason?: string | null;
}

export interface PetsStateResponse {
  serverNow: string;
  character: {
    id: string;
    name: string;
    gold: number;
  };
  collection: {
    owned: number;
    total: number;
  };
  activeIncubation: CharacterPet | null;
  equippedPet: CharacterPet | null;
  pets: PetDefinitionState[];
}

export interface PetMutationResponse {
  applied: boolean;
  message: string;
  pet: CharacterPet | null;
}

export interface PetSaleResponse {
  applied: boolean;
  message: string;
  soldPetId: string;
  saleGold: number;
  gold: number;
}

export interface PetCocoonRecoveryResponse {
  applied: boolean;
  action: "SELL" | "CONVERT";
  message: string;
  recoveredCocoons: number;
  goldReceived: number;
  fragmentsReceived: number;
  balance: number;
}
