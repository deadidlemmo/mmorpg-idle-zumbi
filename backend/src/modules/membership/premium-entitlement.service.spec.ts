import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PremiumEntitlementService } from './premium-entitlement.service';

function transaction(premiumUntil: Date | null = null) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
    user: {
      findUnique: jest.fn().mockResolvedValue({ premiumUntil }),
      update: jest.fn(),
    },
  };
}

function transactionClient(value: ReturnType<typeof transaction>) {
  return value as unknown as Prisma.TransactionClient;
}

describe('PremiumEntitlementService', () => {
  const service = new PremiumEntitlementService();
  const now = new Date('2026-08-31T12:00:00.000Z');

  it('inicia o Premium no momento da concessão quando está inativo', async () => {
    const tx = transaction();

    await expect(
      service.extendPremium(transactionClient(tx), {
        userId: 'user-1',
        premiumDays: 1,
        now,
      }),
    ).resolves.toMatchObject({
      premiumBefore: null,
      startsAt: now,
      premiumUntil: new Date('2026-09-01T12:00:00.000Z'),
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { premiumUntil: new Date('2026-09-01T12:00:00.000Z') },
    });
  });

  it('soma o novo período ao Premium ainda ativo', async () => {
    const currentPremiumUntil = new Date('2026-09-10T12:00:00.000Z');
    const tx = transaction(currentPremiumUntil);

    await expect(
      service.extendPremium(transactionClient(tx), {
        userId: 'user-1',
        premiumDays: 1,
        now,
      }),
    ).resolves.toMatchObject({
      premiumBefore: currentPremiumUntil,
      startsAt: currentPremiumUntil,
      premiumUntil: new Date('2026-09-11T12:00:00.000Z'),
    });
  });

  it('rejeita período inválido', async () => {
    await expect(
      service.extendPremium(transactionClient(transaction()), {
        userId: 'user-1',
        premiumDays: 0,
        now,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita conta inexistente antes de conceder', async () => {
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.extendPremium(transactionClient(tx), {
        userId: 'missing',
        premiumDays: 1,
        now,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
