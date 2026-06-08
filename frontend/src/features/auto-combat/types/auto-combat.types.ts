import type {
  DashboardAutoCombatSessionStatus,
  DashboardEquipmentItem,
  DashboardItemRarity,
  DashboardSubMapViewModel,
} from "../../dashboard/types/dashboard.types";

export interface StartAutoCombatPayload {
  characterId: string;
  subMapId?: string;
  mapId?: string;
}

export interface PreviewAutoCombatPayload {
  characterId: string;
  subMapId?: string;
  mapId?: string;
  projectionSeconds?: number;
  iterations?: number;
}

/* =========================================================
   EXP / LEVEL
   ========================================================= */

export interface AutoCombatLevelProgressViewModel {
  oldLevel?: number | null;
  newLevel?: number | null;
  level?: number | null;

  /**
   * XP total acumulado do personagem.
   */
  xp?: number | null;
  totalXp?: number | null;

  /**
   * XP atual/ganho em operações específicas.
   */
  currentXp?: number | null;
  gainedXp?: number | null;

  /**
   * XP dentro do nível atual.
   */
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

/* =========================================================
   TEMPO REAL / WEBSOCKET
   ========================================================= */

export type AutoCombatRealtimeEventType =
  | "HUNT_TARGET_FOUND"
  | "MOB_SPAWNED"
  | "PLAYER_HIT"
  | "MOB_HIT"
  | "DODGE"
  | "POTION_USED"
  | "AUTO_REST"
  | "MOB_DEFEATED"
  | "PLAYER_DEFEATED"
  | "SESSION_STARTED"
  | "SESSION_UPDATED"
  | "SESSION_FINISHED"
  | "SESSION_STOPPED"
  | "SESSION_ERROR"
  | string;

export type AutoCombatRealtimeActor = "PLAYER" | "MOB" | "SYSTEM" | string;

export type AutoCombatRealtimeTarget = "PLAYER" | "MOB" | "SYSTEM" | string;
export type AutoCombatRealtimePhase =
  | "HUNTING"
  | "ENCOUNTER_READY"
  | "SPAWNING"
  | "PLAYER_TURN"
  | "MOB_TURN"
  | "MOB_DEFEATED"
  | "PLAYER_DEFEATED"
  | "RESTING"
  | "FINISHED"
  | "WAITING_NEXT_ROUND"
  | "IDLE"
  | string;

export interface AutoCombatRealtimeEvent {
  id?: string | null;
  eventId?: string | null;
  characterId?: string | null;
  sessionId?: string | null;
  sequence?: number | null;
  eventKey?: string | null;
  enemyInstanceId?: string | null;
  turnId?: string | null;
  actionId?: string | null;
  actionOrder?: number | null;
  phase?: AutoCombatRealtimePhase | null;
  sessionStatus?: string | null;
  endReason?: string | null;
  shouldRedirectToInfirmary?: boolean | null;
  nextActor?: AutoCombatRealtimeActor | null;
  serverTime?: string | null;
  actionStartedAt?: string | null;
  nextActionAt?: string | null;

  type?: AutoCombatRealtimeEventType;
  message?: string | null;

  /**
   * Estado do mob atual.
   */
  mobId?: string | null;
  mobName?: string | null;
  mobCurrentHp?: number | null;
  mobMaxHp?: number | null;
  mobHpPercent?: number | null;
  battleProgressSeconds?: number | null;
  battleProgressPercent?: number | null;
  cycleStartedAt?: string | number | Date | null;
  cycleDurationMs?: number | null;
  cycleDurationSeconds?: number | null;
  progressUpdatedAt?: string | number | Date | null;
  estimatedKillTimeSeconds?: number | null;
  baseKillTimeSeconds?: number | null;
  playerOffensivePower?: number | null;
  monsterRecommendedPower?: number | null;
  killsPerMinute?: number | null;
  killsPerHour?: number | null;
  difficultyLabel?: string | null;
  mobIndex?: number | null;
  battleTargetMobId?: string | null;
  battleTargetEncounterId?: string | null;
  battleTargetTotal?: number | null;
  battleTargetRemaining?: number | null;

  /**
   * Estado do personagem.
   */
  characterCurrentHp?: number | null;
  characterMaxHp?: number | null;
  characterHpPercent?: number | null;

