export type IncursionRewardType =
  | "XP"
  | "GOLD"
  | "MATERIAL"
  | "CONSUMABLE"
  | "EQUIPMENT"
  | "ITEM";
export type IncursionSessionStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "CLAIMED"
  | "FAILED"
  | "CANCELLED";
export type IncursionDifficulty = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export interface IncursionMapSummary {
  id: string;
  name: string;
  tier: number;
  minLevel?: number | null;
  maxLevel?: number | null;
  description?: string | null;
}

export interface IncursionLootPreview {
  id?: string;
  rewardType: IncursionRewardType;
  itemId?: string | null;
  item?: {
    id: string;
    name: string;
    tier?: number | null;
    rarity?: string | null;
    slot?: string | null;
    family?: string | null;
    materialOrigin?: string | null;
  } | null;
  chance: number;
  minQuantity: number;
  maxQuantity: number;
  guaranteed?: boolean | null;
  rarity?: string | null;
  sortOrder?: number | null;
}

export interface Incursion {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  mapId: string;
  map: IncursionMapSummary;
  tier: number;
  minLevel: number;
  maxLevel: number;
  goldCost: number;
  durationSeconds: number;
  difficulty: IncursionDifficulty;
  riskLevel: number;
  isActive: boolean;
  sortOrder?: number | null;
  isUnlocked?: boolean;
  canStart?: boolean;
  lockedReasons?: string[];
  rewardsPreview: IncursionLootPreview[];
  lootTable?: IncursionLootPreview[];
}

export interface IncursionSession {
  id: string;
  characterId: string;
  incursionId: string;
  status: IncursionSessionStatus;
  startedAt: string;
  endsAt: string;
  completedAt?: string | null;
  claimedAt?: string | null;
  goldCostPaid: number;
  xpReward: number;
  goldReward: number;
  progressPercent: number;
  remainingSeconds: number;
  canClaim: boolean;
  incursion: Incursion;
  rewards?: Array<{
    id?: string;
    rewardType: IncursionRewardType;
    itemId?: string | null;
    item?: IncursionLootPreview["item"];
    itemName?: string | null;
    quantity: number;
    rarity?: string | null;
  }>;
}

export interface IncursionsAvailableResponse {
  character: {
    id: string;
    name: string;
    level: number;
    gold: number;
    cash: number;
    wallet?: { gold: number; cash: number };
  };
  currentMap?: IncursionMapSummary | null;
  activeSession?: IncursionSession | null;
  rewardedSession?: IncursionSession | null;
  incursions: Incursion[];
}

export interface IncursionStatusResponse {
  activeSession?: IncursionSession | null;
  rewardedSession?: IncursionSession | null;
}

export interface StartIncursionResponse {
  message: string;
  session: IncursionSession | null;
}

export interface ClaimIncursionResponse {
  message: string;
  session: IncursionSession;
  xpGained: number;
  goldGained: number;
  goldSpent: number;
  levelUp: {
    leveledUp: boolean;
    levelsGained: number;
    oldLevel: number;
    newLevel: number;
  };
  rewards: NonNullable<IncursionSession["rewards"]>;
}
