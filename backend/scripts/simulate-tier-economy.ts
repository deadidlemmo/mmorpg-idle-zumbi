import {
  IncursionRewardType,
  InventoryItemType,
  MissionType,
  WorldBossRewardType,
} from '@prisma/client';
import { incursionDefinitions } from '../prisma/seed-data/incursions.seed-data';
import { missionDefinitions } from '../prisma/seed-data/progression.seed-data';
import {
  mobDropItemDefinitions,
  mobDropTables,
} from '../prisma/seed-data/mob-drops.seed-data';
import {
  getActiveAutoCombatEncounterWeight,
  getActiveAutoCombatMobRank,
  mobBaseDefinitions,
} from '../prisma/seed-data/mobs.seed-data';
import { getRecipeQuantityPolicyForTier } from '../prisma/seed-data/recipe-balance-overrides.seed-data';
import { worldBossDefinitions } from '../prisma/seed-data/world-bosses.seed-data';
import {
  EQUIPMENT_REINFORCEMENT_CONFIG,
  PET_DEFINITIONS,
} from '../src/common/config/economy.config';
import {
  GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
  GATHERING_RATE_BY_TIER,
  getGatheringRateMultiplier,
} from '../src/common/config/gathering.config';
import {
  calculateBlackMarketSellValue,
  getItemRarityByTier,
} from '../src/common/config/item-economy.config';
import { getMissionReward } from '../src/common/config/mission-balance.config';
import {
  calculateIncursionFailureEntryRefund,
  calculateIncursionSuccessEntryRefund,
  getIncursionRiskProfile,
} from '../src/modules/incursions/incursion-risk.util';
import {
  buildAutoCombatMobRow,
  type GearScenario,
  type MatrixRow,
} from './validate-auto-combat-tier-progression';

const ECONOMY_TIERS = [1, 2, 3, 4, 5] as const;
const BASELINE_CLASSES = [
  'Lutador',
  'Assassino',
  'Atirador',
  'Médico',
] as const;
const POSITION_RANKS = {
  START: [1, 2],
  MID: [3, 4],
  END: [5, 6],
} as const;
const ACTIVE_MOB_RANKS = [1, 2, 3, 4, 5, 6] as const;
const POTION_COST_SHARE_TARGET_BY_TIER = {
  1: { minimum: 2, maximum: 5 },
  2: { minimum: 5, maximum: 10 },
  3: { minimum: 12, maximum: 25 },
  4: { minimum: 12, maximum: 25 },
  5: { minimum: 12, maximum: 25 },
} as const;
const PREVIOUS_SET_MIN_POTION_RATIO = 3;
const PREVIOUS_SET_MIN_ADDITIONAL_POTIONS = 3;

type EconomyTier = (typeof ECONOMY_TIERS)[number];
type TierPosition = keyof typeof POSITION_RANKS;

type CombatClassEconomy = {
  className: string;
  killsPerHour: number;
  potionsPer100Kills: number;
  grossGoldPerHour: number;
  potionGoldPerHour: number;
  netGoldPerHour: number;
  potionCostSharePercent: number;
  weightedSurvivalPercent: number;
  positions: PositionCombatEconomy[];
};

type PositionCombatEconomy = {
  position: TierPosition;
  encounterWeight: number;
  encounterSharePercent: number;
  mobName: string;
  mobRank: number;
  killsPerHour: number;
  potionsPer100Kills: number;
  potionsUsedInProjection: number;
  killsResolvedInProjection: number;
  potionName: string;
  potionItemTier: number;
  potionMinTier: number;
  potionMaxTier: number;
  potionHealAmount: number;
  potionBuyPrice: number;
  potionGoldPerKill: number;
  expectedGoldPerKill: number;
  grossGoldPerHour: number;
  potionGoldPerHour: number;
  netGoldPerHour: number;
  potionCostSharePercent: number;
  survives100Kills: boolean;
  defeatedAtKill: number | null;
  mobs: MobCombatEconomy[];
};

type MobCombatEconomy = Omit<PositionCombatEconomy, 'mobs'>;

type DropEconomyRow = {
  position: TierPosition;
  rank: number;
  mobName: string;
  encounterWeight: number;
  expectedUnitsPerKill: number;
  expectedGoldPerKill: number;
};

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getTierPositionByRank(rank: number): TierPosition {
  const position = (Object.keys(POSITION_RANKS) as TierPosition[]).find(
    (candidate) =>
      (POSITION_RANKS[candidate] as readonly number[]).includes(rank),
  );

  if (!position) {
    throw new Error(`Posicao economica ausente para o rank ${rank}.`);
  }

  return position;
}

function summarizeDropEconomy(rows: DropEconomyRow[]) {
  const totalWeight = rows.reduce(
    (total, row) => total + row.encounterWeight,
    0,
  );

  if (totalWeight <= 0) {
    throw new Error('Nenhum drop ponderado encontrado.');
  }

  const expectedUnitsPerKill =
    rows.reduce(
      (total, row) => total + row.expectedUnitsPerKill * row.encounterWeight,
      0,
    ) / totalWeight;
  const expectedGoldPerKill =
    rows.reduce(
      (total, row) => total + row.expectedGoldPerKill * row.encounterWeight,
      0,
    ) / totalWeight;

  return {
    encounterWeight: totalWeight,
    expectedUnitsPerKill: round(expectedUnitsPerKill, 4),
    expectedGoldPerKill: round(expectedGoldPerKill, 4),
    averageGoldPerDroppedUnit: round(
      expectedGoldPerKill / Math.max(0.0001, expectedUnitsPerKill),
      4,
    ),
  };
}

