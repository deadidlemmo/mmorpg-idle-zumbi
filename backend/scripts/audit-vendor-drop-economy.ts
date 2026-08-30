import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InventoryItemType, PrismaClient, type Rarity } from '@prisma/client';
import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import {
  mobDropItemDefinitions,
  mobDropTables,
} from '../prisma/seed-data/mob-drops.seed-data';
import {
  getActiveAutoCombatEncounterWeight,
  getActiveAutoCombatMobRank,
  isActiveAutoCombatMob,
  mobBaseDefinitions,
} from '../prisma/seed-data/mobs.seed-data';
import { calculateBlackMarketSellValue } from '../src/common/config/item-economy.config';
import { buildCurrentSetAutoCombatMobRow } from './validate-auto-combat-tier-progression';

const LAUNCH_TIERS = [1, 2, 3, 4, 5] as const;

export const VENDOR_DROP_AUDIT_THRESHOLDS = Object.freeze({
  highFrequencyEventChancePercent: 30,
  highFrequencyGoldSharePercent: 35,
  highFrequencyMobEncounterSharePercent: 30,
  highFrequencyMobGoldSharePercent: 35,
  highYieldMobRatioToTier: 1.75,
});

type LaunchTier = (typeof LAUNCH_TIERS)[number];
type FindingSeverity = 'ATTENTION' | 'HIGH';

type DropAuditDetail = {
  itemName: string;
  itemTier: number;
  rarity: Rarity;
  dropChancePercent: number;
  minQuantity: number;
  maxQuantity: number;
  averageQuantityWhenDropped: number;
  expectedUnitsPerKill: number;
  unitSellGold: number;
  averageGoldPerDropEvent: number;
  maximumGoldPerDropEvent: number;
  expectedGoldPerKill: number;
};

type MobClassEconomy = {
  className: string;
  killsPerHourIfExclusive: number;
  goldPerHourIfExclusive: number;
};

type MobAudit = {
  tier: LaunchTier;
  rank: number;
  position: 'START' | 'MID' | 'END';
  mobName: string;
  mapName: string;
  subMapName: string;
  encounterWeight: number;
  encounterSharePercent: number;
  expectedUnitsPerKill: number;
  expectedGoldPerKill: number;
  averageKillsPerHourIfExclusive: number;
  minimumKillsPerHourIfExclusive: number;
  maximumKillsPerHourIfExclusive: number;
  averageGoldPerHourIfExclusive: number;
  minimumGoldPerHourIfExclusive: number;
  maximumGoldPerHourIfExclusive: number;
  averageWeightedGoldPerHour: number;
  weightedGoldSharePercent: number;
  ratioToTierExpectedGoldPerKill: number;
  drops: DropAuditDetail[];
  classes: MobClassEconomy[];
};

type ItemSourceAudit = {
  mobName: string;
  rank: number;
  encounterSharePercent: number;
  dropChancePercent: number;
  minQuantity: number;
  maxQuantity: number;
};

type ItemAudit = {
  tier: LaunchTier;
  itemName: string;
  itemTier: number;
  rarity: Rarity;
  unitSellGold: number;
  weightedDropEventChancePercent: number;
  weightedExpectedUnitsPerKill: number;
  averageQuantityWhenDropped: number;
  maximumQuantityWhenDropped: number;
  averageGoldPerDropEvent: number;
  maximumGoldPerDropEvent: number;
  expectedGoldPerKill: number;
  averageExpectedUnitsPerHour: number;
  averageGoldPerHour: number;
  goldSharePercent: number;
  sources: ItemSourceAudit[];
};

export type VendorDropAuditFinding = {
  severity: FindingSeverity;
  code:
    | 'HIGH_FREQUENCY_ITEM_GOLD_CONCENTRATION'
    | 'HIGH_FREQUENCY_MOB_GOLD_CONCENTRATION'
    | 'HIGH_YIELD_MOB'
    | 'TIER_GOLD_PER_HOUR_REGRESSION';
  tier: LaunchTier;
  entity: string;
  message: string;
};

type TierAudit = {
  tier: LaunchTier;
  activeMobCount: number;
  totalEncounterWeight: number;
  averageMixedKillsPerHour: number;
  minimumMixedKillsPerHour: number;
  maximumMixedKillsPerHour: number;
  expectedGoldPerKill: number;
  averageGrossGoldPerHour: number;
  minimumGrossGoldPerHour: number;
  maximumGrossGoldPerHour: number;
  averageItemUnitSellGold: number;
  maximumItemUnitSellGold: number;
  averageGoldPerDropEvent: number;
  maximumGoldPerDropEvent: number;
  topMobByWeightedGold: string;
  topItemByGold: string;
  mobs: MobAudit[];
  items: ItemAudit[];
};

