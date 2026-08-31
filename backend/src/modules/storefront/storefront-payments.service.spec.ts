import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import Stripe from 'stripe';
import { StorefrontPaymentsService } from './storefront-payments.service';

function config(values: Record<string, string>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('StorefrontPaymentsService webhook signatures', () => {
  const prisma = {} as PrismaService;
  const fulfillment = {} as never;

  it('accepts a Stripe event signed with the configured webhook secret', async () => {
    const webhookSecret = 'whsec_test_deadidle';
    const payload = JSON.stringify({
      id: 'evt_test_deadidle',
      object: 'event',
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'ping',
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    const service = new StorefrontPaymentsService(
      prisma,
      config({
        FRONTEND_URL: 'https://deadidle.pages.dev',
        PUBLIC_API_URL: 'https://api.example.com',
        STRIPE_SECRET_KEY: 'sk_test_deadidle',
        STRIPE_WEBHOOK_SECRET: webhookSecret,
      }),
      fulfillment,
    );

    await expect(
      service.handleStripeWebhook(Buffer.from(payload), signature),
    ).resolves.toEqual({ received: true, handled: false });
  });

  it('rejects a Stripe event with an invalid signature', async () => {
    const service = new StorefrontPaymentsService(
      prisma,
      config({
        FRONTEND_URL: 'https://deadidle.pages.dev',
        PUBLIC_API_URL: 'https://api.example.com',
        STRIPE_SECRET_KEY: 'sk_test_deadidle',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_deadidle',
      }),
      fulfillment,
    );

    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'invalid'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a Mercado Pago event signed with request id, data id and timestamp', async () => {
    const webhookSecret = 'mercado-pago-webhook-secret';
    const requestId = 'request-deadidle-1';
    const dataId = 'payment-deadidle-1';
    const timestamp = Math.floor(Date.now() / 1000);
    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const signature = createHmac('sha256', webhookSecret)
      .update(manifest)
      .digest('hex');
    const service = new StorefrontPaymentsService(
      prisma,
      config({
        FRONTEND_URL: 'https://deadidle.pages.dev',
        PUBLIC_API_URL: 'https://api.example.com',
        MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-test-deadidle',
        MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
      }),
      fulfillment,
    );

    await expect(
      service.handleMercadoPagoWebhook({
        body: { type: 'unknown', data: { id: dataId } },
        dataId,
        xRequestId: requestId,
        xSignature: `ts=${timestamp},v1=${signature}`,
      }),
    ).resolves.toEqual({ received: true, handled: false });
  });
});
