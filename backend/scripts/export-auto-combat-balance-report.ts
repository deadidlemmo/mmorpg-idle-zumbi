import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import { equipmentDefinitions } from '../prisma/seed-data/items.seed-data';
import { buildMobCombatStats } from '../prisma/seed-data/mob-stats.seed-data';
import { AUTO_COMBAT_BALANCE_MODEL_LABEL } from '../src/common/config/combat-balance.config';
import { AUTO_COMBAT_HUNTING_LEVEL_CAP } from '../src/common/config/auto-combat.config';
import {
  GATHERING_LEVEL_CAP,
  getGatheringStatBonus,
} from '../src/common/config/gathering.config';
import {
  applyAutoCombatIncomingDamageMultiplier,
  applyAutoCombatPotionHealMultiplier,
  applyAutoCombatXpEfficiency,
  scaleAutoCombatGatheringBonus,
} from '../src/common/utils/auto-combat-balance.util';
import { getAutoCombatHuntingSecondsPerEnemy } from '../src/common/utils/auto-combat-hunting.util';
import { calculateAutoCombatTtk } from '../src/common/utils/auto-combat-ttk.util';
import {
  projectAutoCombatSurvival,
  type AutoCombatSurvivalRiskLevel,
} from '../src/common/utils/auto-combat-survival.util';
import {
  calculateFullStats,
  createEmptyPrimaryStats,
  type PrimaryStats,
} from '../src/common/utils/stats.util';

type ItemStatsBonus = {
  slot?: string | null;
  className?: string | null;
  tier?: number | null;
  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;
};

type BalanceReportOptions = {
  kills: number;
  potionQuantity: number;
  huntingLevel: number;
  outputDir: string;
};

type BalanceReportRow = {
  tier: number;
  level: number;
  className: string;
  equipmentPoints: number;
  hp: number;
  defense: number;
  attack: number;
  power: number;
  mobXp: number;
  secondsPerFind: number;
  ttkSeconds: number;
  secondsPerMob: number;
  killsPerHour: number;
  effectiveXpPerHour: number;
  xpPerHourVsBestPercent: number;
  timeHours: number;
  effectiveXpPerKill: number;
  effectiveXpPerSample: number;
  potionsUsed: number;
  expectedDamagePerKill: number;
  riskLevel: AutoCombatSurvivalRiskLevel;
  xpVsBestPercent: number;
};

type ChartMetric = {
  key: keyof Pick<
    BalanceReportRow,
    | 'effectiveXpPerHour'
    | 'xpPerHourVsBestPercent'
    | 'effectiveXpPerSample'
    | 'timeHours'
    | 'potionsUsed'
    | 'xpVsBestPercent'
  >;
  title: string;
  subtitle: string;
  yLabel: string;
  valueSuffix?: string;
};

const DEFAULT_KILLS = 1000;
const DEFAULT_POTION_QUANTITY = 9999;
const DEFAULT_HUNTING_LEVEL = AUTO_COMBAT_HUNTING_LEVEL_CAP;

const EQUIPMENT_STAT_KEYS = [
  'strengthBonus',
  'vitalityBonus',
  'agilityBonus',
  'precisionBonus',
  'techniqueBonus',
  'willpowerBonus',
] as const satisfies Array<keyof ItemStatsBonus>;

const EQUIPMENT_SLOT_ORDER = [
  'MAIN_HAND',
  'OFF_HAND',
  'HEAD',
  'ARMOR',
  'PANTS',
  'BOOTS',
] as const;

const GATHERING_STAT_BY_ORIGIN = {
  DESMANCHE: 'strength',
  COLETA: 'vitality',
  PATRULHA: 'agility',
  ARSENAL: 'precision',
  TECNOVARREDURA: 'technique',
  CONTENCAO: 'willpower',
} as const satisfies Record<string, keyof PrimaryStats>;

const RECOMMENDED_GATHERING_ORIGINS_BY_CLASS: Record<string, string[]> = {
  lutador: ['DESMANCHE', 'COLETA', 'CONTENCAO'],
  assassino: ['PATRULHA', 'ARSENAL', 'DESMANCHE'],
  atirador: ['ARSENAL', 'TECNOVARREDURA', 'PATRULHA'],
  medico: ['TECNOVARREDURA', 'CONTENCAO', 'COLETA'],
};

const CLASS_COLORS: Record<string, string> = {
  Lutador: '#d94b4b',
  Assassino: '#8b5cf6',
  Atirador: '#2563eb',
  Medico: '#16a34a',
};

