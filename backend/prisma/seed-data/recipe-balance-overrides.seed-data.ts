export type GatheringOriginCode =
  | 'DESMANCHE'
  | 'COLETA'
  | 'CONTENCAO'
  | 'ARSENAL'
  | 'PATRULHA'
  | 'TECNOVARREDURA';

export type RecipeMainGatheringOverride = {
  outputItemName: string;
  targetMainOrigin: GatheringOriginCode;
};

export const balancedGatheringDemandPerOrigin = 7000;
export const balancedGatheringDemandPerClassOrigin = 3500;

export const recipeQuantityPolicy = {
  outputQuantity: 1,
  ingredientCount: 4,
} as const;

export type RecipeQuantityTierPolicy = {
  mainGatheringQuantity: number;
  secondaryGatheringQuantity: number;
  biomaterialDropQuantity: number;
  residueDropQuantity: number;
};

export const recipeQuantityPolicyByTier: Record<
  number,
  RecipeQuantityTierPolicy
> = {
  1: {
    mainGatheringQuantity: 80,
    secondaryGatheringQuantity: 40,
    biomaterialDropQuantity: 9,
    residueDropQuantity: 16,
  },
  2: {
    mainGatheringQuantity: 80,
    secondaryGatheringQuantity: 40,
    biomaterialDropQuantity: 10,
    residueDropQuantity: 20,
  },
  3: {
    mainGatheringQuantity: 90,
    secondaryGatheringQuantity: 45,
    biomaterialDropQuantity: 12,
    residueDropQuantity: 20,
  },
  4: {
    mainGatheringQuantity: 90,
    secondaryGatheringQuantity: 45,
    biomaterialDropQuantity: 14,
    residueDropQuantity: 24,
  },
  5: {
    mainGatheringQuantity: 100,
    secondaryGatheringQuantity: 50,
    biomaterialDropQuantity: 16,
    residueDropQuantity: 30,
  },
  6: {
    mainGatheringQuantity: 100,
    secondaryGatheringQuantity: 50,
    biomaterialDropQuantity: 20,
    residueDropQuantity: 40,
  },
  7: {
    mainGatheringQuantity: 110,
    secondaryGatheringQuantity: 55,
    biomaterialDropQuantity: 22,
    residueDropQuantity: 50,
  },
  8: {
    mainGatheringQuantity: 110,
    secondaryGatheringQuantity: 55,
    biomaterialDropQuantity: 28,
    residueDropQuantity: 60,
  },
  9: {
    mainGatheringQuantity: 120,
    secondaryGatheringQuantity: 60,
    biomaterialDropQuantity: 32,
    residueDropQuantity: 80,
  },
  10: {
    mainGatheringQuantity: 120,
    secondaryGatheringQuantity: 60,
    biomaterialDropQuantity: 36,
    residueDropQuantity: 85,
  },
};

export function getRecipeQuantityPolicyForTier(tier: number) {
  const tierPolicy = recipeQuantityPolicyByTier[tier];

  if (!tierPolicy) {
    throw new Error(
      `Politica de quantidade de receita ausente para Tier ${tier}.`,
    );
  }

  return {
    ...tierPolicy,
    outputQuantity: recipeQuantityPolicy.outputQuantity,
    ingredientCount: recipeQuantityPolicy.ingredientCount,
    totalInputQuantity:
      tierPolicy.mainGatheringQuantity +
      tierPolicy.secondaryGatheringQuantity +
      tierPolicy.biomaterialDropQuantity +
      tierPolicy.residueDropQuantity,
    rareMobDropTotalQuantity:
      tierPolicy.biomaterialDropQuantity + tierPolicy.residueDropQuantity,
  };
}

export const recipeMainGatheringOverrides: RecipeMainGatheringOverride[] = [
  { outputItemName: 'Armadura Titânica da Necrópole', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura do Marco Zero', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Para-choque Tático', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Grevas de Articulação Helix', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Grevas Titânicas da Necrópole', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Marcha do Marco Zero', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Elmo de Motim Quebrado', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Elmo de Contenção Helix', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Elmo Titânico da Necrópole', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Elmo do Marco Zero', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Maça de Poste Retorcido', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Machado de Porta de Viatura', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Maça de Coluna Helix', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Machado de Lâmina Experimental', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Maça de Coluna Titânica', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Machado de Fragmento Titânico', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Maça do Marco Zero', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Machado da Ruína Carmesim', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Portão Oxidado', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Escudo de Maca Dobrada', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Escudo de Painel de Embarque', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Barreira de Quarentena', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Tampa de Caldeira', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Placa Antimotim', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Painel Helix', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo Titânico da Necrópole', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo do Marco Zero', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Perneiras de Cinza Industrial', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Perneiras Necróticas de Fibra', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Perneiras do Marco Zero', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Sapatilhas de Quarentena Selada', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Sapatilhas de Cinza Silenciosa', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Sapatilhas de Asfalto Mutagênico', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Sapatilhas de Tração Helix', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Sapatilhas de Passo Carmesim', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Sapatilhas do Eclipse Rubro', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Injetor de Triagem Clínica', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor de Emergência do Terminal', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor de Reagente Cinzento', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor Mutagênico de Campo', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor Helix de Estabilização', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Carregador Antimotim Instável', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Carregador Helix Pressurizado', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Carregador do Último Disparo', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira de Quarentena Verde', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira de Vapor Cinzento', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira Antimotim Roxa', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira Helix de Rastreamento', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira Carmesim da Necrópole', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira do Marco Zero', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta Antimotim do Atirador', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta Helix de Precisão', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta Titânica da Necrópole', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Cargueiras de Rua Rasgadas', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Cargueiras de Oficina Oleosa', targetMainOrigin: 'DESMANCHE' },
];