function buildDropEconomy(tier: EconomyTier) {
  const itemByName = new Map(
    mobDropItemDefinitions.map((item) => [item.name, item]),
  );
  const rows: DropEconomyRow[] = [];

  for (const table of mobDropTables.filter((drop) => drop.tier === tier)) {
    const mob = mobBaseDefinitions.find(
      (candidate) =>
        candidate.tier === table.tier &&
        candidate.mapName === table.mapName &&
        candidate.subMapName === table.subMapName &&
        candidate.orderNoSubmap === table.orderNoSubmap,
    );

    if (!mob) {
      throw new Error(`Mob ${table.mobName} nao encontrado no seed.`);
    }

    const rank = getActiveAutoCombatMobRank(mob);

    if (rank === null) {
      throw new Error(`Rank ativo ausente para ${table.mobName}.`);
    }

    const position = getTierPositionByRank(rank);
    const encounterWeight = getActiveAutoCombatEncounterWeight(mob);
    let mobUnits = 0;
    let mobGold = 0;

    for (const drop of table.drops) {
      const item = itemByName.get(drop.itemName);

      if (!item) {
        throw new Error(`Item de drop ${drop.itemName} nao encontrado.`);
      }

      const expectedQuantity =
        (drop.dropChance / 100) * ((drop.minQuantity + drop.maxQuantity) / 2);
      const unitGold = calculateBlackMarketSellValue({
        tier: item.tier,
        rarity: item.rarity,
        inventoryType: InventoryItemType.MATERIAL,
        family: item.family,
      });

      mobUnits += expectedQuantity;
      mobGold += expectedQuantity * unitGold;
    }

    rows.push({
      position,
      rank,
      mobName: table.mobName,
      encounterWeight,
      expectedUnitsPerKill: mobUnits,
      expectedGoldPerKill: mobGold,
    });
  }

  if (rows.length === 0) {
    throw new Error(`Nenhum drop ponderado encontrado para T${tier}.`);
  }

  const summary = summarizeDropEconomy(rows);

  return {
    ...summary,
    positions: (Object.keys(POSITION_RANKS) as TierPosition[]).map(
      (position) => {
        const positionRows = rows.filter((row) => row.position === position);

        return {
          position,
          ...summarizeDropEconomy(positionRows),
          mobs: positionRows
            .sort((a, b) => a.rank - b.rank)
            .map((row) => ({
              rank: row.rank,
              name: row.mobName,
              encounterWeight: row.encounterWeight,
              expectedUnitsPerKill: round(row.expectedUnitsPerKill, 4),
              expectedGoldPerKill: round(row.expectedGoldPerKill, 4),
            })),
        };
      },
    ),
  };
}

function selectCombatRows(params: {
  rows: MatrixRow[];
  tier: EconomyTier;
  className: string;
  gear: GearScenario;
}) {
  return params.rows.filter(
    (row) =>
      row.tier === params.tier &&
      row.className === params.className &&
      row.gear === params.gear &&
      row.reinforcement === 0 &&
      row.gathering === 'RECOMMENDED' &&
      row.pet === 'NONE' &&
      row.potion === 'CURRENT_TIER',
  );
}

function buildExactEconomyRows(): MatrixRow[] {
  return ECONOMY_TIERS.flatMap((tier) => {
    const gears: GearScenario[] =
      tier >= 3
        ? ['CURRENT', 'PREVIOUS', 'TWO_BELOW']
        : ['CURRENT', 'PREVIOUS'];

    return ACTIVE_MOB_RANKS.flatMap((rank) =>
      BASELINE_CLASSES.flatMap((className) =>
        gears.map((gear) =>
          buildAutoCombatMobRow({ tier, rank, className, gear }),
        ),
      ),
    );
  });
}

