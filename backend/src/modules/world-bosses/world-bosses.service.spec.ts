import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EconomyService } from '../economy/economy.service';
import { WorldBossesService } from './world-bosses.service';

describe('WorldBossesService rewards', () => {
  it('nao concede novamente quando outra transacao ja reservou a recompensa', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findUniqueOrThrow = jest.fn();
    const tx = {
      worldBossParticipant: { updateMany, findUniqueOrThrow },
    } as unknown as Prisma.TransactionClient;
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new WorldBossesService(
      {} as PrismaService,
      {} as ActivityGuardService,
      {} as DistributedLockService,
      {} as EconomyService,
      configService,
    );
    const serviceWithGrant = service as unknown as {
      grantReward(
        transaction: Prisma.TransactionClient,
        event: unknown,
        participantId: string,
        characterId: string,
        now: Date,
      ): Promise<unknown[]>;
    };

    const rewards = await serviceWithGrant.grantReward(
      tx,
      {},
      'participant-1',
      'character-1',
      new Date('2026-08-24T12:00:00.000Z'),
    );

    expect(rewards).toEqual([]);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'participant-1',
        leftAt: null,
        rewardGranted: false,
      },
      data: {
        rewardGranted: true,
        rewardGrantedAt: new Date('2026-08-24T12:00:00.000Z'),
      },
    });
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('liquida em lote participantes offline e marca o evento como recompensado', async () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      { id: 'participant-1', characterId: 'character-1' },
      { id: 'participant-2', characterId: 'character-2' },
    ]);
    const count = jest.fn().mockResolvedValue(0);
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      worldBossParticipant: { findMany, count },
      worldBossEvent: { update },
    } as unknown as Prisma.TransactionClient;
    const service = new WorldBossesService(
      {} as PrismaService,
      {} as ActivityGuardService,
      {} as DistributedLockService,
      {} as EconomyService,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService,
    );
    const grantReward = jest
      .fn()
      .mockResolvedValueOnce([{ rewardType: 'CURRENCY', quantity: 3 }])
      .mockResolvedValueOnce([]);
    const serviceWithSettlement = service as unknown as {
      grantReward: typeof grantReward;
      settlePendingRewardsInTransaction(
        transaction: Prisma.TransactionClient,
        event: { id: string; rewardedAt: Date | null },
        settledAt: Date,
        options: { take: number },
      ): Promise<Map<string, unknown[]>>;
    };
    serviceWithSettlement.grantReward = grantReward;

    const settled =
      await serviceWithSettlement.settlePendingRewardsInTransaction(
        tx,
        { id: 'event-1', rewardedAt: null },
        now,
        { take: 25 },
      );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        leftAt: null,
        rewardGranted: false,
      },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      take: 25,
      select: { id: true, characterId: true },
    });
    expect(grantReward).toHaveBeenCalledTimes(2);
    expect(settled.get('character-1')).toEqual([
      { rewardType: 'CURRENCY', quantity: 3 },
    ]);
    expect(count).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        leftAt: null,
        rewardGranted: false,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { rewardedAt: now },
    });
  });
});
