export type WikiEntityKind = "items" | "monsters" | "maps" | "bosses";

export interface WikiPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface WikiMapReference {
  id: string;
  name: string;
  tier: number;
  minLevel?: number | null;
  maxLevel?: number | null;
  description?: string | null;
}

export interface WikiItemSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  tier: number;
  rarity: string;
  slot: string;
  family: string;
  materialOrigin?: string | null;
  materialSlot?: string | null;
  isGatheringMaterial?: boolean;
  isCraftable?: boolean;
  isSellable?: boolean;
  isTradable?: boolean;
  enhancementLevel?: number;
  class?: { id: string; name: string; description?: string | null } | null;
  map?: WikiMapReference | null;
  relatedCounts?: {
    monsterDrops: number;
    recipes: number;
    worldBosses: number;
    incursions: number;
  };
}

export interface WikiMonsterSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  level: number;
  tier: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  xpReward: number;
  map: WikiMapReference;
  subMaps?: WikiMapReference[];
  dropCount?: number;
}

export interface WikiMapSummary extends WikiMapReference {
  slug: string;
  counts?: {
    subMaps: number;
    monsters: number;
    bosses: number;
    incursions: number;
    items: number;
  };
}

export interface WikiBossSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  tier: number;
  minLevel: number;
  maxLevel: number;
  baseHp: number;
  maxHp?: number | null;
  attackPower: number;
  defense: number;
  resistance: number;
  mutationLevel: number;
  durationSeconds: number;
  difficulty: string;
  riskLevel: number;
  minParticipationSeconds: number;
  minParticipationDamage: number;
  imageUrl?: string | null;
  assetKey?: string | null;
  map: WikiMapReference;
  rewardCount?: number;
}

export type WikiEntitySummary =
  | WikiItemSummary
  | WikiMonsterSummary
  | WikiMapSummary
  | WikiBossSummary;

export interface WikiSummaryResponse {
  generatedAt: string;
  counts: {
    items: number;
    monsters: number;
    maps: number;
    bosses: number;
  };
  maps: WikiMapSummary[];
  featuredBosses: WikiBossSummary[];
  classes: Array<{ id: string; name: string; description: string }>;
}

export interface WikiSearchResponse {
  query: string;
  groups: {
    items: WikiItemSummary[];
    monsters: WikiMonsterSummary[];
    maps: WikiMapSummary[];
    bosses: WikiBossSummary[];
  };
}

export interface WikiCatalogFilters {
  search?: string;
  tier?: number;
  rarity?: string;
  slot?: string;
  mapId?: string;
  minLevel?: number;
  maxLevel?: number;
  page?: number;
  pageSize?: number;
}

export interface WikiCatalogResponse {
  items?: WikiItemSummary[];
  monsters?: WikiMonsterSummary[];
  maps?: WikiMapSummary[];
  bosses?: WikiBossSummary[];
  pagination: WikiPagination;
}

export interface WikiItemDetail extends WikiItemSummary {
  stats: Record<string, number>;
  requirements: {
    minTier?: number | null;
    maxTier?: number | null;
    requiredGatheringLevel?: number | null;
  };
  usage: {
    usableInCombat: boolean;
    usableOutOfCombat: boolean;
  };
  baseItem?: WikiItemSummary | null;
  enhancementVariants: WikiItemSummary[];
  monsterDrops: Array<{
    id: string;
    chance: number;
    minQuantity: number;
    maxQuantity: number;
    monster: WikiMonsterSummary;
  }>;
  crafting: {
    outputRecipe?: {
      id: string;
      tier: number;
      outputQuantity: number;
      ingredients: Array<{
        quantity: number;
        role: string;
        origin: string;
        item: WikiItemSummary;
      }>;
    } | null;
    usedInRecipes: Array<{
      quantity: number;
      role: string;
      origin: string;
      outputItem: WikiItemSummary;
    }>;
  };
  incursions: Array<{
    chance: number;
    minQuantity: number;
    maxQuantity: number;
    guaranteed: boolean;
    incursion: {
      id: string;
      slug: string;
      name: string;
      tier: number;
      map: WikiMapReference;
    };
  }>;
  worldBosses: Array<{
    chance: number;
    minQuantity: number;
    maxQuantity: number;
    guaranteed: boolean;
    onlyIfDefeated: boolean;
    boss: WikiBossSummary;
  }>;
  petDefinitions: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    tier: number;
    rarity: string;
    incubationSeconds: number;
    fragmentCost: number;
    goldCost: number;
  }>;
}

export interface WikiMonsterDetail extends WikiMonsterSummary {
  drops: Array<{
    id: string;
    chance: number;
    minQuantity: number;
    maxQuantity: number;
    item: WikiItemSummary;
  }>;
}

export interface WikiRewardEntry {
  id?: string;
  rewardType: string;
  chance: number;
  minQuantity: number;
  maxQuantity: number;
  guaranteed: boolean;
  onlyIfDefeated?: boolean;
  requiresMinParticipation?: boolean;
  minContributionPercent?: number;
  randomPetCocoon?: boolean;
  rarity?: string | null;
  currency?: string | null;
  item?: WikiItemSummary | null;
}

export interface WikiBossDetail extends WikiBossSummary {
  scaling: {
    hpPerParticipant: number;
    powerScalingFactor: number;
    scalingFactor: number;
    minParticipantsExpected: number;
    maxScalingCap: number;
    scalingWindowSeconds: number;
    damageReduction: number;
    enrageMultiplier: number;
  };
  rewards: WikiRewardEntry[];
}

export interface WikiMapDetail extends WikiMapSummary {
  subMaps: Array<{
    id: string;
    name: string;
    description?: string | null;
    tier: number;
    minLevel: number;
    maxLevel: number;
    encounters: Array<{ weight: number; monster: WikiMonsterSummary }>;
  }>;
  monsters: WikiMonsterSummary[];
  items: WikiItemSummary[];
  incursions: Array<{
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    tier: number;
    minLevel: number;
    maxLevel: number;
    goldCost: number;
    durationSeconds: number;
    difficulty: string;
    riskLevel: number;
    rewards: WikiRewardEntry[];
  }>;
  bosses: Array<WikiBossSummary & { rewards: WikiRewardEntry[] }>;
}

export type WikiEntityDetail =
  | WikiItemDetail
  | WikiMonsterDetail
  | WikiMapDetail
  | WikiBossDetail;
