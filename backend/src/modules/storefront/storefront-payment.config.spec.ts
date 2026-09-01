import type { ConfigService } from '@nestjs/config';
import {
  getStorefrontProviderState,
  selectMercadoPagoCheckoutUrl,
} from './storefront-payment.config';

function config(values: Record<string, string>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('storefront payment configuration', () => {
  it('usa o checkout sandbox com Access Token de teste do Mercado Pago', () => {
    expect(
      selectMercadoPagoCheckoutUrl({
        accessToken: 'TEST-deadidle',
        initPoint: 'https://mercadopago.com/checkout/live',
        sandboxInitPoint: 'https://sandbox.mercadopago.com/checkout/test',
      }),
    ).toBe('https://sandbox.mercadopago.com/checkout/test');
  });

  it('usa o checkout real somente com Access Token de producao', () => {
    expect(
      selectMercadoPagoCheckoutUrl({
        accessToken: 'APP_USR-deadidle',
        initPoint: 'https://mercadopago.com/checkout/live',
        sandboxInitPoint: 'https://sandbox.mercadopago.com/checkout/test',
      }),
    ).toBe('https://mercadopago.com/checkout/live');
  });

  it('nao usa o checkout real como fallback durante a homologacao', () => {
    expect(
      selectMercadoPagoCheckoutUrl({
        accessToken: 'TEST-deadidle',
        initPoint: 'https://mercadopago.com/checkout/live',
      }),
    ).toBeNull();
  });

  it('mantem o checkout travado ate a ativacao explicita', () => {
    const values = {
      FRONTEND_URL: 'https://deadidle.pages.dev',
      PUBLIC_API_URL: 'https://deadidle-api.botpokeidle.com.br',
      MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-deadidle',
      MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
      MERCADO_PAGO_CHECKOUT_ENABLED: 'false',
    };

    expect(getStorefrontProviderState(config(values), 'MERCADO_PAGO')).toBe(
      'PLANNED',
    );
    expect(
      getStorefrontProviderState(
        config({ ...values, MERCADO_PAGO_CHECKOUT_ENABLED: 'true' }),
        'MERCADO_PAGO',
      ),
    ).toBe('AVAILABLE');
  });
});
