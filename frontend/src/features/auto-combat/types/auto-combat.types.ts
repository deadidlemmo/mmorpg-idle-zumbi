import type {
  DashboardAutoCombatSessionStatus,
  DashboardEquipmentItem,
  DashboardItemRarity,
  DashboardSubMapViewModel,
} from '../../dashboard/types/dashboard.types';

export interface StartAutoCombatPayload {
  characterId: string;
  subMapId: string;
}

export interface PreviewAutoCombatPayload {
  characterId: string;
  subMapId: string;
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
  | 'MOB_SPAWNED'
  | 'PLAYER_HIT'
  | 'MOB_HIT'
  | 'DODGE'
  | 'POTION_USED'
  | 'MOB_DEFEATED'
  | 'PLAYER_DEFEATED'
  | 'SESSION_STARTED'
  | 'SESSION_UPDATED'
  | 'SESSION_FINISHED'
  | 'SESSION_STOPPED'
  | 'SESSION_ERROR'
  | string;

export type AutoCombatRealtimeActor = 'PLAYER' | 'MOB' | 'SYSTEM' | string;

export type AutoCombatRealtimeTarget = 'PLAYER' | 'MOB' | 'SYSTEM' | string;

export interface AutoCombatRealtimeEvent {
  characterId?: string | null;
  sessionId?: string | null;

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

  /**
   * EXP / level em tempo real.
   */
  xpGained?: number | null;
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

  iconUrl?: string | null;
  imageUrl?: string | null;
  assetKey?: string | null;
}

export interface AutoCombatCurrentMobViewModel {
  id?: string | null;
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

export interface AutoCombatSessionApiViewModel {
  id: string;
  characterId?: string | null;
  subMapId?: string | null;

  status:
    | DashboardAutoCombatSessionStatus
    | 'ACTIVE'
    | 'STOPPED'
    | 'FINISHED'
    | 'DEFEATED'
    | 'FAILED'
    | 'CANCELLED'
    | string;

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
}

export interface AutoCombatRewardsViewModel {
  loots: AutoCombatRewardLootViewModel[];
  mobs: AutoCombatRewardMobViewModel[];
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
}

/* =========================================================
   RESUMO DA SESSÃO
   ========================================================= */

export interface AutoCombatSessionSummary {
  status?: DashboardAutoCombatSessionStatus | 'DEFEATED' | string;
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
    uniqueMobs?: number;
    kills?: AutoCombatRewardMobViewModel[];
  };
}

/* =========================================================
   PREVIEW / PROJEÇÃO DA CAÇA
   ========================================================= */

export type AutoCombatRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';

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

  message?: string;

  character?: AutoCombatStatusCharacterViewModel;

  session?: AutoCombatSessionApiViewModel | null;
  activeSession?: AutoCombatSessionApiViewModel | null;
  autoCombatSession?: AutoCombatSessionApiViewModel | null;
  lastSession?: AutoCombatSessionApiViewModel | null;

  currentMob?: AutoCombatCurrentMobViewModel | null;

  subMap?: AutoCombatSubMapViewModel | null;

  rewards?: AutoCombatRewardsViewModel;
  sessionSummary?: AutoCombatSessionSummary;
  processing?: AutoCombatProcessingSummary;

  availableSubMaps?: AutoCombatSubMapViewModel[];
}

export type StartAutoCombatResponse = AutoCombatStatusResponse;

export type StopAutoCombatResponse = AutoCombatStatusResponse;