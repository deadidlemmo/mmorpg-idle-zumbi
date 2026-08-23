import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorefrontService } from './storefront.service';

describe('StorefrontService', () => {
  const prisma = {
    character: { findFirst: jest.fn() },
    cosmeticCollection: { findMany: jest.fn() },
    userCosmeticEntitlement: { findMany: jest.fn() },
  };
  const service = new StorefrontService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.character.findFirst.mockResolvedValue({
      id: 'character-1',
      userId: 'user-1',
      user: { premiumUntil: new Date('2999-01-01T00:00:00.000Z') },
    });
    prisma.cosmeticCollection.findMany.mockResolvedValue([
      {
        key: 'premium-ultimo-abrigo',
        name: 'Último Abrigo',
        description: 'Premium',
        coverAssetKey: 'banner-premium-ultimo-abrigo',
        cosmetics: [{ id: 'premium-1' }, { id: 'premium-2' }],
      },
      {
        key: 'premium-nucleo-helix',
        name: 'Núcleo Helix',
        description: 'Helix',
        coverAssetKey: 'banner-helix-nucleo-vivo',
        cosmetics: [{ id: 'helix-1' }, { id: 'helix-2' }],
      },
      {
        key: 'premium-protocolo-carmesim',
        name: 'Protocolo Carmesim',
        description: 'Carmesim',
        coverAssetKey: 'banner-carmesim-sala-de-guerra',
        cosmetics: [{ id: 'carmesim-1' }],
      },
    ]);
    prisma.userCosmeticEntitlement.findMany.mockResolvedValue([
      { cosmeticId: 'helix-1' },
      { cosmeticId: 'carmesim-1' },
    ]);
  });

  it('expõe somente Premium, Helix e Carmesim com a posse correta', async () => {
    const catalog = await service.getCatalog('user-1', 'character-1');

    expect(catalog.checkout.enabled).toBe(false);
    expect(catalog.offers.map((offer) => offer.key)).toEqual([
      'premium-abrigo-monthly',
      'pacote-nucleo-helix',
      'pacote-protocolo-carmesim',
    ]);
    expect(catalog.offers[0].ownership.isOwned).toBe(true);
    expect(catalog.offers[1].ownership).toMatchObject({
      isOwned: false,
      ownedItemCount: 1,
      totalItemCount: 2,
    });
    expect(catalog.offers[2].ownership.isOwned).toBe(true);
  });

  it('não cria cobrança enquanto os provedores não estão integrados', async () => {
    await expect(
      service.createCheckout('user-1', {
        characterId: 'character-1',
        offerKey: 'pacote-nucleo-helix',
        provider: 'MERCADO_PAGO',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('bloqueia nova compra de um pacote já adquirido', async () => {
    await expect(
      service.createCheckout('user-1', {
        characterId: 'character-1',
        offerKey: 'pacote-protocolo-carmesim',
        provider: 'STRIPE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
