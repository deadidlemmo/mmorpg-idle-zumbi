import {
  GATHERING_RATE_BY_TIER,
  getGatheringMaterialBaseRatePerHour,
  getGatheringMaterialTierStartLevel,
  getGatheringMaterialXpPerUnit,
  getGatheringXpPerUnitForTier,
  resolveGatheringMaterialBaseRatePerHour,
  resolveGatheringMaterialXpPerUnit,
} from './gathering.config';

describe('progressão dos materiais de gathering', () => {
  it.each(Array.from({ length: 10 }, (_, index) => index + 1))(
    'diferencia o material avançado do T%s sem criar atalho relevante de XP/h',
    (tier) => {
      const basicRequiredLevel = getGatheringMaterialTierStartLevel(tier);
      const advancedRequiredLevel = basicRequiredLevel + 4;
      const basicXp = getGatheringMaterialXpPerUnit({
        tier,
        requiredGatheringLevel: basicRequiredLevel,
      });
      const advancedXp = getGatheringMaterialXpPerUnit({
        tier,
        requiredGatheringLevel: advancedRequiredLevel,
      });
      const basicRate = getGatheringMaterialBaseRatePerHour({
        tier,
        requiredGatheringLevel: basicRequiredLevel,
      });
      const advancedRate = getGatheringMaterialBaseRatePerHour({
        tier,
        requiredGatheringLevel: advancedRequiredLevel,
      });
      const basicXpPerHour = basicXp * basicRate;
      const advancedXpPerHour = advancedXp * advancedRate;
      const xpPerHourDeviation =
        Math.abs(advancedXpPerHour - basicXpPerHour) / basicXpPerHour;

      expect(basicXp).toBe(getGatheringXpPerUnitForTier(tier));
      expect(basicRate).toBe(GATHERING_RATE_BY_TIER[tier]);
      expect(advancedXp).toBeGreaterThan(basicXp);
      expect(advancedRate).toBeLessThan(basicRate);
      expect(xpPerHourDeviation).toBeLessThanOrEqual(0.03);
    },
  );

  it('corrige os valores legados do material avançado e preserva overrides reais', () => {
    expect(
      resolveGatheringMaterialXpPerUnit({
        tier: 2,
        requiredGatheringLevel: 10,
        gatheringXpPerUnit: 6,
      }),
    ).toBe(8);
    expect(
      resolveGatheringMaterialBaseRatePerHour({
        tier: 2,
        requiredGatheringLevel: 10,
        baseGatheringRatePerHour: null,
      }),
    ).toBe(56);
    expect(
      resolveGatheringMaterialXpPerUnit({
        tier: 2,
        requiredGatheringLevel: 10,
        gatheringXpPerUnit: 9,
      }),
    ).toBe(9);
  });
});
