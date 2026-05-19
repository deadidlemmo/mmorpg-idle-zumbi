import { MaterialOrigin } from '@prisma/client';
import { AUTO_COMBAT_ROUND_DURATION_SECONDS } from '../src/common/config/auto-combat.config';
import { GATHERING_RATE_BY_TIER } from '../src/common/config/gathering.config';
import {
  equipmentDefinitions,
  materialDefinitions,
} from './seed-data/items.seed-data';
import {
  mobDropItemDefinitions,
  mobDropTables,
} from './seed-data/mob-drops.seed-data';
import { recipeDefinitions } from './seed-data/recipes.seed-data';

type NumberSummary = {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
};

type RecipeTimeAudit = {
  outputItemName: string;
  className: string;
  slot: string;
  tier: number;
  gatheringHours: number;
  mobDropHours: number;
  totalHours: number;
  ingredients: Array<{
    itemName: string;
    quantity: number;
    origin: string;
    expectedHours: number;
    source?: string;
    expectedKills?: number;
  }>;
};

const GATHERING_ORIGINS = [
  MaterialOrigin.DESMANCHE,
  MaterialOrigin.COLETA,
  MaterialOrigin.CONTENCAO,
  MaterialOrigin.ARSENAL,
  MaterialOrigin.PATRULHA,
  MaterialOrigin.TECNOVARREDURA,
] as const;

const DEFAULT_TOP_LIMIT = 20;

const estimatedRoundsPerKillByTier: Record<number, number> = {
  1: 3,
  2: 3,
  3: 4,
  4: 4,
  5: 5,
  6: 5,
  7: 6,
  8: 6,
  9: 7,
  10: 7,
};

function parseOptions() {
  const topArg = process.argv.find((arg) => arg.startsWith('--top='));
  const roundOverrideArg = process.argv.find((arg) =>
    arg.startsWith('--rounds-per-kill='),
  );

  return {
    top: topArg ? Number(topArg.split('=')[1]) : DEFAULT_TOP_LIMIT,
    roundsPerKillOverride: roundOverrideArg
      ? Number(roundOverrideArg.split('=')[1])
      : null,
  };
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function increment(
  target: Record<string, number>,
  key: string,
  amount: number,
) {
  target[key] = (target[key] ?? 0) + amount;
}

function summarize(values: number[]): NumberSummary {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p90: 0 };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const percentile = (percent: number) => {
    const index = Math.min(
      sorted.length - 1,
      Math.floor((percent / 100) * sorted.length),
    );
    return sorted[index];
  };

  return {
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    avg: round(sum / sorted.length),
    p50: round(percentile(50)),
    p90: round(percentile(90)),
  };
}

function sortRecord(value: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
      .map(([key, amount]) => [key, round(amount)]),
  );
}

function sortedBy<T>(items: T[], compare: (left: T, right: T) => number) {
  return [...items].sort(compare);
}

function getGatheringRatePerHour(itemName: string) {
  const material = materialDefinitions.find((item) => item.name === itemName);

  if (!material || !material.isGatheringMaterial) return null;

  return (
    material.baseGatheringRatePerHour ??
    GATHERING_RATE_BY_TIER[material.tier] ??
    null
  );
}

function getEstimatedRoundsPerKill(tier: number, override: number | null) {
  if (override && Number.isFinite(override) && override > 0) return override;
  return estimatedRoundsPerKillByTier[tier] ?? estimatedRoundsPerKillByTier[10];
}

function getDropSources(
  itemName: string,
  roundsPerKillOverride: number | null,
) {
  return mobDropTables
    .flatMap((table) =>
      table.drops
        .filter((drop) => drop.itemName === itemName)
        .map((drop) => {
          const averageQuantity = (drop.minQuantity + drop.maxQuantity) / 2;
          const expectedQuantityPerKill =
            (drop.dropChance / 100) * averageQuantity;
          const roundsPerKill = getEstimatedRoundsPerKill(
            table.tier,
            roundsPerKillOverride,
          );
          const hoursPerKill =
            (roundsPerKill * AUTO_COMBAT_ROUND_DURATION_SECONDS) / 3600;

          return {
            mobName: table.mobName,
            tier: table.tier,
            mapName: table.mapName,
            subMapName: table.subMapName,
            dropChance: drop.dropChance,
            averageQuantity,
            expectedQuantityPerKill,
            hoursPerKill,
          };
        }),
    )
    .sort((left, right) => {
      const leftRate = left.expectedQuantityPerKill / left.hoursPerKill;
      const rightRate = right.expectedQuantityPerKill / right.hoursPerKill;
      return rightRate - leftRate;
    });
}

