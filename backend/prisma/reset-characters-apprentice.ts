import {
  ActivityStatus,
  AutoCombatSessionStatus,
  CharacterStatus,
  CombatStatus,
  IncursionSessionStatus,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { calculateFullStats } from '../src/common/utils/stats.util';
import {
  STARTER_POTION_ITEM_NAME,
  STARTER_POTION_KIT_QUANTITY,
} from '../src/common/config/starter-kit.config';
import {
  AUTO_COMBAT_REST_DEFAULT_START_HP_PERCENT,
  AUTO_COMBAT_REST_DEFAULT_STOP_HP_PERCENT,
} from '../src/common/config/auto-combat.config';
import { starterEquipmentDefinitions } from './seed-data/items.seed-data';

const prisma = new PrismaClient();

const INITIAL_CHARACTER_GOLD = 250;
const INITIAL_CHARACTER_CASH = 0;

const EQUIPMENT_SLOTS = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;

const GATHERING_ORIGINS = [
  MaterialOrigin.DESMANCHE,
  MaterialOrigin.COLETA,
  MaterialOrigin.CONTENCAO,
  MaterialOrigin.ARSENAL,
  MaterialOrigin.PATRULHA,
  MaterialOrigin.TECNOVARREDURA,
] as const;

function getInventoryItemType(slot: ItemSlot) {
  return slot === ItemSlot.CONSUMABLE
    ? InventoryItemType.CONSUMABLE
    : slot === ItemSlot.MATERIAL
      ? InventoryItemType.MATERIAL
      : InventoryItemType.EQUIPMENT;
}

function getRequiredStarterItemBySlot(
  starterItems: Array<{
    id: string;
    name: string;
    slot: ItemSlot;
    strengthBonus: number;
    vitalityBonus: number;
    agilityBonus: number;
    precisionBonus: number;
    techniqueBonus: number;
    willpowerBonus: number;
  }>,
  slot: ItemSlot,
  className: string,
) {
  const item = starterItems.find((starterItem) => starterItem.slot === slot);

  if (!item) {
    throw new Error(
      `Item aprendiz Tier 0 não encontrado para ${className} no slot ${slot}.`,
    );
  }

  return item;
}

async function ensureStarterItems() {
  if (starterEquipmentDefinitions.length === 0) {
    throw new Error(
      'starterEquipmentDefinitions está vazio. Cadastre os itens aprendizes antes de resetar personagens.',
    );
  }

  const [classes, maps] = await Promise.all([
    prisma.gameClass.findMany(),
    prisma.gameMap.findMany(),
  ]);

  const classesByName = new Map(classes.map((gameClass) => [gameClass.name, gameClass]));
  const mapsByName = new Map(maps.map((map) => [map.name, map]));

  for (const definition of starterEquipmentDefinitions) {
    const gameClass = classesByName.get(definition.className);
    const gameMap = mapsByName.get(definition.mapName);

    if (!gameClass) {
      throw new Error(`Classe não encontrada para item aprendiz: ${definition.className}`);
    }

    if (!gameMap) {
      throw new Error(`Mapa não encontrado para item aprendiz: ${definition.mapName}`);
    }

    const itemData = {
      name: definition.name,
      description: definition.description,
      tier: definition.tier,
      rarity: definition.rarity,
      slot: definition.slot,
      family: definition.family,
      classId: gameClass.id,
      mapId: gameMap.id,
      materialOrigin: null,
      materialSlot: null,
      isGatheringMaterial: false,
      requiredGatheringLevel: 1,
      gatheringXpPerUnit: 0,
      baseGatheringRatePerHour: null,
      strengthBonus: definition.strengthBonus ?? 0,
      vitalityBonus: definition.vitalityBonus ?? 0,
      agilityBonus: definition.agilityBonus ?? 0,
      precisionBonus: definition.precisionBonus ?? 0,
      techniqueBonus: definition.techniqueBonus ?? 0,
      willpowerBonus: definition.willpowerBonus ?? 0,
      healFlat: 0,
      healPercent: 0,
      usableInCombat: false,
      usableOutOfCombat: false,
      minTier: null,
      maxTier: null,
      isCraftable: false,
    } satisfies Prisma.ItemUncheckedCreateInput;

    await prisma.item.upsert({
      where: {
        name: definition.name,
      },
      update: itemData,
      create: itemData,
    });
  }
}

async function resetCharacters() {
  const initialMap = await prisma.gameMap.findFirst({
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
    throw new Error('Mapa inicial Tier 1 não encontrado.');
  }

  const characters = await prisma.character.findMany({
    where: {
      deletedAt: null,
    },
    include: {
      class: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const starterPotion = await prisma.item.findUnique({
    where: {
      name: STARTER_POTION_ITEM_NAME,
    },
  });

  if (!starterPotion) {
    throw new Error(
      `Poção inicial "${STARTER_POTION_ITEM_NAME}" não encontrada. Rode npm run prisma:seed antes de resetar personagens.`,
    );
  }

  let resetCount = 0;

  for (const character of characters) {
    await prisma.$transaction(async (tx) => {
      const starterItems = await tx.item.findMany({
        where: {
          classId: character.classId,
          mapId: initialMap.id,
          tier: 0,
          isCraftable: false,
          slot: {
            in: [...EQUIPMENT_SLOTS],
          },
        },
      });

      const starterEquipment = {
        mainHand: getRequiredStarterItemBySlot(
          starterItems,
          ItemSlot.MAIN_HAND,
          character.class.name,
        ),
        offHand: getRequiredStarterItemBySlot(
          starterItems,
          ItemSlot.OFF_HAND,
          character.class.name,
        ),
        head: getRequiredStarterItemBySlot(
          starterItems,
          ItemSlot.HEAD,
          character.class.name,
        ),
        armor: getRequiredStarterItemBySlot(
          starterItems,
          ItemSlot.ARMOR,
          character.class.name,
        ),
        pants: getRequiredStarterItemBySlot(
          starterItems,
          ItemSlot.PANTS,
          character.class.name,
        ),
        boots: getRequiredStarterItemBySlot(
          starterItems,
          ItemSlot.BOOTS,
          character.class.name,
        ),
      };

      const equipmentItems = Object.values(starterEquipment);
      const stats = calculateFullStats(character.class, equipmentItems, 1);
      const maxHp = stats.derivedCombatStats.maxHp;
      const now = new Date();

      await Promise.all([
        tx.combat.updateMany({
          where: {
            characterId: character.id,
            status: CombatStatus.IN_PROGRESS,
          },
          data: {
            status: CombatStatus.CANCELLED,
            finishedAt: now,
          },
        }),
        tx.autoCombatSession.updateMany({
          where: {
            characterId: character.id,
            status: AutoCombatSessionStatus.ACTIVE,
          },
          data: {
            status: AutoCombatSessionStatus.STOPPED,
            finishedAt: now,
          },
        }),
        tx.gatheringSession.updateMany({
          where: {
            characterId: character.id,
            status: ActivityStatus.ACTIVE,
          },
          data: {
            status: ActivityStatus.STOPPED,
            lastResolvedAt: now,
          },
        }),
        tx.craftingSession.updateMany({
          where: {
            characterId: character.id,
            status: ActivityStatus.ACTIVE,
          },
          data: {
            status: ActivityStatus.STOPPED,
          },
        }),
        tx.characterIncursionSession.updateMany({
          where: {
            characterId: character.id,
            status: IncursionSessionStatus.ACTIVE,
          },
          data: {
            status: IncursionSessionStatus.CANCELLED,
            completedAt: now,
          },
        }),
        tx.worldBossParticipant.updateMany({
          where: {
            characterId: character.id,
            leftAt: null,
          },
          data: {
            leftAt: now,
          },
        }),
      ]);

      await Promise.all([
        tx.inventoryItem.deleteMany({
          where: {
            characterId: character.id,
          },
        }),
        tx.bankItem.deleteMany({
          where: {
            characterId: character.id,
          },
        }),
      ]);

      await tx.equipment.upsert({
        where: {
          characterId: character.id,
        },
        update: {
          mainHandId: starterEquipment.mainHand.id,
          offHandId: starterEquipment.offHand.id,
          headId: starterEquipment.head.id,
          armorId: starterEquipment.armor.id,
          pantsId: starterEquipment.pants.id,
          bootsId: starterEquipment.boots.id,
        },
        create: {
          characterId: character.id,
          mainHandId: starterEquipment.mainHand.id,
          offHandId: starterEquipment.offHand.id,
          headId: starterEquipment.head.id,
          armorId: starterEquipment.armor.id,
          pantsId: starterEquipment.pants.id,
          bootsId: starterEquipment.boots.id,
        },
      });

      await tx.inventoryItem.createMany({
        data: [
          ...equipmentItems.map((item) => ({
            characterId: character.id,
            itemId: item.id,
            quantity: 1,
            type: getInventoryItemType(item.slot),
          })),
          {
            characterId: character.id,
            itemId: starterPotion.id,
            quantity: STARTER_POTION_KIT_QUANTITY,
            type: InventoryItemType.CONSUMABLE,
          },
        ],
      });

      await tx.characterGatheringSkill.deleteMany({
        where: {
          characterId: character.id,
        },
      });

      await tx.characterGatheringSkill.createMany({
        data: GATHERING_ORIGINS.map((origin) => ({
          characterId: character.id,
          origin,
          level: 1,
          xp: 0,
          totalXp: 0,
        })),
      });

      await tx.characterCraftingSkill.upsert({
        where: {
          characterId: character.id,
        },
        update: {
          level: 1,
          xp: 0,
          totalXp: 0,
        },
        create: {
          characterId: character.id,
          level: 1,
          xp: 0,
          totalXp: 0,
        },
      });

      await tx.characterPotionConfig.upsert({
        where: {
          characterId: character.id,
        },
        update: {
          enabled: true,
          potionItemId: starterPotion.id,
          hpThresholdPercent: AUTO_COMBAT_REST_DEFAULT_START_HP_PERCENT,
          useInManualCombat: true,
          useInAutoCombat: true,
          autoRestEnabled: true,
          autoRestStartHpPercent: AUTO_COMBAT_REST_DEFAULT_START_HP_PERCENT,
          autoRestStopHpPercent: AUTO_COMBAT_REST_DEFAULT_STOP_HP_PERCENT,
        },
        create: {
          characterId: character.id,
          enabled: true,
          potionItemId: starterPotion.id,
          hpThresholdPercent: AUTO_COMBAT_REST_DEFAULT_START_HP_PERCENT,
          useInManualCombat: true,
          useInAutoCombat: true,
          autoRestEnabled: true,
          autoRestStartHpPercent: AUTO_COMBAT_REST_DEFAULT_START_HP_PERCENT,
          autoRestStopHpPercent: AUTO_COMBAT_REST_DEFAULT_STOP_HP_PERCENT,
        },
      });

      await tx.character.update({
        where: {
          id: character.id,
        },
        data: {
          status: CharacterStatus.ACTIVE,
          level: 1,
          xp: 0,
          gold: INITIAL_CHARACTER_GOLD,
          cash: INITIAL_CHARACTER_CASH,
          currentHp: maxHp,
          maxHp,
          mapId: initialMap.id,
          deletedAt: null,
        },
      });
    });

    resetCount += 1;
    console.log(
      `Personagem resetado: ${character.name} (${character.class.name})`,
    );
  }

  return resetCount;
}

async function main() {
  console.log('Garantindo itens aprendizes Tier 0...');
  await ensureStarterItems();

  console.log('Resetando personagens existentes para o set aprendiz...');
  const resetCount = await resetCharacters();

  console.log(
    `Reset concluído. ${resetCount} personagem(ns) ativo(s) receberam o set aprendiz Tier 0.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
