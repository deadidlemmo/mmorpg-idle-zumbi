import { WORLD_BOSS_SCHEDULE_CONFIG } from './world-boss.config';

export const ECONOMY_LAUNCH_TIERS = [1, 2, 3, 4, 5] as const;

export type EconomyLaunchTier = (typeof ECONOMY_LAUNCH_TIERS)[number];

export function isEconomyLaunchTier(tier: number): tier is EconomyLaunchTier {
  return (ECONOMY_LAUNCH_TIERS as readonly number[]).includes(tier);
}

export const ECONOMY_ACTIVITY_REWARDS = Object.freeze({
  incursionTokens: {
    1: { min: 1, max: 3 },
    2: { min: 2, max: 4 },
    3: { min: 3, max: 5 },
    4: { min: 4, max: 6 },
    5: { min: 5, max: 7 },
  },
  worldBossFragments: {
    1: { min: 2, max: 5 },
    2: { min: 3, max: 6 },
    3: { min: 4, max: 7 },
    4: { min: 5, max: 8 },
    5: { min: 6, max: 9 },
  },
  incursionReinforcementFragments: {
    1: [
      { min: 4, max: 5 },
      { min: 5, max: 6 },
    ],
    2: [
      { min: 5, max: 6 },
      { min: 6, max: 7 },
    ],
    3: [
      { min: 6, max: 8 },
      { min: 7, max: 9 },
    ],
    4: [
      { min: 7, max: 9 },
      { min: 8, max: 10 },
    ],
    5: [
      { min: 8, max: 10 },
      { min: 9, max: 11 },
    ],
  },
} as const);

export const ECONOMY_EXCHANGE_CONFIG = Object.freeze({
  incursionReinforcement: {
    currencyCost: 1,
    itemQuantity: 2,
  },
  incursionEmergencyMaterial: {
    currencyCost: 2,
    itemQuantity: 3,
  },
  worldBossCocoon: {
    currencyCost: 30,
    itemQuantity: 1,
  },
  worldBossEmergencyDrop: {
    currencyCost: 3,
    itemQuantity: 2,
  },
} as const);

export const EQUIPMENT_REINFORCEMENT_MAX_LEVEL = 3;

export const EQUIPMENT_REINFORCEMENT_CONFIG = Object.freeze({
  1: {
    materialName: 'Fragmento de Reforço T1',
    levels: [
      { level: 1, fragmentCost: 4, goldCost: 30 },
      { level: 2, fragmentCost: 7, goldCost: 60 },
      { level: 3, fragmentCost: 11, goldCost: 120 },
    ],
  },
  2: {
    materialName: 'Fragmento de Reforço T2',
    levels: [
      { level: 1, fragmentCost: 5, goldCost: 80 },
      { level: 2, fragmentCost: 9, goldCost: 160 },
      { level: 3, fragmentCost: 14, goldCost: 320 },
    ],
  },
  3: {
    materialName: 'Fragmento de Reforço T3',
    levels: [
      { level: 1, fragmentCost: 6, goldCost: 160 },
      { level: 2, fragmentCost: 11, goldCost: 320 },
      { level: 3, fragmentCost: 17, goldCost: 650 },
    ],
  },
  4: {
    materialName: 'Fragmento de Reforço T4',
    levels: [
      { level: 1, fragmentCost: 7, goldCost: 300 },
      { level: 2, fragmentCost: 13, goldCost: 650 },
      { level: 3, fragmentCost: 20, goldCost: 1200 },
    ],
  },
  5: {
    materialName: 'Fragmento de Reforço T5',
    levels: [
      { level: 1, fragmentCost: 8, goldCost: 500 },
      { level: 2, fragmentCost: 15, goldCost: 1000 },
      { level: 3, fragmentCost: 23, goldCost: 2000 },
    ],
  },
} as const);

export type EquipmentReinforcementSlot =
  | 'MAIN_HAND'
  | 'OFF_HAND'
  | 'HEAD'
  | 'ARMOR'
  | 'PANTS'
  | 'BOOTS';

