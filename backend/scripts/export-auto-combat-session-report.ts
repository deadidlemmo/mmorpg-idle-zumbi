import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUTO_COMBAT_BALANCE_MODEL_LABEL } from '../src/common/config/combat-balance.config';
import { AUTO_POTION_TRIGGER_PERCENT } from '../src/common/config/potions.config';
import { calculateAutoCombatPotionHeal } from './auto-combat-potion-balancing';

type ReportOptions = {
  kills: number;
  outputDir: string;
  inputDir: string | null;
  huntingLevels: number[];
  sessionHours: number[];
  potionQuantities: number[];
};

type BalanceReportRow = {
  tier: number;
  level: number;
  className: string;
  mapName: string;
  hp: number;
  secondsPerFind: number;
  ttkSeconds: number;
  secondsPerMob: number;
  effectiveXpPerKill: number;
  effectiveXpPerHour: number;
  expectedDamagePerKill: number;
};

type SessionReportRow = {
  sessionLabel: string;
  sessionHours: number;
  huntingLevel: number;
  potionQuantity: number;
  tier: number;
  level: number;
  className: string;
  mapName: string;
  hp: number;
  potionHealAmount: number;
  secondsPerFind: number;
  ttkSeconds: number;
  secondsPerMob: number;
  maxKillsByTime: number;
  kills: number;
  xp: number;
  xpPerScheduledHour: number;
  xpPerActiveHour: number;
  xpPerPotion: number;
  potionsUsed: number;
  potionsNeededForFullSession: number;
  potionCoveragePercent: number;
  completionPercent: number;
  hoursUntilStop: number;
  damagePerHour: number;
  finalHpPercent: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';
  xpVsBestPercent: number;
};

type AuditRow = {
  sessionLabel: string;
  sessionHours: number;
  huntingLevel: number;
  potionQuantity: number;
  tier: number;
  bestClass: string;
  worstClass: string;
  bestXp: number;
  worstXp: number;
  xpRatio: number;
  worstXpPercent: number;
  minCompletionPercent: number;
  maxCompletionPercent: number;
  completionSpread: number;
  allClassesComplete: boolean;
  status: 'OK' | 'WATCH' | 'OUTLIER';
};

type ChartMetric = {
  key: keyof SessionReportRow;
  title: string;
  subtitle: string;
  yLabel: string;
  xKey: keyof SessionReportRow;
  xValues: number[];
  xLabelPrefix: string;
  filter: Partial<
    Pick<
      SessionReportRow,
      'sessionHours' | 'huntingLevel' | 'potionQuantity' | 'tier'
    >
  >;
  fixedMax?: number;
};