function buildRecipeAudits(roundsPerKillOverride: number | null) {
  const equipmentByName = new Map(
    equipmentDefinitions.map((item) => [item.name, item]),
  );
  const missingGatheringRates: string[] = [];
  const missingDropSources: string[] = [];

  const recipes: RecipeTimeAudit[] = recipeDefinitions.map((recipe) => {
    const outputItem = equipmentByName.get(recipe.outputItemName);
    let gatheringHours = 0;
    let mobDropHours = 0;

    const ingredients = recipe.ingredients.map((ingredient) => {
      if (ingredient.origin !== MaterialOrigin.DROP_MOBS) {
        const ratePerHour = getGatheringRatePerHour(ingredient.itemName);

        if (!ratePerHour || ratePerHour <= 0) {
          missingGatheringRates.push(ingredient.itemName);
          return {
            itemName: ingredient.itemName,
            quantity: ingredient.quantity,
            origin: ingredient.origin,
            expectedHours: Number.POSITIVE_INFINITY,
          };
        }

        const expectedHours = ingredient.quantity / ratePerHour;
        gatheringHours += expectedHours;

        return {
          itemName: ingredient.itemName,
          quantity: ingredient.quantity,
          origin: ingredient.origin,
          expectedHours,
        };
      }

      const bestDropSource = getDropSources(
        ingredient.itemName,
        roundsPerKillOverride,
      )[0];

      if (!bestDropSource || bestDropSource.expectedQuantityPerKill <= 0) {
        missingDropSources.push(ingredient.itemName);
        return {
          itemName: ingredient.itemName,
          quantity: ingredient.quantity,
          origin: ingredient.origin,
          expectedHours: Number.POSITIVE_INFINITY,
        };
      }

      const expectedKills =
        ingredient.quantity / bestDropSource.expectedQuantityPerKill;
      const expectedHours = expectedKills * bestDropSource.hoursPerKill;
      mobDropHours += expectedHours;

      return {
        itemName: ingredient.itemName,
        quantity: ingredient.quantity,
        origin: ingredient.origin,
        expectedHours,
        expectedKills,
        source: `${bestDropSource.mobName} (${bestDropSource.mapName} / ${bestDropSource.subMapName})`,
      };
    });

    return {
      outputItemName: recipe.outputItemName,
      className: outputItem?.className ?? 'UNKNOWN',
      slot: outputItem?.slot ?? 'UNKNOWN',
      tier: recipe.tier,
      gatheringHours,
      mobDropHours,
      totalHours: gatheringHours + mobDropHours,
      ingredients,
    };
  });

  return {
    recipes,
    missingGatheringRates: [...new Set(missingGatheringRates)].sort(),
    missingDropSources: [...new Set(missingDropSources)].sort(),
  };
}

function buildGroupedSummaries(recipes: RecipeTimeAudit[]) {
  const byTier: Record<string, RecipeTimeAudit[]> = {};
  const byClass: Record<string, RecipeTimeAudit[]> = {};
  const byClassTier: Record<string, RecipeTimeAudit[]> = {};

  for (const recipe of recipes) {
    (byTier[recipe.tier] ??= []).push(recipe);
    (byClass[recipe.className] ??= []).push(recipe);
    (byClassTier[`${recipe.className}|T${recipe.tier}`] ??= []).push(recipe);
  }

  const summarizeRecipes = (items: RecipeTimeAudit[]) => ({
    count: items.length,
    totalHours: summarize(items.map((recipe) => recipe.totalHours)),
    gatheringHours: summarize(items.map((recipe) => recipe.gatheringHours)),
    mobDropHours: summarize(items.map((recipe) => recipe.mobDropHours)),
  });

  return {
    byTier: Object.fromEntries(
      Object.entries(byTier)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([key, items]) => [key, summarizeRecipes(items)]),
    ),
    byClass: Object.fromEntries(
      Object.entries(byClass)
        .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
        .map(([key, items]) => [key, summarizeRecipes(items)]),
    ),
    byClassTier: Object.fromEntries(
      Object.entries(byClassTier)
        .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
        .map(([key, items]) => [key, summarizeRecipes(items)]),
    ),
  };
}

