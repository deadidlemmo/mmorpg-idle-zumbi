import type {
  GameClass,
  GameMap,
  Item,
  Mob,
  Prisma,
  SubMap,
} from '@prisma/client';
import {
  ItemSlot,
  MaterialOrigin,
  PrismaClient,
  Rarity,
  WorldBossRewardType,
} from '@prisma/client';
import { getGatheringXpPerUnitForTier } from '../src/common/config/gathering.config';
import { classDefinitions } from './seed-data/classes.seed-data';
import { consumableDefinitions } from './seed-data/consumables.seed-data';
import { encounterDefinitions } from './seed-data/encounters.seed-data';
import { gatheringDefinitions } from './seed-data/gathering.seed-data';
import { incursionDefinitions } from './seed-data/incursions.seed-data';
import {
  equipmentDefinitions,
  materialDefinitions,
  starterEquipmentDefinitions,
} from './seed-data/items.seed-data';
import { mapDefinitions } from './seed-data/maps.seed-data';
import {
  mobDropItemDefinitions,
  mobDropTables,
} from './seed-data/mob-drops.seed-data';
import { mobDefinitions } from './seed-data/mobs.seed-data';
import { recipeDefinitions } from './seed-data/recipes.seed-data';
import { worldBossDefinitions } from './seed-data/world-bosses.seed-data';
import type {
  ConsumableSeedData,
  CraftingRecipeSeedData,
  IncursionSeedData,
  WorldBossSeedData,
  EquipmentSeedData,
  GameClassSeedData,
  MapDefinition,
  MaterialSeedData,
  MobDropItemSeedData,
  MobDropSeedData,
  SubMapEncounterSeedData,
} from './seed-types';

const prisma = new PrismaClient();

const CONSUMABLE_ALIASES_BY_NAME: Record<string, string[]> = {
  'Poção de Vida Menor': ['Pocao Pequena de Vida'],
  'Poção de Vida': ['Pocao Media de Vida'],
  'Poção de Vida Maior': ['Pocao Grande de Vida'],
};

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
      data,
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
        data,
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
    update: data,
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
    rarity: data.rarity,
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
  const isGatheringMaterial = data.isGatheringMaterial ?? false;
  const gatheringXpPerUnit =
    isGatheringMaterial
      ? getGatheringXpPerUnitForTier(data.tier)
      : (data.gatheringXpPerUnit ?? (isMobDrop ? 0 : 1));

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
    gatheringXpPerUnit,
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

