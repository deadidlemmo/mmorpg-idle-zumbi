import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InventoryItem } from '@prisma/client';
import {
  ActivityStatus,
  CharacterStatus,
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  Prisma,
} from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  PRODUCT_EVENT_ACTIONS,
  PRODUCT_MILESTONE_KEYS,
} from '../../common/audit/product-events.constants';
import {
  GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
  GATHERING_AFFINITY_XP_MULTIPLIER,
  GATHERING_LEVEL_CAP,
  GATHERING_STAT_BONUS_PER_LEVEL,
  getGatheringRateMultiplier,
  getGatheringStatBonus,
  getGatheringXpProgressPercent,
  getGatheringXpToNextLevel,
  resolveGatheringMaterialBaseRatePerHour,
  resolveGatheringMaterialXpPerUnit,
} from '../../common/config/gathering.config';
import { getIdleProgressLimitSeconds } from '../../common/config/membership.config';
import { calculateGatheringReward } from '../../common/utils/gathering.util';
import {
  applyPremiumXpBonus,
  isPremiumActive,
} from '../../common/utils/membership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import {
  accumulateEconomyEntry,
  getEconomyHourBucket,
} from '../economy/economy-ledger';
import type { EquippedPetBonus } from '../pets/pet-bonus';
import { PetBonusesService } from '../pets/pet-bonuses.service';
import { StartGatheringDto } from './dto/start-gathering.dto';
import {
  buildGatheringTimeline,
  createGatheringCycleFromProgress,
  getGatheringCycleDurationMs,
  getGatheringRatePerHour,
  MIN_GATHERING_CYCLE_DURATION_MS,
  resolveGatheringCycle,
  type GatheringCycleResolution,
  type GatheringCycleState,
} from './gathering-cycle';

const GATHERING_ORIGINS = [
  MaterialOrigin.DESMANCHE,
  MaterialOrigin.COLETA,
  MaterialOrigin.CONTENCAO,
  MaterialOrigin.ARSENAL,
  MaterialOrigin.PATRULHA,
  MaterialOrigin.TECNOVARREDURA,
] as const;

type ValidGatheringOrigin = (typeof GATHERING_ORIGINS)[number];

type GatheringSkillSnapshot = {
  id: string;
  characterId: string;
  origin: MaterialOrigin;
  level: number;
  xp: number;
  totalXp: number;
};

type GatheringProgressResult = {
  origin: MaterialOrigin;
  xpGained: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  levelsGained: number;
  currentXp: number;
  totalXp: number;
  xpToNextLevel: number | null;
  xpProgressPercent: number;
  statBonusGained: {
    stat: string;
    label: string;
    amount: number;
  } | null;
};

type ProductionResult = {
  quantity: number;
  newProgressRemainder: number;
  elapsedHours: number;
  rawAmount: number;
  ratePerHour: number;
  baseRatePerHour: number;
  defaultRatePerHour: number;
  skillRateMultiplier: number;
  affinityRateMultiplier: number;
  finalRateMultiplier: number;
  baseCycleDurationMs: number;
  cycleDurationMs: number;
  petDefinitionId: string | null;
  petEffectBasisPoints: number;
};

type ProductionRateProfile = Pick<
  ProductionResult,
  | 'baseRatePerHour'
  | 'defaultRatePerHour'
  | 'skillRateMultiplier'
  | 'affinityRateMultiplier'
  | 'baseCycleDurationMs'
>;

type MaterialRecipeUsageViewModel = {
  recipeId: string;
  tier: number;
  outputQuantity: number;
  quantity: number;
  role: string;
  origin: MaterialOrigin;
  outputItemId: string;
  outputItemName: string;
  outputItemTier: number;
  outputItemRarity: string;
  outputItemSlot: string;
  outputItemFamily: string;
  outputItemClassId: string | null;
  outputItemClassName: string | null;
};

type ResolveGatheringOptions = {
  forcePersist?: boolean;
  validateCollectionGuard?: boolean;
  throwIfMissing?: boolean;
};

type AppliedGatheringPetBonus = Pick<
  EquippedPetBonus,
  'petDefinitionId' | 'effectBasisPoints'
>;

type GatheringCycleSessionLike = {
  id: string;
  status: ActivityStatus;
  lastResolvedAt: Date;
  progressRemainder: number;
  collectedQuantity: number;
  cycleStartedAt: Date | null;
  cycleEndsAt: Date | null;
  cycleDurationMs: number | null;
  cycleVersion: number;
  appliedPetDefinitionId: string | null;
  appliedPetEffectBasisPoints: number;
};

const ORIGIN_STAT_INFO: Record<
  ValidGatheringOrigin,
  {
    stat: string;
    label: string;
  }
> = {
  [MaterialOrigin.DESMANCHE]: {
    stat: 'strength',
    label: 'Força',
  },
  [MaterialOrigin.COLETA]: {
    stat: 'vitality',
    label: 'Vitalidade',
  },
  [MaterialOrigin.PATRULHA]: {
    stat: 'agility',
    label: 'Agilidade',
  },
  [MaterialOrigin.ARSENAL]: {
    stat: 'precision',
    label: 'Precisão',
  },
  [MaterialOrigin.TECNOVARREDURA]: {
    stat: 'technique',
    label: 'Técnica',
  },
  [MaterialOrigin.CONTENCAO]: {
    stat: 'willpower',
    label: 'Vontade',
  },
};

const CLASS_GATHERING_AFFINITIES: Record<string, ValidGatheringOrigin[]> = {
  LUTADOR: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
  ATIRADOR: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.ARSENAL,
    MaterialOrigin.PATRULHA,
  ],
  ASSASSINO: [
    MaterialOrigin.PATRULHA,
    MaterialOrigin.ARSENAL,
    MaterialOrigin.TECNOVARREDURA,
  ],
  MEDICO: [
    MaterialOrigin.TECNOVARREDURA,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
};

function isValidGatheringOrigin(
  origin: MaterialOrigin,
): origin is ValidGatheringOrigin {
  return GATHERING_ORIGINS.includes(origin as ValidGatheringOrigin);
}

