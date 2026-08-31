import { IncursionRewardType } from '@prisma/client';
import { incursionDefinitions } from '../prisma/seed-data/incursions.seed-data';
import {
  ECONOMY_EXCHANGE_CONFIG,
  getIncursionTokenItemByTier,
  type EconomyLaunchTier,
} from '../src/common/config/economy.config';
import { getIncursionRiskProfile } from '../src/modules/incursions/incursion-risk.util';

function averageLootQuantity(range: {
  minQuantity: number;
  maxQuantity: number;
}) {
  return (range.minQuantity + range.maxQuantity) / 2;
}

export function getBestBalancedReinforcementRate(tier: EconomyLaunchTier) {
  const tokenItem = getIncursionTokenItemByTier(tier);
  if (!tokenItem) return null;

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
          reward.rewardType === IncursionRewardType.MATERIAL &&
          reward.itemName === tokenItem.name,
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
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> => !!candidate,
    )
    .sort((left, right) => right.fragmentsPerHour - left.fragmentsPerHour);

  return candidates[0] ?? null;
}
