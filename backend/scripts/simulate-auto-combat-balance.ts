import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import { equipmentDefinitions } from '../prisma/seed-data/items.seed-data';
import { buildMobCombatStats } from '../prisma/seed-data/mob-stats.seed-data';
import {
  AUTO_COMBAT_BALANCE_DEFENSIVE_GATHERING_MULTIPLIER,
  AUTO_COMBAT_BALANCE_MODEL_LABEL,
  AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_MULTIPLIER,
  AUTO_COMBAT_BALANCE_RISK_XP_MULTIPLIER,
  AUTO_COMBAT_BALANCE_TTK_POWER_EXPONENT,
  AUTO_COMBAT_CLASS_PASSIVES,
} from '../src/common/config/combat-balance.config';
import { AUTO_COMBAT_HUNTING_LEVEL_CAP } from '../src/common/config/auto-combat.config';
import {
  GATHERING_LEVEL_CAP,
  getGatheringStatBonus,
} from '../src/common/config/gathering.config';
import { getAutoCombatHuntingSecondsPerEnemy } from '../src/common/utils/auto-combat-hunting.util';
import {
  calculatePlayerOffensivePower,
  clampAutoCombatTtkSeconds,
  getAutoCombatBaseKillTimeSeconds,
  getAutoCombatMobIndex,
  getAutoCombatRecommendedPower,
} from '../src/common/utils/auto-combat-ttk.util';
import {
  projectAutoCombatSurvival,
  type AutoCombatSurvivalRiskLevel,
} from '../src/common/utils/auto-combat-survival.util';
import {
  calculateFullStats,
  createEmptyPrimaryStats,
  type PrimaryStats,
} from '../src/common/utils/stats.util';

type GatheringScenarioKey =
  | 'no-gathering'
  | 'recommended-gathering'
  | 'full-gathering';

type GatheringScenarioDefinition = {
  key: GatheringScenarioKey;
  label: string;
  description: string;
  buildGatheringBonus: (className: string, level: number) => PrimaryStats;
};

type ClassPassiveDefinition = {
  label: string;
  offensivePowerMultiplier: number;
  incomingDamageMultiplier: number;
  potionHealMultiplier: number;
  effectiveXpMultiplier: number;
};

type ItemStatsBonus = {
  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;
};

type EquipmentPresetDefinition = {
  key: string;
  label: string;
  description: string;
  pointsPerTier: number;
  useSeedItems?: boolean;
};

type BalanceModelDefinition = {
  key: string;
  label: string;
  description: string;
  ttkPowerExponent: number;
  offensiveGatheringMultiplier: number;
  defensiveGatheringMultiplier: number;
  riskEffectiveXpMultiplier: Record<AutoCombatSurvivalRiskLevel, number>;
  passiveByClass: Record<string, ClassPassiveDefinition>;
};

type SimulationRow = {
  model: string;
  scenario: string;
  equipment: string;
  level: number;
  tier: number;
  className: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  offensivePower: number;
  secondsPerFind: number;
  ttkSeconds: number;
  secondsPerMob: number;
  killsPerHour: number;
  rawXpPerHour: number;
  effectiveXpPerHour: number;
  effectiveXpMultiplier: number;
  expectedDamagePerKill: number;
  safeKillsNoPotion: number;
  potionsProjected: number;
  riskLevel: AutoCombatSurvivalRiskLevel;
};

type LevelImbalance = {
  model: string;
  scenario: string;
  equipment: string;
  level: number;
  tier: number;
  bestClass: string;
  bestXpPerHour: number;
  worstClass: string;
  worstXpPerHour: number;
  bestWorstRatio: number;
  worstVsBestPercent: number;
};

const DEFAULT_HUNTING_LEVEL = AUTO_COMBAT_HUNTING_LEVEL_CAP;

const LEVELS = Array.from({ length: 100 }, (_, index) => index + 1);
const CHECKPOINT_LEVELS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const MAIN_SCENARIO_LABEL = 'Gathering recomendado';
const FOCUSED_BALANCE_MODEL_LABEL = AUTO_COMBAT_BALANCE_MODEL_LABEL;
const TARGET_MAX_RATIO = 1.25;
const TARGET_MIN_WORST_PERCENT = 80;

const GATHERING_STAT_BY_ORIGIN = {
  DESMANCHE: 'strength',
  COLETA: 'vitality',
  PATRULHA: 'agility',
  ARSENAL: 'precision',
  TECNOVARREDURA: 'technique',
  CONTENCAO: 'willpower',
} as const satisfies Record<string, keyof PrimaryStats>;

const OFFENSIVE_GATHERING_STATS = new Set<keyof PrimaryStats>([
  'strength',
  'agility',
  'precision',
  'technique',
]);
const EQUIPMENT_SLOT_ORDER = [
  'MAIN_HAND',
  'OFF_HAND',
  'HEAD',
  'ARMOR',
  'PANTS',
  'BOOTS',
] as const;

const RECOMMENDED_GATHERING_ORIGINS_BY_CLASS: Record<string, string[]> = {
  lutador: ['DESMANCHE', 'COLETA', 'CONTENCAO'],
  assassino: ['PATRULHA', 'ARSENAL', 'DESMANCHE'],
  atirador: ['ARSENAL', 'TECNOVARREDURA', 'PATRULHA'],
  medico: ['TECNOVARREDURA', 'CONTENCAO', 'COLETA'],
};

