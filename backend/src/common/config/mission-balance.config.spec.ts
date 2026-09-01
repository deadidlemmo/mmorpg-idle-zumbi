import {
  getMissionBalanceTier,
  getMissionReward,
  MISSION_BALANCE_TIERS,
  MISSION_REWARD_MATRIX,
} from './mission-balance.config';
import { missionDefinitions } from '../../../prisma/seed-data/progression.seed-data';

describe('mission balance', () => {
  it.each([
    [1, 1],
    [10, 1],
    [11, 2],
    [30, 3],
    [41, 5],
    [100, 5],
  ])('maps level %i to launch tier %i', (level, tier) => {
    expect(getMissionBalanceTier(level)).toBe(tier);
  });

  it('keeps every canonical mission increasing from T1 to T5', () => {
    for (const rewardsByTier of Object.values(MISSION_REWARD_MATRIX)) {
      let previousGold = 0;
      let previousXp = 0;

      for (const tier of MISSION_BALANCE_TIERS) {
        const reward = rewardsByTier[tier];
        expect(reward.gold).toBeGreaterThan(previousGold);
        expect(reward.xp).toBeGreaterThan(previousXp);
        previousGold = reward.gold;
        previousXp = reward.xp;
      }
    }
  });

  it('defines an explicit T1-T5 reward matrix for every canonical mission', () => {
    expect(Object.keys(MISSION_REWARD_MATRIX).sort()).toEqual(
      missionDefinitions.map((mission) => mission.key).sort(),
    );
  });

  it('keeps stacked long-cycle rewards below a linear target multiplier', () => {
    for (const tier of MISSION_BALANCE_TIERS) {
      const dailyKills = MISSION_REWARD_MATRIX['daily-clear-threats'][tier];
      const weeklyKills = MISSION_REWARD_MATRIX['weekly-clear-horde'][tier];
      const monthlyKills = MISSION_REWARD_MATRIX['monthly-eradication'][tier];

      expect(weeklyKills.gold).toBeLessThan(dailyKills.gold * 10);
      expect(weeklyKills.xp).toBeLessThan(dailyKills.xp * 10);
      expect(monthlyKills.gold).toBeLessThan(dailyKills.gold * 50);
      expect(monthlyKills.xp).toBeLessThan(dailyKills.xp * 50);
    }
  });

  it('uses an explicit T5 crafting reward that covers the audited eligible recipe sink', () => {
    expect(MISSION_REWARD_MATRIX['daily-field-crafting'][5]).toEqual({
      gold: 13_000,
      xp: 990,
    });
  });

  it('scales unknown future definitions without exceeding the launch matrix', () => {
    expect(
      getMissionReward({
        missionKey: 'future-mission',
        tier: 8,
        baseGold: 10,
        baseXp: 20,
      }),
    ).toEqual({ tier: 5, gold: 120, xp: 220 });
  });
});