function summarizeMobCombatEconomy(params: {
  mobs: MobCombatEconomy[];
  totalTierWeight: number;
}): PositionCombatEconomy {
  const { mobs, totalTierWeight } = params;
  const first = mobs[0];

  if (!first || mobs.length === 0) {
    throw new Error('Nenhum monstro encontrado para o resumo economico.');
  }

  const encounterWeight = mobs.reduce(
    (total, mob) => total + mob.encounterWeight,
    0,
  );
  const weightedAverage = (selector: (mob: MobCombatEconomy) => number) =>
    mobs.reduce(
      (total, mob) =>
        total + (mob.encounterWeight / encounterWeight) * selector(mob),
      0,
    );
  const weightedSecondsPerKill = weightedAverage(
    (mob) => 3_600 / Math.max(0.01, mob.killsPerHour),
  );
  const killsPerHour = 3_600 / weightedSecondsPerKill;
  const potionsPer100Kills = weightedAverage((mob) => mob.potionsPer100Kills);
  const expectedGoldPerKill = weightedAverage((mob) => mob.expectedGoldPerKill);
  const potionBuyPrice = first.potionBuyPrice;
  const grossGoldPerHour = killsPerHour * expectedGoldPerKill;
  const potionGoldPerHour =
    killsPerHour * (potionsPer100Kills / 100) * potionBuyPrice;
  const defeatedAtKills = mobs.flatMap((mob) =>
    mob.defeatedAtKill === null ? [] : [mob.defeatedAtKill],
  );

  return {
    position: first.position,
    encounterWeight,
    encounterSharePercent: round((encounterWeight / totalTierWeight) * 100),
    mobName: mobs.map((mob) => mob.mobName).join(' / '),
    mobRank: Math.min(...mobs.map((mob) => mob.mobRank)),
    killsPerHour: round(killsPerHour),
    potionsPer100Kills: round(potionsPer100Kills),
    potionsUsedInProjection: round(
      weightedAverage((mob) => mob.potionsUsedInProjection),
    ),
    killsResolvedInProjection: round(
      weightedAverage((mob) => mob.killsResolvedInProjection),
    ),
    potionName: first.potionName,
    potionItemTier: first.potionItemTier,
    potionMinTier: first.potionMinTier,
    potionMaxTier: first.potionMaxTier,
    potionHealAmount: first.potionHealAmount,
    potionBuyPrice,
    potionGoldPerKill: round((potionsPer100Kills / 100) * potionBuyPrice, 4),
    expectedGoldPerKill: round(expectedGoldPerKill, 4),
    grossGoldPerHour: round(grossGoldPerHour),
    potionGoldPerHour: round(potionGoldPerHour),
    netGoldPerHour: round(grossGoldPerHour - potionGoldPerHour),
    potionCostSharePercent: round(
      (potionGoldPerHour / Math.max(0.01, grossGoldPerHour)) * 100,
    ),
    survives100Kills: mobs.every((mob) => mob.survives100Kills),
    defeatedAtKill:
      defeatedAtKills.length > 0 ? Math.min(...defeatedAtKills) : null,
    mobs,
  };
}

function buildClassCombatEconomy(params: {
  rows: MatrixRow[];
  tier: EconomyTier;
  className: string;
  gear: GearScenario;
  dropEconomy: ReturnType<typeof buildDropEconomy>;
}): CombatClassEconomy | null {
  const selectedRows = selectCombatRows(params).sort(
    (left, right) => left.mobRank - right.mobRank,
  );

  if (selectedRows.length === 0) return null;

  if (
    selectedRows.length !== ACTIVE_MOB_RANKS.length ||
    selectedRows.some((row, index) => row.mobRank !== ACTIVE_MOB_RANKS[index])
  ) {
    throw new Error(
      `Cenario incompleto T${params.tier} ${params.className} ${params.gear}.`,
    );
  }

  const dropByRank = new Map(
    params.dropEconomy.positions.flatMap((position) =>
      position.mobs.map((mob) => [mob.rank, mob] as const),
    ),
  );
  const totalWeight = params.dropEconomy.encounterWeight;
  const mobs = selectedRows.map((row): MobCombatEconomy => {
    const mobDrops = dropByRank.get(row.mobRank);

    if (!mobDrops) {
      throw new Error(
        `Drops ausentes para T${params.tier} rank ${row.mobRank}.`,
      );
    }

    const encounterWeight = mobDrops.encounterWeight;
    const grossGoldPerHour = row.killsPerHour * mobDrops.expectedGoldPerKill;
    const potionGoldPerHour =
      row.killsPerHour * (row.potionsPer100Kills / 100) * row.potionBuyPrice;

    return {
      position: row.position,
      encounterWeight,
      encounterSharePercent: round((encounterWeight / totalWeight) * 100),
      mobName: row.mobName,
      mobRank: row.mobRank,
      killsPerHour: row.killsPerHour,
      potionsPer100Kills: row.potionsPer100Kills,
      potionsUsedInProjection: row.potionsUsedInProjection,
      killsResolvedInProjection: row.killsResolvedInProjection,
      potionName: row.potionName,
      potionItemTier: row.potionItemTier,
      potionMinTier: row.potionMinTier,
      potionMaxTier: row.potionMaxTier,
      potionHealAmount: row.potionHealAmount,
      potionBuyPrice: row.potionBuyPrice,
      potionGoldPerKill: round(
        (row.potionsPer100Kills / 100) * row.potionBuyPrice,
        4,
      ),
      expectedGoldPerKill: mobDrops.expectedGoldPerKill,
      grossGoldPerHour: round(grossGoldPerHour),
      potionGoldPerHour: round(potionGoldPerHour),
      netGoldPerHour: round(grossGoldPerHour - potionGoldPerHour),
      potionCostSharePercent: round(
        (potionGoldPerHour / Math.max(0.01, grossGoldPerHour)) * 100,
      ),
      survives100Kills: row.survives100Kills,
      defeatedAtKill: row.defeatedAtKill,
    };
  });
  const positions = (Object.keys(POSITION_RANKS) as TierPosition[]).map(
    (position) =>
      summarizeMobCombatEconomy({
        mobs: mobs.filter((mob) => mob.position === position),
        totalTierWeight: totalWeight,
      }),
  );
  const weightedSecondsPerKill = mobs.reduce(
    (total, mob) =>
      total +
      (mob.encounterWeight / totalWeight) *
        (3_600 / Math.max(0.01, mob.killsPerHour)),
    0,
  );
  const killsPerHour = 3_600 / weightedSecondsPerKill;
  const potionsPer100Kills = mobs.reduce(
    (total, mob) =>
      total + (mob.encounterWeight / totalWeight) * mob.potionsPer100Kills,
    0,
  );
  const weightedSurvivalPercent = mobs.reduce(
    (total, mob) =>
      total +
      (mob.encounterWeight / totalWeight) * (mob.survives100Kills ? 100 : 0),
    0,
  );
  const weightedExpectedGoldPerKill = mobs.reduce(
    (total, mob) =>
      total + (mob.encounterWeight / totalWeight) * mob.expectedGoldPerKill,
    0,
  );
  const potionBuyPrice = selectedRows[0]?.potionBuyPrice ?? 0;
  const grossGoldPerHour = killsPerHour * weightedExpectedGoldPerKill;
  const potionGoldPerHour =
    killsPerHour * (potionsPer100Kills / 100) * potionBuyPrice;
  const netGoldPerHour = grossGoldPerHour - potionGoldPerHour;

  return {
    className: params.className,
    killsPerHour: round(killsPerHour, 2),
    potionsPer100Kills: round(potionsPer100Kills, 2),
    grossGoldPerHour: round(grossGoldPerHour, 2),
    potionGoldPerHour: round(potionGoldPerHour, 2),
    netGoldPerHour: round(netGoldPerHour, 2),
    potionCostSharePercent: round(
      (potionGoldPerHour / Math.max(0.01, grossGoldPerHour)) * 100,
      2,
    ),
    weightedSurvivalPercent: round(weightedSurvivalPercent, 2),
    positions,
  };
}

