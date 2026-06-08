import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  AutoCombatHuntBatchStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  InventoryItemType,
  ItemSlot,
  Prisma,
} from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import {
  AUTO_COMBAT_HUNTING_BASE_MAX_TRACKED_ENEMIES,
  AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY,
  AUTO_COMBAT_HUNTING_LEVEL_CAP,
  AUTO_COMBAT_HUNTING_MAX_EVENTS_PER_PROCESS,
  AUTO_COMBAT_HUNTING_MAX_TRACKED_LINEAR_GAIN,
  AUTO_COMBAT_HUNTING_MAX_TRACKED_POWER_EXPONENT,
  AUTO_COMBAT_HUNTING_MAX_TRACKED_POWER_SCALE,
  AUTO_COMBAT_HUNTING_XP_BASE_TO_NEXT_LEVEL,
  AUTO_COMBAT_HUNTING_XP_LINEAR_SCALE,
  AUTO_COMBAT_HUNTING_XP_PER_ENEMY,
  AUTO_COMBAT_HUNTING_XP_POWER_EXPONENT,
  AUTO_COMBAT_HUNTING_XP_POWER_SCALE,
  AUTO_COMBAT_MAX_COMBATS_PER_PROCESS,
  AUTO_COMBAT_TTK_PROGRESS_UPDATES_PER_SECOND,
} from '../../common/config/auto-combat.config';
import { getIdleProgressLimitSeconds } from '../../common/config/membership.config';
import { calculateCombatHit } from '../../common/utils/combat-damage.util';
import {
  projectAutoCombatSurvival,
  type AutoCombatSurvivalProjection,
} from '../../common/utils/auto-combat-survival.util';
import {
  applyDropChancePenalty,
  applyXpPenalty,
  calculateTierFarmPenalty,
  getDropMultiplierByItemSlot,
} from '../../common/utils/farm-penalty.util';
import {
  calculateLevelProgress,
  getLevelProgress,
} from '../../common/utils/level.util';
import {
  calculatePremiumXpBreakdown,
  isPremiumActive,
} from '../../common/utils/membership.util';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
  type PrimaryStats,
} from '../../common/utils/stats.util';
import { calculateAutoCombatTtk } from '../../common/utils/auto-combat-ttk.util';
import { getAutoCombatHuntingSecondsPerEnemy } from '../../common/utils/auto-combat-hunting.util';
import {
  applyAutoCombatIncomingDamageMultiplier,
  applyAutoCombatPotionHealMultiplier,
  applyAutoCombatXpEfficiency,
  scaleAutoCombatGatheringBonus,
} from '../../common/utils/auto-combat-balance.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AutoCombatGateway } from './auto-combat.gateway';
import {
  assertAutoCombatPhaseTransition,
  buildHuntCycleKey,
} from './auto-combat-state-machine';
import { StartAutoCombatBattleDto } from './dto/start-auto-combat-battle.dto';
import { PreviewAutoCombatDto } from './dto/preview-auto-combat.dto';
import { StartAutoCombatDto } from './dto/start-auto-combat.dto';

const AUTO_COMBAT_PREVIEW_MIN_ITERATIONS = 6;
const AUTO_COMBAT_PREVIEW_MAX_ITERATIONS = 14;
const AUTO_COMBAT_PREVIEW_MAX_COMBATS_PER_ITERATION = 5000;

const AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS = 1;

const AUTO_COMBAT_REALTIME_TICK_MS = Math.max(
  250,
  Math.floor(1000 / AUTO_COMBAT_TTK_PROGRESS_UPDATES_PER_SECOND),
);
const AUTO_COMBAT_STORED_EVENTS_LIMIT = 50;
const AUTO_COMBAT_RECENT_EVENTS_LIMIT = 20;
const AUTO_COMBAT_MAX_REALTIME_EVENTS_TO_EMIT = 20;
const AUTO_COMBAT_STATUS_LOCK_WAIT_MS = 3000;
const AUTO_COMBAT_STATUS_LOCK_POLL_MS = 50;

const AUTO_COMBAT_CONCURRENT_PROCESSING_MESSAGE =
  'Processamento abortado: outra execução já avançou esta sessão.';

class AutoCombatSessionConcurrencyError extends Error {
  constructor() {
    super(AUTO_COMBAT_CONCURRENT_PROCESSING_MESSAGE);
    this.name = 'AutoCombatSessionConcurrencyError';
  }
}

type CombatWinner = 'PLAYER' | 'MOB';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';

type RealtimeActor = 'PLAYER' | 'MOB' | 'SYSTEM';
type RealtimeTarget = 'PLAYER' | 'MOB' | 'SYSTEM';
type AutoCombatRealtimePhase =
  | 'HUNTING'
  | 'ENCOUNTER_READY'
  | 'SPAWNING'
  | 'PLAYER_TURN'
  | 'MOB_TURN'
  | 'MOB_DEFEATED'
  | 'PLAYER_DEFEATED'
  | 'FINISHED'
  | 'WAITING_NEXT_ROUND'
  | 'IDLE';

type FighterStats = {
  name: string;
  className?: string | null;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  precision: number;
  technique: number;
  agility: number;
};

type XpProgressSnapshot = {
  totalXp: number;

  currentLevelXp: number;
  xpToNextLevel: number;
  nextLevelXp: number;
  xpProgressPercent: number;

  xpIntoCurrentLevel: number;
  xpNeededForNextLevel: number | null;
  currentLevelStartXp: number;
  nextLevelRequiredXp: number | null;
  isAtLevelCap: boolean;

  levelProgress: {
    oldLevel: number;
    newLevel: number;

    currentXp: number;
    gainedXp: number;
    totalXp: number;

    currentLevelXp: number;
    xpToNextLevel: number;
    nextLevelXp: number;
    xpProgressPercent: number;

    leveledUp: boolean;
    levelsGained: number;

    levelCap: number;
    isAtLevelCap: boolean;

    currentLevelStartXp: number;
    nextLevelRequiredXp: number | null;

    xpIntoCurrentLevel: number;
    xpNeededForNextLevel: number | null;

    progressPercent: number;
  };
};

type AutoCombatRealtimeEventType =
  | 'HUNT_TARGET_FOUND'
  | 'MOB_SPAWNED'
  | 'PLAYER_HIT'
  | 'MOB_HIT'
  | 'DODGE'
  | 'POTION_USED'
  | 'MOB_DEFEATED'
  | 'PLAYER_DEFEATED';

type AutoCombatRealtimeEvent = {
  characterId?: string;
  sessionId?: string;
  sequence?: number;
  eventKey?: string | null;
  enemyInstanceId?: string | null;
  turnId?: string | null;
  actionId?: string | null;
  actionOrder?: number | null;
  phase?: AutoCombatRealtimePhase;
  sessionStatus?: AutoCombatSessionStatus | string | null;
  endReason?: string | null;
  shouldRedirectToInfirmary?: boolean;
  nextActor?: RealtimeActor | null;
  serverTime?: string;
  actionStartedAt?: string | null;
  nextActionAt?: string | null;
  type?: AutoCombatRealtimeEventType;
  message?: string;

  mobId?: string;
  mobName?: string;
  mobCurrentHp?: number;
  mobMaxHp?: number;
  mobHpPercent?: number;
  battleProgressSeconds?: number;
  battleProgressPercent?: number;
  cycleStartedAt?: string | null;
  cycleDurationMs?: number;
  cycleDurationSeconds?: number;
  progressUpdatedAt?: string | null;
  estimatedKillTimeSeconds?: number;
  baseKillTimeSeconds?: number;
  playerOffensivePower?: number;
  monsterRecommendedPower?: number;
  killsPerMinute?: number;
  killsPerHour?: number;
  difficultyLabel?: string;
  mobIndex?: number;
  battleTargetMobId?: string | null;
  battleTargetEncounterId?: string | null;
  battleTargetTotal?: number | null;
  battleTargetRemaining?: number | null;

  characterCurrentHp?: number;
  characterMaxHp?: number;
  characterHpPercent?: number;

  damage?: number;
  healedAmount?: number;
  isCritical?: boolean;
  isDodged?: boolean;
  hpBefore?: number | null;
  hpAfter?: number | null;
  targetHpBefore?: number | null;
  targetHpAfter?: number | null;
  mobHpBefore?: number | null;
  mobHpAfter?: number | null;
  characterHpBefore?: number | null;
  characterHpAfter?: number | null;

  xpGained?: number;
  baseXpGained?: number;
  premiumBonusXp?: number;
  premiumPotentialBonusXp?: number;
  premiumTotalXp?: number;
  isPremiumActive?: boolean;
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
  levelProgress?: XpProgressSnapshot['levelProgress'];

  leveledUp?: boolean;
  levelsGained?: number;

  totalCombats?: number;
  totalRounds?: number;
  totalKills?: number;
  totalXpGained?: number;
  totalLoot?: number;
  potionsUsed?: number;

  potionItemId?: string | null;
  potionItemName?: string | null;
  potionTriggerPercent?: number | null;

  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;

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

  round?: number;
  combatIndex?: number;
  actor?: RealtimeActor;
  target?: RealtimeTarget;

  createdAt?: string;
};

type CombatRealtimeContext = {
  characterId: string;
  sessionId: string;
  mobId: string;
  mobName: string;
  combatIndex: number;
  enemyInstanceId?: string | null;
};

type AttackResolution = {
  nextTargetHp: number;
  damage: number;
  isCritical: boolean;
  isDodged: boolean;
  criticalBonusDamage: number;
};

type CombatSimulationResult = {
  winner: CombatWinner;
  rounds: number;
  playerStartHp: number;
  playerEndHp: number;
  mobEndHp: number;

  damageDealtByPlayer: number;
  damageTakenByPlayer: number;
  healingReceivedByPlayer: number;

  playerAttackAttempts: number;
  mobAttackAttempts: number;

  criticalHitsByPlayer: number;
  criticalHitsByMob: number;
  criticalBonusDamageByPlayer: number;
  criticalBonusDamageByMob: number;

  dodgesByPlayer: number;
  dodgesByMob: number;
};

type AutoPotionState = {
  enabled: boolean;
  potionItemId: string;
  potionItemName: string;
  hpThresholdPercent: number;
  healFlat: number;
  healPercent: number;
  availableQuantity: number;
  usedQuantity: number;
  totalHealed: number;
};

type AutoPotionUseResult = {
  used: boolean;
  newHp: number;
  healedAmount: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
  usedQuantity: number | null;
};

type LootAccumulator = Map<
  string,
  {
    itemId: string;
    quantity: number;
  }
>;

type MobSummaryAccumulator = Map<
  string,
  {
    mobId: string;
    kills: number;
    xpGained: number;
  }
>;

type HpProcessingDetails = {
  initial: number;
  final: number;
  maxInitial: number;
  maxFinal: number;
  maxHpGained: number;
  change: number;
  lostNet: number;
  recoveredNet: number;
  damageTaken: number;
  healingReceived: number;
  healingFromPotions: number;
  healingFromLevelUp: number;
  healingFromRest: number;
  totalHealingReceived: number;
  tookDamage: boolean;
  wasHealed: boolean;
  leveledUp: boolean;
};

type CriticalProcessingDetails = {
  hitsDealt: number;
  hitsTaken: number;
  bonusDamageDealt: number;
  bonusDamageTaken: number;
  playerAttackAttempts: number;
  mobAttackAttempts: number;
  rateDealt: number;
  rateTaken: number;
  damageSharePercent: number;
  dealtAny: boolean;
  tookAny: boolean;
};

type DodgeProcessingDetails = {
  dodgesByPlayer: number;
  dodgesByMob: number;
  playerAttackAttempts: number;
  mobAttackAttempts: number;
  playerDodgeRate: number;
  mobDodgeRate: number;
  playerDodgedAny: boolean;
  mobDodgedAny: boolean;
};

type AutoCombatPreview = {
  averageCombatDurationSeconds: number;
  averageRoundsPerCombat: number;
  xpPerMinute: number;

  risk: {
    level: RiskLevel;
    score: number;
    defeatChancePercent: number;
    expectedHpPercentAtEnd: number;
    damageTakenPerMinute: number;
  };

  critical: {
    playerCriticalChancePercent: number;
    mobCriticalChancePercent: number;
    criticalDamageSharePercent: number;
  };

  dodge: {
    playerDodgeChancePercent: number;
    mobDodgeChancePercent: number;
  };

  hp: {
    current: number;
    max: number;
    expectedFinal: number;
    expectedChange: number;
    expectedFinalPercent: number;
  };

  sample: {
    iterations: number;
    projectionSeconds: number;
    totalCombatsSimulated: number;
    fullRemainingSessionProjected: boolean;
  };
};

type AutoCombatMobSurvivalProjection = AutoCombatSurvivalProjection & {
  estimatedKillTimeSeconds: number;
  killsPerMinute: number;
  difficultyLabel: string;
  potionItemId: string | null;
  potionItemName: string | null;
};

type SessionXpBreakdown = {
  totalXpGained: number;
  baseXpGained: number;
  premiumBonusXp: number;
  premiumPotentialBonusXp: number;
  premiumTotalXp: number;
  isPremiumActive: boolean;
};

type SessionSummary = {
  status: AutoCombatSessionStatus;
  statusText: string;

  isActive: boolean;
  stoppedManually: boolean;
  completed: boolean;
  defeated: boolean;
  survived: boolean;

  duration: {
    plannedSeconds: number;
    elapsedSeconds: number;
    processedCombatSeconds: number;
    remainingSeconds: number;
    unusedSeconds: number;
    startedAt: Date;
    endsAt: Date;
    finishedAt: Date | null;
  };

  combat: {
    totalCombats: number;
    totalRounds: number;
    averageRoundsPerCombat: number;
  };

  progression: {
    totalXpGained: number;
    baseXpGained: number;
    premiumBonusXp: number;
    premiumPotentialBonusXp: number;
    premiumTotalXp: number;
    isPremiumActive: boolean;
    xpPerMinute: number;
  };

  hp: {
    current: number;
    max: number;
    percent: number;
  };

  potions: {
    used: number;
  };

  loot: {
    totalQuantity: number;
    uniqueItems: number;
    items: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      rarity: string;
      slot: string;
      tier: number;
    }>;
  };

  mobs: {
    totalKills: number;
    totalFound: number;
    uniqueMobs: number;
    uniqueFoundMobs: number;
    kills: Array<{
      mobId: string;
      mobName: string;
      mobLevel: number;
      mobTier: number;
      kills: number;
      xpGained: number;
      foundCount: number;
    }>;
    found: Array<{
      mobId: string;
      mobName: string;
      mobLevel: number;
      mobTier: number;
      foundCount: number;
      remainingCount?: number;
    }>;
  };
};

type ProcessingSummary = {
  processedNow: boolean;
  processedSeconds: number;
  combatsResolved: number;
  roundsResolved: number;
  xpGained: number;

  initialHp?: number;
  finalHp?: number;
  hpLost?: number;

  damageDealt?: number;
  damageTaken?: number;
  healingReceived?: number;
  healingFromPotions?: number;
  healingFromLevelUp?: number;
  healingFromRest?: number;
  totalHealingReceived?: number;
  hpChange?: number;
  hpLostNet?: number;
  hpRecoveredNet?: number;
  tookDamage?: boolean;
  wasHealed?: boolean;
  hp?: HpProcessingDetails;

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
  critical?: CriticalProcessingDetails;

  dodgesByPlayer?: number;
  dodgesByMob?: number;
  playerDodgeRate?: number;
  mobDodgeRate?: number;
  playerDodged?: boolean;
  mobDodged?: boolean;
  dodge?: DodgeProcessingDetails;

  initialMaxHp?: number;
  finalMaxHp?: number;
  maxHpGained?: number;
  initialLevel?: number;
  finalLevel?: number;
  levelsGained?: number;
  leveledUp?: boolean;

  finalXp?: number;
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
  levelProgress?: XpProgressSnapshot['levelProgress'];

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
};

type RealtimeRoundResult = {
  processedSeconds: number;
  combatsResolved: number;
  roundsResolved: number;
  xpGained: number;

  initialHp: number;
  finalCurrentHp: number;
  initialMaxHp: number;
  finalMaxHp: number;
  maxHpGained: number;
  hpLost: number;

  damageDealt: number;
  damageTaken: number;
  healingReceived: number;
  healingFromPotions: number;
  healingFromLevelUp: number;
  healingFromRest: number;
  totalHealingReceived: number;
  hpChange: number;
  hpLostNet: number;
  hpRecoveredNet: number;
  tookDamage: boolean;
  wasHealed: boolean;

  criticalHitsDealt: number;
  criticalHitsTaken: number;
  criticalBonusDamageDealt: number;
  criticalBonusDamageTaken: number;
  playerAttackAttempts: number;
  mobAttackAttempts: number;
  criticalRateDealt: number;
  criticalRateTaken: number;
  criticalDamageSharePercent: number;
  dealtCritical: boolean;
  tookCritical: boolean;

  dodgesByPlayer: number;
  dodgesByMob: number;
  playerDodgeRate: number;
  mobDodgeRate: number;
  playerDodged: boolean;
  mobDodged: boolean;

  initialLevel: number;
  finalLevel: number;
  levelsGained: number;
  leveledUp: boolean;

  potionsUsed: number;
  potionItemId: string | null;
  potionItemName: string | null;
  potionTriggerPercent: number | null;
  potionQuantityBefore: number | null;
  potionQuantityAfter: number | null;
  potionQuantityRemaining: number | null;
  potionUsedQuantity: number | null;

  finalXp: number;
  finalStatus: AutoCombatSessionStatus;
  phase?: AutoCombatSessionPhase;
  newLastProcessedAt: Date;
  finishedAt: Date | null;

  currentMobId: string | null;
  currentMobHp: number | null;
  currentMobMaxHp: number | null;
  killProgressSeconds?: number;
  estimatedKillTimeSeconds?: number | null;
  baseKillTimeSeconds?: number | null;
  playerOffensivePower?: number | null;
  monsterRecommendedPower?: number | null;
  currentMobIndex?: number | null;
  currentRound: number;
  currentCombatIndex: number;
  battleTargetRemaining?: number | null;

  loots: LootAccumulator;
  mobSummaries: MobSummaryAccumulator;

  events: AutoCombatRealtimeEvent[];

  catchUp?: boolean;
  actionsAvailable?: number;
  actionsProcessed?: number;
  processingLimited?: boolean;
  eventsEmitted?: number;
  eventsSuppressed?: number;
};

@Injectable()
export class AutoCombatService implements OnModuleDestroy {
  private readonly realtimeIntervals = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  private readonly immediateProcessingTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private readonly processingLocks = new Set<string>();

