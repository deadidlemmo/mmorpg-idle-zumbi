import { IncursionRewardType } from '@prisma/client';
import { incursionDefinitions } from '../../../prisma/seed-data/incursions.seed-data';
import { getIncursionTokenItemByTier } from './economy.config';

describe('Recompensas físicas de incursão', () => {
  it('concede fichas T1-T5 como itens do inventário, nunca como saldo', () => {
    const launchIncursions = incursionDefinitions.filter(
      (incursion) => incursion.tier <= 5,
    );

    expect(launchIncursions).toHaveLength(10);

    for (const incursion of launchIncursions) {
      const definition = getIncursionTokenItemByTier(incursion.tier);
      const tokenReward = incursion.lootTable.find(
        (reward) => reward.itemName === definition?.name,
      );

      expect(tokenReward).toMatchObject({
        rewardType: IncursionRewardType.MATERIAL,
        chance: 100,
        guaranteed: true,
      });
      expect(tokenReward?.currency).toBeUndefined();
    }

    expect(
      incursionDefinitions
        .flatMap((incursion) => incursion.lootTable)
        .some(
          (reward) => reward.currency !== undefined && reward.currency !== null,
        ),
    ).toBe(false);
  });
});
