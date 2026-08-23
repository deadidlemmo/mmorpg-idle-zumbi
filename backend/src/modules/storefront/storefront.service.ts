import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isPremiumActive } from '../../common/utils/membership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStorefrontCheckoutDto } from './dto/create-storefront-checkout.dto';
import { STOREFRONT_OFFERS, STOREFRONT_PROVIDERS } from './storefront.config';

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

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

    const collectionKeys = STOREFRONT_OFFERS.map(
      (offer) => offer.collectionKey,
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
          select: { id: true },
        },
      },
    });
    const collectionsByKey = new Map(
      collections.map((collection) => [collection.key, collection]),
    );
    const permanentCosmeticIds = STOREFRONT_OFFERS.filter(
      (offer) => offer.kind === 'PERMANENT_PACKAGE',
    ).flatMap(
      (offer) =>
        collectionsByKey
          .get(offer.collectionKey)
          ?.cosmetics.map((cosmetic) => cosmetic.id) ?? [],
    );
    const entitlements = permanentCosmeticIds.length
      ? await this.prisma.userCosmeticEntitlement.findMany({
          where: {
            userId: character.userId,
            cosmeticId: { in: permanentCosmeticIds },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { cosmeticId: true },
        })
      : [];
    const entitlementIds = new Set(
      entitlements.map((entitlement) => entitlement.cosmeticId),
    );
    const premiumActive = isPremiumActive(character.user, now);

    return {
      checkout: {
        state: 'COMING_SOON' as const,
        enabled: false,
        message:
          'Os preços, as credenciais e os webhooks ainda serão configurados antes de liberar cobranças.',
        providers: STOREFRONT_PROVIDERS,
      },
      membership: {
        isPremiumActive: premiumActive,
        premiumUntil: character.user.premiumUntil,
      },
      offers: STOREFRONT_OFFERS.map((offer) => {
        const collection = collectionsByKey.get(offer.collectionKey);
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
            : itemIds.length > 0 && ownedItemCount === itemIds.length;

        return {
          ...offer,
          benefits: [...offer.benefits],
          price: {
            amountCents: null,
            currency: 'BRL' as const,
            formatted: 'Preço a definir',
          },
          collection: collection
            ? {
                key: collection.key,
                name: collection.name,
                description: collection.description,
                coverAssetKey: collection.coverAssetKey,
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
    const catalog = await this.getCatalog(userId, dto.characterId);
    const offer = catalog.offers.find((item) => item.key === dto.offerKey);

    if (offer?.ownership.isOwned) {
      throw new ConflictException('Esta oferta já está ativa nesta conta.');
    }

    throw new ServiceUnavailableException({
      code: 'CHECKOUT_NOT_CONFIGURED',
      message:
        'O checkout ainda não está habilitado. Nenhuma cobrança foi criada.',
      provider: dto.provider,
    });
  }
}
