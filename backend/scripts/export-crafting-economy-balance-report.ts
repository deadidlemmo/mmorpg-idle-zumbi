import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MaterialOrigin } from '@prisma/client';
import { AUTO_COMBAT_ROUND_DURATION_SECONDS } from '../src/common/config/auto-combat.config';
import {
  GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
  GATHERING_RATE_BY_TIER,
  getGatheringRateMultiplier,
} from '../src/common/config/gathering.config';
import { getCraftingDurationSecondsForTier } from '../src/common/config/crafting.config';
import { getAutoCombatHuntingSecondsPerEnemy } from '../src/common/utils/auto-combat-hunting.util';
import {
  equipmentDefinitions,
  materialDefinitions,
} from '../prisma/seed-data/items.seed-data';
import { mobDropTables } from '../prisma/seed-data/mob-drops.seed-data';
import { recipeDefinitions } from '../prisma/seed-data/recipes.seed-data';

type CsvValue = string | number | boolean | null | undefined;

type RecipeEconomyRow = {
  outputItemName: string;
  className: string;
  slot: string;
  tier: number;
  gatheringQuantity: number;
  autoCombatDropQuantity: number;
  autoCombatExpectedKills: number;
  gatheringHours: number;
  autoCombatDropHours: number;
  craftingHours: number;
  totalHours: number;
  autoCombatSharePercent: number;
  freeSessionCrafts: number;
  premiumSessionCrafts: number;
};

type TierEconomyRow = {
  tier: number;
  recipes: number;
  gatheringLevel: number;
  huntingLevel: number;
  gatheringQuantity: number;
  autoCombatDropQuantity: number;
  autoCombatExpectedKills: number;
  gatheringHours: number;
  autoCombatDropHours: number;
  craftingHours: number;
  totalHours: number;
  autoCombatSharePercent: number;
  freeSessionCrafts: number;
  premiumSessionCrafts: number;
};

type DropEconomyRow = {
  outputItemName: string;
  dropItemName: string;
  tier: number;
  requiredQuantity: number;
  sourceMobCount: number;
  activeMobCount: number;
  totalEncounterWeight: number;
  weightedDropChancePercent: number;
  expectedQuantityPerEncounter: number;
  expectedKills: number;
  expectedHours: number;
};

const OUTPUT_DIR = resolve(
  process.cwd(),
  '..',
  '_reports',
  'auto-combat-balance',
);
const DATA_DIR = resolve(OUTPUT_DIR, 'dados-v5-2');
const ECONOMY_DOCS_DIR = resolve(
  process.cwd(),
  '..',
  'docs',
  'economia-crafting-csv',
);
const REPORT_BASENAME = 'balance-v5-2-crafting-gathering-autocombat';
const FREE_SESSION_HOURS = 6;
const PREMIUM_SESSION_HOURS = 12;

const REALISTIC_GATHERING_LEVEL_BY_TIER: Record<number, number> = {
  1: 5,
  2: 12,
  3: 18,
  4: 25,
  5: 30,
  6: 35,
  7: 40,
  8: 45,
  9: 48,
  10: 50,
};

const REALISTIC_HUNTING_LEVEL_BY_TIER = REALISTIC_GATHERING_LEVEL_BY_TIER;

const ESTIMATED_ROUNDS_PER_KILL_BY_TIER: Record<number, number> = {
  1: 3,
  2: 3,
  3: 4,
  4: 4,
  5: 5,
  6: 5,
  7: 6,
  8: 6,
  9: 7,
  10: 7,
};

const ACTIVE_AUTO_COMBAT_WEIGHT_BY_RANK = [42, 24, 15, 9, 6, 4] as const;

const CLASS_GATHERING_AFFINITIES: Record<string, MaterialOrigin[]> = {
  LUTADOR: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
  ATIRADOR: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.ARSENAL,
    MaterialOrigin.PATRULHA,
  ],
  ASSASSINO: [
    MaterialOrigin.PATRULHA,
    MaterialOrigin.ARSENAL,
    MaterialOrigin.TECNOVARREDURA,
  ],
  MEDICO: [
    MaterialOrigin.TECNOVARREDURA,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
};

