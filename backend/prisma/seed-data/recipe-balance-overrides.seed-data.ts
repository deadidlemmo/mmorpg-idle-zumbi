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

export const balancedGatheringDemandPerOrigin = 140;
export const balancedGatheringDemandPerClassOrigin = 70;

export const recipeMainGatheringOverrides: RecipeMainGatheringOverride[] = [
  { outputItemName: 'Armadura de Retalhos Pesados', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura de Placas Oxidadas', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura de Maca Reforçada', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura de Bagageiro Rebitado', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura de Barreira Selada', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura de Caldeira Cinzenta', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura de Barricada Mutagênica', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura de Carcaça Helix', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura Titânica da Necrópole', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Armadura do Marco Zero', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Tábua Remendada', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Lataria Oxidada', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Tala Clínica', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Escada Rolante', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Câmara Selada', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Duto Cinzento', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Para-choque Tático', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Articulação Helix', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas Titânicas da Necrópole', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Grevas de Marcha do Marco Zero', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Tampa Amassada', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Portão Oxidado', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Maca Dobrada', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Painel de Embarque', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Escudo de Barreira de Quarentena', targetMainOrigin: 'CONTENCAO' },
  { outputItemName: 'Elmo de Obra Rachado', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Elmo de Soldador Enferrujado', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Elmo de Visor Clínico', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Elmo de Segurança do Terminal', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Elmo de Câmara Selada', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Traje de Rua Rasgado', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje de Oficina Silencioso', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje de Ala Isolada', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje de Terminal Oculto', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje de Quarentena Furtiva', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje de Refinaria Sombria', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje Antimotim Sombrio', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje Helix de Infiltração', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje Titânico da Necrópole', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Traje da Ruína Silenciosa', targetMainOrigin: 'TECNOVARREDURA' },
  { outputItemName: 'Injetor de Soro Rachado', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor de Oficina Oxidado', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor de Triagem Clínica', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor de Emergência do Terminal', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Injetor de Quarentena Verde', targetMainOrigin: 'COLETA' },
  { outputItemName: 'Viseira de Mira Rachada', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira de Oficina Oxidada', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira de Triagem Balística', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira de Embarque Tático', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira de Quarentena Verde', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira de Vapor Cinzento', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira Antimotim Roxa', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira Helix de Rastreamento', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira Carmesim da Necrópole', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Viseira do Marco Zero', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta de Couro Furado', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta de Oficina Oxidada', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta de Resgate Clínico', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta de Patrulha do Terminal', targetMainOrigin: 'DESMANCHE' },
  { outputItemName: 'Jaqueta de Quarentena Balística', targetMainOrigin: 'DESMANCHE' },
];

