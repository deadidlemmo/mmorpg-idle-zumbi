import fs from 'node:fs';
import path from 'node:path';
import {
  materialDefinitions,
  equipmentDefinitions,
} from './seed-data/items.seed-data';
import { mobDropItemDefinitions } from './seed-data/mob-drops.seed-data';
import {
  recipeMainGatheringOverrides,
  type GatheringOriginCode,
} from './seed-data/recipe-balance-overrides.seed-data';

type CsvRow = Record<string, string>;

const ORIGIN_BY_LABEL = {
  Desmanche: 'DESMANCHE',
  Coleta: 'COLETA',
  Contenção: 'CONTENCAO',
  Arsenal: 'ARSENAL',
  Patrulha: 'PATRULHA',
  Tecnovarredura: 'TECNOVARREDURA',
} as const;

const SLOT_BY_LABEL = {
  Armadura: 'ARMOR',
  Pernas: 'PANTS',
  Pés: 'BOOTS',
  Elmo: 'HEAD',
  'Main Hand': 'MAIN_HAND',
  'Off Hand': 'OFF_HAND',
} as const;

const DISAMBIGUATION_SUFFIX_PATTERN =
  / \((?:Desmanche|Coleta|Contenção|Arsenal|Patrulha|Tecnovarredura) T\d+ [^)]+\)$/;

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

  if (lines.length <= 1) return [];

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    );
  });
}

function stripDisambiguationSuffix(name: string): string {
  return name.replace(DISAMBIGUATION_SUFFIX_PATTERN, '');
}

function toStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function toNumber(value: string, fieldName: string, outputItemName: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(
      `Campo numérico inválido em ${outputItemName}: ${fieldName}="${value}".`,
    );
  }

  return numberValue;
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

function resolveIngredientName(params: {
  name: string;
  origin: string;
  tier: number;
  slot: string;
  outputItemName: string;
}) {
  if (params.origin === 'DROP_MOBS' && itemNames.has(params.name)) {
    return params.name;
  }

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

  const candidates = materialDefinitions.filter(
    (material) =>
      stripDisambiguationSuffix(material.name) === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier &&
      material.materialSlot === params.slot,
  );

  if (candidates.length === 1) return candidates[0].name;

  const candidatesByOriginAndTier = materialDefinitions.filter(
    (material) =>
      stripDisambiguationSuffix(material.name) === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier,
  );

  if (candidatesByOriginAndTier.length === 1) {
    return candidatesByOriginAndTier[0].name;
  }

  throw new Error(
    [
      `Ingrediente não resolvido: ${params.name}`,
      `Receita: ${params.outputItemName}`,
      `Origem: ${params.origin}`,
      `Tier: ${params.tier}`,
      `Slot: ${params.slot}`,
      `Candidatos: ${
        candidates.map((candidate) => candidate.name).join(', ') || 'nenhum'
      }`,
    ].join(' | '),
  );
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

  const candidates = materialDefinitions.filter(
    (material) =>
      stripDisambiguationSuffix(material.name) === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier &&
      material.materialSlot === params.slot &&
      material.isGatheringMaterial,
  );

  if (candidates.length === 1) return candidates[0].name;

  const candidatesByOriginAndTier = materialDefinitions.filter(
    (material) =>
      stripDisambiguationSuffix(material.name) === params.name &&
      material.materialOrigin === params.origin &&
      material.tier === params.tier &&
      material.isGatheringMaterial,
  );

  if (candidatesByOriginAndTier.length === 1) {
    return candidatesByOriginAndTier[0].name;
  }

  return null;
}