const EQUIPMENT_PRESETS: EquipmentPresetDefinition[] = [
  {
    key: 'none',
    label: 'Sem equipamento',
    description: 'Sem itens equipados.',
    pointsPerTier: 0,
  },
  {
    key: 'low',
    label: 'Equipamento baixo',
    description:
      'Set de classe conservador. Total aproximado: 6 pontos por tier.',
    pointsPerTier: 6,
  },
  {
    key: 'medium',
    label: 'Equipamento medio',
    description:
      'Set de classe esperado para progressao. Total aproximado: 18 pontos por tier.',
    pointsPerTier: 18,
  },
  {
    key: 'high',
    label: 'Equipamento alto',
    description:
      'Set de classe forte, mas ainda abaixo do impacto total de level + gathering. Total aproximado: 30 pontos por tier.',
    pointsPerTier: 30,
  },
  {
    key: 'seed',
    label: 'Itens reais do seed',
    description:
      'Seleciona um item por slot, classe e tier a partir de backend/prisma/seed-data/items.seed-data.ts.',
    pointsPerTier: 0,
    useSeedItems: true,
  },
];

const EQUIPMENT_STAT_WEIGHTS_BY_CLASS: Record<
  string,
  Partial<Record<keyof PrimaryStats, number>>
> = {
  lutador: {
    strength: 0.32,
    vitality: 0.34,
    willpower: 0.14,
    technique: 0.1,
    agility: 0.06,
    precision: 0.04,
  },
  assassino: {
    agility: 0.34,
    precision: 0.32,
    technique: 0.14,
    strength: 0.08,
    vitality: 0.08,
    willpower: 0.04,
  },
  atirador: {
    precision: 0.36,
    agility: 0.24,
    technique: 0.18,
    strength: 0.08,
    vitality: 0.08,
    willpower: 0.06,
  },
  medico: {
    technique: 0.32,
    willpower: 0.28,
    vitality: 0.18,
    precision: 0.14,
    agility: 0.04,
    strength: 0.04,
  },
};

const NO_PASSIVE: ClassPassiveDefinition = {
  label: 'Sem passiva',
  offensivePowerMultiplier: 1,
  incomingDamageMultiplier: 1,
  potionHealMultiplier: 1,
  effectiveXpMultiplier: 1,
};

