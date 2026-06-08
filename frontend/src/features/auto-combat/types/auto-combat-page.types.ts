import type {
  DashboardCharacterViewModel,
  DashboardEquipmentItem,
  DashboardPotionConfigViewModel,
} from "../../dashboard/types/dashboard.types";
import type {
  AutoCombatRealtimeEvent,
  AutoCombatSessionApiViewModel,
  AutoCombatStatusResponse,
  StartAutoCombatBattlePayload,
} from "./auto-combat.types";

export type AutoCombatTab = "battle" | "stats";

export type RealtimeActor = "PLAYER" | "MOB" | "SYSTEM";
export type RealtimeTarget = "PLAYER" | "MOB" | "SYSTEM";

export type LooseLevelProgressSource = {
  level?: number | null;
  oldLevel?: number | null;
  newLevel?: number | null;

  xp?: number | null;
  totalXp?: number | null;
  currentXp?: number | null;
  gainedXp?: number | null;

  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;

  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;

  progressPercent?: number | null;
  xpProgressPercent?: number | null;
  isAtLevelCap?: boolean | null;
};

export type CharacterViewModelWithLayoutFields = DashboardCharacterViewModel & {
  className: string;
  classId: string;
  avatarKey?: string | null;
  avatarUrl?: string | null;
  currentMapName: string;

  totalXp?: number | null;
  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;
  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: LooseLevelProgressSource | null;
};

export type PotionEquipmentItem = DashboardEquipmentItem & {
  quantity?: number | null;
  availableQuantity?: number | null;
};

export type CharacterPotionConfigWithItem = Omit<
  DashboardPotionConfigViewModel,
  "potion" | "potionItem"
> & {
  autoRestEnabled?: boolean | null;
  autoRestStartHpPercent?: number | null;
  autoRestStopHpPercent?: number | null;
  potion?: PotionEquipmentItem | null;
  potionItem?: PotionEquipmentItem | null;
};

export type CharacterWithSinglePotionConfig = Omit<
  CharacterViewModelWithLayoutFields,
  "potionConfig" | "potionConfigs" | "autoPotionConfig"
> & {
  potionConfig?: CharacterPotionConfigWithItem | null;
  potionConfigs?: CharacterPotionConfigWithItem[];
  autoPotionConfig?: CharacterPotionConfigWithItem | null;
};

export type PotionInventoryOption = PotionEquipmentItem & {
  itemId: string;
  quantity: number;
  inventoryItemId?: string | null;
};

export type PotionConfigApiResponse = {
  message?: string;
  character?: {
    id?: string;
    name?: string;
  };
  config?: {
    id?: string;
    enabled?: boolean;
    potionItemId?: string | null;
    hpThresholdPercent?: number | null;
    useInManualCombat?: boolean | null;
    useInAutoCombat?: boolean | null;
    autoRestEnabled?: boolean | null;
    autoRestStartHpPercent?: number | null;
    autoRestStopHpPercent?: number | null;
  };
  potion?: PotionEquipmentItem | null;
  summary?: {
    hasPotion?: boolean;
    hasPotionInInventory?: boolean;
    availableQuantity?: number;
    canAutoUseInManualCombat?: boolean;
    canAutoUseInAutoCombat?: boolean;
    canAutoUse?: boolean;
    triggerText?: string;
    restText?: string;
  };
};

export type UpdatePotionConfigPayload = {
  enabled?: boolean;
  potionItemId?: string | null;
  hpThresholdPercent?: number;
  useInManualCombat?: boolean;
  useInAutoCombat?: boolean;
  autoRestEnabled?: boolean;
  autoRestStartHpPercent?: number;
  autoRestStopHpPercent?: number;
};

export type CharacterProgressSource = {
  level?: number | null;
  xp?: number | null;
  totalXp?: number | null;

  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;

  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: LooseLevelProgressSource | null;
};

export type RealtimeCombatState = {
  sessionId?: string | null;

  mobId?: string | null;
  mobName?: string | null;
  mobCurrentHp?: number | null;
  mobMaxHp?: number | null;
  mobHpPercent?: number | null;

  characterCurrentHp?: number | null;
  characterMaxHp?: number | null;
  characterHpPercent?: number | null;

  lastMessage?: string | null;
  message?: string | null;
  lastDamage?: number | null;
  lastEventType?: string | null;
  isCritical?: boolean | null;
  isDodged?: boolean | null;

  actor?: RealtimeActor | null;
  target?: RealtimeTarget | null;

  round?: number | null;
  combatIndex?: number | null;
  battleProgressSeconds?: number | null;
  battleProgressPercent?: number | null;
  cycleStartedAt?: string | number | Date | null;
  cycleDurationMs?: number | null;
  cycleDurationSeconds?: number | null;
  progressUpdatedAt?: string | number | Date | null;
  serverNow?: string | number | Date | null;
  estimatedKillTimeSeconds?: number | null;
  baseKillTimeSeconds?: number | null;
  playerOffensivePower?: number | null;
  monsterRecommendedPower?: number | null;
  killsPerMinute?: number | null;
  killsPerHour?: number | null;
  difficultyLabel?: string | null;
  mobIndex?: number | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  baseXpGained?: number | null;
  premiumBonusXp?: number | null;
  premiumPotentialBonusXp?: number | null;
  premiumTotalXp?: number | null;
  isPremiumActive?: boolean | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;

  updatedAt?: number;
};

