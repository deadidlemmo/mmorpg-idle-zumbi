import {
  createAutoCombatHuntingCycle,
  resolveAutoCombatHuntingCycle,
} from './auto-combat-hunting-cycle';

describe('auto-combat hunting cycle', () => {
  const startedAt = new Date('2026-08-26T12:00:00.000Z');

  it('preserva o ciclo atual quando o pet muda antes do proximo rastreio', () => {
    const currentCycle = createAutoCombatHuntingCycle({
      startedAt,
      durationMs: 15_000,
      version: 1,
    });

    const result = resolveAutoCombatHuntingCycle({
      serverNow: new Date('2026-08-26T12:00:10.000Z'),
      sessionEndsAt: new Date('2026-08-26T18:00:00.000Z'),
      currentCycle,
      nextCycleDurationMs: 14_550,
      maxCompletions: 600,
    });

    expect(result).toEqual({
      quantity: 0,
      processedAt: startedAt,
      reachedCapacity: false,
      reachedSessionEnd: false,
      cycle: currentCycle,
    });
  });

  it('aplica a nova duracao somente depois de concluir o ciclo congelado', () => {
    const currentCycle = createAutoCombatHuntingCycle({
      startedAt,
      durationMs: 15_000,
      version: 7,
    });

    const result = resolveAutoCombatHuntingCycle({
      serverNow: new Date('2026-08-26T12:00:15.000Z'),
      sessionEndsAt: new Date('2026-08-26T18:00:00.000Z'),
      currentCycle,
      nextCycleDurationMs: 14_550,
      maxCompletions: 100,
    });

    expect(result).toEqual({
      quantity: 1,
      processedAt: new Date('2026-08-26T12:00:15.000Z'),
      reachedCapacity: false,
      reachedSessionEnd: false,
      cycle: {
        startedAt: new Date('2026-08-26T12:00:15.000Z'),
        endsAt: new Date('2026-08-26T12:00:29.550Z'),
        durationMs: 14_550,
        version: 8,
      },
    });
  });

  it('reconstroi varios rastreios offline sem perder o resto do ciclo', () => {
    const currentCycle = createAutoCombatHuntingCycle({
      startedAt,
      durationMs: 15_000,
      version: 1,
    });

    const result = resolveAutoCombatHuntingCycle({
      serverNow: new Date('2026-08-26T12:01:00.000Z'),
      sessionEndsAt: new Date('2026-08-26T18:00:00.000Z'),
      currentCycle,
      nextCycleDurationMs: 14_550,
      maxCompletions: 600,
    });

    expect(result.quantity).toBe(4);
    expect(result.processedAt).toEqual(new Date('2026-08-26T12:00:58.650Z'));
    expect(result.cycle).toEqual({
      startedAt: new Date('2026-08-26T12:00:58.650Z'),
      endsAt: new Date('2026-08-26T12:01:13.200Z'),
      durationMs: 14_550,
      version: 5,
    });
  });

  it('respeita capacidade e limite temporal da sessao', () => {
    const currentCycle = createAutoCombatHuntingCycle({
      startedAt,
      durationMs: 15_000,
      version: 1,
    });

    const result = resolveAutoCombatHuntingCycle({
      serverNow: new Date('2026-08-26T12:02:00.000Z'),
      sessionEndsAt: new Date('2026-08-26T12:01:00.000Z'),
      currentCycle,
      nextCycleDurationMs: 15_000,
      maxCompletions: 2,
    });

    expect(result.quantity).toBe(2);
    expect(result.reachedCapacity).toBe(true);
    expect(result.reachedSessionEnd).toBe(true);
  });
});
