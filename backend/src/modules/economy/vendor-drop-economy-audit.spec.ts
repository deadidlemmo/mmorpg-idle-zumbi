import { buildVendorDropEconomyAudit } from '../../../scripts/audit-vendor-drop-economy';

describe('vendor drop economy audit', () => {
  const report = buildVendorDropEconomyAudit();

  it('covers every active launch mob and canonical drop entry', () => {
    expect(report.tiers.map((tier) => tier.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(report.integrity).toEqual({
      status: 'HEALTHY',
      activeMobCount: 30,
      dropEntryCount: 95,
      auditedItemTierRows: 40,
    });

    for (const tier of report.tiers) {
      expect(tier.activeMobCount).toBe(6);
      expect(tier.totalEncounterWeight).toBe(100);
      expect(tier.mobs.map((mob) => mob.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('calculates Gold per mob with all four classes and the real spawn mix', () => {
    const tierOne = report.tiers[0];
    const errante = tierOne.mobs[0];

    expect(errante.mobName).toBe('Errante do Subúrbio');
    expect(errante.classes).toHaveLength(4);
    expect(errante.encounterSharePercent).toBe(42);
    expect(errante.expectedGoldPerKill).toBe(4.5);
    expect(errante.averageGoldPerHourIfExclusive).toBe(952.92);
    expect(errante.averageWeightedGoldPerHour).toBe(371.5);

    expect(report.tiers.map((tier) => tier.averageGrossGoldPerHour)).toEqual([
      789.29, 908.44, 1147.27, 1803.57, 3542.12,
    ]);
  });

  it('reconciles mob and item contributions with the tier total', () => {
    for (const tier of report.tiers) {
      const mobGold = tier.mobs.reduce(
        (total, mob) => total + mob.averageWeightedGoldPerHour,
        0,
      );
      const itemGold = tier.items.reduce(
        (total, item) => total + item.averageGoldPerHour,
        0,
      );

      expect(mobGold).toBeCloseTo(tier.averageGrossGoldPerHour, 1);
      expect(itemGold).toBeCloseTo(tier.averageGrossGoldPerHour, 1);
    }
  });

  it('exposes average and maximum payout for every drop item', () => {
    const tierOneResidue = report.tiers[0].items.find(
      (item) => item.itemName === 'Resíduo Infecto Pálido',
    );

    expect(tierOneResidue).toMatchObject({
      unitSellGold: 2,
      weightedDropEventChancePercent: 45,
      averageQuantityWhenDropped: 1.5,
      maximumQuantityWhenDropped: 2,
      averageGoldPerDropEvent: 3,
      maximumGoldPerDropEvent: 4,
      averageGoldPerHour: 265.36,
      goldSharePercent: 33.62,
    });

    for (const tier of report.tiers) {
      for (const item of tier.items) {
        expect(item.unitSellGold).toBeGreaterThan(0);
        expect(item.averageGoldPerDropEvent).toBeGreaterThan(0);
        expect(item.maximumGoldPerDropEvent).toBeGreaterThanOrEqual(
          item.averageGoldPerDropEvent,
        );
        expect(item.averageGoldPerHour).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps high-frequency residue Gold inside the target band', () => {
    const residueFindings = report.findings.filter(
      (finding) => finding.code === 'HIGH_FREQUENCY_ITEM_GOLD_CONCENTRATION',
    );

    expect(residueFindings).toHaveLength(0);
    expect(
      report.tiers.map(
        (tier) =>
          tier.items.find((item) => item.itemName.startsWith('Resíduo Infecto'))
            ?.goldSharePercent,
      ),
    ).toEqual([33.62, 34.05, 32.84, 32.27, 31]);
  });

  it('removes the T2 regression without increasing elite yield', () => {
    expect(report.findings).not.toContainEqual(
      expect.objectContaining({ code: 'TIER_GOLD_PER_HOUR_REGRESSION' }),
    );
    expect(
      report.findings
        .filter((finding) => finding.code === 'HIGH_YIELD_MOB')
        .map((finding) => finding.entity),
    ).toEqual(['Capataz Ferrugento', 'Regente da Cabine Lacrada']);
  });
});
