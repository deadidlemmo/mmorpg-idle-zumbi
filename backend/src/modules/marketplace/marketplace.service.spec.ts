import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CharacterStatus,
  InventoryItemType,
  MarketListingStatus,
  Prisma,
  Rarity,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketplaceService } from './marketplace.service';

const item = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Sucata reforçada',
  description: 'Material de teste',
  slug: 'sucata-reforcada',
  tier: 2,
  rarity: Rarity.COMMON,
};

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000020',
    sellerCharacterId: '00000000-0000-4000-8000-000000000002',
    itemId: item.id,
    type: InventoryItemType.MATERIAL,
    quantityInitial: 5,
    quantityRemaining: 2,
    quantityCancelled: 0,
    unitPrice: 150,
    status: MarketListingStatus.ACTIVE,
    requestId: '00000000-0000-4000-8000-000000000030',
    createdAt: new Date('2026-08-29T12:00:00.000Z'),
    updatedAt: new Date('2026-08-29T12:00:00.000Z'),
    closedAt: null,
    item,
    seller: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Vendedora',
      userId: 'seller-user',
      status: CharacterStatus.ACTIVE,
      deletedAt: null,
    },
    ...overrides,
  };
}

function purchase(listingRecord = listing()) {
  return {
    id: '00000000-0000-4000-8000-000000000040',
    listingId: listingRecord.id,
    buyerCharacterId: '00000000-0000-4000-8000-000000000001',
    sellerCharacterId: listingRecord.sellerCharacterId,
    itemId: item.id,
    quantity: 2,
    unitPrice: 150,
    totalPrice: 300,
    requestId: '00000000-0000-4000-8000-000000000050',
    createdAt: new Date('2026-08-29T12:05:00.000Z'),
    item,
    listing: listingRecord,
    buyer: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Comprador',
      userId: 'buyer-user',
      gold: 700,
    },
    seller: {
      id: listingRecord.sellerCharacterId,
      name: 'Vendedora',
      userId: 'seller-user',
      gold: 300,
    },
  };
}

describe('MarketplaceService', () => {
  const tx = {
    marketPurchase: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    marketListing: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    character: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    inventoryItem: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    economyLedgerEntry: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };

  const service = new MarketplaceService(prisma as unknown as PrismaService);
  const dto = {
    characterId: '00000000-0000-4000-8000-000000000001',
    quantity: 2,
    requestId: '00000000-0000-4000-8000-000000000050',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.marketPurchase.findUnique.mockResolvedValue(null);
    tx.character.findFirst.mockResolvedValue({
      id: dto.characterId,
      gold: 1000,
    });
    tx.marketListing.findUnique.mockResolvedValue(listing());
    tx.inventoryItem.findUnique.mockResolvedValue(null);
    tx.marketListing.updateMany.mockResolvedValue({ count: 1 });
    tx.character.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.upsert.mockResolvedValue({});
    tx.marketPurchase.create.mockResolvedValue({ id: purchase().id });
    tx.character.findUniqueOrThrow
      .mockResolvedValueOnce({ gold: 700 })
      .mockResolvedValueOnce({ gold: 300 });
    tx.economyLedgerEntry.create.mockResolvedValue({});
    tx.marketPurchase.findUniqueOrThrow.mockResolvedValue(
      purchase(
        listing({
          quantityRemaining: 0,
          status: MarketListingStatus.SOLD_OUT,
          closedAt: new Date('2026-08-29T12:05:00.000Z'),
        }),
      ),
    );
  });

  it('conclui a compra final dentro de uma transação serializável', async () => {
    const result = await service.buyListing('buyer-user', listing().id, dto);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    const [stockUpdate] = tx.marketListing.updateMany.mock
      .calls[0] as unknown as [
      {
        data: {
          quantityRemaining: { decrement: number };
          status: MarketListingStatus;
          closedAt: unknown;
        };
      },
    ];
    expect(stockUpdate.data.quantityRemaining).toEqual({ decrement: 2 });
    expect(stockUpdate.data.status).toBe(MarketListingStatus.SOLD_OUT);
    expect(stockUpdate.data.closedAt).toBeInstanceOf(Date);
    expect(tx.character.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { gold: { decrement: 300 } } }),
    );
    expect(tx.character.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { gold: { increment: 300 } } }),
    );
    expect(tx.inventoryItem.upsert).toHaveBeenCalledTimes(1);
    expect(tx.economyLedgerEntry.create).toHaveBeenCalledTimes(3);
    expect(result.purchase).toMatchObject({
      quantity: 2,
      totalPrice: 300,
      buyerGold: 700,
    });
  });

  it('reutiliza a compra já registrada para o mesmo requestId', async () => {
    tx.marketPurchase.findUnique.mockResolvedValue(purchase());

    const result = await service.buyListing('buyer-user', listing().id, dto);

    expect(result.purchase.id).toBe(purchase().id);
    expect(tx.character.findFirst).not.toHaveBeenCalled();
    expect(tx.marketListing.updateMany).not.toHaveBeenCalled();
    expect(tx.character.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryItem.upsert).not.toHaveBeenCalled();
  });

  it('bloqueia a compra de um anúncio da própria conta', async () => {
    tx.marketListing.findUnique.mockResolvedValue(
      listing({ seller: { ...listing().seller, userId: 'buyer-user' } }),
    );

    await expect(
      service.buyListing('buyer-user', listing().id, dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.marketListing.updateMany).not.toHaveBeenCalled();
    expect(tx.character.updateMany).not.toHaveBeenCalled();
  });

  it('interrompe a operação antes da entrega quando o vendedor não pode receber', async () => {
    tx.character.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.buyListing('buyer-user', listing().id, dto),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.inventoryItem.upsert).not.toHaveBeenCalled();
    expect(tx.marketPurchase.create).not.toHaveBeenCalled();
    expect(tx.economyLedgerEntry.create).not.toHaveBeenCalled();
  });
});
