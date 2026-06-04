export type DashboardItemRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'EPIC'
  | 'LEGENDARY';

export type DashboardEquipmentSlotKey =
  | 'mainHand'
  | 'offHand'
  | 'head'
  | 'armor'
  | 'pants'
  | 'boots';

export type DashboardItemSlot =
  | 'MAIN_HAND'
  | 'OFF_HAND'
  | 'HEAD'
  | 'ARMOR'
  | 'PANTS'
  | 'BOOTS'
  | 'CONSUMABLE'
  | 'MATERIAL';

export type DashboardInventoryItemType =
  | 'EQUIPMENT'
  | 'CONSUMABLE'
  | 'MATERIAL';

export type DashboardCharacterStatus =
  | 'IDLE'
  | 'ACTIVE'
  | 'AUTO_COMBAT'
  | 'DEAD'
  | 'IN_TOWN'
  | 'BLOCKED'
  | 'DELETED'
  | string;

export type DashboardAutoCombatSessionStatus =
  | 'ACTIVE'
  | 'STOPPED'
  | 'FINISHED'
  | 'DEFEATED'
  | 'FAILED'
  | 'CANCELLED'
  | string;

export type DashboardActivityStatus =
  | 'ACTIVE'
  | 'FINISHED'
  | 'CANCELLED'
  | 'STOPPED'
  | string;

export interface DashboardStats {
  strength: number;
  vitality: number;
  agility: number;
  precision: number;
  technique: number;
  willpower: number;
}

export interface DashboardDerivedStats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance?: number | null;
  critDamage?: number | null;
  powerScore?: number | null;
}

export interface DashboardStatsDetail {
  base?: DashboardStats | null;
  levelBonus?: DashboardStats | null;
  equipmentBonus?: DashboardStats | null;
  total?: DashboardStats | null;
  derived?: DashboardDerivedStats | null;
}

export interface DashboardCalculatedStatsResponse {
  /**
   * Formato usado principalmente pelo endpoint /characters/:id/overview.
   */
  strength?: number | null;
  vitality?: number | null;
  agility?: number | null;
  precision?: number | null;
  technique?: number | null;
  willpower?: number | null;

  attack?: number | null;
  defense?: number | null;
  speed?: number | null;
  maxHp?: number | null;

  detail?: DashboardStatsDetail | null;

  /**
   * Formato usado por alguns retornos diretos do backend,
   * como create/findMine/findOne.
   */
  level?: number | null;
  basePrimaryStats?: DashboardStats | null;
  levelBonusStats?: DashboardStats | null;
  equipmentBonusStats?: DashboardStats | null;
  totalPrimaryStats?: DashboardStats | null;
  derivedCombatStats?: DashboardDerivedStats | null;
}

export interface DashboardGameClassViewModel {
  id: string;
  name: string;
  description?: string | null;

  baseStrength?: number | null;
  baseVitality?: number | null;
  baseAgility?: number | null;
  basePrecision?: number | null;
  baseTechnique?: number | null;
  baseWillpower?: number | null;
}

export interface DashboardMapViewModel {
  id: string;
  name: string;
  tier: number;
  minLevel?: number | null;
  maxLevel?: number | null;
  description?: string | null;
}

export interface DashboardSubMapViewModel {
  id: string;
  name: string;
  tier: number;
  minLevel?: number | null;
  maxLevel?: number | null;
  description?: string | null;
  mapId?: string | null;

  map?: DashboardMapViewModel | null;
  mapName?: string | null;
}

export interface DashboardEquipmentItem {
  id: string;
  name: string;
  description?: string | null;

  tier: number;
  rarity?: DashboardItemRarity | string | null;

  slot?: DashboardItemSlot | string | null;
  family?: string | null;

  iconUrl?: string | null;
  imageUrl?: string | null;
  assetKey?: string | null;

  classId?: string | null;
  mapId?: string | null;

  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;

  healFlat?: number | null;
  healPercent?: number | null;
  usableInCombat?: boolean | null;
  usableOutOfCombat?: boolean | null;
  minTier?: number | null;
  maxTier?: number | null;

  materialOrigin?: string | null;

  isCraftable?: boolean | null;

  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardEquipmentViewModel {
  mainHand?: DashboardEquipmentItem | null;
  offHand?: DashboardEquipmentItem | null;
  head?: DashboardEquipmentItem | null;
  armor?: DashboardEquipmentItem | null;
  pants?: DashboardEquipmentItem | null;
  boots?: DashboardEquipmentItem | null;
}

export interface DashboardInventoryItemViewModel {
  id: string;
  characterId?: string;
  itemId: string;

