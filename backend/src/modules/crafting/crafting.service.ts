import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  CharacterStatus,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
} from '@prisma/client';
import type { CharacterCraftingSkill } from '@prisma/client';
import {
  CRAFTING_LEVEL_CAP,
  getCraftingDurationSecondsForTier,
  getCraftingXpProgressPercent,
  getCraftingXpRewardForTier,
  getCraftingXpToNextLevel,
  getRequiredCraftingLevelForTier,
  getUnlockedCraftingTier,
} from '../../common/config/crafting.config';
import { getIdleProgressLimitSeconds } from '../../common/config/membership.config';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { isPremiumActive } from '../../common/utils/membership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CraftItemDto } from './dto/craft-item.dto';

type MissingMaterial = {
  itemId: string;
  name: string;
  missing: number;
  required: number;
  available: number;
  role: string;
  origin: string | null;
  materialOrigin: string | null;
  mapId: string | null;
  family: string | null;
};

type MissingByOriginGroup = {
  origin: string;
  totalMissing: number;
  materials: MissingMaterial[];
};

type RecipeNextActionEndpoint = {
  method: 'POST';
  path: string;
  body: Record<string, string | number>;
};

type RecipeNextActionMaterial = {
  itemId: string;
  name: string;
  missing: number;
  required: number;
  available: number;
  role: string;
  family: string | null;
  mapId: string | null;
  canStartGathering?: boolean;
  endpoint?: RecipeNextActionEndpoint | null;
  startGatheringPayload?: Record<string, string> | null;
};

type RecipeNextAction = {
  type: 'CRAFT' | 'AUTO_COMBAT' | 'GATHERING';
  priority: number;
  origin?: string;
  label: string;
  description: string;
  endpoint?: RecipeNextActionEndpoint;
  maxCraftableTimes?: number;
  missingTotal?: number;
  recommendedMapId?: string | null;
  materials?: RecipeNextActionMaterial[];
};

type CraftingSkillSnapshot = Pick<
  CharacterCraftingSkill,
  'id' | 'characterId' | 'level' | 'xp' | 'totalXp'
>;

type CraftingProgressResult = {
  xpGained: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  levelsGained: number;
  currentXp: number;
  totalXp: number;
  xpToNextLevel: number | null;
  xpProgressPercent: number;
};

type CraftingSessionSnapshot = {
  id: string;
  characterId: string;
  recipeId: string;
  outputItemId: string;
  status: ActivityStatus;
  quantity: number;
  outputQuantity: number;
  craftingXpGained: number;
  durationSeconds: number;
  startedAt: Date;
  completesAt: Date;
  completedAt: Date | null;
  outputItem: {
    id: string;
    name: string;
    description: string | null;
    tier: number;
    rarity: string;
    slot: ItemSlot;
    family: string;
  };
};