  /**
   * Resultado do evento.
   */
  damage?: number | null;
  healedAmount?: number | null;
  isCritical?: boolean | null;
  isDodged?: boolean | null;
  hpBefore?: number | null;
  hpAfter?: number | null;
  targetHpBefore?: number | null;
  targetHpAfter?: number | null;
  mobHpBefore?: number | null;
  mobHpAfter?: number | null;
  characterHpBefore?: number | null;
  characterHpAfter?: number | null;

  /**
   * EXP / level em tempo real.
   */
  xpGained?: number | null;
  baseXpGained?: number | null;
  premiumBonusXp?: number | null;
  premiumPotentialBonusXp?: number | null;
  premiumTotalXp?: number | null;
  isPremiumActive?: boolean | null;
  characterXp?: number | null;
  characterLevel?: number | null;
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

  levelProgress?: AutoCombatLevelProgressViewModel | null;

  leveledUp?: boolean | null;
  levelsGained?: number | null;

  /**
   * Totais acumulados da sessão.
   *
   * Importante:
   * - totalCombats deve representar lutas resolvidas.
   * - totalRounds deve representar turnos/rodadas processadas.
   * - totalKills deve representar mobs derrotados.
   */
  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;

  /**
   * Estado da poção usada automaticamente.
   */
  potionItemId?: string | null;
  potionItemName?: string | null;
  potionTriggerPercent?: number | null;

  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;

  restStartHpPercent?: number | null;
  restStopHpPercent?: number | null;

  huntCycleKey?: string | null;
  huntSequence?: number | null;
  foundAt?: string | null;
  nextFindAt?: string | null;
  secondsPerFind?: number | null;
  selectedEncounterId?: string | null;
  targetEncounterId?: string | null;
  targetMobId?: string | null;
  huntingXpGained?: number | null;
  foundEnemiesCount?: number | null;
  availableEnemiesCount?: number | null;
  remainingEnemiesCount?: number | null;
  hasPreservedTrackedEnemies?: boolean | null;
  preservedTrackedEnemiesCount?: number | null;
  autoCombatRecovery?: AutoCombatRecoveryViewModel | null;
  maxTrackedEnemies?: number | null;
  remainingHuntCapacity?: number | null;
  remainingCapacity?: number | null;
  isHuntLimitReached?: boolean | null;
  isLimitReached?: boolean | null;

  /**
   * Posição da sessão.
   */
  round?: number | null;
  combatIndex?: number | null;

  actor?: AutoCombatRealtimeActor | null;
  target?: AutoCombatRealtimeTarget | null;

  createdAt?: string | null;
}

/* =========================================================
   MAPAS / SUBMAPAS / MOBS
   ========================================================= */

export interface AutoCombatMapSummaryViewModel {
  id: string;
  name: string;
  tier: number;
  minLevel?: number | null;
  maxLevel?: number | null;
  description?: string | null;
}

export interface AutoCombatMobDropItemViewModel {
  id: string;
  name: string;
  description?: string | null;
  tier?: number | null;
  rarity?: string | null;
  slot?: string | null;
  family?: string | null;
  slug?: string | null;
}

export interface AutoCombatMobDropViewModel {
  id: string;
  mobId?: string | null;
  itemId: string;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
  item?: AutoCombatMobDropItemViewModel | null;
}

export interface AutoCombatBattleProgressViewModel {
  progressSeconds?: number | null;
  progressPercent?: number | null;
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
  tier?: number | null;
}

export type AutoCombatRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "LETHAL";

export interface AutoCombatSurvivalProjectionViewModel {
  riskLevel?: AutoCombatRiskLevel | string | null;
  expectedDamagePerKill?: number | null;
  expectedMobHitDamage?: number | null;
  expectedDodgeChancePercent?: number | null;
  expectedCriticalChancePercent?: number | null;
  expectedCriticalMultiplier?: number | null;
  projectedKills?: number | null;
  safeKillsWithoutPotions?: number | null;
  safeKillsWithPotions?: number | null;
  extraKillsFromPotions?: number | null;
  expectedPotionsUsed?: number | null;
  availablePotions?: number | null;
  potionHealAmount?: number | null;
  potionTriggerPercent?: number | null;
  projectedFinalHp?: number | null;
  projectedFinalHpPercent?: number | null;
  willSurviveProjection?: boolean | null;
  hpLimited?: boolean | null;
  estimatedKillTimeSeconds?: number | null;
  killsPerMinute?: number | null;
  difficultyLabel?: string | null;
  potionItemId?: string | null;
  potionItemName?: string | null;
}

export interface AutoCombatMobViewModel {
  id: string;
  name: string;
  description?: string | null;

