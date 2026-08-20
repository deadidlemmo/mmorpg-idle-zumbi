import {
  calculateIncursionFailureDamage,
  getIncursionRiskProfile,
} from './incursion-risk.util';

describe('incursion risk', () => {
  it('trades safety and time for lower rewards', () => {
    const cautious = getIncursionRiskProfile(6, 'CAUTIOUS');
    const balanced = getIncursionRiskProfile(6, 'BALANCED');
    const aggressive = getIncursionRiskProfile(6, 'AGGRESSIVE');

    expect(cautious.successChance).toBeGreaterThan(balanced.successChance);
    expect(aggressive.successChance).toBeLessThan(balanced.successChance);
    expect(cautious.durationMultiplier).toBeGreaterThan(1);
    expect(aggressive.durationMultiplier).toBeLessThan(1);
    expect(cautious.rewardMultiplier).toBeLessThan(1);
    expect(aggressive.rewardMultiplier).toBeGreaterThan(1);
  });

  it('keeps probabilities bounded at the risk extremes', () => {
    expect(getIncursionRiskProfile(-50, 'CAUTIOUS').successChance).toBe(98);
    expect(getIncursionRiskProfile(99, 'AGGRESSIVE').successChance).toBe(31);
  });

  it('increases failure damage with risk and approach', () => {
    expect(
      calculateIncursionFailureDamage(100, 8, 'AGGRESSIVE'),
    ).toBeGreaterThan(calculateIncursionFailureDamage(100, 2, 'CAUTIOUS'));
  });
});
