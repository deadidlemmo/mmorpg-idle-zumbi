import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { StorefrontPaymentsService } from './storefront-payments.service';

function queryString(value: unknown): string | string[] | null {
  if (typeof value === 'string') return value;
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string')
  ) {
    return value;
  }
  return null;
}

@Controller('storefront/webhooks')
export class StorefrontWebhookController {
  constructor(private readonly payments: StorefrontPaymentsService) {}

  @Post('stripe')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  handleStripe(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('Corpo bruto da notificação ausente.');
    }
    return this.payments.handleStripeWebhook(request.rawBody, signature);
  }

  @Post('mercado-pago')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  handleMercadoPago(@Req() request: Request) {
    return this.payments.handleMercadoPagoWebhook({
      body: request.body,
      dataId: queryString(request.query['data.id'] ?? request.query.id),
      xRequestId: request.headers['x-request-id'] ?? null,
      xSignature: request.headers['x-signature'] ?? null,
    });
  }
}