  level: number;
  tier: number;

  hp: number;
  attack: number;
  defense: number;
  speed: number;
  xpReward: number;

  mapId?: string | null;

  currentHp?: number | null;
  maxHp?: number | null;
  hpPercent?: number | null;
  battleProgress?: AutoCombatBattleProgressViewModel | null;
  survivalProjection?: AutoCombatSurvivalProjectionViewModel | null;
  foundCount?: number | null;
  huntFoundCount?: number | null;

  iconUrl?: string | null;
  imageUrl?: string | null;
  assetKey?: string | null;

  drops?: AutoCombatMobDropViewModel[] | null;
}

export interface AutoCombatCurrentMobViewModel {
  id?: string | null;
  enemyInstanceId?: string | null;
  name?: string | null;
  description?: string | null;

  level?: number | null;
  tier?: number | null;

  hp?: number | null;
  attack?: number | null;
  defense?: number | null;
  speed?: number | null;
  xpReward?: number | null;

  currentHp?: number | null;
  maxHp?: number | null;
  hpPercent?: number | null;
  battleProgress?: AutoCombatBattleProgressViewModel | null;
  survivalProjection?: AutoCombatSurvivalProjectionViewModel | null;
  foundCount?: number | null;
  huntFoundCount?: number | null;

  iconUrl?: string | null;
  imageUrl?: string | null;
  assetKey?: string | null;
}

export interface AutoCombatEncounterViewModel {
  id: string;
  subMapId: string;
  mobId: string;

  weight: number;
  isActive: boolean;
  foundCount?: number | null;
  huntFoundCount?: number | null;

  mob?: AutoCombatMobViewModel | null;
}

export interface AutoCombatSubMapViewModel extends DashboardSubMapViewModel {
  map?: AutoCombatMapSummaryViewModel | null;
  mapName?: string | null;

  encounters?: AutoCombatEncounterViewModel[];
}

export interface AutoCombatMapViewModel {
  id: string;
  name: string;
  tier: number;
  minLevel: number;
  maxLevel: number;
  description?: string | null;

  subMaps?: AutoCombatSubMapViewModel[];
  mobs?: AutoCombatMobViewModel[];
  items?: DashboardEquipmentItem[];

  imageUrl?: string | null;
  assetKey?: string | null;
}

/* =========================================================
   PERSONAGEM / SESSÃO
   ========================================================= */

export interface AutoCombatStatusCharacterViewModel {
  id: string;
  name: string;

  class?: string | null;
  classId?: string | null;
  className?: string | null;

  avatarKey?: string | null;
  avatarUrl?: string | null;

  level: number;
  xp: number;

  currentHp: number;
  maxHp: number;

  /**
   * XP total acumulado.
   */
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

