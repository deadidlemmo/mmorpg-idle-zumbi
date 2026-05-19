import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterStatus,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
} from '@prisma/client';
import type { CharacterCraftingSkill } from '@prisma/client';
import {
  CRAFTING_LEVEL_CAP,
  getCraftingXpProgressPercent,
  getCraftingXpRewardForTier,
  getCraftingXpToNextLevel,
  getRequiredCraftingLevelForTier,
  getUnlockedCraftingTier,
} from '../../common/config/crafting.config';
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

@Injectable()
export class CraftingService {
  constructor(private readonly prisma: PrismaService) {}

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
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    if (character.userId !== userId) {
      throw new ForbiddenException('Você não pode acessar este personagem.');
    }

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

      const maxCraftableTimes =
        ingredients.length === 0
          ? 0
          : Math.min(
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
        lockReason: isUnlocked
          ? null
          : `Requer nível ${requiredCraftingLevel} de criação.`,
        canCraft,
        maxCraftableTimes: isUnlocked ? maxCraftableTimes : 0,
        maxOutputQuantity: isUnlocked
          ? maxCraftableTimes * recipe.outputQuantity
          : 0,

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

    const craftResult = await this.prisma.$transaction(async (tx) => {
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

      const outputInventoryType =
        recipe.outputItem.slot === ItemSlot.CONSUMABLE
          ? InventoryItemType.CONSUMABLE
          : InventoryItemType.EQUIPMENT;

      const outputQuantity = recipe.outputQuantity * craftQuantity;

      const craftedInventoryItem = await tx.inventoryItem.upsert({
        where: {
          characterId_itemId: {
            characterId: dto.characterId,
            itemId: recipe.outputItemId,
          },
        },
        update: {
          quantity: {
            increment: outputQuantity,
          },
          type: outputInventoryType,
        },
        create: {
          characterId: dto.characterId,
          itemId: recipe.outputItemId,
          quantity: outputQuantity,
          type: outputInventoryType,
        },
      });

      await tx.inventoryItem.deleteMany({
        where: {
          characterId: dto.characterId,
          quantity: {
            lte: 0,
          },
        },
      });

      const craftingProgress = this.applyCraftingXp({
        skill: activeCraftingSkill,
        xpGained: craftingXpGained,
      });

      const updatedCraftingSkill = await tx.characterCraftingSkill.update({
        where: {
          id: activeCraftingSkill.id,
        },
        data: {
          level: craftingProgress.newLevel,
          xp: craftingProgress.currentXp,
          totalXp: craftingProgress.totalXp,
        },
      });

      return {
        inventoryItem: craftedInventoryItem,
        craftingSkill: updatedCraftingSkill,
        craftingProgress,
      };
    });

    return {
      message: 'Item craftado com sucesso.',
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
      inventoryItem: craftResult.inventoryItem,
      craftingSkill: this.buildCraftingSkillViewModel(
        craftResult.craftingSkill,
      ),
      craftingProgress: craftResult.craftingProgress,
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