const balanceModels: BalanceModelDefinition[] = [
  {
    key: 'baseline',
    label: 'Atual',
    description:
      'Formula atual: TTK expoente 0.75, gathering integral, sem passivas e sem penalidade de risco na XP/h.',
    ttkPowerExponent: 0.75,
    offensiveGatheringMultiplier: 1,
    defensiveGatheringMultiplier: 1,
    riskEffectiveXpMultiplier: {
      LOW: 1,
      MEDIUM: 1,
      HIGH: 1,
      LETHAL: 1,
    },
    passiveByClass: {},
  },
  {
    key: 'balance-v1',
    label: 'Balance V1',
    description:
      'Comprime dano: TTK expoente 0.62, gathering ofensivo 65%, stats defensivos integrais e risco reduz eficiencia.',
    ttkPowerExponent: 0.62,
    offensiveGatheringMultiplier: 0.65,
    defensiveGatheringMultiplier: 1,
    riskEffectiveXpMultiplier: {
      LOW: 1,
      MEDIUM: 0.98,
      HIGH: 0.86,
      LETHAL: 0.62,
    },
    passiveByClass: {},
  },
  {
    key: 'balance-v2',
    label: 'Balance V2',
    description:
      'V1 com passivas leves de funcao: tanques/suporte ganham estabilidade; DPS mantem identidade com mais risco.',
    ttkPowerExponent: 0.55,
    offensiveGatheringMultiplier: 0.55,
    defensiveGatheringMultiplier: 1.05,
    riskEffectiveXpMultiplier: {
      LOW: 1.02,
      MEDIUM: 1,
      HIGH: 0.82,
      LETHAL: 0.55,
    },
    passiveByClass: {
      lutador: {
        label: 'Linha de frente',
        offensivePowerMultiplier: 1.05,
        incomingDamageMultiplier: 0.82,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 1.12,
      },
      assassino: {
        label: 'Execucao arriscada',
        offensivePowerMultiplier: 1.04,
        incomingDamageMultiplier: 1.08,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.99,
      },
      atirador: {
        label: 'Tiro consistente',
        offensivePowerMultiplier: 1.02,
        incomingDamageMultiplier: 1.05,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.99,
      },
      medico: {
        label: 'Triagem de campo',
        offensivePowerMultiplier: 1.02,
        incomingDamageMultiplier: 0.88,
        potionHealMultiplier: 1.25,
        effectiveXpMultiplier: 1.1,
      },
    },
  },
  {
    key: 'balance-v3',
    label: 'Balance V3',
    description:
      'Candidato agressivo: TTK expoente 0.48, gathering ofensivo 45%, defensivo 115%, passivas fortes e risco pesa mais.',
    ttkPowerExponent: 0.48,
    offensiveGatheringMultiplier: 0.45,
    defensiveGatheringMultiplier: 1.15,
    riskEffectiveXpMultiplier: {
      LOW: 1.04,
      MEDIUM: 1,
      HIGH: 0.76,
      LETHAL: 0.45,
    },
    passiveByClass: {
      lutador: {
        label: 'Muralha',
        offensivePowerMultiplier: 1.08,
        incomingDamageMultiplier: 0.72,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 1.2,
      },
      assassino: {
        label: 'Finalizacao instavel',
        offensivePowerMultiplier: 1.03,
        incomingDamageMultiplier: 1.12,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.97,
      },
      atirador: {
        label: 'Supressao controlada',
        offensivePowerMultiplier: 1.02,
        incomingDamageMultiplier: 1.08,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.97,
      },
      medico: {
        label: 'Suporte sustentado',
        offensivePowerMultiplier: 1.05,
        incomingDamageMultiplier: 0.8,
        potionHealMultiplier: 1.45,
        effectiveXpMultiplier: 1.18,
      },
    },
  },
  {
    key: 'balance-v4',
    label: 'Balance V4',
    description:
      'V3 recalibrado: TTK expoente 0.45, gathering ofensivo 40%, defensivo 112%, passivas moderadas e risco mais suave.',
    ttkPowerExponent: 0.45,
    offensiveGatheringMultiplier: 0.4,
    defensiveGatheringMultiplier: 1.12,
    riskEffectiveXpMultiplier: {
      LOW: 1.05,
      MEDIUM: 1,
      HIGH: 0.78,
      LETHAL: 0.52,
    },
    passiveByClass: {
      lutador: {
        label: 'Muralha',
        offensivePowerMultiplier: 1.12,
        incomingDamageMultiplier: 0.7,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 1.18,
      },
      assassino: {
        label: 'Evasao letal',
        offensivePowerMultiplier: 1.06,
        incomingDamageMultiplier: 0.96,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.98,
      },
      atirador: {
        label: 'Dano seguro',
        offensivePowerMultiplier: 1,
        incomingDamageMultiplier: 1.1,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.96,
      },
      medico: {
        label: 'Suporte sustentado',
        offensivePowerMultiplier: 1.1,
        incomingDamageMultiplier: 0.78,
        potionHealMultiplier: 1.45,
        effectiveXpMultiplier: 1.16,
      },
    },
  },
  {
    key: 'balance-v4-1',
    label: 'Balance V4.1',
    description:
      'V4 refinado: TTK expoente 0.40, gathering ofensivo 38%, defensivo 114%, reduz pico do Assassino e estabiliza Atirador.',
    ttkPowerExponent: 0.4,
    offensiveGatheringMultiplier: 0.38,
    defensiveGatheringMultiplier: 1.14,
    riskEffectiveXpMultiplier: {
      LOW: 1.04,
      MEDIUM: 1,
      HIGH: 0.8,
      LETHAL: 0.55,
    },
    passiveByClass: {
      lutador: {
        label: 'Muralha ativa',
        offensivePowerMultiplier: 1.16,
        incomingDamageMultiplier: 0.68,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 1.19,
      },
      assassino: {
        label: 'Execucao contida',
        offensivePowerMultiplier: 1,
        incomingDamageMultiplier: 0.98,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.95,
      },
      atirador: {
        label: 'Dano controlado',
        offensivePowerMultiplier: 0.99,
        incomingDamageMultiplier: 1.02,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.97,
      },
      medico: {
        label: 'Suporte sustentado',
        offensivePowerMultiplier: 1.15,
        incomingDamageMultiplier: 0.76,
        potionHealMultiplier: 1.48,
        effectiveXpMultiplier: 1.16,
      },
    },
  },
  {
    key: 'balance-v4-2',
    label: AUTO_COMBAT_BALANCE_MODEL_LABEL,
    description:
      'V4.2 aplicado: TTK expoente 0.38, gathering defensivo 115%, reforca Lutador/Medico e contem picos de Atirador/Assassino.',
    ttkPowerExponent: AUTO_COMBAT_BALANCE_TTK_POWER_EXPONENT,
    offensiveGatheringMultiplier:
      AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_MULTIPLIER,
    defensiveGatheringMultiplier:
      AUTO_COMBAT_BALANCE_DEFENSIVE_GATHERING_MULTIPLIER,
    riskEffectiveXpMultiplier: AUTO_COMBAT_BALANCE_RISK_XP_MULTIPLIER,
    passiveByClass: AUTO_COMBAT_CLASS_PASSIVES,
  },
  {
    key: 'balance-v5',
    label: 'Balance V5',
    description:
      'Candidato alvo: TTK expoente 0.38, gathering ofensivo 38%, defensivo 115%, risco suavizado e passivas mais equivalentes.',
    ttkPowerExponent: 0.38,
    offensiveGatheringMultiplier: 0.38,
    defensiveGatheringMultiplier: 1.15,
    riskEffectiveXpMultiplier: {
      LOW: 1.04,
      MEDIUM: 1,
      HIGH: 0.82,
      LETHAL: 0.58,
    },
    passiveByClass: {
      lutador: {
        label: 'Muralha ativa',
        offensivePowerMultiplier: 1.22,
        incomingDamageMultiplier: 0.68,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 1.2,
      },
      assassino: {
        label: 'Execucao precisa',
        offensivePowerMultiplier: 0.98,
        incomingDamageMultiplier: 0.94,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.94,
      },
      atirador: {
        label: 'Supressao',
        offensivePowerMultiplier: 0.96,
        incomingDamageMultiplier: 1.05,
        potionHealMultiplier: 1,
        effectiveXpMultiplier: 0.95,
      },
      medico: {
        label: 'Triagem sustentada',
        offensivePowerMultiplier: 1.22,
        incomingDamageMultiplier: 0.75,
        potionHealMultiplier: 1.5,
        effectiveXpMultiplier: 1.2,
      },
    },
  },
];

const gatheringScenarios: GatheringScenarioDefinition[] = [
  {
    key: 'no-gathering',
    label: 'Sem gathering',
    description: 'Somente classe e level. Sem equipamento e sem gathering.',
    buildGatheringBonus: () => createEmptyPrimaryStats(),
  },
  {
    key: 'recommended-gathering',
    label: MAIN_SCENARIO_LABEL,
    description:
      'Tres origens recomendadas por classe, no mesmo nivel do personagem.',
    buildGatheringBonus: (className, level) =>
      buildRecommendedGatheringBonus(className, level),
  },
  {
    key: 'full-gathering',
    label: 'Gathering full',
    description: 'Todas as seis origens no nivel 50.',
    buildGatheringBonus: () => buildFullGatheringBonus(),
  },
];

