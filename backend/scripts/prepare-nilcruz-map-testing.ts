import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import {
  ActivityStatus,
  AutoCombatSessionStatus,
  CharacterStatus,
  InventoryItemType,
  ItemSlot,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { getTotalXpRequiredForLevel } from '../src/common/utils/level.util';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
} from '../src/common/utils/stats.util';
import { AutoCombatService } from '../src/modules/auto-combat/auto-combat.service';

const CHARACTER_ID = 'd0d947d7-395b-48b9-b817-c318e186606b';
const OWNER_ID = 'e4b487c7-3a37-4603-bf01-47f8f2828222';
const LEVEL = 50;
type EquipmentField =
  | 'mainHandId'
  | 'offHandId'
  | 'headId'
  | 'armorId'
  | 'pantsId'
  | 'bootsId';
const SET: Array<{ field: EquipmentField; slot: ItemSlot; name: string }> = [
  {
    field: 'mainHandId',
    slot: ItemSlot.MAIN_HAND,
    name: 'Maça de Grade de Quarentena +3',
  },
  {
    field: 'offHandId',
    slot: ItemSlot.OFF_HAND,
    name: 'Escudo de Barreira de Quarentena +3',
  },
  { field: 'headId', slot: ItemSlot.HEAD, name: 'Elmo de Câmara Selada +3' },
  {
    field: 'armorId',
    slot: ItemSlot.ARMOR,
    name: 'Armadura de Barreira Selada +3',
  },
  {
    field: 'pantsId',
    slot: ItemSlot.PANTS,
    name: 'Grevas de Câmara Selada +3',
  },
  {
    field: 'bootsId',
    slot: ItemSlot.BOOTS,
    name: 'Botas de Quarentena Selada +3',
  },
];

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function requireRecentBackup() {
  const status = JSON.parse(
    await readFile(resolve('backups/status.json'), 'utf8'),
  ) as {
    backup?: {
      status?: string;
      file?: string;
      createdAt?: string;
      sha256?: string;
    };
    offsite?: { status?: string; objectKey?: string; sha256?: string };
  };
  const backup = status.backup;
  if (
    backup?.status !== 'success' ||
    !backup.createdAt ||
    Date.now() - Date.parse(backup.createdAt) > 30 * 60 * 1000 ||
    status.offsite?.status !== 'success' ||
    status.offsite.sha256 !== backup.sha256 ||
    !status.offsite.objectKey?.endsWith(backup.file ?? '\0')
  ) {
    throw new Error(
      'Backup local e externo recente nao confirmado; operacao cancelada.',
    );
  }
}

