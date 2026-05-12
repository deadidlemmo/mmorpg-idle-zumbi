import type {
  GameClass,
  GameMap,
  Item,
  Mob,
  Prisma,
  SubMap,
} from '@prisma/client';
import { ItemSlot, MaterialOrigin, PrismaClient, Rarity } from '@prisma/client';
import { classDefinitions } from './seed-data/classes.seed-data';
import { consumableDefinitions } from './seed-data/consumables.seed-data';
import {
  encounterDefinitions,
  mobDropDefinitions,
} from './seed-data/encounters.seed-data';
import { gatheringDefinitions } from './seed-data/gathering.seed-data';
import {
  equipmentDefinitions,
  materialDefinitions,
  starterEquipmentDefinitions,
} from './seed-data/items.seed-data';
import { mapDefinitions } from './seed-data/maps.seed-data';
import { mobDefinitions } from './seed-data/mobs.seed-data';
import { recipeDefinitions } from './seed-data/recipes.seed-data';
import type {
  ConsumableSeedData,
  CraftingRecipeSeedData,
  EquipmentSeedData,
  GameClassSeedData,
  MapDefinition,
  MaterialSeedData,
  MobDropSeedData,
  SubMapEncounterSeedData,
} from './seed-types';

const prisma = new PrismaClient();

type MaterialSeedDataWithGatheringProgression = MaterialSeedData & {
  requiredGatheringLevel?: number;
  gatheringXpPerUnit?: number;
  baseGatheringRatePerHour?: number | null;
};

function getRarityByTier(tier: number): Rarity {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) {
    return Rarity.COMMON;
  }

  if (safeTier >= 9) return Rarity.LEGENDARY;
  if (safeTier >= 7) return Rarity.EPIC;
  if (safeTier >= 5) return Rarity.RARE;
  if (safeTier >= 3) return Rarity.UNCOMMON;

  return Rarity.COMMON;
}

async function upsertGameClass(data: GameClassSeedData): Promise<GameClass> {
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

async function upsertGameMap(data: MapDefinition): Promise<GameMap> {
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

async function upsertSubMap(params: {
  gameMap: GameMap;
  subMapName: string;
}): Promise<SubMap> {
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

async function upsertMobByNameAndMap(params: {
  data: Prisma.MobUncheckedCreateInput;
  aliases?: string[];
}): Promise<Mob> {
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
      data: data as Prisma.MobUncheckedUpdateInput,
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
        data: data as Prisma.MobUncheckedUpdateInput,
      });
    }
  }

  return prisma.mob.create({
    data,
  });
}

async function upsertItemByName(
  data: Prisma.ItemUncheckedCreateInput,
): Promise<Item> {
  return prisma.item.upsert({
    where: {
      name: data.name,
    },
    update: data as Prisma.ItemUncheckedUpdateInput,
    create: data,
  });
}

