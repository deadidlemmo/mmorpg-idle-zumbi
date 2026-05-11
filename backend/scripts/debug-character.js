require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listCharacters() {
  const characters = await prisma.character.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      name: true,
      level: true,
      xp: true,
      currentHp: true,
      maxHp: true,
      status: true,
      avatarKey: true,
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
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log(JSON.stringify(characters, null, 2));
}

async function debugCharacter(characterId) {
  const character = await prisma.character.findUnique({
    where: {
      id: characterId,
    },
    include: {
      class: true,

      map: true,

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

      inventoryItems: {
        include: {
          item: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },

      potionConfig: {
        include: {
          potionItem: true,
        },
      },

      autoCombatSessions: {
        orderBy: {
          startedAt: 'desc',
        },
        take: 5,
        include: {
          subMap: {
            include: {
              map: true,
            },
          },
          currentMob: true,
          loots: {
            include: {
              item: true,
            },
          },
          mobSummaries: {
            include: {
              mob: true,
            },
          },
        },
      },

      gatheringSessions: {
        orderBy: {
          startedAt: 'desc',
        },
        take: 5,
        include: {
          map: true,
          targetMaterial: true,
        },
      },
    },
  });

  if (!character) {
    console.error('Personagem não encontrado.');
    process.exit(1);
  }

  const simplified = {
    character: {
      id: character.id,
      name: character.name,
      level: character.level,
      xp: character.xp,
      currentHp: character.currentHp,
      maxHp: character.maxHp,
      status: character.status,
      avatarKey: character.avatarKey,
      classId: character.classId,
      mapId: character.mapId,
      deletedAt: character.deletedAt,
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
    },

    class: character.class,

    map: character.map,

    equipment: character.equipment
      ? {
          id: character.equipment.id,
          mainHand: character.equipment.mainHand,
          offHand: character.equipment.offHand,
          head: character.equipment.head,
          armor: character.equipment.armor,
          pants: character.equipment.pants,
          boots: character.equipment.boots,
        }
      : null,

    inventorySummary: {
      totalDifferentItems: character.inventoryItems.length,
      totalQuantity: character.inventoryItems.reduce((total, inventoryItem) => {
        return total + inventoryItem.quantity;
      }, 0),
    },

    inventoryItems: character.inventoryItems.map((inventoryItem) => ({
      id: inventoryItem.id,
      characterId: inventoryItem.characterId,
      itemId: inventoryItem.itemId,
      quantity: inventoryItem.quantity,
      type: inventoryItem.type,
      item: inventoryItem.item,
      createdAt: inventoryItem.createdAt,
      updatedAt: inventoryItem.updatedAt,
    })),

    potionConfig: character.potionConfig,

    latestAutoCombatSessions: character.autoCombatSessions.map((session) => ({
      id: session.id,
      status: session.status,
      characterId: session.characterId,
      subMapId: session.subMapId,

      startedAt: session.startedAt,
      endsAt: session.endsAt,
      lastProcessedAt: session.lastProcessedAt,
      finishedAt: session.finishedAt,

      durationSeconds: session.durationSeconds,
      roundDurationSeconds: session.roundDurationSeconds,

      totalCombatsResolved: session.totalCombatsResolved,
      totalRoundsResolved: session.totalRoundsResolved,
      totalXpGained: session.totalXpGained,

      currentMobId: session.currentMobId,
      currentMobHp: session.currentMobHp,
      currentMobMaxHp: session.currentMobMaxHp,
      currentRound: session.currentRound,
      currentCombatIndex: session.currentCombatIndex,

      subMap: session.subMap
        ? {
            id: session.subMap.id,
            name: session.subMap.name,
            tier: session.subMap.tier,
            minLevel: session.subMap.minLevel,
            maxLevel: session.subMap.maxLevel,
            map: session.subMap.map,
          }
        : null,

      currentMob: session.currentMob,

      loots: session.loots.map((loot) => ({
        id: loot.id,
        itemId: loot.itemId,
        quantity: loot.quantity,
        item: loot.item,
      })),

      mobSummaries: session.mobSummaries.map((summary) => ({
        id: summary.id,
        mobId: summary.mobId,
        kills: summary.kills,
        xpGained: summary.xpGained,
        mob: summary.mob,
      })),
    })),

    latestGatheringSessions: character.gatheringSessions,
  };

  console.log(JSON.stringify(simplified, null, 2));
}

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === '--list') {
    await listCharacters();
    return;
  }

  await debugCharacter(arg);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });