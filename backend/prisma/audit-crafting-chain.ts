import fs from 'node:fs';
import {
  equipmentDefinitions,
  materialDefinitions,
} from './seed-data/items.seed-data';
import {
  mobDropItemDefinitions,
  mobDropTables,
} from './seed-data/mob-drops.seed-data';
import {
  balancedGatheringDemandPerClassOrigin,
  balancedGatheringDemandPerOrigin,
  recipeQuantityPolicy,
  recipeMainGatheringOverrides,
  type GatheringOriginCode,
} from './seed-data/recipe-balance-overrides.seed-data';
import { recipeDefinitions } from './seed-data/recipes.seed-data';

type CsvRow = Record<string, string>;

const DEFAULT_CSV_PATH =
  'C:/Users/Neto/Downloads/receitas_corrigidas_2principal_1secundario.csv';

const GATHERING_ORIGINS = [
  'DESMANCHE',
  'COLETA',
  'CONTENCAO',
  'ARSENAL',
  'PATRULHA',
  'TECNOVARREDURA',
] as const;

const ORIGIN_BY_LABEL: Record<string, string> = {
  desmanche: 'DESMANCHE',
  coleta: 'COLETA',
  contencao: 'CONTENCAO',
  arsenal: 'ARSENAL',
  patrulha: 'PATRULHA',
  tecnovarredura: 'TECNOVARREDURA',
};

const SLOT_BY_LABEL: Record<string, string> = {
  armadura: 'ARMOR',
  pernas: 'PANTS',
  pes: 'BOOTS',
  elmo: 'HEAD',
  mainhand: 'MAIN_HAND',
  offhand: 'OFF_HAND',
};

const CLASS_AFFINITIES: Record<string, Set<string>> = {
  LUTADOR: new Set(['DESMANCHE', 'COLETA', 'CONTENCAO']),
  ASSASSINO: new Set(['ARSENAL', 'PATRULHA', 'TECNOVARREDURA']),
  MEDICO: new Set(['TECNOVARREDURA', 'COLETA', 'CONTENCAO']),
  ATIRADOR: new Set(['ARSENAL', 'DESMANCHE', 'PATRULHA']),
};

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ';' && !insideQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);

  return values;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const headers = parseCsvLine(lines[0] ?? '').map(normalize);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    );
  });
}

function increment(target: Record<string, number>, key: string, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function buildKey(parts: Array<number | string>) {
  return parts.join('|');
}

function stripDisambiguationSuffix(name: string) {
  return name.replace(/ \([^)]* T\d+ [^)]+\)$/, '');
}

const itemNames = new Set([
  ...materialDefinitions.map((item) => item.name),
  ...equipmentDefinitions.map((item) => item.name),
  ...mobDropItemDefinitions.map((item) => item.name),
]);

const mainGatheringOverrideByOutput = new Map(
  recipeMainGatheringOverrides.map((override) => [
    override.outputItemName,
    override,
  ]),
);

function resolveGatheringMaterial(params: {
  name: string;
  origin: string;
  tier: number;
  slot: string;
}) {
  const exactMaterial = materialDefinitions.find(
    (material) =>
      material.name === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier &&
      material.materialSlot === params.slot,
  );

  if (exactMaterial) return exactMaterial.name;

  const exactMaterialByOriginAndTier = materialDefinitions.find(
    (material) =>
      material.name === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier,
  );

  if (exactMaterialByOriginAndTier) return exactMaterialByOriginAndTier.name;

  const exactCandidates = materialDefinitions.filter(
    (material) =>
      stripDisambiguationSuffix(material.name) === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier &&
      material.materialSlot === params.slot,
  );

  if (exactCandidates.length === 1) return exactCandidates[0].name;

  const fallbackCandidates = materialDefinitions.filter(
    (material) =>
      stripDisambiguationSuffix(material.name) === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier,
  );

  if (fallbackCandidates.length === 1) return fallbackCandidates[0].name;

  return null;
}

