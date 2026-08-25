import { EconomyDirection, EconomyResourceType, Prisma } from '@prisma/client';
import {
  accumulateEconomyEntry,
  getEconomyHourBucket,
  recordEconomyEntry,
} from './economy-ledger';

describe('economy ledger', () => {
  const input = {
    characterId: 'character-1',
    direction: EconomyDirection.CREDIT,
    resourceType: EconomyResourceType.ITEM,
    quantity: 3,
    reason: 'TEST_REASON',
    idempotencyKey: 'test:entry:1',
    tier: 1,
    itemId: 'item-1',
  };

  it('registra operacoes discretas por create', async () => {
    const create = jest.fn(
      (args: { data: { quantity: number; idempotencyKey: string } }) => {
        void args;
        return Promise.resolve({ id: 'entry-1' });
      },
    );
    const tx = {
      economyLedgerEntry: { create },
    } as unknown as Prisma.TransactionClient;

    await recordEconomyEntry(tx, input);

    expect(create.mock.calls[0][0].data.quantity).toBe(3);
    expect(create.mock.calls[0][0].data.idempotencyKey).toBe('test:entry:1');
  });

  it('acumula loops continuos no mesmo bucket', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'entry-1', quantity: 6 });
    const tx = {
      economyLedgerEntry: { upsert },
    } as unknown as Prisma.TransactionClient;

    await accumulateEconomyEntry(tx, input);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'test:entry:1' },
        update: { quantity: { increment: 3 }, balanceAfter: undefined },
      }),
    );
  });

  it('aceita tier zero para itens de aprendiz e rejeita quantidade invalida', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'entry-1' });
    const tx = {
      economyLedgerEntry: { create },
    } as unknown as Prisma.TransactionClient;

    await expect(
      recordEconomyEntry(tx, { ...input, tier: 0 }),
    ).resolves.toEqual({ id: 'entry-1' });
    await expect(
      recordEconomyEntry(tx, { ...input, quantity: 0 }),
    ).rejects.toThrow('inteiro positivo');
  });

  it('gera buckets horarios estaveis', () => {
    expect(getEconomyHourBucket(new Date('2026-08-24T10:05:00.000Z'))).toBe(
      getEconomyHourBucket(new Date('2026-08-24T10:59:59.999Z')),
    );
  });
});