export type VendorDropEconomyAudit = {
  version: number;
  assumptions: {
    tiers: string;
    activeMobsPerTier: number;
    encounterWeights: string;
    playerBaseline: string;
    goldPerHourIfExclusive: string;
    weightedGoldPerHour: string;
    npcSalePolicy: string;
  };
  thresholds: typeof VENDOR_DROP_AUDIT_THRESHOLDS;
  tiers: TierAudit[];
  findings: VendorDropAuditFinding[];
  integrity: {
    status: 'HEALTHY';
    activeMobCount: number;
    dropEntryCount: number;
    auditedItemTierRows: number;
  };
};

type DatabaseMismatch = {
  tier: number;
  mobName: string;
  itemName?: string;
  field: string;
  canonical: string | number | boolean;
  database: string | number | boolean | null;
};

export type VendorDropDatabaseVerification = {
  status: 'HEALTHY' | 'DRIFT';
  checkedMobCount: number;
  checkedDropCount: number;
  mismatches: DatabaseMismatch[];
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

function minimum(values: number[]) {
  return values.length > 0 ? Math.min(...values) : 0;
}

function maximum(values: number[]) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function getPosition(rank: number): MobAudit['position'] {
  if (rank <= 2) return 'START';
  if (rank <= 4) return 'MID';
  return 'END';
}

function getMobKey(params: {
  tier: number;
  mapName: string;
  subMapName: string;
  mobName: string;
}) {
  return `${params.tier}::${params.mapName}::${params.subMapName}::${params.mobName}`;
}

function buildTierAudit(tier: LaunchTier): TierAudit {
  const itemByName = new Map(
    mobDropItemDefinitions.map((item) => [item.name, item]),
  );
  const tableByMob = new Map(
    mobDropTables
      .filter((table) => table.tier === tier)
      .map((table) => [getMobKey(table), table]),
  );
  const activeMobs = mobBaseDefinitions
    .filter((mob) => mob.tier === tier && isActiveAutoCombatMob(mob))
    .sort(
      (left, right) =>
        (getActiveAutoCombatMobRank(left) ?? 0) -
        (getActiveAutoCombatMobRank(right) ?? 0),
    );

  if (activeMobs.length !== 6) {
    throw new Error(
      `T${tier} possui ${activeMobs.length} mobs ativos; esperado: 6.`,
    );
  }

  const totalEncounterWeight = activeMobs.reduce(
    (total, mob) => total + getActiveAutoCombatEncounterWeight(mob),
    0,
  );

  if (totalEncounterWeight !== 100) {
    throw new Error(
      `Pesos de encontro do T${tier} totalizam ${totalEncounterWeight}; esperado: 100.`,
    );
  }

  const rawMobs = activeMobs.map((mob) => {
    const rank = getActiveAutoCombatMobRank(mob);

    if (rank === null) {
      throw new Error(`Rank ativo ausente para ${mob.name}.`);
    }

    const table = tableByMob.get(
      getMobKey({
        tier,
        mapName: mob.mapName,
        subMapName: mob.subMapName,
        mobName: mob.name,
      }),
    );

    if (!table) {
      throw new Error(`Tabela de drop ausente para ${mob.name}.`);
    }

    const drops = table.drops.map((drop): DropAuditDetail => {
      const item = itemByName.get(drop.itemName);

      if (!item) {
        throw new Error(`Item de drop ausente: ${drop.itemName}.`);
      }

      if (
        drop.dropChance <= 0 ||
        drop.dropChance > 100 ||
        drop.minQuantity < 1 ||
        drop.maxQuantity < drop.minQuantity
      ) {
        throw new Error(`Drop invalido: ${mob.name}/${drop.itemName}.`);
      }

      const averageQuantityWhenDropped =
        (drop.minQuantity + drop.maxQuantity) / 2;
      const expectedUnitsPerKill =
        (drop.dropChance / 100) * averageQuantityWhenDropped;
      const unitSellGold = calculateBlackMarketSellValue({
        tier: item.tier,
        rarity: item.rarity,
        inventoryType: InventoryItemType.MATERIAL,
        family: item.family,
      });

      return {
        itemName: item.name,
        itemTier: item.tier,
        rarity: item.rarity,
        dropChancePercent: drop.dropChance,
        minQuantity: drop.minQuantity,
        maxQuantity: drop.maxQuantity,
        averageQuantityWhenDropped: round(averageQuantityWhenDropped, 4),
        expectedUnitsPerKill: round(expectedUnitsPerKill, 4),
        unitSellGold,
        averageGoldPerDropEvent: round(
          averageQuantityWhenDropped * unitSellGold,
          4,
        ),
        maximumGoldPerDropEvent: drop.maxQuantity * unitSellGold,
        expectedGoldPerKill: round(expectedUnitsPerKill * unitSellGold, 4),
      };
    });
    const expectedUnitsPerKill = drops.reduce(
      (total, drop) => total + drop.expectedUnitsPerKill,
      0,
    );
    const expectedGoldPerKill = drops.reduce(
      (total, drop) => total + drop.expectedGoldPerKill,
      0,
    );
    const classes = classDefinitions.map((classDefinition): MobClassEconomy => {
      const row = buildCurrentSetAutoCombatMobRow({
        tier,
        rank,
        className: classDefinition.name,
      });

      return {
        className: classDefinition.name,
        killsPerHourIfExclusive: row.killsPerHour,
        goldPerHourIfExclusive: round(row.killsPerHour * expectedGoldPerKill),
      };
    });
    const encounterWeight = getActiveAutoCombatEncounterWeight(mob);

    return {
      tier,
      rank,
      position: getPosition(rank),
      mobName: mob.name,
      mapName: mob.mapName,
      subMapName: mob.subMapName,
      encounterWeight,
      encounterSharePercent: (encounterWeight / totalEncounterWeight) * 100,
      expectedUnitsPerKill,
      expectedGoldPerKill,
      drops,
      classes,
    };
  });

  const classMixedRates = classDefinitions.map((classDefinition) => {
    const weightedSecondsPerKill = rawMobs.reduce((total, mob) => {
      const classEconomy = mob.classes.find(
        (candidate) => candidate.className === classDefinition.name,
      );

      if (!classEconomy) {
        throw new Error(
          `Cenario ${classDefinition.name}/${mob.mobName} ausente.`,
        );
      }

      return (
        total +
        (mob.encounterSharePercent / 100) *
          (3_600 / Math.max(0.01, classEconomy.killsPerHourIfExclusive))
      );
    }, 0);

    return {
      className: classDefinition.name,
      killsPerHour: 3_600 / weightedSecondsPerKill,
    };
  });
  const expectedGoldPerKill = rawMobs.reduce(
    (total, mob) =>
      total + (mob.encounterSharePercent / 100) * mob.expectedGoldPerKill,
    0,
  );
  const classGrossGoldPerHour = classMixedRates.map(
    (row) => row.killsPerHour * expectedGoldPerKill,
  );
  const averageGrossGoldPerHour = average(classGrossGoldPerHour);

  const mobs: MobAudit[] = rawMobs.map((mob) => {
    const killsPerHour = mob.classes.map((row) => row.killsPerHourIfExclusive);
    const exclusiveGoldPerHour = mob.classes.map(
      (row) => row.goldPerHourIfExclusive,
    );
    const weightedGoldPerHour = classMixedRates.map(
      (row) =>
        row.killsPerHour *
        (mob.encounterSharePercent / 100) *
        mob.expectedGoldPerKill,
    );
    const averageWeightedGoldPerHour = average(weightedGoldPerHour);

    return {
      ...mob,
      encounterSharePercent: round(mob.encounterSharePercent),
      expectedUnitsPerKill: round(mob.expectedUnitsPerKill, 4),
      expectedGoldPerKill: round(mob.expectedGoldPerKill, 4),
      averageKillsPerHourIfExclusive: round(average(killsPerHour)),
      minimumKillsPerHourIfExclusive: round(minimum(killsPerHour)),
      maximumKillsPerHourIfExclusive: round(maximum(killsPerHour)),
      averageGoldPerHourIfExclusive: round(average(exclusiveGoldPerHour)),
      minimumGoldPerHourIfExclusive: round(minimum(exclusiveGoldPerHour)),
      maximumGoldPerHourIfExclusive: round(maximum(exclusiveGoldPerHour)),
      averageWeightedGoldPerHour: round(averageWeightedGoldPerHour),
      weightedGoldSharePercent: round(
        (averageWeightedGoldPerHour /
          Math.max(0.0001, averageGrossGoldPerHour)) *
          100,
      ),
      ratioToTierExpectedGoldPerKill: round(
        mob.expectedGoldPerKill / Math.max(0.0001, expectedGoldPerKill),
      ),
    };
  });

  const itemAccumulators = new Map<
    string,
    {
      itemTier: number;
      rarity: Rarity;
      unitSellGold: number;
      weightedEventProbability: number;
      weightedExpectedUnitsPerKill: number;
      maximumQuantityWhenDropped: number;
      sources: ItemSourceAudit[];
    }
  >();

  for (const mob of mobs) {
    for (const drop of mob.drops) {
      const current = itemAccumulators.get(drop.itemName) ?? {
        itemTier: drop.itemTier,
        rarity: drop.rarity,
        unitSellGold: drop.unitSellGold,
        weightedEventProbability: 0,
        weightedExpectedUnitsPerKill: 0,
        maximumQuantityWhenDropped: 0,
        sources: [],
      };
      const encounterProbability = mob.encounterSharePercent / 100;

      current.weightedEventProbability +=
        encounterProbability * (drop.dropChancePercent / 100);
      current.weightedExpectedUnitsPerKill +=
        encounterProbability * drop.expectedUnitsPerKill;
      current.maximumQuantityWhenDropped = Math.max(
        current.maximumQuantityWhenDropped,
        drop.maxQuantity,
      );
      current.sources.push({
        mobName: mob.mobName,
        rank: mob.rank,
        encounterSharePercent: mob.encounterSharePercent,
        dropChancePercent: drop.dropChancePercent,
        minQuantity: drop.minQuantity,
        maxQuantity: drop.maxQuantity,
      });
      itemAccumulators.set(drop.itemName, current);
    }
  }

  const averageMixedKillsPerHour = average(
    classMixedRates.map((row) => row.killsPerHour),
  );
  const items: ItemAudit[] = Array.from(itemAccumulators.entries())
    .map(([itemName, item]): ItemAudit => {
      const averageQuantityWhenDropped =
        item.weightedExpectedUnitsPerKill /
        Math.max(0.0001, item.weightedEventProbability);
      const expectedGoldPerKill =
        item.weightedExpectedUnitsPerKill * item.unitSellGold;
      const averageGoldPerHour = averageMixedKillsPerHour * expectedGoldPerKill;

      return {
        tier,
        itemName,
        itemTier: item.itemTier,
        rarity: item.rarity,
        unitSellGold: item.unitSellGold,
        weightedDropEventChancePercent: round(
          item.weightedEventProbability * 100,
        ),
        weightedExpectedUnitsPerKill: round(
          item.weightedExpectedUnitsPerKill,
          4,
        ),
        averageQuantityWhenDropped: round(averageQuantityWhenDropped, 4),
        maximumQuantityWhenDropped: item.maximumQuantityWhenDropped,
        averageGoldPerDropEvent: round(
          averageQuantityWhenDropped * item.unitSellGold,
        ),
        maximumGoldPerDropEvent:
          item.maximumQuantityWhenDropped * item.unitSellGold,
        expectedGoldPerKill: round(expectedGoldPerKill, 4),
        averageExpectedUnitsPerHour: round(
          averageMixedKillsPerHour * item.weightedExpectedUnitsPerKill,
        ),
        averageGoldPerHour: round(averageGoldPerHour),
        goldSharePercent: round(
          (averageGoldPerHour / Math.max(0.0001, averageGrossGoldPerHour)) *
            100,
        ),
        sources: item.sources.sort((left, right) => left.rank - right.rank),
      };
    })
    .sort((left, right) => right.averageGoldPerHour - left.averageGoldPerHour);
  const itemUnitValues = items.map((item) => item.unitSellGold);
  const itemEventValues = items.map((item) => item.averageGoldPerDropEvent);
  const maximumDropEventValues = items.map(
    (item) => item.maximumGoldPerDropEvent,
  );
  const topMob = [...mobs].sort(
    (left, right) =>
      right.averageWeightedGoldPerHour - left.averageWeightedGoldPerHour,
  )[0];
  const topItem = items[0];

  return {
    tier,
    activeMobCount: mobs.length,
    totalEncounterWeight,
    averageMixedKillsPerHour: round(averageMixedKillsPerHour),
    minimumMixedKillsPerHour: round(
      minimum(classMixedRates.map((row) => row.killsPerHour)),
    ),
    maximumMixedKillsPerHour: round(
      maximum(classMixedRates.map((row) => row.killsPerHour)),
    ),
    expectedGoldPerKill: round(expectedGoldPerKill, 4),
    averageGrossGoldPerHour: round(averageGrossGoldPerHour),
    minimumGrossGoldPerHour: round(minimum(classGrossGoldPerHour)),
    maximumGrossGoldPerHour: round(maximum(classGrossGoldPerHour)),
    averageItemUnitSellGold: round(average(itemUnitValues)),
    maximumItemUnitSellGold: maximum(itemUnitValues),
    averageGoldPerDropEvent: round(average(itemEventValues)),
    maximumGoldPerDropEvent: maximum(maximumDropEventValues),
    topMobByWeightedGold: topMob?.mobName ?? '',
    topItemByGold: topItem?.itemName ?? '',
    mobs,
    items,
  };
}

function buildFindings(tiers: TierAudit[]): VendorDropAuditFinding[] {
  const findings: VendorDropAuditFinding[] = [];

  for (const [tierIndex, tier] of tiers.entries()) {
    const previousTier = tiers[tierIndex - 1];

    if (
      previousTier &&
      tier.averageGrossGoldPerHour <= previousTier.averageGrossGoldPerHour
    ) {
      findings.push({
        severity: 'HIGH',
        code: 'TIER_GOLD_PER_HOUR_REGRESSION',
        tier: tier.tier,
        entity: `T${tier.tier}`,
        message: `T${tier.tier} gera ${tier.averageGrossGoldPerHour} Gold/h, abaixo dos ${previousTier.averageGrossGoldPerHour} Gold/h do T${previousTier.tier}.`,
      });
    }

    for (const item of tier.items) {
      if (
        item.weightedDropEventChancePercent >=
          VENDOR_DROP_AUDIT_THRESHOLDS.highFrequencyEventChancePercent &&
        item.goldSharePercent >=
          VENDOR_DROP_AUDIT_THRESHOLDS.highFrequencyGoldSharePercent
      ) {
        findings.push({
          severity: item.goldSharePercent >= 50 ? 'HIGH' : 'ATTENTION',
          code: 'HIGH_FREQUENCY_ITEM_GOLD_CONCENTRATION',
          tier: tier.tier,
          entity: item.itemName,
          message: `${item.itemName} aparece em ${item.weightedDropEventChancePercent}% dos abates e responde por ${item.goldSharePercent}% do Gold de drops do T${tier.tier}.`,
        });
      }
    }

    for (const mob of tier.mobs) {
      if (
        mob.encounterSharePercent >=
          VENDOR_DROP_AUDIT_THRESHOLDS.highFrequencyMobEncounterSharePercent &&
        mob.weightedGoldSharePercent >=
          VENDOR_DROP_AUDIT_THRESHOLDS.highFrequencyMobGoldSharePercent
      ) {
        findings.push({
          severity: mob.weightedGoldSharePercent >= 50 ? 'HIGH' : 'ATTENTION',
          code: 'HIGH_FREQUENCY_MOB_GOLD_CONCENTRATION',
          tier: tier.tier,
          entity: mob.mobName,
          message: `${mob.mobName} ocupa ${mob.encounterSharePercent}% dos encontros e gera ${mob.weightedGoldSharePercent}% do Gold de drops do T${tier.tier}.`,
        });
      }

      if (
        mob.ratioToTierExpectedGoldPerKill >=
        VENDOR_DROP_AUDIT_THRESHOLDS.highYieldMobRatioToTier
      ) {
        findings.push({
          severity:
            mob.ratioToTierExpectedGoldPerKill >= 2.25 ? 'HIGH' : 'ATTENTION',
          code: 'HIGH_YIELD_MOB',
          tier: tier.tier,
          entity: mob.mobName,
          message: `${mob.mobName} entrega ${mob.ratioToTierExpectedGoldPerKill}x o Gold por abate ponderado do T${tier.tier}.`,
        });
      }
    }
  }

  return findings;
}

export function buildVendorDropEconomyAudit(): VendorDropEconomyAudit {
  const tiers = LAUNCH_TIERS.map(buildTierAudit);
  const findings = buildFindings(tiers);

  return {
    version: 1,
    assumptions: {
      tiers: 'T1-T5',
      activeMobsPerTier: 6,
      encounterWeights: '42/24/15/9/6/4',
      playerBaseline:
        'media das 4 classes; personagem no nivel do mob; set atual; reforco 0; gathering recomendado; sem pet',
      goldPerHourIfExclusive:
        'projecao se todos os encontros fossem do mesmo mob',
      weightedGoldPerHour: 'contribuicao no mix real de encontros do tier',
      npcSalePolicy: 'formula autoritativa do Mercado Negro',
    },
    thresholds: VENDOR_DROP_AUDIT_THRESHOLDS,
    tiers,
    findings,
    integrity: {
      status: 'HEALTHY',
      activeMobCount: tiers.reduce(
        (total, tier) => total + tier.activeMobCount,
        0,
      ),
      dropEntryCount: tiers.reduce(
        (total, tier) =>
          total +
          tier.mobs.reduce((mobTotal, mob) => mobTotal + mob.drops.length, 0),
        0,
      ),
      auditedItemTierRows: tiers.reduce(
        (total, tier) => total + tier.items.length,
        0,
      ),
    },
  };
}

export async function verifyVendorDropEconomyDatabase(): Promise<VendorDropDatabaseVerification> {
  const prisma = new PrismaClient();
  const mismatches: DatabaseMismatch[] = [];
  let checkedMobCount = 0;
  let checkedDropCount = 0;

  try {
    const databaseMobs = await prisma.mob.findMany({
      where: { tier: { in: [...LAUNCH_TIERS] } },
      select: {
        name: true,
        tier: true,
        map: { select: { name: true } },
        subMapEncounters: {
          select: { subMap: { select: { name: true } } },
        },
        drops: {
          select: {
            dropChance: true,
            minQuantity: true,
            maxQuantity: true,
            item: {
              select: {
                name: true,
                tier: true,
                rarity: true,
                family: true,
                isSellable: true,
              },
            },
          },
        },
      },
    });

    for (const table of mobDropTables.filter((row) => row.tier <= 5)) {
      const mob = databaseMobs.find(
        (candidate) =>
          candidate.tier === table.tier &&
          candidate.name === table.mobName &&
          candidate.map.name === table.mapName &&
          candidate.subMapEncounters.some(
            (encounter) => encounter.subMap.name === table.subMapName,
          ),
      );

      if (!mob) {
        mismatches.push({
          tier: table.tier,
          mobName: table.mobName,
          field: 'mob',
          canonical: true,
          database: null,
        });
        continue;
      }

      checkedMobCount += 1;

      for (const canonicalDrop of table.drops) {
        const databaseDrop = mob.drops.find(
          (drop) => drop.item.name === canonicalDrop.itemName,
        );

        if (!databaseDrop) {
          mismatches.push({
            tier: table.tier,
            mobName: table.mobName,
            itemName: canonicalDrop.itemName,
            field: 'drop',
            canonical: true,
            database: null,
          });
          continue;
        }

        checkedDropCount += 1;
        const canonicalItem = mobDropItemDefinitions.find(
          (item) => item.name === canonicalDrop.itemName,
        );
        const comparisons = [
          {
            field: 'dropChance',
            canonical: canonicalDrop.dropChance,
            database: databaseDrop.dropChance,
          },
          {
            field: 'minQuantity',
            canonical: canonicalDrop.minQuantity,
            database: databaseDrop.minQuantity,
          },
          {
            field: 'maxQuantity',
            canonical: canonicalDrop.maxQuantity,
            database: databaseDrop.maxQuantity,
          },
          {
            field: 'family',
            canonical: canonicalItem?.family ?? '',
            database: databaseDrop.item.family,
          },
          {
            field: 'isSellable',
            canonical: true,
            database: databaseDrop.item.isSellable,
          },
        ];

        for (const comparison of comparisons) {
          if (comparison.canonical === comparison.database) continue;

          mismatches.push({
            tier: table.tier,
            mobName: table.mobName,
            itemName: canonicalDrop.itemName,
            ...comparison,
          });
        }

        if (canonicalItem) {
          for (const comparison of [
            {
              field: 'itemTier',
              canonical: canonicalItem.tier,
              database: databaseDrop.item.tier,
            },
            {
              field: 'itemRarity',
              canonical: canonicalItem.rarity,
              database: databaseDrop.item.rarity,
            },
          ]) {
            if (comparison.canonical === comparison.database) continue;

            mismatches.push({
              tier: table.tier,
              mobName: table.mobName,
              itemName: canonicalDrop.itemName,
              ...comparison,
            });
          }
        }
      }

      const canonicalItemNames = new Set(
        table.drops.map((drop) => drop.itemName),
      );

      for (const databaseDrop of mob.drops) {
        if (canonicalItemNames.has(databaseDrop.item.name)) continue;

        mismatches.push({
          tier: table.tier,
          mobName: table.mobName,
          itemName: databaseDrop.item.name,
          field: 'extraDrop',
          canonical: false,
          database: true,
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  return {
    status: mismatches.length === 0 ? 'HEALTHY' : 'DRIFT',
    checkedMobCount,
    checkedDropCount,
    mismatches,
  };
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
  const lines = [
    headers.map(escapeCsv).join(';'),
    ...rows.map((row) =>
      headers.map((header) => escapeCsv(row[header])).join(';'),
    ),
  ];

  return `\uFEFF${lines.join('\n')}\n`;
}

function buildMarkdown(
  report: VendorDropEconomyAudit,
  database: VendorDropDatabaseVerification | null,
) {
  const tierRows = report.tiers
    .map(
      (tier) =>
        `| T${tier.tier} | ${tier.expectedGoldPerKill} | ${tier.averageMixedKillsPerHour} | ${tier.averageGrossGoldPerHour} | ${tier.maximumGoldPerDropEvent} | ${tier.topMobByWeightedGold} | ${tier.topItemByGold} |`,
    )
    .join('\n');
  const findings =
    report.findings.length > 0
      ? report.findings
          .map(
            (finding) =>
              `- **${finding.severity} · T${finding.tier} · ${finding.entity}:** ${finding.message}`,
          )
          .join('\n')
      : '- Nenhuma concentracao acima dos limites configurados.';
  const databaseLine = database
    ? `${database.status}; ${database.checkedMobCount} mobs e ${database.checkedDropCount} drops conferidos; ${database.mismatches.length} divergencias.`
    : 'Nao verificado nesta execucao.';

  return (
    `# Auditoria de drops vendidos ao mercador\n\n` +
    `A auditoria usa os seis mobs ativos de cada tier, os pesos reais de encontro, o TTK das quatro classes com set atual e a formula autoritativa de venda ao Mercado Negro.\n\n` +
    `## Resumo por tier\n\n` +
    `| Tier | Gold/abate | Abates/h | Gold bruto/h | Maior valor por drop | Mob com maior contribuicao | Item com maior contribuicao |\n` +
    `|---|---:|---:|---:|---:|---|---|\n${tierRows}\n\n` +
    `## Achados\n\n${findings}\n\n` +
    `## Integridade\n\n` +
    `- Seeds: ${report.integrity.status}; ${report.integrity.activeMobCount} mobs e ${report.integrity.dropEntryCount} entradas de drop auditadas.\n` +
    `- Banco local: ${databaseLine}\n\n` +
    `Os CSVs desta pasta detalham tiers, monstros e itens. O campo \`Gold/h exclusivo\` simula apenas aquele mob; \`Gold/h ponderado\` representa sua contribuicao no mix real de encontros.\n`
  );
}

function writeReportFiles(
  report: VendorDropEconomyAudit,
  database: VendorDropDatabaseVerification | null,
  outputDir: string,
) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    resolve(outputDir, 'vendor-drop-audit.json'),
    `${JSON.stringify({ ...report, database }, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '01_resumo_por_tier.csv'),
    toCsv(
      report.tiers.map((tier) => ({
        tier: tier.tier,
        mobsAtivos: tier.activeMobCount,
        pesoTotal: tier.totalEncounterWeight,
        goldPorAbate: tier.expectedGoldPerKill,
        abatesPorHora: tier.averageMixedKillsPerHour,
        goldBrutoPorHora: tier.averageGrossGoldPerHour,
        valorUnitarioMedio: tier.averageItemUnitSellGold,
        valorUnitarioMaximo: tier.maximumItemUnitSellGold,
        valorMedioPorDrop: tier.averageGoldPerDropEvent,
        valorMaximoPorDrop: tier.maximumGoldPerDropEvent,
        topMob: tier.topMobByWeightedGold,
        topItem: tier.topItemByGold,
      })),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '02_gold_por_monstro.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.mobs.map((mob) => ({
          tier: mob.tier,
          rank: mob.rank,
          posicao: mob.position,
          monstro: mob.mobName,
          mapa: mob.mapName,
          submapa: mob.subMapName,
          pesoEncontro: mob.encounterWeight,
          frequenciaEncontroPercentual: mob.encounterSharePercent,
          unidadesEsperadasPorAbate: mob.expectedUnitsPerKill,
          goldEsperadoPorAbate: mob.expectedGoldPerKill,
          abatesPorHoraExclusivoMedio: mob.averageKillsPerHourIfExclusive,
          abatesPorHoraExclusivoMinimo: mob.minimumKillsPerHourIfExclusive,
          abatesPorHoraExclusivoMaximo: mob.maximumKillsPerHourIfExclusive,
          goldPorHoraExclusivoMedio: mob.averageGoldPerHourIfExclusive,
          goldPorHoraExclusivoMinimo: mob.minimumGoldPerHourIfExclusive,
          goldPorHoraExclusivoMaximo: mob.maximumGoldPerHourIfExclusive,
          goldPorHoraPonderado: mob.averageWeightedGoldPerHour,
          participacaoNoGoldPercentual: mob.weightedGoldSharePercent,
          razaoGoldPorAbateVsTier: mob.ratioToTierExpectedGoldPerKill,
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '03_valor_e_frequencia_por_item.csv'),
    toCsv(
      report.tiers.flatMap((tier) =>
        tier.items.map((item) => ({
          tierFarm: item.tier,
          item: item.itemName,
          tierItem: item.itemTier,
          raridade: item.rarity,
          valorVendaUnitario: item.unitSellGold,
          frequenciaPonderadaPercentual: item.weightedDropEventChancePercent,
          unidadesEsperadasPorAbate: item.weightedExpectedUnitsPerKill,
          quantidadeMediaQuandoDropa: item.averageQuantityWhenDropped,
          quantidadeMaximaQuandoDropa: item.maximumQuantityWhenDropped,
          valorMedioQuandoDropa: item.averageGoldPerDropEvent,
          valorMaximoQuandoDropa: item.maximumGoldPerDropEvent,
          goldEsperadoPorAbate: item.expectedGoldPerKill,
          unidadesEsperadasPorHora: item.averageExpectedUnitsPerHour,
          goldEsperadoPorHora: item.averageGoldPerHour,
          participacaoNoGoldPercentual: item.goldSharePercent,
          fontes: item.sources.map((source) => source.mobName).join(' | '),
        })),
      ),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, '04_achados.csv'),
    toCsv(
      report.findings.map((finding) => ({
        severidade: finding.severity,
        codigo: finding.code,
        tier: finding.tier,
        entidade: finding.entity,
        mensagem: finding.message,
      })),
    ),
    'utf8',
  );
  writeFileSync(
    resolve(outputDir, 'README.md'),
    buildMarkdown(report, database),
    'utf8',
  );
}

function printReport(
  report: VendorDropEconomyAudit,
  database: VendorDropDatabaseVerification | null,
  detailed: boolean,
) {
  console.log('Auditoria de drops vendidos ao mercador T1-T5');
  console.table(
    report.tiers.map((tier) => ({
      Tier: `T${tier.tier}`,
      'Gold/abate': tier.expectedGoldPerKill,
      'Abates/h': tier.averageMixedKillsPerHour,
      'Gold bruto/h': tier.averageGrossGoldPerHour,
      'Valor medio/drop': tier.averageGoldPerDropEvent,
      'Valor max/drop': tier.maximumGoldPerDropEvent,
      'Top mob': tier.topMobByWeightedGold,
      'Top item': tier.topItemByGold,
    })),
  );
  console.log('Gold por monstro');
  console.table(
    report.tiers.flatMap((tier) =>
      tier.mobs.map((mob) => ({
        Tier: `T${mob.tier}`,
        Rank: mob.rank,
        Monstro: mob.mobName,
        'Spawn %': mob.encounterSharePercent,
        'Gold/abate': mob.expectedGoldPerKill,
        'Gold/h exclusivo': mob.averageGoldPerHourIfExclusive,
        'Gold/h ponderado': mob.averageWeightedGoldPerHour,
        'Gold do tier %': mob.weightedGoldSharePercent,
      })),
    ),
  );

  if (detailed) {
    console.log('Valor e frequencia por item');
    console.table(
      report.tiers.flatMap((tier) =>
        tier.items.map((item) => ({
          Tier: `T${item.tier}`,
          Item: item.itemName,
          'Venda/un': item.unitSellGold,
          'Frequencia %': item.weightedDropEventChancePercent,
          'Media/drop': item.averageGoldPerDropEvent,
          'Max/drop': item.maximumGoldPerDropEvent,
          'Gold/h': item.averageGoldPerHour,
          'Gold do tier %': item.goldSharePercent,
        })),
      ),
    );
  }

  console.log(`Achados economicos: ${report.findings.length}.`);
  if (report.findings.length > 0) console.table(report.findings);
  if (database) {
    console.log(
      `Banco: ${database.status}; ${database.checkedMobCount} mobs; ${database.checkedDropCount} drops; ${database.mismatches.length} divergencias.`,
    );
    if (database.mismatches.length > 0) console.table(database.mismatches);
  }
}

async function main() {
  const report = buildVendorDropEconomyAudit();
  const verifyDatabase = process.argv.includes('--verify-database');
  const database = verifyDatabase
    ? await verifyVendorDropEconomyDatabase()
    : null;
  const outputDir = resolve(
    __dirname,
    '..',
    '..',
    '_reports',
    'economy',
    'vendor-drops',
  );

  if (process.argv.includes('--write')) {
    writeReportFiles(report, database, outputDir);
    console.log(`Relatorios gravados em ${outputDir}.`);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...report, database }, null, 2));
  } else {
    printReport(report, database, process.argv.includes('--detailed'));
  }

  if (
    process.argv.includes('--strict') &&
    (report.integrity.status !== 'HEALTHY' || database?.status === 'DRIFT')
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
