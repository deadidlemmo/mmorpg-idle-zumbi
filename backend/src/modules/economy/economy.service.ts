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
  isEconomyLaunchTier,
} from '../../common/config/economy.config';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeEconomyOfferDto } from './dto/exchange-economy-offer.dto';
import { ECONOMY_REASONS } from './economy.constants';
import { recordEconomyEntry } from './economy-ledger';

type EconomyExchangeSource =
  | 'INCURSION_REINFORCEMENT'
  | 'INCURSION_EMERGENCY_MATERIAL'
  | 'WORLD_BOSS_COCOON'
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

export interface WalletMutationInput {
  characterId: string;
  currency: EconomyCurrency;
  tier: number;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

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

    const storedBalances = await this.prisma.characterEconomyBalance.findMany({
      where: {
        characterId,
        tier: { in: Array.from(ECONOMY_LAUNCH_TIERS) },
      },
      orderBy: [{ tier: 'asc' }, { currency: 'asc' }],
    });
    const balanceByKey = new Map(
      storedBalances.map((entry) => [
        `${entry.currency}:${entry.tier}`,
        entry.balance,
      ]),
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
        storedBalances.reduce<Date | null>(
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
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!character) throw new NotFoundException('Personagem nao encontrado.');

    const currencies = currencyInput
      ? [this.parseCurrency(currencyInput)]
      : Object.values(EconomyCurrency);
    const sources = currencies.flatMap((currency) =>
      this.getExchangeSourcesForCurrency(currency),
    );
    const [items, balances] = await Promise.all([
      this.findOfferItems(tier, sources),
      this.prisma.characterEconomyBalance.findMany({
        where: { characterId, tier, currency: { in: currencies } },
      }),
    ]);
    const balanceByCurrency = new Map(
      balances.map((balance) => [balance.currency, balance.balance]),
    );

    return {
      character,
      tier,
      balances: currencies.map((currency) => ({
        currency,
        label: this.getCurrencyLabel(currency),
        balance: balanceByCurrency.get(currency) ?? 0,
      })),
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
            const baseKey = `economy-exchange:${characterId}:${input.requestId}`;
            const currencyKey = `${baseKey}:currency`;
            const existing = await tx.economyLedgerEntry.findUnique({
              where: { idempotencyKey: currencyKey },
            });

            if (existing) {
              this.assertSameExchange(existing, offer.id);
              return {
                applied: false,
                message: 'Esta troca ja havia sido concluida.',
                offer,
                balance: existing.balanceAfter ?? 0,
              };
            }

            const debit = await this.debitWalletInTransaction(tx, {
              characterId,
              currency: offer.currency,
              tier: offer.tier,
              quantity: offer.cost,
              reason: ECONOMY_REASONS.ECONOMY_EXCHANGE_CURRENCY_SPENT,
              idempotencyKey: currencyKey,
              referenceType: 'EconomyExchange',
              referenceId: offer.item.id,
              metadata: {
                requestId: input.requestId,
                offerId: offer.id,
                itemName: offer.item.name,
                itemQuantity: offer.quantity,
              },
            });

            await tx.inventoryItem.upsert({
              where: {
                characterId_itemId: { characterId, itemId: offer.item.id },
              },
              update: { quantity: { increment: offer.quantity } },
              create: {
                characterId,
                itemId: offer.item.id,
                quantity: offer.quantity,
                type: InventoryItemType.MATERIAL,
              },
            });
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.CREDIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: offer.item.id,
              tier: offer.tier,
              quantity: offer.quantity,
              reason: ECONOMY_REASONS.ECONOMY_EXCHANGE_ITEM_RECEIVED,
              idempotencyKey: `${baseKey}:item`,
              referenceType: 'EconomyExchange',
              referenceId: offer.item.id,
              metadata: {
                requestId: input.requestId,
                offerId: offer.id,
                currency: offer.currency,
                currencyCost: offer.cost,
              },
            });

