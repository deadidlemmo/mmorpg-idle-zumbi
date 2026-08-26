/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CharacterStatus,
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  Prisma,
  WorldBossEventStatus,
  WorldBossRewardType,
} from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import {
  getWorldBossCollectiveRewardMultiplier,
  getWorldBossRespawnSeconds,
  WORLD_BOSS_REWARD_CONFIG,
  WORLD_BOSS_SCHEDULE_CONFIG,
} from '../../common/config/world-boss.config';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import { calculateLevelProgress } from '../../common/utils/level.util';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
} from '../../common/utils/stats.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { EconomyService } from '../economy/economy.service';
import { JoinWorldBossDto } from './dto/join-world-boss.dto';
import { LeaveWorldBossDto } from './dto/leave-world-boss.dto';
import {
  selectRandomPetCocoonCandidate,
  selectWorldBossRewards,
  type SelectedWorldBossReward,
  wasWorldBossDefeated,
} from './world-boss-rewards';
import { isWorldBossTestUnlockEnabled } from './world-boss-test-unlock.util';

const worldBossInclude = {
  map: {
    select: {
      id: true,
      name: true,
      tier: true,
      minLevel: true,
      maxLevel: true,
    },
  },
  rewards: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          tier: true,
          rarity: true,
          slot: true,
          family: true,
        },
      },
    },
  },
};

const eventInclude = {
  worldBoss: { include: worldBossInclude },
  map: {
    select: {
      id: true,
      name: true,
      tier: true,
      minLevel: true,
      maxLevel: true,
    },
  },
};

type Tx = Prisma.TransactionClient;

const WORLD_BOSS_PROCESSING_TICK_MS = 1000;
const WORLD_BOSS_PROCESSING_LOCK_TTL_MS = 60_000;
const WORLD_BOSS_PROCESSING_LOCK_KEY = 'dead-idle:scheduler:world-bosses';
const WORLD_BOSS_REWARD_RECEIPT_RETENTION_MS = 15 * 60 * 1000;
const WORLD_BOSS_ALWAYS_OPEN_TEST_TIER = 1;
const WORLD_BOSS_ALWAYS_OPEN_TEST_SLOT = 0;
const WORLD_BOSS_ALWAYS_OPEN_TEST_WINDOW_SECONDS = 24 * 60 * 60;
const WORLD_BOSS_VISIBLE_STATUSES: WorldBossEventStatus[] = [
  WorldBossEventStatus.SCHEDULED,
  WorldBossEventStatus.LOBBY_OPEN,
  WorldBossEventStatus.ACTIVE,
  WorldBossEventStatus.DEFEATED,
  WorldBossEventStatus.EXPIRED,
  WorldBossEventStatus.REWARDED,
];
const WORLD_BOSS_OPEN_STATUSES: WorldBossEventStatus[] = [
  WorldBossEventStatus.SCHEDULED,
  WorldBossEventStatus.LOBBY_OPEN,
  WorldBossEventStatus.ACTIVE,
];
const WORLD_BOSS_TERMINAL_STATUSES: WorldBossEventStatus[] = [
  WorldBossEventStatus.DEFEATED,
  WorldBossEventStatus.EXPIRED,
  WorldBossEventStatus.REWARDED,
  WorldBossEventStatus.CANCELLED,
];