function buildCombatEconomy(params: {
  rows: MatrixRow[];
  tier: EconomyTier;
  gear: GearScenario;
  dropEconomy: ReturnType<typeof buildDropEconomy>;
}) {
  const classes = BASELINE_CLASSES.flatMap((className) => {
    const result = buildClassCombatEconomy({ ...params, className });
    return result ? [result] : [];
  });

  if (classes.length === 0) return null;

  const positions = (Object.keys(POSITION_RANKS) as TierPosition[]).map(
    (position) => {
      const classPositions = classes.map((row) => {
        const result = row.positions.find(
          (candidate) => candidate.position === position,
        );

        if (!result) {
          throw new Error(
            `Cenario ${position} ausente em T${params.tier} ${row.className}.`,
          );
        }

        return result;
      });

      return {
        position,
        encounterSharePercent: classPositions[0].encounterSharePercent,
        averageKillsPerHour: round(
          average(classPositions.map((row) => row.killsPerHour)),
        ),
        averagePotionsPer100Kills: round(
          average(classPositions.map((row) => row.potionsPer100Kills)),
        ),
        expectedGoldPerKill: classPositions[0].expectedGoldPerKill,
        averageGrossGoldPerHour: round(
          average(classPositions.map((row) => row.grossGoldPerHour)),
        ),
        averagePotionGoldPerHour: round(
          average(classPositions.map((row) => row.potionGoldPerHour)),
        ),
        averageNetGoldPerHour: round(
          average(classPositions.map((row) => row.netGoldPerHour)),
        ),
        minimumNetGoldPerHour: round(
          Math.min(...classPositions.map((row) => row.netGoldPerHour)),
        ),
        maximumNetGoldPerHour: round(
          Math.max(...classPositions.map((row) => row.netGoldPerHour)),
        ),
        averagePotionCostSharePercent: round(
          average(classPositions.map((row) => row.potionCostSharePercent)),
        ),
        survivalPercent: round(
          average(
            classPositions.map((row) => (row.survives100Kills ? 100 : 0)),
          ),
        ),
        classes: classPositions,
      };
    },
  );

  return {
    gear: params.gear,
    averageKillsPerHour: round(average(classes.map((row) => row.killsPerHour))),
    averagePotionsPer100Kills: round(
      average(classes.map((row) => row.potionsPer100Kills)),
    ),
    averageGrossGoldPerHour: round(
      average(classes.map((row) => row.grossGoldPerHour)),
    ),
    averagePotionGoldPerHour: round(
      average(classes.map((row) => row.potionGoldPerHour)),
    ),
    averageNetGoldPerHour: round(
      average(classes.map((row) => row.netGoldPerHour)),
    ),
    minimumNetGoldPerHour: round(
      Math.min(...classes.map((row) => row.netGoldPerHour)),
    ),
    maximumNetGoldPerHour: round(
      Math.max(...classes.map((row) => row.netGoldPerHour)),
    ),
    averagePotionCostSharePercent: round(
      average(classes.map((row) => row.potionCostSharePercent)),
    ),
    averageWeightedSurvivalPercent: round(
      average(classes.map((row) => row.weightedSurvivalPercent)),
    ),
    positions,
    classes,
  };
}

function buildGatheringEconomy(tier: EconomyTier) {
  const unitGold = calculateBlackMarketSellValue({
    tier,
    rarity: getItemRarityByTier(tier),
    inventoryType: InventoryItemType.MATERIAL,
  });
  const baseUnitsPerHour = GATHERING_RATE_BY_TIER[tier] ?? 1;
  const maxAffinityUnitsPerHour =
    baseUnitsPerHour *
    getGatheringRateMultiplier(50) *
    GATHERING_AFFINITY_PRODUCTION_MULTIPLIER;

  return {
    unitGold,
    baseUnitsPerHour,
    baseGoldPerHour: round(baseUnitsPerHour * unitGold),
    maxAffinityUnitsPerHour: round(maxAffinityUnitsPerHour),
    maxAffinityGoldPerHour: round(maxAffinityUnitsPerHour * unitGold),
  };
}

