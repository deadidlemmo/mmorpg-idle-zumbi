import { ConfigService } from '@nestjs/config';
import { Prisma, WorldBossEventStatus } from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AutoCombatService } from '../auto-combat/auto-combat.service';
import { CraftingService } from '../crafting/crafting.service';
import { EconomyService } from '../economy/economy.service';
import { GatheringService } from '../gathering/gathering.service';
import { IncursionsService } from '../incursions/incursions.service';
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
      {} as AutoCombatService,
      {} as GatheringService,
      {} as CraftingService,
      {} as IncursionsService,
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
        confirmedAt: { not: null },
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
      {} as AutoCombatService,
      {} as GatheringService,
      {} as CraftingService,
      {} as IncursionsService,
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
        confirmedAt: { not: null },
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
        confirmedAt: { not: null },
        rewardGranted: false,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { rewardedAt: now },
    });
  });

  it('expõe no preview quando o casulo da recompensa é aleatório', () => {
    const service = new WorldBossesService(
      {} as PrismaService,
      {} as ActivityGuardService,
      {} as DistributedLockService,
      {} as EconomyService,
      {} as AutoCombatService,
      {} as GatheringService,
      {} as CraftingService,
      {} as IncursionsService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    ) as unknown as {
      formatBoss(boss: Record<string, unknown>): {
        rewards: Array<{ randomPetCocoon?: boolean }>;
      };
    };

    const formatted = service.formatBoss({
      id: 'boss-1',
      name: 'Boss',
      slug: 'boss',
      tier: 2,
      minLevel: 15,
      maxLevel: 20,
      durationSeconds: 3600,
      difficulty: 'CONTENCAO',
      riskLevel: 1,
      attackPower: 1,
      defense: 1,
      resistance: 1,
      mutationLevel: 1,
      map: { id: 'map-2', name: 'Distrito', tier: 2 },
      rewards: [
        {
          id: 'reward-cocoon',
          rewardType: 'PET_EGG',
          minQuantity: 1,
          maxQuantity: 1,
          chance: 7,
          guaranteed: false,
          onlyIfDefeated: true,
          requiresMinParticipation: true,
          randomPetCocoon: true,
          minContributionPercent: 0.25,
        },
      ],
    });

    expect(formatted.rewards[0]?.randomPetCocoon).toBe(true);
  });
});

