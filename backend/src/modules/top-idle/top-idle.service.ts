import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TopIdleVoteRewardStatus } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PremiumEntitlementService } from '../membership/premium-entitlement.service';
import {
  getTopIdleSettings,
  TOP_IDLE_GAME_URL,
  TOP_IDLE_REWARD_COOLDOWN_HOURS,
  TOP_IDLE_REWARD_PREMIUM_DAYS,
  TOP_IDLE_WEBHOOK_MAX_AGE_SECONDS,
} from './top-idle.config';

const HOUR_MS = 60 * 60 * 1000;

type TopIdleWebhookHeaders = {
  timestamp?: string | null;
  signature?: string | null;
  voteId?: string | null;
  idempotencyKey?: string | null;
};

type TopIdleIdentifier =
  | { type: 'PLAYER_IDENTIFIER'; value: string }
  | { type: 'EMAIL'; value: string };

type TopIdleEvent = {
  eventId: string;
  identifier: TopIdleIdentifier;
};

@Injectable()
export class TopIdleService implements OnModuleInit {
  private readonly logger = new Logger(TopIdleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly premiumEntitlements: PremiumEntitlementService,
  ) {}

  onModuleInit() {
    const settings = getTopIdleSettings(this.configService);
    if (settings.rewardsRequested && !settings.webhookSecret) {
      this.logger.error(
        'TOPIDLE_REWARDS_ENABLED exige TOPIDLE_WEBHOOK_SECRET.',
      );
    }
  }