@Injectable()
export class WorldBossesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldBossesService.name);
  private processingInterval?: NodeJS.Timeout;
  private isProcessingEvents = false;
  private readonly testUnlockEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
    private readonly distributedLock: DistributedLockService,
    private readonly economyService: EconomyService,
    configService: ConfigService,
  ) {
    this.testUnlockEnabled = isWorldBossTestUnlockEnabled(
      configService.get<string>('WORLD_BOSS_TEST_UNLOCK_ENABLED'),
      configService.get<string>('NODE_ENV'),
    );
  }

  onModuleInit() {
    this.processingInterval = setInterval(() => {
      void this.processOpenEvents();
    }, WORLD_BOSS_PROCESSING_TICK_MS);
  }

  onModuleDestroy() {
    if (this.processingInterval) clearInterval(this.processingInterval);
  }

  async getActive(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const status = await this.getStatus(userId, characterId);
    const activityState = await this.activityGuard.getCharacterActivityState({
      characterId,
      userId,
    });
    return {
      ...status,
      eligible: this.getEligibility(
        character,
        status.event ?? null,
        activityState.activeWorldBossParticipation,
      ),
    };
  }

  async getAvailable(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);

    if (!character.mapId) {
      return {
        events: [],
        message: 'Personagem sem mapa atual para Ameaças Globais.',
      };
    }

    const now = new Date();
    const activityState = await this.activityGuard.getCharacterActivityState({
      characterId,
      userId,
    });
    const bosses = await this.findCanonicalBossesForMap(character);
    const events = await Promise.all(
      bosses.map((boss) => this.ensureDisplayEventForBoss(boss, now)),
    );

    const statuses = await Promise.all(
      events.map(async (event) => {
        const availableEvent = await this.advanceEventState(event);
        const participant = await this.prisma.worldBossParticipant.findUnique({
          where: {
            eventId_characterId: {
              eventId: availableEvent.id,
              characterId,
            },
          },
          include: { rewards: { include: { item: true } } },
        });
        const activeParticipant = participant?.leftAt ? null : participant;

        if (
          activeParticipant &&
          (availableEvent.status === WorldBossEventStatus.ACTIVE ||
            availableEvent.status === WorldBossEventStatus.DEFEATED ||
            availableEvent.status === WorldBossEventStatus.EXPIRED)
        ) {
          const resolved = await this.resolveEventAndContribution({
            userId,
            characterId,
            eventId: availableEvent.id,
          });

          return {
            ...this.formatStatus(
              resolved.event,
              resolved.participant,
              new Date(),
              resolved.rewards,
            ),
            eligible: this.getEligibility(
              character,
              resolved.event,
              activityState.activeWorldBossParticipation,
            ),
          };
        }

        return {
          ...this.formatStatus(availableEvent, activeParticipant, now),
          eligible: this.getEligibility(
            character,
            availableEvent,
            activityState.activeWorldBossParticipation,
          ),
        };
      }),
    );
    const recentReward = await this.findRecentRewardStatus(
      characterId,
      character.mapId,
      now,
    );

    return {
      events: statuses,
      recentReward,
      message: statuses.length
        ? null
        : 'Nenhuma ameaça global ativa neste mapa.',
    };
  }

  private async processOpenEvents() {
    if (this.isProcessingEvents) return;

    this.isProcessingEvents = true;

    try {
      await this.distributedLock.runExclusive(
        WORLD_BOSS_PROCESSING_LOCK_KEY,
        WORLD_BOSS_PROCESSING_LOCK_TTL_MS,
        () => this.processOpenEventsWithLock(),
      );
    } finally {
      this.isProcessingEvents = false;
    }
  }

  private async processOpenEventsWithLock() {
    try {
      const now = new Date();
      const events = await this.prisma.worldBossEvent.findMany({
        where: {
          OR: [
            {
              status: WorldBossEventStatus.SCHEDULED,
              startsAt: { lte: now },
            },
            {
              status: WorldBossEventStatus.LOBBY_OPEN,
            },
            {
              status: WorldBossEventStatus.ACTIVE,
              endsAt: { lte: now },
              currentHp: { gt: 0 },
            },
            {
              status: {
                in: [
                  WorldBossEventStatus.DEFEATED,
                  WorldBossEventStatus.EXPIRED,
                ],
              },
              participants: {
                some: { leftAt: null, rewardGranted: false },
              },
            },
          ],
        },
        take: 50,
        include: eventInclude,
      });

      for (const event of events) {
        let nextEvent = await this.advanceEventState(event);
        if (WORLD_BOSS_TERMINAL_STATUSES.includes(nextEvent.status)) {
          nextEvent = await this.settleTerminalEventRewards(nextEvent.id);
          const nextCycleEvent = await this.ensureNextCycleEvent(
            nextEvent,
            nextEvent.worldBoss,
            new Date(),
          );
          if (this.testUnlockEnabled) {
            await this.ensureEventAvailableForTest(nextCycleEvent);
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Falha ao processar ciclo de World Boss: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async getStatus(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const event = await this.findActiveEventForCharacter(character);

    if (!event) {
      return {
        character: this.formatCharacter(character),
        event: null,
        participant: null,
        message: 'Nenhuma ameaça global ativa neste mapa.',
      };
    }

    const resolved = await this.resolveEventAndContribution({
      userId,
      characterId,
      eventId: event.id,
      emitDamage: true,
    });

    return this.formatStatus(
      resolved.event,
      resolved.participant,
      new Date(),
      resolved.rewards,
    );
  }

  async join(userId: string, dto: JoinWorldBossDto) {
    const character = await this.getCharacterOrThrow(userId, dto.characterId);
    const event = await this.prisma.worldBossEvent.findUnique({
      where: { id: dto.eventId },
      include: eventInclude,
    });

    if (!event) throw new NotFoundException('Ameaça Global não encontrada.');
    const availableEvent = await this.advanceEventState(event);
    this.ensureEventJoinable(availableEvent);
    this.ensureEligible(character, availableEvent.worldBoss);

    await this.activityGuard.ensureCanStartWorldBoss({
      characterId: dto.characterId,
      userId,
      worldBossEventId: dto.eventId,
    });

    if (availableEvent.status !== WorldBossEventStatus.SCHEDULED) {
      const activityState = await this.activityGuard.getCharacterActivityState({
        characterId: dto.characterId,
        userId,
      });
      if (
        activityState.hasActiveAutoCombat ||
        activityState.hasActiveGathering ||
        activityState.hasActiveIncursion
      ) {
        throw new BadRequestException(
          'Ameaça Global é uma atividade principal. Encerre auto-combate, gathering ou incursão antes de participar.',
        );
      }
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.activityGuard.ensureCanStartWorldBoss({
        characterId: dto.characterId,
        userId,
        worldBossEventId: dto.eventId,
        client: tx,
        lockCharacter: true,
      });

      const existingParticipant = await tx.worldBossParticipant.findUnique({
        where: {
          eventId_characterId: {
            eventId: dto.eventId,
            characterId: dto.characterId,
          },
        },
      });

      if (existingParticipant && !existingParticipant.leftAt) {
        throw new ConflictException(
          'Personagem já está no lobby desta Ameaça Global.',
        );
      }

      const participant = existingParticipant
        ? await tx.worldBossParticipant.update({
            where: { id: existingParticipant.id },
            data: { leftAt: null, lastContributionAt: now },
          })
        : await tx.worldBossParticipant.create({
            data: {
              eventId: dto.eventId,
              characterId: dto.characterId,
              joinedAt: now,
              lastContributionAt: now,
            },
          });

      await this.recalculateScaling(tx, dto.eventId, now);
      await this.recalculateParticipantCount(tx, dto.eventId);

      const updatedEvent = await tx.worldBossEvent.findUniqueOrThrow({
        where: { id: dto.eventId },
        include: eventInclude,
      });
      return { event: updatedEvent, participant };
    });
    const updatedEvent = await this.advanceEventState(result.event);

    return {
      ...this.formatStatus(
        updatedEvent,
        result.participant,
        now,
        null,
        'Você entrou na Ameaça Global.',
      ),
      eligible: this.getEligibility(character, updatedEvent),
    };
  }

  async leave(userId: string, dto: LeaveWorldBossDto) {
    const character = await this.getCharacterOrThrow(userId, dto.characterId);
    const event = await this.prisma.worldBossEvent.findUnique({
      where: { id: dto.eventId },
      include: eventInclude,
    });

    if (!event) throw new NotFoundException('Ameaça Global não encontrada.');

    await this.advanceEventState(event);

    const participant = await this.prisma.worldBossParticipant.findUnique({
      where: {
        eventId_characterId: {
          eventId: dto.eventId,
          characterId: dto.characterId,
        },
      },
    });

    if (!participant || participant.leftAt)
      throw new NotFoundException('Participação não encontrada.');

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const event = await tx.worldBossEvent.findUniqueOrThrow({
        where: { id: dto.eventId },
        include: eventInclude,
      });

      if (
        event.status === WorldBossEventStatus.SCHEDULED ||
        event.status === WorldBossEventStatus.LOBBY_OPEN
      ) {
        await tx.worldBossParticipant.delete({
          where: { id: participant.id },
        });
        await this.recalculateParticipantCount(tx, dto.eventId);
        const updatedEvent = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: dto.eventId },
          include: eventInclude,
        });
        return { event: updatedEvent, leftDuringBattle: false };
      } else if (event.status === WorldBossEventStatus.ACTIVE) {
        await tx.worldBossParticipant.update({
          where: { id: participant.id },
          data: {
            leftAt: now,
            lastContributionAt: now,
            eligibleForReward: false,
          },
        });

        await this.recalculateParticipantCount(tx, dto.eventId);

        const remainingParticipants = await tx.worldBossParticipant.count({
          where: { eventId: dto.eventId, leftAt: null },
        });

        if (
          remainingParticipants <= 0 &&
          this.isAlwaysOpenTestBoss(event.worldBoss)
        ) {
          await tx.worldBossEvent.update({
            where: { id: dto.eventId },
            data: {
              status: WorldBossEventStatus.CANCELLED,
              endsAt: now,
            },
          });

          const nextEvent = await tx.worldBossEvent.create({
            data: {
              worldBossId: event.worldBossId,
              mapId: event.mapId,
              tier: event.tier,
              status: WorldBossEventStatus.LOBBY_OPEN,
              startsAt: now,
              endsAt: new Date(
                now.getTime() + event.worldBoss.durationSeconds * 1000,
              ),
              maxHp: event.worldBoss.baseHp,
              currentHp: event.worldBoss.baseHp,
            },
            include: eventInclude,
          });

          return { event: nextEvent, leftDuringBattle: true };
        }

        const updatedEvent = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: dto.eventId },
          include: eventInclude,
        });
        return { event: updatedEvent, leftDuringBattle: true };
      } else {
        throw new ConflictException(
          'Não é possível sair desta Ameaça Global neste estado.',
        );
      }
    });

    return {
      ...this.formatStatus(
        result.event,
        null,
        now,
        null,
        result.leftDuringBattle
          ? 'Você abandonou a batalha. Esta participação não receberá recompensas.'
          : 'Você saiu do lobby da Ameaça Global.',
      ),
      eligible: this.getEligibility(character, result.event),
    };
  }

  async getRanking(userId: string, eventId: string) {
    await this.ensureUserCanSeeEvent(userId, eventId);
    const participants = await this.prisma.worldBossParticipant.findMany({
      where: { eventId },
      orderBy: [{ damageDealt: 'desc' }, { joinedAt: 'asc' }],
      take: 50,
      include: { character: { select: { id: true, name: true, level: true } } },
    });
    return {
      participants: participants.map((p, index) => ({
        rank: p.rank ?? index + 1,
        character: p.character,
        damageDealt: p.damageDealt,
        contributionPercent: p.contributionPercent,
        eligibleForReward: p.eligibleForReward,
      })),
    };
  }

  async getEventStatus(userId: string, characterId: string, eventId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const event = await this.prisma.worldBossEvent.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });

    if (!event) throw new NotFoundException('Ameaça Global não encontrada.');
    if (event.mapId !== character.mapId)
      throw new ForbiddenException('Personagem não está no mapa desta ameaça.');

    const advancedEvent = await this.advanceEventState(event);
    const activityState = await this.activityGuard.getCharacterActivityState({
      characterId,
      userId,
    });
    const participant = await this.prisma.worldBossParticipant.findUnique({
      where: {
        eventId_characterId: {
          eventId,
          characterId,
        },
      },
      include: { rewards: { include: { item: true } } },
    });
    const activeParticipant = participant?.leftAt ? null : participant;

    if (
      activeParticipant &&
      (advancedEvent.status === WorldBossEventStatus.ACTIVE ||
        advancedEvent.status === WorldBossEventStatus.DEFEATED ||
        advancedEvent.status === WorldBossEventStatus.EXPIRED)
    ) {
      const resolved = await this.resolveEventAndContribution({
        userId,
        characterId,
        eventId,
        emitDamage: true,
      });

      return {
        ...this.formatStatus(
          resolved.event,
          resolved.participant,
          new Date(),
          resolved.rewards,
        ),
        eligible: this.getEligibility(
          character,
          resolved.event,
          activityState.activeWorldBossParticipation,
        ),
      };
    }

    return {
      ...this.formatStatus(advancedEvent, activeParticipant, new Date()),
      eligible: this.getEligibility(
        character,
        advancedEvent,
        activityState.activeWorldBossParticipation,
      ),
    };
  }

  private async findCanonicalBossesForMap(character: any) {
    const mapTier = character.map?.tier;
    const bosses = await this.prisma.worldBoss.findMany({
      where: {
        mapId: character.mapId,
        tier: mapTier,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { minLevel: 'asc' }],
      include: worldBossInclude,
    });

    const bySlot = new Map<number, any>();
    for (const boss of bosses) {
      const slot = this.getBossSlotIndex(boss);
      if ((slot === 0 || slot === 1) && !bySlot.has(slot)) {
        bySlot.set(slot, boss);
      }
    }

    const selected = [bySlot.get(0), bySlot.get(1)].filter(Boolean);
    if (selected.length < 2) {
      for (const boss of bosses) {
        if (selected.some((item) => item.id === boss.id)) continue;
        selected.push(boss);
        if (selected.length === 2) break;
      }
    }

    return selected
      .sort((a, b) => this.getBossLevel(a) - this.getBossLevel(b))
      .slice(0, 2);
  }

  private async ensureDisplayEventForBoss(boss: any, now: Date) {
    let event = await this.prisma.worldBossEvent.findFirst({
      where: {
        worldBossId: boss.id,
        mapId: boss.mapId,
        tier: boss.tier,
        status: { in: WORLD_BOSS_OPEN_STATUSES },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: eventInclude,
    });

    if (event) event = await this.advanceEventState(event);

    event ??= await this.prisma.worldBossEvent.findFirst({
      where: {
        worldBossId: boss.id,
        mapId: boss.mapId,
        tier: boss.tier,
        status: { in: WORLD_BOSS_VISIBLE_STATUSES },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: eventInclude,
    });

    if (event) event = await this.advanceEventState(event);

    if (!event) {
      event = await this.createWorldBossEventForBoss(boss, now);
    } else if (WORLD_BOSS_TERMINAL_STATUSES.includes(event.status)) {
      event = await this.ensureNextCycleEvent(event, boss, now);
    }

    if (this.testUnlockEnabled) {
      event = await this.ensureEventAvailableForTest(event);
    } else {
      event = await this.advanceEventState(event);
    }

    if (!event) throw new NotFoundException('Ameaça Global não encontrada.');

    await this.cancelDuplicateOpenEvents(boss.id, event.id);
    return event;
  }

  private async createWorldBossEventForBoss(
    boss: any,
    now: Date,
    startsAt = new Date(
      now.getTime() + WORLD_BOSS_SCHEDULE_CONFIG.initialLobbyLeadSeconds * 1000,
    ),
  ) {
    const status =
      startsAt.getTime() <= now.getTime()
        ? WorldBossEventStatus.LOBBY_OPEN
        : WorldBossEventStatus.SCHEDULED;
    return this.prisma.worldBossEvent.create({
      data: {
        worldBossId: boss.id,
        mapId: boss.mapId,
        tier: boss.tier,
        status,
        startsAt,
        endsAt: new Date(startsAt.getTime() + boss.durationSeconds * 1000),
        maxHp: boss.baseHp,
        currentHp: boss.baseHp,
      },
      include: eventInclude,
    });
  }

  private async ensureNextCycleEvent(event: any, boss: any, now: Date) {
    if (!WORLD_BOSS_TERMINAL_STATUSES.includes(event.status)) return event;

    const existingNextEvent = await this.prisma.worldBossEvent.findFirst({
      where: {
        worldBossId: event.worldBossId,
        id: { not: event.id },
        status: { in: WORLD_BOSS_OPEN_STATUSES },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: eventInclude,
    });

    if (existingNextEvent) return existingNextEvent;

    const closedAt = event.defeatedAt ?? event.endsAt;
    const nextStartsAt = new Date(
      closedAt.getTime() + this.getBossRespawnIntervalSeconds(boss) * 1000,
    );

    return this.createWorldBossEventForBoss(boss, now, nextStartsAt);
  }

  private async ensureEventAvailableForTest(event: any) {
    if (this.isAlwaysOpenTestBoss(event.worldBoss)) {
      return this.ensureAlwaysOpenTestEvent(event);
    }

    return this.advanceEventState(event);
  }

  private async ensureAlwaysOpenTestEvent(event: any) {
    const now = new Date();

    if (event.status === WorldBossEventStatus.ACTIVE) {
      return this.advanceEventState(event);
    }

    if (event.status === WorldBossEventStatus.LOBBY_OPEN) {
      return event;
    }

    return this.prisma.worldBossEvent.update({
      where: { id: event.id },
      data: {
        status: WorldBossEventStatus.LOBBY_OPEN,
        startsAt: now,
        endsAt: new Date(
          now.getTime() + event.worldBoss.durationSeconds * 1000,
        ),
        maxHp: event.worldBoss.baseHp,
        currentHp: event.worldBoss.baseHp,
        totalDamage: 0,
        participantCount: 0,
        hpLockedAt: null,
        defeatedAt: null,
        rewardedAt: null,
      },
      include: eventInclude,
    });
  }

  private async cancelDuplicateOpenEvents(
    worldBossId: string,
    keepEventId: string,
  ) {
    await this.prisma.worldBossEvent.updateMany({
      where: {
        worldBossId,
        id: { not: keepEventId },
        status: { in: WORLD_BOSS_OPEN_STATUSES },
      },
      data: { status: WorldBossEventStatus.CANCELLED },
    });
  }

  private getBossSlotIndex(boss: any) {
    const sortSlot = Number(boss.sortOrder) % 10;
    if (sortSlot === 0 || sortSlot === 1) return sortSlot;

    const tier = Math.max(1, Number(boss.tier) || 1);
    return Number(boss.minLevel) >= tier * 10 ? 1 : 0;
  }

  private getBossLevel(boss: any) {
    const tier = Math.max(1, Number(boss.tier) || 1);
    return this.getBossSlotIndex(boss) === 0 ? tier * 10 - 5 : tier * 10;
  }

  private getBossRespawnIntervalSeconds(boss: any) {
    return getWorldBossRespawnSeconds(this.getBossSlotIndex(boss));
  }

  private isAlwaysOpenTestBoss(boss: any) {
    return Boolean(
      this.testUnlockEnabled &&
      Number(boss?.tier) === WORLD_BOSS_ALWAYS_OPEN_TEST_TIER &&
      this.getBossSlotIndex(boss) === WORLD_BOSS_ALWAYS_OPEN_TEST_SLOT,
    );
  }

  private getEntryWindowEndsAt(event: any) {
    if (
      event.status === WorldBossEventStatus.LOBBY_OPEN &&
      this.isAlwaysOpenTestBoss(event.worldBoss)
    ) {
      return new Date(
        Date.now() + WORLD_BOSS_ALWAYS_OPEN_TEST_WINDOW_SECONDS * 1000,
      );
    }

    return new Date(
      event.startsAt.getTime() +
        WORLD_BOSS_SCHEDULE_CONFIG.entryWindowSeconds * 1000,
    );
  }

  private countActiveParticipants(eventId: string) {
    return this.prisma.worldBossParticipant.count({
      where: { eventId, leftAt: null },
    });
  }

  private async resolveEventAndContribution(params: {
    userId: string;
    characterId: string;
    eventId: string;
    emitDamage?: boolean;
  }) {
    const now = new Date();
    return this.prisma.$transaction(
      async (tx) => {
        let event = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: params.eventId },
          include: eventInclude,
        });
        let rewards: any[] | null = null;

        if (event.status === WorldBossEventStatus.ACTIVE) {
          const participant = await tx.worldBossParticipant.findUnique({
            where: {
              eventId_characterId: {
                eventId: params.eventId,
                characterId: params.characterId,
              },
            },
          });

          if (
            participant &&
            !participant.leftAt &&
            event.currentHp > 0 &&
            event.endsAt.getTime() > now.getTime()
          ) {
            const contributionFrom = new Date(
              Math.max(
                participant.lastContributionAt.getTime(),
                event.startsAt.getTime(),
              ),
            );
            const damage = await this.calculateElapsedDamage(
              tx,
              params.characterId,
              event.worldBoss,
              contributionFrom,
              now,
            );
            if (damage > 0) {
              const nextHp = Math.max(0, event.currentHp - damage);
              await tx.worldBossParticipant.update({
                where: { id: participant.id },
                data: {
                  damageDealt: { increment: damage },
                  activeSeconds: {
                    increment: Math.max(
                      0,
                      Math.floor(
                        (now.getTime() - contributionFrom.getTime()) / 1000,
                      ),
                    ),
                  },
                  lastContributionAt: now,
                },
              });
              await tx.worldBossEvent.update({
                where: { id: event.id },
                data: {
                  currentHp: nextHp,
                  totalDamage: { increment: damage },
                  ...(nextHp <= 0
                    ? { status: WorldBossEventStatus.DEFEATED, defeatedAt: now }
                    : {}),
                },
              });
            } else {
              await tx.worldBossParticipant.update({
                where: { id: participant.id },
                data: { lastContributionAt: now },
              });
            }
          }

          if (event.endsAt.getTime() <= now.getTime() && event.currentHp > 0) {
            await tx.worldBossEvent.update({
              where: { id: event.id },
              data: { status: WorldBossEventStatus.EXPIRED },
            });
          }
        }

        await this.refreshContributions(tx, params.eventId);
        event = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: params.eventId },
          include: eventInclude,
        });
        let participant = await tx.worldBossParticipant.findUnique({
          where: {
            eventId_characterId: {
              eventId: params.eventId,
              characterId: params.characterId,
            },
          },
          include: { rewards: { include: { item: true } } },
        });
        if (participant?.leftAt) participant = null;

        if (
          participant &&
          (event.status === WorldBossEventStatus.DEFEATED ||
            event.status === WorldBossEventStatus.EXPIRED) &&
          !participant.rewardGranted
        ) {
          const settledRewards = await this.settlePendingRewardsInTransaction(
            tx,
            event,
            now,
            { characterId: params.characterId },
          );
          rewards = settledRewards.get(params.characterId) ?? null;
          participant = await tx.worldBossParticipant.findUnique({
            where: {
              eventId_characterId: {
                eventId: params.eventId,
                characterId: params.characterId,
              },
            },
            include: { rewards: { include: { item: true } } },
          });
          if (participant?.leftAt) participant = null;
        }

        return { event, participant, rewards };
      },
      { timeout: 15_000 },
    );
  }

  private async calculateElapsedDamage(
    tx: Tx,
    characterId: string,
    boss: any,
    from: Date,
    to: Date,
  ) {
    const elapsedSeconds = Math.min(
      300,
      Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000)),
    );
    if (elapsedSeconds <= 0) return 0;

    const character = await tx.character.findUniqueOrThrow({
      where: { id: characterId },
      include: {
        class: true,
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        gatheringSkills: true,
      },
    });
    const items = character.equipment
      ? [
          character.equipment.mainHand,
          character.equipment.offHand,
          character.equipment.head,
          character.equipment.armor,
          character.equipment.pants,
          character.equipment.boots,
        ]
      : [];
    const gatheringBonus = calculateGatheringPrimaryBonus(
      character.gatheringSkills,
    );
    const stats = calculateFullStats(
      character.class,
      items,
      character.level,
      gatheringBonus,
    );
    const primary = stats.totalPrimaryStats;
    const derived = stats.derivedCombatStats;
    const powerScore =
      character.level * 12 +
      derived.attack * 2 +
      derived.speed +
      derived.defense +
      primary.technique +
      primary.willpower;
    const mitigation = Math.min(
      0.82,
      Math.max(
        0,
        boss.damageReduction +
          boss.defense / (boss.defense + powerScore * 8) +
          boss.resistance / 1000,
      ),
    );
    const damagePerMinute = Math.max(8, powerScore * 3.2 * (1 - mitigation));
    return Math.max(1, Math.floor((damagePerMinute / 60) * elapsedSeconds));
  }

  private async recalculateScaling(tx: Tx, eventId: string, now: Date) {
    const event = await tx.worldBossEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        worldBoss: true,
        participants: {
          where: { leftAt: null },
          include: {
            character: {
              include: {
                class: true,
                equipment: {
                  include: {
                    mainHand: true,
                    offHand: true,
                    head: true,
                    armor: true,
                    pants: true,
                    boots: true,
                  },
                },
                gatheringSkills: true,
              },
            },
          },
        },
      },
    });
    if (
      event.hpLockedAt ||
      event.startsAt.getTime() + event.worldBoss.scalingWindowSeconds * 1000 <
        now.getTime()
    ) {
      if (!event.hpLockedAt)
        await tx.worldBossEvent.update({
          where: { id: eventId },
          data: { hpLockedAt: now },
        });
      return;
    }
    const participantCount = Math.max(
      event.worldBoss.minParticipantsExpected,
      event.participants.length,
    );
    const powers = event.participants.map((p) => {
      const e = p.character.equipment;
      const items = e
        ? [e.mainHand, e.offHand, e.head, e.armor, e.pants, e.boots]
        : [];
      const gatheringBonus = calculateGatheringPrimaryBonus(
        p.character.gatheringSkills,
      );
      const stats = calculateFullStats(
        p.character.class,
        items,
        p.character.level,
        gatheringBonus,
      );
      return (
        p.character.level * 12 +
        stats.derivedCombatStats.attack * 2 +
        stats.derivedCombatStats.defense +
        stats.derivedCombatStats.speed
      );
    });
    const avgPower = powers.length
      ? powers.reduce((a, b) => a + b, 0) / powers.length
      : event.worldBoss.tier * 100;
    const participantHp =
      event.worldBoss.hpPerParticipant * Math.pow(participantCount, 0.72);
    const powerHp =
      avgPower *
      event.worldBoss.powerScalingFactor *
      Math.pow(participantCount, 0.55);
    const cap =
      event.worldBoss.maxHp ??
      Math.floor(event.worldBoss.baseHp * event.worldBoss.maxScalingCap);
    const scaled = Math.min(
      cap,
      Math.floor(
        (event.worldBoss.baseHp + participantHp + powerHp) *
          event.worldBoss.scalingFactor,
      ),
    );
    if (scaled > event.maxHp) {
      await tx.worldBossEvent.update({
        where: { id: eventId },
        data: { maxHp: scaled, currentHp: { increment: scaled - event.maxHp } },
      });
    }
  }

  private async recalculateParticipantCount(tx: Tx, eventId: string) {
    const count = await tx.worldBossParticipant.count({
      where: { eventId, leftAt: null },
    });
    await tx.worldBossEvent.update({
      where: { id: eventId },
      data: { participantCount: count },
    });
  }

  private async refreshContributions(tx: Tx, eventId: string) {
    const event = await tx.worldBossEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: { worldBoss: true },
    });
    const participants = await tx.worldBossParticipant.findMany({
      where: { eventId },
      orderBy: [{ damageDealt: 'desc' }, { joinedAt: 'asc' }],
    });
    const activeParticipantCount = participants.filter((p) => !p.leftAt).length;
    const totalDamage = participants.reduce(
      (total, p) => total + p.damageDealt,
      0,
    );
    for (const [index, participant] of participants.entries()) {
      const contributionPercent =
        totalDamage > 0 ? (participant.damageDealt / totalDamage) * 100 : 0;
      const eligibleForReward =
        participant.activeSeconds >= event.worldBoss.minParticipationSeconds ||
        participant.damageDealt >= event.worldBoss.minParticipationDamage;
      await tx.worldBossParticipant.update({
        where: { id: participant.id },
        data: { contributionPercent, eligibleForReward, rank: index + 1 },
      });
    }
    await tx.worldBossEvent.update({
      where: { id: eventId },
      data: { totalDamage, participantCount: activeParticipantCount },
    });
  }

  private async settleTerminalEventRewards(eventId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        let event = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: eventId },
          include: eventInclude,
        });
        if (
          event.status !== WorldBossEventStatus.DEFEATED &&
          event.status !== WorldBossEventStatus.EXPIRED
        ) {
          return event;
        }

        await this.refreshContributions(tx, eventId);
        event = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: eventId },
          include: eventInclude,
        });
        await this.settlePendingRewardsInTransaction(tx, event, new Date(), {
          take: 25,
        });

        return tx.worldBossEvent.findUniqueOrThrow({
          where: { id: eventId },
          include: eventInclude,
        });
      },
      { timeout: 30_000 },
    );
  }

  private async settlePendingRewardsInTransaction(
    tx: Tx,
    event: any,
    now: Date,
    options: { characterId?: string; take?: number } = {},
  ) {
    const pendingParticipants = await tx.worldBossParticipant.findMany({
      where: {
        eventId: event.id,
        ...(options.characterId ? { characterId: options.characterId } : {}),
        leftAt: null,
        rewardGranted: false,
      },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      ...(options.take ? { take: options.take } : {}),
      select: { id: true, characterId: true },
    });
    const rewardsByCharacter = new Map<string, any[]>();

    for (const participant of pendingParticipants) {
      const rewards = await this.grantReward(
        tx,
        event,
        participant.id,
        participant.characterId,
        now,
      );
      rewardsByCharacter.set(participant.characterId, rewards);
    }

    const remainingClaims = await tx.worldBossParticipant.count({
      where: {
        eventId: event.id,
        leftAt: null,
        rewardGranted: false,
      },
    });
    if (remainingClaims === 0 && !event.rewardedAt) {
      await tx.worldBossEvent.update({
        where: { id: event.id },
        data: { rewardedAt: now },
      });
    }

    return rewardsByCharacter;
  }

  private async grantReward(
    tx: Tx,
    event: any,
    participantId: string,
    characterId: string,
    now: Date,
  ) {
    const claim = await tx.worldBossParticipant.updateMany({
      where: {
        id: participantId,
        leftAt: null,
        rewardGranted: false,
      },
      data: { rewardGranted: true, rewardGrantedAt: now },
    });
    if (claim.count === 0) return [];

    const participant = await tx.worldBossParticipant.findUniqueOrThrow({
      where: { id: participantId },
    });

    const defeated = wasWorldBossDefeated(event);
    const progress =
      event.maxHp > 0 ? Math.min(1, event.totalDamage / event.maxHp) : 0;
    const collectiveMultiplier = getWorldBossCollectiveRewardMultiplier({
      defeated,
      progressRatio: progress,
    });
    const selectedRewards = selectWorldBossRewards({
      event,
      participant,
      rewards: event.worldBoss.rewards,
      collectiveMultiplier,
      nonDefeatedChanceMultiplier:
        WORLD_BOSS_REWARD_CONFIG.nonDefeatedChanceMultiplier,
      randomInt: (min, max) => this.randomInt(min, max),
    });
    const rewards: Array<
      Omit<SelectedWorldBossReward, 'itemId' | 'currency'> & {
        itemId: string | null | undefined;
        currency: SelectedWorldBossReward['currency'] | null;
        inventoryType: InventoryItemType;
      }
    > = [];
    for (const reward of selectedRewards) {
      const itemId = reward.randomPetCocoon
        ? await this.selectRandomPetCocoonItemId(tx, event.tier)
        : reward.itemId;
      rewards.push({
        ...reward,
        itemId,
        currency: reward.currency ?? null,
        inventoryType: this.getInventoryType(reward.rewardType),
      });
    }

    const xpReward = rewards
      .filter((r) => r.rewardType === WorldBossRewardType.XP)
      .reduce((t, r) => t + r.quantity, 0);
    const goldReward = rewards
      .filter((r) => r.rewardType === WorldBossRewardType.GOLD)
      .reduce((t, r) => t + r.quantity, 0);
    const character = await tx.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { level: true, xp: true },
    });
    const levelProgress = calculateLevelProgress(
      character.level,
      character.xp,
      xpReward,
    );
    await tx.character.update({
      where: { id: characterId },
      data: {
        level: levelProgress.newLevel,
        xp: levelProgress.totalXp,
        gold: { increment: goldReward },
      },
    });

    if (xpReward > 0) {
      await recordEconomyEntry(tx, {
        characterId,
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.XP,
        tier: event.tier,
        quantity: xpReward,
        reason: ECONOMY_REASONS.WORLD_BOSS_XP_REWARD,
        referenceType: 'WorldBossParticipant',
        referenceId: participantId,
        idempotencyKey: `world-boss:${participantId}:reward:xp`,
      });
    }
    if (goldReward > 0) {
      await recordEconomyEntry(tx, {
        characterId,
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.GOLD,
        tier: event.tier,
        quantity: goldReward,
        reason: ECONOMY_REASONS.WORLD_BOSS_GOLD_REWARD,
        referenceType: 'WorldBossParticipant',
        referenceId: participantId,
        idempotencyKey: `world-boss:${participantId}:reward:gold`,
      });
    }

    for (const reward of rewards) {
      const grantedReward = await tx.worldBossGrantedReward.create({
        data: {
          participantId,
          rewardType: reward.rewardType,
          itemId: reward.itemId,
          currency: reward.currency,
          quantity: reward.quantity,
          rarity: reward.rarity,
        },
      });
      if (reward.currency && reward.quantity > 0) {
        await this.economyService.creditWalletInTransaction(tx, {
          characterId,
          currency: reward.currency,
          tier: event.tier,
          quantity: reward.quantity,
          reason: ECONOMY_REASONS.WORLD_BOSS_FRAGMENT_REWARD,
          referenceType: 'WorldBossGrantedReward',
          referenceId: grantedReward.id,
          idempotencyKey: `world-boss-reward:${grantedReward.id}:currency`,
          metadata: { rewardType: reward.rewardType },
        });
      }
      if (reward.itemId && reward.quantity > 0) {
        await tx.inventoryItem.upsert({
          where: { characterId_itemId: { characterId, itemId: reward.itemId } },
          update: {
            quantity: { increment: reward.quantity },
            type: reward.inventoryType,
          },
          create: {
            characterId,
            itemId: reward.itemId,
            quantity: reward.quantity,
            type: reward.inventoryType,
          },
        });

        await recordEconomyEntry(tx, {
          characterId,
          direction: EconomyDirection.CREDIT,
          resourceType: EconomyResourceType.ITEM,
          itemId: reward.itemId,
          tier: event.tier,
          quantity: reward.quantity,
          reason: ECONOMY_REASONS.WORLD_BOSS_ITEM_REWARD,
          referenceType: 'WorldBossGrantedReward',
          referenceId: grantedReward.id,
          idempotencyKey: `world-boss-reward:${grantedReward.id}:item`,
          metadata: { rewardType: reward.rewardType },
        });
      }
    }

    return rewards;
  }

  private async selectRandomPetCocoonItemId(tx: Tx, tier: number) {
    const candidates = await tx.petDefinition.findMany({
      where: { tier, isActive: true },
      select: { cocoonItemId: true, specialization: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return selectRandomPetCocoonCandidate(candidates, (min, max) =>
      this.randomInt(min, max),
    ).cocoonItemId;
  }

  private async findActiveEventForCharacter(character: any) {
    if (!character.mapId) return null;
    const now = new Date();
    const joinedEvent = await this.prisma.worldBossParticipant.findFirst({
      where: {
        characterId: character.id,
        leftAt: null,
        event: {
          mapId: character.mapId,
          status: { in: WORLD_BOSS_OPEN_STATUSES },
        },
      },
      orderBy: { joinedAt: 'desc' },
      select: { eventId: true },
    });

    if (joinedEvent) {
      const event = await this.prisma.worldBossEvent.findUnique({
        where: { id: joinedEvent.eventId },
        include: eventInclude,
      });
      if (event) return this.advanceEventState(event);
    }

    const bosses = await this.findCanonicalBossesForMap(character);
    const events = await Promise.all(
      bosses.map((boss) => this.ensureDisplayEventForBoss(boss, now)),
    );

    return events[0] ?? null;
  }

  private async findRecentRewardStatus(
    characterId: string,
    mapId: string,
    now: Date,
  ) {
    const participant = await this.prisma.worldBossParticipant.findFirst({
      where: {
        characterId,
        leftAt: null,
        rewardGranted: true,
        rewardGrantedAt: {
          gte: new Date(now.getTime() - WORLD_BOSS_REWARD_RECEIPT_RETENTION_MS),
        },
        event: {
          mapId,
          status: {
            in: [WorldBossEventStatus.DEFEATED, WorldBossEventStatus.EXPIRED],
          },
        },
      },
      orderBy: { rewardGrantedAt: 'desc' },
      include: {
        rewards: { include: { item: true } },
        event: { include: eventInclude },
      },
    });
    if (!participant) return null;

    return this.formatStatus(
      participant.event,
      participant,
      now,
      participant.rewards,
      participant.event.status === WorldBossEventStatus.DEFEATED
        ? 'A Ameaça Global foi derrotada e suas recompensas foram entregues.'
        : 'A Ameaça Global terminou e sua participação foi liquidada.',
    );
  }

  private async advanceEventState(event: any) {
    const now = new Date();
    let nextStatus = event.status as WorldBossEventStatus;
    const data: Prisma.WorldBossEventUpdateInput = { status: nextStatus };
    const startsAtMs = event.startsAt.getTime();
    const entryWindowEndsAt = this.getEntryWindowEndsAt(event);

    if (
      event.status === WorldBossEventStatus.LOBBY_OPEN &&
      startsAtMs > now.getTime()
    ) {
      nextStatus = WorldBossEventStatus.SCHEDULED;
    }

    if (
      event.status === WorldBossEventStatus.SCHEDULED &&
      startsAtMs <= now.getTime()
    ) {
      const participantCount = await this.countActiveParticipants(event.id);
      nextStatus =
        participantCount > 0
          ? WorldBossEventStatus.ACTIVE
          : WorldBossEventStatus.LOBBY_OPEN;
    }

    if (
      nextStatus === WorldBossEventStatus.LOBBY_OPEN &&
      startsAtMs <= now.getTime()
    ) {
      const participantCount = await this.countActiveParticipants(event.id);

      if (participantCount > 0) {
        nextStatus = WorldBossEventStatus.ACTIVE;
        data.startsAt = now;
        data.endsAt = new Date(
          now.getTime() + event.worldBoss.durationSeconds * 1000,
        );
      } else if (entryWindowEndsAt.getTime() <= now.getTime()) {
        nextStatus = WorldBossEventStatus.EXPIRED;
        data.endsAt = entryWindowEndsAt;
      }
    }

    if (
      event.status === WorldBossEventStatus.ACTIVE &&
      event.endsAt.getTime() <= now.getTime() &&
      event.currentHp > 0
    ) {
      nextStatus = WorldBossEventStatus.EXPIRED;
    }

    data.status = nextStatus;
    if (
      nextStatus === WorldBossEventStatus.ACTIVE &&
      event.status !== WorldBossEventStatus.ACTIVE &&
      !event.hpLockedAt
    ) {
      data.hpLockedAt = now;
    }

    if (
      nextStatus === event.status &&
      data.startsAt === undefined &&
      data.endsAt === undefined &&
      data.hpLockedAt === undefined
    )
      return event;

    return this.prisma.worldBossEvent.update({
      where: { id: event.id },
      data,
      include: eventInclude,
    });
  }

  private async getCharacterOrThrow(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      include: { map: true, class: true },
    });
    if (!character) throw new NotFoundException('Personagem não encontrado.');
    if (character.status !== CharacterStatus.ACTIVE)
      throw new BadRequestException(
        'Apenas personagens ativos podem participar de Ameaças Globais.',
      );
    return character;
  }

  private ensureEventJoinable(event: any) {
    const now = new Date();

    if (event.status === WorldBossEventStatus.SCHEDULED) return;

    if (event.status === WorldBossEventStatus.LOBBY_OPEN) {
      if (this.getEntryWindowEndsAt(event).getTime() > now.getTime()) return;

      throw new ConflictException(
        'A janela de entrada desta Ameaça Global foi encerrada.',
      );
    }

    throw new ConflictException(
      event.status === WorldBossEventStatus.ACTIVE
        ? 'A batalha já começou. A entrada desta Ameaça Global foi encerrada.'
        : 'Esta Ameaça Global está encerrada. Aguarde a próxima aparição.',
    );
  }

  private ensureEligible(character: any, boss: any) {
    if (!character.mapId || character.mapId !== boss.mapId)
      throw new ForbiddenException(
        'Personagem precisa estar no mapa da Ameaça Global.',
      );
    if (this.testUnlockEnabled) return;

    if (character.level < boss.minLevel)
      throw new ForbiddenException(
        `Nível mínimo ${boss.minLevel} necessário para participar desta Ameaça Global.`,
      );
  }

  private getEligibility(
    character: any,
    event: any | null,
    activeWorldBossParticipation?: any | null,
  ) {
    if (!event) return { canJoin: false, reason: 'Nenhuma ameaça ativa.' };
    const activeWorldBossEventId =
      activeWorldBossParticipation?.event?.id ?? null;
    if (activeWorldBossEventId && activeWorldBossEventId !== event.id) {
      return {
        canJoin: false,
        reason:
          'Você já está aguardando outro World Boss. Saia do lobby atual antes de entrar em outro.',
      };
    }
    const boss = event.worldBoss;
    const now = new Date();
    const visibleBossMapId = boss.mapId ?? boss.map?.id;
    if (!character.mapId || character.mapId !== visibleBossMapId)
      return {
        canJoin: false,
        reason: 'Personagem não está no mapa desta ameaça.',
      };
    if (event.status === WorldBossEventStatus.ACTIVE)
      return {
        canJoin: false,
        reason: 'Em andamento — entrada bloqueada.',
      };
    if (WORLD_BOSS_TERMINAL_STATUSES.includes(event.status))
      return {
        canJoin: false,
        reason: 'Evento encerrado. Aguarde a próxima aparição.',
      };
    if (
      event.status === WorldBossEventStatus.LOBBY_OPEN &&
      this.getEntryWindowEndsAt(event).getTime() <= now.getTime()
    )
      return {
        canJoin: false,
        reason: 'Janela de entrada encerrada.',
      };
    if (this.testUnlockEnabled) {
      return { canJoin: true, reason: 'Liberado para teste.' };
    }

    if (
      event.status !== WorldBossEventStatus.SCHEDULED &&
      event.status !== WorldBossEventStatus.LOBBY_OPEN
    )
      return {
        canJoin: false,
        reason: 'Aguardando próxima janela de entrada.',
      };
    const bossMapId = boss.mapId ?? boss.map?.id;
    if (!character.mapId || character.mapId !== bossMapId)
      return {
        canJoin: false,
        reason: 'Personagem não está no mapa desta ameaça.',
      };
    if (character.level < boss.minLevel)
      return { canJoin: false, reason: `Nível mínimo ${boss.minLevel}.` };
    return { canJoin: true, reason: null };
  }

  private async ensureUserCanSeeEvent(userId: string, eventId: string) {
    const event = await this.prisma.worldBossEvent.findUnique({
      where: { id: eventId },
      select: { mapId: true },
    });
    if (!event) throw new NotFoundException('Ameaça Global não encontrada.');
    const character = await this.prisma.character.findFirst({
      where: { userId, mapId: event.mapId, deletedAt: null },
      select: { id: true },
    });
    if (!character)
      throw new ForbiddenException('Você não possui personagem neste mapa.');
  }

  private formatStatus(
    event: any,
    participant: any | null,
    now: Date,
    rewards?: any[] | null,
    message?: string,
  ) {
    const remainingSeconds = Math.max(
      0,
      Math.floor((event.endsAt.getTime() - now.getTime()) / 1000),
    );
    const remainingSecondsToStart = Math.max(
      0,
      Math.floor((event.startsAt.getTime() - now.getTime()) / 1000),
    );
    const entryWindowEndsAt = this.getEntryWindowEndsAt(event);
    const remainingSecondsToEntryClose = Math.max(
      0,
      Math.floor((entryWindowEndsAt.getTime() - now.getTime()) / 1000),
    );
    const hpPercent =
      event.maxHp > 0
        ? Math.max(0, Math.min(100, (event.currentHp / event.maxHp) * 100))
        : 0;
    const respawnIntervalSeconds = this.getBossRespawnIntervalSeconds(
      event.worldBoss,
    );
    const closedAt = event.defeatedAt ?? event.endsAt;
    const nextRespawnSeconds = WORLD_BOSS_TERMINAL_STATUSES.includes(
      event.status,
    )
      ? Math.max(
          0,
          Math.floor(
            (closedAt.getTime() +
              respawnIntervalSeconds * 1000 -
              now.getTime()) /
              1000,
          ),
        )
      : respawnIntervalSeconds;
    return {
      message,
      serverNow: now,
      event: {
        id: event.id,
        updatedAt: event.updatedAt,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        remainingSeconds,
        remainingSecondsToStart,
        remainingSecondsToEnd: remainingSeconds,
        remainingSecondsToEntryClose,
        entryWindowEndsAt,
        nextRespawnSeconds,
        respawnIntervalSeconds,
        currentHp: event.currentHp,
        maxHp: event.maxHp,
        hpPercent,
        progressPercent: 100 - hpPercent,
        totalDamage: event.totalDamage,
        participantCount: event.participantCount,
        lobbyCount: event.participantCount,
        defeatedAt: event.defeatedAt,
        rewardedAt: event.rewardedAt,
        worldBoss: this.formatBoss(event.worldBoss),
      },
      participant: participant ? this.formatParticipant(participant) : null,
      rewardsGranted: rewards,
    };
  }

  private formatBoss(boss: any) {
    return {
      id: boss.id,
      name: boss.name,
      slug: boss.slug,
      description: boss.description,
      tier: boss.tier,
      bossLevel: this.getBossLevel(boss),
      minLevel: boss.minLevel,
      maxLevel: boss.maxLevel,
      respawnIntervalSeconds: this.getBossRespawnIntervalSeconds(boss),
      durationSeconds: boss.durationSeconds,
      difficulty: boss.difficulty,
      riskLevel: boss.riskLevel,
      attackPower: boss.attackPower,
      defense: boss.defense,
      resistance: boss.resistance,
      mutationLevel: boss.mutationLevel,
      imageUrl: boss.imageUrl,
      assetKey: boss.assetKey,
      map: boss.map,
      rewards:
        boss.rewards?.map((reward: any) => ({
          id: reward.id,
          rewardType: reward.rewardType,
          currency: reward.currency,
          item: reward.item,
          minQuantity: reward.minQuantity,
          maxQuantity: reward.maxQuantity,
          chance: reward.chance,
          guaranteed: reward.guaranteed,
          onlyIfDefeated: reward.onlyIfDefeated,
          requiresMinParticipation: reward.requiresMinParticipation,
          minContributionPercent: reward.minContributionPercent,
          rarity: reward.rarity,
        })) ?? [],
    };
  }

  private formatParticipant(participant: any) {
    return {
      id: participant.id,
      damageDealt: participant.damageDealt,
      contributionPercent: participant.contributionPercent,
      joinedAt: participant.joinedAt,
      lastContributionAt: participant.lastContributionAt,
      activeSeconds: participant.activeSeconds,
      rewardGranted: participant.rewardGranted,
      rewardGrantedAt: participant.rewardGrantedAt,
      rank: participant.rank,
      eligibleForReward: participant.eligibleForReward,
      rewards: participant.rewards ?? [],
    };
  }

  private formatCharacter(character: any) {
    return {
      id: character.id,
      name: character.name,
      level: character.level,
      map: character.map,
    };
  }
  private randomInt(min: number, max: number) {
    return (
      Math.floor(
        Math.random() * (Math.max(min, max) - Math.min(min, max) + 1),
      ) + Math.min(min, max)
    );
  }
  private getInventoryType(type: WorldBossRewardType) {
    return type === WorldBossRewardType.CONSUMABLE
      ? InventoryItemType.CONSUMABLE
      : type === WorldBossRewardType.EQUIPMENT
        ? InventoryItemType.EQUIPMENT
        : InventoryItemType.MATERIAL;
  }
}