async function upsertEquipmentItem(params: {
  data: EquipmentSeedData;
  classId: string;
  mapId: string;
}): Promise<Item> {
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

async function upsertMaterialItem(params: {
  data: MaterialSeedDataWithGatheringProgression;
  mapId: string;
}): Promise<Item> {
  const { data, mapId } = params;

  const isMobDrop = data.materialOrigin === 'DROP_MOBS';

  return upsertItemByName({
    name: data.name,
    slug: data.slug ?? null,
    description: data.description,
    tier: data.tier,
    rarity: getRarityByTier(data.tier),
    slot: ItemSlot.MATERIAL,
    family: data.family ?? 'Material',
    classId: null,
    mapId,
    materialOrigin: data.materialOrigin,
    materialSlot: data.materialSlot ?? null,
    isGatheringMaterial: data.isGatheringMaterial ?? false,

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

async function upsertConsumableItem(data: ConsumableSeedData): Promise<Item> {
  return upsertItemByName({
    name: data.name,
    description: data.description,
    tier: data.tier,
    rarity: getRarityByTier(data.tier),
    slot: ItemSlot.CONSUMABLE,
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

async function upsertSubMapEncounter(params: {
  data: SubMapEncounterSeedData;
  subMapId: string;
  mobId: string;
}) {
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

async function deactivateOtherSubMapEncounters(params: {
  subMapId: string;
  allowedMobIds: string[];
}) {
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

async function upsertMobDrop(params: {
  data: MobDropSeedData;
  mobId: string;
  itemId: string;
}) {
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

async function upsertCraftingRecipe(params: {
  data: CraftingRecipeSeedData;
  outputItem: Item;
  ingredients: Array<{
    item: Item;
    quantity: number;
    role: CraftingRecipeSeedData['ingredients'][number]['role'];
    origin: CraftingRecipeSeedData['ingredients'][number]['origin'];
  }>;
}) {
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

async function validateOfficialGatheringMaterials() {
  const total = await prisma.item.count({
    where: {
      isGatheringMaterial: true,
    },
  });

  if (total !== 360) {
    throw new Error(
      `Validação de gathering falhou: esperado 360 materiais oficiais, encontrado ${total}.`,
    );
  }

  const tierGroups = await prisma.item.groupBy({
    by: ['tier'],
    where: {
      isGatheringMaterial: true,
    },
    _count: {
      _all: true,
    },
  });

  for (let tier = 1; tier <= 10; tier += 1) {
    const group = tierGroups.find((entry) => entry.tier === tier);
    const count = group?._count._all ?? 0;

    if (count !== 36) {
      throw new Error(
        `Validação de gathering falhou: tier ${tier} deveria ter 36 materiais, encontrado ${count}.`,
      );
    }
  }

  const combinationGroups = await prisma.item.groupBy({
    by: ['tier', 'materialOrigin', 'materialSlot'],
    where: {
      isGatheringMaterial: true,
    },
    _count: {
      _all: true,
    },
  });

  if (combinationGroups.length !== 360) {
    throw new Error(
      `Validação de gathering falhou: esperado 360 combinações tier+gathering+slot, encontrado ${combinationGroups.length}.`,
    );
  }

  const officialOrigins: MaterialOrigin[] = [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.COLETA,
    MaterialOrigin.PATRULHA,
    MaterialOrigin.ARSENAL,
    MaterialOrigin.TECNOVARREDURA,
    MaterialOrigin.CONTENCAO,
  ];
  const officialSlots: ItemSlot[] = [
    ItemSlot.MAIN_HAND,
    ItemSlot.OFF_HAND,
    ItemSlot.HEAD,
    ItemSlot.ARMOR,
    ItemSlot.PANTS,
    ItemSlot.BOOTS,
  ];

  const invalidCombination = combinationGroups.find(
    (entry) =>
      entry._count._all !== 1 ||
      !entry.materialOrigin ||
      !entry.materialSlot ||
      !officialOrigins.includes(entry.materialOrigin) ||
      !officialSlots.includes(entry.materialSlot),
  );

  if (invalidCombination) {
    throw new Error(
      `Validação de gathering falhou: combinação inválida ${JSON.stringify(invalidCombination)}.`,
    );
  }

  for (let tier = 1; tier <= 10; tier += 1) {
    for (const origin of officialOrigins) {
      const count = combinationGroups.filter(
        (entry) => entry.tier === tier && entry.materialOrigin === origin,
      ).length;

      if (count !== 6) {
        throw new Error(
          `Validação de gathering falhou: tier ${tier} / ${origin} deveria ter 6 slots, encontrado ${count}.`,
        );
      }

      for (const slot of officialSlots) {
        const hasSlot = combinationGroups.some(
          (entry) =>
            entry.tier === tier &&
            entry.materialOrigin === origin &&
            entry.materialSlot === slot &&
            entry._count._all === 1,
        );

        if (!hasSlot) {
          throw new Error(
            `Validação de gathering falhou: faltando tier ${tier} / ${origin} / ${slot}.`,
          );
        }
      }
    }
  }

  console.log(
    'Validação de gathering concluída: 360 materiais oficiais, 36 por tier e 1 por combinação tier+gathering+slot.',
  );
}

function getRequiredFromMap<T>(params: {
  map: Map<string, T>;
  key: string;
  label: string;
}): T {
  const value = params.map.get(params.key);

  if (!value) {
    throw new Error(`${params.label} não encontrado no seed: ${params.key}`);
  }

  return value;
}

function getRequiredClass(
  classesByName: Map<string, GameClass>,
  name: string,
): GameClass {
  return getRequiredFromMap({
    map: classesByName,
    key: name,
    label: 'Classe',
  });
}

function getRequiredMap(
  mapsByName: Map<string, GameMap>,
  name: string,
): GameMap {
  return getRequiredFromMap({
    map: mapsByName,
    key: name,
    label: 'Mapa',
  });
}

function getRequiredSubMap(
  subMapsByName: Map<string, SubMap>,
  name: string,
): SubMap {
  return getRequiredFromMap({
    map: subMapsByName,
    key: name,
    label: 'Submapa',
  });
}

function getRequiredMob(mobsByName: Map<string, Mob>, name: string): Mob {
  return getRequiredFromMap({
    map: mobsByName,
    key: name,
    label: 'Mob',
  });
}

function getRequiredItem(itemsByName: Map<string, Item>, name: string): Item {
  return getRequiredFromMap({
    map: itemsByName,
    key: name,
    label: 'Item',
  });
}

async function main() {
  console.log('Iniciando seed seguro modularizado...');
  console.log(
    'Este seed NÃO apaga usuários, personagens, inventário, equipamentos ou progresso.',
  );

  console.log('Criando/atualizando classes...');

  const classesByName = new Map<string, GameClass>();

  for (const classDefinition of classDefinitions) {
    const gameClass = await upsertGameClass(classDefinition);
    classesByName.set(gameClass.name, gameClass);
  }

  console.log('Criando/atualizando mapas e submapas...');

  const mapsByName = new Map<string, GameMap>();
  const subMapsByName = new Map<string, SubMap>();

  for (const mapDefinition of mapDefinitions) {
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

  const mobsByName = new Map<string, Mob>();

  for (const mobDefinition of mobDefinitions) {
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

  const encounterMobIdsBySubMapName = new Map<string, string[]>();

  for (const encounterDefinition of encounterDefinitions) {
    const subMap = getRequiredSubMap(
      subMapsByName,
      encounterDefinition.subMapName,
    );
    const mob = getRequiredMob(mobsByName, encounterDefinition.mobName);

    await upsertSubMapEncounter({
      data: encounterDefinition,
      subMapId: subMap.id,
      mobId: mob.id,
    });

    const existingAllowedMobIds =
      encounterMobIdsBySubMapName.get(encounterDefinition.subMapName) ?? [];

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

  const itemsByName = new Map<string, Item>();

  const allEquipmentDefinitions = [
    ...starterEquipmentDefinitions,
    ...equipmentDefinitions,
  ];

  for (const equipmentDefinition of allEquipmentDefinitions) {
    const gameClass = getRequiredClass(
      classesByName,
      equipmentDefinition.className,
    );
    const gameMap = getRequiredMap(mapsByName, equipmentDefinition.mapName);

    const item = await upsertEquipmentItem({
      data: equipmentDefinition,
      classId: gameClass.id,
      mapId: gameMap.id,
    });

    itemsByName.set(item.name, item);
  }

  for (const materialDefinition of materialDefinitions) {
    const gameMap = getRequiredMap(mapsByName, materialDefinition.mapName);

    const item = await upsertMaterialItem({
      data: materialDefinition,
      mapId: gameMap.id,
    });

    itemsByName.set(item.name, item);
  }

  for (const consumableDefinition of consumableDefinitions) {
    const item = await upsertConsumableItem(consumableDefinition);
    itemsByName.set(item.name, item);
  }

  console.log('Criando/atualizando receitas...');

  for (const recipeDefinition of recipeDefinitions) {
    const outputItem = getRequiredItem(
      itemsByName,
      recipeDefinition.outputItemName,
    );

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

  console.log(
    'Limpando drops antigos dos mobs oficiais cadastrados neste seed...',
  );

  await prisma.mobDrop.deleteMany({
    where: {
      mobId: {
        in: Array.from(mobsByName.values()).map((mob) => mob.id),
      },
    },
  });

  console.log('Criando/atualizando drops oficiais...');

  for (const mobDropDefinition of mobDropDefinitions) {
    const mob = getRequiredMob(mobsByName, mobDropDefinition.mobName);
    const item = getRequiredItem(itemsByName, mobDropDefinition.itemName);

    await upsertMobDrop({
      data: mobDropDefinition,
      mobId: mob.id,
      itemId: item.id,
    });
  }

  await validateOfficialGatheringMaterials();

  console.log('Seed seguro modularizado finalizado com sucesso!');

  const suburbio = getRequiredMap(mapsByName, 'Subúrbio Silencioso');

  console.log({
    observacao:
      'Nenhum personagem, usuário, inventário, equipamento ou progresso foi apagado.',
    regraRaridadePorTier: {
      'T0-T2': Rarity.COMMON,
      'T3-T4': Rarity.UNCOMMON,
      'T5-T6': Rarity.RARE,
      'T7-T8': Rarity.EPIC,
      'T9-T10+': Rarity.LEGENDARY,
    },
    classes: Array.from(classesByName.keys()),
    mapasRegistrados: mapDefinitions.length,
    subMapasRegistrados: mapDefinitions.reduce(
      (total, mapDefinition) => total + mapDefinition.subMaps.length,
      0,
    ),
    mapaInicial: suburbio.name,
    mobsRegistrados: mobDefinitions.map((mob) => mob.name),
    itensTier0Aprendiz: starterEquipmentDefinitions.map((item) => ({
      name: item.name,
      className: item.className,
      slot: item.slot,
      tier: item.tier,
      rarity: getRarityByTier(item.tier),
      isCraftable: item.isCraftable,
    })),
    equipamentosRegistrados: equipmentDefinitions.map((item) => ({
      name: item.name,
      tier: item.tier,
      rarity: getRarityByTier(item.tier),
    })),
    materiaisRegistrados: materialDefinitions.map((item) => ({
      name: item.name,
      tier: item.tier,
      rarity: getRarityByTier(item.tier),
      origin: item.materialOrigin,
      requiredGatheringLevel:
        (item as MaterialSeedDataWithGatheringProgression)
          .requiredGatheringLevel ?? 1,
      gatheringXpPerUnit:
        (item as MaterialSeedDataWithGatheringProgression).gatheringXpPerUnit ??
        1,
      baseGatheringRatePerHour:
        (item as MaterialSeedDataWithGatheringProgression)
          .baseGatheringRatePerHour ?? null,
    })),
    consumiveisRegistrados: consumableDefinitions.map((item) => ({
      name: item.name,
      tier: item.tier,
      rarity: getRarityByTier(item.tier),
      tiers: `${item.minTier}-${item.maxTier}`,
      heal: `${item.healFlat} + ${item.healPercent}% do HP máximo`,
    })),
    receitasRegistradas: recipeDefinitions.length,
    encountersRegistrados: encounterDefinitions.length,
    dropsRegistrados: mobDropDefinitions.length,
    gatheringDocumentado: gatheringDefinitions.map((definition) => ({
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