  levelProgress?: AutoCombatLevelProgressViewModel | null;
}

export interface AutoCombatHuntingSkillViewModel {
  id?: string | null;
  characterId?: string | null;
  level: number;
  xp: number;
  totalXp: number;
  xpToNextLevel?: number | null;
  xpProgressPercent?: number | null;
  isAtLevelCap?: boolean | null;
  secondsPerEnemy?: number | null;
  maxTrackedEnemies?: number | null;
  bonuses?: {
    betterEncounterChancePercent?: number | null;
    speedPercent?: number | null;
  } | null;
}

export interface AutoCombatHuntingViewModel {
  mapId?: string | null;
  subMapId?: string | null;
  phase?: AutoCombatRealtimePhase | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
  lastProcessedAt?: string | null;
  lastFindAt?: string | null;
  nextFindAt?: string | null;
  foundEnemiesCount?: number | null;
  availableEnemiesCount?: number | null;
  remainingEnemiesCount?: number | null;
  maxTrackedEnemies?: number | null;
  remainingCapacity?: number | null;
  isLimitReached?: boolean | null;
  bonusEnemiesFound?: number | null;
  huntingXpGained?: number | null;
  secondsPerEnemy?: number | null;
  secondsPerFind?: number | null;
  elapsedSeconds?: number | null;
  remainingSeconds?: number | null;
  progressPercent?: number | null;
  foundEnemySequence?: number | null;
  currentTargetSequence?: number | null;
  huntSequence?: number | null;
  lastHuntEventSequence?: number | null;
  selectedEncounterId?: string | null;
  targetEncounterId?: string | null;
  targetMobId?: string | null;
  targetFoundCount?: number | null;
  currentTargetFoundCount?: number | null;
  selectedMob?: AutoCombatCurrentMobViewModel | null;
  targetMob?: AutoCombatCurrentMobViewModel | null;
  currentTarget?: AutoCombatEncounterViewModel | null;
  targetEncounter?: AutoCombatEncounterViewModel | null;
  trackedMonsters?: AutoCombatTrackedMonsterViewModel[];
  skill?: AutoCombatHuntingSkillViewModel | null;
}

export interface AutoCombatBattleSelectionViewModel {
  mobId?: string | null;
  encounterId?: string | null;
  total?: number | null;
  remaining?: number | null;
  defeated?: number | null;
  mob?: AutoCombatCurrentMobViewModel | null;
}

export interface AutoCombatRecoveryViewModel {
  hasPreservedTrackedEnemies?: boolean | null;
  preservedTrackedEnemiesCount?: number | null;
  huntBatchId?: string | null;
  sessionId?: string | null;
  mapId?: string | null;
  subMapId?: string | null;
  mapName?: string | null;
  subMapName?: string | null;
  defeatedAt?: string | null;
}

export interface AutoCombatSessionApiViewModel {
  id: string;
  characterId?: string | null;
  mapId?: string | null;
  subMapId?: string | null;
  map?: AutoCombatMapSummaryViewModel | null;

  status:
    | DashboardAutoCombatSessionStatus
    | "ACTIVE"
    | "STOPPED"
    | "FINISHED"
    | "DEFEATED"
    | "FAILED"
    | "CANCELLED"
    | string;
  endReason?: string | null;
  shouldRedirectToInfirmary?: boolean | null;
  hasPreservedTrackedEnemies?: boolean | null;
  preservedTrackedEnemiesCount?: number | null;
  autoCombatRecovery?: AutoCombatRecoveryViewModel | null;

  startedAt: string;
  endsAt?: string | null;
  lastProcessedAt?: string | null;
  finishedAt?: string | null;

  durationSeconds?: number | null;
  roundDurationSeconds?: number | null;
  remainingSeconds?: number | null;

  /**
   * Totais persistidos/resolvidos da sessão.
   */
  totalCombatsResolved?: number | null;
  totalRoundsResolved?: number | null;
  totalXpGained?: number | null;
  baseXpGained?: number | null;
  premiumBonusXp?: number | null;
  premiumPotentialBonusXp?: number | null;
  premiumTotalXp?: number | null;
  isPremiumActive?: boolean | null;

  /**
   * Aliases/fallbacks usados por alguns retornos.
   */
  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalLoot?: number | null;
  totalPotionsUsed?: number | null;
  potionsUsed?: number | null;