function buildCraftingEconomy(tier: EconomyTier, mobDropUnitGold: number) {
  const policy = getRecipeQuantityPolicyForTier(tier);
  const gatheringUnitGold = calculateBlackMarketSellValue({
    tier,
    rarity: getItemRarityByTier(tier),
    inventoryType: InventoryItemType.MATERIAL,
  });
  const outputNpcGold = calculateBlackMarketSellValue({
    tier,
    rarity: getItemRarityByTier(tier),
    inventoryType: InventoryItemType.EQUIPMENT,
    isCraftable: true,
  });
  const gatheringInputQuantity =
    policy.mainGatheringQuantity + policy.secondaryGatheringQuantity;
  const mobDropInputQuantity = policy.rareMobDropTotalQuantity;
  const inputNpcOpportunityGold =
    gatheringInputQuantity * gatheringUnitGold +
    mobDropInputQuantity * mobDropUnitGold;

  return {
    directGoldFee: 0,
    gatheringInputQuantity,
    mobDropInputQuantity,
    inputNpcOpportunityGold: round(inputNpcOpportunityGold),
    outputNpcGold,
    resourceValueDestroyedByCrafting: round(
      Math.max(0, inputNpcOpportunityGold - outputNpcGold),
    ),
  };
}

function buildIncursionRecoveryProfile(tier: EconomyTier, rows: MatrixRow[]) {
  const classes = BASELINE_CLASSES.map((className) => {
    const selectedRows = selectCombatRows({
      rows,
      tier,
      className,
      gear: 'CURRENT',
    });
    const weightedRows = selectedRows.map((row) => {
      const mob = mobBaseDefinitions.find(
        (candidate) =>
          candidate.tier === tier &&
          getActiveAutoCombatMobRank(candidate) === row.mobRank,
      );

      if (!mob) {
        throw new Error(`Mob T${tier} rank ${row.mobRank} ausente.`);
      }

      return {
        row,
        weight: getActiveAutoCombatEncounterWeight(mob),
      };
    });
    const totalWeight = weightedRows.reduce(
      (total, entry) => total + entry.weight,
      0,
    );

    if (totalWeight <= 0 || weightedRows.length === 0) {
      throw new Error(`Perfil de recuperacao T${tier} ${className} ausente.`);
    }

    const weightedAverage = (selector: (row: MatrixRow) => number) =>
      weightedRows.reduce(
        (total, entry) =>
          total + (entry.weight / totalWeight) * selector(entry.row),
        0,
      );

    return {
      maxHp: weightedAverage((row) => row.hp),
      potionHealAmount: weightedAverage((row) => row.potionHealAmount),
      potionBuyPrice: weightedRows[0].row.potionBuyPrice,
    };
  });

  return {
    averageMaxHp: average(classes.map((entry) => entry.maxHp)),
    averagePotionHealAmount: average(
      classes.map((entry) => entry.potionHealAmount),
    ),
    potionBuyPrice: classes[0]?.potionBuyPrice ?? 0,
  };
}

function buildIncursionEconomy(tier: EconomyTier, rows: MatrixRow[]) {
  const recoveryProfile = buildIncursionRecoveryProfile(tier, rows);

  return incursionDefinitions
    .filter((incursion) => incursion.tier === tier)
    .map((incursion) => {
      const risk = getIncursionRiskProfile(incursion.riskLevel, 'BALANCED');
      const successRatio = risk.successChance / 100;
      const goldReward = incursion.lootTable.find(
        (reward) => reward.rewardType === IncursionRewardType.GOLD,
      );
      const averageGoldOnRoll = goldReward
        ? (goldReward.minQuantity + goldReward.maxQuantity) / 2
        : 0;
      const expectedLootGold = goldReward
        ? successRatio *
          (goldReward.chance / 100) *
          averageGoldOnRoll *
          risk.rewardMultiplier
        : 0;
      const successEntryRefund = calculateIncursionSuccessEntryRefund(
        incursion.goldCost,
      );
      const failureEntryRefund = calculateIncursionFailureEntryRefund(
        incursion.goldCost,
      );
      const expectedEntryRefund =
        successRatio * successEntryRefund +
        (1 - successRatio) * failureEntryRefund;
      const expectedGold = expectedLootGold + expectedEntryRefund;
      const expectedWalletNetGold = expectedGold - incursion.goldCost;
      const expectedFailureHpLoss =
        recoveryProfile.averageMaxHp * (1 - successRatio) * risk.failureHpRatio;
      const expectedRecoveryPotionGold =
        recoveryProfile.averagePotionHealAmount > 0
          ? (expectedFailureHpLoss / recoveryProfile.averagePotionHealAmount) *
            recoveryProfile.potionBuyPrice
          : 0;
      const expectedNetGold =
        expectedWalletNetGold - expectedRecoveryPotionGold;
      const durationHours =
        (incursion.durationSeconds * risk.durationMultiplier) / 3_600;

      return {
        name: incursion.name,
        durationMinutes: round(durationHours * 60),
        successChancePercent: risk.successChance,
        entryGold: incursion.goldCost,
        successEntryRefund,
        failureEntryRefund,
        expectedEntryRefund: round(expectedEntryRefund),
        expectedLootGold: round(expectedLootGold),
        expectedDirectGold: round(expectedGold),
        expectedWalletNetGold: round(expectedWalletNetGold),
        expectedRecoveryPotionGold: round(expectedRecoveryPotionGold),
        expectedNetGold: round(expectedNetGold),
        expectedNetGoldPerHour: round(expectedNetGold / durationHours),
      };
    });
}