  async getRewardStatus(userId: string) {
    const [user, lastReward] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          topIdleRewardCode: true,
          premiumUntil: true,
        },
      }),
      this.prisma.topIdleVoteReward.findFirst({
        where: {
          userId,
          status: TopIdleVoteRewardStatus.GRANTED,
          grantedAt: { not: null },
        },
        orderBy: { grantedAt: 'desc' },
        select: {
          grantedAt: true,
          premiumAfter: true,
        },
      }),
    ]);

    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const settings = getTopIdleSettings(this.configService);
    const nextRewardAt = lastReward?.grantedAt
      ? new Date(
          lastReward.grantedAt.getTime() +
            TOP_IDLE_REWARD_COOLDOWN_HOURS * HOUR_MS,
        )
      : null;
    const now = new Date();

    return {
      enabled: settings.rewardsEnabled,
      voteUrl: settings.rewardsEnabled
        ? `${TOP_IDLE_GAME_URL}?playerIdentifier=${encodeURIComponent(
            user.topIdleRewardCode,
          )}`
        : null,
      reward: {
        premiumDays: TOP_IDLE_REWARD_PREMIUM_DAYS,
        cooldownHours: TOP_IDLE_REWARD_COOLDOWN_HOURS,
      },
      canReceiveReward:
        settings.rewardsEnabled &&
        (!nextRewardAt || nextRewardAt.getTime() <= now.getTime()),
      nextRewardAt,
      lastRewardAt: lastReward?.grantedAt ?? null,
      premiumUntil: user.premiumUntil,
    };
  }

  async handleWebhook(rawBody: Buffer, headers: TopIdleWebhookHeaders) {
    const settings = getTopIdleSettings(this.configService);
    if (!settings.webhookSecret) {
      throw new ServiceUnavailableException('Webhook TopIdle não configurado.');
    }

    this.validateSignature(rawBody, headers, settings.webhookSecret);
    const event = this.parseEvent(rawBody, headers);
    const identifierHash = this.hashIdentifier(event.identifier);

    const existing = await this.prisma.topIdleVoteReward.findUnique({
      where: { eventId: event.eventId },
      select: { status: true },
    });
    if (existing) {
      return { accepted: true, duplicate: true, status: existing.status };
    }

    const user = await this.findUser(event.identifier);

    if (!settings.rewardsEnabled) {
      return this.recordDisabledEvent({
        eventId: event.eventId,
        identifierHash,
        userId: user?.id ?? null,
      });
    }

    if (!user) {
      throw new NotFoundException(
        'Conta do Dead Idle não encontrada para este identificador.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.topIdleVoteReward.create({
          data: {
            eventId: event.eventId,
            userId: user.id,
            identifierHash,
            status: TopIdleVoteRewardStatus.RECEIVED,
            premiumDays: TOP_IDLE_REWARD_PREMIUM_DAYS,
          },
        });

        await this.premiumEntitlements.lockUser(tx, user.id);

        const now = new Date();
        const cooldownStartedAt = new Date(
          now.getTime() - TOP_IDLE_REWARD_COOLDOWN_HOURS * HOUR_MS,
        );
        const recentReward = await tx.topIdleVoteReward.findFirst({
          where: {
            userId: user.id,
            eventId: { not: event.eventId },
            status: TopIdleVoteRewardStatus.GRANTED,
            grantedAt: { gt: cooldownStartedAt },
          },
          orderBy: { grantedAt: 'desc' },
          select: { grantedAt: true },
        });

        if (recentReward?.grantedAt) {
          await tx.topIdleVoteReward.update({
            where: { eventId: event.eventId },
            data: {
              status: TopIdleVoteRewardStatus.COOLDOWN,
              processedAt: now,
            },
          });

          return {
            accepted: true,
            rewarded: false,
            status: TopIdleVoteRewardStatus.COOLDOWN,
            nextRewardAt: new Date(
              recentReward.grantedAt.getTime() +
                TOP_IDLE_REWARD_COOLDOWN_HOURS * HOUR_MS,
            ),
          };
        }

        const entitlement = await this.premiumEntitlements.extendPremium(tx, {
          userId: user.id,
          premiumDays: TOP_IDLE_REWARD_PREMIUM_DAYS,
          now,
        });

        await tx.topIdleVoteReward.update({
          where: { eventId: event.eventId },
          data: {
            status: TopIdleVoteRewardStatus.GRANTED,
            premiumBefore: entitlement.premiumBefore,
            premiumAfter: entitlement.premiumUntil,
            processedAt: now,
            grantedAt: now,
          },
        });

        return {
          accepted: true,
          rewarded: true,
          status: TopIdleVoteRewardStatus.GRANTED,
          premiumUntil: entitlement.premiumUntil,
        };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.prisma.topIdleVoteReward.findUnique({
          where: { eventId: event.eventId },
          select: { status: true },
        });
        if (duplicate) {
          return {
            accepted: true,
            duplicate: true,
            status: duplicate.status,
          };
        }
      }
      throw error;
    }
  }

  private validateSignature(
    rawBody: Buffer,
    headers: TopIdleWebhookHeaders,
    webhookSecret: string,
  ) {
    const timestamp = headers.timestamp?.trim() ?? '';
    const signature = headers.signature?.trim() ?? '';

    if (!/^\d{10}$/.test(timestamp)) {
      throw new UnauthorizedException('Timestamp TopIdle inválido.');
    }

    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > TOP_IDLE_WEBHOOK_MAX_AGE_SECONDS
    ) {
      throw new UnauthorizedException('Webhook TopIdle expirado.');
    }

    const digest = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const expected = `sha256=${digest}`;
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Assinatura TopIdle inválida.');
    }
  }

  private parseEvent(
    rawBody: Buffer,
    headers: TopIdleWebhookHeaders,
  ): TopIdleEvent {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Payload TopIdle inválido.');
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Payload TopIdle inválido.');
    }

    const payload = body as Record<string, unknown>;
    const eventId = this.readRequiredString(payload.eventId, 'eventId', 180);
    const voteId = headers.voteId?.trim();
    const idempotencyKey = headers.idempotencyKey?.trim();
    if (!voteId || !idempotencyKey) {
      throw new UnauthorizedException(
        'Identificadores do webhook TopIdle ausentes.',
      );
    }
    if (voteId !== eventId || idempotencyKey !== eventId) {
      throw new UnauthorizedException(
        'Identificadores do webhook TopIdle divergentes.',
      );
    }

    if (typeof payload.playerIdentifier === 'string') {
      return {
        eventId,
        identifier: {
          type: 'PLAYER_IDENTIFIER',
          value: this.readRequiredString(
            payload.playerIdentifier,
            'playerIdentifier',
            128,
          ),
        },
      };
    }

    return {
      eventId,
      identifier: {
        type: 'EMAIL',
        value: this.readRequiredString(
          payload.email,
          'email',
          254,
        ).toLowerCase(),
      },
    };
  }

  private readRequiredString(value: unknown, name: string, maxLength: number) {
    if (typeof value !== 'string') {
      throw new BadRequestException(`Campo ${name} inválido.`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
      throw new BadRequestException(`Campo ${name} inválido.`);
    }
    return normalized;
  }

  private findUser(identifier: TopIdleIdentifier) {
    return this.prisma.user.findUnique({
      where:
        identifier.type === 'PLAYER_IDENTIFIER'
          ? { topIdleRewardCode: identifier.value }
          : { email: identifier.value },
      select: { id: true },
    });
  }

  private hashIdentifier(identifier: TopIdleIdentifier) {
    return createHash('sha256')
      .update(`${identifier.type}:${identifier.value}`)
      .digest('hex');
  }

  private async recordDisabledEvent(params: {
    eventId: string;
    identifierHash: string;
    userId: string | null;
  }) {
    try {
      await this.prisma.topIdleVoteReward.create({
        data: {
          eventId: params.eventId,
          identifierHash: params.identifierHash,
          userId: params.userId,
          status: TopIdleVoteRewardStatus.DISABLED,
          premiumDays: TOP_IDLE_REWARD_PREMIUM_DAYS,
          processedAt: new Date(),
        },
      });
      return {
        accepted: true,
        rewarded: false,
        status: TopIdleVoteRewardStatus.DISABLED,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return {
          accepted: true,
          duplicate: true,
          status: TopIdleVoteRewardStatus.DISABLED,
        };
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
