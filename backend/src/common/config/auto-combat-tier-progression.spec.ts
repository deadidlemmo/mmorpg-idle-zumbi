import {
  buildAutoCombatTierMatrix,
  validateAutoCombatTierMatrix,
} from '../../../scripts/validate-auto-combat-tier-progression';

describe('auto-combat T1-T5 progression matrix', () => {
  const rows = buildAutoCombatTierMatrix();

  it('covers every requested balance dimension', () => {
    expect(rows.length).toBeGreaterThanOrEqual(5_000);
    expect(new Set(rows.map((row) => row.tier))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    );
    expect(new Set(rows.map((row) => row.position))).toEqual(
      new Set(['START', 'MID', 'END']),
    );
    expect(new Set(rows.map((row) => row.className))).toEqual(
      new Set(['Lutador', 'Assassino', 'Atirador', 'Médico']),
    );
    expect(new Set(rows.map((row) => row.gathering))).toEqual(
      new Set(['NONE', 'RECOMMENDED', 'FULL']),
    );
    expect(new Set(rows.map((row) => row.reinforcement))).toEqual(
      new Set([0, 3]),
    );
    expect(new Set(rows.map((row) => row.pet))).toEqual(
      new Set(['NONE', 'CURRENT_TIER']),
    );
    expect(new Set(rows.map((row) => row.potion))).toEqual(
      new Set(['NONE', 'CURRENT_TIER']),
    );
  });

  it('passes every transition, survival, reinforcement, pet and potion target', () => {
    const failures = validateAutoCombatTierMatrix(rows).filter(
      (validation) => !validation.passed,
    );

    expect(failures).toEqual([]);
  });

  it('regresses Carregador T2 against Lutador with T1 and T2 sets', () => {
    const select = (gear: 'PREVIOUS' | 'CURRENT') =>
      rows.find(
        (row) =>
          row.mobName === 'Carregador de Paletes Infectado' &&
          row.className === 'Lutador' &&
          row.gear === gear &&
          row.reinforcement === 0 &&
          row.gathering === 'RECOMMENDED' &&
          row.pet === 'NONE' &&
          row.potion === 'CURRENT_TIER',
      );
    const tierOneSet = select('PREVIOUS');
    const tierTwoSet = select('CURRENT');

    expect(tierOneSet).toBeDefined();
    expect(tierTwoSet).toBeDefined();

    const ttkSlowdown = tierOneSet!.ttkSeconds / tierTwoSet!.ttkSeconds - 1;

    expect(ttkSlowdown).toBeGreaterThanOrEqual(0.15);
    expect(ttkSlowdown).toBeLessThanOrEqual(0.25);
    expect(tierOneSet!.expectedDamagePerKill).toBeGreaterThan(
      tierTwoSet!.expectedDamagePerKill * 3,
    );
    expect(tierOneSet!.potionsPer100Kills).toBeGreaterThan(
      tierTwoSet!.potionsPer100Kills,
    );
  });

  it('makes two-tier gaps unsustainable from the first mob onward', () => {
    const twoBelowRows = rows.filter(
      (row) =>
        row.tier >= 3 &&
        row.gear === 'TWO_BELOW' &&
        row.reinforcement === 0 &&
        row.gathering === 'RECOMMENDED' &&
        row.pet === 'NONE' &&
        row.potion === 'CURRENT_TIER',
    );

    expect(twoBelowRows).toHaveLength(3 * 3 * 4);
    expect(twoBelowRows.every((row) => !row.survives100Kills)).toBe(true);
  });

  it('records healing, vendor availability and potion cost for every tier', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const tierRows = rows.filter(
        (row) => row.tier === tier && row.potion === 'CURRENT_TIER',
      );

      expect(tierRows.length).toBeGreaterThan(0);
      expect(tierRows.every((row) => row.potionHealAmount > 0)).toBe(true);
      expect(tierRows.every((row) => row.potionBuyPrice > 0)).toBe(true);
      expect(
        tierRows.every(
          (row) =>
            row.potionGoldPer100Kills ===
            Math.round(row.potionsPer100Kills * row.potionBuyPrice * 100) / 100,
        ),
      ).toBe(true);
    }
  });

  it('keeps apprentice gear viable while making the first crafted set useful', () => {
    for (const className of ['Lutador', 'Assassino', 'Atirador', 'Médico']) {
      const select = (gear: 'PREVIOUS' | 'CURRENT') =>
        rows.find(
          (row) =>
            row.tier === 1 &&
            row.position === 'START' &&
            row.className === className &&
            row.gear === gear &&
            row.reinforcement === 0 &&
            row.gathering === 'RECOMMENDED' &&
            row.pet === 'NONE' &&
            row.potion === 'CURRENT_TIER',
        );
      const starter = select('PREVIOUS');
      const tierOne = select('CURRENT');

      expect(starter?.survives100Kills).toBe(true);
      expect(starter!.safeKillsWithoutPotions).toBeGreaterThanOrEqual(25);
      expect(tierOne!.ttkSeconds).toBeLessThan(starter!.ttkSeconds);
      expect(tierOne!.expectedDamagePerKill).toBeLessThan(
        starter!.expectedDamagePerKill,
      );
    }
  });
});