  /**
   * Mob atual salvo na sessão.
   */
  currentMobId?: string | null;
  currentMobHp?: number | null;
  currentMobMaxHp?: number | null;
  killProgressSeconds?: number | null;
  estimatedKillTimeSeconds?: number | null;
  baseKillTimeSeconds?: number | null;
  playerOffensivePower?: number | null;
  monsterRecommendedPower?: number | null;
  currentMobIndex?: number | null;
  battleProgress?: AutoCombatBattleProgressViewModel | null;
  huntStartedAt?: string | null;
  huntStoppedAt?: string | null;
  lastHuntProcessedAt?: string | null;
  huntingLevelAtStart?: number | null;
  huntingXpGained?: number | null;
  foundEnemiesCount?: number | null;
  availableEnemiesCount?: number | null;
  remainingEnemiesCount?: number | null;
  maxTrackedEnemies?: number | null;
  remainingHuntCapacity?: number | null;
  isHuntLimitReached?: boolean | null;
  bonusEnemiesFound?: number | null;
  selectedEncounterId?: string | null;
  selectedEncounterMobId?: string | null;
  battleTargetMobId?: string | null;
  battleTargetEncounterId?: string | null;
  battleTargetTotal?: number | null;
  battleTargetRemaining?: number | null;
  battleSelection?: AutoCombatBattleSelectionViewModel | null;
  enemyInstanceId?: string | null;
  currentEnemyInstanceId?: string | null;
  snapshotSequence?: number | null;
  latestEventSequence?: number | null;
  phase?: AutoCombatRealtimePhase | null;
  nextActor?: AutoCombatRealtimeActor | null;
  lastActionAt?: string | null;
  nextActionAt?: string | null;
  currentMob?: AutoCombatCurrentMobViewModel | null;

  /**
   * Posição atual do combate.
   */
  currentRound?: number | null;
  currentCombatIndex?: number | null;
}

/* =========================================================
   RECOMPENSAS
   ========================================================= */

export interface AutoCombatRewardLootViewModel {
  itemId: string;
  itemName: string;
  quantity: number;
  rarity: DashboardItemRarity | string;
  slot: string;
  tier: number;

  item?: DashboardEquipmentItem | null;
}

export interface AutoCombatRewardMobViewModel {
  mobId: string;
  mobName: string;
  mobLevel: number;
  mobTier: number;
  kills: number;
  xpGained: number;
  foundCount?: number | null;
}

export interface AutoCombatFoundMobViewModel {
  mobId: string;
  mobName: string;
  mobLevel: number;
  mobTier: number;
  foundCount: number;
  remainingCount?: number | null;
  encounterId?: string | null;
  weightSnapshot?: number | null;
  firstFoundAt?: string | null;
  lastFoundAt?: string | null;
  mob?: AutoCombatCurrentMobViewModel | null;
}

export type AutoCombatTrackedMonsterViewModel = AutoCombatFoundMobViewModel;

export interface AutoCombatHuntBatchViewModel {
  id: string;
  characterId?: string | null;
  mapId?: string | null;
  sessionId?: string | null;
  status?: "HUNTING" | "READY" | "CONSUMED" | "CANCELLED" | string;
  startedAt?: string | null;
  stoppedAt?: string | null;
  consumedAt?: string | null;
  cancelledAt?: string | null;
  lastProcessedAt?: string | null;
  huntingLevelAtStart?: number | null;
  huntingXpGained?: number | null;
  foundEnemiesCount?: number | null;
  availableEnemiesCount?: number | null;
  remainingEnemiesCount?: number | null;
  hasPreservedTrackedEnemies?: boolean | null;
  preservedTrackedEnemiesCount?: number | null;
  autoCombatRecovery?: AutoCombatRecoveryViewModel | null;
  maxTrackedEnemies?: number | null;
  remainingCapacity?: number | null;
  isLimitReached?: boolean | null;
  bonusEnemiesFound?: number | null;
  selectedEncounterId?: string | null;
  selectedEncounterMobId?: string | null;
  huntSequence?: number | null;
  mobs?: AutoCombatTrackedMonsterViewModel[];
}

export interface AutoCombatRewardsViewModel {
  loots: AutoCombatRewardLootViewModel[];
  mobs: AutoCombatRewardMobViewModel[];
  trackedMonsters?: AutoCombatTrackedMonsterViewModel[];
}

/* =========================================================
   PROCESSAMENTO DA SESSÃO
   ========================================================= */

export interface AutoCombatProcessingSummary {
  processedNow?: boolean;
  processedSeconds?: number;
  combatsResolved?: number;
  roundsResolved?: number;
  xpGained?: number;

  initialHp?: number;
  finalHp?: number;
  hpLost?: number;

  damageDealt?: number;
  damageTaken?: number;
  healingReceived?: number;
  healingFromPotions?: number;
  healingFromLevelUp?: number;
  totalHealingReceived?: number;
  hpChange?: number;
  hpLostNet?: number;
  hpRecoveredNet?: number;