function normalizeClassName(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

type GatheringMaterialProgressionSource = {
  tier: number;
  requiredGatheringLevel?: number | null;
  gatheringXpPerUnit?: number | null;
  baseGatheringRatePerHour?: number | null;
};

function getMaterialGatheringXpPerUnit(
  material: GatheringMaterialProgressionSource,
) {
  return resolveGatheringMaterialXpPerUnit(material);
}

function getMaterialBaseGatheringRatePerHour(
  material: GatheringMaterialProgressionSource,
) {
  return resolveGatheringMaterialBaseRatePerHour(material);
}

function ensureCharacterIsOnGatheringMap(params: {
  characterMapId?: string | null;
  map: { id: string; name: string };
}) {
  if (params.characterMapId === params.map.id) {
    return;
  }

  throw new BadRequestException({
    message: `Viaje para ${params.map.name} antes de iniciar a coleta.`,
    currentMapId: params.characterMapId ?? null,
    requiredMapId: params.map.id,
  });
}

function calculateSessionGatheringXp(params: {
  previousQuantity: number;
  previousXp: number;
  quantityGained: number;
  xpPerUnit: number;
  isAffinity: boolean;
  isPremium: boolean;
}) {
  const previousQuantity = Math.max(0, Math.floor(params.previousQuantity));
  const previousXp = Math.max(0, Math.floor(params.previousXp));
  const quantityGained = Math.max(0, Math.floor(params.quantityGained));
  const xpPerUnit = Math.max(1, Math.floor(params.xpPerUnit));
  const totalQuantity = previousQuantity + quantityGained;
  const baseTotalXp = totalQuantity * xpPerUnit;
  const affinityAdjustedTotalXp = params.isAffinity
    ? Math.floor(baseTotalXp * GATHERING_AFFINITY_XP_MULTIPLIER)
    : baseTotalXp;
  const expectedTotalXp = applyPremiumXpBonus(
    affinityAdjustedTotalXp,
    params.isPremium,
  );

  return Math.max(0, expectedTotalXp - previousXp);
}

function normalizeGatheringTargetMaterial(targetMaterial?: unknown) {
  if (
    !targetMaterial ||
    typeof targetMaterial !== 'object' ||
    !('tier' in targetMaterial)
  ) {
    return targetMaterial;
  }

  const material = targetMaterial as Record<string, unknown> & {
    tier: number;
  };

  return {
    ...material,
    gatheringXpPerUnit: getMaterialGatheringXpPerUnit(material),
    baseGatheringRatePerHour: getMaterialBaseGatheringRatePerHour(material),
  };
}

function isClassAffinity(params: {
  className?: string | null;
  origin: MaterialOrigin;
}) {
  if (!isValidGatheringOrigin(params.origin)) {
    return false;
  }

  const normalizedClassName = normalizeClassName(params.className);
  const affinities = CLASS_GATHERING_AFFINITIES[normalizedClassName] ?? [];

  return affinities.includes(params.origin);
}

function buildGatheringSkillViewModel(params: {
  skill: GatheringSkillSnapshot;
  isAffinity: boolean;
}) {
  const { skill, isAffinity } = params;
  const xpToNextLevel = getGatheringXpToNextLevel(skill.level);
  const validOrigin = isValidGatheringOrigin(skill.origin)
    ? skill.origin
    : MaterialOrigin.DESMANCHE;
  const statInfo = ORIGIN_STAT_INFO[validOrigin];

  return {
    id: skill.id,
    characterId: skill.characterId,
    origin: skill.origin,
    level: skill.level,
    xp: skill.xp,
    totalXp: skill.totalXp,
    xpToNextLevel,
    xpProgressPercent: getGatheringXpProgressPercent(skill.xp, xpToNextLevel),
    isAtLevelCap: skill.level >= GATHERING_LEVEL_CAP,
    isClassAffinity: isAffinity,
    statBonus: {
      stat: statInfo.stat,
      label: statInfo.label,
      amount: getGatheringStatBonus(skill.level),
    },
    productionBonusPercent: Math.round(
      (getGatheringRateMultiplier(skill.level) - 1) * 100,
    ),
    affinityBonus: isAffinity
      ? {
          xpMultiplier: GATHERING_AFFINITY_XP_MULTIPLIER,
          productionMultiplier: GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
        }
      : null,
  };
}

function applyGatheringXp(params: {
  skill: GatheringSkillSnapshot;
  xpGained: number;
}): GatheringProgressResult {
  const { skill } = params;
  const safeXpGained = Math.max(0, Math.floor(params.xpGained));

  let level = Math.max(1, skill.level);
  let currentXp = Math.max(0, skill.xp) + safeXpGained;
  const totalXp = Math.max(0, skill.totalXp) + safeXpGained;

  const previousLevel = level;

  while (level < GATHERING_LEVEL_CAP) {
    const xpToNextLevel = getGatheringXpToNextLevel(level);

    if (!xpToNextLevel || currentXp < xpToNextLevel) {
      break;
    }

    currentXp -= xpToNextLevel;
    level += 1;
  }

  if (level >= GATHERING_LEVEL_CAP) {
    level = GATHERING_LEVEL_CAP;
    currentXp = 0;
  }

  const levelsGained = Math.max(0, level - previousLevel);
  const xpToNextLevel = getGatheringXpToNextLevel(level);
  const validOrigin = isValidGatheringOrigin(skill.origin)
    ? skill.origin
    : MaterialOrigin.DESMANCHE;
  const statInfo = ORIGIN_STAT_INFO[validOrigin];

  return {
    origin: skill.origin,
    xpGained: safeXpGained,
    previousLevel,
    newLevel: level,
    leveledUp: levelsGained > 0,
    levelsGained,
    currentXp,
    totalXp,
    xpToNextLevel,
    xpProgressPercent: getGatheringXpProgressPercent(currentXp, xpToNextLevel),
    statBonusGained:
      levelsGained > 0
        ? {
            stat: statInfo.stat,
            label: statInfo.label,
            amount: levelsGained * GATHERING_STAT_BONUS_PER_LEVEL,
          }
        : null,
  };
}

function calculateProductionRateProfile(params: {
  tier: number;
  baseGatheringRatePerHour?: number | null;
  skillLevel: number;
  isAffinity: boolean;
}): ProductionRateProfile {
  const defaultReward = calculateGatheringReward({
    elapsedSeconds: 0,
    tier: params.tier,
    progressRemainder: 0,
  });

  const defaultRatePerHour = Math.max(1, defaultReward.ratePerHour);
  const baseRatePerHour =
    params.baseGatheringRatePerHour && params.baseGatheringRatePerHour > 0
      ? params.baseGatheringRatePerHour
      : defaultRatePerHour;

  const skillRateMultiplier = getGatheringRateMultiplier(params.skillLevel);
  const affinityRateMultiplier = params.isAffinity
    ? GATHERING_AFFINITY_PRODUCTION_MULTIPLIER
    : 1;

  const ratePerHour =
    baseRatePerHour * skillRateMultiplier * affinityRateMultiplier;

  return {
    baseRatePerHour,
    defaultRatePerHour,
    skillRateMultiplier: Number(skillRateMultiplier.toFixed(4)),
    affinityRateMultiplier: Number(affinityRateMultiplier.toFixed(4)),
    baseCycleDurationMs: getGatheringCycleDurationMs(ratePerHour),
  };
}

function buildProductionResult(params: {
  cycleResolution: GatheringCycleResolution;
  rateProfile: ProductionRateProfile;
  petBonus: Pick<
    EquippedPetBonus,
    'petDefinitionId' | 'effectBasisPoints'
  > | null;
}): ProductionResult {
  const ratePerHour = getGatheringRatePerHour(
    params.cycleResolution.cycle.durationMs,
  );
  const finalRateMultiplier =
    ratePerHour / params.rateProfile.defaultRatePerHour;

  return {
    quantity: params.cycleResolution.quantity,
    newProgressRemainder: params.cycleResolution.progressRemainder,
    elapsedHours: params.cycleResolution.elapsedMs / 3_600_000,
    rawAmount:
      params.cycleResolution.quantity +
      params.cycleResolution.progressRemainder,
    ratePerHour,
    baseRatePerHour: params.rateProfile.baseRatePerHour,
    defaultRatePerHour: params.rateProfile.defaultRatePerHour,
    skillRateMultiplier: params.rateProfile.skillRateMultiplier,
    affinityRateMultiplier: params.rateProfile.affinityRateMultiplier,
    finalRateMultiplier: Number(finalRateMultiplier.toFixed(4)),
    baseCycleDurationMs: params.rateProfile.baseCycleDurationMs,
    cycleDurationMs: params.cycleResolution.cycle.durationMs,
    petDefinitionId: params.petBonus?.petDefinitionId ?? null,
    petEffectBasisPoints: params.petBonus?.effectBasisPoints ?? 0,
  };
}

function mapUsedInRecipes(material: {
  craftingIngredients?: Array<{
    quantity: number;
    role: string;
    origin: MaterialOrigin;
    recipe: {
      id: string;
      tier: number;
      outputQuantity: number;
      outputItem: {
        id: string;
        name: string;
        tier: number;
        rarity: string;
        slot: string;
        family: string;
        classId: string | null;
        class: {
          id: string;
          name: string;
        } | null;
      };
    };
  }>;
}): MaterialRecipeUsageViewModel[] {
  const ingredients = material.craftingIngredients ?? [];

  return ingredients
    .filter((ingredient) => Boolean(ingredient.recipe?.outputItem))
    .map((ingredient) => {
      const outputItem = ingredient.recipe.outputItem;

      return {
        recipeId: ingredient.recipe.id,
        tier: ingredient.recipe.tier,
        outputQuantity: ingredient.recipe.outputQuantity,
        quantity: ingredient.quantity,
        role: ingredient.role,
        origin: ingredient.origin,
        outputItemId: outputItem.id,
        outputItemName: outputItem.name,
        outputItemTier: outputItem.tier,
        outputItemRarity: outputItem.rarity,
        outputItemSlot: outputItem.slot,
        outputItemFamily: outputItem.family,
        outputItemClassId: outputItem.classId,
        outputItemClassName: outputItem.class?.name ?? null,
      };
    })
    .sort((a, b) => {
      if (a.outputItemClassName !== b.outputItemClassName) {
        return String(a.outputItemClassName ?? '').localeCompare(
          String(b.outputItemClassName ?? ''),
        );
      }

      if (a.outputItemSlot !== b.outputItemSlot) {
        return a.outputItemSlot.localeCompare(b.outputItemSlot);
      }

      return a.outputItemName.localeCompare(b.outputItemName);
    });
}

function getRelatedClassesFromRecipes(
  usedInRecipes: MaterialRecipeUsageViewModel[],
) {
  return Array.from(
    new Set(
      usedInRecipes
        .map((recipe) => recipe.outputItemClassName)
        .filter((className): className is string => Boolean(className)),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function getPersistedGatheringCycle(
  session: GatheringCycleSessionLike,
): GatheringCycleState | null {
  if (
    !session.cycleStartedAt ||
    !session.cycleEndsAt ||
    !session.cycleDurationMs ||
    session.cycleDurationMs <= 0
  ) {
    return null;
  }

  if (
    session.cycleEndsAt.getTime() - session.cycleStartedAt.getTime() !==
    session.cycleDurationMs
  ) {
    return null;
  }

  return {
    startedAt: session.cycleStartedAt,
    endsAt: session.cycleEndsAt,
    durationMs: session.cycleDurationMs,
    version: Math.max(1, session.cycleVersion),
  };
}

function getAppliedGatheringPetBonus(
  session: GatheringCycleSessionLike,
): AppliedGatheringPetBonus | null {
  if (
    !session.appliedPetDefinitionId ||
    session.appliedPetEffectBasisPoints <= 0
  ) {
    return null;
  }

  return {
    petDefinitionId: session.appliedPetDefinitionId,
    effectBasisPoints: session.appliedPetEffectBasisPoints,
  };
}

@Injectable()
export class GatheringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
    private readonly auditService: AuditService,
    private readonly petBonuses: PetBonusesService,
  ) {}

  private validateGatheringOrigin(origin: MaterialOrigin) {
    const validOrigins = Object.values(MaterialOrigin) as MaterialOrigin[];

    if (!validOrigins.includes(origin)) {
      throw new BadRequestException({
        message: 'Origem de gathering inválida.',
        receivedOrigin: origin,
        validOrigins,
      });
    }

    if (origin === MaterialOrigin.DROP_MOBS) {
      throw new BadRequestException(
        'DROP_MOBS não pode ser usado como gathering. Esse recurso vem do auto-combate.',
      );
    }

    if (!isValidGatheringOrigin(origin)) {
      throw new BadRequestException({
        message: 'Origem de gathering inválida para coleta idle.',
        receivedOrigin: origin,
        validGatheringOrigins: GATHERING_ORIGINS,
      });
    }
  }

  private async getOrCreateGatheringSkill(params: {
    characterId: string;
    origin: MaterialOrigin;
  }) {
    this.validateGatheringOrigin(params.origin);

    return this.prisma.characterGatheringSkill.upsert({
      where: {
        characterId_origin: {
          characterId: params.characterId,
          origin: params.origin,
        },
      },
      update: {},
      create: {
        characterId: params.characterId,
        origin: params.origin,
        level: 1,
        xp: 0,
        totalXp: 0,
      },
    });
  }

  private async resolveGatheringCycle(params: {
    characterId: string;
    origin: MaterialOrigin;
    session: GatheringCycleSessionLike;
    rateProfile: ProductionRateProfile;
    serverNow: Date;
    idleProgressLimitSeconds: number;
  }) {
    const persistedCycle = getPersistedGatheringCycle(params.session);
    let appliedPetBonus = getAppliedGatheringPetBonus(params.session);
    let currentCycle = persistedCycle;
    let needsCycleBackfill = false;

    if (!currentCycle) {
      const initialDuration = await this.petBonuses.calculateGatheringDuration(
        params.characterId,
        params.origin,
        params.rateProfile.baseCycleDurationMs,
        MIN_GATHERING_CYCLE_DURATION_MS,
      );

      appliedPetBonus = initialDuration.bonus;
      currentCycle = createGatheringCycleFromProgress({
        anchorAt: params.session.lastResolvedAt,
        durationMs: initialDuration.durationMs,
        progressRemainder: params.session.progressRemainder,
        version: Math.max(1, params.session.collectedQuantity + 1),
      });
      needsCycleBackfill = true;
    }

    const processingNowMs = Math.min(
      params.serverNow.getTime(),
      params.session.lastResolvedAt.getTime() +
        params.idleProgressLimitSeconds * 1_000,
    );
    const crossesCycleBoundary =
      processingNowMs >= currentCycle.endsAt.getTime();
    let nextCycleDurationMs = currentCycle.durationMs;
    let nextPetBonus = appliedPetBonus;

    if (crossesCycleBoundary) {
      const nextDuration = await this.petBonuses.calculateGatheringDuration(
        params.characterId,
        params.origin,
        params.rateProfile.baseCycleDurationMs,
        MIN_GATHERING_CYCLE_DURATION_MS,
      );

      nextCycleDurationMs = nextDuration.durationMs;
      nextPetBonus = nextDuration.bonus;
    }

    const cycleResolution = resolveGatheringCycle({
      serverNow: params.serverNow,
      lastResolvedAt: params.session.lastResolvedAt,
      idleProgressLimitSeconds: params.idleProgressLimitSeconds,
      currentCycle,
      nextCycleDurationMs,
    });

    return {
      cycleResolution,
      appliedPetBonus:
        cycleResolution.quantity > 0 ? nextPetBonus : appliedPetBonus,
      needsCycleBackfill,
    };
  }

  private async assertCharacterOwnership(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }
  }

  private async findActiveGatheringSession(
    userId: string,
    characterId: string,
  ) {
    return this.prisma.gatheringSession.findFirst({
      where: {
        characterId,
        status: ActivityStatus.ACTIVE,
        character: {
          userId,
          deletedAt: null,
        },
      },
      include: {
        character: {
          select: {
            id: true,
            name: true,
            level: true,
            status: true,
            currentHp: true,
            maxHp: true,
            user: {
              select: {
                premiumUntil: true,
              },
            },
            class: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        map: {
          select: {
            id: true,
            name: true,
            tier: true,
          },
        },
        targetMaterial: {
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
            materialOrigin: true,
            materialSlot: true,
            isGatheringMaterial: true,
            requiredGatheringLevel: true,
            gatheringXpPerUnit: true,
            baseGatheringRatePerHour: true,
          },
        },
      },
    });
  }

  private buildSessionPayload(
    session: {
      id: string;
      status: ActivityStatus;
      origin: MaterialOrigin;
      startedAt: Date;
      lastResolvedAt: Date;
      progressRemainder: number;
      collectedQuantity: number;
      collectedXp: number;
      cycleStartedAt: Date | null;
      cycleEndsAt: Date | null;
      cycleDurationMs: number | null;
      cycleVersion: number;
      appliedPetDefinitionId: string | null;
      appliedPetEffectBasisPoints: number;
      character?: unknown;
      map?: unknown;
      targetMaterial?: unknown;
    },
    serverNow = new Date(),
  ) {
    const cycle = getPersistedGatheringCycle(session);
    const timeline = cycle
      ? buildGatheringTimeline({
          active: session.status === ActivityStatus.ACTIVE,
          sessionId: session.id,
          serverNow,
          cycle,
        })
      : null;

    return {
      id: session.id,
      status: session.status,
      origin: session.origin,
      startedAt: session.startedAt,
      lastResolvedAt: session.lastResolvedAt,
      progressRemainder: session.progressRemainder,
      collectedQuantity: session.collectedQuantity,
      collectedXp: session.collectedXp,
      cycleStartedAt: session.cycleStartedAt,
      cycleEndsAt: session.cycleEndsAt,
      cycleDurationMs: session.cycleDurationMs,
      cycleVersion: session.cycleVersion,
      appliedPetBonus: {
        petDefinitionId: session.appliedPetDefinitionId,
        effectBasisPoints: session.appliedPetEffectBasisPoints,
        effectPercent: Number(
          (session.appliedPetEffectBasisPoints / 100).toFixed(2),
        ),
      },
      timeline,
      character: session.character,
      map: session.map,
      targetMaterial: normalizeGatheringTargetMaterial(session.targetMaterial),
    };
  }

  private buildProductionPayload(params: {
    elapsedSeconds: number;
    reward: ProductionResult;
    previousProgressRemainder: number;
  }) {
    const { elapsedSeconds, reward, previousProgressRemainder } = params;

    return {
      elapsedSeconds: Math.floor(elapsedSeconds),
      elapsedHours: Number(reward.elapsedHours.toFixed(4)),
      ratePerHour: reward.ratePerHour,
      baseRatePerHour: reward.baseRatePerHour,
      defaultRatePerHour: reward.defaultRatePerHour,
      skillRateMultiplier: reward.skillRateMultiplier,
      affinityRateMultiplier: reward.affinityRateMultiplier,
      finalRateMultiplier: reward.finalRateMultiplier,
      baseCycleDurationMs: reward.baseCycleDurationMs,
      cycleDurationMs: reward.cycleDurationMs,
      petDefinitionId: reward.petDefinitionId,
      petEffectBasisPoints: reward.petEffectBasisPoints,
      previousProgressRemainder: Number(previousProgressRemainder.toFixed(4)),
      newProgressRemainder: Number(reward.newProgressRemainder.toFixed(4)),
    };
  }

  private buildProductionPreviewPayload(params: {
    elapsedSeconds: number;
    reward: ProductionResult;
    currentProgressRemainder: number;
    wasPersisted: boolean;
  }) {
    const { elapsedSeconds, reward, currentProgressRemainder, wasPersisted } =
      params;

    return {
      elapsedSeconds: wasPersisted ? 0 : Math.floor(elapsedSeconds),
      elapsedHours: wasPersisted ? 0 : Number(reward.elapsedHours.toFixed(4)),
      ratePerHour: reward.ratePerHour,
      baseRatePerHour: reward.baseRatePerHour,
      defaultRatePerHour: reward.defaultRatePerHour,
      skillRateMultiplier: reward.skillRateMultiplier,
      affinityRateMultiplier: reward.affinityRateMultiplier,
      finalRateMultiplier: reward.finalRateMultiplier,
      baseCycleDurationMs: reward.baseCycleDurationMs,
      cycleDurationMs: reward.cycleDurationMs,
      petDefinitionId: reward.petDefinitionId,
      petEffectBasisPoints: reward.petEffectBasisPoints,
      estimatedQuantityToCollect: 0,
      currentProgressRemainder: wasPersisted
        ? Number(reward.newProgressRemainder.toFixed(4))
        : Number(currentProgressRemainder.toFixed(4)),
      estimatedNewProgressRemainder: Number(
        reward.newProgressRemainder.toFixed(4),
      ),
    };
  }

  private async resolveActiveGathering(
    userId: string,
    characterId: string,
    options: ResolveGatheringOptions = {},
  ) {
    await this.assertCharacterOwnership(userId, characterId);

    const session = await this.findActiveGatheringSession(userId, characterId);

    if (!session) {
      if (options.throwIfMissing) {
        throw new BadRequestException('Nenhum gathering ativo.');
      }

      return null;
    }

    const currentHp =
      session.character.currentHp ?? session.character.maxHp ?? 1;

    if (session.character.status !== CharacterStatus.ACTIVE || currentHp <= 0) {
      return {
        serverNow: new Date(),
        session,
        updatedSession: session,
        inventoryItem: null as InventoryItem | null,
        gatheringSkill: null,
        updatedGatheringSkill: null,
        affinity: false,
        reward: {
          quantity: 0,
          newProgressRemainder: session.progressRemainder,
          elapsedHours: 0,
          rawAmount: 0,
          ratePerHour: 0,
          baseRatePerHour: 0,
          defaultRatePerHour: 0,
          skillRateMultiplier: 1,
          affinityRateMultiplier: 1,
          finalRateMultiplier: 1,
          baseCycleDurationMs: 0,
          cycleDurationMs: 0,
          petDefinitionId: session.appliedPetDefinitionId,
          petEffectBasisPoints: session.appliedPetEffectBasisPoints,
        } satisfies ProductionResult,
        elapsedSeconds: 0,
        xpGained: 0,
        gatheringProgress: null as GatheringProgressResult | null,
        wasPersisted: false,
        collected: {
          itemId: session.targetMaterialId,
          name: session.targetMaterial.name,
          quantity: 0,
        },
      };
    }

    if (options.validateCollectionGuard) {
      await this.activityGuard.ensureCanCollectGathering({
        characterId,
        userId,
      });
    }

    const gatheringSkill = await this.getOrCreateGatheringSkill({
      characterId,
      origin: session.origin,
    });

    const affinity = isClassAffinity({
      className: session.character.class?.name,
      origin: session.origin,
    });

    const now = new Date();
    const premiumActive = isPremiumActive(session.character.user, now);
    const idleProgressLimitSeconds = getIdleProgressLimitSeconds(premiumActive);
    const rateProfile = calculateProductionRateProfile({
      tier: session.map.tier,
      baseGatheringRatePerHour: getMaterialBaseGatheringRatePerHour(
        session.targetMaterial,
      ),
      skillLevel: gatheringSkill.level,
      isAffinity: affinity,
    });
    const cycleContext = await this.resolveGatheringCycle({
      characterId,
      origin: session.origin,
      session,
      rateProfile,
      serverNow: now,
      idleProgressLimitSeconds,
    });
    const reward = buildProductionResult({
      cycleResolution: cycleContext.cycleResolution,
      rateProfile,
      petBonus: cycleContext.appliedPetBonus,
    });
    const elapsedSeconds = cycleContext.cycleResolution.elapsedMs / 1_000;
    const resolvedCycleData = {
      cycleStartedAt: cycleContext.cycleResolution.cycle.startedAt,
      cycleEndsAt: cycleContext.cycleResolution.cycle.endsAt,
      cycleDurationMs: cycleContext.cycleResolution.cycle.durationMs,
      cycleVersion: cycleContext.cycleResolution.cycle.version,
      appliedPetDefinitionId:
        cycleContext.appliedPetBonus?.petDefinitionId ?? null,
      appliedPetEffectBasisPoints:
        cycleContext.appliedPetBonus?.effectBasisPoints ?? 0,
    };

    const gatheringXpPerUnit = getMaterialGatheringXpPerUnit(
      session.targetMaterial,
    );
    const xpGained = calculateSessionGatheringXp({
      previousQuantity: session.collectedQuantity,
      previousXp: session.collectedXp,
      quantityGained: reward.quantity,
      xpPerUnit: gatheringXpPerUnit,
      isAffinity: affinity,
      isPremium: premiumActive,
    });

    const gatheringProgressPreview = applyGatheringXp({
      skill: gatheringSkill,
      xpGained,
    });

    const shouldPersist =
      Boolean(options.forcePersist) ||
      reward.quantity > 0 ||
      cycleContext.needsCycleBackfill;

    if (!shouldPersist) {
      return {
        serverNow: now,
        session,
        updatedSession: {
          ...session,
          ...resolvedCycleData,
        },
        inventoryItem: null as InventoryItem | null,
        gatheringSkill,
        updatedGatheringSkill: gatheringSkill,
        affinity,
        reward,
        elapsedSeconds,
        xpGained,
        gatheringProgress: gatheringProgressPreview,
        wasPersisted: false,
        collected: {
          itemId: session.targetMaterialId,
          name: session.targetMaterial.name,
          quantity: 0,
        },
      };
    }

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.gatheringSession.updateMany({
        where: {
          id: session.id,
          status: ActivityStatus.ACTIVE,
          lastResolvedAt: session.lastResolvedAt,
        },
        data: {
          lastResolvedAt: now,
          progressRemainder: reward.newProgressRemainder,
          collectedQuantity: {
            increment: reward.quantity,
          },
          collectedXp: {
            increment: xpGained,
          },
          ...resolvedCycleData,
        },
      });

      if (claim.count <= 0) {
        return null;
      }

      let inventoryItem: InventoryItem | null = null;

      if (reward.quantity > 0) {
        inventoryItem = await tx.inventoryItem.upsert({
          where: {
            characterId_itemId: {
              characterId,
              itemId: session.targetMaterialId,
            },
          },
          update: {
            quantity: {
              increment: reward.quantity,
            },
            type: InventoryItemType.MATERIAL,
          },
          create: {
            characterId,
            itemId: session.targetMaterialId,
            quantity: reward.quantity,
            type: InventoryItemType.MATERIAL,
          },
        });

        const ledgerHour = getEconomyHourBucket(now);
        await accumulateEconomyEntry(tx, {
          characterId,
          direction: EconomyDirection.CREDIT,
          resourceType: EconomyResourceType.ITEM,
          itemId: session.targetMaterialId,
          tier: session.targetMaterial.tier,
          quantity: reward.quantity,
          reason: ECONOMY_REASONS.GATHERING_COLLECTED,
          referenceType: 'GatheringSession',
          referenceId: session.id,
          idempotencyKey: `gathering:${session.id}:hour:${ledgerHour}:item:${session.targetMaterialId}`,
          metadata: {
            origin: session.targetMaterial.materialOrigin ?? 'UNKNOWN',
          },
        });
      }

      if (xpGained > 0) {
        await accumulateEconomyEntry(tx, {
          characterId,
          direction: EconomyDirection.CREDIT,
          resourceType: EconomyResourceType.XP,
          tier: session.targetMaterial.tier,
          quantity: xpGained,
          reason: ECONOMY_REASONS.GATHERING_COLLECTED,
          referenceType: 'GatheringSession',
          referenceId: session.id,
          idempotencyKey: `gathering:${session.id}:hour:${getEconomyHourBucket(now)}:xp`,
          metadata: { xpKind: 'GATHERING_SKILL' },
        });
      }

      const updatedGatheringSkill =
        xpGained > 0
          ? await tx.characterGatheringSkill.update({
              where: {
                id: gatheringSkill.id,
              },
              data: {
                level: gatheringProgressPreview.newLevel,
                xp: gatheringProgressPreview.currentXp,
                totalXp: gatheringProgressPreview.totalXp,
              },
            })
          : gatheringSkill;

      const updatedSession = await tx.gatheringSession.findUniqueOrThrow({
        where: {
          id: session.id,
        },
        include: {
          map: {
            select: {
              id: true,
              name: true,
              tier: true,
            },
          },
          targetMaterial: {
            select: {
              id: true,
              name: true,
              slug: true,
              tier: true,
              materialOrigin: true,
              materialSlot: true,
              isGatheringMaterial: true,
              requiredGatheringLevel: true,
              gatheringXpPerUnit: true,
              baseGatheringRatePerHour: true,
            },
          },
        },
      });

      return {
        inventoryItem,
        updatedGatheringSkill,
        updatedSession,
      };
    });

    if (!transactionResult) {
      const freshSession = await this.findActiveGatheringSession(
        userId,
        characterId,
      );

      if (!freshSession) {
        if (options.throwIfMissing) {
          throw new BadRequestException('Nenhum gathering ativo.');
        }

        return null;
      }

      return {
        serverNow: now,
        session: freshSession,
        updatedSession: freshSession,
        inventoryItem: null as InventoryItem | null,
        gatheringSkill,
        updatedGatheringSkill: gatheringSkill,
        affinity,
        reward: {
          ...reward,
          quantity: 0,
          newProgressRemainder: freshSession.progressRemainder,
          cycleDurationMs:
            freshSession.cycleDurationMs ?? reward.cycleDurationMs,
          petDefinitionId: freshSession.appliedPetDefinitionId,
          petEffectBasisPoints: freshSession.appliedPetEffectBasisPoints,
        },
        elapsedSeconds: 0,
        xpGained: 0,
        gatheringProgress: applyGatheringXp({
          skill: gatheringSkill,
          xpGained: 0,
        }),
        wasPersisted: false,
        collected: {
          itemId: freshSession.targetMaterialId,
          name: freshSession.targetMaterial.name,
          quantity: 0,
        },
      };
    }

    if (reward.quantity > 0) {
      this.auditService.recordMilestoneSafely({
        actorUserId: userId,
        action: PRODUCT_EVENT_ACTIONS.FIRST_RESOURCE_COLLECTED,
        entityType: 'Character',
        entityId: characterId,
        deduplicationKey:
          PRODUCT_MILESTONE_KEYS.firstResourceCollected(characterId),
        metadata: {
          itemId: session.targetMaterialId,
          itemTier: session.targetMaterial.tier,
          origin: session.origin,
          quantity: reward.quantity,
        },
      });
    }

    return {
      serverNow: now,
      session,
      updatedSession: {
        ...transactionResult.updatedSession,
        character: session.character,
      },
      inventoryItem: transactionResult.inventoryItem,
      gatheringSkill,
      updatedGatheringSkill: transactionResult.updatedGatheringSkill,
      affinity,
      reward,
      elapsedSeconds,
      xpGained,
      gatheringProgress: gatheringProgressPreview,
      wasPersisted: true,
      collected: {
        itemId: session.targetMaterialId,
        name: session.targetMaterial.name,
        quantity: reward.quantity,
      },
    };
  }

  async listAvailableMaterials(params: {
    mapId: string;
    origin: MaterialOrigin;
  }) {
    const { mapId, origin } = params;

    if (!mapId) {
      throw new BadRequestException('O mapId é obrigatório.');
    }

    if (!origin) {
      throw new BadRequestException('A origem do gathering é obrigatória.');
    }

    this.validateGatheringOrigin(origin);

    const gameMap = await this.prisma.gameMap.findUnique({
      where: {
        id: mapId,
      },
      select: {
        id: true,
        name: true,
        tier: true,
        minLevel: true,
        maxLevel: true,
      },
    });

    if (!gameMap) {
      throw new NotFoundException('Mapa não encontrado.');
    }

    const rewardPreview = calculateGatheringReward({
      elapsedSeconds: 3600,
      tier: gameMap.tier,
      progressRemainder: 0,
    });

    const materials = await this.prisma.item.findMany({
      where: {
        mapId: gameMap.id,
        slot: ItemSlot.MATERIAL,
        materialOrigin: origin,
        isGatheringMaterial: true,
      },
      orderBy: [
        {
          requiredGatheringLevel: 'asc',
        },
        {
          tier: 'asc',
        },
        {
          name: 'asc',
        },
      ],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        tier: true,
        rarity: true,
        slot: true,
        family: true,
        materialOrigin: true,
        materialSlot: true,
        isGatheringMaterial: true,
        mapId: true,
        requiredGatheringLevel: true,
        gatheringXpPerUnit: true,
        baseGatheringRatePerHour: true,
        craftingIngredients: {
          where: {
            recipe: {
              isActive: true,
            },
          },
          select: {
            quantity: true,
            role: true,
            origin: true,
            recipe: {
              select: {
                id: true,
                tier: true,
                outputQuantity: true,
                outputItem: {
                  select: {
                    id: true,
                    name: true,
                    tier: true,
                    rarity: true,
                    slot: true,
                    family: true,
                    classId: true,
                    class: {
                      select: {
                        id: true,
                        name: true,
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

    return {
      map: {
        id: gameMap.id,
        name: gameMap.name,
        tier: gameMap.tier,
        minLevel: gameMap.minLevel,
        maxLevel: gameMap.maxLevel,
      },
      origin,
      ratePerHour: rewardPreview.ratePerHour,
      materials: materials.map((material) => {
        const usedInRecipes = mapUsedInRecipes(material);
        const relatedClasses = getRelatedClassesFromRecipes(usedInRecipes);
        const baseGatheringRatePerHour =
          getMaterialBaseGatheringRatePerHour(material);

        return {
          id: material.id,
          name: material.name,
          slug: material.slug,
          description: material.description,
          tier: material.tier,
          rarity: material.rarity,
          slot: material.slot,
          family: material.family,
          materialOrigin: material.materialOrigin,
          materialSlot: material.materialSlot,
          isGatheringMaterial: material.isGatheringMaterial,
          mapId: material.mapId,
          requiredGatheringLevel: material.requiredGatheringLevel,
          gatheringXpPerUnit: getMaterialGatheringXpPerUnit(material),
          baseGatheringRatePerHour,
          ratePerHour: baseGatheringRatePerHour,
          isUnlockedByDefault: material.requiredGatheringLevel <= 1,
          usedInRecipes,
          usedInRecipeCount: usedInRecipes.length,
          relatedClasses,
        };
      }),
    };
  }

  async start(userId: string, dto: StartGatheringDto) {
    this.validateGatheringOrigin(dto.origin);

    const activityState = await this.activityGuard.ensureCanStartGathering({
      characterId: dto.characterId,
      userId,
      allowActiveGathering: true,
    });

    const character = activityState.character;

    const gameMap = await this.prisma.gameMap.findUnique({
      where: {
        id: dto.mapId,
      },
      select: {
        id: true,
        name: true,
        tier: true,
        minLevel: true,
        maxLevel: true,
      },
    });

    if (!gameMap) {
      throw new NotFoundException('Mapa não encontrado.');
    }

    const targetMaterial = await this.prisma.item.findUnique({
      where: {
        id: dto.targetMaterialId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        tier: true,
        slot: true,
        mapId: true,
        materialOrigin: true,
        materialSlot: true,
        isGatheringMaterial: true,
        requiredGatheringLevel: true,
        gatheringXpPerUnit: true,
        baseGatheringRatePerHour: true,
      },
    });

    if (!targetMaterial) {
      throw new NotFoundException('Material alvo não encontrado.');
    }

    if (targetMaterial.slot !== ItemSlot.MATERIAL) {
      throw new BadRequestException('O item alvo precisa ser um material.');
    }

    if (targetMaterial.materialOrigin === MaterialOrigin.DROP_MOBS) {
      throw new BadRequestException(
        'Materiais de DROP_MOBS vêm do auto-combate e não podem ser farmados por gathering.',
      );
    }

    if (!targetMaterial.isGatheringMaterial) {
      throw new BadRequestException(
        'Este material não está liberado para gathering.',
      );
    }

    if (targetMaterial.materialOrigin !== dto.origin) {
      throw new BadRequestException({
        message:
          'A origem do material não corresponde ao tipo de gathering escolhido.',
        selectedGathering: dto.origin,
        materialOrigin: targetMaterial.materialOrigin,
        material: targetMaterial.name,
      });
    }

    if (targetMaterial.mapId !== dto.mapId) {
      throw new BadRequestException({
        message: 'Este material não pertence ao mapa escolhido.',
        selectedMapId: dto.mapId,
        materialMapId: targetMaterial.mapId,
      });
    }

    if (targetMaterial.tier !== gameMap.tier) {
      throw new BadRequestException({
        message: 'O tier do material não corresponde ao tier do mapa.',
        mapTier: gameMap.tier,
        materialTier: targetMaterial.tier,
      });
    }

    ensureCharacterIsOnGatheringMap({
      characterMapId: character.mapId,
      map: gameMap,
    });

    const gatheringSkill = await this.getOrCreateGatheringSkill({
      characterId: dto.characterId,
      origin: dto.origin,
    });

    if (gatheringSkill.level < targetMaterial.requiredGatheringLevel) {
      throw new BadRequestException({
        message: `Este material requer ${dto.origin} nível ${targetMaterial.requiredGatheringLevel}.`,
        origin: dto.origin,
        currentGatheringLevel: gatheringSkill.level,
        requiredGatheringLevel: targetMaterial.requiredGatheringLevel,
        material: targetMaterial.name,
      });
    }

    const characterWithClass = await this.prisma.character.findUnique({
      where: {
        id: dto.characterId,
      },
      select: {
        class: {
          select: {
            name: true,
          },
        },
      },
    });

    const affinity = isClassAffinity({
      className: characterWithClass?.class.name,
      origin: dto.origin,
    });

    const activeSession = activityState.hasActiveGathering
      ? await this.findActiveGatheringSession(userId, dto.characterId)
      : null;

    if (
      activeSession?.mapId === dto.mapId &&
      activeSession.origin === dto.origin &&
      activeSession.targetMaterialId === dto.targetMaterialId
    ) {
      return {
        message: `A coleta de ${targetMaterial.name} já está ativa.`,
        session: this.buildSessionPayload(activeSession),
        gatheringSkill: buildGatheringSkillViewModel({
          skill: gatheringSkill,
          isAffinity: affinity,
        }),
        switched: false,
        alreadyActive: true,
        previousGathering: null,
      };
    }

    const previousGatheringResolution = activeSession
      ? await this.resolveActiveGathering(userId, dto.characterId, {
          forcePersist: true,
          validateCollectionGuard: true,
          throwIfMissing: false,
        })
      : null;

    const now = new Date();
    const initialRateProfile = calculateProductionRateProfile({
      tier: gameMap.tier,
      baseGatheringRatePerHour:
        getMaterialBaseGatheringRatePerHour(targetMaterial),
      skillLevel: gatheringSkill.level,
      isAffinity: affinity,
    });
    const initialPetDuration = await this.petBonuses.calculateGatheringDuration(
      dto.characterId,
      dto.origin,
      initialRateProfile.baseCycleDurationMs,
      MIN_GATHERING_CYCLE_DURATION_MS,
    );
    const initialCycle = createGatheringCycleFromProgress({
      anchorAt: now,
      durationMs: initialPetDuration.durationMs,
      progressRemainder: 0,
      version: 1,
    });

    let transactionResult;

    try {
      transactionResult = await this.prisma.$transaction(
        async (tx) => {
          const currentActivityState =
            await this.activityGuard.ensureCanStartGathering({
              characterId: dto.characterId,
              userId,
              client: tx,
              lockCharacter: true,
              allowActiveGathering: true,
            });

          ensureCharacterIsOnGatheringMap({
            characterMapId: currentActivityState.character.mapId,
            map: gameMap,
          });

          const currentSession = currentActivityState.activeGatheringSession;

          if (
            currentSession?.map?.id === dto.mapId &&
            currentSession.origin === dto.origin &&
            currentSession.targetMaterial?.id === dto.targetMaterialId
          ) {
            const reusedSession = await tx.gatheringSession.findUniqueOrThrow({
              where: { id: currentSession.id },
              include: {
                character: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                    status: true,
                    currentHp: true,
                    maxHp: true,
                    user: {
                      select: {
                        premiumUntil: true,
                      },
                    },
                    class: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
                map: {
                  select: {
                    id: true,
                    name: true,
                    tier: true,
                  },
                },
                targetMaterial: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    tier: true,
                    materialOrigin: true,
                    materialSlot: true,
                    isGatheringMaterial: true,
                    requiredGatheringLevel: true,
                    gatheringXpPerUnit: true,
                    baseGatheringRatePerHour: true,
                  },
                },
              },
            });

            return {
              session: reusedSession,
              stoppedSessionId: null,
              alreadyActive: true,
            };
          }

          let stoppedSessionId: string | null = null;

          if (currentSession) {
            const stopped = await tx.gatheringSession.updateMany({
              where: {
                id: currentSession.id,
                characterId: dto.characterId,
                status: ActivityStatus.ACTIVE,
              },
              data: {
                status: ActivityStatus.STOPPED,
              },
            });

            if (stopped.count !== 1) {
              throw new ConflictException(
                'A coleta ativa mudou durante a troca. Tente novamente.',
              );
            }

            stoppedSessionId = currentSession.id;
          }

          const createdSession = await tx.gatheringSession.create({
            data: {
              characterId: dto.characterId,
              mapId: dto.mapId,
              origin: dto.origin,
              targetMaterialId: dto.targetMaterialId,
              status: ActivityStatus.ACTIVE,
              startedAt: now,
              lastResolvedAt: now,
              progressRemainder: 0,
              collectedQuantity: 0,
              collectedXp: 0,
              cycleStartedAt: initialCycle.startedAt,
              cycleEndsAt: initialCycle.endsAt,
              cycleDurationMs: initialCycle.durationMs,
              cycleVersion: initialCycle.version,
              appliedPetDefinitionId:
                initialPetDuration.bonus?.petDefinitionId ?? null,
              appliedPetEffectBasisPoints:
                initialPetDuration.bonus?.effectBasisPoints ?? 0,
            },
            include: {
              character: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                  status: true,
                  currentHp: true,
                  maxHp: true,
                  user: {
                    select: {
                      premiumUntil: true,
                    },
                  },
                  class: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
              map: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                },
              },
              targetMaterial: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  tier: true,
                  materialOrigin: true,
                  materialSlot: true,
                  isGatheringMaterial: true,
                  requiredGatheringLevel: true,
                  gatheringXpPerUnit: true,
                  baseGatheringRatePerHour: true,
                },
              },
            },
          });

          return {
            session: createdSession,
            stoppedSessionId,
            alreadyActive: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (this.isTransactionConflictError(error)) {
        throw new ConflictException(
          'Voce ja esta realizando outra atividade. Encerre a atividade atual antes de iniciar uma nova.',
        );
      }

      throw error;
    }

    const previousGathering =
      previousGatheringResolution &&
      transactionResult.stoppedSessionId ===
        previousGatheringResolution.session.id
        ? (() => {
            const previousSkill =
              previousGatheringResolution.updatedGatheringSkill ??
              previousGatheringResolution.gatheringSkill;

            return {
              collected: previousGatheringResolution.collected,
              production: this.buildProductionPayload({
                elapsedSeconds: previousGatheringResolution.elapsedSeconds,
                reward: previousGatheringResolution.reward,
                previousProgressRemainder:
                  previousGatheringResolution.session.progressRemainder,
              }),
              gatheringProgress:
                previousGatheringResolution.gatheringProgress && previousSkill
                  ? {
                      ...previousGatheringResolution.gatheringProgress,
                      skill: buildGatheringSkillViewModel({
                        skill: previousSkill,
                        isAffinity: previousGatheringResolution.affinity,
                      }),
                    }
                  : null,
              session: this.buildSessionPayload({
                ...previousGatheringResolution.updatedSession,
                status: ActivityStatus.STOPPED,
              }),
              inventoryItem: previousGatheringResolution.inventoryItem,
            };
          })()
        : null;

    const switched = Boolean(transactionResult.stoppedSessionId);

    return {
      message: transactionResult.alreadyActive
        ? `A coleta de ${targetMaterial.name} já está ativa.`
        : switched
          ? `Coleta alterada para ${targetMaterial.name}.`
          : 'Gathering iniciado com sucesso.',
      session: this.buildSessionPayload(transactionResult.session),
      gatheringSkill: buildGatheringSkillViewModel({
        skill: gatheringSkill,
        isAffinity: affinity,
      }),
      switched,
      alreadyActive: transactionResult.alreadyActive,
      previousGathering,
    };
  }

  async getStatus(userId: string, characterId: string) {
    const resolved = await this.resolveActiveGathering(userId, characterId, {
      forcePersist: false,
      validateCollectionGuard: false,
      throwIfMissing: false,
    });

    if (!resolved) {
      return {
        active: false,
        message: 'Nenhum gathering ativo.',
      };
    }

    const skill = resolved.updatedGatheringSkill ?? resolved.gatheringSkill;
    const session = this.buildSessionPayload(
      resolved.updatedSession,
      resolved.serverNow,
    );

    return {
      active: true,
      serverNow: resolved.serverNow,
      timeline: session.timeline,
      session,
      gatheringSkill: skill
        ? buildGatheringSkillViewModel({
            skill,
            isAffinity: resolved.affinity,
          })
        : null,
      productionPreview: {
        ...this.buildProductionPreviewPayload({
          elapsedSeconds: resolved.elapsedSeconds,
          reward: resolved.reward,
          currentProgressRemainder: resolved.session.progressRemainder,
          wasPersisted: resolved.wasPersisted,
        }),
        timeline: session.timeline,
      },
      autoCollected: resolved.collected,
      inventoryItem: resolved.inventoryItem,
    };
  }

  async collect(userId: string, characterId: string) {
    const resolved = await this.resolveActiveGathering(userId, characterId, {
      forcePersist: true,
      validateCollectionGuard: true,
      throwIfMissing: true,
    });

    if (!resolved) {
      throw new BadRequestException('Nenhum gathering ativo para coletar.');
    }

    const skill = resolved.updatedGatheringSkill ?? resolved.gatheringSkill;

    return {
      message:
        resolved.collected.quantity > 0
          ? 'Coleta resolvida com sucesso.'
          : 'Nenhuma unidade pronta para coletar ainda.',
      collected: resolved.collected,
      production: this.buildProductionPayload({
        elapsedSeconds: resolved.elapsedSeconds,
        reward: resolved.reward,
        previousProgressRemainder: resolved.session.progressRemainder,
      }),
      gatheringProgress:
        resolved.gatheringProgress && skill
          ? {
              ...resolved.gatheringProgress,
              skill: buildGatheringSkillViewModel({
                skill,
                isAffinity: resolved.affinity,
              }),
            }
          : null,
      session: this.buildSessionPayload(
        resolved.updatedSession,
        resolved.serverNow,
      ),
      inventoryItem: resolved.inventoryItem,
    };
  }

  async stop(userId: string, characterId: string) {
    await this.assertCharacterOwnership(userId, characterId);

    const session = await this.findActiveGatheringSession(userId, characterId);

    if (!session) {
      throw new BadRequestException('Nenhum gathering ativo para encerrar.');
    }

    const currentHp =
      session.character.currentHp ?? session.character.maxHp ?? 1;

    if (session.character.status !== CharacterStatus.ACTIVE || currentHp <= 0) {
      const stoppedSession = await this.prisma.gatheringSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: ActivityStatus.STOPPED,
        },
        include: {
          map: {
            select: {
              id: true,
              name: true,
              tier: true,
            },
          },
          targetMaterial: {
            select: {
              id: true,
              name: true,
              slug: true,
              tier: true,
              materialOrigin: true,
              materialSlot: true,
              isGatheringMaterial: true,
              requiredGatheringLevel: true,
              gatheringXpPerUnit: true,
              baseGatheringRatePerHour: true,
            },
          },
        },
      });

      return {
        message:
          'Gathering encerrado sem coleta, pois o personagem está derrotado ou não está ativo.',
        collected: {
          itemId: session.targetMaterialId,
          name: session.targetMaterial.name,
          quantity: 0,
        },
        production: {
          elapsedSeconds: 0,
          elapsedHours: 0,
          ratePerHour: 0,
          baseRatePerHour: 0,
          defaultRatePerHour: 0,
          skillRateMultiplier: 1,
          affinityRateMultiplier: 1,
          finalRateMultiplier: 1,
          previousProgressRemainder: Number(
            session.progressRemainder.toFixed(4),
          ),
          newProgressRemainder: Number(session.progressRemainder.toFixed(4)),
        },
        gatheringProgress: null,
        session: this.buildSessionPayload({
          ...stoppedSession,
          character: session.character,
        }),
      };
    }

    const resolved = await this.resolveActiveGathering(userId, characterId, {
      forcePersist: true,
      validateCollectionGuard: true,
      throwIfMissing: true,
    });

    const stoppedSession = await this.prisma.gatheringSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: ActivityStatus.STOPPED,
      },
      include: {
        map: {
          select: {
            id: true,
            name: true,
            tier: true,
          },
        },
        targetMaterial: {
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
            materialOrigin: true,
            materialSlot: true,
            isGatheringMaterial: true,
            requiredGatheringLevel: true,
            gatheringXpPerUnit: true,
            baseGatheringRatePerHour: true,
          },
        },
      },
    });

    const skill = resolved?.updatedGatheringSkill ?? resolved?.gatheringSkill;

    return {
      message: 'Gathering encerrado com sucesso.',
      collected: resolved?.collected ?? {
        itemId: session.targetMaterialId,
        name: session.targetMaterial.name,
        quantity: 0,
      },
      production: resolved
        ? this.buildProductionPayload({
            elapsedSeconds: resolved.elapsedSeconds,
            reward: resolved.reward,
            previousProgressRemainder: resolved.session.progressRemainder,
          })
        : {
            elapsedSeconds: 0,
            elapsedHours: 0,
            ratePerHour: 0,
            baseRatePerHour: 0,
            defaultRatePerHour: 0,
            skillRateMultiplier: 1,
            affinityRateMultiplier: 1,
            finalRateMultiplier: 1,
            previousProgressRemainder: Number(
              session.progressRemainder.toFixed(4),
            ),
            newProgressRemainder: Number(session.progressRemainder.toFixed(4)),
          },
      gatheringProgress:
        resolved?.gatheringProgress && skill
          ? {
              ...resolved.gatheringProgress,
              skill: buildGatheringSkillViewModel({
                skill,
                isAffinity: resolved.affinity,
              }),
            }
          : null,
      session: this.buildSessionPayload({
        ...stoppedSession,
        character: session.character,
      }),
    };
  }

  async flushForWorldBossTransition(userId: string, characterId: string) {
    return this.resolveActiveGathering(userId, characterId, {
      forcePersist: true,
      validateCollectionGuard: false,
      throwIfMissing: false,
    });
  }

  private isTransactionConflictError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2034' || error.code === 'P2002')
    );
  }
}