export type RealtimeCharacterProgressState = {
  sessionId?: string | null;

  level?: number;
  xp?: number;

  currentLevelXp?: number;
  xpToNextLevel?: number;
  nextLevelXp?: number;
  xpProgressPercent?: number;

  xpIntoCurrentLevel?: number;
  xpNeededForNextLevel?: number;
  currentLevelStartXp?: number;
  nextLevelRequiredXp?: number;
  isAtLevelCap?: boolean;

  xpGained?: number;
  leveledUp?: boolean;
  levelsGained?: number;

  updatedAt?: number;
};

export type RealtimeSessionTotalsState = {
  sessionId?: string | null;

  currentCombatIndex?: number;
  totalCombats?: number;
  totalRounds?: number;
  totalKills?: number;
  totalXpGained?: number;
  baseXpGained?: number;
  premiumBonusXp?: number;
  premiumPotentialBonusXp?: number;
  premiumTotalXp?: number;
  isPremiumActive?: boolean;
  totalLoot?: number;
  potionsUsed?: number;

  updatedAt?: number;
};

export type AutoCombatRealtimeStateLoose = {
  status?: AutoCombatStatusResponse | null;
  autoCombatStatus?: AutoCombatStatusResponse | null;

  session?: AutoCombatSessionApiViewModel | null;
  activeSession?: AutoCombatSessionApiViewModel | null;

  character?: {
    id?: string | null;
    name?: string | null;

    level?: number | null;
    xp?: number | null;
    totalXp?: number | null;

    currentHp?: number | null;
    maxHp?: number | null;
    hpPercent?: number | null;

    currentLevelXp?: number | null;
    xpToNextLevel?: number | null;
    nextLevelXp?: number | null;
    xpProgressPercent?: number | null;

    xpIntoCurrentLevel?: number | null;
    xpNeededForNextLevel?: number | null;
    currentLevelStartXp?: number | null;
    nextLevelRequiredXp?: number | null;
    isAtLevelCap?: boolean | null;

    xpGained?: number | null;
    leveledUp?: boolean | null;
    levelsGained?: number | null;

    updatedAt?: number | null;
  } | null;

  mob?: {
    id?: string | null;
    name?: string | null;

    currentHp?: number | null;
    maxHp?: number | null;
    hpPercent?: number | null;

    level?: number | null;
    tier?: number | null;

    updatedAt?: number | null;
  } | null;

  visual?: {
    lastMessage?: string | null;
    lastDamage?: number | null;
    lastEventType?: string | null;

    actor?: RealtimeActor | null;
    target?: RealtimeTarget | null;

    isCritical?: boolean | null;
    isDodged?: boolean | null;

    updatedAt?: number | null;
  } | null;

  combat?: RealtimeCombatState | null;
  realtimeCombat?: RealtimeCombatState | null;

  characterProgress?: RealtimeCharacterProgressState | null;
  progress?: RealtimeCharacterProgressState | null;
  realtimeCharacterProgress?: RealtimeCharacterProgressState | null;

  /**
   * Totais visuais liberados pelo AutoCombatRealtimeProvider.
   * Deve ter prioridade sobre totals/status durante a batalha ao vivo.
   */
  displayTotals?: RealtimeSessionTotalsState | null;
  sessionTotals?: RealtimeSessionTotalsState | null;
  totals?: RealtimeSessionTotalsState | null;
  realtimeSessionTotals?: RealtimeSessionTotalsState | null;

  battleLogEvents?: AutoCombatRealtimeEvent[];
  eventLog?: AutoCombatRealtimeEvent[];
  events?: AutoCombatRealtimeEvent[];

  activeEvent?: AutoCombatRealtimeEvent | null;
  activeEventImpactApplied?: boolean;
  displayedEvent?: AutoCombatRealtimeEvent | null;
  currentEvent?: AutoCombatRealtimeEvent | null;
  lastProcessedEvent?: AutoCombatRealtimeEvent | null;
  lastEvent?: AutoCombatRealtimeEvent | null;

  eventQueue?: AutoCombatRealtimeEvent[];
  queue?: AutoCombatRealtimeEvent[];
  realtimeEventQueue?: AutoCombatRealtimeEvent[];

  isConnected?: boolean;
  isJoined?: boolean;
  isSynchronizing?: boolean;
  isActive?: boolean;
  hasActiveSession?: boolean;
  hasActiveAutoCombat?: boolean;
};

export type AutoCombatRealtimeActions = {
  start?: (payload: {
    characterId: string;
    subMapId?: string;
    mapId?: string;
  }) => Promise<AutoCombatStatusResponse>;

  startAutoCombat?: (payload: {
    characterId: string;
    subMapId?: string;
    mapId?: string;
  }) => Promise<AutoCombatStatusResponse>;

  stopHunt?: () => Promise<AutoCombatStatusResponse>;

  startBattle?: (
    payload?: StartAutoCombatBattlePayload,
  ) => Promise<AutoCombatStatusResponse>;

  stop?: () => Promise<AutoCombatStatusResponse>;

  stopAutoCombat?: (characterId?: string) => Promise<AutoCombatStatusResponse>;
};

export type AutoCombatRealtimeEventLoose = AutoCombatRealtimeEvent & {
  createdAt?: string | null;

  characterXp?: number | null;
  characterLevel?: number | null;
  totalXp?: number | null;
  baseXpGained?: number | null;
  premiumBonusXp?: number | null;
  premiumPotentialBonusXp?: number | null;
  premiumTotalXp?: number | null;
  isPremiumActive?: boolean | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;

  healedAmount?: number | null;

  potionItemId?: string | null;
  potionItemName?: string | null;
  potionTriggerPercent?: number | null;

  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;
};

export type AutoCombatRealtimePotionEvent = AutoCombatRealtimeEventLoose;