  quantity: number;
  type: DashboardInventoryItemType | string;

  item: DashboardEquipmentItem;

  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardInventorySummaryEntry {
  id: string;
  name: string;
  description?: string | null;

  quantity: number;

  rarity?: DashboardItemRarity | string | null;
  tier: number;
  slot?: DashboardItemSlot | string | null;
  family?: string | null;

  classId?: string | null;
  mapId?: string | null;

  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;

  healFlat?: number | null;
  healPercent?: number | null;
  usableInCombat?: boolean | null;
  usableOutOfCombat?: boolean | null;
  minTier?: number | null;
  maxTier?: number | null;

  materialOrigin?: string | null;
}

export interface DashboardInventorySummaryViewModel {
  totalDifferentItems: number;
  totalQuantity: number;

  materials: DashboardInventorySummaryEntry[];
  consumables: DashboardInventorySummaryEntry[];
  equipment: DashboardInventorySummaryEntry[];
}

export interface DashboardPotionConfigViewModel {
  id?: string;
  characterId?: string;
  potionItemId?: string | null;

  enabled: boolean;
  useInAutoCombat: boolean;
  useInManualCombat?: boolean;
  hpThresholdPercent: number;

  potion?: DashboardEquipmentItem | null;
  potionItem?: DashboardEquipmentItem | null;
}

export interface DashboardAutoCombatLootViewModel {
  itemId: string;
  quantity: number;
  item?: DashboardEquipmentItem | null;
}

export interface DashboardAutoCombatMobSummaryViewModel {
  mobId: string;
  mobName?: string;
  mobLevel?: number;
  mobTier?: number;
  kills: number;
  xpGained: number;
}

export interface DashboardAutoCombatCurrentMobViewModel {
  id: string;
  name: string;

  level?: number | null;
  tier?: number | null;

  /**
   * HP base do mob cadastrado no banco.
   */
  hp?: number | null;

  /**
   * HP atual do mob dentro da sessão ativa.
   */
  currentHp?: number | null;

  /**
   * HP máximo do mob dentro da sessão ativa.
   */
  maxHp?: number | null;

  /**
   * Percentual atual de HP calculado pelo backend ou pelo frontend.
   */
  hpPercent?: number | null;

  attack?: number | null;
  defense?: number | null;
  speed?: number | null;
  xpReward?: number | null;
}

export interface DashboardAutoCombatPreviewViewModel {
  label?: string;

  subMap?: DashboardSubMapViewModel | null;
  map?: DashboardMapViewModel | null;

  /**
   * Estado real do mob atual retornado no overview.
   * Usado principalmente pela DashboardActivityBar.
   */
  currentMobId?: string | null;
  currentMobHp?: number | null;
  currentMobMaxHp?: number | null;
  currentMob?: DashboardAutoCombatCurrentMobViewModel | null;

  /**
   * Estado real do turno atual da sessão.
   */
  currentRound?: number | null;
  currentCombatIndex?: number | null;

  elapsedTotalSeconds?: number;
  elapsedTotalMinutes?: number;

  elapsedSinceLastProcessSeconds?: number;
  elapsedSinceLastProcessMinutes?: number;

  durationSeconds?: number | null;
  durationMinutes?: number | null;

  remainingSeconds?: number | null;
  remainingMinutes?: number | null;

  roundDurationSeconds?: number;

  estimatedRoundsReadyToProcess?: number;
  estimatedCombatsReadyToResolve?: number;

  canProcessNow?: boolean;

  progressToNextRoundPercent?: number;
  nextRoundRemainingSeconds?: number;
  nextRoundRemainingMinutes?: number;

  totals?: {
    kills?: number;
    totalKills?: number;
    combatsResolved?: number;
    roundsResolved?: number;
    xpGained?: number;
  };

  timestamps?: {
    startedAt?: string;
    lastProcessedAt?: string | null;
    endsAt?: string | null;
  };

  isFinishedByTime?: boolean;
}

export interface DashboardAutoCombatSessionViewModel {
  id: string;
  characterId?: string;
  mapId?: string | null;
  subMapId?: string;

  status: DashboardAutoCombatSessionStatus;

  startedAt: string;
  endsAt?: string | null;
  lastProcessedAt?: string | null;
  finishedAt?: string | null;

  durationSeconds?: number;
  roundDurationSeconds?: number;
  remainingSeconds?: number;

