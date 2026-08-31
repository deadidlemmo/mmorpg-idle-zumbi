import { IncursionRewardType } from '@prisma/client';
import { incursionDefinitions } from '../../../prisma/seed-data/incursions.seed-data';
import {
  ECONOMY_ACTIVITY_REWARDS,
  getIncursionTokenItemByTier,
} from '../../common/config/economy.config';

describe('incursion launch balance', () => {
  const expectedXpByTier = {
    1: [650, 690],
    2: [630, 760],
    3: [910, 1220],
    4: [1350, 1740],
    5: [2440, 3280],
  } as const;

  it('keeps XP and guaranteed victory Gold calibrated for T1-T5', () => {
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const definitions = incursionDefinitions
        .filter((definition) => definition.tier === tier)
        .sort((left, right) => left.sortOrder - right.sortOrder);

      expect(definitions).toHaveLength(2);

      definitions.forEach((definition, index) => {
        const xp = definition.lootTable.find(
          (reward) => reward.rewardType === IncursionRewardType.XP,
        );
        const gold = definition.lootTable.find(
          (reward) => reward.rewardType === IncursionRewardType.GOLD,
        );

        expect(xp).toMatchObject({
          chance: 100,
          guaranteed: true,
          minQuantity: expectedXpByTier[tier][index],
          maxQuantity: expectedXpByTier[tier][index],
        });
        expect(gold).toMatchObject({
          chance: 100,
          guaranteed: true,
        });
      });
    }
  });

  it('does not increase launch token or reinforcement-fragment quantities', () => {
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const tokenName = getIncursionTokenItemByTier(tier)?.name;
      const definitions = incursionDefinitions
        .filter((definition) => definition.tier === tier)
        .sort((left, right) => left.sortOrder - right.sortOrder);

      definitions.forEach((definition, index) => {
        const token = definition.lootTable.find(
          (reward) => reward.itemName === tokenName,
        );
        const reinforcement = definition.lootTable.find(
          (reward) => reward.itemName === `Fragmento de Reforço T${tier}`,
        );

        expect(token).toMatchObject({
          chance: 100,
          guaranteed: true,
          minQuantity: ECONOMY_ACTIVITY_REWARDS.incursionTokens[tier].min,
          maxQuantity: ECONOMY_ACTIVITY_REWARDS.incursionTokens[tier].max,
        });
        expect(reinforcement).toMatchObject({
          chance: 100,
          guaranteed: true,
          minQuantity:
            ECONOMY_ACTIVITY_REWARDS.incursionReinforcementFragments[tier][
              index
            ].min,
          maxQuantity:
            ECONOMY_ACTIVITY_REWARDS.incursionReinforcementFragments[tier][
              index
            ].max,
        });
      });
    }
  });
});