function normalizeClassName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function displayClassName(value: string) {
  const normalized = normalizeClassName(value);

  if (normalized === 'medico') return 'Medico';

  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function roundNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function getTierForLevel(level: number) {
  return Math.max(1, Math.ceil(level / 10));
}

function getPrimaryStatsTotal(stats: PrimaryStats) {
  return Object.values(stats).reduce((sum, value) => sum + value, 0);
}

function getEquipmentItemStatsTotal(item: ItemStatsBonus) {
  return (
    (item.strengthBonus ?? 0) +
    (item.vitalityBonus ?? 0) +
    (item.agilityBonus ?? 0) +
    (item.precisionBonus ?? 0) +
    (item.techniqueBonus ?? 0) +
    (item.willpowerBonus ?? 0)
  );
}

function getEquipmentItemsPrimaryStats(items: ItemStatsBonus[]): PrimaryStats {
  return items.reduce((total, item) => {
    total.strength += item.strengthBonus ?? 0;
    total.vitality += item.vitalityBonus ?? 0;
    total.agility += item.agilityBonus ?? 0;
    total.precision += item.precisionBonus ?? 0;
    total.technique += item.techniqueBonus ?? 0;
    total.willpower += item.willpowerBonus ?? 0;

    return total;
  }, createEmptyPrimaryStats());
}

function distributePointsByWeights(
  totalPoints: number,
  weights: Partial<Record<keyof PrimaryStats, number>>,
): PrimaryStats {
  const total = createEmptyPrimaryStats();
  const safeTotalPoints = Math.max(0, Math.floor(Number(totalPoints) || 0));
  const weightEntries = Object.entries(weights) as Array<
    [keyof PrimaryStats, number]
  >;
  const weightSum = weightEntries.reduce(
    (sum, [, weight]) => sum + Math.max(0, Number(weight) || 0),
    0,
  );

  if (safeTotalPoints <= 0 || weightSum <= 0) {
    return total;
  }

  const remainders: Array<{ stat: keyof PrimaryStats; remainder: number }> = [];
  let assigned = 0;

  for (const [stat, weight] of weightEntries) {
    const exactValue = (safeTotalPoints * Math.max(0, weight)) / weightSum;
    const flooredValue = Math.floor(exactValue);

    total[stat] = flooredValue;
    assigned += flooredValue;
    remainders.push({
      stat,
      remainder: exactValue - flooredValue,
    });
  }

  for (const { stat } of remainders.sort(
    (a, b) => b.remainder - a.remainder,
  )) {
    if (assigned >= safeTotalPoints) {
      break;
    }

    total[stat]++;
    assigned++;
  }

  return total;
}

function buildEquipmentPrimaryStats(params: {
  className: string;
  tier: number;
  equipmentPreset: EquipmentPresetDefinition;
}) {
  const classKey = normalizeClassName(params.className);
  const weights = EQUIPMENT_STAT_WEIGHTS_BY_CLASS[classKey];

  if (!weights || params.equipmentPreset.pointsPerTier <= 0) {
    return createEmptyPrimaryStats();
  }

  return distributePointsByWeights(
    params.tier * params.equipmentPreset.pointsPerTier,
    weights,
  );
}

function primaryStatsToEquipmentItem(stats: PrimaryStats): ItemStatsBonus {
  return {
    strengthBonus: stats.strength,
    vitalityBonus: stats.vitality,
    agilityBonus: stats.agility,
    precisionBonus: stats.precision,
    techniqueBonus: stats.technique,
    willpowerBonus: stats.willpower,
  };
}

function buildEquipmentItems(params: {
  className: string;
  tier: number;
  equipmentPreset: EquipmentPresetDefinition;
}) {
  if (params.equipmentPreset.useSeedItems) {
    const classKey = normalizeClassName(params.className);
    const safeTier = Math.max(1, Math.floor(Number(params.tier) || 1));
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
            getEquipmentItemStatsTotal(right) -
            getEquipmentItemStatsTotal(left),
        )[0];

      return selected ? [selected] : [];
    });
  }

  const stats = buildEquipmentPrimaryStats(params);

  if (getPrimaryStatsTotal(stats) <= 0) {
    return [];
  }

  return [primaryStatsToEquipmentItem(stats)];
}

function addGatheringOriginBonus(
  total: PrimaryStats,
  origin: keyof typeof GATHERING_STAT_BY_ORIGIN,
  gatheringLevel: number,
) {
  const stat = GATHERING_STAT_BY_ORIGIN[origin];
  const safeGatheringLevel = Math.min(
    GATHERING_LEVEL_CAP,
    Math.max(1, Math.floor(Number(gatheringLevel) || 1)),
  );

  total[stat] += getGatheringStatBonus(safeGatheringLevel);
}

function buildRecommendedGatheringBonus(className: string, level: number) {
  const total = createEmptyPrimaryStats();
  const classKey = normalizeClassName(className);
  const origins = RECOMMENDED_GATHERING_ORIGINS_BY_CLASS[classKey] ?? [];

  for (const origin of origins) {
    addGatheringOriginBonus(
      total,
      origin as keyof typeof GATHERING_STAT_BY_ORIGIN,
      level,
    );
  }

  return total;
}

function buildFullGatheringBonus() {
  const total = createEmptyPrimaryStats();

  for (const origin of Object.keys(GATHERING_STAT_BY_ORIGIN)) {
    addGatheringOriginBonus(
      total,
      origin as keyof typeof GATHERING_STAT_BY_ORIGIN,
      GATHERING_LEVEL_CAP,
    );
  }

  return total;
}

