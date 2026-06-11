import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import { equipmentDefinitions } from '../prisma/seed-data/items.seed-data';
import { mapDefinitions } from '../prisma/seed-data/maps.seed-data';
import { buildMobCombatStats } from '../prisma/seed-data/mob-stats.seed-data';
import { calculateAutoCombatPotionHeal } from './auto-combat-potion-balancing';
import {
  getActiveAutoCombatEncounterWeight,
  getActiveAutoCombatMobRank,
  isActiveAutoCombatMob,
  mobBaseDefinitions,
  type MobBaseSeedData,
} from '../prisma/seed-data/mobs.seed-data';
import { AUTO_COMBAT_BALANCE_MODEL_LABEL } from '../src/common/config/combat-balance.config';
import { AUTO_COMBAT_HUNTING_LEVEL_CAP } from '../src/common/config/auto-combat.config';
import {
  GATHERING_LEVEL_CAP,
  getGatheringStatBonus,
} from '../src/common/config/gathering.config';
import {
  applyAutoCombatIncomingDamageMultiplier,
  scaleAutoCombatGatheringBonus,
} from '../src/common/utils/auto-combat-balance.util';
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

type SurvivalReportOptions = {
  kills: number;
  huntingLevel: number;
  outputDir: string;
  potionQuantities: number[];
};

type WeightedEncounterPlan = {
  mob: ReturnType<typeof buildMobCombatStats>;
  baseMob: MobBaseSeedData;
  mapName: string;
  subMapName: string;
  rank: number;
  baseWeight: number;
  averageWeight: number;
  probability: number;
  expectedKills: number;
};

type SurvivalPotionResult = {
  potionQuantity: number;
  safeBattles: number;
  potionsUsed: number;
  finalHp: number;
  finalHpPercent: number;
  riskLevel: AutoCombatSurvivalRiskLevel;
};

type SurvivalTierRow = {
  tier: number;
  level: number;
  mapName: string;
  className: string;
  hp: number;
  defense: number;
  agility: number;
  potionHealAmount: number;
  encounterCount: number;
  totalEncounterWeight: number;
  weightedMobLevel: number;
  averageDamagePerBattle: number;
  damagePer1000Battles: number;
  noPotionBattles: number;
  potions10Battles: number;
  potions25Battles: number;
  potions50Battles: number;
  potions100Battles: number;
  noPotionVsBestPercent: number;
  potions100VsBestPercent: number;
  strongestMobNoPotionBattles: number;
  strongestMob25PotionsBattles: number;
  strongestMob100PotionsBattles: number;
  worstSequence25PotionsBattles: number;
  worstSequence100PotionsBattles: number;
  riskWith100Potions: AutoCombatSurvivalRiskLevel;
};

type SurvivalRankRow = {
  tier: number;
  level: number;
  mapName: string;
  subMapName: string;
  className: string;
  rank: number;
  mobName: string;
  mobLevel: number;
  mobAttack: number;
  mobHp: number;
  baseWeight: number;
  averageWeight: number;
  probabilityPercent: number;
  expectedKillsPer1000: number;
  expectedDamagePerBattle: number;
  expectedMobHitDamage: number;
  expectedDodgeChancePercent: number;
  expectedCriticalChancePercent: number;
  noPotionBattles: number;
  potions25Battles: number;
  potions100Battles: number;
};

type ChartMetric = {
  key: keyof SurvivalTierRow;
  title: string;
  subtitle: string;
  yLabel: string;
  suffix?: string;
};