const CHART_METRICS: ChartMetric[] = [
  {
    key: 'effectiveXpPerHour',
    title: 'XP efetivo por hora',
    subtitle: 'Metrica principal de balanceamento entre classes.',
    yLabel: 'XP/h',
  },
  {
    key: 'xpPerHourVsBestPercent',
    title: 'XP/h relativo ao melhor do tier',
    subtitle: 'Quanto cada classe fica perto da melhor classe em XP/h.',
    yLabel: '% do melhor',
    valueSuffix: '%',
  },
  {
    key: 'effectiveXpPerSample',
    title: 'XP efetivo por amostra',
    subtitle: 'Inclui passiva de classe e penalidade/bonus por risco.',
    yLabel: 'XP',
  },
  {
    key: 'timeHours',
    title: 'Tempo total por amostra',
    subtitle: 'Tempo teorico somando encontro da caça e TTK de combate.',
    yLabel: 'Horas',
    valueSuffix: 'h',
  },
  {
    key: 'potionsUsed',
    title: 'Pocoes projetadas por amostra',
    subtitle: 'Estimativa do modelo de sobrevivencia com gatilho em 35% HP.',
    yLabel: 'Pocoes',
  },
  {
    key: 'xpVsBestPercent',
    title: 'XP relativo ao melhor do tier',
    subtitle: 'Quanto cada classe fica perto da melhor classe daquele tier.',
    yLabel: '% do melhor',
    valueSuffix: '%',
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

function parseArgs(): BalanceReportOptions {
  const options: BalanceReportOptions = {
    kills: DEFAULT_KILLS,
    potionQuantity: DEFAULT_POTION_QUANTITY,
    huntingLevel: DEFAULT_HUNTING_LEVEL,
    outputDir: resolve(process.cwd(), '..', '_reports'),
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = splitArg(arg);

    switch (key) {
      case '--kills':
        options.kills = parsePositiveInteger(value, DEFAULT_KILLS);
        break;
      case '--potions':
        options.potionQuantity = parsePositiveInteger(
          value,
          DEFAULT_POTION_QUANTITY,
        );
        break;
      case '--hunting-level':
        options.huntingLevel = Math.min(
          AUTO_COMBAT_HUNTING_LEVEL_CAP,
          parsePositiveInteger(value, DEFAULT_HUNTING_LEVEL),
        );
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

function normalizeClassName(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function displayClassName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

function getEquipmentItemStatsTotal(item: ItemStatsBonus) {
  return EQUIPMENT_STAT_KEYS.reduce(
    (sum, stat) => sum + Math.max(0, Number(item[stat]) || 0),
    0,
  );
}

function getSeedEquipmentItems(className: string, tier: number) {
  const classKey = normalizeClassName(className);
  const classItems = equipmentDefinitions.filter(
    (item) =>
      normalizeClassName(item.className) === classKey &&
      Math.floor(Number(item.tier) || 0) === tier,
  );

  return EQUIPMENT_SLOT_ORDER.flatMap((slot) => {
    const selected = classItems
      .filter((item) => String(item.slot) === slot)
      .sort(
        (left, right) =>
          getEquipmentItemStatsTotal(right) - getEquipmentItemStatsTotal(left),
      )[0];

    return selected ? [selected] : [];
  });
}

function addGatheringOriginBonus(
  total: PrimaryStats,
  origin: keyof typeof GATHERING_STAT_BY_ORIGIN,
  gatheringLevel: number,
) {
  const stat = GATHERING_STAT_BY_ORIGIN[origin];
  const safeLevel = Math.min(
    GATHERING_LEVEL_CAP,
    Math.max(1, Math.floor(Number(gatheringLevel) || 1)),
  );

  total[stat] += getGatheringStatBonus(safeLevel);
}

function buildRecommendedGatheringBonus(className: string, level: number) {
  const total = createEmptyPrimaryStats();
  const origins =
    RECOMMENDED_GATHERING_ORIGINS_BY_CLASS[normalizeClassName(className)] ?? [];

  for (const origin of origins) {
    addGatheringOriginBonus(
      total,
      origin as keyof typeof GATHERING_STAT_BY_ORIGIN,
      level,
    );
  }

  return total;
}

function simulateClassTier(params: {
  classDefinition: (typeof classDefinitions)[number];
  tier: number;
  kills: number;
  potionQuantity: number;
  huntingLevel: number;
}): BalanceReportRow {
  const { classDefinition, tier, kills, potionQuantity } = params;
  const level = tier * 10;
  const equipmentItems = getSeedEquipmentItems(classDefinition.name, tier);
  const rawGatheringBonus = buildRecommendedGatheringBonus(
    classDefinition.name,
    level,
  );
  const combatGatheringBonus = scaleAutoCombatGatheringBonus(rawGatheringBonus);
  const visibleStats = calculateFullStats(
    classDefinition,
    equipmentItems,
    level,
    rawGatheringBonus,
  );
  const combatStats = calculateFullStats(
    classDefinition,
    equipmentItems,
    level,
    combatGatheringBonus,
  );
  const mob = buildMobCombatStats({
    tier,
    level,
    mobName: `Relatorio balanceamento T${tier} L${level}`,
    mobType: 'MONSTER',
  });
  const primary = combatStats.totalPrimaryStats;
  const derived = combatStats.derivedCombatStats;
  const maxHp = visibleStats.derivedCombatStats.maxHp;
  const ttk = calculateAutoCombatTtk({
    mob,
    playerStats: {
      className: classDefinition.name,
      attack: derived.attack,
      speed: derived.speed,
      precision: primary.precision,
      technique: primary.technique,
      agility: primary.agility,
    },
  });
  const mobAttack = applyAutoCombatIncomingDamageMultiplier({
    attack: mob.attack,
    className: classDefinition.name,
  });
  const potionHealAmount = applyAutoCombatPotionHealMultiplier({
    healAmount: Math.floor(maxHp * 0.3),
    className: classDefinition.name,
  });
  const survival = projectAutoCombatSurvival({
    currentHp: maxHp,
    maxHp,
    playerDefense: derived.defense,
    playerAgility: primary.agility,
    mobAttack,
    mobPrecision: mob.speed,
    mobTechnique: mob.level,
    projectedKills: kills,
    potion: {
      availableQuantity: potionQuantity,
      healAmount: potionHealAmount,
      hpThresholdPercent: 35,
    },
  });
  const effectiveXpPerKill = applyAutoCombatXpEfficiency({
    baseXp: mob.xpReward,
    className: classDefinition.name,
    riskLevel: survival.riskLevel,
  });
  const secondsPerFind = getAutoCombatHuntingSecondsPerEnemy(
    params.huntingLevel,
  );
  const secondsPerMob = secondsPerFind + ttk.estimatedKillTimeSeconds;
  const killsPerHour = Math.floor(3600 / secondsPerMob);

  return {
    tier,
    level,
    className: displayClassName(classDefinition.name),
    equipmentPoints: equipmentItems.reduce(
      (sum, item) => sum + getEquipmentItemStatsTotal(item),
      0,
    ),
    hp: maxHp,
    defense: derived.defense,
    attack: derived.attack,
    power: roundNumber(ttk.playerOffensivePower, 1),
    mobXp: mob.xpReward,
    secondsPerFind,
    ttkSeconds: ttk.estimatedKillTimeSeconds,
    secondsPerMob,
    killsPerHour,
    effectiveXpPerHour: killsPerHour * effectiveXpPerKill,
    xpPerHourVsBestPercent: 0,
    timeHours: roundNumber((secondsPerMob * kills) / 3600, 2),
    effectiveXpPerKill,
    effectiveXpPerSample: effectiveXpPerKill * kills,
    potionsUsed: survival.expectedPotionsUsed,
    expectedDamagePerKill: survival.expectedDamagePerKill,
    riskLevel: survival.riskLevel,
    xpVsBestPercent: 0,
  };
}

function buildRows(options: BalanceReportOptions) {
  const rows = Array.from({ length: 10 }, (_, index) => index + 1).flatMap(
    (tier) =>
      classDefinitions.map((classDefinition) =>
        simulateClassTier({
          classDefinition,
          tier,
          kills: options.kills,
          potionQuantity: options.potionQuantity,
          huntingLevel: options.huntingLevel,
        }),
      ),
  );

  for (const tier of Array.from({ length: 10 }, (_, index) => index + 1)) {
    const tierRows = rows.filter((row) => row.tier === tier);
    const bestXpPerHour = Math.max(
      1,
      ...tierRows.map((row) => row.effectiveXpPerHour),
    );
    const bestXp = Math.max(
      1,
      ...tierRows.map((row) => row.effectiveXpPerSample),
    );

    for (const row of tierRows) {
      row.xpPerHourVsBestPercent = roundNumber(
        (row.effectiveXpPerHour / bestXpPerHour) * 100,
        1,
      );
      row.xpVsBestPercent = roundNumber(
        (row.effectiveXpPerSample / bestXp) * 100,
        1,
      );
    }
  }

  return rows;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function getMetricMax(rows: BalanceReportRow[], metric: ChartMetric) {
  const values = rows.map((row) => Number(row[metric.key]) || 0);
  const maxValue = Math.max(1, ...values);

  if (
    metric.key === 'xpVsBestPercent' ||
    metric.key === 'xpPerHourVsBestPercent'
  ) {
    return 100;
  }

  return maxValue * 1.12;
}

function buildLinePath(params: {
  rows: BalanceReportRow[];
  className: string;
  metric: ChartMetric;
  x: number;
  y: number;
  width: number;
  height: number;
  yMax: number;
}) {
  const classRows = params.rows
    .filter((row) => row.className === params.className)
    .sort((left, right) => left.tier - right.tier);
  const points = classRows.map((row) => {
    const x =
      params.x + ((row.tier - 1) / 9) * Math.max(1, params.width - 10) + 5;
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
  rows: BalanceReportRow[];
  metric: ChartMetric;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const plotLeft = params.x + 70;
  const plotTop = params.y + 76;
  const plotWidth = params.width - 105;
  const plotHeight = params.height - 126;
  const yMax = getMetricMax(params.rows, params.metric);
  const classes = classDefinitions.map((definition) =>
    displayClassName(definition.name),
  );
  const gridLines = Array.from({ length: 5 }, (_, index) => index);
  const tierLabels = Array.from({ length: 10 }, (_, index) => index + 1);
  const elements: string[] = [];

  elements.push(
    `<g class="chart" transform="translate(0 0)">`,
    `<rect x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" rx="14" fill="#ffffff" stroke="#d7dde8"/>`,
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

  for (const tier of tierLabels) {
    const x = plotLeft + ((tier - 1) / 9) * Math.max(1, plotWidth - 10) + 5;

    elements.push(
      `<text x="${roundNumber(x, 2)}" y="${plotTop + plotHeight + 24}" text-anchor="middle" class="axis-label">T${tier}</text>`,
    );
  }

  classes.forEach((className, classIndex) => {
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
    const legendX = params.x + 24 + classIndex * 135;
    const legendY = params.y + params.height - 22;

    elements.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );

    for (const point of points) {
      const isLethal = point.row.riskLevel === 'LETHAL';

      elements.push(
        `<circle cx="${point.x}" cy="${point.y}" r="${isLethal ? 5 : 4}" fill="${color}" stroke="${isLethal ? '#111827' : '#ffffff'}" stroke-width="${isLethal ? 2 : 1.5}">` +
          `<title>${escapeXml(`${className} T${point.row.tier}: ${formatNumber(Number(point.row[params.metric.key]))}${params.metric.valueSuffix ?? ''} | risco ${point.row.riskLevel}`)}</title>` +
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

function renderSvg(rows: BalanceReportRow[], options: BalanceReportOptions) {
  const width = 1600;
  const height = 2600;
  const chartWidth = 740;
  const chartHeight = 650;
  const positions = [
    { x: 50, y: 210 },
    { x: 810, y: 210 },
    { x: 50, y: 910 },
    { x: 810, y: 910 },
    { x: 50, y: 1610 },
    { x: 810, y: 1610 },
  ];
  const summaryByTier = Array.from({ length: 10 }, (_, index) => index + 1).map(
    (tier) => {
      const tierRows = rows
        .filter((row) => row.tier === tier)
        .sort(
          (left, right) => right.effectiveXpPerHour - left.effectiveXpPerHour,
        );
      const best = tierRows[0];
      const worst = tierRows[tierRows.length - 1];
      const ratio =
        best && worst
          ? best.effectiveXpPerHour / Math.max(1, worst.effectiveXpPerHour)
          : 0;

      return {
        tier,
        best: best?.className ?? '',
        worst: worst?.className ?? '',
        ratio: roundNumber(ratio, 2),
        worstPercent: worst?.xpPerHourVsBestPercent ?? 0,
      };
    },
  );
  const worstTier = [...summaryByTier].sort(
    (left, right) => left.worstPercent - right.worstPercent,
  )[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Auto-combat balance report">
  <style>
    .title { font: 700 34px Arial, sans-serif; fill: #101828; }
    .subtitle { font: 400 18px Arial, sans-serif; fill: #475467; }
    .meta { font: 600 16px Arial, sans-serif; fill: #344054; }
    .chart-title { font: 700 22px Arial, sans-serif; fill: #101828; }
    .chart-subtitle { font: 400 14px Arial, sans-serif; fill: #667085; }
    .axis-label { font: 400 12px Arial, sans-serif; fill: #667085; }
    .axis-title { font: 700 12px Arial, sans-serif; fill: #667085; }
    .legend-label { font: 600 13px Arial, sans-serif; fill: #344054; }
    .note { font: 400 14px Arial, sans-serif; fill: #475467; }
  </style>
  <rect width="100%" height="100%" fill="#f5f7fb"/>
  <text x="50" y="62" class="title">Balanceamento Auto-combate</text>
  <text x="50" y="96" class="subtitle">Amostra fixa de ${options.kills} mobs por tier, equipamento real do seed, gathering recomendado, caca nivel ${options.huntingLevel} e ${options.potionQuantity} pocoes disponiveis.</text>
  <text x="50" y="132" class="meta">Modelo: ${escapeXml(AUTO_COMBAT_BALANCE_MODEL_LABEL)} | Nivel representativo por tier: T1=L10 ... T10=L100</text>
  <text x="50" y="162" class="meta">Pior tier no XP/h: T${worstTier.tier}, melhor ${escapeXml(worstTier.best)}, pior ${escapeXml(worstTier.worst)}, ratio ${worstTier.ratio}, pior ${worstTier.worstPercent}%.</text>
  ${CHART_METRICS.map((metric, index) =>
    renderChart({
      rows,
      metric,
      x: positions[index].x,
      y: positions[index].y,
      width: chartWidth,
      height: chartHeight,
    }),
  ).join('\n')}
  <rect x="50" y="2320" width="1500" height="190" rx="14" fill="#ffffff" stroke="#d7dde8"/>
  <text x="74" y="2352" class="chart-title">Leitura rapida</text>
  <text x="74" y="2382" class="note">1. XP/h e a metrica principal: usa tempo de encontrar mob + TTK, sem descanso automatico.</text>
  <text x="74" y="2410" class="note">2. XP por amostra mostra recompensa por ${options.kills} mobs; pode variar mais quando classes rapidas terminam a amostra antes.</text>
  <text x="74" y="2438" class="note">3. Pontos com borda escura estao em risco LETHAL no modelo de sobrevivencia para ${options.kills} kills projetadas.</text>
  <text x="74" y="2466" class="note">4. CSV e JSON foram exportados junto com este SVG para auditoria dos numeros.</text>
</svg>`;
}

function toCsv(rows: BalanceReportRow[]) {
  const headers = [
    'tier',
    'level',
    'className',
    'equipmentPoints',
    'hp',
    'attack',
    'defense',
    'power',
    'mobXp',
    'secondsPerFind',
    'ttkSeconds',
    'secondsPerMob',
    'killsPerHour',
    'effectiveXpPerHour',
    'xpPerHourVsBestPercent',
    'timeHours',
    'effectiveXpPerKill',
    'effectiveXpPerSample',
    'xpVsBestPercent',
    'potionsUsed',
    'expectedDamagePerKill',
    'riskLevel',
  ];
  const lines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header as keyof BalanceReportRow];

        return typeof value === 'string'
          ? `"${value.replace(/"/g, '""')}"`
          : String(value);
      })
      .join(','),
  );

  return [headers.join(','), ...lines].join('\n');
}

function main() {
  const options = parseArgs();
  const rows = buildRows(options);
  const outputDir = options.outputDir;
  const baseName = `auto-combat-balance-${options.kills}-mobs`;
  const svgPath = resolve(outputDir, `${baseName}.svg`);
  const csvPath = resolve(outputDir, `${baseName}.csv`);
  const jsonPath = resolve(outputDir, `${baseName}.json`);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(svgPath, renderSvg(rows, options), 'utf8');
  writeFileSync(csvPath, toCsv(rows), 'utf8');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        model: AUTO_COMBAT_BALANCE_MODEL_LABEL,
        kills: options.kills,
        potionQuantity: options.potionQuantity,
        huntingLevel: options.huntingLevel,
        scenario:
          'seed equipment + recommended gathering + hunting time + current balance model',
        rows,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('Auto-combat balance report exported');
  console.log(`SVG: ${svgPath}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.table(
    rows
      .filter((row) => row.tier === 10)
      .sort((left, right) => right.effectiveXpPerHour - left.effectiveXpPerHour)
      .map((row) => ({
        tier: row.tier,
        class: row.className,
        xp_h: row.effectiveXpPerHour,
        xp_sample: row.effectiveXpPerSample,
        find_s: row.secondsPerFind,
        ttk_s: row.ttkSeconds,
        mob_s: row.secondsPerMob,
        time_h: row.timeHours,
        potions: row.potionsUsed,
        risk: row.riskLevel,
      })),
  );
}

main();
