import fs from 'node:fs';
import path from 'node:path';
import { CraftIngredientRole, MaterialOrigin } from '@prisma/client';
import {
  equipmentDefinitions,
  materialDefinitions,
} from './seed-data/items.seed-data';
import { mapDefinitions } from './seed-data/maps.seed-data';
import {
  mobBaseDefinitions,
  mobDefinitions,
} from './seed-data/mobs.seed-data';
import {
  mobDropItemDefinitions,
  mobDropTables,
} from './seed-data/mob-drops.seed-data';
import { recipeDefinitions } from './seed-data/recipes.seed-data';

const DEFAULT_OUTPUT_DIR = path.resolve(
  process.cwd(),
  '..',
  'docs',
  'economia-crafting-csv',
);

type CsvValue = string | number | boolean | null | undefined;

function csvValue(value: CsvValue) {
  const normalized = value === null || value === undefined ? '' : String(value);
  const escaped = normalized.replace(/"/g, '""');

  return `"${escaped}"`;
}

function writeCsv(
  outputDir: string,
  fileName: string,
  headers: string[],
  rows: Array<Record<string, CsvValue>>,
) {
  const lines = [
    headers.map(csvValue).join(';'),
    ...rows.map((row) =>
      headers.map((header) => csvValue(row[header])).join(';'),
    ),
  ];

  fs.writeFileSync(
    path.join(outputDir, fileName),
    `\uFEFF${lines.join('\n')}\n`,
    'utf8',
  );
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function increment(
  target: Record<string, number>,
  key: string,
  amount: number = 1,
) {
  target[key] = (target[key] ?? 0) + amount;
}

function buildKey(parts: CsvValue[]) {
  return parts.map((part) => String(part ?? '')).join('|');
}

const outputDir = path.resolve(process.argv[2] ?? DEFAULT_OUTPUT_DIR);
fs.mkdirSync(outputDir, { recursive: true });

const equipmentByName = new Map(
  equipmentDefinitions.map((item) => [item.name, item]),
);
const materialByName = new Map(
  materialDefinitions.map((item) => [item.name, item]),
);
const mobByName = new Map(mobDefinitions.map((mob) => [mob.name, mob]));
const mobBaseByName = new Map(
  mobBaseDefinitions.map((mob) => [mob.name, mob]),
);

const recipeByOutput = new Map(
  recipeDefinitions.map((recipe) => [recipe.outputItemName, recipe]),
);

const ingredientDemandByItem: Record<string, number> = {};
const ingredientUsesByItem: Record<string, string[]> = {};
const ingredientRolesByItem: Record<string, Set<string>> = {};
const ingredientOriginsByItem: Record<string, Set<string>> = {};
const demandByOrigin: Record<string, number> = {};
const demandByClassOrigin: Record<string, number> = {};

for (const recipe of recipeDefinitions) {
  const output = equipmentByName.get(recipe.outputItemName);

  for (const ingredient of recipe.ingredients) {
    increment(ingredientDemandByItem, ingredient.itemName, ingredient.quantity);
    ingredientUsesByItem[ingredient.itemName] ??= [];
    ingredientUsesByItem[ingredient.itemName].push(recipe.outputItemName);
    ingredientRolesByItem[ingredient.itemName] ??= new Set();
    ingredientRolesByItem[ingredient.itemName].add(ingredient.role);
    ingredientOriginsByItem[ingredient.itemName] ??= new Set();
    ingredientOriginsByItem[ingredient.itemName].add(ingredient.origin);
    increment(demandByOrigin, ingredient.origin, ingredient.quantity);

    if (output) {
      increment(
        demandByClassOrigin,
        buildKey([output.className, ingredient.origin]),
        ingredient.quantity,
      );
    }
  }
}

const mapsRows = mapDefinitions.flatMap((map) =>
  map.subMaps.map((subMapName, index) => ({
    mapa: map.name,
    tier: map.tier,
    nivelMinimo: map.minLevel,
    nivelMaximo: map.maxLevel,
    submapa: subMapName,
    ordemSubmapa: index + 1,
    descricao: map.description,
  })),
);

writeCsv(
  outputDir,
  '00_mapas_submapas.csv',
  [
    'mapa',
    'tier',
    'nivelMinimo',
    'nivelMaximo',
    'submapa',
    'ordemSubmapa',
    'descricao',
  ],
  mapsRows,
);

const equipmentRows = equipmentDefinitions.map((item) => ({
  item: item.name,
  classe: item.className,
  slot: item.slot,
  familia: item.family,
  tier: item.tier,
  raridade: item.rarity,
  mapa: item.mapName,
  craftavel: item.isCraftable ?? false,
  forca: item.strengthBonus ?? 0,
  vitalidade: item.vitalityBonus ?? 0,
  agilidade: item.agilityBonus ?? 0,
  precisao: item.precisionBonus ?? 0,
  tecnica: item.techniqueBonus ?? 0,
  vontade: item.willpowerBonus ?? 0,
  descricao: item.description,
}));

writeCsv(
  outputDir,
  '01_itens_equipamentos.csv',
  [
    'item',
    'classe',
    'slot',
    'familia',
    'tier',
    'raridade',
    'mapa',
    'craftavel',
    'forca',
    'vitalidade',
    'agilidade',
    'precisao',
    'tecnica',
    'vontade',
    'descricao',
  ],
  equipmentRows,
);

const materialRows = materialDefinitions.map((item) => ({
  item: item.name,
  slug: item.slug ?? '',
  origem: item.materialOrigin,
  slotAfinidade: item.materialSlot ?? '',
  familia: item.family ?? '',
  tier: item.tier,
  raridade: item.rarity ?? '',
  mapa: item.mapName,
  materialDeGathering: item.isGatheringMaterial ?? false,
  nivelGathering: item.requiredGatheringLevel ?? '',
  xpPorUnidade: item.gatheringXpPerUnit ?? '',
  taxaBaseHora: item.baseGatheringRatePerHour ?? '',
  usadoEmReceitas: ingredientUsesByItem[item.name]?.length ?? 0,
  demandaTotal: ingredientDemandByItem[item.name] ?? 0,
  papeisNaReceita: Array.from(ingredientRolesByItem[item.name] ?? []).join(
    ', ',
  ),
  itensCraftados: [...new Set(ingredientUsesByItem[item.name] ?? [])].join(
    ', ',
  ),
  descricao: item.description,
}));

writeCsv(
  outputDir,
  '02_materiais_gathering.csv',
  [
    'item',
    'slug',
    'origem',
    'slotAfinidade',
    'familia',
    'tier',
    'raridade',
    'mapa',
    'materialDeGathering',
    'nivelGathering',
    'xpPorUnidade',
    'taxaBaseHora',
    'usadoEmReceitas',
    'demandaTotal',
    'papeisNaReceita',
    'itensCraftados',
    'descricao',
  ],
  materialRows,
);

const dropItemRows = mobDropItemDefinitions.map((item) => ({
  item: item.name,
  slug: item.slug ?? '',
  tipoDrop: item.dropType,
  familia: item.family,
  tier: item.tier,
  raridade: item.rarity,
  uso: item.usage,
  usadoEmReceitas: ingredientUsesByItem[item.name]?.length ?? 0,
  demandaTotalReceitas: ingredientDemandByItem[item.name] ?? 0,
  itensCraftados: [...new Set(ingredientUsesByItem[item.name] ?? [])].join(
    ', ',
  ),
  descricao: item.description,
}));

writeCsv(
  outputDir,
  '03_itens_drop_mobs.csv',
  [
    'item',
    'slug',
    'tipoDrop',
    'familia',
    'tier',
    'raridade',
    'uso',
    'usadoEmReceitas',
    'demandaTotalReceitas',
    'itensCraftados',
    'descricao',
  ],
  dropItemRows,
);

const recipeRows = recipeDefinitions.map((recipe) => {
  const output = equipmentByName.get(recipe.outputItemName);
  const main = recipe.ingredients.find(
    (ingredient) => ingredient.role === CraftIngredientRole.MAIN_COMPONENT,
  );
  const secondary = recipe.ingredients.find(
    (ingredient) => ingredient.role === CraftIngredientRole.SHARED_MATERIAL,
  );
  const rareDrops = recipe.ingredients.filter(
    (ingredient) => ingredient.origin === MaterialOrigin.DROP_MOBS,
  );
  const biomaterial = rareDrops.find(
    (ingredient) => !ingredient.itemName.startsWith('Resíduo Infecto'),
  );
  const residue = rareDrops.find((ingredient) =>
    ingredient.itemName.startsWith('Resíduo Infecto'),
  );

  return {
    itemCraftado: recipe.outputItemName,
    classe: output?.className ?? '',
    slot: output?.slot ?? '',
    familia: output?.family ?? '',
    tier: recipe.tier,
    raridade: output?.rarity ?? '',
    mapa: output?.mapName ?? '',
    quantidadeGerada: recipe.outputQuantity ?? 1,
    materialPrincipal: main?.itemName ?? '',
    origemPrincipal: main?.origin ?? '',
    qtdPrincipal: main?.quantity ?? '',
    materialSecundario: secondary?.itemName ?? '',
    origemSecundaria: secondary?.origin ?? '',
    qtdSecundario: secondary?.quantity ?? '',
    biomaterial: biomaterial?.itemName ?? '',
    qtdBiomaterial: biomaterial?.quantity ?? '',
    residuo: residue?.itemName ?? '',
    qtdResiduo: residue?.quantity ?? '',
    totalIngredientes: sum(
      recipe.ingredients.map((ingredient) => ingredient.quantity),
    ),
  };
});

writeCsv(
  outputDir,
  '04_receitas_resumo.csv',
  [
    'itemCraftado',
    'classe',
    'slot',
    'familia',
    'tier',
    'raridade',
    'mapa',
    'quantidadeGerada',
    'materialPrincipal',
    'origemPrincipal',
    'qtdPrincipal',
    'materialSecundario',
    'origemSecundaria',
    'qtdSecundario',
    'biomaterial',
    'qtdBiomaterial',
    'residuo',
    'qtdResiduo',
    'totalIngredientes',
  ],
  recipeRows,
);

const recipeIngredientRows = recipeDefinitions.flatMap((recipe) => {
  const output = equipmentByName.get(recipe.outputItemName);

  return recipe.ingredients.map((ingredient, index) => ({
    itemCraftado: recipe.outputItemName,
    classe: output?.className ?? '',
    slot: output?.slot ?? '',
    tier: recipe.tier,
    mapa: output?.mapName ?? '',
    ingredienteOrdem: index + 1,
    ingrediente: ingredient.itemName,
    quantidade: ingredient.quantity,
    papel: ingredient.role,
    origem: ingredient.origin,
  }));
});

writeCsv(
  outputDir,
  '05_receitas_ingredientes.csv',
  [
    'itemCraftado',
    'classe',
    'slot',
    'tier',
    'mapa',
    'ingredienteOrdem',
    'ingrediente',
    'quantidade',
    'papel',
    'origem',
  ],
  recipeIngredientRows,
);

const mobRows = mobBaseDefinitions.map((base) => {
  const mob = mobByName.get(base.name);

  return {
    mob: base.name,
    tipo: base.mobType,
    tier: base.tier,
    level: mob?.level ?? base.level,
    mapa: base.mapName,
    submapa: base.subMapName,
    ordemNoSubmapa: base.orderNoSubmap,
    hp: mob?.hp ?? '',
    attack: mob?.attack ?? '',
    defense: mob?.defense ?? '',
    speed: mob?.speed ?? '',
    xpReward: mob?.xpReward ?? '',
    aliases: base.aliases?.join(', ') ?? '',
    descricao: mob?.description ?? '',
  };
});

writeCsv(
  outputDir,
  '06_mobs_mapas_stats.csv',
  [
    'mob',
    'tipo',
    'tier',
    'level',
    'mapa',
    'submapa',
    'ordemNoSubmapa',
    'hp',
    'attack',
    'defense',
    'speed',
    'xpReward',
    'aliases',
    'descricao',
  ],
  mobRows,
);

const mobDropRows = mobDropTables.flatMap((table) =>
  table.drops.map((drop, index) => ({
    mob: table.mobName,
    tipoMob: table.mobType,
    tier: table.tier,
    raridadeFaixa: table.rarity,
    mapa: table.mapName,
    submapa: table.subMapName,
    ordemNoSubmapa: table.orderNoSubmap,
    dropOrdem: index + 1,
    itemDrop: drop.itemName,
    tipoDrop: drop.dropType,
    chancePercentual: drop.dropChance,
    quantidadeMinima: drop.minQuantity,
    quantidadeMaxima: drop.maxQuantity,
  })),
);

writeCsv(
  outputDir,
  '07_mobs_drops.csv',
  [
    'mob',
    'tipoMob',
    'tier',
    'raridadeFaixa',
    'mapa',
    'submapa',
    'ordemNoSubmapa',
    'dropOrdem',
    'itemDrop',
    'tipoDrop',
    'chancePercentual',
    'quantidadeMinima',
    'quantidadeMaxima',
  ],
  mobDropRows,
);

const demandByOriginRows = Object.entries(demandByOrigin)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([origem, demandaTotal]) => ({
    origem,
    demandaTotal,
  }));

writeCsv(
  outputDir,
  '08_balanco_demanda_por_origem.csv',
  ['origem', 'demandaTotal'],
  demandByOriginRows,
);

const demandByClassOriginRows = Object.entries(demandByClassOrigin)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, demandaTotal]) => {
    const [classe, origem] = key.split('|');

    return {
      classe,
      origem,
      demandaTotal,
    };
  });

