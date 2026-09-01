import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import Stripe from 'stripe';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorefrontFulfillmentService } from '../src/modules/storefront/storefront-fulfillment.service';
import { StorefrontPaymentsService } from '../src/modules/storefront/storefront-payments.service';
import { StorefrontWebhookController } from '../src/modules/storefront/storefront-webhook.controller';

describe('Storefront webhooks (e2e)', () => {
  let app: INestApplication<App>;
  const mercadoPagoSecret = 'mercado-pago-webhook-secret';
  const stripeSecret = 'whsec_deadidle-e2e';

  beforeAll(async () => {
    const values: Record<string, string> = {
      FRONTEND_URL: 'https://deadidle.pages.dev',
      PUBLIC_API_URL: 'https://deadidle-api.botpokeidle.com.br',
      MERCADO_PAGO_ACCESS_TOKEN: 'TEST-deadidle-e2e',
      MERCADO_PAGO_WEBHOOK_SECRET: mercadoPagoSecret,
      MERCADO_PAGO_CHECKOUT_ENABLED: 'false',
      STRIPE_SECRET_KEY: 'sk_test_deadidle-e2e',
      STRIPE_WEBHOOK_SECRET: stripeSecret,
      STRIPE_CHECKOUT_ENABLED: 'false',
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [StorefrontWebhookController],
      providers: [
        StorefrontPaymentsService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => values[key] },
        },
        { provide: PrismaService, useValue: {} },
        { provide: StorefrontFulfillmentService, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('aceita evento Stripe assinado usando o corpo bruto', async () => {
    const payload = JSON.stringify({
      id: 'evt_deadidle_e2e',
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
      secret: stripeSecret,
    });

    const response = await request(app.getHttpServer())
      .post('/storefront/webhooks/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({ received: true, handled: false });
  });

  it('rejeita evento Stripe com assinatura invalida', () =>
    request(app.getHttpServer())
      .post('/storefront/webhooks/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', 'invalid')
      .send('{}')
      .expect(401));

  it('aceita evento neutro do Mercado Pago com assinatura valida', async () => {
    const dataId = 'deadidle-e2e-resource';
    const requestId = 'deadidle-e2e-request';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', mercadoPagoSecret)
      .update(`id:${dataId};request-id:${requestId};ts:${timestamp};`)
      .digest('hex');

    const response = await request(app.getHttpServer())
      .post('/storefront/webhooks/mercado-pago')
      .query({ 'data.id': dataId })
      .set('x-request-id', requestId)
      .set('x-signature', `ts=${timestamp},v1=${signature}`)
      .send({ type: 'deadidle_configuration_test', data: { id: dataId } })
      .expect(200);

    expect(response.body).toEqual({ received: true, handled: false });
  });
});
