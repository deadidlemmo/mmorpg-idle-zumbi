import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TopIdleVoteRewardStatus } from '@prisma/client';
import { createHash, createHmac } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import { PremiumEntitlementService } from '../membership/premium-entitlement.service';
import { TopIdleService } from './top-idle.service';

const SECRET = 'topidle_test_secret';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function config(values: Record<string, string>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function payload(eventId = 'vote-event-1', playerIdentifier = 'reward-code-1') {
  return Buffer.from(JSON.stringify({ eventId, playerIdentifier }));
}

function headers(rawBody: Buffer, eventId = 'vote-event-1') {
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const signature = `sha256=${createHmac('sha256', SECRET)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex')}`;
  return {
    timestamp,
    signature,
    voteId: eventId,
    idempotencyKey: eventId,
  };
}

function fixture(options?: {
  enabled?: boolean;
  premiumUntil?: Date | null;
  recentRewardAt?: Date | null;
  userExists?: boolean;
}) {
  const enabled = options?.enabled ?? true;
  const userExists = options?.userExists ?? true;
  const premiumUntil = options?.premiumUntil ?? null;
  const recentRewardAt = options?.recentRewardAt ?? null;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
    user: {
      findUnique: jest.fn().mockResolvedValue({ premiumUntil }),
      update: jest.fn(),
    },
    topIdleVoteReward: {
      create: jest.fn(),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          recentRewardAt ? { grantedAt: recentRewardAt } : null,
        ),
      update: jest.fn(),
    },
  };
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(userExists ? { id: 'user-1' } : null),
    },
    topIdleVoteReward: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const service = new TopIdleService(
    prisma as unknown as PrismaService,
    config({
      TOPIDLE_WEBHOOK_SECRET: SECRET,
      TOPIDLE_REWARDS_ENABLED: String(enabled),
    }),
    new PremiumEntitlementService(),
  );

  return { prisma, service, tx };
}

describe('TopIdleService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('concede um dia e registra o resultado do voto válido', async () => {
    const rawBody = payload();
    const { service, tx } = fixture();

    await expect(
      service.handleWebhook(rawBody, headers(rawBody)),
    ).resolves.toMatchObject({
      accepted: true,
      rewarded: true,
      status: TopIdleVoteRewardStatus.GRANTED,
      premiumUntil: new Date('2026-09-01T12:00:00.000Z'),
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { premiumUntil: new Date('2026-09-01T12:00:00.000Z') },
    });
    expect(tx.topIdleVoteReward.update).toHaveBeenCalledWith({
      where: { eventId: 'vote-event-1' },
      data: {
        status: TopIdleVoteRewardStatus.GRANTED,
        premiumBefore: null,
        premiumAfter: new Date('2026-09-01T12:00:00.000Z'),
        processedAt: NOW,
        grantedAt: NOW,
      },
    });
  });

  it('soma o dia ao Premium que já estava ativo', async () => {
    const rawBody = payload();
    const { service, tx } = fixture({
      premiumUntil: new Date('2026-09-05T12:00:00.000Z'),
    });

    await service.handleWebhook(rawBody, headers(rawBody));

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { premiumUntil: new Date('2026-09-06T12:00:00.000Z') },
    });
  });

  it('não paga novamente o mesmo eventId', async () => {
    const rawBody = payload();
    const { prisma, service } = fixture();
    prisma.topIdleVoteReward.findUnique.mockResolvedValue({
      status: TopIdleVoteRewardStatus.GRANTED,
    });

    await expect(
      service.handleWebhook(rawBody, headers(rawBody)),
    ).resolves.toMatchObject({ accepted: true, duplicate: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registra sem premiar durante a homologação desativada', async () => {
    const rawBody = payload();
    const { prisma, service } = fixture({ enabled: false, userExists: false });

    await expect(
      service.handleWebhook(rawBody, headers(rawBody)),
    ).resolves.toMatchObject({
      accepted: true,
      rewarded: false,
      status: TopIdleVoteRewardStatus.DISABLED,
    });
    expect(prisma.topIdleVoteReward.create).toHaveBeenCalledWith({
      data: {
        eventId: 'vote-event-1',
        identifierHash: createHash('sha256')
          .update('PLAYER_IDENTIFIER:reward-code-1')
          .digest('hex'),
        userId: null,
        status: TopIdleVoteRewardStatus.DISABLED,
        premiumDays: 1,
        processedAt: NOW,
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('recusa identificador sem conta quando as recompensas estão ativas', async () => {
    const rawBody = payload();
    const { service } = fixture({ userExists: false });

    await expect(
      service.handleWebhook(rawBody, headers(rawBody)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('não concede outro dia dentro do intervalo de 24 horas', async () => {
    const rawBody = payload();
    const { service, tx } = fixture({
      recentRewardAt: new Date('2026-08-31T06:00:00.000Z'),
    });

    await expect(
      service.handleWebhook(rawBody, headers(rawBody)),
    ).resolves.toMatchObject({
      rewarded: false,
      status: TopIdleVoteRewardStatus.COOLDOWN,
      nextRewardAt: new Date('2026-09-01T06:00:00.000Z'),
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejeita assinatura inválida', async () => {
    const rawBody = payload();
    const { service } = fixture();

    await expect(
      service.handleWebhook(rawBody, {
        ...headers(rawBody),
        signature: 'sha256=invalid',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita webhook com mais de cinco minutos', async () => {
    const rawBody = payload();
    const staleTimestamp = String(Math.floor(NOW.getTime() / 1000) - 301);
    const staleSignature = `sha256=${createHmac('sha256', SECRET)
      .update(`${staleTimestamp}.`)
      .update(rawBody)
      .digest('hex')}`;
    const { service } = fixture();

    await expect(
      service.handleWebhook(rawBody, {
        ...headers(rawBody),
        timestamp: staleTimestamp,
        signature: staleSignature,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita eventId divergente nos cabeçalhos', async () => {
    const rawBody = payload();
    const { service } = fixture();

    await expect(
      service.handleWebhook(rawBody, {
        ...headers(rawBody),
        voteId: 'outro-evento',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('gera o link autenticado e informa o próximo período elegível', async () => {
    const { prisma, service } = fixture();
    prisma.user.findUnique.mockResolvedValue({
      topIdleRewardCode: 'reward-code-1',
      premiumUntil: new Date('2026-09-10T12:00:00.000Z'),
    });
    prisma.topIdleVoteReward.findFirst.mockResolvedValue({
      grantedAt: new Date('2026-08-31T06:00:00.000Z'),
      premiumAfter: new Date('2026-09-10T12:00:00.000Z'),
    });

    await expect(service.getRewardStatus('user-1')).resolves.toMatchObject({
      enabled: true,
      voteUrl:
        'https://topidle.com/jogo/dead-idle-8c0924?playerIdentifier=reward-code-1',
      canReceiveReward: false,
      nextRewardAt: new Date('2026-09-01T06:00:00.000Z'),
      reward: { premiumDays: 1, cooldownHours: 24 },
    });
  });
});