const DEFAULT_KILLS = 1000;
const DEFAULT_HUNTING_LEVELS = [1, 10, 25, 50];
const DEFAULT_SESSION_HOURS = [6, 12];
const DEFAULT_POTION_QUANTITIES = [0, 5, 10, 20, 50, 100];
const CLASS_ORDER = ['Lutador', 'Assassino', 'Atirador', 'Medico'];
const CLASS_COLORS: Record<string, string> = {
  Lutador: '#d94b4b',
  Assassino: '#8b5cf6',
  Atirador: '#2563eb',
  Medico: '#16a34a',
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

function parseNumberList(value: string | undefined, fallback: number[]) {
  const parsed = String(value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0);
  const unique = Array.from(new Set(parsed)).sort((left, right) => left - right);

  return unique.length > 0 ? unique : fallback;
}

function parseArgs(): ReportOptions {
  const outputDir = resolve(process.cwd(), '..', '_reports', 'auto-combat-balance');
  const options: ReportOptions = {
    kills: DEFAULT_KILLS,
    outputDir,
    inputDir: null,
    huntingLevels: DEFAULT_HUNTING_LEVELS,
    sessionHours: DEFAULT_SESSION_HOURS,
    potionQuantities: DEFAULT_POTION_QUANTITIES,
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
      case '--hunting-levels':
        options.huntingLevels = parseNumberList(
          value,
          DEFAULT_HUNTING_LEVELS,
        ).map((level) => Math.max(1, Math.floor(level)));
        break;
      case '--session-hours':
        options.sessionHours = parseNumberList(
          value,
          DEFAULT_SESSION_HOURS,
        ).filter((hours) => hours > 0);
        break;
      case '--potion-quantities':
        options.potionQuantities = parseNumberList(
          value,
          DEFAULT_POTION_QUANTITIES,
        ).map((quantity) => Math.max(0, Math.floor(quantity)));
        break;
      default:
        break;
    }
  }

  return options;
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

function readBalanceRows(options: ReportOptions) {
  const modelSlug = toSlug(AUTO_COMBAT_BALANCE_MODEL_LABEL);
  const inputDir = getDataDir(options);
  const rows: Array<BalanceReportRow & { huntingLevel: number }> = [];

  for (const huntingLevel of options.huntingLevels) {
    const fileName = `${modelSlug}-sem-descanso-mapas-reais-seed-caca-nivel-${huntingLevel}-${options.kills}-mobs.json`;
    const filePath = resolve(inputDir, fileName);

    if (!existsSync(filePath)) {
      throw new Error(
        `Relatorio base nao encontrado: ${filePath}. Gere balance:auto-combat:report antes.`,
      );
    }

    const report = readJson<{ rows: BalanceReportRow[] }>(filePath);

    rows.push(
      ...report.rows.map((row) => ({
        ...row,
        huntingLevel,
      })),
    );
  }

  return rows;
}

function simulateSurvival(params: {
  currentHp: number;
  maxHp: number;
  expectedDamagePerBattle: number;
  projectedBattles: number;
  potionQuantity: number;
  potionHealAmount: number;
}) {
  const maxHp = Math.max(0, params.maxHp);
  const thresholdHp = Math.floor((maxHp * AUTO_POTION_TRIGGER_PERCENT) / 100);
  let hp = Math.max(0, Math.min(maxHp, params.currentHp));
  let potionsRemaining = Math.max(0, Math.floor(params.potionQuantity));
  let potionsUsed = 0;
  let safeBattles = 0;

  for (let battle = 0; battle < params.projectedBattles; battle++) {
    if (hp <= 0) {
      break;
    }

    hp = Math.max(0, hp - params.expectedDamagePerBattle);

    if (
      hp > 0 &&
      hp <= thresholdHp &&
      potionsRemaining > 0 &&
      params.potionHealAmount > 0
    ) {
      hp = Math.min(maxHp, hp + params.potionHealAmount);
      potionsRemaining--;
      potionsUsed++;
    }

    if (hp <= 0) {
      break;
    }

    safeBattles++;
  }

  const finalHpPercent = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  let riskLevel: SessionReportRow['riskLevel'] = 'LOW';

  if (safeBattles < params.projectedBattles) {
    riskLevel = safeBattles <= 0 ? 'LETHAL' : 'HIGH';
  } else if (finalHpPercent < 25) {
    riskLevel = 'HIGH';
  } else if (finalHpPercent < 55) {
    riskLevel = 'MEDIUM';
  }

  return {
    safeBattles,
    potionsUsed,
    finalHpPercent: roundNumber(finalHpPercent, 2),
    riskLevel,
  };
}

function buildSessionRows(options: ReportOptions) {
  const baseRows = readBalanceRows(options);
  const rows: SessionReportRow[] = [];

  for (const baseRow of baseRows) {
    for (const sessionHours of options.sessionHours) {
      for (const potionQuantity of options.potionQuantities) {
        const sessionSeconds = sessionHours * 3600;
        const secondsPerMob = Math.max(1, Number(baseRow.secondsPerMob) || 1);
        const maxKillsByTime = Math.max(
          0,
          Math.floor(sessionSeconds / secondsPerMob),
        );
        const potionHeal = calculateAutoCombatPotionHeal({
          tier: baseRow.tier,
          maxHp: baseRow.hp,
          className: baseRow.className,
        });
        const survival = simulateSurvival({
          currentHp: baseRow.hp,
          maxHp: baseRow.hp,
          expectedDamagePerBattle: baseRow.expectedDamagePerKill,
          projectedBattles: maxKillsByTime,
          potionQuantity,
          potionHealAmount: potionHeal.healAmount,
        });
        const fullSessionPotionDemand = simulateSurvival({
          currentHp: baseRow.hp,
          maxHp: baseRow.hp,
          expectedDamagePerBattle: baseRow.expectedDamagePerKill,
          projectedBattles: maxKillsByTime,
          potionQuantity: 999999,
          potionHealAmount: potionHeal.healAmount,
        });
        const kills = Math.min(maxKillsByTime, survival.safeBattles);
        const completed = kills >= maxKillsByTime;
        const hoursUntilStop = completed
          ? sessionHours
          : Math.min(sessionHours, ((kills + 1) * secondsPerMob) / 3600);
        const xp = Math.round(kills * baseRow.effectiveXpPerKill);
        const potionsNeededForFullSession =
          fullSessionPotionDemand.safeBattles >= maxKillsByTime
            ? fullSessionPotionDemand.potionsUsed
            : 999999;
        const potionCoveragePercent =
          potionsNeededForFullSession > 0 && potionsNeededForFullSession < 999999
            ? (potionQuantity / potionsNeededForFullSession) * 100
            : completed
              ? 100
              : 0;

        rows.push({
          sessionLabel: `${sessionHours}h`,
          sessionHours,
          huntingLevel: baseRow.huntingLevel,
          potionQuantity,
          tier: baseRow.tier,
          level: baseRow.level,
          className: baseRow.className,
          mapName: baseRow.mapName,
          hp: baseRow.hp,
          potionHealAmount: potionHeal.healAmount,
          secondsPerFind: baseRow.secondsPerFind,
          ttkSeconds: baseRow.ttkSeconds,
          secondsPerMob,
          maxKillsByTime,
          kills,
          xp,
          xpPerScheduledHour: roundNumber(xp / sessionHours),
          xpPerActiveHour: roundNumber(xp / Math.max(0.01, hoursUntilStop)),
          xpPerPotion:
            survival.potionsUsed > 0
              ? roundNumber(xp / survival.potionsUsed)
              : xp,
          potionsUsed: survival.potionsUsed,
          potionsNeededForFullSession,
          potionCoveragePercent: roundNumber(
            Math.min(999, potionCoveragePercent),
            1,
          ),
          completionPercent: roundNumber((hoursUntilStop / sessionHours) * 100, 1),
          hoursUntilStop: roundNumber(hoursUntilStop, 2),
          damagePerHour: roundNumber(
            (baseRow.expectedDamagePerKill * kills) /
              Math.max(0.01, hoursUntilStop),
          ),
          finalHpPercent: survival.finalHpPercent,
          riskLevel: survival.riskLevel,
          xpVsBestPercent: 0,
        });
      }
    }
  }

  applyRelativeXp(rows);

  return rows;
}

function applyRelativeXp(rows: SessionReportRow[]) {
  const groups = new Map<string, SessionReportRow[]>();

  for (const row of rows) {
    const key = [
      row.sessionHours,
      row.huntingLevel,
      row.potionQuantity,
      row.tier,
    ].join(':');
    const group = groups.get(key) ?? [];

    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const bestXp = Math.max(1, ...group.map((row) => row.xp));

    for (const row of group) {
      row.xpVsBestPercent = roundNumber((row.xp / bestXp) * 100, 1);
    }
  }
}

function buildAuditRows(rows: SessionReportRow[]) {
  const groups = new Map<string, SessionReportRow[]>();
  const auditRows: AuditRow[] = [];

  for (const row of rows) {
    const key = [
      row.sessionHours,
      row.huntingLevel,
      row.potionQuantity,
      row.tier,
    ].join(':');
    const group = groups.get(key) ?? [];

    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => right.xp - left.xp);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const completions = group.map((row) => row.completionPercent);
    const minCompletionPercent = Math.min(...completions);
    const maxCompletionPercent = Math.max(...completions);
    const worstXpPercent = roundNumber((worst.xp / Math.max(1, best.xp)) * 100, 1);
    const completionSpread = roundNumber(
      maxCompletionPercent - minCompletionPercent,
      1,
    );
    let status: AuditRow['status'] = 'OK';

    if (worstXpPercent < 85 || completionSpread > 25) {
      status = 'OUTLIER';
    } else if (worstXpPercent < 92 || completionSpread > 15) {
      status = 'WATCH';
    }

    auditRows.push({
      sessionLabel: best.sessionLabel,
      sessionHours: best.sessionHours,
      huntingLevel: best.huntingLevel,
      potionQuantity: best.potionQuantity,
      tier: best.tier,
      bestClass: best.className,
      worstClass: worst.className,
      bestXp: best.xp,
      worstXp: worst.xp,
      xpRatio: roundNumber(best.xp / Math.max(1, worst.xp), 2),
      worstXpPercent,
      minCompletionPercent,
      maxCompletionPercent,
      completionSpread,
      allClassesComplete: group.every((row) => row.completionPercent >= 100),
      status,
    });
  }

  return auditRows.sort(
    (left, right) =>
      left.sessionHours - right.sessionHours ||
      left.huntingLevel - right.huntingLevel ||
      left.potionQuantity - right.potionQuantity ||
      left.tier - right.tier,
  );
}

