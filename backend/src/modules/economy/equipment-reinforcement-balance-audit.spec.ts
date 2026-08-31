import { ECONOMY_LAUNCH_TIERS } from '../../common/config/economy.config';
import { getBestBalancedReinforcementRate } from '../../../scripts/equipment-reinforcement-balance-audit';

describe('equipment reinforcement balance audit', () => {
  it.each(ECONOMY_LAUNCH_TIERS)(
    'reads physical incursion-token rewards when calculating T%s',
    (tier) => {
      const rate = getBestBalancedReinforcementRate(tier);

      expect(rate).not.toBeNull();
      if (!rate) throw new Error(`Taxa de reforço T${tier} ausente.`);

      expect(rate.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(rate.fragmentsPerSuccess)).toBe(true);
      expect(Number.isFinite(rate.fragmentsPerHour)).toBe(true);
      expect(Number.isFinite(rate.successChance)).toBe(true);
      expect(Number.isFinite(rate.durationMinutes)).toBe(true);
      expect(rate.fragmentsPerSuccess).toBeGreaterThan(0);
      expect(rate.fragmentsPerHour).toBeGreaterThan(0);
    },
  );
});
