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
});