function buildWorldBossEconomy(tier: EconomyTier) {
  const definition = worldBossDefinitions.find((boss) => boss.tier === tier);

  if (!definition) return null;

  const goldReward = definition.lootTable.find(
    (reward) => reward.rewardType === WorldBossRewardType.GOLD,
  );

  return {
    name: definition.name,
    eventDurationMinutes: definition.durationSeconds / 60,
    minimumParticipationMinutes:
      (definition.minParticipationSeconds ?? 300) / 60,
    minimumGold: goldReward?.minQuantity ?? 0,
    maximumGold: goldReward?.maxQuantity ?? 0,
    averageGold: goldReward
      ? round((goldReward.minQuantity + goldReward.maxQuantity) / 2)
      : 0,
  };
}

function buildMissionEconomy() {
  return {
    byTier: ECONOMY_TIERS.map((tier) => {
      const rewards = missionDefinitions.map((mission) => ({
        mission,
        reward: getMissionReward({
          missionKey: mission.key,
          tier,
          baseGold: mission.rewardGold,
          baseXp: mission.rewardXp,
        }),
      }));
      const dailyGold = rewards
        .filter(({ mission }) => mission.type === MissionType.DAILY)
        .reduce((total, { reward }) => total + reward.gold, 0);
      const weeklyGold = rewards
        .filter(({ mission }) => mission.type === MissionType.WEEKLY)
        .reduce((total, { reward }) => total + reward.gold, 0);
      const storyGold = rewards
        .filter(({ mission }) => mission.type === MissionType.STORY)
        .reduce((total, { reward }) => total + reward.gold, 0);

      return {
        tier,
        storyGold,
        dailyGold,
        weeklyGold,
        recurringGoldPerDay: round(dailyGold + weeklyGold / 7),
      };
    }),
  };
}

function buildTierSinks(tier: EconomyTier) {
  const reinforcement = EQUIPMENT_REINFORCEMENT_CONFIG[tier];
  const pet = PET_DEFINITIONS.find((definition) => definition.tier === tier);

  return {
    reinforcementGoldPerItemToPlus3: reinforcement.levels.reduce(
      (total, level) => total + level.goldCost,
      0,
    ),
    petIncubationGold: pet?.goldCost ?? 0,
  };
}

