import {
  applyPremiumXpBonus,
  calculatePremiumXpBreakdown,
} from './membership.util';

describe('membership.util', () => {
  it('concede 50% de EXP adicional a contas Premium', () => {
    expect(applyPremiumXpBonus(100, true)).toBe(150);
    expect(applyPremiumXpBonus(100, false)).toBe(100);
  });

  it('separa corretamente a EXP base e o bônus Premium', () => {
    expect(calculatePremiumXpBreakdown(100, true)).toMatchObject({
      baseXp: 100,
      premiumBonusXp: 50,
      premiumTotalXp: 150,
      totalXp: 150,
    });
  });
});