@Injectable()
export class CraftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
  ) {}

  async listCharacterRecipes(params: {
    userId: string;
    characterId: string;
    tier?: number;
    slot?: ItemSlot;
    craftableOnly?: boolean;
  }) {
    const { userId, characterId, tier, slot, craftableOnly = false } = params;

    if (!characterId) {
      throw new BadRequestException('O characterId é obrigatório.');
    }

    if (tier !== undefined && (!Number.isInteger(tier) || tier <= 0)) {
      throw new BadRequestException(
        'O tier precisa ser um número inteiro maior que zero.',
      );
    }

    if (slot !== undefined && !Object.values(ItemSlot).includes(slot)) {
      throw new BadRequestException({
        message: 'Slot inválido.',
        validSlots: Object.values(ItemSlot),
      });
    }

    const character = await this.prisma.character.findUnique({
      where: {
        id: characterId,
      },
      select: {
        id: true,
        userId: true,
        name: true,
        level: true,
        status: true,
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            premiumUntil: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    if (character.userId !== userId) {
      throw new ForbiddenException('Você não pode acessar este personagem.');
    }

    const maxIdleCraftingDurationSeconds = getIdleProgressLimitSeconds(
      isPremiumActive(character.user),
    );

    const resolvedCraftingSessions =
      await this.resolveCompletedCraftingSessions(characterId);
    const activeCraftingSession =
      await this.findActiveCraftingSession(characterId);

    const craftingSkill = await this.getOrCreateCraftingSkill(characterId);
    const craftingSkillViewModel =
      this.buildCraftingSkillViewModel(craftingSkill);

    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        characterId,
      },
      select: {
        itemId: true,
        quantity: true,
      },
    });

    const inventoryByItemId = new Map(
      inventoryItems.map((inventoryItem) => [
        inventoryItem.itemId,
        inventoryItem.quantity,
      ]),
    );

    const equipment = await this.prisma.equipment.findFirst({
      where: {
        characterId,
      },
      select: {
        mainHandId: true,
        offHandId: true,
        headId: true,
        armorId: true,
        pantsId: true,
        bootsId: true,
      },
    });

    const equippedItemIds = new Set(
      [
        equipment?.mainHandId,
        equipment?.offHandId,
        equipment?.headId,
        equipment?.armorId,
        equipment?.pantsId,
        equipment?.bootsId,
      ].filter(Boolean) as string[],
    );

    const recipes = await this.prisma.craftingRecipe.findMany({
      where: {
        isActive: true,
      },
      include: {
        outputItem: {
          select: {
            id: true,
            name: true,
            description: true,
            tier: true,
            rarity: true,
            slot: true,
            family: true,
            classId: true,
            mapId: true,
            class: {
              select: {
                id: true,
                name: true,
              },
            },
            map: {
              select: {
                id: true,
                name: true,
                tier: true,
                minLevel: true,
                maxLevel: true,
              },
            },
            isCraftable: true,
            strengthBonus: true,
            vitalityBonus: true,
            agilityBonus: true,
            precisionBonus: true,
            techniqueBonus: true,
            willpowerBonus: true,
          },
        },
        ingredients: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                description: true,
                tier: true,
                rarity: true,
                slot: true,
                family: true,
                mapId: true,
                map: {
                  select: {
                    id: true,
                    name: true,
                    tier: true,
                    minLevel: true,
                    maxLevel: true,
                  },
                },
                materialOrigin: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    const filteredRecipes = recipes
      .filter((recipe) => recipe.outputItem.isCraftable)
      .filter((recipe) => recipe.outputItem.slot !== ItemSlot.MATERIAL)
      .filter((recipe) => {
        if (tier === undefined) {
          return true;
        }

        return recipe.outputItem.tier === tier;
      })
      .filter((recipe) => {
        if (slot === undefined) {
          return true;
        }

        return recipe.outputItem.slot === slot;
      })
      .sort((a, b) => {
        if (a.outputItem.tier !== b.outputItem.tier) {
          return a.outputItem.tier - b.outputItem.tier;
        }

        if (a.outputItem.slot !== b.outputItem.slot) {
          return a.outputItem.slot.localeCompare(b.outputItem.slot);
        }

        return a.outputItem.name.localeCompare(b.outputItem.name);
      });

    const formattedRecipes = filteredRecipes.map((recipe) => {
      const ingredients = recipe.ingredients.map((ingredient) => {
        const available = inventoryByItemId.get(ingredient.itemId) ?? 0;
        const required = ingredient.quantity;
        const missing = Math.max(required - available, 0);

        return {
          id: ingredient.id,
          itemId: ingredient.itemId,
          name: ingredient.item.name,
          description: ingredient.item.description,
          required,
          available,
          missing,
          hasEnough: missing === 0,
          role: ingredient.role,
          origin: ingredient.origin,
          materialOrigin: ingredient.item.materialOrigin,
          mapId: ingredient.item.mapId,
          tier: ingredient.item.tier,
          rarity: ingredient.item.rarity,
          slot: ingredient.item.slot,
          family: ingredient.item.family,
        };
      });

      const missingIngredients = ingredients.filter(
        (ingredient) => ingredient.missing > 0,
      );

      const hasRequiredMaterials =
        ingredients.length > 0 && missingIngredients.length === 0;
      const requiredCraftingLevel = getRequiredCraftingLevelForTier(
        recipe.outputItem.tier,
      );
      const isUnlocked = craftingSkill.level >= requiredCraftingLevel;
      const canCraft = hasRequiredMaterials && isUnlocked;
      const craftingXpReward = getCraftingXpRewardForTier(
        recipe.outputItem.tier,
      );
      const craftingDurationSeconds = getCraftingDurationSecondsForTier(
        recipe.outputItem.tier,
      );

      const totalRequired = ingredients.reduce(
        (total, ingredient) => total + ingredient.required,
        0,
      );

      const totalAvailableCapped = ingredients.reduce((total, ingredient) => {
        const usableAmount = Math.min(
          ingredient.available,
          ingredient.required,
        );

        return total + usableAmount;
      }, 0);

      const missingTotal = ingredients.reduce(
        (total, ingredient) => total + ingredient.missing,
        0,
      );

      const progressPercent =
        totalRequired <= 0
          ? 0
          : Number(((totalAvailableCapped / totalRequired) * 100).toFixed(2));

      const missingByOriginMap = new Map<string, MissingByOriginGroup>();

      for (const ingredient of missingIngredients) {
        const originKey = ingredient.origin ?? 'UNKNOWN';

        const material: MissingMaterial = {
          itemId: ingredient.itemId,
          name: ingredient.name,
          missing: ingredient.missing,
          required: ingredient.required,
          available: ingredient.available,
          role: ingredient.role,
          origin: ingredient.origin,
          materialOrigin: ingredient.materialOrigin,
          mapId: ingredient.mapId,
          family: ingredient.family,
        };

        const currentGroup = missingByOriginMap.get(originKey);

        if (!currentGroup) {
          missingByOriginMap.set(originKey, {
            origin: originKey,
            totalMissing: ingredient.missing,
            materials: [material],
          });
        } else {
          currentGroup.totalMissing += ingredient.missing;
          currentGroup.materials.push(material);
        }
      }

      const missingByOrigin = Array.from(missingByOriginMap.values()).sort(
        (a, b) =>
          this.getOriginPriority(a.origin) - this.getOriginPriority(b.origin),
      );

      const maxCraftableTimesByDuration =
        craftingDurationSeconds > 0
          ? Math.floor(maxIdleCraftingDurationSeconds / craftingDurationSeconds)
          : 0;

      const maxCraftableTimes =
        ingredients.length === 0
          ? 0
          : Math.min(
              maxCraftableTimesByDuration,
              ...ingredients.map((ingredient) => {
                if (ingredient.required <= 0) {
                  return 0;
                }

                return Math.floor(ingredient.available / ingredient.required);
              }),
            );

      const ownedQuantity = inventoryByItemId.get(recipe.outputItem.id) ?? 0;
      const isEquipped = equippedItemIds.has(recipe.outputItem.id);

      return {
        recipeId: recipe.id,
        tier: recipe.tier,
        isActive: recipe.isActive,
        outputQuantity: recipe.outputQuantity,

        ownedQuantity,
        isEquipped,

        isUnlocked,
        requiredCraftingLevel,
        requiredCharacterLevel: requiredCraftingLevel,
        craftingXpReward,
        craftingDurationSeconds,
        lockReason: isUnlocked
          ? null
          : `Requer nível ${requiredCraftingLevel} de criação.`,
        canCraft,
        maxCraftableTimes: isUnlocked ? maxCraftableTimes : 0,
        maxOutputQuantity: isUnlocked
          ? maxCraftableTimes * recipe.outputQuantity
          : 0,
        maxBatchCraftingDurationSeconds:
          isUnlocked && maxCraftableTimes > 0
            ? getCraftingDurationSecondsForTier(
                recipe.outputItem.tier,
                maxCraftableTimes,
              )
            : 0,
        maxIdleCraftingDurationSeconds,

        progress: {
          percent: progressPercent,
          requiredTotal: totalRequired,
          availableTotal: totalAvailableCapped,
          missingTotal,
        },

        missingByOrigin,

        nextActions: this.buildRecipeNextActions({
          characterId,
          outputItemId: recipe.outputItem.id,
          outputItemName: recipe.outputItem.name,
          outputItemMapId: recipe.outputItem.mapId,
          canCraft,
          maxCraftableTimes: isUnlocked ? maxCraftableTimes : 0,
          missingByOrigin,
        }),

        outputItem: {
          id: recipe.outputItem.id,
          name: recipe.outputItem.name,
          description: recipe.outputItem.description,
          tier: recipe.outputItem.tier,
          rarity: recipe.outputItem.rarity,
          slot: recipe.outputItem.slot,
          family: recipe.outputItem.family,
          classId: recipe.outputItem.classId,
          mapId: recipe.outputItem.mapId,
          class: recipe.outputItem.class,
          map: recipe.outputItem.map,
          bonuses: {
            strength: recipe.outputItem.strengthBonus,
            vitality: recipe.outputItem.vitalityBonus,
            agility: recipe.outputItem.agilityBonus,
            precision: recipe.outputItem.precisionBonus,
            technique: recipe.outputItem.techniqueBonus,
            willpower: recipe.outputItem.willpowerBonus,
          },
        },

        ingredients,
        missingIngredients,
      };
    });

    const visibleRecipes = craftableOnly
      ? formattedRecipes.filter((recipe) => recipe.canCraft)
      : formattedRecipes;

    return {
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        craftingLevel: craftingSkillViewModel.level,
        unlockedTier: craftingSkillViewModel.unlockedTier,
        craftingSkill: craftingSkillViewModel,
        status: character.status,
        class: character.class,
      },
      filters: {
        tier: tier ?? null,
        slot: slot ?? null,
        craftableOnly,
        classId: null,
      },
      limits: {
        maxIdleCraftingDurationSeconds,
        maxIdleCraftingDurationHours: maxIdleCraftingDurationSeconds / 3600,
      },
      summary: {
        totalRecipes: visibleRecipes.length,
        craftableRecipes: visibleRecipes.filter((recipe) => recipe.canCraft)
          .length,
        blockedRecipes: visibleRecipes.filter((recipe) => !recipe.canCraft)
          .length,
        ownedRecipes: visibleRecipes.filter(
          (recipe) => recipe.ownedQuantity > 0,
        ).length,
        equippedRecipes: visibleRecipes.filter((recipe) => recipe.isEquipped)
          .length,
      },
      activeSession: activeCraftingSession
        ? this.buildCraftingSessionViewModel(activeCraftingSession)
        : null,
      completedSessions: resolvedCraftingSessions.map((session) =>
        this.buildCraftingSessionViewModel(session),
      ),
      recipes: visibleRecipes,
    };
  }

  async getRecipeByOutputItemId(itemId: string) {
    const recipe = await this.prisma.craftingRecipe.findFirst({
      where: {
        outputItemId: itemId,
        isActive: true,
      },
      include: {
        outputItem: {
          select: {
            id: true,
            name: true,
            description: true,
            tier: true,
            rarity: true,
            slot: true,
            family: true,
            classId: true,
            mapId: true,
            class: {
              select: {
                id: true,
                name: true,
              },
            },
            map: {
              select: {
                id: true,
                name: true,
                tier: true,
                minLevel: true,
                maxLevel: true,
              },
            },
            isCraftable: true,
            strengthBonus: true,
            vitalityBonus: true,
            agilityBonus: true,
            precisionBonus: true,
            techniqueBonus: true,
            willpowerBonus: true,
          },
        },
        ingredients: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                description: true,
                tier: true,
                rarity: true,
                slot: true,
                family: true,
                mapId: true,
                map: {
                  select: {
                    id: true,
                    name: true,
                    tier: true,
                    minLevel: true,
                    maxLevel: true,
                  },
                },
                materialOrigin: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException('Receita não encontrada para este item.');
    }

    return {
      id: recipe.id,
      tier: recipe.tier,
      isActive: recipe.isActive,
      outputQuantity: recipe.outputQuantity,
      outputItem: {
        id: recipe.outputItem.id,
        name: recipe.outputItem.name,
        description: recipe.outputItem.description,
        tier: recipe.outputItem.tier,
        rarity: recipe.outputItem.rarity,
        slot: recipe.outputItem.slot,
        family: recipe.outputItem.family,
        classId: recipe.outputItem.classId,
        mapId: recipe.outputItem.mapId,
        class: recipe.outputItem.class,
        map: recipe.outputItem.map,
        isCraftable: recipe.outputItem.isCraftable,
        bonuses: {
          strength: recipe.outputItem.strengthBonus,
          vitality: recipe.outputItem.vitalityBonus,
          agility: recipe.outputItem.agilityBonus,
          precision: recipe.outputItem.precisionBonus,
          technique: recipe.outputItem.techniqueBonus,
          willpower: recipe.outputItem.willpowerBonus,
        },
      },
      ingredients: recipe.ingredients.map((ingredient) => ({
        id: ingredient.id,
        itemId: ingredient.itemId,
        name: ingredient.item.name,
        description: ingredient.item.description,
        quantity: ingredient.quantity,
        role: ingredient.role,
        origin: ingredient.origin,
        materialOrigin: ingredient.item.materialOrigin,
        mapId: ingredient.item.mapId,
        tier: ingredient.item.tier,
        rarity: ingredient.item.rarity,
        slot: ingredient.item.slot,
        family: ingredient.item.family,
      })),
    };
  }

  async getRecipe(itemId: string) {
    return this.getRecipeByOutputItemId(itemId);
  }

  async getCharacterCraftingStatus(userId: string, characterId: string) {
    if (!characterId) {
      throw new BadRequestException('O characterId é obrigatório.');
    }

    const character = await this.prisma.character.findUnique({
      where: {
        id: characterId,
      },
      select: {
        id: true,
        userId: true,
        name: true,
        level: true,
        status: true,
        class: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    if (character.userId !== userId) {
      throw new ForbiddenException('Você não pode acessar este personagem.');
    }

    const completedSessions =
      await this.resolveCompletedCraftingSessions(characterId);
    const activeSession = await this.findActiveCraftingSession(characterId);
    const craftingSkill = await this.getOrCreateCraftingSkill(characterId);
    const craftingSkillViewModel =
      this.buildCraftingSkillViewModel(craftingSkill);

    return {
      active: Boolean(activeSession),
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        craftingLevel: craftingSkillViewModel.level,
        unlockedTier: craftingSkillViewModel.unlockedTier,
        craftingSkill: craftingSkillViewModel,
        status: character.status,
        class: character.class,
      },
      craftingSkill: craftingSkillViewModel,
      activeSession: activeSession
        ? this.buildCraftingSessionViewModel(activeSession)
        : null,
      completedSessions: completedSessions.map((session) =>
        this.buildCraftingSessionViewModel(session),
      ),
    };
  }

  async craft(userId: string, dto: CraftItemDto) {
    const craftQuantity = dto.quantity ?? 1;

    if (!Number.isInteger(craftQuantity) || craftQuantity <= 0) {
      throw new BadRequestException(
        'A quantidade para craft precisa ser um número inteiro maior que zero.',
      );
    }

    const character = await this.prisma.character.findUnique({
      where: {
        id: dto.characterId,
      },
      select: {
        id: true,
        userId: true,
        name: true,
        status: true,
        user: {
          select: {
            premiumUntil: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    if (character.userId !== userId) {
      throw new ForbiddenException(
        'Você não pode craftar com este personagem.',
      );
    }

    if (character.status !== CharacterStatus.ACTIVE) {
      throw new BadRequestException(
        'Apenas personagens ativos podem craftar itens.',
      );
    }

    await this.resolveCompletedCraftingSessions(dto.characterId);
    await this.activityGuard.ensureCanStartCrafting({
      characterId: dto.characterId,
      userId,
    });

    const recipe = await this.prisma.craftingRecipe.findFirst({
      where: {
        outputItemId: dto.itemId,
      },
      include: {
        outputItem: true,
        ingredients: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException('Receita não encontrada para este item.');
    }

    if (!recipe.isActive) {
      throw new BadRequestException('Esta receita está desativada.');
    }

    if (!recipe.outputItem.isCraftable) {
      throw new BadRequestException('Este item não é craftável.');
    }

    const craftingSkill = await this.getOrCreateCraftingSkill(character.id);
    const requiredCraftingLevel = getRequiredCraftingLevelForTier(
      recipe.outputItem.tier,
    );

    if (craftingSkill.level < requiredCraftingLevel) {
      throw new BadRequestException(
        `Este item exige nível ${requiredCraftingLevel} de criação.`,
      );
    }

    if (recipe.outputItem.slot === ItemSlot.MATERIAL) {
      throw new BadRequestException(
        'Materiais não podem ser craftados por esta rota.',
      );
    }

    const requiredItemIds = recipe.ingredients.map(
      (ingredient) => ingredient.itemId,
    );

    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        characterId: dto.characterId,
        itemId: {
          in: requiredItemIds,
        },
      },
      include: {
        item: true,
      },
    });

    const inventoryByItemId = new Map(
      inventoryItems.map((inventoryItem) => [
        inventoryItem.itemId,
        inventoryItem.quantity,
      ]),
    );

    const missingIngredients = recipe.ingredients
      .map((ingredient) => {
        const available = inventoryByItemId.get(ingredient.itemId) ?? 0;
        const required = ingredient.quantity * craftQuantity;
        const missing = required - available;

        return {
          itemId: ingredient.itemId,
          name: ingredient.item.name,
          required,
          available,
          missing: Math.max(missing, 0),
          origin: ingredient.origin,
          role: ingredient.role,
        };
      })
      .filter((ingredient) => ingredient.missing > 0);

    if (missingIngredients.length > 0) {
      throw new BadRequestException({
        message: 'Materiais insuficientes para craftar este item.',
        missingIngredients,
      });
    }

    const craftingXpGained =
      getCraftingXpRewardForTier(recipe.outputItem.tier) * craftQuantity;
    const durationSeconds = getCraftingDurationSecondsForTier(
      recipe.outputItem.tier,
      craftQuantity,
    );
    const maxIdleCraftingDurationSeconds = getIdleProgressLimitSeconds(
      isPremiumActive(character.user),
    );

    if (durationSeconds > maxIdleCraftingDurationSeconds) {
      throw new BadRequestException({
        message:
          'Esta quantidade excede o tempo maximo de criacao idle permitido.',
        durationSeconds,
        maxIdleCraftingDurationSeconds,
        maxIdleCraftingDurationHours: maxIdleCraftingDurationSeconds / 3600,
      });
    }

    const startedAt = new Date();
    const completesAt = new Date(startedAt.getTime() + durationSeconds * 1000);

    const craftResult = await this.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: {
          id: dto.characterId,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      const activeCraftingSession = await tx.craftingSession.findFirst({
        where: {
          characterId: dto.characterId,
          status: ActivityStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (activeCraftingSession) {
        throw new ConflictException({
          message:
            'Este personagem já possui uma fabricação em andamento. Aguarde finalizar antes de iniciar outra.',
          activeCraftingSession,
        });
      }

      const activeCraftingSkill = await tx.characterCraftingSkill.upsert({
        where: {
          characterId: dto.characterId,
        },
        update: {},
        create: {
          characterId: dto.characterId,
        },
      });

      if (activeCraftingSkill.level < requiredCraftingLevel) {
        throw new BadRequestException(
          `Este item exige nível ${requiredCraftingLevel} de criação.`,
        );
      }

      for (const ingredient of recipe.ingredients) {
        await tx.inventoryItem.update({
          where: {
            characterId_itemId: {
              characterId: dto.characterId,
              itemId: ingredient.itemId,
            },
          },
          data: {
            quantity: {
              decrement: ingredient.quantity * craftQuantity,
            },
          },
        });
      }

      const outputQuantity = recipe.outputQuantity * craftQuantity;

      await tx.inventoryItem.deleteMany({
        where: {
          characterId: dto.characterId,
          quantity: {
            lte: 0,
          },
        },
      });

      const craftingSession = await tx.craftingSession.create({
        data: {
          characterId: dto.characterId,
          recipeId: recipe.id,
          outputItemId: recipe.outputItemId,
          quantity: craftQuantity,
          outputQuantity,
          craftingXpGained,
          durationSeconds,
          startedAt,
          completesAt,
        },
        include: {
          outputItem: {
            select: {
              id: true,
              name: true,
              description: true,
              tier: true,
              rarity: true,
              slot: true,
              family: true,
            },
          },
        },
      });

      return {
        craftingSkill: activeCraftingSkill,
        craftingSession,
      };
    });

    return {
      message: 'Fabricação iniciada.',
      character: {
        id: character.id,
        name: character.name,
      },
      craftedItem: {
        id: recipe.outputItem.id,
        name: recipe.outputItem.name,
        description: recipe.outputItem.description,
        tier: recipe.outputItem.tier,
        rarity: recipe.outputItem.rarity,
        slot: recipe.outputItem.slot,
        family: recipe.outputItem.family,
        quantity: recipe.outputQuantity * craftQuantity,
      },
      consumed: recipe.ingredients.map((ingredient) => ({
        itemId: ingredient.itemId,
        name: ingredient.item.name,
        quantity: ingredient.quantity * craftQuantity,
        role: ingredient.role,
        origin: ingredient.origin,
      })),
      craftingSkill: this.buildCraftingSkillViewModel(
        craftResult.craftingSkill,
      ),
      craftingSession: this.buildCraftingSessionViewModel(
        craftResult.craftingSession,
      ),
    };
  }

  async stop(userId: string, characterId: string) {
    if (!characterId) {
      throw new BadRequestException('O characterId Ã© obrigatÃ³rio.');
    }

    const character = await this.prisma.character.findUnique({
      where: {
        id: characterId,
      },
      select: {
        id: true,
        userId: true,
        name: true,
        status: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem nÃ£o encontrado.');
    }

    if (character.userId !== userId) {
      throw new ForbiddenException(
        'VocÃª nÃ£o pode encerrar a criaÃ§Ã£o deste personagem.',
      );
    }

    if (character.status !== CharacterStatus.ACTIVE) {
      throw new BadRequestException(
        'Apenas personagens ativos podem encerrar criaÃ§Ãµes.',
      );
    }

    await this.resolveCompletedCraftingSessions(characterId);

    const activeSession = await this.findActiveCraftingSession(characterId);

    if (!activeSession) {
      throw new BadRequestException('Nenhuma criaÃ§Ã£o ativa para encerrar.');
    }

    const stoppedAt = new Date();
    const stopResult = await this.prisma.craftingSession.updateMany({
      where: {
        id: activeSession.id,
        status: ActivityStatus.ACTIVE,
      },
      data: {
        status: ActivityStatus.STOPPED,
        completedAt: stoppedAt,
      },
    });

    if (stopResult.count <= 0) {
      throw new ConflictException(
        'Esta criaÃ§Ã£o jÃ¡ foi encerrada por outra aÃ§Ã£o.',
      );
    }

    return {
      ...(await this.getCharacterCraftingStatus(userId, characterId)),
      message:
        'CriaÃ§Ã£o encerrada. Materiais consumidos nÃ£o foram recuperados.',
      stoppedSession: this.buildCraftingSessionViewModel({
        ...activeSession,
        status: ActivityStatus.STOPPED,
        completedAt: stoppedAt,
      }),
    };
  }

  private async findActiveCraftingSession(characterId: string) {
    return this.prisma.craftingSession.findFirst({
      where: {
        characterId,
        status: ActivityStatus.ACTIVE,
      },
      orderBy: {
        startedAt: 'desc',
      },
      include: {
        outputItem: {
          select: {
            id: true,
            name: true,
            description: true,
            tier: true,
            rarity: true,
            slot: true,
            family: true,
          },
        },
      },
    });
  }

  private async resolveCompletedCraftingSessions(characterId: string) {
    const now = new Date();
    const sessions = await this.prisma.craftingSession.findMany({
      where: {
        characterId,
        status: ActivityStatus.ACTIVE,
        completesAt: {
          lte: now,
        },
      },
      orderBy: {
        completesAt: 'asc',
      },
      include: {
        outputItem: {
          select: {
            id: true,
            name: true,
            description: true,
            tier: true,
            rarity: true,
            slot: true,
            family: true,
          },
        },
      },
    });

    const completedSessions: CraftingSessionSnapshot[] = [];

    for (const session of sessions) {
      const completedSession = await this.prisma.$transaction(async (tx) => {
        const claimedSession = await tx.craftingSession.updateMany({
          where: {
            id: session.id,
            status: ActivityStatus.ACTIVE,
          },
          data: {
            status: ActivityStatus.COMPLETED,
            completedAt: now,
          },
        });

        if (claimedSession.count <= 0) {
          return null;
        }

        const inventoryType =
          session.outputItem.slot === ItemSlot.CONSUMABLE
            ? InventoryItemType.CONSUMABLE
            : InventoryItemType.EQUIPMENT;

        await tx.inventoryItem.upsert({
          where: {
            characterId_itemId: {
              characterId,
              itemId: session.outputItemId,
            },
          },
          update: {
            quantity: {
              increment: session.outputQuantity,
            },
            type: inventoryType,
          },
          create: {
            characterId,
            itemId: session.outputItemId,
            quantity: session.outputQuantity,
            type: inventoryType,
          },
        });

        const activeCraftingSkill = await tx.characterCraftingSkill.upsert({
          where: {
            characterId,
          },
          update: {},
          create: {
            characterId,
          },
        });

        const craftingProgress = this.applyCraftingXp({
          skill: activeCraftingSkill,
          xpGained: session.craftingXpGained,
        });

        await tx.characterCraftingSkill.update({
          where: {
            id: activeCraftingSkill.id,
          },
          data: {
            level: craftingProgress.newLevel,
            xp: craftingProgress.currentXp,
            totalXp: craftingProgress.totalXp,
          },
        });

        return tx.craftingSession.findUnique({
          where: {
            id: session.id,
          },
          include: {
            outputItem: {
              select: {
                id: true,
                name: true,
                description: true,
                tier: true,
                rarity: true,
                slot: true,
                family: true,
              },
            },
          },
        });
      });

      if (completedSession) {
        completedSessions.push(completedSession);
      }
    }

    return completedSessions;
  }

  private buildCraftingSessionViewModel(session: CraftingSessionSnapshot) {
    const nowMs = Date.now();
    const startedAtMs = session.startedAt.getTime();
    const completesAtMs = session.completesAt.getTime();
    const totalMs = Math.max(1, completesAtMs - startedAtMs);
    const elapsedMs =
      session.status === ActivityStatus.ACTIVE
        ? Math.max(0, nowMs - startedAtMs)
        : totalMs;
    const remainingSeconds =
      session.status === ActivityStatus.ACTIVE
        ? Math.max(0, Math.ceil((completesAtMs - nowMs) / 1000))
        : 0;

    return {
      id: session.id,
      characterId: session.characterId,
      recipeId: session.recipeId,
      outputItemId: session.outputItemId,
      status: session.status,
      quantity: session.quantity,
      outputQuantity: session.outputQuantity,
      craftingXpGained: session.craftingXpGained,
      durationSeconds: session.durationSeconds,
      remainingSeconds,
      progressPercent: Math.max(
        0,
        Math.min(100, Math.floor((elapsedMs / totalMs) * 100)),
      ),
      startedAt: session.startedAt,
      completesAt: session.completesAt,
      completedAt: session.completedAt,
      outputItem: session.outputItem,
    };
  }

  private buildRecipeNextActions(params: {
    characterId: string;
    outputItemId: string;
    outputItemName: string;
    outputItemMapId: string | null;
    canCraft: boolean;
    maxCraftableTimes: number;
    missingByOrigin: MissingByOriginGroup[];
  }): RecipeNextAction[] {
    const actions: RecipeNextAction[] = [];

    if (params.canCraft) {
      actions.push({
        type: 'CRAFT',
        priority: 1,
        label: `Craftar ${params.outputItemName}`,
        description:
          'Você possui materiais suficientes para craftar este item.',
        endpoint: {
          method: 'POST',
          path: '/crafting/craft',
          body: {
            characterId: params.characterId,
            itemId: params.outputItemId,
            quantity: 1,
          },
        },
        maxCraftableTimes: params.maxCraftableTimes,
      });

      return actions;
    }

    for (const group of params.missingByOrigin) {
      if (group.origin === MaterialOrigin.DROP_MOBS) {
        const recommendedMapId =
          group.materials.find((material) => material.mapId)?.mapId ??
          params.outputItemMapId;

        actions.push({
          type: 'AUTO_COMBAT',
          priority: 2,
          origin: group.origin,
          label: 'Obter materiais derrotando zumbis',
          description:
            'Este recurso vem de drop de mobs. Use o auto-combate no mapa correspondente.',
          missingTotal: group.totalMissing,
          recommendedMapId,
          materials: group.materials.map((material) => ({
            itemId: material.itemId,
            name: material.name,
            missing: material.missing,
            required: material.required,
            available: material.available,
            role: material.role,
            family: material.family,
            mapId: material.mapId ?? recommendedMapId,
          })),
        });

        continue;
      }

      actions.push({
        type: 'GATHERING',
        priority: 3,
        origin: group.origin,
        label: this.getGatheringActionLabel(group.origin),
        description: this.getGatheringActionDescription(group.origin),
        missingTotal: group.totalMissing,
        materials: group.materials.map((material) => {
          const mapId = material.mapId ?? params.outputItemMapId;

          return {
            itemId: material.itemId,
            name: material.name,
            missing: material.missing,
            required: material.required,
            available: material.available,
            role: material.role,
            family: material.family,
            mapId,
            canStartGathering: Boolean(mapId),
            endpoint: mapId
              ? {
                  method: 'POST',
                  path: '/gathering/start',
                  body: {
                    characterId: params.characterId,
                    mapId,
                    origin: group.origin,
                    targetMaterialId: material.itemId,
                  },
                }
              : null,
            startGatheringPayload: mapId
              ? {
                  characterId: params.characterId,
                  mapId,
                  origin: group.origin,
                  targetMaterialId: material.itemId,
                }
              : null,
          };
        }),
      });
    }

    return actions.sort((a, b) => a.priority - b.priority);
  }

  private getGatheringActionLabel(origin: string) {
    if (origin === MaterialOrigin.COLETA) {
      return 'Coletar materiais';
    }

    if (origin === MaterialOrigin.CONTENCAO) {
      return 'Farmar materiais de contenção';
    }

    if (origin === MaterialOrigin.DESMANCHE) {
      return 'Desmanchar sucata';
    }

    return 'Farmar materiais';
  }

  private getGatheringActionDescription(origin: string) {
    if (origin === MaterialOrigin.COLETA) {
      return 'Use gathering de coleta para obter os materiais faltantes.';
    }

    if (origin === MaterialOrigin.CONTENCAO) {
      return 'Use gathering de contenção para obter lacres, filtros e materiais sanitários.';
    }

    if (origin === MaterialOrigin.DESMANCHE) {
      return 'Use gathering de desmanche para obter peças principais e componentes estruturais.';
    }

    return 'Use o sistema de gathering para obter os materiais faltantes.';
  }

  private getOriginPriority(origin: string) {
    if (origin === MaterialOrigin.DESMANCHE) {
      return 1;
    }

    if (origin === MaterialOrigin.COLETA) {
      return 2;
    }

    if (origin === MaterialOrigin.CONTENCAO) {
      return 3;
    }

    if (origin === MaterialOrigin.DROP_MOBS) {
      return 4;
    }

    return 99;
  }

  private async getOrCreateCraftingSkill(characterId: string) {
    return this.prisma.characterCraftingSkill.upsert({
      where: {
        characterId,
      },
      update: {},
      create: {
        characterId,
      },
    });
  }

  private buildCraftingSkillViewModel(skill: CraftingSkillSnapshot) {
    const xpToNextLevel = getCraftingXpToNextLevel(skill.level);

    return {
      id: skill.id,
      characterId: skill.characterId,
      level: skill.level,
      xp: skill.xp,
      totalXp: skill.totalXp,
      xpToNextLevel,
      xpProgressPercent: getCraftingXpProgressPercent(skill.xp, xpToNextLevel),
      isAtLevelCap: skill.level >= CRAFTING_LEVEL_CAP,
      unlockedTier: getUnlockedCraftingTier(skill.level),
    };
  }

  private applyCraftingXp(params: {
    skill: CraftingSkillSnapshot;
    xpGained: number;
  }): CraftingProgressResult {
    const safeXpGained = Math.max(0, Math.floor(params.xpGained));
    let level = Math.max(1, params.skill.level);
    let currentXp = Math.max(0, params.skill.xp) + safeXpGained;
    const totalXp = Math.max(0, params.skill.totalXp) + safeXpGained;
    const previousLevel = level;

    while (level < CRAFTING_LEVEL_CAP) {
      const xpToNextLevel = getCraftingXpToNextLevel(level);

      if (!xpToNextLevel || currentXp < xpToNextLevel) {
        break;
      }

      currentXp -= xpToNextLevel;
      level += 1;
    }

    if (level >= CRAFTING_LEVEL_CAP) {
      level = CRAFTING_LEVEL_CAP;
      currentXp = 0;
    }

    const levelsGained = Math.max(0, level - previousLevel);
    const xpToNextLevel = getCraftingXpToNextLevel(level);

    return {
      xpGained: safeXpGained,
      previousLevel,
      newLevel: level,
      leveledUp: levelsGained > 0,
      levelsGained,
      currentXp,
      totalXp,
      xpToNextLevel,
      xpProgressPercent: getCraftingXpProgressPercent(currentXp, xpToNextLevel),
    };
  }
}
