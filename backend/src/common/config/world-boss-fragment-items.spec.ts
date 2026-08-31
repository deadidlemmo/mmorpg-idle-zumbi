import {
  ECONOMY_ACTIVITY_REWARDS,
  ECONOMY_LAUNCH_TIERS,
  getIncursionTokenItemByTier,
  getWorldBossFragmentItemByTier,
  PET_DEFINITIONS,
  INCURSION_TOKEN_ITEMS,
  WORLD_BOSS_FRAGMENT_ITEM_FAMILY,
  WORLD_BOSS_FRAGMENT_ITEMS,
} from './economy.config';

describe('Fragmentos de Ameaça', () => {
  it('mantém um item canônico, negociável e não vendável por tier T1-T10', () => {
    expect(WORLD_BOSS_FRAGMENT_ITEM_FAMILY).toBe('Material de Ameaça Global');
    expect(WORLD_BOSS_FRAGMENT_ITEMS).toHaveLength(10);
    expect(
      new Set(WORLD_BOSS_FRAGMENT_ITEMS.map((item) => item.name)).size,
    ).toBe(10);
    expect(
      new Set(WORLD_BOSS_FRAGMENT_ITEMS.map((item) => item.slug)).size,
    ).toBe(10);

    for (let tier = 1; tier <= 10; tier += 1) {
      expect(getWorldBossFragmentItemByTier(tier)).toEqual({
        tier,
        name: `Fragmento de Ameaça T${tier}`,
        slug: `fragmento-de-ameaca-t${tier}`,
        isSellable: false,
        isTradable: true,
      });
    }

    expect(getWorldBossFragmentItemByTier(0)).toBeNull();
    expect(getWorldBossFragmentItemByTier(11)).toBeNull();
  });

  it('mantém cada pet vinculado ao fragmento e ao custo do próprio tier', () => {
    const fragmentCostByTier = {
      1: 10,
      2: 14,
      3: 18,
      4: 24,
      5: 30,
    } as const;

    for (const definition of PET_DEFINITIONS) {
      const fragment = getWorldBossFragmentItemByTier(definition.tier);

      expect(fragment).toMatchObject({
        tier: definition.tier,
        name: `Fragmento de Ameaça T${definition.tier}`,
      });
      expect(definition.fragmentCost).toBe(fragmentCostByTier[definition.tier]);
    }
  });

  it('preserva as quantidades de fragmentos concedidas por vitória em T1-T5', () => {
    const expectedQuantities = {
      1: { min: 2, max: 3 },
      2: { min: 3, max: 4 },
      3: { min: 4, max: 5 },
      4: { min: 5, max: 6 },
      5: { min: 6, max: 7 },
    } as const;

    for (const tier of ECONOMY_LAUNCH_TIERS) {
      expect(ECONOMY_ACTIVITY_REWARDS.worldBossFragments[tier]).toEqual(
        expectedQuantities[tier],
      );
    }
  });
});

describe('Fichas de Incursão', () => {
  it('mantém um item físico não vendável e não negociável por tier T1-T10', () => {
    expect(INCURSION_TOKEN_ITEMS).toHaveLength(10);

    for (let tier = 1; tier <= 10; tier += 1) {
      expect(getIncursionTokenItemByTier(tier)).toEqual({
        tier,
        name: `Ficha de Incursão T${tier}`,
        slug: `ficha-de-incursao-t${tier}`,
        isSellable: false,
        isTradable: false,
      });
    }
  });
});
