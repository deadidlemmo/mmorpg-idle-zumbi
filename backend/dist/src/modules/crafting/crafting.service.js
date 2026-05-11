"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CraftingService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
let CraftingService = class CraftingService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listCharacterRecipes(params) {
        const { characterId, tier, slot, craftableOnly = false } = params;
        if (!characterId) {
            throw new common_1.BadRequestException('O characterId é obrigatório.');
        }
        if (tier !== undefined && (!Number.isInteger(tier) || tier <= 0)) {
            throw new common_1.BadRequestException('O tier precisa ser um número inteiro maior que zero.');
        }
        if (slot !== undefined && !Object.values(client_1.ItemSlot).includes(slot)) {
            throw new common_1.BadRequestException({
                message: 'Slot inválido.',
                validSlots: Object.values(client_1.ItemSlot),
            });
        }
        const character = await this.prisma.character.findUnique({
            where: {
                id: characterId,
            },
            select: {
                id: true,
                name: true,
                level: true,
                status: true,
                classId: true,
                class: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const inventoryItems = await this.prisma.inventoryItem.findMany({
            where: {
                characterId,
            },
            select: {
                itemId: true,
                quantity: true,
            },
        });
        const inventoryByItemId = new Map(inventoryItems.map((inventoryItem) => [
            inventoryItem.itemId,
            inventoryItem.quantity,
        ]));
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
        const equippedItemIds = new Set([
            equipment?.mainHandId,
            equipment?.offHandId,
            equipment?.headId,
            equipment?.armorId,
            equipment?.pantsId,
            equipment?.bootsId,
        ].filter(Boolean));
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
            .filter((recipe) => recipe.outputItem.slot !== client_1.ItemSlot.MATERIAL)
            .filter((recipe) => {
            if (recipe.outputItem.classId === null) {
                return true;
            }
            return recipe.outputItem.classId === character.classId;
        })
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
            const missingIngredients = ingredients.filter((ingredient) => ingredient.missing > 0);
            const canCraft = ingredients.length > 0 && missingIngredients.length === 0;
            const totalRequired = ingredients.reduce((total, ingredient) => total + ingredient.required, 0);
            const totalAvailableCapped = ingredients.reduce((total, ingredient) => {
                const usableAmount = Math.min(ingredient.available, ingredient.required);
                return total + usableAmount;
            }, 0);
            const missingTotal = ingredients.reduce((total, ingredient) => total + ingredient.missing, 0);
            const progressPercent = totalRequired <= 0
                ? 0
                : Number(((totalAvailableCapped / totalRequired) * 100).toFixed(2));
            const missingByOriginMap = new Map();
            for (const ingredient of missingIngredients) {
                const originKey = ingredient.origin ?? 'UNKNOWN';
                const material = {
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
                }
                else {
                    currentGroup.totalMissing += ingredient.missing;
                    currentGroup.materials.push(material);
                }
            }
            const missingByOrigin = Array.from(missingByOriginMap.values()).sort((a, b) => this.getOriginPriority(a.origin) - this.getOriginPriority(b.origin));
            const maxCraftableTimes = ingredients.length === 0
                ? 0
                : Math.min(...ingredients.map((ingredient) => {
                    if (ingredient.required <= 0) {
                        return 0;
                    }
                    return Math.floor(ingredient.available / ingredient.required);
                }));
            const ownedQuantity = inventoryByItemId.get(recipe.outputItem.id) ?? 0;
            const isEquipped = equippedItemIds.has(recipe.outputItem.id);
            return {
                recipeId: recipe.id,
                tier: recipe.tier,
                isActive: recipe.isActive,
                outputQuantity: recipe.outputQuantity,
                ownedQuantity,
                isEquipped,
                canCraft,
                maxCraftableTimes,
                maxOutputQuantity: maxCraftableTimes * recipe.outputQuantity,
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
                    maxCraftableTimes,
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
                status: character.status,
                class: character.class,
            },
            filters: {
                tier: tier ?? null,
                slot: slot ?? null,
                craftableOnly,
                classId: character.classId,
            },
            summary: {
                totalRecipes: visibleRecipes.length,
                craftableRecipes: visibleRecipes.filter((recipe) => recipe.canCraft)
                    .length,
                blockedRecipes: visibleRecipes.filter((recipe) => !recipe.canCraft)
                    .length,
                ownedRecipes: visibleRecipes.filter((recipe) => recipe.ownedQuantity > 0)
                    .length,
                equippedRecipes: visibleRecipes.filter((recipe) => recipe.isEquipped)
                    .length,
            },
            recipes: visibleRecipes,
        };
    }
    async getRecipeByOutputItemId(itemId) {
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
            throw new common_1.NotFoundException('Receita não encontrada para este item.');
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
    async getRecipe(itemId) {
        return this.getRecipeByOutputItemId(itemId);
    }
    async craft(dto) {
        const craftQuantity = dto.quantity ?? 1;
        if (!Number.isInteger(craftQuantity) || craftQuantity <= 0) {
            throw new common_1.BadRequestException('A quantidade para craft precisa ser um número inteiro maior que zero.');
        }
        const character = await this.prisma.character.findUnique({
            where: {
                id: dto.characterId,
            },
            select: {
                id: true,
                name: true,
                level: true,
                status: true,
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        if (character.status !== client_1.CharacterStatus.ACTIVE) {
            throw new common_1.BadRequestException('Apenas personagens ativos podem craftar itens.');
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
            throw new common_1.NotFoundException('Receita não encontrada para este item.');
        }
        if (!recipe.isActive) {
            throw new common_1.BadRequestException('Esta receita está desativada.');
        }
        if (!recipe.outputItem.isCraftable) {
            throw new common_1.BadRequestException('Este item não é craftável.');
        }
        if (recipe.outputItem.slot === client_1.ItemSlot.MATERIAL) {
            throw new common_1.BadRequestException('Materiais não podem ser craftados por esta rota.');
        }
        const requiredItemIds = recipe.ingredients.map((ingredient) => ingredient.itemId);
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
        const inventoryByItemId = new Map(inventoryItems.map((inventoryItem) => [
            inventoryItem.itemId,
            inventoryItem.quantity,
        ]));
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
            throw new common_1.BadRequestException({
                message: 'Materiais insuficientes para craftar este item.',
                missingIngredients,
            });
        }
        const crafted = await this.prisma.$transaction(async (tx) => {
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
            const outputInventoryType = recipe.outputItem.slot === client_1.ItemSlot.CONSUMABLE
                ? client_1.InventoryItemType.CONSUMABLE
                : client_1.InventoryItemType.EQUIPMENT;
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
            return craftedInventoryItem;
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
            inventoryItem: crafted,
        };
    }
    buildRecipeNextActions(params) {
        const actions = [];
        if (params.canCraft) {
            actions.push({
                type: 'CRAFT',
                priority: 1,
                label: `Craftar ${params.outputItemName}`,
                description: 'Você possui materiais suficientes para craftar este item.',
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
            if (group.origin === client_1.MaterialOrigin.DROP_MOBS) {
                const recommendedMapId = group.materials.find((material) => material.mapId)?.mapId ??
                    params.outputItemMapId;
                actions.push({
                    type: 'AUTO_COMBAT',
                    priority: 2,
                    origin: group.origin,
                    label: 'Obter materiais derrotando zumbis',
                    description: 'Este recurso vem de drop de mobs. Use o auto-combate no mapa correspondente.',
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
    getGatheringActionLabel(origin) {
        if (origin === client_1.MaterialOrigin.COLETA) {
            return 'Coletar materiais';
        }
        if (origin === client_1.MaterialOrigin.CONTENCAO) {
            return 'Farmar materiais de contenção';
        }
        if (origin === client_1.MaterialOrigin.DESMANCHE) {
            return 'Desmanchar sucata';
        }
        return 'Farmar materiais';
    }
    getGatheringActionDescription(origin) {
        if (origin === client_1.MaterialOrigin.COLETA) {
            return 'Use gathering de coleta para obter os materiais faltantes.';
        }
        if (origin === client_1.MaterialOrigin.CONTENCAO) {
            return 'Use gathering de contenção para obter lacres, filtros e materiais sanitários.';
        }
        if (origin === client_1.MaterialOrigin.DESMANCHE) {
            return 'Use gathering de desmanche para obter peças principais e componentes estruturais.';
        }
        return 'Use o sistema de gathering para obter os materiais faltantes.';
    }
    getOriginPriority(origin) {
        if (origin === client_1.MaterialOrigin.DESMANCHE) {
            return 1;
        }
        if (origin === client_1.MaterialOrigin.COLETA) {
            return 2;
        }
        if (origin === client_1.MaterialOrigin.CONTENCAO) {
            return 3;
        }
        if (origin === client_1.MaterialOrigin.DROP_MOBS) {
            return 4;
        }
        return 99;
    }
};
exports.CraftingService = CraftingService;
exports.CraftingService = CraftingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CraftingService);
//# sourceMappingURL=crafting.service.js.map