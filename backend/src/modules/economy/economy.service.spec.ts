import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryItemType,
  MaterialOrigin,
  Prisma,
  Rarity,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EconomyService } from './economy.service';

const SOURCE_ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const sourceItem = {
  id: SOURCE_ITEM_ID,
  name: 'Fragmento de Ameaça T1',
  slug: 'fragmento-de-ameaca-t1',
  description: null,
  tier: 1,
  rarity: Rarity.COMMON,
};

const targetItem = {
  id: TARGET_ITEM_ID,
  name: 'Biomaterial Craniano Comum',
  slug: 'biomaterial-craniano-comum',
  description: null,
  tier: 1,
  rarity: Rarity.COMMON,
  materialOrigin: MaterialOrigin.DROP_MOBS,
  craftingIngredients: [{ recipe: { tier: 1 } }],
};

function createExchangeTransaction(options?: {
  sourceBalance?: number;
  existingLedger?: {
    balanceAfter: number;
    metadata: Record<string, unknown>;
  } | null;
  debitCount?: number;
}) {
  const itemFindFirst = jest
    .fn()
    .mockResolvedValueOnce(targetItem)
    .mockResolvedValueOnce({ id: sourceItem.id, name: sourceItem.name });
  const inventoryUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: options?.debitCount ?? 1 });
  const inventoryUpsert = jest.fn().mockResolvedValue({ quantity: 9 });
  const ledgerCreate = jest.fn().mockResolvedValue({ id: 'ledger-id' });
  const tx = {
    character: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'character-1',
        name: 'Lutador',
      }),
    },
    item: { findFirst: itemFindFirst },
    economyLedgerEntry: {
      findUnique: jest.fn().mockResolvedValue(options?.existingLedger ?? null),
      create: ledgerCreate,
    },
    inventoryItem: {
      updateMany: inventoryUpdateMany,
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ quantity: options?.sourceBalance ?? 4 }),
      upsert: inventoryUpsert,
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    itemFindFirst,
    inventoryUpdateMany,
    inventoryUpsert,
    ledgerCreate,
  };
}

function createServiceWithTransaction(tx: Prisma.TransactionClient) {
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: Prisma.TransactionClient) => unknown) =>
        callback(tx),
    ),
  } as unknown as PrismaService;
  return new EconomyService(prisma);
}

describe('EconomyService com recursos físicos', () => {
  it('rejeita consulta de item sem ownership do personagem', async () => {
    const prisma = {
      character: { findFirst: jest.fn().mockResolvedValue(null) },
      item: { findUnique: jest.fn().mockResolvedValue(sourceItem) },
      inventoryItem: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new EconomyService(prisma);

    await expect(
      service.getExchangeOffersForItem('user-2', 'character-1', SOURCE_ITEM_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('lê a quantidade da mochila e oferece somente itens do mesmo tier', async () => {
    const prisma = {
      character: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'character-1', name: 'Lutador' }),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue(sourceItem),
        findMany: jest.fn().mockResolvedValue([targetItem]),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 12 }),
      },
    } as unknown as PrismaService;
    const service = new EconomyService(prisma);

    const result = await service.getExchangeOffersForItem(
      'user-1',
      'character-1',
      SOURCE_ITEM_ID,
    );

    expect(result.sourceItem).toMatchObject({
      id: SOURCE_ITEM_ID,
      quantity: 12,
      currency: 'WORLD_BOSS_FRAGMENT',
    });
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.id).toBe(`WBEM:${TARGET_ITEM_ID}`);
    expect(result.offers[0]?.tier).toBe(1);
    expect(result.offers[0]?.item.id).toBe(TARGET_ITEM_ID);
  });

  it('debita a pilha física e credita o resultado atomicamente', async () => {
    const transaction = createExchangeTransaction({ sourceBalance: 3 });
    const service = createServiceWithTransaction(transaction.tx);

    const result = await service.exchange('user-1', 'character-1', {
      offerId: `WBEM:${TARGET_ITEM_ID}`,
      requestId: REQUEST_ID,
      sourceItemId: SOURCE_ITEM_ID,
      exchangeCount: 2,
    });

    expect(result).toMatchObject({
      applied: true,
      exchangeCount: 2,
      totalCost: 6,
      totalQuantity: 4,
      balance: 3,
    });
    expect(transaction.inventoryUpdateMany).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        itemId: SOURCE_ITEM_ID,
        quantity: { gt: 6 },
      },
      data: { quantity: { decrement: 6 } },
    });
    expect(transaction.inventoryUpsert).toHaveBeenCalledWith({
      where: {
        characterId_itemId: {
          characterId: 'character-1',
          itemId: TARGET_ITEM_ID,
        },
      },
      update: { quantity: { increment: 4 } },
      create: {
        characterId: 'character-1',
        itemId: TARGET_ITEM_ID,
        quantity: 4,
        type: InventoryItemType.MATERIAL,
      },
      select: { quantity: true },
    });
    expect(transaction.ledgerCreate).toHaveBeenCalledTimes(2);
  });

  it('não entrega o item quando a pilha de origem é insuficiente', async () => {
    const transaction = createExchangeTransaction({ debitCount: 0 });
    const service = createServiceWithTransaction(transaction.tx);

    await expect(
      service.exchange('user-1', 'character-1', {
        offerId: `WBEM:${TARGET_ITEM_ID}`,
        requestId: REQUEST_ID,
        sourceItemId: SOURCE_ITEM_ID,
        exchangeCount: 2,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction.inventoryUpsert).not.toHaveBeenCalled();
    expect(transaction.ledgerCreate).not.toHaveBeenCalled();
  });

  it('não reaplica a mesma requisição idempotente', async () => {
    const offerId = `WBEM:${TARGET_ITEM_ID}`;
    const transaction = createExchangeTransaction({
      existingLedger: {
        balanceAfter: 4,
        metadata: {
          offerId,
          sourceItemId: SOURCE_ITEM_ID,
          exchangeCount: 1,
        },
      },
    });
    const service = createServiceWithTransaction(transaction.tx);

    const result = await service.exchange('user-1', 'character-1', {
      offerId,
      requestId: REQUEST_ID,
      sourceItemId: SOURCE_ITEM_ID,
      exchangeCount: 1,
    });

    expect(result).toMatchObject({ applied: false, balance: 4 });
    expect(transaction.inventoryUpdateMany).not.toHaveBeenCalled();
    expect(transaction.inventoryUpsert).not.toHaveBeenCalled();
  });

  it('rejeita reutilização da chave com quantidade diferente', async () => {
    const offerId = `WBEM:${TARGET_ITEM_ID}`;
    const transaction = createExchangeTransaction({
      existingLedger: {
        balanceAfter: 4,
        metadata: {
          offerId,
          sourceItemId: SOURCE_ITEM_ID,
          exchangeCount: 1,
        },
      },
    });
    const service = createServiceWithTransaction(transaction.tx);

    await expect(
      service.exchange('user-1', 'character-1', {
        offerId,
        requestId: REQUEST_ID,
        sourceItemId: SOURCE_ITEM_ID,
        exchangeCount: 2,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejeita identificadores antigos de troca de fragmento por casulo', async () => {
    const service = new EconomyService({
      $transaction: jest.fn(),
    } as unknown as PrismaService);

    await expect(
      service.exchange('user-1', 'character-1', {
        offerId: `WBC:${TARGET_ITEM_ID}`,
        requestId: REQUEST_ID,
        sourceItemId: SOURCE_ITEM_ID,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
