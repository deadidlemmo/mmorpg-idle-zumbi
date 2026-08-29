import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterStatus,
  EconomyDirection,
  EconomyResourceType,
  MarketListingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { BuyMarketListingDto } from './dto/buy-market-listing.dto';
import { CancelMarketListingDto } from './dto/cancel-market-listing.dto';
import { CreateMarketListingDto } from './dto/create-market-listing.dto';
import {
  MarketListingSort,
  MarketListingsQueryDto,
} from './dto/market-listings-query.dto';

const MAX_ACTIVE_LISTINGS = 30;
const MAX_MARKET_QUANTITY = 1_000_000;
const MAX_UNIT_PRICE = 1_000_000_000;
const MAX_TOTAL_PRICE = 2_000_000_000;
const MAX_DATABASE_INT = 2_147_483_647;
const TRANSACTION_RETRIES = 3;

const marketListingInclude = {
  item: true,
  seller: {
    select: {
      id: true,
      name: true,
      userId: true,
      status: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.MarketListingInclude;

const marketPurchaseInclude = {
  item: true,
  listing: {
    include: marketListingInclude,
  },
  buyer: {
    select: {
      id: true,
      name: true,
      userId: true,
      gold: true,
    },
  },
  seller: {
    select: {
      id: true,
      name: true,
      userId: true,
      gold: true,
    },
  },
} satisfies Prisma.MarketPurchaseInclude;

type MarketListingRecord = Prisma.MarketListingGetPayload<{
  include: typeof marketListingInclude;
}>;

type MarketPurchaseRecord = Prisma.MarketPurchaseGetPayload<{
  include: typeof marketPurchaseInclude;
}>;

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getListings(
    userId: string,
    characterId: string,
    query: MarketListingsQueryDto,
  ) {
    const character = await this.findOwnedCharacter(userId, characterId);
    const { page, pageSize, skip } = this.getPagination(query);
    const filters: Prisma.MarketListingWhereInput[] = [];
    const search = query.search?.trim();

    if (search) {
      filters.push({
        OR: [
          {
            item: {
              is: { name: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            seller: {
              is: { name: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      });
    }

    if (query.tier !== undefined || query.rarity) {
      filters.push({
        item: {
          is: {
            ...(query.tier !== undefined ? { tier: query.tier } : {}),
            ...(query.rarity ? { rarity: query.rarity } : {}),
          },
        },
      });
    }

    const where: Prisma.MarketListingWhereInput = {
      status: MarketListingStatus.ACTIVE,
      quantityRemaining: { gt: 0 },
      ...(query.type ? { type: query.type } : {}),
      seller: {
        is: {
          userId: { not: userId },
          status: CharacterStatus.ACTIVE,
          deletedAt: null,
        },
      },
      AND: filters,
    };

    const [total, listings] = await this.prisma.$transaction([
      this.prisma.marketListing.count({ where }),
      this.prisma.marketListing.findMany({
        where,
        include: marketListingInclude,
        orderBy: this.getOrderBy(query.sort),
        skip,
        take: pageSize,
      }),
    ]);

    return {
      character: this.mapCharacter(character),
      listings: listings.map((listing) => this.mapListing(listing)),
      pagination: this.mapPagination(total, page, pageSize),
    };
  }

  async getSellableItems(userId: string, characterId: string) {
    const character = await this.findOwnedCharacter(userId, characterId);
    const [items, activeListings] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where: {
          characterId,
          quantity: { gt: 0 },
          item: { is: { isTradable: true } },
        },
        include: { item: true },
        orderBy: [{ item: { tier: 'desc' } }, { createdAt: 'asc' }],
      }),
      this.prisma.marketListing.count({
        where: {
          sellerCharacterId: characterId,
          status: MarketListingStatus.ACTIVE,
        },
      }),
    ]);

    return {
      character: this.mapCharacter(character),
      activeListings,
      maxActiveListings: MAX_ACTIVE_LISTINGS,
      items,
    };
  }

  async getMyListings(
    userId: string,
    characterId: string,
    query: MarketListingsQueryDto,
  ) {
    const character = await this.findOwnedCharacter(userId, characterId);
    const { page, pageSize, skip } = this.getPagination(query);
    const where: Prisma.MarketListingWhereInput = {
      sellerCharacterId: characterId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, activeListings, listings] = await this.prisma.$transaction([
      this.prisma.marketListing.count({ where }),
      this.prisma.marketListing.count({
        where: {
          sellerCharacterId: characterId,
          status: MarketListingStatus.ACTIVE,
        },
      }),
      this.prisma.marketListing.findMany({
        where,
        include: marketListingInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return {
      character: this.mapCharacter(character),
      activeListings,
      maxActiveListings: MAX_ACTIVE_LISTINGS,
      listings: listings.map((listing) => this.mapListing(listing)),
      pagination: this.mapPagination(total, page, pageSize),
    };
  }

  async createListing(userId: string, dto: CreateMarketListingDto) {
    const listing = await this.runSerializable(async (tx) => {
      const repeated = await tx.marketListing.findUnique({
        where: { requestId: dto.requestId },
        include: marketListingInclude,
      });

      if (repeated) {
        this.assertListingReplay(repeated, userId, dto);
        return repeated;
      }

      const character = await tx.character.findFirst({
        where: {
          id: dto.characterId,
          userId,
          status: CharacterStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!character) {
        throw new NotFoundException('Personagem não encontrado.');
      }

      const activeListings = await tx.marketListing.count({
        where: {
          sellerCharacterId: character.id,
          status: MarketListingStatus.ACTIVE,
        },
      });

      if (activeListings >= MAX_ACTIVE_LISTINGS) {
        throw new BadRequestException(
          `Você pode manter até ${MAX_ACTIVE_LISTINGS} anúncios ativos.`,
        );
      }

      const inventoryItem = await tx.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: dto.itemId,
          },
        },
        include: { item: true },
      });

      if (!inventoryItem) {
        throw new NotFoundException('Item não encontrado na mochila.');
      }

      if (!inventoryItem.item.isTradable) {
        throw new BadRequestException('Este item não pode ser comercializado.');
      }

      this.assertMarketValues(dto.quantity, dto.unitPrice);

      if (dto.quantity > inventoryItem.quantity) {
        throw new BadRequestException(
          'A quantidade anunciada é maior que o estoque da mochila.',
        );
      }

      const reserved = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          characterId: character.id,
          quantity: { gte: dto.quantity },
        },
        data: { quantity: { decrement: dto.quantity } },
      });

      if (reserved.count !== 1) {
        throw new ConflictException(
          'O estoque mudou enquanto o anúncio era criado. Tente novamente.',
        );
      }

      await tx.inventoryItem.deleteMany({
        where: { id: inventoryItem.id, quantity: 0 },
      });

      const created = await tx.marketListing.create({
        data: {
          sellerCharacterId: character.id,
          itemId: inventoryItem.itemId,
          type: inventoryItem.type,
          quantityInitial: dto.quantity,
          quantityRemaining: dto.quantity,
          unitPrice: dto.unitPrice,
          requestId: dto.requestId,
        },
        include: marketListingInclude,
      });

      await recordEconomyEntry(tx, {
        characterId: character.id,
        direction: EconomyDirection.DEBIT,
        resourceType: EconomyResourceType.ITEM,
        itemId: inventoryItem.itemId,
        tier: inventoryItem.item.tier,
        quantity: dto.quantity,
        reason: ECONOMY_REASONS.MARKET_LISTING_ITEM_RESERVED,
        referenceType: 'MarketListing',
        referenceId: created.id,
        idempotencyKey: `market-listing:${created.id}:reserved`,
        metadata: { unitPrice: dto.unitPrice },
      });

      return created;
    });

    return {
      message: 'Anúncio publicado no Mercado do Abrigo.',
      listing: this.mapListing(listing),
    };
  }

  async buyListing(
    userId: string,
    listingId: string,
    dto: BuyMarketListingDto,
  ) {
    const purchase = await this.runSerializable(async (tx) => {
      const repeated = await tx.marketPurchase.findUnique({
        where: { requestId: dto.requestId },
        include: marketPurchaseInclude,
      });

      if (repeated) {
        this.assertPurchaseReplay(repeated, userId, listingId, dto);
        return repeated;
      }

      const buyer = await tx.character.findFirst({
        where: {
          id: dto.characterId,
          userId,
          status: CharacterStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true, gold: true },
      });

      if (!buyer) {
        throw new NotFoundException('Personagem não encontrado.');
      }

      const listing = await tx.marketListing.findUnique({
        where: { id: listingId },
        include: marketListingInclude,
      });

      if (!listing || listing.status !== MarketListingStatus.ACTIVE) {
        throw new ConflictException('Este anúncio não está mais disponível.');
      }

      if (
        listing.seller.status !== CharacterStatus.ACTIVE ||
        listing.seller.deletedAt
      ) {
        throw new ConflictException('Este anúncio não está mais disponível.');
      }

      if (listing.seller.userId === userId) {
        throw new BadRequestException(
          'Não é possível comprar um anúncio da própria conta.',
        );
      }

      this.assertMarketValues(dto.quantity, listing.unitPrice);

      if (dto.quantity > listing.quantityRemaining) {
        throw new ConflictException(
          'A quantidade solicitada não está mais disponível.',
        );
      }

      const totalPrice = dto.quantity * listing.unitPrice;

      if (buyer.gold < totalPrice) {
        throw new BadRequestException('Gold insuficiente para esta compra.');
      }

      const buyerInventory = await tx.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: buyer.id,
            itemId: listing.itemId,
          },
        },
        select: { quantity: true },
      });

      if (
        buyerInventory &&
        buyerInventory.quantity > MAX_DATABASE_INT - dto.quantity
      ) {
        throw new BadRequestException(
          'A pilha deste item atingiu o limite permitido.',
        );
      }

      const isSoldOut = listing.quantityRemaining === dto.quantity;
      const stockUpdate = await tx.marketListing.updateMany({
        where: {
          id: listing.id,
          status: MarketListingStatus.ACTIVE,
          quantityRemaining: { gte: dto.quantity },
        },
        data: {
          quantityRemaining: { decrement: dto.quantity },
          ...(isSoldOut
            ? {
                status: MarketListingStatus.SOLD_OUT,
                closedAt: new Date(),
              }
            : {}),
        },
      });

      if (stockUpdate.count !== 1) {
        throw new ConflictException(
          'O estoque mudou durante a compra. Nenhum Gold foi descontado.',
        );
      }

      const buyerDebit = await tx.character.updateMany({
        where: {
          id: buyer.id,
          userId,
          gold: { gte: totalPrice },
        },
        data: { gold: { decrement: totalPrice } },
      });

      if (buyerDebit.count !== 1) {
        throw new BadRequestException(
          'Saldo alterado durante a compra. Nenhum Gold foi descontado.',
        );
      }

      const sellerCredit = await tx.character.updateMany({
        where: {
          id: listing.sellerCharacterId,
          status: CharacterStatus.ACTIVE,
          deletedAt: null,
          gold: { lte: MAX_DATABASE_INT - totalPrice },
        },
        data: { gold: { increment: totalPrice } },
      });

      if (sellerCredit.count !== 1) {
        throw new ConflictException(
          'A venda não pôde ser concluída. Nenhum Gold foi descontado.',
        );
      }

      await tx.inventoryItem.upsert({
        where: {
          characterId_itemId: {
            characterId: buyer.id,
            itemId: listing.itemId,
          },
        },
        create: {
          characterId: buyer.id,
          itemId: listing.itemId,
          type: listing.type,
          quantity: dto.quantity,
        },
        update: {
          type: listing.type,
          quantity: { increment: dto.quantity },
        },
      });

      const createdPurchase = await tx.marketPurchase.create({
        data: {
          listingId: listing.id,
          buyerCharacterId: buyer.id,
          sellerCharacterId: listing.sellerCharacterId,
          itemId: listing.itemId,
          quantity: dto.quantity,
          unitPrice: listing.unitPrice,
          totalPrice,
          requestId: dto.requestId,
        },
      });

      const [updatedBuyer, updatedSeller] = await Promise.all([
        tx.character.findUniqueOrThrow({
          where: { id: buyer.id },
          select: { gold: true },
        }),
        tx.character.findUniqueOrThrow({
          where: { id: listing.sellerCharacterId },
          select: { gold: true },
        }),
      ]);

      await recordEconomyEntry(tx, {
        characterId: buyer.id,
        direction: EconomyDirection.DEBIT,
        resourceType: EconomyResourceType.GOLD,
        tier: listing.item.tier,
        quantity: totalPrice,
        balanceAfter: updatedBuyer.gold,
        reason: ECONOMY_REASONS.MARKET_PURCHASE_GOLD_SPENT,
        referenceType: 'MarketPurchase',
        referenceId: createdPurchase.id,
        idempotencyKey: `market-purchase:${createdPurchase.id}:buyer-gold`,
        metadata: { listingId: listing.id, unitPrice: listing.unitPrice },
      });
      await recordEconomyEntry(tx, {
        characterId: buyer.id,
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.ITEM,
        itemId: listing.itemId,
        tier: listing.item.tier,
        quantity: dto.quantity,
        reason: ECONOMY_REASONS.MARKET_PURCHASE_ITEM_RECEIVED,
        referenceType: 'MarketPurchase',
        referenceId: createdPurchase.id,
        idempotencyKey: `market-purchase:${createdPurchase.id}:buyer-item`,
      });
      await recordEconomyEntry(tx, {
        characterId: listing.sellerCharacterId,
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.GOLD,
        tier: listing.item.tier,
        quantity: totalPrice,
        balanceAfter: updatedSeller.gold,
        reason: ECONOMY_REASONS.MARKET_SALE_GOLD_RECEIVED,
        referenceType: 'MarketPurchase',
        referenceId: createdPurchase.id,
        idempotencyKey: `market-purchase:${createdPurchase.id}:seller-gold`,
        metadata: { listingId: listing.id, unitPrice: listing.unitPrice },
      });

      return tx.marketPurchase.findUniqueOrThrow({
        where: { id: createdPurchase.id },
        include: marketPurchaseInclude,
      });
    });

    return {
      message: `${purchase.quantity}x ${purchase.item.name} comprado com segurança.`,
      purchase: this.mapPurchase(purchase),
    };
  }

  async cancelListing(
    userId: string,
    listingId: string,
    dto: CancelMarketListingDto,
  ) {
    const listing = await this.runSerializable(async (tx) => {
      const current = await tx.marketListing.findUnique({
        where: { id: listingId },
        include: marketListingInclude,
      });

      if (
        !current ||
        current.sellerCharacterId !== dto.characterId ||
        current.seller.userId !== userId
      ) {
        throw new NotFoundException('Anúncio não encontrado.');
      }

      if (current.status === MarketListingStatus.CANCELLED) {
        return current;
      }

      if (current.status === MarketListingStatus.SOLD_OUT) {
        throw new ConflictException(
          'Um anúncio esgotado não pode ser cancelado.',
        );
      }

      const inventoryItem = await tx.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: dto.characterId,
            itemId: current.itemId,
          },
        },
        select: { quantity: true },
      });

      if (
        inventoryItem &&
        inventoryItem.quantity > MAX_DATABASE_INT - current.quantityRemaining
      ) {
        throw new BadRequestException(
          'A pilha deste item atingiu o limite permitido.',
        );
      }

      const cancelled = await tx.marketListing.updateMany({
        where: {
          id: current.id,
          sellerCharacterId: dto.characterId,
          status: MarketListingStatus.ACTIVE,
          quantityRemaining: current.quantityRemaining,
        },
        data: {
          status: MarketListingStatus.CANCELLED,
          quantityCancelled: current.quantityRemaining,
          quantityRemaining: 0,
          closedAt: new Date(),
        },
      });

      if (cancelled.count !== 1) {
        throw new ConflictException(
          'O anúncio mudou durante o cancelamento. Tente novamente.',
        );
      }

      await tx.inventoryItem.upsert({
        where: {
          characterId_itemId: {
            characterId: dto.characterId,
            itemId: current.itemId,
          },
        },
        create: {
          characterId: dto.characterId,
          itemId: current.itemId,
          type: current.type,
          quantity: current.quantityRemaining,
        },
        update: {
          type: current.type,
          quantity: { increment: current.quantityRemaining },
        },
      });

      await recordEconomyEntry(tx, {
        characterId: dto.characterId,
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.ITEM,
        itemId: current.itemId,
        tier: current.item.tier,
        quantity: current.quantityRemaining,
        reason: ECONOMY_REASONS.MARKET_LISTING_ITEM_RETURNED,
        referenceType: 'MarketListing',
        referenceId: current.id,
        idempotencyKey: `market-listing:${current.id}:returned`,
      });

      return tx.marketListing.findUniqueOrThrow({
        where: { id: current.id },
        include: marketListingInclude,
      });
    });

    return {
      message: 'Anúncio cancelado. O estoque restante voltou para a mochila.',
      listing: this.mapListing(listing),
    };
  }

  private async findOwnedCharacter(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        status: CharacterStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, name: true, gold: true },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    return character;
  }

  private assertListingReplay(
    listing: MarketListingRecord,
    userId: string,
    dto: CreateMarketListingDto,
  ) {
    if (
      listing.seller.userId !== userId ||
      listing.sellerCharacterId !== dto.characterId ||
      listing.itemId !== dto.itemId ||
      listing.quantityInitial !== dto.quantity ||
      listing.unitPrice !== dto.unitPrice
    ) {
      throw new ConflictException('Esta chave de operação já foi utilizada.');
    }
  }

  private assertPurchaseReplay(
    purchase: MarketPurchaseRecord,
    userId: string,
    listingId: string,
    dto: BuyMarketListingDto,
  ) {
    if (
      purchase.buyer.userId !== userId ||
      purchase.buyerCharacterId !== dto.characterId ||
      purchase.listingId !== listingId ||
      purchase.quantity !== dto.quantity
    ) {
      throw new ConflictException('Esta chave de operação já foi utilizada.');
    }
  }

  private assertMarketValues(quantity: number, unitPrice: number) {
    const totalPrice = quantity * unitPrice;

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_MARKET_QUANTITY
    ) {
      throw new BadRequestException('Quantidade inválida para o mercado.');
    }

    if (
      !Number.isSafeInteger(unitPrice) ||
      unitPrice < 1 ||
      unitPrice > MAX_UNIT_PRICE
    ) {
      throw new BadRequestException('Preço unitário inválido.');
    }

    if (!Number.isSafeInteger(totalPrice) || totalPrice > MAX_TOTAL_PRICE) {
      throw new BadRequestException(
        `O valor total do lote não pode ultrapassar ${MAX_TOTAL_PRICE.toLocaleString('pt-BR')} Gold.`,
      );
    }
  }

  private getPagination(query: MarketListingsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private mapPagination(total: number, page: number, pageSize: number) {
    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private getOrderBy(
    sort?: MarketListingSort,
  ): Prisma.MarketListingOrderByWithRelationInput[] {
    if (sort === MarketListingSort.PRICE_ASC) {
      return [{ unitPrice: 'asc' }, { createdAt: 'desc' }];
    }
    if (sort === MarketListingSort.PRICE_DESC) {
      return [{ unitPrice: 'desc' }, { createdAt: 'desc' }];
    }
    if (sort === MarketListingSort.QUANTITY_DESC) {
      return [{ quantityRemaining: 'desc' }, { createdAt: 'desc' }];
    }
    return [{ createdAt: 'desc' }];
  }

  private mapCharacter(character: { id: string; name: string; gold: number }) {
    return character;
  }

  private mapListing(listing: MarketListingRecord) {
    const quantitySold =
      listing.quantityInitial -
      listing.quantityRemaining -
      listing.quantityCancelled;

    return {
      id: listing.id,
      type: listing.type,
      status: listing.status,
      quantityInitial: listing.quantityInitial,
      quantityRemaining: listing.quantityRemaining,
      quantityCancelled: listing.quantityCancelled,
      quantitySold,
      unitPrice: listing.unitPrice,
      totalRemaining: listing.quantityRemaining * listing.unitPrice,
      goldEarned: quantitySold * listing.unitPrice,
      createdAt: listing.createdAt,
      closedAt: listing.closedAt,
      item: listing.item,
      seller: {
        id: listing.seller.id,
        name: listing.seller.name,
      },
    };
  }

  private mapPurchase(purchase: MarketPurchaseRecord) {
    return {
      id: purchase.id,
      listingId: purchase.listingId,
      quantity: purchase.quantity,
      unitPrice: purchase.unitPrice,
      totalPrice: purchase.totalPrice,
      createdAt: purchase.createdAt,
      buyerGold: purchase.buyer.gold,
      item: purchase.item,
      seller: {
        id: purchase.seller.id,
        name: purchase.seller.name,
      },
      listing: this.mapListing(purchase.listing),
    };
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
        if (attempt < TRANSACTION_RETRIES && this.isRetryable(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('A operação não pôde ser concluída.');
  }

  private isRetryable(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2034' || error.code === 'P2002')
    );
  }
}
