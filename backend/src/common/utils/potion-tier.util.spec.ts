import {
  getPotionTierAccess,
  getPotionTierLockedMessage,
  isPotionTierUnlocked,
} from './potion-tier.util';

describe('potion tier access', () => {
  it.each([
    { level: 1, minTier: 1, allowed: true, characterTier: 1, requiredLevel: 1 },
    {
      level: 10,
      minTier: 1,
      allowed: true,
      characterTier: 1,
      requiredLevel: 1,
    },
    {
      level: 20,
      minTier: 3,
      allowed: false,
      characterTier: 2,
      requiredLevel: 21,
    },
    {
      level: 21,
      minTier: 3,
      allowed: true,
      characterTier: 3,
      requiredLevel: 21,
    },
    {
      level: 50,
      minTier: 1,
      allowed: true,
      characterTier: 5,
      requiredLevel: 1,
    },
  ])(
    'resolves level $level against minimum tier $minTier',
    ({ level, minTier, allowed, characterTier, requiredLevel }) => {
      expect(
        getPotionTierAccess({
          characterLevel: level,
          potion: { minTier },
        }),
      ).toEqual({
        allowed,
        characterTier,
        requiredTier: minTier,
        requiredLevel,
      });
    },
  );

  it('keeps consumables without a minimum tier available', () => {
    expect(
      isPotionTierUnlocked({
        characterLevel: 1,
        potion: { minTier: null },
      }),
    ).toBe(true);
  });

  it('explains the lock using character and required tiers', () => {
    expect(
      getPotionTierLockedMessage({
        characterLevel: 20,
        potion: { name: 'Pocao de Vida', minTier: 3 },
      }),
    ).toBe(
      'Pocao de Vida exige acesso ao Tier 3. Seu personagem esta no Tier 2.',
    );
  });
});