function rowMatchesFilter(row: SessionReportRow, filter: ChartMetric['filter']) {
  return Object.entries(filter).every(
    ([key, value]) => row[key as keyof SessionReportRow] === value,
  );
}

function getChartRows(rows: SessionReportRow[], metric: ChartMetric) {
  return rows.filter((row) => rowMatchesFilter(row, metric.filter));
}

function getMetricMax(rows: SessionReportRow[], metric: ChartMetric) {
  if (metric.fixedMax) {
    return metric.fixedMax;
  }

  return (
    Math.max(
      1,
      ...getChartRows(rows, metric).map((row) => Number(row[metric.key]) || 0),
    ) * 1.12
  );
}

function buildLinePath(params: {
  rows: SessionReportRow[];
  className: string;
  metric: ChartMetric;
  x: number;
  y: number;
  width: number;
  height: number;
  yMax: number;
}) {
  const xMin = Math.min(...params.metric.xValues);
  const xMax = Math.max(...params.metric.xValues);
  const classRows = getChartRows(params.rows, params.metric)
    .filter((row) => row.className === params.className)
    .sort(
      (left, right) =>
        Number(left[params.metric.xKey]) - Number(right[params.metric.xKey]),
    );
  const points = classRows.map((row) => {
    const rawX = Number(row[params.metric.xKey]) || xMin;
    const xRatio = xMax > xMin ? (rawX - xMin) / (xMax - xMin) : 0;
    const x = params.x + xRatio * Math.max(1, params.width - 10) + 5;
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
  rows: SessionReportRow[];
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
  const xMin = Math.min(...params.metric.xValues);
  const xMax = Math.max(...params.metric.xValues);
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

  for (const value of params.metric.xValues) {
    const xRatio = xMax > xMin ? (value - xMin) / (xMax - xMin) : 0;
    const x = plotLeft + xRatio * Math.max(1, plotWidth - 10) + 5;

    elements.push(
      `<text x="${roundNumber(x, 2)}" y="${plotTop + plotHeight + 24}" text-anchor="middle" class="axis-label">${escapeXml(`${params.metric.xLabelPrefix}${value}`)}</text>`,
    );
  }

  CLASS_ORDER.forEach((className, classIndex) => {
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
          `<title>${escapeXml(`${className}: ${formatNumber(Number(point.row[params.metric.key]) || 0)} | ${point.row.completionPercent}% sessao`)}</title>` +
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

function buildChartMetrics(options: ReportOptions): ChartMetric[] {
  const tiers = Array.from({ length: 10 }, (_, index) => index + 1);

  return [
    {
      key: 'xp',
      title: 'XP por sessao 6h',
      subtitle: 'Caca 50, 100 pocoes. Penaliza morte antes de fechar sessao.',
      yLabel: 'XP',
      xKey: 'tier',
      xValues: tiers,
      xLabelPrefix: 'T',
      filter: { sessionHours: 6, huntingLevel: 50, potionQuantity: 100 },
    },
    {
      key: 'completionPercent',
      title: 'Conclusao da sessao 6h',
      subtitle: 'Caca 50, 100 pocoes. 100% significa sobreviver ate o fim.',
      yLabel: '%',
      xKey: 'tier',
      xValues: tiers,
      xLabelPrefix: 'T',
      fixedMax: 100,
      filter: { sessionHours: 6, huntingLevel: 50, potionQuantity: 100 },
    },
    {
      key: 'potionsNeededForFullSession',
      title: 'Pocoes necessarias para 6h',
      subtitle: 'Caca 50, estoque teorico para completar a sessao.',
      yLabel: 'Pocoes',
      xKey: 'tier',
      xValues: tiers,
      xLabelPrefix: 'T',
      filter: { sessionHours: 6, huntingLevel: 50, potionQuantity: 100 },
    },
    {
      key: 'xpPerPotion',
      title: 'XP por pocao',
      subtitle: 'Caca 50, 100 pocoes em sessao free.',
      yLabel: 'XP/pocao',
      xKey: 'tier',
      xValues: tiers,
      xLabelPrefix: 'T',
      filter: { sessionHours: 6, huntingLevel: 50, potionQuantity: 100 },
    },
    {
      key: 'xp',
      title: 'T10 por nivel de caca',
      subtitle: 'Sessao 6h, 100 pocoes. Mostra impacto do tempo de encontro.',
      yLabel: 'XP',
      xKey: 'huntingLevel',
      xValues: options.huntingLevels,
      xLabelPrefix: 'C',
      filter: { sessionHours: 6, potionQuantity: 100, tier: 10 },
    },
    {
      key: 'completionPercent',
      title: 'T10 por estoque de pocao',
      subtitle: 'Sessao 6h, caca 50. Mostra ponto de quebra de sobrevivencia.',
      yLabel: '%',
      xKey: 'potionQuantity',
      xValues: options.potionQuantities,
      xLabelPrefix: 'P',
      fixedMax: 100,
      filter: { sessionHours: 6, huntingLevel: 50, tier: 10 },
    },
    {
      key: 'xp',
      title: 'XP por sessao 12h',
      subtitle: 'Caca 50, 100 pocoes. Cenario premium.',
      yLabel: 'XP',
      xKey: 'tier',
      xValues: tiers,
      xLabelPrefix: 'T',
      filter: { sessionHours: 12, huntingLevel: 50, potionQuantity: 100 },
    },
    {
      key: 'potionsNeededForFullSession',
      title: 'Pocoes necessarias para 12h',
      subtitle: 'Caca 50, estoque teorico para completar sessao premium.',
      yLabel: 'Pocoes',
      xKey: 'tier',
      xValues: tiers,
      xLabelPrefix: 'T',
      filter: { sessionHours: 12, huntingLevel: 50, potionQuantity: 100 },
    },
  ];
}

function renderSvg(params: {
  rows: SessionReportRow[];
  auditRows: AuditRow[];
  options: ReportOptions;
}) {
  const width = 1600;
  const chartWidth = 740;
  const chartHeight = 520;
  const metrics = buildChartMetrics(params.options);
  const startY = 230;
  const rowGap = 42;
  const chartElements = metrics.map((metric, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 50 : 810;
    const y = startY + row * (chartHeight + rowGap);

    return renderChart({
      rows: params.rows,
      metric,
      x,
      y,
      width: chartWidth,
      height: chartHeight,
    });
  });
  const height =
    startY + Math.ceil(metrics.length / 2) * (chartHeight + rowGap) + 140;
  const outliers = params.auditRows.filter((row) => row.status === 'OUTLIER');
  const worst = [...params.auditRows].sort(
    (left, right) => left.worstXpPercent - right.worstXpPercent,
  )[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Painel de sessoes do auto-combate">
  <style>
    .title { font: 700 34px Arial, sans-serif; fill: #101828; }
    .subtitle { font: 400 18px Arial, sans-serif; fill: #475467; }
    .meta { font: 600 16px Arial, sans-serif; fill: #344054; }
    .chart-title { font: 700 21px Arial, sans-serif; fill: #101828; }
    .chart-subtitle { font: 400 14px Arial, sans-serif; fill: #667085; }
    .axis-label { font: 400 12px Arial, sans-serif; fill: #667085; }
    .axis-title { font: 700 12px Arial, sans-serif; fill: #667085; }
    .legend-label { font: 600 13px Arial, sans-serif; fill: #344054; }
  </style>
  <rect width="100%" height="100%" fill="#f5f7fb"/>
  <text x="50" y="62" class="title">Painel de sessoes do auto-combate</text>
  <text x="50" y="96" class="subtitle">Combate + caca + pocoes em sessoes reais. Inclui 6h free e 12h premium, caca ${escapeXml(params.options.huntingLevels.join('/'))}, estoques ${escapeXml(params.options.potionQuantities.join('/'))}.</text>
  <text x="50" y="132" class="meta">Modelo: ${escapeXml(AUTO_COMBAT_BALANCE_MODEL_LABEL)} | Fonte: JSONs de mapas reais do seed | Sem descanso automatico | Gatilho interno de pocao: ${AUTO_POTION_TRIGGER_PERCENT}%.</text>
  <text x="50" y="162" class="meta">Pior combinacao: ${escapeXml(worst?.sessionLabel ?? '')}, C${worst?.huntingLevel ?? 0}, P${worst?.potionQuantity ?? 0}, T${worst?.tier ?? 0}: ${escapeXml(worst?.worstClass ?? '')} ficou em ${worst?.worstXpPercent ?? 0}% do melhor. Outliers: ${outliers.length}.</text>
  ${chartElements.join('\n')}
</svg>`;
}

function toCsv<T extends Record<string, unknown>>(rows: T[]) {
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

function main() {
  const options = parseArgs();
  const modelSlug = toSlug(AUTO_COMBAT_BALANCE_MODEL_LABEL);
  const dataDir = getDataDir(options);
  const rows = buildSessionRows(options);
  const auditRows = buildAuditRows(rows);
  const panelPath = resolve(
    options.outputDir,
    `${modelSlug}-painel-sessoes-auto-combate.svg`,
  );
  const jsonPath = resolve(dataDir, `${modelSlug}-sessoes-auto-combate.json`);
  const csvPath = resolve(dataDir, `${modelSlug}-sessoes-auto-combate.csv`);
  const auditCsvPath = resolve(
    dataDir,
    `${modelSlug}-sessoes-auto-combate-auditoria.csv`,
  );

  mkdirSync(options.outputDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        model: AUTO_COMBAT_BALANCE_MODEL_LABEL,
        source: 'derived-from-real-seed-map-balance-json',
        sessionHours: options.sessionHours,
        huntingLevels: options.huntingLevels,
        potionQuantities: options.potionQuantities,
        rows,
        auditRows,
      },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(csvPath, toCsv(rows as unknown as Record<string, unknown>[]), 'utf8');
  writeFileSync(
    auditCsvPath,
    toCsv(auditRows as unknown as Record<string, unknown>[]),
    'utf8',
  );
  writeFileSync(
    panelPath,
    renderSvg({
      rows,
      auditRows,
      options,
    }),
    'utf8',
  );

  const outliers = auditRows.filter((row) => row.status === 'OUTLIER');
  const watch = auditRows.filter((row) => row.status === 'WATCH');

  console.log('Auto-combat session report exported');
  console.log(`SVG: ${panelPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Audit CSV: ${auditCsvPath}`);
  console.log(`Audit: ${outliers.length} outliers, ${watch.length} watch.`);
  console.table(
    auditRows
      .filter(
        (row) =>
          row.sessionHours === 6 &&
          row.huntingLevel === 50 &&
          row.potionQuantity === 100,
      )
      .sort((left, right) => left.tier - right.tier)
      .map((row) => ({
        tier: row.tier,
        best: row.bestClass,
        worst: row.worstClass,
        worst_pct: row.worstXpPercent,
        min_completion: row.minCompletionPercent,
        spread: row.completionSpread,
        status: row.status,
      })),
  );
}

main();
