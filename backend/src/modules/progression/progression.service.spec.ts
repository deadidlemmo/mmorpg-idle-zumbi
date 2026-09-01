/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { ConflictException } from '@nestjs/common';
import { MissionStatus, MissionType } from '@prisma/client';
import type { AuditService } from '../../common/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProgressionService } from './progression.service';

describe('ProgressionService mission rewards', () => {
  it('claims the reward snapshot instead of the mutable definition reward', async () => {
    const characterUpdate = jest.fn().mockResolvedValue({ id: 'character-1' });
    const ledgerCreate = jest.fn().mockResolvedValue({ id: 'ledger-1' });
    const tx = {
      characterMission: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'assignment-1',
          characterId: 'character-1',
          status: MissionStatus.COMPLETED,
          claimedAt: null,
          rewardTier: 5,
          rewardXp: 990,
          rewardGold: 13_000,
          mission: {
            key: 'daily-field-crafting',
            rewardXp: 90,
            rewardGold: 110,
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      character: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ level: 41, xp: 0 }),
        update: characterUpdate,
      },
      economyLedgerEntry: { create: ledgerCreate },
    };
    const prisma = {
      character: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'character-1', level: 41 }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new ProgressionService(prisma, {} as AuditService);

    const result = await service.claimMission(
      'user-1',
      'character-1',
      'assignment-1',
    );

    expect(result).toMatchObject({
      rewardTier: 5,
      rewardXp: 990,
      rewardGold: 13_000,
    });
    expect(characterUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gold: { increment: 13_000 } }),
      }),
    );
    expect(ledgerCreate.mock.calls.map(([call]) => call.data.quantity)).toEqual(
      [990, 13_000],
    );
  });

  it('does not credit a mission whose claim lost the idempotency race', async () => {
    const characterUpdate = jest.fn();
    const tx = {
      characterMission: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'assignment-1',
          characterId: 'character-1',
          status: MissionStatus.COMPLETED,
          claimedAt: null,
          rewardTier: 2,
          rewardXp: 180,
          rewardGold: 900,
          mission: { key: 'daily-field-crafting' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      character: { update: characterUpdate },
    };
    const prisma = {
      character: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'character-1', level: 11 }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new ProgressionService(prisma, {} as AuditService);

    await expect(
      service.claimMission('user-1', 'character-1', 'assignment-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(characterUpdate).not.toHaveBeenCalled();
  });

  it('filters each objective by the tier frozen in the assignment', async () => {
    const gatheringAggregate = jest
      .fn()
      .mockResolvedValue({ _sum: { collectedQuantity: 3 } });
    const craftingAggregate = jest
      .fn()
      .mockResolvedValue({ _sum: { outputQuantity: 1 } });
    const eventFindMany = jest.fn().mockResolvedValue([
      {
        sessionId: 'session-1',
        payloadJson: { killsGained: 4, totalKills: 4 },
        session: { startedAt: new Date('2026-08-29T00:01:00.000Z') },
      },
    ]);
    const incursionCount = jest.fn().mockResolvedValue(1);
    const prisma = {
      gatheringSession: { aggregate: gatheringAggregate },
      craftingSession: { aggregate: craftingAggregate },
      autoCombatSessionEvent: {
        findMany: eventFindMany,
        findFirst: jest.fn(),
      },
      characterIncursionSession: { count: incursionCount },
    } as unknown as PrismaService;
    const service = new ProgressionService(prisma, {} as AuditService);
    const internals = service as unknown as {
      getObjectiveProgress(
        characterId: string,
        objectiveType: string,
        since: Date,
        characterLevel: number,
        missionTier: number,
      ): Promise<number>;
    };
    const since = new Date('2026-08-29T00:00:00.000Z');

    await internals.getObjectiveProgress(
      'character-1',
      'GATHER_UNITS',
      since,
      21,
      3,
    );
    await internals.getObjectiveProgress(
      'character-1',
      'CRAFT_ITEMS',
      since,
      21,
      3,
    );
    await internals.getObjectiveProgress(
      'character-1',
      'DEFEAT_MOBS',
      since,
      21,
      3,
    );
    await internals.getObjectiveProgress(
      'character-1',
      'COMPLETE_INCURSIONS',
      since,
      21,
      3,
    );

    expect(gatheringAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ map: { tier: 3 } }),
      }),
    );
    expect(craftingAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ outputItem: { tier: 3 } }),
      }),
    );
    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ session: { map: { tier: 3 } } }),
      }),
    );
    expect(incursionCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ incursion: { tier: 3 } }),
      }),
    );
  });

  it('counts every kill represented by one batched auto-combat event', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        sessionId: 'session-1',
        payloadJson: { killsGained: 10, totalKills: 42 },
        session: { startedAt: new Date('2026-08-28T23:00:00.000Z') },
      },
    ]);
    const findFirst = jest.fn();
    const prisma = {
      autoCombatSessionEvent: { findMany, findFirst },
    } as unknown as PrismaService;
    const service = new ProgressionService(prisma, {} as AuditService);
    const internals = service as unknown as {
      getObjectiveProgress(
        characterId: string,
        objectiveType: string,
        since: Date,
        characterLevel: number,
        missionTier: number,
      ): Promise<number>;
    };

    const progress = await internals.getObjectiveProgress(
      'character-1',
      'DEFEAT_MOBS',
      new Date('2026-08-29T00:00:00.000Z'),
      1,
      1,
    );

    expect(progress).toBe(10);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('reconstructs legacy kill batches from the prior cumulative total', async () => {
    const startedAt = new Date('2026-08-28T23:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        sessionId: 'session-1',
        payloadJson: { totalKills: 15 },
        session: { startedAt },
      },
      {
        sessionId: 'session-1',
        payloadJson: { totalKills: 20 },
        session: { startedAt },
      },
    ]);
    const findFirst = jest
      .fn()
      .mockResolvedValue({ payloadJson: { totalKills: 10 } });
    const prisma = {
      autoCombatSessionEvent: { findMany, findFirst },
    } as unknown as PrismaService;
    const service = new ProgressionService(prisma, {} as AuditService);
    const internals = service as unknown as {
      getObjectiveProgress(
        characterId: string,
        objectiveType: string,
        since: Date,
        characterLevel: number,
        missionTier: number,
      ): Promise<number>;
    };

    const progress = await internals.getObjectiveProgress(
      'character-1',
      'DEFEAT_MOBS',
      new Date('2026-08-29T00:00:00.000Z'),
      1,
      1,
    );

    expect(progress).toBe(10);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sessionId: 'session-1' }),
      }),
    );
  });

  it('renews monthly missions on the first UTC day of the next month', () => {
    const service = new ProgressionService(
      {} as PrismaService,
      {} as AuditService,
    );
    const internals = service as unknown as {
      getMissionPeriod(
        type: MissionType,
        now: Date,
      ): { key: string; startsAt: Date; expiresAt: Date | null };
    };

    const period = internals.getMissionPeriod(
      MissionType.MONTHLY,
      new Date('2026-12-31T23:59:59.000Z'),
    );

    expect(period.key).toBe('month-2026-12');
    expect(period.startsAt.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(period.expiresAt?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it.each([
    ['DAILY', '2026-09-03T00:00:00.000Z', '2026-09-04T00:00:00.000Z'],
    ['WEEKLY', '2026-08-31T00:00:00.000Z', '2026-09-07T00:00:00.000Z'],
  ])(
    'counts %s mission progress from the canonical period start',
    (type, startsAt, expiresAt) => {
      const service = new ProgressionService(
        {} as PrismaService,
        {} as AuditService,
      );
      const internals = service as unknown as {
        getMissionPeriod(
          missionType: MissionType,
          now: Date,
        ): { key: string; startsAt: Date; expiresAt: Date | null };
      };

      const period = internals.getMissionPeriod(
        type as MissionType,
        new Date('2026-09-03T18:42:00.000Z'),
      );

      expect(period.startsAt.toISOString()).toBe(startsAt);
      expect(period.expiresAt?.toISOString()).toBe(expiresAt);
    },
  );
});
