import {
  buildWorldBossSimulationCalendar,
  simulateT1Economy,
} from './economy-simulator';
import {
  calibrateWorldBossSimulation,
  type WorldBossTelemetryEvent,
} from './world-boss-simulation-calibration';

const asOf = new Date('2026-08-25T12:00:00.000Z');

function telemetryEvent(
  slotIndex: number,
  daysAgo: number,
  overrides: Partial<WorldBossTelemetryEvent> = {},
): WorldBossTelemetryEvent {
  const startsAt = new Date(asOf.getTime() - daysAgo * 86_400_000);
  return {
    status: 'EXPIRED',
    slotIndex,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 180 * 60_000),
    createdAt: new Date(startsAt.getTime() - 10 * 60_000),
    maxHp: 1000,
    currentHp: 1000,
    totalDamage: 0,
    participantCount: 0,
    participantRecords: 0,
    hpLockedAt: null,
    defeatedAt: null,
    ...overrides,
  };
}

function emptyTelemetryEvent(slotIndex: number, daysAgo: number) {
  const event = telemetryEvent(slotIndex, daysAgo);
  return {
    ...event,
    endsAt: new Date(event.startsAt.getTime() + 5 * 60_000),
  };
}

describe('calibrateWorldBossSimulation', () => {
  it('usa telemetria suficiente por metrica e mantem fallback por amostra insuficiente', () => {
    const shortDefeated = [50, 60, 70, 80, 90].map((duration, index) => {
      const event = telemetryEvent(0, index + 1);
      return {
        ...event,
        status: 'DEFEATED' as const,
        currentHp: 0,
        totalDamage: 1000,
        defeatedAt: new Date(event.startsAt.getTime() + duration * 60_000),
      };
    });
    const shortExpired = [20, 30, 40, 50, 60].map((progress, index) =>
      telemetryEvent(0, index + 7, {
        currentHp: 1000 - progress * 10,
        totalDamage: progress * 10,
      }),
    );
    const longEmpty = Array.from({ length: 10 }, (_, index) =>
      emptyTelemetryEvent(1, index + 1),
    );
    const backfilled = telemetryEvent(0, 20);
    backfilled.createdAt = new Date(backfilled.endsAt.getTime() + 60_000);

    const calibration = calibrateWorldBossSimulation(
      [...shortDefeated, ...shortExpired, ...longEmpty, backfilled],
      { asOf, lookbackDays: 90 },
    );
    const short = calibration.slots.find((slot) => slot.index === 0)!;
    const long = calibration.slots.find((slot) => slot.index === 1)!;

    expect(calibration.quality).toMatchObject({
      queriedEvents: 21,
      acceptedEvents: 20,
      rejectedEvents: 1,
      rejectedByReason: { CREATED_AFTER_CLOSE: 1 },
    });
    expect(calibration.readiness.rewardReviewReady).toBe(false);
    expect(calibration.readiness.fallbackMetrics).toContain(
      'LONG.defeatChancePercent',
    );
    expect(short.activationChancePercent).toMatchObject({
      value: 100,
      source: 'TELEMETRY',
      sampleSize: 10,
    });
    expect(short.defeatChancePercent).toMatchObject({
      value: 50,
      source: 'TELEMETRY',
      sampleSize: 10,
    });
    expect(short.defeatedDurationMinutes).toMatchObject({
      value: { min: 60, max: 80 },
      source: 'TELEMETRY',
    });
    expect(short.expiredProgressPercent).toMatchObject({
      value: { min: 30, max: 50 },
      source: 'TELEMETRY',
    });
    expect(long.activationChancePercent).toMatchObject({
      value: 0,
      source: 'TELEMETRY',
      sampleSize: 10,
    });
    expect(long.defeatChancePercent).toMatchObject({
      value: 50,
      source: 'FALLBACK',
      sampleSize: 0,
    });
  });

  it('fecha eventos vazios ao fim da janela e nao concede recompensas', () => {
    const emptyEvents = [0, 1].flatMap((slotIndex) =>
      Array.from({ length: 10 }, (_, index) =>
        emptyTelemetryEvent(slotIndex, index + 1),
      ),
    );
    const calibration = calibrateWorldBossSimulation(emptyEvents, {
      asOf,
      lookbackDays: 90,
    });
    const calendar = buildWorldBossSimulationCalendar(
      1,
      () => 0.5,
      calibration,
    );
    const shortEvents = calendar.filter((event) => event.slotIndex === 0);

    expect(calendar.every((event) => event.outcome === 'EMPTY')).toBe(true);
    expect(shortEvents[0]).toMatchObject({
      startsAtMinute: 10,
      closesAtMinute: 15,
      rewardMultiplier: 0,
    });
    expect(shortEvents[1].startsAtMinute).toBe(15 + 6 * 60);

    const report = simulateT1Economy(
      { players: 100, days: 7, seed: 20260825 },
      calibration,
    );
    expect(report.worldBossCalendar.emptyEvents).toBeGreaterThan(0);
    expect(report.worldBossCalendar.activatedEvents).toBe(0);
    expect(report.overall.goldGeneratedBySource.WORLD_BOSS_REWARDS).toBe(0);
    expect(report.overall.averageWorldBossRewardsClaimed).toBe(0);
  });

  it('diferencia inscricao abandonada de evento realmente ativado', () => {
    const emptyAfterLeave = telemetryEvent(0, 1, {
      participantRecords: 1,
      endsAt: new Date(asOf.getTime() - 86_400_000 + 5 * 60_000),
    });
    const activatedWithoutDamage = telemetryEvent(0, 2, {
      hpLockedAt: new Date(asOf.getTime() - 2 * 86_400_000),
    });

    const calibration = calibrateWorldBossSimulation(
      [emptyAfterLeave, activatedWithoutDamage],
      { asOf, lookbackDays: 90 },
    );
    const short = calibration.slots.find((slot) => slot.index === 0)!;

    expect(short.emptyEvents).toBe(1);
    expect(short.activatedEvents).toBe(1);
  });

  it('rejeita lock de HP fora da janela do evento', () => {
    const event = telemetryEvent(0, 1, {
      hpLockedAt: new Date(asOf.getTime() + 60_000),
    });

    const calibration = calibrateWorldBossSimulation([event], {
      asOf,
      lookbackDays: 90,
    });

    expect(calibration.quality).toMatchObject({
      acceptedEvents: 0,
      rejectedEvents: 1,
      rejectedByReason: { INVALID_HP_LOCK_TIME: 1 },
    });
  });
});
