import {
  EconomyCurrency,
  IncursionRewardType,
  ItemSlot,
  PrismaClient,
} from '@prisma/client';
import 'dotenv/config';
import { buildRecipeAudits } from '../prisma/audit-economy-time';
import { incursionDefinitions } from '../prisma/seed-data/incursions.seed-data';
import {
  ECONOMY_ACTIVITY_REWARDS,
  ECONOMY_EXCHANGE_CONFIG,
  ECONOMY_LAUNCH_TIERS,
  EQUIPMENT_REINFORCEMENT_CONFIG,
  EQUIPMENT_REINFORCEMENT_MAX_LEVEL,
  buildReinforcedEquipmentStats,
  type EconomyLaunchTier,
  type EquipmentReinforcementSlot,
  type EquipmentReinforcementStats,
} from '../src/common/config/economy.config';
import { getIncursionRiskProfile } from '../src/modules/incursions/incursion-risk.util';

const prisma = new PrismaClient();

const EQUIPMENT_SLOTS = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;

const STAT_KEYS = [
  'strengthBonus',
  'vitalityBonus',
  'agilityBonus',
  'precisionBonus',
  'techniqueBonus',
  'willpowerBonus',
] as const satisfies ReadonlyArray<keyof EquipmentReinforcementStats>;

type AuditedItem = {
  id: string;
  name: string;
  tier: number;
  slot: ItemSlot;
  family: string;
  classId: string | null;
  baseItemId: string | null;
  enhancementLevel: number;
} & EquipmentReinforcementStats;

function getStats(item: AuditedItem): EquipmentReinforcementStats {
  return STAT_KEYS.reduce((stats, key) => {
    stats[key] = item[key];
    return stats;
  }, {} as EquipmentReinforcementStats);
}

function getBudget(item: AuditedItem) {
  return STAT_KEYS.reduce((total, key) => total + item[key], 0);
}

function getFamilyKey(item: AuditedItem, tier = item.tier) {
  return [item.classId, item.slot, item.family, tier].join(':');
}

function averageReward(range: { min: number; max: number }) {
  return (range.min + range.max) / 2;
}

function averageLootQuantity(range: {
  minQuantity: number;
  maxQuantity: number;
}) {
  return (range.minQuantity + range.maxQuantity) / 2;
}