export type EquipmentReinforcementStatKey =
  | 'strengthBonus'
  | 'vitalityBonus'
  | 'agilityBonus'
  | 'precisionBonus'
  | 'techniqueBonus'
  | 'willpowerBonus';

export type EquipmentReinforcementStats = Record<
  EquipmentReinforcementStatKey,
  number
>;

const EQUIPMENT_REINFORCEMENT_STAT_KEYS: EquipmentReinforcementStatKey[] = [
  'strengthBonus',
  'vitalityBonus',
  'agilityBonus',
  'precisionBonus',
  'techniqueBonus',
  'willpowerBonus',
];

const EQUIPMENT_SLOT_POINTS_PER_TIER: Record<
  EquipmentReinforcementSlot,
  number
> = {
  MAIN_HAND: 6,
  OFF_HAND: 5,
  HEAD: 4,
  ARMOR: 6,
  PANTS: 5,
  BOOTS: 4,
};

export function getEquipmentBaseStatBudget(
  tier: number,
  slot: EquipmentReinforcementSlot,
) {
  const safeTier = Math.max(1, Math.floor(Number(tier) || 1));
  const budget = safeTier * EQUIPMENT_SLOT_POINTS_PER_TIER[slot];

  return safeTier === 1 ? Math.round(budget * 1.25) : budget;
}

export function getEquipmentReinforcementCost(tier: number, level: number) {
  if (!isEconomyLaunchTier(tier)) return null;

  return (
    EQUIPMENT_REINFORCEMENT_CONFIG[tier].levels.find(
      (entry) => entry.level === level,
    ) ?? null
  );
}

export function getEquipmentReinforcementStatBudget(
  baseStats: EquipmentReinforcementStats,
  tier: number,
  slot: EquipmentReinforcementSlot,
  level: number,
) {
  const safeLevel = Math.max(
    0,
    Math.min(EQUIPMENT_REINFORCEMENT_MAX_LEVEL, Math.floor(level)),
  );
  const baseBudget = EQUIPMENT_REINFORCEMENT_STAT_KEYS.reduce(
    (total, key) => total + Math.max(0, Math.floor(baseStats[key] ?? 0)),
    0,
  );
  if (safeLevel === 0) return baseBudget;

  const nextTierBudget = getEquipmentBaseStatBudget(tier + 1, slot);
  const gap = Math.max(1, nextTierBudget - baseBudget);
  const targetByLevel: Record<number, number> = {
    1: baseBudget + Math.max(1, Math.round(gap * 0.4)),
    2: baseBudget + Math.max(2, Math.round(gap * 0.75)),
    3: nextTierBudget + 1,
  };

  return Math.max(baseBudget + safeLevel, targetByLevel[safeLevel]);
}

export function buildReinforcedEquipmentStats(
  baseStats: EquipmentReinforcementStats,
  tier: number,
  slot: EquipmentReinforcementSlot,
  level: number,
): EquipmentReinforcementStats {
  const normalized = EQUIPMENT_REINFORCEMENT_STAT_KEYS.reduce((stats, key) => {
    stats[key] = Math.max(0, Math.floor(baseStats[key] ?? 0));
    return stats;
  }, {} as EquipmentReinforcementStats);
  const currentBudget = EQUIPMENT_REINFORCEMENT_STAT_KEYS.reduce(
    (total, key) => total + normalized[key],
    0,
  );
  const targetBudget = getEquipmentReinforcementStatBudget(
    normalized,
    tier,
    slot,
    level,
  );
  let remaining = targetBudget - currentBudget;

  if (remaining <= 0 || currentBudget <= 0) return normalized;

  const allocations = EQUIPMENT_REINFORCEMENT_STAT_KEYS.map((key, index) => {
    const exact = (remaining * normalized[key]) / currentBudget;
    return {
      key,
      index,
      points: Math.floor(exact),
      remainder: exact - Math.floor(exact),
      weight: normalized[key],
    };
  });
  remaining -= allocations.reduce((total, entry) => total + entry.points, 0);

  allocations
    .sort(
      (left, right) =>
        right.remainder - left.remainder ||
        right.weight - left.weight ||
        left.index - right.index,
    )
    .forEach((entry) => {
      if (remaining <= 0) return;
      entry.points += 1;
      remaining -= 1;
    });

  return allocations.reduce((stats, entry) => {
    stats[entry.key] = normalized[entry.key] + entry.points;
    return stats;
  }, {} as EquipmentReinforcementStats);
}

