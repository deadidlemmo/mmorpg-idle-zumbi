import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUTO_COMBAT_BALANCE_MODEL_LABEL } from '../src/common/config/combat-balance.config';
import {
  AUTO_COMBAT_HUNTING_LEVEL_CAP,
  AUTO_COMBAT_HUNTING_XP_PER_ENEMY,
} from '../src/common/config/auto-combat.config';
import {
  getAutoCombatHuntingSecondsPerEnemy,
  getAutoCombatHuntingXpToNextLevel,
} from '../src/common/utils/auto-combat-hunting.util';

type ReportOptions = {
  kills: number;
  huntingLevel: number;
  huntingLevels: number[];
  outputDir: string;
};

type ChartRow = {
  tier: number;
  className: string;
  [key: string]: string | number;
};

type ChartMetric = {
  source: 'xp' | 'survival' | 'matrix' | 'progress';
  key: string;
  title: string;
  subtitle: string;
  yLabel: string;
  section: string;
  fixedMax?: number;
  xKey?: string;
  xValues?: number[];
  xLabelPrefix?: string;
  tierFilter?: number;
  valueSuffix?: string;
};

const DEFAULT_KILLS = 1000;
const DEFAULT_HUNTING_LEVEL = 50;
const DEFAULT_HUNTING_LEVELS = [1, 10, 25, 50];

const CLASS_COLORS: Record<string, string> = {
  Lutador: '#d94b4b',
  Assassino: '#8b5cf6',
  Atirador: '#2563eb',
  Medico: '#16a34a',
  Caca: '#0f766e',
};

const CLASS_ORDER = ['Lutador', 'Assassino', 'Atirador', 'Medico'];
const PROGRESS_SERIES_ORDER = ['Caca'];