export function buildTierEconomyReport(
  rows: MatrixRow[] = buildExactEconomyRows(),
) {
  const tiers = ECONOMY_TIERS.map((tier) => {
    const drops = buildDropEconomy(tier);
    const current = buildCombatEconomy({
      rows,
      tier,
      gear: 'CURRENT',
      dropEconomy: drops,
    });
    const previous = buildCombatEconomy({
      rows,
      tier,
      gear: 'PREVIOUS',
      dropEconomy: drops,
    });
    const twoBelow = buildCombatEconomy({
      rows,
      tier,
      gear: 'TWO_BELOW',
      dropEconomy: drops,
    });

    if (!current || !previous) {
      throw new Error(`Cenarios economicos basicos ausentes no T${tier}.`);
    }

    return {
      tier,
      drops,
      autoCombat: { current, previous, twoBelow },
      gathering: buildGatheringEconomy(tier),
      crafting: buildCraftingEconomy(tier, drops.averageGoldPerDroppedUnit),
      incursions: buildIncursionEconomy(tier, rows),
      worldBoss: buildWorldBossEconomy(tier),
      sinks: buildTierSinks(tier),
    };
  });

  const warnings: Array<{
    key: string;
    tier: number;
    message: string;
  }> = [];

  for (const tier of tiers) {
    const potionTarget = POTION_COST_SHARE_TARGET_BY_TIER[tier.tier];

    if (
      tier.autoCombat.current.averagePotionCostSharePercent <
        potionTarget.minimum ||
      tier.autoCombat.current.averagePotionCostSharePercent >
        potionTarget.maximum
    ) {
      warnings.push({
        key: 'CURRENT_POTION_COST_OUTSIDE_TARGET',
        tier: tier.tier,
        message: `Pocoes consomem ${tier.autoCombat.current.averagePotionCostSharePercent}% do Gold bruto no T${tier.tier}; meta ${potionTarget.minimum}-${potionTarget.maximum}%.`,
      });
    }

    if (tier.autoCombat.current.averageNetGoldPerHour <= 0) {
      warnings.push({
        key: 'CURRENT_TIER_NEGATIVE',
        tier: tier.tier,
        message: `Set atual T${tier.tier} perde Gold no proprio tier.`,
      });
    }

    if (tier.tier >= 2) {
      const previousStart = tier.autoCombat.previous.positions.find(
        (position) => position.position === 'START',
      );
      const previousEnd = tier.autoCombat.previous.positions.find(
        (position) => position.position === 'END',
      );

      const previousUsesMeaningfullyMorePotions =
        tier.autoCombat.previous.averagePotionsPer100Kills >=
          tier.autoCombat.current.averagePotionsPer100Kills *
            PREVIOUS_SET_MIN_POTION_RATIO &&
        tier.autoCombat.previous.averagePotionsPer100Kills >=
          tier.autoCombat.current.averagePotionsPer100Kills +
            PREVIOUS_SET_MIN_ADDITIONAL_POTIONS;

      if (!previousUsesMeaningfullyMorePotions) {
        warnings.push({
          key: 'PREVIOUS_SET_POTION_PRESSURE_TOO_LOW',
          tier: tier.tier,
          message: `Set anterior usa ${tier.autoCombat.previous.averagePotionsPer100Kills}/100 contra ${tier.autoCombat.current.averagePotionsPer100Kills}/100 com set atual no T${tier.tier}.`,
        });
      }

      if (previousStart && previousStart.survivalPercent < 100) {
        warnings.push({
          key: 'PREVIOUS_SET_START_UNSUSTAINABLE',
          tier: tier.tier,
          message: `Set anterior nao sustenta 100 abates no inicio do T${tier.tier}.`,
        });
      }

      if (
        previousEnd &&
        previousEnd.survivalPercent === 100 &&
        previousEnd.averageNetGoldPerHour > 0
      ) {
        warnings.push({
          key: 'PREVIOUS_SET_END_STILL_VIABLE',
          tier: tier.tier,
          message: `Set anterior ainda sustenta e lucra no fim do T${tier.tier}.`,
        });
      }

      for (const positionName of ['MID', 'END'] as const) {
        const previousPosition = tier.autoCombat.previous.positions.find(
          (position) => position.position === positionName,
        );
        const currentPosition = tier.autoCombat.current.positions.find(
          (position) => position.position === positionName,
        );

        if (
          previousPosition &&
          currentPosition &&
          previousPosition.survivalPercent === 100 &&
          previousPosition.averageNetGoldPerHour > 0 &&
          previousPosition.averagePotionsPer100Kills <
            Math.max(
              currentPosition.averagePotionsPer100Kills *
                PREVIOUS_SET_MIN_POTION_RATIO,
              currentPosition.averagePotionsPer100Kills +
                PREVIOUS_SET_MIN_ADDITIONAL_POTIONS,
            )
        ) {
          warnings.push({
            key: 'PREVIOUS_SET_PRESSURE_TOO_LOW',
            tier: tier.tier,
            message: `Set anterior atravessa ${positionName} do T${tier.tier} sem derrota nem pressao relevante de pocoes.`,
          });
        }
      }
    }

    for (const position of tier.autoCombat.current.positions) {
      if (position.averageNetGoldPerHour < 0) {
        warnings.push({
          key: 'CURRENT_POSITION_NEGATIVE',
          tier: tier.tier,
          message: `Set atual perde ${Math.abs(position.averageNetGoldPerHour)} Gold/h em ${position.position} do T${tier.tier}.`,
        });
      }
    }

    for (const classEconomy of tier.autoCombat.current.classes) {
      for (const position of classEconomy.positions) {
        if (!position.survives100Kills) {
          warnings.push({
            key: 'CURRENT_CLASS_POSITION_DEFEATED',
            tier: tier.tier,
            message: `${classEconomy.className} com set atual nao sustenta 100 abates em ${position.position} do T${tier.tier}.`,
          });
        }

        if (position.netGoldPerHour <= 0) {
          warnings.push({
            key: 'CURRENT_CLASS_POSITION_NEGATIVE',
            tier: tier.tier,
            message: `${classEconomy.className} com set atual perde Gold em ${position.position} do T${tier.tier}.`,
          });
        }
      }
    }

    if (
      tier.autoCombat.twoBelow &&
      tier.autoCombat.twoBelow.averageWeightedSurvivalPercent > 0
    ) {
      warnings.push({
        key: 'TWO_BELOW_SURVIVES',
        tier: tier.tier,
        message: `Equipamento dois tiers abaixo ainda sustenta parte do T${tier.tier}.`,
      });
    }

    const previousTier = tiers.find(
      (candidate) => candidate.tier === tier.tier - 1,
    );
    if (
      previousTier &&
      tier.autoCombat.current.averageNetGoldPerHour <=
        previousTier.autoCombat.current.averageNetGoldPerHour
    ) {
      warnings.push({
        key: 'CURRENT_TIER_FARM_REGRESSION',
        tier: tier.tier,
        message: `T${tier.tier} rende menos Gold/h que T${previousTier.tier} com set atual.`,
      });
    }
  }

  return {
    version: 5,
    assumptions: {
      encounterWeights: '42/24/15/9/6/4',
      combatMatrix:
        '6 mobs exatos x 4 classes; reforco 0; gathering recomendado; sem pet; pocao recomendada do tier',
      positionGroups: 'START=rank 1-2; MID=rank 3-4; END=rank 5-6',
      exactMobRanks: '1/2/3/4/5/6 ponderados individualmente antes do resumo',
      npcSalePolicy: 'formula autoritativa do Mercado Negro',
      craftingDirectGoldFee: 0,
      marketplaceGoldEffect: 'TRANSFER_ONLY',
      potionCostShareTargets: POTION_COST_SHARE_TARGET_BY_TIER,
      previousSetPotionPressure: `${PREVIOUS_SET_MIN_POTION_RATIO}x e +${PREVIOUS_SET_MIN_ADDITIONAL_POTIONS}/100`,
    },
    missions: buildMissionEconomy(),
    tiers,
    health: {
      status: warnings.length === 0 ? 'HEALTHY' : 'ATTENTION',
      warnings,
    },
  };
}

