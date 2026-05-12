import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const shouldApply = process.argv.includes('--apply');

type CleanupCounts = {
  gatheringSessions: number;
  autoCombatSessionLoots: number;
  mobDrops: number;
  craftingIngredients: number;
  craftingRecipes: number;
  inventoryItems: number;
  equipmentRowsWithLinkedItems: number;
  potionConfigsWithLinkedItems: number;
  items: number;
};

async function countItemRelatedRecords(): Promise<CleanupCounts> {
  const [
    gatheringSessions,
    autoCombatSessionLoots,
    mobDrops,
    craftingIngredients,
    craftingRecipes,
    inventoryItems,
    equipmentRowsWithLinkedItems,
    potionConfigsWithLinkedItems,
    items,
  ] = await Promise.all([
    prisma.gatheringSession.count(),
    prisma.autoCombatSessionLoot.count(),
    prisma.mobDrop.count(),
    prisma.craftingIngredient.count(),
    prisma.craftingRecipe.count(),
    prisma.inventoryItem.count(),
    prisma.equipment.count({
      where: {
        OR: [
          { mainHandId: { not: null } },
          { offHandId: { not: null } },
          { headId: { not: null } },
          { armorId: { not: null } },
          { pantsId: { not: null } },
          { bootsId: { not: null } },
        ],
      },
    }),
    prisma.characterPotionConfig.count({
      where: {
        potionItemId: { not: null },
      },
    }),
    prisma.item.count(),
  ]);

  return {
    gatheringSessions,
    autoCombatSessionLoots,
    mobDrops,
    craftingIngredients,
    craftingRecipes,
    inventoryItems,
    equipmentRowsWithLinkedItems,
    potionConfigsWithLinkedItems,
    items,
  };
}

async function cleanupOldItems() {
  const before = await countItemRelatedRecords();

  console.log('Resumo dos registros relacionados a itens antigos:');
  console.table(before);

  if (!shouldApply) {
    console.log(
      'Modo simulação: nenhum dado foi apagado. Execute com --apply para limpar itens e vínculos antigos.',
    );
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const gatheringSessions = await tx.gatheringSession.deleteMany();
    const autoCombatSessionLoots = await tx.autoCombatSessionLoot.deleteMany();
    const mobDrops = await tx.mobDrop.deleteMany();
    const craftingIngredients = await tx.craftingIngredient.deleteMany();
    const craftingRecipes = await tx.craftingRecipe.deleteMany();
    const inventoryItems = await tx.inventoryItem.deleteMany();

    const equipmentRowsCleared = await tx.equipment.updateMany({
      where: {
        OR: [
          { mainHandId: { not: null } },
          { offHandId: { not: null } },
          { headId: { not: null } },
          { armorId: { not: null } },
          { pantsId: { not: null } },
          { bootsId: { not: null } },
        ],
      },
      data: {
        mainHandId: null,
        offHandId: null,
        headId: null,
        armorId: null,
        pantsId: null,
        bootsId: null,
      },
    });

    const potionConfigsCleared = await tx.characterPotionConfig.updateMany({
      where: {
        potionItemId: { not: null },
      },
      data: {
        potionItemId: null,
        enabled: false,
      },
    });

    const items = await tx.item.deleteMany();

    return {
      gatheringSessions: gatheringSessions.count,
      autoCombatSessionLoots: autoCombatSessionLoots.count,
      mobDrops: mobDrops.count,
      craftingIngredients: craftingIngredients.count,
      craftingRecipes: craftingRecipes.count,
      inventoryItems: inventoryItems.count,
      equipmentRowsCleared: equipmentRowsCleared.count,
      potionConfigsCleared: potionConfigsCleared.count,
      items: items.count,
    };
  });

  const after = await countItemRelatedRecords();

  console.log('Limpeza aplicada com sucesso. Registros afetados:');
  console.table(result);
  console.log('Estado após a limpeza:');
  console.table(after);
  console.log(
    'Usuários, personagens, classes, mapas, submapas e mobs foram preservados.',
  );
}

cleanupOldItems()
  .catch((error) => {
    console.error('Erro ao limpar itens antigos:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
