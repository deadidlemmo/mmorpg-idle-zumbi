import {
  InventoryItemType,
  StorefrontPaymentProvider,
  StorefrontPaymentStatus,
  StorefrontSubscriptionStatus,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PremiumEntitlementService } from '../membership/premium-entitlement.service';
import { StorefrontFulfillmentService } from './storefront-fulfillment.service';

function order(offerKey: string, offerKind: string) {
  return {
    id: 'order-1',
    userId: 'user-1',
    characterId: 'character-1',
    offerKey,
    offerKind,
    provider: StorefrontPaymentProvider.STRIPE,
    amountCents: 1990,
    currency: 'BRL',
    providerCheckoutId: 'checkout-1',
    paidAt: null,
    fulfilledAt: null,
  };
}

function transaction(orderValue: ReturnType<typeof order>) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
    storefrontOrder: {
      findUnique: jest.fn().mockResolvedValue(orderValue),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(orderValue),
    },
    storefrontPayment: {
      upsert: jest.fn().mockResolvedValue({ id: 'payment-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    storefrontSubscription: { upsert: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({ premiumUntil: null }),
      update: jest.fn(),
    },
    item: {
      findUnique: jest.fn().mockResolvedValue({ id: 'item-1', tier: 1 }),
    },
    inventoryItem: { upsert: jest.fn() },
    character: {
      update: jest.fn().mockResolvedValue({ cash: 500 }),
    },
    cosmetic: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'cosmetic-1' }, { id: 'cosmetic-2' }]),
    },
    userCosmeticEntitlement: { createMany: jest.fn() },
    economyLedgerEntry: { create: jest.fn() },
  };
}

function paymentUpdate() {
  return {
    provider: StorefrontPaymentProvider.STRIPE,
    orderId: 'order-1',
    providerPaymentId: 'payment-provider-1',
    providerEventId: 'event-1',
    status: StorefrontPaymentStatus.APPROVED,
    providerStatus: 'paid',
    amountCents: 1990,
    currency: 'BRL',
    paidAt: new Date('2026-08-30T12:00:00.000Z'),
  };
}

function serviceWith(tx: ReturnType<typeof transaction>) {
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return {
    service: new StorefrontFulfillmentService(
      prisma as unknown as PrismaService,
      new PremiumEntitlementService(),
    ),
    prisma,
  };
}

describe('StorefrontFulfillmentService', () => {
  it('entrega o Passe Premium na mochila', async () => {
    const tx = transaction(order('premium-abrigo-30d-item', 'PREMIUM_ITEM'));
    const { service } = serviceWith(tx);

    await expect(
      service.applyPaymentUpdate(paymentUpdate()),
    ).resolves.toMatchObject({
      applied: true,
      offerKind: 'PREMIUM_ITEM',
    });
    expect(tx.inventoryItem.upsert).toHaveBeenCalledWith({
      where: {
        characterId_itemId: {
          characterId: 'character-1',
          itemId: 'item-1',
        },
      },
      create: {
        characterId: 'character-1',
        itemId: 'item-1',
        type: InventoryItemType.CONSUMABLE,
        quantity: 1,
      },
      update: {
        type: InventoryItemType.CONSUMABLE,
        quantity: { increment: 1 },
      },
    });
    expect(tx.economyLedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it('ativa Premium na conta quando a assinatura é paga', async () => {
    const tx = transaction(order('premium-abrigo-monthly', 'SUBSCRIPTION'));
    const previousPremium = new Date('2026-09-10T12:00:00.000Z');
    const expectedPremiumUntil = new Date(
      previousPremium.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const periodEndsAt = new Date('2026-10-10T12:00:00.000Z');
    tx.user.findUnique.mockResolvedValue({ premiumUntil: previousPremium });
    const { service } = serviceWith(tx);

    await service.applyPaymentUpdate({
      ...paymentUpdate(),
      providerPaymentId: 'invoice:invoice-1',
      subscriptionId: 'subscription-1',
      periodEndsAt,
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { premiumUntil: expectedPremiumUntil },
    });
    expect(tx.storefrontSubscription.upsert).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      create: {
        orderId: 'order-1',
        userId: 'user-1',
        provider: StorefrontPaymentProvider.STRIPE,
        providerSubscriptionId: 'subscription-1',
        providerCustomerId: null,
        status: StorefrontSubscriptionStatus.ACTIVE,
        currentPeriodEndsAt: periodEndsAt,
      },
      update: {
        providerSubscriptionId: 'subscription-1',
        providerCustomerId: undefined,
        status: StorefrontSubscriptionStatus.ACTIVE,
        currentPeriodEndsAt: periodEndsAt,
        cancelledAt: null,
      },
    });
  });

  it('libera o pacote comprado para uso em Aparência', async () => {
    const tx = transaction(order('pacote-nucleo-helix', 'PERMANENT_PACKAGE'));
    const { service } = serviceWith(tx);

    await service.applyPaymentUpdate(paymentUpdate());

    expect(tx.userCosmeticEntitlement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          cosmeticId: 'cosmetic-1',
          source: 'PURCHASE',
        }),
        expect.objectContaining({
          userId: 'user-1',
          cosmeticId: 'cosmetic-2',
          source: 'PURCHASE',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('não entrega novamente quando o provedor repete o webhook', async () => {
    const tx = transaction(order('premium-abrigo-30d-item', 'PREMIUM_ITEM'));
    tx.storefrontPayment.updateMany.mockResolvedValue({ count: 0 });
    const { service } = serviceWith(tx);

    await expect(
      service.applyPaymentUpdate(paymentUpdate()),
    ).resolves.toMatchObject({
      applied: false,
      duplicate: true,
    });
    expect(tx.inventoryItem.upsert).not.toHaveBeenCalled();
    expect(tx.economyLedgerEntry.create).not.toHaveBeenCalled();
  });
});