function chooseBalancedMainMaterial(params: {
  row: CsvRow;
  outputItemName: string;
  targetOrigin: GatheringOriginCode;
  tier: number;
  slot: string;
  secondaryItemName: string;
}) {
  const unusedOrigin = getRequiredOrigin(
    params.row['Origem não usada'],
    params.outputItemName,
  );

  if (unusedOrigin === params.targetOrigin) {
    const resolvedUnused = resolveGatheringMaterialForOrigin({
      name: params.row['Material não usado'],
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

  if (candidates.length > 0) return candidates[0].name;

  const sameTierCandidates = materialDefinitions
    .filter(
      (material) =>
        material.materialOrigin === params.targetOrigin &&
        material.tier === params.tier &&
        material.isGatheringMaterial &&
        material.name !== params.secondaryItemName,
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

  if (sameTierCandidates.length > 0) return sameTierCandidates[0].name;

  throw new Error(
    [
      `Material principal balanceado não encontrado para ${params.outputItemName}`,
      `Origem alvo: ${params.targetOrigin}`,
      `Tier: ${params.tier}`,
      `Slot: ${params.slot}`,
    ].join(' | '),
  );
}

function getRequiredOrigin(label: string, outputItemName: string) {
  const origin = ORIGIN_BY_LABEL[label as keyof typeof ORIGIN_BY_LABEL];

  if (!origin) {
    throw new Error(`Origem inválida em ${outputItemName}: ${label}`);
  }

  return origin;
}

function getRequiredSlot(label: string, outputItemName: string) {
  const slot = SLOT_BY_LABEL[label as keyof typeof SLOT_BY_LABEL];

  if (!slot) {
    throw new Error(`Slot inválido em ${outputItemName}: ${label}`);
  }

  return slot;
}

function buildRecipesFile(rows: CsvRow[]) {
  const output: string[] = [
    "import { CraftIngredientRole, MaterialOrigin } from '@prisma/client';",
    "import type { CraftingRecipeSeedData } from '../seed-types';",
    '',
    '// Receitas canônicas geradas a partir de receitas_corrigidas_2principal_1secundario.csv.',
    '// Mantenha este arquivo como a fonte centralizada dos ingredientes de crafting.',
    'export const recipeDefinitions: CraftingRecipeSeedData[] = [',
  ];

  for (const row of rows) {
    const outputItemName = row.Item;
    const tier = toNumber(row.Tier, 'Tier', outputItemName);
    const slot = getRequiredSlot(row.Slot, outputItemName);

    if (!itemNames.has(outputItemName)) {
      throw new Error(
        `Item craftável não encontrado no seed: ${outputItemName}`,
      );
    }

    const secondaryOrigin = getRequiredOrigin(
      row['Gathering Secundário'],
      outputItemName,
    );
    const resolvedSecondaryItemName = resolveIngredientName({
      name: row['Material Secundário'],
      origin: secondaryOrigin,
      tier,
      slot,
      outputItemName,
    });
    const mainOverride = mainGatheringOverrideByOutput.get(outputItemName);
    const mainOrigin =
      mainOverride?.targetMainOrigin ??
      getRequiredOrigin(row['Gathering Principal'], outputItemName);
    const mainItemName = mainOverride
      ? chooseBalancedMainMaterial({
          row,
          outputItemName,
          targetOrigin: mainOverride.targetMainOrigin,
          tier,
          slot,
          secondaryItemName: resolvedSecondaryItemName,
        })
      : row['Material Principal'];

    const ingredients = [
      {
        name: mainItemName,
        quantity: toNumber(
          row['Qtd Material Principal'],
          'Qtd Material Principal',
          outputItemName,
        ),
        role: 'MAIN_COMPONENT',
        origin: mainOrigin,
      },
      {
        name: resolvedSecondaryItemName,
        quantity: toNumber(
          row['Qtd Material Secundário'],
          'Qtd Material Secundário',
          outputItemName,
        ),
        role: 'SHARED_MATERIAL',
        origin: secondaryOrigin,
      },
      {
        name: row['Drop de mob'],
        quantity: toNumber(
          row['Qtd Drop de mob'],
          'Qtd Drop de mob',
          outputItemName,
        ),
        role: 'RARE_MOB_DROP',
        origin: 'DROP_MOBS',
      },
      {
        name: row['Resíduo de mob'],
        quantity: toNumber(
          row['Qtd Resíduo de mob'],
          'Qtd Resíduo de mob',
          outputItemName,
        ),
        role: 'RARE_MOB_DROP',
        origin: 'DROP_MOBS',
      },
    ].map((ingredient) => ({
      ...ingredient,
      name: resolveIngredientName({
        name: ingredient.name,
        origin: ingredient.origin,
        tier,
        slot,
        outputItemName,
      }),
    }));

    output.push('  {');
    output.push(`    outputItemName: ${toStringLiteral(outputItemName)},`);
    output.push(`    tier: ${tier},`);
    output.push('    outputQuantity: 1,');
    output.push('    ingredients: [');

    for (const ingredient of ingredients) {
      output.push('      {');
      output.push(`        itemName: ${toStringLiteral(ingredient.name)},`);
      output.push(`        quantity: ${ingredient.quantity},`);
      output.push(`        role: CraftIngredientRole.${ingredient.role},`);
      output.push(`        origin: MaterialOrigin.${ingredient.origin},`);
      output.push('      },');
    }

    output.push('    ],');
    output.push('  },');
  }

  output.push('];');
  output.push('');

  return output.join('\n');
}

function main() {
  const csvPath = process.argv[2];
  const outputPath =
    process.argv[3] ??
    path.join(process.cwd(), 'prisma', 'seed-data', 'recipes.seed-data.ts');

  if (!csvPath) {
    throw new Error(
      'Informe o caminho do CSV. Ex.: npm exec tsx prisma/generate-recipes-from-csv.ts <arquivo.csv>',
    );
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const fileContent = buildRecipesFile(rows);

  fs.writeFileSync(outputPath, fileContent, 'utf8');

  console.log(`Receitas geradas: ${rows.length}`);
  console.log(`Arquivo atualizado: ${outputPath}`);
}

main();