export const PET_DEFINITIONS = Object.freeze([
  {
    key: 'farejador-suburbio',
    name: 'Farejador do Subúrbio',
    description: 'Companheiro recuperado de um casulo do Subúrbio Silencioso.',
    tier: 1,
    rarity: 'UNCOMMON',
    cocoonItemName: 'Casulo Infectado T1',
    incubationSeconds: 2 * 60 * 60,
    fragmentCost: 10,
    goldCost: 300,
  },
  {
    key: 'mastim-ferruginoso',
    name: 'Mastim Ferruginoso',
    description: 'Companheiro resistente adaptado ao Distrito da Ferrugem.',
    tier: 2,
    rarity: 'UNCOMMON',
    cocoonItemName: 'Casulo Infectado T2',
    incubationSeconds: 4 * 60 * 60,
    fragmentCost: 14,
    goldCost: 750,
  },
  {
    key: 'simbionte-clinico',
    name: 'Simbionte Clínico',
    description:
      'Criatura estabilizada nos laboratórios do Hospital Santa Ruína.',
    tier: 3,
    rarity: 'RARE',
    cocoonItemName: 'Casulo Infectado T3',
    incubationSeconds: 6 * 60 * 60,
    fragmentCost: 18,
    goldCost: 1600,
  },
  {
    key: 'corvo-do-terminal',
    name: 'Corvo do Terminal',
    description: 'Batedor mutante incubado a partir de um casulo do Terminal.',
    tier: 4,
    rarity: 'RARE',
    cocoonItemName: 'Casulo Infectado T4',
    incubationSeconds: 8 * 60 * 60,
    fragmentCost: 24,
    goldCost: 3000,
  },
  {
    key: 'sentinela-da-quarentena',
    name: 'Sentinela da Quarentena',
    description: 'Companheiro raro estabilizado na Zona de Quarentena 9.',
    tier: 5,
    rarity: 'EPIC',
    cocoonItemName: 'Casulo Infectado T5',
    incubationSeconds: 12 * 60 * 60,
    fragmentCost: 30,
    goldCost: 5000,
  },
] as const);

