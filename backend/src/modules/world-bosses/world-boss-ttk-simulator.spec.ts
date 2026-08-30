import {
  buildWorldBossRewardCalibration,
  buildWorldBossTtkMatrix,
  validateWorldBossTtkMatrix,
} from '../../../scripts/simulate-world-boss-ttk';

describe('world boss TTK matrix T1-T10', () => {
  const rows = buildWorldBossTtkMatrix();

  it('cobre 20 bosses, quatro classes, dois sets e cinco tamanhos de grupo', () => {
    expect(rows).toHaveLength(20 * 4 * 2 * 5);
    expect(new Set(rows.map((row) => row.tier))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    );
    expect(new Set(rows.map((row) => row.className))).toEqual(
      new Set(['Lutador', 'Assassino', 'Atirador', 'Médico']),
    );
    expect(new Set(rows.map((row) => row.gear))).toEqual(
      new Set(['PREVIOUS', 'CURRENT']),
    );
    expect(new Set(rows.map((row) => row.participantCount))).toEqual(
      new Set([1, 2, 3, 5, 10]),
    );
  });

  it('usa catalogo real no lancamento e projecao apenas para T6-T10', () => {
    expect(
      rows
        .filter((row) => row.tier <= 5)
        .every((row) => !row.projectedEquipment),
    ).toBe(true);
    expect(
      rows
        .filter((row) => row.tier >= 7)
        .every((row) => row.projectedEquipment),
    ).toBe(true);
  });

  it('aprova alvos, viabilidade solo e desaceleracao do set anterior', () => {
    const failures = validateWorldBossTtkMatrix(rows).filter(
      (validation) => !validation.passed,
    );

    expect(failures).toEqual([]);
  });

  it('mantem casulo como gargalo aleatorio sem deixar fragmentos bloquearem a incubacao', () => {
    const rewards = buildWorldBossRewardCalibration(rows);

    expect(rewards).toHaveLength(5);
    expect(rewards.map((row) => row.rarity)).toEqual([
      'COMMON',
      'COMMON',
      'UNCOMMON',
      'UNCOMMON',
      'RARE',
    ]);
    expect(rewards.map((row) => row.cocoonChancePercent)).toEqual([
      7, 7, 5, 5, 4,
    ]);
    expect(
      rewards.every(
        (row) =>
          row.limitingInput === 'COCOON' &&
          row.expectedCalendarHoursForFragments <=
            row.expectedCalendarHoursForCocoon &&
          row.expectedCalendarHoursForInputs <= 120,
      ),
    ).toBe(true);
  });
});