            return {
              applied: debit.applied,
              message: `${offer.quantity}x ${offer.item.name} recebido.`,
              offer,
              balance: debit.balance,
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

  creditWallet(input: WalletMutationInput) {
    return this.mutateWallet(EconomyDirection.CREDIT, input);
  }

  debitWallet(input: WalletMutationInput) {
    return this.mutateWallet(EconomyDirection.DEBIT, input);
  }

  creditWalletInTransaction(
    tx: Prisma.TransactionClient,
    input: WalletMutationInput,
  ) {
    return this.mutateWalletInTransaction(tx, EconomyDirection.CREDIT, input);
  }

  debitWalletInTransaction(
    tx: Prisma.TransactionClient,
    input: WalletMutationInput,
  ) {
    return this.mutateWalletInTransaction(tx, EconomyDirection.DEBIT, input);
  }

  private async mutateWallet(
    direction: EconomyDirection,
    input: WalletMutationInput,
  ) {
    this.assertWalletInput(input);

    try {
      return await this.prisma.$transaction(
        (tx) => this.mutateWalletInTransaction(tx, direction, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const existing = await this.prisma.economyLedgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!existing) throw error;

      return {
        applied: false,
        balance: existing.balanceAfter ?? 0,
        ledgerEntry: existing,
      };
    }
  }

  private async mutateWalletInTransaction(
    tx: Prisma.TransactionClient,
    direction: EconomyDirection,
    input: WalletMutationInput,
  ) {
    this.assertWalletInput(input);

    const existing = await tx.economyLedgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return {
        applied: false,
        balance: existing.balanceAfter ?? 0,
        ledgerEntry: existing,
      };
    }

    const character = await tx.character.findFirst({
      where: { id: input.characterId, deletedAt: null },
      select: { id: true },
    });
    if (!character) throw new NotFoundException('Personagem nao encontrado.');

    if (direction === EconomyDirection.CREDIT) {
      await tx.characterEconomyBalance.upsert({
        where: {
          characterId_currency_tier: {
            characterId: input.characterId,
            currency: input.currency,
            tier: input.tier,
          },
        },
        create: {
          characterId: input.characterId,
          currency: input.currency,
          tier: input.tier,
          balance: input.quantity,
        },
        update: { balance: { increment: input.quantity } },
      });
    } else {
      const debited = await tx.characterEconomyBalance.updateMany({
        where: {
          characterId: input.characterId,
          currency: input.currency,
          tier: input.tier,
          balance: { gte: input.quantity },
        },
        data: { balance: { decrement: input.quantity } },
      });
      if (debited.count !== 1) {
        throw new BadRequestException(
          `Saldo insuficiente de ${this.getCurrencyLabel(input.currency)} T${input.tier}.`,
        );
      }
    }

    const balance = await tx.characterEconomyBalance.findUniqueOrThrow({
      where: {
        characterId_currency_tier: {
          characterId: input.characterId,
          currency: input.currency,
          tier: input.tier,
        },
      },
      select: { balance: true },
    });
    const ledgerEntry = await recordEconomyEntry(tx, {
      characterId: input.characterId,
      direction,
      resourceType: EconomyResourceType.CURRENCY,
      currency: input.currency,
      tier: input.tier,
      quantity: input.quantity,
      balanceAfter: balance.balance,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      metadata: input.metadata,
    });

    return { applied: true, balance: balance.balance, ledgerEntry };
  }

  private assertWalletInput(input: WalletMutationInput) {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException(
        'A quantidade deve ser um inteiro positivo.',
      );
    }
    if (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > 10) {
      throw new BadRequestException('O tier deve estar entre 1 e 10.');
    }
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

      if (source === 'WORLD_BOSS_COCOON') {
        const item = await this.prisma.item.findFirst({
          where: {
            tier,
            slot: ItemSlot.MATERIAL,
            family: 'Casulo Infectado',
            name: `Casulo Infectado T${tier}`,
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
    const isCocoon = source === 'WORLD_BOSS_COCOON';

    if (isReinforcement || isCocoon) {
      const item = await tx.item.findFirst({
        where: {
          id: itemId,
          tier: { in: Array.from(ECONOMY_LAUNCH_TIERS) },
          slot: ItemSlot.MATERIAL,
          family: isReinforcement ? 'Material de Reforço' : 'Casulo Infectado',
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
      WORLD_BOSS_COCOON: {
        prefix: 'WBC',
        category: 'PRIMARY',
        purpose: 'Garantia de casulo',
        config: ECONOMY_EXCHANGE_CONFIG.worldBossCocoon,
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
    const match = /^(INCR|INCEM|WBC|WBEM|INC|WB):([0-9a-f-]{36})$/i.exec(
      offerId,
    );
    if (!match) throw new BadRequestException('A oferta de troca e invalida.');

    const sourceByPrefix: Record<string, EconomyExchangeSource> = {
      INCR: 'INCURSION_REINFORCEMENT',
      INCEM: 'INCURSION_EMERGENCY_MATERIAL',
      WBC: 'WORLD_BOSS_COCOON',
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
  ) {
    const metadata = entry.metadata;
    const existingOfferId =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata.offerId === 'string'
        ? metadata.offerId
        : null;
    if (
      !existingOfferId ||
      this.normalizeOfferId(existingOfferId) !== this.normalizeOfferId(offerId)
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

  private getExchangeSourcesForCurrency(
    currency: EconomyCurrency,
  ): EconomyExchangeSource[] {
    return currency === EconomyCurrency.INCURSION_TOKEN
      ? ['INCURSION_REINFORCEMENT', 'INCURSION_EMERGENCY_MATERIAL']
      : ['WORLD_BOSS_COCOON', 'WORLD_BOSS_EMERGENCY_DROP'];
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