const SERIES_COLORS = {
  gathering: '#f2ce45',
  autoCombat: '#6ee7b7',
  crafting: '#8fb3ff',
  free: '#f59e0b',
  premium: '#9bed5b',
  grid: '#243329',
  text: '#f7f0d2',
  muted: '#a9b29f',
  panel: '#101a14',
  stroke: '#304632',
};

function normalizeClassName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function csvValue(value: CsvValue) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function writeCsv(
  filePath: string,
  headers: string[],
  rows: Array<Record<string, CsvValue>>,
) {
  const lines = [
    headers.map(csvValue).join(';'),
    ...rows.map((row) =>
      headers.map((header) => csvValue(row[header])).join(';'),
    ),
  ];

  writeFileSync(filePath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function getGatheringRatePerHour(params: {
  itemName: string;
  origin: MaterialOrigin;
  tier: number;
  className: string;
}) {
  const material = materialDefinitions.find(
    (item) => item.name === params.itemName,
  );
  const materialTier = material?.tier ?? params.tier;
  const gatheringLevel =
    REALISTIC_GATHERING_LEVEL_BY_TIER[params.tier] ?? materialTier;
  const baseRate =
    material?.baseGatheringRatePerHour ??
    GATHERING_RATE_BY_TIER[materialTier] ??
    GATHERING_RATE_BY_TIER[params.tier] ??
    1;
  const classKey = normalizeClassName(params.className);
  const isAffinity =
    CLASS_GATHERING_AFFINITIES[classKey]?.includes(params.origin) ?? false;
  const affinityMultiplier = isAffinity
    ? GATHERING_AFFINITY_PRODUCTION_MULTIPLIER
    : 1;

  return baseRate * getGatheringRateMultiplier(gatheringLevel) * affinityMultiplier;
}

function getAutoCombatSecondsPerKill(tier: number) {
  const huntingLevel = REALISTIC_HUNTING_LEVEL_BY_TIER[tier] ?? 1;
  const huntingSeconds = getAutoCombatHuntingSecondsPerEnemy(huntingLevel);
  const combatSeconds =
    (ESTIMATED_ROUNDS_PER_KILL_BY_TIER[tier] ??
      ESTIMATED_ROUNDS_PER_KILL_BY_TIER[10]) *
    AUTO_COMBAT_ROUND_DURATION_SECONDS;

  return huntingSeconds + combatSeconds;
}

function getAutoCombatEncounterWeight(params: {
  table: (typeof mobDropTables)[number];
  tierDropTables: typeof mobDropTables;
}) {
  const activeTierIndex = params.tierDropTables.findIndex(
    (candidate) =>
      candidate.mobName === params.table.mobName &&
      candidate.mapName === params.table.mapName &&
      candidate.subMapName === params.table.subMapName,
  );

  return activeTierIndex >= 0
    ? ACTIVE_AUTO_COMBAT_WEIGHT_BY_RANK[activeTierIndex]
    : 0;
}

function getDropEconomy(params: {
  outputItemName: string;
  itemName: string;
  quantity: number;
  tier: number;
}): DropEconomyRow {
  const tierDropTables = mobDropTables.filter(
    (table) => table.tier === params.tier,
  );
  const totalEncounterWeight = tierDropTables.reduce(
    (total, table) =>
      total + getAutoCombatEncounterWeight({ table, tierDropTables }),
    0,
  );
  let expectedQuantityPerEncounter = 0;
  let weightedDropChancePercent = 0;
  let sourceMobCount = 0;

  for (const table of tierDropTables) {
    const encounterWeight = getAutoCombatEncounterWeight({
      table,
      tierDropTables,
    });
    const encounterShare =
      totalEncounterWeight > 0 ? encounterWeight / totalEncounterWeight : 0;
    const drop = table.drops.find(
      (candidate) => candidate.itemName === params.itemName,
    );

    if (!drop) continue;

    sourceMobCount += 1;
    const averageQuantity = (drop.minQuantity + drop.maxQuantity) / 2;
    expectedQuantityPerEncounter +=
      encounterShare * (drop.dropChance / 100) * averageQuantity;
    weightedDropChancePercent += encounterShare * drop.dropChance;
  }

  if (expectedQuantityPerEncounter <= 0) {
    throw new Error(`Drop sem fonte de AutoCombat: ${params.itemName}`);
  }

  const expectedKills = params.quantity / expectedQuantityPerEncounter;

  return {
    outputItemName: params.outputItemName,
    dropItemName: params.itemName,
    tier: params.tier,
    requiredQuantity: params.quantity,
    sourceMobCount,
    activeMobCount: tierDropTables.length,
    totalEncounterWeight,
    weightedDropChancePercent,
    expectedQuantityPerEncounter,
    expectedKills,
    expectedHours: (expectedKills * getAutoCombatSecondsPerKill(params.tier)) / 3600,
  };
}

function buildRecipeRows() {
  const equipmentByName = new Map(
    equipmentDefinitions.map((item) => [item.name, item]),
  );
  const dropRows: DropEconomyRow[] = [];

  const recipeRows = recipeDefinitions.map((recipe): RecipeEconomyRow => {
    const outputItem = equipmentByName.get(recipe.outputItemName);
    const className = outputItem?.className ?? 'UNKNOWN';
    let gatheringQuantity = 0;
    let autoCombatDropQuantity = 0;
    let autoCombatExpectedKills = 0;
    let gatheringHours = 0;
    let autoCombatDropHours = 0;

    for (const ingredient of recipe.ingredients) {
      if (ingredient.origin === MaterialOrigin.DROP_MOBS) {
        const dropEconomy = getDropEconomy({
          outputItemName: recipe.outputItemName,
          itemName: ingredient.itemName,
          quantity: ingredient.quantity,
          tier: recipe.tier,
        });

        dropRows.push(dropEconomy);
        autoCombatDropQuantity += ingredient.quantity;
        autoCombatExpectedKills += dropEconomy.expectedKills;
        autoCombatDropHours += dropEconomy.expectedHours;
        continue;
      }

      const ratePerHour = getGatheringRatePerHour({
        itemName: ingredient.itemName,
        origin: ingredient.origin,
        tier: recipe.tier,
        className,
      });

      gatheringQuantity += ingredient.quantity;
      gatheringHours += ingredient.quantity / ratePerHour;
    }

    const craftingHours =
      getCraftingDurationSecondsForTier(recipe.tier, 1) / 3600;
    const totalHours = gatheringHours + autoCombatDropHours + craftingHours;

    return {
      outputItemName: recipe.outputItemName,
      className,
      slot: outputItem?.slot ?? 'UNKNOWN',
      tier: recipe.tier,
      gatheringQuantity,
      autoCombatDropQuantity,
      autoCombatExpectedKills,
      gatheringHours,
      autoCombatDropHours,
      craftingHours,
      totalHours,
      autoCombatSharePercent:
        (autoCombatDropHours / (gatheringHours + autoCombatDropHours)) * 100,
      freeSessionCrafts: FREE_SESSION_HOURS / totalHours,
      premiumSessionCrafts: PREMIUM_SESSION_HOURS / totalHours,
    };
  });

  return {
    recipeRows,
    dropRows,
  };
}

function buildTierRows(recipeRows: RecipeEconomyRow[]) {
  return Array.from({ length: 10 }, (_, index): TierEconomyRow => {
    const tier = index + 1;
    const tierRows = recipeRows.filter((row) => row.tier === tier);

    return {
      tier,
      recipes: tierRows.length,
      gatheringLevel: REALISTIC_GATHERING_LEVEL_BY_TIER[tier],
      huntingLevel: REALISTIC_HUNTING_LEVEL_BY_TIER[tier],
      gatheringQuantity: round(average(tierRows.map((row) => row.gatheringQuantity))),
      autoCombatDropQuantity: round(
        average(tierRows.map((row) => row.autoCombatDropQuantity)),
      ),
      autoCombatExpectedKills: round(
        average(tierRows.map((row) => row.autoCombatExpectedKills)),
        1,
      ),
      gatheringHours: round(average(tierRows.map((row) => row.gatheringHours))),
      autoCombatDropHours: round(
        average(tierRows.map((row) => row.autoCombatDropHours)),
      ),
      craftingHours: round(average(tierRows.map((row) => row.craftingHours))),
      totalHours: round(average(tierRows.map((row) => row.totalHours))),
      autoCombatSharePercent: round(
        average(tierRows.map((row) => row.autoCombatSharePercent)),
      ),
      freeSessionCrafts: round(
        average(tierRows.map((row) => row.freeSessionCrafts)),
      ),
      premiumSessionCrafts: round(
        average(tierRows.map((row) => row.premiumSessionCrafts)),
      ),
    };
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLegend(items: Array<{ label: string; color: string }>, x: number, y: number) {
  return items
    .map(
      (item, index) => `
        <g transform="translate(${x + index * 155} ${y})">
          <rect width="14" height="14" rx="3" fill="${item.color}" />
          <text x="20" y="11" class="muted">${escapeXml(item.label)}</text>
        </g>`,
    )
    .join('');
}

function renderStackedHoursChart(rows: TierEconomyRow[], x: number, y: number) {
  const chartWidth = 560;
  const chartHeight = 245;
  const maxValue = 13;
  const barWidth = 32;
  const gap = 20;
  const originY = y + chartHeight;

  const bars = rows
    .map((row, index) => {
      const barX = x + 58 + index * (barWidth + gap);
      const gatheringHeight = (row.gatheringHours / maxValue) * chartHeight;
      const dropHeight = (row.autoCombatDropHours / maxValue) * chartHeight;
      const craftHeight = (row.craftingHours / maxValue) * chartHeight;
      const gatheringY = originY - gatheringHeight;
      const dropY = gatheringY - dropHeight;
      const craftY = dropY - craftHeight;

      return `
        <rect x="${barX}" y="${gatheringY}" width="${barWidth}" height="${gatheringHeight}" fill="${SERIES_COLORS.gathering}" rx="4" />
        <rect x="${barX}" y="${dropY}" width="${barWidth}" height="${dropHeight}" fill="${SERIES_COLORS.autoCombat}" rx="4" />
        <rect x="${barX}" y="${craftY}" width="${barWidth}" height="${Math.max(2, craftHeight)}" fill="${SERIES_COLORS.crafting}" rx="4" />
        <text x="${barX + barWidth / 2}" y="${originY + 22}" class="axis" text-anchor="middle">T${row.tier}</text>
        <text x="${barX + barWidth / 2}" y="${craftY - 8}" class="small" text-anchor="middle">${row.totalHours.toFixed(1)}h</text>
      `;
    })
    .join('');

  const lineY = (value: number) => originY - (value / maxValue) * chartHeight;

  return `
    <g>
      <text x="${x}" y="${y - 26}" class="title">Tempo medio por item craftado</text>
      <text x="${x}" y="${y - 8}" class="subtitle">Gathering + AutoCombat + duracao do craft, com niveis realistas por tier.</text>
      <rect x="${x}" y="${y}" width="${chartWidth}" height="${chartHeight}" class="plot" />
      ${[0, 3, 6, 9, 12].map((value) => `
        <line x1="${x}" x2="${x + chartWidth}" y1="${lineY(value)}" y2="${lineY(value)}" class="grid" />
        <text x="${x - 10}" y="${lineY(value) + 4}" class="axis" text-anchor="end">${value}h</text>
      `).join('')}
      <line x1="${x}" x2="${x + chartWidth}" y1="${lineY(6)}" y2="${lineY(6)}" class="free-line" />
      <line x1="${x}" x2="${x + chartWidth}" y1="${lineY(12)}" y2="${lineY(12)}" class="premium-line" />
      ${bars}
      ${renderLegend(
        [
          { label: 'Gathering', color: SERIES_COLORS.gathering },
          { label: 'AutoCombat', color: SERIES_COLORS.autoCombat },
          { label: 'Craft', color: SERIES_COLORS.crafting },
        ],
        x + 10,
        y + chartHeight + 48,
      )}
    </g>
  `;
}

function renderLineChart(params: {
  rows: TierEconomyRow[];
  x: number;
  y: number;
  title: string;
  subtitle: string;
  maxValue: number;
  series: Array<{
    key: keyof TierEconomyRow;
    label: string;
    color: string;
    suffix?: string;
  }>;
}) {
  const chartWidth = 560;
  const chartHeight = 220;
  const originY = params.y + chartHeight;
  const stepX = chartWidth / (params.rows.length - 1);
  const point = (row: TierEconomyRow, index: number, key: keyof TierEconomyRow) => {
    const value = Number(row[key]);
    return {
      x: params.x + index * stepX,
      y: originY - (value / params.maxValue) * chartHeight,
      value,
    };
  };

  const paths = params.series
    .map((series) => {
      const points = params.rows.map((row, index) => point(row, index, series.key));
      const d = points
        .map((candidate, index) =>
          `${index === 0 ? 'M' : 'L'}${candidate.x.toFixed(2)},${candidate.y.toFixed(2)}`,
        )
        .join(' ');

      return `
        <path d="${d}" fill="none" stroke="${series.color}" stroke-width="3" stroke-linecap="round" />
        ${points
          .map(
            (candidate) =>
              `<circle cx="${candidate.x}" cy="${candidate.y}" r="4" fill="${series.color}" />`,
          )
          .join('')}
      `;
    })
    .join('');

  return `
    <g>
      <text x="${params.x}" y="${params.y - 26}" class="title">${escapeXml(params.title)}</text>
      <text x="${params.x}" y="${params.y - 8}" class="subtitle">${escapeXml(params.subtitle)}</text>
      <rect x="${params.x}" y="${params.y}" width="${chartWidth}" height="${chartHeight}" class="plot" />
      ${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const value = params.maxValue * ratio;
        const gridY = originY - ratio * chartHeight;
        return `
          <line x1="${params.x}" x2="${params.x + chartWidth}" y1="${gridY}" y2="${gridY}" class="grid" />
          <text x="${params.x - 10}" y="${gridY + 4}" class="axis" text-anchor="end">${round(value, 1)}</text>
        `;
      }).join('')}
      ${params.rows
        .map((row, index) => `
          <text x="${params.x + index * stepX}" y="${originY + 22}" class="axis" text-anchor="middle">T${row.tier}</text>
        `)
        .join('')}
      ${paths}
      ${renderLegend(
        params.series.map((series) => ({
          label: series.label,
          color: series.color,
        })),
        params.x + 10,
        params.y + chartHeight + 48,
      )}
    </g>
  `;
}

function renderSvg(tierRows: TierEconomyRow[]) {
  const totalMax = Math.max(...tierRows.map((row) => row.totalHours));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="980" viewBox="0 0 1320 980">
  <style>
    .bg { fill: #07110d; }
    .panel { fill: ${SERIES_COLORS.panel}; stroke: ${SERIES_COLORS.stroke}; stroke-width: 1.2; }
    .plot { fill: #0a130f; stroke: #243329; stroke-width: 1; }
    .grid { stroke: ${SERIES_COLORS.grid}; stroke-width: 1; opacity: 0.78; }
    .free-line { stroke: ${SERIES_COLORS.free}; stroke-width: 1.5; stroke-dasharray: 5 6; opacity: 0.8; }
    .premium-line { stroke: ${SERIES_COLORS.premium}; stroke-width: 1.5; stroke-dasharray: 5 6; opacity: 0.8; }
    .headline { fill: ${SERIES_COLORS.text}; font: 700 28px Arial, sans-serif; }
    .title { fill: ${SERIES_COLORS.text}; font: 700 17px Arial, sans-serif; }
    .subtitle { fill: ${SERIES_COLORS.muted}; font: 12px Arial, sans-serif; }
    .muted { fill: ${SERIES_COLORS.muted}; font: 12px Arial, sans-serif; }
    .axis { fill: #b9c4ad; font: 11px Arial, sans-serif; }
    .small { fill: ${SERIES_COLORS.text}; font: 10px Arial, sans-serif; }
    .pill { fill: #122119; stroke: #2f4c34; stroke-width: 1; }
    .pill-text { fill: ${SERIES_COLORS.text}; font: 700 12px Arial, sans-serif; }
  </style>
  <rect class="bg" width="1320" height="980" />
  <text x="48" y="58" class="headline">Balance V5.2 - Crafting, Gathering e AutoCombat</text>
  <text x="48" y="82" class="subtitle">Custo medio para criar 1 equipamento por tier. Considera sessoes free 6h, premium 12h, niveis realistas de gathering/caca e drops reais ponderados pela aparicao dos mobs ativos.</text>
  <g transform="translate(48 112)">
    <rect class="panel" width="1224" height="810" rx="14" />
    ${renderStackedHoursChart(tierRows, 60, 82)}
    ${renderLineChart({
      rows: tierRows,
      x: 650,
      y: 82,
      title: 'Participacao do AutoCombat no custo',
      subtitle: 'Percentual dos materiais vindo de drops, por tempo esperado.',
      maxValue: 50,
      series: [
        {
          key: 'autoCombatSharePercent',
          label: 'AutoCombat %',
          color: SERIES_COLORS.autoCombat,
        },
      ],
    })}
    ${renderLineChart({
      rows: tierRows,
      x: 60,
      y: 480,
      title: 'Quantidade media exigida por receita',
      subtitle: 'Gathering principal+secundario contra biomaterial+residuo.',
      maxValue: 450,
      series: [
        {
          key: 'gatheringQuantity',
          label: 'Itens de Gathering',
          color: SERIES_COLORS.gathering,
        },
        {
          key: 'autoCombatDropQuantity',
          label: 'Drops AutoCombat',
          color: SERIES_COLORS.autoCombat,
        },
      ],
    })}
    ${renderLineChart({
      rows: tierRows,
      x: 650,
      y: 480,
      title: 'Crafts completos por janela idle',
      subtitle: 'Quantos equipamentos completos cabem em 6h e 12h teoricas.',
      maxValue: Math.max(7, Math.ceil(12 / Math.max(1, totalMax))),
      series: [
        {
          key: 'freeSessionCrafts',
          label: 'Free 6h',
          color: SERIES_COLORS.free,
        },
        {
          key: 'premiumSessionCrafts',
          label: 'Premium 12h',
          color: SERIES_COLORS.premium,
        },
      ],
    })}
  </g>
</svg>
`;
}

function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(ECONOMY_DOCS_DIR, { recursive: true });

  const { recipeRows, dropRows } = buildRecipeRows();
  const tierRows = buildTierRows(recipeRows);
  const report = {
    assumptions: {
      freeSessionHours: FREE_SESSION_HOURS,
      premiumSessionHours: PREMIUM_SESSION_HOURS,
      realisticGatheringLevelByTier: REALISTIC_GATHERING_LEVEL_BY_TIER,
      realisticHuntingLevelByTier: REALISTIC_HUNTING_LEVEL_BY_TIER,
      estimatedRoundsPerKillByTier: ESTIMATED_ROUNDS_PER_KILL_BY_TIER,
      autoCombatRoundDurationSeconds: AUTO_COMBAT_ROUND_DURATION_SECONDS,
      dropTimeModel:
        'expectedHours = requiredQty / weightedExpectedQtyPerEncounter * (huntingSeconds + estimatedCombatRounds * roundSeconds)',
      dropRateModel:
        'weightedExpectedQtyPerEncounter = sum(encounterWeightShare * dropChance * averageDropQuantity) across active mobs in recipe tier',
      gatheringTimeModel:
        'expectedHours = requiredQuantity / (baseTierRate * skillMultiplier * affinityMultiplier)',
    },
    tierRows,
    recipeRows: recipeRows.map((row) => ({
      ...row,
      gatheringHours: round(row.gatheringHours),
      autoCombatDropHours: round(row.autoCombatDropHours),
      craftingHours: round(row.craftingHours),
      totalHours: round(row.totalHours),
      autoCombatSharePercent: round(row.autoCombatSharePercent),
      freeSessionCrafts: round(row.freeSessionCrafts),
      premiumSessionCrafts: round(row.premiumSessionCrafts),
    })),
    dropRows: dropRows.map((row) => ({
      ...row,
      weightedDropChancePercent: round(row.weightedDropChancePercent),
      expectedQuantityPerEncounter: round(row.expectedQuantityPerEncounter, 4),
      expectedKills: round(row.expectedKills, 1),
      expectedHours: round(row.expectedHours),
    })),
  };

  const tierCsvRows = tierRows.map((row) => ({
    tier: row.tier,
    receitas: row.recipes,
    nivelGatheringRealista: row.gatheringLevel,
    nivelCacaRealista: row.huntingLevel,
    qtdGatheringMedia: row.gatheringQuantity,
    qtdDropsAutoCombatMedia: row.autoCombatDropQuantity,
    killsEsperadasDropsMedia: row.autoCombatExpectedKills,
    horasGathering: row.gatheringHours,
    horasAutoCombatDrops: row.autoCombatDropHours,
    horasCrafting: row.craftingHours,
    horasTotais: row.totalHours,
    percentualAutoCombat: row.autoCombatSharePercent,
    craftsEm6hFree: row.freeSessionCrafts,
    craftsEm12hPremium: row.premiumSessionCrafts,
  }));
  const recipeCsvRows = report.recipeRows.map((row) => ({
    item: row.outputItemName,
    classe: row.className,
    slot: row.slot,
    tier: row.tier,
    qtdGathering: row.gatheringQuantity,
    qtdDropsAutoCombat: row.autoCombatDropQuantity,
    killsEsperadasDrops: round(row.autoCombatExpectedKills, 1),
    horasGathering: row.gatheringHours,
    horasAutoCombatDrops: row.autoCombatDropHours,
    horasCrafting: row.craftingHours,
    horasTotais: row.totalHours,
    percentualAutoCombat: row.autoCombatSharePercent,
    craftsEm6hFree: row.freeSessionCrafts,
    craftsEm12hPremium: row.premiumSessionCrafts,
  }));
  const dropCsvRows = report.dropRows.map((row) => ({
    receita: row.outputItemName,
    itemDrop: row.dropItemName,
    tier: row.tier,
    quantidadeNecessaria: row.requiredQuantity,
    mobsFonteNoTier: row.sourceMobCount,
    mobsAtivosNoTier: row.activeMobCount,
    pesoTotalEncontro: row.totalEncounterWeight,
    chancePonderadaPercentual: row.weightedDropChancePercent,
    quantidadeEsperadaPorEncontro: row.expectedQuantityPerEncounter,
    killsEsperadas: row.expectedKills,
    horasEsperadas: row.expectedHours,
  }));

  writeFileSync(
    resolve(DATA_DIR, `${REPORT_BASENAME}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  writeCsv(
    resolve(DATA_DIR, `${REPORT_BASENAME}-por-tier.csv`),
    Object.keys(tierCsvRows[0]),
    tierCsvRows,
  );
  writeCsv(
    resolve(DATA_DIR, `${REPORT_BASENAME}-receitas.csv`),
    Object.keys(recipeCsvRows[0]),
    recipeCsvRows,
  );
  writeCsv(
    resolve(DATA_DIR, `${REPORT_BASENAME}-drops-receitas.csv`),
    Object.keys(dropCsvRows[0]),
    dropCsvRows,
  );
  writeCsv(
    resolve(ECONOMY_DOCS_DIR, '11_balanceamento_tempo_receitas.csv'),
    Object.keys(recipeCsvRows[0]),
    recipeCsvRows,
  );
  writeCsv(
    resolve(ECONOMY_DOCS_DIR, '12_balanceamento_tempo_por_tier.csv'),
    Object.keys(tierCsvRows[0]),
    tierCsvRows,
  );
  writeCsv(
    resolve(ECONOMY_DOCS_DIR, '13_balanceamento_drops_receitas.csv'),
    Object.keys(dropCsvRows[0]),
    dropCsvRows,
  );
  writeFileSync(
    resolve(OUTPUT_DIR, `${REPORT_BASENAME}.svg`),
    renderSvg(tierRows),
    'utf8',
  );

  console.table(tierCsvRows);
  console.log(`Relatorio gerado em: ${OUTPUT_DIR}`);
}

main();