const DEFAULT_KILLS = 1000;
const DEFAULT_HUNTING_LEVEL = AUTO_COMBAT_HUNTING_LEVEL_CAP;
const DEFAULT_POTION_QUANTITIES = [0, 10, 25, 50, 100];
const MAX_SURVIVAL_PROJECTION = 100000;
const POTION_TRIGGER_PERCENT = 35;
const POTION_SCALE_LABEL =
  'T1-T2 80 fixo, T3-T4 100+4%, T5-T6 160+9%, T7-T8 220+15%, T9-T10 200+25%';

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
    key: 'noPotionBattles',
    title: 'Batalhas ate cair sem pocao',
    subtitle: 'HP cheio, equipamento do tier e gathering recomendado.',
    yLabel: 'Batalhas',
  },
  {
    key: 'potions10Battles',
    title: 'Batalhas com 10 pocoes',
    subtitle: 'Mesma quantidade de pocoes para todas as classes.',
    yLabel: 'Batalhas',
  },
  {
    key: 'potions25Battles',
    title: 'Batalhas com 25 pocoes',
    subtitle: 'Mostra dependencia de cura em sessoes medias.',
    yLabel: 'Batalhas',
  },
  {
    key: 'potions100Battles',
    title: 'Batalhas com 100 pocoes',
    subtitle: 'Sustentacao com estoque igual, sem descanso automatico.',
    yLabel: 'Batalhas',
  },
  {
    key: 'averageDamagePerBattle',
    title: 'Dano recebido por batalha',
    subtitle: 'Dano esperado ponderado pelos mobs reais e chances do seed.',
    yLabel: 'Dano',
  },
  {
    key: 'damagePer1000Battles',
    title: 'Dano recebido por 1000 batalhas',
    subtitle: 'Pressao bruta de cura sem economia, loot ou drops.',
    yLabel: 'Dano',
  },
  {
    key: 'strongestMobNoPotionBattles',
    title: 'Sequencia do mob mais forte sem pocao',
    subtitle: 'Somente rank 6 do tier, para avaliar pico de risco.',
    yLabel: 'Batalhas',
  },
  {
    key: 'worstSequence25PotionsBattles',
    title: 'Sequencia ruim com 25 pocoes',
    subtitle: 'Amostra extrema alternando mobs rank 5 e 6.',
    yLabel: 'Batalhas',
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

function parsePotionQuantities(value: string | undefined) {
  if (!value) {
    return DEFAULT_POTION_QUANTITIES;
  }

  const quantities = value
    .split(',')
    .map((item) => Math.max(0, Math.floor(Number(item) || 0)))
    .filter((item, index, array) => array.indexOf(item) === index)
    .sort((left, right) => left - right);

  return quantities.length > 0 ? quantities : DEFAULT_POTION_QUANTITIES;
}

function parseArgs(): SurvivalReportOptions {
  const options: SurvivalReportOptions = {
    kills: DEFAULT_KILLS,
    huntingLevel: DEFAULT_HUNTING_LEVEL,
    outputDir: resolve(process.cwd(), '..', '_reports', 'auto-combat-balance'),
    potionQuantities: DEFAULT_POTION_QUANTITIES,
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = splitArg(arg);

    switch (key) {
      case '--kills':
        options.kills = parsePositiveInteger(value, DEFAULT_KILLS);
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
      case '--potion-quantities':
        options.potionQuantities = parsePotionQuantities(value);
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

function getAdjustedEncounterWeight(params: {
  mobLevel: number;
  minMobLevel: number;
  maxMobLevel: number;
  baseWeight: number;
  huntingLevel: number;
  foundEnemiesCount: number;
}) {
  const levelRange = Math.max(1, params.maxMobLevel - params.minMobLevel);
  const relativeDifficulty =
    (Math.max(1, params.mobLevel) - params.minMobLevel) / levelRange;
  const huntingBias = Math.min(
    1.75,
    Math.max(0, (params.huntingLevel - 1) / AUTO_COMBAT_HUNTING_LEVEL_CAP) +
      Math.min(0.5, params.foundEnemiesCount / 100),
  );
  const betterMobMultiplier = 1 + relativeDifficulty * huntingBias;

  return Math.max(1, Math.round(params.baseWeight * betterMobMultiplier));
}

function getRealSeedEncounterPlans(params: {
  tier: number;
  kills: number;
  huntingLevel: number;
}): WeightedEncounterPlan[] {
  const mapDefinition = mapDefinitions.find((map) => map.tier === params.tier);

  if (!mapDefinition) {
    return [];
  }

  const basePlans = mobBaseDefinitions
    .filter(
      (mob) =>
        mob.mapName === mapDefinition.name &&
        mapDefinition.subMaps.includes(mob.subMapName) &&
        isActiveAutoCombatMob(mob),
    )
    .map((mob) => {
      const rank = getActiveAutoCombatMobRank(mob);

      return {
        mob: buildMobCombatStats({
          ...mob,
          mobName: mob.name,
          autoCombatRank: rank,
        }),
        baseMob: mob,
        mapName: mapDefinition.name,
        subMapName: mob.subMapName,
        rank: rank ?? 0,
        baseWeight: getActiveAutoCombatEncounterWeight(mob),
        accumulatedProbability: 0,
        accumulatedWeight: 0,
      };
    })
    .filter((plan) => plan.baseWeight > 0 && plan.rank > 0);

  if (basePlans.length === 0) {
    return [];
  }

  const minMobLevel = Math.min(...basePlans.map((plan) => plan.mob.level));
  const maxMobLevel = Math.max(...basePlans.map((plan) => plan.mob.level));
  const sampleSize = Math.max(1, params.kills);

  for (let index = 0; index < sampleSize; index++) {
    const weightedPlans = basePlans.map((plan) => {
      const weight = getAdjustedEncounterWeight({
        mobLevel: plan.mob.level,
        minMobLevel,
        maxMobLevel,
        baseWeight: plan.baseWeight,
        huntingLevel: params.huntingLevel,
        foundEnemiesCount: index,
      });

      return { plan, weight };
    });
    const totalWeight = weightedPlans.reduce(
      (total, plan) => total + plan.weight,
      0,
    );

    for (const weightedPlan of weightedPlans) {
      const probability =
        totalWeight > 0 ? weightedPlan.weight / totalWeight : 0;

      weightedPlan.plan.accumulatedProbability += probability;
      weightedPlan.plan.accumulatedWeight += weightedPlan.weight;
    }
  }

  return basePlans
    .map((plan) => {
      const probability = plan.accumulatedProbability / sampleSize;

      return {
        mob: plan.mob,
        baseMob: plan.baseMob,
        mapName: plan.mapName,
        subMapName: plan.subMapName,
        rank: plan.rank,
        baseWeight: plan.baseWeight,
        averageWeight: roundNumber(plan.accumulatedWeight / sampleSize, 2),
        probability,
        expectedKills: probability * params.kills,
      };
    })
    .sort((left, right) => left.rank - right.rank);
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

function projectExpectedDamageSurvival(params: {
  currentHp: number;
  maxHp: number;
  expectedDamagePerBattle: number;
  projectedBattles: number;
  potionQuantity: number;
  potionHealAmount: number;
  potionTriggerPercent: number;
}): SurvivalPotionResult {
  const maxHp = Math.max(0, params.maxHp);
  const thresholdHp = Math.floor(
    (maxHp * Math.max(1, Math.min(100, params.potionTriggerPercent))) / 100,
  );
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
  let riskLevel: AutoCombatSurvivalRiskLevel = 'LOW';

  if (safeBattles < params.projectedBattles) {
    riskLevel = safeBattles <= 0 ? 'LETHAL' : 'HIGH';
  } else if (finalHpPercent < 25) {
    riskLevel = 'HIGH';
  } else if (finalHpPercent < 55) {
    riskLevel = 'MEDIUM';
  }

  return {
    potionQuantity: params.potionQuantity,
    safeBattles,
    potionsUsed,
    finalHp: roundNumber(hp, 2),
    finalHpPercent: roundNumber(finalHpPercent, 2),
    riskLevel,
  };
}

function getPotionResultByQuantity(
  results: SurvivalPotionResult[],
  quantity: number,
) {
  return (
    results.find((result) => result.potionQuantity === quantity) ??
    projectExpectedDamageSurvival({
      currentHp: 0,
      maxHp: 0,
      expectedDamagePerBattle: 0,
      projectedBattles: 0,
      potionQuantity: quantity,
      potionHealAmount: 0,
      potionTriggerPercent: POTION_TRIGGER_PERCENT,
    })
  );
}

function buildWorstSequenceDamage(params: {
  rankRows: SurvivalRankRow[];
  preferredRanks: number[];
}) {
  const selectedRows = params.rankRows.filter((row) =>
    params.preferredRanks.includes(row.rank),
  );

  if (selectedRows.length === 0) {
    return 0;
  }

  return roundNumber(
    selectedRows.reduce(
      (total, row) => total + row.expectedDamagePerBattle,
      0,
    ) / selectedRows.length,
    2,
  );
}

function buildClassTierRows(params: {
  tier: number;
  classDefinition: (typeof classDefinitions)[number];
  kills: number;
  huntingLevel: number;
  potionQuantities: number[];
}) {
  const level = params.tier * 10;
  const encounterPlans = getRealSeedEncounterPlans({
    tier: params.tier,
    kills: params.kills,
    huntingLevel: params.huntingLevel,
  });
  const equipmentItems = getSeedEquipmentItems(
    params.classDefinition.name,
    params.tier,
  );
  const rawGatheringBonus = buildRecommendedGatheringBonus(
    params.classDefinition.name,
    level,
  );
  const combatGatheringBonus = scaleAutoCombatGatheringBonus(rawGatheringBonus);
  const visibleStats = calculateFullStats(
    params.classDefinition,
    equipmentItems,
    level,
    rawGatheringBonus,
  );
  const combatStats = calculateFullStats(
    params.classDefinition,
    equipmentItems,
    level,
    combatGatheringBonus,
  );
  const primary = combatStats.totalPrimaryStats;
  const derived = combatStats.derivedCombatStats;
  const maxHp = visibleStats.derivedCombatStats.maxHp;
  const className = displayClassName(params.classDefinition.name);
  const potionHeal = calculateAutoCombatPotionHeal({
    tier: params.tier,
    maxHp,
    className: params.classDefinition.name,
  });
  const potionHealAmount = potionHeal.healAmount;
  const rankRows = encounterPlans.map((plan): SurvivalRankRow => {
    const mobAttack = applyAutoCombatIncomingDamageMultiplier({
      attack: plan.mob.attack,
      className: params.classDefinition.name,
    });
    const survival = projectAutoCombatSurvival({
      currentHp: maxHp,
      maxHp,
      playerDefense: derived.defense,
      playerAgility: primary.agility,
      mobAttack,
      mobPrecision: plan.mob.speed,
      mobTechnique: plan.mob.level,
      projectedKills: 1,
      potion: null,
    });
    const noPotion = projectExpectedDamageSurvival({
      currentHp: maxHp,
      maxHp,
      expectedDamagePerBattle: survival.expectedDamagePerKill,
      projectedBattles: MAX_SURVIVAL_PROJECTION,
      potionQuantity: 0,
      potionHealAmount,
      potionTriggerPercent: POTION_TRIGGER_PERCENT,
    });
    const potions25 = projectExpectedDamageSurvival({
      currentHp: maxHp,
      maxHp,
      expectedDamagePerBattle: survival.expectedDamagePerKill,
      projectedBattles: MAX_SURVIVAL_PROJECTION,
      potionQuantity: 25,
      potionHealAmount,
      potionTriggerPercent: POTION_TRIGGER_PERCENT,
    });
    const potions100 = projectExpectedDamageSurvival({
      currentHp: maxHp,
      maxHp,
      expectedDamagePerBattle: survival.expectedDamagePerKill,
      projectedBattles: MAX_SURVIVAL_PROJECTION,
      potionQuantity: 100,
      potionHealAmount,
      potionTriggerPercent: POTION_TRIGGER_PERCENT,
    });

    return {
      tier: params.tier,
      level,
      mapName: plan.mapName,
      subMapName: plan.subMapName,
      className,
      rank: plan.rank,
      mobName: plan.baseMob.name,
      mobLevel: plan.mob.level,
      mobAttack,
      mobHp: plan.mob.hp,
      baseWeight: plan.baseWeight,
      averageWeight: plan.averageWeight,
      probabilityPercent: roundNumber(plan.probability * 100, 2),
      expectedKillsPer1000: roundNumber(plan.probability * 1000, 1),
      expectedDamagePerBattle: survival.expectedDamagePerKill,
      expectedMobHitDamage: survival.expectedMobHitDamage,
      expectedDodgeChancePercent: survival.expectedDodgeChancePercent,
      expectedCriticalChancePercent: survival.expectedCriticalChancePercent,
      noPotionBattles: noPotion.safeBattles,
      potions25Battles: potions25.safeBattles,
      potions100Battles: potions100.safeBattles,
    };
  });
  const averageDamagePerBattle = roundNumber(
    rankRows.reduce((total, row) => {
      const plan = encounterPlans.find(
        (item) => item.rank === row.rank && item.baseMob.name === row.mobName,
      );

      return total + (plan?.probability ?? 0) * row.expectedDamagePerBattle;
    }, 0),
    2,
  );
  const potionResults = params.potionQuantities.map((potionQuantity) =>
    projectExpectedDamageSurvival({
      currentHp: maxHp,
      maxHp,
      expectedDamagePerBattle: averageDamagePerBattle,
      projectedBattles: MAX_SURVIVAL_PROJECTION,
      potionQuantity,
      potionHealAmount,
      potionTriggerPercent: POTION_TRIGGER_PERCENT,
    }),
  );
  const strongestRank = rankRows
    .filter((row) => row.rank === 6)
    .sort(
      (left, right) =>
        right.expectedDamagePerBattle - left.expectedDamagePerBattle,
    )[0];
  const worstSequenceDamage = buildWorstSequenceDamage({
    rankRows,
    preferredRanks: [5, 6],
  });
  const worstSequence25 = projectExpectedDamageSurvival({
    currentHp: maxHp,
    maxHp,
    expectedDamagePerBattle: worstSequenceDamage,
    projectedBattles: MAX_SURVIVAL_PROJECTION,
    potionQuantity: 25,
    potionHealAmount,
    potionTriggerPercent: POTION_TRIGGER_PERCENT,
  });
  const worstSequence100 = projectExpectedDamageSurvival({
    currentHp: maxHp,
    maxHp,
    expectedDamagePerBattle: worstSequenceDamage,
    projectedBattles: MAX_SURVIVAL_PROJECTION,
    potionQuantity: 100,
    potionHealAmount,
    potionTriggerPercent: POTION_TRIGGER_PERCENT,
  });
  const result0 = getPotionResultByQuantity(potionResults, 0);
  const result10 = getPotionResultByQuantity(potionResults, 10);
  const result25 = getPotionResultByQuantity(potionResults, 25);
  const result50 = getPotionResultByQuantity(potionResults, 50);
  const result100 = getPotionResultByQuantity(potionResults, 100);

  const tierRow: SurvivalTierRow = {
    tier: params.tier,
    level,
    mapName: encounterPlans[0]?.mapName ?? `Tier ${params.tier}`,
    className,
    hp: maxHp,
    defense: derived.defense,
    agility: primary.agility,
    potionHealAmount,
    encounterCount: encounterPlans.length,
    totalEncounterWeight: roundNumber(
      encounterPlans.reduce((total, plan) => total + plan.averageWeight, 0),
    ),
    weightedMobLevel: roundNumber(
      encounterPlans.reduce(
        (total, plan) => total + plan.probability * plan.mob.level,
        0,
      ),
      1,
    ),
    averageDamagePerBattle,
    damagePer1000Battles: roundNumber(averageDamagePerBattle * 1000),
    noPotionBattles: result0.safeBattles,
    potions10Battles: result10.safeBattles,
    potions25Battles: result25.safeBattles,
    potions50Battles: result50.safeBattles,
    potions100Battles: result100.safeBattles,
    noPotionVsBestPercent: 0,
    potions100VsBestPercent: 0,
    strongestMobNoPotionBattles: strongestRank?.noPotionBattles ?? 0,
    strongestMob25PotionsBattles: strongestRank?.potions25Battles ?? 0,
    strongestMob100PotionsBattles: strongestRank?.potions100Battles ?? 0,
    worstSequence25PotionsBattles: worstSequence25.safeBattles,
    worstSequence100PotionsBattles: worstSequence100.safeBattles,
    riskWith100Potions: result100.riskLevel,
  };

  return { tierRow, rankRows, potionResults };
}

function buildRows(options: SurvivalReportOptions) {
  const tierRows: SurvivalTierRow[] = [];
  const rankRows: SurvivalRankRow[] = [];
  const potionRows: Array<
    SurvivalPotionResult & { tier: number; className: string }
  > = [];

  for (const tier of Array.from({ length: 10 }, (_, index) => index + 1)) {
    for (const classDefinition of classDefinitions) {
      const built = buildClassTierRows({
        tier,
        classDefinition,
        kills: options.kills,
        huntingLevel: options.huntingLevel,
        potionQuantities: options.potionQuantities,
      });

      tierRows.push(built.tierRow);
      rankRows.push(...built.rankRows);
      potionRows.push(
        ...built.potionResults.map((result) => ({
          ...result,
          tier,
          className: built.tierRow.className,
        })),
      );
    }
  }

  for (const tier of Array.from({ length: 10 }, (_, index) => index + 1)) {
    const currentTierRows = tierRows.filter((row) => row.tier === tier);
    const bestNoPotion = Math.max(
      1,
      ...currentTierRows.map((row) => row.noPotionBattles),
    );
    const bestWith100 = Math.max(
      1,
      ...currentTierRows.map((row) => row.potions100Battles),
    );

    for (const row of currentTierRows) {
      row.noPotionVsBestPercent = roundNumber(
        (row.noPotionBattles / bestNoPotion) * 100,
        1,
      );
      row.potions100VsBestPercent = roundNumber(
        (row.potions100Battles / bestWith100) * 100,
        1,
      );
    }
  }

  return { tierRows, rankRows, potionRows };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function getMetricMax(rows: SurvivalTierRow[], metric: ChartMetric) {
  const values = rows.map((row) => Number(row[metric.key]) || 0);

  return Math.max(1, ...values) * 1.12;
}

function buildLinePath(params: {
  rows: SurvivalTierRow[];
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
  rows: SurvivalTierRow[];
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
      elements.push(
        `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}" stroke="#ffffff" stroke-width="1.5">` +
          `<title>${escapeXml(`${className} T${point.row.tier}: ${formatNumber(Number(point.row[params.metric.key]))}${params.metric.suffix ?? ''}`)}</title>` +
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

function renderSvg(rows: SurvivalTierRow[], options: SurvivalReportOptions) {
  const width = 1600;
  const height = 3300;
  const chartWidth = 740;
  const chartHeight = 650;
  const positions = [
    { x: 50, y: 210 },
    { x: 810, y: 210 },
    { x: 50, y: 910 },
    { x: 810, y: 910 },
    { x: 50, y: 1610 },
    { x: 810, y: 1610 },
    { x: 50, y: 2310 },
    { x: 810, y: 2310 },
  ];
  const tier10Rows = rows
    .filter((row) => row.tier === 10)
    .sort((left, right) => right.potions100Battles - left.potions100Battles);
  const bestTier10 = tier10Rows[0];
  const worstTier10 = tier10Rows[tier10Rows.length - 1];
  const worstNoPotionTier = [...rows]
    .sort((left, right) => left.noPotionVsBestPercent - right.noPotionVsBestPercent)[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Auto-combat survival and damage report">
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
  <text x="50" y="62" class="title">Sobrevivencia e dano no auto-combate</text>
  <text x="50" y="96" class="subtitle">Sem loot, gold ou drops. Usa mapas reais do seed, mobs ativos reais, chance ponderada, equipamento do tier, gathering recomendado e caca nivel ${options.huntingLevel}.</text>
  <text x="50" y="132" class="meta">Modelo: ${escapeXml(AUTO_COMBAT_BALANCE_MODEL_LABEL)} | Pocoes reais por tier (${escapeXml(POTION_SCALE_LABEL)}), gatilho em ${POTION_TRIGGER_PERCENT}% | Amostra de pesos: ${options.kills} mobs</text>
  <text x="50" y="162" class="meta">T10 com 100 pocoes: melhor ${escapeXml(bestTier10?.className ?? '')} (${formatNumber(bestTier10?.potions100Battles ?? 0)} batalhas), pior ${escapeXml(worstTier10?.className ?? '')} (${formatNumber(worstTier10?.potions100Battles ?? 0)} batalhas).</text>
  <text x="50" y="188" class="meta">Maior queda sem pocao: T${worstNoPotionTier?.tier ?? 0} ${escapeXml(worstNoPotionTier?.className ?? '')}, ${formatNumber(worstNoPotionTier?.noPotionVsBestPercent ?? 0)}% do melhor do tier.</text>
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
</svg>`;
}

function toCsv<T extends Record<string, unknown>>(rows: T[], headers: string[]) {
  const lines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header];

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
  const { tierRows, rankRows, potionRows } = buildRows(options);
  const outputDir = options.outputDir;
  const baseName = `${toSlug(
    AUTO_COMBAT_BALANCE_MODEL_LABEL,
  )}-sobrevivencia-dano-mapas-reais-seed-caca-nivel-${options.huntingLevel}`;
  const svgPath = resolve(outputDir, `${baseName}.svg`);
  const summaryCsvPath = resolve(outputDir, `${baseName}-resumo.csv`);
  const rankCsvPath = resolve(outputDir, `${baseName}-dano-por-rank.csv`);
  const potionCsvPath = resolve(outputDir, `${baseName}-pocoes-iguais.csv`);
  const jsonPath = resolve(outputDir, `${baseName}.json`);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(svgPath, renderSvg(tierRows, options), 'utf8');
  writeFileSync(
    summaryCsvPath,
    toCsv(tierRows as unknown as Array<Record<string, unknown>>, [
      'tier',
      'level',
      'mapName',
      'className',
      'hp',
      'defense',
      'agility',
      'potionHealAmount',
      'encounterCount',
      'totalEncounterWeight',
      'weightedMobLevel',
      'averageDamagePerBattle',
      'damagePer1000Battles',
      'noPotionBattles',
      'potions10Battles',
      'potions25Battles',
      'potions50Battles',
      'potions100Battles',
      'noPotionVsBestPercent',
      'potions100VsBestPercent',
      'strongestMobNoPotionBattles',
      'strongestMob25PotionsBattles',
      'strongestMob100PotionsBattles',
      'worstSequence25PotionsBattles',
      'worstSequence100PotionsBattles',
      'riskWith100Potions',
    ]),
    'utf8',
  );
  writeFileSync(
    rankCsvPath,
    toCsv(rankRows as unknown as Array<Record<string, unknown>>, [
      'tier',
      'level',
      'mapName',
      'subMapName',
      'className',
      'rank',
      'mobName',
      'mobLevel',
      'mobAttack',
      'mobHp',
      'baseWeight',
      'averageWeight',
      'probabilityPercent',
      'expectedKillsPer1000',
      'expectedDamagePerBattle',
      'expectedMobHitDamage',
      'expectedDodgeChancePercent',
      'expectedCriticalChancePercent',
      'noPotionBattles',
      'potions25Battles',
      'potions100Battles',
    ]),
    'utf8',
  );
  writeFileSync(
    potionCsvPath,
    toCsv(potionRows as unknown as Array<Record<string, unknown>>, [
      'tier',
      'className',
      'potionQuantity',
      'safeBattles',
      'potionsUsed',
      'finalHp',
      'finalHpPercent',
      'riskLevel',
    ]),
    'utf8',
  );
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        model: AUTO_COMBAT_BALANCE_MODEL_LABEL,
        source: 'real-seed-maps',
        scenario:
          'survival/damage only: real seed maps + active mobs + weighted encounter chance + seed equipment + recommended gathering + current damage formula',
        kills: options.kills,
        huntingLevel: options.huntingLevel,
        potionScale: POTION_SCALE_LABEL,
        potionTriggerPercent: POTION_TRIGGER_PERCENT,
        potionQuantities: options.potionQuantities,
        tierRows,
        rankRows,
        potionRows,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('Auto-combat survival report exported');
  console.log(`SVG: ${svgPath}`);
  console.log(`Summary CSV: ${summaryCsvPath}`);
  console.log(`Rank CSV: ${rankCsvPath}`);
  console.log(`Potion CSV: ${potionCsvPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.table(
    tierRows
      .filter((row) => row.tier === 10)
      .sort((left, right) => right.potions100Battles - left.potions100Battles)
      .map((row) => ({
        tier: row.tier,
        class: row.className,
        hp: row.hp,
        dmg: row.averageDamagePerBattle,
        no_potion: row.noPotionBattles,
        p25: row.potions25Battles,
        p100: row.potions100Battles,
        rank6_no_potion: row.strongestMobNoPotionBattles,
        risk100: row.riskWith100Potions,
      })),
  );
}

main();
