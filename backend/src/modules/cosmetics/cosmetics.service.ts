import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CosmeticAccessType, CosmeticType, Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { isPremiumActive } from '../../common/utils/membership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { GrantCosmeticsDto } from './dto/grant-cosmetics.dto';
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
