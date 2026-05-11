"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const classes_seed_data_1 = require("./seed-data/classes.seed-data");
const consumables_seed_data_1 = require("./seed-data/consumables.seed-data");
const encounters_seed_data_1 = require("./seed-data/encounters.seed-data");
const gathering_seed_data_1 = require("./seed-data/gathering.seed-data");
const items_seed_data_1 = require("./seed-data/items.seed-data");
const maps_seed_data_1 = require("./seed-data/maps.seed-data");
const mobs_seed_data_1 = require("./seed-data/mobs.seed-data");
const recipes_seed_data_1 = require("./seed-data/recipes.seed-data");
const prisma = new client_1.PrismaClient();
function getRarityByTier(tier) {
    const safeTier = Number(tier);
    if (!Number.isFinite(safeTier)) {
        return client_1.Rarity.COMMON;
    }
    if (safeTier >= 9)
        return client_1.Rarity.LEGENDARY;
    if (safeTier >= 7)
        return client_1.Rarity.EPIC;
    if (safeTier >= 5)
        return client_1.Rarity.RARE;
    if (safeTier >= 3)
        return client_1.Rarity.UNCOMMON;
    return client_1.Rarity.COMMON;
}
async function upsertGameClass(data) {
    return prisma.gameClass.upsert({
        where: {
            name: data.name,
        },
        update: {
            description: data.description,
            baseStrength: data.baseStrength,
            baseVitality: data.baseVitality,
            baseAgility: data.baseAgility,
            basePrecision: data.basePrecision,
            baseTechnique: data.baseTechnique,
            baseWillpower: data.baseWillpower,
        },
        create: data,
    });
}
async function upsertGameMap(data) {
    return prisma.gameMap.upsert({
        where: {
            name: data.name,
        },
        update: {
            tier: data.tier,
            minLevel: data.minLevel,
            maxLevel: data.maxLevel,
            description: data.description,
        },
        create: {
            name: data.name,
            tier: data.tier,
            minLevel: data.minLevel,
            maxLevel: data.maxLevel,
            description: data.description,
        },
    });
}
async function upsertSubMap(params) {
    const { gameMap, subMapName } = params;
    return prisma.subMap.upsert({
        where: {
            mapId_name: {
                mapId: gameMap.id,
                name: subMapName,
            },
        },
        update: {
            description: `Submapa de ${gameMap.name}.`,
            tier: gameMap.tier,
            minLevel: gameMap.minLevel,
            maxLevel: gameMap.maxLevel,
        },
        create: {
            name: subMapName,
            description: `Submapa de ${gameMap.name}.`,
            tier: gameMap.tier,
            minLevel: gameMap.minLevel,
            maxLevel: gameMap.maxLevel,
            mapId: gameMap.id,
        },
    });
}
async function upsertMobByNameAndMap(params) {
    const { data, aliases = [] } = params;
    const existingOfficialMob = await prisma.mob.findFirst({
        where: {
            name: data.name,
            mapId: data.mapId,
        },
    });
    if (existingOfficialMob) {
        return prisma.mob.update({
            where: {
                id: existingOfficialMob.id,
            },
            data: data,
        });
    }
    if (aliases.length > 0) {
        const existingAliasMob = await prisma.mob.findFirst({
            where: {
                mapId: data.mapId,
                name: {
                    in: aliases,
                },
            },
        });
        if (existingAliasMob) {
            return prisma.mob.update({
                where: {
                    id: existingAliasMob.id,
                },
                data: data,
            });
        }
    }
    return prisma.mob.create({
        data,
    });
}
async function upsertItemByName(data) {
    return prisma.item.upsert({
        where: {
            name: data.name,
        },
        update: data,
        create: data,
    });
}
async function upsertEquipmentItem(params) {
    const { data, classId, mapId } = params;
    return upsertItemByName({
        name: data.name,
        description: data.description,
        tier: data.tier,
        rarity: getRarityByTier(data.tier),
        slot: data.slot,
        family: data.family,
        classId,
        mapId,
        materialOrigin: null,
        requiredGatheringLevel: 1,
        gatheringXpPerUnit: 0,
        baseGatheringRatePerHour: null,
        strengthBonus: data.strengthBonus ?? 0,
        vitalityBonus: data.vitalityBonus ?? 0,
        agilityBonus: data.agilityBonus ?? 0,
        precisionBonus: data.precisionBonus ?? 0,
        techniqueBonus: data.techniqueBonus ?? 0,
        willpowerBonus: data.willpowerBonus ?? 0,
        healFlat: 0,
        healPercent: 0,
        usableInCombat: false,
        usableOutOfCombat: false,
        minTier: null,
        maxTier: null,
        isCraftable: data.isCraftable ?? true,
    });
}
async function upsertMaterialItem(params) {
    const { data, mapId } = params;
    const isMobDrop = data.materialOrigin === 'DROP_MOBS';
    return upsertItemByName({
        name: data.name,
        description: data.description,
        tier: data.tier,
        rarity: getRarityByTier(data.tier),
        slot: client_1.ItemSlot.MATERIAL,
        family: data.family ?? 'Material',
        classId: null,
        mapId,
        materialOrigin: data.materialOrigin,
        requiredGatheringLevel: data.requiredGatheringLevel ?? 1,
        gatheringXpPerUnit: data.gatheringXpPerUnit ?? (isMobDrop ? 0 : 1),
        baseGatheringRatePerHour: data.baseGatheringRatePerHour ?? null,
        strengthBonus: 0,
        vitalityBonus: 0,
        agilityBonus: 0,
        precisionBonus: 0,
        techniqueBonus: 0,
        willpowerBonus: 0,
        healFlat: 0,
        healPercent: 0,
        usableInCombat: false,
        usableOutOfCombat: false,
        minTier: null,
        maxTier: null,
        isCraftable: false,
    });
}
async function upsertConsumableItem(data) {
    return upsertItemByName({
        name: data.name,
        description: data.description,
        tier: data.tier,
        rarity: getRarityByTier(data.tier),
        slot: client_1.ItemSlot.CONSUMABLE,
        family: data.family,
        classId: null,
        mapId: null,
        materialOrigin: null,
        requiredGatheringLevel: 1,
        gatheringXpPerUnit: 0,
        baseGatheringRatePerHour: null,
        strengthBonus: 0,
        vitalityBonus: 0,
        agilityBonus: 0,
        precisionBonus: 0,
        techniqueBonus: 0,
        willpowerBonus: 0,
        healFlat: data.healFlat,
        healPercent: data.healPercent,
        usableInCombat: true,
        usableOutOfCombat: true,
        minTier: data.minTier,
        maxTier: data.maxTier,
        isCraftable: data.isCraftable ?? false,
    });
}
async function upsertSubMapEncounter(params) {
    const { data, subMapId, mobId } = params;
    const existingEncounter = await prisma.subMapEncounter.findFirst({
        where: {
            subMapId,
            mobId,
        },
    });
    if (existingEncounter) {
        return prisma.subMapEncounter.update({
            where: {
                id: existingEncounter.id,
            },
            data: {
                weight: data.weight,
                isActive: data.isActive ?? true,
            },
        });
    }
    return prisma.subMapEncounter.create({
        data: {
            subMapId,
            mobId,
            weight: data.weight,
            isActive: data.isActive ?? true,
        },
    });
}
async function deactivateOtherSubMapEncounters(params) {
    const { subMapId, allowedMobIds } = params;
    return prisma.subMapEncounter.updateMany({
        where: {
            subMapId,
            mobId: {
                notIn: allowedMobIds,
            },
        },
        data: {
            isActive: false,
        },
    });
}
async function upsertMobDrop(params) {
    const { data, mobId, itemId } = params;
    const existingDrop = await prisma.mobDrop.findFirst({
        where: {
            mobId,
            itemId,
        },
    });
    if (existingDrop) {
        return prisma.mobDrop.update({
            where: {
                id: existingDrop.id,
            },
            data: {
                dropChance: data.dropChance,
                minQuantity: data.minQuantity,
                maxQuantity: data.maxQuantity,
            },
        });
    }
    return prisma.mobDrop.create({
        data: {
            mobId,
            itemId,
            dropChance: data.dropChance,
            minQuantity: data.minQuantity,
            maxQuantity: data.maxQuantity,
        },
    });
}
async function upsertCraftingRecipe(params) {
    const { data, outputItem, ingredients } = params;
    return prisma.craftingRecipe.upsert({
        where: {
            outputItemId: outputItem.id,
        },
        update: {
            tier: data.tier,
            isActive: true,
            outputQuantity: data.outputQuantity ?? 1,
            ingredients: {
                deleteMany: {},
                create: ingredients.map((ingredient) => ({
                    itemId: ingredient.item.id,
                    quantity: ingredient.quantity,
                    role: ingredient.role,
                    origin: ingredient.origin,
                })),
            },
        },
        create: {
            outputItemId: outputItem.id,
            tier: data.tier,
            isActive: true,
            outputQuantity: data.outputQuantity ?? 1,
            ingredients: {
                create: ingredients.map((ingredient) => ({
                    itemId: ingredient.item.id,
                    quantity: ingredient.quantity,
                    role: ingredient.role,
                    origin: ingredient.origin,
                })),
            },
        },
    });
}
function getRequiredFromMap(params) {
    const value = params.map.get(params.key);
    if (!value) {
        throw new Error(`${params.label} não encontrado no seed: ${params.key}`);
    }
    return value;
}
function getRequiredClass(classesByName, name) {
    return getRequiredFromMap({
        map: classesByName,
        key: name,
        label: 'Classe',
    });
}
function getRequiredMap(mapsByName, name) {
    return getRequiredFromMap({
        map: mapsByName,
        key: name,
        label: 'Mapa',
    });
}
function getRequiredSubMap(subMapsByName, name) {
    return getRequiredFromMap({
        map: subMapsByName,
        key: name,
        label: 'Submapa',
    });
}
function getRequiredMob(mobsByName, name) {
    return getRequiredFromMap({
        map: mobsByName,
        key: name,
        label: 'Mob',
    });
}
function getRequiredItem(itemsByName, name) {
    return getRequiredFromMap({
        map: itemsByName,
        key: name,
        label: 'Item',
    });
}
async function main() {
    console.log('Iniciando seed seguro modularizado...');
    console.log('Este seed NÃO apaga usuários, personagens, inventário, equipamentos ou progresso.');
    console.log('Criando/atualizando classes...');
    const classesByName = new Map();
    for (const classDefinition of classes_seed_data_1.classDefinitions) {
        const gameClass = await upsertGameClass(classDefinition);
        classesByName.set(gameClass.name, gameClass);
    }
    console.log('Criando/atualizando mapas e submapas...');
    const mapsByName = new Map();
    const subMapsByName = new Map();
    for (const mapDefinition of maps_seed_data_1.mapDefinitions) {
        const gameMap = await upsertGameMap(mapDefinition);
        mapsByName.set(gameMap.name, gameMap);
        for (const subMapName of mapDefinition.subMaps) {
            const subMap = await upsertSubMap({
                gameMap,
                subMapName,
            });
            subMapsByName.set(subMap.name, subMap);
        }
    }
    console.log('Criando/atualizando mobs...');
    const mobsByName = new Map();
    for (const mobDefinition of mobs_seed_data_1.mobDefinitions) {
        const gameMap = getRequiredMap(mapsByName, mobDefinition.mapName);
        const mob = await upsertMobByNameAndMap({
            aliases: mobDefinition.aliases,
            data: {
                name: mobDefinition.name,
                description: mobDefinition.description,
                level: mobDefinition.level,
                tier: mobDefinition.tier,
                hp: mobDefinition.hp,
                attack: mobDefinition.attack,
                defense: mobDefinition.defense,
                speed: mobDefinition.speed,
                xpReward: mobDefinition.xpReward,
                mapId: gameMap.id,
            },
        });
        mobsByName.set(mob.name, mob);
    }
    console.log('Criando/atualizando encounters...');
    const encounterMobIdsBySubMapName = new Map();
    for (const encounterDefinition of encounters_seed_data_1.encounterDefinitions) {
        const subMap = getRequiredSubMap(subMapsByName, encounterDefinition.subMapName);
        const mob = getRequiredMob(mobsByName, encounterDefinition.mobName);
        await upsertSubMapEncounter({
            data: encounterDefinition,
            subMapId: subMap.id,
            mobId: mob.id,
        });
        const existingAllowedMobIds = encounterMobIdsBySubMapName.get(encounterDefinition.subMapName) ?? [];
        encounterMobIdsBySubMapName.set(encounterDefinition.subMapName, [
            ...existingAllowedMobIds,
            mob.id,
        ]);
    }
    for (const [subMapName, allowedMobIds] of encounterMobIdsBySubMapName) {
        const subMap = getRequiredSubMap(subMapsByName, subMapName);
        await deactivateOtherSubMapEncounters({
            subMapId: subMap.id,
            allowedMobIds,
        });
    }
    console.log('Criando/atualizando itens...');
    const itemsByName = new Map();
    const allEquipmentDefinitions = [
        ...items_seed_data_1.starterEquipmentDefinitions,
        ...items_seed_data_1.equipmentDefinitions,
    ];
    for (const equipmentDefinition of allEquipmentDefinitions) {
        const gameClass = getRequiredClass(classesByName, equipmentDefinition.className);
        const gameMap = getRequiredMap(mapsByName, equipmentDefinition.mapName);
        const item = await upsertEquipmentItem({
            data: equipmentDefinition,
            classId: gameClass.id,
            mapId: gameMap.id,
        });
        itemsByName.set(item.name, item);
    }
    for (const materialDefinition of items_seed_data_1.materialDefinitions) {
        const gameMap = getRequiredMap(mapsByName, materialDefinition.mapName);
        const item = await upsertMaterialItem({
            data: materialDefinition,
            mapId: gameMap.id,
        });
        itemsByName.set(item.name, item);
    }
    for (const consumableDefinition of consumables_seed_data_1.consumableDefinitions) {
        const item = await upsertConsumableItem(consumableDefinition);
        itemsByName.set(item.name, item);
    }
    console.log('Criando/atualizando receitas...');
    for (const recipeDefinition of recipes_seed_data_1.recipeDefinitions) {
        const outputItem = getRequiredItem(itemsByName, recipeDefinition.outputItemName);
        const ingredients = recipeDefinition.ingredients.map((ingredient) => ({
            item: getRequiredItem(itemsByName, ingredient.itemName),
            quantity: ingredient.quantity,
            role: ingredient.role,
            origin: ingredient.origin,
        }));
        await upsertCraftingRecipe({
            data: recipeDefinition,
            outputItem,
            ingredients,
        });
    }
    console.log('Limpando drops antigos dos mobs oficiais cadastrados neste seed...');
    await prisma.mobDrop.deleteMany({
        where: {
            mobId: {
                in: Array.from(mobsByName.values()).map((mob) => mob.id),
            },
        },
    });
    console.log('Criando/atualizando drops oficiais...');
    for (const mobDropDefinition of encounters_seed_data_1.mobDropDefinitions) {
        const mob = getRequiredMob(mobsByName, mobDropDefinition.mobName);
        const item = getRequiredItem(itemsByName, mobDropDefinition.itemName);
        await upsertMobDrop({
            data: mobDropDefinition,
            mobId: mob.id,
            itemId: item.id,
        });
    }
    console.log('Seed seguro modularizado finalizado com sucesso!');
    const suburbio = getRequiredMap(mapsByName, 'Subúrbio Silencioso');
    console.log({
        observacao: 'Nenhum personagem, usuário, inventário, equipamento ou progresso foi apagado.',
        regraRaridadePorTier: {
            'T0-T2': client_1.Rarity.COMMON,
            'T3-T4': client_1.Rarity.UNCOMMON,
            'T5-T6': client_1.Rarity.RARE,
            'T7-T8': client_1.Rarity.EPIC,
            'T9-T10+': client_1.Rarity.LEGENDARY,
        },
        classes: Array.from(classesByName.keys()),
        mapasRegistrados: maps_seed_data_1.mapDefinitions.length,
        subMapasRegistrados: maps_seed_data_1.mapDefinitions.reduce((total, mapDefinition) => total + mapDefinition.subMaps.length, 0),
        mapaInicial: suburbio.name,
        mobsRegistrados: mobs_seed_data_1.mobDefinitions.map((mob) => mob.name),
        itensTier0Aprendiz: items_seed_data_1.starterEquipmentDefinitions.map((item) => ({
            name: item.name,
            className: item.className,
            slot: item.slot,
            tier: item.tier,
            rarity: getRarityByTier(item.tier),
            isCraftable: item.isCraftable,
        })),
        equipamentosRegistrados: items_seed_data_1.equipmentDefinitions.map((item) => ({
            name: item.name,
            tier: item.tier,
            rarity: getRarityByTier(item.tier),
        })),
        materiaisRegistrados: items_seed_data_1.materialDefinitions.map((item) => ({
            name: item.name,
            tier: item.tier,
            rarity: getRarityByTier(item.tier),
            origin: item.materialOrigin,
            requiredGatheringLevel: item
                .requiredGatheringLevel ?? 1,
            gatheringXpPerUnit: item.gatheringXpPerUnit ??
                1,
            baseGatheringRatePerHour: item
                .baseGatheringRatePerHour ?? null,
        })),
        consumiveisRegistrados: consumables_seed_data_1.consumableDefinitions.map((item) => ({
            name: item.name,
            tier: item.tier,
            rarity: getRarityByTier(item.tier),
            tiers: `${item.minTier}-${item.maxTier}`,
            heal: `${item.healFlat} + ${item.healPercent}% do HP máximo`,
        })),
        receitasRegistradas: recipes_seed_data_1.recipeDefinitions.length,
        encountersRegistrados: encounters_seed_data_1.encounterDefinitions.length,
        dropsRegistrados: encounters_seed_data_1.mobDropDefinitions.length,
        gatheringDocumentado: gathering_seed_data_1.gatheringDefinitions.map((definition) => ({
            key: definition.key,
            label: definition.label,
            materialOrigin: definition.materialOrigin,
            statBonus: definition.statBonus,
        })),
    });
}
main()
    .catch((error) => {
    console.error('Erro ao executar seed seguro modularizado:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map