import { ConfigService } from '@nestjs/config';
import {
  EconomyResourceType,
  InventoryItemType,
  Prisma,
  Rarity,
  WorldBossEventStatus,
  WorldBossRewardType,
} from '@prisma/client';
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

  it('entrega Fragmento de Ameaça como item sem criar novo saldo legado', async () => {
    const inventoryUpsert = jest.fn().mockResolvedValue({ quantity: 3 });
    const grantedRewardCreate = jest.fn().mockResolvedValue({
      id: 'granted-reward-1',
    });
    const ledgerCreate = jest.fn().mockResolvedValue({});
    const creditWalletInTransaction = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'character-1' }]),
      worldBossParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'participant-1',
          eligibleForReward: true,
          contributionPercent: 100,
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      worldBossGrantedReward: {
        count: jest.fn().mockResolvedValue(0),
        create: grantedRewardCreate,
      },
      character: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ level: 10, xp: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryItem: { upsert: inventoryUpsert },
      economyLedgerEntry: { create: ledgerCreate },
    } as unknown as Prisma.TransactionClient;
    const economyService = {
      creditWalletInTransaction,
    } as unknown as EconomyService;
    const service = new WorldBossesService(
      {} as PrismaService,
      {} as ActivityGuardService,
      {} as DistributedLockService,
      economyService,
      {} as AutoCombatService,
      {} as GatheringService,
      {} as CraftingService,
      {} as IncursionsService,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService,
    ) as unknown as {
      grantReward(
        transaction: Prisma.TransactionClient,
        event: unknown,
        participantId: string,
        characterId: string,
        now: Date,
      ): Promise<Array<Record<string, unknown>>>;
    };
    const fragmentItem = {
      id: 'fragment-item-t1',
      name: 'Fragmento de Ameaça T1',
      tier: 1,
      rarity: Rarity.COMMON,
      slot: 'MATERIAL',
      family: 'Material de Ameaça Global',
    };

    const rewards = await service.grantReward(
      tx,
      {
        id: 'event-1',
        tier: 1,
        status: WorldBossEventStatus.DEFEATED,
        currentHp: 0,
        maxHp: 100,
        totalDamage: 100,
        defeatedAt: new Date('2026-08-30T12:00:00.000Z'),
        worldBoss: {
          rewards: [
            {
              rewardType: WorldBossRewardType.MATERIAL,
              itemId: fragmentItem.id,
              item: fragmentItem,
              currency: null,
              minQuantity: 3,
              maxQuantity: 3,
              chance: 100,
              guaranteed: true,
              onlyIfDefeated: false,
              requiresMinParticipation: true,
              randomPetCocoon: false,
              minContributionPercent: 0,
              rarity: Rarity.COMMON,
            },
          ],
        },
      },
      'participant-1',
      'character-1',
      new Date('2026-08-30T12:00:00.000Z'),
    );

    expect(creditWalletInTransaction).not.toHaveBeenCalled();
    const [grantedRewardCreateArgs] = grantedRewardCreate.mock
      .calls[0] as unknown as [Prisma.WorldBossGrantedRewardCreateArgs];
    expect(grantedRewardCreateArgs.data).toMatchObject({
      rewardType: WorldBossRewardType.MATERIAL,
      itemId: fragmentItem.id,
      currency: null,
      quantity: 3,
    });
    expect(inventoryUpsert).toHaveBeenCalledWith({
      where: {
        characterId_itemId: {
          characterId: 'character-1',
          itemId: fragmentItem.id,
        },
      },
      update: {
        quantity: { increment: 3 },
        type: InventoryItemType.MATERIAL,
      },
      create: {
        characterId: 'character-1',
        itemId: fragmentItem.id,
        quantity: 3,
        type: InventoryItemType.MATERIAL,
      },
    });
    const [ledgerArgs] = ledgerCreate.mock.calls[0] as [
      { data: { resourceType: EconomyResourceType; itemId: string } },
    ];
    expect(ledgerArgs.data).toMatchObject({
      resourceType: EconomyResourceType.ITEM,
      itemId: fragmentItem.id,
      tier: 1,
      quantity: 3,
      reason: 'WORLD_BOSS_FRAGMENT_REWARD',
    });
    expect(rewards).toEqual([
      expect.objectContaining({
        itemId: fragmentItem.id,
        quantity: 3,
        isWorldBossFragment: true,
      }),
    ]);
  });

  it('persiste apenas 50% do XP na segunda vitória elegível T2 do dia', async () => {
    const grantedRewardCreate = jest.fn().mockResolvedValue({
      id: 'granted-reward-xp',
    });
    const characterUpdate = jest.fn().mockResolvedValue({
      level: 11,
      xp: 500,
    });
    const ledgerCreate = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'character-1' }]),
      worldBossParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'participant-2',
          eligibleForReward: true,
          contributionPercent: 100,
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      worldBossGrantedReward: {
        count: jest.fn().mockResolvedValue(0),
        create: grantedRewardCreate,
      },
      character: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ level: 11, xp: 0 }),
        update: characterUpdate,
      },
      economyLedgerEntry: { create: ledgerCreate },
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
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    ) as unknown as {
      grantReward(
        transaction: Prisma.TransactionClient,
        event: unknown,
        participantId: string,
        characterId: string,
        now: Date,
      ): Promise<Array<{ rewardType: WorldBossRewardType; quantity: number }>>;
    };

    const rewards = await service.grantReward(
      tx,
      {
        id: 'event-2',
        tier: 2,
        status: WorldBossEventStatus.DEFEATED,
        currentHp: 0,
        maxHp: 100,
        totalDamage: 100,
        defeatedAt: new Date('2026-08-30T16:00:00.000Z'),
        worldBoss: {
          rewards: [
            {
              rewardType: WorldBossRewardType.XP,
              itemId: null,
              currency: null,
              minQuantity: 1_000,
              maxQuantity: 1_000,
              chance: 100,
              guaranteed: true,
              onlyIfDefeated: false,
              requiresMinParticipation: true,
              randomPetCocoon: false,
              minContributionPercent: 0,
              rarity: null,
            },
          ],
        },
      },
      'participant-2',
      'character-1',
      new Date('2026-08-30T16:00:00.000Z'),
    );

    expect(rewards).toEqual([
      expect.objectContaining({
        rewardType: WorldBossRewardType.XP,
        quantity: 500,
      }),
    ]);
    expect(characterUpdate).toHaveBeenCalledTimes(1);
    const [grantedRewardArgs] = grantedRewardCreate.mock
      .calls[0] as unknown as [Prisma.WorldBossGrantedRewardCreateArgs];
    expect(grantedRewardArgs.data).toMatchObject({
      participantId: 'participant-2',
      rewardType: WorldBossRewardType.XP,
      quantity: 500,
    });
    const [ledgerArgs] = ledgerCreate.mock.calls[0] as unknown as [
      {
        data: {
          characterId: string;
          resourceType: EconomyResourceType;
          quantity: number;
          idempotencyKey: string;
        };
      },
    ];
    expect(ledgerArgs.data).toMatchObject({
      characterId: 'character-1',
      resourceType: EconomyResourceType.XP,
      quantity: 500,
      idempotencyKey: 'world-boss:participant-2:reward:xp',
    });
  });

  it('consulta vitorias e casulos apenas no tier e reset UTC atuais', async () => {
    const participantCount = jest.fn().mockResolvedValue(2);
    const cocoonCount = jest.fn().mockResolvedValue(1);
    const tx = {
      worldBossParticipant: { count: participantCount },
      worldBossGrantedReward: { count: cocoonCount },
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
    ) as unknown as {
      getDailyPetRewardState(
        transaction: Prisma.TransactionClient,
        participantId: string,
        characterId: string,
        tier: number,
        now: Date,
        eligibleVictory: boolean,
      ): Promise<{
        eligibleVictory: boolean;
        previousEligibleVictories: number;
        cocoonsGranted: number;
      }>;
    };

    const state = await service.getDailyPetRewardState(
      tx,
      'participant-current',
      'character-1',
      3,
      new Date('2026-08-30T18:45:00.000Z'),
      true,
    );

    expect(state).toEqual({
      eligibleVictory: true,
      previousEligibleVictories: 2,
      cocoonsGranted: 1,
    });
    const rewardGrantedAt = {
      gte: new Date('2026-08-30T00:00:00.000Z'),
      lt: new Date('2026-08-31T00:00:00.000Z'),
    };
    expect(participantCount).toHaveBeenCalledWith({
      where: {
        id: { not: 'participant-current' },
        characterId: 'character-1',
        eligibleForReward: true,
        rewardGranted: true,
        rewardGrantedAt,
        event: {
          tier: 3,
          OR: [
            { status: WorldBossEventStatus.DEFEATED },
            { status: WorldBossEventStatus.REWARDED },
            { defeatedAt: { not: null } },
            { currentHp: { lte: 0 } },
          ],
        },
      },
    });
    expect(cocoonCount).toHaveBeenCalledWith({
      where: {
        rewardType: 'PET_EGG',
        participant: {
          characterId: 'character-1',
          rewardGrantedAt,
          event: { tier: 3 },
        },
      },
    });
  });

  it('expõe o multiplicador da próxima vitória usando o histórico diário do tier', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const service = new WorldBossesService(
      {
        worldBossParticipant: { count },
      } as unknown as PrismaService,
      {} as ActivityGuardService,
      {} as DistributedLockService,
      {} as EconomyService,
      {} as AutoCombatService,
      {} as GatheringService,
      {} as CraftingService,
      {} as IncursionsService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    ) as unknown as {
      getDailyXpRewardStatus(
        characterId: string,
        tier: number,
        now: Date,
      ): Promise<{
        eligibleVictoriesToday: number;
        nextVictoryMultiplier: number;
        nextVictoryPercent: number;
        unrestricted: boolean;
        resetsAt: Date;
      }>;
    };

    const status = await service.getDailyXpRewardStatus(
      'character-1',
      3,
      new Date('2026-08-30T18:45:00.000Z'),
    );

    expect(status).toMatchObject({
      eligibleVictoriesToday: 1,
      nextVictoryMultiplier: 0.5,
      nextVictoryPercent: 50,
      unrestricted: false,
      resetsAt: new Date('2026-08-31T00:00:00.000Z'),
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        eligibleForReward: true,
        rewardGranted: true,
        rewardGrantedAt: {
          gte: new Date('2026-08-30T00:00:00.000Z'),
          lt: new Date('2026-08-31T00:00:00.000Z'),
        },
        event: {
          tier: 3,
          OR: [
            { status: WorldBossEventStatus.DEFEATED },
            { status: WorldBossEventStatus.REWARDED },
            { defeatedAt: { not: null } },
            { currentHp: { lte: 0 } },
          ],
        },
      },
    });
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
        petRewardPolicy: {
          maxCocoonsPerTier: number;
          subsequentCocoonChanceMultiplier: number;
          subsequentFragmentQuantity: number;
        };
        xpRewardPolicy: {
          unrestrictedThroughTier: number;
          secondVictoryMultiplier: number;
          subsequentVictoryMultiplier: number;
        };
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
    expect(formatted.petRewardPolicy).toMatchObject({
      maxCocoonsPerTier: 1,
      subsequentCocoonChanceMultiplier: 0.01,
      subsequentFragmentQuantity: 1,
    });
    expect(formatted.xpRewardPolicy).toMatchObject({
      unrestrictedThroughTier: 1,
      secondVictoryMultiplier: 0.5,
      subsequentVictoryMultiplier: 0.25,
    });
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
