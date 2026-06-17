import {
  ActivityStatus,
  ItemSlot,
  MaterialOrigin,
  Prisma,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const shouldApply = process.argv.includes('--apply');

const EQUIPMENT_SLOTS: ItemSlot[] = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
];

const TARGET_ITEM_WHERE: Prisma.ItemWhereInput = {
  OR: [
    {
      isGatheringMaterial: true,
      NOT: {
        materialOrigin: MaterialOrigin.DROP_MOBS,
      },
    },
    {
      slot: {
        in: EQUIPMENT_SLOTS,
      },
      tier: {
        gt: 0,
      },
    },
  ],
};

async function collectTargetItemIds() {
  return prisma.item.findMany({
    where: TARGET_ITEM_WHERE,
    select: {
      id: true,
      name: true,
      slot: true,
      tier: true,
      isGatheringMaterial: true,
      materialOrigin: true,
    },
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
  });
}

async function main() {
  const targetItems = await collectTargetItemIds();
  const targetItemIds = targetItems.map((item) => item.id);

  const equipmentItems = targetItems.filter(
    (item) => EQUIPMENT_SLOTS.includes(item.slot) && item.tier > 0,
  );
  const gatheringItems = targetItems.filter((item) => item.isGatheringMaterial);

  const targetRecipeIds =
    targetItemIds.length === 0
      ? []
      : (
          await prisma.craftingRecipe.findMany({
            where: {
              OR: [
                { outputItemId: { in: targetItemIds } },
                { ingredients: { some: { itemId: { in: targetItemIds } } } },
              ],
            },
            select: { id: true },
          })
        ).map((recipe) => recipe.id);

  const counts = {
    targetItems: targetItems.length,
    equipmentItems: equipmentItems.length,
    gatheringItems: gatheringItems.length,
    targetRecipes: targetRecipeIds.length,
    mobDropItemsPreserved: await prisma.item.count({
      where: { materialOrigin: MaterialOrigin.DROP_MOBS },
    }),
    consumablesPreserved: await prisma.item.count({
      where: { slot: ItemSlot.CONSUMABLE },
    }),
  };

  console.log('Reset seletivo de equipamentos finais e materiais de gathering');
  console.table(counts);

  if (targetItems.length > 0) {
    console.log(
      'Amostra de itens que serao removidos:',
      targetItems.slice(0, 20).map((item) => item.name),
    );
  }

  if (!shouldApply) {
    console.log(
      'Modo simulacao: nenhum dado foi alterado. Execute com --apply para aplicar.',
    );
    return;
  }

  if (targetItemIds.length === 0) {
    console.log('Nenhum item alvo encontrado. Nada para limpar.');
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const activeGatheringSessions = await tx.gatheringSession.updateMany({
      where: {
        targetMaterialId: { in: targetItemIds },
        status: ActivityStatus.ACTIVE,
      },
      data: {
        status: ActivityStatus.STOPPED,
      },
    });

    const gatheringSessions = await tx.gatheringSession.deleteMany({
      where: {
        targetMaterialId: { in: targetItemIds },
      },
    });

    const activeCraftingSessions = await tx.craftingSession.updateMany({
      where: {
        OR: [
          { outputItemId: { in: targetItemIds } },
          { recipeId: { in: targetRecipeIds } },
        ],
        status: ActivityStatus.ACTIVE,
      },
      data: {
        status: ActivityStatus.STOPPED,
      },
    });

    const craftingSessions = await tx.craftingSession.deleteMany({
      where: {
        OR: [
          { outputItemId: { in: targetItemIds } },
          { recipeId: { in: targetRecipeIds } },
        ],
      },
    });

    const craftingIngredients = await tx.craftingIngredient.deleteMany({
      where: {
        OR: [
          { itemId: { in: targetItemIds } },
          { recipeId: { in: targetRecipeIds } },
        ],
      },
    });

    const craftingRecipes = await tx.craftingRecipe.deleteMany({
      where: {
        id: { in: targetRecipeIds },
      },
    });

    const inventoryItems = await tx.inventoryItem.deleteMany({
      where: {
        itemId: { in: targetItemIds },
      },
    });

    const bankItems = await tx.bankItem.deleteMany({
      where: {
        itemId: { in: targetItemIds },
      },
    });

    const autoCombatSessionLoots = await tx.autoCombatSessionLoot.deleteMany({
      where: {
        itemId: { in: targetItemIds },
      },
    });

    const equipmentRowsCleared = await tx.equipment.updateMany({
      where: {
        OR: [
          { mainHandId: { in: targetItemIds } },
          { offHandId: { in: targetItemIds } },
          { headId: { in: targetItemIds } },
          { armorId: { in: targetItemIds } },
          { pantsId: { in: targetItemIds } },
          { bootsId: { in: targetItemIds } },
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

    const incursionLootTables = await tx.incursionLootTable.deleteMany({
      where: {
        itemId: { in: targetItemIds },
      },
    });

    const incursionSessionRewards = await tx.incursionSessionReward.deleteMany({
      where: {
        itemId: { in: targetItemIds },
      },
    });

    const worldBossRewards = await tx.worldBossReward.deleteMany({
      where: {
        itemId: { in: targetItemIds },
      },
    });

    const worldBossGrantedRewards = await tx.worldBossGrantedReward.deleteMany({
      where: {
        itemId: { in: targetItemIds },
      },
    });

    const items = await tx.item.deleteMany({
      where: {
        id: { in: targetItemIds },
      },
    });

    return {
      activeGatheringSessionsCancelled: activeGatheringSessions.count,
      gatheringSessionsDeleted: gatheringSessions.count,
      activeCraftingSessionsCancelled: activeCraftingSessions.count,
      craftingSessionsDeleted: craftingSessions.count,
      craftingIngredientsDeleted: craftingIngredients.count,
      craftingRecipesDeleted: craftingRecipes.count,
      inventoryItemsDeleted: inventoryItems.count,
      bankItemsDeleted: bankItems.count,
      autoCombatSessionLootsDeleted: autoCombatSessionLoots.count,
      equipmentRowsCleared: equipmentRowsCleared.count,
      incursionLootTablesDeleted: incursionLootTables.count,
      incursionSessionRewardsDeleted: incursionSessionRewards.count,
      worldBossRewardsDeleted: worldBossRewards.count,
      worldBossGrantedRewardsDeleted: worldBossGrantedRewards.count,
      itemsDeleted: items.count,
    };
  });

  console.log('Reset aplicado com sucesso.');
  console.table(result);
}

main()
  .catch((error) => {
    console.error('Erro ao resetar catalogo de equipamentos/gathering:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
