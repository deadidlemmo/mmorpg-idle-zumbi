import { CraftIngredientRole, ItemSlot, MaterialOrigin } from '@prisma/client';
import {
  equipmentDefinitions,
  materialDefinitions,
} from '../../../prisma/seed-data/items.seed-data';
import { mobDropItemDefinitions } from '../../../prisma/seed-data/mob-drops.seed-data';
import { recipeDefinitions } from '../../../prisma/seed-data/recipes.seed-data';

const LAUNCH_CLASSES = ['Lutador', 'Assassino', 'Atirador', 'Médico'];
const LAUNCH_TIERS = [1, 2, 3, 4, 5];
const EQUIPMENT_SLOT_COUNTS = {
  [ItemSlot.MAIN_HAND]: 2,
  [ItemSlot.OFF_HAND]: 1,
  [ItemSlot.HEAD]: 1,
  [ItemSlot.ARMOR]: 1,
  [ItemSlot.PANTS]: 1,
  [ItemSlot.BOOTS]: 1,
};
const STAT_BUDGET_BY_SLOT = {
  [ItemSlot.MAIN_HAND]: 6,
  [ItemSlot.OFF_HAND]: 5,
  [ItemSlot.HEAD]: 4,
  [ItemSlot.ARMOR]: 6,
  [ItemSlot.PANTS]: 5,
  [ItemSlot.BOOTS]: 4,
};
const GATHERING_ORIGINS = [
  MaterialOrigin.DESMANCHE,
  MaterialOrigin.COLETA,
  MaterialOrigin.CONTENCAO,
  MaterialOrigin.ARSENAL,
  MaterialOrigin.PATRULHA,
  MaterialOrigin.TECNOVARREDURA,
];

describe('catálogo de lançamento T1-T5', () => {
  it('cobre as quatro classes, cinco tiers e sete famílias por classe', () => {
    expect(equipmentDefinitions).toHaveLength(140);
    expect(new Set(equipmentDefinitions.map((item) => item.name)).size).toBe(
      140,
    );

    for (const className of LAUNCH_CLASSES) {
      for (const tier of LAUNCH_TIERS) {
        const items = equipmentDefinitions.filter(
          (item) => item.className === className && item.tier === tier,
        );

        expect(items).toHaveLength(7);

        for (const [slot, expectedCount] of Object.entries(
          EQUIPMENT_SLOT_COUNTS,
        )) {
          expect(items.filter((item) => item.slot === slot)).toHaveLength(
            expectedCount,
          );
        }
      }
    }
  });

  it('aplica o orçamento de atributos balanceado por slot e tier', () => {
    for (const item of equipmentDefinitions) {
      const statTotal =
        (item.strengthBonus ?? 0) +
        (item.vitalityBonus ?? 0) +
        (item.agilityBonus ?? 0) +
        (item.precisionBonus ?? 0) +
        (item.techniqueBonus ?? 0) +
        (item.willpowerBonus ?? 0);
      const baseBudget = STAT_BUDGET_BY_SLOT[item.slot] * item.tier;
      const expectedBudget =
        item.tier === 1 ? Math.round(baseBudget * 1.25) : baseBudget;

      expect(statTotal).toBe(expectedBudget);
    }
  });

  it('fornece uma receita válida para cada equipamento', () => {
    const equipmentNames = new Set(
      equipmentDefinitions.map((item) => item.name),
    );
    const materialNames = new Set([
      ...materialDefinitions.map((item) => item.name),
      ...mobDropItemDefinitions.map((item) => item.name),
    ]);

    expect(recipeDefinitions).toHaveLength(equipmentDefinitions.length);
    expect(
      new Set(recipeDefinitions.map((item) => item.outputItemName)),
    ).toEqual(equipmentNames);

    for (const recipe of recipeDefinitions) {
      expect(recipe.ingredients).toHaveLength(4);
      expect(
        recipe.ingredients.filter(
          (ingredient) =>
            ingredient.role === CraftIngredientRole.MAIN_COMPONENT,
        ),
      ).toHaveLength(1);
      expect(
        recipe.ingredients.filter(
          (ingredient) =>
            ingredient.role === CraftIngredientRole.SHARED_MATERIAL,
        ),
      ).toHaveLength(1);
      expect(
        recipe.ingredients.filter(
          (ingredient) => ingredient.role === CraftIngredientRole.RARE_MOB_DROP,
        ),
      ).toHaveLength(2);
      expect(
        recipe.ingredients.every((ingredient) =>
          materialNames.has(ingredient.itemName),
        ),
      ).toBe(true);
    }
  });

  it('mantém a primeira receita rápida o bastante para apresentar o loop', () => {
    const tierOneRecipes = recipeDefinitions.filter(
      (recipe) => recipe.tier === 1,
    );

    for (const recipe of tierOneRecipes) {
      const main = recipe.ingredients.find(
        (ingredient) => ingredient.role === CraftIngredientRole.MAIN_COMPONENT,
      );
      const secondary = recipe.ingredients.find(
        (ingredient) => ingredient.role === CraftIngredientRole.SHARED_MATERIAL,
      );
      const mobDrops = recipe.ingredients
        .filter(
          (ingredient) => ingredient.role === CraftIngredientRole.RARE_MOB_DROP,
        )
        .map((ingredient) => ingredient.quantity)
        .sort((left, right) => left - right);

      expect(main?.quantity).toBe(20);
      expect(secondary?.quantity).toBe(10);
      expect(mobDrops).toEqual([2, 4]);
      expect(
        recipe.ingredients.reduce(
          (total, ingredient) => total + ingredient.quantity,
          0,
        ),
      ).toBe(36);
    }
  });

  it('usa todos os materiais T1-T5 e distribui a demanda igualmente', () => {
    const usedNames = new Set(
      recipeDefinitions.flatMap((recipe) =>
        recipe.ingredients.map((ingredient) => ingredient.itemName),
      ),
    );
    const launchMaterials = materialDefinitions.filter((material) =>
      LAUNCH_TIERS.includes(material.tier),
    );
    const demandByOrigin = Object.fromEntries(
      GATHERING_ORIGINS.map((origin) => [origin, 0]),
    ) as Record<MaterialOrigin, number>;

    expect(launchMaterials).toHaveLength(60);
    expect(
      launchMaterials.every((material) => usedNames.has(material.name)),
    ).toBe(true);

    for (const ingredient of recipeDefinitions.flatMap(
      (recipe) => recipe.ingredients,
    )) {
      if (ingredient.origin !== MaterialOrigin.DROP_MOBS) {
        demandByOrigin[ingredient.origin] += ingredient.quantity;
      }
    }

    expect(Object.values(demandByOrigin)).toEqual([
      2660, 2660, 2660, 2660, 2660, 2660,
    ]);
  });

  it('mantém duas variantes distintas de coleta em cada origem e tier', () => {
    for (const tier of LAUNCH_TIERS) {
      for (const origin of GATHERING_ORIGINS) {
        const variants = materialDefinitions
          .filter(
            (material) =>
              material.tier === tier && material.materialOrigin === origin,
          )
          .sort(
            (left, right) =>
              (left.requiredGatheringLevel ?? 1) -
              (right.requiredGatheringLevel ?? 1),
          );

        expect(variants).toHaveLength(2);
        expect(variants[1].gatheringXpPerUnit).toBeGreaterThan(
          variants[0].gatheringXpPerUnit ?? 0,
        );
        expect(variants[1].baseGatheringRatePerHour).toBeLessThan(
          variants[0].baseGatheringRatePerHour ?? 0,
        );
      }
    }
  });
});