async function prepare(tx: Prisma.TransactionClient, shouldApply: boolean) {
  if (shouldApply) {
    await tx.$queryRaw`SELECT id FROM characters WHERE id = ${CHARACTER_ID} FOR UPDATE`;
  }
  const character = await tx.character.findUnique({
    where: { id: CHARACTER_ID },
    include: {
      user: true,
      class: true,
      gatheringSkills: true,
      equipment: true,
    },
  });
  if (
    !character ||
    character.userId !== OWNER_ID ||
    character.name !== 'Nilcruz' ||
    character.class.name !== 'Lutador' ||
    character.user.role !== UserRole.ADMIN ||
    character.deletedAt
  ) {
    throw new Error(
      'Identidade do Nilcruz Lutador administrador nao corresponde.',
    );
  }
  const [activeCombat, activeGathering, activeCrafting] = await Promise.all([
    tx.autoCombatSession.count({
      where: {
        characterId: CHARACTER_ID,
        status: AutoCombatSessionStatus.ACTIVE,
      },
    }),
    tx.gatheringSession.count({
      where: { characterId: CHARACTER_ID, status: ActivityStatus.ACTIVE },
    }),
    tx.craftingSession.count({
      where: { characterId: CHARACTER_ID, status: ActivityStatus.ACTIVE },
    }),
  ]);
  if (shouldApply && (activeCombat || activeGathering || activeCrafting)) {
    throw new Error(
      'Nilcruz possui atividade ativa; encerre-a antes de trocar o set.',
    );
  }
  const items = await tx.item.findMany({
    where: { name: { in: SET.map((entry) => entry.name) } },
  });
  const selected = SET.map((entry) => {
    const item = items.find((candidate) => candidate.name === entry.name);
    if (
      !item ||
      item.classId !== character.classId ||
      item.slot !== entry.slot ||
      item.tier !== 5 ||
      item.enhancementLevel !== 3
    ) {
      throw new Error(
        `Item T5 +3 de Lutador ausente ou invalido: ${entry.name}`,
      );
    }
    return { ...entry, item };
  });
  const maxHp = calculateFullStats(
    character.class,
    selected.map(({ item }) => item),
    LEVEL,
    calculateGatheringPrimaryBonus(character.gatheringSkills),
  ).derivedCombatStats.maxHp;
  const xp = Math.max(character.xp, getTotalXpRequiredForLevel(LEVEL));
  const equipment = character.equipment;
  console.log(
    JSON.stringify(
      {
        characterId: CHARACTER_ID,
        before: {
          level: character.level,
          xp: character.xp,
          hp: character.currentHp,
          status: character.status,
        },
        after: {
          level: LEVEL,
          xp,
          hp: maxHp,
          status: CharacterStatus.ACTIVE,
          excludeFromRankings: true,
        },
        equipment: selected.map(({ field, item }) => ({
          slot: field,
          item: item.name,
        })),
        activeActivities: {
          combat: activeCombat,
          gathering: activeGathering,
          crafting: activeCrafting,
        },
        mode: shouldApply ? 'apply' : 'dry-run',
      },
      null,
      2,
    ),
  );
  if (!shouldApply) return;

  for (const { field, item } of selected) {
    const oldItemId = equipment?.[field];
    if (typeof oldItemId === 'string' && oldItemId !== item.id) {
      await tx.inventoryItem.upsert({
        where: {
          characterId_itemId: { characterId: CHARACTER_ID, itemId: oldItemId },
        },
        create: {
          characterId: CHARACTER_ID,
          itemId: oldItemId,
          type: InventoryItemType.EQUIPMENT,
          quantity: 1,
        },
        update: { quantity: { increment: 1 } },
      });
    }
  }
  const equipmentData = Object.fromEntries(
    selected.map(({ field, item }) => [field, item.id]),
  );
  await tx.equipment.upsert({
    where: { characterId: CHARACTER_ID },
    create: { characterId: CHARACTER_ID, ...equipmentData },
    update: equipmentData,
  });
  await tx.character.update({
    where: { id: CHARACTER_ID },
    data: {
      level: LEVEL,
      xp,
      maxHp,
      currentHp: maxHp,
      status: CharacterStatus.ACTIVE,
      infirmaryStartedAt: null,
      infirmaryEndsAt: null,
    },
  });
  await tx.$executeRaw`UPDATE characters SET "excludeFromRankings" = true WHERE id = ${CHARACTER_ID}`;
}

async function main() {
  if (apply) {
    await requireRecentBackup();
    const character = await prisma.character.findUnique({
      where: { id: CHARACTER_ID },
      select: {
        userId: true,
        name: true,
        deletedAt: true,
        class: { select: { name: true } },
        user: { select: { role: true } },
      },
    });
    if (
      character?.userId !== OWNER_ID ||
      character.name !== 'Nilcruz' ||
      character.class.name !== 'Lutador' ||
      character.user.role !== UserRole.ADMIN ||
      character.deletedAt
    ) {
      throw new Error(
        'Identidade do Nilcruz Lutador administrador nao corresponde.',
      );
    }
    const activeCombat = await prisma.autoCombatSession.count({
      where: {
        characterId: CHARACTER_ID,
        status: AutoCombatSessionStatus.ACTIVE,
      },
    });
    if (activeCombat) {
      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error'],
      });
      try {
        await app.get(AutoCombatService).stop(OWNER_ID, CHARACTER_ID);
      } finally {
        await app.close();
      }
    }
    await prisma.$transaction((tx) => prepare(tx, true), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15_000,
    });
  } else {
    await prepare(prisma, false);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
