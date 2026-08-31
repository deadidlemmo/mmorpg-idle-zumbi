import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  IncursionRewardType,
  IncursionSessionStatus,
  InventoryItemType,
  ItemSlot,
  MarketListingStatus,
  MaterialOrigin,
  MissionType,
  PrismaClient,
  Rarity,
  WorldBossRewardType,
} from '@prisma/client';
import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import { consumableDefinitions } from '../prisma/seed-data/consumables.seed-data';
import { incursionDefinitions } from '../prisma/seed-data/incursions.seed-data';
import {
  equipmentDefinitions,
  materialDefinitions,
} from '../prisma/seed-data/items.seed-data';
import {
  mobDropItemDefinitions,
  mobDropTables,
} from '../prisma/seed-data/mob-drops.seed-data';
import {
  getActiveAutoCombatEncounterWeight,
  getActiveAutoCombatMobRank,
  mobBaseDefinitions,
} from '../prisma/seed-data/mobs.seed-data';
import { missionDefinitions } from '../prisma/seed-data/progression.seed-data';
import { recipeDefinitions } from '../prisma/seed-data/recipes.seed-data';
import { worldBossDefinitions } from '../prisma/seed-data/world-bosses.seed-data';
import {
  getCraftingDurationSecondsForTier,
  getCraftingXpRewardForTier,
} from '../src/common/config/crafting.config';
import {
  EQUIPMENT_REINFORCEMENT_CONFIG,
  EQUIPMENT_REINFORCEMENT_MAX_LEVEL,
  getIncursionTokenItemByTier,
  PET_DEFINITIONS,
  getPetBossAvailabilityProjection,
  getEquipmentReinforcementCost,
  PET_BOSS_AVAILABILITY_TARGET,
} from '../src/common/config/economy.config';
import {
  GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
  GATHERING_AFFINITY_XP_MULTIPLIER,
  GATHERING_RATE_BY_TIER,
  getGatheringRateMultiplier,
  getGatheringXpPerUnitForTier,
} from '../src/common/config/gathering.config';
import {
  calculateBlackMarketSellValue,
  getItemRarityByTier,
} from '../src/common/config/item-economy.config';
import {
  getMissionReward,
  MISSION_REWARD_MATRIX,
} from '../src/common/config/mission-balance.config';
import {
  getWorldBossCollectiveRewardMultiplier,
  WORLD_BOSS_REWARD_CONFIG,
  WORLD_BOSS_SCHEDULE_CONFIG,
} from '../src/common/config/world-boss.config';
import {
  calculateIncursionFailureEntryRefund,
  calculateIncursionSuccessEntryRefund,
  getIncursionRiskProfile,
} from '../src/modules/incursions/incursion-risk.util';
import { isWorldBossFragmentReward } from '../src/modules/world-bosses/world-boss-rewards';
import { loadWorldBossSimulationCalibration } from '../src/modules/economy/world-boss-simulation-calibration.repository';
import {
  createFallbackWorldBossSimulationCalibration,
  type WorldBossSimulationCalibration,
} from '../src/modules/economy/world-boss-simulation-calibration';
import { buildTierEconomyReport } from './simulate-tier-economy';
import { buildCurrentSetAutoCombatMobRow } from './validate-auto-combat-tier-progression';

const LAUNCH_TIERS = [1, 2, 3, 4, 5] as const;
const ACTIVE_MOB_RANKS = [1, 2, 3, 4, 5, 6] as const;
const EQUIPMENT_SET_SLOTS = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;
const INCURSION_APPROACHES = ['CAUTIOUS', 'BALANCED', 'AGGRESSIVE'] as const;
const TELEMETRY_LOOKBACK_DAYS = 30;

type LaunchTier = (typeof LAUNCH_TIERS)[number];
type IncursionApproach = (typeof INCURSION_APPROACHES)[number];
type ActivityKey =
  | 'AUTO_COMBAT'
  | 'GATHERING'
  | 'CRAFTING'
  | 'INCURSION'
  | 'WORLD_BOSS'
  | 'MISSIONS';

type SaleCatalogCategory =
  | 'GATHERING_MATERIAL'
  | 'MOB_MATERIAL'
  | 'EQUIPMENT'
  | 'REINFORCEMENT_MATERIAL'
  | 'PET_COCOON';

export type ActivityEconomyRow = {
  tier: LaunchTier;
  activity: ActivityKey;
  mode: string;
  directGoldGrossPerHour: number;
  itemNpcValuePerHour: number;
  grossGoldEquivalentPerHour: number;
  directGoldCostPerHour: number;
  inputOpportunityCostPerHour: number;
  netGoldEquivalentPerHour: number;
  characterXpPerHour: number;
  skillXpPerHour: number;
  defeatChancePercent: number;
  expectedUnitsPerHour: number;
  availability: 'CONTINUOUS' | 'SCHEDULED' | 'CAPPED';
  note: string;
};

export type SaleCatalogRow = {
  tier: LaunchTier;
  itemTier: number;
  category: SaleCatalogCategory;
  itemName: string;
  family: string;
  rarity: Rarity;
  inventoryType: InventoryItemType;
  isSellable: boolean;
  npcSaleGold: number;
  acquisition:
    | 'GATHERING'
    | 'AUTO_COMBAT'
    | 'CRAFTING'
    | 'INCURSION'
    | 'WORLD_BOSS';
};

type AutoCombatEconomy = {
  summary: ActivityEconomyRow;
  killsPerHour: number;
  characterXpPerHour: number;
  potionName: string;
  potionBuyPrice: number;
  potionsPer100Kills: number;
  potionGoldPerHour: number;
  averageMaxHp: number;
  averagePotionHealAmount: number;
  dropNpcValuePerHour: number;
  netGoldEquivalentPerHour: number;
  defeatChancePercent: number;
  classes: Array<{
    className: string;
    killsPerHour: number;
    characterXpPerHour: number;
    potionGoldPerHour: number;
    maxHp: number;
    potionHealAmount: number;
    defeatChancePercent: number;
    dropUnitsPerHourByItem: Record<string, number>;
  }>;
};

type GatheringVariant = {
  tier: LaunchTier;
  mode: 'ENTRY' | 'MASTERY' | 'MASTERY_AFFINITY';
  skillLevel: number;
  hasClassAffinity: boolean;
  materialCount: number;
  unitNpcSaleGold: number;
  unitsPerHour: number;
  itemNpcValuePerHour: number;
  skillXpPerHour: number;
  summary: ActivityEconomyRow;
};

type CraftingRecipeEconomy = {
  tier: LaunchTier;
  className: string;
  slot: ItemSlot;
  outputItemName: string;
  outputNpcSaleGold: number;
  gatheringInputQuantity: number;
  mobInputQuantity: number;
  inputNpcOpportunityGold: number;
  craftingSeconds: number;
  craftingSkillXp: number;
  stationCraftsPerHour: number;
  stationOutputNpcValuePerHour: number;
  stationInputOpportunityGoldPerHour: number;
  stationNetEconomicValuePerHour: number;
  gatheringHours: number;
  autoCombatDropHours: number;
  craftingHours: number;
  selfSupplyHours: number;
  selfSupplyPotionGold: number;
  selfSupplyOutputNpcValuePerHour: number;
  selfSupplyNetGoldPerHour: number;
  selfSupplyRelativeToSellingInputsPerHour: number;
  ingredients: Array<{
    itemName: string;
    origin: MaterialOrigin;
    quantity: number;
    unitNpcSaleGold: number;
    expectedUnitsPerHour: number;
    expectedHours: number;
  }>;
};

type CraftingSetEconomy = {
  tier: LaunchTier;
  className: string;
  selectedItems: string[];
  outputNpcSaleGold: number;
  inputNpcOpportunityGold: number;
  gatheringHours: number;
  autoCombatDropHours: number;
  craftingHours: number;
  selfSupplyHours: number;
  potionGold: number;
  requiredReinforcementFragmentsToPlus3: number;
};

type CraftingEconomy = {
  recipes: CraftingRecipeEconomy[];
  sets: CraftingSetEconomy[];
  stationSummary: ActivityEconomyRow;
  selfSupplySummary: ActivityEconomyRow;
};

type IncursionEconomy = {
  tier: LaunchTier;
  name: string;
  approach: IncursionApproach;
  durationMinutes: number;
  attemptsPerHour: number;
  successChancePercent: number;
  failureChancePercent: number;
  expectedFailureHpLossPercentPerAttempt: number;
  entryGold: number;
  successEntryRefundGold: number;
  failureEntryRefundGold: number;
  expectedEntryRefundGoldPerAttempt: number;
  expectedLootGoldPerAttempt: number;
  expectedDirectGoldPerAttempt: number;
  expectedItemNpcValuePerAttempt: number;
  expectedWalletNetGoldPerAttempt: number;
  expectedRecoveryPotionGoldPerAttempt: number;
  expectedNetGoldPerAttempt: number;
  expectedCharacterXpPerAttempt: number;
  expectedIncursionTokensPerAttempt: number;
  expectedReinforcementFragmentsPerAttempt: number;
  summary: ActivityEconomyRow;
};

type WorldBossEconomy = {
  tier: LaunchTier;
  name: string;
  slot: string;
  activationChancePercent: number;
  activationSource: string;
  bossDefeatChancePercent: number;
  defeatSource: string;
  objectiveFailureChancePercent: number;
  playerDefeatChancePercent: number;
  expectedCycleHours: number;
  expectedParticipationHours: number;
  expectedGoldPerActivatedEvent: number;
  expectedCharacterXpPerActivatedEvent: number;
  expectedItemNpcValuePerActivatedEvent: number;
  expectedFragmentsPerActivatedEvent: number;
  expectedCocoonsPerActivatedEvent: number;
  participationSummary: ActivityEconomyRow;
  calendarSummary: ActivityEconomyRow;
};

type MissionEconomy = {
  tier: LaunchTier;
  key: string;
  title: string;
  type: MissionType;
  objectiveType: string;
  targetValue: number;
  dedicatedHours: number;
  expectedAttempts: number;
  missionGold: number;
  missionCharacterXp: number;
  objectiveDirectGoldCost: number;
  objectiveInputOpportunityCost: number;
  underlyingDirectGold: number;
  underlyingItemNpcValue: number;
  underlyingGoldEquivalent: number;
  underlyingCharacterXp: number;
  underlyingSkillXp: number;
  missionRewardGoldPerDedicatedHour: number;
  combinedNetGoldEquivalentPerDedicatedHour: number;
  defeatChancePercentPerAttempt: number;
  recurringGoldPerDay: number;
};

type ProgressionAcquisition = {
  tier: LaunchTier;
  equipmentSetSelfSupplyHoursAverage: number;
  equipmentSetSelfSupplyHoursMinimum: number;
  equipmentSetSelfSupplyHoursMaximum: number;
  reinforcementGoldForFullSetPlus3: number;
  reinforcementFragmentsForFullSetPlus3: number;
  bestBalancedIncursionForFragments: string;
  expectedIncursionHoursForReinforcementFragments: number;
  petName: string;
  petGoldCost: number;
  petFragmentCost: number;
  petIncubationHours: number;
  expectedCalendarHoursForPetFragments: number | null;
  expectedCalendarHoursForPetCocoon: number | null;
  expectedCalendarHoursUntilPetInputs: number | null;
};

type MarketplaceSetObservation = {
  tier: LaunchTier;
  className: string;
  complete: boolean;
  coveredSlots: number;
  activeListingCount: number;
  cheapestCompleteSetGold: number | null;
  observedAt: string;
};

type NpcSaleTelemetryRow = {
  tier: number | null;
  category: 'MATERIAL' | 'EQUIPMENT' | 'OTHER';
  operations: number;
  unitsSold: number;
  goldReceived: number;
  goldPerDay: number;
};

type ActivityTelemetryRow = {
  tier: number;
  activity: string;
  sampleSize: number;
  observedGoldGrossPerHour: number | null;
  observedGoldNetPerHour: number | null;
  observedXpPerHour: number | null;
  observedSuccessPercent: number | null;
  note: string;
};

export type ActivityEconomyDatabaseSnapshot = {
  generatedAt: string;
  lookbackDays: number;
  catalogVerification: {
    status: 'HEALTHY' | 'DRIFT';
    checkedItems: number;
    checkedRecipes: number;
    checkedIncursions: number;
    checkedWorldBosses: number;
    checkedMissions: number;
    mismatches: string[];
  };
  worldBossCalibrations: Record<number, WorldBossSimulationCalibration>;
  marketplace: {
    activeListings: number;
    recentPurchases: number;
    completeSets: MarketplaceSetObservation[];
  };
  npcSales: NpcSaleTelemetryRow[];
  activityTelemetry: ActivityTelemetryRow[];
};

type GoldTarget = {
  key:
    | 'POTIONS_100'
    | 'REINFORCEMENT_SET_PLUS_3'
    | 'PET_INCUBATION'
    | 'MARKET_SET';
  label: string;
  goldCost: number;
  className: string | null;
  source: 'CANONICAL' | 'MARKET_OBSERVATION';
  additionalRequirement: string | null;
};

type AffordabilityRow = {
  tier: LaunchTier;
  targetKey: GoldTarget['key'];
  targetLabel: string;
  className: string | null;
  goldCost: number;
  targetSource: GoldTarget['source'];
  incomeSource: string;
  netGoldPerHour: number;
  hours: number | null;
  days: number | null;
  additionalRequirement: string | null;
};

