import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
  IncursionSessionStatus,
  Prisma,
  WorldBossEventStatus,
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

const USER_ID = 'user-1';
const CHARACTER_ID = 'character-1';
const EVENT_ID = 'event-1';
const MAP_ID = 'map-1';
const BASE_NOW = new Date('2026-08-29T12:00:00.000Z');

function buildBoss() {
  return {
    id: 'boss-1',
    name: 'Síndico Devorado',
    slug: 'sindico-devorado',
    description: 'Ameaça de contenção.',
    tier: 1,
    mapId: MAP_ID,
    minLevel: 5,
    maxLevel: 10,
    durationSeconds: 3 * 60 * 60,
    difficulty: 'CONTENCAO',
    riskLevel: 1,
    attackPower: 12,
    defense: 18,
    resistance: 10,
    mutationLevel: 1,
    baseHp: 1_000,
    damageReduction: 0.058,
    imageUrl: null,
    assetKey: null,
    sortOrder: 10,
    map: {
      id: MAP_ID,
      name: 'Subúrbio Silencioso',
      tier: 1,
      minLevel: 1,
      maxLevel: 10,
    },
    rewards: [],
  };
}

function buildEvent(
  status: WorldBossEventStatus,
  startsAt = new Date(BASE_NOW.getTime() + 2 * 60 * 60 * 1000),
) {
  const worldBoss = buildBoss();
  return {
    id: EVENT_ID,
    worldBossId: worldBoss.id,
    mapId: MAP_ID,
    tier: 1,
    status,
    startsAt,
    endsAt: new Date(startsAt.getTime() + (15 * 60 + 3 * 60 * 60) * 1000),
    updatedAt: BASE_NOW,
    currentHp: 1_000,
    maxHp: 1_000,
    totalDamage: 0,
    participantCount: 0,
    registrationCount: 0,
    targetTtkSeconds: null,
    aggregateDamagePerSecond: 0,
    scalingVersion: 1,
    damageProcessedAt: null,
    defeatedAt: null,
    rewardedAt: null,
    worldBoss,
    map: worldBoss.map,
  };
}

function buildCharacter(level = 10) {
  return {
    id: CHARACTER_ID,
    userId: USER_ID,
    name: 'Nilcruz',
    status: CharacterStatus.ACTIVE,
    level,
    currentHp: 100,
    maxHp: 100,
    mapId: MAP_ID,
    deletedAt: null,
    map: buildBoss().map,
    class: { id: 'class-1', name: 'Lutador' },
  };
}

function buildParticipant(confirmedAt: Date | null = null) {
  return {
    id: 'participant-1',
    eventId: EVENT_ID,
    characterId: CHARACTER_ID,
    joinedAt: BASE_NOW,
    confirmedAt,
    leftAt: null,
    lastContributionAt: BASE_NOW,
    damageDealt: 0,
    contributionPercent: 0,
    activeSeconds: 0,
    rewardGranted: false,
    rewardGrantedAt: null,
    eligibleForReward: false,
    rank: null,
    rewards: [],
  };
}

function createService(params: {
  prisma: PrismaService;
  activityGuard?: ActivityGuardService;
  autoCombat?: AutoCombatService;
  gathering?: GatheringService;
  crafting?: CraftingService;
  incursions?: IncursionsService;
}) {
  return new WorldBossesService(
    params.prisma,
    params.activityGuard ?? ({} as ActivityGuardService),
    {} as DistributedLockService,
    {} as EconomyService,
    params.autoCombat ?? ({} as AutoCombatService),
    params.gathering ?? ({} as GatheringService),
    params.crafting ?? ({} as CraftingService),
    params.incursions ?? ({} as IncursionsService),
    {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService,
  );
}

function createRegistrationPrisma(event: ReturnType<typeof buildEvent>) {
  let participant: ReturnType<typeof buildParticipant> | null = null;
  const create = jest.fn(() => {
    participant = buildParticipant();
    return Promise.resolve(participant);
  });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: EVENT_ID }]),
    worldBossEvent: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(event),
      update: jest.fn().mockResolvedValue(event),
    },
    worldBossParticipant: {
      findUnique: jest.fn(() => Promise.resolve(participant)),
      create,
      update: jest.fn(),
      count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
    },
  } as unknown as Prisma.TransactionClient;
  const prisma = {
    character: { findFirst: jest.fn().mockResolvedValue(buildCharacter()) },
    worldBossEvent: { findUnique: jest.fn().mockResolvedValue(event) },
    $transaction: jest.fn(
      (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(tx),
    ),
  } as unknown as PrismaService;

  return { prisma, create };
}

