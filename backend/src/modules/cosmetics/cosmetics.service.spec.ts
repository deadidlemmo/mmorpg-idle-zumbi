import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AvatarPresentation,
  AvatarRepresentation,
  CosmeticAccessType,
  CosmeticGrantSource,
  CosmeticType,
  Rarity,
} from '@prisma/client';
import { CosmeticsService } from './cosmetics.service';

describe('CosmeticsService', () => {
  const prisma = {
    character: { findFirst: jest.fn(), findMany: jest.fn() },
    cosmetic: { findMany: jest.fn() },
    characterAppearance: { upsert: jest.fn() },
    userCosmeticEntitlement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const auditService = { recordSafely: jest.fn() };
  const service = new CosmeticsService(prisma as never, auditService as never);

  const collection = {
    id: 'collection-premium',
    key: 'premium-ultimo-abrigo',
    name: 'Último Abrigo',
    description: 'Coleção Premium.',
    coverAssetKey: 'banner-premium-ultimo-abrigo',
    isActive: true,
    sortOrder: 10,
    startsAt: null,
    endsAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const premiumAvatar = {
    id: 'cosmetic-avatar',
    key: 'avatar-premium-lutador-vanguarda',
    name: 'Vanguarda do Abrigo',
    description: 'Avatar Premium.',
    type: CosmeticType.AVATAR,
    accessType: CosmeticAccessType.PREMIUM,
    rarity: Rarity.EPIC,
    assetKey: 'avatar-premium-lutador-vanguarda',
    effectPreset: null,
    displayText: null,
    accentColor: '#72d94c',
    avatarPresentation: AvatarPresentation.MASCULINE,
    avatarRepresentation: AvatarRepresentation.WHITE,
    representationLabel: null,
    classId: 'class-lutador',
    collectionId: collection.id,
    isActive: true,
    sortOrder: 10,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    class: { id: 'class-lutador', name: 'Lutador' },
    collection,
  };
  const helixAvatar = {
    ...premiumAvatar,
    id: 'cosmetic-avatar-helix',
    key: 'avatar-helix-lutador-m-white',
    name: 'Baluarte Helix Atlas',
    description: 'Avatar do pacote Helix.',
    accessType: CosmeticAccessType.ENTITLEMENT,
    rarity: Rarity.LEGENDARY,
    assetKey: 'avatar-helix-lutador-m-white',
    collectionId: 'collection-helix',
    collection: {
      ...collection,
      id: 'collection-helix',
      key: 'premium-nucleo-helix',
      name: 'Núcleo Helix',
    },
  };

  function characterContext({
    premiumUntil,
    selectedAvatar = premiumAvatar,
  }: {
    premiumUntil: Date | null;
    selectedAvatar?: typeof premiumAvatar | null;
  }) {
    return {
      id: 'character-1',
      name: 'Lutador',
      userId: 'user-1',
      classId: 'class-lutador',
      gold: 250,
      avatarKey: 'lutador-01',
      class: { id: 'class-lutador', name: 'Lutador' },
      user: { premiumUntil },
      appearance: {
        characterId: 'character-1',
        avatarCosmeticId: selectedAvatar?.id ?? null,
        avatarFrameCosmeticId: null,
        profileBannerCosmeticId: null,
        overviewBackgroundCosmeticId: null,
        profileEffectCosmeticId: null,
        titleCosmeticId: null,
        badgeCosmeticId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        avatarCosmetic: selectedAvatar,
        avatarFrameCosmetic: null,
        profileBannerCosmetic: null,
        overviewBackgroundCosmetic: null,
        profileEffectCosmetic: null,
        titleCosmetic: null,
        badgeCosmetic: null,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userCosmeticEntitlement.findMany.mockResolvedValue([]);
    prisma.characterAppearance.upsert.mockResolvedValue({});
  });

  it('volta ao avatar base quando o Premium expira', async () => {
    prisma.character.findFirst.mockResolvedValue(
      characterContext({ premiumUntil: new Date('2000-01-01T00:00:00.000Z') }),
    );

    await expect(
      service.getResolvedAppearance('character-1'),
    ).resolves.toMatchObject({
      baseAvatarKey: 'lutador-01',
      avatarKey: 'lutador-01',
      avatar: null,
    });
  });

  it('mantém o cosmético após expiração quando há direito permanente', async () => {
    prisma.character.findFirst.mockResolvedValue(
      characterContext({ premiumUntil: new Date('2000-01-01T00:00:00.000Z') }),
    );
    prisma.userCosmeticEntitlement.findMany.mockResolvedValue([
      { cosmeticId: premiumAvatar.id },
    ]);

    await expect(
      service.getResolvedAppearance('character-1'),
    ).resolves.toMatchObject({
      avatarKey: premiumAvatar.assetKey,
      avatar: { key: premiumAvatar.key },
    });
  });

  it('resolve aparências em lote sem repetir personagens', async () => {
    prisma.character.findMany.mockResolvedValue([
      characterContext({
        premiumUntil: new Date('2999-01-01T00:00:00.000Z'),
      }),
    ]);

    const result = await service.getResolvedAppearances([
      'character-1',
      'character-1',
    ]);

    expect(prisma.character.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['character-1'] },
          deletedAt: null,
        },
      }),
    );
    expect(result['character-1']).toMatchObject({
      avatarKey: premiumAvatar.assetKey,
      avatar: { key: premiumAvatar.key },
    });
  });

  it('persiste um avatar compatível durante uma assinatura ativa', async () => {
    prisma.character.findFirst.mockResolvedValue(
      characterContext({ premiumUntil: new Date('2999-01-01T00:00:00.000Z') }),
    );
    prisma.cosmetic.findMany.mockResolvedValue([premiumAvatar]);

    await service.updateAppearance('user-1', 'character-1', {
      avatarCosmeticKey: premiumAvatar.key,
    });

    expect(prisma.characterAppearance.upsert).toHaveBeenCalledWith({
      where: { characterId: 'character-1' },
      update: { avatarCosmeticId: premiumAvatar.id },
      create: {
        characterId: 'character-1',
        avatarCosmeticId: premiumAvatar.id,
      },
    });
    expect(auditService.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cosmetics.appearance.updated',
        entityId: 'character-1',
      }),
    );
  });

  it('não libera um pacote permanente apenas pela assinatura Premium', async () => {
    prisma.character.findFirst.mockResolvedValue(
      characterContext({
        premiumUntil: new Date('2999-01-01T00:00:00.000Z'),
        selectedAvatar: null,
      }),
    );
    prisma.cosmetic.findMany.mockResolvedValue([helixAvatar]);

    await expect(
      service.updateAppearance('user-1', 'character-1', {
        avatarCosmeticKey: helixAvatar.key,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.characterAppearance.upsert).not.toHaveBeenCalled();
  });

  it('libera um pacote permanente quando a conta possui o direito', async () => {
    prisma.character.findFirst.mockResolvedValue(
      characterContext({ premiumUntil: null, selectedAvatar: null }),
    );
    prisma.cosmetic.findMany.mockResolvedValue([helixAvatar]);
    prisma.userCosmeticEntitlement.findMany.mockResolvedValue([
      { cosmeticId: helixAvatar.id },
    ]);

    await service.updateAppearance('user-1', 'character-1', {
      avatarCosmeticKey: helixAvatar.key,
    });

    expect(prisma.characterAppearance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { avatarCosmeticId: helixAvatar.id },
      }),
    );
  });

  it('bloqueia avatar incompatível com a classe do personagem', async () => {
    prisma.character.findFirst.mockResolvedValue(
      characterContext({
        premiumUntil: new Date('2999-01-01T00:00:00.000Z'),
        selectedAvatar: null,
      }),
    );
    prisma.cosmetic.findMany.mockResolvedValue([
      {
        ...premiumAvatar,
        id: 'cosmetic-assassino',
        key: 'avatar-premium-assassino-espectro',
        classId: 'class-assassino',
        class: { id: 'class-assassino', name: 'Assassino' },
      },
    ]);

    await expect(
      service.updateAppearance('user-1', 'character-1', {
        avatarCosmeticKey: 'avatar-premium-assassino-espectro',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.characterAppearance.upsert).not.toHaveBeenCalled();
  });

  it('usa uma chave idempotente ao conceder uma coleção comercial', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.cosmetic.findMany.mockResolvedValue([premiumAvatar]);
    prisma.userCosmeticEntitlement.upsert.mockResolvedValue({
      id: 'entitlement-1',
    });
    prisma.$transaction.mockImplementation((operations) =>
      Promise.all(operations),
    );

    const result = await service.grantCosmetics('admin-1', {
      userId: 'user-1',
      collectionKey: collection.key,
      source: CosmeticGrantSource.PURCHASE,
      sourceReference: 'order-123',
    });

    expect(prisma.userCosmeticEntitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          grantKey: `user-1:${premiumAvatar.id}:PURCHASE:order-123`,
        },
      }),
    );
    expect(result.message).toBe('1 cosmético(s) concedido(s).');
  });

  describe('compras no Ateliê da Vera', () => {
    const requestId = '3d2a18cc-1dc9-4d49-9888-f67c22498e5a';
    const vendorCosmetic = {
      ...premiumAvatar,
      id: 'cosmetic-gold-avatar',
      key: 'avatar-acervo-vigia-oficina',
      name: 'Vigia da Oficina',
      accessType: CosmeticAccessType.ENTITLEMENT,
      rarity: Rarity.UNCOMMON,
      classId: null,
      class: null,
      collectionId: 'collection-gold',
      collection: {
        ...collection,
        id: 'collection-gold',
        key: 'acervo-do-abrigo',
        name: 'Acervo do Abrigo',
        sortOrder: 5,
      },
    };

    function createTransactionMocks() {
      return {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
        economyLedgerEntry: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
        },
        character: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'character-1',
            userId: 'user-1',
            gold: 1_000,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ gold: 100 }),
        },
        cosmetic: {
          findMany: jest.fn().mockResolvedValue([vendorCosmetic]),
        },
        userCosmeticEntitlement: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn().mockResolvedValue({ id: 'entitlement-gold' }),
        },
      };
    }

    type VendorTransactionMocks = ReturnType<typeof createTransactionMocks>;
    type VendorTransactionCallback = (
      transaction: VendorTransactionMocks,
    ) => Promise<unknown>;

    function useTransaction(transaction: VendorTransactionMocks) {
      prisma.$transaction.mockImplementationOnce(
        (callback: VendorTransactionCallback) => callback(transaction),
      );
    }

    it('debita o preço do servidor, concede o direito e registra o ledger', async () => {
      const tx = createTransactionMocks();
      useTransaction(tx);

      const result = await service.purchaseVendorProduct(
        'user-1',
        'character-1',
        { productId: 'gold-avatar-vigia-oficina', requestId },
      );

      expect(tx.character.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'character-1',
          userId: 'user-1',
          gold: { gte: 900 },
        },
        data: { gold: { decrement: 900 } },
      });
      const [entitlementInput] = tx.userCosmeticEntitlement.upsert.mock
        .calls[0] as [
        {
          create: {
            userId: string;
            cosmeticId: string;
            source: CosmeticGrantSource;
            expiresAt: Date | null;
          };
        },
      ];
      expect(entitlementInput.create).toMatchObject({
        userId: 'user-1',
        cosmeticId: vendorCosmetic.id,
        source: CosmeticGrantSource.PURCHASE,
        expiresAt: null,
      });
      const [ledgerInput] = tx.economyLedgerEntry.create.mock.calls[0] as [
        {
          data: {
            characterId: string;
            quantity: number;
            balanceAfter: number;
            reason: string;
          };
        },
      ];
      expect(ledgerInput.data).toMatchObject({
        characterId: 'character-1',
        quantity: 900,
        balanceAfter: 100,
        reason: 'COSMETIC_VENDOR_GOLD_SPENT',
      });
      expect(result).toMatchObject({
        productId: 'gold-avatar-vigia-oficina',
        gold: 100,
        alreadyProcessed: false,
      });
    });

    it('não concede a aparência quando o Gold é insuficiente', async () => {
      const tx = createTransactionMocks();
      tx.character.updateMany.mockResolvedValue({ count: 0 });
      useTransaction(tx);

      await expect(
        service.purchaseVendorProduct('user-1', 'character-1', {
          productId: 'gold-avatar-vigia-oficina',
          requestId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.userCosmeticEntitlement.upsert).not.toHaveBeenCalled();
      expect(tx.economyLedgerEntry.create).not.toHaveBeenCalled();
    });

    it('reutiliza uma compra já processada sem debitar novamente', async () => {
      const tx = createTransactionMocks();
      tx.economyLedgerEntry.findUnique.mockResolvedValue({
        metadata: { productId: 'gold-avatar-vigia-oficina' },
      });
      useTransaction(tx);

      const result = await service.purchaseVendorProduct(
        'user-1',
        'character-1',
        { productId: 'gold-avatar-vigia-oficina', requestId },
      );

      expect(tx.character.updateMany).not.toHaveBeenCalled();
      expect(tx.userCosmeticEntitlement.upsert).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        gold: 1_000,
        alreadyProcessed: true,
      });
    });

    it('impede comprar novamente um produto já pertencente à conta', async () => {
      const tx = createTransactionMocks();
      tx.userCosmeticEntitlement.findMany.mockResolvedValue([
        { cosmeticId: vendorCosmetic.id },
      ]);
      useTransaction(tx);

      await expect(
        service.purchaseVendorProduct('user-1', 'character-1', {
          productId: 'gold-avatar-vigia-oficina',
          requestId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(tx.character.updateMany).not.toHaveBeenCalled();
      expect(tx.economyLedgerEntry.create).not.toHaveBeenCalled();
    });
  });
});