function printReport(
  report: ReturnType<typeof buildTierEconomyReport>,
  detailed: boolean,
) {
  console.log('Simulador economico real T1-T5');
  console.table(
    report.tiers.map((tier) => ({
      Tier: `T${tier.tier}`,
      'Gold/abate': tier.drops.expectedGoldPerKill,
      'Abates/h': tier.autoCombat.current.averageKillsPerHour,
      'Gold bruto/h': tier.autoCombat.current.averageGrossGoldPerHour,
      Pocao: tier.autoCombat.current.classes[0]?.positions[0]?.potionName,
      'Pocoes/100': tier.autoCombat.current.averagePotionsPer100Kills,
      'Custo pocoes %': tier.autoCombat.current.averagePotionCostSharePercent,
      'Pocoes Gold/h': tier.autoCombat.current.averagePotionGoldPerHour,
      'Gold liquido/h': tier.autoCombat.current.averageNetGoldPerHour,
      'Set anterior liquido/h': tier.autoCombat.previous.averageNetGoldPerHour,
    })),
  );
  console.log('Economia por posicao');
  console.table(
    report.tiers.flatMap((tier) =>
      [tier.autoCombat.current, tier.autoCombat.previous].flatMap((scenario) =>
        scenario.positions.map((position) => ({
          Tier: `T${tier.tier}`,
          Set: scenario.gear === 'CURRENT' ? 'Atual' : 'Anterior',
          Posicao: position.position,
          'Encontros %': position.encounterSharePercent,
          'Gold/abate': position.expectedGoldPerKill,
          'Abates/h': position.averageKillsPerHour,
          'Pocoes/100': position.averagePotionsPer100Kills,
          'Gold liquido/h': position.averageNetGoldPerHour,
          'Sobrevivencia %': position.survivalPercent,
        })),
      ),
    ),
  );

  if (detailed) {
    console.log('Economia por classe e posicao');
    console.table(
      report.tiers.flatMap((tier) =>
        [tier.autoCombat.current, tier.autoCombat.previous].flatMap(
          (scenario) =>
            scenario.classes.flatMap((classEconomy) =>
              classEconomy.positions.flatMap((position) =>
                position.mobs.map((mob) => ({
                  Tier: `T${tier.tier}`,
                  Set: scenario.gear === 'CURRENT' ? 'Atual' : 'Anterior',
                  Classe: classEconomy.className,
                  Posicao: mob.position,
                  Rank: mob.mobRank,
                  Monstro: mob.mobName,
                  'Encontros %': mob.encounterSharePercent,
                  'Gold/abate': mob.expectedGoldPerKill,
                  'Abates/h': mob.killsPerHour,
                  Pocao: mob.potionName,
                  Faixa: `T${mob.potionMinTier}-T${mob.potionMaxTier}`,
                  Cura: mob.potionHealAmount,
                  Preco: mob.potionBuyPrice,
                  'Usadas/projecao': mob.potionsUsedInProjection,
                  'Abates/projecao': mob.killsResolvedInProjection,
                  'Pocoes/100': mob.potionsPer100Kills,
                  'Custo/abate': mob.potionGoldPerKill,
                  'Custo %': mob.potionCostSharePercent,
                  'Gold liquido/h': mob.netGoldPerHour,
                  Sobrevive: mob.survives100Kills ? 'Sim' : 'Nao',
                  'Derrota no abate': mob.defeatedAtKill ?? '-',
                })),
              ),
            ),
        ),
      ),
    );
  }

  console.table(
    report.tiers.map((tier) => ({
      Tier: `T${tier.tier}`,
      'Gathering base Gold/h': tier.gathering.baseGoldPerHour,
      'Gathering max Gold/h': tier.gathering.maxAffinityGoldPerHour,
      'Crafting taxa Gold': tier.crafting.directGoldFee,
      'Crafting custo oportunidade': tier.crafting.inputNpcOpportunityGold,
      'Reforco +3/item': tier.sinks.reinforcementGoldPerItemToPlus3,
      'Incubacao pet': tier.sinks.petIncubationGold,
      'Ameaca global Gold medio': tier.worldBoss?.averageGold ?? 0,
    })),
  );
  console.table(
    report.missions.byTier.map((missions) => ({
      Tier: `T${missions.tier}`,
      'Missoes diarias': missions.dailyGold,
      'Missao semanal': missions.weeklyGold,
      'Gold recorrente/dia': missions.recurringGoldPerDay,
    })),
  );
  console.log(
    `Saude: ${report.health.status}; alertas=${report.health.warnings.length}.`,
  );
  if (report.health.warnings.length > 0) {
    console.table(report.health.warnings);
  }
}

function main() {
  const report = buildTierEconomyReport();
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const detailed = process.argv.includes('--detailed');

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, detailed);
  }

  if (strict && report.health.status !== 'HEALTHY') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
