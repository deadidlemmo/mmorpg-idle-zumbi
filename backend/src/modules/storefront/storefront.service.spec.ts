import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
      'cash-custom',
      'cash-25',
      'cash-50',
      'cash-100',
      'cash-200',
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

    const cashOffers = catalog.offers.filter(
      (offer) => offer.kind === 'CASH_PACKAGE',
    );
    const customCash = cashOffers.find((offer) => offer.key === 'cash-custom');
    const cash25 = cashOffers.find((offer) => offer.key === 'cash-25');
    const cash50 = cashOffers.find((offer) => offer.key === 'cash-50');
    const cash100 = cashOffers.find((offer) => offer.key === 'cash-100');
    const cash200 = cashOffers.find((offer) => offer.key === 'cash-200');
    expect(customCash).toMatchObject({
      cashAmount: 1,
      customQuantity: { min: 1, max: 1000, unitPriceCents: 100 },
    });
    expect(customCash?.price.amountCents).toBe(100);
    expect(cash25?.cashAmount).toBe(25);
    expect(cash25?.price.amountCents).toBe(2_500);
    expect(cash50?.cashAmount).toBe(55);
    expect(cash50?.price.amountCents).toBe(5_000);
    expect(cash100?.cashAmount).toBe(115);
    expect(cash100?.price.amountCents).toBe(10_000);
    expect(cash200?.cashAmount).toBe(240);
    expect(cash200?.price.amountCents).toBe(20_000);

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
      STRIPE_CHECKOUT_ENABLED: 'true',
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
      MERCADO_PAGO_CHECKOUT_ENABLED: 'true',
    });
    const pendingOrder = {
      id: 'order-1',
      idempotencyKey: 'storefront:user-1:3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
      userId: 'user-1',
      characterId: 'character-1',
      offerKey: 'pacote-nucleo-helix',
      offerKind: 'PERMANENT_PACKAGE',
      rewardQuantity: 1,
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
        rewardQuantity: 1,
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

  it('calcula no servidor uma recarga personalizada de 27 Cash', async () => {
    const configured = config({
      FRONTEND_URL: 'https://deadidle.pages.dev',
      PUBLIC_API_URL: 'https://api.example.com',
      MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-test',
      MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
      MERCADO_PAGO_CHECKOUT_ENABLED: 'true',
    });
    const pendingOrder = {
      id: 'order-cash-27',
      idempotencyKey: 'storefront:user-1:3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
      userId: 'user-1',
      characterId: 'character-1',
      offerKey: 'cash-custom',
      offerKind: 'CASH_PACKAGE',
      rewardQuantity: 27,
      provider: 'MERCADO_PAGO',
      status: StorefrontOrderStatus.PENDING,
      amountCents: 2700,
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
      checkoutId: 'preference-cash-27',
      checkoutUrl: 'https://www.mercadopago.com/checkout',
      expiresAt: null,
      providerStatus: 'open',
    });
    prisma.storefrontOrder.update.mockResolvedValue({
      ...pendingOrder,
      status: StorefrontOrderStatus.CHECKOUT_CREATED,
      checkoutUrl: 'https://www.mercadopago.com/checkout',
    });

    await service(configured).createCheckout('user-1', {
      requestId: '3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
      characterId: 'character-1',
      offerKey: 'cash-custom',
      provider: 'MERCADO_PAGO',
      cashAmount: 27,
    });

    expect(prisma.storefrontOrder.create).toHaveBeenCalledWith({
      data: {
        idempotencyKey:
          'storefront:user-1:3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
        userId: 'user-1',
        characterId: 'character-1',
        offerKey: 'cash-custom',
        offerKind: 'CASH_PACKAGE',
        rewardQuantity: 27,
        provider: 'MERCADO_PAGO',
        amountCents: 2700,
        currency: 'BRL',
      },
    });

    expect(payments.createCheckout).toHaveBeenCalledWith({
      order: pendingOrder,
      payerEmail: 'jogador@example.com',
      offer: {
        key: 'cash-custom',
        kind: 'CASH_PACKAGE',
        name: '27 Cash',
        eyebrow: 'Escolha a quantidade',
        description: 'Recarga personalizada de 27 Cash.',
        billingLabel: 'R$ 1,00 por Cash',
        accentColor: '#78a9dc',
        priceCents: 2700,
        cashAmount: 27,
        customQuantity: { min: 1, max: 1000, unitPriceCents: 100 },
        benefits: [],
      },
    });
  });

  it('mantém compatibilidade com abas antigas que enviam Cash sob medida sem quantidade', async () => {
    await expect(
      service().createCheckout('user-1', {
        requestId: '3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
        characterId: 'character-1',
        offerKey: 'cash-custom',
        provider: 'MERCADO_PAGO',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.storefrontOrder.create).not.toHaveBeenCalled();
  });

  it.each([
    ['cash-custom acima do limite', 'cash-custom', 1001],
    ['pacote fixo com quantidade enviada', 'cash-100', 27],
  ])('rejeita %s', async (_label, offerKey, cashAmount) => {
    await expect(
      service().createCheckout('user-1', {
        requestId: '3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
        characterId: 'character-1',
        offerKey: offerKey as 'cash-custom' | 'cash-100',
        provider: 'MERCADO_PAGO',
        ...(cashAmount === undefined ? {} : { cashAmount }),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.storefrontOrder.create).not.toHaveBeenCalled();
  });

  it('não reutiliza o mesmo requestId com outra quantidade de Cash', async () => {
    const configured = config({
      FRONTEND_URL: 'https://deadidle.pages.dev',
      PUBLIC_API_URL: 'https://api.example.com',
      MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-test',
      MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
      MERCADO_PAGO_CHECKOUT_ENABLED: 'true',
    });
    prisma.storefrontOrder.findUnique.mockResolvedValue({
      characterId: 'character-1',
      offerKey: 'cash-custom',
      provider: 'MERCADO_PAGO',
      rewardQuantity: 10,
      checkoutUrl: 'https://www.mercadopago.com/checkout',
    });

    await expect(
      service(configured).createCheckout('user-1', {
        requestId: '3f96aabe-9348-4dd3-8c2b-51ed2819f42c',
        characterId: 'character-1',
        offerKey: 'cash-custom',
        provider: 'MERCADO_PAGO',
        cashAmount: 27,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.storefrontOrder.create).not.toHaveBeenCalled();
  });
});
