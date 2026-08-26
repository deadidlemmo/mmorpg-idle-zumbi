import { resolveAutoCombatTtkCycle } from './auto-combat-ttk-cycle';

describe('auto-combat TTK cycle', () => {
  it('preserva a duracao do monstro atual antes do abate', () => {
    expect(
      resolveAutoCombatTtkCycle({
        elapsedMs: 8_000,
        progressMs: 2_000,
        currentDurationMs: 15_000,
        nextDurationMs: 13_875,
        maxCompletions: 100,
      }),
    ).toEqual({
      completions: 0,
      availableCompletions: 0,
      progressMs: 10_000,
      activeDurationMs: 15_000,
      processingLimited: false,
    });
  });

  it('aplica a nova duracao somente ao monstro seguinte', () => {
    expect(
      resolveAutoCombatTtkCycle({
        elapsedMs: 13_000,
        progressMs: 2_000,
        currentDurationMs: 15_000,
        nextDurationMs: 13_875,
        maxCompletions: 100,
      }),
    ).toEqual({
      completions: 1,
      availableCompletions: 1,
      progressMs: 0,
      activeDurationMs: 13_875,
      processingLimited: false,
    });
  });

  it('reconstroi progresso offline com precisao em milissegundos', () => {
    expect(
      resolveAutoCombatTtkCycle({
        elapsedMs: 43_750,
        progressMs: 0,
        currentDurationMs: 15_000,
        nextDurationMs: 13_875,
        maxCompletions: 100,
      }),
    ).toEqual({
      completions: 3,
      availableCompletions: 3,
      progressMs: 1_000,
      activeDurationMs: 13_875,
      processingLimited: false,
    });
  });

  it('mantem o piso de um segundo', () => {
    const result = resolveAutoCombatTtkCycle({
      elapsedMs: 1_000,
      progressMs: 0,
      currentDurationMs: 250,
      nextDurationMs: 100,
      maxCompletions: 10,
    });

    expect(result.completions).toBe(1);
    expect(result.activeDurationMs).toBe(1_000);
  });
});
