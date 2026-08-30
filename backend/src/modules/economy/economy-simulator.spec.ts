import {
  buildWorldBossSimulationCalendar,
  simulateT1Economy,
} from './economy-simulator';

describe('simulateT1Economy', () => {
  it('produz o mesmo resultado economico para a mesma seed', () => {
    const first = simulateT1Economy({ players: 120, days: 7, seed: 42 });
    const second = simulateT1Economy({ players: 120, days: 7, seed: 42 });

    expect(first.overall).toEqual(second.overall);
    expect(first.profiles).toEqual(second.profiles);
    expect(first.worldBossCalendar).toEqual(second.worldBossCalendar);
    expect(first.targetAssessment).toEqual(second.targetAssessment);
  });

  it('agenda os dois slots a partir do fechamento e do respawn canonico', () => {
    const events = buildWorldBossSimulationCalendar(1, () => 0);
    const shortEvents = events.filter((event) => event.slotIndex === 0);
    const longEvents = events.filter((event) => event.slotIndex === 1);

    expect(shortEvents[0]).toMatchObject({
      startsAtMinute: 10,
      closesAtMinute: 50,
      outcome: 'DEFEATED',
      defeated: true,
      rewardMultiplier: 1,
    });
    expect(shortEvents[1].startsAtMinute).toBe(50 + 6 * 60);
    expect(longEvents[0]).toMatchObject({
      startsAtMinute: 10,
      closesAtMinute: 60,
      outcome: 'DEFEATED',
      defeated: true,
      rewardMultiplier: 1,
    });
    expect(longEvents[1].startsAtMinute).toBe(60 + 12 * 60);
  });

  it('mantem resultados finitos e sem saldos economicos negativos', () => {
    const report = simulateT1Economy({
      players: 250,
      days: 7,
      seed: 20260824,
    });

    expect(report.overall.players).toBe(250);
    expect(report.overall.goldSinkRatioPercent).toBeGreaterThanOrEqual(0);
    expect(
      report.overall.playersWithReinforcementPercent,
    ).toBeGreaterThanOrEqual(0);
    expect(report.overall.playersWithPlus3Percent).toBeGreaterThanOrEqual(0);
    expect(report.overall.averageEquipmentAtPlus3).toBeGreaterThanOrEqual(0);
    expect(report.overall.averageReinforcementFragments).toBeGreaterThanOrEqual(
      0,
    );
    expect(report.overall.averageIncursionTokens).toBeGreaterThanOrEqual(0);
    expect(report.overall.averageIncursionTokensSpent).toBeGreaterThanOrEqual(
      0,
    );
    expect(report.overall.averageWorldBossFragments).toBeGreaterThanOrEqual(0);
    expect(report.overall.averagePetCocoonsDropped).toBeGreaterThanOrEqual(0);
    expect(report.overall.averagePetsIncubated).toBeGreaterThanOrEqual(0);
    expect(report.overall.averageUniquePetsOwned).toBeGreaterThanOrEqual(0);
    expect(report.overall.averageUniquePetsOwned).toBeLessThanOrEqual(8);
    expect(report.overall.playersWithAnyPetPercent).toBeGreaterThanOrEqual(0);
    expect(
      report.overall.playersWithCompletePetSetPercent,
    ).toBeGreaterThanOrEqual(0);
    expect(report.overall.playersWithAnyPetPercent).toBeGreaterThanOrEqual(
      report.overall.playersWithCompletePetSetPercent,
    );
    expect(
      report.overall.averageDuplicateCocoonsConverted,
    ).toBeGreaterThanOrEqual(0);
    expect(report.overall.averageCocoonsHeld).toBeGreaterThanOrEqual(0);
    expect(report.overall.averagePendingPetIncubations).toBeGreaterThanOrEqual(
      0,
    );
    expect(report.worldBossCalendar.scheduledEvents).toBeGreaterThan(0);
    expect(report.worldBossCalendar.resolvedEvents).toBeLessThanOrEqual(
      report.worldBossCalendar.scheduledEvents,
    );
    expect(report.overall.averageWorldBossEventsJoined).toBeGreaterThanOrEqual(
      report.overall.averageWorldBossRewardsClaimed,
    );
    expect(
      report.overall.averageWorldBossFullRewards +
        report.overall.averageWorldBossPartialRewards,
    ).toBeCloseTo(report.overall.averageWorldBossRewardsClaimed, 1);
    expect(report.profiles.every((profile) => profile.players > 0)).toBe(true);
    expect(
      report.profiles.every(
        (profile) =>
          Number.isFinite(profile.averageGoldEarned) &&
          Number.isFinite(profile.averageGoldSpent) &&
          Number.isFinite(profile.averageClosingGold),
      ),
    ).toBe(true);
    expect(
      Object.values(report.overall.goldGeneratedBySource).reduce(
        (total, quantity) => total + quantity,
        0,
      ),
    ).toBe(report.overall.totalGoldEarned);
    expect(
      Object.values(report.overall.goldDestroyedBySink).reduce(
        (total, quantity) => total + quantity,
        0,
      ),
    ).toBe(report.overall.totalGoldSpent);
  });

  it('simula sorteio, incubacao e colecao T1 quando bosses sao derrotados', () => {
    const report = simulateT1Economy({
      players: 1000,
      days: 14,
      seed: 20260826,
    });

    expect(report.worldBossCalendar.defeatedEvents).toBeGreaterThan(0);
    expect(report.overall.averagePetCocoonsDropped).toBeGreaterThan(0);
    expect(report.overall.averagePetsIncubated).toBeGreaterThan(0);
    expect(report.overall.averageUniquePetsOwned).toBe(
      report.overall.averagePetsIncubated,
    );
    expect(report.overall.playersWithAnyPetPercent).toBeGreaterThan(0);
    expect(report.overall.goldDestroyedBySink.PET_INCUBATION).toBeGreaterThan(
      0,
    );
  });

  it('usa fichas de incursao como acelerador do reforco, sem gerar saldo negativo', () => {
    const report = simulateT1Economy({
      players: 1000,
      days: 14,
      seed: 20260824,
    });

    expect(report.overall.averageIncursionTokensSpent).toBeGreaterThan(0);
    expect(report.overall.averageEquipmentAtPlus3).toBeGreaterThan(0);
    expect(
      report.profiles.every(
        (profile) =>
          profile.averageIncursionTokens >= 0 &&
          profile.averageReinforcementFragments >= 0,
      ),
    ).toBe(true);
  });

  it('permite medir a estrategia que concentra um item ate +3', () => {
    const balanced = simulateT1Economy({
      players: 1000,
      days: 7,
      seed: 20260825,
      reinforcementStrategy: 'BALANCED',
    });
    const focused = simulateT1Economy({
      players: 1000,
      days: 7,
      seed: 20260825,
      reinforcementStrategy: 'FOCUSED',
    });

    expect(focused.overall.averageEquipmentAtPlus3).toBeGreaterThan(
      balanced.overall.averageEquipmentAtPlus3,
    );
    expect(focused.overall.averageUpgradeLevels).toBeGreaterThan(0);
    expect(focused.worldBossCalendar).toEqual(balanced.worldBossCalendar);
    expect(focused.overall.goldGeneratedBySource.WORLD_BOSS_REWARDS).toBe(
      balanced.overall.goldGeneratedBySource.WORLD_BOSS_REWARDS,
    );
    expect(focused.overall.averageWorldBossRewardsClaimed).toBe(
      balanced.overall.averageWorldBossRewardsClaimed,
    );
  });
});
