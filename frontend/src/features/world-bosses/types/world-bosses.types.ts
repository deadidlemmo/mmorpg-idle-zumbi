export type WorldBossEventStatus =
  | "SCHEDULED"
  | "LOBBY_OPEN"
  | "ACTIVE"
  | "DEFEATED"
  | "EXPIRED"
  | "REWARDED"
  | "CANCELLED";

export type WorldBossRewardType =
  | "XP"
  | "GOLD"
  | "MATERIAL"
  | "CONSUMABLE"
  | "EQUIPMENT"
  | "ITEM"
  | "PET_EGG";

export interface WorldBossRewardPreview {
  id: string;
  rewardType: WorldBossRewardType;
  minQuantity: number;
  maxQuantity: number;
  chance: number;
  guaranteed: boolean;
  onlyIfDefeated: boolean;
  minContributionPercent: number;
  rarity?: string | null;
  item?: {
    id: string;
    name: string;
    tier: number;
    rarity?: string | null;
    family?: string | null;
  } | null;
}

export interface WorldBossSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  tier: number;
  minLevel: number;
  maxLevel: number;
  durationSeconds: number;
  difficulty: string;
  riskLevel: number;
  attackPower: number;
  defense: number;
  resistance: number;
  mutationLevel: number;
  imageUrl?: string | null;
  assetKey?: string | null;
  map: {
    id: string;
    name: string;
    tier: number;
    minLevel?: number | null;
    maxLevel?: number | null;
  };
  rewards: WorldBossRewardPreview[];
}

export interface WorldBossEventSummary {
  id: string;
  status: WorldBossEventStatus;
  startsAt: string;
  endsAt: string;
  remainingSeconds: number;
  remainingSecondsToStart?: number;
  remainingSecondsToEnd?: number;
  currentHp: number;
  maxHp: number;
  hpPercent: number;
  progressPercent: number;
  totalDamage: number;
  participantCount: number;
  lobbyCount?: number;
  defeatedAt?: string | null;
  rewardedAt?: string | null;
  worldBoss: WorldBossSummary;
}

export interface WorldBossParticipantSummary {
  id: string;
  damageDealt: number;
  contributionPercent: number;
  joinedAt: string;
  lastContributionAt: string;
  activeSeconds: number;
  rewardGranted: boolean;
  rewardGrantedAt?: string | null;
  rank?: number | null;
  eligibleForReward: boolean;
  rewards?: Array<{
    id: string;
    rewardType: WorldBossRewardType;
    quantity: number;
    rarity?: string | null;
    item?: { id: string; name: string } | null;
  }>;
}

export interface WorldBossStatusResponse {
  message?: string | null;
  event: WorldBossEventSummary | null;
  participant: WorldBossParticipantSummary | null;
  rewardsGranted?: unknown[] | null;
  eligible?: { canJoin: boolean; reason?: string | null };
}

export interface WorldBossAvailableResponse {
  message?: string | null;
  events: WorldBossStatusResponse[];
}
