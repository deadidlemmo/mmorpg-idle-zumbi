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
exports.CharactersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const auto_combat_config_1 = require("../../common/config/auto-combat.config");
const gathering_util_1 = require("../../common/utils/gathering.util");
const level_util_1 = require("../../common/utils/level.util");
const stats_util_1 = require("../../common/utils/stats.util");
const prisma_service_1 = require("../../prisma/prisma.service");
const MAX_CHARACTERS_PER_USER = 2;
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
    lutador: [
        client_1.MaterialOrigin.DESMANCHE,
        client_1.MaterialOrigin.COLETA,
        client_1.MaterialOrigin.CONTENCAO,
    ],
    atirador: [
        client_1.MaterialOrigin.DESMANCHE,
        client_1.MaterialOrigin.ARSENAL,
        client_1.MaterialOrigin.PATRULHA,
    ],
    assassino: [
        client_1.MaterialOrigin.PATRULHA,
        client_1.MaterialOrigin.ARSENAL,
        client_1.MaterialOrigin.TECNOVARREDURA,
    ],
    medico: [
        client_1.MaterialOrigin.TECNOVARREDURA,
        client_1.MaterialOrigin.COLETA,
        client_1.MaterialOrigin.CONTENCAO,
    ],
};
let CharactersService = class CharactersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, createCharacterDto) {
        const characterName = this.normalizeCharacterName(createCharacterDto.name);
        const className = this.normalizeClassName(createCharacterDto.className);
        if (!characterName) {
            throw new common_1.BadRequestException('O nome do personagem é obrigatório.');
        }
        if (!className) {
            throw new common_1.BadRequestException('A classe do personagem é obrigatória.');
        }
        if (!this.isValidCharacterName(characterName)) {
            throw new common_1.BadRequestException('O nome do personagem pode conter apenas letras, números e espaços.');
        }
        const character = await this.prisma.$transaction(async (tx) => {
            const totalCharacters = await tx.character.count({
                where: {
                    userId,
                    deletedAt: null,
                },
            });
            if (totalCharacters >= MAX_CHARACTERS_PER_USER) {
                throw new common_1.ConflictException(`Cada conta pode ter no máximo ${MAX_CHARACTERS_PER_USER} personagens.`);
            }
            const existingCharacter = await tx.character.findFirst({
                where: {
                    userId,
                    name: {
                        equals: characterName,
                        mode: 'insensitive',
                    },
                },
            });
            if (existingCharacter) {
                throw new common_1.ConflictException('Você já possui ou já possuiu um personagem com este nome.');
            }
            const gameClass = await tx.gameClass.findFirst({
                where: {
                    name: {
                        equals: className,
                        mode: 'insensitive',
                    },
                },
            });
            if (!gameClass) {
                throw new common_1.NotFoundException('Classe não encontrada.');
            }
            const avatarKey = this.resolveAvatarKey({
                requestedAvatarKey: createCharacterDto.avatarKey,
                className: gameClass.name,
            });
            const initialMap = await tx.gameMap.findFirst({
                where: {
                    tier: 1,
                },
                orderBy: [
                    {
                        minLevel: 'asc',
                    },
                    {
                        name: 'asc',
                    },
                ],
            });
            if (!initialMap) {
                throw new common_1.NotFoundException('Mapa inicial não encontrado.');
            }
            const starterItems = await tx.item.findMany({
                where: {
                    classId: gameClass.id,
                    mapId: initialMap.id,
                    tier: 0,
                    isCraftable: false,
                    slot: {
                        in: [
                            client_1.ItemSlot.MAIN_HAND,
                            client_1.ItemSlot.OFF_HAND,
                            client_1.ItemSlot.HEAD,
                            client_1.ItemSlot.ARMOR,
                            client_1.ItemSlot.PANTS,
                            client_1.ItemSlot.BOOTS,
                        ],
                    },
                },
                orderBy: [
                    {
                        slot: 'asc',
                    },
                    {
                        name: 'asc',
                    },
                ],
            });
            const starterEquipment = this.getStarterEquipmentBySlot(starterItems);
            const initialEquipmentItems = [
                starterEquipment.mainHand,
                starterEquipment.offHand,
                starterEquipment.head,
                starterEquipment.armor,
                starterEquipment.pants,
                starterEquipment.boots,
            ];
            const initialLevel = 1;
            const stats = (0, stats_util_1.calculateFullStats)(gameClass, initialEquipmentItems, initialLevel);
            const initialMaxHp = stats.derivedCombatStats.maxHp;
            return tx.character.create({
                data: {
                    name: characterName,
                    userId,
                    classId: gameClass.id,
                    mapId: initialMap.id,
                    status: client_1.CharacterStatus.ACTIVE,
                    level: initialLevel,
                    currentHp: initialMaxHp,
                    maxHp: initialMaxHp,
                    avatarKey,
                    deletedAt: null,
                    gatheringSkills: {
                        create: GATHERING_ORIGINS.map((origin) => ({
                            origin,
                            level: 1,
                            xp: 0,
                            totalXp: 0,
                        })),
                    },
                    equipment: {
                        create: {
                            mainHand: {
                                connect: {
                                    id: starterEquipment.mainHand.id,
                                },
                            },
                            offHand: {
                                connect: {
                                    id: starterEquipment.offHand.id,
                                },
                            },
                            head: {
                                connect: {
                                    id: starterEquipment.head.id,
                                },
                            },
                            armor: {
                                connect: {
                                    id: starterEquipment.armor.id,
                                },
                            },
                            pants: {
                                connect: {
                                    id: starterEquipment.pants.id,
                                },
                            },
                            boots: {
                                connect: {
                                    id: starterEquipment.boots.id,
                                },
                            },
                        },
                    },
                    potionConfig: {
                        create: {
                            enabled: false,
                            potionItemId: null,
                            hpThresholdPercent: 35,
                            useInManualCombat: true,
                            useInAutoCombat: true,
                        },
                    },
                    inventoryItems: {
                        create: initialEquipmentItems.map((item) => ({
                            item: {
                                connect: {
                                    id: item.id,
                                },
                            },
                            quantity: 1,
                            type: this.getInventoryItemType(item.slot),
                        })),
                    },
                },
                include: {
                    class: true,
                    map: true,
                    gatheringSkills: true,
                    inventoryItems: {
                        include: {
                            item: true,
                        },
                        orderBy: {
                            createdAt: 'asc',
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
                },
            });
        });
        const equipmentItems = this.getEquipmentItems(character);
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
        const calculatedMaxHp = stats.derivedCombatStats.maxHp;
        const currentHp = character.currentHp === null || character.currentHp === undefined
            ? calculatedMaxHp
            : this.clampHp(character.currentHp, calculatedMaxHp);
        const autoPotionConfig = this.buildPotionConfigResponse(character.potionConfig, character.inventoryItems);
        const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(character.id, character.class.name);
        return {
            ...character,
            avatarKey: this.getCharacterAvatarKey(character),
            currentHp,
            maxHp: calculatedMaxHp,
            ...this.buildCharacterXpPayload(character.level, character.xp),
            stats: this.buildStatsResponse(stats, gatheringSkills.totalStatBonus),
            gatheringSkills: gatheringSkills.skills,
            gathering: gatheringSkills,
            potionConfig: autoPotionConfig,
            potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
            autoPotionConfig,
        };
    }
    async findMine(userId) {
        const characters = await this.prisma.character.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            orderBy: {
                createdAt: 'asc',
            },
            include: {
                class: true,
                map: true,
                inventoryItems: {
                    include: {
                        item: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
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
            },
        });
        return Promise.all(characters.map(async (character) => {
            const equipmentItems = this.getEquipmentItems(character);
            const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
            const calculatedMaxHp = stats.derivedCombatStats.maxHp;
            const currentHp = character.currentHp === null || character.currentHp === undefined
                ? calculatedMaxHp
                : this.clampHp(character.currentHp, calculatedMaxHp);
            const autoPotionConfig = this.buildPotionConfigResponse(character.potionConfig, character.inventoryItems);
            const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(character.id, character.class.name);
            return {
                ...character,
                avatarKey: this.getCharacterAvatarKey(character),
                currentHp,
                maxHp: calculatedMaxHp,
                ...this.buildCharacterXpPayload(character.level, character.xp),
                stats: this.buildStatsResponse(stats, gatheringSkills.totalStatBonus),
                gatheringSkills: gatheringSkills.skills,
                gathering: gatheringSkills,
                potionConfig: autoPotionConfig,
                potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
                autoPotionConfig,
            };
        }));
    }
    async findOneMine(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
                deletedAt: null,
            },
            include: {
                class: true,
                map: true,
                inventoryItems: {
                    include: {
                        item: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
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
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const equipmentItems = this.getEquipmentItems(character);
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
        const calculatedMaxHp = stats.derivedCombatStats.maxHp;
        const currentHp = character.currentHp === null || character.currentHp === undefined
            ? calculatedMaxHp
            : this.clampHp(character.currentHp, calculatedMaxHp);
        const autoPotionConfig = this.buildPotionConfigResponse(character.potionConfig, character.inventoryItems);
        const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(character.id, character.class.name);
        return {
            ...character,
            avatarKey: this.getCharacterAvatarKey(character),
            currentHp,
            maxHp: calculatedMaxHp,
            ...this.buildCharacterXpPayload(character.level, character.xp),
            stats: this.buildStatsResponse(stats, gatheringSkills.totalStatBonus),
            gatheringSkills: gatheringSkills.skills,
            gathering: gatheringSkills,
            potionConfig: autoPotionConfig,
            potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
            autoPotionConfig,
        };
    }
    async getStatus(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
                deletedAt: null,
            },
            include: {
                class: true,
                map: true,
                inventoryItems: {
                    include: {
                        item: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
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
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const equipmentItems = this.getEquipmentItems(character);
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
        const calculatedMaxHp = stats.derivedCombatStats.maxHp;
        const currentHp = character.currentHp === null || character.currentHp === undefined
            ? calculatedMaxHp
            : this.clampHp(character.currentHp, calculatedMaxHp);
        const autoPotionConfig = this.buildPotionConfigResponse(character.potionConfig, character.inventoryItems);
        const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(character.id, character.class.name);
        return {
            character: {
                id: character.id,
                name: character.name,
                status: character.status,
                level: character.level,
                xp: character.xp,
                currentHp,
                maxHp: calculatedMaxHp,
                avatarKey: this.getCharacterAvatarKey(character),
                deletedAt: character.deletedAt,
                createdAt: character.createdAt,
                updatedAt: character.updatedAt,
                potionConfig: autoPotionConfig,
                potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
                autoPotionConfig,
                gatheringSkills: gatheringSkills.skills,
                gathering: gatheringSkills,
                ...this.buildCharacterXpPayload(character.level, character.xp),
            },
            class: {
                id: character.class.id,
                name: character.class.name,
                description: character.class.description,
            },
            map: character.map ? this.formatMap(character.map) : null,
            primaryStats: {
                base: stats.basePrimaryStats,
                levelBonus: stats.levelBonusStats,
                equipmentBonus: stats.equipmentBonusStats,
                gatheringBonus: gatheringSkills.totalStatBonus,
                total: stats.totalPrimaryStats,
            },
            combatStats: {
                maxHp: stats.derivedCombatStats.maxHp,
                attack: stats.derivedCombatStats.attack,
                defense: stats.derivedCombatStats.defense,
                speed: stats.derivedCombatStats.speed,
            },
            equipment: this.buildEquipmentResponse(character.equipment),
            autoPotionConfig,
            gatheringSkills: gatheringSkills.skills,
            gathering: gatheringSkills,
            inventorySummary: this.buildInventorySummary(character.inventoryItems),
        };
    }
    async getOverview(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
                deletedAt: null,
            },
            include: {
                class: true,
                map: true,
                inventoryItems: {
                    include: {
                        item: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
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
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const equipmentItems = this.getEquipmentItems(character);
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
        const calculatedMaxHp = stats.derivedCombatStats.maxHp;
        const currentHp = character.currentHp === null || character.currentHp === undefined
            ? calculatedMaxHp
            : this.clampHp(character.currentHp, calculatedMaxHp);
        const missingHp = Math.max(0, calculatedMaxHp - currentHp);
        const autoPotionConfig = this.buildPotionConfigResponse(character.potionConfig, character.inventoryItems);
        const [activeAutoCombatSession, activeGatheringSession, availableMaps, recommendedMapByLevelRange, fallbackRecommendedMap, availableSubMapCount, hasCraftableRecipes, gatheringSkills,] = await Promise.all([
            this.prisma.autoCombatSession.findFirst({
                where: {
                    characterId: character.id,
                    status: client_1.AutoCombatSessionStatus.ACTIVE,
                },
                orderBy: {
                    startedAt: 'desc',
                },
                select: {
                    id: true,
                    status: true,
                    startedAt: true,
                    endsAt: true,
                    lastProcessedAt: true,
                    durationSeconds: true,
                    roundDurationSeconds: true,
                    currentMobId: true,
                    currentMobHp: true,
                    currentMobMaxHp: true,
                    currentRound: true,
                    currentCombatIndex: true,
                    totalCombatsResolved: true,
                    totalRoundsResolved: true,
                    totalXpGained: true,
                    mobSummaries: {
                        select: {
                            kills: true,
                        },
                    },
                    currentMob: {
                        select: {
                            id: true,
                            name: true,
                            level: true,
                            tier: true,
                            hp: true,
                            attack: true,
                            defense: true,
                            speed: true,
                            xpReward: true,
                        },
                    },
                    subMap: {
                        select: {
                            id: true,
                            name: true,
                            tier: true,
                            minLevel: true,
                            maxLevel: true,
                            map: {
                                select: {
                                    id: true,
                                    name: true,
                                    tier: true,
                                    minLevel: true,
                                    maxLevel: true,
                                    description: true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.gatheringSession.findFirst({
                where: {
                    characterId: character.id,
                    status: client_1.ActivityStatus.ACTIVE,
                },
                orderBy: {
                    startedAt: 'desc',
                },
                select: {
                    id: true,
                    status: true,
                    origin: true,
                    startedAt: true,
                    lastResolvedAt: true,
                    progressRemainder: true,
                    map: {
                        select: {
                            id: true,
                            name: true,
                            tier: true,
                            minLevel: true,
                            maxLevel: true,
                            description: true,
                        },
                    },
                    targetMaterial: {
                        select: {
                            id: true,
                            name: true,
                            tier: true,
                            rarity: true,
                            family: true,
                            materialOrigin: true,
                            requiredGatheringLevel: true,
                            gatheringXpPerUnit: true,
                            baseGatheringRatePerHour: true,
                        },
                    },
                },
            }),
            this.prisma.gameMap.findMany({
                where: {
                    minLevel: {
                        lte: character.level,
                    },
                },
                orderBy: [
                    {
                        tier: 'asc',
                    },
                    {
                        minLevel: 'asc',
                    },
                    {
                        name: 'asc',
                    },
                ],
                select: {
                    id: true,
                    name: true,
                    tier: true,
                    minLevel: true,
                    maxLevel: true,
                    description: true,
                },
            }),
            this.prisma.gameMap.findFirst({
                where: {
                    minLevel: {
                        lte: character.level,
                    },
                    maxLevel: {
                        gte: character.level,
                    },
                },
                orderBy: [
                    {
                        tier: 'desc',
                    },
                    {
                        minLevel: 'desc',
                    },
                    {
                        name: 'asc',
                    },
                ],
                select: {
                    id: true,
                    name: true,
                    tier: true,
                    minLevel: true,
                    maxLevel: true,
                    description: true,
                },
            }),
            this.prisma.gameMap.findFirst({
                where: {
                    minLevel: {
                        lte: character.level,
                    },
                },
                orderBy: [
                    {
                        tier: 'desc',
                    },
                    {
                        minLevel: 'desc',
                    },
                    {
                        name: 'asc',
                    },
                ],
                select: {
                    id: true,
                    name: true,
                    tier: true,
                    minLevel: true,
                    maxLevel: true,
                    description: true,
                },
            }),
            this.prisma.subMap.count({
                where: {
                    minLevel: {
                        lte: character.level,
                    },
                },
            }),
            this.hasCraftableRecipes(character.id, character.classId),
            this.getCharacterGatheringSkillsViewModel(character.id, character.class.name),
        ]);
        const hasActiveAutoCombat = Boolean(activeAutoCombatSession);
        const hasActiveGathering = Boolean(activeGatheringSession);
        const formattedActiveAutoCombatSession = activeAutoCombatSession
            ? this.formatActiveAutoCombatSession(activeAutoCombatSession)
            : null;
        const autoCombatPreview = activeAutoCombatSession
            ? this.buildAutoCombatPreview(activeAutoCombatSession)
            : null;
        const activeGatheringSkill = activeGatheringSession && activeGatheringSession.origin
            ? gatheringSkills.byOrigin[activeGatheringSession.origin] ?? null
            : null;
        const gatheringProductionPreview = activeGatheringSession
            ? this.buildGatheringProductionPreview(activeGatheringSession, activeGatheringSkill)
            : null;
        const characterIsActive = character.status === client_1.CharacterStatus.ACTIVE;
        const characterCanAct = characterIsActive &&
            currentHp > 0 &&
            !hasActiveAutoCombat &&
            !hasActiveGathering;
        const canUseInfirmary = !hasActiveAutoCombat &&
            !hasActiveGathering &&
            character.status !== client_1.CharacterStatus.BLOCKED &&
            missingHp > 0;
        const canStartAutoCombat = characterCanAct && availableSubMapCount > 0;
        const canStartGathering = characterCanAct && availableMaps.length > 0;
        const recommendedMap = recommendedMapByLevelRange ?? fallbackRecommendedMap;
        return {
            character: {
                id: character.id,
                name: character.name,
                level: character.level,
                xp: character.xp,
                status: character.status,
                currentHp,
                maxHp: calculatedMaxHp,
                avatarKey: this.getCharacterAvatarKey(character),
                deletedAt: character.deletedAt,
                class: {
                    id: character.class.id,
                    name: character.class.name,
                    description: character.class.description,
                },
                map: character.map ? this.formatMap(character.map) : null,
                currentMap: character.map ? this.formatMap(character.map) : null,
                createdAt: character.createdAt,
                updatedAt: character.updatedAt,
                potionConfig: autoPotionConfig,
                potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
                autoPotionConfig,
                inventorySummary: this.buildInventorySummary(character.inventoryItems),
                gatheringSkills: gatheringSkills.skills,
                gathering: gatheringSkills,
                ...this.buildCharacterXpPayload(character.level, character.xp),
            },
            stats: {
                strength: stats.totalPrimaryStats.strength,
                vitality: stats.totalPrimaryStats.vitality,
                agility: stats.totalPrimaryStats.agility,
                precision: stats.totalPrimaryStats.precision,
                technique: stats.totalPrimaryStats.technique,
                willpower: stats.totalPrimaryStats.willpower,
                attack: stats.derivedCombatStats.attack,
                defense: stats.derivedCombatStats.defense,
                speed: stats.derivedCombatStats.speed,
                maxHp: stats.derivedCombatStats.maxHp,
                gatheringBonus: gatheringSkills.totalStatBonus,
                detail: {
                    base: stats.basePrimaryStats,
                    levelBonus: stats.levelBonusStats,
                    equipmentBonus: stats.equipmentBonusStats,
                    gatheringBonus: gatheringSkills.totalStatBonus,
                    total: stats.totalPrimaryStats,
                    derived: stats.derivedCombatStats,
                },
            },
            equipment: this.buildEquipmentResponse(character.equipment),
            gatheringSkills: gatheringSkills.skills,
            gathering: gatheringSkills,
            activity: {
                hasActiveAutoCombat,
                hasActiveGathering,
                activeAutoCombatSession: formattedActiveAutoCombatSession
                    ? {
                        ...formattedActiveAutoCombatSession,
                        combatPreview: autoCombatPreview,
                    }
                    : null,
                activeGatheringSession: activeGatheringSession
                    ? {
                        ...activeGatheringSession,
                        gatheringSkill: activeGatheringSkill,
                        productionPreview: gatheringProductionPreview,
                    }
                    : null,
            },
            progression: {
                currentMap: character.map ? this.formatMap(character.map) : null,
                availableMaps: availableMaps.map((map) => this.formatMap(map)),
                recommendedMap: recommendedMap ? this.formatMap(recommendedMap) : null,
            },
            shortcuts: {
                canUseInfirmary,
                canStartAutoCombat,
                canStartGathering,
                hasCraftableRecipes,
            },
        };
    }
    async deleteMine(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
                deletedAt: null,
            },
            include: {
                class: true,
                autoCombatSessions: {
                    where: {
                        status: client_1.AutoCombatSessionStatus.ACTIVE,
                    },
                    select: {
                        id: true,
                        status: true,
                        startedAt: true,
                        endsAt: true,
                    },
                },
                gatheringSessions: {
                    where: {
                        status: client_1.ActivityStatus.ACTIVE,
                    },
                    select: {
                        id: true,
                        status: true,
                        startedAt: true,
                    },
                },
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        if (character.autoCombatSessions.length > 0) {
            throw new common_1.BadRequestException('Não é possível excluir personagem com auto-combate ativo. Encerre o auto-combate antes de excluir.');
        }
        if (character.gatheringSessions.length > 0) {
            throw new common_1.BadRequestException('Não é possível excluir personagem com gathering ativo. Encerre a coleta antes de excluir.');
        }
        const deletedCharacter = await this.prisma.character.update({
            where: {
                id: character.id,
            },
            data: {
                status: client_1.CharacterStatus.DELETED,
                deletedAt: new Date(),
            },
            include: {
                class: true,
                map: true,
            },
        });
        return {
            message: 'Personagem excluído com sucesso.',
            character: {
                id: deletedCharacter.id,
                name: deletedCharacter.name,
                status: deletedCharacter.status,
                level: deletedCharacter.level,
                xp: deletedCharacter.xp,
                currentHp: deletedCharacter.currentHp,
                maxHp: deletedCharacter.maxHp,
                avatarKey: this.getCharacterAvatarKey(deletedCharacter),
                deletedAt: deletedCharacter.deletedAt,
                class: {
                    id: deletedCharacter.class.id,
                    name: deletedCharacter.class.name,
                },
                map: deletedCharacter.map ? this.formatMap(deletedCharacter.map) : null,
                ...this.buildCharacterXpPayload(deletedCharacter.level, deletedCharacter.xp),
            },
        };
    }
    async hasCraftableRecipes(characterId, characterClassId) {
        const [inventoryItems, recipes] = await Promise.all([
            this.prisma.inventoryItem.findMany({
                where: {
                    characterId,
                },
                select: {
                    itemId: true,
                    quantity: true,
                },
            }),
            this.prisma.craftingRecipe.findMany({
                where: {
                    isActive: true,
                },
                include: {
                    outputItem: {
                        select: {
                            id: true,
                            classId: true,
                            slot: true,
                            isCraftable: true,
                        },
                    },
                    ingredients: {
                        select: {
                            itemId: true,
                            quantity: true,
                        },
                    },
                },
            }),
        ]);
        const inventoryByItemId = new Map(inventoryItems.map((inventoryItem) => [
            inventoryItem.itemId,
            inventoryItem.quantity,
        ]));
        return recipes.some((recipe) => {
            if (!recipe.outputItem.isCraftable) {
                return false;
            }
            if (recipe.outputItem.slot === client_1.ItemSlot.MATERIAL) {
                return false;
            }
            if (recipe.outputItem.classId !== null &&
                recipe.outputItem.classId !== characterClassId) {
                return false;
            }
            if (recipe.ingredients.length === 0) {
                return false;
            }
            return recipe.ingredients.every((ingredient) => {
                const available = inventoryByItemId.get(ingredient.itemId) ?? 0;
                return available >= ingredient.quantity;
            });
        });
    }
    async getCharacterGatheringSkillsViewModel(characterId, className) {
        await this.ensureCharacterGatheringSkills(characterId);
        const skills = await this.prisma.characterGatheringSkill.findMany({
            where: {
                characterId,
                origin: {
                    in: [...GATHERING_ORIGINS],
                },
            },
            orderBy: {
                origin: 'asc',
            },
        });
        const classSlug = this.getClassSlug(className);
        const affinities = CLASS_GATHERING_AFFINITIES[classSlug] ?? [];
        const byOrigin = {};
        const totalStatBonus = {
            strength: 0,
            vitality: 0,
            agility: 0,
            precision: 0,
            technique: 0,
            willpower: 0,
        };
        const viewModels = GATHERING_ORIGINS.map((origin) => {
            const skill = skills.find((currentSkill) => currentSkill.origin === origin) ?? null;
            const level = skill?.level ?? 1;
            const xp = skill?.xp ?? 0;
            const totalXp = skill?.totalXp ?? 0;
            const xpToNextLevel = this.getGatheringXpToNextLevel(level);
            const statInfo = ORIGIN_STAT_INFO[origin];
            const statBonusAmount = this.getGatheringStatBonus(level);
            const isClassAffinity = affinities.includes(origin);
            const productionMultiplier = this.getGatheringRateMultiplier(level);
            const productionBonusPercent = Math.round((productionMultiplier - 1) * 100);
            totalStatBonus[statInfo.stat] += statBonusAmount;
            const viewModel = {
                id: skill?.id ?? null,
                characterId,
                origin,
                level,
                xp,
                totalXp,
                xpToNextLevel,
                xpProgressPercent: this.getGatheringXpProgressPercent(xp, xpToNextLevel),
                isAtLevelCap: level >= GATHERING_LEVEL_CAP,
                isClassAffinity,
                statBonus: {
                    stat: statInfo.stat,
                    label: statInfo.label,
                    amount: statBonusAmount,
                },
                productionMultiplier,
                productionBonusPercent,
                affinityBonus: isClassAffinity
                    ? {
                        xpMultiplier: GATHERING_AFFINITY_XP_MULTIPLIER,
                        productionMultiplier: GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
                    }
                    : null,
            };
            byOrigin[origin] = viewModel;
            return viewModel;
        });
        return {
            skills: viewModels,
            byOrigin,
            affinities,
            className,
            classSlug,
            totalStatBonus,
            rules: {
                levelCap: GATHERING_LEVEL_CAP,
                statBonusPerLevel: GATHERING_STAT_BONUS_PER_LEVEL,
                productionBonusPerLevel: GATHERING_PRODUCTION_BONUS_PER_LEVEL,
                affinityXpMultiplier: GATHERING_AFFINITY_XP_MULTIPLIER,
                affinityProductionMultiplier: GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
            },
        };
    }
    async ensureCharacterGatheringSkills(characterId) {
        await Promise.all(GATHERING_ORIGINS.map((origin) => this.prisma.characterGatheringSkill.upsert({
            where: {
                characterId_origin: {
                    characterId,
                    origin,
                },
            },
            update: {},
            create: {
                characterId,
                origin,
                level: 1,
                xp: 0,
                totalXp: 0,
            },
        })));
    }
    getGatheringXpToNextLevel(level) {
        if (level >= GATHERING_LEVEL_CAP) {
            return null;
        }
        return Math.max(50, level * 50);
    }
    getGatheringRateMultiplier(level) {
        return Number((1 +
            Math.max(0, level - 1) * GATHERING_PRODUCTION_BONUS_PER_LEVEL).toFixed(4));
    }
    getGatheringStatBonus(level) {
        return Math.max(0, level - 1) * GATHERING_STAT_BONUS_PER_LEVEL;
    }
    getGatheringXpProgressPercent(xp, xpToNextLevel) {
        if (!xpToNextLevel || xpToNextLevel <= 0) {
            return 100;
        }
        return Math.max(0, Math.min(100, Math.floor((xp / xpToNextLevel) * 100)));
    }
    formatActiveAutoCombatSession(activeAutoCombatSession) {
        const currentMobMaxHp = activeAutoCombatSession.currentMobMaxHp ??
            activeAutoCombatSession.currentMob?.hp ??
            null;
        const currentMobHp = activeAutoCombatSession.currentMobHp ?? currentMobMaxHp ?? null;
        const currentMob = activeAutoCombatSession.currentMob && currentMobMaxHp !== null
            ? {
                ...activeAutoCombatSession.currentMob,
                currentHp: this.clampHp(currentMobHp ?? currentMobMaxHp, currentMobMaxHp),
                maxHp: currentMobMaxHp,
                hpPercent: currentMobMaxHp > 0
                    ? Number(((this.clampHp(currentMobHp ?? currentMobMaxHp, currentMobMaxHp) /
                        currentMobMaxHp) *
                        100).toFixed(2))
                    : 0,
            }
            : activeAutoCombatSession.currentMob
                ? {
                    ...activeAutoCombatSession.currentMob,
                    currentHp: null,
                    maxHp: null,
                    hpPercent: null,
                }
                : null;
        const totalKills = (activeAutoCombatSession.mobSummaries ?? []).reduce((total, summary) => {
            return total + (summary.kills ?? 0);
        }, 0);
        return {
            ...activeAutoCombatSession,
            totalKills,
            currentMobHp,
            currentMobMaxHp,
            currentMob,
        };
    }
    buildAutoCombatPreview(activeAutoCombatSession) {
        const now = new Date();
        const startedAt = new Date(activeAutoCombatSession.startedAt);
        const lastProcessedAt = activeAutoCombatSession.lastProcessedAt
            ? new Date(activeAutoCombatSession.lastProcessedAt)
            : startedAt;
        const endsAt = activeAutoCombatSession.endsAt
            ? new Date(activeAutoCombatSession.endsAt)
            : null;
        const elapsedTotalSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
        const elapsedSinceLastProcessSeconds = Math.max(0, Math.floor((now.getTime() - lastProcessedAt.getTime()) / 1000));
        const durationSeconds = activeAutoCombatSession.durationSeconds ?? null;
        const roundDurationSeconds = activeAutoCombatSession.roundDurationSeconds ??
            auto_combat_config_1.AUTO_COMBAT_ROUND_DURATION_SECONDS;
        const remainingSeconds = endsAt
            ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000))
            : null;
        const isFinishedByTime = endsAt ? now >= endsAt : false;
        const estimatedRoundsReadyToProcess = roundDurationSeconds <= 0
            ? 0
            : Math.floor(elapsedSinceLastProcessSeconds / roundDurationSeconds);
        const estimatedCombatsReadyToResolve = estimatedRoundsReadyToProcess;
        const secondsIntoCurrentRound = roundDurationSeconds <= 0
            ? 0
            : elapsedSinceLastProcessSeconds % roundDurationSeconds;
        const progressToNextRoundPercent = roundDurationSeconds <= 0
            ? 0
            : Number(((secondsIntoCurrentRound / roundDurationSeconds) * 100).toFixed(2));
        const nextRoundRemainingSeconds = roundDurationSeconds <= 0
            ? 0
            : Math.max(0, roundDurationSeconds - secondsIntoCurrentRound);
        const currentMobMaxHp = activeAutoCombatSession.currentMobMaxHp ??
            activeAutoCombatSession.currentMob?.hp ??
            null;
        const currentMobHp = activeAutoCombatSession.currentMobHp ?? currentMobMaxHp ?? null;
        const currentMob = activeAutoCombatSession.currentMob && currentMobMaxHp !== null
            ? {
                id: activeAutoCombatSession.currentMob.id,
                name: activeAutoCombatSession.currentMob.name,
                level: activeAutoCombatSession.currentMob.level,
                tier: activeAutoCombatSession.currentMob.tier,
                hp: activeAutoCombatSession.currentMob.hp,
                attack: activeAutoCombatSession.currentMob.attack,
                defense: activeAutoCombatSession.currentMob.defense,
                speed: activeAutoCombatSession.currentMob.speed,
                xpReward: activeAutoCombatSession.currentMob.xpReward,
                currentHp: this.clampHp(currentMobHp ?? currentMobMaxHp, currentMobMaxHp),
                maxHp: currentMobMaxHp,
                hpPercent: currentMobMaxHp > 0
                    ? Number(((this.clampHp(currentMobHp ?? currentMobMaxHp, currentMobMaxHp) /
                        currentMobMaxHp) *
                        100).toFixed(2))
                    : 0,
            }
            : null;
        const totalKills = (activeAutoCombatSession.mobSummaries ?? []).reduce((total, summary) => {
            return total + (summary.kills ?? 0);
        }, 0);
        return {
            label: activeAutoCombatSession.subMap
                ? `Combatendo em ${activeAutoCombatSession.subMap.name}`
                : 'Auto-combate em andamento',
            currentMobId: activeAutoCombatSession.currentMobId ?? null,
            currentMobHp,
            currentMobMaxHp,
            currentMob,
            currentRound: activeAutoCombatSession.currentRound ?? null,
            currentCombatIndex: activeAutoCombatSession.currentCombatIndex ?? null,
            subMap: activeAutoCombatSession.subMap
                ? {
                    id: activeAutoCombatSession.subMap.id,
                    name: activeAutoCombatSession.subMap.name,
                    tier: activeAutoCombatSession.subMap.tier,
                    minLevel: activeAutoCombatSession.subMap.minLevel,
                    maxLevel: activeAutoCombatSession.subMap.maxLevel,
                }
                : null,
            map: activeAutoCombatSession.subMap?.map
                ? {
                    id: activeAutoCombatSession.subMap.map.id,
                    name: activeAutoCombatSession.subMap.map.name,
                    tier: activeAutoCombatSession.subMap.map.tier,
                    minLevel: activeAutoCombatSession.subMap.map.minLevel,
                    maxLevel: activeAutoCombatSession.subMap.map.maxLevel,
                    description: activeAutoCombatSession.subMap.map.description,
                }
                : null,
            elapsedTotalSeconds,
            elapsedTotalMinutes: Math.floor(elapsedTotalSeconds / 60),
            elapsedSinceLastProcessSeconds,
            elapsedSinceLastProcessMinutes: Math.floor(elapsedSinceLastProcessSeconds / 60),
            durationSeconds,
            durationMinutes: durationSeconds === null ? null : Math.floor(durationSeconds / 60),
            remainingSeconds,
            remainingMinutes: remainingSeconds === null ? null : Math.floor(remainingSeconds / 60),
            roundDurationSeconds,
            estimatedRoundsReadyToProcess,
            estimatedCombatsReadyToResolve,
            canProcessNow: estimatedRoundsReadyToProcess > 0 || isFinishedByTime,
            progressToNextRoundPercent,
            nextRoundRemainingSeconds,
            nextRoundRemainingMinutes: Math.floor(nextRoundRemainingSeconds / 60),
            totals: {
                kills: totalKills,
                totalKills,
                combatsResolved: activeAutoCombatSession.totalCombatsResolved ?? 0,
                roundsResolved: activeAutoCombatSession.totalRoundsResolved ?? 0,
                xpGained: activeAutoCombatSession.totalXpGained ?? 0,
            },
            timestamps: {
                startedAt: activeAutoCombatSession.startedAt,
                lastProcessedAt: activeAutoCombatSession.lastProcessedAt,
                endsAt: activeAutoCombatSession.endsAt,
            },
            isFinishedByTime,
        };
    }
    buildGatheringProductionPreview(activeGatheringSession, gatheringSkill) {
        const now = new Date();
        const lastResolvedAt = activeGatheringSession.lastResolvedAt ?? activeGatheringSession.startedAt;
        const progressRemainder = Number(activeGatheringSession.progressRemainder ?? 0);
        const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(lastResolvedAt).getTime()) / 1000));
        const defaultReward = (0, gathering_util_1.calculateGatheringReward)({
            elapsedSeconds,
            tier: activeGatheringSession.map.tier,
            progressRemainder,
        });
        const defaultRatePerHour = Math.max(1, defaultReward.ratePerHour);
        const materialBaseRate = activeGatheringSession.targetMaterial.baseGatheringRatePerHour &&
            activeGatheringSession.targetMaterial.baseGatheringRatePerHour > 0
            ? activeGatheringSession.targetMaterial.baseGatheringRatePerHour
            : defaultRatePerHour;
        const skillMultiplier = gatheringSkill?.productionMultiplier && gatheringSkill.productionMultiplier > 0
            ? gatheringSkill.productionMultiplier
            : 1;
        const affinityMultiplier = gatheringSkill?.isClassAffinity
            ? GATHERING_AFFINITY_PRODUCTION_MULTIPLIER
            : 1;
        const finalRateMultiplier = (materialBaseRate / defaultRatePerHour) *
            skillMultiplier *
            affinityMultiplier;
        const reward = (0, gathering_util_1.calculateGatheringReward)({
            elapsedSeconds,
            tier: activeGatheringSession.map.tier,
            progressRemainder,
            rateMultiplier: finalRateMultiplier,
        });
        const finalRatePerHour = Number((materialBaseRate * skillMultiplier * affinityMultiplier).toFixed(4));
        return {
            label: `Coletando ${activeGatheringSession.targetMaterial.name}`,
            material: {
                id: activeGatheringSession.targetMaterial.id,
                name: activeGatheringSession.targetMaterial.name,
                tier: activeGatheringSession.targetMaterial.tier,
                rarity: activeGatheringSession.targetMaterial.rarity,
                family: activeGatheringSession.targetMaterial.family,
                materialOrigin: activeGatheringSession.targetMaterial.materialOrigin,
                requiredGatheringLevel: activeGatheringSession.targetMaterial.requiredGatheringLevel ?? 1,
                gatheringXpPerUnit: activeGatheringSession.targetMaterial.gatheringXpPerUnit ?? 1,
                baseGatheringRatePerHour: activeGatheringSession.targetMaterial.baseGatheringRatePerHour ??
                    null,
            },
            map: {
                id: activeGatheringSession.map.id,
                name: activeGatheringSession.map.name,
                tier: activeGatheringSession.map.tier,
            },
            gatheringSkill: gatheringSkill ?? null,
            elapsedSeconds,
            elapsedMinutes: Math.floor(elapsedSeconds / 60),
            elapsedHours: Number(reward.elapsedHours.toFixed(4)),
            ratePerHour: finalRatePerHour,
            baseRatePerHour: materialBaseRate,
            defaultRatePerHour,
            skillRateMultiplier: skillMultiplier,
            affinityRateMultiplier: affinityMultiplier,
            finalRateMultiplier: Number(finalRateMultiplier.toFixed(4)),
            estimatedQuantityToCollect: reward.quantity,
            canCollectNow: reward.quantity > 0,
            currentProgressRemainder: Number(progressRemainder.toFixed(4)),
            estimatedNewProgressRemainder: Number(reward.newProgressRemainder.toFixed(4)),
            nextUnitProgressPercent: Number((reward.newProgressRemainder * 100).toFixed(2)),
        };
    }
    buildPotionConfigResponse(config, inventoryItems = []) {
        if (!config) {
            return null;
        }
        const potionItem = config.potionItem ?? null;
        const availableQuantity = potionItem
            ? this.getInventoryQuantityForItem(inventoryItems, potionItem.id)
            : 0;
        const potion = potionItem
            ? this.mapPotionItem(potionItem, availableQuantity)
            : null;
        return {
            id: config.id,
            characterId: config.characterId,
            enabled: config.enabled,
            potionItemId: config.potionItemId,
            hpThresholdPercent: config.hpThresholdPercent,
            useInManualCombat: config.useInManualCombat,
            useInAutoCombat: config.useInAutoCombat,
            potion,
            potionItem: potion,
            summary: {
                hasPotion: Boolean(potion),
                hasPotionInInventory: availableQuantity > 0,
                availableQuantity,
                canAutoUseInManualCombat: config.enabled &&
                    config.useInManualCombat &&
                    Boolean(potion) &&
                    availableQuantity > 0 &&
                    potion?.usableInCombat === true,
                canAutoUseInAutoCombat: config.enabled &&
                    config.useInAutoCombat &&
                    Boolean(potion) &&
                    availableQuantity > 0 &&
                    potion?.usableInCombat === true,
                canAutoUse: config.enabled &&
                    Boolean(potion) &&
                    availableQuantity > 0 &&
                    potion?.usableInCombat === true &&
                    (config.useInManualCombat || config.useInAutoCombat),
                triggerText: config.enabled
                    ? `Usar automaticamente quando HP estiver em ${config.hpThresholdPercent}% ou menos.`
                    : 'Uso automático desativado.',
            },
        };
    }
    mapPotionItem(item, availableQuantity = 0) {
        return {
            id: item.id,
            name: item.name,
            description: item.description,
            rarity: item.rarity,
            tier: item.tier,
            slot: item.slot,
            family: item.family,
            healFlat: item.healFlat,
            healPercent: item.healPercent,
            usableInCombat: item.usableInCombat,
            usableOutOfCombat: item.usableOutOfCombat,
            minTier: item.minTier,
            maxTier: item.maxTier,
            availableQuantity,
        };
    }
    getInventoryQuantityForItem(inventoryItems, itemId) {
        const inventoryItem = inventoryItems.find((currentInventoryItem) => {
            return currentInventoryItem.itemId === itemId;
        });
        return inventoryItem?.quantity ?? 0;
    }
    buildStatsResponse(stats, gatheringBonus) {
        return {
            primary: {
                base: stats.basePrimaryStats,
                levelBonus: stats.levelBonusStats,
                equipmentBonus: stats.equipmentBonusStats,
                gatheringBonus: gatheringBonus ?? {
                    strength: 0,
                    vitality: 0,
                    agility: 0,
                    precision: 0,
                    technique: 0,
                    willpower: 0,
                },
                total: stats.totalPrimaryStats,
            },
            combat: stats.derivedCombatStats,
            basePrimaryStats: stats.basePrimaryStats,
            levelBonusStats: stats.levelBonusStats,
            equipmentBonusStats: stats.equipmentBonusStats,
            gatheringBonusStats: gatheringBonus ?? {
                strength: 0,
                vitality: 0,
                agility: 0,
                precision: 0,
                technique: 0,
                willpower: 0,
            },
            totalPrimaryStats: stats.totalPrimaryStats,
            derivedCombatStats: stats.derivedCombatStats,
        };
    }
    buildEquipmentResponse(equipment) {
        if (!equipment) {
            return {
                mainHand: null,
                offHand: null,
                head: null,
                armor: null,
                pants: null,
                boots: null,
            };
        }
        return {
            id: equipment.id,
            characterId: equipment.characterId,
            mainHand: this.mapEquipmentItem(equipment.mainHand),
            offHand: this.mapEquipmentItem(equipment.offHand),
            head: this.mapEquipmentItem(equipment.head),
            armor: this.mapEquipmentItem(equipment.armor),
            pants: this.mapEquipmentItem(equipment.pants),
            boots: this.mapEquipmentItem(equipment.boots),
            createdAt: equipment.createdAt,
            updatedAt: equipment.updatedAt,
        };
    }
    mapEquipmentItem(item) {
        if (!item) {
            return null;
        }
        return {
            id: item.id,
            name: item.name,
            description: item.description,
            tier: item.tier,
            rarity: item.rarity,
            slot: item.slot,
            family: item.family,
            classId: item.classId,
            mapId: item.mapId,
            strengthBonus: item.strengthBonus,
            vitalityBonus: item.vitalityBonus,
            agilityBonus: item.agilityBonus,
            precisionBonus: item.precisionBonus,
            techniqueBonus: item.techniqueBonus,
            willpowerBonus: item.willpowerBonus,
            isCraftable: item.isCraftable,
        };
    }
    buildInventorySummary(inventoryItems) {
        return {
            totalItems: inventoryItems.length,
            totalQuantity: inventoryItems.reduce((total, inventoryItem) => total + inventoryItem.quantity, 0),
            materials: inventoryItems
                .filter((inventoryItem) => inventoryItem.item.slot === client_1.ItemSlot.MATERIAL)
                .map((inventoryItem) => ({
                id: inventoryItem.item.id,
                itemId: inventoryItem.item.id,
                inventoryItemId: inventoryItem.id,
                name: inventoryItem.item.name,
                description: inventoryItem.item.description,
                quantity: inventoryItem.quantity,
                slot: inventoryItem.item.slot,
                rarity: inventoryItem.item.rarity,
                tier: inventoryItem.item.tier,
                family: inventoryItem.item.family,
                materialOrigin: inventoryItem.item.materialOrigin,
                mapId: inventoryItem.item.mapId,
                requiredGatheringLevel: inventoryItem.item.requiredGatheringLevel ?? 1,
                gatheringXpPerUnit: inventoryItem.item.gatheringXpPerUnit ?? 1,
                baseGatheringRatePerHour: inventoryItem.item.baseGatheringRatePerHour ?? null,
            })),
            consumables: inventoryItems
                .filter((inventoryItem) => inventoryItem.item.slot === client_1.ItemSlot.CONSUMABLE)
                .map((inventoryItem) => ({
                id: inventoryItem.item.id,
                itemId: inventoryItem.item.id,
                inventoryItemId: inventoryItem.id,
                name: inventoryItem.item.name,
                description: inventoryItem.item.description,
                quantity: inventoryItem.quantity,
                slot: inventoryItem.item.slot,
                rarity: inventoryItem.item.rarity,
                tier: inventoryItem.item.tier,
                family: inventoryItem.item.family,
                healFlat: inventoryItem.item.healFlat,
                healPercent: inventoryItem.item.healPercent,
                usableInCombat: inventoryItem.item.usableInCombat,
                usableOutOfCombat: inventoryItem.item.usableOutOfCombat,
                minTier: inventoryItem.item.minTier,
                maxTier: inventoryItem.item.maxTier,
            })),
            equipment: inventoryItems
                .filter((inventoryItem) => inventoryItem.item.slot !== client_1.ItemSlot.MATERIAL &&
                inventoryItem.item.slot !== client_1.ItemSlot.CONSUMABLE)
                .map((inventoryItem) => ({
                id: inventoryItem.item.id,
                itemId: inventoryItem.item.id,
                inventoryItemId: inventoryItem.id,
                name: inventoryItem.item.name,
                description: inventoryItem.item.description,
                quantity: inventoryItem.quantity,
                slot: inventoryItem.item.slot,
                rarity: inventoryItem.item.rarity,
                tier: inventoryItem.item.tier,
                family: inventoryItem.item.family,
                classId: inventoryItem.item.classId,
                mapId: inventoryItem.item.mapId,
                strengthBonus: inventoryItem.item.strengthBonus,
                vitalityBonus: inventoryItem.item.vitalityBonus,
                agilityBonus: inventoryItem.item.agilityBonus,
                precisionBonus: inventoryItem.item.precisionBonus,
                techniqueBonus: inventoryItem.item.techniqueBonus,
                willpowerBonus: inventoryItem.item.willpowerBonus,
            })),
        };
    }
    getEquipmentItems(character) {
        return [
            character.equipment?.mainHand,
            character.equipment?.offHand,
            character.equipment?.head,
            character.equipment?.armor,
            character.equipment?.pants,
            character.equipment?.boots,
        ].filter(Boolean);
    }
    getInventoryItemType(slot) {
        if (slot === client_1.ItemSlot.MATERIAL) {
            return client_1.InventoryItemType.MATERIAL;
        }
        if (slot === client_1.ItemSlot.CONSUMABLE) {
            return client_1.InventoryItemType.CONSUMABLE;
        }
        return client_1.InventoryItemType.EQUIPMENT;
    }
    formatMap(map) {
        return {
            id: map.id,
            name: map.name,
            tier: map.tier,
            minLevel: map.minLevel,
            maxLevel: map.maxLevel,
            description: map.description,
        };
    }
    normalizeCharacterName(name) {
        return name.trim().replace(/\s+/g, ' ');
    }
    normalizeClassName(className) {
        return className.trim().replace(/\s+/g, ' ');
    }
    isValidCharacterName(name) {
        return /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ]+$/.test(name);
    }
    clampHp(currentHp, maxHp) {
        return Math.max(0, Math.min(currentHp, maxHp));
    }
    getStarterEquipmentBySlot(starterItems) {
        return {
            mainHand: this.getRequiredStarterItemBySlot(starterItems, client_1.ItemSlot.MAIN_HAND),
            offHand: this.getRequiredStarterItemBySlot(starterItems, client_1.ItemSlot.OFF_HAND),
            head: this.getRequiredStarterItemBySlot(starterItems, client_1.ItemSlot.HEAD),
            armor: this.getRequiredStarterItemBySlot(starterItems, client_1.ItemSlot.ARMOR),
            pants: this.getRequiredStarterItemBySlot(starterItems, client_1.ItemSlot.PANTS),
            boots: this.getRequiredStarterItemBySlot(starterItems, client_1.ItemSlot.BOOTS),
        };
    }
    getRequiredStarterItemBySlot(starterItems, slot) {
        const item = starterItems.find((starterItem) => starterItem.slot === slot);
        if (!item) {
            throw new common_1.BadRequestException(`Item inicial Tier 0 não encontrado para o slot ${slot}. Rode o seed antes de criar personagens novos.`);
        }
        return item;
    }
    resolveAvatarKey(params) {
        const classSlug = this.getClassSlug(params.className);
        const requestedAvatarKey = params.requestedAvatarKey?.trim().toLowerCase();
        const allowedAvatarKeysByClass = {
            lutador: [
                'lutador-01',
                'lutador-02',
                'lutador-03',
                'lutador-04',
                'lutador-05',
                'lutador-06',
                'lutador-07',
                'lutador-08',
            ],
            assassino: [
                'assassino-01',
                'assassino-02',
                'assassino-03',
                'assassino-04',
                'assassino-05',
                'assassino-06',
                'assassino-07',
                'assassino-08',
            ],
            atirador: [
                'atirador-01',
                'atirador-02',
                'atirador-03',
                'atirador-04',
                'atirador-05',
                'atirador-06',
                'atirador-07',
                'atirador-08',
            ],
            medico: [
                'medico-01',
                'medico-02',
                'medico-03',
                'medico-04',
                'medico-05',
                'medico-06',
                'medico-07',
                'medico-08',
            ],
        };
        const defaultAvatarKeyByClass = {
            lutador: 'lutador-01',
            assassino: 'assassino-01',
            atirador: 'atirador-01',
            medico: 'medico-01',
        };
        const allowedAvatarKeys = allowedAvatarKeysByClass[classSlug];
        if (!allowedAvatarKeys) {
            throw new common_1.BadRequestException('Classe inválida para seleção de avatar.');
        }
        if (!requestedAvatarKey) {
            return defaultAvatarKeyByClass[classSlug];
        }
        if (!allowedAvatarKeys.includes(requestedAvatarKey)) {
            throw new common_1.BadRequestException('Avatar inválido para a classe selecionada.');
        }
        return requestedAvatarKey;
    }
    getCharacterAvatarKey(character) {
        if (character.avatarKey) {
            return character.avatarKey;
        }
        const className = character.class?.name;
        if (!className) {
            return 'lutador-01';
        }
        return this.resolveAvatarKey({
            className,
        });
    }
    getClassSlug(className) {
        return className
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }
    buildCharacterXpPayload(characterLevel, characterXp) {
        const levelProgress = (0, level_util_1.getLevelProgress)(characterLevel, characterXp);
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
    getXpToNextLevelFromProgress(levelProgress) {
        if (levelProgress.xpNeededForNextLevel === null) {
            return Math.max(1, levelProgress.xpIntoCurrentLevel);
        }
        return Math.max(1, levelProgress.xpNeededForNextLevel);
    }
};
exports.CharactersService = CharactersService;
exports.CharactersService = CharactersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CharactersService);
//# sourceMappingURL=characters.service.js.map