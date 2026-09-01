import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { StorefrontPaymentProvider } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { Invoice, PreApproval } from 'mercadopago';
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('processa a cobranca recorrente autorizada do Mercado Pago', async () => {
    const webhookSecret = 'mercado-pago-webhook-secret';
    const requestId = 'request-deadidle-renewal';
    const dataId = 'invoice-deadidle-1';
    const timestamp = Math.floor(Date.now() / 1000);
    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const signature = createHmac('sha256', webhookSecret)
      .update(manifest)
      .digest('hex');
    const applyPaymentUpdate = jest.fn().mockResolvedValue({ applied: true });

    jest.spyOn(Invoice.prototype, 'get').mockResolvedValue({
      id: dataId,
      external_reference: 'order-1',
      preapproval_id: 'subscription-1',
      transaction_amount: 19.9,
      currency_id: 'BRL',
      last_modified: '2026-09-01T15:00:00.000Z',
      status: 'processed',
      payment: {
        id: 'payment-1',
        status: 'approved',
        status_detail: 'accredited',
      },
    });
    jest.spyOn(PreApproval.prototype, 'get').mockResolvedValue({
      id: 'subscription-1',
      next_payment_date: '2026-10-01T15:00:00.000Z',
    });

    const service = new StorefrontPaymentsService(
      prisma,
      config({
        FRONTEND_URL: 'https://deadidle.pages.dev',
        PUBLIC_API_URL: 'https://api.example.com',
        MERCADO_PAGO_ACCESS_TOKEN: 'TEST-deadidle',
        MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
      }),
      { applyPaymentUpdate } as never,
    );

    await expect(
      service.handleMercadoPagoWebhook({
        body: {
          id: 'event-1',
          type: 'subscription_authorized_payment',
          data: { id: dataId },
        },
        dataId,
        xRequestId: requestId,
        xSignature: `ts=${timestamp},v1=${signature}`,
      }),
    ).resolves.toEqual({ received: true, handled: true });

    expect(applyPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: StorefrontPaymentProvider.MERCADO_PAGO,
        orderId: 'order-1',
        providerPaymentId: 'payment-1',
        providerEventId: requestId,
        status: 'APPROVED',
        amountCents: 1990,
        currency: 'BRL',
        subscriptionId: 'subscription-1',
        periodEndsAt: new Date('2026-10-01T15:00:00.000Z'),
      }),
    );
  });
});