function resolveGatheringMaterialForOrigin(params: {
  name: string;
  origin: string;
  tier: number;
  slot: string;
}) {
  const exact = materialDefinitions.find(
    (material) =>
      material.name === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier &&
      material.materialSlot === params.slot &&
      material.isGatheringMaterial,
  );

  if (exact) return exact.name;

  return resolveGatheringMaterial(params);
}

function chooseBalancedMainMaterial(params: {
  row: CsvRow;
  outputItemName: string;
  targetOrigin: GatheringOriginCode;
  tier: number;
  slot: string;
  secondaryItemName: string | null;
}) {
  const unusedOrigin = ORIGIN_BY_LABEL[normalize(params.row.origemnaousada)];

  if (unusedOrigin === params.targetOrigin) {
    const resolvedUnused = resolveGatheringMaterialForOrigin({
      name: params.row.materialnaousado,
      origin: params.targetOrigin,
      tier: params.tier,
      slot: params.slot,
    });

    if (resolvedUnused && resolvedUnused !== params.secondaryItemName) {
      return resolvedUnused;
    }
  }

  const candidates = materialDefinitions
    .filter(
      (material) =>
        material.materialOrigin === params.targetOrigin &&
        material.tier === params.tier &&
        material.materialSlot === params.slot &&
        material.isGatheringMaterial &&
        material.name !== params.secondaryItemName,
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

  if (candidates[0]) return candidates[0].name;

  const sameTierCandidates = materialDefinitions
    .filter(
      (material) =>
        material.materialOrigin === params.targetOrigin &&
        material.tier === params.tier &&
        material.isGatheringMaterial &&
        material.name !== params.secondaryItemName,
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

  if (sameTierCandidates[0]) return sameTierCandidates[0].name;

  throw new Error(
    [
      `Material principal balanceado não encontrado para ${params.outputItemName}`,
      `Origem alvo: ${params.targetOrigin}`,
      `Tier: ${params.tier}`,
      `Slot: ${params.slot}`,
    ].join(' | '),
  );
}

function summarizeDemand(values: Record<string, number>) {
  const amounts = GATHERING_ORIGINS.map((origin) => values[origin] ?? 0);

  return {
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    spread: Math.max(...amounts) - Math.min(...amounts),
    values,
  };
}

function getMobDropCategory(params: {
  itemName: string;
  mobDropMetaByName: Map<string, { family: string }>;
}) {
  const family = params.mobDropMetaByName.get(params.itemName)?.family ?? '';

  if (family === 'Resíduo Infecto') return 'RESIDUE';
  if (family.startsWith('Biomaterial ')) return 'BIOMATERIAL';
  if (family === 'Núcleo Infectado de Elite') return 'ELITE_CORE';

  return 'UNKNOWN';
}

function buildRecipeQuantityShape(params: {
  recipe: (typeof recipeDefinitions)[number];
  mobDropMetaByName: Map<string, { family: string }>;
}) {
  const { recipe, mobDropMetaByName } = params;
  const ingredients = recipe.ingredients;
  const mainGathering = ingredients.filter(
    (ingredient) => String(ingredient.role) === 'MAIN_COMPONENT',
  );
  const secondaryGathering = ingredients.filter(
    (ingredient) => String(ingredient.role) === 'SHARED_MATERIAL',
  );
  const mobDropIngredients = ingredients.filter(
    (ingredient) => String(ingredient.role) === 'RARE_MOB_DROP',
  );
  const biomaterials = mobDropIngredients.filter(
    (ingredient) =>
      getMobDropCategory({
        itemName: ingredient.itemName,
        mobDropMetaByName,
      }) === 'BIOMATERIAL',
  );
  const residues = mobDropIngredients.filter(
    (ingredient) =>
      getMobDropCategory({
        itemName: ingredient.itemName,
        mobDropMetaByName,
      }) === 'RESIDUE',
  );

  const sumQuantity = (
    values: Array<{
      quantity: number;
    }>,
  ) => values.reduce((total, value) => total + value.quantity, 0);

  return [
    `output:${recipe.outputQuantity ?? 1}`,
    `ingredients:${ingredients.length}`,
    `total:${sumQuantity(ingredients)}`,
    `main:${mainGathering.length}/${sumQuantity(mainGathering)}`,
    `secondary:${secondaryGathering.length}/${sumQuantity(secondaryGathering)}`,
    `biomaterial:${biomaterials.length}/${sumQuantity(biomaterials)}`,
    `residue:${residues.length}/${sumQuantity(residues)}`,
  ].join('|');
}

function buildRecipeQuantityAudit(params: {
  mobDropMetaByName: Map<string, { family: string }>;
}) {
  const shapeDistribution: Record<string, number> = {};
  const invalidRecipes: unknown[] = [];

  for (const recipe of recipeDefinitions) {
    const shape = buildRecipeQuantityShape({
      recipe,
      mobDropMetaByName: params.mobDropMetaByName,
    });
    increment(shapeDistribution, shape);

    const ingredients = recipe.ingredients;
    const mainGathering = ingredients.filter(
      (ingredient) => String(ingredient.role) === 'MAIN_COMPONENT',
    );
    const secondaryGathering = ingredients.filter(
      (ingredient) => String(ingredient.role) === 'SHARED_MATERIAL',
    );
    const mobDropIngredients = ingredients.filter(
      (ingredient) => String(ingredient.role) === 'RARE_MOB_DROP',
    );
    const biomaterials = mobDropIngredients.filter(
      (ingredient) =>
        getMobDropCategory({
          itemName: ingredient.itemName,
          mobDropMetaByName: params.mobDropMetaByName,
        }) === 'BIOMATERIAL',
    );
    const residues = mobDropIngredients.filter(
      (ingredient) =>
        getMobDropCategory({
          itemName: ingredient.itemName,
          mobDropMetaByName: params.mobDropMetaByName,
        }) === 'RESIDUE',
    );
    const totalInputQuantity = ingredients.reduce(
      (total, ingredient) => total + ingredient.quantity,
      0,
    );

    const issues: string[] = [];

    if ((recipe.outputQuantity ?? 1) !== recipeQuantityPolicy.outputQuantity) {
      issues.push('outputQuantity');
    }

    if (ingredients.length !== recipeQuantityPolicy.ingredientCount) {
      issues.push('ingredientCount');
    }

    if (totalInputQuantity !== recipeQuantityPolicy.totalInputQuantity) {
      issues.push('totalInputQuantity');
    }

    if (
      mainGathering.length !== 1 ||
      mainGathering[0]?.quantity !==
        recipeQuantityPolicy.mainGatheringQuantity
    ) {
      issues.push('mainGatheringQuantity');
    }

    if (
      secondaryGathering.length !== 1 ||
      secondaryGathering[0]?.quantity !==
        recipeQuantityPolicy.secondaryGatheringQuantity
    ) {
      issues.push('secondaryGatheringQuantity');
    }

    if (
      biomaterials.length !== 1 ||
      biomaterials[0]?.quantity !==
        recipeQuantityPolicy.biomaterialDropQuantity
    ) {
      issues.push('biomaterialDropQuantity');
    }

    if (
      residues.length !== 1 ||
      residues[0]?.quantity !== recipeQuantityPolicy.residueDropQuantity
    ) {
      issues.push('residueDropQuantity');
    }

    if (
      mobDropIngredients.reduce(
        (total, ingredient) => total + ingredient.quantity,
        0,
      ) !== recipeQuantityPolicy.rareMobDropTotalQuantity
    ) {
      issues.push('rareMobDropTotalQuantity');
    }

    if (issues.length > 0) {
      invalidRecipes.push({
        outputItemName: recipe.outputItemName,
        issues,
        shape,
      });
    }
  }

  return {
    policy: recipeQuantityPolicy,
    shapeDistribution,
    invalidRecipeCount: invalidRecipes.length,
    invalidRecipes: invalidRecipes.slice(0, 20),
  };
}

function main() {
  const csvPath = process.argv[2] ?? DEFAULT_CSV_PATH;
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const equipmentNames = new Set(equipmentDefinitions.map((item) => item.name));
  const mobDropItemNames = new Set(
    mobDropItemDefinitions.map((item) => item.name),
  );
  const recipesByOutput = new Map(
    recipeDefinitions.map((recipe) => [recipe.outputItemName, recipe]),
  );
  const mobDropMetaByName = new Map(
    mobDropItemDefinitions.map((item) => [item.name, item]),
  );

  const missingOutputs = new Set<string>();
  const missingMobDropIngredients = new Set<string>();
  const unresolvedUsedGathering: unknown[] = [];
  const unresolvedUnusedColumnMaterials: unknown[] = [];
  const mismatchedRecipes: unknown[] = [];
  const affinityViolations: unknown[] = [];

  const recipeCountByClass: Record<string, number> = {};
  const recipeCountByTier: Record<string, number> = {};
  const recipeCountByClassSlot: Record<string, number> = {};
  const gatheringPlacementsByOrigin = Object.fromEntries(
    GATHERING_ORIGINS.map((origin) => [origin, 0]),
  );
  const gatheringDemandByOrigin = Object.fromEntries(
    GATHERING_ORIGINS.map((origin) => [origin, 0]),
  );
  const gatheringMainDemandByOrigin = Object.fromEntries(
    GATHERING_ORIGINS.map((origin) => [origin, 0]),
  );
  const gatheringSecondaryDemandByOrigin = Object.fromEntries(
    GATHERING_ORIGINS.map((origin) => [origin, 0]),
  );
  const gatheringDemandByClassOrigin: Record<string, number> = {};
  const mobDropDemandByItem: Record<string, number> = {};
  const mobDropDemandByRarityFamily: Record<string, number> = {};
  const csvUsedGatheringNames = new Set<string>();
  const csvUnusedColumnNames = new Set<string>();

  for (const row of rows) {
    const outputItemName = row.item;
    const tier = Number(row.tier);
    const slot = SLOT_BY_LABEL[normalize(row.slot)];
    const classKey = normalize(row.classe).toUpperCase();

    increment(recipeCountByClass, row.classe);
    increment(recipeCountByTier, String(tier));
    increment(recipeCountByClassSlot, buildKey([row.classe, row.slot]));

    if (!equipmentNames.has(outputItemName)) {
      missingOutputs.add(outputItemName);
    }

    const expectedIngredients: Array<string | null> = [];
    const secondaryOrigin = ORIGIN_BY_LABEL[normalize(row.gatheringsecundario)];
    const resolvedSecondaryName = resolveGatheringMaterial({
      name: row.materialsecundario,
      origin: secondaryOrigin,
      tier,
      slot,
    });
    const mainOverride = mainGatheringOverrideByOutput.get(outputItemName);
    const mainOrigin =
      mainOverride?.targetMainOrigin ??
      ORIGIN_BY_LABEL[normalize(row.gatheringprincipal)];
    const mainMaterialName = mainOverride
      ? chooseBalancedMainMaterial({
          row,
          outputItemName,
          targetOrigin: mainOverride.targetMainOrigin,
          tier,
          slot,
          secondaryItemName: resolvedSecondaryName,
        })
      : row.materialprincipal;
    const gatheringSpecs = [
      {
        name: mainMaterialName,
        origin: mainOrigin,
        quantity: Number(row.qtdmaterialprincipal),
        role: 'main',
      },
      {
        name: row.materialsecundario,
        origin: secondaryOrigin,
        quantity: Number(row.qtdmaterialsecundario),
        role: 'secondary',
      },
    ];

    for (const spec of gatheringSpecs) {
      csvUsedGatheringNames.add(spec.name);

      if (!CLASS_AFFINITIES[classKey]?.has(spec.origin)) {
        affinityViolations.push({
          outputItemName,
          className: row.classe,
          materialName: spec.name,
          origin: spec.origin,
        });
      }

      const resolvedName = resolveGatheringMaterial({
        name: spec.name,
        origin: spec.origin,
        tier,
        slot,
      });

      expectedIngredients.push(resolvedName);

      if (!resolvedName) {
        unresolvedUsedGathering.push({
          outputItemName,
          materialName: spec.name,
          origin: spec.origin,
          tier,
          slot,
        });
      }

      increment(gatheringPlacementsByOrigin, spec.origin);
      increment(gatheringDemandByOrigin, spec.origin, spec.quantity);

      if (spec.role === 'main') {
        increment(gatheringMainDemandByOrigin, spec.origin, spec.quantity);
      } else {
        increment(gatheringSecondaryDemandByOrigin, spec.origin, spec.quantity);
      }

      increment(
        gatheringDemandByClassOrigin,
        buildKey([row.classe, spec.origin]),
        spec.quantity,
      );
    }

    const unusedColumnOrigin = ORIGIN_BY_LABEL[normalize(row.origemnaousada)];
    csvUnusedColumnNames.add(row.materialnaousado);

    const resolvedUnusedColumnMaterial = resolveGatheringMaterial({
      name: row.materialnaousado,
      origin: unusedColumnOrigin,
      tier,
      slot,
    });

    if (!resolvedUnusedColumnMaterial) {
      unresolvedUnusedColumnMaterials.push({
        outputItemName,
        materialName: row.materialnaousado,
        origin: unusedColumnOrigin,
        tier,
        slot,
      });
    }

    for (const mobDropName of [row.dropdemob, row.residuodemob]) {
      const quantity = Number(
        mobDropName === row.dropdemob ? row.qtddropdemob : row.qtdresiduodemob,
      );

      expectedIngredients.push(mobDropName);

      if (!mobDropItemNames.has(mobDropName)) {
        missingMobDropIngredients.add(mobDropName);
      }

      increment(mobDropDemandByItem, mobDropName, quantity);

      const meta = mobDropMetaByName.get(mobDropName);
      increment(
        mobDropDemandByRarityFamily,
        buildKey([meta?.rarity ?? 'UNKNOWN', meta?.family ?? 'UNKNOWN']),
        quantity,
      );
    }

    const currentRecipe = recipesByOutput.get(outputItemName);
    const currentIngredients =
      currentRecipe?.ingredients.map((ingredient) => ingredient.itemName) ?? [];

    if (
      !currentRecipe ||
      JSON.stringify(currentIngredients) !== JSON.stringify(expectedIngredients)
    ) {
      mismatchedRecipes.push({
        outputItemName,
        expectedIngredients,
        currentIngredients,
      });
    }
  }

  const usedRecipeIngredients = new Set(
    recipeDefinitions.flatMap((recipe) =>
      recipe.ingredients.map((ingredient) => ingredient.itemName),
    ),
  );
  const gatheringMaterialsWithoutRecipe = materialDefinitions.filter(
    (material) =>
      material.isGatheringMaterial && !usedRecipeIngredients.has(material.name),
  );
  const recipeGatheringIngredientsNotGatherable = [
    ...new Set(
      recipeDefinitions
        .flatMap((recipe) => recipe.ingredients)
        .filter((ingredient) => ingredient.origin !== 'DROP_MOBS')
        .map((ingredient) => ingredient.itemName)
        .filter(
          (itemName) =>
            !materialDefinitions.some(
              (material) =>
                material.name === itemName && material.isGatheringMaterial,
            ),
        ),
    ),
  ];

  const droppedItemNames = new Set<string>();
  const mobDropOccurrenceByItem: Record<string, number> = {};
  const mobDropChanceSumByItem: Record<string, number> = {};
  const mobDropSupplyByRarityFamily: Record<string, number> = {};
  const mobDropTableIssues: unknown[] = [];

  for (const table of mobDropTables) {
    const hasResidue = table.drops.some((drop) => drop.dropType === 'RESIDUE');
    const hasBiomaterial = table.drops.some(
      (drop) => drop.dropType === 'BIOMATERIAL',
    );
    const hasEliteCore = table.drops.some(
      (drop) => drop.dropType === 'ELITE_CORE',
    );

    if (
      !hasResidue ||
      (table.mobType === 'MONSTER' && !hasBiomaterial) ||
      (table.mobType === 'ELITE' && !hasEliteCore)
    ) {
      mobDropTableIssues.push({
        mobName: table.mobName,
        tier: table.tier,
        mobType: table.mobType,
        dropTypes: table.drops.map((drop) => drop.dropType),
      });
    }

    for (const drop of table.drops) {
      const meta = mobDropMetaByName.get(drop.itemName);

      droppedItemNames.add(drop.itemName);
      increment(mobDropOccurrenceByItem, drop.itemName);
      increment(mobDropChanceSumByItem, drop.itemName, drop.dropChance);
      increment(
        mobDropSupplyByRarityFamily,
        buildKey([meta?.rarity ?? 'UNKNOWN', meta?.family ?? 'UNKNOWN']),
        drop.dropChance,
      );
    }
  }

  const recipeMobDropIngredients = new Set(
    recipeDefinitions.flatMap((recipe) =>
      recipe.ingredients
        .filter((ingredient) => ingredient.origin === 'DROP_MOBS')
        .map((ingredient) => ingredient.itemName),
    ),
  );

  const report = {
    csv: {
      rows: rows.length,
      outputItems: new Set(rows.map((row) => row.item)).size,
      usedGatheringNames: csvUsedGatheringNames.size,
      unusedColumnNames: csvUnusedColumnNames.size,
    },
    seed: {
      equipmentItems: equipmentDefinitions.length,
      gatheringMaterials: materialDefinitions.filter(
        (material) => material.isGatheringMaterial,
      ).length,
      mobDropItems: mobDropItemDefinitions.length,
      mobDropTables: mobDropTables.length,
      recipes: recipeDefinitions.length,
    },
    coverage: {
      missingOutputs: [...missingOutputs],
      unresolvedUsedGatheringCount: unresolvedUsedGathering.length,
      unresolvedUsedGathering: unresolvedUsedGathering.slice(0, 20),
      unresolvedUnusedColumnMaterialsCount:
        unresolvedUnusedColumnMaterials.length,
      unresolvedUnusedColumnMaterialsSample:
        unresolvedUnusedColumnMaterials.slice(0, 20),
      missingMobDropIngredients: [...missingMobDropIngredients],
      mismatchedRecipesCount: mismatchedRecipes.length,
      mismatchedRecipes: mismatchedRecipes.slice(0, 20),
      gatheringMaterialsWithoutRecipeCount:
        gatheringMaterialsWithoutRecipe.length,
      gatheringMaterialsWithoutRecipeSample: gatheringMaterialsWithoutRecipe
        .slice(0, 20)
        .map((item) => item.name),
      recipeGatheringIngredientsNotGatherable,
    },
    recipeSymmetry: {
      byClass: recipeCountByClass,
      byTier: recipeCountByTier,
      byClassSlot: recipeCountByClassSlot,
      affinityViolationsCount: affinityViolations.length,
      affinityViolations: affinityViolations.slice(0, 20),
    },
    recipeQuantitySymmetry: buildRecipeQuantityAudit({ mobDropMetaByName }),
    gatheringSymmetry: {
      targetDemandPerOrigin: balancedGatheringDemandPerOrigin,
      targetDemandPerClassOrigin: balancedGatheringDemandPerClassOrigin,
      mainOriginOverrides: recipeMainGatheringOverrides.length,
      placementsByOrigin: gatheringPlacementsByOrigin,
      totalDemandByOrigin: summarizeDemand(gatheringDemandByOrigin),
      mainDemandByOrigin: gatheringMainDemandByOrigin,
      secondaryDemandByOrigin: gatheringSecondaryDemandByOrigin,
      demandByClassOrigin: gatheringDemandByClassOrigin,
    },
    mobDrops: {
      recipeMobDropItems: recipeMobDropIngredients.size,
      recipeMobDropItemsNotDropped: [...recipeMobDropIngredients].filter(
        (itemName) => !droppedItemNames.has(itemName),
      ),
      droppedItems: droppedItemNames.size,
      droppedItemsNotUsedInRecipes: [...droppedItemNames]
        .filter((itemName) => !recipeMobDropIngredients.has(itemName))
        .sort(),
      mobDropItemsNotDropped: mobDropItemDefinitions
        .map((item) => item.name)
        .filter((itemName) => !droppedItemNames.has(itemName)),
      mobDropTableIssues,
      occurrenceByItem: mobDropOccurrenceByItem,
      chanceSumByItem: mobDropChanceSumByItem,
      demandByRarityFamily: mobDropDemandByRarityFamily,
      supplyChanceByRarityFamily: mobDropSupplyByRarityFamily,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
