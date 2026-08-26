import {
  buildGatheringTimeline,
  createGatheringCycleFromProgress,
  getGatheringCycleDurationMs,
  resolveGatheringCycle,
} from './gathering-cycle';

describe('gathering cycle', () => {
  it('preserva o ciclo atual enquanto a unidade ainda nao terminou', () => {
    const cycle = createGatheringCycleFromProgress({
      anchorAt: new Date('2026-08-26T12:00:02.000Z'),
      durationMs: 10_000,
      progressRemainder: 0.2,
      version: 4,
    });

    const result = resolveGatheringCycle({
      serverNow: new Date('2026-08-26T12:00:05.000Z'),
      lastResolvedAt: new Date('2026-08-26T12:00:02.000Z'),
      idleProgressLimitSeconds: 21_600,
      currentCycle: cycle,
      nextCycleDurationMs: 9_500,
    });

    expect(result.quantity).toBe(0);
    expect(result.progressRemainder).toBeCloseTo(0.5, 5);
    expect(result.cycle).toEqual(cycle);
  });

  it('aplica a nova duracao somente depois de concluir o ciclo vigente', () => {
    const currentCycle = {
      startedAt: new Date('2026-08-26T12:00:00.000Z'),
      endsAt: new Date('2026-08-26T12:00:10.000Z'),
      durationMs: 10_000,
      version: 7,
    };

    const beforeBoundary = resolveGatheringCycle({
      serverNow: new Date('2026-08-26T12:00:09.000Z'),
      lastResolvedAt: new Date('2026-08-26T12:00:00.000Z'),
      idleProgressLimitSeconds: 21_600,
      currentCycle,
      nextCycleDurationMs: 9_250,
    });
    const afterBoundary = resolveGatheringCycle({
      serverNow: new Date('2026-08-26T12:00:14.625Z'),
      lastResolvedAt: new Date('2026-08-26T12:00:00.000Z'),
      idleProgressLimitSeconds: 21_600,
      currentCycle,
      nextCycleDurationMs: 9_250,
    });

    expect(beforeBoundary.cycle.durationMs).toBe(10_000);
    expect(beforeBoundary.quantity).toBe(0);
    expect(afterBoundary.quantity).toBe(1);
    expect(afterBoundary.cycle.durationMs).toBe(9_250);
    expect(afterBoundary.progressRemainder).toBeCloseTo(0.5, 5);
    expect(afterBoundary.cycle.version).toBe(8);
  });

  it('reancora o ciclo apos atingir o limite offline sem perder o resto', () => {
    const currentCycle = {
      startedAt: new Date('2026-08-25T00:00:00.000Z'),
      endsAt: new Date('2026-08-25T00:00:10.000Z'),
      durationMs: 10_000,
      version: 1,
    };
    const serverNow = new Date('2026-08-26T12:00:00.000Z');

    const result = resolveGatheringCycle({
      serverNow,
      lastResolvedAt: new Date('2026-08-25T00:00:00.000Z'),
      idleProgressLimitSeconds: 21_605,
      currentCycle,
      nextCycleDurationMs: 10_000,
    });

    expect(result.wasIdleCapped).toBe(true);
    expect(result.progressRemainder).toBeCloseTo(0.5, 5);
    expect(result.cycle.startedAt.toISOString()).toBe(
      '2026-08-26T11:59:55.000Z',
    );
    expect(result.cycle.endsAt.toISOString()).toBe('2026-08-26T12:00:05.000Z');
  });

  it('publica snapshot canonico preenchendo da esquerda para a direita', () => {
    const durationMs = getGatheringCycleDurationMs(90);
    const cycle = {
      startedAt: new Date('2026-08-26T12:00:00.000Z'),
      endsAt: new Date('2026-08-26T12:00:40.000Z'),
      durationMs,
      version: 3,
    };

    expect(
      buildGatheringTimeline({
        active: true,
        sessionId: 'gathering-session-1',
        serverNow: new Date('2026-08-26T12:00:10.000Z'),
        cycle,
      }),
    ).toEqual({
      activityInstanceId: 'gathering-session-1',
      cycleId: 'gathering-session-1:gathering:3',
      serverNow: '2026-08-26T12:00:10.000Z',
      startedAt: '2026-08-26T12:00:00.000Z',
      endsAt: '2026-08-26T12:00:40.000Z',
      durationMs: 40_000,
      direction: 'fill',
      version: 3,
    });
  });
});
