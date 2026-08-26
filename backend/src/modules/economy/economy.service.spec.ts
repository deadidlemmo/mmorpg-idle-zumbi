import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  EconomyCurrency,
  MaterialOrigin,
  Prisma,
  Rarity,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EconomyService } from './economy.service';

describe('EconomyService', () => {
  const input = {
    characterId: 'character-1',
    currency: EconomyCurrency.INCURSION_TOKEN,
    tier: 1,
    quantity: 2,
    reason: 'TEST_WALLET',
    idempotencyKey: 'wallet:test:1',
  };

  it('credita carteira e ledger na mesma transacao', async () => {
    const upsert = jest.fn().mockResolvedValue({ balance: 2 });
    const createLedgerEntry = jest.fn().mockResolvedValue({ id: 'ledger-1' });
    const tx = {
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: createLedgerEntry,
      },
      character: {
        findFirst: jest.fn().mockResolvedValue({ id: 'character-1' }),
      },
      characterEconomyBalance: {
        upsert,
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 2 }),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new EconomyService({} as PrismaService);

    const result = await service.creditWalletInTransaction(tx, input);

    expect(result.applied).toBe(true);
    expect(result.balance).toBe(2);
    expect(upsert).toHaveBeenCalled();
    expect(createLedgerEntry).toHaveBeenCalled();
  });

  it('nao reaplica uma chave idempotente', async () => {
    const existing = { id: 'ledger-1', balanceAfter: 7 };
    const tx = {
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new EconomyService({} as PrismaService);

    const result = await service.creditWalletInTransaction(tx, input);

    expect(result).toEqual({
      applied: false,
      balance: 7,
      ledgerEntry: existing,
    });
  });

  it('rejeita debito sem saldo suficiente', async () => {
    const tx = {
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      character: {
        findFirst: jest.fn().mockResolvedValue({ id: 'character-1' }),
      },
      characterEconomyBalance: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new EconomyService({} as PrismaService);

    await expect(service.debitWalletInTransaction(tx, input)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejeita consulta de ofertas de personagem sem ownership', async () => {
    const findMany = jest.fn();
    const prisma = {
      character: { findFirst: jest.fn().mockResolvedValue(null) },
      item: { findMany },
    } as unknown as PrismaService;
    const service = new EconomyService(prisma);

    await expect(
      service.getExchangeOffers(
        'user-2',
        'character-1',
        1,
        EconomyCurrency.INCURSION_TOKEN,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('oferece somente materiais em troca de fragmentos de ameaca', async () => {
    const exchangeItem = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Biomaterial Craniano Comum',
      slug: 'biomaterial-craniano-comum',
      description: null,
      tier: 1,
      rarity: Rarity.COMMON,
      materialOrigin: MaterialOrigin.DROP_MOBS,
    };
    const findMany = jest.fn().mockResolvedValue([exchangeItem]);
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Lutador',
        }),
      },
      item: { findMany },
      characterEconomyBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
            balance: 12,
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new EconomyService(prisma);

    const result = await service.getExchangeOffers(
      'user-1',
      'character-1',
      1,
      EconomyCurrency.WORLD_BOSS_FRAGMENT,
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      id: `WBEM:${exchangeItem.id}`,
      source: 'WORLD_BOSS_EMERGENCY_DROP',
      category: 'EMERGENCY',
      item: { id: exchangeItem.id },
    });
  });

  it('rejeita identificadores antigos de troca de fragmentos por casulo', async () => {
    const transaction = jest.fn();
    const service = new EconomyService({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      service.exchange('user-1', 'character-1', {
        offerId: 'WBC:11111111-1111-4111-8111-111111111111',
        requestId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('debita moeda e credita o material uma unica vez na troca', async () => {
    const exchangeItem = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Sucata Leve',
      slug: 'sucata-leve',
      description: null,
      tier: 1,
      rarity: Rarity.COMMON,
      materialOrigin: MaterialOrigin.DESMANCHE,
      craftingIngredients: [{ recipe: { tier: 1 } }],
    };
    const ledgerCreate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'ledger-currency' })
      .mockResolvedValueOnce({ id: 'ledger-item' });
    const balanceUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const inventoryUpsert = jest.fn().mockResolvedValue({});
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Lutador',
        }),
      },
      item: { findFirst: jest.fn().mockResolvedValue(exchangeItem) },
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: ledgerCreate,
      },
      characterEconomyBalance: {
        updateMany: balanceUpdate,
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balance: 4 }),
      },
      inventoryItem: { upsert: inventoryUpsert },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: jest.fn(
        (callback: (transaction: Prisma.TransactionClient) => unknown) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new EconomyService(prisma);

    const result = await service.exchange('user-1', 'character-1', {
      offerId: `INC:${exchangeItem.id}`,
      requestId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.applied).toBe(true);
    expect(result.balance).toBe(4);
    expect(balanceUpdate).toHaveBeenCalledTimes(1);
    expect(inventoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { quantity: { increment: 3 } },
      }),
    );
    expect(ledgerCreate).toHaveBeenCalledTimes(2);
  });

  it('reconhece repeticao da mesma troca sem creditar o item novamente', async () => {
    const itemId = '11111111-1111-4111-8111-111111111111';
    const offerId = `INC:${itemId}`;
    const balanceUpdate = jest.fn();
    const inventoryUpsert = jest.fn();
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Lutador',
        }),
      },
      item: {
        findFirst: jest.fn().mockResolvedValue({
          id: itemId,
          name: 'Sucata Leve',
          slug: 'sucata-leve',
          description: null,
          tier: 1,
          rarity: Rarity.COMMON,
          materialOrigin: MaterialOrigin.DESMANCHE,
          craftingIngredients: [{ recipe: { tier: 1 } }],
        }),
      },
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue({
          balanceAfter: 3,
          metadata: { offerId },
        }),
      },
      characterEconomyBalance: { updateMany: balanceUpdate },
      inventoryItem: { upsert: inventoryUpsert },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: jest.fn(
        (callback: (transaction: Prisma.TransactionClient) => unknown) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new EconomyService(prisma);

    const result = await service.exchange('user-1', 'character-1', {
      offerId,
      requestId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.applied).toBe(false);
    expect(result.balance).toBe(3);
    expect(balanceUpdate).not.toHaveBeenCalled();
    expect(inventoryUpsert).not.toHaveBeenCalled();
  });
});