export const T1_ECONOMY_CONFIG = Object.freeze({
  tier: 1,
  targets: {
    firstEquipmentMinutes: { min: 30, max: 45 },
    fullSetHours: { min: 3, max: 5 },
    sevenDayGoldSinkRatioPercent: { min: 60, max: 80 },
  },
  crafting: {
    equipmentSlotsPerSet: 6,
    gatheringUnitsPerEquipment: 30,
    mobDropUnitsPerEquipment: 6,
    goldFeePerEquipment: 20,
  },
  upgrades: [
    {
      level: 1,
      reinforcementFragmentCost: 4,
      goldCost: 30,
    },
    {
      level: 2,
      reinforcementFragmentCost: 7,
      goldCost: 60,
    },
    {
      level: 3,
      reinforcementFragmentCost: 11,
      goldCost: 120,
    },
  ],
  salvage: {
    materialReturnRatio: 0.25,
    returnsGold: false,
    returnsCatalysts: false,
  },
  incursion: {
    entryGold: 50,
    successChancePercent: 91,
    durationMinutes: 30,
    tokenReward: ECONOMY_ACTIVITY_REWARDS.incursionTokens[1],
    reinforcementReward: {
      min: ECONOMY_ACTIVITY_REWARDS.incursionReinforcementFragments[1][0].min,
      max: ECONOMY_ACTIVITY_REWARDS.incursionReinforcementFragments[1][1].max,
    },
    reinforcementFragmentsPerToken:
      ECONOMY_EXCHANGE_CONFIG.incursionReinforcement.itemQuantity,
    successGoldRefund: 10,
  },
  worldBoss: {
    fragmentReward: ECONOMY_ACTIVITY_REWARDS.worldBossFragments[1],
    goldReward: { min: 180, max: 300 },
    cocoonChancePercent: 0.98,
  },
  petIncubation: {
    fragmentCost: 10,
    goldCost: 300,
    durationHours: 2,
  },
  blackMarket: {
    materialGoldFloor: 3,
  },
  simulation: {
    targetProfile: 'ACTIVE',
    startingGold: 250,
    stepMinutes: 5,
    gatheringUnitsPerMinute: 1.25,
    mobDropUnitsPerMinute: 0.35,
    activityPattern: [
      'GATHERING',
      'GATHERING',
      'GATHERING',
      'COMBAT',
      'COMBAT',
    ],
    worldBossCalendar: {
      minutesPerDay: 24 * 60,
      initialLobbyLeadMinutes:
        WORLD_BOSS_SCHEDULE_CONFIG.initialLobbyLeadSeconds / 60,
      entryWindowMinutes: WORLD_BOSS_SCHEDULE_CONFIG.entryWindowSeconds / 60,
      eventDurationMinutes:
        WORLD_BOSS_SCHEDULE_CONFIG.eventDurationSeconds / 60,
      minimumParticipationMinutes: 5,
      joinDecisionLeadMinutes: 10,
      habitualStartJitterMinutes: 45,
      fallbackActivationChancePercent: 100,
      telemetryCalibration: {
        lookbackDays: 90,
        minimumEventSampleSize: 10,
        minimumActivatedEventSampleSize: 10,
        minimumDefeatedEventSampleSize: 5,
        minimumExpiredActivatedEventSampleSize: 5,
      },
      slots: [
        {
          index: 0,
          key: 'SHORT',
          label: 'Contencao',
          respawnMinutes:
            WORLD_BOSS_SCHEDULE_CONFIG.slots[0].respawnSeconds / 60,
          defeatChancePercent: 65,
          defeatedDurationMinutes: { min: 45, max: 90 },
          expiredProgressPercent: { min: 15, max: 85 },
        },
        {
          index: 1,
          key: 'LONG',
          label: 'Exterminio',
          respawnMinutes:
            WORLD_BOSS_SCHEDULE_CONFIG.slots[1].respawnSeconds / 60,
          defeatChancePercent: 50,
          defeatedDurationMinutes: { min: 60, max: 120 },
          expiredProgressPercent: { min: 15, max: 85 },
        },
      ],
    },
    profiles: [
      {
        key: 'CASUAL',
        label: 'Casual',
        populationPercent: 45,
        activeMinutesPerDay: 90,
        missionGoldPerDay: 35,
        consumableGoldPerDay: 12,
        incursionAttemptsPerDay: 0.15,
        worldBossJoinChancePercent: 40,
        worldBossEligibleFromDayBySlot: { 0: 2, 1: 5 },
      },
      {
        key: 'ACTIVE',
        label: 'Ativo',
        populationPercent: 40,
        activeMinutesPerDay: 240,
        missionGoldPerDay: 70,
        consumableGoldPerDay: 35,
        incursionAttemptsPerDay: 0.5,
        worldBossJoinChancePercent: 65,
        worldBossEligibleFromDayBySlot: { 0: 1, 1: 3 },
      },
      {
        key: 'DEDICATED',
        label: 'Dedicado',
        populationPercent: 15,
        activeMinutesPerDay: 420,
        missionGoldPerDay: 100,
        consumableGoldPerDay: 50,
        incursionAttemptsPerDay: 1,
        worldBossJoinChancePercent: 85,
        worldBossEligibleFromDayBySlot: { 0: 1, 1: 2 },
      },
    ],
  },
});

export type T1EconomyConfig = typeof T1_ECONOMY_CONFIG;
