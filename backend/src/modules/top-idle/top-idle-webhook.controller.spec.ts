import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { TopIdleService } from './top-idle.service';
import { TopIdleWebhookController } from './top-idle-webhook.controller';

describe('TopIdleWebhookController', () => {
  let app: INestApplication;
  const topIdleService = {
    handleWebhook: jest.fn().mockResolvedValue({ accepted: true }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TopIdleWebhookController],
      providers: [{ provide: TopIdleService, useValue: topIdleService }],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('repassa o corpo bruto e os cabeçalhos assinados', async () => {
    const body = JSON.stringify({
      eventId: 'vote-event-1',
      playerIdentifier: 'reward-code-1',
    });

    await request(app.getHttpServer() as Server)
      .post('/webhooks/topidle')
      .set('Content-Type', 'application/json')
      .set('X-TopIdle-Timestamp', '1788177600')
      .set('X-TopIdle-Signature', 'sha256=signature')
      .set('X-TopIdle-Vote-Id', 'vote-event-1')
      .set('Idempotency-Key', 'vote-event-1')
      .send(body)
      .expect(204);

    expect(topIdleService.handleWebhook).toHaveBeenCalledWith(
      Buffer.from(body),
      {
        timestamp: '1788177600',
        signature: 'sha256=signature',
        voteId: 'vote-event-1',
        idempotencyKey: 'vote-event-1',
      },
    );
  });
});