  private readonly potionUsageByCombat = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
    private readonly autoCombatGateway: AutoCombatGateway,
  ) {}

  onModuleDestroy() {
    for (const interval of this.realtimeIntervals.values()) {
      clearInterval(interval);
    }

    for (const timeout of this.immediateProcessingTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.realtimeIntervals.clear();
    this.immediateProcessingTimeouts.clear();
    this.processingLocks.clear();
    this.potionUsageByCombat.clear();
  }

  private async waitForProcessingLockRelease(characterId: string) {
    const startedAt = Date.now();

    while (
      this.processingLocks.has(characterId) &&
      Date.now() - startedAt < AUTO_COMBAT_STATUS_LOCK_WAIT_MS
    ) {
      await new Promise((resolve) => {
        setTimeout(resolve, AUTO_COMBAT_STATUS_LOCK_POLL_MS);
      });
    }
  }

  private aggregateMapEncounters(subMaps: any[]) {
    const encountersByMobId = new Map<string, any>();

    for (const subMap of subMaps ?? []) {
      for (const encounter of subMap?.encounters ?? []) {
        if (!encounter?.mobId || encounter.isActive === false) {
          continue;
        }

        const current = encountersByMobId.get(encounter.mobId);

        if (!current) {
          encountersByMobId.set(encounter.mobId, {
            ...encounter,
            weight: Math.max(0, Number(encounter.weight ?? 0)),
          });
          continue;
        }

        encountersByMobId.set(encounter.mobId, {
          ...current,
          weight:
            Math.max(0, Number(current.weight ?? 0)) +
            Math.max(0, Number(encounter.weight ?? 0)),
        });
      }
    }

    return Array.from(encountersByMobId.values());
  }

  private getSessionHuntEncounters(session: any) {
    const mapSubMaps = session?.map?.subMaps ?? session?.subMap?.map?.subMaps;

    if (Array.isArray(mapSubMaps) && mapSubMaps.length > 0) {
      return this.aggregateMapEncounters(mapSubMaps);
    }

    return this.aggregateMapEncounters([session?.subMap]);
  }

  private async resolveAutoCombatHuntTarget(
    target: {
      mapId?: string | null;
      subMapId?: string | null;
    },
    characterLevel: number,
  ) {
    if (!target.mapId && !target.subMapId) {
      throw new BadRequestException('Informe um mapa para iniciar a caÃ§a.');
    }

    const encountersInclude = {
      where: {
        isActive: true,
      },
      include: {
        mob: {
          include: {
            drops: {
              include: {
                item: true,
              },
            },
          },
        },
      },
    } satisfies Prisma.SubMapEncounterFindManyArgs;

    const map = target.mapId
      ? await this.prisma.gameMap.findUnique({
          where: {
            id: target.mapId,
          },
          include: {
            subMaps: {
              orderBy: [
                {
                  minLevel: 'asc',
                },
                {
                  name: 'asc',
                },
              ],
              include: {
                encounters: encountersInclude,
              },
            },
          },
        })
      : null;

    const selectedSubMap = target.subMapId
      ? await this.prisma.subMap.findUnique({
          where: {
            id: target.subMapId,
          },
          include: {
            map: {
              include: {
                subMaps: {
                  orderBy: [
                    {
                      minLevel: 'asc',
                    },
                    {
                      name: 'asc',
                    },
                  ],
                  include: {
                    encounters: encountersInclude,
                  },
                },
              },
            },
          },
        })
      : null;

    const resolvedMap = map ?? selectedSubMap?.map ?? null;

    if (!resolvedMap) {
      throw new NotFoundException('Mapa nÃ£o encontrado.');
    }

    if (characterLevel < resolvedMap.minLevel) {
      throw new BadRequestException(
        `Este mapa exige nÃ­vel mÃ­nimo ${resolvedMap.minLevel}.`,
      );
    }

    const subMaps = resolvedMap.subMaps ?? [];
    const anchorSubMap =
      selectedSubMap ??
      subMaps.find((subMap) => (subMap.encounters ?? []).length > 0) ??
      subMaps[0] ??
      null;

    if (!anchorSubMap) {
      throw new BadRequestException(
        'Este mapa ainda nÃ£o possui rotas internas configuradas.',
      );
    }

    const encounters = this.aggregateMapEncounters(subMaps);

    if (encounters.length === 0) {
      throw new BadRequestException(
        'Este mapa ainda nÃ£o possui monstros configurados.',
      );
    }

    return {
      map: resolvedMap,
      subMap: {
        ...anchorSubMap,
        map: resolvedMap,
        encounters,
      },
      encounters,
    };
  }

  async start(userId: string, startAutoCombatDto: StartAutoCombatDto) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: startAutoCombatDto.characterId,
        userId,
      },
      include: {
        class: true,
        user: {
          select: {
            premiumUntil: true,
          },
        },
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        gatheringSkills: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const huntTarget = await this.resolveAutoCombatHuntTarget(
      startAutoCombatDto,
      character.level,
    );
    const subMap = huntTarget.subMap;
    const huntEncounters = huntTarget.encounters;

    let activeSession = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId: character.id,
        status: AutoCombatSessionStatus.ACTIVE,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (
      activeSession &&
      activeSession.phase !== AutoCombatSessionPhase.ENCOUNTER_READY &&
      activeSession.endsAt.getTime() <= Date.now()
    ) {
      const expiredResponse = await this.processActiveSessionById(
        userId,
        activeSession.id,
        {
          emitRealtimeEvents: false,
          waitForActiveProcessing: true,
        },
      );

      if (!expiredResponse.active) {
        this.stopRealtimeProcessingLoop(character.id);
        activeSession = null;
      } else {
        return expiredResponse;
      }
    }

    if (activeSession) {
      if (activeSession.mapId !== huntTarget.map.id) {
        throw new ConflictException(
          'Você não pode iniciar uma caça em outro mapa enquanto já existe uma caça ou combate ativo. Encerre a atividade atual antes de viajar.',
        );
      }

      if (activeSession.phase === AutoCombatSessionPhase.ENCOUNTER_READY) {
        const loadedSession = await this.loadAutoCombatSession(
          userId,
          activeSession.id,
        );

        if (!loadedSession) {
          throw new NotFoundException('SessÃ£o de caÃ§a nÃ£o encontrada.');
        }

        const huntingSkill = await this.getOrCreateHuntingSkill(character.id);
        const totalFoundEnemiesCount = Math.max(
          0,
          Math.floor(
            Number(
              loadedSession.huntBatch?.foundEnemiesCount ??
                loadedSession.foundEnemiesCount,
            ) || 0,
          ),
        );
        const trackedEnemiesRemaining =
          this.getTrackedEnemiesRemaining(loadedSession) ??
          totalFoundEnemiesCount;
        const maxTrackedEnemies = this.getHuntingMaxTrackedEnemies(
          huntingSkill.level,
        );

        if (trackedEnemiesRemaining >= maxTrackedEnemies) {
          const limitResponse = await this.buildSessionResponse(
            activeSession.id,
            {
              message:
                'Limite de rastreio atingido neste mapa. Inicie o combate para liberar a caÃ§a.',
              processing: this.buildEmptyProcessingSummary(),
            },
          );

          this.stopRealtimeProcessingLoop(character.id);
          this.autoCombatGateway.emitStatus(character.id, limitResponse);

          return limitResponse;
        }

        const now = new Date();
        const sessionDurationSeconds = getIdleProgressLimitSeconds(
          isPremiumActive(character.user, now),
        );
        const endsAt = new Date(now.getTime() + sessionDurationSeconds * 1000);

        try {
          await this.prisma.$transaction(async (tx) => {
            await this.claimAutoCombatPhaseTransition(
              tx,
              loadedSession,
              AutoCombatSessionPhase.HUNTING,
              {
                lastProcessedAt: now,
                lastHuntProcessedAt: now,
                huntStartedAt: now,
                endsAt,
                durationSeconds: sessionDurationSeconds,
                currentMobId: null,
                currentMobHp: null,
                currentMobMaxHp: null,
                currentRound: 0,
              },
            );

            if (loadedSession.huntBatch?.id) {
              await this.claimHuntBatchStatusTransition(
                tx,
                loadedSession.huntBatch,
                AutoCombatHuntBatchStatus.HUNTING,
                {
                  startedAt: now,
                  lastProcessedAt: now,
                  stoppedAt: null,
                  cancelledAt: null,
                },
              );
            }
          });
        } catch (error) {
          if (!(error instanceof AutoCombatSessionConcurrencyError)) {
            throw error;
          }
        }

        await this.ensureResponsiveRoundDuration(activeSession.id);
        this.startRealtimeProcessingLoop(userId, character.id);
        this.scheduleImmediateSessionProcessing(
          userId,
          activeSession.id,
          character.id,
        );

        const resumedResponse = await this.buildSessionResponse(
          activeSession.id,
          {
            message: 'CaÃ§a retomada neste mapa.',
            processing: this.buildEmptyProcessingSummary(),
          },
        );

        this.autoCombatGateway.emitSessionUpdated(
          character.id,
          resumedResponse,
        );
        this.autoCombatGateway.emitStatus(character.id, resumedResponse);

        return resumedResponse;
      }

      await this.ensureResponsiveRoundDuration(activeSession.id);
      this.startRealtimeProcessingLoop(userId, character.id);

      const response = await this.buildSessionResponse(activeSession.id, {
        message:
          'Este personagem já possui uma sessão de combate automático ativa.',
        processing: this.buildEmptyProcessingSummary(),
      });

      this.autoCombatGateway.emitSessionUpdated(character.id, response);
      this.autoCombatGateway.emitStatus(character.id, response);

      return response;
    }

    await this.activityGuard.ensureCanStartAutoCombat({
      userId,
      characterId: startAutoCombatDto.characterId,
    });

    const characterStats = this.calculateCharacterFighterStats(character);

    if (characterStats.hp <= 0) {
      throw new BadRequestException(
        'Este personagem está sem HP e não pode iniciar auto-combate.',
      );
    }

    await this.prisma.subMap.findUnique({
      where: {
        id: startAutoCombatDto.subMapId ?? subMap.id,
      },
      include: {
        map: true,
        encounters: {
          where: {
            isActive: true,
          },
          include: {
            mob: {
              include: {
                drops: {
                  include: {
                    item: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!subMap) {
      throw new NotFoundException('Submapa não encontrado.');
    }

    if (huntEncounters.length === 0) {
      throw new BadRequestException(
        'Este mapa ainda não possui monstros configurados.',
      );
    }

    if (character.level < huntTarget.map.minLevel) {
      throw new BadRequestException(
        `Este mapa exige nível mínimo ${huntTarget.map.minLevel}.`,
      );
    }

    const huntingSkill = await this.getOrCreateHuntingSkill(character.id);
    const now = new Date();
    const sessionDurationSeconds = getIdleProgressLimitSeconds(
      isPremiumActive(character.user, now),
    );
    const endsAt = new Date(now.getTime() + sessionDurationSeconds * 1000);
    const resumedTrackedBatchResponse =
      await this.resumeDefeatedHuntBatchIfAvailable({
        userId,
        character,
        mapId: huntTarget.map.id,
        characterStats,
        huntingLevel: huntingSkill.level,
        now,
        endsAt,
        sessionDurationSeconds,
      });

    if (resumedTrackedBatchResponse) {
      return resumedTrackedBatchResponse;
    }

    const initialTrackedEncounter = this.rollEncounter(huntEncounters, {
      huntingLevel: huntingSkill.level,
      foundEnemiesCount: 0,
    });

    /**
     * Mantém um respiro real depois do MOB_SPAWNED inicial.
     * Antes, a sessão nascia com lastProcessedAt retroativo, então o primeiro
     * turno podia ser processado quase imediatamente após o mob aparecer.
     */
    let session;

    try {
      session = await this.prisma.$transaction(async (tx) => {
        await this.activityGuard.ensureCanStartAutoCombat({
          userId,
          characterId: character.id,
          client: tx,
          lockCharacter: true,
        });

        await tx.character.update({
          where: {
            id: character.id,
          },
          data: {
            mapId: huntTarget.map.id,
            maxHp: characterStats.maxHp,
            currentHp: characterStats.hp,
          },
        });

        const createdSession = await tx.autoCombatSession.create({
          data: {
            characterId: character.id,
            mapId: huntTarget.map.id,
            subMapId: subMap.id,
            status: AutoCombatSessionStatus.ACTIVE,
            phase: AutoCombatSessionPhase.HUNTING,
            startedAt: now,
            endsAt,
            lastProcessedAt: now,
            durationSeconds: sessionDurationSeconds,
            roundDurationSeconds: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,

            huntStartedAt: now,
            lastHuntProcessedAt: now,
            huntingLevelAtStart: huntingSkill.level,
            huntingXpGained: 0,
            foundEnemiesCount: 0,
            bonusEnemiesFound: 0,
            selectedEncounterId: initialTrackedEncounter.id,
            selectedEncounterMobId: initialTrackedEncounter.mobId,

            currentMobId: null,
            currentMobHp: null,
            currentMobMaxHp: null,
            currentRound: 0,
            currentCombatIndex: 1,
          },
        });

        await tx.autoCombatHuntBatch.create({
          data: {
            characterId: character.id,
            mapId: huntTarget.map.id,
            sessionId: createdSession.id,
            status: AutoCombatHuntBatchStatus.HUNTING,
            startedAt: now,
            lastProcessedAt: now,
            huntingLevelAtStart: huntingSkill.level,
            huntingXpGained: 0,
            foundEnemiesCount: 0,
            bonusEnemiesFound: 0,
            selectedEncounterId: initialTrackedEncounter.id,
            selectedEncounterMobId: initialTrackedEncounter.mobId,
            huntSequence: 0,
          },
        });

        return createdSession;
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const activeSessionAfterConflict =
        await this.prisma.autoCombatSession.findFirst({
          where: {
            characterId: character.id,
            status: AutoCombatSessionStatus.ACTIVE,
          },
          orderBy: {
            startedAt: 'desc',
          },
        });

      if (!activeSessionAfterConflict) {
        throw error;
      }

      if (activeSessionAfterConflict.mapId !== huntTarget.map.id) {
        throw new ConflictException(
          'Você não pode iniciar uma caça em outro mapa enquanto já existe uma caça ou combate ativo. Encerre a atividade atual antes de viajar.',
        );
      }

      await this.ensureResponsiveRoundDuration(activeSessionAfterConflict.id);
      this.startRealtimeProcessingLoop(userId, character.id);

      const conflictResponse = await this.buildSessionResponse(
        activeSessionAfterConflict.id,
        {
          message:
            'Este personagem já possui uma sessão de combate automático ativa.',
          processing: this.buildEmptyProcessingSummary(),
        },
      );

      this.autoCombatGateway.emitSessionUpdated(character.id, conflictResponse);
      this.autoCombatGateway.emitStatus(character.id, conflictResponse);

      return conflictResponse;
    }

    this.clearPotionUsageForSession(session.id);

    const response = await this.buildSessionResponse(session.id, {
      message: 'Sessão de combate automático iniciada com sucesso.',
      processing: this.buildInitialProcessingSummary({
        hp: characterStats.hp,
        maxHp: characterStats.maxHp,
        level: character.level,
        xp: character.xp,
      }),
    });

    this.autoCombatGateway.emitSessionUpdated(character.id, response);
    this.autoCombatGateway.emitStatus(character.id, response);
    this.startRealtimeProcessingLoop(userId, character.id);
    this.scheduleImmediateSessionProcessing(userId, session.id, character.id);

    return response;
  }

  private async resumeDefeatedHuntBatchIfAvailable(params: {
    userId: string;
    character: any;
    mapId: string;
    characterStats: {
      hp: number;
      maxHp: number;
    };
    huntingLevel: number;
    now: Date;
    endsAt: Date;
    sessionDurationSeconds: number;
  }) {
    const huntBatch = await this.prisma.autoCombatHuntBatch.findFirst({
      where: {
        characterId: params.character.id,
        mapId: params.mapId,
        status: AutoCombatHuntBatchStatus.READY,
        mobs: {
          some: {
            remainingCount: {
              gt: 0,
            },
          },
        },
        session: {
          is: {
            status: AutoCombatSessionStatus.DEFEATED,
          },
        },
      },
      include: {
        session: true,
        selectedEncounter: true,
        mobs: {
          include: {
            mob: true,
            encounter: true,
          },
          orderBy: {
            updatedAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!huntBatch?.session) {
      return null;
    }

    const defeatedSession = huntBatch.session;
    const pendingSelection = this.getHuntBatchPendingMobSelection(huntBatch);

    if (!pendingSelection) {
      return null;
    }

    const resumedSession = await this.prisma.$transaction(async (tx) => {
      await this.activityGuard.ensureCanStartAutoCombat({
        userId: params.userId,
        characterId: params.character.id,
        client: tx,
        lockCharacter: true,
      });

      await tx.character.update({
        where: {
          id: params.character.id,
        },
        data: {
          mapId: params.mapId,
          maxHp: params.characterStats.maxHp,
          currentHp: params.characterStats.hp,
        },
      });

      const createdSession = await tx.autoCombatSession.create({
        data: {
          characterId: params.character.id,
          mapId: params.mapId,
          subMapId: defeatedSession.subMapId,
          status: AutoCombatSessionStatus.ACTIVE,
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          startedAt: params.now,
          endsAt: params.endsAt,
          lastProcessedAt: params.now,
          durationSeconds: params.sessionDurationSeconds,
          roundDurationSeconds: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,

          huntStartedAt: huntBatch.startedAt,
          huntStoppedAt: params.now,
          lastHuntProcessedAt: params.now,
          huntingLevelAtStart:
            huntBatch.huntingLevelAtStart ?? params.huntingLevel,
          huntingXpGained: huntBatch.huntingXpGained ?? 0,
          foundEnemiesCount: huntBatch.foundEnemiesCount ?? 0,
          bonusEnemiesFound: huntBatch.bonusEnemiesFound ?? 0,
          selectedEncounterId: pendingSelection.encounterId,
          selectedEncounterMobId: pendingSelection.mobId,

          currentMobId: null,
          currentMobHp: null,
          currentMobMaxHp: null,
          currentRound: 0,
          currentCombatIndex: 1,
        },
      });

      await tx.autoCombatHuntBatch.update({
        where: {
          id: huntBatch.id,
        },
        data: {
          sessionId: createdSession.id,
          status: AutoCombatHuntBatchStatus.READY,
          consumedAt: null,
          cancelledAt: null,
          stoppedAt: params.now,
          lastProcessedAt: params.now,
          selectedEncounterId: pendingSelection.encounterId,
          selectedEncounterMobId: pendingSelection.mobId,
        },
      });

      return createdSession;
    });

    this.clearPotionUsageForSession(resumedSession.id);

    const response = await this.buildSessionResponse(resumedSession.id, {
      message:
        'AmeaÃ§as rastreadas preservadas. Inicie o combate quando estiver pronto.',
      processing: this.buildEmptyProcessingSummary(),
    });

    this.stopRealtimeProcessingLoop(params.character.id);
    this.autoCombatGateway.emitSessionUpdated(params.character.id, response);
    this.autoCombatGateway.emitStatus(params.character.id, response);

    return response;
  }

  async preview(userId: string, previewAutoCombatDto: PreviewAutoCombatDto) {
    const previewDto = previewAutoCombatDto as PreviewAutoCombatDto & {
      projectionSeconds?: number;
      iterations?: number;
    };

    const character = await this.prisma.character.findFirst({
      where: {
        id: previewDto.characterId,
        userId,
      },
      include: {
        class: true,
        user: {
          select: {
            premiumUntil: true,
          },
        },
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        potionConfig: {
          include: {
            potionItem: true,
          },
        },
        inventoryItems: {
          include: {
            item: true,
          },
        },
        gatheringSkills: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const huntTarget = await this.resolveAutoCombatHuntTarget(
      previewDto,
      character.level,
    );

    const subMap = await this.prisma.subMap.findUnique({
      where: {
        id: previewDto.subMapId ?? huntTarget.subMap.id,
      },
      include: {
        map: true,
        encounters: {
          where: {
            isActive: true,
          },
          include: {
            mob: {
              include: {
                drops: {
                  include: {
                    item: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!subMap) {
      throw new NotFoundException('Submapa não encontrado.');
    }

    if (huntTarget.encounters.length === 0) {
      throw new BadRequestException(
        'Este mapa ainda não possui monstros configurados.',
      );
    }

    if (character.level < huntTarget.map.minLevel) {
      throw new BadRequestException(
        `Este mapa exige nível mínimo ${huntTarget.map.minLevel}.`,
      );
    }

    const characterStats = this.calculateCharacterFighterStats(character);

    if (characterStats.hp <= 0) {
      throw new BadRequestException(
        'Este personagem está sem HP e não pode gerar preview de auto-combate.',
      );
    }

    const maxProjectionSeconds = getIdleProgressLimitSeconds(
      isPremiumActive(character.user),
    );
    const projectionSeconds = this.clampNumber(
      Math.floor(previewDto.projectionSeconds ?? maxProjectionSeconds),
      AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
      maxProjectionSeconds,
    );

    const now = new Date();

    const previewSession = {
      character,
      subMap: {
        ...subMap,
        map: huntTarget.map,
        encounters: huntTarget.encounters,
      },
      roundDurationSeconds: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
      endsAt: new Date(now.getTime() + projectionSeconds * 1000),
    };

    const combatPreview = this.buildAutoCombatPreview(previewSession, {
      projectionSeconds,
      iterations: previewDto.iterations,
    });

    if (!combatPreview) {
      throw new BadRequestException(
        'Não foi possível gerar o preview de auto-combate.',
      );
    }

    return {
      message: 'Preview de auto-combate gerado com sucesso.',

      character: {
        id: character.id,
        name: character.name,
        class: character.class.name,
        level: character.level,
        xp: character.xp,
        currentHp: characterStats.hp,
        maxHp: characterStats.maxHp,
        ...this.buildCharacterXpPayload(character.level, character.xp),
      },

      subMap: {
        id: subMap.id,
        name: subMap.name,
        tier: subMap.tier,
        minLevel: subMap.minLevel,
        maxLevel: subMap.maxLevel,
        map: {
          id: subMap.map.id,
          name: subMap.map.name,
          tier: subMap.map.tier,
        },
      },

      combatPreview,
    };
  }

  async getStatus(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const activeSession = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId: character.id,
        status: AutoCombatSessionStatus.ACTIVE,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (activeSession) {
      await this.ensureResponsiveRoundDuration(activeSession.id);
      const response = await this.processActiveSessionById(
        userId,
        activeSession.id,
        {
          emitRealtimeEvents: false,
          waitForActiveProcessing: true,
        },
      );

      if (response.active) {
        this.startRealtimeProcessingLoop(userId, character.id);
      }

      return response;
    }

    this.stopRealtimeProcessingLoop(character.id);

    const latestSession = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId: character.id,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (latestSession) {
      const response = await this.buildSessionResponse(latestSession.id, {
        message: 'Nenhuma sessão ativa. Última sessão encontrada.',
        processing: this.buildEmptyProcessingSummary(),
      });

      this.autoCombatGateway.emitStatus(character.id, response);

      return response;
    }

    const response = {
      active: false,
      hasActiveAutoCombat: false,
      message: 'Nenhuma sessão de combate automático encontrada.',
      serverNow: new Date().toISOString(),
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        xp: character.xp,
        currentHp: character.currentHp,
        maxHp: character.maxHp,
        ...this.buildCharacterXpPayload(character.level, character.xp),
      },
    };

    this.autoCombatGateway.emitStatus(character.id, response);

    return response;
  }

  async stopHunt(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const activeSession = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId: character.id,
        status: AutoCombatSessionStatus.ACTIVE,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!activeSession) {
      this.stopRealtimeProcessingLoop(character.id);

      return {
        active: false,
        hasActiveAutoCombat: false,
        message: 'Nenhuma caça ativa para parar.',
      };
    }

    const processedResponse = await this.processActiveSessionById(
      userId,
      activeSession.id,
      {
        emitRealtimeEvents: false,
        waitForActiveProcessing: true,
      },
    );

    if (!processedResponse.active) {
      return processedResponse;
    }

    const session = await this.loadAutoCombatSession(userId, activeSession.id);

    if (!session) {
      throw new NotFoundException('Sessão de caça não encontrada.');
    }

    if (session.phase === AutoCombatSessionPhase.COMBAT_ACTIVE) {
      return this.buildSessionResponse(session.id, {
        message: 'Esta sessão já está em combate.',
        processing: this.buildEmptyProcessingSummary(),
      });
    }

    if (session.phase === AutoCombatSessionPhase.ENCOUNTER_READY) {
      return this.buildSessionResponse(session.id, {
        message: 'Caça já está pronta para combate.',
        processing: this.buildEmptyProcessingSummary(),
      });
    }

    const huntingSkill = await this.getOrCreateHuntingSkill(character.id);
    const huntBatch = session.huntBatch ?? null;
    const encounter =
      huntBatch?.selectedEncounter?.isActive && huntBatch.selectedEncounter?.mob
        ? huntBatch.selectedEncounter
        : session.selectedEncounter?.isActive && session.selectedEncounter?.mob
          ? session.selectedEncounter
          : this.rollEncounter(this.getSessionHuntEncounters(session), {
              huntingLevel: huntingSkill.level,
              foundEnemiesCount:
                huntBatch?.foundEnemiesCount ?? session.foundEnemiesCount,
            });
    const now = new Date();
    let stoppedSession: { id: string };

    try {
      stoppedSession = await this.prisma.$transaction(async (tx) => {
        await this.claimAutoCombatPhaseTransition(
          tx,
          session,
          AutoCombatSessionPhase.ENCOUNTER_READY,
          {
            huntStoppedAt: now,
            lastHuntProcessedAt: now,
            lastProcessedAt: now,
            foundEnemiesCount: Math.max(
              1,
              huntBatch?.foundEnemiesCount ?? session.foundEnemiesCount ?? 0,
            ),
            selectedEncounterId: encounter.id,
            selectedEncounterMobId: encounter.mobId,
            currentMobId: null,
            currentMobHp: null,
            currentMobMaxHp: null,
            currentRound: 0,
          },
        );

        if (huntBatch?.id) {
          await this.claimHuntBatchStatusTransition(
            tx,
            huntBatch,
            AutoCombatHuntBatchStatus.READY,
            {
              stoppedAt: now,
              lastProcessedAt: now,
              foundEnemiesCount: Math.max(
                1,
                huntBatch.foundEnemiesCount ?? session.foundEnemiesCount ?? 0,
              ),
              selectedEncounterId: encounter.id,
              selectedEncounterMobId: encounter.mobId,
              huntSequence: Math.max(
                1,
                huntBatch.huntSequence ??
                  huntBatch.foundEnemiesCount ??
                  session.foundEnemiesCount ??
                  0,
              ),
            },
          );
        }

        return tx.autoCombatSession.findUniqueOrThrow({
          where: {
            id: session.id,
          },
        });
      });
    } catch (error) {
      if (error instanceof AutoCombatSessionConcurrencyError) {
        const response = await this.buildSessionResponse(session.id, {
          message: AUTO_COMBAT_CONCURRENT_PROCESSING_MESSAGE,
          processing: this.buildEmptyProcessingSummary(),
        });

        this.autoCombatGateway.emitStatus(character.id, response);

        return response;
      }

      throw error;
    }

    const response = await this.buildSessionResponse(stoppedSession.id, {
      message: `${encounter.mob.name} foi rastreado. Inicie o combate quando estiver pronto.`,
      processing: this.buildEmptyProcessingSummary(),
    });

    this.autoCombatGateway.emitSessionUpdated(character.id, response);
    this.autoCombatGateway.emitStatus(character.id, response);

    return response;
  }

  async startBattle(
    userId: string,
    characterId: string,
    startBattleDto?: StartAutoCombatBattleDto,
  ) {
    const session = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId,
        status: AutoCombatSessionStatus.ACTIVE,
        character: {
          userId,
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!session) {
      throw new NotFoundException('Nenhuma caça ativa encontrada.');
    }

    const loadedSession = await this.loadAutoCombatSession(userId, session.id);

    if (!loadedSession) {
      throw new NotFoundException('Sessão de auto-combate não encontrada.');
    }

    if (loadedSession.phase === AutoCombatSessionPhase.COMBAT_ACTIVE) {
      await this.ensureResponsiveRoundDuration(loadedSession.id);
      this.startRealtimeProcessingLoop(userId, loadedSession.characterId);

      return this.buildSessionResponse(loadedSession.id, {
        message: 'Combate já está em andamento.',
        processing: this.buildEmptyProcessingSummary(),
      });
    }

    if (loadedSession.phase !== AutoCombatSessionPhase.ENCOUNTER_READY) {
      throw new BadRequestException('Pare a caça antes de iniciar o combate.');
    }

    const huntBatch = loadedSession.huntBatch ?? null;
    const battleSelection = this.resolveBattleSelection(
      loadedSession,
      startBattleDto,
    );
    const encounter = battleSelection.encounter;

    if (!encounter) {
      throw new BadRequestException(
        'Todos os mobs rastreados neste mapa jÃ¡ foram resolvidos. Inicie uma nova caÃ§a.',
      );
    }

    const mob = encounter.mob;
    const battleQuantity = battleSelection.quantity;
    const now = new Date();
    const characterStats = this.calculateCharacterFighterStats(
      loadedSession.character,
    );
    const ttk = calculateAutoCombatTtk({
      mob,
      playerStats: characterStats,
    });
    const combatIndex = Math.max(1, loadedSession.currentCombatIndex ?? 1);
    const enemyInstanceId = this.buildEnemyInstanceId({
      sessionId: loadedSession.id,
      combatIndex,
      mobId: mob.id,
    });

    const xpProgressPayload = this.buildCharacterXpPayload(
      loadedSession.character.level,
      loadedSession.character.xp,
    );
    const spawnEvent = this.buildRealtimeEvent({
      context: {
        characterId: loadedSession.characterId,
        sessionId: loadedSession.id,
        mobId: mob.id,
        mobName: mob.name,
        combatIndex,
        enemyInstanceId,
      },
      type: 'MOB_SPAWNED',
      actor: 'SYSTEM',
      target: 'MOB',
      phase: 'SPAWNING',
      nextActor: 'PLAYER',
      turnId: `${loadedSession.id}:${combatIndex}:0:1`,
      actionId: `${loadedSession.id}:${combatIndex}:0:1:MOB_SPAWNED`,
      actionOrder: 1,
      actionStartedAt: now,
      nextActionAt: this.addSeconds(
        now,
        this.getEffectiveRoundDurationSeconds(
          loadedSession.roundDurationSeconds,
        ),
      ),
      message: `${mob.name} apareceu.`,
      mobCurrentHp: mob.hp,
      mobMaxHp: mob.hp,
      battleProgressSeconds: 0,
      battleProgressPercent: 0,
      estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
      baseKillTimeSeconds: ttk.baseKillTimeSeconds,
      playerOffensivePower: ttk.playerOffensivePower,
      monsterRecommendedPower: ttk.monsterRecommendedPower,
      killsPerMinute: ttk.killsPerMinute,
      killsPerHour: ttk.killsPerHour,
      difficultyLabel: ttk.difficultyLabel,
      mobIndex: ttk.mobIndex,
      battleTargetMobId: mob.id,
      battleTargetEncounterId: battleSelection.encounter?.id ?? null,
      battleTargetTotal: battleQuantity,
      battleTargetRemaining: battleQuantity,
      characterCurrentHp:
        loadedSession.character.currentHp ?? characterStats.maxHp,
      characterMaxHp: characterStats.maxHp,
      hpBefore: null,
      hpAfter: mob.hp,
      targetHpBefore: null,
      targetHpAfter: mob.hp,
      mobHpBefore: null,
      mobHpAfter: mob.hp,
      characterHpBefore:
        loadedSession.character.currentHp ?? characterStats.maxHp,
      characterHpAfter:
        loadedSession.character.currentHp ?? characterStats.maxHp,
      damage: 0,
      isCritical: false,
      isDodged: false,
      characterXp: loadedSession.character.xp,
      characterLevel: loadedSession.character.level,
      ...xpProgressPayload,
      totalCombats: loadedSession.totalCombatsResolved ?? 0,
      totalRounds: loadedSession.totalRoundsResolved ?? 0,
      totalKills: loadedSession.totalCombatsResolved ?? 0,
      totalXpGained: loadedSession.totalXpGained ?? 0,
      totalLoot: (loadedSession.loots ?? []).reduce(
        (total: number, loot: { quantity: number }) => total + loot.quantity,
        0,
      ),
      potionsUsed: loadedSession.totalPotionsUsed ?? 0,
    });

    let updatedSession: { id: string };

    try {
      updatedSession = await this.prisma.$transaction(async (tx) => {
        await this.claimAutoCombatPhaseTransition(
          tx,
          loadedSession,
          AutoCombatSessionPhase.COMBAT_ACTIVE,
          {
            lastProcessedAt: now,
            currentMobId: mob.id,
            currentMobHp: mob.hp,
            currentMobMaxHp: mob.hp,
            killProgressSeconds: 0,
            estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
            baseKillTimeSeconds: ttk.baseKillTimeSeconds,
            playerOffensivePower: ttk.playerOffensivePower,
            monsterRecommendedPower: ttk.monsterRecommendedPower,
            currentMobIndex: ttk.mobIndex,
            currentRound: 0,
            currentCombatIndex: combatIndex,
            selectedEncounterId: encounter.id,
            selectedEncounterMobId: mob.id,
            battleTargetMobId: mob.id,
            battleTargetEncounterId: encounter.id,
            battleTargetTotal: battleQuantity,
            battleTargetRemaining: battleQuantity,
          },
        );

        await this.persistRealtimeEventsInTransaction(
          tx,
          loadedSession.characterId,
          [spawnEvent],
        );

        if (huntBatch?.id) {
          await this.claimHuntBatchStatusTransition(
            tx,
            huntBatch,
            AutoCombatHuntBatchStatus.CONSUMED,
            {
              consumedAt: now,
              lastProcessedAt: now,
              selectedEncounterId: encounter.id,
              selectedEncounterMobId: mob.id,
            },
          );
        }

        return tx.autoCombatSession.findUniqueOrThrow({
          where: {
            id: loadedSession.id,
          },
        });
      });
    } catch (error) {
      if (error instanceof AutoCombatSessionConcurrencyError) {
        const response = await this.buildSessionResponse(loadedSession.id, {
          message: AUTO_COMBAT_CONCURRENT_PROCESSING_MESSAGE,
          processing: this.buildEmptyProcessingSummary(),
        });

        this.autoCombatGateway.emitStatus(loadedSession.characterId, response);
        this.startRealtimeProcessingLoop(userId, loadedSession.characterId);

        return response;
      }

      throw error;
    }

    const response = await this.buildSessionResponse(updatedSession.id, {
      message: `Combate iniciado contra ${battleQuantity}x ${mob.name}.`,
      processing: this.buildEmptyProcessingSummary(),
    });

    this.emitRealtimeEvents(loadedSession.characterId, [spawnEvent], {
      persist: false,
    });
    this.autoCombatGateway.emitSessionUpdated(
      loadedSession.characterId,
      response,
    );
    this.autoCombatGateway.emitStatus(loadedSession.characterId, response);
    this.startRealtimeProcessingLoop(userId, loadedSession.characterId);
    this.scheduleImmediateSessionProcessing(
      userId,
      loadedSession.id,
      loadedSession.characterId,
    );

    return response;
  }

  async getRecentEvents(
    userId: string,
    characterId: string,
    options?: {
      afterSequence?: string | number | null;
    },
  ) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const activeSession = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId: character.id,
        status: AutoCombatSessionStatus.ACTIVE,
      },
      orderBy: {
        startedAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        currentCombatIndex: true,
        currentRound: true,
      },
    });

    const latestSession =
      activeSession ??
      (await this.prisma.autoCombatSession.findFirst({
        where: {
          characterId: character.id,
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          currentCombatIndex: true,
          currentRound: true,
        },
      }));

    if (!latestSession) {
      return {
        active: false,
        hasActiveAutoCombat: false,
        message: 'Nenhuma sessão de auto-combate encontrada.',
        character: {
          id: character.id,
          name: character.name,
        },
        session: null,
        events: [],
        latestSequence: null,
        snapshotSequence: null,
      };
    }

    const rawAfterSequence = Number(options?.afterSequence);
    const afterSequence =
      Number.isFinite(rawAfterSequence) && rawAfterSequence > 0
        ? Math.floor(rawAfterSequence)
        : null;

    const latestEvent = await this.prisma.autoCombatSessionEvent.findFirst({
      where: {
        sessionId: latestSession.id,
        characterId: character.id,
      },
      orderBy: {
        sequence: 'desc',
      },
      select: {
        sequence: true,
      },
    });

    const latestSequence = latestEvent?.sequence ?? null;
    const oldestEvent =
      afterSequence !== null && latestSequence !== null
        ? await this.prisma.autoCombatSessionEvent.findFirst({
            where: {
              sessionId: latestSession.id,
              characterId: character.id,
            },
            orderBy: {
              sequence: 'asc',
            },
            select: {
              sequence: true,
            },
          })
        : null;
    const oldestAvailableSequence = oldestEvent?.sequence ?? null;
    const needsSnapshot = Boolean(
      afterSequence !== null &&
      latestSequence !== null &&
      latestSequence > afterSequence &&
      oldestAvailableSequence !== null &&
      afterSequence + 1 < oldestAvailableSequence,
    );

    const eventWhere: Prisma.AutoCombatSessionEventWhereInput = {
      sessionId: latestSession.id,
      characterId: character.id,
    };

    if (afterSequence !== null) {
      eventWhere.sequence = {
        gt: afterSequence,
      };
    }

    const eventOrder: Prisma.AutoCombatSessionEventOrderByWithRelationInput = {
      sequence: afterSequence !== null ? 'asc' : 'desc',
    };

    const storedEvents = await this.prisma.autoCombatSessionEvent.findMany({
      where: eventWhere,
      orderBy: eventOrder,
      take:
        afterSequence !== null
          ? AUTO_COMBAT_STORED_EVENTS_LIMIT
          : AUTO_COMBAT_RECENT_EVENTS_LIMIT,
    });

    const orderedEvents =
      afterSequence !== null ? storedEvents : [...storedEvents].reverse();

    const events = orderedEvents.map((event) => {
      const payload =
        event.payloadJson &&
        typeof event.payloadJson === 'object' &&
        !Array.isArray(event.payloadJson)
          ? (event.payloadJson as Record<string, unknown>)
          : {};

      return {
        ...payload,
        id: event.id,
        eventId: event.id,
        sessionId: event.sessionId,
        characterId: event.characterId,
        type: event.type,
        sequence: event.sequence,
        createdAt: event.createdAt.toISOString(),
      };
    });

    return {
      active: latestSession.status === AutoCombatSessionStatus.ACTIVE,
      hasActiveAutoCombat:
        latestSession.status === AutoCombatSessionStatus.ACTIVE,
      message: 'Eventos recentes do auto-combate carregados com sucesso.',
      character: {
        id: character.id,
        name: character.name,
      },
      session: {
        id: latestSession.id,
        status: latestSession.status,
        startedAt: latestSession.startedAt,
        finishedAt: latestSession.finishedAt,
        currentCombatIndex: latestSession.currentCombatIndex,
        currentRound: latestSession.currentRound,
      },
      events,
      latestSequence,
      snapshotSequence: latestSequence,
      requestedAfterSequence: afterSequence,
      oldestAvailableSequence,
      needsSnapshot,
      gapFromSequence: needsSnapshot ? afterSequence : null,
    };
  }

  async stop(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const activeSession = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId: character.id,
        status: AutoCombatSessionStatus.ACTIVE,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!activeSession) {
      this.stopRealtimeProcessingLoop(character.id);

      return {
        active: false,
        hasActiveAutoCombat: false,
        message: 'Nenhuma sessão ativa para encerrar.',
      };
    }

    const stoppedAt = new Date();
    const stoppedSession = await this.prisma.$transaction(async (tx) => {
      const session = await tx.autoCombatSession.update({
        where: {
          id: activeSession.id,
        },
        data: {
          status: AutoCombatSessionStatus.STOPPED,
          finishedAt: stoppedAt,
        },
      });

      await tx.autoCombatHuntBatch.updateMany({
        where: {
          sessionId: activeSession.id,
          status: {
            in: [
              AutoCombatHuntBatchStatus.HUNTING,
              AutoCombatHuntBatchStatus.READY,
            ],
          },
        },
        data: {
          status: AutoCombatHuntBatchStatus.CANCELLED,
          cancelledAt: stoppedAt,
          lastProcessedAt: stoppedAt,
        },
      });

      return session;
    });

    this.clearPotionUsageForSession(stoppedSession.id);

    const response = await this.buildSessionResponse(stoppedSession.id, {
      message: 'Sessão de combate automático encerrada.',
      processing: this.buildEmptyProcessingSummary(),
    });

    this.stopRealtimeProcessingLoop(character.id);
    this.autoCombatGateway.emitStopped(character.id, response);
    this.autoCombatGateway.emitSessionUpdated(character.id, response);
    this.autoCombatGateway.emitStatus(character.id, response);

    return response;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private getEffectiveRoundDurationSeconds(
    roundDurationSeconds?: number | null,
  ) {
    return this.clampNumber(
      Math.floor(
        roundDurationSeconds ?? AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
      ),
      1,
      AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
    );
  }

  private async ensureResponsiveRoundDuration(sessionId: string) {
    /**
     * Normaliza sessões antigas para o ritmo configurado sem forçar processamento
     * imediato. O lastProcessedAt fica em `now` apenas quando a duração muda,
     * preservando o respiro visual entre spawn e primeiro ataque.
     */
    await this.prisma.autoCombatSession.updateMany({
      where: {
        id: sessionId,
        status: AutoCombatSessionStatus.ACTIVE,
        roundDurationSeconds: {
          not: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
        },
      },
      data: {
        roundDurationSeconds: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
        lastProcessedAt: new Date(),
      },
    });
  }

  private scheduleImmediateSessionProcessing(
    userId: string,
    sessionId: string,
    characterId: string,
  ) {
    /**
     * O nome foi mantido por compatibilidade, mas o processamento não é mais
     * instantâneo: a primeira rodada respeita o roundDurationSeconds.
     */
    const existingTimeout = this.immediateProcessingTimeouts.get(characterId);

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.immediateProcessingTimeouts.delete(characterId);
      void this.processActiveSessionById(userId, sessionId).catch(() => {
        this.stopRealtimeProcessingLoop(characterId);
      });
    }, AUTO_COMBAT_REALTIME_TICK_MS);

    this.immediateProcessingTimeouts.set(characterId, timeout);
  }

  private startRealtimeProcessingLoop(userId: string, characterId: string) {
    if (this.realtimeIntervals.has(characterId)) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const activeSession = await this.prisma.autoCombatSession.findFirst({
          where: {
            characterId,
            status: AutoCombatSessionStatus.ACTIVE,
            character: {
              userId,
            },
          },
          orderBy: {
            startedAt: 'desc',
          },
          select: {
            id: true,
          },
        });

        if (!activeSession) {
          this.stopRealtimeProcessingLoop(characterId);
          return;
        }

        const response = await this.processActiveSessionById(
          userId,
          activeSession.id,
        );

        if (!response.active) {
          this.stopRealtimeProcessingLoop(characterId);
        }
      } catch {
        this.stopRealtimeProcessingLoop(characterId);
      }
    }, AUTO_COMBAT_REALTIME_TICK_MS);

    this.realtimeIntervals.set(characterId, interval);
  }

  private stopRealtimeProcessingLoop(characterId: string) {
    const timeout = this.immediateProcessingTimeouts.get(characterId);

    if (timeout) {
      clearTimeout(timeout);
      this.immediateProcessingTimeouts.delete(characterId);
    }

    const interval = this.realtimeIntervals.get(characterId);

    if (!interval) {
      return;
    }

    clearInterval(interval);
    this.realtimeIntervals.delete(characterId);
  }

  private loadAutoCombatSession(userId: string, sessionId: string) {
    return this.prisma.autoCombatSession.findFirst({
      where: {
        id: sessionId,
        character: {
          userId,
        },
      },
      include: {
        currentMob: {
          include: {
            drops: {
              include: {
                item: true,
              },
            },
          },
        },
        selectedEncounter: {
          include: {
            mob: {
              include: {
                drops: {
                  include: {
                    item: true,
                  },
                },
              },
            },
          },
        },
        character: {
          include: {
            class: true,
            user: {
              select: {
                premiumUntil: true,
              },
            },
            equipment: {
              include: {
                mainHand: true,
                offHand: true,
                head: true,
                armor: true,
                pants: true,
                boots: true,
              },
            },
            potionConfig: {
              include: {
                potionItem: true,
              },
            },
            inventoryItems: {
              include: {
                item: true,
              },
            },
            gatheringSkills: true,
            huntingSkill: true,
          },
        },
        loots: true,
        events: {
          orderBy: {
            sequence: 'desc',
          },
          take: 1,
        },
        mobSummaries: true,
        huntBatch: {
          include: {
            selectedEncounter: {
              include: {
                mob: {
                  include: {
                    drops: {
                      include: {
                        item: true,
                      },
                    },
                  },
                },
              },
            },
            mobs: {
              include: {
                mob: true,
                encounter: true,
              },
              orderBy: {
                updatedAt: 'asc',
              },
            },
          },
        },
        map: {
          include: {
            subMaps: {
              include: {
                encounters: {
                  where: {
                    isActive: true,
                  },
                  include: {
                    mob: {
                      include: {
                        drops: {
                          include: {
                            item: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        subMap: {
          include: {
            map: {
              include: {
                subMaps: {
                  include: {
                    encounters: {
                      where: {
                        isActive: true,
                      },
                      include: {
                        mob: {
                          include: {
                            drops: {
                              include: {
                                item: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            encounters: {
              where: {
                isActive: true,
              },
              include: {
                mob: {
                  include: {
                    drops: {
                      include: {
                        item: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private async processActiveSessionById(
    userId: string,
    sessionId: string,
    options?: {
      emitRealtimeEvents?: boolean;
      waitForActiveProcessing?: boolean;
    },
  ) {
    const session = await this.loadAutoCombatSession(userId, sessionId);

    if (!session) {
      throw new NotFoundException(
        'Sessão de combate automático não encontrada.',
      );
    }

    if (session.status !== AutoCombatSessionStatus.ACTIVE) {
      this.stopRealtimeProcessingLoop(session.characterId);

      const response = await this.buildSessionResponse(session.id, {
        message: 'Sessão não está ativa.',
        processing: this.buildEmptyProcessingSummary(),
      });

      this.autoCombatGateway.emitStatus(session.characterId, response);

      return response;
    }

    if (this.getSessionHuntEncounters(session).length === 0) {
      throw new BadRequestException(
        'Este mapa não possui monstros ativos para processar.',
      );
    }

    if (this.processingLocks.has(session.characterId)) {
      if (options?.waitForActiveProcessing) {
        await this.waitForProcessingLockRelease(session.characterId);

        return this.buildSessionResponse(session.id, {
          message: 'Sessão ativa sincronizada.',
          processing: this.buildEmptyProcessingSummary(),
        });
      }

      return this.buildSessionResponse(session.id, {
        message: 'Sessão já está sendo processada.',
        processing: this.buildEmptyProcessingSummary(),
      });
    }

    this.processingLocks.add(session.characterId);

    try {
      if (session.phase === AutoCombatSessionPhase.HUNTING) {
        return await this.processHuntingSession(session);
      }

      if (session.phase === AutoCombatSessionPhase.ENCOUNTER_READY) {
        const response = await this.buildSessionResponse(session.id, {
          message:
            'Caça pronta. Inicie o combate quando quiser enfrentar a ameaça encontrada.',
          processing: this.buildEmptyProcessingSummary(),
        });

        this.autoCombatGateway.emitStatus(session.characterId, response);

        return response;
      }

      const effectiveRoundDurationSeconds =
        this.getEffectiveRoundDurationSeconds(session.roundDurationSeconds);

      if (session.roundDurationSeconds !== effectiveRoundDurationSeconds) {
        session.roundDurationSeconds = effectiveRoundDurationSeconds;
      }

      const now = new Date();
      const effectiveNow = new Date(
        Math.min(now.getTime(), session.endsAt.getTime()),
      );

      const secondsAvailable = Math.max(
        0,
        (effectiveNow.getTime() - session.lastProcessedAt.getTime()) / 1000,
      );

      const actionsAvailable =
        session.phase === AutoCombatSessionPhase.COMBAT_ACTIVE &&
        session.currentMobId
          ? secondsAvailable > 0
            ? 1
            : 0
          : Math.max(
              0,
              Math.floor(secondsAvailable / effectiveRoundDurationSeconds),
            );

      if (actionsAvailable <= 0) {
        if (now.getTime() >= session.endsAt.getTime()) {
          const finishedSession = await this.finishActiveSessionAtEnd(session);
          const response = await this.buildSessionResponse(finishedSession.id, {
            message: 'Sessão finalizada com sucesso.',
            processing: this.buildEmptyProcessingSummary(),
          });

          this.clearPotionUsageForSession(finishedSession.id);
          this.stopRealtimeProcessingLoop(session.characterId);
          this.autoCombatGateway.emitSessionUpdated(
            session.characterId,
            response,
          );
          this.autoCombatGateway.emitStatus(session.characterId, response);
          this.autoCombatGateway.emitFinished(session.characterId, response);

          return response;
        }

        const response = await this.buildSessionResponse(session.id, {
          message: 'Sessão ativa aguardando próxima rodada.',
          processing: this.buildEmptyProcessingSummary(),
        });

        this.autoCombatGateway.emitStatus(session.characterId, response);

        return response;
      }

      const actionsToProcess = Math.min(
        actionsAvailable,
        AUTO_COMBAT_MAX_COMBATS_PER_PROCESS,
      );

      let currentSession = session;
      let aggregateResult = this.buildBaseRealtimeProcessingResult(
        currentSession,
        {
          actionsAvailable,
          processingLimited: actionsToProcess < actionsAvailable,
        },
      );

      for (let actionIndex = 0; actionIndex < actionsToProcess; actionIndex++) {
        if (currentSession.status !== AutoCombatSessionStatus.ACTIVE) {
          break;
        }

        if (this.sessionNeedsMobSpawn(currentSession)) {
          if (
            this.hasHuntBatchQueue(currentSession) &&
            (this.getTrackedEnemiesRemaining(currentSession) ?? 0) <= 0
          ) {
            const finishedSession = await this.finishActiveSessionAt(
              currentSession,
              currentSession.lastProcessedAt,
            );

            currentSession = {
              ...currentSession,
              ...finishedSession,
              status: AutoCombatSessionStatus.FINISHED,
              currentMob: null,
              currentMobId: null,
              currentMobHp: null,
              currentMobMaxHp: null,
              currentRound: 0,
              finishedAt: currentSession.lastProcessedAt,
            };

            aggregateResult.finalStatus = AutoCombatSessionStatus.FINISHED;
            aggregateResult.finishedAt = currentSession.lastProcessedAt;
            aggregateResult.newLastProcessedAt = currentSession.lastProcessedAt;
            aggregateResult.currentMobId = null;
            aggregateResult.currentMobHp = null;
            aggregateResult.currentMobMaxHp = null;
            aggregateResult.currentRound = 0;

            break;
          }

          const nextLastProcessedAt =
            currentSession.phase === AutoCombatSessionPhase.COMBAT_ACTIVE
              ? effectiveNow
              : this.addSeconds(
                  currentSession.lastProcessedAt,
                  effectiveRoundDurationSeconds,
                );

          if (
            nextLastProcessedAt.getTime() >= currentSession.endsAt.getTime()
          ) {
            aggregateResult = this.mergeProcessedWaitAction(
              aggregateResult,
              currentSession,
              currentSession.endsAt,
            );

            const finishedSession =
              await this.finishActiveSessionAtEnd(currentSession);

            currentSession = {
              ...currentSession,
              ...finishedSession,
              status: AutoCombatSessionStatus.FINISHED,
              currentMob: null,
              currentMobId: null,
              currentMobHp: null,
              currentMobMaxHp: null,
              currentRound: 0,
              lastProcessedAt: currentSession.endsAt,
              finishedAt: currentSession.endsAt,
            };

            aggregateResult.finalStatus = AutoCombatSessionStatus.FINISHED;
            aggregateResult.finishedAt = currentSession.endsAt;
            aggregateResult.newLastProcessedAt = currentSession.endsAt;
            aggregateResult.currentMobId = null;
            aggregateResult.currentMobHp = null;
            aggregateResult.currentMobMaxHp = null;
            aggregateResult.currentRound = 0;
            aggregateResult.actionsProcessed =
              (aggregateResult.actionsProcessed ?? 0) + 1;

            break;
          }

          const spawnResult = await this.spawnNextMobForSession(
            currentSession,
            {
              emitRealtimeEvent: false,
              lastProcessedAt: nextLastProcessedAt,
            },
          );

          aggregateResult = this.mergeProcessedWaitAction(
            aggregateResult,
            currentSession,
            nextLastProcessedAt,
          );
          aggregateResult.actionsProcessed =
            (aggregateResult.actionsProcessed ?? 0) + 1;
          aggregateResult.events = this.appendRealtimeEventsWithLimit(
            aggregateResult.events,
            [spawnResult.event],
          );

          currentSession = this.applySpawnToSession(
            currentSession,
            spawnResult,
            nextLastProcessedAt,
          );

          continue;
        }

        const roundResult = this.resolveTtkRealtimeRound(currentSession);

        await this.persistRealtimeRoundResult(currentSession, roundResult);

        aggregateResult = this.mergeRealtimeRoundResults(
          aggregateResult,
          roundResult,
        );
        aggregateResult.actionsProcessed =
          (aggregateResult.actionsProcessed ?? 0) + 1;

        currentSession = this.applyRealtimeRoundResultToSession(
          currentSession,
          roundResult,
        );

        if (roundResult.finalStatus !== AutoCombatSessionStatus.ACTIVE) {
          break;
        }

        if (roundResult.phase === AutoCombatSessionPhase.ENCOUNTER_READY) {
          break;
        }
      }

      if (
        currentSession.status === AutoCombatSessionStatus.ACTIVE &&
        now.getTime() >= currentSession.endsAt.getTime() &&
        currentSession.lastProcessedAt.getTime() >=
          currentSession.endsAt.getTime()
      ) {
        const finishedSession =
          await this.finishActiveSessionAtEnd(currentSession);

        currentSession = {
          ...currentSession,
          ...finishedSession,
          status: AutoCombatSessionStatus.FINISHED,
          currentMob: null,
          currentMobId: null,
          currentMobHp: null,
          currentMobMaxHp: null,
          currentRound: 0,
          lastProcessedAt: currentSession.endsAt,
          finishedAt: currentSession.endsAt,
        };

        aggregateResult.finalStatus = AutoCombatSessionStatus.FINISHED;
        aggregateResult.finishedAt = currentSession.endsAt;
        aggregateResult.newLastProcessedAt = currentSession.endsAt;
        aggregateResult.currentMobId = null;
        aggregateResult.currentMobHp = null;
        aggregateResult.currentMobMaxHp = null;
        aggregateResult.currentRound = 0;
      }

      const shouldEmitRealtimeEvents =
        options?.emitRealtimeEvents !== false &&
        this.shouldEmitRealtimeEventsForProcessingResult(aggregateResult);

      const realtimeEventsToEmit = shouldEmitRealtimeEvents
        ? aggregateResult.events
        : [];

      aggregateResult.eventsEmitted = realtimeEventsToEmit.length;
      aggregateResult.eventsSuppressed =
        Math.max(0, aggregateResult.eventsSuppressed ?? 0) +
        Math.max(
          0,
          aggregateResult.events.length - realtimeEventsToEmit.length,
        );

      const response = await this.buildSessionResponse(session.id, {
        message: this.getProcessingResultMessage(aggregateResult),
        processing: this.buildProcessingSummary(aggregateResult, true),
      });

      if (realtimeEventsToEmit.length > 0) {
        this.emitRealtimeEvents(session.characterId, realtimeEventsToEmit, {
          persist: false,
        });
      }

      this.autoCombatGateway.emitSessionUpdated(session.characterId, response);
      this.autoCombatGateway.emitStatus(session.characterId, response);

      if (aggregateResult.finalStatus === AutoCombatSessionStatus.FINISHED) {
        this.clearPotionUsageForSession(session.id);
        this.stopRealtimeProcessingLoop(session.characterId);
        this.autoCombatGateway.emitFinished(session.characterId, response);
      }

      if (aggregateResult.finalStatus === AutoCombatSessionStatus.DEFEATED) {
        this.clearPotionUsageForSession(session.id);
        this.stopRealtimeProcessingLoop(session.characterId);
        this.autoCombatGateway.emitFinished(session.characterId, response);
      }

      return response;
    } catch (error) {
      if (error instanceof AutoCombatSessionConcurrencyError) {
        const response = await this.buildSessionResponse(session.id, {
          message: AUTO_COMBAT_CONCURRENT_PROCESSING_MESSAGE,
          processing: this.buildEmptyProcessingSummary(),
        });

        this.autoCombatGateway.emitStatus(session.characterId, response);

        return response;
      }

      throw error;
    } finally {
      this.processingLocks.delete(session.characterId);
    }
  }

  private async processHuntingSession(session: any) {
    const now = new Date();
    const effectiveNow = new Date(
      Math.min(now.getTime(), session.endsAt.getTime()),
    );
    const huntingSkill = await this.getOrCreateHuntingSkill(
      session.characterId,
    );
    const huntBatch = session.huntBatch ?? null;
    const lastHuntProcessedAt =
      huntBatch?.lastProcessedAt ??
      session.lastHuntProcessedAt ??
      session.huntStartedAt ??
      session.startedAt ??
      session.lastProcessedAt;
    const safeLastHuntProcessedAt = new Date(lastHuntProcessedAt);
    const elapsedSeconds = Math.max(
      0,
      Math.floor(
        (effectiveNow.getTime() - safeLastHuntProcessedAt.getTime()) / 1000,
      ),
    );
    const secondsPerEnemy = this.getHuntingSecondsPerEnemy(huntingSkill.level);
    const previousFoundEnemiesCount = Math.max(
      0,
      Math.floor(
        Number(huntBatch?.foundEnemiesCount ?? session.foundEnemiesCount) || 0,
      ),
    );
    const previousTrackedEnemiesRemaining =
      this.getTrackedEnemiesRemaining(session) ?? previousFoundEnemiesCount;
    const maxTrackedEnemies = this.getHuntingMaxTrackedEnemies(
      huntingSkill.level,
    );
    const remainingHuntCapacity = Math.max(
      0,
      maxTrackedEnemies - previousTrackedEnemiesRemaining,
    );
    const rawEnemiesFoundNow = Math.floor(elapsedSeconds / secondsPerEnemy);
    const enemiesFoundNow = Math.min(rawEnemiesFoundNow, remainingHuntCapacity);
    const didReachHuntLimit =
      remainingHuntCapacity <= 0 ||
      (remainingHuntCapacity > 0 &&
        rawEnemiesFoundNow >= remainingHuntCapacity);

    if (didReachHuntLimit && enemiesFoundNow <= 0) {
      const readyAt = safeLastHuntProcessedAt;
      const readyResponseSession = await this.markHuntingSessionAsReady(
        session,
        huntBatch,
        readyAt,
        'Limite de rastreio atingido neste mapa. Inicie o combate ou resolva os mobs encontrados.',
      );

      this.stopRealtimeProcessingLoop(session.characterId);

      return readyResponseSession;
    }

    if (enemiesFoundNow <= 0) {
      if (now.getTime() >= session.endsAt.getTime()) {
        const finishedSession = await this.finishActiveSessionAtEnd(session);
        const response = await this.buildSessionResponse(finishedSession.id, {
          message: 'Caça finalizada pelo limite de tempo.',
          processing: this.buildEmptyProcessingSummary(),
        });

        this.clearPotionUsageForSession(finishedSession.id);
        this.stopRealtimeProcessingLoop(session.characterId);
        this.autoCombatGateway.emitSessionUpdated(
          session.characterId,
          response,
        );
        this.autoCombatGateway.emitStatus(session.characterId, response);
        this.autoCombatGateway.emitFinished(session.characterId, response);

        return response;
      }

      const response = await this.buildSessionResponse(session.id, {
        message: 'Caça em andamento.',
        processing: this.buildEmptyProcessingSummary(),
      });

      this.autoCombatGateway.emitStatus(session.characterId, response);

      return response;
    }

    const processedAt = this.addSeconds(
      safeLastHuntProcessedAt,
      enemiesFoundNow * secondsPerEnemy,
    );
    const huntingXpGained = enemiesFoundNow * AUTO_COMBAT_HUNTING_XP_PER_ENEMY;
    const huntingProgress = this.calculateHuntingSkillProgress(
      huntingSkill,
      huntingXpGained,
    );
    let trackedEncounter =
      huntBatch?.selectedEncounter ?? session.selectedEncounter ?? null;
    const huntEncounters = this.getSessionHuntEncounters(session);
    const huntEvents: AutoCombatRealtimeEvent[] = [];
    const huntFoundCountsByMob = new Map<string, number>();
    const huntFoundMetadataByMob = new Map<
      string,
      {
        encounterId: string | null;
        weightSnapshot: number;
        firstFoundAt: Date;
        lastFoundAt: Date;
      }
    >();
    const huntEventStartOffset = Math.max(
      0,
      enemiesFoundNow - AUTO_COMBAT_HUNTING_MAX_EVENTS_PER_PROCESS,
    );
    for (let index = 0; index < enemiesFoundNow; index += 1) {
      const findIndex = previousFoundEnemiesCount + index + 1;
      const foundAt = this.addSeconds(
        safeLastHuntProcessedAt,
        (index + 1) * secondsPerEnemy,
      );
      const nextFindAt = this.addSeconds(foundAt, secondsPerEnemy);

      trackedEncounter = this.rollEncounter(huntEncounters, {
        huntingLevel: huntingSkill.level,
        foundEnemiesCount: findIndex,
      });

      const mobId = trackedEncounter.mobId;
      huntFoundCountsByMob.set(
        mobId,
        (huntFoundCountsByMob.get(mobId) ?? 0) + 1,
      );
      const previousMetadata = huntFoundMetadataByMob.get(mobId);
      huntFoundMetadataByMob.set(mobId, {
        encounterId: trackedEncounter.id ?? null,
        weightSnapshot: Math.max(
          1,
          Math.floor(Number(trackedEncounter.weight) || 100),
        ),
        firstFoundAt: previousMetadata?.firstFoundAt ?? foundAt,
        lastFoundAt: foundAt,
      });

      if (index < huntEventStartOffset) {
        continue;
      }

      huntEvents.push({
        characterId: session.characterId,
        sessionId: session.id,
        type: 'HUNT_TARGET_FOUND',
        phase: 'HUNTING',
        sessionStatus: AutoCombatSessionStatus.ACTIVE,
        actor: 'SYSTEM',
        target: 'MOB',
        serverTime: foundAt.toISOString(),
        createdAt: foundAt.toISOString(),
        actionStartedAt: foundAt.toISOString(),
        nextActionAt: nextFindAt.toISOString(),
        eventKey: buildHuntCycleKey(session.id, findIndex),
        huntCycleKey: buildHuntCycleKey(session.id, findIndex),
        huntSequence: findIndex,
        foundAt: foundAt.toISOString(),
        nextFindAt: nextFindAt.toISOString(),
        secondsPerFind: secondsPerEnemy,
        selectedEncounterId: trackedEncounter.id,
        targetEncounterId: trackedEncounter.id,
        targetMobId: trackedEncounter.mobId,
        mobId: trackedEncounter.mobId,
        mobName: trackedEncounter.mob?.name,
        huntingXpGained: AUTO_COMBAT_HUNTING_XP_PER_ENEMY,
        foundEnemiesCount: findIndex,
        message: `${trackedEncounter.mob?.name ?? 'Ameaça'} rastreada na caça.`,
      });
    }

    const didReachSessionLimit =
      !didReachHuntLimit && now.getTime() >= session.endsAt.getTime();
    const sessionUpdateData: Prisma.AutoCombatSessionUncheckedUpdateManyInput =
      {
        lastHuntProcessedAt: processedAt,
        lastProcessedAt: didReachSessionLimit ? session.endsAt : processedAt,
        foundEnemiesCount: {
          increment: enemiesFoundNow,
        },
        huntingXpGained: {
          increment: huntingXpGained,
        },
        selectedEncounterId:
          trackedEncounter?.id ?? session.selectedEncounterId,
        selectedEncounterMobId:
          trackedEncounter?.mobId ?? session.selectedEncounterMobId,
      };

    if (didReachSessionLimit) {
      sessionUpdateData.status = AutoCombatSessionStatus.FINISHED;
      sessionUpdateData.finishedAt = session.endsAt;
    }

    if (didReachHuntLimit) {
      sessionUpdateData.phase = AutoCombatSessionPhase.ENCOUNTER_READY;
      sessionUpdateData.huntStoppedAt = processedAt;
      sessionUpdateData.currentMobId = null;
      sessionUpdateData.currentMobHp = null;
      sessionUpdateData.currentMobMaxHp = null;
      sessionUpdateData.currentRound = 0;
    }

    const huntBatchUpdateData: Prisma.AutoCombatHuntBatchUncheckedUpdateManyInput | null =
      huntBatch?.id
        ? {
            lastProcessedAt: processedAt,
            foundEnemiesCount: {
              increment: enemiesFoundNow,
            },
            huntingXpGained: {
              increment: huntingXpGained,
            },
            selectedEncounterId:
              trackedEncounter?.id ?? huntBatch.selectedEncounterId,
            selectedEncounterMobId:
              trackedEncounter?.mobId ?? huntBatch.selectedEncounterMobId,
            huntSequence: previousFoundEnemiesCount + enemiesFoundNow,
            ...(didReachHuntLimit
              ? {
                  status: AutoCombatHuntBatchStatus.READY,
                  stoppedAt: processedAt,
                }
              : {}),
            ...(didReachSessionLimit
              ? {
                  status: AutoCombatHuntBatchStatus.CANCELLED,
                  cancelledAt: session.endsAt,
                }
              : {}),
          }
        : null;

    const updatedSession = await this.prisma.$transaction(async (tx) => {
      await this.claimHuntingSessionProcessingStep(
        tx,
        session,
        sessionUpdateData,
      );

      if (huntBatch?.id && huntBatchUpdateData) {
        await this.claimHuntBatchProcessingStep(
          tx,
          huntBatch,
          huntBatchUpdateData,
        );
      }

      await tx.characterHuntingSkill.update({
        where: {
          id: huntingSkill.id,
        },
        data: {
          level: huntingProgress.level,
          xp: huntingProgress.xp,
          totalXp: huntingProgress.totalXp,
        },
      });

      await this.persistHuntingMobFoundCountsInTransaction(
        tx,
        session.id,
        huntFoundCountsByMob,
      );

      if (huntBatch?.id) {
        await this.persistHuntBatchMobFoundCountsInTransaction(
          tx,
          huntBatch.id,
          huntFoundCountsByMob,
          huntFoundMetadataByMob,
        );

        await this.persistHuntBatchEventsInTransaction(
          tx,
          huntBatch.id,
          session.characterId,
          session.id,
          huntEvents,
        );
      }

      await this.persistRealtimeEventsInTransaction(
        tx,
        session.characterId,
        huntEvents,
      );

      return tx.autoCombatSession.findUniqueOrThrow({
        where: {
          id: session.id,
        },
      });
    });

    const response = await this.buildSessionResponse(updatedSession.id, {
      message: didReachSessionLimit
        ? `Caça finalizada pelo limite de tempo. ${enemiesFoundNow} ameaça(s) rastreada(s).`
        : didReachHuntLimit
          ? `Limite de rastreio atingido neste mapa. ${enemiesFoundNow} ameaça(s) rastreada(s).`
          : `${enemiesFoundNow} ameaça(s) rastreada(s) durante a caça.`,
      processing: this.buildEmptyProcessingSummary(),
    });

    this.autoCombatGateway.emitSessionUpdated(session.characterId, response);
    this.autoCombatGateway.emitStatus(session.characterId, response);

    if (didReachHuntLimit) {
      this.stopRealtimeProcessingLoop(session.characterId);
    }

    if (didReachSessionLimit) {
      this.clearPotionUsageForSession(updatedSession.id);
      this.stopRealtimeProcessingLoop(session.characterId);
      this.autoCombatGateway.emitFinished(session.characterId, response);
    }

    return response;
  }

  private async spawnNextMobForSession(
    session: any,
    options?: {
      emitRealtimeEvent?: boolean;
      lastProcessedAt?: Date;
    },
  ) {
    const encounter = this.getNextCombatEncounter(session);

    if (!encounter) {
      throw new BadRequestException(
        'Nenhum mob rastreado pendente para continuar o combate.',
      );
    }

    const mob = encounter.mob;

    const combatIndex = Math.max(1, session.currentCombatIndex ?? 1);
    const lastProcessedAt = options?.lastProcessedAt ?? new Date();

    const characterStats = this.calculateCharacterFighterStats(
      session.character,
    );
    const ttk = calculateAutoCombatTtk({
      mob,
      playerStats: characterStats,
    });

    const xpProgressPayload = this.buildCharacterXpPayload(
      session.character.level,
      session.character.xp,
    );

    const totalLoot = (session.loots ?? []).reduce(
      (total: number, loot: { quantity: number }) => total + loot.quantity,
      0,
    );

    const totalKills = session.totalCombatsResolved ?? 0;
    const totalRounds = session.totalRoundsResolved ?? 0;
    const totalXpGained = session.totalXpGained ?? 0;
    const totalPotionsUsed = session.totalPotionsUsed ?? 0;
    const enemyInstanceId = this.buildEnemyInstanceId({
      sessionId: session.id,
      combatIndex,
      mobId: mob.id,
    });

    const event = this.buildRealtimeEvent({
      context: {
        characterId: session.characterId,
        sessionId: session.id,
        mobId: mob.id,
        mobName: mob.name,
        combatIndex,
        enemyInstanceId,
      },
      type: 'MOB_SPAWNED',
      actor: 'SYSTEM',
      target: 'MOB',
      phase: 'SPAWNING',
      nextActor: 'PLAYER',
      turnId: `${session.id}:${combatIndex}:0:1`,
      actionId: `${session.id}:${combatIndex}:0:1:MOB_SPAWNED`,
      actionOrder: 1,
      actionStartedAt: lastProcessedAt,
      nextActionAt: this.addSeconds(
        lastProcessedAt,
        this.getEffectiveRoundDurationSeconds(session.roundDurationSeconds),
      ),
      message: `${mob.name} apareceu.`,
      mobCurrentHp: mob.hp,
      mobMaxHp: mob.hp,
      battleProgressSeconds: 0,
      battleProgressPercent: 0,
      estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
      baseKillTimeSeconds: ttk.baseKillTimeSeconds,
      playerOffensivePower: ttk.playerOffensivePower,
      monsterRecommendedPower: ttk.monsterRecommendedPower,
      killsPerMinute: ttk.killsPerMinute,
      killsPerHour: ttk.killsPerHour,
      difficultyLabel: ttk.difficultyLabel,
      mobIndex: ttk.mobIndex,
      battleTargetMobId: session.battleTargetMobId ?? mob.id,
      battleTargetEncounterId: session.battleTargetEncounterId ?? null,
      battleTargetTotal: session.battleTargetTotal ?? null,
      battleTargetRemaining: session.battleTargetRemaining ?? null,
      characterCurrentHp: session.character.currentHp ?? characterStats.maxHp,
      characterMaxHp: characterStats.maxHp,
      hpBefore: null,
      hpAfter: mob.hp,
      targetHpBefore: null,
      targetHpAfter: mob.hp,
      mobHpBefore: null,
      mobHpAfter: mob.hp,
      characterHpBefore: session.character.currentHp ?? characterStats.maxHp,
      characterHpAfter: session.character.currentHp ?? characterStats.maxHp,
      damage: 0,
      isCritical: false,
      isDodged: false,
      characterXp: session.character.xp,
      characterLevel: session.character.level,
      ...xpProgressPayload,
      totalCombats: totalKills,
      totalRounds,
      totalKills,
      totalXpGained,
      totalLoot,
      potionsUsed: totalPotionsUsed,
    });

    const updatedSession = await this.prisma.$transaction(async (tx) => {
      await this.claimSessionProcessingStep(tx, session, {
        currentMobId: mob.id,
        currentMobHp: mob.hp,
        currentMobMaxHp: mob.hp,
        killProgressSeconds: 0,
        estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
        baseKillTimeSeconds: ttk.baseKillTimeSeconds,
        playerOffensivePower: ttk.playerOffensivePower,
        monsterRecommendedPower: ttk.monsterRecommendedPower,
        currentMobIndex: ttk.mobIndex,
        currentRound: 0,
        currentCombatIndex: combatIndex,
        lastProcessedAt,
      });

      await this.persistRealtimeEventsInTransaction(tx, session.characterId, [
        event,
      ]);

      return {
        ...session,
        currentMobId: mob.id,
        currentMobHp: mob.hp,
        currentMobMaxHp: mob.hp,
        killProgressSeconds: 0,
        estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
        baseKillTimeSeconds: ttk.baseKillTimeSeconds,
        playerOffensivePower: ttk.playerOffensivePower,
        monsterRecommendedPower: ttk.monsterRecommendedPower,
        currentMobIndex: ttk.mobIndex,
        currentRound: 0,
        currentCombatIndex: combatIndex,
        lastProcessedAt,
      };
    });

    if (options?.emitRealtimeEvent !== false) {
      this.emitRealtimeEvents(session.characterId, [event], {
        persist: false,
      });
    }

    return {
      session: updatedSession,
      event,
      mob,
    };
  }

  private sessionNeedsMobSpawn(session: any) {
    return (
      !session.currentMob ||
      !session.currentMobId ||
      session.currentMobHp === null ||
      session.currentMobHp === undefined ||
      session.currentMobHp <= 0
    );
  }

  private addSeconds(date: Date, seconds: number) {
    return new Date(date.getTime() + seconds * 1000);
  }

  private async finishActiveSessionAtEnd(session: any) {
    return this.finishActiveSessionAt(session, session.endsAt, {
      cancelOpenHuntBatch: true,
    });
  }

  private async finishActiveSessionAt(
    session: any,
    finishedAt: Date,
    options?: {
      cancelOpenHuntBatch?: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.claimSessionProcessingStep(tx, session, {
        status: AutoCombatSessionStatus.FINISHED,
        finishedAt,
        lastProcessedAt: finishedAt,
        currentMobId: null,
        currentMobHp: null,
        currentMobMaxHp: null,
        currentRound: 0,
      });

      if (options?.cancelOpenHuntBatch) {
        await tx.autoCombatHuntBatch.updateMany({
          where: {
            sessionId: session.id,
            status: {
              in: [
                AutoCombatHuntBatchStatus.HUNTING,
                AutoCombatHuntBatchStatus.READY,
              ],
            },
          },
          data: {
            status: AutoCombatHuntBatchStatus.CANCELLED,
            cancelledAt: finishedAt,
            lastProcessedAt: finishedAt,
          },
        });
      }

      return {
        ...session,
        status: AutoCombatSessionStatus.FINISHED,
        finishedAt,
        lastProcessedAt: finishedAt,
        currentMobId: null,
        currentMobHp: null,
        currentMobMaxHp: null,
        currentRound: 0,
      };
    });
  }

  private async markHuntingSessionAsReady(
    session: any,
    huntBatch: any,
    readyAt: Date,
    message: string,
  ) {
    const updatedSession = await this.prisma.$transaction(async (tx) => {
      await this.claimAutoCombatPhaseTransition(
        tx,
        session,
        AutoCombatSessionPhase.ENCOUNTER_READY,
        {
          huntStoppedAt: readyAt,
          lastHuntProcessedAt: readyAt,
          lastProcessedAt: readyAt,
          currentMobId: null,
          currentMobHp: null,
          currentMobMaxHp: null,
          currentRound: 0,
        },
      );

      if (huntBatch?.id) {
        await this.claimHuntBatchStatusTransition(
          tx,
          huntBatch,
          AutoCombatHuntBatchStatus.READY,
          {
            stoppedAt: readyAt,
            lastProcessedAt: readyAt,
          },
        );
      }

      return tx.autoCombatSession.findUniqueOrThrow({
        where: {
          id: session.id,
        },
      });
    });

    const response = await this.buildSessionResponse(updatedSession.id, {
      message,
      processing: this.buildEmptyProcessingSummary(),
    });

    this.autoCombatGateway.emitSessionUpdated(session.characterId, response);
    this.autoCombatGateway.emitStatus(session.characterId, response);

    return response;
  }

  private buildBaseRealtimeProcessingResult(
    session: any,
    options?: {
      actionsAvailable?: number;
      processingLimited?: boolean;
    },
  ): RealtimeRoundResult {
    const equipmentItems = this.getEquipmentItems(session.character);
    const gatheringBonus = this.getGatheringBonus(session.character);
    const stats = calculateFullStats(
      session.character.class,
      equipmentItems,
      session.character.level,
      gatheringBonus,
    );

    const maxHp = stats.derivedCombatStats.maxHp;
    const currentHp = this.clampHp(session.character.currentHp ?? maxHp, maxHp);

    return {
      processedSeconds: 0,
      combatsResolved: 0,
      roundsResolved: 0,
      xpGained: 0,

      initialHp: currentHp,
      finalCurrentHp: currentHp,
      initialMaxHp: maxHp,
      finalMaxHp: maxHp,
      maxHpGained: 0,
      hpLost: 0,

      damageDealt: 0,
      damageTaken: 0,
      healingReceived: 0,
      healingFromPotions: 0,
      healingFromLevelUp: 0,
      healingFromRest: 0,
      totalHealingReceived: 0,
      hpChange: 0,
      hpLostNet: 0,
      hpRecoveredNet: 0,
      tookDamage: false,
      wasHealed: false,

      criticalHitsDealt: 0,
      criticalHitsTaken: 0,
      criticalBonusDamageDealt: 0,
      criticalBonusDamageTaken: 0,
      playerAttackAttempts: 0,
      mobAttackAttempts: 0,
      criticalRateDealt: 0,
      criticalRateTaken: 0,
      criticalDamageSharePercent: 0,
      dealtCritical: false,
      tookCritical: false,

      dodgesByPlayer: 0,
      dodgesByMob: 0,
      playerDodgeRate: 0,
      mobDodgeRate: 0,
      playerDodged: false,
      mobDodged: false,

      initialLevel: session.character.level,
      finalLevel: session.character.level,
      levelsGained: 0,
      leveledUp: false,

      potionsUsed: 0,
      potionItemId: null,
      potionItemName: null,
      potionTriggerPercent: null,
      potionQuantityBefore: null,
      potionQuantityAfter: null,
      potionQuantityRemaining: null,
      potionUsedQuantity: null,

      finalXp: session.character.xp,
      finalStatus: session.status,
      newLastProcessedAt: session.lastProcessedAt,
      finishedAt: session.finishedAt ?? null,

      currentMobId: session.currentMobId ?? null,
      currentMobHp: session.currentMobHp ?? null,
      currentMobMaxHp: session.currentMobMaxHp ?? null,
      killProgressSeconds: Number(session.killProgressSeconds) || 0,
      estimatedKillTimeSeconds: session.estimatedKillTimeSeconds ?? null,
      baseKillTimeSeconds: session.baseKillTimeSeconds ?? null,
      playerOffensivePower: session.playerOffensivePower ?? null,
      monsterRecommendedPower: session.monsterRecommendedPower ?? null,
      currentMobIndex: session.currentMobIndex ?? null,
      currentRound: session.currentRound ?? 0,
      currentCombatIndex: Math.max(1, session.currentCombatIndex ?? 1),

      loots: new Map(),
      mobSummaries: new Map(),

      events: [],
      catchUp: (options?.actionsAvailable ?? 0) > 1,
      actionsAvailable: options?.actionsAvailable ?? 0,
      actionsProcessed: 0,
      processingLimited: options?.processingLimited ?? false,
      eventsEmitted: 0,
      eventsSuppressed: 0,
    };
  }

  private mergeProcessedWaitAction(
    aggregate: RealtimeRoundResult,
    session: any,
    nextLastProcessedAt: Date,
  ): RealtimeRoundResult {
    const processedSeconds = Math.max(
      0,
      Math.floor(
        (nextLastProcessedAt.getTime() - session.lastProcessedAt.getTime()) /
          1000,
      ),
    );

    return {
      ...aggregate,
      processedSeconds: aggregate.processedSeconds + processedSeconds,
      newLastProcessedAt: nextLastProcessedAt,
      currentMobId: session.currentMobId ?? null,
      currentMobHp: session.currentMobHp ?? null,
      currentMobMaxHp: session.currentMobMaxHp ?? null,
      currentRound: session.currentRound ?? 0,
      currentCombatIndex: Math.max(1, session.currentCombatIndex ?? 1),
    };
  }

  private appendRealtimeEventsWithLimit(
    currentEvents: AutoCombatRealtimeEvent[],
    newEvents: AutoCombatRealtimeEvent[],
  ) {
    return [...currentEvents, ...newEvents].slice(
      -AUTO_COMBAT_MAX_REALTIME_EVENTS_TO_EMIT,
    );
  }

  private shouldEmitRealtimeEventsForProcessingResult(
    result: RealtimeRoundResult,
  ) {
    const actionsAvailable = Math.max(
      0,
      Math.floor(result.actionsAvailable ?? 0),
    );

    const actionsProcessed = Math.max(
      0,
      Math.floor(result.actionsProcessed ?? 0),
    );

    /**
     * Eventos realtime devem representar apenas o combate que o jogador esta
     * vendo. Quando ha mais de uma acao pendente, o backend esta fazendo
     * catch-up de tempo acumulado; nesse caso persistimos e atualizamos o
     * snapshot, mas nao reencenamos mortes/loot/EXP antigos no card do mob.
     */
    return (
      actionsAvailable <= 1 &&
      actionsProcessed <= 1 &&
      result.combatsResolved <= 1 &&
      !result.processingLimited
    );
  }

  private mergeRealtimeRoundResults(
    aggregate: RealtimeRoundResult,
    result: RealtimeRoundResult,
  ): RealtimeRoundResult {
    const combinedEventCount = aggregate.events.length + result.events.length;
    const nextEvents = this.appendRealtimeEventsWithLimit(
      aggregate.events,
      result.events,
    );
    const suppressedNow = Math.max(0, combinedEventCount - nextEvents.length);

    for (const loot of result.loots.values()) {
      this.addLoot(aggregate.loots, loot.itemId, loot.quantity);
    }

    for (const summary of result.mobSummaries.values()) {
      const current = aggregate.mobSummaries.get(summary.mobId);

      aggregate.mobSummaries.set(summary.mobId, {
        mobId: summary.mobId,
        kills: (current?.kills ?? 0) + summary.kills,
        xpGained: (current?.xpGained ?? 0) + summary.xpGained,
      });
    }

    const playerAttackAttempts =
      aggregate.playerAttackAttempts + result.playerAttackAttempts;
    const mobAttackAttempts =
      aggregate.mobAttackAttempts + result.mobAttackAttempts;
    const criticalHitsDealt =
      aggregate.criticalHitsDealt + result.criticalHitsDealt;
    const criticalHitsTaken =
      aggregate.criticalHitsTaken + result.criticalHitsTaken;
    const criticalBonusDamageDealt =
      aggregate.criticalBonusDamageDealt + result.criticalBonusDamageDealt;
    const criticalBonusDamageTaken =
      aggregate.criticalBonusDamageTaken + result.criticalBonusDamageTaken;
    const damageDealt = aggregate.damageDealt + result.damageDealt;
    const dodgesByPlayer = aggregate.dodgesByPlayer + result.dodgesByPlayer;
    const dodgesByMob = aggregate.dodgesByMob + result.dodgesByMob;
    const healingFromPotions =
      aggregate.healingFromPotions + result.healingFromPotions;
    const healingFromLevelUp =
      aggregate.healingFromLevelUp + result.healingFromLevelUp;
    const healingFromRest = aggregate.healingFromRest + result.healingFromRest;
    const healingReceived =
      healingFromPotions + healingFromLevelUp + healingFromRest;
    const finalCurrentHp = result.finalCurrentHp;
    const hpChange = finalCurrentHp - aggregate.initialHp;
    const hpLostNet = Math.max(0, aggregate.initialHp - finalCurrentHp);
    const hpRecoveredNet = Math.max(0, finalCurrentHp - aggregate.initialHp);
    const levelsGained = Math.max(
      0,
      result.finalLevel - aggregate.initialLevel,
    );

    return {
      ...aggregate,
      processedSeconds: aggregate.processedSeconds + result.processedSeconds,
      combatsResolved: aggregate.combatsResolved + result.combatsResolved,
      roundsResolved: aggregate.roundsResolved + result.roundsResolved,
      xpGained: aggregate.xpGained + result.xpGained,

      finalCurrentHp,
      finalMaxHp: result.finalMaxHp,
      maxHpGained: Math.max(0, result.finalMaxHp - aggregate.initialMaxHp),
      hpLost: hpLostNet,

      damageDealt,
      damageTaken: aggregate.damageTaken + result.damageTaken,
      healingReceived,
      healingFromPotions,
      healingFromLevelUp,
      healingFromRest,
      totalHealingReceived: healingReceived,
      hpChange,
      hpLostNet,
      hpRecoveredNet,
      tookDamage: aggregate.tookDamage || result.tookDamage,
      wasHealed: aggregate.wasHealed || result.wasHealed,

      criticalHitsDealt,
      criticalHitsTaken,
      criticalBonusDamageDealt,
      criticalBonusDamageTaken,
      playerAttackAttempts,
      mobAttackAttempts,
      criticalRateDealt: this.calculatePercent(
        criticalHitsDealt,
        playerAttackAttempts,
      ),
      criticalRateTaken: this.calculatePercent(
        criticalHitsTaken,
        mobAttackAttempts,
      ),
      criticalDamageSharePercent: this.calculatePercent(
        criticalBonusDamageDealt,
        damageDealt,
      ),
      dealtCritical: aggregate.dealtCritical || result.dealtCritical,
      tookCritical: aggregate.tookCritical || result.tookCritical,

      dodgesByPlayer,
      dodgesByMob,
      playerDodgeRate: this.calculatePercent(dodgesByPlayer, mobAttackAttempts),
      mobDodgeRate: this.calculatePercent(dodgesByMob, playerAttackAttempts),
      playerDodged: aggregate.playerDodged || result.playerDodged,
      mobDodged: aggregate.mobDodged || result.mobDodged,

      finalLevel: result.finalLevel,
      levelsGained,
      leveledUp: levelsGained > 0,

      potionsUsed: aggregate.potionsUsed + result.potionsUsed,
      potionItemId:
        result.potionsUsed > 0 ? result.potionItemId : aggregate.potionItemId,
      potionItemName:
        result.potionsUsed > 0
          ? result.potionItemName
          : aggregate.potionItemName,
      potionTriggerPercent:
        result.potionsUsed > 0
          ? result.potionTriggerPercent
          : aggregate.potionTriggerPercent,
      potionQuantityBefore:
        result.potionsUsed > 0
          ? result.potionQuantityBefore
          : aggregate.potionQuantityBefore,
      potionQuantityAfter:
        result.potionsUsed > 0
          ? result.potionQuantityAfter
          : aggregate.potionQuantityAfter,
      potionQuantityRemaining:
        result.potionsUsed > 0
          ? result.potionQuantityRemaining
          : aggregate.potionQuantityRemaining,
      potionUsedQuantity:
        result.potionsUsed > 0
          ? result.potionUsedQuantity
          : aggregate.potionUsedQuantity,

      finalXp: result.finalXp,
      finalStatus: result.finalStatus,
      newLastProcessedAt: result.newLastProcessedAt,
      finishedAt: result.finishedAt,

      currentMobId: result.currentMobId,
      currentMobHp: result.currentMobHp,
      currentMobMaxHp: result.currentMobMaxHp,
      killProgressSeconds: result.killProgressSeconds ?? 0,
      estimatedKillTimeSeconds: result.estimatedKillTimeSeconds ?? null,
      baseKillTimeSeconds: result.baseKillTimeSeconds ?? null,
      playerOffensivePower: result.playerOffensivePower ?? null,
      monsterRecommendedPower: result.monsterRecommendedPower ?? null,
      currentMobIndex: result.currentMobIndex ?? null,
      currentRound: result.currentRound,
      currentCombatIndex: result.currentCombatIndex,

      events: nextEvents,
      eventsSuppressed: (aggregate.eventsSuppressed ?? 0) + suppressedNow,
    };
  }

  private applySpawnToSession(
    session: any,
    spawnResult: {
      session: any;
      event: AutoCombatRealtimeEvent;
      mob: any;
    },
    lastProcessedAt: Date,
  ) {
    return {
      ...session,
      ...spawnResult.session,
      currentMob: spawnResult.mob,
      currentMobId: spawnResult.mob.id,
      currentMobHp: spawnResult.session.currentMobHp ?? spawnResult.mob.hp,
      currentMobMaxHp:
        spawnResult.session.currentMobMaxHp ?? spawnResult.mob.hp,
      killProgressSeconds: spawnResult.session.killProgressSeconds ?? 0,
      estimatedKillTimeSeconds:
        spawnResult.session.estimatedKillTimeSeconds ?? null,
      baseKillTimeSeconds: spawnResult.session.baseKillTimeSeconds ?? null,
      playerOffensivePower: spawnResult.session.playerOffensivePower ?? null,
      monsterRecommendedPower:
        spawnResult.session.monsterRecommendedPower ?? null,
      currentMobIndex: spawnResult.session.currentMobIndex ?? null,
      currentRound: 0,
      lastProcessedAt,
    };
  }

  private applyRealtimeRoundResultToSession(
    session: any,
    result: RealtimeRoundResult,
  ) {
    const resultPhase = result.phase ?? session.phase;
    const nextSession = {
      ...session,
      status: result.finalStatus,
      phase: resultPhase,
      lastProcessedAt: result.newLastProcessedAt,
      finishedAt: result.finishedAt,
      currentMobId: result.currentMobId,
      currentMobHp: result.currentMobHp,
      currentMobMaxHp: result.currentMobMaxHp,
      killProgressSeconds: result.killProgressSeconds ?? 0,
      estimatedKillTimeSeconds: result.estimatedKillTimeSeconds ?? null,
      baseKillTimeSeconds: result.baseKillTimeSeconds ?? null,
      playerOffensivePower: result.playerOffensivePower ?? null,
      monsterRecommendedPower: result.monsterRecommendedPower ?? null,
      currentMobIndex: result.currentMobIndex ?? null,
      currentRound: result.currentRound,
      currentCombatIndex: result.currentCombatIndex,
      battleTargetRemaining:
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
          ? (result.battleTargetRemaining ?? session.battleTargetRemaining ?? 0)
          : 0,
      battleTargetTotal:
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
          ? (session.battleTargetTotal ?? 0)
          : 0,
      battleTargetMobId:
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
          ? (session.battleTargetMobId ?? null)
          : null,
      battleTargetEncounterId:
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
          ? (session.battleTargetEncounterId ?? null)
          : null,
      selectedEncounterId:
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
          ? (session.selectedEncounterId ?? null)
          : null,
      selectedEncounterMobId:
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
          ? (session.selectedEncounterMobId ?? null)
          : null,
      totalCombatsResolved:
        (session.totalCombatsResolved ?? 0) + result.combatsResolved,
      totalRoundsResolved:
        (session.totalRoundsResolved ?? 0) + result.roundsResolved,
      totalXpGained: (session.totalXpGained ?? 0) + result.xpGained,
      totalPotionsUsed: (session.totalPotionsUsed ?? 0) + result.potionsUsed,
      character: {
        ...session.character,
        xp: result.finalXp,
        level: result.finalLevel,
        currentHp: result.finalCurrentHp,
        maxHp: result.finalMaxHp,
        inventoryItems: this.applyPotionUsageToInventoryItems(
          session.character.inventoryItems ?? [],
          result,
        ),
      },
      loots: this.applyLootResultToSessionLoots(session.loots ?? [], result),
      events: result.events.length > 0 ? result.events : (session.events ?? []),
    };

    if (session.huntBatch?.mobs?.length) {
      const terminalHuntBatchUpdateData = this.buildTerminalHuntBatchUpdateData(
        session,
        result,
      );
      const hasTerminalHuntBatchUpdate = Boolean(terminalHuntBatchUpdateData);
      const shouldMarkHuntBatchReady =
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.ENCOUNTER_READY;
      nextSession.huntBatch = {
        ...session.huntBatch,
        status:
          terminalHuntBatchUpdateData?.status ??
          (shouldMarkHuntBatchReady
            ? AutoCombatHuntBatchStatus.READY
            : session.huntBatch.status),
        consumedAt: hasTerminalHuntBatchUpdate
          ? terminalHuntBatchUpdateData?.consumedAt
          : shouldMarkHuntBatchReady
            ? null
            : session.huntBatch.consumedAt,
        cancelledAt: hasTerminalHuntBatchUpdate
          ? terminalHuntBatchUpdateData?.cancelledAt
          : session.huntBatch.cancelledAt,
        lastProcessedAt:
          terminalHuntBatchUpdateData?.lastProcessedAt ??
          (shouldMarkHuntBatchReady
            ? result.newLastProcessedAt
            : session.huntBatch.lastProcessedAt),
        mobs: this.applyMobSummaryResultToHuntBatchMobs(
          session.huntBatch.mobs,
          result,
        ),
      };
    }

    if (!result.currentMobId) {
      nextSession.currentMob = null;
    }

    return nextSession;
  }

  private applyPotionUsageToInventoryItems(
    inventoryItems: any[],
    result: RealtimeRoundResult,
  ) {
    if (result.potionsUsed <= 0 || !result.potionItemId) {
      return inventoryItems;
    }

    return inventoryItems
      .map((inventoryItem) => {
        if (inventoryItem.itemId !== result.potionItemId) {
          return inventoryItem;
        }

        return {
          ...inventoryItem,
          quantity: Math.max(0, inventoryItem.quantity - result.potionsUsed),
        };
      })
      .filter((inventoryItem) => inventoryItem.quantity > 0);
  }

  private applyLootResultToSessionLoots(
    sessionLoots: any[],
    result: RealtimeRoundResult,
  ) {
    const lootByItemId = new Map<string, any>();

    for (const loot of sessionLoots) {
      lootByItemId.set(loot.itemId, { ...loot });
    }

    for (const loot of result.loots.values()) {
      const current = lootByItemId.get(loot.itemId);

      lootByItemId.set(loot.itemId, {
        ...(current ?? {
          itemId: loot.itemId,
        }),
        quantity: (current?.quantity ?? 0) + loot.quantity,
      });
    }

    return Array.from(lootByItemId.values());
  }

  private applyMobSummaryResultToHuntBatchMobs(
    huntBatchMobs: any[],
    result: RealtimeRoundResult,
  ) {
    if (result.mobSummaries.size <= 0) {
      return huntBatchMobs;
    }

    return huntBatchMobs.map((huntBatchMob) => {
      const summary = result.mobSummaries.get(huntBatchMob.mobId);
      const kills = Math.max(0, Math.floor(Number(summary?.kills) || 0));

      if (kills <= 0) {
        return huntBatchMob;
      }

      return {
        ...huntBatchMob,
        remainingCount: Math.max(
          0,
          Math.floor(Number(huntBatchMob.remainingCount) || 0) - kills,
        ),
      };
    });
  }

  private getProcessingResultMessage(result: RealtimeRoundResult) {
    if (result.finalStatus === AutoCombatSessionStatus.DEFEATED) {
      return 'Sessão encerrada: o personagem foi derrotado.';
    }

    if (result.finalStatus === AutoCombatSessionStatus.FINISHED) {
      return 'Sessão finalizada com sucesso.';
    }

    if ((result.actionsProcessed ?? 0) > 1) {
      return `Auto-combate sincronizado: ${result.actionsProcessed} ações processadas.`;
    }

    if (result.combatsResolved > 0) {
      return 'Infectado abatido. Próxima ameaça localizada.';
    }

    if ((result.actionsProcessed ?? 0) > 0 && result.roundsResolved <= 0) {
      return result.currentMobId
        ? 'Combate em andamento.'
        : 'Novo infectado encontrado.';
    }

    return 'Rodada processada em tempo real.';
  }

  private resolveTtkRealtimeRound(session: any): RealtimeRoundResult {
    const loots: LootAccumulator = new Map();
    const mobSummaries: MobSummaryAccumulator = new Map();
    const events: AutoCombatRealtimeEvent[] = [];
    const premiumActive = isPremiumActive(session.character.user);
    const currentMob = session.currentMob;

    if (!currentMob) {
      throw new BadRequestException('Nenhum monstro atual na sessao.');
    }

    const equipmentItems = this.getEquipmentItems(session.character);
    const gatheringBonus = this.getGatheringBonus(session.character);
    const combatGatheringBonus = scaleAutoCombatGatheringBonus(gatheringBonus);
    const fullStats = calculateFullStats(
      session.character.class,
      equipmentItems,
      session.character.level,
      gatheringBonus,
    );
    const combatStats = calculateFullStats(
      session.character.class,
      equipmentItems,
      session.character.level,
      combatGatheringBonus,
    );
    const className = session.character.class?.name ?? null;
    const initialLevel = session.character.level;
    const initialXp = session.character.xp;
    const initialMaxHp = fullStats.derivedCombatStats.maxHp;
    const initialHp = this.clampHp(
      session.character.currentHp ?? initialMaxHp,
      initialMaxHp,
    );
    const playerStats: FighterStats = {
      name: session.character.name,
      className,
      hp: initialHp,
      maxHp: initialMaxHp,
      attack: combatStats.derivedCombatStats.attack,
      defense: combatStats.derivedCombatStats.defense,
      speed: combatStats.derivedCombatStats.speed,
      precision: combatStats.totalPrimaryStats.precision,
      technique: combatStats.totalPrimaryStats.technique,
      agility: combatStats.totalPrimaryStats.agility,
    };
    const ttk = calculateAutoCombatTtk({
      mob: currentMob,
      playerStats,
    });
    const estimatedKillTimeSeconds = Math.max(
      0.001,
      ttk.estimatedKillTimeSeconds,
    );
    const effectiveNow = new Date(
      Math.min(Date.now(), session.endsAt.getTime()),
    );
    const elapsedSeconds = Math.max(
      0,
      (effectiveNow.getTime() - session.lastProcessedAt.getTime()) / 1000,
    );
    const progressBefore = Math.max(
      0,
      Number(session.killProgressSeconds) || 0,
    );
    const rawProgressSeconds = progressBefore + elapsedSeconds;
    const possibleKills = Math.max(
      0,
      Math.floor(rawProgressSeconds / estimatedKillTimeSeconds),
    );
    const battleTargetRemaining = Math.max(
      0,
      Math.floor(Number(session.battleTargetRemaining) || 0),
    );
    const currentTrackedMob = (session.huntBatch?.mobs ?? []).find(
      (entry: any) => entry.mobId === currentMob.id,
    );
    const trackedMobRemaining = currentTrackedMob
      ? Math.max(0, Math.floor(Number(currentTrackedMob.remainingCount) || 0))
      : null;
    const killLimit =
      battleTargetRemaining > 0
        ? battleTargetRemaining
        : trackedMobRemaining !== null
          ? trackedMobRemaining
          : AUTO_COMBAT_MAX_COMBATS_PER_PROCESS;
    const plannedKills = Math.min(
      possibleKills,
      killLimit,
      AUTO_COMBAT_MAX_COMBATS_PER_PROCESS,
    );
    const currentRound = (session.currentRound ?? 0) + 1;
    const currentCombatIndex = Math.max(1, session.currentCombatIndex ?? 1);
    const totalCombatsBeforeRound = session.totalCombatsResolved ?? 0;
    const totalRoundsBeforeRound = session.totalRoundsResolved ?? 0;
    const totalXpBeforeRound = session.totalXpGained ?? 0;
    const totalPotionsUsedBeforeRound = session.totalPotionsUsed ?? 0;
    let totalRoundsAfterRound = totalRoundsBeforeRound;
    const previousLootTotal = (session.loots ?? []).reduce(
      (total: number, loot: { quantity: number }) => total + loot.quantity,
      0,
    );
    const context: CombatRealtimeContext = {
      characterId: session.characterId,
      sessionId: session.id,
      mobId: currentMob.id,
      mobName: currentMob.name,
      combatIndex: currentCombatIndex,
      enemyInstanceId: this.buildEnemyInstanceId({
        sessionId: session.id,
        combatIndex: currentCombatIndex,
        mobId: currentMob.id,
      }),
    };

    let simulatedLevel = initialLevel;
    let simulatedXp = initialXp;
    let simulatedMaxHp = initialMaxHp;
    let playerHp = initialHp;
    let xpGained = 0;
    let levelsGained = 0;
    let baseXpGained = 0;
    let premiumBonusXp = 0;
    let premiumPotentialBonusXp = 0;
    let premiumTotalXp = 0;
    let killsResolved = 0;
    let damageTaken = 0;
    let healingFromPotions = 0;
    let healingFromLevelUp = 0;
    let criticalHitsTaken = 0;
    let criticalBonusDamageTaken = 0;
    let mobAttackAttempts = 0;
    let dodgesByPlayer = 0;

    const mobStats: FighterStats = {
      ...this.calculateAutoCombatMobFighterStats(currentMob, className),
      hp: currentMob.hp,
      maxHp: currentMob.hp,
    };
    const autoPotionState = this.createAutoPotionState(session.character);
    const projectedPotionHealAmount = autoPotionState
      ? applyAutoCombatPotionHealMultiplier({
          healAmount: this.calculateHealAmount({
            maxHp: initialMaxHp,
            healFlat: autoPotionState.healFlat,
            healPercent: autoPotionState.healPercent,
          }),
          className,
        })
      : 0;
    const xpRiskProjection =
      plannedKills > 0
        ? projectAutoCombatSurvival({
            currentHp: initialHp,
            maxHp: initialMaxHp,
            playerDefense: playerStats.defense,
            playerAgility: playerStats.agility,
            mobAttack: mobStats.attack,
            mobPrecision: mobStats.precision,
            mobTechnique: mobStats.technique,
            projectedKills: plannedKills,
            potion: autoPotionState
              ? {
                  availableQuantity: autoPotionState.availableQuantity,
                  healAmount: projectedPotionHealAmount,
                  hpThresholdPercent: autoPotionState.hpThresholdPercent,
                }
              : null,
          })
        : null;
    const xpRiskLevel = xpRiskProjection?.riskLevel ?? 'LOW';
    let lastPotionQuantityBefore: number | null = null;
    let lastPotionQuantityAfter: number | null = null;
    let lastPotionUsedQuantity: number | null = null;

    const getNewLootTotal = () =>
      Array.from(loots.values()).reduce(
        (total, loot) => total + loot.quantity,
        0,
      );
    const getTotalLootNow = () => previousLootTotal + getNewLootTotal();

    const tryPotionForCombat = (combatIndex: number) => {
      const potionCombatKey = this.getPotionCombatKey(session.id, combatIndex);

      if (this.potionUsageByCombat.has(potionCombatKey)) {
        return;
      }

      const potionResult = this.tryUseAutoPotion({
        currentHp: playerHp,
        maxHp: simulatedMaxHp,
        autoPotionState,
        potionUsedThisCombat: false,
        className,
      });

      if (!potionResult.used) {
        return;
      }

      this.potionUsageByCombat.add(potionCombatKey);
      const playerHpBeforePotion = playerHp;

      playerHp = potionResult.newHp;
      healingFromPotions += potionResult.healedAmount;
      lastPotionQuantityBefore = potionResult.quantityBefore;
      lastPotionQuantityAfter = potionResult.quantityAfter;
      lastPotionUsedQuantity = potionResult.usedQuantity;

      const totalPotionsAfterUse =
        totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0);
      const potionEventContext: CombatRealtimeContext = {
        ...context,
        combatIndex,
        enemyInstanceId: this.buildEnemyInstanceId({
          sessionId: session.id,
          combatIndex,
          mobId: currentMob.id,
        }),
      };

      events.push(
        this.buildRealtimeEvent({
          context: potionEventContext,
          type: 'POTION_USED',
          actor: 'PLAYER',
          target: 'PLAYER',
          message: `${session.character.name} usou ${
            autoPotionState?.potionItemName ?? 'uma poção'
          } após o ciclo e recuperou ${potionResult.healedAmount} HP.`,
          mobCurrentHp: 0,
          mobMaxHp: currentMob.hp,
          battleProgressSeconds: 0,
          battleProgressPercent: 0,
          estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
          baseKillTimeSeconds: ttk.baseKillTimeSeconds,
          playerOffensivePower: ttk.playerOffensivePower,
          monsterRecommendedPower: ttk.monsterRecommendedPower,
          killsPerMinute: ttk.killsPerMinute,
          killsPerHour: ttk.killsPerHour,
          difficultyLabel: ttk.difficultyLabel,
          mobIndex: ttk.mobIndex,
          battleTargetMobId: session.battleTargetMobId ?? currentMob.id,
          battleTargetEncounterId: session.battleTargetEncounterId ?? null,
          battleTargetTotal: session.battleTargetTotal ?? null,
          battleTargetRemaining: Math.max(
            0,
            Math.floor(Number(session.battleTargetRemaining) || 0) -
              killsResolved,
          ),
          characterCurrentHp: playerHp,
          characterMaxHp: simulatedMaxHp,
          damage: 0,
          healedAmount: potionResult.healedAmount,
          isCritical: false,
          isDodged: false,
          hpBefore: playerHpBeforePotion,
          hpAfter: playerHp,
          targetHpBefore: playerHpBeforePotion,
          targetHpAfter: playerHp,
          mobHpBefore: 0,
          mobHpAfter: 0,
          characterHpBefore: playerHpBeforePotion,
          characterHpAfter: playerHp,
          phase: 'WAITING_NEXT_ROUND',
          nextActor: 'SYSTEM',
          nextActionAt: effectiveNow,
          totalCombats: totalCombatsBeforeRound + killsResolved,
          totalRounds: totalRoundsBeforeRound + killsResolved,
          totalKills: totalCombatsBeforeRound + killsResolved,
          totalXpGained: totalXpBeforeRound + xpGained,
          totalLoot: getTotalLootNow(),
          potionsUsed: totalPotionsAfterUse,
          potionItemId: autoPotionState?.potionItemId ?? null,
          potionItemName: autoPotionState?.potionItemName ?? null,
          potionTriggerPercent: autoPotionState?.hpThresholdPercent ?? null,
          potionQuantityBefore: potionResult.quantityBefore,
          potionQuantityAfter: potionResult.quantityAfter,
          potionQuantityRemaining: potionResult.quantityAfter,
          potionUsedQuantity: potionResult.usedQuantity,
          round: currentRound,
          combatIndex,
        }),
      );
    };

    for (let killIndex = 0; killIndex < plannedKills; killIndex++) {
      const penalty = calculateTierFarmPenalty(simulatedLevel, currentMob.tier);
      const baseXpReward = applyXpPenalty(
        currentMob.xpReward,
        penalty.xpMultiplier,
      );
      const balancedBaseXpReward = applyAutoCombatXpEfficiency({
        baseXp: baseXpReward,
        className,
        riskLevel: xpRiskLevel,
      });
      const xpBreakdown = calculatePremiumXpBreakdown(
        balancedBaseXpReward,
        premiumActive,
      );
      const finalXpReward = xpBreakdown.totalXp;
      const levelProgress = calculateLevelProgress(
        simulatedLevel,
        simulatedXp,
        finalXpReward,
      );
      const oldLevelBeforeReward = simulatedLevel;
      const oldMaxHpBeforeReward = simulatedMaxHp;

      simulatedLevel = levelProgress.newLevel;
      simulatedXp = levelProgress.totalXp;

      const gainedLevelsNow = Math.max(
        0,
        simulatedLevel - oldLevelBeforeReward,
      );

      levelsGained += gainedLevelsNow;

      if (gainedLevelsNow > 0) {
        const newStatsAfterLevelUp = calculateFullStats(
          session.character.class,
          equipmentItems,
          simulatedLevel,
          gatheringBonus,
        );
        const newCombatStatsAfterLevelUp = calculateFullStats(
          session.character.class,
          equipmentItems,
          simulatedLevel,
          combatGatheringBonus,
        );
        const newMaxHpAfterLevelUp =
          newStatsAfterLevelUp.derivedCombatStats.maxHp;
        const hpBeforeLevelUpRecovery = playerHp;

        playerHp = this.calculateCurrentHpAfterLevelUp({
          currentHp: playerHp,
          oldMaxHp: oldMaxHpBeforeReward,
          newMaxHp: newMaxHpAfterLevelUp,
          levelsGained: gainedLevelsNow,
        });
        simulatedMaxHp = newMaxHpAfterLevelUp;
        playerStats.maxHp = simulatedMaxHp;
        playerStats.hp = playerHp;
        playerStats.attack =
          newCombatStatsAfterLevelUp.derivedCombatStats.attack;
        playerStats.defense =
          newCombatStatsAfterLevelUp.derivedCombatStats.defense;
        playerStats.speed = newCombatStatsAfterLevelUp.derivedCombatStats.speed;
        playerStats.precision =
          newCombatStatsAfterLevelUp.totalPrimaryStats.precision;
        playerStats.technique =
          newCombatStatsAfterLevelUp.totalPrimaryStats.technique;
        playerStats.agility =
          newCombatStatsAfterLevelUp.totalPrimaryStats.agility;
        healingFromLevelUp += Math.max(0, playerHp - hpBeforeLevelUpRecovery);
      }

      xpGained += finalXpReward;
      baseXpGained += xpBreakdown.baseXp;
      premiumBonusXp += xpBreakdown.premiumBonusXp;
      premiumPotentialBonusXp += xpBreakdown.premiumPotentialBonusXp;
      premiumTotalXp += xpBreakdown.premiumTotalXp;

      this.addMobSummary(mobSummaries, currentMob.id, finalXpReward);

      for (const drop of currentMob.drops ?? []) {
        const dropMultiplier = getDropMultiplierByItemSlot(
          drop.item.slot,
          penalty,
        );
        const finalDropChance = applyDropChancePenalty(
          drop.dropChance,
          dropMultiplier,
        );
        const roll = Math.floor(Math.random() * 100) + 1;

        if (roll <= finalDropChance) {
          this.addLoot(
            loots,
            drop.itemId,
            this.randomBetween(drop.minQuantity, drop.maxQuantity),
          );
        }
      }

      killsResolved++;

      if (playerHp > 0) {
        const attack = this.resolveAttack({
          attacker: mobStats,
          defender: playerStats,
          targetCurrentHp: playerHp,
          targetMaxHp: simulatedMaxHp,
        });

        mobAttackAttempts++;
        playerHp = attack.nextTargetHp;
        playerStats.hp = playerHp;
        damageTaken += attack.damage;

        if (attack.isDodged) {
          dodgesByPlayer++;
        } else if (attack.isCritical) {
          criticalHitsTaken++;
          criticalBonusDamageTaken += attack.criticalBonusDamage;
        }

        if (playerHp > 0) {
          tryPotionForCombat(currentCombatIndex + killIndex);
          playerStats.hp = playerHp;
        }
      }

      if (playerHp <= 0) {
        playerHp = 0;
        break;
      }
    }

    const hitKillLimit =
      possibleKills > 0 && killsResolved > 0 && killsResolved >= killLimit;
    const playerDefeated = playerHp <= 0;
    const remainingProgressSeconds =
      playerDefeated || hitKillLimit
        ? 0
        : Math.max(
            0,
            rawProgressSeconds - killsResolved * estimatedKillTimeSeconds,
          );
    const progressPercent = this.calculatePercent(
      Math.min(remainingProgressSeconds, estimatedKillTimeSeconds),
      estimatedKillTimeSeconds,
    );
    totalRoundsAfterRound = totalRoundsBeforeRound + killsResolved;

    const activeBattleTargetRemaining =
      battleTargetRemaining > 0 ? battleTargetRemaining : null;
    const battleTargetRemainingAfterKill =
      killsResolved > 0
        ? this.getBattleTargetRemainingAfterKill(
            session,
            currentMob.id,
            killsResolved,
          )
        : activeBattleTargetRemaining;
    const trackedEnemiesRemainingAfterKill =
      killsResolved > 0
        ? this.getTrackedEnemiesRemainingAfterKill(
            session,
            currentMob.id,
            killsResolved,
          )
        : this.getTrackedEnemiesRemaining(session);
    const shouldCompleteBattleSelection =
      battleTargetRemainingAfterKill !== null &&
      battleTargetRemainingAfterKill <= 0;
    const shouldFinishTrackedQueue =
      trackedEnemiesRemainingAfterKill !== null &&
      trackedEnemiesRemainingAfterKill <= 0;
    const sessionShouldFinish =
      effectiveNow.getTime() >= session.endsAt.getTime();
    let finalStatus: AutoCombatSessionStatus = AutoCombatSessionStatus.ACTIVE;
    let nextPhase: AutoCombatSessionPhase = session.phase;
    let finishedAt: Date | null = null;
    let nextCurrentMobId: string | null = currentMob.id;
    let nextCurrentMobHp: number | null = currentMob.hp;
    let nextCurrentMobMaxHp: number | null = currentMob.hp;
    const nextCombatIndex = currentCombatIndex + killsResolved;
    let nextCurrentRound = currentRound;
    const nextBattleTargetRemaining =
      battleTargetRemainingAfterKill ?? battleTargetRemaining;
    let nextKillProgressSeconds = remainingProgressSeconds;

    if (playerDefeated) {
      finalStatus = AutoCombatSessionStatus.DEFEATED;
      finishedAt = effectiveNow;
      nextCurrentMobId = null;
      nextCurrentMobHp = null;
      nextCurrentMobMaxHp = null;
      nextCurrentRound = 0;
      nextKillProgressSeconds = 0;
    } else if (sessionShouldFinish || shouldFinishTrackedQueue) {
      finalStatus = AutoCombatSessionStatus.FINISHED;
      finishedAt = sessionShouldFinish ? session.endsAt : effectiveNow;
      nextCurrentMobId = null;
      nextCurrentMobHp = null;
      nextCurrentMobMaxHp = null;
      nextCurrentRound = 0;
      nextKillProgressSeconds = 0;
    } else if (shouldCompleteBattleSelection) {
      nextPhase = AutoCombatSessionPhase.ENCOUNTER_READY;
      nextCurrentMobId = null;
      nextCurrentMobHp = null;
      nextCurrentMobMaxHp = null;
      nextCurrentRound = 0;
      nextKillProgressSeconds = 0;
    }

    if (killsResolved > 0) {
      const realtimeXpPayload = this.buildCharacterXpPayload(
        simulatedLevel,
        simulatedXp,
      );
      const totalKillsAfterKill = totalCombatsBeforeRound + killsResolved;
      const totalXpAfterKill = totalXpBeforeRound + xpGained;

      events.push(
        this.buildRealtimeEvent({
          context,
          type: 'MOB_DEFEATED',
          actor: 'PLAYER',
          target: 'MOB',
          message:
            killsResolved === 1
              ? `${currentMob.name} foi abatido. +${xpGained} XP.`
              : `${killsResolved}x ${currentMob.name} foram abatidos. +${xpGained} XP.`,
          mobCurrentHp: 0,
          mobMaxHp: currentMob.hp,
          battleProgressSeconds: nextKillProgressSeconds,
          battleProgressPercent: progressPercent,
          estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
          baseKillTimeSeconds: ttk.baseKillTimeSeconds,
          playerOffensivePower: ttk.playerOffensivePower,
          monsterRecommendedPower: ttk.monsterRecommendedPower,
          killsPerMinute: ttk.killsPerMinute,
          killsPerHour: ttk.killsPerHour,
          difficultyLabel: ttk.difficultyLabel,
          mobIndex: ttk.mobIndex,
          battleTargetMobId: session.battleTargetMobId ?? currentMob.id,
          battleTargetEncounterId: session.battleTargetEncounterId ?? null,
          battleTargetTotal: session.battleTargetTotal ?? null,
          battleTargetRemaining: nextBattleTargetRemaining,
          characterCurrentHp: playerHp,
          characterMaxHp: simulatedMaxHp,
          damage: 0,
          isCritical: false,
          isDodged: false,
          hpBefore: null,
          hpAfter: 0,
          targetHpBefore: null,
          targetHpAfter: 0,
          mobHpBefore: null,
          mobHpAfter: 0,
          characterHpBefore: null,
          characterHpAfter: playerHp,
          phase: 'MOB_DEFEATED',
          nextActor:
            finalStatus === AutoCombatSessionStatus.ACTIVE &&
            nextPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
              ? 'PLAYER'
              : 'SYSTEM',
          nextActionAt:
            finalStatus === AutoCombatSessionStatus.ACTIVE
              ? effectiveNow
              : null,
          xpGained,
          baseXpGained,
          premiumBonusXp,
          premiumPotentialBonusXp,
          premiumTotalXp,
          isPremiumActive: premiumActive,
          characterXp: simulatedXp,
          characterLevel: simulatedLevel,
          ...realtimeXpPayload,
          leveledUp: levelsGained > 0,
          levelsGained,
          totalCombats: totalKillsAfterKill,
          totalRounds: totalRoundsAfterRound,
          totalKills: totalKillsAfterKill,
          totalXpGained: totalXpAfterKill,
          totalLoot: getTotalLootNow(),
          potionsUsed:
            totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0),
          round: currentRound,
          combatIndex: currentCombatIndex,
        }),
      );
    }

    if (playerDefeated) {
      const defeatXpPayload = this.buildCharacterXpPayload(
        simulatedLevel,
        simulatedXp,
      );

      events.push(
        this.buildRealtimeEvent({
          context,
          type: 'PLAYER_DEFEATED',
          actor: 'MOB',
          target: 'PLAYER',
          message: `${session.character.name} foi derrotado por ${currentMob.name}.`,
          mobCurrentHp: 0,
          mobMaxHp: currentMob.hp,
          battleProgressSeconds: 0,
          battleProgressPercent: 0,
          estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
          baseKillTimeSeconds: ttk.baseKillTimeSeconds,
          playerOffensivePower: ttk.playerOffensivePower,
          monsterRecommendedPower: ttk.monsterRecommendedPower,
          killsPerMinute: ttk.killsPerMinute,
          killsPerHour: ttk.killsPerHour,
          difficultyLabel: ttk.difficultyLabel,
          mobIndex: ttk.mobIndex,
          characterCurrentHp: 0,
          characterMaxHp: simulatedMaxHp,
          damage: 0,
          isCritical: false,
          isDodged: false,
          hpBefore: null,
          hpAfter: 0,
          targetHpBefore: null,
          targetHpAfter: 0,
          mobHpBefore: null,
          mobHpAfter: 0,
          characterHpBefore: null,
          characterHpAfter: 0,
          phase: 'PLAYER_DEFEATED',
          sessionStatus: AutoCombatSessionStatus.DEFEATED,
          endReason: 'PLAYER_DEFEATED',
          shouldRedirectToInfirmary: true,
          nextActor: null,
          nextActionAt: null,
          characterXp: simulatedXp,
          characterLevel: simulatedLevel,
          ...defeatXpPayload,
          totalCombats: totalCombatsBeforeRound + killsResolved,
          totalRounds: totalRoundsAfterRound,
          totalKills: totalCombatsBeforeRound + killsResolved,
          totalXpGained: totalXpBeforeRound + xpGained,
          totalLoot: getTotalLootNow(),
          potionsUsed:
            totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0),
          round: currentRound,
          combatIndex: currentCombatIndex,
        }),
      );
    }

    return {
      processedSeconds: elapsedSeconds,
      combatsResolved: killsResolved,
      roundsResolved: killsResolved,
      xpGained,

      initialHp,
      finalCurrentHp: playerHp,
      initialMaxHp,
      finalMaxHp: simulatedMaxHp,
      maxHpGained: Math.max(0, simulatedMaxHp - initialMaxHp),
      hpLost: Math.max(0, initialHp - playerHp),

      damageDealt: 0,
      damageTaken,
      healingReceived: healingFromPotions + healingFromLevelUp,
      healingFromPotions,
      healingFromLevelUp,
      healingFromRest: 0,
      totalHealingReceived: healingFromPotions + healingFromLevelUp,
      hpChange: playerHp - initialHp,
      hpLostNet: Math.max(0, initialHp - playerHp),
      hpRecoveredNet: Math.max(0, playerHp - initialHp),
      tookDamage: damageTaken > 0,
      wasHealed: healingFromPotions + healingFromLevelUp > 0,

      criticalHitsDealt: 0,
      criticalHitsTaken,
      criticalBonusDamageDealt: 0,
      criticalBonusDamageTaken,
      playerAttackAttempts: 0,
      mobAttackAttempts,
      criticalRateDealt: 0,
      criticalRateTaken: this.calculatePercent(
        criticalHitsTaken,
        mobAttackAttempts,
      ),
      criticalDamageSharePercent: 0,
      dealtCritical: false,
      tookCritical: criticalHitsTaken > 0,

      dodgesByPlayer,
      dodgesByMob: 0,
      playerDodgeRate: this.calculatePercent(dodgesByPlayer, mobAttackAttempts),
      mobDodgeRate: 0,
      playerDodged: dodgesByPlayer > 0,
      mobDodged: false,

      initialLevel,
      finalLevel: simulatedLevel,
      levelsGained,
      leveledUp: levelsGained > 0,

      potionsUsed: autoPotionState?.usedQuantity ?? 0,
      potionItemId: autoPotionState?.potionItemId ?? null,
      potionItemName: autoPotionState?.potionItemName ?? null,
      potionTriggerPercent: autoPotionState?.hpThresholdPercent ?? null,
      potionQuantityBefore: lastPotionQuantityBefore,
      potionQuantityAfter: lastPotionQuantityAfter,
      potionQuantityRemaining: autoPotionState?.availableQuantity ?? null,
      potionUsedQuantity: lastPotionUsedQuantity,

      finalXp: simulatedXp,
      finalStatus,
      phase: nextPhase,
      newLastProcessedAt:
        finalStatus !== AutoCombatSessionStatus.ACTIVE
          ? (finishedAt ?? session.endsAt)
          : effectiveNow,
      finishedAt,

      currentMobId: nextCurrentMobId,
      currentMobHp: nextCurrentMobHp,
      currentMobMaxHp: nextCurrentMobMaxHp,
      killProgressSeconds: nextKillProgressSeconds,
      estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
      baseKillTimeSeconds: ttk.baseKillTimeSeconds,
      playerOffensivePower: ttk.playerOffensivePower,
      monsterRecommendedPower: ttk.monsterRecommendedPower,
      currentMobIndex: ttk.mobIndex,
      currentRound: nextCurrentRound,
      currentCombatIndex: Math.max(1, nextCombatIndex),
      battleTargetRemaining: nextBattleTargetRemaining,

      loots,
      mobSummaries,

      events,
      actionsAvailable: 1,
      actionsProcessed: elapsedSeconds > 0 ? 1 : 0,
      processingLimited: possibleKills > killsResolved,
      eventsSuppressed:
        possibleKills > killsResolved ? possibleKills - killsResolved : 0,
    };
  }

  private resolveRealtimeRound(session: any): RealtimeRoundResult {
    const loots: LootAccumulator = new Map();
    const mobSummaries: MobSummaryAccumulator = new Map();
    const events: AutoCombatRealtimeEvent[] = [];
    const premiumActive = isPremiumActive(session.character.user);

    const currentMob = session.currentMob;

    if (!currentMob) {
      throw new BadRequestException('Nenhum monstro atual na sessão.');
    }

    const equipmentItems = this.getEquipmentItems(session.character);
    const gatheringBonus = this.getGatheringBonus(session.character);
    const combatGatheringBonus = scaleAutoCombatGatheringBonus(gatheringBonus);
    const className = session.character.class?.name ?? null;

    const initialStats = calculateFullStats(
      session.character.class,
      equipmentItems,
      session.character.level,
      gatheringBonus,
    );
    const initialCombatStats = calculateFullStats(
      session.character.class,
      equipmentItems,
      session.character.level,
      combatGatheringBonus,
    );

    const initialLevel = session.character.level;
    const initialXp = session.character.xp;
    const initialMaxHp = initialStats.derivedCombatStats.maxHp;
    const initialHp = this.clampHp(
      session.character.currentHp ?? initialMaxHp,
      initialMaxHp,
    );

    const currentMobMaxHp =
      session.currentMobMaxHp ?? session.currentMob?.hp ?? currentMob.hp;

    let playerHp = initialHp;
    let mobHp = this.clampHp(
      session.currentMobHp ?? currentMob.hp,
      currentMobMaxHp,
    );

    let simulatedLevel = initialLevel;
    let simulatedXp = initialXp;
    let simulatedMaxHp = initialMaxHp;

    let damageDealt = 0;
    let damageTaken = 0;
    let healingFromPotions = 0;
    let healingFromLevelUp = 0;

    let criticalHitsDealt = 0;
    let criticalHitsTaken = 0;
    let criticalBonusDamageDealt = 0;
    let criticalBonusDamageTaken = 0;

    let playerAttackAttempts = 0;
    let mobAttackAttempts = 0;

    let dodgesByPlayer = 0;
    let dodgesByMob = 0;

    let xpGained = 0;
    let combatsResolved = 0;
    let levelsGained = 0;

    const currentRound = (session.currentRound ?? 0) + 1;
    const currentCombatIndex = Math.max(1, session.currentCombatIndex ?? 1);

    const totalCombatsBeforeRound = session.totalCombatsResolved ?? 0;
    const totalRoundsBeforeRound = session.totalRoundsResolved ?? 0;
    const totalXpBeforeRound = session.totalXpGained ?? 0;
    const totalPotionsUsedBeforeRound = session.totalPotionsUsed ?? 0;

    const totalRoundsAfterRound = totalRoundsBeforeRound + 1;

    const previousLootTotal = (session.loots ?? []).reduce(
      (total: number, loot: { quantity: number }) => total + loot.quantity,
      0,
    );

    const context: CombatRealtimeContext = {
      characterId: session.characterId,
      sessionId: session.id,
      mobId: currentMob.id,
      mobName: currentMob.name,
      combatIndex: currentCombatIndex,
      enemyInstanceId: this.buildEnemyInstanceId({
        sessionId: session.id,
        combatIndex: currentCombatIndex,
        mobId: currentMob.id,
      }),
    };

    const playerStats: FighterStats = {
      name: session.character.name,
      className,
      hp: playerHp,
      maxHp: simulatedMaxHp,
      attack: initialCombatStats.derivedCombatStats.attack,
      defense: initialCombatStats.derivedCombatStats.defense,
      speed: initialCombatStats.derivedCombatStats.speed,
      precision: initialCombatStats.totalPrimaryStats.precision,
      technique: initialCombatStats.totalPrimaryStats.technique,
      agility: initialCombatStats.totalPrimaryStats.agility,
    };

    const mobStats: FighterStats = {
      ...this.calculateAutoCombatMobFighterStats(currentMob, className),
      hp: mobHp,
      maxHp: currentMobMaxHp,
    };

    const autoPotionState = this.createAutoPotionState(session.character);

    const potionCombatKey = this.getPotionCombatKey(
      session.id,
      currentCombatIndex,
    );

    let potionUsedThisCombat = this.potionUsageByCombat.has(potionCombatKey);

    let lastPotionQuantityBefore: number | null = null;
    let lastPotionQuantityAfter: number | null = null;
    let lastPotionUsedQuantity: number | null = null;

    const getNewLootTotal = () => {
      return Array.from(loots.values()).reduce(
        (total, loot) => total + loot.quantity,
        0,
      );
    };

    const getTotalLootNow = () => {
      return previousLootTotal + getNewLootTotal();
    };

    const effectiveRoundDurationSeconds = this.getEffectiveRoundDurationSeconds(
      session.roundDurationSeconds,
    );
    const roundActionStartedAt = this.addSeconds(
      session.lastProcessedAt,
      effectiveRoundDurationSeconds,
    );
    const roundNextActionAt = this.addSeconds(
      roundActionStartedAt,
      effectiveRoundDurationSeconds,
    );
    let roundActionOrder = 0;

    const pushEvent = (
      type: AutoCombatRealtimeEventType,
      payload: Partial<AutoCombatRealtimeEvent> = {},
    ) => {
      const resolvedTotalKills =
        payload.totalKills ?? totalCombatsBeforeRound + combatsResolved;

      const resolvedTotalCombats = payload.totalCombats ?? resolvedTotalKills;

      const resolvedTotalRounds = payload.totalRounds ?? totalRoundsAfterRound;

      const resolvedTotalXpGained =
        payload.totalXpGained ?? totalXpBeforeRound + xpGained;

      const resolvedTotalLoot = payload.totalLoot ?? getTotalLootNow();

      const resolvedPotionsUsed =
        payload.potionsUsed ??
        totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0);

      const resolvedRound = payload.round ?? currentRound;
      const resolvedCombatIndex = payload.combatIndex ?? currentCombatIndex;
      const resolvedActionOrder =
        payload.actionOrder !== null && payload.actionOrder !== undefined
          ? Math.max(1, Math.floor(Number(payload.actionOrder)))
          : ++roundActionOrder;
      const turnId =
        payload.turnId ??
        `${session.id}:${resolvedCombatIndex}:${resolvedRound}:${resolvedActionOrder}`;
      const actionId = payload.actionId ?? `${turnId}:${type}`;

      events.push(
        this.buildRealtimeEvent({
          context,
          type,
          message: payload.message ?? '',
          mobCurrentHp: payload.mobCurrentHp ?? mobHp,
          mobMaxHp: payload.mobMaxHp ?? currentMobMaxHp,
          characterCurrentHp: payload.characterCurrentHp ?? playerHp,
          characterMaxHp: payload.characterMaxHp ?? simulatedMaxHp,
          damage: payload.damage ?? 0,
          healedAmount: payload.healedAmount ?? 0,
          isCritical: payload.isCritical ?? false,
          isDodged: payload.isDodged ?? false,
          hpBefore: payload.hpBefore,
          hpAfter: payload.hpAfter,
          targetHpBefore: payload.targetHpBefore,
          targetHpAfter: payload.targetHpAfter,
          mobHpBefore: payload.mobHpBefore,
          mobHpAfter: payload.mobHpAfter,
          characterHpBefore: payload.characterHpBefore,
          characterHpAfter: payload.characterHpAfter,
          round: resolvedRound,
          combatIndex: resolvedCombatIndex,
          actor: payload.actor,
          target: payload.target,
          turnId,
          actionId,
          actionOrder: resolvedActionOrder,
          phase: payload.phase,
          sessionStatus: payload.sessionStatus,
          endReason: payload.endReason,
          shouldRedirectToInfirmary: payload.shouldRedirectToInfirmary,
          nextActor: payload.nextActor,
          actionStartedAt:
            payload.actionStartedAt !== undefined
              ? payload.actionStartedAt
              : roundActionStartedAt,
          nextActionAt:
            payload.nextActionAt !== undefined
              ? payload.nextActionAt
              : roundNextActionAt,
          mobId: payload.mobId,
          mobName: payload.mobName,
          xpGained: payload.xpGained,
          baseXpGained: payload.baseXpGained,
          premiumBonusXp: payload.premiumBonusXp,
          premiumPotentialBonusXp: payload.premiumPotentialBonusXp,
          premiumTotalXp: payload.premiumTotalXp,
          isPremiumActive: payload.isPremiumActive,
          characterXp: payload.characterXp,
          characterLevel: payload.characterLevel,
          totalXp: payload.totalXp,
          currentLevelXp: payload.currentLevelXp,
          xpToNextLevel: payload.xpToNextLevel,
          nextLevelXp: payload.nextLevelXp,
          xpProgressPercent: payload.xpProgressPercent,
          xpIntoCurrentLevel: payload.xpIntoCurrentLevel,
          xpNeededForNextLevel: payload.xpNeededForNextLevel,
          currentLevelStartXp: payload.currentLevelStartXp,
          nextLevelRequiredXp: payload.nextLevelRequiredXp,
          isAtLevelCap: payload.isAtLevelCap,
          levelProgress: payload.levelProgress,
          leveledUp: payload.leveledUp,
          levelsGained: payload.levelsGained,
          totalCombats: resolvedTotalCombats,
          totalRounds: resolvedTotalRounds,
          totalKills: resolvedTotalKills,
          totalXpGained: resolvedTotalXpGained,
          totalLoot: resolvedTotalLoot,
          potionsUsed: resolvedPotionsUsed,
          potionItemId: payload.potionItemId,
          potionItemName: payload.potionItemName,
          potionTriggerPercent: payload.potionTriggerPercent,
          potionQuantityBefore: payload.potionQuantityBefore,
          potionQuantityAfter: payload.potionQuantityAfter,
          potionQuantityRemaining: payload.potionQuantityRemaining,
          potionUsedQuantity: payload.potionUsedQuantity,
        }),
      );
    };

    const tryPotion = () => {
      if (potionUsedThisCombat) {
        return;
      }

      const potionResult = this.tryUseAutoPotion({
        currentHp: playerHp,
        maxHp: simulatedMaxHp,
        autoPotionState,
        potionUsedThisCombat,
        className,
      });

      if (!potionResult.used) {
        return;
      }

      potionUsedThisCombat = true;
      this.potionUsageByCombat.add(potionCombatKey);

      const playerHpBeforePotion = playerHp;
      playerHp = potionResult.newHp;
      healingFromPotions += potionResult.healedAmount;

      lastPotionQuantityBefore = potionResult.quantityBefore;
      lastPotionQuantityAfter = potionResult.quantityAfter;
      lastPotionUsedQuantity = potionResult.usedQuantity;

      const totalPotionsAfterUse =
        totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0);

      pushEvent('POTION_USED', {
        actor: 'PLAYER',
        target: 'PLAYER',
        message: `${session.character.name} usou ${
          autoPotionState?.potionItemName ?? 'uma poção'
        } e recuperou ${potionResult.healedAmount} HP.`,
        damage: 0,
        healedAmount: potionResult.healedAmount,
        characterCurrentHp: playerHp,
        mobCurrentHp: mobHp,
        hpBefore: playerHpBeforePotion,
        hpAfter: playerHp,
        targetHpBefore: playerHpBeforePotion,
        targetHpAfter: playerHp,
        characterHpBefore: playerHpBeforePotion,
        characterHpAfter: playerHp,
        mobHpBefore: mobHp,
        mobHpAfter: mobHp,
        phase: 'PLAYER_TURN',
        nextActor: 'PLAYER',
        totalCombats: totalCombatsBeforeRound,
        totalRounds: totalRoundsAfterRound,
        totalKills: totalCombatsBeforeRound,
        totalXpGained: totalXpBeforeRound + xpGained,
        totalLoot: getTotalLootNow(),
        potionsUsed: totalPotionsAfterUse,
        potionItemId: autoPotionState?.potionItemId ?? null,
        potionItemName: autoPotionState?.potionItemName ?? null,
        potionTriggerPercent: autoPotionState?.hpThresholdPercent ?? null,
        potionQuantityBefore: potionResult.quantityBefore,
        potionQuantityAfter: potionResult.quantityAfter,
        potionQuantityRemaining: potionResult.quantityAfter,
        potionUsedQuantity: potionResult.usedQuantity,
      });
    };

    const playerAttack = () => {
      if (playerHp <= 0 || mobHp <= 0) {
        return;
      }

      const playerHpBeforeAttack = playerHp;
      const mobHpBeforeAttack = mobHp;
      const attack = this.resolveAttack({
        attacker: playerStats,
        defender: mobStats,
        targetCurrentHp: mobHp,
        targetMaxHp: currentMobMaxHp,
      });

      playerAttackAttempts++;

      mobHp = attack.nextTargetHp;
      damageDealt += attack.damage;

      if (attack.isDodged) {
        dodgesByMob++;

        pushEvent('DODGE', {
          actor: 'PLAYER',
          target: 'MOB',
          message: `${currentMob.name} esquivou do ataque de ${session.character.name}.`,
          damage: 0,
          isCritical: false,
          isDodged: true,
          characterCurrentHp: playerHp,
          mobCurrentHp: mobHp,
          hpBefore: mobHpBeforeAttack,
          hpAfter: mobHp,
          targetHpBefore: mobHpBeforeAttack,
          targetHpAfter: mobHp,
          mobHpBefore: mobHpBeforeAttack,
          mobHpAfter: mobHp,
          characterHpBefore: playerHpBeforeAttack,
          characterHpAfter: playerHp,
          phase: 'PLAYER_TURN',
          nextActor: 'MOB',
        });

        return;
      }

      if (attack.isCritical) {
        criticalHitsDealt++;
        criticalBonusDamageDealt += attack.criticalBonusDamage;
      }

      pushEvent('PLAYER_HIT', {
        actor: 'PLAYER',
        target: 'MOB',
        message: attack.isCritical
          ? `${session.character.name} acertou um crítico em ${currentMob.name}.`
          : `${session.character.name} atingiu ${currentMob.name}.`,
        damage: attack.damage,
        isCritical: attack.isCritical,
        isDodged: false,
        characterCurrentHp: playerHp,
        mobCurrentHp: mobHp,
        hpBefore: mobHpBeforeAttack,
        hpAfter: mobHp,
        targetHpBefore: mobHpBeforeAttack,
        targetHpAfter: mobHp,
        mobHpBefore: mobHpBeforeAttack,
        mobHpAfter: mobHp,
        characterHpBefore: playerHpBeforeAttack,
        characterHpAfter: playerHp,
        phase: 'PLAYER_TURN',
        nextActor: mobHp > 0 ? 'MOB' : 'SYSTEM',
      });
    };

    const mobAttack = () => {
      if (playerHp <= 0 || mobHp <= 0) {
        return;
      }

      const hpBeforeAttack = playerHp;
      const mobHpBeforeAttack = mobHp;

      const attack = this.resolveAttack({
        attacker: mobStats,
        defender: playerStats,
        targetCurrentHp: playerHp,
        targetMaxHp: simulatedMaxHp,
      });

      mobAttackAttempts++;

      playerHp = attack.nextTargetHp;
      damageTaken += attack.damage;

      if (attack.isDodged) {
        dodgesByPlayer++;

        pushEvent('DODGE', {
          actor: 'MOB',
          target: 'PLAYER',
          message: `${session.character.name} esquivou do ataque de ${currentMob.name}.`,
          damage: 0,
          isCritical: false,
          isDodged: true,
          characterCurrentHp: playerHp,
          mobCurrentHp: mobHp,
          hpBefore: hpBeforeAttack,
          hpAfter: playerHp,
          targetHpBefore: hpBeforeAttack,
          targetHpAfter: playerHp,
          characterHpBefore: hpBeforeAttack,
          characterHpAfter: playerHp,
          mobHpBefore: mobHpBeforeAttack,
          mobHpAfter: mobHp,
          phase: 'MOB_TURN',
          nextActor: 'PLAYER',
        });

        if (playerHp > 0) {
          tryPotion();
        }

        return;
      }

      if (attack.isCritical) {
        criticalHitsTaken++;
        criticalBonusDamageTaken += attack.criticalBonusDamage;
      }

      pushEvent('MOB_HIT', {
        actor: 'MOB',
        target: 'PLAYER',
        message: attack.isCritical
          ? `${currentMob.name} acertou um crítico em ${session.character.name}.`
          : `${currentMob.name} atingiu ${session.character.name}.`,
        damage: attack.damage,
        isCritical: attack.isCritical,
        isDodged: false,
        characterCurrentHp: playerHp,
        mobCurrentHp: mobHp,
        hpBefore: hpBeforeAttack,
        hpAfter: playerHp,
        targetHpBefore: hpBeforeAttack,
        targetHpAfter: playerHp,
        characterHpBefore: hpBeforeAttack,
        characterHpAfter: playerHp,
        mobHpBefore: mobHpBeforeAttack,
        mobHpAfter: mobHp,
        phase: 'MOB_TURN',
        nextActor: playerHp > 0 ? 'PLAYER' : null,
      });

      if (playerHp > 0) {
        tryPotion();
      }
    };

    const isPlayerTurn = currentRound % 2 === 1;

    if (isPlayerTurn) {
      playerAttack();
    } else {
      mobAttack();
    }

    let finalStatus: AutoCombatSessionStatus = AutoCombatSessionStatus.ACTIVE;
    let nextPhase: AutoCombatSessionPhase = session.phase;
    let finishedAt: Date | null = null;

    let nextCurrentMobId: string | null = currentMob.id;
    let nextCurrentMobHp: number | null = mobHp;
    let nextCurrentMobMaxHp: number | null = currentMobMaxHp;
    let nextCurrentRound = currentRound;
    let nextCombatIndex = currentCombatIndex;
    let nextBattleTargetRemaining = Math.max(
      0,
      Math.floor(Number(session.battleTargetRemaining) || 0),
    );

    if (playerHp <= 0) {
      finalStatus = AutoCombatSessionStatus.DEFEATED;
      finishedAt = roundActionStartedAt;
      playerHp = 0;

      const defeatXpPayload = this.buildCharacterXpPayload(
        simulatedLevel,
        simulatedXp,
      );

      pushEvent('PLAYER_DEFEATED', {
        actor: 'MOB',
        target: 'PLAYER',
        message: `${session.character.name} foi derrotado por ${currentMob.name}.`,
        damage: 0,
        isCritical: false,
        isDodged: false,
        mobCurrentHp: mobHp,
        characterCurrentHp: 0,
        characterMaxHp: simulatedMaxHp,
        hpBefore: null,
        hpAfter: 0,
        targetHpBefore: null,
        targetHpAfter: 0,
        characterHpBefore: null,
        characterHpAfter: 0,
        mobHpBefore: mobHp,
        mobHpAfter: mobHp,
        phase: 'PLAYER_DEFEATED',
        sessionStatus: AutoCombatSessionStatus.DEFEATED,
        endReason: 'PLAYER_DEFEATED',
        shouldRedirectToInfirmary: true,
        nextActor: null,
        nextActionAt: null,
        characterXp: simulatedXp,
        characterLevel: simulatedLevel,
        ...defeatXpPayload,
        totalCombats: totalCombatsBeforeRound,
        totalRounds: totalRoundsAfterRound,
        totalKills: totalCombatsBeforeRound,
        totalXpGained: totalXpBeforeRound + xpGained,
        totalLoot: getTotalLootNow(),
        potionsUsed:
          totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0),
      });
    } else if (mobHp <= 0) {
      combatsResolved = 1;

      const penalty = calculateTierFarmPenalty(simulatedLevel, currentMob.tier);

      const baseXpReward = applyXpPenalty(
        currentMob.xpReward,
        penalty.xpMultiplier,
      );
      const balancedBaseXpReward = applyAutoCombatXpEfficiency({
        baseXp: baseXpReward,
        className,
        riskLevel: this.getAutoCombatRewardRiskLevel(playerHp, simulatedMaxHp),
      });
      const xpBreakdown = calculatePremiumXpBreakdown(
        balancedBaseXpReward,
        premiumActive,
      );
      const finalXpReward = xpBreakdown.totalXp;

      xpGained += finalXpReward;

      const levelProgress = calculateLevelProgress(
        simulatedLevel,
        simulatedXp,
        finalXpReward,
      );

      const oldLevelBeforeReward = simulatedLevel;
      const oldMaxHpBeforeReward = simulatedMaxHp;

      simulatedLevel = levelProgress.newLevel;
      simulatedXp = levelProgress.totalXp;

      levelsGained = Math.max(0, simulatedLevel - oldLevelBeforeReward);

      if (levelsGained > 0) {
        const newStatsAfterLevelUp = calculateFullStats(
          session.character.class,
          equipmentItems,
          simulatedLevel,
          gatheringBonus,
        );
        const newCombatStatsAfterLevelUp = calculateFullStats(
          session.character.class,
          equipmentItems,
          simulatedLevel,
          combatGatheringBonus,
        );

        const newMaxHpAfterLevelUp =
          newStatsAfterLevelUp.derivedCombatStats.maxHp;

        const hpBeforeLevelUpRecovery = playerHp;

        playerHp = this.calculateCurrentHpAfterLevelUp({
          currentHp: playerHp,
          oldMaxHp: oldMaxHpBeforeReward,
          newMaxHp: newMaxHpAfterLevelUp,
          levelsGained,
        });

        healingFromLevelUp += Math.max(0, playerHp - hpBeforeLevelUpRecovery);
        simulatedMaxHp = newMaxHpAfterLevelUp;
        playerStats.maxHp = simulatedMaxHp;
        playerStats.hp = playerHp;
        playerStats.attack =
          newCombatStatsAfterLevelUp.derivedCombatStats.attack;
        playerStats.defense =
          newCombatStatsAfterLevelUp.derivedCombatStats.defense;
        playerStats.speed = newCombatStatsAfterLevelUp.derivedCombatStats.speed;
        playerStats.precision =
          newCombatStatsAfterLevelUp.totalPrimaryStats.precision;
        playerStats.technique =
          newCombatStatsAfterLevelUp.totalPrimaryStats.technique;
        playerStats.agility =
          newCombatStatsAfterLevelUp.totalPrimaryStats.agility;
      }

      this.addMobSummary(mobSummaries, currentMob.id, finalXpReward);

      for (const drop of currentMob.drops ?? []) {
        const dropMultiplier = getDropMultiplierByItemSlot(
          drop.item.slot,
          penalty,
        );

        const finalDropChance = applyDropChancePenalty(
          drop.dropChance,
          dropMultiplier,
        );

        const roll = Math.floor(Math.random() * 100) + 1;

        if (roll <= finalDropChance) {
          const quantity = this.randomBetween(
            drop.minQuantity,
            drop.maxQuantity,
          );

          this.addLoot(loots, drop.itemId, quantity);
        }
      }

      const realtimeXpPayload = this.buildCharacterXpPayload(
        simulatedLevel,
        simulatedXp,
      );

      const totalKillsAfterKill = totalCombatsBeforeRound + 1;
      const totalXpAfterKill = totalXpBeforeRound + xpGained;
      const totalPotionsAfterRound =
        totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0);
      const totalLootAfterKill = getTotalLootNow();

      pushEvent('MOB_DEFEATED', {
        actor: 'PLAYER',
        target: 'MOB',
        message: `${currentMob.name} foi abatido. +${finalXpReward} XP.`,
        damage: 0,
        isCritical: false,
        isDodged: false,
        mobCurrentHp: 0,
        characterCurrentHp: playerHp,
        characterMaxHp: simulatedMaxHp,
        hpBefore: null,
        hpAfter: 0,
        targetHpBefore: null,
        targetHpAfter: 0,
        mobHpBefore: null,
        mobHpAfter: 0,
        characterHpBefore: null,
        characterHpAfter: playerHp,
        phase: 'MOB_DEFEATED',
        nextActor: 'SYSTEM',
        xpGained: finalXpReward,
        baseXpGained: xpBreakdown.baseXp,
        premiumBonusXp: xpBreakdown.premiumBonusXp,
        premiumPotentialBonusXp: xpBreakdown.premiumPotentialBonusXp,
        premiumTotalXp: xpBreakdown.premiumTotalXp,
        isPremiumActive: xpBreakdown.isPremiumActive,
        characterXp: simulatedXp,
        characterLevel: simulatedLevel,
        ...realtimeXpPayload,
        leveledUp: levelsGained > 0,
        levelsGained,
        totalCombats: totalKillsAfterKill,
        totalRounds: totalRoundsAfterRound,
        totalKills: totalKillsAfterKill,
        totalXpGained: totalXpAfterKill,
        totalLoot: totalLootAfterKill,
        potionsUsed: totalPotionsAfterRound,
      });

      const sessionShouldFinish =
        new Date(
          session.lastProcessedAt.getTime() +
            session.roundDurationSeconds * 1000,
        ).getTime() >= session.endsAt.getTime();
      const trackedEnemiesRemainingAfterKill =
        this.getTrackedEnemiesRemainingAfterKill(session, currentMob.id, 1);
      const shouldFinishTrackedQueue =
        trackedEnemiesRemainingAfterKill !== null &&
        trackedEnemiesRemainingAfterKill <= 0;
      const battleTargetRemainingAfterKill =
        this.getBattleTargetRemainingAfterKill(session, currentMob.id, 1);
      const shouldCompleteBattleSelection =
        battleTargetRemainingAfterKill !== null &&
        battleTargetRemainingAfterKill <= 0;
      nextBattleTargetRemaining =
        battleTargetRemainingAfterKill ?? nextBattleTargetRemaining;

      if (sessionShouldFinish || shouldFinishTrackedQueue) {
        finalStatus = AutoCombatSessionStatus.FINISHED;
        finishedAt = sessionShouldFinish
          ? session.endsAt
          : roundActionStartedAt;

        nextCurrentMobId = null;
        nextCurrentMobHp = null;
        nextCurrentMobMaxHp = null;
        nextCurrentRound = 0;
      } else if (shouldCompleteBattleSelection) {
        nextPhase = AutoCombatSessionPhase.ENCOUNTER_READY;
        nextCombatIndex = currentCombatIndex + 1;
        nextCurrentMobId = null;
        nextCurrentMobHp = null;
        nextCurrentMobMaxHp = null;
        nextCurrentRound = 0;
      } else {
        /**
         * Não cria o próximo mob dentro do mesmo pacote de eventos do abate.
         *
         * Antes o backend emitia MOB_DEFEATED e MOB_SPAWNED no mesmo processamento,
         * o que deixava o log parecer duplicado/acelerado. Agora o abate encerra
         * visualmente o combate atual; o próximo ciclo apenas faz o spawn, e a
         * rodada seguinte só acontece depois de outro roundDurationSeconds.
         */
        nextCombatIndex = currentCombatIndex + 1;
        nextCurrentMobId = null;
        nextCurrentMobHp = null;
        nextCurrentMobMaxHp = null;
        nextCurrentRound = 0;
      }
    }

    const newLastProcessedAt =
      finalStatus === AutoCombatSessionStatus.FINISHED
        ? (finishedAt ?? session.endsAt)
        : new Date(
            session.lastProcessedAt.getTime() +
              session.roundDurationSeconds * 1000,
          );

    const finalMaxHp = simulatedMaxHp;
    const finalCurrentHp = this.clampHp(playerHp, finalMaxHp);

    const healingReceived = healingFromPotions + healingFromLevelUp;
    const hpChange = finalCurrentHp - initialHp;
    const hpLostNet = Math.max(0, initialHp - finalCurrentHp);
    const hpRecoveredNet = Math.max(0, finalCurrentHp - initialHp);
    const hpLost = hpLostNet;

    const maxHpGained = Math.max(0, finalMaxHp - initialMaxHp);
    const totalHealingReceived = healingReceived;

    const criticalRateDealt = this.calculatePercent(
      criticalHitsDealt,
      playerAttackAttempts,
    );

    const criticalRateTaken = this.calculatePercent(
      criticalHitsTaken,
      mobAttackAttempts,
    );

    const criticalDamageSharePercent = this.calculatePercent(
      criticalBonusDamageDealt,
      damageDealt,
    );

    const playerDodgeRate = this.calculatePercent(
      dodgesByPlayer,
      mobAttackAttempts,
    );

    const mobDodgeRate = this.calculatePercent(
      dodgesByMob,
      playerAttackAttempts,
    );

    return {
      processedSeconds: session.roundDurationSeconds,
      combatsResolved,
      roundsResolved: 1,
      xpGained,

      initialHp,
      finalCurrentHp,
      initialMaxHp,
      finalMaxHp,
      maxHpGained,
      hpLost,

      damageDealt,
      damageTaken,
      healingReceived,
      healingFromPotions,
      healingFromLevelUp,
      healingFromRest: 0,
      totalHealingReceived,
      hpChange,
      hpLostNet,
      hpRecoveredNet,
      tookDamage: damageTaken > 0,
      wasHealed: totalHealingReceived > 0,

      criticalHitsDealt,
      criticalHitsTaken,
      criticalBonusDamageDealt,
      criticalBonusDamageTaken,
      playerAttackAttempts,
      mobAttackAttempts,
      criticalRateDealt,
      criticalRateTaken,
      criticalDamageSharePercent,
      dealtCritical: criticalHitsDealt > 0,
      tookCritical: criticalHitsTaken > 0,

      dodgesByPlayer,
      dodgesByMob,
      playerDodgeRate,
      mobDodgeRate,
      playerDodged: dodgesByPlayer > 0,
      mobDodged: dodgesByMob > 0,

      initialLevel,
      finalLevel: simulatedLevel,
      levelsGained,
      leveledUp: levelsGained > 0,

      potionsUsed: autoPotionState?.usedQuantity ?? 0,
      potionItemId: autoPotionState?.potionItemId ?? null,
      potionItemName: autoPotionState?.potionItemName ?? null,
      potionTriggerPercent: autoPotionState?.hpThresholdPercent ?? null,
      potionQuantityBefore: lastPotionQuantityBefore,
      potionQuantityAfter: lastPotionQuantityAfter,
      potionQuantityRemaining: autoPotionState?.availableQuantity ?? null,
      potionUsedQuantity: lastPotionUsedQuantity,

      finalXp: simulatedXp,
      finalStatus,
      phase: nextPhase,
      newLastProcessedAt,
      finishedAt,

      currentMobId: nextCurrentMobId,
      currentMobHp: nextCurrentMobHp,
      currentMobMaxHp: nextCurrentMobMaxHp,
      currentRound: nextCurrentRound,
      currentCombatIndex: nextCombatIndex,
      battleTargetRemaining: nextBattleTargetRemaining,

      loots,
      mobSummaries,

      events,
    };
  }

  private async persistRealtimeRoundResult(
    session: any,
    result: RealtimeRoundResult,
  ) {
    const resultPhase = result.phase ?? session.phase;

    await this.prisma.$transaction(async (tx) => {
      await this.claimSessionProcessingStep(tx, session, {
        status: result.finalStatus,
        phase: resultPhase,
        lastProcessedAt: result.newLastProcessedAt,
        finishedAt: result.finishedAt,

        currentMobId: result.currentMobId,
        currentMobHp: result.currentMobHp,
        currentMobMaxHp: result.currentMobMaxHp,
        killProgressSeconds: result.killProgressSeconds ?? 0,
        estimatedKillTimeSeconds: result.estimatedKillTimeSeconds ?? null,
        baseKillTimeSeconds: result.baseKillTimeSeconds ?? null,
        playerOffensivePower: result.playerOffensivePower ?? null,
        monsterRecommendedPower: result.monsterRecommendedPower ?? null,
        currentMobIndex: result.currentMobIndex ?? null,
        currentRound: result.currentRound,
        currentCombatIndex: result.currentCombatIndex,
        battleTargetRemaining:
          result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
          resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
            ? (result.battleTargetRemaining ??
              session.battleTargetRemaining ??
              0)
            : 0,
        battleTargetTotal:
          result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
          resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
            ? undefined
            : 0,
        battleTargetMobId:
          result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
          resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
            ? undefined
            : null,
        battleTargetEncounterId:
          result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
          resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
            ? undefined
            : null,
        selectedEncounterId:
          result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
          resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
            ? undefined
            : null,
        selectedEncounterMobId:
          result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
          resultPhase === AutoCombatSessionPhase.COMBAT_ACTIVE
            ? undefined
            : null,

        totalCombatsResolved: {
          increment: result.combatsResolved,
        },
        totalRoundsResolved: {
          increment: result.roundsResolved,
        },
        totalXpGained: {
          increment: result.xpGained,
        },
        totalPotionsUsed: {
          increment: result.potionsUsed,
        },
      });

      await tx.character.update({
        where: {
          id: session.characterId,
        },
        data: {
          xp: result.finalXp,
          level: result.finalLevel,
          currentHp: result.finalCurrentHp,
          maxHp: result.finalMaxHp,
        },
      });

      for (const loot of result.loots.values()) {
        const item = await tx.item.findUnique({
          where: {
            id: loot.itemId,
          },
        });

        if (!item) {
          continue;
        }

        await tx.inventoryItem.upsert({
          where: {
            characterId_itemId: {
              characterId: session.characterId,
              itemId: loot.itemId,
            },
          },
          update: {
            quantity: {
              increment: loot.quantity,
            },
          },
          create: {
            characterId: session.characterId,
            itemId: loot.itemId,
            quantity: loot.quantity,
            type: this.getInventoryItemType(item.slot),
          },
        });

        await tx.autoCombatSessionLoot.upsert({
          where: {
            sessionId_itemId: {
              sessionId: session.id,
              itemId: loot.itemId,
            },
          },
          update: {
            quantity: {
              increment: loot.quantity,
            },
          },
          create: {
            sessionId: session.id,
            itemId: loot.itemId,
            quantity: loot.quantity,
          },
        });
      }

      for (const summary of result.mobSummaries.values()) {
        await tx.autoCombatSessionMobSummary.upsert({
          where: {
            sessionId_mobId: {
              sessionId: session.id,
              mobId: summary.mobId,
            },
          },
          update: {
            kills: {
              increment: summary.kills,
            },
            xpGained: {
              increment: summary.xpGained,
            },
          },
          create: {
            sessionId: session.id,
            mobId: summary.mobId,
            kills: summary.kills,
            xpGained: summary.xpGained,
          },
        });

        const huntBatchMob = await tx.autoCombatHuntBatchMob.findFirst({
          where: {
            mobId: summary.mobId,
            batch: {
              sessionId: session.id,
            },
          },
          select: {
            id: true,
            remainingCount: true,
          },
        });

        if (huntBatchMob && summary.kills > 0) {
          await tx.autoCombatHuntBatchMob.update({
            where: {
              id: huntBatchMob.id,
            },
            data: {
              remainingCount: Math.max(
                0,
                huntBatchMob.remainingCount - summary.kills,
              ),
            },
          });
        }
      }

      if (
        result.finalStatus === AutoCombatSessionStatus.ACTIVE &&
        resultPhase === AutoCombatSessionPhase.ENCOUNTER_READY
      ) {
        await tx.autoCombatHuntBatch.updateMany({
          where: {
            sessionId: session.id,
          },
          data: {
            status: AutoCombatHuntBatchStatus.READY,
            consumedAt: null,
            lastProcessedAt: result.newLastProcessedAt,
          },
        });
      }

      const terminalHuntBatchUpdateData = this.buildTerminalHuntBatchUpdateData(
        session,
        result,
      );

      if (terminalHuntBatchUpdateData) {
        await tx.autoCombatHuntBatch.updateMany({
          where: {
            sessionId: session.id,
          },
          data: terminalHuntBatchUpdateData,
        });
      }

      if (result.events.length > 0) {
        await this.persistRealtimeEventsInTransaction(
          tx,
          session.characterId,
          result.events,
        );
      }

      if (result.potionsUsed > 0 && result.potionItemId) {
        const potionInventoryItem = await tx.inventoryItem.findUnique({
          where: {
            characterId_itemId: {
              characterId: session.characterId,
              itemId: result.potionItemId,
            },
          },
        });

        if (potionInventoryItem) {
          if (potionInventoryItem.quantity <= result.potionsUsed) {
            await tx.inventoryItem.delete({
              where: {
                id: potionInventoryItem.id,
              },
            });
          } else {
            await tx.inventoryItem.update({
              where: {
                id: potionInventoryItem.id,
              },
              data: {
                quantity: {
                  decrement: result.potionsUsed,
                },
              },
            });
          }
        }
      }
    });
  }

  private async claimSessionProcessingStep(
    tx: Prisma.TransactionClient,
    session: any,
    data: Prisma.AutoCombatSessionUncheckedUpdateManyInput,
  ) {
    const updateResult = await tx.autoCombatSession.updateMany({
      where: {
        id: session.id,
        status: AutoCombatSessionStatus.ACTIVE,
        lastProcessedAt: session.lastProcessedAt,
      },
      data,
    });

    if (updateResult.count === 0) {
      throw new AutoCombatSessionConcurrencyError();
    }
  }

  private async claimHuntingSessionProcessingStep(
    tx: Prisma.TransactionClient,
    session: any,
    data: Prisma.AutoCombatSessionUncheckedUpdateManyInput,
  ) {
    const updateResult = await tx.autoCombatSession.updateMany({
      where: {
        id: session.id,
        status: AutoCombatSessionStatus.ACTIVE,
        phase: AutoCombatSessionPhase.HUNTING,
        lastProcessedAt: session.lastProcessedAt,
        lastHuntProcessedAt: session.lastHuntProcessedAt ?? null,
      },
      data,
    });

    if (updateResult.count === 0) {
      throw new AutoCombatSessionConcurrencyError();
    }
  }

  private async claimAutoCombatPhaseTransition(
    tx: Prisma.TransactionClient,
    session: any,
    nextPhase: AutoCombatSessionPhase,
    data: Prisma.AutoCombatSessionUncheckedUpdateManyInput,
  ) {
    assertAutoCombatPhaseTransition(session.phase, nextPhase);

    const updateResult = await tx.autoCombatSession.updateMany({
      where: {
        id: session.id,
        status: AutoCombatSessionStatus.ACTIVE,
        phase: session.phase,
        lastProcessedAt: session.lastProcessedAt,
      },
      data: {
        ...data,
        phase: nextPhase,
      },
    });

    if (updateResult.count === 0) {
      throw new AutoCombatSessionConcurrencyError();
    }
  }

  private async claimHuntBatchProcessingStep(
    tx: Prisma.TransactionClient,
    huntBatch: any,
    data: Prisma.AutoCombatHuntBatchUncheckedUpdateManyInput,
  ) {
    const updateResult = await tx.autoCombatHuntBatch.updateMany({
      where: {
        id: huntBatch.id,
        status: AutoCombatHuntBatchStatus.HUNTING,
        lastProcessedAt: huntBatch.lastProcessedAt,
      },
      data,
    });

    if (updateResult.count === 0) {
      throw new AutoCombatSessionConcurrencyError();
    }
  }

  private async claimHuntBatchStatusTransition(
    tx: Prisma.TransactionClient,
    huntBatch: any,
    nextStatus: AutoCombatHuntBatchStatus,
    data: Prisma.AutoCombatHuntBatchUncheckedUpdateManyInput,
  ) {
    const updateResult = await tx.autoCombatHuntBatch.updateMany({
      where: {
        id: huntBatch.id,
        status: huntBatch.status,
        lastProcessedAt: huntBatch.lastProcessedAt,
      },
      data: {
        ...data,
        status: nextStatus,
      },
    });

    if (updateResult.count === 0) {
      throw new AutoCombatSessionConcurrencyError();
    }
  }

  private async persistHuntingMobFoundCountsInTransaction(
    tx: Prisma.TransactionClient,
    sessionId: string,
    foundCountsByMob: Map<string, number>,
  ) {
    for (const [mobId, foundCount] of foundCountsByMob.entries()) {
      const safeFoundCount = Math.max(0, Math.floor(Number(foundCount) || 0));

      if (safeFoundCount <= 0) {
        continue;
      }

      await tx.autoCombatSessionMobSummary.upsert({
        where: {
          sessionId_mobId: {
            sessionId,
            mobId,
          },
        },
        update: {
          foundCount: {
            increment: safeFoundCount,
          },
        },
        create: {
          sessionId,
          mobId,
          kills: 0,
          xpGained: 0,
          foundCount: safeFoundCount,
        },
      });
    }
  }

  private async persistHuntBatchMobFoundCountsInTransaction(
    tx: Prisma.TransactionClient,
    batchId: string,
    foundCountsByMob: Map<string, number>,
    metadataByMob: Map<
      string,
      {
        encounterId: string | null;
        weightSnapshot: number;
        firstFoundAt: Date;
        lastFoundAt: Date;
      }
    >,
  ) {
    for (const [mobId, foundCount] of foundCountsByMob.entries()) {
      const safeFoundCount = Math.max(0, Math.floor(Number(foundCount) || 0));

      if (safeFoundCount <= 0) {
        continue;
      }

      const metadata = metadataByMob.get(mobId);

      await tx.autoCombatHuntBatchMob.upsert({
        where: {
          batchId_mobId: {
            batchId,
            mobId,
          },
        },
        update: {
          encounterId: metadata?.encounterId ?? undefined,
          foundCount: {
            increment: safeFoundCount,
          },
          remainingCount: {
            increment: safeFoundCount,
          },
          weightSnapshot: metadata?.weightSnapshot ?? undefined,
          lastFoundAt: metadata?.lastFoundAt ?? undefined,
        },
        create: {
          batchId,
          mobId,
          encounterId: metadata?.encounterId ?? null,
          foundCount: safeFoundCount,
          remainingCount: safeFoundCount,
          weightSnapshot: metadata?.weightSnapshot ?? 100,
          firstFoundAt: metadata?.firstFoundAt ?? null,
          lastFoundAt: metadata?.lastFoundAt ?? null,
        },
      });
    }
  }

  private async persistHuntBatchEventsInTransaction(
    tx: Prisma.TransactionClient,
    batchId: string,
    characterId: string,
    sessionId: string,
    events: AutoCombatRealtimeEvent[],
  ) {
    const huntEvents = events.filter(
      (event) =>
        event.type === 'HUNT_TARGET_FOUND' &&
        event.huntSequence !== null &&
        event.huntSequence !== undefined,
    );

    if (huntEvents.length === 0) {
      return;
    }

    await tx.autoCombatHuntBatchEvent.createMany({
      data: huntEvents.map((event) => {
        const sequence = Math.max(
          1,
          Math.floor(Number(event.huntSequence) || 1),
        );

        return {
          batchId,
          characterId,
          sessionId,
          type: String(event.type),
          sequence,
          cycleKey:
            event.huntCycleKey ??
            event.eventKey ??
            `${batchId}:hunt:${sequence}`,
          payloadJson: this.normalizeRealtimeEventForStorage(event),
          createdAt: event.createdAt ? new Date(event.createdAt) : new Date(),
        };
      }),
      skipDuplicates: true,
    });
  }

  private async buildSessionResponse(
    sessionId: string,
    extra?: {
      message?: string;
      processing?: ProcessingSummary;
    },
  ) {
    const session = await this.prisma.autoCombatSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        currentMob: true,
        selectedEncounter: {
          include: {
            mob: true,
          },
        },
        character: {
          include: {
            class: true,
            user: {
              select: {
                premiumUntil: true,
              },
            },
            equipment: {
              include: {
                mainHand: true,
                offHand: true,
                head: true,
                armor: true,
                pants: true,
                boots: true,
              },
            },
            potionConfig: {
              include: {
                potionItem: true,
              },
            },
            inventoryItems: {
              include: {
                item: true,
              },
            },
            gatheringSkills: true,
            huntingSkill: true,
          },
        },
        subMap: {
          include: {
            map: true,
          },
        },
        map: true,
        loots: {
          include: {
            item: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        mobSummaries: {
          include: {
            mob: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        huntBatch: {
          include: {
            selectedEncounter: {
              include: {
                mob: true,
              },
            },
            mobs: {
              include: {
                mob: true,
                encounter: true,
              },
              orderBy: {
                updatedAt: 'asc',
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(
        'Sessão de combate automático não encontrada.',
      );
    }

    const now = new Date();
    const remainingSeconds = this.calculateSessionRemainingSeconds(
      session,
      now,
    );

    const xpBreakdown = await this.buildSessionXpBreakdown(session, now);
    const huntingSkill =
      session.character.huntingSkill ??
      (await this.getOrCreateHuntingSkill(session.character.id));
    const huntingSkillViewModel = this.buildHuntingSkillViewModel(huntingSkill);
    const huntBatch = session.huntBatch ?? null;
    const selectedEncounterId =
      huntBatch?.selectedEncounterId ??
      session.selectedEncounterId ??
      huntBatch?.selectedEncounter?.id ??
      session.selectedEncounter?.id ??
      null;
    const selectedEncounterMobId =
      huntBatch?.selectedEncounterMobId ??
      session.selectedEncounterMobId ??
      huntBatch?.selectedEncounter?.mobId ??
      session.selectedEncounter?.mobId ??
      null;
    const huntingTiming = this.buildHuntingTimingViewModel(
      {
        ...session,
        huntStartedAt: huntBatch?.startedAt ?? session.huntStartedAt,
        lastHuntProcessedAt:
          huntBatch?.lastProcessedAt ?? session.lastHuntProcessedAt,
        foundEnemiesCount:
          huntBatch?.foundEnemiesCount ?? session.foundEnemiesCount,
        selectedEncounterId,
        selectedEncounterMobId,
      },
      huntingSkillViewModel,
      now,
    );
    const currentFoundEnemiesCount = Math.max(
      0,
      Math.floor(
        Number(huntBatch?.foundEnemiesCount ?? session.foundEnemiesCount) || 0,
      ),
    );
    const currentTrackedEnemiesRemaining =
      this.getTrackedEnemiesRemaining(session) ?? currentFoundEnemiesCount;
    const maxTrackedEnemies = Math.max(
      0,
      Math.floor(
        Number(huntingSkillViewModel.maxTrackedEnemies) ||
          this.getHuntingMaxTrackedEnemies(huntingSkill.level),
      ),
    );
    const remainingHuntCapacity = Math.max(
      0,
      maxTrackedEnemies - currentTrackedEnemiesRemaining,
    );
    const isHuntLimitReached =
      maxTrackedEnemies > 0 &&
      currentTrackedEnemiesRemaining >= maxTrackedEnemies;
    const huntCapacity = {
      maxTrackedEnemies,
      remainingCapacity: remainingHuntCapacity,
      isLimitReached: isHuntLimitReached,
      availableEnemiesCount: currentTrackedEnemiesRemaining,
      remainingEnemiesCount: currentTrackedEnemiesRemaining,
    };

    const sessionSummary = this.buildSessionSummary(
      session,
      remainingSeconds,
      now,
      xpBreakdown,
    );

    const currentMobHp =
      session.currentMob && session.currentMobHp !== null
        ? this.clampHp(
            session.currentMobHp,
            session.currentMobMaxHp ?? session.currentMob.hp,
          )
        : null;

    const currentMobMaxHp =
      session.currentMob && session.currentMobMaxHp !== null
        ? session.currentMobMaxHp
        : (session.currentMob?.hp ?? null);

    const snapshotSequence = await this.getLatestSessionEventSequence(
      session.id,
      session.characterId,
    );
    const latestStoredHuntEventSequence =
      await this.getLatestSessionEventSequence(
        session.id,
        session.characterId,
        ['HUNT_TARGET_FOUND'],
      );
    const huntSequence =
      huntBatch?.huntSequence ?? latestStoredHuntEventSequence;

    const enemyInstanceId = this.buildEnemyInstanceId({
      sessionId: session.id,
      combatIndex: session.currentCombatIndex,
      mobId: session.currentMobId ?? session.currentMob?.id ?? null,
    });

    const battleProgress = this.buildBattleProgressPayload(
      session,
      session.currentMob,
      now,
    );
    const currentMobSurvivalProjection = this.buildMobSurvivalProjection(
      session,
      session.currentMob,
      Math.max(
        1,
        Math.floor(
          Number(session.battleTargetRemaining) ||
            this.getTrackedEnemiesRemaining(session) ||
            1,
        ),
      ),
    );
    const currentMobPayloadBase = this.buildCurrentMobStatusPayload(
      session.currentMob,
      currentMobHp,
      currentMobMaxHp,
      {
        sessionId: session.id,
        combatIndex: session.currentCombatIndex,
        survivalProjection: currentMobSurvivalProjection,
      },
    );
    const currentMobPayload = currentMobPayloadBase
      ? {
          ...currentMobPayloadBase,
          battleProgress,
        }
      : null;
    const selectedEncounter =
      huntBatch?.selectedEncounter ?? session.selectedEncounter ?? null;
    const selectedEncounterFoundCount = this.getSessionTrackedMobFoundCount(
      session,
      selectedEncounterMobId ?? selectedEncounter?.mobId,
    );
    const selectedEncounterSurvivalProjection = this.buildMobSurvivalProjection(
      session,
      selectedEncounter?.mob ?? null,
      selectedEncounterFoundCount,
    );
    const selectedEncounterMobPayload = this.buildCurrentMobStatusPayload(
      selectedEncounter?.mob ?? null,
      selectedEncounter?.mob?.hp ?? null,
      selectedEncounter?.mob?.hp ?? null,
      {
        sessionId: session.id,
        combatIndex: session.currentCombatIndex,
        survivalProjection: selectedEncounterSurvivalProjection,
      },
    );
    const selectedEncounterMobHuntPayload = selectedEncounterMobPayload
      ? {
          ...selectedEncounterMobPayload,
          foundCount: selectedEncounterFoundCount,
          huntFoundCount: selectedEncounterFoundCount,
        }
      : null;
    const selectedEncounterPayload = selectedEncounter
      ? {
          id: selectedEncounter.id,
          mobId: selectedEncounter.mobId,
          subMapId: selectedEncounter.subMapId,
          weight: selectedEncounter.weight,
          isActive: selectedEncounter.isActive,
          foundCount: selectedEncounterFoundCount,
          huntFoundCount: selectedEncounterFoundCount,
          mob: selectedEncounterMobHuntPayload,
        }
      : null;
    const trackedMonsters = this.buildTrackedMonstersPayload(session);
    const battleTargetMobId = session.battleTargetMobId ?? null;
    const battleTargetEncounterId = session.battleTargetEncounterId ?? null;
    const battleTargetTotal = Math.max(
      0,
      Math.floor(Number(session.battleTargetTotal) || 0),
    );
    const battleTargetRemaining = Math.max(
      0,
      Math.floor(Number(session.battleTargetRemaining) || 0),
    );
    const battleTargetMob =
      currentMobPayload ??
      trackedMonsters.find((entry) => entry.mobId === battleTargetMobId)?.mob ??
      null;
    const battleSelection =
      battleTargetMobId || battleTargetEncounterId
        ? {
            mobId: battleTargetMobId,
            encounterId: battleTargetEncounterId,
            total: battleTargetTotal,
            remaining: battleTargetRemaining,
            defeated: Math.max(0, battleTargetTotal - battleTargetRemaining),
            mob: battleTargetMob,
          }
        : null;

    const timeline = this.buildSessionTimelinePayload(
      session,
      currentMobHp,
      now,
    );

    const characterXpPayload = this.buildCharacterXpPayload(
      session.character.level,
      session.character.xp,
    );

    const totalLoot = session.loots.reduce(
      (total: number, loot: { quantity: number }) => total + loot.quantity,
      0,
    );

    const totalKills = session.mobSummaries.reduce(
      (total: number, summary: { kills: number }) => total + summary.kills,
      0,
    );
    const characterCurrentHp = this.clampHp(
      session.character.currentHp ?? 0,
      session.character.maxHp ?? 0,
    );
    const autoCombatRecovery =
      this.buildPreservedTrackedEnemiesViewModel(session);
    const shouldRedirectToInfirmary =
      session.status === AutoCombatSessionStatus.DEFEATED &&
      characterCurrentHp <= 0;
    const endReason = shouldRedirectToInfirmary
      ? 'PLAYER_DEFEATED'
      : session.status;

    return {
      active: session.status === AutoCombatSessionStatus.ACTIVE,
      hasActiveAutoCombat: session.status === AutoCombatSessionStatus.ACTIVE,
      message: extra?.message ?? 'Sessão carregada com sucesso.',
      serverNow: now.toISOString(),
      snapshotSequence,
      latestEventSequence: snapshotSequence,
      phase: timeline.phase,
      nextActor: timeline.nextActor,
      lastActionAt: timeline.lastActionAt,
      nextActionAt: timeline.nextActionAt,
      roundDurationSeconds: timeline.roundDurationSeconds,
      currentMapId: session.mapId,
      currentSubMapId: session.subMapId,
      canTravel: session.status !== AutoCombatSessionStatus.ACTIVE,
      huntCapacity,
      hasPreservedTrackedEnemies: autoCombatRecovery.hasPreservedTrackedEnemies,
      preservedTrackedEnemiesCount:
        autoCombatRecovery.preservedTrackedEnemiesCount,
      autoCombatRecovery,

      character: {
        id: session.character.id,
        name: session.character.name,
        class: session.character.class.name,
        level: session.character.level,
        xp: session.character.xp,
        currentHp: session.character.currentHp,
        maxHp: session.character.maxHp,
        ...characterXpPayload,
      },

      session: {
        id: session.id,
        characterId: session.characterId,
        mapId: session.mapId,
        subMapId: session.subMapId,
        status: session.status,
        phase: session.phase,
        endReason,
        shouldRedirectToInfirmary,
        hasPreservedTrackedEnemies:
          autoCombatRecovery.hasPreservedTrackedEnemies,
        preservedTrackedEnemiesCount:
          autoCombatRecovery.preservedTrackedEnemiesCount,
        autoCombatRecovery,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        lastProcessedAt: session.lastProcessedAt,
        finishedAt: session.finishedAt,
        durationSeconds: session.durationSeconds,
        roundDurationSeconds: session.roundDurationSeconds,
        remainingSeconds,

        totalCombatsResolved: session.totalCombatsResolved,
        totalRoundsResolved: session.totalRoundsResolved,
        totalXpGained: session.totalXpGained,
        baseXpGained: xpBreakdown.baseXpGained,
        premiumBonusXp: xpBreakdown.premiumBonusXp,
        premiumPotentialBonusXp: xpBreakdown.premiumPotentialBonusXp,
        premiumTotalXp: xpBreakdown.premiumTotalXp,
        isPremiumActive: xpBreakdown.isPremiumActive,
        totalPotionsUsed: session.totalPotionsUsed ?? 0,

        totalCombats: session.totalCombatsResolved,
        totalRounds: session.totalRoundsResolved,
        totalKills,
        totalLoot,
        potionsUsed: session.totalPotionsUsed ?? 0,

        currentMobId: session.currentMobId,
        currentMobHp,
        currentMobMaxHp,
        killProgressSeconds: battleProgress?.progressSeconds ?? 0,
        estimatedKillTimeSeconds:
          battleProgress?.estimatedKillTimeSeconds ?? null,
        baseKillTimeSeconds: battleProgress?.baseKillTimeSeconds ?? null,
        playerOffensivePower: battleProgress?.playerOffensivePower ?? null,
        monsterRecommendedPower:
          battleProgress?.monsterRecommendedPower ?? null,
        currentMobIndex: battleProgress?.mobIndex ?? null,
        currentRound: session.currentRound,
        currentCombatIndex: session.currentCombatIndex,
        huntStartedAt: huntBatch?.startedAt ?? session.huntStartedAt,
        huntStoppedAt: huntBatch?.stoppedAt ?? session.huntStoppedAt,
        lastHuntProcessedAt:
          huntBatch?.lastProcessedAt ?? session.lastHuntProcessedAt,
        huntingLevelAtStart:
          huntBatch?.huntingLevelAtStart ?? session.huntingLevelAtStart,
        huntingXpGained: huntBatch?.huntingXpGained ?? session.huntingXpGained,
        foundEnemiesCount: currentFoundEnemiesCount,
        availableEnemiesCount: currentTrackedEnemiesRemaining,
        remainingEnemiesCount: currentTrackedEnemiesRemaining,
        maxTrackedEnemies,
        remainingHuntCapacity,
        isHuntLimitReached,
        bonusEnemiesFound:
          huntBatch?.bonusEnemiesFound ?? session.bonusEnemiesFound,
        selectedEncounterId,
        selectedEncounterMobId,
        battleTargetMobId,
        battleTargetEncounterId,
        battleTargetTotal,
        battleTargetRemaining,
        battleSelection,
        enemyInstanceId,
        currentEnemyInstanceId: enemyInstanceId,
        snapshotSequence,
        latestEventSequence: snapshotSequence,
        nextActor: timeline.nextActor,
        lastActionAt: timeline.lastActionAt,
        nextActionAt: timeline.nextActionAt,
        currentMob: currentMobPayload,
        battleProgress,
      },

      currentMob: currentMobPayload,
      battleProgress,
      battleSelection,
      selectedEncounter: selectedEncounterPayload,
      trackedMonsters,
      huntBatch: huntBatch
        ? {
            id: huntBatch.id,
            characterId: huntBatch.characterId,
            mapId: huntBatch.mapId,
            sessionId: huntBatch.sessionId,
            status: huntBatch.status,
            startedAt: huntBatch.startedAt,
            stoppedAt: huntBatch.stoppedAt,
            consumedAt: huntBatch.consumedAt,
            cancelledAt: huntBatch.cancelledAt,
            lastProcessedAt: huntBatch.lastProcessedAt,
            huntingLevelAtStart: huntBatch.huntingLevelAtStart,
            huntingXpGained: huntBatch.huntingXpGained,
            foundEnemiesCount: currentFoundEnemiesCount,
            availableEnemiesCount: currentTrackedEnemiesRemaining,
            remainingEnemiesCount: currentTrackedEnemiesRemaining,
            hasPreservedTrackedEnemies:
              autoCombatRecovery.hasPreservedTrackedEnemies,
            preservedTrackedEnemiesCount:
              autoCombatRecovery.preservedTrackedEnemiesCount,
            autoCombatRecovery,
            maxTrackedEnemies,
            remainingCapacity: remainingHuntCapacity,
            isLimitReached: isHuntLimitReached,
            bonusEnemiesFound: huntBatch.bonusEnemiesFound,
            selectedEncounterId,
            selectedEncounterMobId,
            huntSequence,
            mobs: trackedMonsters,
          }
        : null,
      huntingSkill: huntingSkillViewModel,
      hunting: {
        mapId: session.mapId,
        subMapId: session.subMapId,
        phase: session.phase,
        startedAt: huntBatch?.startedAt ?? session.huntStartedAt,
        stoppedAt: huntBatch?.stoppedAt ?? session.huntStoppedAt,
        lastProcessedAt:
          huntBatch?.lastProcessedAt ?? session.lastHuntProcessedAt,
        lastFindAt: huntingTiming.lastFindAt,
        nextFindAt: huntingTiming.nextFindAt,
        foundEnemiesCount: currentFoundEnemiesCount,
        availableEnemiesCount: currentTrackedEnemiesRemaining,
        remainingEnemiesCount: currentTrackedEnemiesRemaining,
        maxTrackedEnemies,
        remainingCapacity: remainingHuntCapacity,
        isLimitReached: isHuntLimitReached,
        bonusEnemiesFound:
          huntBatch?.bonusEnemiesFound ?? session.bonusEnemiesFound,
        huntingXpGained: huntBatch?.huntingXpGained ?? session.huntingXpGained,
        secondsPerEnemy: huntingSkillViewModel.secondsPerEnemy,
        secondsPerFind: huntingTiming.secondsPerFind,
        elapsedSeconds: huntingTiming.elapsedSeconds,
        remainingSeconds: huntingTiming.remainingSeconds,
        progressPercent: huntingTiming.progressPercent,
        foundEnemySequence: huntingTiming.foundEnemySequence,
        currentTargetSequence: huntingTiming.currentTargetSequence,
        huntSequence,
        lastHuntEventSequence: huntSequence,
        selectedEncounterId,
        targetEncounterId: selectedEncounterId,
        targetMobId: selectedEncounterMobId,
        targetFoundCount: selectedEncounterFoundCount,
        currentTargetFoundCount: selectedEncounterFoundCount,
        selectedMob: selectedEncounterMobHuntPayload,
        targetMob: selectedEncounterMobHuntPayload,
        currentTarget: selectedEncounterPayload,
        targetEncounter: selectedEncounterPayload,
        trackedMonsters,
        skill: huntingSkillViewModel,
      },

      subMap: {
        id: session.subMap.id,
        name: session.subMap.name,
        tier: session.subMap.tier,
        minLevel: session.subMap.minLevel,
        maxLevel: session.subMap.maxLevel,
        map: {
          id: session.map?.id ?? session.subMap.map.id,
          name: session.map?.name ?? session.subMap.map.name,
          tier: session.map?.tier ?? session.subMap.map.tier,
        },
      },

      map: {
        id: session.map?.id ?? session.subMap.map.id,
        name: session.map?.name ?? session.subMap.map.name,
        tier: session.map?.tier ?? session.subMap.map.tier,
        minLevel: session.map?.minLevel ?? session.subMap.map.minLevel,
        maxLevel: session.map?.maxLevel ?? session.subMap.map.maxLevel,
        description: session.map?.description ?? session.subMap.map.description,
      },

      rewards: {
        loots: session.loots.map((loot) => ({
          itemId: loot.itemId,
          itemName: loot.item.name,
          quantity: loot.quantity,
          rarity: loot.item.rarity,
          slot: loot.item.slot,
          tier: loot.item.tier,
        })),

        mobs: session.mobSummaries
          .filter((summary) => summary.kills > 0)
          .map((summary) => ({
            mobId: summary.mobId,
            mobName: summary.mob.name,
            mobLevel: summary.mob.level,
            mobTier: summary.mob.tier,
            kills: summary.kills,
            xpGained: summary.xpGained,
            foundCount: summary.foundCount,
          })),
        trackedMonsters,
      },

      sessionSummary,

      processing: extra?.processing ?? this.buildEmptyProcessingSummary(),
      endReason,
      shouldRedirectToInfirmary,
    };
  }

  private buildPreservedTrackedEnemiesViewModel(session: any) {
    const huntBatch = session.huntBatch ?? null;
    const preservedTrackedEnemiesCount =
      session.status === AutoCombatSessionStatus.DEFEATED &&
      huntBatch?.status === AutoCombatHuntBatchStatus.READY
        ? (this.getTrackedEnemiesRemaining(session) ?? 0)
        : 0;
    const hasPreservedTrackedEnemies = preservedTrackedEnemiesCount > 0;

    return {
      hasPreservedTrackedEnemies,
      preservedTrackedEnemiesCount,
      huntBatchId: hasPreservedTrackedEnemies ? (huntBatch?.id ?? null) : null,
      sessionId: hasPreservedTrackedEnemies ? (session.id ?? null) : null,
      mapId: hasPreservedTrackedEnemies ? (session.mapId ?? null) : null,
      subMapId: hasPreservedTrackedEnemies ? (session.subMapId ?? null) : null,
      mapName: hasPreservedTrackedEnemies
        ? (session.map?.name ?? session.subMap?.map?.name ?? null)
        : null,
      subMapName: hasPreservedTrackedEnemies
        ? (session.subMap?.name ?? null)
        : null,
      defeatedAt: hasPreservedTrackedEnemies
        ? (session.finishedAt?.toISOString?.() ?? session.finishedAt ?? null)
        : null,
    };
  }

  private buildBattleProgressPayload(
    session: any,
    currentMob: any,
    now = new Date(),
  ) {
    if (!currentMob) {
      return null;
    }

    const characterStats = this.calculateCharacterFighterStats(
      session.character,
    );
    const calculatedTtk = calculateAutoCombatTtk({
      mob: currentMob,
      playerStats: characterStats,
    });
    const estimatedKillTimeSeconds = Math.max(
      1,
      Math.ceil(
        Number(session.estimatedKillTimeSeconds) ||
          calculatedTtk.estimatedKillTimeSeconds,
      ),
    );
    const persistedProgressSeconds = Math.min(
      estimatedKillTimeSeconds,
      Math.max(0, Number(session.killProgressSeconds) || 0),
    );
    const progressAnchorAt = session.lastProcessedAt
      ? new Date(session.lastProcessedAt)
      : now;
    const safeProgressAnchorAt = Number.isFinite(progressAnchorAt.getTime())
      ? progressAnchorAt
      : now;
    const cycleStartedAt = new Date(
      safeProgressAnchorAt.getTime() - persistedProgressSeconds * 1000,
    );
    const progressSeconds = Math.min(
      estimatedKillTimeSeconds,
      Math.max(0, (now.getTime() - cycleStartedAt.getTime()) / 1000),
    );
    const progressPercent = this.calculatePercent(
      progressSeconds,
      estimatedKillTimeSeconds,
    );
    const cycleDurationMs = Math.max(
      1,
      Math.round(estimatedKillTimeSeconds * 1000),
    );

    return {
      progressSeconds,
      progressPercent,
      cycleStartedAt: cycleStartedAt.toISOString(),
      cycleDurationMs,
      cycleDurationSeconds: estimatedKillTimeSeconds,
      progressUpdatedAt: now.toISOString(),
      serverNow: now.toISOString(),
      estimatedKillTimeSeconds,
      baseKillTimeSeconds:
        Number(session.baseKillTimeSeconds) ||
        calculatedTtk.baseKillTimeSeconds,
      playerOffensivePower:
        Number(session.playerOffensivePower) ||
        calculatedTtk.playerOffensivePower,
      monsterRecommendedPower:
        Number(session.monsterRecommendedPower) ||
        calculatedTtk.monsterRecommendedPower,
      killsPerMinute: 60 / estimatedKillTimeSeconds,
      killsPerHour: 3600 / estimatedKillTimeSeconds,
      difficultyLabel: calculatedTtk.difficultyLabel,
      mobIndex:
        Math.floor(Number(session.currentMobIndex) || 0) ||
        calculatedTtk.mobIndex,
      tier: calculatedTtk.tier,
    };
  }

  private buildMobSurvivalProjection(
    session: any,
    mob: any,
    projectedKills?: number | null,
  ): AutoCombatMobSurvivalProjection | null {
    if (!session?.character || !mob) {
      return null;
    }

    const projectedKillCount = Math.max(
      0,
      Math.floor(Number(projectedKills) || 0),
    );

    if (projectedKillCount <= 0) {
      return null;
    }

    const playerStats = this.calculateCharacterFighterStats(session.character);
    const className = session.character.class?.name ?? playerStats.className;
    const mobStats = this.calculateAutoCombatMobFighterStats(mob, className);
    const ttk = calculateAutoCombatTtk({
      mob,
      playerStats,
    });
    const potionState = this.createAutoPotionState(session.character);
    const potionHealAmount = potionState
      ? applyAutoCombatPotionHealMultiplier({
          healAmount: this.calculateHealAmount({
            maxHp: playerStats.maxHp,
            healFlat: potionState.healFlat,
            healPercent: potionState.healPercent,
          }),
          className,
        })
      : 0;
    const survival = projectAutoCombatSurvival({
      currentHp: playerStats.hp,
      maxHp: playerStats.maxHp,
      playerDefense: playerStats.defense,
      playerAgility: playerStats.agility,
      mobAttack: mobStats.attack,
      mobPrecision: mobStats.precision,
      mobTechnique: mobStats.technique,
      projectedKills: projectedKillCount,
      potion: potionState
        ? {
            availableQuantity: potionState.availableQuantity,
            healAmount: potionHealAmount,
            hpThresholdPercent: potionState.hpThresholdPercent,
          }
        : null,
    });

    return {
      ...survival,
      estimatedKillTimeSeconds: ttk.estimatedKillTimeSeconds,
      killsPerMinute: ttk.killsPerMinute,
      difficultyLabel: ttk.difficultyLabel,
      potionItemId: potionState?.potionItemId ?? null,
      potionItemName: potionState?.potionItemName ?? null,
    };
  }

  private buildCurrentMobStatusPayload(
    currentMob: any,
    currentMobHp: number | null,
    currentMobMaxHp: number | null,
    options?: {
      sessionId?: string | null;
      combatIndex?: number | null;
      survivalProjection?: AutoCombatMobSurvivalProjection | null;
    },
  ) {
    if (!currentMob) {
      return null;
    }

    const enemyInstanceId = this.buildEnemyInstanceId({
      sessionId: options?.sessionId ?? null,
      combatIndex: options?.combatIndex ?? null,
      mobId: currentMob.id,
    });

    return {
      id: currentMob.id,
      enemyInstanceId,
      name: currentMob.name,
      description: currentMob.description,
      level: currentMob.level,
      tier: currentMob.tier,
      hp: currentMob.hp,
      attack: currentMob.attack,
      defense: currentMob.defense,
      speed: currentMob.speed,
      xpReward: currentMob.xpReward,
      currentHp: currentMobHp,
      maxHp: currentMobMaxHp,
      hpPercent:
        currentMobHp !== null && currentMobMaxHp
          ? this.calculatePercent(currentMobHp, currentMobMaxHp)
          : 0,
      survivalProjection: options?.survivalProjection ?? null,
    };
  }

  private getSessionMobFoundCount(
    mobSummaries: Array<{
      mobId: string;
      foundCount?: number | null;
      kills?: number | null;
    }>,
    mobId?: string | null,
  ) {
    if (!mobId) {
      return 0;
    }

    const summary = mobSummaries.find((item) => item.mobId === mobId);
    const foundCount = Math.max(
      0,
      Math.floor(Number(summary?.foundCount) || 0),
    );
    const kills = Math.max(0, Math.floor(Number(summary?.kills) || 0));

    return Math.max(0, foundCount - kills);
  }

  private getSessionTrackedMobFoundCount(session: any, mobId?: string | null) {
    if (!mobId) {
      return 0;
    }

    const huntBatchMob = session.huntBatch?.mobs?.find(
      (item: any) => item.mobId === mobId,
    );

    if (huntBatchMob) {
      return Math.max(
        0,
        Math.floor(
          Number(huntBatchMob.remainingCount ?? huntBatchMob.foundCount) || 0,
        ),
      );
    }

    return this.getSessionMobFoundCount(session.mobSummaries ?? [], mobId);
  }

  private buildTrackedMonstersPayload(session: any) {
    const huntBatchMobs = session.huntBatch?.mobs ?? [];

    if (huntBatchMobs.length > 0) {
      return huntBatchMobs
        .filter((entry: any) => (entry.foundCount ?? 0) > 0)
        .map((entry: any) => ({
          mobId: entry.mobId,
          mobName: entry.mob?.name ?? 'AmeaÃ§a rastreada',
          mobLevel: entry.mob?.level ?? 0,
          mobTier: entry.mob?.tier ?? 0,
          encounterId: entry.encounterId ?? null,
          foundCount: Math.max(0, Math.floor(Number(entry.foundCount) || 0)),
          remainingCount: Math.max(
            0,
            Math.floor(Number(entry.remainingCount) || 0),
          ),
          weightSnapshot: Math.max(
            1,
            Math.floor(Number(entry.weightSnapshot) || 100),
          ),
          firstFoundAt: entry.firstFoundAt ?? null,
          lastFoundAt: entry.lastFoundAt ?? null,
          mob: entry.mob
            ? this.buildCurrentMobStatusPayload(
                entry.mob,
                entry.mob.hp ?? null,
                entry.mob.hp ?? null,
                {
                  survivalProjection: this.buildMobSurvivalProjection(
                    session,
                    entry.mob,
                    Math.max(
                      0,
                      Math.floor(
                        Number(entry.remainingCount ?? entry.foundCount) || 0,
                      ),
                    ),
                  ),
                },
              )
            : null,
        }));
    }

    return (session.mobSummaries ?? [])
      .filter((summary: any) => (summary.foundCount ?? 0) > 0)
      .map((summary: any) => {
        const foundCount = Math.max(
          0,
          Math.floor(Number(summary.foundCount) || 0),
        );
        const kills = Math.max(0, Math.floor(Number(summary.kills) || 0));
        const remainingCount = Math.max(0, foundCount - kills);

        return {
          mobId: summary.mobId,
          mobName: summary.mob?.name ?? 'AmeaÃ§a rastreada',
          mobLevel: summary.mob?.level ?? 0,
          mobTier: summary.mob?.tier ?? 0,
          encounterId:
            session.selectedEncounter?.mobId === summary.mobId
              ? session.selectedEncounter.id
              : null,
          foundCount,
          remainingCount,
          weightSnapshot:
            session.selectedEncounter?.mobId === summary.mobId
              ? Math.max(
                  1,
                  Math.floor(Number(session.selectedEncounter.weight) || 100),
                )
              : 100,
          firstFoundAt: null,
          lastFoundAt: null,
          mob: summary.mob
            ? this.buildCurrentMobStatusPayload(
                summary.mob,
                summary.mob.hp ?? null,
                summary.mob.hp ?? null,
                {
                  survivalProjection: this.buildMobSurvivalProjection(
                    session,
                    summary.mob,
                    remainingCount,
                  ),
                },
              )
            : null,
        };
      });
  }

  private buildEnemyInstanceId(params: {
    sessionId?: string | null;
    combatIndex?: number | null;
    mobId?: string | null;
  }) {
    const sessionId = String(params.sessionId ?? '').trim();
    const mobId = String(params.mobId ?? '').trim();
    const combatIndex = Number(params.combatIndex);

    if (
      !sessionId ||
      !mobId ||
      !Number.isFinite(combatIndex) ||
      combatIndex <= 0
    ) {
      return null;
    }

    return `${sessionId}:${Math.floor(combatIndex)}:${mobId}`;
  }

  private buildSessionTimelinePayload(
    session: {
      status: AutoCombatSessionStatus;
      phase?: AutoCombatSessionPhase | null;
      lastProcessedAt?: Date | string | null;
      endsAt?: Date | string | null;
      currentMobId?: string | null;
      currentRound?: number | null;
      roundDurationSeconds?: number | null;
    },
    currentMobHp: number | null,
    now: Date,
  ) {
    const roundDurationSeconds = this.getEffectiveRoundDurationSeconds(
      session.roundDurationSeconds,
    );
    const lastProcessedAt = session.lastProcessedAt
      ? new Date(session.lastProcessedAt)
      : null;
    const endsAt = session.endsAt ? new Date(session.endsAt) : null;
    const isActive = session.status === AutoCombatSessionStatus.ACTIVE;
    const phase = this.getSessionPhase(session, currentMobHp);
    const nextActor = this.getSessionNextActor(session, currentMobHp);
    const lastActionAt =
      lastProcessedAt && Number.isFinite(lastProcessedAt.getTime())
        ? lastProcessedAt.toISOString()
        : null;

    let nextActionAt: string | null = null;

    if (
      isActive &&
      lastProcessedAt &&
      Number.isFinite(lastProcessedAt.getTime())
    ) {
      const rawNextActionAt = this.addSeconds(
        lastProcessedAt,
        roundDurationSeconds,
      );
      const boundedNextActionAt =
        endsAt && Number.isFinite(endsAt.getTime())
          ? new Date(Math.min(rawNextActionAt.getTime(), endsAt.getTime()))
          : rawNextActionAt;

      if (boundedNextActionAt.getTime() > now.getTime()) {
        nextActionAt = boundedNextActionAt.toISOString();
      } else {
        nextActionAt = now.toISOString();
      }
    }

    return {
      phase,
      nextActor,
      lastActionAt,
      nextActionAt,
      roundDurationSeconds,
    };
  }

  private getSessionPhase(
    session: {
      status: AutoCombatSessionStatus;
      phase?: AutoCombatSessionPhase | null;
      currentMobId?: string | null;
      currentRound?: number | null;
    },
    currentMobHp: number | null,
  ): AutoCombatRealtimePhase {
    if (session.status === AutoCombatSessionStatus.DEFEATED) {
      return 'PLAYER_DEFEATED';
    }

    if (session.status !== AutoCombatSessionStatus.ACTIVE) {
      return 'FINISHED';
    }

    if (
      'phase' in session &&
      session.phase === AutoCombatSessionPhase.HUNTING
    ) {
      return 'HUNTING';
    }

    if (
      'phase' in session &&
      session.phase === AutoCombatSessionPhase.ENCOUNTER_READY
    ) {
      return 'ENCOUNTER_READY';
    }

    if (!session.currentMobId) {
      return 'SPAWNING';
    }

    if (currentMobHp !== null && currentMobHp <= 0) {
      return 'MOB_DEFEATED';
    }

    return (session.currentRound ?? 0) % 2 === 0 ? 'PLAYER_TURN' : 'MOB_TURN';
  }

  private getSessionNextActor(
    session: {
      status: AutoCombatSessionStatus;
      phase?: AutoCombatSessionPhase | null;
      currentMobId?: string | null;
      currentRound?: number | null;
    },
    currentMobHp: number | null,
  ): RealtimeActor | null {
    if (session.status !== AutoCombatSessionStatus.ACTIVE) {
      return null;
    }

    if (
      'phase' in session &&
      (session.phase === AutoCombatSessionPhase.HUNTING ||
        session.phase === AutoCombatSessionPhase.ENCOUNTER_READY)
    ) {
      return 'SYSTEM';
    }

    if (!session.currentMobId) {
      return 'SYSTEM';
    }

    if (currentMobHp !== null && currentMobHp <= 0) {
      return 'SYSTEM';
    }

    return (session.currentRound ?? 0) % 2 === 0 ? 'PLAYER' : 'MOB';
  }

  private async getLatestSessionEventSequence(
    sessionId: string,
    characterId?: string | null,
    types?: string[],
  ) {
    const latestEvent = await this.prisma.autoCombatSessionEvent.findFirst({
      where: {
        sessionId,
        ...(characterId ? { characterId } : {}),
        ...(types?.length ? { type: { in: types } } : {}),
      },
      orderBy: {
        sequence: 'desc',
      },
      select: {
        sequence: true,
      },
    });

    return latestEvent?.sequence ?? null;
  }

  private async buildSessionXpBreakdown(
    session: {
      id: string;
      totalXpGained?: number | null;
      character: {
        user?: {
          premiumUntil?: Date | string | null;
        } | null;
      };
    },
    now = new Date(),
  ): Promise<SessionXpBreakdown> {
    const totalXpGained = Math.max(0, Math.floor(session.totalXpGained ?? 0));
    const isPremium = isPremiumActive(session.character.user, now);
    const [aggregate] = await this.prisma.$queryRaw<
      Array<{
        baseXpGained: number | bigint | null;
        premiumBonusXp: number | bigint | null;
        premiumPotentialBonusXp: number | bigint | null;
        premiumTotalXp: number | bigint | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(COALESCE(("payloadJson" ->> 'baseXpGained')::int, 0)), 0) AS "baseXpGained",
        COALESCE(SUM(COALESCE(("payloadJson" ->> 'premiumBonusXp')::int, 0)), 0) AS "premiumBonusXp",
        COALESCE(SUM(COALESCE(("payloadJson" ->> 'premiumPotentialBonusXp')::int, 0)), 0) AS "premiumPotentialBonusXp",
        COALESCE(SUM(COALESCE(("payloadJson" ->> 'premiumTotalXp')::int, 0)), 0) AS "premiumTotalXp"
      FROM "auto_combat_session_events"
      WHERE "sessionId" = ${session.id}
        AND "type" = 'MOB_DEFEATED'
    `);

    let baseXpGained = this.getJsonInteger(aggregate?.baseXpGained);
    const premiumBonusXp = this.getJsonInteger(aggregate?.premiumBonusXp);
    const premiumPotentialBonusXp = this.getJsonInteger(
      aggregate?.premiumPotentialBonusXp,
    );
    let premiumTotalXp = this.getJsonInteger(aggregate?.premiumTotalXp);

    if (baseXpGained <= 0 && totalXpGained > 0) {
      baseXpGained = Math.max(0, totalXpGained - premiumBonusXp);
    }

    if (premiumTotalXp <= 0) {
      premiumTotalXp =
        baseXpGained + Math.max(premiumBonusXp, premiumPotentialBonusXp);
    }

    return {
      totalXpGained,
      baseXpGained,
      premiumBonusXp,
      premiumPotentialBonusXp,
      premiumTotalXp,
      isPremiumActive: isPremium,
    };
  }

  private buildSessionSummary(
    session: any,
    remainingSeconds: number,
    now = new Date(),
    xpBreakdown?: SessionXpBreakdown,
  ): SessionSummary {
    const status = session.status as AutoCombatSessionStatus;

    const referenceDate =
      status === AutoCombatSessionStatus.ACTIVE
        ? now
        : (session.finishedAt ?? session.endsAt ?? now);

    const elapsedSeconds = this.clampNumber(
      Math.floor(
        (referenceDate.getTime() - session.startedAt.getTime()) / 1000,
      ),
      0,
      session.durationSeconds,
    );

    const processedCombatSeconds = Math.max(
      0,
      session.totalRoundsResolved * session.roundDurationSeconds,
    );

    const unusedSeconds = Math.max(0, session.durationSeconds - elapsedSeconds);

    const totalCombats = session.totalCombatsResolved ?? 0;
    const totalRounds = session.totalRoundsResolved ?? 0;
    const totalXpGained = session.totalXpGained ?? 0;
    const progressionBreakdown = xpBreakdown ?? {
      totalXpGained,
      baseXpGained: totalXpGained,
      premiumBonusXp: 0,
      premiumPotentialBonusXp: 0,
      premiumTotalXp: totalXpGained,
      isPremiumActive: isPremiumActive(session.character.user, now),
    };
    const totalPotionsUsed = session.totalPotionsUsed ?? 0;

    const totalLootQuantity = session.loots.reduce(
      (total: number, loot: any) => total + loot.quantity,
      0,
    );

    const totalMobKills = session.mobSummaries.reduce(
      (total: number, summary: any) => total + summary.kills,
      0,
    );
    const trackedMonsters = this.buildTrackedMonstersPayload(session);
    const totalMobsFound = trackedMonsters.reduce(
      (total: number, summary: any) => total + (summary.foundCount ?? 0),
      0,
    );
    const killedMobSummaries = session.mobSummaries.filter(
      (summary: any) => (summary.kills ?? 0) > 0,
    );
    const foundMobSummaries = trackedMonsters;

    const currentHp = session.character.currentHp ?? 0;
    const maxHp = session.character.maxHp ?? 0;

    return {
      status,
      statusText: this.getSessionStatusText(status),

      isActive: status === AutoCombatSessionStatus.ACTIVE,
      stoppedManually: status === AutoCombatSessionStatus.STOPPED,
      completed: status === AutoCombatSessionStatus.FINISHED,
      defeated: status === AutoCombatSessionStatus.DEFEATED,
      survived: status !== AutoCombatSessionStatus.DEFEATED,

      duration: {
        plannedSeconds: session.durationSeconds,
        elapsedSeconds,
        processedCombatSeconds,
        remainingSeconds,
        unusedSeconds,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        finishedAt: session.finishedAt,
      },

      combat: {
        totalCombats,
        totalRounds,
        averageRoundsPerCombat:
          totalCombats > 0 ? this.roundNumber(totalRounds / totalCombats) : 0,
      },

      progression: {
        totalXpGained,
        baseXpGained: progressionBreakdown.baseXpGained,
        premiumBonusXp: progressionBreakdown.premiumBonusXp,
        premiumPotentialBonusXp: progressionBreakdown.premiumPotentialBonusXp,
        premiumTotalXp: progressionBreakdown.premiumTotalXp,
        isPremiumActive: progressionBreakdown.isPremiumActive,
        xpPerMinute:
          processedCombatSeconds > 0
            ? this.roundNumber((totalXpGained / processedCombatSeconds) * 60)
            : 0,
      },

      hp: {
        current: currentHp,
        max: maxHp,
        percent: this.calculatePercent(currentHp, maxHp),
      },

      potions: {
        used: totalPotionsUsed,
      },

      loot: {
        totalQuantity: totalLootQuantity,
        uniqueItems: session.loots.length,
        items: session.loots.map((loot: any) => ({
          itemId: loot.itemId,
          itemName: loot.item.name,
          quantity: loot.quantity,
          rarity: String(loot.item.rarity),
          slot: String(loot.item.slot),
          tier: loot.item.tier,
        })),
      },

      mobs: {
        totalKills: totalMobKills,
        totalFound: totalMobsFound,
        uniqueMobs: killedMobSummaries.length,
        uniqueFoundMobs: foundMobSummaries.length,
        kills: killedMobSummaries.map((summary: any) => ({
          mobId: summary.mobId,
          mobName: summary.mob.name,
          mobLevel: summary.mob.level,
          mobTier: summary.mob.tier,
          kills: summary.kills,
          xpGained: summary.xpGained,
          foundCount: summary.foundCount ?? 0,
        })),
        found: foundMobSummaries.map((summary: any) => ({
          mobId: summary.mobId,
          mobName: summary.mobName,
          mobLevel: summary.mobLevel,
          mobTier: summary.mobTier,
          foundCount: summary.foundCount ?? 0,
          remainingCount: summary.remainingCount ?? 0,
        })),
      },
    };
  }

  private buildProcessingSummary(
    result: RealtimeRoundResult,
    processedNow: boolean,
  ): ProcessingSummary {
    const xpPayload = this.buildCharacterXpPayload(
      result.finalLevel,
      result.finalXp,
    );

    return {
      processedNow,
      processedSeconds: result.processedSeconds,
      combatsResolved: result.combatsResolved,
      roundsResolved: result.roundsResolved,
      xpGained: result.xpGained,

      initialHp: result.initialHp,
      finalHp: result.finalCurrentHp,
      hpLost: result.hpLost,

      damageDealt: result.damageDealt,
      damageTaken: result.damageTaken,
      healingReceived: result.healingReceived,
      healingFromPotions: result.healingFromPotions,
      healingFromLevelUp: result.healingFromLevelUp,
      healingFromRest: result.healingFromRest,
      totalHealingReceived: result.totalHealingReceived,
      hpChange: result.hpChange,
      hpLostNet: result.hpLostNet,
      hpRecoveredNet: result.hpRecoveredNet,
      tookDamage: result.tookDamage,
      wasHealed: result.wasHealed,

      hp: {
        initial: result.initialHp,
        final: result.finalCurrentHp,
        maxInitial: result.initialMaxHp,
        maxFinal: result.finalMaxHp,
        maxHpGained: result.maxHpGained,
        change: result.hpChange,
        lostNet: result.hpLostNet,
        recoveredNet: result.hpRecoveredNet,
        damageTaken: result.damageTaken,
        healingReceived: result.healingReceived,
        healingFromPotions: result.healingFromPotions,
        healingFromLevelUp: result.healingFromLevelUp,
        healingFromRest: result.healingFromRest,
        totalHealingReceived: result.totalHealingReceived,
        tookDamage: result.tookDamage,
        wasHealed: result.wasHealed,
        leveledUp: result.leveledUp,
      },

      criticalHitsDealt: result.criticalHitsDealt,
      criticalHitsTaken: result.criticalHitsTaken,
      criticalBonusDamageDealt: result.criticalBonusDamageDealt,
      criticalBonusDamageTaken: result.criticalBonusDamageTaken,
      playerAttackAttempts: result.playerAttackAttempts,
      mobAttackAttempts: result.mobAttackAttempts,
      criticalRateDealt: result.criticalRateDealt,
      criticalRateTaken: result.criticalRateTaken,
      criticalDamageSharePercent: result.criticalDamageSharePercent,
      dealtCritical: result.dealtCritical,
      tookCritical: result.tookCritical,

      critical: {
        hitsDealt: result.criticalHitsDealt,
        hitsTaken: result.criticalHitsTaken,
        bonusDamageDealt: result.criticalBonusDamageDealt,
        bonusDamageTaken: result.criticalBonusDamageTaken,
        playerAttackAttempts: result.playerAttackAttempts,
        mobAttackAttempts: result.mobAttackAttempts,
        rateDealt: result.criticalRateDealt,
        rateTaken: result.criticalRateTaken,
        damageSharePercent: result.criticalDamageSharePercent,
        dealtAny: result.dealtCritical,
        tookAny: result.tookCritical,
      },

      dodgesByPlayer: result.dodgesByPlayer,
      dodgesByMob: result.dodgesByMob,
      playerDodgeRate: result.playerDodgeRate,
      mobDodgeRate: result.mobDodgeRate,
      playerDodged: result.playerDodged,
      mobDodged: result.mobDodged,

      dodge: {
        dodgesByPlayer: result.dodgesByPlayer,
        dodgesByMob: result.dodgesByMob,
        playerAttackAttempts: result.playerAttackAttempts,
        mobAttackAttempts: result.mobAttackAttempts,
        playerDodgeRate: result.playerDodgeRate,
        mobDodgeRate: result.mobDodgeRate,
        playerDodgedAny: result.playerDodged,
        mobDodgedAny: result.mobDodged,
      },

      initialMaxHp: result.initialMaxHp,
      finalMaxHp: result.finalMaxHp,
      maxHpGained: result.maxHpGained,
      initialLevel: result.initialLevel,
      finalLevel: result.finalLevel,
      levelsGained: result.levelsGained,
      leveledUp: result.leveledUp,

      finalXp: result.finalXp,
      ...xpPayload,

      potionsUsed: result.potionsUsed,
      potionItemId: result.potionItemId,
      potionItemName: result.potionItemName,
      potionTriggerPercent: result.potionTriggerPercent,
      potionQuantityBefore: result.potionQuantityBefore,
      potionQuantityAfter: result.potionQuantityAfter,
      potionQuantityRemaining: result.potionQuantityRemaining,
      potionUsedQuantity: result.potionUsedQuantity,

      catchUp: result.catchUp,
      actionsAvailable: result.actionsAvailable,
      actionsProcessed: result.actionsProcessed,
      processingLimited: result.processingLimited,
      eventsEmitted: result.eventsEmitted,
      eventsSuppressed: result.eventsSuppressed,
    };
  }

  private buildInitialProcessingSummary(params: {
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
  }): ProcessingSummary {
    const xpPayload = this.buildCharacterXpPayload(params.level, params.xp);

    return {
      processedNow: false,
      processedSeconds: 0,
      combatsResolved: 0,
      roundsResolved: 0,
      xpGained: 0,

      initialHp: params.hp,
      finalHp: params.hp,
      hpLost: 0,

      damageDealt: 0,
      damageTaken: 0,
      healingReceived: 0,
      healingFromPotions: 0,
      healingFromLevelUp: 0,
      healingFromRest: 0,
      totalHealingReceived: 0,
      hpChange: 0,
      hpLostNet: 0,
      hpRecoveredNet: 0,
      tookDamage: false,
      wasHealed: false,

      hp: {
        initial: params.hp,
        final: params.hp,
        maxInitial: params.maxHp,
        maxFinal: params.maxHp,
        maxHpGained: 0,
        change: 0,
        lostNet: 0,
        recoveredNet: 0,
        damageTaken: 0,
        healingReceived: 0,
        healingFromPotions: 0,
        healingFromLevelUp: 0,
        healingFromRest: 0,
        totalHealingReceived: 0,
        tookDamage: false,
        wasHealed: false,
        leveledUp: false,
      },

      criticalHitsDealt: 0,
      criticalHitsTaken: 0,
      criticalBonusDamageDealt: 0,
      criticalBonusDamageTaken: 0,
      playerAttackAttempts: 0,
      mobAttackAttempts: 0,
      criticalRateDealt: 0,
      criticalRateTaken: 0,
      criticalDamageSharePercent: 0,
      dealtCritical: false,
      tookCritical: false,

      critical: {
        hitsDealt: 0,
        hitsTaken: 0,
        bonusDamageDealt: 0,
        bonusDamageTaken: 0,
        playerAttackAttempts: 0,
        mobAttackAttempts: 0,
        rateDealt: 0,
        rateTaken: 0,
        damageSharePercent: 0,
        dealtAny: false,
        tookAny: false,
      },

      dodgesByPlayer: 0,
      dodgesByMob: 0,
      playerDodgeRate: 0,
      mobDodgeRate: 0,
      playerDodged: false,
      mobDodged: false,

      dodge: {
        dodgesByPlayer: 0,
        dodgesByMob: 0,
        playerAttackAttempts: 0,
        mobAttackAttempts: 0,
        playerDodgeRate: 0,
        mobDodgeRate: 0,
        playerDodgedAny: false,
        mobDodgedAny: false,
      },

      initialMaxHp: params.maxHp,
      finalMaxHp: params.maxHp,
      maxHpGained: 0,
      initialLevel: params.level,
      finalLevel: params.level,
      levelsGained: 0,
      leveledUp: false,

      finalXp: xpPayload.totalXp,
      ...xpPayload,

      potionsUsed: 0,
      potionItemId: null,
      potionItemName: null,
      potionTriggerPercent: null,
      potionQuantityBefore: null,
      potionQuantityAfter: null,
      potionQuantityRemaining: null,
      potionUsedQuantity: null,

      catchUp: false,
      actionsAvailable: 0,
      actionsProcessed: 0,
      processingLimited: false,
      eventsEmitted: 0,
      eventsSuppressed: 0,
    };
  }

  private buildEmptyProcessingSummary(): ProcessingSummary {
    return {
      processedNow: false,
      processedSeconds: 0,
      combatsResolved: 0,
      roundsResolved: 0,
      xpGained: 0,
      potionsUsed: 0,
      potionItemId: null,
      potionItemName: null,
      potionTriggerPercent: null,
      potionQuantityBefore: null,
      potionQuantityAfter: null,
      potionQuantityRemaining: null,
      potionUsedQuantity: null,

      catchUp: false,
      actionsAvailable: 0,
      actionsProcessed: 0,
      processingLimited: false,
      eventsEmitted: 0,
      eventsSuppressed: 0,
    };
  }

  private buildAutoCombatPreview(
    session: any,
    options?: {
      projectionSeconds?: number;
      iterations?: number;
    },
  ): AutoCombatPreview | null {
    const previewEncounters = this.getSessionHuntEncounters(session);

    if (previewEncounters.length === 0) {
      return null;
    }

    const equipmentItems = this.getEquipmentItems(session.character);
    const gatheringBonus = this.getGatheringBonus(session.character);
    const combatGatheringBonus = scaleAutoCombatGatheringBonus(gatheringBonus);
    const className = session.character.class?.name ?? null;

    const initialStats = calculateFullStats(
      session.character.class,
      equipmentItems,
      session.character.level,
      gatheringBonus,
    );

    const initialMaxHp = initialStats.derivedCombatStats.maxHp;

    const currentHp = this.clampHp(
      session.character.currentHp ?? initialMaxHp,
      initialMaxHp,
    );

    if (currentHp <= 0) {
      return null;
    }

    const now = new Date();
    const premiumActive = isPremiumActive(session.character.user, now);
    const maxProjectionSeconds = getIdleProgressLimitSeconds(premiumActive);

    const projectionSeconds = this.clampNumber(
      Math.floor(
        options?.projectionSeconds ??
          Math.max(0, (session.endsAt.getTime() - now.getTime()) / 1000),
      ),
      AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
      maxProjectionSeconds,
    );

    if (projectionSeconds <= 0) {
      return null;
    }

    const iterations = this.clampNumber(
      Math.floor(
        options?.iterations ?? this.getPreviewIterations(projectionSeconds),
      ),
      1,
      AUTO_COMBAT_PREVIEW_MAX_ITERATIONS,
    );
    const ttkPreview = this.buildAutoCombatTtkPreview({
      session,
      encounters: previewEncounters,
      equipmentItems,
      gatheringBonus,
      combatGatheringBonus,
      className,
      currentHp,
      initialMaxHp,
      projectionSeconds,
      iterations,
      premiumActive,
    });

    if (ttkPreview) {
      return ttkPreview;
    }

    let totalCombatsSimulated = 0;
    let totalRounds = 0;
    let totalCombatSeconds = 0;
    let totalXp = 0;

    let totalDamageDealt = 0;
    let totalDamageTaken = 0;

    let totalCriticalHitsDealt = 0;
    let totalCriticalHitsTaken = 0;
    let totalCriticalBonusDamageDealt = 0;

    let totalPlayerAttackAttempts = 0;
    let totalMobAttackAttempts = 0;

    let totalDodgesByPlayer = 0;
    let totalDodgesByMob = 0;

    let totalFinalHp = 0;
    let totalFinalHpPercent = 0;
    let defeats = 0;

    let fullProjectionCompleted = true;

    const basePotionState = this.createAutoPotionState(session.character);

    for (let iteration = 0; iteration < iterations; iteration++) {
      let simulatedHp = currentHp;
      let simulatedMaxHp = initialMaxHp;
      let simulatedLevel = session.character.level;
      let simulatedXp = session.character.xp;

      let remainingProjectionSeconds = projectionSeconds;
      let combatsThisIteration = 0;

      const potionState = this.cloneAutoPotionState(basePotionState);

      while (simulatedHp > 0 && remainingProjectionSeconds > 0) {
        if (
          combatsThisIteration >= AUTO_COMBAT_PREVIEW_MAX_COMBATS_PER_ITERATION
        ) {
          fullProjectionCompleted = false;
          break;
        }

        const currentStats = calculateFullStats(
          session.character.class,
          equipmentItems,
          simulatedLevel,
          gatheringBonus,
        );
        const currentCombatStats = calculateFullStats(
          session.character.class,
          equipmentItems,
          simulatedLevel,
          combatGatheringBonus,
        );

        simulatedMaxHp = currentStats.derivedCombatStats.maxHp;
        simulatedHp = this.clampHp(simulatedHp, simulatedMaxHp);

        const playerStats: FighterStats = {
          name: session.character.name,
          className,
          hp: simulatedHp,
          maxHp: simulatedMaxHp,
          attack: currentCombatStats.derivedCombatStats.attack,
          defense: currentCombatStats.derivedCombatStats.defense,
          speed: currentCombatStats.derivedCombatStats.speed,
          precision: currentCombatStats.totalPrimaryStats.precision,
          technique: currentCombatStats.totalPrimaryStats.technique,
          agility: currentCombatStats.totalPrimaryStats.agility,
        };

        const encounter = this.rollEncounter(previewEncounters);
        const mob = encounter.mob;
        const mobStats = this.calculateAutoCombatMobFighterStats(
          mob,
          className,
        );

        const combat = this.resolvePreviewCombat(
          playerStats,
          mobStats,
          potionState,
        );

        const combatDurationSeconds =
          combat.rounds * session.roundDurationSeconds;

        if (
          combatDurationSeconds <= 0 ||
          combatDurationSeconds > remainingProjectionSeconds
        ) {
          break;
        }

        remainingProjectionSeconds -= combatDurationSeconds;

        totalCombatsSimulated++;
        combatsThisIteration++;
        totalRounds += combat.rounds;
        totalCombatSeconds += combatDurationSeconds;

        totalDamageDealt += combat.damageDealtByPlayer;
        totalDamageTaken += combat.damageTakenByPlayer;

        totalCriticalHitsDealt += combat.criticalHitsByPlayer;
        totalCriticalHitsTaken += combat.criticalHitsByMob;
        totalCriticalBonusDamageDealt += combat.criticalBonusDamageByPlayer;

        totalPlayerAttackAttempts += combat.playerAttackAttempts;
        totalMobAttackAttempts += combat.mobAttackAttempts;

        totalDodgesByPlayer += combat.dodgesByPlayer;
        totalDodgesByMob += combat.dodgesByMob;

        simulatedHp = combat.playerEndHp;

        if (combat.winner === 'MOB') {
          simulatedHp = 0;
          break;
        }

        const penalty = calculateTierFarmPenalty(simulatedLevel, mob.tier);

        const balancedBaseXpReward = applyAutoCombatXpEfficiency({
          baseXp: applyXpPenalty(mob.xpReward, penalty.xpMultiplier),
          className,
          riskLevel: this.getAutoCombatRewardRiskLevel(
            simulatedHp,
            simulatedMaxHp,
          ),
        });
        const finalXpReward = calculatePremiumXpBreakdown(
          balancedBaseXpReward,
          premiumActive,
        ).totalXp;

        totalXp += finalXpReward;

        const levelProgress = calculateLevelProgress(
          simulatedLevel,
          simulatedXp,
          finalXpReward,
        );

        const oldLevelBeforeReward = simulatedLevel;
        const oldMaxHpBeforeReward = simulatedMaxHp;

        simulatedLevel = levelProgress.newLevel;
        simulatedXp = levelProgress.totalXp;

        const levelsGainedNow = Math.max(
          0,
          simulatedLevel - oldLevelBeforeReward,
        );

        if (levelsGainedNow > 0) {
          const newStatsAfterLevelUp = calculateFullStats(
            session.character.class,
            equipmentItems,
            simulatedLevel,
            gatheringBonus,
          );

          const newMaxHpAfterLevelUp =
            newStatsAfterLevelUp.derivedCombatStats.maxHp;

          simulatedHp = this.calculateCurrentHpAfterLevelUp({
            currentHp: simulatedHp,
            oldMaxHp: oldMaxHpBeforeReward,
            newMaxHp: newMaxHpAfterLevelUp,
            levelsGained: levelsGainedNow,
          });

          simulatedMaxHp = newMaxHpAfterLevelUp;
        }
      }

      if (simulatedHp <= 0) {
        defeats++;
      }

      totalFinalHp += simulatedHp;
      totalFinalHpPercent += this.calculatePercent(simulatedHp, simulatedMaxHp);
    }

    const averageCombatDurationSeconds =
      totalCombatsSimulated > 0
        ? this.roundNumber(totalCombatSeconds / totalCombatsSimulated)
        : 0;

    const averageRoundsPerCombat =
      totalCombatsSimulated > 0
        ? this.roundNumber(totalRounds / totalCombatsSimulated)
        : 0;

    const xpPerMinute =
      totalCombatSeconds > 0
        ? this.roundNumber((totalXp / totalCombatSeconds) * 60)
        : 0;

    const expectedFinalHp = this.clampHp(
      Math.round(totalFinalHp / iterations),
      initialMaxHp,
    );

    const expectedFinalHpPercent = this.roundNumber(
      totalFinalHpPercent / iterations,
    );

    const defeatChancePercent = this.calculatePercent(defeats, iterations);

    const damageTakenPerMinute =
      totalCombatSeconds > 0
        ? this.roundNumber((totalDamageTaken / totalCombatSeconds) * 60)
        : 0;

    const riskScore = this.calculateRiskScore({
      defeatChancePercent,
      expectedHpPercentAtEnd: expectedFinalHpPercent,
    });

    const riskLevel = this.getRiskLevel(riskScore);

    const playerCriticalChancePercent = this.calculatePercent(
      totalCriticalHitsDealt,
      totalPlayerAttackAttempts,
    );

    const mobCriticalChancePercent = this.calculatePercent(
      totalCriticalHitsTaken,
      totalMobAttackAttempts,
    );

    const criticalDamageSharePercent = this.calculatePercent(
      totalCriticalBonusDamageDealt,
      totalDamageDealt,
    );

    const playerDodgeChancePercent = this.calculatePercent(
      totalDodgesByPlayer,
      totalMobAttackAttempts,
    );

    const mobDodgeChancePercent = this.calculatePercent(
      totalDodgesByMob,
      totalPlayerAttackAttempts,
    );

    return {
      averageCombatDurationSeconds,
      averageRoundsPerCombat,
      xpPerMinute,

      risk: {
        level: riskLevel,
        score: riskScore,
        defeatChancePercent,
        expectedHpPercentAtEnd: expectedFinalHpPercent,
        damageTakenPerMinute,
      },

      critical: {
        playerCriticalChancePercent,
        mobCriticalChancePercent,
        criticalDamageSharePercent,
      },

      dodge: {
        playerDodgeChancePercent,
        mobDodgeChancePercent,
      },

      hp: {
        current: currentHp,
        max: initialMaxHp,
        expectedFinal: expectedFinalHp,
        expectedChange: expectedFinalHp - currentHp,
        expectedFinalPercent: expectedFinalHpPercent,
      },

      sample: {
        iterations,
        projectionSeconds,
        totalCombatsSimulated,
        fullRemainingSessionProjected: fullProjectionCompleted,
      },
    };
  }

  private buildAutoCombatTtkPreview(params: {
    session: any;
    encounters: any[];
    equipmentItems: any[];
    gatheringBonus: PrimaryStats;
    combatGatheringBonus: PrimaryStats;
    className: string | null;
    currentHp: number;
    initialMaxHp: number;
    projectionSeconds: number;
    iterations: number;
    premiumActive: boolean;
  }): AutoCombatPreview | null {
    if (params.encounters.length <= 0 || params.projectionSeconds <= 0) {
      return null;
    }

    const visibleStats = calculateFullStats(
      params.session.character.class,
      params.equipmentItems,
      params.session.character.level,
      params.gatheringBonus,
    );
    const combatStats = calculateFullStats(
      params.session.character.class,
      params.equipmentItems,
      params.session.character.level,
      params.combatGatheringBonus,
    );
    const maxHp = visibleStats.derivedCombatStats.maxHp;
    const currentHp = this.clampHp(params.currentHp, maxHp);
    const playerStats: FighterStats = {
      name: params.session.character.name,
      className: params.className,
      hp: currentHp,
      maxHp,
      attack: combatStats.derivedCombatStats.attack,
      defense: combatStats.derivedCombatStats.defense,
      speed: combatStats.derivedCombatStats.speed,
      precision: combatStats.totalPrimaryStats.precision,
      technique: combatStats.totalPrimaryStats.technique,
      agility: combatStats.totalPrimaryStats.agility,
    };
    const potionState = this.createAutoPotionState(params.session.character);
    const potionHealAmount = potionState
      ? applyAutoCombatPotionHealMultiplier({
          healAmount: this.calculateHealAmount({
            maxHp,
            healFlat: potionState.healFlat,
            healPercent: potionState.healPercent,
          }),
          className: params.className,
        })
      : 0;
    const projections = params.encounters.map((encounter) => {
      const mob = encounter.mob;
      const mobStats = this.calculateAutoCombatMobFighterStats(
        mob,
        params.className,
      );
      const ttk = calculateAutoCombatTtk({
        mob,
        playerStats,
      });
      const projectedKills = Math.max(
        1,
        Math.floor(params.projectionSeconds / ttk.estimatedKillTimeSeconds),
      );
      const survival = projectAutoCombatSurvival({
        currentHp,
        maxHp,
        playerDefense: playerStats.defense,
        playerAgility: playerStats.agility,
        mobAttack: mobStats.attack,
        mobPrecision: mobStats.precision,
        mobTechnique: mobStats.technique,
        projectedKills,
        potion: potionState
          ? {
              availableQuantity: potionState.availableQuantity,
              healAmount: potionHealAmount,
              hpThresholdPercent: potionState.hpThresholdPercent,
            }
          : null,
      });
      const penalty = calculateTierFarmPenalty(
        params.session.character.level,
        mob.tier,
      );
      const balancedBaseXpReward = applyAutoCombatXpEfficiency({
        baseXp: applyXpPenalty(mob.xpReward, penalty.xpMultiplier),
        className: params.className,
        riskLevel: survival.riskLevel,
      });
      const finalXpReward = calculatePremiumXpBreakdown(
        balancedBaseXpReward,
        params.premiumActive,
      ).totalXp;

      return {
        ttk,
        survival,
        projectedKills,
        finalXpReward,
      };
    });
    const divisor = Math.max(1, projections.length);
    const averageCombatDurationSeconds = this.roundNumber(
      projections.reduce(
        (total, projection) => total + projection.ttk.estimatedKillTimeSeconds,
        0,
      ) / divisor,
    );
    const averageRoundsPerCombat = this.roundNumber(
      averageCombatDurationSeconds /
        Math.max(1, params.session.roundDurationSeconds),
    );
    const xpPerMinute = this.roundNumber(
      projections.reduce(
        (total, projection) =>
          total +
          (projection.finalXpReward /
            Math.max(1, projection.ttk.estimatedKillTimeSeconds)) *
            60,
        0,
      ) / divisor,
    );
    const expectedFinalHpPercent = this.roundNumber(
      projections.reduce(
        (total, projection) =>
          total + projection.survival.projectedFinalHpPercent,
        0,
      ) / divisor,
    );
    const expectedFinalHp = this.clampHp(
      Math.round((maxHp * expectedFinalHpPercent) / 100),
      maxHp,
    );
    const defeatChancePercent = this.calculatePercent(
      projections.filter(
        (projection) => !projection.survival.willSurviveProjection,
      ).length,
      divisor,
    );
    const damageTakenPerMinute = this.roundNumber(
      projections.reduce(
        (total, projection) =>
          total +
          (projection.survival.expectedDamagePerKill /
            Math.max(1, projection.ttk.estimatedKillTimeSeconds)) *
            60,
        0,
      ) / divisor,
    );
    const riskScore = this.calculateRiskScore({
      defeatChancePercent,
      expectedHpPercentAtEnd: expectedFinalHpPercent,
    });
    const riskLevel = this.getRiskLevel(riskScore);
    const totalCombatsSimulated =
      Math.floor(
        params.projectionSeconds / Math.max(1, averageCombatDurationSeconds),
      ) * params.iterations;
    const playerCriticalChancePercent = this.roundNumber(
      Math.min(65, Math.max(0, playerStats.technique / 3)),
    );
    const averageMobCriticalChancePercent = this.roundNumber(
      projections.reduce(
        (total, projection) =>
          total + projection.survival.expectedCriticalChancePercent,
        0,
      ) / divisor,
    );
    const playerDodgeChancePercent = this.roundNumber(
      projections.reduce(
        (total, projection) =>
          total + projection.survival.expectedDodgeChancePercent,
        0,
      ) / divisor,
    );

    return {
      averageCombatDurationSeconds,
      averageRoundsPerCombat,
      xpPerMinute,

      risk: {
        level: riskLevel,
        score: riskScore,
        defeatChancePercent,
        expectedHpPercentAtEnd: expectedFinalHpPercent,
        damageTakenPerMinute,
      },

      critical: {
        playerCriticalChancePercent,
        mobCriticalChancePercent: averageMobCriticalChancePercent,
        criticalDamageSharePercent: playerCriticalChancePercent,
      },

      dodge: {
        playerDodgeChancePercent,
        mobDodgeChancePercent: 0,
      },

      hp: {
        current: currentHp,
        max: maxHp,
        expectedFinal: expectedFinalHp,
        expectedChange: expectedFinalHp - currentHp,
        expectedFinalPercent: expectedFinalHpPercent,
      },

      sample: {
        iterations: params.iterations,
        projectionSeconds: params.projectionSeconds,
        totalCombatsSimulated,
        fullRemainingSessionProjected: true,
      },
    };
  }

  private resolvePreviewCombat(
    player: FighterStats,
    mob: FighterStats,
    autoPotionState?: AutoPotionState | null,
  ): CombatSimulationResult {
    let playerHp = player.hp;
    let mobHp = mob.hp;

    let round = 1;
    const maxRounds = 60;

    let potionUsedThisCombat = false;

    let damageDealtByPlayer = 0;
    let damageTakenByPlayer = 0;
    let healingReceivedByPlayer = 0;

    let playerAttackAttempts = 0;
    let mobAttackAttempts = 0;

    let criticalHitsByPlayer = 0;
    let criticalHitsByMob = 0;
    let criticalBonusDamageByPlayer = 0;
    let criticalBonusDamageByMob = 0;

    let dodgesByPlayer = 0;
    let dodgesByMob = 0;

    const tryPotion = () => {
      if (potionUsedThisCombat) {
        return;
      }

      const potion = this.tryUseAutoPotion({
        currentHp: playerHp,
        maxHp: player.maxHp,
        autoPotionState,
        potionUsedThisCombat,
        className: player.className,
      });

      if (potion.used) {
        playerHp = potion.newHp;
        healingReceivedByPlayer += potion.healedAmount;
        potionUsedThisCombat = true;
      }
    };

    const playerAttack = () => {
      const attack = this.resolveAttack({
        attacker: player,
        defender: mob,
        targetCurrentHp: mobHp,
        targetMaxHp: mob.maxHp,
      });

      playerAttackAttempts++;
      mobHp = attack.nextTargetHp;
      damageDealtByPlayer += attack.damage;

      if (attack.isDodged) {
        dodgesByMob++;
        return;
      }

      if (attack.isCritical) {
        criticalHitsByPlayer++;
        criticalBonusDamageByPlayer += attack.criticalBonusDamage;
      }
    };

    const mobAttack = () => {
      const hpBeforeAttack = playerHp;

      const attack = this.resolveAttack({
        attacker: mob,
        defender: player,
        targetCurrentHp: playerHp,
        targetMaxHp: player.maxHp,
      });

      mobAttackAttempts++;
      playerHp = attack.nextTargetHp;
      damageTakenByPlayer += attack.damage;

      if (attack.isDodged) {
        dodgesByPlayer++;
        return;
      }

      if (attack.isCritical) {
        criticalHitsByMob++;
        criticalBonusDamageByMob += attack.criticalBonusDamage;
      }

      const tookRealDamage = hpBeforeAttack > playerHp;

      if (tookRealDamage && playerHp > 0) {
        tryPotion();
      }
    };

    while (playerHp > 0 && mobHp > 0 && round <= maxRounds) {
      if (round % 2 === 1) {
        playerAttack();
      } else {
        mobAttack();
      }

      round++;
    }

    const roundsUsed = Math.max(1, round - 1);
    const playerEndHp = Math.max(0, playerHp);
    const mobEndHp = Math.max(0, mobHp);

    let winner: CombatWinner;

    if (mobEndHp <= 0) {
      winner = 'PLAYER';
    } else if (playerEndHp <= 0) {
      winner = 'MOB';
    } else {
      winner = playerEndHp >= mobEndHp ? 'PLAYER' : 'MOB';
    }

    return {
      winner,
      rounds: roundsUsed,
      playerStartHp: player.hp,
      playerEndHp,
      mobEndHp,

      damageDealtByPlayer,
      damageTakenByPlayer,
      healingReceivedByPlayer,

      playerAttackAttempts,
      mobAttackAttempts,

      criticalHitsByPlayer,
      criticalHitsByMob,
      criticalBonusDamageByPlayer,
      criticalBonusDamageByMob,

      dodgesByPlayer,
      dodgesByMob,
    };
  }

  private resolveAttack(params: {
    attacker: FighterStats;
    defender: FighterStats;
    targetCurrentHp: number;
    targetMaxHp: number;
  }): AttackResolution {
    const hit = this.calculateHit(params.attacker, params.defender);

    if (hit.isDodged) {
      return {
        nextTargetHp: params.targetCurrentHp,
        damage: 0,
        isCritical: false,
        isDodged: true,
        criticalBonusDamage: 0,
      };
    }

    const nextTargetHp = this.clampHp(
      params.targetCurrentHp - hit.finalDamage,
      params.targetMaxHp,
    );

    const effectiveDamage = Math.max(0, params.targetCurrentHp - nextTargetHp);

    return {
      nextTargetHp,
      damage: effectiveDamage,
      isCritical: hit.isCritical,
      isDodged: false,
      criticalBonusDamage: hit.criticalBonusDamage,
    };
  }

  private buildRealtimeEvent(params: {
    context: CombatRealtimeContext;
    type: AutoCombatRealtimeEventType;
    message: string;

    mobCurrentHp: number;
    mobMaxHp: number;

    characterCurrentHp: number;
    characterMaxHp: number;

    damage?: number;
    healedAmount?: number;
    isCritical?: boolean;
    isDodged?: boolean;
    hpBefore?: number | null;
    hpAfter?: number | null;
    targetHpBefore?: number | null;
    targetHpAfter?: number | null;
    mobHpBefore?: number | null;
    mobHpAfter?: number | null;
    characterHpBefore?: number | null;
    characterHpAfter?: number | null;

    xpGained?: number;
    baseXpGained?: number;
    premiumBonusXp?: number;
    premiumPotentialBonusXp?: number;
    premiumTotalXp?: number;
    isPremiumActive?: boolean;
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
    levelProgress?: XpProgressSnapshot['levelProgress'];

    leveledUp?: boolean;
    levelsGained?: number;

    round?: number;
    combatIndex?: number;
    actor?: RealtimeActor;
    target?: RealtimeTarget;
    turnId?: string | null;
    actionId?: string | null;
    actionOrder?: number | null;
    phase?: AutoCombatRealtimePhase;
    sessionStatus?: AutoCombatSessionStatus | string | null;
    endReason?: string | null;
    shouldRedirectToInfirmary?: boolean;
    nextActor?: RealtimeActor | null;
    actionStartedAt?: string | Date | null;
    nextActionAt?: string | Date | null;

    mobId?: string;
    mobName?: string;
    enemyInstanceId?: string | null;
    battleProgressSeconds?: number;
    battleProgressPercent?: number;
    cycleStartedAt?: string | Date | null;
    cycleDurationMs?: number;
    cycleDurationSeconds?: number;
    progressUpdatedAt?: string | Date | null;
    estimatedKillTimeSeconds?: number;
    baseKillTimeSeconds?: number;
    playerOffensivePower?: number;
    monsterRecommendedPower?: number;
    killsPerMinute?: number;
    killsPerHour?: number;
    difficultyLabel?: string;
    mobIndex?: number;
    battleTargetMobId?: string | null;
    battleTargetEncounterId?: string | null;
    battleTargetTotal?: number | null;
    battleTargetRemaining?: number | null;

    totalCombats?: number;
    totalRounds?: number;
    totalKills?: number;
    totalXpGained?: number;
    totalLoot?: number;
    potionsUsed?: number;

    potionItemId?: string | null;
    potionItemName?: string | null;
    potionTriggerPercent?: number | null;

    potionQuantityBefore?: number | null;
    potionQuantityAfter?: number | null;
    potionQuantityRemaining?: number | null;
    potionUsedQuantity?: number | null;
  }): AutoCombatRealtimeEvent {
    const mobCurrentHp = this.clampHp(params.mobCurrentHp, params.mobMaxHp);
    const characterCurrentHp = this.clampHp(
      params.characterCurrentHp,
      params.characterMaxHp,
    );

    const mobId = params.mobId ?? params.context.mobId;
    const mobName = params.mobName ?? params.context.mobName;
    const combatIndex = params.combatIndex ?? params.context.combatIndex;
    const enemyInstanceId =
      params.enemyInstanceId ??
      params.context.enemyInstanceId ??
      this.buildEnemyInstanceId({
        sessionId: params.context.sessionId,
        combatIndex,
        mobId,
      });
    const createdAt = new Date().toISOString();
    const actionStartedAt = this.toOptionalIsoString(params.actionStartedAt);
    const nextActionAt = this.toOptionalIsoString(params.nextActionAt);
    const progressUpdatedAt =
      this.toOptionalIsoString(params.progressUpdatedAt) ?? createdAt;
    const progressUpdatedAtDate = new Date(progressUpdatedAt);
    const battleProgressSeconds = Math.max(
      0,
      Number(params.battleProgressSeconds) || 0,
    );
    const estimatedKillTimeSeconds = Math.max(
      0,
      Math.ceil(Number(params.estimatedKillTimeSeconds) || 0),
    );
    const rawCycleDurationMs =
      Number(params.cycleDurationMs) ||
      (params.cycleDurationSeconds
        ? Number(params.cycleDurationSeconds) * 1000
        : estimatedKillTimeSeconds > 0
          ? estimatedKillTimeSeconds * 1000
          : 0);
    const cycleDurationMs =
      rawCycleDurationMs > 0
        ? Math.max(1, Math.ceil(rawCycleDurationMs / 1000)) * 1000
        : undefined;
    const cycleStartedAt =
      this.toOptionalIsoString(params.cycleStartedAt) ??
      (cycleDurationMs && Number.isFinite(progressUpdatedAtDate.getTime())
        ? new Date(
            progressUpdatedAtDate.getTime() - battleProgressSeconds * 1000,
          ).toISOString()
        : null);

    return {
      characterId: params.context.characterId,
      sessionId: params.context.sessionId,
      enemyInstanceId,
      turnId: params.turnId ?? null,
      actionId: params.actionId ?? null,
      actionOrder: params.actionOrder ?? null,
      phase: params.phase ?? this.getRealtimePhaseFromEventType(params.type),
      sessionStatus: params.sessionStatus ?? null,
      endReason: params.endReason ?? null,
      shouldRedirectToInfirmary:
        params.shouldRedirectToInfirmary ?? params.type === 'PLAYER_DEFEATED',
      nextActor: params.nextActor ?? null,
      serverTime: createdAt,
      actionStartedAt,
      nextActionAt,
      type: params.type,
      message: params.message,

      mobId,
      mobName,
      mobCurrentHp,
      mobMaxHp: params.mobMaxHp,
      mobHpPercent: this.calculatePercent(mobCurrentHp, params.mobMaxHp),
      battleProgressSeconds: params.battleProgressSeconds,
      battleProgressPercent: params.battleProgressPercent,
      cycleStartedAt,
      cycleDurationMs,
      cycleDurationSeconds: cycleDurationMs
        ? cycleDurationMs / 1000
        : undefined,
      progressUpdatedAt,
      estimatedKillTimeSeconds:
        estimatedKillTimeSeconds > 0 ? estimatedKillTimeSeconds : undefined,
      baseKillTimeSeconds: params.baseKillTimeSeconds,
      playerOffensivePower: params.playerOffensivePower,
      monsterRecommendedPower: params.monsterRecommendedPower,
      killsPerMinute: params.killsPerMinute,
      killsPerHour: params.killsPerHour,
      difficultyLabel: params.difficultyLabel,
      mobIndex: params.mobIndex,
      battleTargetMobId: params.battleTargetMobId,
      battleTargetEncounterId: params.battleTargetEncounterId,
      battleTargetTotal: params.battleTargetTotal,
      battleTargetRemaining: params.battleTargetRemaining,

      characterCurrentHp,
      characterMaxHp: params.characterMaxHp,
      characterHpPercent: this.calculatePercent(
        characterCurrentHp,
        params.characterMaxHp,
      ),

      damage: params.damage ?? 0,
      healedAmount: params.healedAmount ?? 0,
      isCritical: params.isCritical ?? false,
      isDodged: params.isDodged ?? false,
      hpBefore: params.hpBefore ?? null,
      hpAfter: params.hpAfter ?? null,
      targetHpBefore: params.targetHpBefore ?? params.hpBefore ?? null,
      targetHpAfter: params.targetHpAfter ?? params.hpAfter ?? null,
      mobHpBefore: params.mobHpBefore ?? null,
      mobHpAfter: params.mobHpAfter ?? mobCurrentHp,
      characterHpBefore: params.characterHpBefore ?? null,
      characterHpAfter: params.characterHpAfter ?? characterCurrentHp,

      xpGained: params.xpGained,
      baseXpGained: params.baseXpGained,
      premiumBonusXp: params.premiumBonusXp,
      premiumPotentialBonusXp: params.premiumPotentialBonusXp,
      premiumTotalXp: params.premiumTotalXp,
      isPremiumActive: params.isPremiumActive,
      characterXp: params.characterXp,
      characterLevel: params.characterLevel,

      totalXp: params.totalXp,
      currentLevelXp: params.currentLevelXp,
      xpToNextLevel: params.xpToNextLevel,
      nextLevelXp: params.nextLevelXp,
      xpProgressPercent: params.xpProgressPercent,
      xpIntoCurrentLevel: params.xpIntoCurrentLevel,
      xpNeededForNextLevel: params.xpNeededForNextLevel,
      currentLevelStartXp: params.currentLevelStartXp,
      nextLevelRequiredXp: params.nextLevelRequiredXp,
      isAtLevelCap: params.isAtLevelCap,
      levelProgress: params.levelProgress,

      leveledUp: params.leveledUp,
      levelsGained: params.levelsGained,

      totalCombats: params.totalCombats,
      totalRounds: params.totalRounds,
      totalKills: params.totalKills,
      totalXpGained: params.totalXpGained,
      totalLoot: params.totalLoot,
      potionsUsed: params.potionsUsed,

      potionItemId: params.potionItemId,
      potionItemName: params.potionItemName,
      potionTriggerPercent: params.potionTriggerPercent,

      potionQuantityBefore: params.potionQuantityBefore,
      potionQuantityAfter: params.potionQuantityAfter,
      potionQuantityRemaining: params.potionQuantityRemaining,
      potionUsedQuantity: params.potionUsedQuantity,

      round: params.round,
      combatIndex,
      actor: params.actor,
      target: params.target,

      createdAt,
    };
  }

  private normalizeRealtimeEventForStorage(
    event: AutoCombatRealtimeEvent,
  ): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
  }

  private toOptionalIsoString(value?: string | Date | null) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }

    const parsed = new Date(value);

    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  private getRealtimePhaseFromEventType(
    type: AutoCombatRealtimeEventType,
  ): AutoCombatRealtimePhase {
    switch (type) {
      case 'HUNT_TARGET_FOUND':
        return 'HUNTING';
      case 'MOB_SPAWNED':
        return 'SPAWNING';
      case 'PLAYER_HIT':
        return 'PLAYER_TURN';
      case 'MOB_HIT':
        return 'MOB_TURN';
      case 'POTION_USED':
        return 'PLAYER_TURN';
      case 'MOB_DEFEATED':
        return 'MOB_DEFEATED';
      case 'PLAYER_DEFEATED':
        return 'PLAYER_DEFEATED';
      default:
        return 'IDLE';
    }
  }

  private getHuntingXpToNextLevel(level: number) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

    if (safeLevel >= AUTO_COMBAT_HUNTING_LEVEL_CAP) {
      return null;
    }

    return (
      AUTO_COMBAT_HUNTING_XP_BASE_TO_NEXT_LEVEL +
      safeLevel * AUTO_COMBAT_HUNTING_XP_LINEAR_SCALE +
      Math.floor(
        Math.pow(safeLevel, AUTO_COMBAT_HUNTING_XP_POWER_EXPONENT) *
          AUTO_COMBAT_HUNTING_XP_POWER_SCALE,
      )
    );
  }

  private getHuntingSecondsPerEnemy(level: number) {
    return getAutoCombatHuntingSecondsPerEnemy(level);
  }

  private getHuntingMaxTrackedEnemies(level: number) {
    const safeLevel = this.clampNumber(
      Math.floor(Number(level) || 1),
      1,
      AUTO_COMBAT_HUNTING_LEVEL_CAP,
    );
    const levelOffset = safeLevel - 1;

    return (
      AUTO_COMBAT_HUNTING_BASE_MAX_TRACKED_ENEMIES +
      levelOffset * AUTO_COMBAT_HUNTING_MAX_TRACKED_LINEAR_GAIN +
      Math.floor(
        Math.pow(levelOffset, AUTO_COMBAT_HUNTING_MAX_TRACKED_POWER_EXPONENT) *
          AUTO_COMBAT_HUNTING_MAX_TRACKED_POWER_SCALE,
      )
    );
  }

  private buildHuntingTimingViewModel(
    session: {
      phase?: AutoCombatSessionPhase | null;
      startedAt?: Date | string | null;
      huntStartedAt?: Date | string | null;
      lastHuntProcessedAt?: Date | string | null;
      foundEnemiesCount?: number | null;
      selectedEncounterId?: string | null;
      selectedEncounterMobId?: string | null;
    },
    huntingSkill: {
      secondsPerEnemy?: number | null;
    },
    now: Date,
  ) {
    const secondsPerFind = Math.max(
      1,
      Math.floor(
        Number(
          huntingSkill.secondsPerEnemy ??
            AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY,
        ) || AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY,
      ),
    );
    const startedAt = new Date(
      session.huntStartedAt ?? session.startedAt ?? now,
    );
    const safeStartedAt = Number.isFinite(startedAt.getTime())
      ? startedAt
      : now;
    const lastFindAt = new Date(session.lastHuntProcessedAt ?? safeStartedAt);
    const safeLastFindAt = Number.isFinite(lastFindAt.getTime())
      ? lastFindAt
      : safeStartedAt;
    const nextFindAt = this.addSeconds(safeLastFindAt, secondsPerFind);
    const isHunting = session.phase === AutoCombatSessionPhase.HUNTING;
    const isEncounterReady =
      session.phase === AutoCombatSessionPhase.ENCOUNTER_READY;
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now.getTime() - safeLastFindAt.getTime()) / 1000),
    );
    const remainingSeconds = isHunting
      ? Math.max(0, Math.ceil((nextFindAt.getTime() - now.getTime()) / 1000))
      : 0;
    const progressPercent = isEncounterReady
      ? 100
      : this.clampNumber(
          Math.floor((elapsedSeconds / secondsPerFind) * 100),
          0,
          100,
        );
    const foundEnemySequence = Math.max(
      0,
      Math.floor(Number(session.foundEnemiesCount) || 0),
    );

    return {
      startedAt: safeStartedAt,
      lastFindAt: safeLastFindAt,
      nextFindAt,
      secondsPerFind,
      elapsedSeconds,
      remainingSeconds,
      progressPercent,
      foundEnemySequence,
      currentTargetSequence: Math.max(1, foundEnemySequence),
      targetEncounterId: session.selectedEncounterId ?? null,
      targetMobId: session.selectedEncounterMobId ?? null,
    };
  }

  private getHuntingXpProgressPercent(
    xp: number,
    xpToNextLevel: number | null,
  ) {
    if (!xpToNextLevel || xpToNextLevel <= 0) {
      return 100;
    }

    return Math.max(0, Math.min(100, Math.floor((xp / xpToNextLevel) * 100)));
  }

  private calculateHuntingSkillProgress(
    skill: {
      id: string;
      characterId: string;
      level: number;
      xp: number;
      totalXp: number;
    },
    xpGained: number,
  ) {
    const safeXpGained = Math.max(0, Math.floor(Number(xpGained) || 0));
    let level = Math.max(1, Math.floor(Number(skill.level) || 1));
    let xp = Math.max(0, Math.floor(Number(skill.xp) || 0)) + safeXpGained;
    const totalXp =
      Math.max(0, Math.floor(Number(skill.totalXp) || 0)) + safeXpGained;

    while (level < AUTO_COMBAT_HUNTING_LEVEL_CAP) {
      const xpToNextLevel = this.getHuntingXpToNextLevel(level);

      if (!xpToNextLevel || xp < xpToNextLevel) {
        break;
      }

      xp -= xpToNextLevel;
      level++;
    }

    if (level >= AUTO_COMBAT_HUNTING_LEVEL_CAP) {
      level = AUTO_COMBAT_HUNTING_LEVEL_CAP;
      xp = 0;
    }

    const xpToNextLevel = this.getHuntingXpToNextLevel(level);

    return {
      ...skill,
      level,
      xp,
      totalXp,
      xpToNextLevel,
      xpProgressPercent: this.getHuntingXpProgressPercent(xp, xpToNextLevel),
      isAtLevelCap: level >= AUTO_COMBAT_HUNTING_LEVEL_CAP,
    };
  }

  private buildHuntingSkillViewModel(skill: {
    id: string;
    characterId: string;
    level: number;
    xp: number;
    totalXp: number;
  }) {
    const xpToNextLevel = this.getHuntingXpToNextLevel(skill.level);
    const secondsPerEnemy = this.getHuntingSecondsPerEnemy(skill.level);
    const maxTrackedEnemies = this.getHuntingMaxTrackedEnemies(skill.level);
    const speedPercent = Math.max(
      0,
      Math.floor(
        (1 - secondsPerEnemy / AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY) *
          100,
      ),
    );

    return {
      id: skill.id,
      characterId: skill.characterId,
      level: skill.level,
      xp: skill.xp,
      totalXp: skill.totalXp,
      xpToNextLevel,
      xpProgressPercent: this.getHuntingXpProgressPercent(
        skill.xp,
        xpToNextLevel,
      ),
      isAtLevelCap: skill.level >= AUTO_COMBAT_HUNTING_LEVEL_CAP,
      secondsPerEnemy,
      maxTrackedEnemies,
      bonuses: {
        betterEncounterChancePercent: Math.min(
          75,
          Math.max(0, Math.floor((skill.level - 1) * 1.5)),
        ),
        speedPercent,
      },
    };
  }

  private async getOrCreateHuntingSkill(characterId: string) {
    return this.prisma.characterHuntingSkill.upsert({
      where: {
        characterId,
      },
      update: {},
      create: {
        characterId,
        level: 1,
        xp: 0,
        totalXp: 0,
      },
    });
  }

  private async persistRealtimeEvents(
    characterId: string,
    events: AutoCombatRealtimeEvent[],
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.persistRealtimeEventsInTransaction(tx, characterId, events);
    });
  }

  private async persistRealtimeEventsInTransaction(
    tx: Prisma.TransactionClient,
    characterId: string,
    events: AutoCombatRealtimeEvent[],
  ) {
    const validEvents = events.filter((event) => {
      return Boolean(event.sessionId && event.type);
    });

    if (validEvents.length <= 0) {
      return;
    }

    const eventsBySessionId = new Map<string, AutoCombatRealtimeEvent[]>();

    for (const event of validEvents) {
      const sessionId = event.sessionId;

      if (!sessionId) {
        continue;
      }

      const currentEvents = eventsBySessionId.get(sessionId) ?? [];

      currentEvents.push(event);
      eventsBySessionId.set(sessionId, currentEvents);
    }

    for (const [sessionId, sessionEvents] of eventsBySessionId.entries()) {
      const latestEvent = await tx.autoCombatSessionEvent.findFirst({
        where: {
          sessionId,
        },
        orderBy: {
          sequence: 'desc',
        },
        select: {
          sequence: true,
        },
      });

      const nextSequence = (latestEvent?.sequence ?? 0) + 1;

      await tx.autoCombatSessionEvent.createMany({
        data: sessionEvents.map((event, index) => {
          const sequence = nextSequence + index;
          const eventKey =
            event.eventKey ?? event.huntCycleKey ?? event.actionId ?? null;

          event.sequence = sequence;

          return {
            sessionId,
            characterId: event.characterId ?? characterId,
            type: String(event.type ?? 'UNKNOWN'),
            sequence,
            eventKey,
            payloadJson: this.normalizeRealtimeEventForStorage(event),
          };
        }),
        skipDuplicates: true,
      });

      await this.pruneOldRealtimeEvents(tx, sessionId);
    }
  }

  private async pruneOldRealtimeEvents(tx: any, sessionId: string) {
    const oldEvents = await tx.autoCombatSessionEvent.findMany({
      where: {
        sessionId,
      },
      orderBy: {
        sequence: 'desc',
      },
      skip: AUTO_COMBAT_STORED_EVENTS_LIMIT,
      select: {
        id: true,
      },
    });

    if (oldEvents.length <= 0) {
      return;
    }

    await tx.autoCombatSessionEvent.deleteMany({
      where: {
        id: {
          in: oldEvents.map((event: { id: string }) => event.id),
        },
      },
    });
  }

  private emitRealtimeEvents(
    characterId: string,
    events: AutoCombatRealtimeEvent[],
    options?: { persist?: boolean },
  ) {
    if (options?.persist !== false) {
      void this.persistRealtimeEvents(characterId, events).catch(() => {
        /**
         * O histórico de eventos é uma camada auxiliar.
         * Se falhar, não pode quebrar o auto-combate em tempo real.
         */
      });
    }

    for (const event of events) {
      switch (event.type) {
        case 'MOB_SPAWNED':
          this.autoCombatGateway.emitMobSpawned(characterId, event);
          break;

        case 'PLAYER_HIT':
        case 'MOB_HIT':
        case 'DODGE':
          this.autoCombatGateway.emitHit(characterId, event);
          break;

        case 'POTION_USED':
          this.autoCombatGateway.emitPotionUsed(characterId, event);
          break;

        case 'MOB_DEFEATED':
          this.autoCombatGateway.emitMobDefeated(characterId, event);
          break;

        case 'PLAYER_DEFEATED':
          this.autoCombatGateway.emitPlayerDefeated(characterId, event);
          break;

        default:
          break;
      }
    }
  }

  private createAutoPotionState(character: any): AutoPotionState | null {
    const config = character.potionConfig;

    if (!config || !config.enabled || !config.useInAutoCombat) {
      return null;
    }

    const potionItem = config.potionItem;

    if (!potionItem) {
      return null;
    }

    if (potionItem.slot !== ItemSlot.CONSUMABLE) {
      return null;
    }

    if (!potionItem.usableInCombat) {
      return null;
    }

    if (potionItem.healFlat <= 0 && potionItem.healPercent <= 0) {
      return null;
    }

    const inventoryItem = character.inventoryItems?.find(
      (currentInventoryItem: any) =>
        currentInventoryItem.itemId === potionItem.id &&
        currentInventoryItem.type === InventoryItemType.CONSUMABLE,
    );

    const availableQuantity = inventoryItem?.quantity ?? 0;

    if (availableQuantity <= 0) {
      return null;
    }

    return {
      enabled: true,
      potionItemId: potionItem.id,
      potionItemName: potionItem.name,
      hpThresholdPercent: this.clampNumber(
        config.hpThresholdPercent ?? 35,
        1,
        100,
      ),
      healFlat: potionItem.healFlat,
      healPercent: potionItem.healPercent,
      availableQuantity,
      usedQuantity: 0,
      totalHealed: 0,
    };
  }

  private tryUseAutoPotion(params: {
    currentHp: number;
    maxHp: number;
    autoPotionState?: AutoPotionState | null;
    potionUsedThisCombat?: boolean;
    className?: string | null;
  }): AutoPotionUseResult {
    const {
      currentHp,
      maxHp,
      autoPotionState,
      potionUsedThisCombat = false,
      className = null,
    } = params;

    if (!autoPotionState) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: null,
        quantityAfter: null,
        usedQuantity: null,
      };
    }

    if (potionUsedThisCombat) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: autoPotionState.availableQuantity,
        quantityAfter: autoPotionState.availableQuantity,
        usedQuantity: 0,
      };
    }

    if (autoPotionState.availableQuantity <= 0) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: autoPotionState.availableQuantity,
        quantityAfter: autoPotionState.availableQuantity,
        usedQuantity: 0,
      };
    }

    if (currentHp <= 0) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: autoPotionState.availableQuantity,
        quantityAfter: autoPotionState.availableQuantity,
        usedQuantity: 0,
      };
    }

    if (maxHp <= 0) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: autoPotionState.availableQuantity,
        quantityAfter: autoPotionState.availableQuantity,
        usedQuantity: 0,
      };
    }

    if (currentHp >= maxHp) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: autoPotionState.availableQuantity,
        quantityAfter: autoPotionState.availableQuantity,
        usedQuantity: 0,
      };
    }

    const safeThresholdPercent = this.clampNumber(
      autoPotionState.hpThresholdPercent,
      1,
      100,
    );

    const thresholdHp = Math.floor((maxHp * safeThresholdPercent) / 100);

    if (currentHp > thresholdHp) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: autoPotionState.availableQuantity,
        quantityAfter: autoPotionState.availableQuantity,
        usedQuantity: 0,
      };
    }

    const healAmount = applyAutoCombatPotionHealMultiplier({
      healAmount: this.calculateHealAmount({
        maxHp,
        healFlat: autoPotionState.healFlat,
        healPercent: autoPotionState.healPercent,
      }),
      className,
    });

    const newHp = this.clampHp(currentHp + healAmount, maxHp);
    const healedAmount = newHp - currentHp;

    if (healedAmount <= 0) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
        quantityBefore: autoPotionState.availableQuantity,
        quantityAfter: autoPotionState.availableQuantity,
        usedQuantity: 0,
      };
    }

    const quantityBefore = autoPotionState.availableQuantity;

    autoPotionState.availableQuantity -= 1;
    autoPotionState.usedQuantity += 1;
    autoPotionState.totalHealed += healedAmount;

    const quantityAfter = autoPotionState.availableQuantity;

    return {
      used: true,
      newHp,
      healedAmount,
      quantityBefore,
      quantityAfter,
      usedQuantity: 1,
    };
  }

  private calculateHealAmount(params: {
    maxHp: number;
    healFlat: number;
    healPercent: number;
  }) {
    const percentHeal = Math.floor((params.maxHp * params.healPercent) / 100);

    return params.healFlat + percentHeal;
  }

  private cloneAutoPotionState(
    autoPotionState?: AutoPotionState | null,
  ): AutoPotionState | null {
    if (!autoPotionState) {
      return null;
    }

    return {
      ...autoPotionState,
      availableQuantity: autoPotionState.availableQuantity,
      usedQuantity: 0,
      totalHealed: 0,
    };
  }

  private getPotionCombatKey(sessionId: string, combatIndex: number) {
    return `${sessionId}:${combatIndex}`;
  }

  private clearPotionUsageForSession(sessionId: string) {
    for (const key of Array.from(this.potionUsageByCombat)) {
      if (key.startsWith(`${sessionId}:`)) {
        this.potionUsageByCombat.delete(key);
      }
    }
  }

  private resolveBattleSelection(
    session: any,
    startBattleDto?: StartAutoCombatBattleDto,
  ) {
    const encounters = this.getSessionHuntEncounters(session);
    const requestedMobId = startBattleDto?.mobId?.trim() || null;
    const requestedEncounterId = startBattleDto?.encounterId?.trim() || null;
    const requestedQuantity =
      startBattleDto?.quantity !== undefined
        ? Math.max(1, Math.floor(Number(startBattleDto.quantity) || 1))
        : null;

    if (!this.hasHuntBatchQueue(session)) {
      const encounter = requestedMobId
        ? encounters.find((item: any) => item.mobId === requestedMobId)
        : requestedEncounterId
          ? encounters.find((item: any) => item.id === requestedEncounterId)
          : this.rollEncounter(encounters);

      return {
        encounter: encounter ?? null,
        quantity: requestedQuantity ?? 1,
        availableCount: null,
      };
    }

    const pendingMobs = (session.huntBatch.mobs ?? []).filter(
      (entry: any) =>
        Math.max(0, Math.floor(Number(entry.remainingCount) || 0)) > 0,
    );

    if (pendingMobs.length <= 0) {
      return {
        encounter: null,
        quantity: 0,
        availableCount: 0,
      };
    }

    const selectedMobId =
      requestedMobId ??
      session.selectedEncounterMobId ??
      session.huntBatch.selectedEncounterMobId ??
      session.huntBatch.selectedEncounter?.mobId ??
      null;
    const selectedEncounterId =
      requestedEncounterId ??
      session.selectedEncounterId ??
      session.huntBatch.selectedEncounterId ??
      session.huntBatch.selectedEncounter?.id ??
      null;
    const battleTarget =
      pendingMobs.find((entry: any) => {
        return (
          (selectedMobId && entry.mobId === selectedMobId) ||
          (selectedEncounterId && entry.encounterId === selectedEncounterId)
        );
      }) ?? pendingMobs[0];

    const availableCount = Math.max(
      0,
      Math.floor(Number(battleTarget.remainingCount) || 0),
    );
    const quantity = requestedQuantity ?? availableCount;

    if (quantity > availableCount) {
      throw new BadRequestException(
        `VocÃª possui ${availableCount} deste mob rastreado neste mapa.`,
      );
    }

    const encounter =
      encounters.find((item: any) => item.id === battleTarget.encounterId) ??
      encounters.find((item: any) => item.mobId === battleTarget.mobId) ??
      (battleTarget.mob
        ? {
            id: battleTarget.encounterId,
            mobId: battleTarget.mobId,
            subMapId: session.subMapId,
            weight: battleTarget.weightSnapshot ?? 100,
            isActive: true,
            mob: {
              ...battleTarget.mob,
              drops: battleTarget.mob.drops ?? [],
            },
          }
        : null);

    return {
      encounter,
      quantity,
      availableCount,
    };
  }

  private getHuntBatchPendingMobSelection(huntBatch: any) {
    const pendingMobs = (huntBatch?.mobs ?? []).filter(
      (entry: any) =>
        Math.max(0, Math.floor(Number(entry.remainingCount) || 0)) > 0,
    );

    if (pendingMobs.length <= 0) {
      return null;
    }

    const selectedMobId =
      huntBatch.selectedEncounterMobId ?? huntBatch.selectedEncounter?.mobId;
    const selectedEncounterId =
      huntBatch.selectedEncounterId ?? huntBatch.selectedEncounter?.id;
    const selectedPendingMob =
      pendingMobs.find((entry: any) => {
        return (
          (selectedMobId && entry.mobId === selectedMobId) ||
          (selectedEncounterId && entry.encounterId === selectedEncounterId)
        );
      }) ?? pendingMobs[0];

    return {
      encounterId:
        selectedPendingMob.encounterId ??
        selectedPendingMob.encounter?.id ??
        null,
      mobId: selectedPendingMob.mobId ?? selectedPendingMob.mob?.id ?? null,
    };
  }

  private hasHuntBatchQueue(session: any) {
    return Boolean(session.huntBatch?.id && session.huntBatch?.mobs?.length);
  }

  private getTrackedEnemiesRemaining(session: any): number | null {
    if (!this.hasHuntBatchQueue(session)) {
      return null;
    }

    return (session.huntBatch.mobs ?? []).reduce(
      (total: number, huntBatchMob: any) =>
        total +
        Math.max(0, Math.floor(Number(huntBatchMob.remainingCount) || 0)),
      0,
    );
  }

  private getTrackedEnemiesRemainingAfterKill(
    session: any,
    mobId?: string | null,
    kills = 1,
  ): number | null {
    const remaining = this.getTrackedEnemiesRemaining(session);

    if (remaining === null) {
      return null;
    }

    const safeKills = Math.max(0, Math.floor(Number(kills) || 0));

    if (!mobId || safeKills <= 0) {
      return remaining;
    }

    const huntBatchMob = (session.huntBatch?.mobs ?? []).find(
      (entry: any) => entry.mobId === mobId,
    );
    const decrement = Math.min(
      safeKills,
      Math.max(0, Math.floor(Number(huntBatchMob?.remainingCount) || 0)),
    );

    return Math.max(0, remaining - decrement);
  }

  private getTrackedEnemiesRemainingAfterResult(
    session: any,
    result: RealtimeRoundResult,
  ): number | null {
    let remaining = this.getTrackedEnemiesRemaining(session);

    if (remaining === null) {
      return null;
    }

    for (const summary of result.mobSummaries.values()) {
      const mobId = summary.mobId;
      const safeKills = Math.max(0, Math.floor(Number(summary.kills) || 0));

      if (!mobId || safeKills <= 0) {
        continue;
      }

      const huntBatchMob = (session.huntBatch?.mobs ?? []).find(
        (entry: any) => entry.mobId === mobId,
      );
      const decrement = Math.min(
        safeKills,
        Math.max(0, Math.floor(Number(huntBatchMob?.remainingCount) || 0)),
      );

      remaining = Math.max(0, remaining - decrement);
    }

    return remaining;
  }

  private buildTerminalHuntBatchUpdateData(
    session: any,
    result: RealtimeRoundResult,
  ): Prisma.AutoCombatHuntBatchUncheckedUpdateManyInput | null {
    if (result.finalStatus === AutoCombatSessionStatus.ACTIVE) {
      return null;
    }

    const terminalAt = result.finishedAt ?? result.newLastProcessedAt;
    const trackedEnemiesRemaining =
      this.getTrackedEnemiesRemainingAfterResult(session, result) ?? 0;

    if (
      result.finalStatus === AutoCombatSessionStatus.DEFEATED &&
      trackedEnemiesRemaining > 0
    ) {
      return {
        status: AutoCombatHuntBatchStatus.READY,
        consumedAt: null,
        cancelledAt: null,
        lastProcessedAt: terminalAt,
      };
    }

    return {
      status: AutoCombatHuntBatchStatus.CONSUMED,
      consumedAt: terminalAt,
      lastProcessedAt: terminalAt,
    };
  }

  private getBattleTargetRemainingAfterKill(
    session: any,
    mobId?: string | null,
    kills = 1,
  ): number | null {
    const battleTargetMobId =
      typeof session.battleTargetMobId === 'string'
        ? session.battleTargetMobId
        : null;
    const battleTargetRemaining = Math.max(
      0,
      Math.floor(Number(session.battleTargetRemaining) || 0),
    );

    if (!battleTargetMobId || battleTargetRemaining <= 0) {
      return null;
    }

    if (!mobId || mobId !== battleTargetMobId) {
      return battleTargetRemaining;
    }

    const safeKills = Math.max(0, Math.floor(Number(kills) || 0));

    return Math.max(0, battleTargetRemaining - safeKills);
  }

  private getNextCombatEncounter(session: any) {
    const encounters = this.getSessionHuntEncounters(session);

    if (!this.hasHuntBatchQueue(session)) {
      return this.rollEncounter(encounters);
    }

    const battleTargetRemaining = Math.max(
      0,
      Math.floor(Number(session.battleTargetRemaining) || 0),
    );
    const battleTargetMobId =
      typeof session.battleTargetMobId === 'string'
        ? session.battleTargetMobId
        : null;
    const battleTargetEncounterId =
      typeof session.battleTargetEncounterId === 'string'
        ? session.battleTargetEncounterId
        : null;

    if (
      (battleTargetMobId || battleTargetEncounterId) &&
      battleTargetRemaining <= 0
    ) {
      return null;
    }

    const remainingMobs = (session.huntBatch.mobs ?? []).filter(
      (entry: any) =>
        Math.max(0, Math.floor(Number(entry.remainingCount) || 0)) > 0 &&
        (!battleTargetMobId || entry.mobId === battleTargetMobId) &&
        (!battleTargetEncounterId ||
          entry.encounterId === battleTargetEncounterId),
    );

    if (remainingMobs.length <= 0) {
      return null;
    }

    const selectedMobId =
      session.selectedEncounterMobId ??
      session.huntBatch.selectedEncounterMobId ??
      session.huntBatch.selectedEncounter?.mobId ??
      null;
    const selectedRemainingMob = selectedMobId
      ? remainingMobs.find((entry: any) => entry.mobId === selectedMobId)
      : null;
    const nextTrackedMob = selectedRemainingMob ?? remainingMobs[0];
    const encounter =
      encounters.find((item: any) => item.id === nextTrackedMob.encounterId) ??
      encounters.find((item: any) => item.mobId === nextTrackedMob.mobId);

    if (encounter?.mob) {
      return encounter;
    }

    if (nextTrackedMob.mob) {
      return {
        id: nextTrackedMob.encounterId,
        mobId: nextTrackedMob.mobId,
        subMapId: session.subMapId,
        weight: nextTrackedMob.weightSnapshot ?? 100,
        isActive: true,
        mob: {
          ...nextTrackedMob.mob,
          drops: nextTrackedMob.mob.drops ?? [],
        },
      };
    }

    return null;
  }

  private rollEncounter(
    encounters: any[],
    options?: {
      huntingLevel?: number | null;
      foundEnemiesCount?: number | null;
    },
  ) {
    const activeEncounters = encounters.filter(
      (encounter) => encounter.isActive && encounter.weight > 0,
    );

    if (activeEncounters.length === 0) {
      throw new BadRequestException(
        'Nenhum encontro ativo disponível neste mapa.',
      );
    }

    const huntingLevel = Math.max(
      1,
      Math.floor(Number(options?.huntingLevel) || 1),
    );
    const foundEnemiesCount = Math.max(
      0,
      Math.floor(Number(options?.foundEnemiesCount) || 0),
    );
    const huntingBias = Math.min(
      1.75,
      Math.max(0, (huntingLevel - 1) / AUTO_COMBAT_HUNTING_LEVEL_CAP) +
        Math.min(0.5, foundEnemiesCount / 100),
    );
    const minMobLevel = Math.min(
      ...activeEncounters.map((encounter) =>
        Math.max(1, Number(encounter.mob?.level ?? 1)),
      ),
    );
    const maxMobLevel = Math.max(
      ...activeEncounters.map((encounter) =>
        Math.max(1, Number(encounter.mob?.level ?? 1)),
      ),
    );
    const levelRange = Math.max(1, maxMobLevel - minMobLevel);
    const weightedEncounters = activeEncounters.map((encounter) => {
      const mobLevel = Math.max(1, Number(encounter.mob?.level ?? 1));
      const relativeDifficulty = (mobLevel - minMobLevel) / levelRange;
      const betterMobMultiplier = 1 + relativeDifficulty * huntingBias;

      return {
        encounter,
        weight: Math.max(1, Math.round(encounter.weight * betterMobMultiplier)),
      };
    });

    const totalWeight = weightedEncounters.reduce(
      (total, weightedEncounter) => total + weightedEncounter.weight,
      0,
    );

    let roll = Math.floor(Math.random() * totalWeight) + 1;

    for (const weightedEncounter of weightedEncounters) {
      roll -= weightedEncounter.weight;

      if (roll <= 0) {
        return weightedEncounter.encounter;
      }
    }

    return activeEncounters[activeEncounters.length - 1];
  }

  private addLoot(loots: LootAccumulator, itemId: string, quantity: number) {
    const existingLoot = loots.get(itemId);

    if (existingLoot) {
      existingLoot.quantity += quantity;
      return;
    }

    loots.set(itemId, {
      itemId,
      quantity,
    });
  }

  private addMobSummary(
    mobSummaries: MobSummaryAccumulator,
    mobId: string,
    xpGained: number,
  ) {
    const existingSummary = mobSummaries.get(mobId);

    if (existingSummary) {
      existingSummary.kills += 1;
      existingSummary.xpGained += xpGained;
      return;
    }

    mobSummaries.set(mobId, {
      mobId,
      kills: 1,
      xpGained,
    });
  }

  private getEquipmentItems(character: any) {
    return [
      character.equipment?.mainHand,
      character.equipment?.offHand,
      character.equipment?.head,
      character.equipment?.armor,
      character.equipment?.pants,
      character.equipment?.boots,
    ];
  }

  private getGatheringBonus(character: any) {
    return calculateGatheringPrimaryBonus(character?.gatheringSkills);
  }

  private calculateCharacterFighterStats(character: any): FighterStats {
    const equipmentItems = this.getEquipmentItems(character);
    const gatheringBonus = this.getGatheringBonus(character);
    const combatGatheringBonus = scaleAutoCombatGatheringBonus(gatheringBonus);

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringBonus,
    );
    const combatStats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      combatGatheringBonus,
    );

    const maxHp = stats.derivedCombatStats.maxHp;

    const currentHp =
      character.currentHp === null || character.currentHp === undefined
        ? maxHp
        : character.currentHp;

    const clampedCurrentHp = this.clampHp(currentHp, maxHp);

    return {
      name: character.name,
      className: character.class?.name ?? null,
      hp: clampedCurrentHp,
      maxHp,
      attack: combatStats.derivedCombatStats.attack,
      defense: combatStats.derivedCombatStats.defense,
      speed: combatStats.derivedCombatStats.speed,
      precision: combatStats.totalPrimaryStats.precision,
      technique: combatStats.totalPrimaryStats.technique,
      agility: combatStats.totalPrimaryStats.agility,
    };
  }

  private calculateMobFighterStats(mob: any): FighterStats {
    const safeSpeed = Math.max(1, mob.speed ?? 1);
    const safeLevel = Math.max(1, mob.level ?? 1);

    return {
      name: mob.name,
      hp: mob.hp,
      maxHp: mob.hp,
      attack: mob.attack,
      defense: mob.defense,
      speed: safeSpeed,
      precision: safeSpeed,
      technique: safeLevel,
      agility: safeSpeed,
    };
  }

  private calculateAutoCombatMobFighterStats(
    mob: any,
    className?: string | null,
  ): FighterStats {
    const stats = this.calculateMobFighterStats(mob);

    return {
      ...stats,
      attack: applyAutoCombatIncomingDamageMultiplier({
        attack: stats.attack,
        className,
      }),
    };
  }

  private getAutoCombatRewardRiskLevel(
    currentHp: number,
    maxHp: number,
  ): RiskLevel {
    if (currentHp <= 0 || maxHp <= 0) {
      return 'LETHAL';
    }

    const hpPercent = this.calculatePercent(currentHp, maxHp);

    if (hpPercent < 25) {
      return 'HIGH';
    }

    if (hpPercent < 55) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private calculateCurrentHpAfterLevelUp(params: {
    currentHp: number;
    oldMaxHp: number;
    newMaxHp: number;
    levelsGained: number;
  }) {
    const { currentHp, oldMaxHp, newMaxHp, levelsGained } = params;

    if (currentHp <= 0) {
      return 0;
    }

    const maxHpDifference = Math.max(0, newMaxHp - oldMaxHp);

    const levelUpBonusHeal =
      levelsGained > 0 ? Math.floor(newMaxHp * 0.05 * levelsGained) : 0;

    return this.clampHp(
      currentHp + maxHpDifference + levelUpBonusHeal,
      newMaxHp,
    );
  }

  private calculateHit(attacker: FighterStats, defender: FighterStats) {
    return calculateCombatHit({
      attack: attacker.attack,
      defense: defender.defense,
      attackerPrecision: attacker.precision,
      attackerTechnique: attacker.technique,
      defenderAgility: defender.agility,
      minMultiplier: 0.9,
      maxMultiplier: 1.1,
    });
  }

  private calculateSessionRemainingSeconds(session: any, now = new Date()) {
    if (session.status === AutoCombatSessionStatus.ACTIVE) {
      return Math.max(
        0,
        Math.floor((session.endsAt.getTime() - now.getTime()) / 1000),
      );
    }

    if (
      session.status === AutoCombatSessionStatus.STOPPED ||
      session.status === AutoCombatSessionStatus.DEFEATED
    ) {
      const referenceDate = session.finishedAt ?? now;

      return Math.max(
        0,
        Math.floor((session.endsAt.getTime() - referenceDate.getTime()) / 1000),
      );
    }

    return 0;
  }

  private getSessionStatusText(status: AutoCombatSessionStatus) {
    switch (status) {
      case AutoCombatSessionStatus.ACTIVE:
        return 'Sessão ativa';

      case AutoCombatSessionStatus.FINISHED:
        return 'Sessão finalizada';

      case AutoCombatSessionStatus.STOPPED:
        return 'Sessão interrompida manualmente';

      case AutoCombatSessionStatus.DEFEATED:
        return 'Sessão encerrada por derrota';

      default:
        return 'Status desconhecido';
    }
  }

  private calculateRiskScore(params: {
    defeatChancePercent: number;
    expectedHpPercentAtEnd: number;
  }) {
    const defeatWeight = params.defeatChancePercent * 0.7;
    const hpPressureWeight = (100 - params.expectedHpPercentAtEnd) * 0.3;

    return this.clampNumber(
      Math.round(defeatWeight + hpPressureWeight),
      0,
      100,
    );
  }

  private getRiskLevel(score: number): RiskLevel {
    if (score >= 80) {
      return 'LETHAL';
    }

    if (score >= 55) {
      return 'HIGH';
    }

    if (score >= 25) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private getPreviewIterations(projectionSeconds: number) {
    if (projectionSeconds >= 4 * 60 * 60) {
      return AUTO_COMBAT_PREVIEW_MIN_ITERATIONS;
    }

    if (projectionSeconds >= 2 * 60 * 60) {
      return 8;
    }

    if (projectionSeconds >= 60 * 60) {
      return 10;
    }

    return AUTO_COMBAT_PREVIEW_MAX_ITERATIONS;
  }

  private buildCharacterXpPayload(
    characterLevel: number,
    characterXp: number,
  ): XpProgressSnapshot {
    const levelProgress = getLevelProgress(characterLevel, characterXp);

    const xpToNextLevel = this.getXpToNextLevelFromProgress(levelProgress);

    return {
      totalXp: levelProgress.totalXp,

      currentLevelXp: levelProgress.xpIntoCurrentLevel,
      xpToNextLevel,
      nextLevelXp: xpToNextLevel,
      xpProgressPercent: levelProgress.progressPercent,

      xpIntoCurrentLevel: levelProgress.xpIntoCurrentLevel,
      xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,
      currentLevelStartXp: levelProgress.currentLevelStartXp,
      nextLevelRequiredXp: levelProgress.nextLevelRequiredXp,
      isAtLevelCap: levelProgress.isAtLevelCap,

      levelProgress: {
        oldLevel: levelProgress.oldLevel,
        newLevel: levelProgress.newLevel,

        currentXp: levelProgress.currentXp,
        gainedXp: levelProgress.gainedXp,
        totalXp: levelProgress.totalXp,

        currentLevelXp: levelProgress.xpIntoCurrentLevel,
        xpToNextLevel,
        nextLevelXp: xpToNextLevel,
        xpProgressPercent: levelProgress.progressPercent,

        leveledUp: levelProgress.leveledUp,
        levelsGained: levelProgress.levelsGained,

        levelCap: levelProgress.levelCap,
        isAtLevelCap: levelProgress.isAtLevelCap,

        currentLevelStartXp: levelProgress.currentLevelStartXp,
        nextLevelRequiredXp: levelProgress.nextLevelRequiredXp,

        xpIntoCurrentLevel: levelProgress.xpIntoCurrentLevel,
        xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,

        progressPercent: levelProgress.progressPercent,
      },
    };
  }

  private getXpToNextLevelFromProgress(levelProgress: {
    xpIntoCurrentLevel: number;
    xpNeededForNextLevel: number | null;
  }) {
    if (levelProgress.xpNeededForNextLevel === null) {
      return Math.max(1, levelProgress.xpIntoCurrentLevel);
    }

    return (
      levelProgress.xpIntoCurrentLevel + levelProgress.xpNeededForNextLevel
    );
  }

  private calculatePercent(part: number, total: number) {
    if (total <= 0) {
      return 0;
    }

    return Number(((part / total) * 100).toFixed(2));
  }

  private roundNumber(value: number, decimals = 2) {
    return Number(value.toFixed(decimals));
  }

  private clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(value, max));
  }

  private getJsonInteger(value: unknown) {
    const numberValue = Number(value ?? 0);

    return Number.isFinite(numberValue)
      ? Math.max(0, Math.floor(numberValue))
      : 0;
  }

  private clampHp(currentHp: number, maxHp: number) {
    return Math.max(0, Math.min(currentHp, maxHp));
  }

  private randomBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getInventoryItemType(slot: ItemSlot) {
    if (slot === ItemSlot.MATERIAL) {
      return InventoryItemType.MATERIAL;
    }

    if (slot === ItemSlot.CONSUMABLE) {
      return InventoryItemType.CONSUMABLE;
    }

    return InventoryItemType.EQUIPMENT;
  }
}