describe('WorldBossesService TTK processing', () => {
  function createService(prisma: PrismaService) {
    return new WorldBossesService(
      prisma,
      {} as ActivityGuardService,
      {} as DistributedLockService,
      {} as EconomyService,
      {} as AutoCombatService,
      {} as GatheringService,
      {} as CraftingService,
      {} as IncursionsService,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService,
    );
  }

  it('congela o grupo e deriva o HP do TTK ao iniciar a batalha', async () => {
    const now = new Date('2026-08-29T12:00:00.000Z');
    const worldBoss = {
      id: 'boss-1',
      tier: 1,
      difficulty: 'CONTENCAO',
      durationSeconds: 3 * 60 * 60,
      defense: 18,
      resistance: 10,
      damageReduction: 0.058,
      sortOrder: 10,
      minLevel: 5,
      maxLevel: 5,
    };
    const event = {
      id: 'event-1',
      mapId: 'map-1',
      status: WorldBossEventStatus.LOBBY_OPEN,
      worldBoss,
    };
    const participantUpdate = jest
      .fn<
        Promise<Record<string, never>>,
        [{ where: { id: string }; data: Record<string, unknown> }]
      >()
      .mockResolvedValue({});
    const eventUpdate = jest.fn<
      {
        maxHp: number;
        currentHp: number;
        status: WorldBossEventStatus;
        worldBoss: typeof worldBoss;
      },
      [{ data: Record<string, unknown> }]
    >(({ data }) => ({
      maxHp: Number(data.maxHp),
      currentHp: Number(data.currentHp),
      status: data.status as WorldBossEventStatus,
      worldBoss,
    }));
    let snapshotWhere: {
      eventId: string;
      leftAt: null;
      confirmedAt: { not: null };
    } | null = null;
    const participantFindMany = jest.fn(
      (query: { where: Record<string, unknown> }) => {
        if ('confirmedAt' in query.where) {
          snapshotWhere = query.where as typeof snapshotWhere;
          return Promise.resolve([
            {
              id: 'participant-1',
              character: {
                level: 5,
                class: {
                  name: 'Lutador',
                  baseStrength: 12,
                  baseVitality: 12,
                  baseAgility: 8,
                  basePrecision: 8,
                  baseTechnique: 7,
                  baseWillpower: 8,
                },
                equipment: {
                  mainHand: { tier: 1 },
                  offHand: { tier: 1 },
                  head: { tier: 1 },
                  armor: { tier: 1 },
                  pants: { tier: 1 },
                  boots: { tier: 1 },
                },
                gatheringSkills: [],
              },
            },
          ]);
        }

        return Promise.resolve([
          {
            id: 'participant-1',
            eventId: event.id,
            characterId: 'character-1',
            joinedAt: now,
            confirmedAt: null,
            leftAt: null,
            character: {
              id: 'character-1',
              userId: 'user-1',
              status: 'ACTIVE',
              level: 5,
              currentHp: 100,
              maxHp: 100,
              mapId: 'map-1',
              deletedAt: null,
            },
          },
        ]);
      },
    );
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: event.id }]),
      worldBossEvent: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(event),
        update: eventUpdate,
      },
      worldBossParticipant: {
        findMany: participantFindMany,
        findFirst: jest.fn().mockResolvedValue(null),
        update: participantUpdate,
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: jest.fn(
        (
          callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        ) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createService(prisma) as unknown as {
      activateEventWithSnapshot(
        eventId: string,
        at: Date,
      ): Promise<{ maxHp: number; currentHp: number }>;
      flushRegisteredParticipantsForBattle: jest.Mock;
      stopActivitiesForWorldBossInTransaction: jest.Mock;
    };
    service.flushRegisteredParticipantsForBattle = jest.fn();
    service.stopActivitiesForWorldBossInTransaction = jest
      .fn()
      .mockResolvedValue([]);

    const activated = await service.activateEventWithSnapshot(event.id, now);
    const snapshotUpdate = participantUpdate.mock.calls[1]?.[0] as {
      where: { id: string };
      data: {
        powerScoreSnapshot: number;
        damagePerSecondSnapshot: number;
        scalingDamagePerSecondSnapshot: number;
        readinessSnapshot: number;
        equipmentTierSnapshot: number;
        equippedPieceCountSnapshot: number;
        combatSnapshotAt: Date;
      };
    };
    const activationUpdate = eventUpdate.mock.calls[0]?.[0];

    expect(snapshotWhere).toEqual({
      eventId: event.id,
      leftAt: null,
      confirmedAt: { not: null },
    });
    expect(snapshotUpdate.where).toEqual({ id: 'participant-1' });
    expect(snapshotUpdate.data.powerScoreSnapshot).toBeGreaterThan(0);
    expect(snapshotUpdate.data.damagePerSecondSnapshot).toBeGreaterThan(0);
    expect(snapshotUpdate.data.scalingDamagePerSecondSnapshot).toBeGreaterThan(
      0,
    );
    expect(snapshotUpdate.data.readinessSnapshot).toBe(1);
    expect(snapshotUpdate.data.equipmentTierSnapshot).toBe(1);
    expect(snapshotUpdate.data.equippedPieceCountSnapshot).toBe(6);
    expect(snapshotUpdate.data.combatSnapshotAt).toEqual(now);
    expect(activationUpdate.data).toMatchObject({
      status: WorldBossEventStatus.ACTIVE,
      targetTtkSeconds: 45 * 60,
      participantCount: 1,
      scalingVersion: 2,
      damageProcessedAt: now,
    });
    expect(Number(activationUpdate.data.maxHp)).toBeGreaterThan(0);
    expect(activationUpdate.data.currentHp).toBe(activationUpdate.data.maxHp);
    expect(activated.maxHp).toBeGreaterThan(0);
    expect(activated.currentHp).toBe(activated.maxHp);
  });

  it('processa dano agregado sem consulta do frontend ou recalculo do personagem', async () => {
    const startsAt = new Date('2026-08-29T12:00:00.000Z');
    const now = new Date('2026-08-29T12:00:10.000Z');
    const participants = [
      {
        id: 'participant-1',
        damagePerSecondSnapshot: 6,
        scalingDamagePerSecondSnapshot: 6,
        damageRemainder: 0,
        combatSnapshotAt: startsAt,
        activeSeconds: 0,
        joinedAt: startsAt,
      },
      {
        id: 'participant-2',
        damagePerSecondSnapshot: 4,
        scalingDamagePerSecondSnapshot: 4,
        damageRemainder: 0,
        combatSnapshotAt: startsAt,
        activeSeconds: 0,
        joinedAt: startsAt,
      },
    ];
    const event = {
      id: 'event-1',
      status: WorldBossEventStatus.ACTIVE,
      currentHp: 100,
      maxHp: 100,
      totalDamage: 0,
      participantCount: 2,
      startsAt,
      endsAt: new Date('2026-08-29T15:00:00.000Z'),
      defeatedAt: null,
      damageProcessedAt: startsAt,
      scalingVersion: 2,
      worldBoss: { id: 'boss-1' },
      participants,
    };
    const participantUpdate = jest
      .fn<
        Record<string, never>,
        [
          {
            where: { id: string };
            data: {
              damageDealt: { increment: number };
              activeSeconds: number;
              lastContributionAt: Date;
              damageRemainder: number;
              contributionPercent: number;
              rank?: number;
              eligibleForReward: boolean;
            };
          },
        ]
      >()
      .mockReturnValue({});
    const eventUpdate = jest.fn<
      { status: WorldBossEventStatus },
      [{ data: Record<string, unknown> }]
    >(({ data }) => ({ status: data.status as WorldBossEventStatus }));
    const findCharacter = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: event.id }]),
      character: { findUniqueOrThrow: findCharacter },
      worldBossEvent: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(event),
        update: eventUpdate,
      },
      worldBossParticipant: { update: participantUpdate },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: jest.fn(
        (
          callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        ) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createService(prisma) as unknown as {
      processActiveEvent(
        eventId: string,
        at: Date,
        force?: boolean,
      ): Promise<{ status: WorldBossEventStatus }>;
    };

    const processed = await service.processActiveEvent(event.id, now);

    const firstParticipantUpdate = participantUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { damageDealt: { increment: number }; activeSeconds: number };
    };
    const secondParticipantUpdate = participantUpdate.mock.calls[1]?.[0] as {
      where: { id: string };
      data: { damageDealt: { increment: number }; activeSeconds: number };
    };
    const processedEventUpdate = eventUpdate.mock.calls[0]?.[0];

    expect(findCharacter).not.toHaveBeenCalled();
    expect(firstParticipantUpdate.where).toEqual({ id: 'participant-1' });
    expect(firstParticipantUpdate.data.damageDealt).toEqual({ increment: 60 });
    expect(firstParticipantUpdate.data.activeSeconds).toBe(10);
    expect(secondParticipantUpdate.where).toEqual({ id: 'participant-2' });
    expect(secondParticipantUpdate.data.damageDealt).toEqual({ increment: 40 });
    expect(secondParticipantUpdate.data.activeSeconds).toBe(10);
    expect(processedEventUpdate.data).toMatchObject({
      currentHp: 0,
      totalDamage: { increment: 100 },
      status: WorldBossEventStatus.DEFEATED,
      defeatedAt: now,
    });
    expect(processed.status).toBe(WorldBossEventStatus.DEFEATED);
  });

  it('agenda todo evento ativo mesmo antes do prazo final', async () => {
    const event = {
      id: 'event-active',
      status: WorldBossEventStatus.ACTIVE,
    };
    const findMany = jest
      .fn<
        Promise<Array<typeof event>>,
        [{ where: { OR: Array<Record<string, unknown>> } }]
      >()
      .mockResolvedValue([event]);
    const prisma = {
      worldBossEvent: { findMany },
    } as unknown as PrismaService;
    const service = createService(prisma) as unknown as {
      processOpenEventsWithLock(): Promise<void>;
      processActiveEvent: jest.Mock<
        Promise<typeof event>,
        [eventId: string, now: Date]
      >;
    };
    const processActiveEvent = jest
      .fn<Promise<typeof event>, [eventId: string, now: Date]>()
      .mockResolvedValue(event);
    service.processActiveEvent = processActiveEvent;

    await service.processOpenEventsWithLock();

    const schedulerQuery = findMany.mock.calls[0]?.[0];
    expect(schedulerQuery.where.OR).toContainEqual({
      status: WorldBossEventStatus.ACTIVE,
    });
    expect(processActiveEvent).toHaveBeenCalledWith(event.id, expect.any(Date));
  });
});