function scaleGatheringBonus(
  gatheringBonus: PrimaryStats,
  balanceModel: BalanceModelDefinition,
): PrimaryStats {
  const scaled = createEmptyPrimaryStats();

  for (const key of Object.keys(gatheringBonus) as Array<keyof PrimaryStats>) {
    const multiplier = OFFENSIVE_GATHERING_STATS.has(key)
      ? balanceModel.offensiveGatheringMultiplier
      : balanceModel.defensiveGatheringMultiplier;

    scaled[key] = Math.max(0, Math.floor(gatheringBonus[key] * multiplier));
  }

  return scaled;
}

function getPassiveForClass(
  balanceModel: BalanceModelDefinition,
  className: string,
) {
  return balanceModel.passiveByClass[normalizeClassName(className)] ?? NO_PASSIVE;
}

function calculateExperimentalTtk(params: {
  mob: ReturnType<typeof buildMobCombatStats>;
  offensivePower: number;
  ttkPowerExponent: number;
}) {
  const mobIndex = getAutoCombatMobIndex(params.mob);
  const baseKillTimeSeconds = getAutoCombatBaseKillTimeSeconds(mobIndex);
  const recommendedPower = getAutoCombatRecommendedPower({
    tier: params.mob.tier,
    mobIndex,
  });
  const rawSeconds =
    baseKillTimeSeconds *
    Math.pow(
      recommendedPower / Math.max(1, params.offensivePower),
      params.ttkPowerExponent,
    );
  const estimatedKillTimeSeconds = clampAutoCombatTtkSeconds(rawSeconds);

  return {
    mobIndex,
    baseKillTimeSeconds,
    estimatedKillTimeSeconds,
    playerOffensivePower: params.offensivePower,
    monsterRecommendedPower: recommendedPower,
    killsPerHour: 3600 / estimatedKillTimeSeconds,
  };
}

function simulateClassAtLevel(params: {
  classDefinition: (typeof classDefinitions)[number];
  level: number;
  gatheringScenario: GatheringScenarioDefinition;
  equipmentPreset: EquipmentPresetDefinition;
  balanceModel: BalanceModelDefinition;
}): SimulationRow {
  const {
    classDefinition,
    level,
    gatheringScenario,
    equipmentPreset,
    balanceModel,
  } = params;
  const tier = getTierForLevel(level);
  const mob = buildMobCombatStats({
    tier,
    level,
    mobName: `Simulacao balanceada T${tier} L${level}`,
    mobType: 'MONSTER',
  });
  const passive = getPassiveForClass(balanceModel, classDefinition.name);
  const rawGatheringBonus = gatheringScenario.buildGatheringBonus(
    classDefinition.name,
    level,
  );
  const gatheringBonus = scaleGatheringBonus(rawGatheringBonus, balanceModel);
  const equipmentItems = buildEquipmentItems({
    className: classDefinition.name,
    tier,
    equipmentPreset,
  });
  const fullStats = calculateFullStats(
    classDefinition,
    equipmentItems,
    level,
    gatheringBonus,
  );
  const derived = fullStats.derivedCombatStats;
  const primary = fullStats.totalPrimaryStats;
  const playerStats = {
    attack: derived.attack,
    speed: derived.speed,
    precision: primary.precision,
    technique: primary.technique,
    agility: primary.agility,
  };
  const offensivePower =
    calculatePlayerOffensivePower(playerStats) *
    passive.offensivePowerMultiplier;
  const ttk = calculateExperimentalTtk({
    mob,
    offensivePower,
    ttkPowerExponent: balanceModel.ttkPowerExponent,
  });
  const secondsPerFind = getAutoCombatHuntingSecondsPerEnemy(
    DEFAULT_HUNTING_LEVEL,
  );
  const secondsPerMob = secondsPerFind + ttk.estimatedKillTimeSeconds;
  const killsPerHour = 3600 / secondsPerMob;
  const projectedKills = Math.max(1, Math.floor(killsPerHour));
  const noPotionProjection = projectAutoCombatSurvival({
    currentHp: derived.maxHp,
    maxHp: derived.maxHp,
    playerDefense: derived.defense,
    playerAgility: primary.agility,
    mobAttack: mob.attack * passive.incomingDamageMultiplier,
    mobPrecision: mob.speed,
    mobTechnique: mob.level,
    projectedKills,
  });
  const standardPotionProjection = projectAutoCombatSurvival({
    currentHp: derived.maxHp,
    maxHp: derived.maxHp,
    playerDefense: derived.defense,
    playerAgility: primary.agility,
    mobAttack: mob.attack * passive.incomingDamageMultiplier,
    mobPrecision: mob.speed,
    mobTechnique: mob.level,
    projectedKills,
    potion: {
      availableQuantity: 9999,
      healAmount: Math.floor(derived.maxHp * 0.3 * passive.potionHealMultiplier),
      hpThresholdPercent: 35,
    },
  });
  const rawXpPerHour = Math.round(killsPerHour * mob.xpReward);
  const riskMultiplier =
    balanceModel.riskEffectiveXpMultiplier[
      standardPotionProjection.riskLevel
    ];
  const effectiveXpPerHour = Math.round(
    rawXpPerHour * riskMultiplier * passive.effectiveXpMultiplier,
  );

  return {
    model: balanceModel.label,
    scenario: gatheringScenario.label,
    equipment: equipmentPreset.label,
    level,
    tier,
    className: displayClassName(classDefinition.name),
    hp: derived.maxHp,
    attack: derived.attack,
    defense: derived.defense,
    speed: derived.speed,
    offensivePower: roundNumber(offensivePower, 1),
    secondsPerFind,
    ttkSeconds: ttk.estimatedKillTimeSeconds,
    secondsPerMob,
    killsPerHour: roundNumber(killsPerHour, 1),
    rawXpPerHour,
    effectiveXpPerHour,
    effectiveXpMultiplier: roundNumber(
      effectiveXpPerHour / Math.max(1, rawXpPerHour),
      2,
    ),
    expectedDamagePerKill: noPotionProjection.expectedDamagePerKill,
    safeKillsNoPotion: noPotionProjection.safeKillsWithoutPotions,
    potionsProjected: standardPotionProjection.expectedPotionsUsed,
    riskLevel: standardPotionProjection.riskLevel,
  };
}

