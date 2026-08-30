import {
  buildActivityEconomyAudit,
  type ActivityEconomyDatabaseSnapshot,
} from '../../../scripts/audit-activity-economy';
import {
  createFallbackWorldBossSimulationCalibration,
  type WorldBossSimulationCalibration,
} from './world-boss-simulation-calibration';

describe('complete T1-T5 activity economy audit', () => {
  const report = buildActivityEconomyAudit({
    generatedAt: new Date('2026-08-29T00:00:00.000Z'),
  });

  it('covers every launch tier and canonical economy surface', () => {
    expect(report.tiers.map((tier) => tier.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(report.integrity).toEqual({
      status: 'HEALTHY',
      errors: [],
      tiers: 5,
      activityRows: 85,
      recipes: 140,
      saleCatalogItems: 285,
      incursions: 30,
      worldBosses: 10,
      missions: 25,
    });

    for (const tier of report.tiers) {
      expect(tier.representativeActivities.map((row) => row.activity)).toEqual([
        'AUTO_COMBAT',
        'GATHERING',
        'CRAFTING',
        'INCURSION',
        'WORLD_BOSS',
        'MISSIONS',
      ]);

      for (const row of tier.activityRows) {
        expect(
          [
            row.directGoldGrossPerHour,
            row.itemNpcValuePerHour,
            row.grossGoldEquivalentPerHour,
            row.directGoldCostPerHour,
            row.inputOpportunityCostPerHour,
            row.netGoldEquivalentPerHour,
            row.characterXpPerHour,
            row.skillXpPerHour,
            row.defeatChancePercent,
          ].every(Number.isFinite),
        ).toBe(true);
      }
    }
  });

  it('keeps direct Gold, NPC liquidation and costs as separate values', () => {
    for (const tier of report.tiers) {
      expect(tier.autoCombat.summary.directGoldGrossPerHour).toBe(0);
      expect(tier.autoCombat.summary.itemNpcValuePerHour).toBeGreaterThan(0);
      expect(tier.autoCombat.summary.directGoldCostPerHour).toBeGreaterThan(0);

      const gathering = tier.gathering.find(
        (row) => row.mode === 'MASTERY_AFFINITY',
      );
      expect(gathering?.summary.directGoldGrossPerHour).toBe(0);
      expect(gathering?.summary.itemNpcValuePerHour).toBeGreaterThan(0);
      expect(gathering?.summary.skillXpPerHour).toBeGreaterThan(0);
      expect(gathering?.summary.characterXpPerHour).toBe(0);

      expect(tier.crafting.stationSummary.inputOpportunityCostPerHour).toBe(
        tier.crafting.recipes.reduce(
          (total, recipe) => total + recipe.stationInputOpportunityGoldPerHour,
          0,
        ) / tier.crafting.recipes.length,
      );
      expect(
        tier.crafting.stationSummary.netGoldEquivalentPerHour,
      ).toBeLessThan(0);
    }
  });

  it('models every recipe and a complete six-slot set for every class', () => {
    for (const tier of report.tiers) {
      expect(tier.crafting.recipes).toHaveLength(28);
      expect(tier.crafting.sets).toHaveLength(4);

      for (const recipe of tier.crafting.recipes) {
        expect(recipe.ingredients.length).toBeGreaterThan(0);
        expect(recipe.selfSupplyHours).toBeGreaterThan(0);
        expect(recipe.stationCraftsPerHour).toBeGreaterThan(0);
      }

      for (const set of tier.crafting.sets) {
        expect(set.selectedItems).toHaveLength(6);
        expect(new Set(set.selectedItems).size).toBe(6);
        expect(set.selfSupplyHours).toBeGreaterThan(0);
        expect(set.requiredReinforcementFragmentsToPlus3).toBe(
          tier.progression.reinforcementFragmentsForFullSetPlus3,
        );
      }
    }
  });

  it('measures all incursion approaches, entry loss, failure and rewards', () => {
    for (const tier of report.tiers) {
      expect(tier.incursions).toHaveLength(6);
      expect(new Set(tier.incursions.map((row) => row.name)).size).toBe(2);
      expect(new Set(tier.incursions.map((row) => row.approach))).toEqual(
        new Set(['CAUTIOUS', 'BALANCED', 'AGGRESSIVE']),
      );

      for (const row of tier.incursions) {
        expect(row.entryGold).toBeGreaterThan(0);
        expect(row.expectedEntryRefundGoldPerAttempt).toBeGreaterThan(0);
        expect(row.expectedDirectGoldPerAttempt).toBeGreaterThanOrEqual(
          row.expectedEntryRefundGoldPerAttempt,
        );
        expect(row.failureChancePercent).toBe(100 - row.successChancePercent);
        expect(row.expectedFailureHpLossPercentPerAttempt).toBeGreaterThan(0);
        expect(row.summary.directGoldCostPerHour).toBeGreaterThan(0);
        expect(row.expectedIncursionTokensPerAttempt).toBeGreaterThan(0);
        expect(row.expectedReinforcementFragmentsPerAttempt).toBeGreaterThan(0);

        if (row.approach === 'BALANCED') {
          expect(row.expectedNetGoldPerAttempt).toBeGreaterThanOrEqual(
            -row.entryGold * 0.35,
          );
        }
      }
    }
  });

  it('separates world-boss participation return from calendar return', () => {
    for (const tier of report.tiers) {
      expect(tier.worldBosses).toHaveLength(2);
      expect(tier.worldBossCalibration.mode).toBe('FALLBACK_ONLY');
      expect(tier.worldBossCalibration.readiness.rewardReviewReady).toBe(false);

      for (const boss of tier.worldBosses) {
        expect(boss.playerDefeatChancePercent).toBe(0);
        expect(boss.objectiveFailureChancePercent).toBe(0);
        expect(boss.expectedGoldPerActivatedEvent).toBeGreaterThan(0);
        expect(boss.expectedFragmentsPerActivatedEvent).toBeGreaterThan(0);
        expect(boss.calendarSummary.availability).toBe('SCHEDULED');
        expect(boss.calendarSummary.netGoldEquivalentPerHour).toBeLessThan(
          boss.participationSummary.netGoldEquivalentPerHour,
        );
      }
    }
  });

  it('keeps mission rates capped and does not count story rewards as recurring', () => {
    const expectedRecurringGold = [351.43, 1362.86, 4164.29, 6742.86, 16050];

    for (const [index, tier] of report.tiers.entries()) {
      expect(tier.missions).toHaveLength(5);
      expect(tier.recurringMissionGoldPerDay).toBeCloseTo(
        expectedRecurringGold[index],
        2,
      );
      expect(
        tier.missions.every(
          (mission) => mission.combinedNetGoldEquivalentPerDedicatedHour > 0,
        ),
      ).toBe(true);

      const storyMissions = tier.missions.filter(
        (mission) => mission.type === 'STORY',
      );
      expect(storyMissions.length).toBeGreaterThan(0);
      expect(
        storyMissions.every((mission) => mission.recurringGoldPerDay === 0),
      ).toBe(true);

      const missionSummary = tier.representativeActivities.find(
        (row) => row.activity === 'MISSIONS',
      );
      expect(missionSummary?.availability).toBe('CAPPED');
      expect(missionSummary?.netGoldEquivalentPerHour).toBeGreaterThan(0);
    }
  });

  it('reports every NPC sale category without inventing fragment value', () => {
    for (const tier of report.tiers) {
      expect(tier.sales.map((row) => row.category)).toEqual([
        'GATHERING_MATERIAL',
        'MOB_MATERIAL',
        'EQUIPMENT',
        'REINFORCEMENT_MATERIAL',
        'PET_COCOON',
      ]);
      expect(tier.sales.every((row) => row.itemCount > 0)).toBe(true);

      const fragments = tier.sales.find(
        (row) => row.category === 'REINFORCEMENT_MATERIAL',
      );
      expect(fragments).toMatchObject({
        itemCount: 1,
        sellableItemCount: 0,
        averageNpcSaleGold: 0,
      });
    }

    expect(
      report.saleCatalog.some(
        (row) =>
          row.tier === 2 &&
          row.itemTier === 1 &&
          row.category === 'MOB_MATERIAL',
      ),
    ).toBe(true);
  });

  it('calculates progression requirements and affordability by income source', () => {
    expect(
      report.tiers.map(
        (tier) => tier.progression.equipmentSetSelfSupplyHoursAverage,
      ),
    ).toEqual([2, 8.88, 13.64, 14.43, 21.3]);
    expect(
      report.tiers.map(
        (tier) => tier.progression.reinforcementGoldForFullSetPlus3,
      ),
    ).toEqual([1260, 3360, 6780, 12900, 21000]);
    expect(report.tiers.map((tier) => tier.progression.petGoldCost)).toEqual([
      300, 750, 1600, 3000, 5000,
    ]);

    for (const tier of report.tiers) {
      expect(tier.affordability).toHaveLength(18);
      expect(new Set(tier.affordability.map((row) => row.targetKey))).toEqual(
        new Set(['POTIONS_100', 'REINFORCEMENT_SET_PLUS_3', 'PET_INCUBATION']),
      );
      expect(
        tier.affordability.filter(
          (row) => row.incomeSource === 'INCURSION_BALANCED',
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ hours: null, days: null }),
        ]),
      );
      expect(
        tier.affordability
          .filter((row) => row.incomeSource === 'AUTO_COMBAT_SELL_ALL')
          .every((row) => (row.hours ?? 0) > 0),
      ).toBe(true);
    }
  });

  it('reports unavailable scheduled pet inputs as N/D instead of zero hours', () => {
    const zeroActivation = createFallbackWorldBossSimulationCalibration({
      asOf: new Date('2026-08-29T00:00:00.000Z'),
    });
    const calibration: WorldBossSimulationCalibration = {
      ...zeroActivation,
      mode: 'TELEMETRY_WITH_FALLBACKS',
      slots: zeroActivation.slots.map((slot) => ({
        ...slot,
        activationChancePercent: {
          ...slot.activationChancePercent,
          value: 0,
          source: 'TELEMETRY',
          sampleSize: 100,
        },
      })),
    };
    const worldBossCalibrations: Record<
      number,
      WorldBossSimulationCalibration
    > = {};
    for (const tier of [1, 2, 3, 4, 5]) {
      worldBossCalibrations[tier] = calibration;
    }
    const database: ActivityEconomyDatabaseSnapshot = {
      generatedAt: '2026-08-29T00:00:00.000Z',
      lookbackDays: 30,
      catalogVerification: {
        status: 'HEALTHY',
        checkedItems: 0,
        checkedRecipes: 0,
        checkedIncursions: 0,
        checkedWorldBosses: 0,
        checkedMissions: 0,
        mismatches: [],
      },
      worldBossCalibrations,
      marketplace: {
        activeListings: 0,
        recentPurchases: 0,
        completeSets: [],
      },
      npcSales: [],
      activityTelemetry: [],
    };
    const databaseReport = buildActivityEconomyAudit({
      generatedAt: new Date('2026-08-29T00:00:00.000Z'),
      database,
    });

    for (const tier of databaseReport.tiers) {
      expect(tier.progression.expectedCalendarHoursForPetFragments).toBeNull();
      expect(tier.progression.expectedCalendarHoursForPetCocoon).toBeNull();
      expect(tier.progression.expectedCalendarHoursUntilPetInputs).toBeNull();
      expect(
        tier.affordability.find(
          (row) =>
            row.targetKey === 'PET_INCUBATION' &&
            row.incomeSource === 'AUTO_COMBAT_SELL_ALL',
        )?.additionalRequirement,
      ).toContain('N/D de calendario');
    }
  });
});