const CLASS_GATHERING_AFFINITIES: Record<string, readonly MaterialOrigin[]> = {
  LUTADOR: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
  ASSASSINO: [
    MaterialOrigin.ARSENAL,
    MaterialOrigin.PATRULHA,
    MaterialOrigin.TECNOVARREDURA,
  ],
  ATIRADOR: [
    MaterialOrigin.ARSENAL,
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.PATRULHA,
  ],
  MEDICO: [
    MaterialOrigin.TECNOVARREDURA,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function averageRoundedRange(min: number, max: number, multiplier = 1) {
  const safeMin = Math.max(0, Math.floor(min));
  const safeMax = Math.max(safeMin, Math.floor(max));
  const values = Array.from({ length: safeMax - safeMin + 1 }, (_, index) =>
    Math.max(0, Math.round((safeMin + index) * multiplier)),
  );
  return average(values);
}

function getItemNpcSaleGold(params: {
  tier: number;
  rarity?: Rarity;
  inventoryType: InventoryItemType;
  family?: string | null;
  isCraftable?: boolean;
  isSellable?: boolean;
}) {
  return calculateBlackMarketSellValue({
    tier: params.tier,
    rarity: params.rarity ?? getItemRarityByTier(params.tier),
    inventoryType: params.inventoryType,
    family: params.family,
    isCraftable: params.isCraftable,
    isSellable: params.isSellable,
  });
}

function getFullSetReinforcementCost(tier: LaunchTier) {
  const levels = Array.from(
    { length: EQUIPMENT_REINFORCEMENT_MAX_LEVEL },
    (_, index) => {
      const level = index + 1;
      const cost = getEquipmentReinforcementCost(tier, level);

      if (!cost) {
        throw new Error(`Custo de reforco T${tier} +${level} ausente.`);
      }

      return cost;
    },
  );

  return {
    fragments:
      EQUIPMENT_SET_SLOTS.length *
      sum(levels.map((level) => level.fragmentCost)),
    gold:
      EQUIPMENT_SET_SLOTS.length * sum(levels.map((level) => level.goldCost)),
  };
}

function buildSaleCatalog(): SaleCatalogRow[] {
  const gatheringRows = materialDefinitions
    .filter((item) => item.tier <= 5 && item.isGatheringMaterial)
    .map(
      (item): SaleCatalogRow => ({
        tier: item.tier as LaunchTier,
        itemTier: item.tier,
        category: 'GATHERING_MATERIAL',
        itemName: item.name,
        family: item.family ?? 'Material',
        rarity: getItemRarityByTier(item.tier),
        inventoryType: InventoryItemType.MATERIAL,
        isSellable: true,
        npcSaleGold: getItemNpcSaleGold({
          tier: item.tier,
          inventoryType: InventoryItemType.MATERIAL,
          family: item.family,
        }),
        acquisition: 'GATHERING',
      }),
    );
  const mobItemByName = new Map(
    mobDropItemDefinitions.map((item) => [item.name, item]),
  );
  const mobRows = Array.from(
    new Map(
      mobDropTables
        .filter((table) => table.tier <= 5)
        .flatMap((table) =>
          table.drops.map((drop) => {
            const item = mobItemByName.get(drop.itemName);
            if (!item)
              throw new Error(`Item de drop ausente: ${drop.itemName}.`);
            return [`${table.tier}:${item.name}`, { table, item }] as const;
          }),
        ),
    ).values(),
  ).map(
    ({ table, item }): SaleCatalogRow => ({
      tier: table.tier as LaunchTier,
      itemTier: item.tier,
      category: 'MOB_MATERIAL',
      itemName: item.name,
      family: item.family,
      rarity: item.rarity,
      inventoryType: InventoryItemType.MATERIAL,
      isSellable: true,
      npcSaleGold: getItemNpcSaleGold({
        tier: item.tier,
        rarity: item.rarity,
        inventoryType: InventoryItemType.MATERIAL,
        family: item.family,
      }),
      acquisition: 'AUTO_COMBAT',
    }),
  );
  const equipmentRows = equipmentDefinitions
    .filter((item) => item.tier <= 5)
    .map(
      (item): SaleCatalogRow => ({
        tier: item.tier as LaunchTier,
        itemTier: item.tier,
        category: 'EQUIPMENT',
        itemName: item.name,
        family: item.family,
        rarity: item.rarity,
        inventoryType: InventoryItemType.EQUIPMENT,
        isSellable: true,
        npcSaleGold: getItemNpcSaleGold({
          tier: item.tier,
          rarity: item.rarity,
          inventoryType: InventoryItemType.EQUIPMENT,
          family: item.family,
          isCraftable: item.isCraftable,
        }),
        acquisition: 'CRAFTING',
      }),
    );
  const reinforcementRows = LAUNCH_TIERS.map(
    (tier): SaleCatalogRow => ({
      tier,
      itemTier: tier,
      category: 'REINFORCEMENT_MATERIAL',
      itemName: EQUIPMENT_REINFORCEMENT_CONFIG[tier].materialName,
      family: 'Material de Reforço',
      rarity: getItemRarityByTier(tier),
      inventoryType: InventoryItemType.MATERIAL,
      isSellable: false,
      npcSaleGold: 0,
      acquisition: 'INCURSION',
    }),
  );
  const cocoonRows = PET_DEFINITIONS.filter((pet) => pet.tier <= 5).map(
    (pet): SaleCatalogRow => ({
      tier: pet.tier,
      itemTier: pet.tier,
      category: 'PET_COCOON',
      itemName: pet.cocoonItemName,
      family: 'Casulo Infectado',
      rarity: pet.rarity,
      inventoryType: InventoryItemType.MATERIAL,
      isSellable: true,
      npcSaleGold: getItemNpcSaleGold({
        tier: pet.tier,
        rarity: pet.rarity,
        inventoryType: InventoryItemType.MATERIAL,
        family: 'Casulo Infectado',
      }),
      acquisition: 'WORLD_BOSS',
    }),
  );

  return [
    ...gatheringRows,
    ...mobRows,
    ...equipmentRows,
    ...reinforcementRows,
    ...cocoonRows,
  ];
}

function getActiveMobByRank(tier: LaunchTier, rank: number) {
  const mob = mobBaseDefinitions.find(
    (candidate) =>
      candidate.tier === tier && getActiveAutoCombatMobRank(candidate) === rank,
  );

  if (!mob) throw new Error(`Mob T${tier} rank ${rank} nao encontrado.`);
  return mob;
}

function getDropTableForMob(mob: ReturnType<typeof getActiveMobByRank>) {
  const table = mobDropTables.find(
    (candidate) =>
      candidate.tier === mob.tier &&
      candidate.mapName === mob.mapName &&
      candidate.subMapName === mob.subMapName &&
      candidate.orderNoSubmap === mob.orderNoSubmap,
  );

  if (!table) throw new Error(`Tabela de drops ausente para ${mob.name}.`);
  return table;
}

function buildClassAutoCombatEconomy(tier: LaunchTier, className: string) {
  const rows = ACTIVE_MOB_RANKS.map((rank) => ({
    row: buildCurrentSetAutoCombatMobRow({ tier, rank, className }),
    mob: getActiveMobByRank(tier, rank),
  }));
  const totalWeight = sum(
    rows.map(({ mob }) => getActiveAutoCombatEncounterWeight(mob)),
  );
  const weightedSecondsPerKill = sum(
    rows.map(
      ({ row, mob }) =>
        (getActiveAutoCombatEncounterWeight(mob) / totalWeight) *
        (3_600 / Math.max(0.01, row.killsPerHour)),
    ),
  );
  const killsPerHour = 3_600 / weightedSecondsPerKill;
  const weightedXpPerKill = sum(
    rows.map(
      ({ row, mob }) =>
        (getActiveAutoCombatEncounterWeight(mob) / totalWeight) *
        (row.effectiveXpPerHour / Math.max(0.01, row.killsPerHour)),
    ),
  );
  const weightedPotionsPer100 = sum(
    rows.map(
      ({ row, mob }) =>
        (getActiveAutoCombatEncounterWeight(mob) / totalWeight) *
        row.potionsPer100Kills,
    ),
  );
  const weightedMaxHp = sum(
    rows.map(
      ({ row, mob }) =>
        (getActiveAutoCombatEncounterWeight(mob) / totalWeight) * row.hp,
    ),
  );
  const weightedPotionHealAmount = sum(
    rows.map(
      ({ row, mob }) =>
        (getActiveAutoCombatEncounterWeight(mob) / totalWeight) *
        row.potionHealAmount,
    ),
  );
  const potionPrice = rows[0]?.row.potionBuyPrice ?? 0;
  const potionGoldPerHour =
    killsPerHour * (weightedPotionsPer100 / 100) * potionPrice;
  const dropUnitsPerHourByItem: Record<string, number> = {};

  for (const { mob } of rows) {
    const share = getActiveAutoCombatEncounterWeight(mob) / totalWeight;
    const table = getDropTableForMob(mob);

    for (const drop of table.drops) {
      const expectedUnits =
        (drop.dropChance / 100) * ((drop.minQuantity + drop.maxQuantity) / 2);
      dropUnitsPerHourByItem[drop.itemName] =
        (dropUnitsPerHourByItem[drop.itemName] ?? 0) +
        killsPerHour * share * expectedUnits;
    }
  }

  const defeatChancePercent = sum(
    rows.map(
      ({ row, mob }) =>
        (getActiveAutoCombatEncounterWeight(mob) / totalWeight) *
        (row.survives100Kills ? 0 : 100),
    ),
  );

  return {
    className,
    killsPerHour: round(killsPerHour, 4),
    characterXpPerHour: round(killsPerHour * weightedXpPerKill, 4),
    potionGoldPerHour: round(potionGoldPerHour, 4),
    maxHp: round(weightedMaxHp, 4),
    potionHealAmount: round(weightedPotionHealAmount, 4),
    defeatChancePercent: round(defeatChancePercent, 4),
    dropUnitsPerHourByItem: Object.fromEntries(
      Object.entries(dropUnitsPerHourByItem).map(([key, value]) => [
        key,
        round(value, 6),
      ]),
    ),
  };
}

function buildAutoCombatEconomy(
  tier: LaunchTier,
  canonicalTier: ReturnType<typeof buildTierEconomyReport>['tiers'][number],
): AutoCombatEconomy {
  const classes = classDefinitions.map((definition) =>
    buildClassAutoCombatEconomy(tier, definition.name),
  );
  const scenario = canonicalTier.autoCombat.current;
  const firstPotion = scenario.classes[0]?.positions[0];
  const characterXpPerHour = average(
    classes.map((entry) => entry.characterXpPerHour),
  );
  const defeatChancePercent = average(
    classes.map((entry) => entry.defeatChancePercent),
  );
  const dropUnitsPerHour = average(
    classes.map((entry) => sum(Object.values(entry.dropUnitsPerHourByItem))),
  );

  return {
    summary: {
      tier,
      activity: 'AUTO_COMBAT',
      mode: 'SET_ATUAL_MIX_6_MOBS',
      directGoldGrossPerHour: 0,
      itemNpcValuePerHour: scenario.averageGrossGoldPerHour,
      grossGoldEquivalentPerHour: scenario.averageGrossGoldPerHour,
      directGoldCostPerHour: scenario.averagePotionGoldPerHour,
      inputOpportunityCostPerHour: 0,
      netGoldEquivalentPerHour: scenario.averageNetGoldPerHour,
      characterXpPerHour: round(characterXpPerHour),
      skillXpPerHour: 0,
      defeatChancePercent: round(defeatChancePercent),
      expectedUnitsPerHour: round(dropUnitsPerHour),
      availability: 'CONTINUOUS',
      note: 'Gold equivalente pressupoe venda integral dos drops ao Mercado Negro; o combate entrega itens, nao Gold direto.',
    },
    killsPerHour: scenario.averageKillsPerHour,
    characterXpPerHour: round(characterXpPerHour),
    potionName: firstPotion?.potionName ?? 'N/D',
    potionBuyPrice: firstPotion?.potionBuyPrice ?? 0,
    potionsPer100Kills: scenario.averagePotionsPer100Kills,
    potionGoldPerHour: scenario.averagePotionGoldPerHour,
    averageMaxHp: round(average(classes.map((entry) => entry.maxHp)), 4),
    averagePotionHealAmount: round(
      average(classes.map((entry) => entry.potionHealAmount)),
      4,
    ),
    dropNpcValuePerHour: scenario.averageGrossGoldPerHour,
    netGoldEquivalentPerHour: scenario.averageNetGoldPerHour,
    defeatChancePercent: round(defeatChancePercent),
    classes,
  };
}

function buildGatheringVariants(
  tier: LaunchTier,
  saleCatalog: SaleCatalogRow[],
): GatheringVariant[] {
  const materials = saleCatalog.filter(
    (item) => item.tier === tier && item.category === 'GATHERING_MATERIAL',
  );
  const unitNpcSaleGold = materials[0]?.npcSaleGold ?? 0;
  const entryLevel = (tier - 1) * 5 + 1;
  const masteryLevel = tier * 5;
  const xpPerUnit = getGatheringXpPerUnitForTier(tier);
  const variants = [
    { mode: 'ENTRY' as const, skillLevel: entryLevel, affinity: false },
    { mode: 'MASTERY' as const, skillLevel: masteryLevel, affinity: false },
    {
      mode: 'MASTERY_AFFINITY' as const,
      skillLevel: masteryLevel,
      affinity: true,
    },
  ];

  return variants.map((variant) => {
    const unitsPerHour =
      (GATHERING_RATE_BY_TIER[tier] ?? 1) *
      getGatheringRateMultiplier(variant.skillLevel) *
      (variant.affinity ? GATHERING_AFFINITY_PRODUCTION_MULTIPLIER : 1);
    const skillXpPerHour =
      unitsPerHour *
      xpPerUnit *
      (variant.affinity ? GATHERING_AFFINITY_XP_MULTIPLIER : 1);
    const itemNpcValuePerHour = unitsPerHour * unitNpcSaleGold;

    return {
      tier,
      mode: variant.mode,
      skillLevel: variant.skillLevel,
      hasClassAffinity: variant.affinity,
      materialCount: materials.length,
      unitNpcSaleGold,
      unitsPerHour: round(unitsPerHour),
      itemNpcValuePerHour: round(itemNpcValuePerHour),
      skillXpPerHour: round(skillXpPerHour),
      summary: {
        tier,
        activity: 'GATHERING',
        mode: variant.mode,
        directGoldGrossPerHour: 0,
        itemNpcValuePerHour: round(itemNpcValuePerHour),
        grossGoldEquivalentPerHour: round(itemNpcValuePerHour),
        directGoldCostPerHour: 0,
        inputOpportunityCostPerHour: 0,
        netGoldEquivalentPerHour: round(itemNpcValuePerHour),
        characterXpPerHour: 0,
        skillXpPerHour: round(skillXpPerHour),
        defeatChancePercent: 0,
        expectedUnitsPerHour: round(unitsPerHour),
        availability: 'CONTINUOUS',
        note: 'XP e de proficiencia de gathering. Gold equivalente exige vender todos os materiais; nao ha Gold direto.',
      },
    };
  });
}

function getGatheringRateForRecipe(params: {
  tier: LaunchTier;
  className: string;
  origin: MaterialOrigin;
}) {
  const classAffinities =
    CLASS_GATHERING_AFFINITIES[normalize(params.className)] ?? [];
  const hasAffinity = classAffinities.includes(params.origin);
  const skillLevel = params.tier * 5;

  return (
    (GATHERING_RATE_BY_TIER[params.tier] ?? 1) *
    getGatheringRateMultiplier(skillLevel) *
    (hasAffinity ? GATHERING_AFFINITY_PRODUCTION_MULTIPLIER : 1)
  );
}

function buildCraftingEconomy(params: {
  tier: LaunchTier;
  autoCombat: AutoCombatEconomy;
  saleCatalog: SaleCatalogRow[];
}): CraftingEconomy {
  const valueByItemName = new Map(
    params.saleCatalog.map((item) => [item.itemName, item.npcSaleGold]),
  );
  const equipmentByName = new Map(
    equipmentDefinitions.map((item) => [item.name, item]),
  );
  const autoByClass = new Map(
    params.autoCombat.classes.map((entry) => [entry.className, entry]),
  );
  const recipes = recipeDefinitions
    .filter((recipe) => recipe.tier === params.tier)
    .map((recipe): CraftingRecipeEconomy => {
      const output = equipmentByName.get(recipe.outputItemName);

      if (!output) {
        throw new Error(
          `Equipamento de receita ausente: ${recipe.outputItemName}.`,
        );
      }

      const autoClass = autoByClass.get(output.className);

      if (!autoClass) {
        throw new Error(`Autocombate ausente para ${output.className}.`);
      }

      let gatheringHours = 0;
      let gatheringInputQuantity = 0;
      let mobInputQuantity = 0;
      const ingredients = recipe.ingredients.map((ingredient) => {
        const unitNpcSaleGold = valueByItemName.get(ingredient.itemName) ?? 0;
        const isMobDrop = ingredient.origin === MaterialOrigin.DROP_MOBS;
        const expectedUnitsPerHour = isMobDrop
          ? (autoClass.dropUnitsPerHourByItem[ingredient.itemName] ?? 0)
          : getGatheringRateForRecipe({
              tier: params.tier,
              className: output.className,
              origin: ingredient.origin,
            });
        const expectedHours =
          expectedUnitsPerHour > 0
            ? ingredient.quantity / expectedUnitsPerHour
            : Number.POSITIVE_INFINITY;

        if (isMobDrop) {
          mobInputQuantity += ingredient.quantity;
        } else {
          gatheringInputQuantity += ingredient.quantity;
          gatheringHours += expectedHours;
        }

        return {
          itemName: ingredient.itemName,
          origin: ingredient.origin,
          quantity: ingredient.quantity,
          unitNpcSaleGold,
          expectedUnitsPerHour: round(expectedUnitsPerHour, 6),
          expectedHours: round(expectedHours, 6),
        };
      });
      const dropIngredients = ingredients.filter(
        (ingredient) => ingredient.origin === MaterialOrigin.DROP_MOBS,
      );
      const autoCombatDropHours = Math.max(
        0,
        ...dropIngredients.map((ingredient) => ingredient.expectedHours),
      );
      const inputNpcOpportunityGold = sum(
        ingredients.map(
          (ingredient) => ingredient.quantity * ingredient.unitNpcSaleGold,
        ),
      );
      const outputNpcSaleGold = valueByItemName.get(recipe.outputItemName) ?? 0;
      const craftingSeconds = getCraftingDurationSecondsForTier(params.tier);
      const craftingHours = craftingSeconds / 3_600;
      const stationCraftsPerHour = 3_600 / craftingSeconds;
      const selfSupplyHours =
        gatheringHours + autoCombatDropHours + craftingHours;
      const selfSupplyPotionGold =
        autoCombatDropHours * autoClass.potionGoldPerHour;

      return {
        tier: params.tier,
        className: output.className,
        slot: output.slot,
        outputItemName: output.name,
        outputNpcSaleGold,
        gatheringInputQuantity,
        mobInputQuantity,
        inputNpcOpportunityGold: round(inputNpcOpportunityGold),
        craftingSeconds,
        craftingSkillXp: getCraftingXpRewardForTier(params.tier),
        stationCraftsPerHour: round(stationCraftsPerHour),
        stationOutputNpcValuePerHour: round(
          stationCraftsPerHour * outputNpcSaleGold,
        ),
        stationInputOpportunityGoldPerHour: round(
          stationCraftsPerHour * inputNpcOpportunityGold,
        ),
        stationNetEconomicValuePerHour: round(
          stationCraftsPerHour * (outputNpcSaleGold - inputNpcOpportunityGold),
        ),
        gatheringHours: round(gatheringHours, 4),
        autoCombatDropHours: round(autoCombatDropHours, 4),
        craftingHours: round(craftingHours, 4),
        selfSupplyHours: round(selfSupplyHours, 4),
        selfSupplyPotionGold: round(selfSupplyPotionGold),
        selfSupplyOutputNpcValuePerHour: round(
          outputNpcSaleGold / selfSupplyHours,
        ),
        selfSupplyNetGoldPerHour: round(
          (outputNpcSaleGold - selfSupplyPotionGold) / selfSupplyHours,
        ),
        selfSupplyRelativeToSellingInputsPerHour: round(
          (outputNpcSaleGold - inputNpcOpportunityGold - selfSupplyPotionGold) /
            selfSupplyHours,
        ),
        ingredients,
      };
    });
  const sets = classDefinitions.map((classDefinition): CraftingSetEconomy => {
    const classRecipes = recipes.filter(
      (recipe) => recipe.className === classDefinition.name,
    );
    const selectedRecipes = EQUIPMENT_SET_SLOTS.map((slot) => {
      const candidates = classRecipes
        .filter((recipe) => recipe.slot === slot)
        .sort(
          (left, right) =>
            left.selfSupplyHours - right.selfSupplyHours ||
            left.outputItemName.localeCompare(right.outputItemName, 'pt-BR'),
        );
      const selected = candidates[0];

      if (!selected) {
        throw new Error(
          `Receita ${slot} ausente para ${classDefinition.name} T${params.tier}.`,
        );
      }

      return selected;
    });
    const ingredientTotals = new Map<
      string,
      CraftingRecipeEconomy['ingredients'][number]
    >();

    for (const recipe of selectedRecipes) {
      for (const ingredient of recipe.ingredients) {
        const current = ingredientTotals.get(ingredient.itemName);
        ingredientTotals.set(ingredient.itemName, {
          ...ingredient,
          quantity: (current?.quantity ?? 0) + ingredient.quantity,
        });
      }
    }

    const aggregateIngredients = [...ingredientTotals.values()];
    const gatheringHours = sum(
      aggregateIngredients
        .filter((ingredient) => ingredient.origin !== MaterialOrigin.DROP_MOBS)
        .map(
          (ingredient) => ingredient.quantity / ingredient.expectedUnitsPerHour,
        ),
    );
    const autoCombatDropHours = Math.max(
      0,
      ...aggregateIngredients
        .filter((ingredient) => ingredient.origin === MaterialOrigin.DROP_MOBS)
        .map(
          (ingredient) => ingredient.quantity / ingredient.expectedUnitsPerHour,
        ),
    );
    const craftingHours = sum(
      selectedRecipes.map((recipe) => recipe.craftingHours),
    );
    const autoClass = autoByClass.get(classDefinition.name);
    const reinforcement = getFullSetReinforcementCost(params.tier);

    return {
      tier: params.tier,
      className: classDefinition.name,
      selectedItems: selectedRecipes.map((recipe) => recipe.outputItemName),
      outputNpcSaleGold: round(
        sum(selectedRecipes.map((recipe) => recipe.outputNpcSaleGold)),
      ),
      inputNpcOpportunityGold: round(
        sum(
          aggregateIngredients.map(
            (ingredient) => ingredient.quantity * ingredient.unitNpcSaleGold,
          ),
        ),
      ),
      gatheringHours: round(gatheringHours, 4),
      autoCombatDropHours: round(autoCombatDropHours, 4),
      craftingHours: round(craftingHours, 4),
      selfSupplyHours: round(
        gatheringHours + autoCombatDropHours + craftingHours,
        4,
      ),
      potionGold: round(
        autoCombatDropHours * (autoClass?.potionGoldPerHour ?? 0),
      ),
      requiredReinforcementFragmentsToPlus3: reinforcement.fragments,
    };
  });
  const stationOutput = average(
    recipes.map((recipe) => recipe.stationOutputNpcValuePerHour),
  );
  const stationInput = average(
    recipes.map((recipe) => recipe.stationInputOpportunityGoldPerHour),
  );
  const stationXp = average(
    recipes.map(
      (recipe) => recipe.stationCraftsPerHour * recipe.craftingSkillXp,
    ),
  );
  const selfSupplyOutput = average(
    recipes.map((recipe) => recipe.selfSupplyOutputNpcValuePerHour),
  );
  const selfSupplyPotion = average(
    recipes.map(
      (recipe) => recipe.selfSupplyPotionGold / recipe.selfSupplyHours,
    ),
  );
  const selfSupplyXp = average(
    recipes.map((recipe) => recipe.craftingSkillXp / recipe.selfSupplyHours),
  );

  return {
    recipes,
    sets,
    stationSummary: {
      tier: params.tier,
      activity: 'CRAFTING',
      mode: 'BANCADA_COM_INGREDIENTES_PRONTOS',
      directGoldGrossPerHour: 0,
      itemNpcValuePerHour: round(stationOutput),
      grossGoldEquivalentPerHour: round(stationOutput),
      directGoldCostPerHour: 0,
      inputOpportunityCostPerHour: round(stationInput),
      netGoldEquivalentPerHour: round(stationOutput - stationInput),
      characterXpPerHour: 0,
      skillXpPerHour: round(stationXp),
      defeatChancePercent: 0,
      expectedUnitsPerHour: round(
        average(recipes.map((recipe) => recipe.stationCraftsPerHour)),
      ),
      availability: 'CONTINUOUS',
      note: 'Liquido economico da bancada compara a venda do equipamento com a venda direta dos ingredientes consumidos.',
    },
    selfSupplySummary: {
      tier: params.tier,
      activity: 'CRAFTING',
      mode: 'CICLO_AUTOSSUFICIENTE_E_VENDA_NPC',
      directGoldGrossPerHour: 0,
      itemNpcValuePerHour: round(selfSupplyOutput),
      grossGoldEquivalentPerHour: round(selfSupplyOutput),
      directGoldCostPerHour: round(selfSupplyPotion),
      inputOpportunityCostPerHour: 0,
      netGoldEquivalentPerHour: round(selfSupplyOutput - selfSupplyPotion),
      characterXpPerHour: 0,
      skillXpPerHour: round(selfSupplyXp),
      defeatChancePercent: params.autoCombat.defeatChancePercent,
      expectedUnitsPerHour: round(
        average(recipes.map((recipe) => 1 / recipe.selfSupplyHours)),
      ),
      availability: 'CONTINUOUS',
      note: 'Inclui coleta, farm simultaneo dos drops limitantes, pocao e tempo de criacao; nao trata o preco livre do mercado de jogadores como valor canonico.',
    },
  };
}

function buildIncursionEconomy(
  tier: LaunchTier,
  saleCatalog: SaleCatalogRow[],
  autoCombat: AutoCombatEconomy,
): IncursionEconomy[] {
  const valueByItemName = new Map(
    saleCatalog.map((item) => [item.itemName, item.npcSaleGold]),
  );

  return incursionDefinitions
    .filter((incursion) => incursion.tier === tier)
    .flatMap((incursion) =>
      INCURSION_APPROACHES.map((approach): IncursionEconomy => {
        const risk = getIncursionRiskProfile(incursion.riskLevel, approach);
        const successRatio = risk.successChance / 100;
        const durationHours =
          (incursion.durationSeconds * risk.durationMultiplier) / 3_600;
        let lootGold = 0;
        let characterXp = 0;
        let itemNpcValue = 0;
        let tokens = 0;
        let reinforcementFragments = 0;

        for (const reward of incursion.lootTable) {
          const rollChance = reward.guaranteed ? 1 : reward.chance / 100;
          const expectedQuantity =
            successRatio *
            rollChance *
            averageRoundedRange(
              reward.minQuantity,
              reward.maxQuantity,
              risk.rewardMultiplier,
            );

          if (reward.rewardType === IncursionRewardType.GOLD) {
            lootGold += expectedQuantity;
          } else if (reward.rewardType === IncursionRewardType.XP) {
            characterXp += expectedQuantity;
          } else if (reward.rewardType === IncursionRewardType.CURRENCY) {
            tokens += expectedQuantity;
          } else if (reward.rewardType === IncursionRewardType.MATERIAL) {
            const itemName = reward.itemName ?? '';
            if (itemName === getIncursionTokenItemByTier(tier).name) {
              tokens += expectedQuantity;
            } else {
              reinforcementFragments += expectedQuantity;
              itemNpcValue +=
                expectedQuantity * (valueByItemName.get(itemName) ?? 0);
            }
          } else if (reward.itemName) {
            itemNpcValue +=
              expectedQuantity * (valueByItemName.get(reward.itemName) ?? 0);
          }
        }

        const successEntryRefundGold = calculateIncursionSuccessEntryRefund(
          incursion.goldCost,
        );
        const failureEntryRefundGold = calculateIncursionFailureEntryRefund(
          incursion.goldCost,
        );
        const entryRefundGold =
          successRatio * successEntryRefundGold +
          (1 - successRatio) * failureEntryRefundGold;
        const directGold = lootGold + entryRefundGold;
        const expectedWalletNetGold =
          directGold + itemNpcValue - incursion.goldCost;
        const expectedFailureHpLoss =
          autoCombat.averageMaxHp * (1 - successRatio) * risk.failureHpRatio;
        const expectedRecoveryPotionGold =
          autoCombat.averagePotionHealAmount > 0
            ? (expectedFailureHpLoss / autoCombat.averagePotionHealAmount) *
              autoCombat.potionBuyPrice
            : 0;
        const expectedNetGold =
          expectedWalletNetGold - expectedRecoveryPotionGold;
        const attemptsPerHour = 1 / durationHours;
        const expectedFailureHpLossPercentPerAttempt =
          (1 - successRatio) * risk.failureHpRatio * 100;

        return {
          tier,
          name: incursion.name,
          approach,
          durationMinutes: round(durationHours * 60),
          attemptsPerHour: round(attemptsPerHour, 4),
          successChancePercent: risk.successChance,
          failureChancePercent: 100 - risk.successChance,
          expectedFailureHpLossPercentPerAttempt: round(
            expectedFailureHpLossPercentPerAttempt,
          ),
          entryGold: incursion.goldCost,
          successEntryRefundGold,
          failureEntryRefundGold,
          expectedEntryRefundGoldPerAttempt: round(entryRefundGold),
          expectedLootGoldPerAttempt: round(lootGold),
          expectedDirectGoldPerAttempt: round(directGold),
          expectedItemNpcValuePerAttempt: round(itemNpcValue),
          expectedWalletNetGoldPerAttempt: round(expectedWalletNetGold),
          expectedRecoveryPotionGoldPerAttempt: round(
            expectedRecoveryPotionGold,
          ),
          expectedNetGoldPerAttempt: round(expectedNetGold),
          expectedCharacterXpPerAttempt: round(characterXp),
          expectedIncursionTokensPerAttempt: round(tokens),
          expectedReinforcementFragmentsPerAttempt: round(
            reinforcementFragments,
          ),
          summary: {
            tier,
            activity: 'INCURSION',
            mode: `${incursion.name}:${approach}`,
            directGoldGrossPerHour: round(directGold * attemptsPerHour),
            itemNpcValuePerHour: round(itemNpcValue * attemptsPerHour),
            grossGoldEquivalentPerHour: round(
              (directGold + itemNpcValue) * attemptsPerHour,
            ),
            directGoldCostPerHour: round(
              (incursion.goldCost + expectedRecoveryPotionGold) *
                attemptsPerHour,
            ),
            inputOpportunityCostPerHour: 0,
            netGoldEquivalentPerHour: round(expectedNetGold * attemptsPerHour),
            characterXpPerHour: round(characterXp * attemptsPerHour),
            skillXpPerHour: 0,
            defeatChancePercent: 100 - risk.successChance,
            expectedUnitsPerHour: round(
              (tokens + reinforcementFragments) * attemptsPerHour,
            ),
            availability: 'CONTINUOUS',
            note: 'Sucesso devolve 100% da entrada e falha devolve 90%; o retorno liquido desconta o custo proporcional da pocao canonica para recuperar o HP esperado da falha.',
          },
        };
      }),
    );
}

function averageFlooredRange(min: number, max: number, multiplier = 1) {
  const safeMin = Math.max(0, Math.floor(min));
  const safeMax = Math.max(safeMin, Math.floor(max));
  return average(
    Array.from({ length: safeMax - safeMin + 1 }, (_, index) =>
      Math.max(0, Math.floor((safeMin + index) * multiplier)),
    ),
  );
}

function buildWorldBossEconomy(params: {
  tier: LaunchTier;
  calibration: WorldBossSimulationCalibration;
  saleCatalog: SaleCatalogRow[];
}): WorldBossEconomy[] {
  const cocoonNpcValue =
    params.saleCatalog.find(
      (item) => item.tier === params.tier && item.category === 'PET_COCOON',
    )?.npcSaleGold ?? 0;

  return worldBossDefinitions
    .filter((boss) => boss.tier === params.tier)
    .map((boss): WorldBossEconomy => {
      const slotIndex = (boss.sortOrder ?? 0) % 10;
      const slot = params.calibration.slots.find(
        (candidate) => candidate.index === slotIndex,
      );
      const scheduleSlot = WORLD_BOSS_SCHEDULE_CONFIG.slots.find(
        (candidate) => candidate.index === slotIndex,
      );

      if (!slot || !scheduleSlot) {
        throw new Error(`Slot de Ameaca Global ausente para ${boss.name}.`);
      }

      const activationRatio = slot.activationChancePercent.value / 100;
      const defeatRatio = slot.defeatChancePercent.value / 100;
      const defeatedDurationHours =
        average([
          slot.defeatedDurationMinutes.value.min,
          slot.defeatedDurationMinutes.value.max,
        ]) / 60;
      const fullDurationHours = boss.durationSeconds / 3_600;
      const expectedParticipationHours =
        defeatRatio * defeatedDurationHours +
        (1 - defeatRatio) * fullDurationHours;
      const expectedEventDurationHours =
        activationRatio * defeatRatio * defeatedDurationHours +
        (1 - activationRatio * defeatRatio) * fullDurationHours;
      const expectedCycleHours =
        expectedEventDurationHours + scheduleSlot.respawnSeconds / 3_600;
      const expiredProgressRatio =
        average([
          slot.expiredProgressPercent.value.min,
          slot.expiredProgressPercent.value.max,
        ]) / 100;
      const expiredMultiplier = getWorldBossCollectiveRewardMultiplier({
        defeated: false,
        progressRatio: expiredProgressRatio,
      });
      let expectedGold = 0;
      let expectedXp = 0;
      let expectedFragments = 0;
      let expectedCocoons = 0;

      for (const reward of boss.lootTable) {
        if (reward.rewardType === WorldBossRewardType.GOLD) {
          expectedGold +=
            defeatRatio *
              averageFlooredRange(reward.minQuantity, reward.maxQuantity, 1) +
            (1 - defeatRatio) *
              averageFlooredRange(
                reward.minQuantity,
                reward.maxQuantity,
                expiredMultiplier,
              );
        } else if (reward.rewardType === WorldBossRewardType.XP) {
          expectedXp +=
            defeatRatio *
              averageFlooredRange(reward.minQuantity, reward.maxQuantity, 1) +
            (1 - defeatRatio) *
              averageFlooredRange(
                reward.minQuantity,
                reward.maxQuantity,
                expiredMultiplier,
              );
        } else if (isWorldBossFragmentReward(reward)) {
          expectedFragments += average([
            reward.minQuantity,
            reward.maxQuantity,
          ]);
        } else if (reward.rewardType === WorldBossRewardType.PET_EGG) {
          expectedCocoons +=
            defeatRatio *
            (reward.chance / 100) *
            average([reward.minQuantity, reward.maxQuantity]);
        }
      }

      const expectedItemNpcValue = expectedCocoons * cocoonNpcValue;
      const participationGross = expectedGold + expectedItemNpcValue;
      const calendarFactor = activationRatio / expectedCycleHours;

      return {
        tier: params.tier,
        name: boss.name,
        slot: slot.key,
        activationChancePercent: slot.activationChancePercent.value,
        activationSource: slot.activationChancePercent.source,
        bossDefeatChancePercent: slot.defeatChancePercent.value,
        defeatSource: slot.defeatChancePercent.source,
        objectiveFailureChancePercent: round(
          100 - slot.defeatChancePercent.value,
        ),
        playerDefeatChancePercent: 0,
        expectedCycleHours: round(expectedCycleHours, 4),
        expectedParticipationHours: round(expectedParticipationHours, 4),
        expectedGoldPerActivatedEvent: round(expectedGold),
        expectedCharacterXpPerActivatedEvent: round(expectedXp),
        expectedItemNpcValuePerActivatedEvent: round(expectedItemNpcValue),
        expectedFragmentsPerActivatedEvent: round(expectedFragments),
        expectedCocoonsPerActivatedEvent: round(expectedCocoons, 6),
        participationSummary: {
          tier: params.tier,
          activity: 'WORLD_BOSS',
          mode: `${boss.name}:TEMPO_PARTICIPANDO`,
          directGoldGrossPerHour: round(
            expectedGold / expectedParticipationHours,
          ),
          itemNpcValuePerHour: round(
            expectedItemNpcValue / expectedParticipationHours,
          ),
          grossGoldEquivalentPerHour: round(
            participationGross / expectedParticipationHours,
          ),
          directGoldCostPerHour: 0,
          inputOpportunityCostPerHour: 0,
          netGoldEquivalentPerHour: round(
            participationGross / expectedParticipationHours,
          ),
          characterXpPerHour: round(expectedXp / expectedParticipationHours),
          skillXpPerHour: 0,
          defeatChancePercent: round(100 - slot.defeatChancePercent.value),
          expectedUnitsPerHour: round(
            (expectedFragments + expectedCocoons) / expectedParticipationHours,
          ),
          availability: 'SCHEDULED',
          note: 'Derrota aqui significa o chefe nao ser abatido. O backend atual nao aplica dano nem derrota ao personagem nesta atividade.',
        },
        calendarSummary: {
          tier: params.tier,
          activity: 'WORLD_BOSS',
          mode: `${boss.name}:CALENDARIO_E_RESPAWN`,
          directGoldGrossPerHour: round(expectedGold * calendarFactor),
          itemNpcValuePerHour: round(expectedItemNpcValue * calendarFactor),
          grossGoldEquivalentPerHour: round(
            participationGross * calendarFactor,
          ),
          directGoldCostPerHour: 0,
          inputOpportunityCostPerHour: 0,
          netGoldEquivalentPerHour: round(participationGross * calendarFactor),
          characterXpPerHour: round(expectedXp * calendarFactor),
          skillXpPerHour: 0,
          defeatChancePercent: round(100 - slot.defeatChancePercent.value),
          expectedUnitsPerHour: round(
            (expectedFragments + expectedCocoons) * calendarFactor,
          ),
          availability: 'SCHEDULED',
          note: 'Normalizado pelo ciclo evento mais respawn e pela chance observada/configurada de ativacao; nao representa uma atividade farmavel continuamente.',
        },
      };
    });
}

function getRecurringFactorPerDay(type: MissionType) {
  if (type === MissionType.DAILY) return 1;
  if (type === MissionType.WEEKLY) return 1 / 7;
  return 0;
}

function buildMissionEconomy(params: {
  tier: LaunchTier;
  autoCombat: AutoCombatEconomy;
  gathering: GatheringVariant[];
  crafting: CraftingEconomy;
  incursions: IncursionEconomy[];
}) {
  const gathering = params.gathering.find(
    (entry) => entry.mode === 'MASTERY_AFFINITY',
  );
  const balancedIncursion = params.incursions
    .filter((entry) => entry.approach === 'BALANCED')
    .sort(
      (left, right) =>
        left.durationMinutes - right.durationMinutes ||
        left.entryGold - right.entryGold,
    )[0];

  if (!gathering || !balancedIncursion) {
    throw new Error(`Base de missoes incompleta no T${params.tier}.`);
  }

  const missions = missionDefinitions.map((mission): MissionEconomy => {
    const missionReward = getMissionReward({
      missionKey: mission.key,
      tier: params.tier,
      baseGold: mission.rewardGold,
      baseXp: mission.rewardXp,
    });
    let dedicatedHours = 0;
    let expectedAttempts = 1;
    let directGoldCost = 0;
    let inputOpportunityCost = 0;
    let underlyingDirectGold = 0;
    let underlyingItemNpcValue = 0;
    let underlyingCharacterXp = 0;
    let underlyingSkillXp = 0;
    let defeatChancePercent = 0;

    if (mission.objectiveType === 'GATHER_UNITS') {
      dedicatedHours = mission.targetValue / gathering.unitsPerHour;
      underlyingItemNpcValue = mission.targetValue * gathering.unitNpcSaleGold;
      underlyingSkillXp =
        mission.targetValue *
        getGatheringXpPerUnitForTier(params.tier) *
        GATHERING_AFFINITY_XP_MULTIPLIER;
    } else if (mission.objectiveType === 'DEFEAT_MOBS') {
      dedicatedHours = mission.targetValue / params.autoCombat.killsPerHour;
      directGoldCost = params.autoCombat.potionGoldPerHour * dedicatedHours;
      underlyingItemNpcValue =
        params.autoCombat.dropNpcValuePerHour * dedicatedHours;
      underlyingCharacterXp =
        params.autoCombat.characterXpPerHour * dedicatedHours;
      defeatChancePercent = params.autoCombat.defeatChancePercent;
    } else if (mission.objectiveType === 'CRAFT_ITEMS') {
      const cheapestRecipesByClass = Array.from(
        new Set(params.crafting.recipes.map((recipe) => recipe.className)),
      ).map(
        (className) =>
          params.crafting.recipes
            .filter((recipe) => recipe.className === className)
            .sort(
              (left, right) =>
                left.inputNpcOpportunityGold +
                  left.selfSupplyPotionGold -
                  left.outputNpcSaleGold -
                  (right.inputNpcOpportunityGold +
                    right.selfSupplyPotionGold -
                    right.outputNpcSaleGold) ||
                left.selfSupplyHours - right.selfSupplyHours,
            )[0],
      );
      const cheapestEligibleRecipe = {
        selfSupplyHours: average(
          cheapestRecipesByClass.map((recipe) => recipe.selfSupplyHours),
        ),
        potionGold: average(
          cheapestRecipesByClass.map((recipe) => recipe.selfSupplyPotionGold),
        ),
        inputValue: average(
          cheapestRecipesByClass.map(
            (recipe) => recipe.inputNpcOpportunityGold,
          ),
        ),
        outputValue: average(
          cheapestRecipesByClass.map((recipe) => recipe.outputNpcSaleGold),
        ),
        skillXp: average(
          cheapestRecipesByClass.map((recipe) => recipe.craftingSkillXp),
        ),
      };
      dedicatedHours =
        cheapestEligibleRecipe.selfSupplyHours * mission.targetValue;
      directGoldCost = cheapestEligibleRecipe.potionGold * mission.targetValue;
      inputOpportunityCost =
        cheapestEligibleRecipe.inputValue * mission.targetValue;
      underlyingItemNpcValue =
        cheapestEligibleRecipe.outputValue * mission.targetValue;
      underlyingSkillXp = cheapestEligibleRecipe.skillXp * mission.targetValue;
      defeatChancePercent = params.autoCombat.defeatChancePercent;
    } else if (mission.objectiveType === 'COMPLETE_INCURSIONS') {
      const successRatio = balancedIncursion.successChancePercent / 100;
      expectedAttempts = mission.targetValue / successRatio;
      dedicatedHours =
        (balancedIncursion.durationMinutes / 60) * expectedAttempts;
      directGoldCost =
        (balancedIncursion.entryGold +
          balancedIncursion.expectedRecoveryPotionGoldPerAttempt) *
        expectedAttempts;
      underlyingDirectGold =
        (balancedIncursion.expectedDirectGoldPerAttempt / successRatio) *
        mission.targetValue;
      underlyingItemNpcValue =
        (balancedIncursion.expectedItemNpcValuePerAttempt / successRatio) *
        mission.targetValue;
      underlyingCharacterXp =
        (balancedIncursion.expectedCharacterXpPerAttempt / successRatio) *
        mission.targetValue;
      defeatChancePercent = balancedIncursion.failureChancePercent;
    } else {
      throw new Error(
        `Objetivo de missao nao auditado: ${mission.objectiveType}.`,
      );
    }

    const underlyingGoldEquivalent =
      underlyingDirectGold + underlyingItemNpcValue;
    const combinedNetGold =
      missionReward.gold +
      underlyingGoldEquivalent -
      directGoldCost -
      inputOpportunityCost;
    const recurringFactor = getRecurringFactorPerDay(mission.type);

    return {
      tier: params.tier,
      key: mission.key,
      title: mission.title,
      type: mission.type,
      objectiveType: mission.objectiveType,
      targetValue: mission.targetValue,
      dedicatedHours: round(dedicatedHours, 6),
      expectedAttempts: round(expectedAttempts, 4),
      missionGold: missionReward.gold,
      missionCharacterXp: missionReward.xp,
      objectiveDirectGoldCost: round(directGoldCost),
      objectiveInputOpportunityCost: round(inputOpportunityCost),
      underlyingDirectGold: round(underlyingDirectGold),
      underlyingItemNpcValue: round(underlyingItemNpcValue),
      underlyingGoldEquivalent: round(underlyingGoldEquivalent),
      underlyingCharacterXp: round(underlyingCharacterXp),
      underlyingSkillXp: round(underlyingSkillXp),
      missionRewardGoldPerDedicatedHour: round(
        missionReward.gold / Math.max(0.000001, dedicatedHours),
      ),
      combinedNetGoldEquivalentPerDedicatedHour: round(
        combinedNetGold / Math.max(0.000001, dedicatedHours),
      ),
      defeatChancePercentPerAttempt: round(defeatChancePercent),
      recurringGoldPerDay: round(missionReward.gold * recurringFactor),
    };
  });
  const recurringMissions = missions.filter(
    (mission) => getRecurringFactorPerDay(mission.type) > 0,
  );
  const recurringHoursPerDay = sum(
    recurringMissions.map(
      (mission) =>
        mission.dedicatedHours * getRecurringFactorPerDay(mission.type),
    ),
  );
  const recurringMissionGoldPerDay = sum(
    recurringMissions.map((mission) => mission.recurringGoldPerDay),
  );
  const recurringUnderlyingDirectGoldPerDay = sum(
    recurringMissions.map(
      (mission) =>
        mission.underlyingDirectGold * getRecurringFactorPerDay(mission.type),
    ),
  );
  const recurringUnderlyingItemValuePerDay = sum(
    recurringMissions.map(
      (mission) =>
        mission.underlyingItemNpcValue * getRecurringFactorPerDay(mission.type),
    ),
  );
  const recurringDirectCostPerDay = sum(
    recurringMissions.map(
      (mission) =>
        mission.objectiveDirectGoldCost *
        getRecurringFactorPerDay(mission.type),
    ),
  );
  const recurringOpportunityCostPerDay = sum(
    recurringMissions.map(
      (mission) =>
        mission.objectiveInputOpportunityCost *
        getRecurringFactorPerDay(mission.type),
    ),
  );
  const recurringCharacterXpPerDay = sum(
    recurringMissions.map(
      (mission) =>
        (mission.missionCharacterXp + mission.underlyingCharacterXp) *
        getRecurringFactorPerDay(mission.type),
    ),
  );
  const recurringSkillXpPerDay = sum(
    recurringMissions.map(
      (mission) =>
        mission.underlyingSkillXp * getRecurringFactorPerDay(mission.type),
    ),
  );

  return {
    missions,
    recurringGoldPerDay: round(recurringMissionGoldPerDay),
    recurringHoursPerDay: round(recurringHoursPerDay, 6),
    summary: {
      tier: params.tier,
      activity: 'MISSIONS' as const,
      mode: 'RECORRENTES_COM_OBJETIVOS_DEDICADOS',
      directGoldGrossPerHour: round(
        (recurringMissionGoldPerDay + recurringUnderlyingDirectGoldPerDay) /
          recurringHoursPerDay,
      ),
      itemNpcValuePerHour: round(
        recurringUnderlyingItemValuePerDay / recurringHoursPerDay,
      ),
      grossGoldEquivalentPerHour: round(
        (recurringMissionGoldPerDay +
          recurringUnderlyingDirectGoldPerDay +
          recurringUnderlyingItemValuePerDay) /
          recurringHoursPerDay,
      ),
      directGoldCostPerHour: round(
        recurringDirectCostPerDay / recurringHoursPerDay,
      ),
      inputOpportunityCostPerHour: round(
        recurringOpportunityCostPerDay / recurringHoursPerDay,
      ),
      netGoldEquivalentPerHour: round(
        (recurringMissionGoldPerDay +
          recurringUnderlyingDirectGoldPerDay +
          recurringUnderlyingItemValuePerDay -
          recurringDirectCostPerDay -
          recurringOpportunityCostPerDay) /
          recurringHoursPerDay,
      ),
      characterXpPerHour: round(
        recurringCharacterXpPerDay / recurringHoursPerDay,
      ),
      skillXpPerHour: round(recurringSkillXpPerDay / recurringHoursPerDay),
      defeatChancePercent: round(
        Math.max(
          ...recurringMissions.map(
            (mission) => mission.defeatChancePercentPerAttempt,
          ),
        ),
      ),
      expectedUnitsPerHour: round(
        sum(
          recurringMissions.map(
            (mission) =>
              mission.targetValue * getRecurringFactorPerDay(mission.type),
          ),
        ) / recurringHoursPerDay,
      ),
      availability: 'CAPPED' as const,
      note: 'Taxa por hora dedicada aos objetivos; recompensas continuam limitadas por reset diario/semanal e nao podem ser extrapoladas como farm continuo.',
    },
  };
}

function averageActivityRows(params: {
  tier: LaunchTier;
  activity: ActivityKey;
  mode: string;
  rows: ActivityEconomyRow[];
  aggregation?: 'AVERAGE' | 'SUM';
  note: string;
}): ActivityEconomyRow {
  const aggregate = (selector: (row: ActivityEconomyRow) => number) =>
    params.aggregation === 'SUM'
      ? sum(params.rows.map(selector))
      : average(params.rows.map(selector));

  return {
    tier: params.tier,
    activity: params.activity,
    mode: params.mode,
    directGoldGrossPerHour: round(
      aggregate((row) => row.directGoldGrossPerHour),
    ),
    itemNpcValuePerHour: round(aggregate((row) => row.itemNpcValuePerHour)),
    grossGoldEquivalentPerHour: round(
      aggregate((row) => row.grossGoldEquivalentPerHour),
    ),
    directGoldCostPerHour: round(aggregate((row) => row.directGoldCostPerHour)),
    inputOpportunityCostPerHour: round(
      aggregate((row) => row.inputOpportunityCostPerHour),
    ),
    netGoldEquivalentPerHour: round(
      aggregate((row) => row.netGoldEquivalentPerHour),
    ),
    characterXpPerHour: round(aggregate((row) => row.characterXpPerHour)),
    skillXpPerHour: round(aggregate((row) => row.skillXpPerHour)),
    defeatChancePercent: round(
      average(params.rows.map((row) => row.defeatChancePercent)),
    ),
    expectedUnitsPerHour: round(aggregate((row) => row.expectedUnitsPerHour)),
    availability: params.rows[0]?.availability ?? 'CONTINUOUS',
    note: params.note,
  };
}

function buildProgressionAcquisition(params: {
  tier: LaunchTier;
  crafting: CraftingEconomy;
  incursions: IncursionEconomy[];
  worldBosses: WorldBossEconomy[];
}): ProgressionAcquisition {
  const setHours = params.crafting.sets.map((set) => set.selfSupplyHours);
  const reinforcement = getFullSetReinforcementCost(params.tier);
  const fragmentRequirement = reinforcement.fragments;
  const reinforcementGold = reinforcement.gold;
  const balancedIncursions = params.incursions.filter(
    (incursion) => incursion.approach === 'BALANCED',
  );
  const bestIncursion = [...balancedIncursions].sort((left, right) => {
    const leftRate =
      left.expectedReinforcementFragmentsPerAttempt * left.attemptsPerHour;
    const rightRate =
      right.expectedReinforcementFragmentsPerAttempt * right.attemptsPerHour;
    return rightRate - leftRate;
  })[0];
  const bestFragmentRate = bestIncursion
    ? bestIncursion.expectedReinforcementFragmentsPerAttempt *
      bestIncursion.attemptsPerHour
    : 0;
  const pet = PET_DEFINITIONS.find(
    (definition) => definition.tier === params.tier,
  );

  if (!pet) throw new Error(`Pet canonico ausente para T${params.tier}.`);

  const petAvailability = getPetBossAvailabilityProjection(params.tier);
  if (!petAvailability) {
    throw new Error(`Projecao de disponibilidade T${params.tier} ausente.`);
  }

  // Disponibilidade individual nao pode usar a taxa global de eventos vazios:
  // quando o jogador se inscreve, ele proprio ativa a oportunidade. Gold/XP
  // global dos bosses continua usando a telemetria real em buildWorldBossEconomy.
  const hoursPerEligibleVictory =
    24 / PET_BOSS_AVAILABILITY_TARGET.eligibleVictoriesPerCalendarDay;
  const petFragmentHours =
    petAvailability.guaranteedFragmentVictories * hoursPerEligibleVictory;
  const petCocoonHours =
    (100 / petAvailability.chancePercent) * hoursPerEligibleVictory;
  const petInputHours = Math.max(petFragmentHours, petCocoonHours);

  return {
    tier: params.tier,
    equipmentSetSelfSupplyHoursAverage: round(average(setHours)),
    equipmentSetSelfSupplyHoursMinimum: round(Math.min(...setHours)),
    equipmentSetSelfSupplyHoursMaximum: round(Math.max(...setHours)),
    reinforcementGoldForFullSetPlus3: reinforcementGold,
    reinforcementFragmentsForFullSetPlus3: fragmentRequirement,
    bestBalancedIncursionForFragments: bestIncursion?.name ?? 'N/D',
    expectedIncursionHoursForReinforcementFragments: round(
      fragmentRequirement / Math.max(0.000001, bestFragmentRate),
    ),
    petName: pet.name,
    petGoldCost: pet.goldCost,
    petFragmentCost: pet.fragmentCost,
    petIncubationHours: round(pet.incubationSeconds / 3_600),
    expectedCalendarHoursForPetFragments: round(petFragmentHours),
    expectedCalendarHoursForPetCocoon: round(petCocoonHours),
    expectedCalendarHoursUntilPetInputs: round(petInputHours),
  };
}

function buildAffordability(params: {
  tier: LaunchTier;
  autoCombat: AutoCombatEconomy;
  gathering: GatheringVariant[];
  crafting: CraftingEconomy;
  incursions: IncursionEconomy[];
  worldBosses: WorldBossEconomy[];
  missionGoldPerDay: number;
  progression: ProgressionAcquisition;
  marketplaceSets: MarketplaceSetObservation[];
}) {
  const potionTarget: GoldTarget = {
    key: 'POTIONS_100',
    label: `100x ${params.autoCombat.potionName}`,
    goldCost: params.autoCombat.potionBuyPrice * 100,
    className: null,
    source: 'CANONICAL',
    additionalRequirement: null,
  };
  const reinforcementTarget: GoldTarget = {
    key: 'REINFORCEMENT_SET_PLUS_3',
    label: 'Reforcar seis pecas ate +3',
    goldCost: params.progression.reinforcementGoldForFullSetPlus3,
    className: null,
    source: 'CANONICAL',
    additionalRequirement: `${params.progression.reinforcementFragmentsForFullSetPlus3} fragmentos; ${params.progression.expectedIncursionHoursForReinforcementFragments}h esperadas de incursao balanceada.`,
  };
  const petTarget: GoldTarget = {
    key: 'PET_INCUBATION',
    label: `Incubar ${params.progression.petName}`,
    goldCost: params.progression.petGoldCost,
    className: null,
    source: 'CANONICAL',
    additionalRequirement: `1 casulo + ${params.progression.petFragmentCost} fragmentos; ${params.progression.expectedCalendarHoursUntilPetInputs === null ? 'N/D' : `${params.progression.expectedCalendarHoursUntilPetInputs}h`} de calendario estimadas no perfil de 1 vitoria elegivel/dia; ${params.progression.petIncubationHours}h de incubacao.`,
  };
  const marketTargets: GoldTarget[] = params.marketplaceSets
    .filter(
      (set) =>
        set.tier === params.tier &&
        set.complete &&
        set.cheapestCompleteSetGold !== null,
    )
    .map((set) => ({
      key: 'MARKET_SET',
      label: `Set completo anunciado para ${set.className}`,
      goldCost: set.cheapestCompleteSetGold ?? 0,
      className: set.className,
      source: 'MARKET_OBSERVATION',
      additionalRequirement: `Observacao pontual em ${set.observedAt}; preco definido por jogadores.`,
    }));
  const gathering = params.gathering.find(
    (entry) => entry.mode === 'MASTERY_AFFINITY',
  );
  const balancedIncursionNet = average(
    params.incursions
      .filter((entry) => entry.approach === 'BALANCED')
      .map((entry) => entry.summary.netGoldEquivalentPerHour),
  );
  const worldBossCalendarNet = sum(
    params.worldBosses.map(
      (entry) => entry.calendarSummary.netGoldEquivalentPerHour,
    ),
  );
  const incomeSources = [
    {
      key: 'AUTO_COMBAT_SELL_ALL',
      netGoldPerHour: params.autoCombat.netGoldEquivalentPerHour,
    },
    {
      key: 'GATHERING_AFFINITY_SELL_ALL',
      netGoldPerHour: gathering?.summary.netGoldEquivalentPerHour ?? 0,
    },
    {
      key: 'CRAFTING_SELF_SUPPLY_SELL_OUTPUT',
      netGoldPerHour:
        params.crafting.selfSupplySummary.netGoldEquivalentPerHour,
    },
    {
      key: 'INCURSION_BALANCED',
      netGoldPerHour: balancedIncursionNet,
    },
    {
      key: 'WORLD_BOSS_CALENDAR',
      netGoldPerHour: worldBossCalendarNet,
    },
    {
      key: 'MISSIONS_CALENDAR',
      netGoldPerHour: params.missionGoldPerDay / 24,
    },
  ];
  const targets = [
    potionTarget,
    reinforcementTarget,
    petTarget,
    ...marketTargets,
  ];

  return targets.flatMap((target) =>
    incomeSources.map((source): AffordabilityRow => {
      const hours =
        source.netGoldPerHour > 0
          ? target.goldCost / source.netGoldPerHour
          : null;

      return {
        tier: params.tier,
        targetKey: target.key,
        targetLabel: target.label,
        className: target.className,
        goldCost: target.goldCost,
        targetSource: target.source,
        incomeSource: source.key,
        netGoldPerHour: round(source.netGoldPerHour),
        hours: hours === null ? null : round(hours, 4),
        days: hours === null ? null : round(hours / 24, 4),
        additionalRequirement: target.additionalRequirement,
      };
    }),
  );
}

function buildSaleSummary(tier: LaunchTier, saleCatalog: SaleCatalogRow[]) {
  return (
    [
      'GATHERING_MATERIAL',
      'MOB_MATERIAL',
      'EQUIPMENT',
      'REINFORCEMENT_MATERIAL',
      'PET_COCOON',
    ] as const
  ).map((category) => {
    const rows = saleCatalog.filter(
      (item) => item.tier === tier && item.category === category,
    );
    const sellableRows = rows.filter((item) => item.isSellable);
    const values = sellableRows.map((item) => item.npcSaleGold);

    return {
      tier,
      category,
      itemCount: rows.length,
      sellableItemCount: sellableRows.length,
      minimumNpcSaleGold: values.length > 0 ? Math.min(...values) : 0,
      averageNpcSaleGold: round(average(values)),
      medianNpcSaleGold: round(median(values)),
      maximumNpcSaleGold: values.length > 0 ? Math.max(...values) : 0,
    };
  });
}

export function buildActivityEconomyAudit(
  options: {
    generatedAt?: Date;
    database?: ActivityEconomyDatabaseSnapshot | null;
  } = {},
) {
  const generatedAt = options.generatedAt ?? new Date();
  const canonicalEconomy = buildTierEconomyReport();
  const saleCatalog = buildSaleCatalog();
  const marketplaceSets = options.database?.marketplace.completeSets ?? [];
  const tiers = LAUNCH_TIERS.map((tier) => {
    const canonicalTier = canonicalEconomy.tiers.find(
      (candidate) => candidate.tier === tier,
    );

    if (!canonicalTier) throw new Error(`Economia canonica T${tier} ausente.`);

    const calibration =
      options.database?.worldBossCalibrations[tier] ??
      createFallbackWorldBossSimulationCalibration({ asOf: generatedAt });
    const autoCombat = buildAutoCombatEconomy(tier, canonicalTier);
    const gathering = buildGatheringVariants(tier, saleCatalog);
    const crafting = buildCraftingEconomy({
      tier,
      autoCombat,
      saleCatalog,
    });
    const incursions = buildIncursionEconomy(tier, saleCatalog, autoCombat);
    const worldBosses = buildWorldBossEconomy({
      tier,
      calibration,
      saleCatalog,
    });
    const missionEconomy = buildMissionEconomy({
      tier,
      autoCombat,
      gathering,
      crafting,
      incursions,
    });
    const balancedIncursionSummary = averageActivityRows({
      tier,
      activity: 'INCURSION',
      mode: 'BALANCED_MEDIA_DAS_2_INCURSOES',
      rows: incursions
        .filter((entry) => entry.approach === 'BALANCED')
        .map((entry) => entry.summary),
      note: 'Media das duas incursoes do tier. A entrada retorna 100% no sucesso e 90% na falha; fragmentos e fichas nao recebem valor arbitrario em Gold.',
    });
    const worldBossCalendarSummary = averageActivityRows({
      tier,
      activity: 'WORLD_BOSS',
      mode: 'CALENDARIO_SOMA_DOS_2_SLOTS',
      rows: worldBosses.map((entry) => entry.calendarSummary),
      aggregation: 'SUM',
      note: 'Soma dos dois ciclos independentes, normalizada por duracao, respawn e ativacao. Resultados com FALLBACK nao estao prontos para decisao de recompensa.',
    });
    const progression = buildProgressionAcquisition({
      tier,
      crafting,
      incursions,
      worldBosses,
    });
    const affordability = buildAffordability({
      tier,
      autoCombat,
      gathering,
      crafting,
      incursions,
      worldBosses,
      missionGoldPerDay: missionEconomy.recurringGoldPerDay,
      progression,
      marketplaceSets,
    });
    const activityRows = [
      autoCombat.summary,
      ...gathering.map((entry) => entry.summary),
      crafting.stationSummary,
      crafting.selfSupplySummary,
      ...incursions.map((entry) => entry.summary),
      ...worldBosses.flatMap((entry) => [
        entry.participationSummary,
        entry.calendarSummary,
      ]),
      missionEconomy.summary,
    ];

    return {
      tier,
      representativeActivities: [
        autoCombat.summary,
        gathering.find((entry) => entry.mode === 'MASTERY_AFFINITY')!.summary,
        crafting.selfSupplySummary,
        balancedIncursionSummary,
        worldBossCalendarSummary,
        missionEconomy.summary,
      ],
      activityRows,
      autoCombat,
      gathering,
      crafting,
      incursions,
      worldBosses,
      worldBossCalibration: {
        mode: calibration.mode,
        quality: calibration.quality,
        readiness: calibration.readiness,
      },
      missions: missionEconomy.missions,
      recurringMissionGoldPerDay: missionEconomy.recurringGoldPerDay,
      recurringMissionHoursPerDay: missionEconomy.recurringHoursPerDay,
      sales: buildSaleSummary(tier, saleCatalog),
      progression,
      affordability,
    };
  });
  const findings: Array<{
    severity: 'INFO' | 'ATTENTION' | 'HIGH';
    code: string;
    tier: number | null;
    message: string;
  }> = [];

  for (const tier of tiers) {
    const craftingRecoveryRatio = average(
      tier.crafting.recipes.map(
        (recipe) =>
          recipe.outputNpcSaleGold /
          Math.max(1, recipe.inputNpcOpportunityGold),
      ),
    );
    const autoCombat = tier.representativeActivities.find(
      (activity) => activity.activity === 'AUTO_COMBAT',
    );
    const craftingToAutoGoldRatio =
      tier.crafting.selfSupplySummary.netGoldEquivalentPerHour /
      Math.max(1, autoCombat?.netGoldEquivalentPerHour ?? 0);

    if (tier.tier >= 3) {
      const isRecoveryCalibrated =
        craftingRecoveryRatio >= 0.25 && craftingRecoveryRatio <= 0.35;
      const isSelfSupplyProfitable =
        tier.crafting.selfSupplySummary.netGoldEquivalentPerHour > 0;
      const isBelowAutoCombat =
        craftingToAutoGoldRatio >= 0 && craftingToAutoGoldRatio <= 0.2;
      const preservesIngredientSink = tier.crafting.recipes.every(
        (recipe) => recipe.outputNpcSaleGold < recipe.inputNpcOpportunityGold,
      );
      const calibrated =
        isRecoveryCalibrated &&
        isSelfSupplyProfitable &&
        isBelowAutoCombat &&
        preservesIngredientSink;

      findings.push({
        severity: calibrated ? 'INFO' : 'HIGH',
        code: calibrated
          ? 'CRAFTING_NPC_LIQUIDATION_CALIBRATED'
          : 'CRAFTING_NPC_LIQUIDATION_OUTSIDE_TARGET',
        tier: tier.tier,
        message:
          `Equipamentos craftáveis recuperam ${(craftingRecoveryRatio * 100).toFixed(1)}% do valor NPC dos ingredientes; ` +
          `o ciclo autossuficiente entrega ${tier.crafting.selfSupplySummary.netGoldEquivalentPerHour.toFixed(2)} Gold/h ` +
          `(${(craftingToAutoGoldRatio * 100).toFixed(1)}% do autocombate).`,
      });
    } else if (tier.crafting.stationSummary.netGoldEquivalentPerHour < 0) {
      findings.push({
        severity: 'ATTENTION',
        code: 'CRAFTING_DESTROYS_NPC_LIQUIDATION_VALUE',
        tier: tier.tier,
        message: `Criar e vender ao NPC perde ${Math.abs(tier.crafting.stationSummary.netGoldEquivalentPerHour)} Gold equivalente por hora de bancada frente a vender os ingredientes.`,
      });
    }

    const balancedIncursion = tier.representativeActivities.find(
      (activity) => activity.mode === 'BALANCED_MEDIA_DAS_2_INCURSOES',
    );
    if (balancedIncursion && autoCombat) {
      const xpRatio =
        balancedIncursion.characterXpPerHour /
        Math.max(1, autoCombat.characterXpPerHour);
      const goldRatio =
        balancedIncursion.netGoldEquivalentPerHour /
        Math.max(1, autoCombat.netGoldEquivalentPerHour);
      const isGoldViable = balancedIncursion.netGoldEquivalentPerHour >= 0;
      const isXpCalibrated = xpRatio >= 0.6 && xpRatio <= 0.7;
      const isGoldContained = goldRatio <= 0.1;
      const calibrated = isGoldViable && isXpCalibrated && isGoldContained;

      findings.push({
        severity: calibrated ? 'INFO' : 'HIGH',
        code: calibrated
          ? 'INCURSION_RETURN_CALIBRATED'
          : 'INCURSION_RETURN_OUTSIDE_TARGET',
        tier: tier.tier,
        message:
          'A incursao balanceada entrega ' +
          (xpRatio * 100).toFixed(1) +
          '% do XP/h e ' +
          (goldRatio * 100).toFixed(1) +
          '% do Gold liquido/h do autocombate, alem de fichas e fragmentos.',
      });
    }

    const missionSummary = tier.representativeActivities.find(
      (activity) => activity.activity === 'MISSIONS',
    );
    if (missionSummary && missionSummary.netGoldEquivalentPerHour <= 0) {
      findings.push({
        severity: 'HIGH',
        code: 'MISSION_TIER_REWARD_INSUFFICIENT',
        tier: tier.tier,
        message: `As missoes T${tier.tier} ainda perdem ${Math.abs(missionSummary.netGoldEquivalentPerHour)} Gold equivalente/h no ciclo dedicado.`,
      });
    }

    if (!tier.worldBossCalibration.readiness.rewardReviewReady) {
      findings.push({
        severity: 'ATTENTION',
        code: 'WORLD_BOSS_REWARD_CALIBRATION_INCOMPLETE',
        tier: tier.tier,
        message: `Ameacas Globais T${tier.tier} ainda usam fallback em ${tier.worldBossCalibration.readiness.fallbackMetrics.join(', ')}.`,
      });
    }

    const marketSetsForTier = marketplaceSets.filter(
      (set) => set.tier === tier.tier,
    );
    if (options.database && marketSetsForTier.every((set) => !set.complete)) {
      findings.push({
        severity: 'INFO',
        code: 'NO_COMPLETE_MARKET_SET_AVAILABLE',
        tier: tier.tier,
        message:
          'Nao existe set completo anunciado para nenhuma classe; tempo para comprar equipamento no mercado permanece N/D.',
      });
    }
  }

  const missionsWithoutTierMatrix = missionDefinitions.filter(
    (mission) => !MISSION_REWARD_MATRIX[mission.key],
  );
  if (missionsWithoutTierMatrix.length > 0) {
    findings.push({
      severity: 'HIGH',
      code: 'MISSION_TIER_MATRIX_INCOMPLETE',
      tier: null,
      message: `Missoes sem matriz T1-T5: ${missionsWithoutTierMatrix
        .map((mission) => mission.key)
        .join(', ')}.`,
    });
  }

  const invalidNumbers = tiers.flatMap((tier) =>
    tier.activityRows.filter((row) =>
      [
        row.grossGoldEquivalentPerHour,
        row.netGoldEquivalentPerHour,
        row.characterXpPerHour,
        row.skillXpPerHour,
      ].some((value) => !Number.isFinite(value)),
    ),
  );
  const expectedRecipeCount = recipeDefinitions.filter(
    (recipe) => recipe.tier <= 5,
  ).length;
  const actualRecipeCount = sum(
    tiers.map((tier) => tier.crafting.recipes.length),
  );
  const integrityErrors = [
    ...(invalidNumbers.length > 0
      ? [`${invalidNumbers.length} linhas possuem numero nao finito.`]
      : []),
    ...(actualRecipeCount !== expectedRecipeCount
      ? [
          `Receitas auditadas ${actualRecipeCount}; esperado ${expectedRecipeCount}.`,
        ]
      : []),
    ...(saleCatalog.some((item) => item.isSellable && item.npcSaleGold <= 0)
      ? ['Catalogo possui item vendavel sem valor positivo.']
      : []),
  ];

  return {
    version: 1,
    generatedAt: generatedAt.toISOString(),
    scope: 'T1-T5',
    assumptions: {
      goldEquivalent:
        'Gold direto + valor de liquidacao NPC; mercado entre jogadores e transferencia e nao fonte de Gold.',
      autoCombat:
        '6 mobs exatos, pesos 42/24/15/9/6/4, 4 classes, set atual, gathering recomendado, sem pet, reforco 0 e pocao do tier.',
      gathering:
        'Entrada e dominio por tier; dominio usa nivel 5/10/15/20/25; afinidade aplica bonus canonico.',
      crafting:
        'Drops diferentes acumulam simultaneamente no mix; o tempo de farm e limitado pelo ingrediente mais demorado. Variancia de RNG nao esta incluida.',
      incursions:
        'Todas as duas incursoes e tres abordagens; reembolso depende do resultado e o HP perdido usa o custo proporcional da pocao canonica do tier.',
      worldBoss: `Jogador elegivel, participacao minima cumprida; recompensas expiradas usam multiplicador coletivo e ${WORLD_BOSS_REWARD_CONFIG.nonDefeatedChanceMultiplier}x apenas em rolagens nao garantidas.`,
      missions:
        'Objetivos tratados como dedicados. Taxa por hora nao remove os limites diario e semanal.',
      equipmentPrice:
        'Nao existe preco canonico de compra. Preco de set so aparece quando seis slots estao anunciados no banco consultado.',
    },
    tiers,
    saleCatalog,
    database: options.database ?? null,
    findings,
    integrity: {
      status:
        integrityErrors.length === 0
          ? ('HEALTHY' as const)
          : ('DRIFT' as const),
      errors: integrityErrors,
      tiers: tiers.length,
      activityRows: sum(tiers.map((tier) => tier.activityRows.length)),
      recipes: actualRecipeCount,
      saleCatalogItems: saleCatalog.length,
      incursions: sum(tiers.map((tier) => tier.incursions.length)),
      worldBosses: sum(tiers.map((tier) => tier.worldBosses.length)),
      missions: sum(tiers.map((tier) => tier.missions.length)),
    },
    assessment: findings.some((finding) => finding.severity === 'HIGH')
      ? ('ATTENTION' as const)
      : ('HEALTHY' as const),
  };
}

function getTelemetryItemCategory(slot: ItemSlot) {
  if (slot === ItemSlot.MATERIAL) return 'MATERIAL' as const;
  if ((EQUIPMENT_SET_SLOTS as readonly ItemSlot[]).includes(slot)) {
    return 'EQUIPMENT' as const;
  }
  return 'OTHER' as const;
}

function buildExpectedDatabaseItems(saleCatalog: SaleCatalogRow[]) {
  const reinforcementRarityByTier = new Map(
    incursionDefinitions.flatMap((incursion) =>
      incursion.lootTable
        .filter(
          (reward) =>
            reward.rewardType === IncursionRewardType.MATERIAL &&
            reward.itemName?.startsWith('Fragmento de Reforço T'),
        )
        .map((reward) => [incursion.tier, reward.rarity] as const),
    ),
  );
  const saleItems = saleCatalog.map((item) => ({
    name: item.itemName,
    tier: item.itemTier,
    rarity:
      item.category === 'REINFORCEMENT_MATERIAL'
        ? (reinforcementRarityByTier.get(item.tier) ?? item.rarity)
        : item.rarity,
    slot:
      item.inventoryType === InventoryItemType.EQUIPMENT
        ? (equipmentDefinitions.find(
            (equipment) => equipment.name === item.itemName,
          )?.slot ?? ItemSlot.MATERIAL)
        : ItemSlot.MATERIAL,
    family: item.family,
    isSellable: item.isSellable,
  }));
  const consumables = consumableDefinitions.map((item) => ({
    name: item.name,
    tier: item.tier,
    rarity: item.rarity,
    slot: ItemSlot.CONSUMABLE,
    family: item.family,
    isSellable: item.isSellable ?? true,
  }));
  const unique = new Map(
    [...saleItems, ...consumables].map((item) => [item.name, item]),
  );
  return [...unique.values()];
}

function compareValue(
  mismatches: string[],
  context: string,
  field: string,
  expected: unknown,
  actual: unknown,
) {
  if (expected === actual) return;
  mismatches.push(
    `${context}.${field}: esperado ${String(expected)}, banco ${String(actual)}.`,
  );
}

async function verifyCanonicalDatabase(prisma: PrismaClient) {
  const saleCatalog = buildSaleCatalog();
  const expectedItems = buildExpectedDatabaseItems(saleCatalog);
  const [items, recipes, incursions, worldBosses, missions] = await Promise.all(
    [
      prisma.item.findMany({
        where: { name: { in: expectedItems.map((item) => item.name) } },
        select: {
          name: true,
          tier: true,
          rarity: true,
          slot: true,
          family: true,
          isSellable: true,
        },
      }),
      prisma.craftingRecipe.findMany({
        where: { tier: { in: [...LAUNCH_TIERS] } },
        select: {
          tier: true,
          outputQuantity: true,
          outputItem: { select: { name: true } },
          ingredients: {
            select: {
              quantity: true,
              role: true,
              origin: true,
              item: { select: { name: true } },
            },
          },
        },
      }),
      prisma.incursion.findMany({
        where: { tier: { in: [...LAUNCH_TIERS] } },
        select: {
          name: true,
          tier: true,
          goldCost: true,
          durationSeconds: true,
          riskLevel: true,
          lootTable: {
            select: {
              rewardType: true,
              currency: true,
              chance: true,
              minQuantity: true,
              maxQuantity: true,
              guaranteed: true,
              rarity: true,
              sortOrder: true,
              item: { select: { name: true } },
            },
          },
        },
      }),
      prisma.worldBoss.findMany({
        where: { tier: { in: [...LAUNCH_TIERS] } },
        select: {
          name: true,
          tier: true,
          durationSeconds: true,
          minParticipationSeconds: true,
          rewards: {
            select: {
              rewardType: true,
              currency: true,
              chance: true,
              minQuantity: true,
              maxQuantity: true,
              guaranteed: true,
              onlyIfDefeated: true,
              requiresMinParticipation: true,
              randomPetCocoon: true,
              minContributionPercent: true,
              minRankPercent: true,
              rarity: true,
              sortOrder: true,
              item: { select: { name: true } },
            },
          },
        },
      }),
      prisma.missionDefinition.findMany({
        where: { isActive: true },
        select: {
          key: true,
          type: true,
          objectiveType: true,
          targetValue: true,
          rewardGold: true,
          rewardXp: true,
        },
      }),
    ],
  );
  const mismatches: string[] = [];
  const itemByName = new Map(items.map((item) => [item.name, item]));

  for (const expected of expectedItems) {
    const actual = itemByName.get(expected.name);
    if (!actual) {
      mismatches.push(`Item ausente: ${expected.name}.`);
      continue;
    }
    compareValue(mismatches, expected.name, 'tier', expected.tier, actual.tier);
    compareValue(
      mismatches,
      expected.name,
      'rarity',
      expected.rarity,
      actual.rarity,
    );
    compareValue(mismatches, expected.name, 'slot', expected.slot, actual.slot);
    compareValue(
      mismatches,
      expected.name,
      'family',
      expected.family,
      actual.family,
    );
    compareValue(
      mismatches,
      expected.name,
      'isSellable',
      expected.isSellable,
      actual.isSellable,
    );
  }

  const recipeByOutput = new Map(
    recipes.map((recipe) => [recipe.outputItem.name, recipe]),
  );
  for (const expected of recipeDefinitions.filter(
    (recipe) => recipe.tier <= 5,
  )) {
    const actual = recipeByOutput.get(expected.outputItemName);
    if (!actual) {
      mismatches.push(`Receita ausente: ${expected.outputItemName}.`);
      continue;
    }
    compareValue(
      mismatches,
      `Receita ${expected.outputItemName}`,
      'tier',
      expected.tier,
      actual.tier,
    );
    compareValue(
      mismatches,
      `Receita ${expected.outputItemName}`,
      'outputQuantity',
      expected.outputQuantity ?? 1,
      actual.outputQuantity,
    );
    const actualIngredients = new Map(
      actual.ingredients.map((ingredient) => [
        ingredient.item.name,
        ingredient,
      ]),
    );
    for (const expectedIngredient of expected.ingredients) {
      const actualIngredient = actualIngredients.get(
        expectedIngredient.itemName,
      );
      if (!actualIngredient) {
        mismatches.push(
          `Ingrediente ausente em ${expected.outputItemName}: ${expectedIngredient.itemName}.`,
        );
        continue;
      }
      compareValue(
        mismatches,
        `${expected.outputItemName}/${expectedIngredient.itemName}`,
        'quantity',
        expectedIngredient.quantity,
        actualIngredient.quantity,
      );
      compareValue(
        mismatches,
        `${expected.outputItemName}/${expectedIngredient.itemName}`,
        'origin',
        expectedIngredient.origin,
        actualIngredient.origin,
      );
      compareValue(
        mismatches,
        `${expected.outputItemName}/${expectedIngredient.itemName}`,
        'role',
        expectedIngredient.role,
        actualIngredient.role,
      );
    }
  }

  const incursionByName = new Map(
    incursions.map((incursion) => [incursion.name, incursion]),
  );
  for (const expected of incursionDefinitions.filter(
    (incursion) => incursion.tier <= 5,
  )) {
    const actual = incursionByName.get(expected.name);
    if (!actual) {
      mismatches.push(`Incursao ausente: ${expected.name}.`);
      continue;
    }
    for (const [field, expectedValue, actualValue] of [
      ['tier', expected.tier, actual.tier],
      ['goldCost', expected.goldCost, actual.goldCost],
      ['durationSeconds', expected.durationSeconds, actual.durationSeconds],
      ['riskLevel', expected.riskLevel, actual.riskLevel],
      ['lootCount', expected.lootTable.length, actual.lootTable.length],
    ] as const) {
      compareValue(
        mismatches,
        expected.name,
        field,
        expectedValue,
        actualValue,
      );
    }

    const actualRewards = new Map(
      actual.lootTable.map((reward) => [reward.sortOrder, reward]),
    );
    for (const [index, expectedReward] of expected.lootTable.entries()) {
      const sortOrder = expectedReward.sortOrder ?? index;
      const actualReward = actualRewards.get(sortOrder);
      const context = `${expected.name}/recompensa ${sortOrder}`;

      if (!actualReward) {
        mismatches.push(`Recompensa ausente em ${context}.`);
        continue;
      }

      for (const [field, expectedValue, actualValue] of [
        ['rewardType', expectedReward.rewardType, actualReward.rewardType],
        [
          'itemName',
          expectedReward.itemName ?? null,
          actualReward.item?.name ?? null,
        ],
        ['currency', expectedReward.currency ?? null, actualReward.currency],
        ['chance', expectedReward.chance, actualReward.chance],
        ['minQuantity', expectedReward.minQuantity, actualReward.minQuantity],
        ['maxQuantity', expectedReward.maxQuantity, actualReward.maxQuantity],
        [
          'guaranteed',
          expectedReward.guaranteed ?? false,
          actualReward.guaranteed,
        ],
        ['rarity', expectedReward.rarity ?? null, actualReward.rarity],
      ] as const) {
        compareValue(mismatches, context, field, expectedValue, actualValue);
      }
    }
  }

  const bossByName = new Map(worldBosses.map((boss) => [boss.name, boss]));
  for (const expected of worldBossDefinitions.filter(
    (boss) => boss.tier <= 5,
  )) {
    const actual = bossByName.get(expected.name);
    if (!actual) {
      mismatches.push(`Ameaca Global ausente: ${expected.name}.`);
      continue;
    }
    for (const [field, expectedValue, actualValue] of [
      ['tier', expected.tier, actual.tier],
      ['durationSeconds', expected.durationSeconds, actual.durationSeconds],
      [
        'minParticipationSeconds',
        expected.minParticipationSeconds,
        actual.minParticipationSeconds,
      ],
      ['rewardCount', expected.lootTable.length, actual.rewards.length],
    ] as const) {
      compareValue(
        mismatches,
        expected.name,
        field,
        expectedValue,
        actualValue,
      );
    }

    const actualRewards = new Map(
      actual.rewards.map((reward) => [reward.sortOrder, reward]),
    );
    for (const [index, expectedReward] of expected.lootTable.entries()) {
      const sortOrder = expectedReward.sortOrder ?? index;
      const actualReward = actualRewards.get(sortOrder);
      const context = `${expected.name}/recompensa ${sortOrder}`;

      if (!actualReward) {
        mismatches.push(`Recompensa ausente em ${context}.`);
        continue;
      }

      for (const [field, expectedValue, actualValue] of [
        ['rewardType', expectedReward.rewardType, actualReward.rewardType],
        [
          'itemName',
          expectedReward.itemName ?? null,
          actualReward.item?.name ?? null,
        ],
        ['currency', expectedReward.currency ?? null, actualReward.currency],
        ['chance', expectedReward.chance, actualReward.chance],
        ['minQuantity', expectedReward.minQuantity, actualReward.minQuantity],
        ['maxQuantity', expectedReward.maxQuantity, actualReward.maxQuantity],
        [
          'guaranteed',
          expectedReward.guaranteed ?? false,
          actualReward.guaranteed,
        ],
        [
          'onlyIfDefeated',
          expectedReward.onlyIfDefeated ?? false,
          actualReward.onlyIfDefeated,
        ],
        [
          'requiresMinParticipation',
          expectedReward.requiresMinParticipation ?? true,
          actualReward.requiresMinParticipation,
        ],
        [
          'randomPetCocoon',
          expectedReward.randomPetCocoon ?? false,
          actualReward.randomPetCocoon,
        ],
        [
          'minContributionPercent',
          expectedReward.minContributionPercent ?? 0,
          actualReward.minContributionPercent,
        ],
        [
          'minRankPercent',
          expectedReward.minRankPercent ?? null,
          actualReward.minRankPercent,
        ],
        ['rarity', expectedReward.rarity ?? null, actualReward.rarity],
      ] as const) {
        compareValue(mismatches, context, field, expectedValue, actualValue);
      }
    }
  }

  const missionByKey = new Map(
    missions.map((mission) => [mission.key, mission]),
  );
  for (const expected of missionDefinitions) {
    const actual = missionByKey.get(expected.key);
    if (!actual) {
      mismatches.push(`Missao ausente: ${expected.key}.`);
      continue;
    }
    for (const [field, expectedValue, actualValue] of [
      ['type', expected.type, actual.type],
      ['objectiveType', expected.objectiveType, actual.objectiveType],
      ['targetValue', expected.targetValue, actual.targetValue],
      ['rewardGold', expected.rewardGold, actual.rewardGold],
      ['rewardXp', expected.rewardXp, actual.rewardXp],
    ] as const) {
      compareValue(
        mismatches,
        `Missao ${expected.key}`,
        field,
        expectedValue,
        actualValue,
      );
    }
  }

  return {
    status: mismatches.length === 0 ? ('HEALTHY' as const) : ('DRIFT' as const),
    checkedItems: items.length,
    checkedRecipes: recipes.length,
    checkedIncursions: incursions.length,
    checkedWorldBosses: worldBosses.length,
    checkedMissions: missions.length,
    mismatches,
  };
}

async function loadMarketplaceObservation(
  prisma: PrismaClient,
  generatedAt: Date,
  since: Date,
) {
  const [activeListingCount, equipmentListings, recentPurchases] =
    await Promise.all([
      prisma.marketListing.count({
        where: {
          status: MarketListingStatus.ACTIVE,
          quantityRemaining: { gt: 0 },
        },
      }),
      prisma.marketListing.findMany({
        where: {
          status: MarketListingStatus.ACTIVE,
          quantityRemaining: { gt: 0 },
          type: InventoryItemType.EQUIPMENT,
          item: { tier: { in: [...LAUNCH_TIERS] } },
        },
        select: {
          unitPrice: true,
          quantityRemaining: true,
          item: {
            select: {
              tier: true,
              slot: true,
              class: { select: { name: true } },
            },
          },
        },
      }),
      prisma.marketPurchase.count({ where: { createdAt: { gte: since } } }),
    ]);
  const completeSets = LAUNCH_TIERS.flatMap((tier) =>
    classDefinitions.map((classDefinition): MarketplaceSetObservation => {
      const listings = equipmentListings.filter(
        (listing) =>
          listing.item.tier === tier &&
          listing.item.class?.name === classDefinition.name,
      );
      const cheapestBySlot = new Map<ItemSlot, number>();

      for (const listing of listings) {
        const current = cheapestBySlot.get(listing.item.slot);
        if (current === undefined || listing.unitPrice < current) {
          cheapestBySlot.set(listing.item.slot, listing.unitPrice);
        }
      }

      const coveredSlots = EQUIPMENT_SET_SLOTS.filter((slot) =>
        cheapestBySlot.has(slot),
      ).length;
      const complete = coveredSlots === EQUIPMENT_SET_SLOTS.length;

      return {
        tier,
        className: classDefinition.name,
        complete,
        coveredSlots,
        activeListingCount: listings.length,
        cheapestCompleteSetGold: complete
          ? sum(
              EQUIPMENT_SET_SLOTS.map((slot) => cheapestBySlot.get(slot) ?? 0),
            )
          : null,
        observedAt: generatedAt.toISOString(),
      };
    }),
  );

  return {
    activeListings: activeListingCount,
    recentPurchases,
    completeSets,
  };
}

async function loadNpcSaleTelemetry(
  prisma: PrismaClient,
  since: Date,
): Promise<NpcSaleTelemetryRow[]> {
  const [itemDebits, goldCredits] = await Promise.all([
    prisma.economyLedgerEntry.findMany({
      where: {
        reason: 'BLACK_MARKET_ITEM_SOLD',
        createdAt: { gte: since },
      },
      select: {
        referenceId: true,
        quantity: true,
        tier: true,
        item: { select: { slot: true } },
      },
    }),
    prisma.economyLedgerEntry.findMany({
      where: {
        reason: 'BLACK_MARKET_GOLD_RECEIVED',
        createdAt: { gte: since },
      },
      select: { referenceId: true, quantity: true },
    }),
  ]);
  const goldByReference = new Map(
    goldCredits.flatMap((entry) =>
      entry.referenceId ? [[entry.referenceId, entry.quantity] as const] : [],
    ),
  );
  const aggregates = new Map<string, Omit<NpcSaleTelemetryRow, 'goldPerDay'>>();

  for (const entry of itemDebits) {
    const tier = entry.tier && entry.tier >= 1 ? entry.tier : null;
    const category = entry.item
      ? getTelemetryItemCategory(entry.item.slot)
      : 'OTHER';
    const key = `${tier ?? 'N/D'}:${category}`;
    const current = aggregates.get(key) ?? {
      tier,
      category,
      operations: 0,
      unitsSold: 0,
      goldReceived: 0,
    };
    current.operations += 1;
    current.unitsSold += entry.quantity;
    current.goldReceived += entry.referenceId
      ? (goldByReference.get(entry.referenceId) ?? 0)
      : 0;
    aggregates.set(key, current);
  }

  return [...aggregates.values()]
    .map((entry) => ({
      ...entry,
      goldPerDay: round(entry.goldReceived / TELEMETRY_LOOKBACK_DAYS),
    }))
    .sort(
      (left, right) =>
        (left.tier ?? 0) - (right.tier ?? 0) ||
        left.category.localeCompare(right.category),
    );
}

function appendTelemetryAggregate(
  target: Map<
    string,
    {
      tier: number;
      activity: string;
      sampleSize: number;
      hours: number;
      grossGold: number;
      netGold: number;
      xp: number;
      successes: number;
      attempts: number;
      note: string;
    }
  >,
  params: {
    tier: number;
    activity: string;
    hours: number;
    grossGold: number;
    netGold: number;
    xp: number;
    success?: boolean | null;
    note: string;
  },
) {
  const key = `${params.tier}:${params.activity}`;
  const current = target.get(key) ?? {
    tier: params.tier,
    activity: params.activity,
    sampleSize: 0,
    hours: 0,
    grossGold: 0,
    netGold: 0,
    xp: 0,
    successes: 0,
    attempts: 0,
    note: params.note,
  };
  current.sampleSize += 1;
  current.hours += Math.max(0, params.hours);
  current.grossGold += params.grossGold;
  current.netGold += params.netGold;
  current.xp += params.xp;
  if (params.success !== undefined && params.success !== null) {
    current.attempts += 1;
    if (params.success) current.successes += 1;
  }
  target.set(key, current);
}

async function loadActivityTelemetry(
  prisma: PrismaClient,
  since: Date,
): Promise<ActivityTelemetryRow[]> {
  const [
    gatheringSessions,
    craftingSessions,
    incursionSessions,
    participants,
    missionClaims,
  ] = await Promise.all([
    prisma.gatheringSession.findMany({
      where: { lastResolvedAt: { gte: since }, collectedQuantity: { gt: 0 } },
      select: {
        startedAt: true,
        lastResolvedAt: true,
        collectedQuantity: true,
        collectedXp: true,
        targetMaterial: {
          select: {
            tier: true,
            rarity: true,
            family: true,
            isSellable: true,
          },
        },
      },
    }),
    prisma.craftingSession.findMany({
      where: { completedAt: { gte: since } },
      select: {
        quantity: true,
        outputQuantity: true,
        craftingXpGained: true,
        durationSeconds: true,
        outputItem: {
          select: { tier: true, rarity: true, family: true, isSellable: true },
        },
        recipe: {
          select: {
            ingredients: {
              select: {
                quantity: true,
                item: {
                  select: {
                    tier: true,
                    rarity: true,
                    family: true,
                    isSellable: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.characterIncursionSession.findMany({
      where: {
        startedAt: { gte: since },
        status: {
          in: [IncursionSessionStatus.CLAIMED, IncursionSessionStatus.FAILED],
        },
      },
      select: {
        status: true,
        startedAt: true,
        endsAt: true,
        goldCostPaid: true,
        goldReward: true,
        xpReward: true,
        incursion: { select: { tier: true } },
      },
    }),
    prisma.worldBossParticipant.findMany({
      where: { rewardGrantedAt: { gte: since }, activeSeconds: { gt: 0 } },
      select: {
        activeSeconds: true,
        event: { select: { tier: true, status: true } },
        rewards: {
          select: {
            rewardType: true,
            quantity: true,
            item: {
              select: {
                tier: true,
                rarity: true,
                family: true,
                isSellable: true,
              },
            },
          },
        },
      },
    }),
    prisma.characterMission.findMany({
      where: { claimedAt: { gte: since } },
      select: {
        rewardTier: true,
        rewardGold: true,
        rewardXp: true,
      },
    }),
  ]);
  const aggregates = new Map<
    string,
    {
      tier: number;
      activity: string;
      sampleSize: number;
      hours: number;
      grossGold: number;
      netGold: number;
      xp: number;
      successes: number;
      attempts: number;
      note: string;
    }
  >();

  for (const session of gatheringSessions) {
    const hours =
      (session.lastResolvedAt.getTime() - session.startedAt.getTime()) /
      3_600_000;
    const unitValue = getItemNpcSaleGold({
      tier: session.targetMaterial.tier,
      rarity: session.targetMaterial.rarity,
      inventoryType: InventoryItemType.MATERIAL,
      family: session.targetMaterial.family,
      isSellable: session.targetMaterial.isSellable,
    });
    appendTelemetryAggregate(aggregates, {
      tier: session.targetMaterial.tier,
      activity: 'GATHERING',
      hours,
      grossGold: session.collectedQuantity * unitValue,
      netGold: session.collectedQuantity * unitValue,
      xp: session.collectedXp,
      note: 'Valor observado usa quantidade coletada e liquidacao NPC; sessoes longas podem incluir periodos sem resolucao ativa.',
    });
  }

  for (const session of craftingSessions) {
    const outputValue =
      session.outputQuantity *
      getItemNpcSaleGold({
        tier: session.outputItem.tier,
        rarity: session.outputItem.rarity,
        inventoryType: InventoryItemType.EQUIPMENT,
        family: session.outputItem.family,
        isSellable: session.outputItem.isSellable,
      });
    const inputValue = sum(
      session.recipe.ingredients.map(
        (ingredient) =>
          ingredient.quantity *
          session.quantity *
          getItemNpcSaleGold({
            tier: ingredient.item.tier,
            rarity: ingredient.item.rarity,
            inventoryType: InventoryItemType.MATERIAL,
            family: ingredient.item.family,
            isSellable: ingredient.item.isSellable,
          }),
      ),
    );
    appendTelemetryAggregate(aggregates, {
      tier: session.outputItem.tier,
      activity: 'CRAFTING_STATION',
      hours: session.durationSeconds / 3_600,
      grossGold: outputValue,
      netGold: outputValue - inputValue,
      xp: session.craftingXpGained,
      note: 'Retorno observado da bancada; liquido compara output com oportunidade de vender os ingredientes.',
    });
  }

  for (const session of incursionSessions) {
    const success = session.status === IncursionSessionStatus.CLAIMED;
    appendTelemetryAggregate(aggregates, {
      tier: session.incursion.tier,
      activity: 'INCURSION',
      hours:
        (session.endsAt.getTime() - session.startedAt.getTime()) / 3_600_000,
      grossGold: session.goldReward,
      netGold: session.goldReward - session.goldCostPaid,
      xp: session.xpReward,
      success,
      note: 'Gold observado inclui recompensa direta menos entrada; itens e moedas especiais nao foram convertidos em Gold.',
    });
  }

  for (const participant of participants) {
    let gold = 0;
    let xp = 0;
    let itemValue = 0;
    for (const reward of participant.rewards) {
      if (reward.rewardType === WorldBossRewardType.GOLD)
        gold += reward.quantity;
      if (reward.rewardType === WorldBossRewardType.XP) xp += reward.quantity;
      if (reward.item) {
        itemValue +=
          reward.quantity *
          getItemNpcSaleGold({
            tier: reward.item.tier,
            rarity: reward.item.rarity,
            inventoryType: InventoryItemType.MATERIAL,
            family: reward.item.family,
            isSellable: reward.item.isSellable,
          });
      }
    }
    appendTelemetryAggregate(aggregates, {
      tier: participant.event.tier,
      activity: 'WORLD_BOSS_PARTICIPATION',
      hours: participant.activeSeconds / 3_600,
      grossGold: gold + itemValue,
      netGold: gold + itemValue,
      xp,
      success: participant.event.status === 'DEFEATED',
      note: 'Retorno por segundos ativos registrados; fragmentos sem venda e casulos sem item associado nao recebem valor inventado.',
    });
  }

  for (const tier of LAUNCH_TIERS) {
    const claims = missionClaims.filter((claim) => claim.rewardTier === tier);
    if (claims.length === 0) continue;

    aggregates.set(`${tier}:MISSIONS`, {
      tier,
      activity: 'MISSIONS',
      sampleSize: claims.length,
      hours: 0,
      grossGold: sum(claims.map((claim) => claim.rewardGold)),
      netGold: sum(claims.map((claim) => claim.rewardGold)),
      xp: sum(claims.map((claim) => claim.rewardXp)),
      successes: claims.length,
      attempts: claims.length,
      note: 'Totais observados usam o tier e a recompensa congelados na atribuicao; missoes continuam sem retorno/h porque nao persistem tempo ativo dedicado.',
    });
  }

  return [...aggregates.values()]
    .map(
      (entry): ActivityTelemetryRow => ({
        tier: entry.tier,
        activity: entry.activity,
        sampleSize: entry.sampleSize,
        observedGoldGrossPerHour:
          entry.hours > 0 ? round(entry.grossGold / entry.hours) : null,
        observedGoldNetPerHour:
          entry.hours > 0 ? round(entry.netGold / entry.hours) : null,
        observedXpPerHour:
          entry.hours > 0 ? round(entry.xp / entry.hours) : null,
        observedSuccessPercent:
          entry.attempts > 0
            ? round((entry.successes / entry.attempts) * 100)
            : null,
        note: entry.note,
      }),
    )
    .sort(
      (left, right) =>
        left.tier - right.tier || left.activity.localeCompare(right.activity),
    );
}

export async function loadActivityEconomyDatabaseSnapshot(
  options: {
    generatedAt?: Date;
    lookbackDays?: number;
  } = {},
): Promise<ActivityEconomyDatabaseSnapshot> {
  const generatedAt = options.generatedAt ?? new Date();
  const lookbackDays = Math.max(
    1,
    Math.floor(options.lookbackDays ?? TELEMETRY_LOOKBACK_DAYS),
  );
  const since = new Date(generatedAt.getTime() - lookbackDays * 86_400_000);
  const prisma = new PrismaClient();

  try {
    const [catalogVerification, marketplace, npcSales, activityTelemetry] =
      await Promise.all([
        verifyCanonicalDatabase(prisma),
        loadMarketplaceObservation(prisma, generatedAt, since),
        loadNpcSaleTelemetry(prisma, since),
        loadActivityTelemetry(prisma, since),
      ]);
    const worldBossCalibrations: Record<
      number,
      WorldBossSimulationCalibration
    > = {};

    for (const tier of LAUNCH_TIERS) {
      worldBossCalibrations[tier] = await loadWorldBossSimulationCalibration(
        prisma,
        {
          tier,
          asOf: generatedAt,
        },
      );
    }

    return {
      generatedAt: generatedAt.toISOString(),
      lookbackDays,
      catalogVerification,
      worldBossCalibrations,
      marketplace,
      npcSales,
      activityTelemetry,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function escapeCsv(value: unknown) {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ? String(value)
        : (JSON.stringify(value) ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return `\uFEFF${[
    headers.map(escapeCsv).join(';'),
    ...rows.map((row) =>
      headers.map((header) => escapeCsv(row[header])).join(';'),
    ),
  ].join('\n')}\n`;
}

function formatNumber(value: number | null, digits = 2) {
  if (value === null) return 'N/D';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatHours(value: number | null) {
  return value === null ? 'N/D' : `${formatNumber(value)}h`;
}

function buildMarkdown(report: ReturnType<typeof buildActivityEconomyAudit>) {
  const activityRows = report.tiers
    .flatMap((tier) => tier.representativeActivities)
    .map(
      (row) =>
        `| T${row.tier} | ${row.activity} | ${row.mode} | ${formatNumber(row.grossGoldEquivalentPerHour)} | ${formatNumber(row.netGoldEquivalentPerHour)} | ${formatNumber(row.characterXpPerHour)} | ${formatNumber(row.skillXpPerHour)} | ${formatNumber(row.defeatChancePercent)}% |`,
    )
    .join('\n');
  const progressionRows = report.tiers
    .map(
      (tier) =>
        `| T${tier.tier} | ${formatHours(tier.progression.equipmentSetSelfSupplyHoursAverage)} | ${formatNumber(tier.progression.reinforcementGoldForFullSetPlus3, 0)} | ${tier.progression.reinforcementFragmentsForFullSetPlus3} | ${formatHours(tier.progression.expectedIncursionHoursForReinforcementFragments)} | ${formatNumber(tier.progression.petGoldCost, 0)} | ${formatHours(tier.progression.expectedCalendarHoursUntilPetInputs)} | ${formatHours(tier.progression.petIncubationHours)} |`,
    )
    .join('\n');
  const saleRows = report.tiers
    .flatMap((tier) => tier.sales)
    .map(
      (row) =>
        `| T${row.tier} | ${row.category} | ${row.sellableItemCount}/${row.itemCount} | ${formatNumber(row.minimumNpcSaleGold, 0)} | ${formatNumber(row.averageNpcSaleGold)} | ${formatNumber(row.maximumNpcSaleGold, 0)} |`,
    )
    .join('\n');
  const findings =
    report.findings.length > 0
      ? report.findings
          .map(
            (finding) =>
              `- **${finding.severity} · ${finding.code}${finding.tier ? ` · T${finding.tier}` : ''}:** ${finding.message}`,
          )
          .join('\n')
      : '- Nenhum achado acima dos limites da auditoria.';
  const database = report.database
    ? `- Catalogo: **${report.database.catalogVerification.status}**, ${report.database.catalogVerification.mismatches.length} divergencias.\n- Mercado: ${report.database.marketplace.activeListings} anuncios ativos e ${report.database.marketplace.recentPurchases} compras nos ultimos ${report.database.lookbackDays} dias.\n- Telemetria: ${report.database.activityTelemetry.reduce((total, row) => total + row.sampleSize, 0)} amostras agregadas.`
    : '- Banco nao consultado nesta execucao; precos de set e telemetria aparecem como N/D.';

  return (
    `# Retorno economico real T1-T5\n\n` +
    `Gerado em ${report.generatedAt}. O relatorio separa Gold direto, valor de liquidacao dos itens, custos em Gold e custo de oportunidade.\n\n` +
    `## Resumo comparavel\n\n` +
    `| Tier | Atividade | Cenario | Gold bruto equivalente/h | Gold liquido equivalente/h | XP personagem/h | XP proficiencia/h | Falha/derrota |\n` +
    `|---|---|---|---:|---:|---:|---:|---:|\n${activityRows}\n\n` +
    `A linha de missoes mede horas dedicadas aos objetivos, mas a recompensa continua limitada por reset. A linha de Ameacas Globais usa calendario e respawn, nao apenas tempo dentro do evento.\n\n` +
    `## Tempo de progressao\n\n` +
    `| Tier | Set craftado com recursos proprios | Gold set +3 | Fragmentos set +3 | Horas de incursao para fragmentos | Gold do pet | Horas de calendario para casulo + fragmentos | Incubacao |\n` +
    `|---|---:|---:|---:|---:|---:|---:|---:|\n${progressionRows}\n\n` +
    `Precos para comprar um set no Mercado do Abrigo so sao calculados quando os seis slots da classe estao anunciados. Consulte \`08_poder_de_compra.csv\` para cada fonte de renda e alvo.\n\n` +
    `## Venda ao NPC\n\n` +
    `| Tier | Categoria | Vendaveis/total | Minimo | Media | Maximo |\n` +
    `|---|---|---:|---:|---:|---:|\n${saleRows}\n\n` +
    `A venda em si e instantanea e nao possui Gold/h significativo. O Gold/h de materiais de gathering, drops e equipamentos considera o tempo de aquisicao nas respectivas atividades.\n\n` +
    `## Achados\n\n${findings}\n\n` +
    `## Banco e telemetria\n\n${database}\n\n` +
    `## Limites\n\n` +
    `- Fragmentos e fichas sem venda canonica permanecem em unidades, sem conversao inventada para Gold.\n` +
    `- Precos do mercado entre jogadores sao observacoes temporais e transferem Gold; nao criam Gold no sistema.\n` +
    `- O tempo de drops usa valor esperado. RNG pode alongar o tempo real, principalmente para o ultimo ingrediente de um set.\n` +
    `- Telemetria local com amostra pequena complementa, mas nao substitui, a projecao canonica.\n`
  );
}

export function writeActivityEconomyReport(
  report: ReturnType<typeof buildActivityEconomyAudit>,
  outputDir: string,
) {
  const database = report.database;

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    resolve(outputDir, 'activity-economy-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '01_resumo_atividades_por_tier.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.representativeActivities.map((row) => ({
          tier: row.tier,
          atividade: row.activity,
          cenario: row.mode,
          goldDiretoBrutoPorHora: row.directGoldGrossPerHour,
          valorItensNpcPorHora: row.itemNpcValuePerHour,
          goldBrutoEquivalentePorHora: row.grossGoldEquivalentPerHour,
          custoGoldDiretoPorHora: row.directGoldCostPerHour,
          custoOportunidadePorHora: row.inputOpportunityCostPerHour,
          goldLiquidoEquivalentePorHora: row.netGoldEquivalentPerHour,
          xpPersonagemPorHora: row.characterXpPerHour,
          xpProficienciaPorHora: row.skillXpPerHour,
          chanceDerrotaOuFalhaPercentual: row.defeatChancePercent,
          disponibilidade: row.availability,
          observacao: row.note,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '02_gathering.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.gathering.map((row) => ({
          tier: row.tier,
          cenario: row.mode,
          nivelProficiencia: row.skillLevel,
          afinidadeClasse: row.hasClassAffinity,
          materiaisDisponiveis: row.materialCount,
          valorNpcUnitario: row.unitNpcSaleGold,
          unidadesPorHora: row.unitsPerHour,
          valorItensNpcPorHora: row.itemNpcValuePerHour,
          xpGatheringPorHora: row.skillXpPerHour,
          custoGoldPorHora: 0,
          derrotaPercentual: 0,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '03_crafting_receitas.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.crafting.recipes.map((row) => ({
          tier: row.tier,
          classe: row.className,
          slot: row.slot,
          item: row.outputItemName,
          valorNpcOutput: row.outputNpcSaleGold,
          quantidadeGathering: row.gatheringInputQuantity,
          quantidadeDrops: row.mobInputQuantity,
          valorNpcIngredientes: row.inputNpcOpportunityGold,
          duracaoCraftSegundos: row.craftingSeconds,
          xpCraft: row.craftingSkillXp,
          craftsBancadaPorHora: row.stationCraftsPerHour,
          valorOutputBancadaPorHora: row.stationOutputNpcValuePerHour,
          custoOportunidadeBancadaPorHora:
            row.stationInputOpportunityGoldPerHour,
          liquidoEconomicoBancadaPorHora: row.stationNetEconomicValuePerHour,
          horasGathering: row.gatheringHours,
          horasDrops: row.autoCombatDropHours,
          horasCraft: row.craftingHours,
          horasCicloAutossuficiente: row.selfSupplyHours,
          custoPocoesCiclo: row.selfSupplyPotionGold,
          valorOutputAutossuficientePorHora:
            row.selfSupplyOutputNpcValuePerHour,
          goldLiquidoAutossuficientePorHora: row.selfSupplyNetGoldPerHour,
          diferencaVsVenderIngredientesPorHora:
            row.selfSupplyRelativeToSellingInputsPerHour,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '04_incursoes.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.incursions.map((row) => ({
          tier: row.tier,
          incursao: row.name,
          abordagem: row.approach,
          duracaoMinutos: row.durationMinutes,
          tentativasPorHora: row.attemptsPerHour,
          sucessoPercentual: row.successChancePercent,
          falhaPercentual: row.failureChancePercent,
          perdaHpEsperadaPercentualPorTentativa:
            row.expectedFailureHpLossPercentPerAttempt,
          entradaGold: row.entryGold,
          reembolsoSucessoGold: row.successEntryRefundGold,
          reembolsoFalhaGold: row.failureEntryRefundGold,
          reembolsoEntradaEsperadoPorTentativa:
            row.expectedEntryRefundGoldPerAttempt,
          goldLootEsperadoPorTentativa: row.expectedLootGoldPerAttempt,
          goldDiretoEsperadoPorTentativa: row.expectedDirectGoldPerAttempt,
          valorItemNpcEsperadoPorTentativa: row.expectedItemNpcValuePerAttempt,
          goldCarteiraLiquidoPorTentativa: row.expectedWalletNetGoldPerAttempt,
          custoRecuperacaoHpPorTentativa:
            row.expectedRecoveryPotionGoldPerAttempt,
          goldLiquidoEsperadoPorTentativa: row.expectedNetGoldPerAttempt,
          goldLiquidoPorHora: row.summary.netGoldEquivalentPerHour,
          xpPersonagemPorHora: row.summary.characterXpPerHour,
          fichasPorTentativa: row.expectedIncursionTokensPerAttempt,
          fragmentosReforcoPorTentativa:
            row.expectedReinforcementFragmentsPerAttempt,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '05_ameacas_globais.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.worldBosses.map((row) => ({
          tier: row.tier,
          ameaca: row.name,
          slot: row.slot,
          ativacaoPercentual: row.activationChancePercent,
          fonteAtivacao: row.activationSource,
          chefeDerrotadoPercentual: row.bossDefeatChancePercent,
          fonteDerrota: row.defeatSource,
          falhaObjetivoPercentual: row.objectiveFailureChancePercent,
          derrotaJogadorPercentual: row.playerDefeatChancePercent,
          cicloEsperadoHoras: row.expectedCycleHours,
          participacaoEsperadaHoras: row.expectedParticipationHours,
          goldPorEventoAtivado: row.expectedGoldPerActivatedEvent,
          xpPorEventoAtivado: row.expectedCharacterXpPerActivatedEvent,
          valorItemNpcPorEventoAtivado:
            row.expectedItemNpcValuePerActivatedEvent,
          fragmentosPorEventoAtivado: row.expectedFragmentsPerActivatedEvent,
          casulosPorEventoAtivado: row.expectedCocoonsPerActivatedEvent,
          goldLiquidoPorHoraParticipando:
            row.participationSummary.netGoldEquivalentPerHour,
          goldLiquidoPorHoraCalendario:
            row.calendarSummary.netGoldEquivalentPerHour,
          xpPorHoraParticipando: row.participationSummary.characterXpPerHour,
          xpPorHoraCalendario: row.calendarSummary.characterXpPerHour,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '06_missoes.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.missions.map((row) => ({
          tier: row.tier,
          chave: row.key,
          missao: row.title,
          tipo: row.type,
          objetivo: row.objectiveType,
          alvo: row.targetValue,
          horasDedicadas: row.dedicatedHours,
          tentativasEsperadas: row.expectedAttempts,
          goldMissao: row.missionGold,
          xpMissao: row.missionCharacterXp,
          custoGoldObjetivo: row.objectiveDirectGoldCost,
          custoOportunidadeObjetivo: row.objectiveInputOpportunityCost,
          goldDiretoSubjacente: row.underlyingDirectGold,
          valorItemNpcSubjacente: row.underlyingItemNpcValue,
          xpPersonagemSubjacente: row.underlyingCharacterXp,
          xpProficienciaSubjacente: row.underlyingSkillXp,
          goldMissaoPorHoraDedicada: row.missionRewardGoldPerDedicatedHour,
          goldLiquidoCombinadoPorHoraDedicada:
            row.combinedNetGoldEquivalentPerDedicatedHour,
          falhaPorTentativaPercentual: row.defeatChancePercentPerAttempt,
          goldRecorrentePorDia: row.recurringGoldPerDay,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '07_venda_equipamentos_materiais.csv'),
    toCsv(
      report.saleCatalog.map((row) => ({
        tier: row.tier,
        tierItem: row.itemTier,
        categoria: row.category,
        item: row.itemName,
        familia: row.family,
        raridade: row.rarity,
        tipoInventario: row.inventoryType,
        vendavel: row.isSellable,
        valorVendaNpc: row.npcSaleGold,
        aquisicao: row.acquisition,
      })),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '08_poder_de_compra.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.affordability.map((row) => ({
          tier: row.tier,
          alvo: row.targetKey,
          descricao: row.targetLabel,
          classe: row.className,
          custoGold: row.goldCost,
          fontePreco: row.targetSource,
          fonteRenda: row.incomeSource,
          goldLiquidoPorHora: row.netGoldPerHour,
          horas: row.hours,
          dias24h: row.days,
          requisitoAdicional: row.additionalRequirement,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '09_telemetria_observada.csv'),
    toCsv(
      database
        ? [
            ...database.activityTelemetry.map((row) => ({
              tipo: 'ATIVIDADE',
              tier: row.tier || 'N/D',
              atividade: row.activity,
              categoria: '',
              amostras: row.sampleSize,
              operacoes: '',
              unidades: '',
              goldTotal: '',
              goldPorDia: '',
              goldBrutoPorHora: row.observedGoldGrossPerHour,
              goldLiquidoPorHora: row.observedGoldNetPerHour,
              xpPorHora: row.observedXpPerHour,
              sucessoPercentual: row.observedSuccessPercent,
              observacao: row.note,
            })),
            ...database.npcSales.map((row) => ({
              tipo: 'VENDA_NPC',
              tier: row.tier ?? 'N/D',
              atividade: 'BLACK_MARKET',
              categoria: row.category,
              amostras: '',
              operacoes: row.operations,
              unidades: row.unitsSold,
              goldTotal: row.goldReceived,
              goldPorDia: row.goldPerDay,
              goldBrutoPorHora: '',
              goldLiquidoPorHora: '',
              xpPorHora: '',
              sucessoPercentual: '',
              observacao: `Janela de ${database.lookbackDays} dias.`,
            })),
          ]
        : [],
    ),
    'utf8',
  );
  writeFileSync(resolve(outputDir, 'README.md'), buildMarkdown(report), 'utf8');
}

function printReport(
  report: ReturnType<typeof buildActivityEconomyAudit>,
  detailed: boolean,
) {
  console.log('Auditoria completa de retorno economico T1-T5');
  console.table(
    report.tiers.flatMap((tier) =>
      tier.representativeActivities.map((row) => ({
        Tier: `T${row.tier}`,
        Atividade: row.activity,
        Cenario: row.mode,
        'Gold bruto eq./h': row.grossGoldEquivalentPerHour,
        'Custos/h': round(
          row.directGoldCostPerHour + row.inputOpportunityCostPerHour,
        ),
        'Gold liquido eq./h': row.netGoldEquivalentPerHour,
        'XP personagem/h': row.characterXpPerHour,
        'XP proficiencia/h': row.skillXpPerHour,
        'Falha %': row.defeatChancePercent,
      })),
    ),
  );
  console.log('Tempo para progressao');
  console.table(
    report.tiers.map((tier) => ({
      Tier: `T${tier.tier}`,
      'Set proprio h': tier.progression.equipmentSetSelfSupplyHoursAverage,
      'Reforco +3 Gold': tier.progression.reinforcementGoldForFullSetPlus3,
      'Reforco fragmentos':
        tier.progression.reinforcementFragmentsForFullSetPlus3,
      'Incursao fragmentos h':
        tier.progression.expectedIncursionHoursForReinforcementFragments,
      'Pet Gold': tier.progression.petGoldCost,
      'Pet inputs calendario h':
        tier.progression.expectedCalendarHoursUntilPetInputs,
      'Incubacao h': tier.progression.petIncubationHours,
    })),
  );
  if (detailed) {
    console.log('Telemetria observada');
    console.table(report.database?.activityTelemetry ?? []);
    console.log('Vendas NPC observadas');
    console.table(report.database?.npcSales ?? []);
  }
  console.log(
    `Integridade: ${report.integrity.status}; avaliacao economica: ${report.assessment}; achados=${report.findings.length}.`,
  );
  if (report.findings.length > 0) console.table(report.findings);
  if (report.database) {
    console.log(
      `Banco: ${report.database.catalogVerification.status}; divergencias=${report.database.catalogVerification.mismatches.length}; anuncios=${report.database.marketplace.activeListings}.`,
    );
  }
}

async function main() {
  const generatedAt = new Date();
  const verifyDatabase = process.argv.includes('--verify-database');
  const database = verifyDatabase
    ? await loadActivityEconomyDatabaseSnapshot({ generatedAt })
    : null;
  const report = buildActivityEconomyAudit({ generatedAt, database });
  const outputDir = resolve(
    __dirname,
    '..',
    '..',
    '_reports',
    'economy',
    'activity-returns',
  );

  if (process.argv.includes('--write')) {
    writeActivityEconomyReport(report, outputDir);
    console.log(`Relatorios gravados em ${outputDir}.`);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, process.argv.includes('--detailed'));
  }

  if (
    process.argv.includes('--strict') &&
    (report.integrity.status !== 'HEALTHY' ||
      database?.catalogVerification.status === 'DRIFT')
  ) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
