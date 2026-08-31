import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EconomyCurrency,
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  Prisma,
} from '@prisma/client';
import {
  ECONOMY_EXCHANGE_CONFIG,
  ECONOMY_LAUNCH_TIERS,
  getIncursionTokenItemByTier,
  getWorldBossFragmentItemByTier,
  INCURSION_TOKEN_ITEMS,
  isEconomyLaunchTier,
  WORLD_BOSS_FRAGMENT_ITEMS,
} from '../../common/config/economy.config';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeEconomyOfferDto } from './dto/exchange-economy-offer.dto';
import { ECONOMY_REASONS } from './economy.constants';
import { recordEconomyEntry } from './economy-ledger';

type EconomyExchangeSource =
  | 'INCURSION_REINFORCEMENT'
  | 'INCURSION_EMERGENCY_MATERIAL'
  | 'WORLD_BOSS_EMERGENCY_DROP';

type EconomyExchangeItem = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  tier: number;
  rarity: string;
  materialOrigin: MaterialOrigin | null;
};

@Injectable()
export class EconomyService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }

    const storedItems = await this.prisma.inventoryItem.findMany({
      where: {
        characterId,
        item: {
          slug: {
            in: [...INCURSION_TOKEN_ITEMS, ...WORLD_BOSS_FRAGMENT_ITEMS].map(
              (item) => item.slug,
            ),
          },
        },
      },
      select: {
        quantity: true,
        updatedAt: true,
        item: { select: { tier: true, slug: true } },
      },
    });
    const balanceByKey = new Map(
      storedItems.flatMap((entry) => {
        const currency = this.getCurrencyForItemSlug(entry.item.slug);
        return currency
          ? [[`${currency}:${entry.item.tier}`, entry.quantity] as const]
          : [];
      }),
    );

    return {
      character,
      currencies: Object.values(EconomyCurrency).map((currency) => ({
        currency,
        label: this.getCurrencyLabel(currency),
        tiers: ECONOMY_LAUNCH_TIERS.map((tier) => ({
          tier,
          balance: balanceByKey.get(`${currency}:${tier}`) ?? 0,
        })),
      })),
      updatedAt:
        storedItems.reduce<Date | null>(
          (latest, entry) =>
            !latest || entry.updatedAt > latest ? entry.updatedAt : latest,
          null,
        ) ?? null,
    };
  }

  async getExchangeOffers(
    userId: string,
    characterId: string,
    tier: number,
    currencyInput?: string,
  ) {
    this.assertLaunchTier(tier);
    const currency = this.parseCurrency(
      currencyInput ?? EconomyCurrency.INCURSION_TOKEN,
    );
    const definition = this.getSourceItemDefinition(currency, tier);
    if (!definition) {
      throw new BadRequestException('Recurso econômico não encontrado.');
    }
    const sourceItem = await this.prisma.item.findUnique({
      where: { slug: definition.slug },
      select: { id: true },
    });
    if (!sourceItem) {
      throw new NotFoundException('Item de troca não encontrado.');
    }

    return this.getExchangeOffersForItem(userId, characterId, sourceItem.id);
  }

  async getExchangeOffersForItem(
    userId: string,
    characterId: string,
    sourceItemId: string,
  ) {
    const [character, sourceItem, inventoryItem] = await Promise.all([
      this.prisma.character.findFirst({
        where: { id: characterId, userId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.item.findUnique({
        where: { id: sourceItemId },
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
          rarity: true,
          description: true,
        },
      }),
      this.prisma.inventoryItem.findUnique({
        where: { characterId_itemId: { characterId, itemId: sourceItemId } },
        select: { quantity: true },
      }),
    ]);
    if (!character) throw new NotFoundException('Personagem nao encontrado.');
    if (!sourceItem)
      throw new NotFoundException('Item de troca não encontrado.');

    const currency = this.getCurrencyForItemSlug(sourceItem.slug);
    if (!currency || !isEconomyLaunchTier(sourceItem.tier)) {
      throw new BadRequestException('Este item não possui trocas disponíveis.');
    }
    const definition = this.getSourceItemDefinition(currency, sourceItem.tier);
    if (!definition || definition.slug !== sourceItem.slug) {
      throw new BadRequestException(
        'Este item não é um recurso econômico válido.',
      );
    }

    const sources = this.getExchangeSourcesForCurrency(currency);
    const items = await this.findOfferItems(sourceItem.tier, sources);
    const quantity = inventoryItem?.quantity ?? 0;

    return {
      character,
      tier: sourceItem.tier,
      sourceItem: {
        ...sourceItem,
        rarity: String(sourceItem.rarity),
        currency,
        currencyLabel: this.getCurrencyLabel(currency),
        quantity,
      },
      balances: [
        {
          currency,
          label: this.getCurrencyLabel(currency),
          balance: quantity,
        },
      ],
      offers: items.map(({ item, source }) =>
        this.buildExchangeOffer(source, item),
      ),
    };
  }

  async exchange(
    userId: string,
    characterId: string,
    input: ExchangeEconomyOfferDto,
  ) {
    const parsedOffer = this.parseOfferId(input.offerId);
    const exchangeCount = input.exchangeCount ?? 1;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const character = await tx.character.findFirst({
              where: { id: characterId, userId, deletedAt: null },
              select: { id: true, name: true },
            });
            if (!character) {
              throw new NotFoundException('Personagem nao encontrado.');
            }

            const item = await this.findValidExchangeItem(
              tx,
              parsedOffer.source,
              parsedOffer.itemId,
            );
            const offer = this.buildExchangeOffer(parsedOffer.source, item);
            const currency = offer.currency;
            const sourceDefinition = this.getSourceItemDefinition(
              currency,
              offer.tier,
            );
            if (!sourceDefinition) {
              throw new BadRequestException('Recurso de troca inválido.');
            }
            const sourceItem = await tx.item.findFirst({
              where: {
                id: input.sourceItemId,
                slug: sourceDefinition.slug,
                tier: offer.tier,
                slot: ItemSlot.MATERIAL,
              },
              select: { id: true, name: true },
            });
            if (!sourceItem) {
              throw new BadRequestException(
                'A oferta não corresponde ao recurso selecionado.',
              );
            }
            const totalCost = offer.cost * exchangeCount;
            const totalQuantity = offer.quantity * exchangeCount;
            const baseKey = `economy-exchange:${characterId}:${input.requestId}`;
            const sourceKey = `${baseKey}:source-item`;
            const existing = await tx.economyLedgerEntry.findUnique({
              where: { idempotencyKey: sourceKey },
            });

            if (existing) {
              this.assertSameExchange(
                existing,
                offer.id,
                sourceItem.id,
                exchangeCount,
              );
              return {
                applied: false,
                message: 'Esta troca ja havia sido concluida.',
                offer,
                exchangeCount,
                totalCost,
                totalQuantity,
                balance: existing.balanceAfter ?? 0,
              };
            }

            const debited = await tx.inventoryItem.updateMany({
              where: {
                characterId,
                itemId: sourceItem.id,
                quantity: { gte: totalCost },
              },
              data: { quantity: { decrement: totalCost } },
            });
            if (debited.count !== 1) {
              throw new BadRequestException(
                `Quantidade insuficiente de ${sourceItem.name}.`,
              );
            }
            const sourceBalance = await tx.inventoryItem.findUniqueOrThrow({
              where: {
                characterId_itemId: {
                  characterId,
                  itemId: sourceItem.id,
                },
              },
              select: { quantity: true },
            });
            const metadata = {
              requestId: input.requestId,
              offerId: offer.id,
              sourceItemId: sourceItem.id,
              exchangeCount,
              totalCost,
              totalQuantity,
            };
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: sourceItem.id,
              tier: offer.tier,
              quantity: totalCost,
              balanceAfter: sourceBalance.quantity,
              reason: ECONOMY_REASONS.ECONOMY_EXCHANGE_SOURCE_ITEM_SPENT,
              idempotencyKey: sourceKey,
              referenceType: 'EconomyExchange',
              referenceId: offer.item.id,
              metadata,
            });

            const receivedItem = await tx.inventoryItem.upsert({
              where: {
                characterId_itemId: { characterId, itemId: offer.item.id },
              },
              update: { quantity: { increment: totalQuantity } },
              create: {
                characterId,
                itemId: offer.item.id,
                quantity: totalQuantity,
                type: InventoryItemType.MATERIAL,
              },
              select: { quantity: true },
            });
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.CREDIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: offer.item.id,
              tier: offer.tier,
              quantity: totalQuantity,
              balanceAfter: receivedItem.quantity,
              reason: ECONOMY_REASONS.ECONOMY_EXCHANGE_ITEM_RECEIVED,
              idempotencyKey: `${baseKey}:item`,
              referenceType: 'EconomyExchange',
              referenceId: offer.item.id,
              metadata,
            });
            await tx.inventoryItem.deleteMany({
              where: {
                characterId,
                itemId: sourceItem.id,
                quantity: { lte: 0 },
              },
            });

            return {
              applied: true,
              message: `${totalQuantity}x ${offer.item.name} recebido.`,
              offer,
              exchangeCount,
              totalCost,
              totalQuantity,
              balance: sourceBalance.quantity,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          (this.isTransactionConflictError(error) ||
            this.isUniqueConstraintError(error)) &&
          attempt < 2
        )
          continue;
        throw error;
      }
    }

    throw new ConflictException(
      'A troca encontrou concorrencia. Tente novamente.',
    );
  }

  private async findOfferItems(tier: number, sources: EconomyExchangeSource[]) {
    const results: Array<{
      source: EconomyExchangeSource;
      item: EconomyExchangeItem;
    }> = [];

    for (const source of sources) {
      if (source === 'INCURSION_REINFORCEMENT') {
        const item = await this.prisma.item.findFirst({
          where: {
            tier,
            slot: ItemSlot.MATERIAL,
            family: 'Material de Reforço',
            name: `Fragmento de Reforço T${tier}`,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            tier: true,
            rarity: true,
            materialOrigin: true,
          },
        });
        if (item) {
          results.push({
            source,
            item: { ...item, rarity: String(item.rarity) },
          });
        }
        continue;
      }

      const isIncursion = source === 'INCURSION_EMERGENCY_MATERIAL';
      const items = await this.prisma.item.findMany({
        where: {
          tier,
          slot: ItemSlot.MATERIAL,
          ...(isIncursion
            ? {
                isGatheringMaterial: true,
                materialOrigin: { not: MaterialOrigin.DROP_MOBS },
              }
            : { materialOrigin: MaterialOrigin.DROP_MOBS }),
          craftingIngredients: {
            some: {
              origin: isIncursion
                ? { not: MaterialOrigin.DROP_MOBS }
                : MaterialOrigin.DROP_MOBS,
              recipe: { tier, isActive: true },
            },
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          tier: true,
          rarity: true,
          materialOrigin: true,
        },
        orderBy: { name: 'asc' },
      });
      results.push(
        ...items.map((item) => ({
          source,
          item: { ...item, rarity: String(item.rarity) },
        })),
      );
    }

    return results;
  }

  private async findValidExchangeItem(
    tx: Prisma.TransactionClient,
    source: EconomyExchangeSource,
    itemId: string,
  ): Promise<EconomyExchangeItem> {
    const isReinforcement = source === 'INCURSION_REINFORCEMENT';

    if (isReinforcement) {
      const item = await tx.item.findFirst({
        where: {
          id: itemId,
          tier: { in: Array.from(ECONOMY_LAUNCH_TIERS) },
          slot: ItemSlot.MATERIAL,
          family: 'Material de Reforço',
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          tier: true,
          rarity: true,
          materialOrigin: true,
        },
      });

      if (!item) {
        throw new BadRequestException('Esta oferta principal não é válida.');
      }

      return { ...item, rarity: String(item.rarity) };
    }

    const isIncursion = source === 'INCURSION_EMERGENCY_MATERIAL';
    const item = await tx.item.findFirst({
      where: {
        id: itemId,
        tier: { in: Array.from(ECONOMY_LAUNCH_TIERS) },
        slot: ItemSlot.MATERIAL,
        ...(isIncursion
          ? {
              isGatheringMaterial: true,
              materialOrigin: { not: MaterialOrigin.DROP_MOBS },
            }
          : { materialOrigin: MaterialOrigin.DROP_MOBS }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        tier: true,
        rarity: true,
        materialOrigin: true,
        craftingIngredients: {
          where: {
            origin: isIncursion
              ? { not: MaterialOrigin.DROP_MOBS }
              : MaterialOrigin.DROP_MOBS,
            recipe: { isActive: true },
          },
          select: { recipe: { select: { tier: true } } },
        },
      },
    });

    if (
      !item ||
      !item.craftingIngredients.some(
        (ingredient) => ingredient.recipe.tier === item.tier,
      )
    ) {
      throw new BadRequestException(
        'Esta oferta nao corresponde a um ingrediente ativo do tier.',
      );
    }

    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      tier: item.tier,
      rarity: String(item.rarity),
      materialOrigin: item.materialOrigin,
    };
  }

  private buildExchangeOffer(
    source: EconomyExchangeSource,
    item: EconomyExchangeItem,
  ) {
    const isIncursion = source.startsWith('INCURSION_');
    const sourceConfig = {
      INCURSION_REINFORCEMENT: {
        prefix: 'INCR',
        category: 'PRIMARY',
        purpose: 'Reforço de equipamento',
        config: ECONOMY_EXCHANGE_CONFIG.incursionReinforcement,
      },
      INCURSION_EMERGENCY_MATERIAL: {
        prefix: 'INCEM',
        category: 'EMERGENCY',
        purpose: 'Proteção contra falta de material',
        config: ECONOMY_EXCHANGE_CONFIG.incursionEmergencyMaterial,
      },
      WORLD_BOSS_EMERGENCY_DROP: {
        prefix: 'WBEM',
        category: 'EMERGENCY',
        purpose: 'Proteção contra falta de drop',
        config: ECONOMY_EXCHANGE_CONFIG.worldBossEmergencyDrop,
      },
    } as const;
    const selectedConfig = sourceConfig[source];
    const currency = isIncursion
      ? EconomyCurrency.INCURSION_TOKEN
      : EconomyCurrency.WORLD_BOSS_FRAGMENT;

    return {
      id: `${selectedConfig.prefix}:${item.id}`,
      source,
      category: selectedConfig.category,
      purpose: selectedConfig.purpose,
      tier: item.tier,
      currency,
      currencyLabel: this.getCurrencyLabel(currency),
      cost: selectedConfig.config.currencyCost,
      quantity: selectedConfig.config.itemQuantity,
      item,
    };
  }

  private parseOfferId(offerId: string) {
    const match = /^(INCR|INCEM|WBEM|INC|WB):([0-9a-f-]{36})$/i.exec(offerId);
    if (!match) throw new BadRequestException('A oferta de troca e invalida.');

    const sourceByPrefix: Record<string, EconomyExchangeSource> = {
      INCR: 'INCURSION_REINFORCEMENT',
      INCEM: 'INCURSION_EMERGENCY_MATERIAL',
      WBEM: 'WORLD_BOSS_EMERGENCY_DROP',
      INC: 'INCURSION_EMERGENCY_MATERIAL',
      WB: 'WORLD_BOSS_EMERGENCY_DROP',
    };
    const source = sourceByPrefix[match[1].toUpperCase()];
    return { source, itemId: match[2] };
  }

  private assertSameExchange(
    entry: { metadata: Prisma.JsonValue | null },
    offerId: string,
    sourceItemId: string,
    exchangeCount: number,
  ) {
    const metadata = entry.metadata;
    const existingOfferId =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata.offerId === 'string'
        ? metadata.offerId
        : null;
    const existingSourceItemId =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata.sourceItemId === 'string'
        ? metadata.sourceItemId
        : null;
    const existingExchangeCount =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata.exchangeCount === 'number'
        ? metadata.exchangeCount
        : null;
    if (
      !existingOfferId ||
      this.normalizeOfferId(existingOfferId) !==
        this.normalizeOfferId(offerId) ||
      existingSourceItemId !== sourceItemId ||
      existingExchangeCount !== exchangeCount
    ) {
      throw new ConflictException(
        'A identificacao desta troca ja foi usada em outra oferta.',
      );
    }
  }

  private normalizeOfferId(offerId: string) {
    return offerId
      .replace(/^INC:/i, 'INCEM:')
      .replace(/^WB:/i, 'WBEM:')
      .toUpperCase();
  }

  private assertLaunchTier(tier: number) {
    if (!isEconomyLaunchTier(tier)) {
      throw new BadRequestException('As trocas estao disponiveis do T1 ao T5.');
    }
  }

  private parseCurrency(currency: string) {
    if (!Object.values(EconomyCurrency).includes(currency as EconomyCurrency)) {
      throw new BadRequestException('Moeda economica invalida.');
    }
    return currency as EconomyCurrency;
  }

  private getSourceItemDefinition(currency: EconomyCurrency, tier: number) {
    return currency === EconomyCurrency.INCURSION_TOKEN
      ? getIncursionTokenItemByTier(tier)
      : getWorldBossFragmentItemByTier(tier);
  }

  private getCurrencyForItemSlug(slug: string | null) {
    if (!slug) return null;
    if (INCURSION_TOKEN_ITEMS.some((item) => item.slug === slug)) {
      return EconomyCurrency.INCURSION_TOKEN;
    }
    if (WORLD_BOSS_FRAGMENT_ITEMS.some((item) => item.slug === slug)) {
      return EconomyCurrency.WORLD_BOSS_FRAGMENT;
    }
    return null;
  }

  private getExchangeSourcesForCurrency(
    currency: EconomyCurrency,
  ): EconomyExchangeSource[] {
    return currency === EconomyCurrency.INCURSION_TOKEN
      ? ['INCURSION_REINFORCEMENT', 'INCURSION_EMERGENCY_MATERIAL']
      : ['WORLD_BOSS_EMERGENCY_DROP'];
  }

  private getCurrencyLabel(currency: EconomyCurrency) {
    return currency === EconomyCurrency.INCURSION_TOKEN
      ? 'Ficha de Incursão'
      : 'Fragmento de Ameaça';
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isTransactionConflictError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
