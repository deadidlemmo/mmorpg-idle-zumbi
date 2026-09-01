import { buildTierEconomyReport } from '../../../scripts/simulate-tier-economy';
import { buildVendorDropEconomyAudit } from '../../../scripts/audit-vendor-drop-economy';

describe('real T1-T5 economy simulator', () => {
  const report = buildTierEconomyReport();

  it('uses all launch tiers and the actual NPC drop values', () => {
    expect(report.tiers.map((tier) => tier.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(report.tiers[0].drops.expectedGoldPerKill).toBeCloseTo(4.0155, 4);
    expect(report.tiers[1].drops.expectedGoldPerKill).toBeCloseTo(9.8859, 4);
    expect(report.tiers[2].drops.expectedGoldPerKill).toBeCloseTo(18.499, 3);
    expect(report.tiers[3].drops.expectedGoldPerKill).toBeCloseTo(42.4941, 4);
    expect(report.tiers[4].drops.expectedGoldPerKill).toBeCloseTo(91.3438, 4);
  });

  it('keeps current-tier net Gold increasing from T1 through T5', () => {
    const netGoldByTier = report.tiers.map(
      (tier) => tier.autoCombat.current.averageNetGoldPerHour,
    );

    for (let index = 1; index < netGoldByTier.length; index++) {
      expect(netGoldByTier[index]).toBeGreaterThan(netGoldByTier[index - 1]);
    }

    expect(report.health.warnings).not.toContainEqual(
      expect.objectContaining({ key: 'CURRENT_TIER_FARM_REGRESSION' }),
    );
  });

  it('details start, middle and end without crossing the next rarity band', () => {
    const tierTwo = report.tiers[1];
    const tierThree = report.tiers[2];
    const tierFour = report.tiers[3];
    const tierFive = report.tiers[4];

    for (const tier of [tierTwo, tierFour]) {
      expect(tier.drops.positions.map((position) => position.position)).toEqual(
        ['START', 'MID', 'END'],
      );
      expect(
        tier.drops.positions.map((position) => position.expectedGoldPerKill),
      ).toEqual(
        [...tier.drops.positions]
          .map((position) => position.expectedGoldPerKill)
          .sort((a, b) => a - b),
      );
    }

    expect(tierTwo.drops.positions[2].expectedGoldPerKill).toBeLessThan(
      tierThree.drops.positions[0].expectedGoldPerKill,
    );
    expect(tierFour.drops.positions[2].expectedGoldPerKill).toBeLessThan(
      tierFive.drops.positions[0].expectedGoldPerKill,
    );
  });

  it('keeps potion costs inside the target and every current set profitable', () => {
    expect(report.health).toEqual({ status: 'HEALTHY', warnings: [] });

    expect(
      report.tiers.map(
        (tier) => tier.autoCombat.current.averagePotionCostSharePercent,
      ),
    ).toEqual([2.05, 5.98, 15.46, 17.23, 20.26]);

    for (const tier of report.tiers) {
      for (const classEconomy of tier.autoCombat.current.classes) {
        for (const position of classEconomy.positions) {
          expect(position.survives100Kills).toBe(true);
          expect(position.netGoldPerHour).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps current-set net Gold within 10% across all classes', () => {
    for (const tier of report.tiers) {
      const classNetGold = tier.autoCombat.current.classes.map(
        (classEconomy) => classEconomy.netGoldPerHour,
      );
      const bestNetGold = Math.max(...classNetGold);
      const worstNetGold = Math.min(...classNetGold);
      const gapPercent = ((bestNetGold - worstNetGold) / bestNetGold) * 100;

      expect(gapPercent).toBeLessThanOrEqual(10);
    }
  });

  it('caps T3-T5 potion pressure for Assassino and Atirador', () => {
    for (const tier of report.tiers.filter(
      (candidate) => candidate.tier >= 3,
    )) {
      const byClass = new Map(
        tier.autoCombat.current.classes.map((classEconomy) => [
          classEconomy.className,
          classEconomy,
        ]),
      );
      const defensiveBaseline = Math.min(
        byClass.get('Lutador')?.potionsPer100Kills ?? 0,
        byClass.get('Médico')?.potionsPer100Kills ?? 0,
      );

      for (const className of ['Assassino', 'Atirador']) {
        expect(
          byClass.get(className)?.potionsPer100Kills ?? Infinity,
        ).toBeLessThanOrEqual(defensiveBaseline * 1.7);
      }
    }
  });

  it('exposes every baseline class and position for both equipment sets', () => {
    for (const tier of report.tiers) {
      for (const scenario of [
        tier.autoCombat.current,
        tier.autoCombat.previous,
      ]) {
        expect(scenario.classes).toHaveLength(4);
        expect(scenario.positions).toHaveLength(3);

        for (const classEconomy of scenario.classes) {
          expect(classEconomy.positions.map((row) => row.position)).toEqual([
            'START',
            'MID',
            'END',
          ]);
          expect(
            classEconomy.positions.flatMap((position) =>
              position.mobs.map((mob) => mob.mobRank),
            ),
          ).toEqual([1, 2, 3, 4, 5, 6]);

          for (const position of classEconomy.positions) {
            expect(position.mobs).toHaveLength(2);
            expect(position.potionName).toBeTruthy();
            expect(position.potionHealAmount).toBeGreaterThan(0);
            expect(position.potionBuyPrice).toBeGreaterThan(0);
            expect(position.potionsUsedInProjection).toBeGreaterThanOrEqual(0);
            expect(position.potionGoldPerKill).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('reconciles the six-mob gross Gold model with the vendor audit', () => {
    const audit = buildVendorDropEconomyAudit();

    for (const tier of report.tiers) {
      const auditedTier = audit.tiers.find(
        (candidate) => candidate.tier === tier.tier,
      );

      expect(auditedTier).toBeDefined();
      expect(
        Math.abs(
          tier.autoCombat.current.averageGrossGoldPerHour -
            (auditedTier?.averageGrossGoldPerHour ?? 0),
        ),
      ).toBeLessThanOrEqual(0.02);
    }
  });

  it('selects the canonical recommended potion for every launch tier', () => {
    expect(
      report.tiers.map(
        (tier) => tier.autoCombat.current.classes[0].positions[0].potionName,
      ),
    ).toEqual([
      'Poção de Vida Menor',
      'Poção de Vida Leve',
      'Poção de Vida',
      'Poção de Vida',
      'Poção de Vida Maior',
    ]);

    for (const tier of report.tiers) {
      const potion = tier.autoCombat.current.classes[0].positions[0];

      expect(potion.potionMinTier).toBeLessThanOrEqual(tier.tier);
      expect(potion.potionMaxTier).toBeGreaterThanOrEqual(tier.tier);
    }
  });

  it('makes the previous set meaningfully costlier and unviable at tier end', () => {
    for (const tier of report.tiers.filter(
      (candidate) => candidate.tier >= 2,
    )) {
      const current = tier.autoCombat.current;
      const previous = tier.autoCombat.previous;
      const previousEnd = previous.positions.find(
        (position) => position.position === 'END',
      );

      expect(previous.averagePotionsPer100Kills).toBeGreaterThanOrEqual(
        current.averagePotionsPer100Kills * 3,
      );
      expect(previous.averagePotionsPer100Kills).toBeGreaterThanOrEqual(
        current.averagePotionsPer100Kills + 3,
      );
      expect(
        previousEnd &&
          (previousEnd.survivalPercent < 100 ||
            previousEnd.averageNetGoldPerHour <= 0),
      ).toBe(true);
    }
  });

  it('keeps two-tier gaps unsustainable in the economic projection', () => {
    for (const tier of report.tiers.filter(
      (candidate) => candidate.tier >= 3,
    )) {
      expect(tier.autoCombat.twoBelow?.averageWeightedSurvivalPercent).toBe(0);
    }
  });

  it('models actual gathering, crafting, missions and activity rewards', () => {
    const tierOne = report.tiers[0];

    expect(tierOne.gathering.baseGoldPerHour).toBe(270);
    expect(tierOne.crafting.directGoldFee).toBe(0);
    expect(tierOne.crafting.inputNpcOpportunityGold).toBe(105.41);
    expect(tierOne.incursions[0].successEntryRefund).toBe(50);
    expect(tierOne.incursions[0].failureEntryRefund).toBe(45);
    expect(tierOne.incursions[0].expectedEntryRefund).toBeCloseTo(49.55, 2);
    expect(tierOne.incursions[0].expectedWalletNetGold).toBeGreaterThan(0);
    expect(tierOne.incursions[0].expectedRecoveryPotionGold).toBeGreaterThan(0);
    expect(tierOne.incursions[0].expectedNetGold).toBeGreaterThan(0);
    for (const tier of report.tiers) {
      expect(
        tier.incursions.every((incursion) => incursion.expectedNetGold >= 0),
      ).toBe(true);
    }
    expect(tierOne.worldBoss?.averageGold).toBe(240);
    expect(
      report.missions.byTier.map((tier) => tier.recurringGoldPerDay),
    ).toEqual([481.67, 1615.62, 4697.86, 7700.95, 17739.76]);
    expect(report.assumptions.marketplaceGoldEffect).toBe('TRANSFER_ONLY');
  });

  it('uses the calibrated craftable-equipment NPC floor at T1-T5', () => {
    expect(report.tiers.map((tier) => tier.crafting.outputNpcGold)).toEqual([
      31, 237, 760, 1_226, 3_226,
    ]);

    for (const tier of report.tiers) {
      const recoveryRatio =
        tier.crafting.outputNpcGold / tier.crafting.inputNpcOpportunityGold;

      expect(recoveryRatio).toBeGreaterThanOrEqual(0.25);
      expect(recoveryRatio).toBeLessThanOrEqual(0.35);
      expect(tier.crafting.resourceValueDestroyedByCrafting).toBeGreaterThan(0);
    }
  });
});
