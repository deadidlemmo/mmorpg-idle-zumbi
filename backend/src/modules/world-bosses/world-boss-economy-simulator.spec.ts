import { worldBossDefinitions } from '../../../prisma/seed-data/world-bosses.seed-data';
import {
  buildWorldBossEconomySimulationReport,
  validateWorldBossEconomySimulationReport,
  WORLD_BOSS_ECONOMY_SCENARIOS,
} from '../../../scripts/simulate-world-boss-economy';

const AUTO_COMBAT_REFERENCE = {
  1: 800,
  2: 900,
  3: 1_000,
  4: 1_500,
  5: 2_700,
} as const;

const AUTO_COMBAT_XP_REFERENCE = {
  1: 1_820,
  2: 1_419,
  3: 1_708,
  4: 1_897,
  5: 2_663,
} as const;

describe('World Boss economy Monte Carlo simulator', () => {
  it('is deterministic for the same seed and covers every launch boss', () => {
    const first = buildWorldBossEconomySimulationReport({
      iterationsPerBoss: 100,
      seed: 12345,
      autoCombatNetGoldByTier: AUTO_COMBAT_REFERENCE,
    });
    const second = buildWorldBossEconomySimulationReport({
      iterationsPerBoss: 100,
      seed: 12345,
      autoCombatNetGoldByTier: AUTO_COMBAT_REFERENCE,
    });

    expect(first.bosses).toEqual(second.bosses);
    expect(first.tiers).toEqual(second.tiers);
    expect(first.bosses).toHaveLength(
      worldBossDefinitions.filter((boss) => boss.tier <= 5).length *
        WORLD_BOSS_ECONOMY_SCENARIOS.length,
    );
  });

  it('keeps a reliable current-tier group victorious without abandonment', () => {
    const report = buildWorldBossEconomySimulationReport({
      iterationsPerBoss: 200,
      seed: 67890,
      autoCombatNetGoldByTier: AUTO_COMBAT_REFERENCE,
    });
    const reliable = report.tiers.filter(
      (row) => row.scenario === 'CURRENT_RELIABLE',
    );

    expect(reliable).toHaveLength(5);
    for (const row of reliable) {
      expect(row.victoryChancePercent).toBe(100);
      expect(row.actualAbandonmentPercent).toBe(0);
      expect(row.goldPerRegistration).toBeGreaterThan(0);
      expect(row.fragmentsPerRegistration).toBeGreaterThan(0);
      expect(row.cocoonChancePerRegistrationPercent).toBeGreaterThan(0);
    }
  });

  it('exposes the economic impact of abandonment instead of hiding it', () => {
    const report = buildWorldBossEconomySimulationReport({
      iterationsPerBoss: 200,
      seed: 24680,
      autoCombatNetGoldByTier: AUTO_COMBAT_REFERENCE,
    });
    const reliable = report.tiers.filter(
      (row) => row.scenario === 'CURRENT_RELIABLE',
    );
    const stress = report.tiers.filter(
      (row) => row.scenario === 'ABANDONMENT_STRESS',
    );

    for (const reliableTier of reliable) {
      const stressTier = stress.find((row) => row.tier === reliableTier.tier);
      expect(stressTier).toBeDefined();
      expect(stressTier!.actualAbandonmentPercent).toBeGreaterThan(0);
      expect(stressTier!.rewardCoveragePercent).toBeLessThan(
        reliableTier.rewardCoveragePercent,
      );
      expect(stressTier!.cocoonChancePerRegistrationPercent).toBeLessThan(
        reliableTier.cocoonChancePerRegistrationPercent,
      );
    }
  });

  it('aplica o limite diario e mantem jogadores casuais e ativos na janela de quatro a sete dias', () => {
    const report = buildWorldBossEconomySimulationReport({
      iterationsPerBoss: 2_000,
      seed: 13579,
      autoCombatNetGoldByTier: AUTO_COMBAT_REFERENCE,
    });
    const validations = validateWorldBossEconomySimulationReport(report);
    const reliable = report.tiers.filter(
      (row) => row.scenario === 'CURRENT_RELIABLE',
    );

    expect(
      validations.filter(
        (validation) => validation.key.includes('_PET_') && !validation.passed,
      ),
    ).toEqual([]);
    for (const row of reliable) {
      expect(row.fullPetRewardVictoriesPerCalendarDay).toBeLessThanOrEqual(1);
      expect(row.maxBossFragmentsPerPlayerCalendarDay).toBeGreaterThan(
        row.fragmentsPerRegistration,
      );
      expect(row.maxBossFragmentsPerPlayerCalendarDay).toBeLessThan(
        row.fragmentsPerRegistration *
          row.maxEligiblePetRewardVictoriesPerCalendarDay,
      );
      expect(row.expectedPetInputDaysAtOneAttemptPerDay).toBeGreaterThanOrEqual(
        4,
      );
      expect(row.expectedPetInputDaysAtOneAttemptPerDay).toBeLessThanOrEqual(7);
      expect(row.expectedPetInputDaysAllWindows).toBeGreaterThanOrEqual(4);
      expect(row.expectedPetInputDaysAllWindows).toBeLessThanOrEqual(7);
    }
  });

  it('mantem T1 integral e limita o ganho diario recorrente de XP em T2-T5', () => {
    const report = buildWorldBossEconomySimulationReport({
      iterationsPerBoss: 2_000,
      seed: 97531,
      autoCombatNetGoldByTier: AUTO_COMBAT_REFERENCE,
      autoCombatXpByTier: AUTO_COMBAT_XP_REFERENCE,
    });
    const reliable = report.tiers.filter(
      (row) => row.scenario === 'CURRENT_RELIABLE',
    );
    const tierOne = reliable.find((row) => row.tier === 1)!;

    expect(tierOne.maxBossXpPerPlayerCalendarDay).toBe(
      tierOne.rawMaxBossXpPerPlayerCalendarDay,
    );
    for (const row of reliable.filter((candidate) => candidate.tier >= 2)) {
      expect(row.maxBossXpPerPlayerCalendarDay).toBeLessThan(
        row.rawMaxBossXpPerPlayerCalendarDay,
      );
      expect(row.maxNetXpDeltaVsEightHourAutoCombatPercent).toBeLessThanOrEqual(
        40,
      );
    }
  });
});
