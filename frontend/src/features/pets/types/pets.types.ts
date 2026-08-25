export type CharacterPetStatus = "INCUBATING" | "READY" | "AVAILABLE";

export interface PetSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  tier: number;
  rarity: string;
  assetKey?: string | null;
}

export interface CharacterPet {
  id: string;
  status: CharacterPetStatus;
  incubationStartedAt: string;
  incubationEndsAt: string;
  hatchedAt?: string | null;
  remainingSeconds: number;
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
    fragments: number;
    gold: number;
  };
  cocoonItem: {
    id: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    tier: number;
    rarity: string;
    family: string;
  };
  characterPet: CharacterPet | null;
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
  pets: PetDefinitionState[];
}

export interface PetMutationResponse {
  applied: boolean;
  message: string;
  pet: CharacterPet;
}