function getBestBalancedReinforcementRate(tier: EconomyLaunchTier) {
  const candidates = incursionDefinitions
    .filter((incursion) => incursion.tier === tier)
    .map((incursion) => {
      const risk = getIncursionRiskProfile(incursion.riskLevel, 'BALANCED');
      const reinforcementReward = incursion.lootTable.find(
        (reward) =>
          reward.rewardType === IncursionRewardType.MATERIAL &&
          reward.itemName === `Fragmento de Reforço T${tier}`,
      );
      const tokenReward = incursion.lootTable.find(
        (reward) =>
          reward.rewardType === IncursionRewardType.CURRENCY &&
          reward.currency === EconomyCurrency.INCURSION_TOKEN,
      );

      if (!reinforcementReward || !tokenReward) return null;

      const directPerSuccess = averageLootQuantity(reinforcementReward);
      const tokensPerSuccess = averageLootQuantity(tokenReward);
      const convertedPerSuccess =
        (tokensPerSuccess /
          ECONOMY_EXCHANGE_CONFIG.incursionReinforcement.currencyCost) *
        ECONOMY_EXCHANGE_CONFIG.incursionReinforcement.itemQuantity;
      const fragmentsPerSuccess = directPerSuccess + convertedPerSuccess;
      const fragmentsPerAttempt =
        fragmentsPerSuccess * (risk.successChance / 100);
      const durationHours =
        (incursion.durationSeconds * risk.durationMultiplier) / 3600;

      return {
        name: incursion.name,
        fragmentsPerSuccess,
        fragmentsPerHour: fragmentsPerAttempt / durationHours,
        successChance: risk.successChance,
        durationMinutes: durationHours * 60,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
    .sort(
      (left, right) => right.fragmentsPerHour - left.fragmentsPerHour,
    );

  return candidates[0] ?? null;
}

async function main() {
  const recipeAudits = buildRecipeAudits(null).recipes.filter((recipe) =>
    Number.isFinite(recipe.totalHours),
  );
  const items = (await prisma.item.findMany({
    where: {
      tier: { in: Array.from(ECONOMY_LAUNCH_TIERS) },
      slot: { in: Array.from(EQUIPMENT_SLOTS) },
      classId: { not: null },
    },
    select: {
      id: true,
      name: true,
      tier: true,
      slot: true,
      family: true,
      classId: true,
      baseItemId: true,
      enhancementLevel: true,
      strengthBonus: true,
      vitalityBonus: true,
      agilityBonus: true,
      precisionBonus: true,
      techniqueBonus: true,
      willpowerBonus: true,
    },
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
  })) as AuditedItem[];

  const baseItems = items.filter(
    (item) => item.enhancementLevel === 0 && item.baseItemId === null,
  );
  const variantsByBase = new Map<string, AuditedItem[]>();
  const baseByFamilyTier = new Map(
    baseItems.map((item) => [getFamilyKey(item), item]),
  );
  const errors: string[] = [];

  for (const item of items) {
    if (!item.baseItemId) continue;
    const variants = variantsByBase.get(item.baseItemId) ?? [];
    variants.push(item);
    variantsByBase.set(item.baseItemId, variants);
  }

  for (const baseItem of baseItems) {
    const variants = (variantsByBase.get(baseItem.id) ?? []).sort(
      (left, right) => left.enhancementLevel - right.enhancementLevel,
    );
    const levels = variants.map((variant) => variant.enhancementLevel);

    if (levels.join(',') !== '1,2,3') {
      errors.push(
        `${baseItem.name}: variantes esperadas 1,2,3; encontradas ${levels.join(',') || 'nenhuma'}.`,
      );
      continue;
    }

    let previousBudget = getBudget(baseItem);
    for (const variant of variants) {
      const expectedStats = buildReinforcedEquipmentStats(
        getStats(baseItem),
        baseItem.tier,
        baseItem.slot as EquipmentReinforcementSlot,
        variant.enhancementLevel,
      );
      for (const statKey of STAT_KEYS) {
        if (variant[statKey] !== expectedStats[statKey]) {
          errors.push(
            `${variant.name}: ${statKey}=${variant[statKey]}, esperado ${expectedStats[statKey]}.`,
          );
        }
      }

      const variantBudget = getBudget(variant);
      if (variantBudget <= previousBudget) {
        errors.push(
          `${variant.name}: orçamento ${variantBudget} não supera ${previousBudget}.`,
        );
      }
      previousBudget = variantBudget;
    }

    if (baseItem.tier >= 5) continue;
    const nextBase = baseByFamilyTier.get(
      getFamilyKey(baseItem, baseItem.tier + 1),
    );
    if (!nextBase) {
      errors.push(
        `${baseItem.name}: equipamento-base do próximo tier ausente.`,
      );
      continue;
    }

    const currentPlusThree = variants[2];
    const nextPlusOne = (variantsByBase.get(nextBase.id) ?? []).find(
      (variant) => variant.enhancementLevel === 1,
    );
    if (!nextPlusOne) {
      errors.push(`${nextBase.name}: variante +1 ausente.`);
      continue;
    }

    if (getBudget(currentPlusThree) <= getBudget(nextBase)) {
      errors.push(
        `${currentPlusThree.name} deve superar ${nextBase.name} base.`,
      );
    }
    if (getBudget(nextPlusOne) <= getBudget(currentPlusThree)) {
      errors.push(`${nextPlusOne.name} deve superar ${currentPlusThree.name}.`);
    }
  }

  const expectedVariants = baseItems.length * EQUIPMENT_REINFORCEMENT_MAX_LEVEL;
  const actualVariants = items.filter(
    (item) => item.enhancementLevel > 0,
  ).length;
  if (actualVariants !== expectedVariants) {
    errors.push(
      `Catálogo possui ${actualVariants} variantes; esperado ${expectedVariants}.`,
    );
  }

  const effortRows = ECONOMY_LAUNCH_TIERS.map((tier) => {
    const costs = EQUIPMENT_REINFORCEMENT_CONFIG[tier].levels;
    const fragmentCost = costs.reduce(
      (total, level) => total + level.fragmentCost,
      0,
    );
    const goldCost = costs.reduce((total, level) => total + level.goldCost, 0);
    const directRanges =
      ECONOMY_ACTIVITY_REWARDS.incursionReinforcementFragments[tier];
    const directAverage =
      directRanges.reduce((total, reward) => total + averageReward(reward), 0) /
      directRanges.length;
    const tokenAverage = averageReward(
      ECONOMY_ACTIVITY_REWARDS.incursionTokens[tier],
    );
    const exchangeAverage =
      (tokenAverage /
        ECONOMY_EXCHANGE_CONFIG.incursionReinforcement.currencyCost) *
      ECONOMY_EXCHANGE_CONFIG.incursionReinforcement.itemQuantity;
    const expectedSuccesses = fragmentCost / (directAverage + exchangeAverage);
    const bestRate = getBestBalancedReinforcementRate(tier);
    const reinforcementHours = bestRate
      ? fragmentCost / bestRate.fragmentsPerHour
      : null;
    const nextTierRecipes = recipeAudits.filter(
      (recipe) => recipe.tier === tier + 1,
    );
    const nextTierCraftHours = nextTierRecipes.length
      ? nextTierRecipes.reduce(
          (total, recipe) => total + recipe.totalHours,
          0,
        ) / nextTierRecipes.length
      : null;
    const timeRatio =
      reinforcementHours !== null && nextTierCraftHours !== null
        ? reinforcementHours / nextTierCraftHours
        : null;

    if (expectedSuccesses < 1.5 || expectedSuccesses > 3.5) {
      errors.push(
        `T${tier}: esforço esperado de ${expectedSuccesses.toFixed(2)} incursões para +3 está fora da faixa 1,5-3,5.`,
      );
    }
    if (!bestRate || !Number.isFinite(reinforcementHours)) {
      errors.push(`T${tier}: incursão com recompensa de reforço ausente.`);
    }
    if (timeRatio !== null && timeRatio > 0.85) {
      errors.push(
        `T${tier}: chegar a +3 leva ${(reinforcementHours ?? 0).toFixed(2)}h, mais de 85% das ${nextTierCraftHours?.toFixed(2)}h para fabricar um item T${tier + 1}.`,
      );
    }

    return {
      Tier: `T${tier}`,
      'Fragmentos +3': fragmentCost,
      'Gold +3': goldCost,
      'Fragmentos/incursão': Number(directAverage.toFixed(2)),
      'Com fichas/incursão': Number(
        (directAverage + exchangeAverage).toFixed(2),
      ),
      'Sucessos por +3': Number(expectedSuccesses.toFixed(2)),
      'Sucessos sem fichas': Number((fragmentCost / directAverage).toFixed(2)),
      'Melhor incursão': bestRate?.name ?? '-',
      'Tempo +3':
        reinforcementHours === null
          ? '-'
          : `${reinforcementHours.toFixed(2)}h`,
      'Próximo tier':
        nextTierCraftHours === null
          ? '-'
          : `T${tier + 1} em ${nextTierCraftHours.toFixed(2)}h`,
      'Tempo relativo':
        timeRatio === null ? '-' : `${(timeRatio * 100).toFixed(1)}%`,
    };
  });

  console.log(
    `Catálogo auditado: ${baseItems.length} equipamentos-base e ${actualVariants} variantes +1/+2/+3.`,
  );
  console.table(effortRows);

  if (errors.length > 0) {
    console.error(`Falha de balanceamento: ${errors.length} problema(s).`);
    for (const error of errors.slice(0, 30)) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Balanceamento válido: Tn+3 supera o próximo tier base, e o próximo tier +1 retoma a vantagem.',
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
