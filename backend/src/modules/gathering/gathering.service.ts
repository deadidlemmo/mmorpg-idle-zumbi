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
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  Prisma,
} from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import {
  GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
  GATHERING_AFFINITY_XP_MULTIPLIER,
  GATHERING_LEVEL_CAP,
  GATHERING_STAT_BONUS_PER_LEVEL,
  getGatheringRateMultiplier,
  getGatheringStatBonus,
  getGatheringXpPerUnitForTier,
  getGatheringXpProgressPercent,
  getGatheringXpToNextLevel,
} from '../../common/config/gathering.config';
import { getIdleProgressLimitSeconds } from '../../common/config/membership.config';
import { calculateGatheringReward } from '../../common/utils/gathering.util';
import {
  applyPremiumXpBonus,
  isPremiumActive,
} from '../../common/utils/membership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { StartGatheringDto } from './dto/start-gathering.dto';

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
};

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

function getMaterialGatheringXpPerUnit(material: { tier: number }) {
  return getGatheringXpPerUnitForTier(material.tier);
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

function calculateProduction(params: {
  elapsedSeconds: number;
  tier: number;
  progressRemainder: number;
  baseGatheringRatePerHour?: number | null;
  skillLevel: number;
  isAffinity: boolean;
  maxElapsedSeconds?: number;
}): ProductionResult {
  const defaultReward = calculateGatheringReward({
    elapsedSeconds: params.elapsedSeconds,
    tier: params.tier,
    progressRemainder: params.progressRemainder,
    maxElapsedSeconds: params.maxElapsedSeconds,
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

  const finalRateMultiplier =
    (baseRatePerHour / defaultRatePerHour) *
    skillRateMultiplier *
    affinityRateMultiplier;

  const reward = calculateGatheringReward({
    elapsedSeconds: params.elapsedSeconds,
    tier: params.tier,
    progressRemainder: params.progressRemainder,
    rateMultiplier: finalRateMultiplier,
    maxElapsedSeconds: params.maxElapsedSeconds,
  });

  return {
    quantity: reward.quantity,
    newProgressRemainder: reward.newProgressRemainder,
    elapsedHours: reward.elapsedHours,
    rawAmount: reward.rawAmount,
    ratePerHour: Number(
      (baseRatePerHour * skillRateMultiplier * affinityRateMultiplier).toFixed(
        4,
      ),
    ),
    baseRatePerHour,
    defaultRatePerHour,
    skillRateMultiplier: Number(skillRateMultiplier.toFixed(4)),
    affinityRateMultiplier: Number(affinityRateMultiplier.toFixed(4)),
    finalRateMultiplier: Number(finalRateMultiplier.toFixed(4)),
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

@Injectable()
export class GatheringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
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

  private async findActiveGatheringSession(characterId: string) {
    return this.prisma.gatheringSession.findFirst({
      where: {
        characterId,
        status: ActivityStatus.ACTIVE,
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

  private buildSessionPayload(session: {
    id: string;
    status: ActivityStatus;
    origin: MaterialOrigin;
    startedAt: Date;
    lastResolvedAt: Date;
    progressRemainder: number;
    collectedQuantity: number;
    collectedXp: number;
    character?: unknown;
    map?: unknown;
    targetMaterial?: unknown;
  }) {
    return {
      id: session.id,
      status: session.status,
      origin: session.origin,
      startedAt: session.startedAt,
      lastResolvedAt: session.lastResolvedAt,
      progressRemainder: session.progressRemainder,
      collectedQuantity: session.collectedQuantity,
      collectedXp: session.collectedXp,
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
    characterId: string,
    options: ResolveGatheringOptions = {},
  ) {
    const session = await this.findActiveGatheringSession(characterId);

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
    const rawElapsedSeconds = Math.max(
      0,
      (now.getTime() - session.lastResolvedAt.getTime()) / 1000,
    );
    const elapsedSeconds = Math.min(
      rawElapsedSeconds,
      idleProgressLimitSeconds,
    );

    const reward = calculateProduction({
      elapsedSeconds,
      tier: session.map.tier,
      progressRemainder: session.progressRemainder,
      baseGatheringRatePerHour: session.targetMaterial.baseGatheringRatePerHour,
      skillLevel: gatheringSkill.level,
      isAffinity: affinity,
      maxElapsedSeconds: idleProgressLimitSeconds,
    });

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

    const shouldPersist = Boolean(options.forcePersist) || reward.quantity > 0;

    if (!shouldPersist) {
      return {
        session,
        updatedSession: session,
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
              tier: true,
              materialOrigin: true,
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
      const freshSession = await this.findActiveGatheringSession(characterId);

      if (!freshSession) {
        if (options.throwIfMissing) {
          throw new BadRequestException('Nenhum gathering ativo.');
        }

        return null;
      }

      return {
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

    return {
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
        craftingIngredients: {
          some: {
            recipe: {
              isActive: true,
            },
          },
        },
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
          baseGatheringRatePerHour: material.baseGatheringRatePerHour,
          ratePerHour:
            material.baseGatheringRatePerHour ?? rewardPreview.ratePerHour,
          isUnlockedByDefault: material.requiredGatheringLevel <= 1,
          usedInRecipes,
          usedInRecipeCount: usedInRecipes.length,
          relatedClasses,
        };
      }),
    };
  }

  async start(dto: StartGatheringDto) {
    this.validateGatheringOrigin(dto.origin);

    const activityState = await this.activityGuard.ensureCanStartGathering({
      characterId: dto.characterId,
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
        _count: {
          select: {
            craftingIngredients: {
              where: {
                recipe: {
                  isActive: true,
                },
              },
            },
          },
        },
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

    if (targetMaterial._count.craftingIngredients <= 0) {
      throw new BadRequestException(
        'Este material ainda não está vinculado a nenhuma receita ativa.',
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

    if (character.level < gameMap.minLevel) {
      throw new BadRequestException({
        message: 'O personagem ainda não possui nível mínimo para este mapa.',
        characterLevel: character.level,
        requiredMinLevel: gameMap.minLevel,
      });
    }

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

    const now = new Date();

    let session;

    try {
      session = await this.prisma.$transaction(
        async (tx) => {
          await this.activityGuard.ensureCanStartGathering({
            characterId: dto.characterId,
            client: tx,
            lockCharacter: true,
          });

          return tx.gatheringSession.create({
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

    return {
      message: 'Gathering iniciado com sucesso.',
      session: this.buildSessionPayload(session),
      gatheringSkill: buildGatheringSkillViewModel({
        skill: gatheringSkill,
        isAffinity: affinity,
      }),
    };
  }

  async getStatus(characterId: string) {
    const resolved = await this.resolveActiveGathering(characterId, {
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

    return {
      active: true,
      session: this.buildSessionPayload(resolved.updatedSession),
      gatheringSkill: skill
        ? buildGatheringSkillViewModel({
            skill,
            isAffinity: resolved.affinity,
          })
        : null,
      productionPreview: this.buildProductionPreviewPayload({
        elapsedSeconds: resolved.elapsedSeconds,
        reward: resolved.reward,
        currentProgressRemainder: resolved.session.progressRemainder,
        wasPersisted: resolved.wasPersisted,
      }),
      autoCollected: resolved.collected,
      inventoryItem: resolved.inventoryItem,
    };
  }

  async collect(characterId: string) {
    const resolved = await this.resolveActiveGathering(characterId, {
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
      session: this.buildSessionPayload(resolved.updatedSession),
      inventoryItem: resolved.inventoryItem,
    };
  }

  async stop(characterId: string) {
    const session = await this.findActiveGatheringSession(characterId);

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
              tier: true,
              materialOrigin: true,
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

    const resolved = await this.resolveActiveGathering(characterId, {
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

  private isTransactionConflictError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