  tookDamage?: boolean;
  wasHealed?: boolean;

  hp?: {
    initial?: number;
    final?: number;
    maxInitial?: number;
    maxFinal?: number;
    maxHpGained?: number;
    change?: number;
    lostNet?: number;
    recoveredNet?: number;
    damageTaken?: number;
    healingReceived?: number;
    healingFromPotions?: number;
    healingFromLevelUp?: number;
    totalHealingReceived?: number;
    tookDamage?: boolean;
    wasHealed?: boolean;
    leveledUp?: boolean;
  };

  criticalHitsDealt?: number;
  criticalHitsTaken?: number;
  criticalBonusDamageDealt?: number;
  criticalBonusDamageTaken?: number;
  playerAttackAttempts?: number;
  mobAttackAttempts?: number;
  criticalRateDealt?: number;
  criticalRateTaken?: number;
  criticalDamageSharePercent?: number;
  dealtCritical?: boolean;
  tookCritical?: boolean;

  critical?: {
    hitsDealt?: number;
    hitsTaken?: number;
    bonusDamageDealt?: number;
    bonusDamageTaken?: number;
    playerAttackAttempts?: number;
    mobAttackAttempts?: number;
    rateDealt?: number;
    rateTaken?: number;
    damageSharePercent?: number;
    dealtAny?: boolean;
    tookAny?: boolean;
  };

  dodgesByPlayer?: number;
  dodgesByMob?: number;
  playerDodgeRate?: number;
  mobDodgeRate?: number;
  playerDodged?: boolean;
  mobDodged?: boolean;

  dodge?: {
    dodgesByPlayer?: number;
    dodgesByMob?: number;
    playerAttackAttempts?: number;
    mobAttackAttempts?: number;
    playerDodgeRate?: number;
    mobDodgeRate?: number;
    playerDodgedAny?: boolean;
    mobDodgedAny?: boolean;
  };

  initialMaxHp?: number;
  finalMaxHp?: number;
  maxHpGained?: number;
  initialLevel?: number;
  finalLevel?: number;
  levelsGained?: number;
  leveledUp?: boolean;

  finalXp?: number;
  characterXp?: number;
  characterLevel?: number;

  totalXp?: number;
  currentLevelXp?: number;
  xpToNextLevel?: number;
  nextLevelXp?: number;
  xpProgressPercent?: number;

  xpIntoCurrentLevel?: number;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean;

  levelProgress?: AutoCombatLevelProgressViewModel | null;

  potionsUsed?: number;
  potionItemId?: string | null;
  potionItemName?: string | null;
  potionTriggerPercent?: number | null;

  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;

  catchUp?: boolean;
  actionsAvailable?: number;
  actionsProcessed?: number;
  processingLimited?: boolean;
  eventsEmitted?: number;
  eventsSuppressed?: number;
}

/* =========================================================
   RESUMO DA SESSÃO
   ========================================================= */

export interface AutoCombatSessionSummary {
  status?: DashboardAutoCombatSessionStatus | "DEFEATED" | string;
  statusText?: string;

  isActive?: boolean;
  stoppedManually?: boolean;
  completed?: boolean;
  defeated?: boolean;
  survived?: boolean;

  duration?: {
    plannedSeconds?: number;
    elapsedSeconds?: number;
    processedCombatSeconds?: number;
    remainingSeconds?: number;
    unusedSeconds?: number;
    startedAt?: string;
    endsAt?: string;
    finishedAt?: string | null;
  };

  combat?: {
    totalCombats?: number;
    totalRounds?: number;
    averageRoundsPerCombat?: number;
  };

  progression?: {
    totalXpGained?: number;
    baseXpGained?: number;
    premiumBonusXp?: number;
    premiumPotentialBonusXp?: number;
    premiumTotalXp?: number;
    isPremiumActive?: boolean;
    xpPerMinute?: number;
  };

  hp?: {
    current?: number;
    max?: number;
    percent?: number;
  };

  potions?: {
    used?: number;
  };

  loot?: {
    totalQuantity?: number;
    uniqueItems?: number;
    items?: AutoCombatRewardLootViewModel[];
  };