describe('WorldBossesService single registration lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('mantém a inscrição idempotente sem consultar ou encerrar atividades', async () => {
    const event = buildEvent(WorldBossEventStatus.SCHEDULED);
    const { prisma, create } = createRegistrationPrisma(event);
    const getCharacterActivityState = jest.fn();
    const activityGuard = {
      getCharacterActivityState,
    } as unknown as ActivityGuardService;
    const service = createService({ prisma, activityGuard });

    const first = await service.join(USER_ID, {
      eventId: EVENT_ID,
      characterId: CHARACTER_ID,
    });
    const duplicate = await service.join(USER_ID, {
      eventId: EVENT_ID,
      characterId: CHARACTER_ID,
    });

    expect(first.participant?.registrationStatus).toBe('REGISTERED');
    expect(duplicate.participant?.registrationStatus).toBe('REGISTERED');
    expect(duplicate.message).toContain('já estava ativa');
    expect(create).toHaveBeenCalledTimes(1);
    expect(getCharacterActivityState).not.toHaveBeenCalled();
  });

  it('bloqueia o card e a inscrição quando o nível mínimo não foi alcançado', () => {
    const event = {
      ...buildEvent(WorldBossEventStatus.SCHEDULED),
      worldBoss: { ...buildBoss(), minLevel: 15 },
    };
    const character = buildCharacter(14);
    const service = createService({
      prisma: {} as PrismaService,
    }) as unknown as {
      ensureRegistrationEligible(character: unknown, boss: unknown): void;
      getEligibility(
        currentCharacter: unknown,
        currentEvent: unknown,
      ): { canJoin: boolean; reason: string | null };
    };

    expect(() =>
      service.ensureRegistrationEligible(character, event.worldBoss),
    ).toThrow(ForbiddenException);
    expect(service.getEligibility(character, event)).toEqual({
      canJoin: false,
      reason: 'Bloqueado: alcance o nível 15.',
    });
  });

  it('aceita a mesma inscrição durante os 15 minutos de preparação', async () => {
    const event = buildEvent(WorldBossEventStatus.LOBBY_OPEN, BASE_NOW);
    const { prisma } = createRegistrationPrisma(event);
    const service = createService({ prisma });

    const result = await service.join(USER_ID, {
      eventId: EVENT_ID,
      characterId: CHARACTER_ID,
    });

    expect(result.participant?.registrationStatus).toBe('REGISTERED');
    expect(result.stoppedActivities).toBeUndefined();
  });

  it('não inicia antes dos 15 minutos completos e usa inscritos no fechamento', async () => {
    const event = buildEvent(WorldBossEventStatus.LOBBY_OPEN, BASE_NOW);
    const service = createService({
      prisma: {} as PrismaService,
    }) as unknown as {
      advanceEventState(currentEvent: unknown): Promise<unknown>;
      countRegisteredParticipants: jest.Mock;
      activateEventWithSnapshot: jest.Mock;
      expireEmptyLobby: jest.Mock;
    };
    service.countRegisteredParticipants = jest.fn().mockResolvedValue(2);
    service.activateEventWithSnapshot = jest.fn().mockResolvedValue({
      ...event,
      status: WorldBossEventStatus.ACTIVE,
    });
    service.expireEmptyLobby = jest.fn();

    jest.setSystemTime(new Date(BASE_NOW.getTime() + 15 * 60 * 1000 - 1));
    const preparing = await service.advanceEventState(event);
    expect(preparing).toBe(event);
    expect(service.activateEventWithSnapshot).not.toHaveBeenCalled();

    jest.setSystemTime(new Date(BASE_NOW.getTime() + 15 * 60 * 1000));
    await service.advanceEventState(event);
    expect(service.countRegisteredParticipants).toHaveBeenCalledWith(EVENT_ID);
    expect(service.activateEventWithSnapshot).toHaveBeenCalledWith(
      EVENT_ID,
      new Date(BASE_NOW.getTime() + 15 * 60 * 1000),
    );
  });

  it('expira a preparação sem nenhum inscrito', async () => {
    const event = buildEvent(WorldBossEventStatus.LOBBY_OPEN, BASE_NOW);
    jest.setSystemTime(new Date(BASE_NOW.getTime() + 15 * 60 * 1000));
    const service = createService({
      prisma: {} as PrismaService,
    }) as unknown as {
      advanceEventState(currentEvent: unknown): Promise<unknown>;
      countRegisteredParticipants: jest.Mock;
      activateEventWithSnapshot: jest.Mock;
      expireEmptyLobby: jest.Mock;
    };
    service.countRegisteredParticipants = jest.fn().mockResolvedValue(0);
    service.activateEventWithSnapshot = jest.fn();
    service.expireEmptyLobby = jest.fn().mockResolvedValue({
      ...event,
      status: WorldBossEventStatus.EXPIRED,
    });

    await service.advanceEventState(event);

    expect(service.expireEmptyLobby).toHaveBeenCalledWith(
      EVENT_ID,
      new Date(BASE_NOW.getTime() + 15 * 60 * 1000),
    );
    expect(service.activateEventWithSnapshot).not.toHaveBeenCalled();
  });

  it('encerra gathering, criação, incursão e autocombate na transação', async () => {
    const craftingUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const incursionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      gatheringSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      craftingSession: {
        updateMany: craftingUpdateMany,
      },
      characterIncursionSession: {
        updateMany: incursionUpdateMany,
      },
      autoCombatSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'auto-1',
          status: AutoCombatSessionStatus.ACTIVE,
          phase: AutoCombatSessionPhase.HUNTING,
          selectedEncounterId: null,
          battleTargetEncounterId: null,
          selectedEncounterMobId: null,
          battleTargetMobId: null,
          battleTargetRemaining: 0,
          foundEnemiesCount: 0,
          huntBatch: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      autoCombatHuntBatch: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as Prisma.TransactionClient;
    const service = createService({
      prisma: {} as PrismaService,
    }) as unknown as {
      stopActivitiesForWorldBossInTransaction(
        client: Prisma.TransactionClient,
        characterId: string,
        stoppedAt: Date,
      ): Promise<string[]>;
    };

    const stopped = await service.stopActivitiesForWorldBossInTransaction(
      tx,
      CHARACTER_ID,
      BASE_NOW,
    );

    expect(stopped).toEqual([
      'GATHERING',
      'CRAFTING',
      'INCURSION',
      'AUTO_COMBAT',
    ]);
    expect(craftingUpdateMany).toHaveBeenCalledWith({
      where: {
        characterId: CHARACTER_ID,
        status: ActivityStatus.ACTIVE,
        completesAt: { gt: BASE_NOW },
      },
      data: { status: ActivityStatus.STOPPED, completedAt: BASE_NOW },
    });
    expect(incursionUpdateMany).toHaveBeenCalledWith({
      where: {
        characterId: CHARACTER_ID,
        status: IncursionSessionStatus.ACTIVE,
        endsAt: { gt: BASE_NOW },
      },
      data: {
        status: IncursionSessionStatus.CANCELLED,
        completedAt: null,
      },
    });
  });

  it('confirma automaticamente o inscrito e só então cria o snapshot', async () => {
    const event = buildEvent(WorldBossEventStatus.LOBBY_OPEN, BASE_NOW);
    const registered = {
      ...buildParticipant(),
      character: buildCharacter(),
    };
    const participantUpdate = jest.fn().mockResolvedValue({});
    const eventUpdate = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...event, ...data }),
    );
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: EVENT_ID }]),
      worldBossEvent: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(event),
        update: eventUpdate,
      },
      worldBossParticipant: {
        findMany: jest.fn().mockResolvedValue([registered]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: participantUpdate,
      },
    } as unknown as Prisma.TransactionClient;
    const syncAfterWorldBossTransition = jest.fn().mockResolvedValue(undefined);
    const autoCombat = {
      syncAfterWorldBossTransition,
    } as unknown as AutoCombatService;
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const service = createService({ prisma, autoCombat }) as unknown as {
      activateEventWithSnapshot(
        eventId: string,
        at: Date,
      ): Promise<{ status: WorldBossEventStatus }>;
      flushRegisteredParticipantsForBattle: jest.Mock;
      stopActivitiesForWorldBossInTransaction: jest.Mock;
      snapshotActiveParticipants: jest.Mock;
    };
    service.flushRegisteredParticipantsForBattle = jest.fn();
    service.stopActivitiesForWorldBossInTransaction = jest
      .fn()
      .mockResolvedValue(['AUTO_COMBAT']);
    service.snapshotActiveParticipants = jest
      .fn()
      .mockResolvedValue([
        { id: registered.id, damagePerSecond: 10, scalingDamagePerSecond: 10 },
      ]);

    const activated = await service.activateEventWithSnapshot(
      EVENT_ID,
      BASE_NOW,
    );

    expect(activated.status).toBe(WorldBossEventStatus.ACTIVE);
    expect(
      service.stopActivitiesForWorldBossInTransaction,
    ).toHaveBeenCalledWith(tx, CHARACTER_ID, BASE_NOW);
    expect(participantUpdate).toHaveBeenCalledWith({
      where: { id: registered.id },
      data: { confirmedAt: BASE_NOW, lastContributionAt: BASE_NOW },
    });
    expect(participantUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      service.snapshotActiveParticipants.mock.invocationCallOrder[0],
    );
    expect(syncAfterWorldBossTransition).toHaveBeenCalledWith(
      USER_ID,
      CHARACTER_ID,
    );
  });
});