writeCsv(
  outputDir,
  '09_balanco_demanda_por_classe_origem.csv',
  ['classe', 'origem', 'demandaTotal'],
  demandByClassOriginRows,
);

const summaryRows = [
  { metrica: 'mapas', valor: mapDefinitions.length },
  { metrica: 'submapas', valor: mapsRows.length },
  { metrica: 'equipamentos', valor: equipmentDefinitions.length },
  { metrica: 'materiais', valor: materialDefinitions.length },
  {
    metrica: 'materiaisGatheringAtivos',
    valor: materialDefinitions.filter((item) => item.isGatheringMaterial)
      .length,
  },
  { metrica: 'itensDropMobs', valor: mobDropItemDefinitions.length },
  { metrica: 'receitas', valor: recipeDefinitions.length },
  { metrica: 'mobs', valor: mobDefinitions.length },
  { metrica: 'linhasDropsMobs', valor: mobDropRows.length },
];

writeCsv(outputDir, '10_resumo.csv', ['metrica', 'valor'], summaryRows);

const readme = `# Exportação de economia e crafting

Arquivos gerados automaticamente a partir dos seeds do projeto.

## Arquivos

- 00_mapas_submapas.csv: mapas, tiers, níveis e submapas.
- 01_itens_equipamentos.csv: equipamentos craftáveis, classe, slot, stats e mapa.
- 02_materiais_gathering.csv: materiais de gathering, origem, afinidade e uso em receitas.
- 03_itens_drop_mobs.csv: itens obtidos de mobs e demanda em receitas.
- 04_receitas_resumo.csv: uma linha por receita, com quantidades principais.
- 05_receitas_ingredientes.csv: formato longo, uma linha por ingrediente.
- 06_mobs_mapas_stats.csv: mobs, mapa/submapa, tier, level e stats.
- 07_mobs_drops.csv: tabela de drops por mob.
- 08_balanco_demanda_por_origem.csv: demanda total agregada por origem.
- 09_balanco_demanda_por_classe_origem.csv: demanda agregada por classe e origem.
- 10_resumo.csv: contadores gerais da exportação.

Para regenerar:

\`\`\`bash
cd backend
npm run prisma:export:economy-csv
\`\`\`
`;

fs.writeFileSync(path.join(outputDir, 'README.md'), readme, 'utf8');

console.log(`Exportação concluída em: ${outputDir}`);