  mobs?: {
    totalKills?: number;
    totalFound?: number;
    uniqueMobs?: number;
    uniqueFoundMobs?: number;
    kills?: AutoCombatRewardMobViewModel[];
    found?: AutoCombatFoundMobViewModel[];
  };
}

/* =========================================================
   PREVIEW / PROJEÇÃO DA CAÇA
   ========================================================= */

export interface AutoCombatProjectionPreview {
  averageCombatDurationSeconds?: number;
  averageRoundsPerCombat?: number;
  xpPerMinute?: number;

  risk?: {
    level?: AutoCombatRiskLevel | string;
    score?: number;
    defeatChancePercent?: number;
    expectedHpPercentAtEnd?: number;
    damageTakenPerMinute?: number;
  };

  critical?: {
    playerCriticalChancePercent?: number;
    mobCriticalChancePercent?: number;
    criticalDamageSharePercent?: number;
  };

  dodge?: {
    playerDodgeChancePercent?: number;
    mobDodgeChancePercent?: number;
  };

  hp?: {
    current?: number;
    max?: number;
    expectedFinal?: number;
    expectedChange?: number;
    expectedFinalPercent?: number;
  };

  sample?: {
    iterations?: number;
    projectionSeconds?: number;
    totalCombatsSimulated?: number;
    fullRemainingSessionProjected?: boolean;
  };
}

export interface PreviewAutoCombatResponse {
  message?: string;
  character?: AutoCombatStatusCharacterViewModel;
  subMap?: AutoCombatSubMapViewModel;
  combatPreview?: AutoCombatProjectionPreview | null;
}

/* =========================================================
   STATUS / START / STOP
   ========================================================= */

export interface AutoCombatStatusResponse {
  active?: boolean;
  hasActiveAutoCombat?: boolean;
  currentMapId?: string | null;
  currentSubMapId?: string | null;
  canTravel?: boolean | null;

  message?: string;
  serverNow?: string | Date | null;
  snapshotSequence?: number | null;
  latestEventSequence?: number | null;
  phase?: AutoCombatRealtimePhase | null;
  nextActor?: AutoCombatRealtimeActor | null;
  lastActionAt?: string | null;
  nextActionAt?: string | null;
  roundDurationSeconds?: number | null;
  endReason?: string | null;
  shouldRedirectToInfirmary?: boolean | null;
  hasPreservedTrackedEnemies?: boolean | null;
  preservedTrackedEnemiesCount?: number | null;
  autoCombatRecovery?: AutoCombatRecoveryViewModel | null;

  character?: AutoCombatStatusCharacterViewModel;

  session?: AutoCombatSessionApiViewModel | null;
  activeSession?: AutoCombatSessionApiViewModel | null;
  autoCombatSession?: AutoCombatSessionApiViewModel | null;
  lastSession?: AutoCombatSessionApiViewModel | null;

  currentMob?: AutoCombatCurrentMobViewModel | null;
  battleProgress?: AutoCombatBattleProgressViewModel | null;
  battleSelection?: AutoCombatBattleSelectionViewModel | null;
  selectedEncounter?: AutoCombatEncounterViewModel | null;
  trackedMonsters?: AutoCombatTrackedMonsterViewModel[];
  huntBatch?: AutoCombatHuntBatchViewModel | null;
  huntingSkill?: AutoCombatHuntingSkillViewModel | null;
  hunting?: AutoCombatHuntingViewModel | null;
  huntCapacity?: {
    maxTrackedEnemies?: number | null;
    remainingCapacity?: number | null;
    availableEnemiesCount?: number | null;
    remainingEnemiesCount?: number | null;
    isLimitReached?: boolean | null;
  } | null;

  subMap?: AutoCombatSubMapViewModel | null;
  map?: AutoCombatMapSummaryViewModel | null;

  rewards?: AutoCombatRewardsViewModel;
  sessionSummary?: AutoCombatSessionSummary;
  processing?: AutoCombatProcessingSummary;

  availableSubMaps?: AutoCombatSubMapViewModel[];
}

export type StartAutoCombatResponse = AutoCombatStatusResponse;

export type StartAutoCombatBattlePayload = {
  mobId?: string;
  encounterId?: string;
  quantity?: number;
};

export type StopAutoCombatResponse = AutoCombatStatusResponse;
