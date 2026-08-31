import { BadRequestException } from '@nestjs/common';
import { ItemSlot } from '@prisma/client';
import { VendorService } from './vendor.service';

describe('VendorService potion tier lock', () => {
  const lockedPotion = {
    id: 'potion-tier-3',
    name: 'Poção de Vida Maior',
    slot: ItemSlot.CONSUMABLE,
    isTradable: true,
    minTier: 3,
  };

  it('filters potions above the character tier from availability', () => {
    type AvailabilityProbe = {
      isAvailableForPurchase: (
        item: typeof lockedPotion,
        characterLevel: number,
      ) => boolean;
    };
    const service = new VendorService(
      {} as never,
    ) as unknown as AvailabilityProbe;

    expect(service.isAvailableForPurchase(lockedPotion, 20)).toBe(false);
    expect(service.isAvailableForPurchase(lockedPotion, 21)).toBe(true);
  });

  it('rejects a direct purchase before charging Gold', async () => {
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Teste',
          level: 20,
          gold: 10_000,
          userId: 'user-1',
        }),
        updateMany: jest.fn(),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue(lockedPotion),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new VendorService(prisma as never);

    await expect(
      service.buy('user-1', 'character-1', {
        itemId: '5d36ffea-e7fb-4c7c-8d7a-4fb44d89c765',
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.character.updateMany).not.toHaveBeenCalled();
  });
});

describe('VendorService fragment restrictions', () => {
  it('rejects a Fragmento de Ameaça as a direct NPC purchase', async () => {
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Teste',
          level: 30,
          gold: 10_000,
          userId: 'user-1',
        }),
        updateMany: jest.fn(),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000110',
          name: 'Fragmento de Ameaça T3',
          slot: ItemSlot.MATERIAL,
          isSellable: false,
          isTradable: true,
          minTier: null,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new VendorService(prisma as never);

    await expect(
      service.buy('user-1', 'character-1', {
        itemId: '00000000-0000-4000-8000-000000000110',
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.character.updateMany).not.toHaveBeenCalled();
  });
});

describe('VendorService paid item restrictions', () => {
  const premiumPass = {
    id: 'premium-pass-30-days',
    name: 'Passe Premium de 30 dias',
    slot: ItemSlot.CONSUMABLE,
    isSellable: false,
    isTradable: true,
    minTier: 1,
  };

  it('keeps the Premium pass outside Mara catalog', () => {
    type CatalogProbe = {
      isVendorCatalogItem: (item: typeof premiumPass) => boolean;
    };
    const service = new VendorService({} as never) as unknown as CatalogProbe;

    expect(service.isVendorCatalogItem(premiumPass)).toBe(false);
  });

  it('rejects a direct Premium pass purchase before charging Gold', async () => {
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Teste',
          level: 50,
          gold: 1_000_000,
          userId: 'user-1',
        }),
        updateMany: jest.fn(),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue(premiumPass),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new VendorService(prisma as never);

    await expect(
      service.buy('user-1', 'character-1', {
        itemId: '5d36ffea-e7fb-4c7c-8d7a-4fb44d89c765',
        quantity: 1,
      }),
    ).rejects.toThrow('Item indisponivel para compra.');
    expect(tx.character.updateMany).not.toHaveBeenCalled();
  });
});
