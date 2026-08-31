import { applyAutoCombatIncomingDamageMultiplier } from './auto-combat-balance.util';

describe('auto-combat class balance', () => {
  it.each(['Assassino', 'Atirador'])(
    'keeps the launch mitigation for %s through T2',
    (className) => {
      expect(
        applyAutoCombatIncomingDamageMultiplier({
          attack: 100,
          className,
          mobTier: 2,
        }),
      ).toBe(34);
    },
  );

  it.each(['Assassino', 'Atirador'])(
    'applies the calibrated T3-T5 mitigation for %s',
    (className) => {
      for (const mobTier of [3, 4, 5]) {
        expect(
          applyAutoCombatIncomingDamageMultiplier({
            attack: 100,
            className,
            mobTier,
          }),
        ).toBe(28);
      }
    },
  );

  it('does not alter other classes or uncalibrated tiers', () => {
    expect(
      applyAutoCombatIncomingDamageMultiplier({
        attack: 100,
        className: 'Lutador',
        mobTier: 5,
      }),
    ).toBe(68);
    expect(
      applyAutoCombatIncomingDamageMultiplier({
        attack: 100,
        className: 'Assassino',
        mobTier: 6,
      }),
    ).toBe(34);
  });

  it('keeps legacy callers compatible when the mob tier is absent', () => {
    expect(
      applyAutoCombatIncomingDamageMultiplier({
        attack: 100,
        className: 'Atirador',
      }),
    ).toBe(34);
  });
});