function buildOriginPressure(recipes: RecipeTimeAudit[]) {
  const demandByOrigin = Object.fromEntries(
    GATHERING_ORIGINS.map((origin) => [origin, 0]),
  );
  const hoursByOrigin = Object.fromEntries(
    GATHERING_ORIGINS.map((origin) => [origin, 0]),
  );
  const demandByTierOrigin: Record<string, number> = {};
  const hoursByTierOrigin: Record<string, number> = {};

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      if (ingredient.origin === MaterialOrigin.DROP_MOBS) continue;

      increment(demandByOrigin, ingredient.origin, ingredient.quantity);
      increment(hoursByOrigin, ingredient.origin, ingredient.expectedHours);
      increment(
        demandByTierOrigin,
        `T${recipe.tier}|${ingredient.origin}`,
        ingredient.quantity,
      );
      increment(
        hoursByTierOrigin,
        `T${recipe.tier}|${ingredient.origin}`,
        ingredient.expectedHours,
      );
    }
  }

  const originHours = GATHERING_ORIGINS.map((origin) => hoursByOrigin[origin]);

  return {
    demandByOrigin: sortRecord(demandByOrigin),
    hoursByOrigin: sortRecord(hoursByOrigin),
    hoursByOriginSummary: summarize(originHours),
    demandByTierOrigin: sortRecord(demandByTierOrigin),
    hoursByTierOrigin: sortRecord(hoursByTierOrigin),
  };
}

function buildDropPressure(recipes: RecipeTimeAudit[]) {
  const demandByDropItem: Record<string, number> = {};
  const hoursByDropItem: Record<string, number> = {};
  const demandByDropFamily: Record<string, number> = {};
  const hoursByDropFamily: Record<string, number> = {};
  const dropMetaByName = new Map(
    mobDropItemDefinitions.map((item) => [item.name, item]),
  );

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      if (ingredient.origin !== MaterialOrigin.DROP_MOBS) continue;

      const meta = dropMetaByName.get(ingredient.itemName);
      const family = `${meta?.rarity ?? 'UNKNOWN'}|${
        meta?.family ?? 'UNKNOWN'
      }`;

      increment(demandByDropItem, ingredient.itemName, ingredient.quantity);
      increment(hoursByDropItem, ingredient.itemName, ingredient.expectedHours);
      increment(demandByDropFamily, family, ingredient.quantity);
      increment(hoursByDropFamily, family, ingredient.expectedHours);
    }
  }

  return {
    demandByDropItem: sortRecord(demandByDropItem),
    hoursByDropItem: sortRecord(hoursByDropItem),
    demandByDropFamily: sortRecord(demandByDropFamily),
    hoursByDropFamily: sortRecord(hoursByDropFamily),
  };
}

