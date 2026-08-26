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
  | "CURRENCY"
  | "MATERIAL"
  | "CONSUMABLE"
  | "EQUIPMENT"
  | "ITEM"
  | "PET_EGG";

export interface WorldBossRewardPreview {
  id: string;
  rewardType: WorldBossRewardType;
  currency?: "INCURSION_TOKEN" | "WORLD_BOSS_FRAGMENT" | null;
  minQuantity: number;
  maxQuantity: number;
  chance: number;
  guaranteed: boolean;
  onlyIfDefeated: boolean;
  requiresMinParticipation: boolean;
  randomPetCocoon?: boolean;
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

export interface WorldBossGrantedReward {
  id: string;
  rewardType: WorldBossRewardType;
  currency?: "INCURSION_TOKEN" | "WORLD_BOSS_FRAGMENT" | null;
  quantity: number;
  rarity?: string | null;
  item?: { id: string; name: string } | null;
}

export interface WorldBossSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  tier: number;
  bossLevel?: number;
  minLevel: number;
  maxLevel: number;
  respawnIntervalSeconds?: number;
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
  updatedAt?: string;
  status: WorldBossEventStatus;
  startsAt: string;
  endsAt: string;
  remainingSeconds: number;
  remainingSecondsToStart?: number;
  remainingSecondsToEnd?: number;
  remainingSecondsToEntryClose?: number;
  entryWindowEndsAt?: string;
  nextRespawnSeconds?: number;
  respawnIntervalSeconds?: number;
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
  rewards?: WorldBossGrantedReward[];
}

export interface WorldBossStatusResponse {
  message?: string | null;
  serverNow?: string;
  event: WorldBossEventSummary | null;
  participant: WorldBossParticipantSummary | null;
  rewardsGranted?: WorldBossGrantedReward[] | null;
  eligible?: { canJoin: boolean; reason?: string | null };
}

export interface WorldBossAvailableResponse {
  message?: string | null;
  events: WorldBossStatusResponse[];
  recentReward?: WorldBossStatusResponse | null;
}
