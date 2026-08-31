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

  it('consumes one Premium pass and extends Premium for the account', async () => {
    const premiumPass = {
      ...lockedPotion,
      id: 'premium-pass-item',
      name: 'Passe Premium de 30 dias',
      slug: 'passe-premium-30-dias',
      family: 'Passe Premium',
      tier: 1,
      rarity: Rarity.LEGENDARY,
      healFlat: 0,
      healPercent: 0,
      usableInCombat: false,
      isSellable: false,
      isTradable: true,
      minTier: 1,
      maxTier: 10,
    };
    const previousPremium = new Date('2026-09-10T12:00:00.000Z');
    const tx = {
      inventoryItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ premiumUntil: previousPremium }),
        update: jest.fn(),
      },
      economyLedgerEntry: { create: jest.fn() },
    };
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Teste',
          level: 1,
          userId: 'user-1',
          class: null,
          equipment: null,
          gatheringSkills: [],
        }),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inventory-1',
          characterId: 'character-1',
          itemId: premiumPass.id,
          quantity: 2,
          type: 'CONSUMABLE',
          item: premiumPass,
        }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new ConsumablesService(prisma as never);

    const result = await service.use('user-1', {
      characterId: 'character-1',
      itemId: premiumPass.id,
    });

    expect(result).toMatchObject({
      kind: 'PREMIUM_PASS',
      premium: { daysAdded: 30 },
      inventory: { previousQuantity: 2, newQuantity: 1 },
    });
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'inventory-1', quantity: { gte: 1 } },
      data: { quantity: { decrement: 1 } },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        premiumUntil: new Date(
          previousPremium.getTime() + 30 * 24 * 60 * 60 * 1000,
        ),
      },
    });
    expect(tx.economyLedgerEntry.create).toHaveBeenCalledTimes(1);
  });
});
