import type { ActivityTimelineSnapshot } from "../../../components/game/activityTimeline";

export type IncursionRewardType =
  "XP" | "GOLD" | "CURRENCY" | "MATERIAL" | "CONSUMABLE" | "EQUIPMENT" | "ITEM";
export type IncursionSessionStatus =
  "ACTIVE" | "COMPLETED" | "CLAIMED" | "FAILED" | "CANCELLED";
export type IncursionDifficulty = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export type IncursionApproach = "CAUTIOUS" | "BALANCED" | "AGGRESSIVE";

export interface IncursionApproachProfile {
  approach: IncursionApproach;
  successChance: number;
  rewardMultiplier: number;
  durationMultiplier: number;
  durationSeconds: number;
  failureHpRatio: number;
}

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
  currency?: "INCURSION_TOKEN" | "WORLD_BOSS_FRAGMENT" | null;
  itemId?: string | null;
  itemName?: string | null;
  item?: {
    id: string;
    name: string;
    tier?: number | null;
    rarity?: string | null;
    slot?: string | null;
    family?: string | null;
    materialOrigin?: string | null;
    iconUrl?: string | null;
    imageUrl?: string | null;
    assetKey?: string | null;
  } | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  assetKey?: string | null;
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
  successEntryRefundPercent: number;
  successEntryRefundGold: number;
  failureEntryRefundPercent: number;
  failureEntryRefundGold: number;
  durationSeconds: number;
  difficulty: IncursionDifficulty;
  riskLevel: number;
  approaches: IncursionApproachProfile[];
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
  entryGoldRefund: number;
  xpReward: number;
  goldReward: number;
  approach: IncursionApproach;
  successChance: number;
  rewardMultiplier: number;
  outcomeRoll?: number | null;
  outcomeSummary?: string | null;
  success?: boolean | null;
  progressPercent: number;
  remainingSeconds: number;
  timeline?: ActivityTimelineSnapshot | null;
  canClaim: boolean;
  incursion: Incursion;
  rewards?: Array<{
    id?: string;
    rewardType: IncursionRewardType;
    currency?: "INCURSION_TOKEN" | "WORLD_BOSS_FRAGMENT" | null;
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

export interface CancelIncursionResponse {
  message: string;
  session: IncursionSession;
}

export interface ClaimIncursionResponse {
  message: string;
  success: boolean;
  hpLost: number;
  session: IncursionSession;
  xpGained: number;
  goldGained: number;
  entryGoldRefund: number;
  lootGoldGained: number;
  goldSpent: number;
  netEntryGoldSpent: number;
  levelUp: {
    leveledUp: boolean;
    levelsGained: number;
    oldLevel: number;
    newLevel: number;
  };
  rewards: NonNullable<IncursionSession["rewards"]>;
}