const CHART_METRICS: ChartMetric[] = [
  {
    source: 'xp',
    key: 'effectiveXpPerHour',
    title: 'XP efetivo por hora',
    subtitle: 'Tempo de caca + TTK, mapas reais e mobs ponderados.',
    yLabel: 'XP/h',
    section: 'XP, tempo e pocoes',
  },
  {
    source: 'xp',
    key: 'xpPerHourVsBestPercent',
    title: 'XP/h relativo ao melhor',
    subtitle: 'Quanto cada classe fica perto da melhor no tier.',
    yLabel: '%',
    fixedMax: 100,
    section: 'XP, tempo e pocoes',
  },
  {
    source: 'xp',
    key: 'timeHours',
    title: 'Tempo para 1000 mobs',
    subtitle: 'Tempo total teorico da amostra.',
    yLabel: 'Horas',
    section: 'XP, tempo e pocoes',
  },
  {
    source: 'xp',
    key: 'potionsUsed',
    title: 'Pocoes por 1000 mobs',
    subtitle: 'Projecao com cura por pocoes, sem descanso automatico.',
    yLabel: 'Pocoes',
    section: 'XP, tempo e pocoes',
  },
  {
    source: 'survival',
    key: 'noPotionBattles',
    title: 'Batalhas sem pocao',
    subtitle: 'HP cheio, ate cair, sem cura.',
    yLabel: 'Batalhas',
    section: 'Sobrevivencia direta',
  },
  {
    source: 'survival',
    key: 'potions25Battles',
    title: 'Batalhas com 25 pocoes',
    subtitle: 'Mesmo estoque para todas as classes.',
    yLabel: 'Batalhas',
    section: 'Sobrevivencia direta',
  },
  {
    source: 'survival',
    key: 'potions100Battles',
    title: 'Batalhas com 100 pocoes',
    subtitle: 'Comparacao de sustentacao com estoque igual.',
    yLabel: 'Batalhas',
    section: 'Sobrevivencia direta',
  },
  {
    source: 'survival',
    key: 'potions100VsBestPercent',
    title: '100 pocoes relativo ao melhor',
    subtitle: 'Quanto cada classe fica perto da melhor sobrevivencia.',
    yLabel: '%',
    fixedMax: 100,
    section: 'Sobrevivencia direta',
  },
  {
    source: 'survival',
    key: 'averageDamagePerBattle',
    title: 'Dano medio por batalha',
    subtitle: 'Dano esperado ponderado pelos mobs reais.',
    yLabel: 'Dano',
    section: 'Pressao de dano',
  },
  {
    source: 'survival',
    key: 'damagePer1000Battles',
    title: 'Dano por 1000 batalhas',
    subtitle: 'Pressao bruta de cura, sem economia.',
    yLabel: 'Dano',
    section: 'Pressao de dano',
  },
  {
    source: 'survival',
    key: 'strongestMobNoPotionBattles',
    title: 'Rank 6 sem pocao',
    subtitle: 'Sequencia apenas contra o mob mais forte do tier.',
    yLabel: 'Batalhas',
    section: 'Sequencias ruins',
  },
  {
    source: 'survival',
    key: 'worstSequence25PotionsBattles',
    title: 'Sequencia ruim com 25 pocoes',
    subtitle: 'Sequencia extrema alternando mobs rank 5 e 6.',
    yLabel: 'Batalhas',
    section: 'Sequencias ruins',
  },
  {
    source: 'survival',
    key: 'worstSequence100PotionsBattles',
    title: 'Sequencia ruim com 100 pocoes',
    subtitle: 'Mesmo cenario extremo, estoque maior.',
    yLabel: 'Batalhas',
    section: 'Sequencias ruins',
  },
  {
    source: 'survival',
    key: 'strongestMob100PotionsBattles',
    title: 'Rank 6 com 100 pocoes',
    subtitle: 'Quanto cada classe sustenta contra o mob mais forte.',
    yLabel: 'Batalhas',
    section: 'Sequencias ruins',
  },
  {
    source: 'progress',
    key: 'secondsPerFind',
    title: 'Tempo para encontrar mob',
    subtitle: 'Curva real da skill de caca, do nivel 1 ao 50.',
    yLabel: 'Segundos',
    section: 'Caca e progressao',
    xKey: 'huntingLevel',
    xValues: [1, 10, 20, 30, 40, 50],
    xLabelPrefix: 'C',
  },
  {
    source: 'progress',
    key: 'cumulativeHoursToReachLevel',
    title: 'Tempo para subir caca',
    subtitle: 'Horas acumuladas estimadas para atingir cada nivel de caca.',
    yLabel: 'Horas',
    section: 'Caca e progressao',
    xKey: 'huntingLevel',
    xValues: [1, 10, 20, 30, 40, 50],
    xLabelPrefix: 'C',
  },
  {
    source: 'matrix',
    key: 'effectiveXpPerHour',
    title: 'XP/h por nivel de caca (T10)',
    subtitle: 'Sensibilidade do XP/h ao tempo de encontrar mobs.',
    yLabel: 'XP/h',
    section: 'Caca e progressao',
    xKey: 'huntingLevel',
    xValues: DEFAULT_HUNTING_LEVELS,
    xLabelPrefix: 'C',
    tierFilter: 10,
  },
  {
    source: 'matrix',
    key: 'timeHours',
    title: 'Tempo por 1000 mobs (T10)',
    subtitle: 'Quanto a skill de caca reduz o tempo total da amostra.',
    yLabel: 'Horas',
    section: 'Caca e progressao',
    xKey: 'huntingLevel',
    xValues: DEFAULT_HUNTING_LEVELS,
    xLabelPrefix: 'C',
    tierFilter: 10,
    valueSuffix: 'h',
  },
  {
    source: 'matrix',
    key: 'potionsPerHour',
    title: 'Pocoes por hora (T10)',
    subtitle: 'Consumo real por tempo, nao apenas por quantidade de mobs.',
    yLabel: 'Pocoes/h',
    section: 'Caca e progressao',
    xKey: 'huntingLevel',
    xValues: DEFAULT_HUNTING_LEVELS,
    xLabelPrefix: 'C',
    tierFilter: 10,
  },
];

