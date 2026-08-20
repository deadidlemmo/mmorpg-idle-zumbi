import { CraftIngredientRole, ItemSlot, MaterialOrigin } from '@prisma/client';
import type {
  CraftingIngredientSeedData,
  CraftingRecipeSeedData,
  EquipmentSeedData,
} from '../seed-types';
import { equipmentDefinitions, materialDefinitions } from './items.seed-data';
import { getRecipeQuantityPolicyForTier } from './recipe-balance-overrides.seed-data';

const LAUNCH_TIERS = new Set([1, 2, 3, 4, 5]);

const CLASS_GATHERING_AFFINITIES: Record<
  string,
  readonly [MaterialOrigin, MaterialOrigin, MaterialOrigin]
> = {
  Lutador: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
  Assassino: [
    MaterialOrigin.ARSENAL,
    MaterialOrigin.PATRULHA,
    MaterialOrigin.TECNOVARREDURA,
  ],
  Médico: [
    MaterialOrigin.TECNOVARREDURA,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
  Atirador: [
    MaterialOrigin.ARSENAL,
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.PATRULHA,
  ],
};

// Para sete itens de uma classe/tier, esta matriz deixa cada afinidade com
// demanda ponderada idêntica: 7 unidades de quantidade-base por origem.
const GATHERING_AFFINITY_PAIR_PATTERN = [
  [0, 1],
  [0, 1],
  [0, 2],
  [1, 2],
  [1, 2],
  [2, 0],
  [2, 1],
] as const;

const BIOMATERIAL_FAMILY_BY_SLOT: Record<ItemSlot, string> = {
  [ItemSlot.MAIN_HAND]: 'Biomaterial Cortante',
  [ItemSlot.OFF_HAND]: 'Biomaterial Reativo',
  [ItemSlot.HEAD]: 'Biomaterial Craniano',
  [ItemSlot.ARMOR]: 'Biomaterial Torácico',
  [ItemSlot.PANTS]: 'Biomaterial Articular',
  [ItemSlot.BOOTS]: 'Biomaterial de Mobilidade',
  [ItemSlot.MATERIAL]: 'Biomaterial Reativo',
  [ItemSlot.CONSUMABLE]: 'Biomaterial Reativo',
};

const DROP_BAND_BY_TIER: Record<
  number,
  { suffix: string; residueName: string }
> = {
  1: { suffix: 'Comum', residueName: 'Resíduo Infecto Pálido' },
  2: { suffix: 'Comum', residueName: 'Resíduo Infecto Pálido' },
  3: { suffix: 'Incomum', residueName: 'Resíduo Infecto Amarelado' },
  4: { suffix: 'Incomum', residueName: 'Resíduo Infecto Amarelado' },
  5: { suffix: 'Raro', residueName: 'Resíduo Infecto Tóxico' },
};

function getGatheringMaterial(params: {
  tier: number;
  origin: MaterialOrigin;
  usageIndex: number;
}) {
  const candidates = materialDefinitions.filter(
    (material) =>
      material.tier === params.tier &&
      material.materialOrigin === params.origin &&
      material.isGatheringMaterial,
  );

  if (candidates.length !== 2) {
    throw new Error(
      `Esperados dois materiais de ${params.origin} no Tier ${params.tier}; encontrados ${candidates.length}.`,
    );
  }

  return candidates[params.usageIndex % candidates.length];
}

function createMobDropIngredients(
  equipment: EquipmentSeedData,
): [CraftingIngredientSeedData, CraftingIngredientSeedData] {
  const quantityPolicy = getRecipeQuantityPolicyForTier(equipment.tier);
  const dropBand = DROP_BAND_BY_TIER[equipment.tier];

  if (!dropBand) {
    throw new Error(`Faixa de drop ausente para o Tier ${equipment.tier}.`);
  }

  return [
    {
      itemName: `${BIOMATERIAL_FAMILY_BY_SLOT[equipment.slot]} ${dropBand.suffix}`,
      quantity: quantityPolicy.biomaterialDropQuantity,
      role: CraftIngredientRole.RARE_MOB_DROP,
      origin: MaterialOrigin.DROP_MOBS,
    },
    {
      itemName: dropBand.residueName,
      quantity: quantityPolicy.residueDropQuantity,
      role: CraftIngredientRole.RARE_MOB_DROP,
      origin: MaterialOrigin.DROP_MOBS,
    },
  ];
}

function createLaunchRecipeDefinitions(): CraftingRecipeSeedData[] {
  const materialUsageByTierOrigin = new Map<string, number>();
  const recipes: CraftingRecipeSeedData[] = [];

  for (const tier of LAUNCH_TIERS) {
    for (const [className, affinities] of Object.entries(
      CLASS_GATHERING_AFFINITIES,
    )) {
      const classTierEquipment = equipmentDefinitions.filter(
        (equipment) =>
          equipment.className === className && equipment.tier === tier,
      );

      if (
        classTierEquipment.length !== GATHERING_AFFINITY_PAIR_PATTERN.length
      ) {
        throw new Error(
          `Esperados sete equipamentos de ${className} no Tier ${tier}; encontrados ${classTierEquipment.length}.`,
        );
      }

      classTierEquipment.forEach((equipment, equipmentIndex) => {
        const quantityPolicy = getRecipeQuantityPolicyForTier(tier);
        const [mainAffinityIndex, secondaryAffinityIndex] =
          GATHERING_AFFINITY_PAIR_PATTERN[equipmentIndex];
        const mainOrigin = affinities[mainAffinityIndex];
        const secondaryOrigin = affinities[secondaryAffinityIndex];
        const createGatheringIngredient = (
          origin: MaterialOrigin,
          quantity: number,
          role: CraftIngredientRole,
        ): CraftingIngredientSeedData => {
          const usageKey = `${tier}|${origin}`;
          const usageIndex = materialUsageByTierOrigin.get(usageKey) ?? 0;
          const material = getGatheringMaterial({ tier, origin, usageIndex });
          materialUsageByTierOrigin.set(usageKey, usageIndex + 1);

          return {
            itemName: material.name,
            quantity,
            role,
            origin,
          };
        };

        recipes.push({
          outputItemName: equipment.name,
          tier,
          outputQuantity: quantityPolicy.outputQuantity,
          ingredients: [
            createGatheringIngredient(
              mainOrigin,
              quantityPolicy.mainGatheringQuantity,
              CraftIngredientRole.MAIN_COMPONENT,
            ),
            createGatheringIngredient(
              secondaryOrigin,
              quantityPolicy.secondaryGatheringQuantity,
              CraftIngredientRole.SHARED_MATERIAL,
            ),
            ...createMobDropIngredients(equipment),
          ],
        });
      });
    }
  }

  return recipes;
}

export const recipeDefinitions: CraftingRecipeSeedData[] =
  createLaunchRecipeDefinitions();
