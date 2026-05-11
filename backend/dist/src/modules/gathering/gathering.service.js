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
exports.GatheringService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_guard_service_1 = require("../../common/activity-guard/activity-guard.service");
const gathering_util_1 = require("../../common/utils/gathering.util");
const prisma_service_1 = require("../../prisma/prisma.service");
const GATHERING_LEVEL_CAP = 50;
const GATHERING_STAT_BONUS_PER_LEVEL = 2;
const GATHERING_PRODUCTION_BONUS_PER_LEVEL = 0.03;
const GATHERING_AFFINITY_XP_MULTIPLIER = 1.15;
const GATHERING_AFFINITY_PRODUCTION_MULTIPLIER = 1.05;
const GATHERING_ORIGINS = [
    client_1.MaterialOrigin.DESMANCHE,
    client_1.MaterialOrigin.COLETA,
    client_1.MaterialOrigin.CONTENCAO,
    client_1.MaterialOrigin.ARSENAL,
    client_1.MaterialOrigin.PATRULHA,
    client_1.MaterialOrigin.TECNOVARREDURA,
];
const ORIGIN_STAT_INFO = {
    [client_1.MaterialOrigin.DESMANCHE]: {
        stat: 'strength',
        label: 'Força',
    },
    [client_1.MaterialOrigin.COLETA]: {
        stat: 'vitality',
        label: 'Vitalidade',
    },
    [client_1.MaterialOrigin.PATRULHA]: {
        stat: 'agility',
        label: 'Agilidade',
    },
    [client_1.MaterialOrigin.ARSENAL]: {
        stat: 'precision',
        label: 'Precisão',
    },
    [client_1.MaterialOrigin.TECNOVARREDURA]: {
        stat: 'technique',
        label: 'Técnica',
    },
    [client_1.MaterialOrigin.CONTENCAO]: {
        stat: 'willpower',
        label: 'Vontade',
    },
};
const CLASS_GATHERING_AFFINITIES = {
    LUTADOR: [
        client_1.MaterialOrigin.DESMANCHE,
        client_1.MaterialOrigin.COLETA,
        client_1.MaterialOrigin.CONTENCAO,
    ],
    ATIRADOR: [
        client_1.MaterialOrigin.DESMANCHE,
        client_1.MaterialOrigin.ARSENAL,
        client_1.MaterialOrigin.PATRULHA,
    ],
    ASSASSINO: [
        client_1.MaterialOrigin.PATRULHA,
        client_1.MaterialOrigin.ARSENAL,
        client_1.MaterialOrigin.TECNOVARREDURA,
    ],
    MEDICO: [
        client_1.MaterialOrigin.TECNOVARREDURA,
        client_1.MaterialOrigin.COLETA,
        client_1.MaterialOrigin.CONTENCAO,
    ],
};
function isValidGatheringOrigin(origin) {
    return GATHERING_ORIGINS.includes(origin);
}
function normalizeClassName(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}
function getGatheringXpToNextLevel(level) {
    if (level >= GATHERING_LEVEL_CAP) {
        return null;
    }
    return Math.max(50, level * 50);
}
function getGatheringRateMultiplier(level) {
    return 1 + Math.max(0, level - 1) * GATHERING_PRODUCTION_BONUS_PER_LEVEL;
}
function getGatheringStatBonus(level) {
    return Math.max(0, level - 1) * GATHERING_STAT_BONUS_PER_LEVEL;
}
function getXpProgressPercent(xp, xpToNextLevel) {
    if (!xpToNextLevel || xpToNextLevel <= 0) {
        return 100;
    }
    return Math.max(0, Math.min(100, Math.floor((xp / xpToNextLevel) * 100)));
}
function isClassAffinity(params) {
    if (!isValidGatheringOrigin(params.origin)) {
        return false;
    }
    const normalizedClassName = normalizeClassName(params.className);
    const affinities = CLASS_GATHERING_AFFINITIES[normalizedClassName] ?? [];
    return affinities.includes(params.origin);
}
function buildGatheringSkillViewModel(params) {
    const { skill, isAffinity } = params;
    const xpToNextLevel = getGatheringXpToNextLevel(skill.level);
    const validOrigin = isValidGatheringOrigin(skill.origin)
        ? skill.origin
        : client_1.MaterialOrigin.DESMANCHE;
    const statInfo = ORIGIN_STAT_INFO[validOrigin];
    return {
        id: skill.id,
        characterId: skill.characterId,
        origin: skill.origin,
        level: skill.level,
        xp: skill.xp,
        totalXp: skill.totalXp,
        xpToNextLevel,
        xpProgressPercent: getXpProgressPercent(skill.xp, xpToNextLevel),
        isAtLevelCap: skill.level >= GATHERING_LEVEL_CAP,
        isClassAffinity: isAffinity,
        statBonus: {
            stat: statInfo.stat,
            label: statInfo.label,
            amount: getGatheringStatBonus(skill.level),
        },
        productionBonusPercent: Math.round((getGatheringRateMultiplier(skill.level) - 1) * 100),
        affinityBonus: isAffinity
            ? {
                xpMultiplier: GATHERING_AFFINITY_XP_MULTIPLIER,
                productionMultiplier: GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
            }
            : null,
    };
}
function applyGatheringXp(params) {
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
        : client_1.MaterialOrigin.DESMANCHE;
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
        xpProgressPercent: getXpProgressPercent(currentXp, xpToNextLevel),
        statBonusGained: levelsGained > 0
            ? {
                stat: statInfo.stat,
                label: statInfo.label,
                amount: levelsGained * GATHERING_STAT_BONUS_PER_LEVEL,
            }
            : null,
    };
}
function calculateProduction(params) {
    const defaultReward = (0, gathering_util_1.calculateGatheringReward)({
        elapsedSeconds: params.elapsedSeconds,
        tier: params.tier,
        progressRemainder: params.progressRemainder,
    });
    const defaultRatePerHour = Math.max(1, defaultReward.ratePerHour);
    const baseRatePerHour = params.baseGatheringRatePerHour && params.baseGatheringRatePerHour > 0
        ? params.baseGatheringRatePerHour
        : defaultRatePerHour;
    const skillRateMultiplier = getGatheringRateMultiplier(params.skillLevel);
    const affinityRateMultiplier = params.isAffinity
        ? GATHERING_AFFINITY_PRODUCTION_MULTIPLIER
        : 1;
    const finalRateMultiplier = (baseRatePerHour / defaultRatePerHour) *
        skillRateMultiplier *
        affinityRateMultiplier;
    const reward = (0, gathering_util_1.calculateGatheringReward)({
        elapsedSeconds: params.elapsedSeconds,
        tier: params.tier,
        progressRemainder: params.progressRemainder,
        rateMultiplier: finalRateMultiplier,
    });
    return {
        quantity: reward.quantity,
        newProgressRemainder: reward.newProgressRemainder,
        elapsedHours: reward.elapsedHours,
        rawAmount: reward.rawAmount,
        ratePerHour: Number((baseRatePerHour * skillRateMultiplier * affinityRateMultiplier).toFixed(4)),
        baseRatePerHour,
        defaultRatePerHour,
        skillRateMultiplier: Number(skillRateMultiplier.toFixed(4)),
        affinityRateMultiplier: Number(affinityRateMultiplier.toFixed(4)),
        finalRateMultiplier: Number(finalRateMultiplier.toFixed(4)),
    };
}
function mapUsedInRecipes(material) {
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
            return String(a.outputItemClassName ?? '').localeCompare(String(b.outputItemClassName ?? ''));
        }
        if (a.outputItemSlot !== b.outputItemSlot) {
            return a.outputItemSlot.localeCompare(b.outputItemSlot);
        }
        return a.outputItemName.localeCompare(b.outputItemName);
    });
}
function getRelatedClassesFromRecipes(usedInRecipes) {
    return Array.from(new Set(usedInRecipes
        .map((recipe) => recipe.outputItemClassName)
        .filter((className) => Boolean(className)))).sort((a, b) => a.localeCompare(b));
}
let GatheringService = class GatheringService {
    prisma;
    activityGuard;
    constructor(prisma, activityGuard) {
        this.prisma = prisma;
        this.activityGuard = activityGuard;
    }
    validateGatheringOrigin(origin) {
        const validOrigins = Object.values(client_1.MaterialOrigin);
        if (!validOrigins.includes(origin)) {
            throw new common_1.BadRequestException({
                message: 'Origem de gathering inválida.',
                receivedOrigin: origin,
                validOrigins,
            });
        }
        if (origin === client_1.MaterialOrigin.DROP_MOBS) {
            throw new common_1.BadRequestException('DROP_MOBS não pode ser usado como gathering. Esse recurso vem do auto-combate.');
        }
        if (!isValidGatheringOrigin(origin)) {
            throw new common_1.BadRequestException({
                message: 'Origem de gathering inválida para coleta idle.',
                receivedOrigin: origin,
                validGatheringOrigins: GATHERING_ORIGINS,
            });
        }
    }
    async getOrCreateGatheringSkill(params) {
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
    async findActiveGatheringSession(characterId) {
        return this.prisma.gatheringSession.findFirst({
            where: {
                characterId,
                status: client_1.ActivityStatus.ACTIVE,
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
                        tier: true,
                        materialOrigin: true,
                        requiredGatheringLevel: true,
                        gatheringXpPerUnit: true,
                        baseGatheringRatePerHour: true,
                    },
                },
            },
        });
    }
    buildSessionPayload(session) {
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
            targetMaterial: session.targetMaterial,
        };
    }
    buildProductionPayload(params) {
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
    buildProductionPreviewPayload(params) {
        const { elapsedSeconds, reward, currentProgressRemainder, wasPersisted } = params;
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
            estimatedNewProgressRemainder: Number(reward.newProgressRemainder.toFixed(4)),
        };
    }
    async resolveActiveGathering(characterId, options = {}) {
        const session = await this.findActiveGatheringSession(characterId);
        if (!session) {
            if (options.throwIfMissing) {
                throw new common_1.BadRequestException('Nenhum gathering ativo.');
            }
            return null;
        }
        const currentHp = session.character.currentHp ?? session.character.maxHp ?? 1;
        if (session.character.status !== client_1.CharacterStatus.ACTIVE || currentHp <= 0) {
            return {
                session,
                updatedSession: session,
                inventoryItem: null,
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
                },
                elapsedSeconds: 0,
                xpGained: 0,
                gatheringProgress: null,
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
        const elapsedSeconds = Math.max(0, (now.getTime() - session.lastResolvedAt.getTime()) / 1000);
        const reward = calculateProduction({
            elapsedSeconds,
            tier: session.map.tier,
            progressRemainder: session.progressRemainder,
            baseGatheringRatePerHour: session.targetMaterial.baseGatheringRatePerHour,
            skillLevel: gatheringSkill.level,
            isAffinity: affinity,
        });
        const baseXpGained = reward.quantity * Math.max(1, session.targetMaterial.gatheringXpPerUnit);
        const xpGained = affinity
            ? Math.floor(baseXpGained * GATHERING_AFFINITY_XP_MULTIPLIER)
            : baseXpGained;
        const gatheringProgressPreview = applyGatheringXp({
            skill: gatheringSkill,
            xpGained,
        });
        const shouldPersist = Boolean(options.forcePersist) || reward.quantity > 0;
        if (!shouldPersist) {
            return {
                session,
                updatedSession: session,
                inventoryItem: null,
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
                    status: client_1.ActivityStatus.ACTIVE,
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
            let inventoryItem = null;
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
                        type: client_1.InventoryItemType.MATERIAL,
                    },
                    create: {
                        characterId,
                        itemId: session.targetMaterialId,
                        quantity: reward.quantity,
                        type: client_1.InventoryItemType.MATERIAL,
                    },
                });
            }
            const updatedGatheringSkill = xpGained > 0
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
                    throw new common_1.BadRequestException('Nenhum gathering ativo.');
                }
                return null;
            }
            return {
                session: freshSession,
                updatedSession: freshSession,
                inventoryItem: null,
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
    async listAvailableMaterials(params) {
        const { mapId, origin } = params;
        if (!mapId) {
            throw new common_1.BadRequestException('O mapId é obrigatório.');
        }
        if (!origin) {
            throw new common_1.BadRequestException('A origem do gathering é obrigatória.');
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
            throw new common_1.NotFoundException('Mapa não encontrado.');
        }
        const rewardPreview = (0, gathering_util_1.calculateGatheringReward)({
            elapsedSeconds: 3600,
            tier: gameMap.tier,
            progressRemainder: 0,
        });
        const materials = await this.prisma.item.findMany({
            where: {
                mapId: gameMap.id,
                slot: client_1.ItemSlot.MATERIAL,
                materialOrigin: origin,
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
                description: true,
                tier: true,
                rarity: true,
                slot: true,
                family: true,
                materialOrigin: true,
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
                    description: material.description,
                    tier: material.tier,
                    rarity: material.rarity,
                    slot: material.slot,
                    family: material.family,
                    materialOrigin: material.materialOrigin,
                    mapId: material.mapId,
                    requiredGatheringLevel: material.requiredGatheringLevel,
                    gatheringXpPerUnit: material.gatheringXpPerUnit,
                    baseGatheringRatePerHour: material.baseGatheringRatePerHour,
                    ratePerHour: material.baseGatheringRatePerHour ?? rewardPreview.ratePerHour,
                    isUnlockedByDefault: material.requiredGatheringLevel <= 1,
                    usedInRecipes,
                    usedInRecipeCount: usedInRecipes.length,
                    relatedClasses,
                };
            }),
        };
    }
    async start(dto) {
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
            throw new common_1.NotFoundException('Mapa não encontrado.');
        }
        const targetMaterial = await this.prisma.item.findUnique({
            where: {
                id: dto.targetMaterialId,
            },
            select: {
                id: true,
                name: true,
                tier: true,
                slot: true,
                mapId: true,
                materialOrigin: true,
                requiredGatheringLevel: true,
                gatheringXpPerUnit: true,
                baseGatheringRatePerHour: true,
            },
        });
        if (!targetMaterial) {
            throw new common_1.NotFoundException('Material alvo não encontrado.');
        }
        if (targetMaterial.slot !== client_1.ItemSlot.MATERIAL) {
            throw new common_1.BadRequestException('O item alvo precisa ser um material.');
        }
        if (targetMaterial.materialOrigin === client_1.MaterialOrigin.DROP_MOBS) {
            throw new common_1.BadRequestException('Materiais de DROP_MOBS vêm do auto-combate e não podem ser farmados por gathering.');
        }
        if (targetMaterial.materialOrigin !== dto.origin) {
            throw new common_1.BadRequestException({
                message: 'A origem do material não corresponde ao tipo de gathering escolhido.',
                selectedGathering: dto.origin,
                materialOrigin: targetMaterial.materialOrigin,
                material: targetMaterial.name,
            });
        }
        if (targetMaterial.mapId !== dto.mapId) {
            throw new common_1.BadRequestException({
                message: 'Este material não pertence ao mapa escolhido.',
                selectedMapId: dto.mapId,
                materialMapId: targetMaterial.mapId,
            });
        }
        if (targetMaterial.tier !== gameMap.tier) {
            throw new common_1.BadRequestException({
                message: 'O tier do material não corresponde ao tier do mapa.',
                mapTier: gameMap.tier,
                materialTier: targetMaterial.tier,
            });
        }
        if (character.level < gameMap.minLevel) {
            throw new common_1.BadRequestException({
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
            throw new common_1.BadRequestException({
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
        const session = await this.prisma.gatheringSession.create({
            data: {
                characterId: dto.characterId,
                mapId: dto.mapId,
                origin: dto.origin,
                targetMaterialId: dto.targetMaterialId,
                status: client_1.ActivityStatus.ACTIVE,
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
            message: 'Gathering iniciado com sucesso.',
            session: this.buildSessionPayload(session),
            gatheringSkill: buildGatheringSkillViewModel({
                skill: gatheringSkill,
                isAffinity: affinity,
            }),
        };
    }
    async getStatus(characterId) {
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
    async collect(characterId) {
        const resolved = await this.resolveActiveGathering(characterId, {
            forcePersist: true,
            validateCollectionGuard: true,
            throwIfMissing: true,
        });
        if (!resolved) {
            throw new common_1.BadRequestException('Nenhum gathering ativo para coletar.');
        }
        const skill = resolved.updatedGatheringSkill ?? resolved.gatheringSkill;
        return {
            message: resolved.collected.quantity > 0
                ? 'Coleta resolvida com sucesso.'
                : 'Nenhuma unidade pronta para coletar ainda.',
            collected: resolved.collected,
            production: this.buildProductionPayload({
                elapsedSeconds: resolved.elapsedSeconds,
                reward: resolved.reward,
                previousProgressRemainder: resolved.session.progressRemainder,
            }),
            gatheringProgress: resolved.gatheringProgress && skill
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
    async stop(characterId) {
        const session = await this.findActiveGatheringSession(characterId);
        if (!session) {
            throw new common_1.BadRequestException('Nenhum gathering ativo para encerrar.');
        }
        const currentHp = session.character.currentHp ?? session.character.maxHp ?? 1;
        if (session.character.status !== client_1.CharacterStatus.ACTIVE || currentHp <= 0) {
            const stoppedSession = await this.prisma.gatheringSession.update({
                where: {
                    id: session.id,
                },
                data: {
                    status: client_1.ActivityStatus.STOPPED,
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
                message: 'Gathering encerrado sem coleta, pois o personagem está derrotado ou não está ativo.',
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
                    previousProgressRemainder: Number(session.progressRemainder.toFixed(4)),
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
                status: client_1.ActivityStatus.STOPPED,
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
                    previousProgressRemainder: Number(session.progressRemainder.toFixed(4)),
                    newProgressRemainder: Number(session.progressRemainder.toFixed(4)),
                },
            gatheringProgress: resolved?.gatheringProgress && skill
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
};
exports.GatheringService = GatheringService;
exports.GatheringService = GatheringService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_guard_service_1.ActivityGuardService])
], GatheringService);
//# sourceMappingURL=gathering.service.js.map