  totalRounds?: number;
  totalCombats?: number;
  totalKills?: number;
  totalXpGained?: number;
  totalDamageDealt?: number;
  totalDamageTaken?: number;
  totalPotionsUsed?: number;

  totalRoundsResolved?: number;
  totalCombatsResolved?: number;

  /**
   * Estado real do mob atual salvo na sessão ativa.
   * Esses campos evitam a ActivityBar iniciar com HP genérico 100%.
   */
  currentMobId?: string | null;
  currentMobHp?: number | null;
  currentMobMaxHp?: number | null;
  currentMob?: DashboardAutoCombatCurrentMobViewModel | null;

  /**
   * Estado real do combate/rodada atual.
   */
  currentRound?: number | null;
  currentCombatIndex?: number | null;

  loot?: DashboardAutoCombatLootViewModel[];
  loots?: DashboardAutoCombatLootViewModel[];

  mobSummary?: DashboardAutoCombatMobSummaryViewModel[];
  mobSummaries?: DashboardAutoCombatMobSummaryViewModel[];

  subMap?: DashboardSubMapViewModel | null;
  map?: DashboardMapViewModel | null;

  combatPreview?: DashboardAutoCombatPreviewViewModel | null;
}

export interface DashboardGatheringMaterialViewModel {
  id: string;
  name: string;
  tier: number;
  rarity?: DashboardItemRarity | string | null;
  family?: string | null;
  materialOrigin?: string | null;
}

export interface DashboardGatheringProductionPreviewViewModel {
  label?: string;

  material?: DashboardGatheringMaterialViewModel | null;

  map?: {
    id: string;
    name: string;
    tier: number;
  } | null;

  elapsedSeconds?: number;
  elapsedMinutes?: number;
  elapsedHours?: number;

  ratePerHour?: number;
  estimatedQuantityToCollect?: number;
  canCollectNow?: boolean;

  currentProgressRemainder?: number;
  estimatedNewProgressRemainder?: number;
  nextUnitProgressPercent?: number;
}

export interface DashboardGatheringSessionViewModel {
  id: string;
  status: DashboardActivityStatus;
  origin?: string | null;

  startedAt: string;
  lastResolvedAt?: string | null;
  progressRemainder?: number | null;

  map?: DashboardMapViewModel | null;
  targetMaterial?: DashboardGatheringMaterialViewModel | null;

  productionPreview?: DashboardGatheringProductionPreviewViewModel | null;
}

export interface DashboardGatheringSkillViewModel {
  key: string;
  name: string;
  description?: string;

  level: number;
  xp: number;
  xpToNextLevel: number;

  progressPercent?: number | null;

  statBonusName?: keyof DashboardStats | string;
  statBonusValue?: number | null;
}

export interface DashboardLevelProgressViewModel {
  oldLevel?: number | null;
  newLevel?: number | null;
  level?: number | null;

  /**
   * XP total acumulado do personagem.
   */
  xp?: number | null;
  totalXp?: number | null;

  /**
   * XP ganho em uma ação específica.
   */
  gainedXp?: number | null;

  /**
   * XP dentro do nível atual.
   * Mantemos aliases porque diferentes endpoints podem mandar nomes diferentes.
   */
  currentXp?: number | null;
  currentLevelXp?: number | null;
  xpIntoCurrentLevel?: number | null;

  /**
   * Tamanho total da barra do nível atual.
   */
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;

  /**
   * XP restante para o próximo nível.
   */
  xpNeededForNextLevel?: number | null;

  /**
   * Marcos absolutos da progressão.
   */
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;

  /**
   * Percentual da barra atual.
   */
  progressPercent?: number | null;
  xpProgressPercent?: number | null;

  leveledUp?: boolean | null;
  levelsGained?: number | null;

  levelCap?: number | null;
  isAtLevelCap?: boolean | null;
}

export interface DashboardCharacterViewModel {
  id: string;
  name: string;

  level: number;

  /**
   * XP salvo no banco.
   * No backend atual, esse valor representa o XP total acumulado.
   */
  xp: number;

  /**
   * Alias explícito para XP total.
   * Usado para evitar confusão entre XP total e XP da barra atual.
   */
  totalXp?: number | null;

  /**
   * Campos diretos de progressão usados pelo DashboardLayout.
   */
  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;

  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: DashboardLevelProgressViewModel | null;

  currentHp: number;
  maxHp: number;

  status?: DashboardCharacterStatus;

