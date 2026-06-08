import {
  AUTO_COMBAT_TTK_BASE_TIMES_BY_MOB_INDEX,
  AUTO_COMBAT_TTK_MAX_SECONDS,
  AUTO_COMBAT_TTK_MIN_SECONDS,
} from '../config/auto-combat.config';
import {
  calculateAutoCombatTtkSeconds,
  getAutoCombatBaseKillTimeSeconds,
  getAutoCombatTtkDifficultyLabel,
} from './auto-combat-ttk.util';

describe('auto-combat TTK util', () => {
  it('keeps base kill time when player power matches recommended power', () => {
    expect(
      calculateAutoCombatTtkSeconds({
        baseKillTimeSeconds: 10,
        recommendedPower: 120,
        playerOffensivePower: 120,
      }),
    ).toBeCloseTo(10);
  });

  it('decreases kill time when player power is higher', () => {
    const baseline = calculateAutoCombatTtkSeconds({
      baseKillTimeSeconds: 10,
      recommendedPower: 100,
      playerOffensivePower: 100,
    });
    const stronger = calculateAutoCombatTtkSeconds({
      baseKillTimeSeconds: 10,
      recommendedPower: 100,
      playerOffensivePower: 200,
    });

    expect(stronger).toBeLessThan(baseline);
  });

  it('rounds kill time up to a whole second', () => {
    expect(
      calculateAutoCombatTtkSeconds({
        baseKillTimeSeconds: 10,
        recommendedPower: 100,
        playerOffensivePower: 150,
      }),
    ).toBe(8);
  });

  it('increases kill time when player power is lower', () => {
    const baseline = calculateAutoCombatTtkSeconds({
      baseKillTimeSeconds: 10,
      recommendedPower: 100,
      playerOffensivePower: 100,
    });
    const weaker = calculateAutoCombatTtkSeconds({
      baseKillTimeSeconds: 10,
      recommendedPower: 100,
      playerOffensivePower: 25,
    });

    expect(weaker).toBeGreaterThan(baseline);
  });

  it('clamps kill time to configured min and max', () => {
    expect(
      calculateAutoCombatTtkSeconds({
        baseKillTimeSeconds: 5,
        recommendedPower: 1,
        playerOffensivePower: 100_000,
      }),
    ).toBe(AUTO_COMBAT_TTK_MIN_SECONDS);

    expect(
      calculateAutoCombatTtkSeconds({
        baseKillTimeSeconds: 35,
        recommendedPower: 100_000,
        playerOffensivePower: 1,
      }),
    ).toBe(AUTO_COMBAT_TTK_MAX_SECONDS);
  });

  it('maps mob 1 to 12 base kill times in progression order', () => {
    AUTO_COMBAT_TTK_BASE_TIMES_BY_MOB_INDEX.forEach((expected, index) => {
      expect(getAutoCombatBaseKillTimeSeconds(index + 1)).toBe(expected);
    });
  });

  it('returns expected difficulty labels', () => {
    expect(getAutoCombatTtkDifficultyLabel(2.9)).toBe('Muito facil');
    expect(getAutoCombatTtkDifficultyLabel(10)).toBe('Ideal');
    expect(getAutoCombatTtkDifficultyLabel(30)).toBe('Desafiador');
    expect(getAutoCombatTtkDifficultyLabel(70)).toBe('Perigoso');
    expect(getAutoCombatTtkDifficultyLabel(120)).toBe('Ineficiente');
  });
});
