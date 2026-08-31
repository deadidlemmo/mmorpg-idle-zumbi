import {
  EconomyDirection,
  EconomyResourceType,
  IncursionSessionStatus,
} from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { EconomyService } from '../economy/economy.service';
import { IncursionsService } from './incursions.service';

describe('IncursionsService failure settlement', () => {
  it('refunds 90% and records HP loss and Gold in the same transaction', async () => {
    const session = {
      id: 'session-1',
      characterId: 'character-1',
      status: IncursionSessionStatus.ACTIVE,
      endsAt: new Date('2026-08-30T10:00:00.000Z'),
      completedAt: null,
      claimedAt: null,
      goldCostPaid: 1_150,
      entryGoldRefund: 0,
      xpReward: 0,
      goldReward: 0,
      approach: 'BALANCED',
      successChance: 66,
      rewardMultiplier: 1,
      outcomeRoll: 99,
      rewards: [],
      incursion: {
        id: 'incursion-1',
        tier: 5,
        riskLevel: 6,
        lootTable: [],
      },
    };
    const failedSession = {
      ...session,
      status: IncursionSessionStatus.FAILED,
      completedAt: session.endsAt,
      claimedAt: new Date('2026-08-30T10:01:00.000Z'),
      entryGoldRefund: 1_035,
      goldReward: 1_035,
    };
    const tx = {
      characterIncursionSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(failedSession),
      },
      character: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          level: 50,
          xp: 0,
          currentHp: 500,
          maxHp: 1_000,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      economyLedgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
    };
    const service = new IncursionsService(
      prisma as unknown as PrismaService,
      {} as ActivityGuardService,
      {} as EconomyService,
    );
    const testService = service as unknown as {
      rewardSession: (
        sessionId: string,
        characterId: string,
        now: Date,
        options: { requireFinished: boolean },
      ) => Promise<{
        success: boolean;
        hpLost: number;
        session: typeof failedSession;
      }>;
    };

    const result = await testService.rewardSession(
      session.id,
      session.characterId,
      new Date('2026-08-30T10:01:00.000Z'),
      { requireFinished: true },
    );

    expect(result).toMatchObject({
      success: false,
      hpLost: 232,
      session: {
        entryGoldRefund: 1_035,
        goldReward: 1_035,
      },
    });
    const [failureUpdate] = tx.characterIncursionSession.updateMany.mock
      .calls[0] as unknown as [
      {
        data: {
          status: IncursionSessionStatus;
          entryGoldRefund: number;
          goldReward: number;
        };
      },
    ];
    expect(failureUpdate.data).toMatchObject({
      status: IncursionSessionStatus.FAILED,
      entryGoldRefund: 1_035,
      goldReward: 1_035,
    });
    expect(tx.character.update).toHaveBeenCalledWith({
      where: { id: session.characterId },
      data: {
        currentHp: 268,
        gold: { increment: 1_035 },
      },
    });
    const [ledgerCreate] = tx.economyLedgerEntry.create.mock
      .calls[0] as unknown as [
      {
        data: {
          characterId: string;
          direction: EconomyDirection;
          resourceType: EconomyResourceType;
          quantity: number;
          reason: string;
          idempotencyKey: string;
        };
      },
    ];
    expect(ledgerCreate.data).toMatchObject({
      characterId: session.characterId,
      direction: EconomyDirection.CREDIT,
      resourceType: EconomyResourceType.GOLD,
      quantity: 1_035,
      reason: ECONOMY_REASONS.INCURSION_ENTRY_REFUND,
      idempotencyKey: `incursion:${session.id}:entry:refund:gold`,
    });
  });
});
