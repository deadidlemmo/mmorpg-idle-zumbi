import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUTO_COMBAT_BALANCE_MODEL_LABEL } from '../src/common/config/combat-balance.config';
import {
  FUTURE_LEVEL_CAP,
  LAUNCH_LEVEL_CAP,
} from '../src/common/config/progression.config';
import {
  getTierByLevel,
  getTotalXpRequiredForLevel,
  getXpRequiredForNextLevel,
} from '../src/common/utils/level.util';

type ReportOptions = {
  kills: number;
  outputDir: string;
  inputDir: string | null;
};

type BalanceReportRow = {
  tier: number;
  level: number;
  className: string;
  mapName: string;
  secondsPerFind: number;
  ttkSeconds: number;
  secondsPerMob: number;
  killsPerHour: number;
  effectiveXpPerHour: number;
  effectiveXpPerKill: number;
};

type Scenario = {
  key: string;
  label: string;
  description: string;
  tierHuntingLevels: Record<number, number>;
};

type ProgressionRow = {
  scenarioKey: string;
  scenarioLabel: string;
  className: string;
  fromLevel: number;
  toLevel: number;
  tier: number;
  huntingLevel: number;
  xpRequired: number;
  effectiveXpPerHour: number;
  effectiveXpPerKill: number;
  killsPerHour: number;
  secondsPerFind: number;
  ttkSeconds: number;
  secondsPerMob: number;
  mapName: string;
  hoursToLevel: number;
  days24hToLevel: number;
  cumulativeHours: number;
  cumulativeDays24h: number;
  cumulativeDays12h: number;
  cumulativeDays6h: number;
};

type SummaryRow = {
  scenarioKey: string;
  scenarioLabel: string;
  className: string;
  level50Days24h: number;
  level100Days24h: number;
  level50Days12h: number;
  level100Days12h: number;
  level50Days6h: number;
  level100Days6h: number;
  totalXpTo50: number;
  totalXpTo100: number;
};

type TierSummaryRow = {
  scenarioKey: string;
  scenarioLabel: string;
  className: string;
  tier: number;
  huntingLevel: number;
  hours: number;
  days24h: number;
  averageXpPerHour: number;
};

type ChartSeries = {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
};

const DEFAULT_KILLS = 1000;
const CLASS_ORDER = ['Lutador', 'Assassino', 'Atirador', 'Medico'];
const CLASS_COLORS: Record<string, string> = {
  Lutador: '#d94b4b',
  Assassino: '#8b5cf6',
  Atirador: '#2563eb',
  Medico: '#16a34a',
};