function simulate() {
  const rows: SimulationRow[] = [];

  for (const balanceModel of balanceModels) {
    for (const gatheringScenario of gatheringScenarios) {
      for (const equipmentPreset of EQUIPMENT_PRESETS) {
        for (const level of LEVELS) {
          for (const classDefinition of classDefinitions) {
            rows.push(
              simulateClassAtLevel({
                classDefinition,
                level,
                gatheringScenario,
                equipmentPreset,
                balanceModel,
              }),
            );
          }
        }
      }
    }
  }

  return rows;
}

function printScenarioDescriptions() {
  console.log('Auto-combat balance simulation');
  console.log('');
  console.log('Balance target:');
  console.log(`- Max best/worst ratio: ${TARGET_MAX_RATIO}x`);
  console.log(`- Worst class should keep at least ${TARGET_MIN_WORST_PERCENT}% of best class XP/h.`);
  console.log('');
  console.log('Assumptions:');
  console.log('- Equipment presets are class-specific stat sets.');
  console.log('- Target mob is a balanced monster at the same level/tier.');
  console.log(
    '- Standard potion estimate uses the current tier potion at 35% trigger.',
  );
  console.log('- Recommended gathering uses 3 class-related origins.');
  console.log('- Full gathering uses all 6 origins at gathering level 50.');
  console.log('- All levels from 1 to 100 are simulated.');
  console.log(
    `- ${AUTO_COMBAT_BALANCE_MODEL_LABEL} uses the same constants applied by gameplay code.`,
  );
  console.log('');

  console.log('Equipment presets:');

  for (const equipmentPreset of EQUIPMENT_PRESETS) {
    console.log(`${equipmentPreset.label}: ${equipmentPreset.description}`);
  }

  console.log('');

  for (const gatheringScenario of gatheringScenarios) {
    console.log(`${gatheringScenario.label}: ${gatheringScenario.description}`);
  }

  console.log('');
  console.log('Balance models:');

  for (const balanceModel of balanceModels) {
    console.log(`${balanceModel.label}: ${balanceModel.description}`);
  }

  console.log('');
}

function printEquipmentStatBudgets() {
  console.log('=== Equipment stat budgets ===');
  console.table(
    EQUIPMENT_PRESETS.flatMap((equipmentPreset) =>
      [1, 5, 10].flatMap((tier) =>
        classDefinitions.map((classDefinition) => {
          const stats = getEquipmentItemsPrimaryStats(buildEquipmentItems({
            className: classDefinition.name,
            tier,
            equipmentPreset,
          }));

          return {
            equipment: equipmentPreset.label,
            tier,
            class: displayClassName(classDefinition.name),
            total: getPrimaryStatsTotal(stats),
            str: stats.strength,
            vit: stats.vitality,
            agi: stats.agility,
            pre: stats.precision,
            tec: stats.technique,
            wil: stats.willpower,
          };
        }),
      ),
    ),
  );
}

function getLevelRows(params: {
  rows: SimulationRow[];
  modelLabel: string;
  scenarioLabel: string;
  equipmentLabel: string;
  level: number;
}) {
  return params.rows
    .filter(
      (row) =>
        row.model === params.modelLabel &&
        row.scenario === params.scenarioLabel &&
        row.equipment === params.equipmentLabel &&
        row.level === params.level,
    )
    .sort((a, b) => b.effectiveXpPerHour - a.effectiveXpPerHour);
}

function getLevelImbalance(params: {
  rows: SimulationRow[];
  modelLabel: string;
  scenarioLabel: string;
  equipmentLabel: string;
  level: number;
}): LevelImbalance {
  const levelRows = getLevelRows(params);
  const best = levelRows[0];
  const worst = levelRows[levelRows.length - 1];

  return {
    model: params.modelLabel,
    scenario: params.scenarioLabel,
    equipment: params.equipmentLabel,
    level: params.level,
    tier: getTierForLevel(params.level),
    bestClass: best.className,
    bestXpPerHour: best.effectiveXpPerHour,
    worstClass: worst.className,
    worstXpPerHour: worst.effectiveXpPerHour,
    bestWorstRatio: roundNumber(
      best.effectiveXpPerHour / Math.max(1, worst.effectiveXpPerHour),
    ),
    worstVsBestPercent: roundNumber(
      (worst.effectiveXpPerHour / Math.max(1, best.effectiveXpPerHour)) *
        100,
      1,
    ),
  };
}

function getScenarioMetrics(params: {
  rows: SimulationRow[];
  modelLabel: string;
  scenarioLabel: string;
  equipmentLabel: string;
}) {
  const imbalances = LEVELS.map((level) =>
    getLevelImbalance({
      rows: params.rows,
      modelLabel: params.modelLabel,
      scenarioLabel: params.scenarioLabel,
      equipmentLabel: params.equipmentLabel,
      level,
    }),
  );
  const avgRatio =
    imbalances.reduce((sum, row) => sum + row.bestWorstRatio, 0) /
    imbalances.length;
  const maxRatio = Math.max(...imbalances.map((row) => row.bestWorstRatio));
  const avgWorstPercent =
    imbalances.reduce((sum, row) => sum + row.worstVsBestPercent, 0) /
    imbalances.length;
  const minWorstPercent = Math.min(
    ...imbalances.map((row) => row.worstVsBestPercent),
  );

  return {
    model: params.modelLabel,
    scenario: params.scenarioLabel,
    equipment: params.equipmentLabel,
    avgRatio: roundNumber(avgRatio),
    maxRatio: roundNumber(maxRatio),
    avgWorstPercent: roundNumber(avgWorstPercent, 1),
    minWorstPercent: roundNumber(minWorstPercent, 1),
    passesTarget:
      maxRatio <= TARGET_MAX_RATIO &&
      minWorstPercent >= TARGET_MIN_WORST_PERCENT,
  };
}

