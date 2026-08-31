import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { StorefrontOrderStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
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

function config(values: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('StorefrontService', () => {
  const prisma = {
    character: { findFirst: jest.fn() },
    cosmeticCollection: { findMany: jest.fn() },
    userCosmeticEntitlement: { findMany: jest.fn() },
    storefrontSubscription: { findFirst: jest.fn() },
    storefrontOrder: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const payments = { createCheckout: jest.fn() };
  const fulfillment = { updateSubscriptionStatus: jest.fn() };

  function service(configService = config()) {
    return new StorefrontService(
      prisma as unknown as PrismaService,
      configService,
      payments as never,
      fulfillment as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.character.findFirst.mockResolvedValue({
      id: 'character-1',
      userId: 'user-1',
      user: {
        email: 'jogador@example.com',
        premiumUntil: new Date('2999-01-01T00:00:00.000Z'),
      },
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
    prisma.storefrontSubscription.findFirst.mockResolvedValue(null);
    prisma.storefrontOrder.findUnique.mockResolvedValue(null);
  });

  it('expõe Premium e passes por R$ 19,90 com a posse correta', async () => {
    const catalog = await service().getCatalog('user-1', 'character-1');

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

    const pricedAt1990 = catalog.offers.filter((offer) =>
      [
        'premium-abrigo-monthly',
        'premium-abrigo-30d-item',
        'pacote-nucleo-helix',
        'pacote-protocolo-carmesim',
      ].includes(offer.key),
    );
    expect(pricedAt1990).toHaveLength(4);
    expect(
      pricedAt1990.every((offer) => offer.price.amountCents === 1990),
    ).toBe(true);
    expect(
      pricedAt1990.every((offer) => offer.price.formatted.includes('19,90')),
    ).toBe(true);

    const premiumPlan = catalog.offers.find(
      (offer) => offer.key === 'premium-abrigo-monthly',
    );
    const premiumPass = catalog.offers.find(
      (offer) => offer.key === 'premium-abrigo-30d-item',
    );
    expect(premiumPass?.benefits).toEqual(premiumPlan?.benefits);
    expect(premiumPlan?.benefits).toEqual(
      expect.arrayContaining([
        '+20% de EXP de Personagem',
        '+20% de EXP de Rastreio',
        '+20% de EXP de Expedições',
        '+20% de EXP de Criação',
      ]),
    );

    const helix = catalog.offers.find(
      (offer) => offer.key === 'pacote-nucleo-helix',
    );
    const carmesim = catalog.offers.find(
      (offer) => offer.key === 'pacote-protocolo-carmesim',
    );
    expect(helix?.ownership).toMatchObject({
      isOwned: false,
      ownedItemCount: 1,
      totalItemCount: 2,
    });
    expect(carmesim?.ownership.isOwned).toBe(true);
  });

  it('não cria cobrança enquanto o provedor não está configurado', async () => {
    await expect(
      service().createCheckout('user-1', {
        requestId: '3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
        characterId: 'character-1',
        offerKey: 'pacote-nucleo-helix',
        provider: 'MERCADO_PAGO',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.storefrontOrder.create).not.toHaveBeenCalled();
  });

  it('bloqueia nova compra de um pacote já adquirido', async () => {
    const configured = config({
      FRONTEND_URL: 'https://deadidle.pages.dev',
      PUBLIC_API_URL: 'https://api.example.com',
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
    });

    await expect(
      service(configured).createCheckout('user-1', {
        requestId: '3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
        characterId: 'character-1',
        offerKey: 'pacote-protocolo-carmesim',
        provider: 'STRIPE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(payments.createCheckout).not.toHaveBeenCalled();
  });

  it('persiste o preço do servidor antes de abrir o checkout', async () => {
    const configured = config({
      FRONTEND_URL: 'https://deadidle.pages.dev',
      PUBLIC_API_URL: 'https://api.example.com',
      MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-test',
      MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
    });
    const pendingOrder = {
      id: 'order-1',
      idempotencyKey: 'storefront:user-1:3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
      userId: 'user-1',
      characterId: 'character-1',
      offerKey: 'pacote-nucleo-helix',
      offerKind: 'PERMANENT_PACKAGE',
      provider: 'MERCADO_PAGO',
      status: StorefrontOrderStatus.PENDING,
      amountCents: 1990,
      currency: 'BRL',
      providerCheckoutId: null,
      checkoutUrl: null,
      providerStatus: null,
      failureCode: null,
      expiresAt: null,
      paidAt: null,
      fulfilledAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.storefrontOrder.create.mockResolvedValue(pendingOrder);
    payments.createCheckout.mockResolvedValue({
      checkoutId: 'preference-1',
      checkoutUrl: 'https://www.mercadopago.com/checkout',
      expiresAt: null,
      providerStatus: 'open',
    });
    prisma.storefrontOrder.update.mockResolvedValue({
      ...pendingOrder,
      status: StorefrontOrderStatus.CHECKOUT_CREATED,
      checkoutUrl: 'https://www.mercadopago.com/checkout',
    });

    const result = await service(configured).createCheckout('user-1', {
      requestId: '3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
      characterId: 'character-1',
      offerKey: 'pacote-nucleo-helix',
      provider: 'MERCADO_PAGO',
    });

    expect(prisma.storefrontOrder.create).toHaveBeenCalledWith({
      data: {
        idempotencyKey:
          'storefront:user-1:3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
        userId: 'user-1',
        characterId: 'character-1',
        offerKey: 'pacote-nucleo-helix',
        offerKind: 'PERMANENT_PACKAGE',
        provider: 'MERCADO_PAGO',
        amountCents: 1990,
        currency: 'BRL',
      },
    });
    expect(payments.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ order: pendingOrder }),
    );
    expect(result).toMatchObject({
      orderId: 'order-1',
      checkoutUrl: 'https://www.mercadopago.com/checkout',
    });
  });
});
