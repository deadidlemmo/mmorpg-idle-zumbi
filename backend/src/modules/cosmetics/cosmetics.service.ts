import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CosmeticAccessType,
  CosmeticGrantSource,
  CosmeticType,
  EconomyDirection,
  EconomyResourceType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import {
  COSMETIC_VENDOR_COSMETIC_KEYS,
  COSMETIC_VENDOR_PRODUCTS,
  getCosmeticVendorProduct,
} from '../../common/config/cosmetic-vendor.config';
import { isPremiumActive } from '../../common/utils/membership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { GrantCosmeticsDto } from './dto/grant-cosmetics.dto';
import { PurchaseCosmeticVendorProductDto } from './dto/purchase-cosmetic-vendor-product.dto';
import { UpdateCharacterAppearanceDto } from './dto/update-character-appearance.dto';

const cosmeticInclude = {
  collection: true,
  class: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.CosmeticInclude;

const appearanceInclude = {
  avatarCosmetic: { include: cosmeticInclude },
  avatarFrameCosmetic: { include: cosmeticInclude },
  profileBannerCosmetic: { include: cosmeticInclude },
  overviewBackgroundCosmetic: { include: cosmeticInclude },
  profileEffectCosmetic: { include: cosmeticInclude },
  titleCosmetic: { include: cosmeticInclude },
  badgeCosmetic: { include: cosmeticInclude },
} satisfies Prisma.CharacterAppearanceInclude;

type CosmeticWithRelations = Prisma.CosmeticGetPayload<{
  include: typeof cosmeticInclude;
}>;

type AppearanceWithCosmetics = Prisma.CharacterAppearanceGetPayload<{
  include: typeof appearanceInclude;
}>;

type AppearanceContext = {
  id: string;
  name: string;
  userId: string;
  classId: string;
  gold: number;
  avatarKey: string | null;
  class: { id: string; name: string };
  user: { premiumUntil: Date | null };
  appearance: AppearanceWithCosmetics | null;
};

type AppearanceDtoKey = keyof UpdateCharacterAppearanceDto;
type AppearanceIdField =
  | 'avatarCosmeticId'
  | 'avatarFrameCosmeticId'
  | 'profileBannerCosmeticId'
  | 'overviewBackgroundCosmeticId'
  | 'profileEffectCosmeticId'
  | 'titleCosmeticId'
  | 'badgeCosmeticId';

const APPEARANCE_SLOTS: ReadonlyArray<{
  dtoKey: AppearanceDtoKey;
  idField: AppearanceIdField;
  type: CosmeticType;
}> = [
  {
    dtoKey: 'avatarCosmeticKey',
    idField: 'avatarCosmeticId',
    type: CosmeticType.AVATAR,
  },
  {
    dtoKey: 'avatarFrameCosmeticKey',
    idField: 'avatarFrameCosmeticId',
    type: CosmeticType.AVATAR_FRAME,
  },
  {
    dtoKey: 'profileBannerCosmeticKey',
    idField: 'profileBannerCosmeticId',
    type: CosmeticType.PROFILE_BANNER,
  },
  {
    dtoKey: 'overviewBackgroundCosmeticKey',
    idField: 'overviewBackgroundCosmeticId',
    type: CosmeticType.OVERVIEW_BACKGROUND,
  },
  {
    dtoKey: 'profileEffectCosmeticKey',
    idField: 'profileEffectCosmeticId',
    type: CosmeticType.PROFILE_EFFECT,
  },
  {
    dtoKey: 'titleCosmeticKey',
    idField: 'titleCosmeticId',
    type: CosmeticType.TITLE,
  },
  {
    dtoKey: 'badgeCosmeticKey',
    idField: 'badgeCosmeticId',
    type: CosmeticType.BADGE,
  },
];

@Injectable()
export class CosmeticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getCatalog(userId: string, characterId: string) {
    const now = new Date();
    const [character, cosmetics] = await Promise.all([
      this.getCharacterContext(characterId, userId),
      this.prisma.cosmetic.findMany({
        where: { isActive: true },
        include: cosmeticInclude,
        orderBy: [
          { collection: { sortOrder: 'asc' } },
          { type: 'asc' },
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      }),
    ]);

    const compatibleCosmetics = cosmetics.filter(
      (cosmetic) => !cosmetic.classId || cosmetic.classId === character.classId,
    );
    const entitlementIds = await this.getActiveEntitlementIds(
      character.userId,
      compatibleCosmetics.map((cosmetic) => cosmetic.id),
      now,
    );
    const premiumActive = isPremiumActive(character.user, now);
    const selectedIds = this.getSelectedCosmeticIds(character.appearance);

    const items = compatibleCosmetics
      .filter((cosmetic) => this.isCosmeticAvailable(cosmetic, now))
      .map((cosmetic) => {
        const hasEntitlement = entitlementIds.has(cosmetic.id);
        const isOwned = this.canUseCosmetic({
          cosmetic,
          characterClassId: character.classId,
          premiumActive,
          hasEntitlement,
          now,
        });

        return {
          ...this.formatCosmetic(cosmetic),
          isOwned,
          isCompatible: true,
          isSelected: selectedIds.has(cosmetic.id),
          isEquipped: selectedIds.has(cosmetic.id) && isOwned,
          unlockedBy: hasEntitlement
            ? 'ENTITLEMENT'
            : cosmetic.accessType === CosmeticAccessType.FREE
              ? 'FREE'
              : premiumActive &&
                  cosmetic.accessType === CosmeticAccessType.PREMIUM
                ? 'PREMIUM'
                : null,
        };
      });

    const collectionsById = new Map<
      string,
      {
        id: string;
        key: string;
        name: string;
        description: string | null;
        coverAssetKey: string | null;
        sortOrder: number;
        items: typeof items;
      }
    >();

    for (const item of items) {
      const collection = item.collection;
      if (!collection) continue;

      const current = collectionsById.get(collection.id);
      if (current) {
        current.items.push(item);
        continue;
      }

      collectionsById.set(collection.id, {
        id: collection.id,
        key: collection.key,
        name: collection.name,
        description: collection.description,
        coverAssetKey: collection.coverAssetKey,
        sortOrder: collection.sortOrder,
        items: [item],
      });
    }

    return {
      character: {
        id: character.id,
        name: character.name,
        class: character.class,
        baseAvatarKey: character.avatarKey,
      },
      membership: {
        isPremiumActive: premiumActive,
        premiumUntil: character.user.premiumUntil,
      },
      appearance: await this.resolveAppearanceContext(character, now),
      collections: Array.from(collectionsById.values()).sort(
        (left, right) => left.sortOrder - right.sortOrder,
      ),
    };
  }

  async getVendorCatalog(userId: string, characterId: string) {
    const now = new Date();
    const [character, cosmetics] = await Promise.all([
      this.getCharacterContext(characterId, userId),
      this.prisma.cosmetic.findMany({
        where: {
          key: { in: [...COSMETIC_VENDOR_COSMETIC_KEYS] },
          isActive: true,
        },
        include: cosmeticInclude,
      }),
    ]);
    const entitlementIds = await this.getActiveEntitlementIds(
      character.userId,
      cosmetics.map((cosmetic) => cosmetic.id),
      now,
    );

    return {
      character: {
        id: character.id,
        name: character.name,
        gold: character.gold,
      },
      currency: 'GOLD',
      products: this.formatVendorProducts(cosmetics, entitlementIds, now),
    };
  }

  async purchaseVendorProduct(
    userId: string,
    characterId: string,
    dto: PurchaseCosmeticVendorProductDto,
  ) {
    const product = getCosmeticVendorProduct(dto.productId);
    if (!product) {
      throw new NotFoundException('Produto cosmético não encontrado.');
    }

    const ledgerKey = `cosmetic-vendor:${characterId}:${dto.requestId}:gold`;
    const result = await this.prisma.$transaction(
      async (tx) => {
        const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`,
        );
        if (lockedUsers.length === 0) {
          throw new NotFoundException('Usuário não encontrado.');
        }

        const previousEntry = await tx.economyLedgerEntry.findUnique({
          where: { idempotencyKey: ledgerKey },
          select: { metadata: true },
        });
        if (previousEntry) {
          const previousProductId = this.getMetadataProductId(
            previousEntry.metadata,
          );
          if (previousProductId !== product.id) {
            throw new ConflictException(
              'Esta solicitação já foi usada em outra compra.',
            );
          }

          const character = await tx.character.findFirst({
            where: { id: characterId, userId, deletedAt: null },
            select: { id: true, gold: true },
          });
          if (!character) {
            throw new NotFoundException('Personagem não encontrado.');
          }

          return {
            gold: character.gold,
            grantedCosmeticKeys: [...product.cosmeticKeys],
            alreadyProcessed: true,
          };
        }

        const character = await tx.character.findFirst({
          where: { id: characterId, userId, deletedAt: null },
          select: { id: true, userId: true, gold: true },
        });
        if (!character) {
          throw new NotFoundException('Personagem não encontrado.');
        }

        const now = new Date();
        const cosmetics = await tx.cosmetic.findMany({
          where: {
            key: { in: [...product.cosmeticKeys] },
            isActive: true,
            OR: [
              { collectionId: null },
              {
                collection: {
                  isActive: true,
                  AND: [
                    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                  ],
                },
              },
            ],
          },
          include: cosmeticInclude,
        });
        if (cosmetics.length !== product.cosmeticKeys.length) {
          throw new BadRequestException(
            'Este produto está temporariamente indisponível.',
          );
        }

        const activeEntitlements = await tx.userCosmeticEntitlement.findMany({
          where: {
            userId,
            cosmeticId: { in: cosmetics.map((cosmetic) => cosmetic.id) },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { cosmeticId: true },
        });
        const ownedCosmeticIds = new Set(
          activeEntitlements.map((entitlement) => entitlement.cosmeticId),
        );
        if (cosmetics.every((cosmetic) => ownedCosmeticIds.has(cosmetic.id))) {
          throw new ConflictException(
            'Esta aparência já pertence à sua conta.',
          );
        }

        const debited = await tx.character.updateMany({
          where: {
            id: character.id,
            userId,
            gold: { gte: product.goldPrice },
          },
          data: { gold: { decrement: product.goldPrice } },
        });
        if (debited.count !== 1) {
          throw new BadRequestException(
            `São necessários ${product.goldPrice.toLocaleString('pt-BR')} Gold para esta compra.`,
          );
        }

        const missingCosmetics = cosmetics.filter(
          (cosmetic) => !ownedCosmeticIds.has(cosmetic.id),
        );
        for (const cosmetic of missingCosmetics) {
          const grantKey = ['vera', userId, product.id, cosmetic.key].join(':');
          await tx.userCosmeticEntitlement.upsert({
            where: { grantKey },
            update: {
              source: CosmeticGrantSource.PURCHASE,
              sourceReference: product.id,
              expiresAt: null,
              revokedAt: null,
              grantedAt: now,
            },
            create: {
              grantKey,
              userId,
              cosmeticId: cosmetic.id,
              source: CosmeticGrantSource.PURCHASE,
              sourceReference: product.id,
              expiresAt: null,
            },
          });
        }

        const updatedCharacter = await tx.character.findUniqueOrThrow({
          where: { id: character.id },
          select: { gold: true },
        });
        await recordEconomyEntry(tx, {
          characterId: character.id,
          direction: EconomyDirection.DEBIT,
          resourceType: EconomyResourceType.GOLD,
          quantity: product.goldPrice,
          balanceAfter: updatedCharacter.gold,
          reason: ECONOMY_REASONS.COSMETIC_VENDOR_GOLD_SPENT,
          idempotencyKey: ledgerKey,
          referenceType: 'CosmeticVendorPurchase',
          referenceId: dto.requestId,
          metadata: {
            productId: product.id,
            cosmeticKeys: [...product.cosmeticKeys],
          },
        });

        return {
          gold: updatedCharacter.gold,
          grantedCosmeticKeys: missingCosmetics.map((cosmetic) => cosmetic.key),
          alreadyProcessed: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!result.alreadyProcessed) {
      this.auditService.recordSafely({
        actorUserId: userId,
        action: 'cosmetics.vendor.purchased',
        entityType: 'Character',
        entityId: characterId,
        metadata: {
          productId: product.id,
          goldPrice: product.goldPrice,
          cosmeticKeys: result.grantedCosmeticKeys,
          requestId: dto.requestId,
        },
      });
    }

    return {
      message: result.alreadyProcessed
        ? 'Compra já processada.'
        : `${product.name} foi adicionado à sua conta.`,
      productId: product.id,
      gold: result.gold,
      grantedCosmeticKeys: result.grantedCosmeticKeys,
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  async updateAppearance(
    userId: string,
    characterId: string,
    dto: UpdateCharacterAppearanceDto,
  ) {
    const now = new Date();
    const character = await this.getCharacterContext(characterId, userId);
    const providedSlots = APPEARANCE_SLOTS.filter((slot) =>
      Object.prototype.hasOwnProperty.call(dto, slot.dtoKey),
    );

    if (providedSlots.length === 0) {
      throw new BadRequestException('Informe ao menos um slot cosmético.');
    }

    const requestedKeys = providedSlots
      .map((slot) => dto[slot.dtoKey])
      .filter((key): key is string => Boolean(key));
    const cosmetics = requestedKeys.length
      ? await this.prisma.cosmetic.findMany({
          where: { key: { in: requestedKeys } },
          include: cosmeticInclude,
        })
      : [];
    const cosmeticsByKey = new Map(
      cosmetics.map((cosmetic) => [cosmetic.key, cosmetic]),
    );
    const entitlementIds = await this.getActiveEntitlementIds(
      character.userId,
      cosmetics.map((cosmetic) => cosmetic.id),
      now,
    );
    const premiumActive = isPremiumActive(character.user, now);

    for (const slot of providedSlots) {
      const cosmeticKey = dto[slot.dtoKey];
      if (!cosmeticKey) continue;

      const cosmetic = cosmeticsByKey.get(cosmeticKey);
      if (!cosmetic) {
        throw new NotFoundException(
          `Cosmético não encontrado: ${cosmeticKey}.`,
        );
      }
      if (cosmetic.type !== slot.type) {
        throw new BadRequestException(
          `${cosmetic.name} não pode ser usado neste slot.`,
        );
      }
      if (
        !this.canUseCosmetic({
          cosmetic,
          characterClassId: character.classId,
          premiumActive,
          hasEntitlement: entitlementIds.has(cosmetic.id),
          now,
        })
      ) {
        throw new ForbiddenException(
          `Você não possui acesso ao cosmético ${cosmetic.name}.`,
        );
      }
    }

    const resolveCosmeticId = (key?: string | null) =>
      key ? (cosmeticsByKey.get(key)?.id ?? null) : null;
    const updateData: Partial<Record<AppearanceIdField, string | null>> = {};

    for (const slot of providedSlots) {
      updateData[slot.idField] = resolveCosmeticId(dto[slot.dtoKey]);
    }

    await this.prisma.characterAppearance.upsert({
      where: { characterId },
      update: updateData,
      create: {
        characterId,
        ...updateData,
      },
    });

    this.auditService.recordSafely({
      actorUserId: userId,
      action: 'cosmetics.appearance.updated',
      entityType: 'Character',
      entityId: characterId,
      metadata: {
        slots: providedSlots.map((slot) => slot.dtoKey),
      },
    });

    return {
      message: 'Aparência atualizada.',
      appearance: await this.getResolvedAppearance(characterId),
    };
  }

  async getResolvedAppearance(characterId: string) {
    const character = await this.getCharacterContext(characterId);
    return this.resolveAppearanceContext(character, new Date());
  }

  async getResolvedAppearances(characterIds: string[]) {
    const uniqueCharacterIds = Array.from(new Set(characterIds));
    if (uniqueCharacterIds.length === 0) return {};

    const characters = await this.prisma.character.findMany({
      where: {
        id: { in: uniqueCharacterIds },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        userId: true,
        classId: true,
        gold: true,
        avatarKey: true,
        class: { select: { id: true, name: true } },
        user: { select: { premiumUntil: true } },
        appearance: { include: appearanceInclude },
      },
    });
    const now = new Date();
    const selectedCosmeticIds = Array.from(
      new Set(
        characters.flatMap((character) =>
          this.getSelectedCosmetics(character.appearance).map(
            (cosmetic) => cosmetic.id,
          ),
        ),
      ),
    );
    const entitlements = selectedCosmeticIds.length
      ? await this.prisma.userCosmeticEntitlement.findMany({
          where: {
            userId: {
              in: Array.from(new Set(characters.map(({ userId }) => userId))),
            },
            cosmeticId: { in: selectedCosmeticIds },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { userId: true, cosmeticId: true },
        })
      : [];
    const entitlementIdsByUser = new Map<string, Set<string>>();

    for (const entitlement of entitlements) {
      const cosmeticIds =
        entitlementIdsByUser.get(entitlement.userId) ?? new Set<string>();
      cosmeticIds.add(entitlement.cosmeticId);
      entitlementIdsByUser.set(entitlement.userId, cosmeticIds);
    }

    return Object.fromEntries(
      characters.map((character) => [
        character.id,
        this.buildResolvedAppearance(
          character,
          now,
          entitlementIdsByUser.get(character.userId) ?? new Set<string>(),
        ),
      ]),
    );
  }

  async grantCosmetics(actorUserId: string, dto: GrantCosmeticsDto) {
    const hasCosmeticTarget = Boolean(dto.cosmeticKey);
    const hasCollectionTarget = Boolean(dto.collectionKey);
    if (hasCosmeticTarget === hasCollectionTarget) {
      throw new BadRequestException(
        'Informe exatamente um cosmeticKey ou collectionKey.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const cosmetics = await this.prisma.cosmetic.findMany({
      where: {
        isActive: true,
        ...(dto.cosmeticKey ? { key: dto.cosmeticKey } : {}),
        ...(dto.collectionKey
          ? { collection: { key: dto.collectionKey, isActive: true } }
          : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
    if (cosmetics.length === 0) {
      throw new NotFoundException('Nenhum cosmético ativo foi encontrado.');
    }

    const sourceReference =
      dto.sourceReference?.trim() ||
      dto.collectionKey ||
      dto.cosmeticKey ||
      'direct';
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    const entitlements = await this.prisma.$transaction(
      cosmetics.map((cosmetic) => {
        const grantKey = [
          dto.userId,
          cosmetic.id,
          dto.source,
          sourceReference,
        ].join(':');

        return this.prisma.userCosmeticEntitlement.upsert({
          where: { grantKey },
          update: {
            source: dto.source,
            sourceReference,
            expiresAt,
            revokedAt: null,
            grantedAt: new Date(),
          },
          create: {
            grantKey,
            userId: dto.userId,
            cosmeticId: cosmetic.id,
            source: dto.source,
            sourceReference,
            expiresAt,
          },
        });
      }),
    );

    this.auditService.recordSafely({
      actorUserId,
      action: 'cosmetics.entitlements.granted',
      entityType: 'User',
      entityId: dto.userId,
      metadata: {
        source: dto.source,
        sourceReference,
        cosmeticKeys: cosmetics.map((cosmetic) => cosmetic.key),
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });

    return {
      message: `${entitlements.length} cosmético(s) concedido(s).`,
      entitlements,
    };
  }

  async listUserEntitlements(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const now = new Date();
    const entitlements = await this.prisma.userCosmeticEntitlement.findMany({
      where: { userId },
      include: {
        cosmetic: {
          select: {
            key: true,
            name: true,
            type: true,
            collection: { select: { key: true, name: true } },
          },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return {
      user,
      entitlements: entitlements.map((entitlement) => ({
        ...entitlement,
        isActive:
          !entitlement.revokedAt &&
          (!entitlement.expiresAt || entitlement.expiresAt > now),
      })),
    };
  }

  async revokeEntitlement(actorUserId: string, entitlementId: string) {
    const entitlement = await this.prisma.userCosmeticEntitlement.findUnique({
      where: { id: entitlementId },
      include: { cosmetic: { select: { key: true } } },
    });
    if (!entitlement) {
      throw new NotFoundException('Direito cosmético não encontrado.');
    }

    const revoked = await this.prisma.userCosmeticEntitlement.update({
      where: { id: entitlementId },
      data: { revokedAt: new Date() },
    });

    this.auditService.recordSafely({
      actorUserId,
      action: 'cosmetics.entitlement.revoked',
      entityType: 'UserCosmeticEntitlement',
      entityId: entitlementId,
      metadata: {
        userId: entitlement.userId,
        cosmeticKey: entitlement.cosmetic.key,
      },
    });

    return { message: 'Direito cosmético revogado.', entitlement: revoked };
  }

  private async getCharacterContext(
    characterId: string,
    ownerUserId?: string,
  ): Promise<AppearanceContext> {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        deletedAt: null,
        ...(ownerUserId ? { userId: ownerUserId } : {}),
      },
      select: {
        id: true,
        name: true,
        userId: true,
        classId: true,
        gold: true,
        avatarKey: true,
        class: { select: { id: true, name: true } },
        user: { select: { premiumUntil: true } },
        appearance: { include: appearanceInclude },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    return character;
  }

  private async resolveAppearanceContext(
    character: AppearanceContext,
    now: Date,
  ) {
    const selectedCosmetics = this.getSelectedCosmetics(character.appearance);
    const entitlementIds = await this.getActiveEntitlementIds(
      character.userId,
      selectedCosmetics.map((cosmetic) => cosmetic.id),
      now,
    );

    return this.buildResolvedAppearance(character, now, entitlementIds);
  }

  private buildResolvedAppearance(
    character: AppearanceContext,
    now: Date,
    entitlementIds: Set<string>,
  ) {
    const premiumActive = isPremiumActive(character.user, now);
    const resolve = (cosmetic: CosmeticWithRelations | null | undefined) => {
      if (!cosmetic) return null;

      return this.canUseCosmetic({
        cosmetic,
        characterClassId: character.classId,
        premiumActive,
        hasEntitlement: entitlementIds.has(cosmetic.id),
        now,
      })
        ? this.formatCosmetic(cosmetic)
        : null;
    };

    const avatar = resolve(character.appearance?.avatarCosmetic);
    const avatarFrame = resolve(character.appearance?.avatarFrameCosmetic);
    const profileBanner = resolve(character.appearance?.profileBannerCosmetic);
    const overviewBackground = resolve(
      character.appearance?.overviewBackgroundCosmetic,
    );
    const profileEffect = resolve(character.appearance?.profileEffectCosmetic);
    const title = resolve(character.appearance?.titleCosmetic);
    const badge = resolve(character.appearance?.badgeCosmetic);

    return {
      baseAvatarKey: character.avatarKey,
      avatarKey: avatar?.assetKey ?? character.avatarKey,
      avatar,
      avatarFrame,
      profileBanner,
      overviewBackground,
      profileEffect,
      title,
      badge,
      accentColor:
        profileBanner?.accentColor ??
        avatarFrame?.accentColor ??
        avatar?.accentColor ??
        null,
    };
  }

  private async getActiveEntitlementIds(
    userId: string,
    cosmeticIds: string[],
    now: Date,
  ) {
    if (cosmeticIds.length === 0) return new Set<string>();

    const entitlements = await this.prisma.userCosmeticEntitlement.findMany({
      where: {
        userId,
        cosmeticId: { in: cosmeticIds },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { cosmeticId: true },
    });

    return new Set(entitlements.map((entitlement) => entitlement.cosmeticId));
  }

  private canUseCosmetic({
    cosmetic,
    characterClassId,
    premiumActive,
    hasEntitlement,
    now,
  }: {
    cosmetic: CosmeticWithRelations;
    characterClassId: string;
    premiumActive: boolean;
    hasEntitlement: boolean;
    now: Date;
  }) {
    if (!this.isCosmeticAvailable(cosmetic, now)) return false;
    if (cosmetic.classId && cosmetic.classId !== characterClassId) return false;
    if (hasEntitlement) return true;
    if (cosmetic.accessType === CosmeticAccessType.FREE) return true;

    return cosmetic.accessType === CosmeticAccessType.PREMIUM && premiumActive;
  }

  private isCosmeticAvailable(cosmetic: CosmeticWithRelations, now: Date) {
    if (!cosmetic.isActive) return false;
    if (!cosmetic.collection) return true;
    if (!cosmetic.collection.isActive) return false;
    if (cosmetic.collection.startsAt && cosmetic.collection.startsAt > now) {
      return false;
    }
    if (cosmetic.collection.endsAt && cosmetic.collection.endsAt <= now) {
      return false;
    }

    return true;
  }

  private formatVendorProducts(
    cosmetics: CosmeticWithRelations[],
    entitlementIds: Set<string>,
    now: Date,
  ) {
    const cosmeticsByKey = new Map(
      cosmetics
        .filter((cosmetic) => this.isCosmeticAvailable(cosmetic, now))
        .map((cosmetic) => [cosmetic.key, cosmetic]),
    );

    return COSMETIC_VENDOR_PRODUCTS.flatMap((product) => {
      const productCosmetics = product.cosmeticKeys
        .map((key) => cosmeticsByKey.get(key))
        .filter((cosmetic): cosmetic is CosmeticWithRelations =>
          Boolean(cosmetic),
        );
      if (productCosmetics.length !== product.cosmeticKeys.length) return [];

      const ownedCount = productCosmetics.filter((cosmetic) =>
        entitlementIds.has(cosmetic.id),
      ).length;

      return [
        {
          id: product.id,
          category: product.category,
          name: product.name,
          description: product.description,
          goldPrice: product.goldPrice,
          sortOrder: product.sortOrder,
          isOwned: ownedCount === productCosmetics.length,
          isPartiallyOwned:
            ownedCount > 0 && ownedCount < productCosmetics.length,
          cosmetics: productCosmetics.map((cosmetic) =>
            this.formatCosmetic(cosmetic),
          ),
        },
      ];
    });
  }

  private getMetadataProductId(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    return typeof metadata.productId === 'string' ? metadata.productId : null;
  }

  private getSelectedCosmetics(appearance: AppearanceWithCosmetics | null) {
    if (!appearance) return [];

    return [
      appearance.avatarCosmetic,
      appearance.avatarFrameCosmetic,
      appearance.profileBannerCosmetic,
      appearance.overviewBackgroundCosmetic,
      appearance.profileEffectCosmetic,
      appearance.titleCosmetic,
      appearance.badgeCosmetic,
    ].filter((cosmetic): cosmetic is CosmeticWithRelations =>
      Boolean(cosmetic),
    );
  }

  private getSelectedCosmeticIds(appearance: AppearanceWithCosmetics | null) {
    return new Set(
      this.getSelectedCosmetics(appearance).map((cosmetic) => cosmetic.id),
    );
  }

  private formatCosmetic(cosmetic: CosmeticWithRelations) {
    return {
      id: cosmetic.id,
      key: cosmetic.key,
      name: cosmetic.name,
      description: cosmetic.description,
      type: cosmetic.type,
      accessType: cosmetic.accessType,
      rarity: cosmetic.rarity,
      assetKey: cosmetic.assetKey,
      effectPreset: cosmetic.effectPreset,
      displayText: cosmetic.displayText,
      accentColor: cosmetic.accentColor,
      avatarPresentation: cosmetic.avatarPresentation,
      class: cosmetic.class,
      collection: cosmetic.collection
        ? {
            id: cosmetic.collection.id,
            key: cosmetic.collection.key,
            name: cosmetic.collection.name,
            description: cosmetic.collection.description,
            coverAssetKey: cosmetic.collection.coverAssetKey,
            sortOrder: cosmetic.collection.sortOrder,
          }
        : null,
    };
  }
}
