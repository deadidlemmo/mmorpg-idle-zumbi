import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CharacterStatus,
  InventoryItemType,
  MarketListingStatus,
  Prisma,
  Rarity,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketItemClassFilter } from './dto/market-listings-query.dto';
import {
  getMarketplaceTradeProgressLevel,
  MarketplaceService,
  MARKETPLACE_TRADE_UNLOCK_LEVEL,
} from './marketplace.service';

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
      level: MARKETPLACE_TRADE_UNLOCK_LEVEL,
      craftingSkill: { level: 1 },
      huntingSkill: { level: 1 },
      gatheringSkills: [{ level: 1 }],
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

  it('bloqueia compra antes de qualquer progressão chegar ao nível 10', async () => {
    tx.character.findFirst.mockResolvedValue({
      id: dto.characterId,
      gold: 1000,
      level: 1,
      craftingSkill: { level: 1 },
      huntingSkill: { level: 1 },
      gatheringSkills: [{ level: 1 }, { level: 9 }],
    });

    await expect(
      service.buyListing('buyer-user', listing().id, dto),
    ).rejects.toThrow('Negociações no Mercado do Abrigo exigem Nv. 10');

    expect(tx.marketListing.findUnique).not.toHaveBeenCalled();
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

describe('MarketplaceService - filtros do catálogo', () => {
  const characterFindFirst = jest.fn();
  const listingCount = jest.fn();
  const listingFindMany = jest.fn();
  const prisma = {
    character: { findFirst: characterFindFirst },
    marketListing: {
      count: listingCount,
      findMany: listingFindMany,
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const service = new MarketplaceService(prisma as unknown as PrismaService);
  const classFilterCases: Array<
    [MarketItemClassFilter, Prisma.ItemWhereInput]
  > = [
    [MarketItemClassFilter.LUTADOR, { class: { is: { name: 'Lutador' } } }],
    [MarketItemClassFilter.ASSASSINO, { class: { is: { name: 'Assassino' } } }],
    [MarketItemClassFilter.ATIRADOR, { class: { is: { name: 'Atirador' } } }],
    [MarketItemClassFilter.MEDICO, { class: { is: { name: 'Médico' } } }],
    [MarketItemClassFilter.GENERAL, { classId: null }],
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    characterFindFirst.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Comprador',
      gold: 1000,
    });
    listingCount.mockResolvedValue(0);
    listingFindMany.mockResolvedValue([]);
  });

  it.each(classFilterCases)(
    'aplica o filtro %s na consulta do banco',
    async (itemClass, expected) => {
      await service.getListings(
        'buyer-user',
        '00000000-0000-4000-8000-000000000001',
        { itemClass },
      );

      const [findManyArgs] = listingFindMany.mock.calls[0] as unknown as [
        Prisma.MarketListingFindManyArgs,
      ];

      expect(findManyArgs.where?.AND).toEqual([{ item: { is: expected } }]);
    },
  );
});

describe('MarketplaceService - Fragmento de Ameaça', () => {
  const characterId = '00000000-0000-4000-8000-000000000121';
  const fragmentItemId = '00000000-0000-4000-8000-000000000122';
  const inventoryItemId = '00000000-0000-4000-8000-000000000123';
  const listingId = '00000000-0000-4000-8000-000000000124';
  const requestId = '00000000-0000-4000-8000-000000000125';
  const fragmentItem = {
    id: fragmentItemId,
    name: 'Fragmento de Ameaça T4',
    description: 'Fragmento de teste',
    slug: 'fragmento-de-ameaca-t4',
    tier: 4,
    rarity: Rarity.UNCOMMON,
    isSellable: false,
    isTradable: true,
  };
  const createdListing = {
    id: listingId,
    sellerCharacterId: characterId,
    itemId: fragmentItemId,
    type: InventoryItemType.MATERIAL,
    quantityInitial: 4,
    quantityRemaining: 4,
    quantityCancelled: 0,
    unitPrice: 125,
    status: MarketListingStatus.ACTIVE,
    requestId,
    createdAt: new Date('2026-08-30T12:00:00.000Z'),
    updatedAt: new Date('2026-08-30T12:00:00.000Z'),
    closedAt: null,
    item: fragmentItem,
    seller: {
      id: characterId,
      name: 'Vendedor',
      userId: 'seller-user',
      status: CharacterStatus.ACTIVE,
      deletedAt: null,
    },
  };

  const tx = {
    marketListing: {
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    character: {
      findFirst: jest.fn(),
    },
    inventoryItem: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    tx.marketListing.findUnique.mockResolvedValue(null);
    tx.marketListing.count.mockResolvedValue(0);
    tx.character.findFirst.mockResolvedValue({
      id: characterId,
      level: 1,
      craftingSkill: { level: 1 },
      huntingSkill: { level: 1 },
      gatheringSkills: [{ level: MARKETPLACE_TRADE_UNLOCK_LEVEL }],
    });
    tx.inventoryItem.findUnique.mockResolvedValue({
      id: inventoryItemId,
      characterId,
      itemId: fragmentItemId,
      type: InventoryItemType.MATERIAL,
      quantity: 9,
      item: fragmentItem,
    });
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.findUniqueOrThrow.mockResolvedValue({ quantity: 5 });
    tx.inventoryItem.deleteMany.mockResolvedValue({ count: 0 });
    tx.marketListing.create.mockResolvedValue(createdListing);
    tx.economyLedgerEntry.create.mockResolvedValue({});
  });

  it('aceita o fragmento negociável e preserva tier e quantidade do anúncio', async () => {
    const result = await service.createListing('seller-user', {
      characterId,
      itemId: fragmentItemId,
      quantity: 4,
      unitPrice: 125,
      requestId,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        characterId,
        itemId: fragmentItemId,
        quantity: { gt: 4 },
      },
      data: { quantity: { decrement: 4 } },
    });
    const [listingCreateArgs] = tx.marketListing.create.mock
      .calls[0] as unknown as [Prisma.MarketListingCreateArgs];
    expect(listingCreateArgs.data).toMatchObject({
      itemId: fragmentItemId,
      type: InventoryItemType.MATERIAL,
      quantityInitial: 4,
      quantityRemaining: 4,
    });
    const [ledgerCreateArgs] = tx.economyLedgerEntry.create.mock
      .calls[0] as unknown as [Prisma.EconomyLedgerEntryCreateArgs];
    expect(ledgerCreateArgs.data).toMatchObject({
      itemId: fragmentItemId,
      tier: 4,
      quantity: 4,
    });
    expect(result.listing).toMatchObject({
      item: { id: fragmentItemId, tier: 4 },
      quantityInitial: 4,
      quantityRemaining: 4,
    });
  });
});

describe('MarketplaceService - acesso por progressão', () => {
  it('libera um coletor nível 1 quando uma profissão alcança o nível 10', () => {
    expect(
      getMarketplaceTradeProgressLevel({
        level: 1,
        craftingSkill: { level: 1 },
        huntingSkill: { level: 1 },
        gatheringSkills: [{ level: 4 }, { level: 10 }],
      }),
    ).toBe(MARKETPLACE_TRADE_UNLOCK_LEVEL);
  });

  it('considera também Caça e Criação sem exigir nível de combate', () => {
    expect(
      getMarketplaceTradeProgressLevel({
        level: 1,
        craftingSkill: { level: 30 },
        huntingSkill: { level: 7 },
        gatheringSkills: [],
      }),
    ).toBe(30);
  });
});
