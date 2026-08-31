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
import { TopIdleService } from './top-idle.service';

@Controller('webhooks/topidle')
export class TopIdleWebhookController {
  constructor(private readonly topIdleService: TopIdleService) {}

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-topidle-timestamp') timestamp?: string,
    @Headers('x-topidle-signature') signature?: string,
    @Headers('x-topidle-vote-id') voteId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('Corpo bruto da notificação ausente.');
    }

    await this.topIdleService.handleWebhook(request.rawBody, {
      timestamp,
      signature,
      voteId,
      idempotencyKey,
    });
  }
}
