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
  worldBossCocoonChancePercent: {
    1: 0.98,
    2: 1.16,
    3: 1.34,
    4: 1.52,
    5: 1.7,
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

export const PET_TIME_REDUCTION_BASIS_POINTS_BY_TIER = Object.freeze({
  1: 300,
  2: 400,
  3: 500,
  4: 600,
  5: 750,
} as const);

const PET_TIER_CONFIG = Object.freeze({
  1: {
    rarity: 'UNCOMMON',
    incubationSeconds: 2 * 60 * 60,
    fragmentCost: 10,
    goldCost: 300,
    npcSaleGold: 120,
  },
  2: {
    rarity: 'UNCOMMON',
    incubationSeconds: 4 * 60 * 60,
    fragmentCost: 14,
    goldCost: 750,
    npcSaleGold: 300,
  },
  3: {
    rarity: 'RARE',
    incubationSeconds: 6 * 60 * 60,
    fragmentCost: 18,
    goldCost: 1600,
    npcSaleGold: 640,
  },
  4: {
    rarity: 'RARE',
    incubationSeconds: 8 * 60 * 60,
    fragmentCost: 24,
    goldCost: 3000,
    npcSaleGold: 1200,
  },
  5: {
    rarity: 'EPIC',
    incubationSeconds: 12 * 60 * 60,
    fragmentCost: 30,
    goldCost: 5000,
    npcSaleGold: 2000,
  },
} as const);

export const PET_DUPLICATE_COCOON_RECOVERY_CONFIG = Object.freeze({
  fragmentsPerCocoon: 10,
  npcSaleGoldRatioBasisPoints: 5_000,
});

export function getPetDuplicateCocoonRecovery(tier: number) {
  if (!isEconomyLaunchTier(tier)) return null;

  const tierConfig = PET_TIER_CONFIG[tier];
  return {
    fragmentsPerCocoon: PET_DUPLICATE_COCOON_RECOVERY_CONFIG.fragmentsPerCocoon,
    goldPerCocoon: Math.max(
      1,
      Math.floor(
        (tierConfig.npcSaleGold *
          PET_DUPLICATE_COCOON_RECOVERY_CONFIG.npcSaleGoldRatioBasisPoints) /
          10_000,
      ),
    ),
  };
}

const PET_SPECIALIZATION_CONFIG = Object.freeze([
  {
    key: 'desmanche',
    specialization: 'GATHERING_DESMANCHE',
    effectType: 'GATHERING_TIME_REDUCTION',
    label: 'Desmanche',
    activityLabel: 'desmanche',
    names: {
      1: 'Sucateiro do Subúrbio',
      2: 'Sucateiro Ferruginoso',
      3: 'Sucateiro Clínico',
      4: 'Sucateiro do Terminal',
      5: 'Sucateiro da Quarentena',
    },
  },
  {
    key: 'coleta',
    specialization: 'GATHERING_COLETA',
    effectType: 'GATHERING_TIME_REDUCTION',
    label: 'Coleta',
    activityLabel: 'coleta',
    names: {
      1: 'Catador do Subúrbio',
      2: 'Catador Ferruginoso',
      3: 'Catador Clínico',
      4: 'Catador do Terminal',
      5: 'Catador da Quarentena',
    },
  },
  {
    key: 'patrulha',
    specialization: 'GATHERING_PATRULHA',
    effectType: 'GATHERING_TIME_REDUCTION',
    label: 'Patrulha',
    activityLabel: 'patrulha',
    names: {
      1: 'Batedor do Subúrbio',
      2: 'Batedor Ferruginoso',
      3: 'Batedor Clínico',
      4: 'Corvo do Terminal',
      5: 'Batedor da Quarentena',
    },
  },
  {
    key: 'arsenal',
    specialization: 'GATHERING_ARSENAL',
    effectType: 'GATHERING_TIME_REDUCTION',
    label: 'Arsenal',
    activityLabel: 'busca no arsenal',
    names: {
      1: 'Carregador do Subúrbio',
      2: 'Carregador Ferruginoso',
      3: 'Carregador Clínico',
      4: 'Carregador do Terminal',
      5: 'Carregador da Quarentena',
    },
  },
  {
    key: 'tecnovarredura',
    specialization: 'GATHERING_TECNOVARREDURA',
    effectType: 'GATHERING_TIME_REDUCTION',
    label: 'Tecnovarredura',
    activityLabel: 'tecnovarredura',
    names: {
      1: 'Sonda do Subúrbio',
      2: 'Sonda Ferruginosa',
      3: 'Sonda Clínica',
      4: 'Sonda do Terminal',
      5: 'Sonda da Quarentena',
    },
  },
  {
    key: 'contencao',
    specialization: 'GATHERING_CONTENCAO',
    effectType: 'GATHERING_TIME_REDUCTION',
    label: 'Contenção',
    activityLabel: 'contenção',
    names: {
      1: 'Guardião do Subúrbio',
      2: 'Guardião Ferruginoso',
      3: 'Simbionte Clínico',
      4: 'Guardião do Terminal',
      5: 'Sentinela da Quarentena',
    },
  },
  {
    key: 'combate',
    specialization: 'AUTO_COMBAT_TTK',
    effectType: 'AUTO_COMBAT_TTK_REDUCTION',
    label: 'Combate automático',
    activityLabel: 'abate no combate automático',
    names: {
      1: 'Predador do Subúrbio',
      2: 'Mastim Ferruginoso',
      3: 'Predador Clínico',
      4: 'Predador do Terminal',
      5: 'Predador da Quarentena',
    },
  },
  {
    key: 'rastreamento',
    specialization: 'AUTO_COMBAT_HUNTING',
    effectType: 'HUNTING_TIME_REDUCTION',
    label: 'Rastreamento',
    activityLabel: 'rastreamento de ameaças',
    names: {
      1: 'Farejador do Subúrbio',
      2: 'Farejador Ferruginoso',
      3: 'Farejador Clínico',
      4: 'Farejador do Terminal',
      5: 'Farejador da Quarentena',
    },
  },
] as const);

const LEGACY_PET_KEYS: Partial<
  Record<`${string}:t${EconomyLaunchTier}`, string>
> = {
  'rastreamento:t1': 'farejador-suburbio',
  'combate:t2': 'mastim-ferruginoso',
  'contencao:t3': 'simbionte-clinico',
  'patrulha:t4': 'corvo-do-terminal',
  'contencao:t5': 'sentinela-da-quarentena',
};

export const PET_DEFINITIONS = Object.freeze(
  ECONOMY_LAUNCH_TIERS.flatMap((tier) => {
    const tierConfig = PET_TIER_CONFIG[tier];
    const effectBasisPoints = PET_TIME_REDUCTION_BASIS_POINTS_BY_TIER[tier];

    return PET_SPECIALIZATION_CONFIG.map((specialization, index) => {
      const bonusPercent = effectBasisPoints / 100;
      const legacyKey = `${specialization.key}:t${tier}` as const;

      return {
        key: LEGACY_PET_KEYS[legacyKey] ?? `${specialization.key}-t${tier}`,
        name: specialization.names[tier],
        description: `${specialization.names[tier]} reduz em ${bonusPercent.toLocaleString('pt-BR')}% o tempo de ${specialization.activityLabel} enquanto estiver equipado.`,
        tier,
        rarity: tierConfig.rarity,
        specialization: specialization.specialization,
        specializationLabel: specialization.label,
        effectType: specialization.effectType,
        effectBasisPoints,
        cocoonItemName: `Casulo de ${specialization.label} T${tier}`,
        cocoonItemSlug: `casulo-de-${specialization.key}-t${tier}`,
        assetKey: `pet-${specialization.key}-t${tier}`,
        incubationSeconds: tierConfig.incubationSeconds,
        fragmentCost: tierConfig.fragmentCost,
        goldCost: tierConfig.goldCost,
        npcSaleGold: tierConfig.npcSaleGold,
        sortOrder: (tier - 1) * PET_SPECIALIZATION_CONFIG.length + index,
      };
    });
  }),
);

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