async function upsertMobDropMaterialItem(
  data: MobDropItemSeedData,
): Promise<Item> {
  return upsertItemByName({
    name: data.name,
    slug: data.slug ?? null,
    description: data.description,
    tier: data.tier,
    rarity: data.rarity,
    slot: ItemSlot.MATERIAL,
    family: data.family,
    classId: null,
    mapId: null,
    materialOrigin: MaterialOrigin.DROP_MOBS,
    materialSlot: null,
    isGatheringMaterial: false,

    requiredGatheringLevel: 1,
    gatheringXpPerUnit: 0,
    baseGatheringRatePerHour: null,

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
  const itemData: Prisma.ItemUncheckedCreateInput = {
    name: data.name,
    description: data.description,
    tier: data.tier,
    rarity: data.rarity,
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
  };

  const existingOfficialItem = await prisma.item.findUnique({
    where: { name: data.name },
  });

  if (existingOfficialItem) {
    return prisma.item.update({
      where: { id: existingOfficialItem.id },
      data: itemData,
    });
  }

  const aliases = CONSUMABLE_ALIASES_BY_NAME[data.name] ?? [];

  if (aliases.length > 0) {
    const existingAliasItem = await prisma.item.findFirst({
      where: {
        name: {
          in: aliases,
        },
      },
    });

    if (existingAliasItem) {
      return prisma.item.update({
        where: { id: existingAliasItem.id },
        data: itemData,
      });
    }
  }

  return prisma.item.create({
    data: itemData,
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

async function upsertIncursion(params: {
  data: IncursionSeedData;
  mapId: string;
}) {
  const { data, mapId } = params;

  if (data.durationSeconds < 1800) {
    throw new Error(
      `Incursão ${data.name} possui duração menor que 1800 segundos.`,
    );
  }

  const incursion = await prisma.incursion.upsert({
    where: {
      slug: data.slug,
    },
    update: {
      name: data.name,
      description: data.description,
      mapId,
      tier: data.tier,
      minLevel: data.minLevel,
      maxLevel: data.maxLevel,
      goldCost: data.goldCost,
      durationSeconds: data.durationSeconds,
      difficulty: data.difficulty,
      riskLevel: data.riskLevel,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
    create: {
      name: data.name,
      slug: data.slug,
      description: data.description,
      mapId,
      tier: data.tier,
      minLevel: data.minLevel,
      maxLevel: data.maxLevel,
      goldCost: data.goldCost,
      durationSeconds: data.durationSeconds,
      difficulty: data.difficulty,
      riskLevel: data.riskLevel,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  await prisma.incursionLootTable.deleteMany({
    where: {
      incursionId: incursion.id,
    },
  });

  for (const [index, loot] of data.lootTable.entries()) {
    const item = loot.itemName
      ? await prisma.item.findUnique({ where: { name: loot.itemName } })
      : null;

    if (loot.itemName && !item) {
      throw new Error(
        `Item de loot ${loot.itemName} não encontrado para incursão ${data.name}.`,
      );
    }

    if (loot.minQuantity > loot.maxQuantity) {
      throw new Error(
        `Loot inválido em ${data.name}: minQuantity maior que maxQuantity.`,
      );
    }

    await prisma.incursionLootTable.create({
      data: {
        incursionId: incursion.id,
        rewardType: loot.rewardType,
        itemId: item?.id ?? null,
        chance: Math.max(0, Math.min(100, loot.chance)),
        minQuantity: Math.max(0, loot.minQuantity),
        maxQuantity: Math.max(0, loot.maxQuantity),
        guaranteed: loot.guaranteed ?? false,
        rarity: loot.rarity ?? null,
        sortOrder: loot.sortOrder ?? index,
      },
    });
  }

  return incursion;
}

async function ensureWorldBossSeedItem(params: {
  name: string;
  tier: number;
  rarity?: Rarity | null;
  rewardType: WorldBossRewardType;
  mapId: string;
}): Promise<Item> {
  const family =
    params.rewardType === WorldBossRewardType.PET_EGG
      ? 'Casulo Infectado'
      : 'Material de Ameaça Global';

  return upsertItemByName({
    name: params.name,
    slug: params.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    description:
      params.rewardType === WorldBossRewardType.PET_EGG
        ? 'Casulo biológico raro obtido em Ameaças Globais. Futuramente poderá originar um companheiro infectado controlado.'
        : 'Fragmento mutante coletado após conter uma Ameaça Global.',
    tier: params.tier,
    rarity: params.rarity ?? getRarityByTier(params.tier),
    slot: ItemSlot.MATERIAL,
    family,
    classId: null,
    mapId: params.mapId,
    materialOrigin: MaterialOrigin.DROP_MOBS,
    materialSlot: null,
    isGatheringMaterial: false,
    requiredGatheringLevel: 1,
    gatheringXpPerUnit: 0,
    baseGatheringRatePerHour: null,
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

async function upsertWorldBoss(params: {
  data: WorldBossSeedData;
  mapId: string;
}) {
  const { data, mapId } = params;

  const worldBoss = await prisma.worldBoss.upsert({
    where: { slug: data.slug },
    update: {
      name: data.name,
      description: data.description,
      mapId,
      tier: data.tier,
      minLevel: data.minLevel,
      maxLevel: data.maxLevel,
      baseHp: data.baseHp,
      maxHp: data.maxHp ?? null,
      hpPerParticipant: data.hpPerParticipant,
      powerScalingFactor: data.powerScalingFactor,
      scalingFactor: data.scalingFactor ?? 1,
      minParticipantsExpected: data.minParticipantsExpected ?? 1,
      maxScalingCap: data.maxScalingCap ?? 3,
      scalingWindowSeconds: data.scalingWindowSeconds ?? 600,
      attackPower: data.attackPower,
      defense: data.defense,
      resistance: data.resistance,
      mutationLevel: data.mutationLevel ?? 1,
      damageReduction: data.damageReduction ?? 0,
      enrageMultiplier: data.enrageMultiplier ?? 1,
      durationSeconds: data.durationSeconds,
      difficulty: data.difficulty,
      riskLevel: data.riskLevel,
      minParticipationSeconds: data.minParticipationSeconds ?? 300,
      minParticipationDamage: data.minParticipationDamage ?? 1,
      imageUrl: data.imageUrl ?? null,
      assetKey: data.assetKey ?? null,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
    create: {
      name: data.name,
      slug: data.slug,
      description: data.description,
      mapId,
      tier: data.tier,
      minLevel: data.minLevel,
      maxLevel: data.maxLevel,
      baseHp: data.baseHp,
      maxHp: data.maxHp ?? null,
      hpPerParticipant: data.hpPerParticipant,
      powerScalingFactor: data.powerScalingFactor,
      scalingFactor: data.scalingFactor ?? 1,
      minParticipantsExpected: data.minParticipantsExpected ?? 1,
      maxScalingCap: data.maxScalingCap ?? 3,
      scalingWindowSeconds: data.scalingWindowSeconds ?? 600,
      attackPower: data.attackPower,
      defense: data.defense,
      resistance: data.resistance,
      mutationLevel: data.mutationLevel ?? 1,
      damageReduction: data.damageReduction ?? 0,
      enrageMultiplier: data.enrageMultiplier ?? 1,
      durationSeconds: data.durationSeconds,
      difficulty: data.difficulty,
      riskLevel: data.riskLevel,
      minParticipationSeconds: data.minParticipationSeconds ?? 300,
      minParticipationDamage: data.minParticipationDamage ?? 1,
      imageUrl: data.imageUrl ?? null,
      assetKey: data.assetKey ?? null,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  await prisma.worldBossReward.deleteMany({
    where: { worldBossId: worldBoss.id },
  });

  for (const [index, reward] of data.lootTable.entries()) {
    const item = reward.itemName
      ? await ensureWorldBossSeedItem({
          name: reward.itemName,
          tier: data.tier,
          rarity: reward.rarity,
          rewardType: reward.rewardType,
          mapId,
        })
      : null;

    if (reward.minQuantity > reward.maxQuantity) {
      throw new Error(
        `Loot inválido em ${data.name}: minQuantity maior que maxQuantity.`,
      );
    }

    await prisma.worldBossReward.create({
      data: {
        worldBossId: worldBoss.id,
        rewardType: reward.rewardType,
        itemId: item?.id ?? null,
        minQuantity: Math.max(0, reward.minQuantity),
        maxQuantity: Math.max(0, reward.maxQuantity),
        chance: Math.max(0, Math.min(100, reward.chance)),
        guaranteed: reward.guaranteed ?? false,
        onlyIfDefeated: reward.onlyIfDefeated ?? false,
        requiresMinParticipation: reward.requiresMinParticipation ?? true,
        minContributionPercent: reward.minContributionPercent ?? 0,
        minRankPercent: reward.minRankPercent ?? null,
        rarity: reward.rarity ?? null,
        sortOrder: reward.sortOrder ?? index,
      },
    });
  }

  const activeEvent = await prisma.worldBossEvent.findFirst({
    where: {
      worldBossId: worldBoss.id,
      status: { in: ['SCHEDULED', 'LOBBY_OPEN', 'ACTIVE'] },
    },
  });

  if (!activeEvent) {
    const now = new Date();
    await prisma.worldBossEvent.create({
      data: {
        worldBossId: worldBoss.id,
        mapId,
        tier: data.tier,
        status: 'LOBBY_OPEN',
        startsAt: new Date(now.getTime() + 10 * 60 * 1000),
        endsAt: new Date(
          now.getTime() + (10 * 60 + data.durationSeconds) * 1000,
        ),
        maxHp: data.baseHp,
        currentHp: data.baseHp,
      },
    });
  }

  return worldBoss;
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

function flattenMobDropTables(): MobDropSeedData[] {
  validateMobDropTables();

  return mobDropTables.flatMap((table) =>
    table.drops.map((drop) => ({
      mapName: table.mapName,
      subMapName: table.subMapName,
      mobName: table.mobName,
      itemName: drop.itemName,
      dropChance: drop.dropChance,
      minQuantity: drop.minQuantity,
      maxQuantity: drop.maxQuantity,
    })),
  );
}

function validateMobDropTables() {
  for (const table of mobDropTables) {
    if (table.orderNoSubmap < 1) {
      throw new Error(
        `Drop inválido para ${table.mobName}: ordemNoSubmapa deve ser >= 1.`,
      );
    }

    for (const drop of table.drops) {
      if (drop.dropChance < 0 || drop.dropChance > 100) {
        throw new Error(
          `Drop inválido para ${table.mobName}/${drop.itemName}: chance deve ficar entre 0 e 100.`,
        );
      }

      if (drop.minQuantity < 1) {
        throw new Error(
          `Drop inválido para ${table.mobName}/${drop.itemName}: minQuantity deve ser >= 1.`,
        );
      }

      if (drop.maxQuantity < drop.minQuantity) {
        throw new Error(
          `Drop inválido para ${table.mobName}/${drop.itemName}: maxQuantity deve ser >= minQuantity.`,
        );
      }
    }
  }
}

function getMobDropMobKey(data: MobDropSeedData) {
  return `${data.mapName ?? ''}::${data.mobName}`;
}

async function findMobForDrop(
  data: MobDropSeedData,
  mapsByName: Map<string, GameMap>,
): Promise<Mob | null> {
  const map = data.mapName ? mapsByName.get(data.mapName) : null;
  if (data.mapName && !map) return null;

  return prisma.mob.findFirst({
    where: {
      name: data.mobName,
      ...(map ? { mapId: map.id } : {}),
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
  const officialGatheringMaterialDefinitions = materialDefinitions.filter(
    (material) => material.isGatheringMaterial,
  );

  if (officialGatheringMaterialDefinitions.length === 0) {
    console.log(
      'Validação de gathering ignorada: seed de materiais está vazio para reconstrução da base de itens.',
    );
    return;
  }

  const expectedMaterialNames = new Set(
    officialGatheringMaterialDefinitions.map((material) => material.name),
  );

  if (
    expectedMaterialNames.size !== officialGatheringMaterialDefinitions.length
  ) {
    throw new Error(
      'Validação de gathering falhou: existem materiais duplicados no seed.',
    );
  }

  const totalSeeded = await prisma.item.count({
    where: {
      name: {
        in: [...expectedMaterialNames],
      },
      isGatheringMaterial: true,
    },
  });

  if (totalSeeded !== expectedMaterialNames.size) {
    throw new Error(
      `Validação de gathering falhou: esperado ${expectedMaterialNames.size} materiais oficiais do seed, encontrado ${totalSeeded}.`,
    );
  }

  const tierGroups = await prisma.item.groupBy({
    by: ['tier'],
    where: {
      name: {
        in: [...expectedMaterialNames],
      },
      isGatheringMaterial: true,
    },
    _count: {
      _all: true,
    },
  });

  const expectedTierCounts = new Map<number, number>();

  for (const materialDefinition of officialGatheringMaterialDefinitions) {
    expectedTierCounts.set(
      materialDefinition.tier,
      (expectedTierCounts.get(materialDefinition.tier) ?? 0) + 1,
    );
  }

  for (const [tier, expectedCount] of expectedTierCounts) {
    const actualCount =
      tierGroups.find((entry) => entry.tier === tier)?._count._all ?? 0;

    if (actualCount !== expectedCount) {
      throw new Error(
        `Validação de gathering falhou: tier ${tier} deveria ter ${expectedCount} materiais do seed, encontrado ${actualCount}.`,
      );
    }
  }

  const combinationGroups = await prisma.item.groupBy({
    by: ['tier', 'materialOrigin', 'materialSlot'],
    where: {
      name: {
        in: [...expectedMaterialNames],
      },
      isGatheringMaterial: true,
    },
    _count: {
      _all: true,
    },
  });

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

  const expectedCombinationCounts = new Map<string, number>();

  for (const materialDefinition of officialGatheringMaterialDefinitions) {
    const key = [
      materialDefinition.tier,
      materialDefinition.materialOrigin,
      materialDefinition.materialSlot,
    ].join('::');

    expectedCombinationCounts.set(
      key,
      (expectedCombinationCounts.get(key) ?? 0) + 1,
    );
  }

  for (const [key, expectedCount] of expectedCombinationCounts) {
    const [tier, origin, slot] = key.split('::');
    const actualCount =
      combinationGroups.find(
        (entry) =>
          entry.tier === Number(tier) &&
          entry.materialOrigin === origin &&
          entry.materialSlot === slot,
      )?._count._all ?? 0;

    if (actualCount !== expectedCount) {
      throw new Error(
        `Validação de gathering falhou: ${key} deveria ter ${expectedCount} materiais do seed, encontrado ${actualCount}.`,
      );
    }
  }

  const gatheringXpRows = await prisma.item.findMany({
    where: {
      name: {
        in: [...expectedMaterialNames],
      },
      isGatheringMaterial: true,
    },
    select: {
      name: true,
      tier: true,
      gatheringXpPerUnit: true,
    },
  });

  const invalidGatheringXp = gatheringXpRows.find(
    (item) =>
      item.gatheringXpPerUnit !== getGatheringXpPerUnitForTier(item.tier),
  );

  if (invalidGatheringXp) {
    throw new Error(
      `Validação de gathering falhou: ${invalidGatheringXp.name} deveria conceder ${getGatheringXpPerUnitForTier(invalidGatheringXp.tier)} XP por unidade, encontrado ${invalidGatheringXp.gatheringXpPerUnit}.`,
    );
  }

  console.log(
    `Validação de gathering concluída: ${expectedMaterialNames.size} materiais oficiais do seed conferidos.`,
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

  console.log(
    'Criando/atualizando itens seguros do seed, incluindo materiais dropáveis de mobs...',
  );

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

  for (const mobDropItemDefinition of mobDropItemDefinitions) {
    const item = await upsertMobDropMaterialItem(mobDropItemDefinition);
    itemsByName.set(item.name, item);
  }

  for (const consumableDefinition of consumableDefinitions) {
    const item = await upsertConsumableItem(consumableDefinition);
    itemsByName.set(item.name, item);
  }

  if (recipeDefinitions.length === 0) {
    console.log(
      'Seed de receitas vazio: nenhuma receita antiga será criada/atualizada.',
    );
  } else {
    console.log(
      `Criando/atualizando ${recipeDefinitions.length} receitas de crafting...`,
    );
  }

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

  console.log('Criando/atualizando Ameaças Globais e loot tables...');

  for (const worldBossDefinition of worldBossDefinitions) {
    const gameMap = getRequiredMap(mapsByName, worldBossDefinition.mapName);

    await upsertWorldBoss({
      data: worldBossDefinition,
      mapId: gameMap.id,
    });
  }

  console.log('Criando/atualizando incursões e loot tables...');

  for (const incursionDefinition of incursionDefinitions) {
    const gameMap = getRequiredMap(mapsByName, incursionDefinition.mapName);

    await upsertIncursion({
      data: incursionDefinition,
      mapId: gameMap.id,
    });
  }

  const mobDropDefinitions = flattenMobDropTables();
  const mobsByDropKey = new Map<string, Mob>();
  const skippedMobDropKeys = new Set<string>();

  for (const mobDropDefinition of mobDropDefinitions) {
    const key = getMobDropMobKey(mobDropDefinition);
    if (mobsByDropKey.has(key) || skippedMobDropKeys.has(key)) continue;

    const mob = await findMobForDrop(mobDropDefinition, mapsByName);
    if (mob) {
      mobsByDropKey.set(key, mob);
    } else {
      skippedMobDropKeys.add(key);
    }
  }

  const officialMobDropItemIds = mobDropItemDefinitions.map(
    (mobDropItemDefinition) =>
      getRequiredItem(itemsByName, mobDropItemDefinition.name).id,
  );

  if (officialMobDropItemIds.length > 0) {
    console.log(
      'Limpando drops antigos oficiais de mobs antes de recriar a matriz canonica...',
    );

    await prisma.mobDrop.deleteMany({
      where: {
        itemId: {
          in: officialMobDropItemIds,
        },
      },
    });
  }

  let createdOrUpdatedMobDrops = 0;

  for (const mobDropDefinition of mobDropDefinitions) {
    const mob = mobsByDropKey.get(getMobDropMobKey(mobDropDefinition));
    if (!mob) continue;

    const item = getRequiredItem(itemsByName, mobDropDefinition.itemName);

    await upsertMobDrop({
      data: mobDropDefinition,
      mobId: mob.id,
      itemId: item.id,
    });
    createdOrUpdatedMobDrops++;
  }

  if (skippedMobDropKeys.size > 0) {
    const skippedExamples = Array.from(skippedMobDropKeys).slice(0, 12);
    console.warn(
      `Drops ignorados para ${skippedMobDropKeys.size} mobs ainda não cadastrados: ${skippedExamples.join(', ')}`,
    );
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
      rarity: item.rarity,
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
      requiredGatheringLevel: item.requiredGatheringLevel ?? 1,
      gatheringXpPerUnit: item.isGatheringMaterial
        ? getGatheringXpPerUnitForTier(item.tier)
        : (item.gatheringXpPerUnit ?? 1),
      baseGatheringRatePerHour: item.baseGatheringRatePerHour ?? null,
    })),
    consumiveisRegistrados: consumableDefinitions.map((item) => ({
      name: item.name,
      tier: item.tier,
      rarity: item.rarity,
      tiers: `${item.minTier}-${item.maxTier}`,
      heal: `${item.healFlat} + ${item.healPercent}% do HP máximo`,
    })),
    receitasRegistradas: recipeDefinitions.length,
    encountersRegistrados: encounterDefinitions.length,
    itensDropaveisDeMobsRegistrados: mobDropItemDefinitions.length,
    dropsConfigurados: mobDropDefinitions.length,
    dropsRegistrados: createdOrUpdatedMobDrops,
    dropsIgnoradosPorMobAusente: skippedMobDropKeys.size,
    ameacasGlobaisRegistradas: worldBossDefinitions.length,
    incursionsRegistradas: incursionDefinitions.length,
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
