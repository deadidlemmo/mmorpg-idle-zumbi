import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorefrontService } from './storefront.service';

function cosmetic(id: string, type = 'AVATAR') {
  return {
    id,
    key: id,
    name: id,
    description: null,
    type,
    rarity: 'LEGENDARY',
    assetKey: id,
    effectPreset: null,
    displayText: null,
    accentColor: '#65d8e8',
    class: null,
  };
}

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
        cosmetics: [cosmetic('premium-1'), cosmetic('premium-2')],
      },
      {
        key: 'premium-nucleo-helix',
        name: 'Núcleo Helix',
        description: 'Helix',
        coverAssetKey: 'banner-helix-nucleo-vivo',
        cosmetics: [cosmetic('helix-1'), cosmetic('helix-2')],
      },
      {
        key: 'premium-protocolo-carmesim',
        name: 'Protocolo Carmesim',
        description: 'Carmesim',
        coverAssetKey: 'banner-carmesim-sala-de-guerra',
        cosmetics: [cosmetic('carmesim-1')],
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
      'premium-abrigo-30d-item',
      'cash-100',
      'cash-200',
      'cash-500',
      'pacote-nucleo-helix',
      'pacote-protocolo-carmesim',
    ]);
    const premium = catalog.offers.find(
      (offer) => offer.key === 'premium-abrigo-monthly',
    );
    const cash = catalog.offers.find((offer) => offer.key === 'cash-100');
    const helix = catalog.offers.find(
      (offer) => offer.key === 'pacote-nucleo-helix',
    );
    const carmesim = catalog.offers.find(
      (offer) => offer.key === 'pacote-protocolo-carmesim',
    );

    expect(premium?.ownership.isOwned).toBe(true);
    expect(premium?.price.amountCents).toBe(1990);
    expect(premium?.price.formatted).toContain('19,90');
    expect(cash).toMatchObject({ cashAmount: 100 });
    expect(cash?.price.amountCents).toBe(990);
    expect(helix?.ownership).toMatchObject({
      isOwned: false,
      ownedItemCount: 1,
      totalItemCount: 2,
    });
    expect(helix?.collection?.items).toHaveLength(2);
    expect(carmesim?.ownership.isOwned).toBe(true);
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