  gold?: number | null;
  cash?: number | null;
  wallet?: { gold?: number | null; cash?: number | null } | null;
  currencies?: { gold?: number | null; cash?: number | null } | null;

  classId?: string;
  className?: string;

  avatarKey?: string | null;
  avatarUrl?: string | null;

  class?: DashboardGameClassViewModel | null;
  gameClass?: DashboardGameClassViewModel | null;

  map?: DashboardMapViewModel | null;
  currentMap?: DashboardMapViewModel | null;
  currentMapName?: string;

  subMap?: DashboardSubMapViewModel | null;
  currentSubMap?: DashboardSubMapViewModel | null;

  baseStats?: DashboardStats;
  equipmentStats?: DashboardStats;
  totalStats?: DashboardStats;

  derivedStats?: DashboardDerivedStats;

  /**
   * Alguns endpoints retornam stats dentro do character.
   * Outros retornam stats na raiz da resposta.
   */
  stats?: DashboardCalculatedStatsResponse | null;

  equipment?: DashboardEquipmentViewModel;

  inventory?: DashboardInventoryItemViewModel[];

  potionConfig?: DashboardPotionConfigViewModel | null;
  potionConfigs?: DashboardPotionConfigViewModel[];
  autoPotionConfig?: DashboardPotionConfigViewModel | null;

  inventorySummary?: DashboardInventorySummaryViewModel;

  autoCombatSession?: DashboardAutoCombatSessionViewModel | null;

  gatheringSkills?: DashboardGatheringSkillViewModel[];

  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}


export interface DashboardIncursionSessionViewModel {
  id: string;
  characterId?: string | null;
  incursionId: string;
  status: DashboardActivityStatus;
  startedAt: string;
  endsAt: string;
  completedAt?: string | null;
  claimedAt?: string | null;
  goldCostPaid?: number | null;
  xpReward?: number | null;
  goldReward?: number | null;
  progressPercent?: number | null;
  remainingSeconds?: number | null;
  canClaim?: boolean | null;
  incursion?: {
    id: string;
    name: string;
    slug?: string | null;
    tier?: number | null;
    minLevel?: number | null;
    maxLevel?: number | null;
    goldCost?: number | null;
    durationSeconds?: number | null;
    difficulty?: string | null;
    riskLevel?: number | null;
    map?: DashboardMapViewModel | null;
  } | null;
}

export interface CharacterOverviewResponse {
  character: DashboardCharacterViewModel;

  stats?: DashboardCalculatedStatsResponse | null;

  equipment?: DashboardEquipmentViewModel;

  activity?: {
    hasActiveAutoCombat?: boolean;
    hasActiveGathering?: boolean;
    hasActiveIncursion?: boolean;
    hasActiveWorldBoss?: boolean;
    activeAutoCombatSession?: DashboardAutoCombatSessionViewModel | null;
    activeGatheringSession?: DashboardGatheringSessionViewModel | null;
    activeIncursionSession?: DashboardIncursionSessionViewModel | null;
    activeWorldBossParticipation?: unknown | null;
  };

  progression?: {
    currentMap?: DashboardMapViewModel | null;
    availableMaps?: DashboardMapViewModel[];
    recommendedMap?: DashboardMapViewModel | null;
  };

  shortcuts?: {
    canUseInfirmary?: boolean;
    canStartAutoCombat?: boolean;
    canStartGathering?: boolean;
    hasCraftableRecipes?: boolean;
  };
}

export interface DashboardCharacterOverviewResponse {
  character: DashboardCharacterViewModel;

  stats?: CharacterOverviewResponse['stats'];
  equipment?: DashboardEquipmentViewModel;
  activity?: CharacterOverviewResponse['activity'];
  progression?: CharacterOverviewResponse['progression'];
  shortcuts?: CharacterOverviewResponse['shortcuts'];
}

export interface DashboardCharacterStatusResponse {
  character: DashboardCharacterViewModel;

  class?: {
    id: string;
    name: string;
    description?: string | null;
  };

  map?: DashboardMapViewModel | null;

  primaryStats?: {
    base?: DashboardStats;
    levelBonus?: DashboardStats;
    equipmentBonus?: DashboardStats;
    total?: DashboardStats;
  };

  combatStats?: DashboardDerivedStats;

  equipment?: DashboardEquipmentViewModel;

  autoPotionConfig?: DashboardPotionConfigViewModel | null;

  inventorySummary?: DashboardInventorySummaryViewModel;
}

export interface DashboardApiErrorResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
}