function printBalanceScoreboard(rows: SimulationRow[]) {
  console.log('=== Balance scoreboard, levels 1-100 ===');
  console.table(
    balanceModels.flatMap((balanceModel) =>
      gatheringScenarios.flatMap((gatheringScenario) =>
        EQUIPMENT_PRESETS.map((equipmentPreset) => {
          const metrics = getScenarioMetrics({
            rows,
            modelLabel: balanceModel.label,
            scenarioLabel: gatheringScenario.label,
            equipmentLabel: equipmentPreset.label,
          });

          return {
            model: metrics.model,
            scenario: metrics.scenario,
            equipment: metrics.equipment,
            avg_ratio: metrics.avgRatio,
            max_ratio: metrics.maxRatio,
            avg_worst_pct: metrics.avgWorstPercent,
            min_worst_pct: metrics.minWorstPercent,
            target: metrics.passesTarget ? 'OK' : 'FAIL',
          };
        }),
      ),
    ),
  );
}

function printMainScenarioClassAverages(rows: SimulationRow[]) {
  console.log(
    `=== Class averages: ${FOCUSED_BALANCE_MODEL_LABEL}, ${MAIN_SCENARIO_LABEL}, levels 1-100 ===`,
  );

  for (const equipmentPreset of EQUIPMENT_PRESETS) {
    const scenarioRows = rows.filter(
      (row) =>
        row.model === FOCUSED_BALANCE_MODEL_LABEL &&
        row.scenario === MAIN_SCENARIO_LABEL &&
        row.equipment === equipmentPreset.label,
    );
    const byClass = new Map<string, SimulationRow[]>();
    const rowsByLevel = new Map<number, SimulationRow[]>();

    for (const row of scenarioRows) {
      const classRows = byClass.get(row.className) ?? [];
      const levelRows = rowsByLevel.get(row.level) ?? [];

      classRows.push(row);
      levelRows.push(row);
      byClass.set(row.className, classRows);
      rowsByLevel.set(row.level, levelRows);
    }

    console.log(`${equipmentPreset.label}`);
    console.table(
      Array.from(byClass.entries())
        .map(([className, classRows]) => {
          const relativePercents = classRows.map((row) => {
            const levelRows = rowsByLevel.get(row.level) ?? [];
            const bestXp = Math.max(
              ...levelRows.map((levelRow) => levelRow.effectiveXpPerHour),
            );

            return (row.effectiveXpPerHour / Math.max(1, bestXp)) * 100;
          });

          return {
            class: className,
            avg_eff_xp_h: Math.round(
              classRows.reduce((sum, row) => sum + row.effectiveXpPerHour, 0) /
                classRows.length,
            ),
            avg_raw_xp_h: Math.round(
              classRows.reduce((sum, row) => sum + row.rawXpPerHour, 0) /
                classRows.length,
            ),
            avg_pct_best: roundNumber(
              relativePercents.reduce((sum, value) => sum + value, 0) /
                relativePercents.length,
              1,
            ),
            min_pct_best: roundNumber(Math.min(...relativePercents), 1),
            avg_ttk: roundNumber(
              classRows.reduce((sum, row) => sum + row.ttkSeconds, 0) /
                classRows.length,
              1,
            ),
            avg_pot_proj: roundNumber(
              classRows.reduce((sum, row) => sum + row.potionsProjected, 0) /
                classRows.length,
              1,
            ),
          };
        })
        .sort((a, b) => b.avg_eff_xp_h - a.avg_eff_xp_h),
    );
  }
}

function printMainScenarioCheckpoints(rows: SimulationRow[]) {
  console.log(
    `=== Checkpoints: ${FOCUSED_BALANCE_MODEL_LABEL}, ${MAIN_SCENARIO_LABEL} ===`,
  );
  console.table(
    EQUIPMENT_PRESETS.flatMap((equipmentPreset) =>
      CHECKPOINT_LEVELS.map((level) => {
        const imbalance = getLevelImbalance({
          rows,
          modelLabel: FOCUSED_BALANCE_MODEL_LABEL,
          scenarioLabel: MAIN_SCENARIO_LABEL,
          equipmentLabel: equipmentPreset.label,
          level,
        });

        return {
          equipment: equipmentPreset.label,
          level: imbalance.level,
          tier: imbalance.tier,
          best: imbalance.bestClass,
          best_eff_xp_h: imbalance.bestXpPerHour,
          worst: imbalance.worstClass,
          worst_eff_xp_h: imbalance.worstXpPerHour,
          ratio: imbalance.bestWorstRatio,
          worst_pct: imbalance.worstVsBestPercent,
        };
      }),
    ),
  );
}

