import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorefrontOrderStatus,
  StorefrontSubscriptionStatus,
} from '@prisma/client';
import { isPremiumActive } from '../../common/utils/membership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStorefrontCheckoutDto } from './dto/create-storefront-checkout.dto';
import { StorefrontFulfillmentService } from './storefront-fulfillment.service';
import {
  getStorefrontProviders,
  getStorefrontProviderState,
} from './storefront-payment.config';
import { StorefrontPaymentsService } from './storefront-payments.service';
import { STOREFRONT_OFFERS } from './storefront.config';

function formatBrl(amountCents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountCents / 100);
}

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly payments: StorefrontPaymentsService,
    private readonly fulfillment: StorefrontFulfillmentService,
  ) {}

  async getCatalog(userId: string, characterId: string) {
    const now = new Date();
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        user: { select: { premiumUntil: true } },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const collectionKeys = STOREFRONT_OFFERS.flatMap((offer) =>
      offer.collectionKey ? [offer.collectionKey] : [],
    );
    const collections = await this.prisma.cosmeticCollection.findMany({
      where: { key: { in: collectionKeys }, isActive: true },
      select: {
        key: true,
        name: true,
        description: true,
        coverAssetKey: true,
        cosmetics: {
          where: { isActive: true },
          orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            key: true,
            name: true,
            description: true,
            type: true,
            rarity: true,
            assetKey: true,
            effectPreset: true,
            displayText: true,
            accentColor: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
    });
    const collectionsByKey = new Map(
      collections.map((collection) => [collection.key, collection]),
    );
    const permanentCosmeticIds = STOREFRONT_OFFERS.filter(
      (offer) => offer.kind === 'PERMANENT_PACKAGE',
    ).flatMap((offer) =>
      offer.collectionKey
        ? (collectionsByKey
            .get(offer.collectionKey)
            ?.cosmetics.map((cosmetic) => cosmetic.id) ?? [])
        : [],
    );
    const [entitlements, subscription] = await Promise.all([
      permanentCosmeticIds.length
        ? this.prisma.userCosmeticEntitlement.findMany({
            where: {
              userId: character.userId,
              cosmeticId: { in: permanentCosmeticIds },
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { cosmeticId: true },
          })
        : Promise.resolve<Array<{ cosmeticId: string }>>([]),
      this.prisma.storefrontSubscription.findFirst({
        where: {
          userId: character.userId,
          status: {
            in: [
              StorefrontSubscriptionStatus.ACTIVE,
              StorefrontSubscriptionStatus.PAST_DUE,
              StorefrontSubscriptionStatus.PAUSED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          provider: true,
          status: true,
          currentPeriodEndsAt: true,
          cancelAtPeriodEnd: true,
        },
      }),
    ]);
    const entitlementIds = new Set(
      entitlements.map((entitlement) => entitlement.cosmeticId),
    );
    const premiumActive = isPremiumActive(character.user, now);
    const providers = getStorefrontProviders(this.configService);
    const checkoutEnabled = providers.some(
      (provider) => provider.state === 'AVAILABLE',
    );

    return {
      checkout: {
        state: checkoutEnabled
          ? ('AVAILABLE' as const)
          : ('COMING_SOON' as const),
        enabled: checkoutEnabled,
        message: checkoutEnabled
          ? 'Escolha Mercado Pago ou Stripe para concluir a compra com segurança.'
          : 'Os pagamentos serão liberados quando as credenciais e os webhooks forem configurados.',
        providers,
      },
      membership: {
        isPremiumActive: premiumActive,
        premiumUntil: character.user.premiumUntil,
        subscription,
      },
      offers: STOREFRONT_OFFERS.map(({ priceCents, ...offer }) => {
        const collection = offer.collectionKey
          ? collectionsByKey.get(offer.collectionKey)
          : undefined;
        const itemIds =
          collection?.cosmetics.map((cosmetic) => cosmetic.id) ?? [];
        const ownedItemCount =
          offer.kind === 'SUBSCRIPTION'
            ? premiumActive
              ? itemIds.length
              : 0
            : itemIds.filter((id) => entitlementIds.has(id)).length;
        const isOwned =
          offer.kind === 'SUBSCRIPTION'
            ? premiumActive
            : offer.kind === 'PERMANENT_PACKAGE'
              ? itemIds.length > 0 && ownedItemCount === itemIds.length
              : false;

        return {
          ...offer,
          benefits: [...offer.benefits],
          price: {
            amountCents: priceCents,
            currency: 'BRL' as const,
            formatted: formatBrl(priceCents),
          },
          collection: collection
            ? {
                key: collection.key,
                name: collection.name,
                description: collection.description,
                coverAssetKey: collection.coverAssetKey,
                items: collection.cosmetics.map((cosmetic) => ({
                  id: cosmetic.id,
                  key: cosmetic.key,
                  name: cosmetic.name,
                  description: cosmetic.description,
                  type: cosmetic.type,
                  rarity: cosmetic.rarity,
                  assetKey: cosmetic.assetKey,
                  effectPreset: cosmetic.effectPreset,
                  displayText: cosmetic.displayText,
                  accentColor: cosmetic.accentColor,
                  class: cosmetic.class,
                })),
              }
            : null,
          ownership: {
            isOwned,
            ownedItemCount,
            totalItemCount: itemIds.length,
            activeUntil:
              offer.kind === 'SUBSCRIPTION'
                ? character.user.premiumUntil
                : null,
          },
        };
      }),
    };
  }

  async createCheckout(userId: string, dto: CreateStorefrontCheckoutDto) {
    const offer = STOREFRONT_OFFERS.find(
      (candidate) => candidate.key === dto.offerKey,
    );
    if (!offer) throw new NotFoundException('Oferta não encontrada.');

    if (
      getStorefrontProviderState(this.configService, dto.provider) !==
      'AVAILABLE'
    ) {
      throw new ServiceUnavailableException({
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        message: 'Este meio de pagamento ainda não está configurado.',
        provider: dto.provider,
      });
    }

    const character = await this.prisma.character.findFirst({
      where: { id: dto.characterId, userId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        user: { select: { email: true } },
      },
    });
    if (!character) throw new NotFoundException('Personagem não encontrado.');

    const catalog = await this.getCatalog(userId, dto.characterId);
    const catalogOffer = catalog.offers.find(
      (candidate) => candidate.key === dto.offerKey,
    );
    if (catalogOffer?.ownership.isOwned) {
      throw new ConflictException('Esta oferta já está ativa nesta conta.');
    }

    const idempotencyKey = `storefront:${userId}:${dto.requestId}`;
    const previousOrder = await this.prisma.storefrontOrder.findUnique({
      where: { idempotencyKey },
    });
    if (previousOrder) {
      if (
        previousOrder.characterId !== dto.characterId ||
        previousOrder.offerKey !== dto.offerKey ||
        previousOrder.provider !== dto.provider
      ) {
        throw new ConflictException(
          'A identificação desta tentativa já foi usada em outra compra.',
        );
      }
      if (previousOrder.checkoutUrl) return this.formatCheckout(previousOrder);
      throw new ConflictException('Este checkout ainda está sendo preparado.');
    }

    const order = await this.prisma.storefrontOrder.create({
      data: {
        idempotencyKey,
        userId,
        characterId: dto.characterId,
        offerKey: offer.key,
        offerKind: offer.kind,
        provider: dto.provider,
        amountCents: offer.priceCents,
        currency: 'BRL',
      },
    });

    try {
      const checkout = await this.payments.createCheckout({
        order,
        offer,
        payerEmail: character.user.email,
      });
      const updatedOrder = await this.prisma.storefrontOrder.update({
        where: { id: order.id },
        data: {
          status: StorefrontOrderStatus.CHECKOUT_CREATED,
          providerCheckoutId: checkout.checkoutId,
          checkoutUrl: checkout.checkoutUrl,
          providerStatus: checkout.providerStatus,
          expiresAt: checkout.expiresAt,
        },
      });

      if (checkout.subscriptionId) {
        await this.fulfillment.updateSubscriptionStatus({
          provider: dto.provider,
          providerSubscriptionId: checkout.subscriptionId,
          providerCustomerId: checkout.customerId,
          orderId: order.id,
          status: StorefrontSubscriptionStatus.PENDING,
        });
      }

      return this.formatCheckout(updatedOrder);
    } catch (error) {
      await this.prisma.storefrontOrder.update({
        where: { id: order.id },
        data: {
          status: StorefrontOrderStatus.FAILED,
          failureCode:
            error instanceof Error ? error.constructor.name : 'UNKNOWN_ERROR',
        },
      });
      throw error;
    }
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.storefrontOrder.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        offerKey: true,
        offerKind: true,
        provider: true,
        status: true,
        amountCents: true,
        currency: true,
        providerStatus: true,
        expiresAt: true,
        paidAt: true,
        fulfilledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    return {
      ...order,
      price: {
        amountCents: order.amountCents,
        currency: order.currency,
        formatted: formatBrl(order.amountCents),
      },
      delivered: order.status === StorefrontOrderStatus.FULFILLED,
    };
  }

  private formatCheckout(order: {
    id: string;
    checkoutUrl: string | null;
    expiresAt: Date | null;
    provider: string;
    status: StorefrontOrderStatus;
  }) {
    if (!order.checkoutUrl) {
      throw new ServiceUnavailableException(
        'O provedor não retornou uma URL de pagamento.',
      );
    }

    return {
      orderId: order.id,
      checkoutId: order.id,
      checkoutUrl: order.checkoutUrl,
      expiresAt: order.expiresAt,
      provider: order.provider,
      status: order.status,
    };
  }
}
