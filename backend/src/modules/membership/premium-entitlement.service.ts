import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PREMIUM_GRANT_DAYS = 3_650;

@Injectable()
export class PremiumEntitlementService {
  async lockUser(tx: Prisma.TransactionClient, userId: string) {
    const users = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`,
    );

    if (users.length === 0) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  async extendPremium(
    tx: Prisma.TransactionClient,
    params: { userId: string; premiumDays: number; now?: Date },
  ) {
    if (
      !Number.isSafeInteger(params.premiumDays) ||
      params.premiumDays <= 0 ||
      params.premiumDays > MAX_PREMIUM_GRANT_DAYS
    ) {
      throw new BadRequestException('Período de Premium inválido.');
    }

    await this.lockUser(tx, params.userId);

    const user = await tx.user.findUnique({
      where: { id: params.userId },
      select: { premiumUntil: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const now = params.now ?? new Date();
    const startsAt =
      user.premiumUntil && user.premiumUntil > now ? user.premiumUntil : now;
    const premiumUntil = new Date(
      startsAt.getTime() + params.premiumDays * DAY_MS,
    );

    await tx.user.update({
      where: { id: params.userId },
      data: { premiumUntil },
    });

    return {
      premiumBefore: user.premiumUntil,
      startsAt,
      premiumUntil,
    };
  }
}