function splitArg(arg: string) {
  const separatorIndex = arg.indexOf('=');

  if (separatorIndex < 0) {
    return [arg, undefined] as const;
  }

  return [arg.slice(0, separatorIndex), arg.slice(separatorIndex + 1)] as const;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseHuntingLevels(value: string | undefined) {
  const parsed = String(value ?? '')
    .split(',')
    .map((part) => parsePositiveInteger(part.trim(), 0))
    .filter((level) => level > 0)
    .map((level) => Math.min(AUTO_COMBAT_HUNTING_LEVEL_CAP, level));
  const unique = Array.from(new Set(parsed)).sort((left, right) => left - right);

  return unique.length > 0 ? unique : DEFAULT_HUNTING_LEVELS;
}

function parseArgs(): ReportOptions {
  const options: ReportOptions = {
    kills: DEFAULT_KILLS,
    huntingLevel: DEFAULT_HUNTING_LEVEL,
    huntingLevels: DEFAULT_HUNTING_LEVELS,
    outputDir: resolve(process.cwd(), '..', '_reports', 'auto-combat-balance'),
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = splitArg(arg);

    switch (key) {
      case '--kills':
        options.kills = parsePositiveInteger(value, DEFAULT_KILLS);
        break;
      case '--hunting-level':
        options.huntingLevel = parsePositiveInteger(value, DEFAULT_HUNTING_LEVEL);
        break;
      case '--hunting-levels':
        options.huntingLevels = parseHuntingLevels(value);
        break;
      case '--output-dir':
        options.outputDir = resolve(process.cwd(), value ?? options.outputDir);
        break;
      default:
        break;
    }
  }

  return options;
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function resolveReportInputPath(outputDir: string, fileName: string) {
  const rootPath = resolve(outputDir, fileName);

  if (existsSync(rootPath)) {
    return rootPath;
  }

  const versionSlug = toSlug(AUTO_COMBAT_BALANCE_MODEL_LABEL).replace(
    /^balance-/,
    '',
  );
  const organizedDataPath = resolve(outputDir, `dados-${versionSlug}`, fileName);

  if (existsSync(organizedDataPath)) {
    return organizedDataPath;
  }

  return rootPath;
}

function roundNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function getMetricRows(rows: ChartRow[], metric: ChartMetric) {
  return rows.filter((row) => {
    if (metric.tierFilter && Number(row.tier) !== metric.tierFilter) {
      return false;
    }

    return true;
  });
}

function getMetricMax(rows: ChartRow[], metric: ChartMetric) {
  if (metric.fixedMax) {
    return metric.fixedMax;
  }

  const metricRows = getMetricRows(rows, metric);

  return (
    Math.max(1, ...metricRows.map((row) => Number(row[metric.key]) || 0)) *
    1.12
  );
}

function buildLinePath(params: {
  rows: ChartRow[];
  className: string;
  metric: ChartMetric;
  x: number;
  y: number;
  width: number;
  height: number;
  yMax: number;
}) {
  const metricRows = getMetricRows(params.rows, params.metric);
  const xKey = params.metric.xKey ?? 'tier';
  const xValues =
    params.metric.xValues ??
    Array.from({ length: 10 }, (_, index) => index + 1);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const classRows = metricRows
    .filter((row) => row.className === params.className)
    .sort(
      (left, right) =>
        Number(left[xKey]) - Number(right[xKey]) || left.tier - right.tier,
    );
  const points = classRows.map((row) => {
    const rawX = Number(row[xKey]) || xMin;
    const xRatio = xMax > xMin ? (rawX - xMin) / (xMax - xMin) : 0;
    const x =
      params.x + xRatio * Math.max(1, params.width - 10) + 5;
    const y =
      params.y +
      params.height -
      (Number(row[params.metric.key]) / params.yMax) * params.height;

    return {
      x: roundNumber(x, 2),
      y: roundNumber(y, 2),
      row,
    };
  });
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  return { path, points };
}

function renderChart(params: {
  rows: ChartRow[];
  metric: ChartMetric;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const plotLeft = params.x + 70;
  const plotTop = params.y + 78;
  const plotWidth = params.width - 105;
  const plotHeight = params.height - 128;
  const yMax = getMetricMax(params.rows, params.metric);
  const gridLines = Array.from({ length: 5 }, (_, index) => index);
  const xLabels =
    params.metric.xValues ??
    Array.from({ length: 10 }, (_, index) => index + 1);
  const xMin = Math.min(...xLabels);
  const xMax = Math.max(...xLabels);
  const seriesOrder =
    params.metric.source === 'progress' ? PROGRESS_SERIES_ORDER : CLASS_ORDER;
  const elements: string[] = [];

  elements.push(
    `<g class="chart">`,
    `<rect x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" rx="12" fill="#ffffff" stroke="#d7dde8"/>`,
    `<text x="${params.x + 24}" y="${params.y + 32}" class="chart-title">${escapeXml(params.metric.title)}</text>`,
    `<text x="${params.x + 24}" y="${params.y + 54}" class="chart-subtitle">${escapeXml(params.metric.subtitle)}</text>`,
  );

  for (const index of gridLines) {
    const ratio = index / (gridLines.length - 1);
    const y = plotTop + plotHeight - ratio * plotHeight;
    const value = yMax * ratio;

    elements.push(
      `<line x1="${plotLeft}" y1="${roundNumber(y, 2)}" x2="${plotLeft + plotWidth}" y2="${roundNumber(y, 2)}" stroke="#e8edf5"/>`,
      `<text x="${plotLeft - 12}" y="${roundNumber(y + 4, 2)}" text-anchor="end" class="axis-label">${escapeXml(formatNumber(value))}</text>`,
    );
  }

  elements.push(
    `<line x1="${plotLeft}" y1="${plotTop}" x2="${plotLeft}" y2="${plotTop + plotHeight}" stroke="#98a2b3"/>`,
    `<line x1="${plotLeft}" y1="${plotTop + plotHeight}" x2="${plotLeft + plotWidth}" y2="${plotTop + plotHeight}" stroke="#98a2b3"/>`,
    `<text x="${plotLeft - 52}" y="${plotTop - 12}" class="axis-title">${escapeXml(params.metric.yLabel)}</text>`,
  );

  for (const value of xLabels) {
    const xRatio = xMax > xMin ? (value - xMin) / (xMax - xMin) : 0;
    const x = plotLeft + xRatio * Math.max(1, plotWidth - 10) + 5;

    elements.push(
      `<text x="${roundNumber(x, 2)}" y="${plotTop + plotHeight + 24}" text-anchor="middle" class="axis-label">${escapeXml(`${params.metric.xLabelPrefix ?? 'T'}${value}`)}</text>`,
    );
  }

  seriesOrder.forEach((className, classIndex) => {
    const color = CLASS_COLORS[className] ?? '#475467';
    const { path, points } = buildLinePath({
      rows: params.rows,
      className,
      metric: params.metric,
      x: plotLeft,
      y: plotTop,
      width: plotWidth,
      height: plotHeight,
      yMax,
    });
    const legendX = params.x + 24 + classIndex * 132;
    const legendY = params.y + params.height - 22;

    elements.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );

    for (const point of points) {
      elements.push(
        `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}" stroke="#ffffff" stroke-width="1.5">` +
          `<title>${escapeXml(`${className} ${params.metric.xLabelPrefix ?? 'T'}${point.row[params.metric.xKey ?? 'tier']}: ${formatNumber(Number(point.row[params.metric.key]) || 0)}${params.metric.valueSuffix ?? ''}`)}</title>` +
          `</circle>`,
      );
    }

    elements.push(
      `<circle cx="${legendX}" cy="${legendY}" r="5" fill="${color}"/>`,
      `<text x="${legendX + 12}" y="${legendY + 4}" class="legend-label">${escapeXml(className)}</text>`,
    );
  });

  elements.push(`</g>`);

  return elements.join('\n');
}

function renderSectionHeader(section: string, x: number, y: number) {
  return [
    `<rect x="${x}" y="${y}" width="1500" height="56" rx="12" fill="#101828"/>`,
    `<text x="${x + 24}" y="${y + 36}" class="section-title">${escapeXml(section)}</text>`,
  ].join('\n');
}

function getHuntingXpToNextLevel(level: number) {
  return getAutoCombatHuntingXpToNextLevel(level) ?? 0;
}

function buildHuntingProgressRows(): ChartRow[] {
  let cumulativeHours = 0;
  const rows: ChartRow[] = [];

  for (let level = 1; level <= AUTO_COMBAT_HUNTING_LEVEL_CAP; level++) {
    const secondsPerFind = getAutoCombatHuntingSecondsPerEnemy(level);
    const enemiesPerHour = 3600 / Math.max(1, secondsPerFind);
    const huntingXpPerHour = enemiesPerHour * AUTO_COMBAT_HUNTING_XP_PER_ENEMY;
    const xpToNextLevel = getHuntingXpToNextLevel(level);
    const enemiesToNextLevel =
      xpToNextLevel > 0
        ? Math.ceil(xpToNextLevel / AUTO_COMBAT_HUNTING_XP_PER_ENEMY)
        : 0;
    const hoursToNextLevel =
      enemiesToNextLevel > 0
        ? (enemiesToNextLevel * secondsPerFind) / 3600
        : 0;

    rows.push({
      tier: level,
      huntingLevel: level,
      className: 'Caca',
      secondsPerFind,
      enemiesPerHour: roundNumber(enemiesPerHour, 1),
      huntingXpPerHour: roundNumber(huntingXpPerHour, 1),
      xpToNextLevel,
      enemiesToNextLevel,
      hoursToNextLevel: roundNumber(hoursToNextLevel, 2),
      cumulativeHoursToReachLevel: roundNumber(cumulativeHours, 2),
    });

    cumulativeHours += hoursToNextLevel;
  }

  return rows;
}

function readHuntingMatrixRows(params: {
  options: ReportOptions;
  modelSlug: string;
}) {
  const rows: ChartRow[] = [];

  for (const huntingLevel of params.options.huntingLevels) {
    const fileName = `${params.modelSlug}-sem-descanso-mapas-reais-seed-caca-nivel-${huntingLevel}-${params.options.kills}-mobs.json`;
    const filePath = resolveReportInputPath(params.options.outputDir, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const report = readJson<{ rows: ChartRow[] }>(filePath);

    rows.push(
      ...report.rows.map((row) => {
        const timeHours = Number(row.timeHours) || 0;
        const potionsUsed = Number(row.potionsUsed) || 0;

        return {
          ...row,
          huntingLevel,
          potionsPerHour:
            timeHours > 0 ? roundNumber(potionsUsed / timeHours, 2) : 0,
        };
      }),
    );
  }

  return rows;
}

function toCsv(rows: ChartRow[]) {
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));

      return set;
    }, new Set<string>()),
  );
  const lines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header];

        return typeof value === 'string'
          ? `"${value.replace(/"/g, '""')}"`
          : String(value ?? '');
      })
      .join(','),
  );

  return [headers.join(','), ...lines].join('\n');
}