function printMainScenarioTierSummary(rows: SimulationRow[]) {
  console.log(
    `=== Tier summary: ${FOCUSED_BALANCE_MODEL_LABEL}, ${MAIN_SCENARIO_LABEL} ===`,
  );
  console.table(
    EQUIPMENT_PRESETS.flatMap((equipmentPreset) =>
      Array.from({ length: 10 }, (_, index) => index + 1).map((tier) => {
        const tierLevels = LEVELS.filter(
          (level) => getTierForLevel(level) === tier,
        );
        const imbalances = tierLevels.map((level) =>
          getLevelImbalance({
            rows,
            modelLabel: FOCUSED_BALANCE_MODEL_LABEL,
            scenarioLabel: MAIN_SCENARIO_LABEL,
            equipmentLabel: equipmentPreset.label,
            level,
          }),
        );

        return {
          equipment: equipmentPreset.label,
          tier,
          avg_ratio: roundNumber(
            imbalances.reduce((sum, row) => sum + row.bestWorstRatio, 0) /
              imbalances.length,
          ),
          max_ratio: roundNumber(
            Math.max(...imbalances.map((row) => row.bestWorstRatio)),
          ),
          avg_worst_pct: roundNumber(
            imbalances.reduce((sum, row) => sum + row.worstVsBestPercent, 0) /
              imbalances.length,
            1,
          ),
        };
      }),
    ),
  );
}

function printCandidateLevelDetails(rows: SimulationRow[], levels: number[]) {
  for (const level of levels) {
    console.log(
      `=== Level ${level}: ${FOCUSED_BALANCE_MODEL_LABEL}, ${MAIN_SCENARIO_LABEL} ===`,
    );

    for (const equipmentPreset of EQUIPMENT_PRESETS) {
      const levelRows = getLevelRows({
        rows,
        modelLabel: FOCUSED_BALANCE_MODEL_LABEL,
        scenarioLabel: MAIN_SCENARIO_LABEL,
        equipmentLabel: equipmentPreset.label,
        level,
      });
      const maxXp = Math.max(
        ...levelRows.map((row) => row.effectiveXpPerHour),
      );

      console.log(`${equipmentPreset.label}`);
      console.table(
        levelRows.map((row) => ({
          class: row.className,
          eff_xp_h: row.effectiveXpPerHour,
          raw_xp_h: row.rawXpPerHour,
          xp_mult: row.effectiveXpMultiplier,
          xp_vs_best_pct: roundNumber(
            (row.effectiveXpPerHour / Math.max(1, maxXp)) * 100,
            1,
          ),
          find_s: row.secondsPerFind,
          ttk: row.ttkSeconds,
          mob_s: row.secondsPerMob,
          hp: row.hp,
          def: row.defense,
          power: row.offensivePower,
          dmg_kill: row.expectedDamagePerKill,
          safe_no_pot: row.safeKillsNoPotion,
          pot_proj: row.potionsProjected,
          risk: row.riskLevel,
        })),
      );
    }
  }
}

function printMainScenarioWorstLevels(rows: SimulationRow[]) {
  console.log(
    `=== Worst levels: ${FOCUSED_BALANCE_MODEL_LABEL}, ${MAIN_SCENARIO_LABEL} ===`,
  );

  for (const equipmentPreset of EQUIPMENT_PRESETS) {
    const imbalances = LEVELS.map((level) =>
      getLevelImbalance({
        rows,
        modelLabel: FOCUSED_BALANCE_MODEL_LABEL,
        scenarioLabel: MAIN_SCENARIO_LABEL,
        equipmentLabel: equipmentPreset.label,
        level,
      }),
    )
      .sort((a, b) => b.bestWorstRatio - a.bestWorstRatio)
      .slice(0, 5);

    console.log(equipmentPreset.label);
    console.table(
      imbalances.map((row) => ({
        level: row.level,
        tier: row.tier,
        best: row.bestClass,
        best_eff_xp_h: row.bestXpPerHour,
        worst: row.worstClass,
        worst_eff_xp_h: row.worstXpPerHour,
        ratio: row.bestWorstRatio,
        worst_pct: row.worstVsBestPercent,
      })),
    );
  }
}

function printRecommendation(rows: SimulationRow[]) {
  console.log('=== Recommendation helper ===');
  console.table(
    balanceModels.slice(1).flatMap((balanceModel) =>
      EQUIPMENT_PRESETS.map((equipmentPreset) => {
        const mainMetrics = getScenarioMetrics({
          rows,
          modelLabel: balanceModel.label,
          scenarioLabel: MAIN_SCENARIO_LABEL,
          equipmentLabel: equipmentPreset.label,
        });
        const fullMetrics = getScenarioMetrics({
          rows,
          modelLabel: balanceModel.label,
          scenarioLabel: 'Gathering full',
          equipmentLabel: equipmentPreset.label,
        });
        const noGatheringMetrics = getScenarioMetrics({
          rows,
          modelLabel: balanceModel.label,
          scenarioLabel: 'Sem gathering',
          equipmentLabel: equipmentPreset.label,
        });
        const score =
          mainMetrics.maxRatio * 3 +
          fullMetrics.maxRatio * 2 +
          noGatheringMetrics.maxRatio;

        return {
          model: balanceModel.label,
          equipment: equipmentPreset.label,
          score: roundNumber(score),
          recommended_max_ratio: mainMetrics.maxRatio,
          recommended_min_pct: mainMetrics.minWorstPercent,
          full_max_ratio: fullMetrics.maxRatio,
          no_gathering_max_ratio: noGatheringMetrics.maxRatio,
          status:
            mainMetrics.maxRatio <= TARGET_MAX_RATIO &&
            mainMetrics.minWorstPercent >= TARGET_MIN_WORST_PERCENT
              ? 'candidate'
              : 'needs tuning',
        };
      }),
    ),
  );
}

const rows = simulate();

printScenarioDescriptions();
printEquipmentStatBudgets();
printBalanceScoreboard(rows);
printMainScenarioClassAverages(rows);
printMainScenarioCheckpoints(rows);
printMainScenarioTierSummary(rows);
printMainScenarioWorstLevels(rows);
printCandidateLevelDetails(rows, [50, 100]);
printRecommendation(rows);