const SCENARIOS: Scenario[] = [
  {
    key: 'conservador',
    label: 'Conservador',
    description:
      'Usa a parte baixa das faixas de caca esperadas para cada tier.',
    tierHuntingLevels: {
      1: 1,
      2: 10,
      3: 15,
      4: 20,
      5: 25,
      6: 30,
      7: 35,
      8: 40,
      9: 45,
      10: 45,
    },
  },
  {
    key: 'provavel',
    label: 'Provavel',
    description:
      'Usa valores intermediarios coerentes com a progressao esperada.',
    tierHuntingLevels: {
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
    },
  },
  {
    key: 'otimista',
    label: 'Otimista',
    description:
      'Usa a parte alta das faixas de caca, ainda sem assumir caca 50 cedo.',
    tierHuntingLevels: {
      1: 10,
      2: 15,
      3: 20,
      4: 25,
      5: 35,
      6: 35,
      7: 45,
      8: 45,
      9: 50,
      10: 50,
    },
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

function parseArgs(): ReportOptions {
  const options: ReportOptions = {
    kills: DEFAULT_KILLS,
    outputDir: resolve(process.cwd(), '..', '_reports', 'auto-combat-balance'),
    inputDir: null,
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = splitArg(arg);

    switch (key) {
      case '--kills':
        options.kills = parsePositiveInteger(value, DEFAULT_KILLS);
        break;
      case '--output-dir':
        options.outputDir = resolve(process.cwd(), value ?? options.outputDir);
        break;
      case '--input-dir':
        options.inputDir = resolve(process.cwd(), value ?? '');
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

function roundNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: digits,
  }).format(value);
}

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function getDataDir(options: ReportOptions) {
  if (options.inputDir) {
    return options.inputDir;
  }

  const modelVersion = toSlug(AUTO_COMBAT_BALANCE_MODEL_LABEL).replace(
    /^balance-/,
    '',
  );

  return resolve(options.outputDir, `dados-${modelVersion}`);
}

function getRequiredHuntingLevels() {
  return Array.from(
    new Set(
      SCENARIOS.flatMap((scenario) =>
        Object.values(scenario.tierHuntingLevels),
      ),
    ),
  ).sort((left, right) => left - right);
}

function readBalanceRows(options: ReportOptions) {
  const modelSlug = toSlug(AUTO_COMBAT_BALANCE_MODEL_LABEL);
  const inputDir = getDataDir(options);
  const rows = new Map<string, BalanceReportRow>();

  for (const huntingLevel of getRequiredHuntingLevels()) {
    const fileName = `${modelSlug}-sem-descanso-mapas-reais-seed-caca-nivel-${huntingLevel}-${options.kills}-mobs.json`;
    const filePath = resolve(inputDir, fileName);

    if (!existsSync(filePath)) {
      throw new Error(
        `Relatorio base nao encontrado: ${filePath}. Gere balance:auto-combat:report para este hunting-level antes.`,
      );
    }

    const report = readJson<{ rows: BalanceReportRow[] }>(filePath);

    for (const row of report.rows) {
      rows.set(`${huntingLevel}:${row.tier}:${row.className}`, row);
    }
  }

  return rows;
}

function getBalanceRow(params: {
  rows: Map<string, BalanceReportRow>;
  huntingLevel: number;
  tier: number;
  className: string;
}) {
  const row = params.rows.get(
    `${params.huntingLevel}:${params.tier}:${params.className}`,
  );

  if (!row) {
    throw new Error(
      `Linha base ausente: caca ${params.huntingLevel}, tier ${params.tier}, classe ${params.className}.`,
    );
  }

  return row;
}

function simulateProgression(rows: Map<string, BalanceReportRow>) {
  const progressionRows: ProgressionRow[] = [];
  const summaryRows: SummaryRow[] = [];
  const tierSummaryRows: TierSummaryRow[] = [];
  const totalXpTo50 = getTotalXpRequiredForLevel(LAUNCH_LEVEL_CAP);
  const totalXpTo100 = getTotalXpRequiredForLevel(FUTURE_LEVEL_CAP);

  for (const scenario of SCENARIOS) {
    for (const className of CLASS_ORDER) {
      let cumulativeHours = 0;
      const tierHours = new Map<number, number>();
      const tierXpHours = new Map<number, Array<number>>();

      for (let level = 1; level < FUTURE_LEVEL_CAP; level++) {
        const tier = getTierByLevel(level);
        const huntingLevel =
          scenario.tierHuntingLevels[tier] ??
          scenario.tierHuntingLevels[10] ??
          50;
        const balanceRow = getBalanceRow({
          rows,
          huntingLevel,
          tier,
          className,
        });
        const xpRequired = getXpRequiredForNextLevel(level);
        const xpPerHour = Math.max(1, balanceRow.effectiveXpPerHour);
        const hoursToLevel = xpRequired / xpPerHour;

        cumulativeHours += hoursToLevel;
        tierHours.set(tier, (tierHours.get(tier) ?? 0) + hoursToLevel);
        tierXpHours.set(tier, [
          ...(tierXpHours.get(tier) ?? []),
          xpPerHour,
        ]);

        progressionRows.push({
          scenarioKey: scenario.key,
          scenarioLabel: scenario.label,
          className,
          fromLevel: level,
          toLevel: level + 1,
          tier,
          huntingLevel,
          xpRequired,
          effectiveXpPerHour: roundNumber(xpPerHour, 2),
          effectiveXpPerKill: roundNumber(balanceRow.effectiveXpPerKill, 2),
          killsPerHour: roundNumber(balanceRow.killsPerHour, 2),
          secondsPerFind: roundNumber(balanceRow.secondsPerFind, 2),
          ttkSeconds: roundNumber(balanceRow.ttkSeconds, 2),
          secondsPerMob: roundNumber(balanceRow.secondsPerMob, 2),
          mapName: balanceRow.mapName,
          hoursToLevel: roundNumber(hoursToLevel, 4),
          days24hToLevel: roundNumber(hoursToLevel / 24, 4),
          cumulativeHours: roundNumber(cumulativeHours, 4),
          cumulativeDays24h: roundNumber(cumulativeHours / 24, 4),
          cumulativeDays12h: roundNumber(cumulativeHours / 12, 4),
          cumulativeDays6h: roundNumber(cumulativeHours / 6, 4),
        });
      }

      const level50Row = progressionRows.find(
        (row) =>
          row.scenarioKey === scenario.key &&
          row.className === className &&
          row.toLevel === LAUNCH_LEVEL_CAP,
      );
      const level100Row = progressionRows.find(
        (row) =>
          row.scenarioKey === scenario.key &&
          row.className === className &&
          row.toLevel === FUTURE_LEVEL_CAP,
      );

      summaryRows.push({
        scenarioKey: scenario.key,
        scenarioLabel: scenario.label,
        className,
        level50Days24h: roundNumber(level50Row?.cumulativeDays24h ?? 0, 2),
        level100Days24h: roundNumber(level100Row?.cumulativeDays24h ?? 0, 2),
        level50Days12h: roundNumber(level50Row?.cumulativeDays12h ?? 0, 2),
        level100Days12h: roundNumber(level100Row?.cumulativeDays12h ?? 0, 2),
        level50Days6h: roundNumber(level50Row?.cumulativeDays6h ?? 0, 2),
        level100Days6h: roundNumber(level100Row?.cumulativeDays6h ?? 0, 2),
        totalXpTo50,
        totalXpTo100,
      });

      for (const [tier, hours] of tierHours) {
        const xpHours = tierXpHours.get(tier) ?? [];
        const huntingLevel =
          scenario.tierHuntingLevels[tier] ??
          scenario.tierHuntingLevels[10] ??
          50;
        const averageXpPerHour =
          xpHours.reduce((total, item) => total + item, 0) /
          Math.max(1, xpHours.length);

        tierSummaryRows.push({
          scenarioKey: scenario.key,
          scenarioLabel: scenario.label,
          className,
          tier,
          huntingLevel,
          hours: roundNumber(hours, 4),
          days24h: roundNumber(hours / 24, 4),
          averageXpPerHour: roundNumber(averageXpPerHour, 2),
        });
      }
    }
  }

  return { progressionRows, summaryRows, tierSummaryRows };
}

function toCsvValue(value: string | number) {
  const rawValue = String(value);

  if (/[",\n\r]/.test(rawValue)) {
    return `"${rawValue.replace(/"/g, '""')}"`;
  }

  return rawValue;
}

function toCsv<T extends Record<string, string | number>>(
  rows: T[],
  columns: Array<keyof T>,
) {
  return [
    columns.map(String).join(','),
    ...rows.map((row) => columns.map((column) => toCsvValue(row[column])).join(',')),
  ].join('\n');
}

function barChart(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  rows: Array<{ label: string; color: string; value: number }>;
  yLabel: string;
}) {
  const padding = { top: 50, right: 22, bottom: 66, left: 64 };
  const plotX = params.x + padding.left;
  const plotY = params.y + padding.top;
  const plotWidth = params.width - padding.left - padding.right;
  const plotHeight = params.height - padding.top - padding.bottom;
  const maxValue = Math.max(...params.rows.map((row) => row.value), 1);
  const barGap = 8;
  const barWidth = Math.max(
    10,
    (plotWidth - barGap * Math.max(0, params.rows.length - 1)) /
      Math.max(1, params.rows.length),
  );

  const bars = params.rows
    .map((row, index) => {
      const height = (row.value / maxValue) * plotHeight;
      const x = plotX + index * (barWidth + barGap);
      const y = plotY + plotHeight - height;

      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4" fill="${row.color}" />
        <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" class="value">${escapeXml(formatNumber(row.value, 1))}</text>
        <text x="${x + barWidth / 2}" y="${plotY + plotHeight + 18}" text-anchor="middle" class="tick">${escapeXml(row.label)}</text>`;
    })
    .join('');

  return `
    <g>
      <rect x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" rx="10" class="panel" />
      <text x="${params.x + 20}" y="${params.y + 28}" class="chart-title">${escapeXml(params.title)}</text>
      <text x="${params.x + 20}" y="${params.y + 46}" class="chart-subtitle">${escapeXml(params.subtitle)}</text>
      <text x="${params.x + 16}" y="${plotY - 8}" class="axis-label">${escapeXml(params.yLabel)}</text>
      <line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotHeight}" class="axis" />
      <line x1="${plotX}" y1="${plotY + plotHeight}" x2="${plotX + plotWidth}" y2="${plotY + plotHeight}" class="axis" />
      ${[0.25, 0.5, 0.75, 1]
        .map((ratio) => {
          const y = plotY + plotHeight - plotHeight * ratio;
          return `
            <line x1="${plotX}" y1="${y}" x2="${plotX + plotWidth}" y2="${y}" class="grid" />
            <text x="${plotX - 10}" y="${y + 4}" text-anchor="end" class="tick">${escapeXml(formatNumber(maxValue * ratio, 0))}</text>`;
        })
        .join('')}
      ${bars}
    </g>`;
}

function lineChart(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  series: ChartSeries[];
  xValues: number[];
  yLabel: string;
  xLabelPrefix: string;
}) {
  const padding = { top: 54, right: 28, bottom: 58, left: 70 };
  const plotX = params.x + padding.left;
  const plotY = params.y + padding.top;
  const plotWidth = params.width - padding.left - padding.right;
  const plotHeight = params.height - padding.top - padding.bottom;
  const minX = Math.min(...params.xValues);
  const maxX = Math.max(...params.xValues);
  const maxY = Math.max(
    ...params.series.flatMap((serie) => serie.points.map((point) => point.y)),
    1,
  );
  const xScale = (value: number) =>
    plotX + ((value - minX) / Math.max(1, maxX - minX)) * plotWidth;
  const yScale = (value: number) => plotY + plotHeight - (value / maxY) * plotHeight;

  const seriesSvg = params.series
    .map((serie) => {
      const points = serie.points
        .map((point) => `${xScale(point.x)},${yScale(point.y)}`)
        .join(' ');
      const dots = serie.points
        .map(
          (point) =>
            `<circle cx="${xScale(point.x)}" cy="${yScale(point.y)}" r="3.5" fill="${serie.color}" />`,
        )
        .join('');

      return `
        <polyline points="${points}" fill="none" stroke="${serie.color}" stroke-width="2.5" />
        ${dots}`;
    })
    .join('');

  const legend = params.series
    .map((serie, index) => {
      const x = params.x + 24 + index * 120;
      const y = params.y + params.height - 18;

      return `
        <circle cx="${x}" cy="${y}" r="4" fill="${serie.color}" />
        <text x="${x + 10}" y="${y + 4}" class="legend">${escapeXml(serie.label)}</text>`;
    })
    .join('');

  return `
    <g>
      <rect x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" rx="10" class="panel" />
      <text x="${params.x + 20}" y="${params.y + 28}" class="chart-title">${escapeXml(params.title)}</text>
      <text x="${params.x + 20}" y="${params.y + 46}" class="chart-subtitle">${escapeXml(params.subtitle)}</text>
      <text x="${params.x + 16}" y="${plotY - 8}" class="axis-label">${escapeXml(params.yLabel)}</text>
      <line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotHeight}" class="axis" />
      <line x1="${plotX}" y1="${plotY + plotHeight}" x2="${plotX + plotWidth}" y2="${plotY + plotHeight}" class="axis" />
      ${[0.25, 0.5, 0.75, 1]
        .map((ratio) => {
          const y = plotY + plotHeight - plotHeight * ratio;
          return `
            <line x1="${plotX}" y1="${y}" x2="${plotX + plotWidth}" y2="${y}" class="grid" />
            <text x="${plotX - 10}" y="${y + 4}" text-anchor="end" class="tick">${escapeXml(formatNumber(maxY * ratio, 0))}</text>`;
        })
        .join('')}
      ${params.xValues
        .map((value) => {
          const x = xScale(value);
          return `<text x="${x}" y="${plotY + plotHeight + 18}" text-anchor="middle" class="tick">${escapeXml(params.xLabelPrefix)}${value}</text>`;
        })
        .join('')}
      ${seriesSvg}
      ${legend}
    </g>`;
}

function buildPanelSvg(params: {
  summaryRows: SummaryRow[];
  progressionRows: ProgressionRow[];
  tierSummaryRows: TierSummaryRow[];
}) {
  const probableRows = params.summaryRows.filter(
    (row) => row.scenarioKey === 'provavel',
  );
  const probableProgression = params.progressionRows.filter(
    (row) => row.scenarioKey === 'provavel',
  );
  const probableTierSummary = params.tierSummaryRows.filter(
    (row) => row.scenarioKey === 'provavel',
  );
  const scenarioAverageRows = SCENARIOS.map((scenario) => {
    const rows = params.summaryRows.filter(
      (row) => row.scenarioKey === scenario.key,
    );
    const average =
      rows.reduce((total, row) => total + row.level100Days24h, 0) /
      Math.max(1, rows.length);

    return {
      label: scenario.label,
      value: roundNumber(average, 1),
      color:
        scenario.key === 'conservador'
          ? '#64748b'
          : scenario.key === 'provavel'
            ? '#0f766e'
            : '#2563eb',
    };
  });
  const scenarioAverage50Rows = SCENARIOS.map((scenario) => {
    const rows = params.summaryRows.filter(
      (row) => row.scenarioKey === scenario.key,
    );
    const average =
      rows.reduce((total, row) => total + row.level50Days24h, 0) /
      Math.max(1, rows.length);

    return {
      label: scenario.label,
      value: roundNumber(average, 1),
      color:
        scenario.key === 'conservador'
          ? '#64748b'
          : scenario.key === 'provavel'
            ? '#0f766e'
            : '#2563eb',
    };
  });

  const cumulativeSeries: ChartSeries[] = CLASS_ORDER.map((className) => ({
    label: className,
    color: CLASS_COLORS[className],
    points: probableProgression
      .filter(
        (row) =>
          row.className === className &&
          (row.toLevel === 10 ||
            row.toLevel === 20 ||
            row.toLevel === 30 ||
            row.toLevel === 40 ||
            row.toLevel === 50 ||
            row.toLevel === 60 ||
            row.toLevel === 70 ||
            row.toLevel === 80 ||
            row.toLevel === 90 ||
            row.toLevel === 100),
      )
      .map((row) => ({ x: row.toLevel, y: row.cumulativeDays24h })),
  }));

  const tierDaySeries: ChartSeries[] = CLASS_ORDER.map((className) => ({
    label: className,
    color: CLASS_COLORS[className],
    points: probableTierSummary
      .filter((row) => row.className === className)
      .map((row) => ({ x: row.tier, y: row.days24h })),
  }));

  const huntingLevelSeries: ChartSeries[] = [
    {
      label: 'Caca provavel',
      color: '#0f766e',
      points: Object.entries(SCENARIOS[1].tierHuntingLevels).map(
        ([tier, huntingLevel]) => ({
          x: Number(tier),
          y: huntingLevel,
        }),
      ),
    },
  ];

  const xpPerHourSeries: ChartSeries[] = CLASS_ORDER.map((className) => ({
    label: className,
    color: CLASS_COLORS[className],
    points: probableTierSummary
      .filter((row) => row.className === className)
      .map((row) => ({ x: row.tier, y: row.averageXpPerHour })),
  }));

  const width = 1240;
  const height = 1540;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .page { fill: #f5f7fb; }
    .panel { fill: #ffffff; stroke: #d7deea; stroke-width: 1; }
    .title { font: 700 26px Arial, sans-serif; fill: #0f172a; }
    .subtitle { font: 400 13px Arial, sans-serif; fill: #475569; }
    .note { font: 400 12px Arial, sans-serif; fill: #64748b; }
    .chart-title { font: 700 18px Arial, sans-serif; fill: #0f172a; }
    .chart-subtitle { font: 400 11px Arial, sans-serif; fill: #334155; }
    .axis-label { font: 400 10px Arial, sans-serif; fill: #334155; }
    .axis { stroke: #b9c3d5; stroke-width: 1; }
    .grid { stroke: #e5eaf2; stroke-width: 1; }
    .tick { font: 400 10px Arial, sans-serif; fill: #334155; }
    .value { font: 700 10px Arial, sans-serif; fill: #0f172a; }
    .legend { font: 400 11px Arial, sans-serif; fill: #334155; }
  </style>
  <rect width="100%" height="100%" class="page" />
  <text x="30" y="42" class="title">Progressao realista de personagem ate o level 100</text>
  <text x="30" y="64" class="subtitle">Modelo ${escapeXml(AUTO_COMBAT_BALANCE_MODEL_LABEL)} | mapas reais do seed | chance de mob | tempo de caca | TTK | sem descanso automatico</text>
  <text x="30" y="84" class="note">Observacao: o codigo atual ainda usa cap jogavel ${LAUNCH_LEVEL_CAP} por padrao; level ${FUTURE_LEVEL_CAP} aqui e uma projecao com a curva futura ja existente.</text>
  ${barChart({
    x: 24,
    y: 110,
    width: 580,
    height: 310,
    title: 'Dias medios ate level 100 por cenario',
    subtitle: 'Media entre classes, jogando sem limite diario.',
    rows: scenarioAverageRows,
    yLabel: 'Dias 24h',
  })}
  ${barChart({
    x: 628,
    y: 110,
    width: 580,
    height: 310,
    title: 'Dias medios ate level 50 por cenario',
    subtitle: 'Mostra o impacto de nao assumir caca 50 cedo.',
    rows: scenarioAverage50Rows,
    yLabel: 'Dias 24h',
  })}
  ${barChart({
    x: 24,
    y: 440,
    width: 580,
    height: 310,
    title: 'Level 100 no cenario provavel',
    subtitle: 'Total por classe, com caca escalando por tier.',
    rows: probableRows.map((row) => ({
      label: row.className,
      value: row.level100Days24h,
      color: CLASS_COLORS[row.className],
    })),
    yLabel: 'Dias 24h',
  })}
  ${barChart({
    x: 628,
    y: 440,
    width: 580,
    height: 310,
    title: 'Level 50 no cenario provavel',
    subtitle: 'Cap atual jogavel em comparacao com a projecao 100.',
    rows: probableRows.map((row) => ({
      label: row.className,
      value: row.level50Days24h,
      color: CLASS_COLORS[row.className],
    })),
    yLabel: 'Dias 24h',
  })}
  ${lineChart({
    x: 24,
    y: 770,
    width: 580,
    height: 330,
    title: 'Curva acumulada provavel',
    subtitle: 'Dias continuos por level-chave.',
    series: cumulativeSeries,
    xValues: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    yLabel: 'Dias',
    xLabelPrefix: 'L',
  })}
  ${lineChart({
    x: 628,
    y: 770,
    width: 580,
    height: 330,
    title: 'Dias por tier no cenario provavel',
    subtitle: 'Tempo gasto em cada bloco de 10 levels.',
    series: tierDaySeries,
    xValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    yLabel: 'Dias',
    xLabelPrefix: 'T',
  })}
  ${lineChart({
    x: 24,
    y: 1120,
    width: 580,
    height: 330,
    title: 'Nivel de caca usado por tier',
    subtitle: 'Cenario provavel adotado na simulacao.',
    series: huntingLevelSeries,
    xValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    yLabel: 'Nivel',
    xLabelPrefix: 'T',
  })}
  ${lineChart({
    x: 628,
    y: 1120,
    width: 580,
    height: 330,
    title: 'XP/h por tier no cenario provavel',
    subtitle: 'XP efetivo real usado pela progressao.',
    series: xpPerHourSeries,
    xValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    yLabel: 'XP/h',
    xLabelPrefix: 'T',
  })}
</svg>`;
}

function writeReportFiles(params: {
  options: ReportOptions;
  progressionRows: ProgressionRow[];
  summaryRows: SummaryRow[];
  tierSummaryRows: TierSummaryRow[];
}) {
  const modelSlug = toSlug(AUTO_COMBAT_BALANCE_MODEL_LABEL);
  const dataDir = getDataDir(params.options);

  mkdirSync(params.options.outputDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  const detailsPath = resolve(
    dataDir,
    `${modelSlug}-progressao-personagem-realista-detalhe.csv`,
  );
  const summaryPath = resolve(
    dataDir,
    `${modelSlug}-progressao-personagem-realista-resumo.csv`,
  );
  const tierPath = resolve(
    dataDir,
    `${modelSlug}-progressao-personagem-realista-por-tier.csv`,
  );
  const jsonPath = resolve(
    dataDir,
    `${modelSlug}-progressao-personagem-realista.json`,
  );
  const svgPath = resolve(
    params.options.outputDir,
    `${modelSlug}-painel-progressao-personagem-realista.svg`,
  );

  writeFileSync(
    detailsPath,
    `${toCsv(params.progressionRows, [
      'scenarioKey',
      'scenarioLabel',
      'className',
      'fromLevel',
      'toLevel',
      'tier',
      'huntingLevel',
      'xpRequired',
      'effectiveXpPerHour',
      'effectiveXpPerKill',
      'killsPerHour',
      'secondsPerFind',
      'ttkSeconds',
      'secondsPerMob',
      'mapName',
      'hoursToLevel',
      'days24hToLevel',
      'cumulativeHours',
      'cumulativeDays24h',
      'cumulativeDays12h',
      'cumulativeDays6h',
    ])}\n`,
    'utf8',
  );
  writeFileSync(
    summaryPath,
    `${toCsv(params.summaryRows, [
      'scenarioKey',
      'scenarioLabel',
      'className',
      'level50Days24h',
      'level100Days24h',
      'level50Days12h',
      'level100Days12h',
      'level50Days6h',
      'level100Days6h',
      'totalXpTo50',
      'totalXpTo100',
    ])}\n`,
    'utf8',
  );
  writeFileSync(
    tierPath,
    `${toCsv(params.tierSummaryRows, [
      'scenarioKey',
      'scenarioLabel',
      'className',
      'tier',
      'huntingLevel',
      'hours',
      'days24h',
      'averageXpPerHour',
    ])}\n`,
    'utf8',
  );
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        model: AUTO_COMBAT_BALANCE_MODEL_LABEL,
        kills: params.options.kills,
        source:
          'mapas reais do seed ponderados por chance de aparicao + tempo real de caca por tier + curva real de XP de personagem',
        launchLevelCap: LAUNCH_LEVEL_CAP,
        projectedLevelCap: FUTURE_LEVEL_CAP,
        scenarios: SCENARIOS,
        summaryRows: params.summaryRows,
        tierSummaryRows: params.tierSummaryRows,
        progressionRows: params.progressionRows,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  writeFileSync(
    svgPath,
    buildPanelSvg({
      summaryRows: params.summaryRows,
      progressionRows: params.progressionRows,
      tierSummaryRows: params.tierSummaryRows,
    }),
    'utf8',
  );

  return { detailsPath, summaryPath, tierPath, jsonPath, svgPath };
}

function main() {
  const options = parseArgs();
  const rows = readBalanceRows(options);
  const { progressionRows, summaryRows, tierSummaryRows } =
    simulateProgression(rows);
  const files = writeReportFiles({
    options,
    progressionRows,
    summaryRows,
    tierSummaryRows,
  });

  console.log('Character progression report exported');
  console.log(`SVG: ${files.svgPath}`);
  console.log(`JSON: ${files.jsonPath}`);
  console.log(`Summary CSV: ${files.summaryPath}`);
  console.log(`Detail CSV: ${files.detailsPath}`);
  console.log(`Tier CSV: ${files.tierPath}`);
  console.table(
    summaryRows
      .filter((row) => row.scenarioKey === 'provavel')
      .map((row) => ({
        class: row.className,
        lvl50_24h_days: row.level50Days24h,
        lvl100_24h_days: row.level100Days24h,
        lvl100_12h_days: row.level100Days12h,
        lvl100_6h_days: row.level100Days6h,
      })),
  );
}

main();
