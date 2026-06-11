import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import { equipmentDefinitions } from '../prisma/seed-data/items.seed-data';
import { buildMobCombatStats } from '../prisma/seed-data/mob-stats.seed-data';
import { calculateAutoCombatPotionHeal } from './auto-combat-potion-balancing';
import { AUTO_COMBAT_BALANCE_MODEL_LABEL } from '../src/common/config/combat-balance.config';
import { AUTO_COMBAT_HUNTING_LEVEL_CAP } from '../src/common/config/auto-combat.config';
import {
  GATHERING_LEVEL_CAP,
  getGatheringStatBonus,
} from '../src/common/config/gathering.config';
import {
  applyAutoCombatIncomingDamageMultiplier,
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

type GatheringMode = 'none' | 'recommended' | 'full';

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

type ValidationOptions = {
  levels: number[];
  durationSeconds: number;
  gatheringMode: GatheringMode;
  potionQuantity: number;
  huntingLevel: number;
  strict: boolean;
  maxRatio: number;
  minWorstPercent: number;
  summaryOnly: boolean;
  topOutliers: number | null;
};

type ValidationRow = {
  level: number;
  tier: number;
  className: string;
  equipmentPoints: number;
  hp: number;
  attack: number;
  defense: number;
  power: number;
  secondsPerFind: number;
  ttkSeconds: number;
  secondsPerMob: number;
  plannedKills: number;
  rawXpPerHour: number;
  effectiveXpPerHour: number;
  xpVsBestPercent: number;
  expectedDamagePerKill: number;
  expectedPotionsUsed: number;
  riskLevel: AutoCombatSurvivalRiskLevel;
};

const DEFAULT_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const DEFAULT_DURATION_SECONDS = 3600;
const DEFAULT_POTION_QUANTITY = 9999;
const DEFAULT_HUNTING_LEVEL = AUTO_COMBAT_HUNTING_LEVEL_CAP;
const DEFAULT_MAX_RATIO = 1.15;
const DEFAULT_MIN_WORST_PERCENT = 90;
const DEFAULT_TOP_OUTLIERS = 10;
const LONG_TERM_TARGET_MAX_RATIO = 1.1;
const LONG_TERM_TARGET_MIN_WORST_PERCENT = 90;

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

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function parseLevels(value?: string) {
  if (!value) {
    return DEFAULT_LEVELS;
  }

  const levels = value
    .split(',')
    .map((level) => Math.floor(Number(level.trim())))
    .filter((level) => Number.isFinite(level) && level >= 1 && level <= 100);

  return levels.length > 0
    ? Array.from(new Set(levels)).sort((a, b) => a - b)
    : DEFAULT_LEVELS;
}

function parseGatheringMode(value?: string): GatheringMode {
  if (value === 'none' || value === 'recommended' || value === 'full') {
    return value;
  }

  return 'recommended';
}

function parseArgs(): ValidationOptions {
  const args = process.argv.slice(2);
  const options: ValidationOptions = {
    levels: DEFAULT_LEVELS,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    gatheringMode: 'recommended',
    potionQuantity: DEFAULT_POTION_QUANTITY,
    huntingLevel: DEFAULT_HUNTING_LEVEL,
    strict: false,
    maxRatio: DEFAULT_MAX_RATIO,
    minWorstPercent: DEFAULT_MIN_WORST_PERCENT,
    summaryOnly: false,
    topOutliers: null,
  };

  for (const arg of args) {
    if (arg === '--all-levels') {
      options.levels = Array.from({ length: 100 }, (_, index) => index + 1);
      continue;
    }

    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    if (arg === '--summary-only') {
      options.summaryOnly = true;
      continue;
    }

    const [key, value] = arg.split('=');

    switch (key) {
      case '--levels':
        options.levels = parseLevels(value);
        break;
      case '--duration':
        options.durationSeconds = parsePositiveNumber(
          value,
          DEFAULT_DURATION_SECONDS,
        );
        break;
      case '--gathering':
        options.gatheringMode = parseGatheringMode(value);
        break;
      case '--potions':
        options.potionQuantity = Math.max(
          0,
          Math.floor(parsePositiveNumber(value, DEFAULT_POTION_QUANTITY)),
        );
        break;
      case '--hunting-level':
        options.huntingLevel = Math.min(
          AUTO_COMBAT_HUNTING_LEVEL_CAP,
          Math.floor(parsePositiveNumber(value, DEFAULT_HUNTING_LEVEL)),
        );
        break;
      case '--max-ratio':
        options.maxRatio = parsePositiveNumber(value, DEFAULT_MAX_RATIO);
        break;
      case '--min-worst':
        options.minWorstPercent = parsePositiveNumber(
          value,
          DEFAULT_MIN_WORST_PERCENT,
        );
        break;
      case '--top-outliers':
        options.topOutliers = parseNonNegativeInteger(
          value,
          DEFAULT_TOP_OUTLIERS,
        );
        break;
      default:
        break;
    }
  }

  return options;
}

function getTierForLevel(level: number) {
  return Math.max(1, Math.ceil(level / 10));
}

function getEquipmentItemStatsTotal(item: ItemStatsBonus) {
  return EQUIPMENT_STAT_KEYS.reduce(
    (sum, stat) => sum + Math.max(0, Number(item[stat]) || 0),
    0,
  );
}

function getEquipmentPoints(items: ItemStatsBonus[]) {
  return items.reduce((sum, item) => sum + getEquipmentItemStatsTotal(item), 0);
}

function getSeedEquipmentItems(className: string, tier: number) {
  const classKey = normalizeClassName(className);
  const safeTier = Math.max(1, Math.floor(Number(tier) || 1));
  const classItems = equipmentDefinitions.filter(
    (item) =>
      normalizeClassName(item.className) === classKey &&
      Math.floor(Number(item.tier) || 0) === safeTier,
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

function buildGatheringBonus(
  className: string,
  level: number,
  gatheringMode: GatheringMode,
) {
  const total = createEmptyPrimaryStats();

  if (gatheringMode === 'none') {
    return total;
  }

  if (gatheringMode === 'full') {
    for (const origin of Object.keys(GATHERING_STAT_BY_ORIGIN)) {
      addGatheringOriginBonus(
        total,
        origin as keyof typeof GATHERING_STAT_BY_ORIGIN,
        GATHERING_LEVEL_CAP,
      );
    }

    return total;
  }

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

function simulateClass(params: {
  classDefinition: (typeof classDefinitions)[number];
  level: number;
  options: ValidationOptions;
}): ValidationRow {
  const { classDefinition, level, options } = params;
  const tier = getTierForLevel(level);
  const equipmentItems = getSeedEquipmentItems(classDefinition.name, tier);
  const rawGatheringBonus = buildGatheringBonus(
    classDefinition.name,
    level,
    options.gatheringMode,
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
    mobName: `Validacao controlada T${tier} L${level}`,
    mobType: 'MONSTER',
  });
  const primary = combatStats.totalPrimaryStats;
  const derived = combatStats.derivedCombatStats;
  const maxHp = visibleStats.derivedCombatStats.maxHp;
  const playerStats = {
    className: classDefinition.name,
    attack: derived.attack,
    speed: derived.speed,
    precision: primary.precision,
    technique: primary.technique,
    agility: primary.agility,
  };
  const ttk = calculateAutoCombatTtk({
    mob,
    playerStats,
  });
  const secondsPerFind = getAutoCombatHuntingSecondsPerEnemy(
    options.huntingLevel,
  );
  const secondsPerMob = secondsPerFind + ttk.estimatedKillTimeSeconds;
  const plannedKills = Math.max(
    0,
    Math.floor(options.durationSeconds / secondsPerMob),
  );
  const mobAttack = applyAutoCombatIncomingDamageMultiplier({
    attack: mob.attack,
    className: classDefinition.name,
  });
  const potionHeal = calculateAutoCombatPotionHeal({
    tier,
    maxHp,
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
    projectedKills: Math.max(1, plannedKills),
    potion: {
      availableQuantity: options.potionQuantity,
      healAmount: potionHeal.healAmount,
      hpThresholdPercent: 35,
    },
  });
  const effectiveXpPerKill = applyAutoCombatXpEfficiency({
    baseXp: mob.xpReward,
    className: classDefinition.name,
    riskLevel: survival.riskLevel,
  });
  const rawXp = plannedKills * mob.xpReward;
  const effectiveXp = plannedKills * effectiveXpPerKill;
  const hourlyMultiplier = 3600 / options.durationSeconds;

  return {
    level,
    tier,
    className: displayClassName(classDefinition.name),
    equipmentPoints: getEquipmentPoints(equipmentItems),
    hp: maxHp,
    attack: derived.attack,
    defense: derived.defense,
    power: roundNumber(ttk.playerOffensivePower, 1),
    secondsPerFind,
    ttkSeconds: ttk.estimatedKillTimeSeconds,
    secondsPerMob,
    plannedKills,
    rawXpPerHour: Math.round(rawXp * hourlyMultiplier),
    effectiveXpPerHour: Math.round(effectiveXp * hourlyMultiplier),
    xpVsBestPercent: 0,
    expectedDamagePerKill: survival.expectedDamagePerKill,
    expectedPotionsUsed: survival.expectedPotionsUsed,
    riskLevel: survival.riskLevel,
  };
}

function buildRows(options: ValidationOptions) {
  const rows = options.levels.flatMap((level) => {
    const levelRows = classDefinitions.map((classDefinition) =>
      simulateClass({
        classDefinition,
        level,
        options,
      }),
    );
    const bestXp = Math.max(
      1,
      ...levelRows.map((row) => row.effectiveXpPerHour),
    );

    return levelRows.map((row) => ({
      ...row,
      xpVsBestPercent: roundNumber((row.effectiveXpPerHour / bestXp) * 100, 1),
    }));
  });

  return rows;
}

function buildSummary(rows: ValidationRow[]) {
  return Array.from(new Set(rows.map((row) => row.level))).map((level) => {
    const levelRows = rows
      .filter((row) => row.level === level)
      .sort(
        (left, right) => right.effectiveXpPerHour - left.effectiveXpPerHour,
      );
    const best = levelRows[0];
    const worst = levelRows[levelRows.length - 1];
    const ratio =
      best && worst
        ? best.effectiveXpPerHour / Math.max(1, worst.effectiveXpPerHour)
        : 0;
    const worstPercent =
      best && worst
        ? (worst.effectiveXpPerHour / Math.max(1, best.effectiveXpPerHour)) *
          100
        : 0;

    return {
      level,
      tier: getTierForLevel(level),
      best: best?.className ?? '',
      best_xp_h: best?.effectiveXpPerHour ?? 0,
      worst: worst?.className ?? '',
      worst_xp_h: worst?.effectiveXpPerHour ?? 0,
      ratio: roundNumber(ratio),
      worst_pct: roundNumber(worstPercent, 1),
    };
  });
}

function getTopOutliers(
  summary: ReturnType<typeof buildSummary>,
  maxRows: number,
) {
  if (maxRows <= 0) {
    return [];
  }

  return [...summary]
    .sort(
      (left, right) =>
        left.worst_pct - right.worst_pct || right.ratio - left.ratio,
    )
    .slice(0, maxRows);
}

function printRows(rows: ValidationRow[], options: ValidationOptions) {
  for (const level of options.levels) {
    const levelRows = rows
      .filter((row) => row.level === level)
      .sort(
        (left, right) => right.effectiveXpPerHour - left.effectiveXpPerHour,
      );

    console.log(`\nLevel ${level} | Tier ${getTierForLevel(level)}`);
    console.table(
      levelRows.map((row) => ({
        class: row.className,
        eff_xp_h: row.effectiveXpPerHour,
        raw_xp_h: row.rawXpPerHour,
        xp_vs_best_pct: row.xpVsBestPercent,
        find_s: row.secondsPerFind,
        ttk: row.ttkSeconds,
        mob_s: row.secondsPerMob,
        kills: row.plannedKills,
        hp: row.hp,
        atk: row.attack,
        def: row.defense,
        power: row.power,
        dmg_kill: row.expectedDamagePerKill,
        potions: row.expectedPotionsUsed,
        risk: row.riskLevel,
      })),
    );
  }
}

function printSummary(rows: ValidationRow[], options: ValidationOptions) {
  const summary = buildSummary(rows);
  const worstRatio = Math.max(...summary.map((row) => row.ratio));
  const minWorstPercent = Math.min(...summary.map((row) => row.worst_pct));
  const topOutliersLimit =
    options.topOutliers ?? (options.summaryOnly ? DEFAULT_TOP_OUTLIERS : 0);
  const failed =
    worstRatio > options.maxRatio || minWorstPercent < options.minWorstPercent;

  console.log('\nControlled validation summary');
  if (!options.summaryOnly) {
    console.table(summary);
  }
  console.log('');
  console.log(
    `Guard target: max ratio <= ${options.maxRatio}, worst class >= ${options.minWorstPercent}%.`,
  );
  console.log(
    `Long-term balance target: max ratio <= ${LONG_TERM_TARGET_MAX_RATIO}, worst class >= ${LONG_TERM_TARGET_MIN_WORST_PERCENT}%.`,
  );
  console.log(
    `Observed: max ratio ${roundNumber(worstRatio)}, min worst class ${roundNumber(
      minWorstPercent,
      1,
    )}%.`,
  );
  console.log(`Status: ${failed ? 'needs tuning' : 'within guard target'}`);

  if (topOutliersLimit > 0) {
    console.log(`\nTop ${topOutliersLimit} outlier levels`);
    console.table(getTopOutliers(summary, topOutliersLimit));
  }

  if (options.strict && failed) {
    process.exitCode = 1;
  }
}

function main() {
  const options = parseArgs();
  const rows = buildRows(options);
  const gatheringLabel =
    options.gatheringMode === 'none'
      ? 'sem gathering'
      : options.gatheringMode === 'full'
        ? 'gathering full'
        : 'gathering recomendado';

  console.log('Auto-combat controlled validation');
  console.log(`Balance model: ${AUTO_COMBAT_BALANCE_MODEL_LABEL}`);
  console.log(`Duration: ${options.durationSeconds}s`);
  console.log(`Scenario: seed equipment + ${gatheringLabel}`);
  console.log(`Potion supply: ${options.potionQuantity}`);
  console.log(`Hunting level: ${options.huntingLevel}`);
  console.log(
    'Note: dry-run only. This script does not create users, characters, sessions, inventory, or database rows.',
  );

  if (!options.summaryOnly) {
    const equipmentTotals = rows.filter(
      (row) => row.level === options.levels[0],
    );
    console.log('\nEquipment sanity check');
    console.table(
      equipmentTotals.map((row) => ({
        class: row.className,
        tier: row.tier,
        equipment_points: row.equipmentPoints,
      })),
    );

    printRows(rows, options);
  }

  printSummary(rows, options);
}

main();
