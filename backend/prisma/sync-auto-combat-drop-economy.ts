import { Prisma, PrismaClient } from '@prisma/client';
import { mobDropTables } from './seed-data/mob-drops.seed-data';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const TARGET_TIERS = new Set([2, 4, 5]);

type DropEconomyChange = {
  mobDropId: string;
  tier: number;
  mobName: string;
  itemName: string;
  current: {
    dropChance: number;
    minQuantity: number;
    maxQuantity: number;
  };
  next: {
    dropChance: number;
    minQuantity: number;
    maxQuantity: number;
  };
};

async function buildChangePlan() {
  const changes: DropEconomyChange[] = [];
  const targetTables = mobDropTables.filter((table) =>
    TARGET_TIERS.has(table.tier),
  );

  for (const table of targetTables) {
    const mob = await prisma.mob.findFirst({
      where: {
        name: table.mobName,
        tier: table.tier,
        map: { name: table.mapName },
        subMapEncounters: {
          some: {
            subMap: {
              name: table.subMapName,
              map: { name: table.mapName },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!mob) {
      throw new Error(`Mob canonico nao encontrado: ${table.mobName}.`);
    }

    for (const drop of table.drops) {
      if (!Number.isInteger(drop.dropChance)) {
        throw new Error(
          `Chance nao inteira em ${table.mobName}/${drop.itemName}.`,
        );
      }

      const item = await prisma.item.findFirst({
        where: { name: drop.itemName },
        select: { id: true },
      });

      if (!item) {
        throw new Error(`Item canonico nao encontrado: ${drop.itemName}.`);
      }

      const current = await prisma.mobDrop.findUnique({
        where: {
          mobId_itemId: {
            mobId: mob.id,
            itemId: item.id,
          },
        },
        select: {
          id: true,
          dropChance: true,
          minQuantity: true,
          maxQuantity: true,
        },
      });

      if (!current) {
        throw new Error(
          `Drop canonico ausente: ${table.mobName}/${drop.itemName}. Execute o seed completo em ambiente controlado.`,
        );
      }

      if (
        current.dropChance === drop.dropChance &&
        current.minQuantity === drop.minQuantity &&
        current.maxQuantity === drop.maxQuantity
      ) {
        continue;
      }

      changes.push({
        mobDropId: current.id,
        tier: table.tier,
        mobName: table.mobName,
        itemName: drop.itemName,
        current: {
          dropChance: current.dropChance,
          minQuantity: current.minQuantity,
          maxQuantity: current.maxQuantity,
        },
        next: {
          dropChance: drop.dropChance,
          minQuantity: drop.minQuantity,
          maxQuantity: drop.maxQuantity,
        },
      });
    }
  }

  return { targetTables, changes };
}

async function main() {
  const { targetTables, changes } = await buildChangePlan();

  console.log('Sincronizacao economica de drops do autocombate T2/T4/T5');
  console.table({
    tabelasCanonicas: targetTables.length,
    dropsComAlteracao: changes.length,
    modo: shouldApply ? 'APLICAR' : 'SIMULACAO',
  });

  if (changes.length > 0) {
    console.table(
      changes.map((change) => ({
        tier: `T${change.tier}`,
        mob: change.mobName,
        item: change.itemName,
        atual: `${change.current.dropChance}% ${change.current.minQuantity}-${change.current.maxQuantity}`,
        novo: `${change.next.dropChance}% ${change.next.minQuantity}-${change.next.maxQuantity}`,
      })),
    );
  }

  if (!shouldApply) {
    console.log(
      'Modo simulacao: nenhum dado foi alterado. Execute com --apply para confirmar.',
    );
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const change of changes) {
        await tx.mobDrop.update({
          where: { id: change.mobDropId },
          data: change.next,
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.log(`${changes.length} drops atualizados em uma unica transacao.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
