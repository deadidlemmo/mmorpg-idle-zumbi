import { InventoryItemType, Rarity } from '@prisma/client';
import {
  calculateBlackMarketSellValue,
  getItemRarityByTier,
} from './item-economy.config';

describe('item economy config', () => {
  it.each([
    [1, Rarity.COMMON],
    [2, Rarity.COMMON],
    [3, Rarity.UNCOMMON],
    [5, Rarity.RARE],
    [7, Rarity.EPIC],
    [9, Rarity.LEGENDARY],
  ])('maps tier %s to its canonical rarity', (tier, rarity) => {
    expect(getItemRarityByTier(tier)).toBe(rarity);
  });

  it.each([
    [1, Rarity.COMMON, InventoryItemType.MATERIAL, 3],
    [3, Rarity.UNCOMMON, InventoryItemType.MATERIAL, 16],
    [5, Rarity.RARE, InventoryItemType.MATERIAL, 59],
    [1, Rarity.COMMON, InventoryItemType.EQUIPMENT, 24],
  ])(
    'uses the authoritative NPC value for tier %s %s %s',
    (tier, rarity, inventoryType, expected) => {
      expect(
        calculateBlackMarketSellValue({
          tier,
          rarity,
          inventoryType,
        }),
      ).toBe(expected);
    },
  );

  it('returns zero for bound items', () => {
    expect(
      calculateBlackMarketSellValue({
        tier: 5,
        rarity: Rarity.RARE,
        inventoryType: InventoryItemType.MATERIAL,
        isSellable: false,
      }),
    ).toBe(0);
  });

  it.each([
    [3, Rarity.UNCOMMON, 760],
    [4, Rarity.UNCOMMON, 1_226],
    [5, Rarity.RARE, 3_226],
  ])(
    'applies the craftable-equipment liquidation floor at tier %s',
    (tier, rarity, expected) => {
      expect(
        calculateBlackMarketSellValue({
          tier,
          rarity,
          inventoryType: InventoryItemType.EQUIPMENT,
          isCraftable: true,
        }),
      ).toBe(expected);
    },
  );

  it.each([
    [1, Rarity.COMMON, 24],
    [2, Rarity.COMMON, 48],
  ])(
    'preserves the existing craftable-equipment value at tier %s',
    (tier, rarity, expected) => {
      expect(
        calculateBlackMarketSellValue({
          tier,
          rarity,
          inventoryType: InventoryItemType.EQUIPMENT,
          isCraftable: true,
        }),
      ).toBe(expected);
    },
  );

  it('does not raise the value of non-craftable equipment', () => {
    expect(
      calculateBlackMarketSellValue({
        tier: 5,
        rarity: Rarity.RARE,
        inventoryType: InventoryItemType.EQUIPMENT,
        isCraftable: false,
      }),
    ).toBe(473);
  });

  it('keeps bound craftable equipment unsellable', () => {
    expect(
      calculateBlackMarketSellValue({
        tier: 5,
        rarity: Rarity.RARE,
        inventoryType: InventoryItemType.EQUIPMENT,
        isCraftable: true,
        isSellable: false,
      }),
    ).toBe(0);
  });

  it.each([
    [1, Rarity.COMMON, 2],
    [3, Rarity.UNCOMMON, 9],
    [5, Rarity.RARE, 32],
  ])(
    'applies the residue NPC multiplier at tier %s',
    (tier, rarity, expected) => {
      expect(
        calculateBlackMarketSellValue({
          tier,
          rarity,
          inventoryType: InventoryItemType.MATERIAL,
          family: 'Resíduo Infecto',
        }),
      ).toBe(expected);
    },
  );

  it('does not discount other mob-drop material families', () => {
    expect(
      calculateBlackMarketSellValue({
        tier: 3,
        rarity: Rarity.UNCOMMON,
        inventoryType: InventoryItemType.MATERIAL,
        family: 'Biomaterial Cortante',
      }),
    ).toBe(16);
  });
});
