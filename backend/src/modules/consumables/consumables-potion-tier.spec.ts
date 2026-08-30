import { BadRequestException } from '@nestjs/common';
import { ItemSlot, Rarity } from '@prisma/client';
import { ConsumablesService } from './consumables.service';

describe('ConsumablesService potion tier lock', () => {
  const lockedPotion = {
    id: 'potion-tier-3',
    name: 'Pocao de Vida',
    description: 'Cura.',
    tier: 2,
    rarity: Rarity.UNCOMMON,
    slot: ItemSlot.CONSUMABLE,
    family: 'Pocao de Vida',
    healFlat: 100,
    healPercent: 4,
    usableInCombat: true,
    usableOutOfCombat: true,
    isSellable: true,
    isTradable: true,
    minTier: 3,
    maxTier: 4,
  };

  it('rejects selecting a potion above the character tier', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Teste',
          level: 20,
          userId: 'user-1',
        }),
      },
      characterPotionConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue(lockedPotion),
      },
    };
    const service = new ConsumablesService(prisma as never);

    await expect(
      service.updatePotionConfig('user-1', 'character-1', {
        enabled: true,
        potionItemId: lockedPotion.id,
        useInAutoCombat: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.characterPotionConfig.upsert).not.toHaveBeenCalled();
  });

  it('rejects manual use before consuming inventory', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Teste',
          level: 20,
          userId: 'user-1',
          class: {},
          equipment: {},
          gatheringSkills: [],
        }),
      },
      autoCombatSession: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inventory-1',
          characterId: 'character-1',
          itemId: lockedPotion.id,
          quantity: 5,
          type: 'CONSUMABLE',
          item: lockedPotion,
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new ConsumablesService(prisma as never);

    await expect(
      service.use('user-1', {
        characterId: 'character-1',
        itemId: lockedPotion.id,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
