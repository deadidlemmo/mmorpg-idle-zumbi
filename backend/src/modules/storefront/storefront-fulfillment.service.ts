import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CosmeticGrantSource,
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  Prisma,
  StorefrontOrderStatus,
  StorefrontPaymentStatus,
  StorefrontSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { PremiumEntitlementService } from '../membership/premium-entitlement.service';
import { PREMIUM_PASS_ITEM_SLUG, STOREFRONT_OFFERS } from './storefront.config';
import type { StorefrontPaymentUpdate } from './storefront-payment.types';

const TRANSACTION_RETRIES = 3;

@Injectable()
export class StorefrontFulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly premiumEntitlements: PremiumEntitlementService,
  ) {}

  async applyPaymentUpdate(input: StorefrontPaymentUpdate) {
    return this.runSerializable(async (tx) => {
      const order = await tx.storefrontOrder.findUnique({
        where: { id: input.orderId },
      });

      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.provider !== input.provider) {
        throw new BadRequestException('Provedor divergente no pagamento.');
      }
      if (
        input.amountCents !== order.amountCents ||
        input.currency.toUpperCase() !== order.currency
      ) {
        throw new BadRequestException(
          'Valor ou moeda divergente no pagamento confirmado.',
        );
      }

      const payment = await tx.storefrontPayment.upsert({
        where: {
          provider_providerPaymentId: {
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
          },
        },
        create: {
          orderId: order.id,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerEventId: input.providerEventId ?? null,
          status: input.status,
          providerStatus: input.providerStatus,
          amountCents: input.amountCents,
          currency: input.currency.toUpperCase(),
          paidAt: input.paidAt ?? null,
          periodEndsAt: input.periodEndsAt ?? null,
          metadata: input.metadata ?? undefined,
        },
        update: {
          providerEventId: input.providerEventId ?? undefined,
          status: input.status,
          providerStatus: input.providerStatus,
          paidAt: input.paidAt ?? undefined,
          periodEndsAt: input.periodEndsAt ?? undefined,
          metadata: input.metadata ?? undefined,
        },
      });

      if (input.status !== StorefrontPaymentStatus.APPROVED) {
        await this.applyNonApprovedStatus(tx, order.id, input);
        return { applied: false, orderId: order.id, status: input.status };
      }

      const claimedPayment = await tx.storefrontPayment.updateMany({
        where: {
          id: payment.id,
          fulfillmentAppliedAt: null,
        },
        data: { fulfillmentAppliedAt: new Date() },
      });
      if (claimedPayment.count === 0) {
        return { applied: false, duplicate: true, orderId: order.id };
      }

      const offer = STOREFRONT_OFFERS.find(
        (candidate) => candidate.key === order.offerKey,
      );
      if (!offer || offer.kind !== order.offerKind) {
        throw new BadRequestException('Oferta do pedido não é mais válida.');
      }

      if (offer.kind !== 'SUBSCRIPTION') {
        const claimedOrder = await tx.storefrontOrder.updateMany({
          where: { id: order.id, fulfilledAt: null },
          data: {
            status: StorefrontOrderStatus.FULFILLED,
            providerStatus: input.providerStatus,
            paidAt: input.paidAt ?? new Date(),
            fulfilledAt: new Date(),
            failureCode: null,
          },
        });

        if (claimedOrder.count === 0) {
          return { applied: false, duplicate: true, orderId: order.id };
        }
      }

      switch (offer.kind) {
        case 'SUBSCRIPTION':
          await this.grantPremium(tx, {
            order,
            premiumDays: offer.premiumDays ?? 30,
            input,
          });
          break;
        case 'PREMIUM_ITEM':
          await this.grantPremiumItem(tx, order);
          break;
        case 'CASH_PACKAGE':
          await this.grantCash(tx, order, offer.cashAmount ?? 0);
          break;
        case 'PERMANENT_PACKAGE':
          await this.grantCosmeticCollection(tx, order, offer.collectionKey);
          break;
      }

      if (offer.kind === 'SUBSCRIPTION') {
        await tx.storefrontOrder.update({
          where: { id: order.id },
          data: {
            status: StorefrontOrderStatus.FULFILLED,
            providerStatus: input.providerStatus,
            paidAt: order.paidAt ?? input.paidAt ?? new Date(),
            fulfilledAt: order.fulfilledAt ?? new Date(),
            failureCode: null,
          },
        });
      }

      return { applied: true, orderId: order.id, offerKind: offer.kind };
    });
  }

  async updateSubscriptionStatus(params: {
    provider: StorefrontPaymentUpdate['provider'];
    providerSubscriptionId: string;
    orderId?: string | null;
    providerCustomerId?: string | null;
    status: StorefrontSubscriptionStatus;
    currentPeriodEndsAt?: Date | null;
    cancelAtPeriodEnd?: boolean;
  }) {
    const order = params.orderId
      ? await this.prisma.storefrontOrder.findUnique({
          where: { id: params.orderId },
          select: { id: true, userId: true },
        })
      : null;

    if (order) {
      return this.prisma.storefrontSubscription.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          userId: order.userId,
          provider: params.provider,
          providerSubscriptionId: params.providerSubscriptionId,
          providerCustomerId: params.providerCustomerId ?? null,
          status: params.status,
          currentPeriodEndsAt: params.currentPeriodEndsAt ?? null,
          cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? false,
          cancelledAt:
            params.status === StorefrontSubscriptionStatus.CANCELLED
              ? new Date()
              : null,
        },
        update: {
          providerCustomerId: params.providerCustomerId ?? undefined,
          status: params.status,
          currentPeriodEndsAt: params.currentPeriodEndsAt ?? undefined,
          cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? undefined,
          cancelledAt:
            params.status === StorefrontSubscriptionStatus.CANCELLED
              ? new Date()
              : undefined,
        },
      });
    }

    return this.prisma.storefrontSubscription.updateMany({
      where: {
        provider: params.provider,
        providerSubscriptionId: params.providerSubscriptionId,
      },
      data: {
        providerCustomerId: params.providerCustomerId ?? undefined,
        status: params.status,
        currentPeriodEndsAt: params.currentPeriodEndsAt ?? undefined,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? undefined,
        cancelledAt:
          params.status === StorefrontSubscriptionStatus.CANCELLED
            ? new Date()
            : undefined,
      },
    });
  }

  async findOrderIdBySubscription(
    provider: StorefrontPaymentUpdate['provider'],
    providerSubscriptionId: string,
  ) {
    const subscription = await this.prisma.storefrontSubscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider,
          providerSubscriptionId,
        },
      },
      select: { orderId: true },
    });
    return subscription?.orderId ?? null;
  }

  private async applyNonApprovedStatus(
    tx: Prisma.TransactionClient,
    orderId: string,
    input: StorefrontPaymentUpdate,
  ) {
    const status =
      input.status === StorefrontPaymentStatus.PENDING
        ? StorefrontOrderStatus.PAYMENT_PENDING
        : input.status === StorefrontPaymentStatus.REFUNDED
          ? StorefrontOrderStatus.REFUNDED
          : input.status === StorefrontPaymentStatus.CHARGEBACK_REVIEW
            ? StorefrontOrderStatus.CHARGEBACK_REVIEW
            : StorefrontOrderStatus.FAILED;

    await tx.storefrontOrder.updateMany({
      where: {
        id: orderId,
        ...(input.status === StorefrontPaymentStatus.PENDING
          ? { fulfilledAt: null }
          : {}),
      },
      data: {
        status,
        providerStatus: input.providerStatus,
      },
    });
  }

  private async grantPremium(
    tx: Prisma.TransactionClient,
    params: {
      order: {
        id: string;
        userId: string;
        providerCheckoutId: string | null;
      };
      premiumDays: number;
      input: StorefrontPaymentUpdate;
    },
  ) {
    const entitlement = await this.premiumEntitlements.extendPremium(tx, {
      userId: params.order.userId,
      premiumDays: params.premiumDays,
    });

    const subscriptionId =
      params.input.subscriptionId ?? params.order.providerCheckoutId;
    if (!subscriptionId) {
      throw new BadRequestException(
        'Assinatura aprovada sem identificador do provedor.',
      );
    }

    await tx.storefrontSubscription.upsert({
      where: { orderId: params.order.id },
      create: {
        orderId: params.order.id,
        userId: params.order.userId,
        provider: params.input.provider,
        providerSubscriptionId: subscriptionId,
        providerCustomerId: params.input.customerId ?? null,
        status: StorefrontSubscriptionStatus.ACTIVE,
        currentPeriodEndsAt:
          params.input.periodEndsAt ?? entitlement.premiumUntil,
      },
      update: {
        providerSubscriptionId: subscriptionId,
        providerCustomerId: params.input.customerId ?? undefined,
        status: StorefrontSubscriptionStatus.ACTIVE,
        currentPeriodEndsAt:
          params.input.periodEndsAt ?? entitlement.premiumUntil,
        cancelledAt: null,
      },
    });
  }

  private async grantPremiumItem(
    tx: Prisma.TransactionClient,
    order: { id: string; characterId: string },
  ) {
    const item = await tx.item.findUnique({
      where: { slug: PREMIUM_PASS_ITEM_SLUG },
      select: { id: true, tier: true },
    });
    if (!item) {
      throw new NotFoundException('Item do Passe Premium não encontrado.');
    }

    await tx.inventoryItem.upsert({
      where: {
        characterId_itemId: {
          characterId: order.characterId,
          itemId: item.id,
        },
      },
      create: {
        characterId: order.characterId,
        itemId: item.id,
        type: InventoryItemType.CONSUMABLE,
        quantity: 1,
      },
      update: {
        type: InventoryItemType.CONSUMABLE,
        quantity: { increment: 1 },
      },
    });

    await recordEconomyEntry(tx, {
      characterId: order.characterId,
      direction: EconomyDirection.CREDIT,
      resourceType: EconomyResourceType.ITEM,
      itemId: item.id,
      tier: item.tier,
      quantity: 1,
      reason: ECONOMY_REASONS.STOREFRONT_ITEM_PURCHASED,
      referenceType: 'StorefrontOrder',
      referenceId: order.id,
      idempotencyKey: `storefront:${order.id}:item`,
    });
  }

  private async grantCash(
    tx: Prisma.TransactionClient,
    order: { id: string; characterId: string },
    amount: number,
  ) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException('Pacote de Cash inválido.');
    }

    const character = await tx.character.update({
      where: { id: order.characterId },
      data: { cash: { increment: amount } },
      select: { cash: true },
    });

    await recordEconomyEntry(tx, {
      characterId: order.characterId,
      direction: EconomyDirection.CREDIT,
      resourceType: EconomyResourceType.CASH,
      quantity: amount,
      balanceAfter: character.cash,
      reason: ECONOMY_REASONS.STOREFRONT_CASH_PURCHASED,
      referenceType: 'StorefrontOrder',
      referenceId: order.id,
      idempotencyKey: `storefront:${order.id}:cash`,
    });
  }

  private async grantCosmeticCollection(
    tx: Prisma.TransactionClient,
    order: { id: string; userId: string },
    collectionKey?: string,
  ) {
    if (!collectionKey) {
      throw new BadRequestException('Pacote sem coleção de cosméticos.');
    }

    const cosmetics = await tx.cosmetic.findMany({
      where: {
        isActive: true,
        collection: { key: collectionKey, isActive: true },
      },
      select: { id: true },
    });
    if (cosmetics.length === 0) {
      throw new NotFoundException('Coleção comprada não foi encontrada.');
    }

    await tx.userCosmeticEntitlement.createMany({
      data: cosmetics.map((cosmetic) => ({
        grantKey: `${order.userId}:${cosmetic.id}:PURCHASE:${order.id}`,
        userId: order.userId,
        cosmeticId: cosmetic.id,
        source: CosmeticGrantSource.PURCHASE,
        sourceReference: order.id,
      })),
      skipDuplicates: true,
    });
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= TRANSACTION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt < TRANSACTION_RETRIES &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Transação de entrega não concluída.');
  }
}