function buildWarnings(report: {
  recipes: RecipeTimeAudit[];
  originPressure: ReturnType<typeof buildOriginPressure>;
  missingGatheringRates: string[];
  missingDropSources: string[];
}) {
  const warnings: string[] = [];
  const originHourSpreadWarningThreshold = 1.4;

  if (report.missingGatheringRates.length > 0) {
    warnings.push(
      `Existem materiais de gathering sem taxa: ${report.missingGatheringRates.length}.`,
    );
  }

  if (report.missingDropSources.length > 0) {
    warnings.push(
      `Existem drops usados em receitas sem fonte de mob: ${report.missingDropSources.length}.`,
    );
  }

  const originSpread = report.originPressure.hoursByOriginSummary;

  if (
    originSpread.max > 0 &&
    originSpread.max / Math.max(originSpread.min, 0.01) >
      originHourSpreadWarningThreshold
  ) {
    warnings.push(
      `Tempo por origem tem spread acima de 40%: min=${originSpread.min}h, max=${originSpread.max}h.`,
    );
  }

  const tierAverages = Object.entries(buildGroupedSummaries(report.recipes).byTier)
    .map(([tier, summary]) => [Number(tier), summary.totalHours.avg] as const)
    .sort(([left], [right]) => left - right);

  for (let index = 1; index < tierAverages.length; index += 1) {
    const [tier, average] = tierAverages[index];
    const [previousTier, previousAverage] = tierAverages[index - 1];

    if (average < previousAverage) {
      warnings.push(
        `Tempo medio do T${tier} (${average}h) ficou abaixo do T${previousTier} (${previousAverage}h).`,
      );
    }
  }

  return warnings;
}

function serializeRecipe(recipe: RecipeTimeAudit) {
  return {
    outputItemName: recipe.outputItemName,
    className: recipe.className,
    slot: recipe.slot,
    tier: recipe.tier,
    gatheringHours: round(recipe.gatheringHours),
    mobDropHours: round(recipe.mobDropHours),
    totalHours: round(recipe.totalHours),
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      expectedHours: round(ingredient.expectedHours),
      expectedKills:
        ingredient.expectedKills === undefined
          ? undefined
          : round(ingredient.expectedKills),
    })),
  };
}

function main() {
  const options = parseOptions();
  const { recipes, missingGatheringRates, missingDropSources } =
    buildRecipeAudits(options.roundsPerKillOverride);
  const finiteRecipes = recipes.filter((recipe) =>
    Number.isFinite(recipe.totalHours),
  );
  const originPressure = buildOriginPressure(finiteRecipes);
  const reportBase = {
    recipes: finiteRecipes,
    originPressure,
    missingGatheringRates,
    missingDropSources,
  };

  const report = {
    assumptions: {
      gatheringRatesByTier: GATHERING_RATE_BY_TIER,
      autoCombatRoundDurationSeconds: AUTO_COMBAT_ROUND_DURATION_SECONDS,
      estimatedRoundsPerKillByTier: options.roundsPerKillOverride
        ? `override:${options.roundsPerKillOverride}`
        : estimatedRoundsPerKillByTier,
      dropTimeModel:
        'expectedHours = requiredQty / (dropChance * avgQuantity) * estimatedHoursPerKill',
    },
    coverage: {
      recipes: recipes.length,
      finiteRecipes: finiteRecipes.length,
      missingGatheringRates,
      missingDropSources,
    },
    totalRecipeTime: summarize(
      finiteRecipes.map((recipe) => recipe.totalHours),
    ),
    grouped: buildGroupedSummaries(finiteRecipes),
    originPressure,
    dropPressure: buildDropPressure(finiteRecipes),
    bottlenecks: {
      slowestRecipes: sortedBy(
        finiteRecipes,
        (left, right) => right.totalHours - left.totalHours,
      )
        .slice(0, options.top)
        .map(serializeRecipe),
      fastestRecipes: sortedBy(
        finiteRecipes,
        (left, right) => left.totalHours - right.totalHours,
      )
        .slice(0, options.top)
        .map(serializeRecipe),
      slowestIngredients: sortedBy(
        finiteRecipes.flatMap((recipe) =>
          recipe.ingredients.map((ingredient) => ({
            outputItemName: recipe.outputItemName,
            className: recipe.className,
            tier: recipe.tier,
            itemName: ingredient.itemName,
            origin: ingredient.origin,
            expectedHours: ingredient.expectedHours,
            source: ingredient.source,
          })),
        )
          .filter((ingredient) => Number.isFinite(ingredient.expectedHours)),
        (left, right) => right.expectedHours - left.expectedHours,
      )
        .slice(0, options.top)
        .map((ingredient) => ({
          ...ingredient,
          expectedHours: round(ingredient.expectedHours),
        })),
    },
    warnings: buildWarnings(reportBase),
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