function renderSvg(params: {
  xpRows: ChartRow[];
  survivalRows: ChartRow[];
  matrixRows: ChartRow[];
  huntingProgressRows: ChartRow[];
  options: ReportOptions;
}) {
  const width = 1600;
  const chartWidth = 740;
  const chartHeight = 520;
  const sectionGap = 88;
  const rowGap = 36;
  const startY = 230;
  const elements: string[] = [];
  let currentY = startY;

  for (const section of Array.from(
    new Set(CHART_METRICS.map((metric) => metric.section)),
  )) {
    const metrics = CHART_METRICS.filter((metric) => metric.section === section);
    const sectionContentY = currentY + 86;

    elements.push(renderSectionHeader(section, 50, currentY));

    metrics.forEach((metric, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = column === 0 ? 50 : 810;
      const y = sectionContentY + row * (chartHeight + rowGap);
      const rows =
        metric.source === 'xp'
          ? params.xpRows
          : metric.source === 'survival'
            ? params.survivalRows
            : metric.source === 'matrix'
              ? params.matrixRows
              : params.huntingProgressRows;

      elements.push(
        renderChart({
          rows,
          metric,
          x,
          y,
          width: chartWidth,
          height: chartHeight,
        }),
      );
    });

    const rowCount = Math.ceil(metrics.length / 2);
    currentY =
      sectionContentY +
      rowCount * chartHeight +
      Math.max(0, rowCount - 1) * rowGap +
      sectionGap;
  }

  const height = currentY + 40;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Painel completo de balanceamento do auto-combate">
  <style>
    .title { font: 700 34px Arial, sans-serif; fill: #101828; }
    .subtitle { font: 400 18px Arial, sans-serif; fill: #475467; }
    .meta { font: 600 16px Arial, sans-serif; fill: #344054; }
    .section-title { font: 700 24px Arial, sans-serif; fill: #ffffff; }
    .chart-title { font: 700 21px Arial, sans-serif; fill: #101828; }
    .chart-subtitle { font: 400 14px Arial, sans-serif; fill: #667085; }
    .axis-label { font: 400 12px Arial, sans-serif; fill: #667085; }
    .axis-title { font: 700 12px Arial, sans-serif; fill: #667085; }
    .legend-label { font: 600 13px Arial, sans-serif; fill: #344054; }
  </style>
  <rect width="100%" height="100%" fill="#f5f7fb"/>
  <text x="50" y="62" class="title">Painel completo do auto-combate</text>
  <text x="50" y="96" class="subtitle">Arquivo unico com XP, tempo, pocoes, sobrevivencia e dano. Sem loot, gold ou drops nas analises de dano.</text>
  <text x="50" y="132" class="meta">Modelo: ${escapeXml(AUTO_COMBAT_BALANCE_MODEL_LABEL)} | Mapas reais do seed | Caca nivel ${params.options.huntingLevel} | Amostra principal ${params.options.kills} mobs.</text>
  <text x="50" y="162" class="meta">Matriz de caca: niveis ${escapeXml(params.options.huntingLevels.join(', '))}. Use CSV/JSON apenas para auditoria; este SVG e o painel principal para leitura.</text>
  ${elements.join('\n')}
</svg>`;
}

function main() {
  const options = parseArgs();
  const modelSlug = toSlug(AUTO_COMBAT_BALANCE_MODEL_LABEL);
  const xpPath = resolveReportInputPath(
    options.outputDir,
    `${modelSlug}-sem-descanso-mapas-reais-seed-caca-nivel-${options.huntingLevel}-${options.kills}-mobs.json`,
  );
  const survivalPath = resolveReportInputPath(
    options.outputDir,
    `${modelSlug}-sobrevivencia-dano-mapas-reais-seed-caca-nivel-${options.huntingLevel}.json`,
  );
  const outputPath = resolve(
    options.outputDir,
    `${modelSlug}-painel-completo-auto-combate.svg`,
  );
  const matrixJsonPath = resolve(
    options.outputDir,
    `${modelSlug}-caca-matriz-niveis-${options.huntingLevels.join('-')}-${options.kills}-mobs.json`,
  );
  const matrixCsvPath = resolve(
    options.outputDir,
    `${modelSlug}-caca-matriz-niveis-${options.huntingLevels.join('-')}-${options.kills}-mobs.csv`,
  );
  const huntingProgressJsonPath = resolve(
    options.outputDir,
    `${modelSlug}-progressao-caca-nivel-1-${AUTO_COMBAT_HUNTING_LEVEL_CAP}.json`,
  );
  const huntingProgressCsvPath = resolve(
    options.outputDir,
    `${modelSlug}-progressao-caca-nivel-1-${AUTO_COMBAT_HUNTING_LEVEL_CAP}.csv`,
  );
  const xpReport = readJson<{ rows: ChartRow[] }>(xpPath);
  const survivalReport = readJson<{ tierRows: ChartRow[] }>(survivalPath);
  const matrixRows = readHuntingMatrixRows({
    options,
    modelSlug,
  });
  const huntingProgressRows = buildHuntingProgressRows();

  mkdirSync(options.outputDir, { recursive: true });
  writeFileSync(
    matrixJsonPath,
    JSON.stringify(
      {
        model: AUTO_COMBAT_BALANCE_MODEL_LABEL,
        kills: options.kills,
        huntingLevels: options.huntingLevels,
        rows: matrixRows,
      },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(matrixCsvPath, toCsv(matrixRows), 'utf8');
  writeFileSync(
    huntingProgressJsonPath,
    JSON.stringify(
      {
        model: AUTO_COMBAT_BALANCE_MODEL_LABEL,
        huntingLevelCap: AUTO_COMBAT_HUNTING_LEVEL_CAP,
        xpPerEnemy: AUTO_COMBAT_HUNTING_XP_PER_ENEMY,
        rows: huntingProgressRows,
      },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(huntingProgressCsvPath, toCsv(huntingProgressRows), 'utf8');
  writeFileSync(
    outputPath,
    renderSvg({
      xpRows: xpReport.rows,
      survivalRows: survivalReport.tierRows,
      matrixRows,
      huntingProgressRows,
      options,
    }),
    'utf8',
  );

  console.log('Auto-combat complete report exported');
  console.log(`SVG: ${outputPath}`);
  console.log(`Hunting matrix JSON: ${matrixJsonPath}`);
  console.log(`Hunting matrix CSV: ${matrixCsvPath}`);
  console.log(`Hunting progression JSON: ${huntingProgressJsonPath}`);
  console.log(`Hunting progression CSV: ${huntingProgressCsvPath}`);
}

main();
