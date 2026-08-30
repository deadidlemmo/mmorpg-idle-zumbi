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
  ActivityStatus,
  AutoCombatHuntBatchStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  IncursionSessionStatus,
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
import { AutoCombatService } from '../auto-combat/auto-combat.service';
import { CraftingService } from '../crafting/crafting.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { EconomyService } from '../economy/economy.service';
import { GatheringService } from '../gathering/gathering.service';
import { IncursionsService } from '../incursions/incursions.service';
import { JoinWorldBossDto } from './dto/join-world-boss.dto';
import { LeaveWorldBossDto } from './dto/leave-world-boss.dto';
import {
  selectRandomPetCocoonCandidate,
  selectWorldBossRewards,
  type SelectedWorldBossReward,
  wasWorldBossDefeated,
} from './world-boss-rewards';
import { isWorldBossTestUnlockEnabled } from './world-boss-test-unlock.util';
import {
  calculateWorldBossDamageTick,
  calculateWorldBossHpFromTtk,
  createWorldBossParticipantSnapshot,
  getWorldBossTargetTtkSeconds,
  WORLD_BOSS_TTK_BALANCE_VERSION,
} from './world-boss-ttk.util';

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
const WORLD_BOSS_DAMAGE_PERSIST_INTERVAL_MS = 5_000;
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
    private readonly autoCombatService: AutoCombatService,
    private readonly gatheringService: GatheringService,
    private readonly craftingService: CraftingService,
    private readonly incursionsService: IncursionsService,
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

  async getRegistrations(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const registrations = await this.prisma.worldBossParticipant.findMany({
      where: {
        characterId,
        leftAt: null,
        event: {
          status: {
            in: [
              WorldBossEventStatus.SCHEDULED,
              WorldBossEventStatus.LOBBY_OPEN,
            ],
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
      include: {
        rewards: { include: { item: true } },
        event: { include: eventInclude },
      },
    });
    const activityState = await this.activityGuard.getCharacterActivityState({
      characterId,
      userId,
    });
    const events: any[] = [];

    for (const registration of registrations) {
      const event = await this.advanceEventState(registration.event);
      const currentParticipant =
        await this.prisma.worldBossParticipant.findUnique({
          where: {
            eventId_characterId: {
              eventId: event.id,
              characterId,
            },
          },
          include: { rewards: { include: { item: true } } },
        });
      if (!currentParticipant || currentParticipant.leftAt) continue;

      events.push({
        ...this.formatStatus(
          event,
          currentParticipant,
          new Date(),
          currentParticipant.rewards,
        ),
        eligible: this.getEligibility(
          character,
          event,
          activityState.activeWorldBossParticipation,
        ),
      });
    }

    return { events };
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
            },
            {
              status: {
                in: [
                  WorldBossEventStatus.DEFEATED,
                  WorldBossEventStatus.EXPIRED,
                ],
              },
              participants: {
                some: {
                  leftAt: null,
                  confirmedAt: { not: null },
                  rewardGranted: false,
                },
              },
            },
          ],
        },
        take: 50,
        include: eventInclude,
      });

      for (const event of events) {
        let nextEvent =
          event.status === WorldBossEventStatus.ACTIVE
            ? await this.processActiveEvent(event.id, now)
            : await this.advanceEventState(event);
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

    this.ensureEventRegistrable(availableEvent);
    this.ensureRegistrationEligible(character, availableEvent.worldBoss);

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockWorldBossEvent(tx, dto.eventId);
      const lockedEvent = await tx.worldBossEvent.findUniqueOrThrow({
        where: { id: dto.eventId },
        include: eventInclude,
      });
      this.ensureEventRegistrable(lockedEvent);

      const existingParticipant = await tx.worldBossParticipant.findUnique({
        where: {
          eventId_characterId: {
            eventId: dto.eventId,
            characterId: dto.characterId,
          },
        },
      });

      if (existingParticipant && !existingParticipant.leftAt) {
        const updatedEvent = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: dto.eventId },
          include: eventInclude,
        });
        return {
          event: updatedEvent,
          participant: existingParticipant,
          alreadyRegistered: true,
        };
      }

      const participant = existingParticipant
        ? await tx.worldBossParticipant.update({
            where: { id: existingParticipant.id },
            data: {
              joinedAt: now,
              confirmedAt: null,
              leftAt: null,
              lastContributionAt: now,
              damageDealt: 0,
              contributionPercent: 0,
              activeSeconds: 0,
              rewardGranted: false,
              rewardGrantedAt: null,
              eligibleForReward: false,
              rank: null,
            },
          })
        : await tx.worldBossParticipant.create({
            data: {
              eventId: dto.eventId,
              characterId: dto.characterId,
              joinedAt: now,
              lastContributionAt: now,
            },
          });

      await this.recalculateParticipantCount(tx, dto.eventId);

      const updatedEvent = await tx.worldBossEvent.findUniqueOrThrow({
        where: { id: dto.eventId },
        include: eventInclude,
      });
      return { event: updatedEvent, participant, alreadyRegistered: false };
    });

    return {
      ...this.formatStatus(
        result.event,
        result.participant,
        now,
        null,
        result.alreadyRegistered
          ? 'Sua inscrição já estava ativa. A atividade atual só será encerrada quando a batalha começar. Criações e incursões interrompidas não recuperam materiais ou custos.'
          : 'Inscrição confirmada. Sua atividade continuará normalmente, será encerrada quando a batalha começar e precisará ser reiniciada depois do boss. Criações e incursões interrompidas não recuperam materiais ou custos.',
      ),
      eligible: this.getEligibility(character, result.event),
    };
  }

  async confirm(userId: string, dto: JoinWorldBossDto) {
    return this.join(userId, dto);
  }

  async leave(userId: string, dto: LeaveWorldBossDto) {
    const character = await this.getCharacterOrThrow(userId, dto.characterId);
    const event = await this.prisma.worldBossEvent.findUnique({
      where: { id: dto.eventId },
      include: eventInclude,
    });

    if (!event) throw new NotFoundException('Ameaça Global não encontrada.');

    const advancedEvent = await this.advanceEventState(event);
    if (advancedEvent.status === WorldBossEventStatus.ACTIVE) {
      await this.processActiveEvent(dto.eventId, new Date(), true);
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockWorldBossEvent(tx, dto.eventId);
      const event = await tx.worldBossEvent.findUniqueOrThrow({
        where: { id: dto.eventId },
        include: eventInclude,
      });
      const participant = await tx.worldBossParticipant.findUnique({
        where: {
          eventId_characterId: {
            eventId: dto.eventId,
            characterId: dto.characterId,
          },
        },
      });

      if (!participant || participant.leftAt) {
        if (
          event.status === WorldBossEventStatus.SCHEDULED ||
          event.status === WorldBossEventStatus.LOBBY_OPEN
        ) {
          return {
            event,
            leftDuringBattle: false,
            wasConfirmed: false,
            alreadyLeft: true,
          };
        }
        throw new NotFoundException('Participação não encontrada.');
      }

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
        return {
          event: updatedEvent,
          leftDuringBattle: false,
          wasConfirmed: Boolean(participant.confirmedAt),
          alreadyLeft: false,
        };
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
          where: {
            eventId: dto.eventId,
            leftAt: null,
            confirmedAt: { not: null },
          },
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

          return {
            event: nextEvent,
            leftDuringBattle: true,
            wasConfirmed: true,
            alreadyLeft: false,
          };
        }

        const updatedEvent = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: dto.eventId },
          include: eventInclude,
        });
        return {
          event: updatedEvent,
          leftDuringBattle: true,
          wasConfirmed: true,
          alreadyLeft: false,
        };
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
          : result.alreadyLeft
            ? 'A inscrição já estava cancelada.'
            : 'Inscrição cancelada.',
      ),
      eligible: this.getEligibility(character, result.event),
    };
  }

  async getRanking(userId: string, eventId: string) {
    await this.ensureUserCanSeeEvent(userId, eventId);
    const participants = await this.prisma.worldBossParticipant.findMany({
      where: { eventId, confirmedAt: { not: null } },
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
        endsAt: new Date(
          startsAt.getTime() +
            (WORLD_BOSS_SCHEDULE_CONFIG.entryWindowSeconds +
              boss.durationSeconds) *
              1000,
        ),
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
        registrationCount: 0,
        targetTtkSeconds: null,
        aggregateDamagePerSecond: 0,
        aggregateScalingDamagePerSecond: 0,
        damageProcessedAt: null,
        scalingVersion: 1,
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

  private countRegisteredParticipants(eventId: string) {
    return this.prisma.worldBossParticipant.count({
      where: {
        eventId,
        leftAt: null,
      },
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

        if (
          event.status === WorldBossEventStatus.DEFEATED ||
          event.status === WorldBossEventStatus.EXPIRED
        ) {
          await this.refreshContributions(tx, params.eventId);
        }
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

  private async lockWorldBossEvent(tx: Tx, eventId: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "world_boss_events" WHERE "id" = ${eventId} FOR UPDATE`,
    );
  }

  private async snapshotActiveParticipants(
    tx: Tx,
    event: any,
    snapshotAt: Date,
  ) {
    const participants = await tx.worldBossParticipant.findMany({
      where: {
        eventId: event.id,
        leftAt: null,
        confirmedAt: { not: null },
      },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
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
    });
    const snapshots: Array<{
      id: string;
      damagePerSecond: number;
      scalingDamagePerSecond: number;
    }> = [];

    for (const participant of participants) {
      const equipment = participant.character.equipment;
      const items = equipment
        ? [
            equipment.mainHand,
            equipment.offHand,
            equipment.head,
            equipment.armor,
            equipment.pants,
            equipment.boots,
          ]
        : [];
      const gatheringBonus = calculateGatheringPrimaryBonus(
        participant.character.gatheringSkills,
      );
      const stats = calculateFullStats(
        participant.character.class,
        items,
        participant.character.level,
        gatheringBonus,
      );
      const snapshot = createWorldBossParticipantSnapshot({
        bossTier: event.worldBoss.tier,
        bossLevel: this.getBossLevel(event.worldBoss),
        characterLevel: participant.character.level,
        equipmentProgression: stats.equipmentProgression,
        equippedPieceCount: items.filter(Boolean).length,
        primaryStats: stats.totalPrimaryStats,
        derivedStats: stats.derivedCombatStats,
        boss: event.worldBoss,
      });

      await tx.worldBossParticipant.update({
        where: { id: participant.id },
        data: {
          powerScoreSnapshot: snapshot.powerScore,
          damagePerSecondSnapshot: snapshot.damagePerSecond,
          scalingDamagePerSecondSnapshot: snapshot.scalingDamagePerSecond,
          readinessSnapshot: snapshot.readinessRatio,
          equipmentTierSnapshot: snapshot.equipmentTier,
          equippedPieceCountSnapshot: snapshot.equippedPieceCount,
          damageRemainder: 0,
          combatSnapshotAt: snapshotAt,
          lastContributionAt: snapshotAt,
        },
      });
      snapshots.push({
        id: participant.id,
        damagePerSecond: snapshot.damagePerSecond,
        scalingDamagePerSecond: snapshot.scalingDamagePerSecond,
      });
    }

    return snapshots;
  }

  private async activateEventWithSnapshot(eventId: string, now: Date) {
    await this.flushRegisteredParticipantsForBattle(eventId);

    const transitions: Array<{
      characterId: string;
      userId: string;
      stoppedActivities: string[];
    }> = [];
    const activatedEvent = await this.prisma.$transaction(
      async (tx) => {
        await this.lockWorldBossEvent(tx, eventId);
        const event = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: eventId },
          include: { worldBoss: true },
        });

        if (
          event.status === WorldBossEventStatus.ACTIVE &&
          event.scalingVersion >= WORLD_BOSS_TTK_BALANCE_VERSION &&
          event.damageProcessedAt
        ) {
          return tx.worldBossEvent.findUniqueOrThrow({
            where: { id: eventId },
            include: eventInclude,
          });
        }
        if (WORLD_BOSS_TERMINAL_STATUSES.includes(event.status)) {
          return tx.worldBossEvent.findUniqueOrThrow({
            where: { id: eventId },
            include: eventInclude,
          });
        }

        const registeredParticipants = await tx.worldBossParticipant.findMany({
          where: {
            eventId,
            leftAt: null,
          },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          include: {
            character: {
              select: {
                id: true,
                userId: true,
                status: true,
                level: true,
                currentHp: true,
                maxHp: true,
                mapId: true,
                deletedAt: true,
              },
            },
          },
        });

        const characterIds = registeredParticipants
          .map((participant) => participant.characterId)
          .sort();
        if (characterIds.length > 0) {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "characters" WHERE "id" IN (${Prisma.join(
              characterIds,
            )}) ORDER BY "id" FOR UPDATE`,
          );
        }

        for (const participant of registeredParticipants) {
          const character = participant.character;
          const currentHp = character.currentHp ?? character.maxHp ?? 0;
          const isEligible = Boolean(
            !character.deletedAt &&
            character.status === CharacterStatus.ACTIVE &&
            currentHp > 0 &&
            character.mapId === event.mapId &&
            (this.testUnlockEnabled ||
              character.level >= event.worldBoss.minLevel),
          );
          const otherActiveParticipation = isEligible
            ? await tx.worldBossParticipant.findFirst({
                where: {
                  characterId: character.id,
                  eventId: { not: eventId },
                  leftAt: null,
                  confirmedAt: { not: null },
                  event: {
                    status: WorldBossEventStatus.ACTIVE,
                    endsAt: { gt: now },
                  },
                },
                select: { id: true },
              })
            : null;

          if (!isEligible || otherActiveParticipation) {
            await tx.worldBossParticipant.update({
              where: { id: participant.id },
              data: { leftAt: now, lastContributionAt: now },
            });
            continue;
          }

          const stoppedActivities =
            await this.stopActivitiesForWorldBossInTransaction(
              tx,
              character.id,
              now,
            );
          await tx.worldBossParticipant.update({
            where: { id: participant.id },
            data: {
              confirmedAt: participant.confirmedAt ?? now,
              lastContributionAt: now,
            },
          });
          transitions.push({
            characterId: character.id,
            userId: character.userId,
            stoppedActivities,
          });
        }

        const snapshots = await this.snapshotActiveParticipants(tx, event, now);
        if (snapshots.length <= 0) {
          return tx.worldBossEvent.update({
            where: { id: eventId },
            data: {
              status: WorldBossEventStatus.EXPIRED,
              endsAt: now,
              participantCount: 0,
              registrationCount: 0,
            },
            include: eventInclude,
          });
        }

        const targetTtkSeconds = getWorldBossTargetTtkSeconds(
          event.worldBoss.difficulty,
          snapshots.length,
        );
        const maxHp = calculateWorldBossHpFromTtk({
          targetTtkSeconds,
          scalingDamagePerSecond: snapshots.map(
            (snapshot) => snapshot.scalingDamagePerSecond,
          ),
        });
        const aggregateDamagePerSecond = snapshots.reduce(
          (total, snapshot) => total + snapshot.damagePerSecond,
          0,
        );
        const aggregateScalingDamagePerSecond = snapshots.reduce(
          (total, snapshot) => total + snapshot.scalingDamagePerSecond,
          0,
        );

        return tx.worldBossEvent.update({
          where: { id: eventId },
          data: {
            status: WorldBossEventStatus.ACTIVE,
            endsAt: new Date(
              now.getTime() + event.worldBoss.durationSeconds * 1000,
            ),
            maxHp,
            currentHp: maxHp,
            totalDamage: 0,
            participantCount: snapshots.length,
            registrationCount: snapshots.length,
            targetTtkSeconds,
            aggregateDamagePerSecond,
            aggregateScalingDamagePerSecond,
            damageProcessedAt: now,
            scalingVersion: WORLD_BOSS_TTK_BALANCE_VERSION,
            hpLockedAt: now,
            defeatedAt: null,
            rewardedAt: null,
          },
          include: eventInclude,
        });
      },
      { timeout: 15_000 },
    );

    await Promise.allSettled(
      transitions
        .filter((transition) =>
          transition.stoppedActivities.includes('AUTO_COMBAT'),
        )
        .map(async (transition) => {
          try {
            await this.autoCombatService.syncAfterWorldBossTransition(
              transition.userId,
              transition.characterId,
            );
          } catch (error) {
            this.logger.warn(
              `Falha ao sincronizar auto-combate após início do World Boss para ${transition.characterId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }),
    );

    return activatedEvent;
  }

  private async upgradeActiveEventSnapshot(tx: Tx, event: any, now: Date) {
    const snapshots = await this.snapshotActiveParticipants(tx, event, now);
    const targetTtkSeconds = getWorldBossTargetTtkSeconds(
      event.worldBoss.difficulty,
      snapshots.length,
    );
    const remainingHp = calculateWorldBossHpFromTtk({
      targetTtkSeconds,
      scalingDamagePerSecond: snapshots.map(
        (snapshot) => snapshot.scalingDamagePerSecond,
      ),
    });
    const recordedDamage = Math.max(0, event.totalDamage);
    const aggregateDamagePerSecond = snapshots.reduce(
      (total, snapshot) => total + snapshot.damagePerSecond,
      0,
    );
    const aggregateScalingDamagePerSecond = snapshots.reduce(
      (total, snapshot) => total + snapshot.scalingDamagePerSecond,
      0,
    );

    await tx.worldBossEvent.update({
      where: { id: event.id },
      data: {
        maxHp: recordedDamage + remainingHp,
        currentHp: remainingHp,
        participantCount: snapshots.length,
        registrationCount: snapshots.length,
        targetTtkSeconds,
        aggregateDamagePerSecond,
        aggregateScalingDamagePerSecond,
        damageProcessedAt: now,
        scalingVersion: WORLD_BOSS_TTK_BALANCE_VERSION,
        hpLockedAt: now,
        endsAt: new Date(
          Math.max(
            event.endsAt.getTime(),
            now.getTime() + targetTtkSeconds * 1000,
          ),
        ),
      },
    });
  }

  private async processActiveEvent(eventId: string, now: Date, force = false) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockWorldBossEvent(tx, eventId);
        let event = await tx.worldBossEvent.findUniqueOrThrow({
          where: { id: eventId },
          include: {
            ...eventInclude,
            participants: {
              where: { leftAt: null, confirmedAt: { not: null } },
              orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
            },
          },
        });

        if (event.status !== WorldBossEventStatus.ACTIVE) return event;
        if (event.currentHp <= 0) {
          return tx.worldBossEvent.update({
            where: { id: eventId },
            data: {
              status: WorldBossEventStatus.DEFEATED,
              defeatedAt: event.defeatedAt ?? now,
              damageProcessedAt: now,
            },
            include: eventInclude,
          });
        }

        const missingSnapshot = event.participants.some(
          (participant) =>
            participant.damagePerSecondSnapshot === null ||
            participant.scalingDamagePerSecondSnapshot === null,
        );
        if (
          event.scalingVersion < WORLD_BOSS_TTK_BALANCE_VERSION ||
          !event.damageProcessedAt ||
          missingSnapshot
        ) {
          await this.upgradeActiveEventSnapshot(tx, event, now);
          event = await tx.worldBossEvent.findUniqueOrThrow({
            where: { id: eventId },
            include: {
              ...eventInclude,
              participants: {
                where: { leftAt: null, confirmedAt: { not: null } },
                orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
              },
            },
          });
        }

        const processedFrom = event.damageProcessedAt ?? event.startsAt;
        const processedUntil = new Date(
          Math.min(now.getTime(), event.endsAt.getTime()),
        );
        const elapsedMs = Math.max(
          0,
          processedUntil.getTime() - processedFrom.getTime(),
        );
        const reachedDeadline = now.getTime() >= event.endsAt.getTime();

        if (
          elapsedMs < WORLD_BOSS_DAMAGE_PERSIST_INTERVAL_MS &&
          !reachedDeadline &&
          !force
        ) {
          return event;
        }

        const elapsedSeconds = elapsedMs / 1000;
        const allocations = calculateWorldBossDamageTick({
          participants: event.participants.map((participant) => ({
            id: participant.id,
            damagePerSecond: participant.damagePerSecondSnapshot ?? 0,
            damageRemainder: participant.damageRemainder,
          })),
          elapsedSeconds,
          currentHp: event.currentHp,
        });
        const damage = allocations.reduce(
          (total, allocation) => total + allocation.damage,
          0,
        );
        const totalDamage = event.totalDamage + damage;
        const allocationsById = new Map(
          allocations.map((allocation) => [allocation.id, allocation]),
        );
        const ranksByParticipantId = new Map(
          event.participants
            .map((participant) => ({
              id: participant.id,
              damageDealt:
                participant.damageDealt +
                (allocationsById.get(participant.id)?.damage ?? 0),
              joinedAt: participant.joinedAt,
            }))
            .sort(
              (left, right) =>
                right.damageDealt - left.damageDealt ||
                left.joinedAt.getTime() - right.joinedAt.getTime(),
            )
            .map((participant, index) => [participant.id, index + 1]),
        );

        for (const allocation of allocations) {
          const participant = event.participants.find(
            (candidate) => candidate.id === allocation.id,
          );
          const activeFrom =
            participant?.combatSnapshotAt ?? event.startsAt ?? processedFrom;
          const activeSeconds = Math.max(
            participant?.activeSeconds ?? 0,
            Math.floor(
              (processedUntil.getTime() - activeFrom.getTime()) / 1000,
            ),
          );
          const damageDealt =
            (participant?.damageDealt ?? 0) + allocation.damage;
          await tx.worldBossParticipant.update({
            where: { id: allocation.id },
            data: {
              damageDealt: { increment: allocation.damage },
              activeSeconds,
              lastContributionAt: processedUntil,
              damageRemainder: allocation.damageRemainder,
              contributionPercent:
                totalDamage > 0 ? (damageDealt / totalDamage) * 100 : 0,
              rank: ranksByParticipantId.get(allocation.id),
              eligibleForReward:
                activeSeconds >= event.worldBoss.minParticipationSeconds ||
                damageDealt >= event.worldBoss.minParticipationDamage,
            },
          });
        }

        const currentHp = Math.max(0, event.currentHp - damage);
        const aggregateDamagePerSecond = event.participants.reduce(
          (total, participant) =>
            total + (participant.damagePerSecondSnapshot ?? 0),
          0,
        );
        const status =
          currentHp <= 0
            ? WorldBossEventStatus.DEFEATED
            : reachedDeadline
              ? WorldBossEventStatus.EXPIRED
              : WorldBossEventStatus.ACTIVE;

        return tx.worldBossEvent.update({
          where: { id: eventId },
          data: {
            currentHp,
            totalDamage: { increment: damage },
            participantCount: event.participants.length,
            registrationCount: event.participants.length,
            aggregateDamagePerSecond,
            damageProcessedAt: processedUntil,
            status,
            ...(status === WorldBossEventStatus.DEFEATED
              ? { defeatedAt: processedUntil }
              : {}),
          },
          include: eventInclude,
        });
      },
      { timeout: 15_000 },
    );
  }

  private async flushRegisteredParticipantsForBattle(eventId: string) {
    const participants = await this.prisma.worldBossParticipant.findMany({
      where: { eventId, leftAt: null },
      select: {
        characterId: true,
        character: { select: { userId: true } },
      },
    });

    await Promise.allSettled(
      participants.map(async ({ characterId, character }) => {
        try {
          const activityState =
            await this.activityGuard.getCharacterActivityState({
              characterId,
              userId: character.userId,
            });

          if (activityState.hasActiveAutoCombat) {
            await this.autoCombatService.flushForWorldBossTransition(
              character.userId,
              characterId,
            );
          }
          if (activityState.hasActiveGathering) {
            await this.gatheringService.flushForWorldBossTransition(
              character.userId,
              characterId,
            );
          }
          if (activityState.hasActiveCrafting) {
            await this.craftingService.getCharacterCraftingStatus(
              character.userId,
              characterId,
            );
          }
          if (activityState.hasActiveIncursion) {
            await this.incursionsService.getStatus(
              character.userId,
              characterId,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Falha ao consolidar atividade antes do World Boss para ${characterId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }

  private async stopActivitiesForWorldBossInTransaction(
    tx: Tx,
    characterId: string,
    stoppedAt: Date,
  ) {
    const stoppedActivities: string[] = [];
    const gatheringStop = await tx.gatheringSession.updateMany({
      where: { characterId, status: ActivityStatus.ACTIVE },
      data: { status: ActivityStatus.STOPPED },
    });
    if (gatheringStop.count > 0) stoppedActivities.push('GATHERING');

    const craftingStop = await tx.craftingSession.updateMany({
      where: {
        characterId,
        status: ActivityStatus.ACTIVE,
        completesAt: { gt: stoppedAt },
      },
      data: { status: ActivityStatus.STOPPED, completedAt: stoppedAt },
    });
    if (craftingStop.count > 0) stoppedActivities.push('CRAFTING');

    const incursionStop = await tx.characterIncursionSession.updateMany({
      where: {
        characterId,
        status: IncursionSessionStatus.ACTIVE,
        endsAt: { gt: stoppedAt },
      },
      data: {
        status: IncursionSessionStatus.CANCELLED,
        completedAt: null,
      },
    });
    if (incursionStop.count > 0) stoppedActivities.push('INCURSION');

    const autoCombatSession = await tx.autoCombatSession.findFirst({
      where: {
        characterId,
        status: AutoCombatSessionStatus.ACTIVE,
        phase: {
          in: [
            AutoCombatSessionPhase.HUNTING,
            AutoCombatSessionPhase.COMBAT_ACTIVE,
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
      include: {
        huntBatch: {
          include: {
            mobs: {
              where: { remainingCount: { gt: 0 } },
              orderBy: [{ firstFoundAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });

    if (!autoCombatSession) return stoppedActivities;

    const trackedMob = autoCombatSession.huntBatch?.mobs[0] ?? null;
    const selectedEncounterId =
      autoCombatSession.selectedEncounterId ??
      autoCombatSession.battleTargetEncounterId ??
      autoCombatSession.huntBatch?.selectedEncounterId ??
      trackedMob?.encounterId ??
      null;
    const selectedMobId =
      autoCombatSession.selectedEncounterMobId ??
      autoCombatSession.battleTargetMobId ??
      autoCombatSession.huntBatch?.selectedEncounterMobId ??
      trackedMob?.mobId ??
      null;
    const trackedEnemies = Math.max(
      autoCombatSession.battleTargetRemaining,
      autoCombatSession.foundEnemiesCount,
      autoCombatSession.huntBatch?.mobs.reduce(
        (total, mob) => total + mob.remainingCount,
        0,
      ) ?? 0,
    );
    const shouldPreserveTrackedEnemies = Boolean(
      trackedEnemies > 0 && selectedEncounterId && selectedMobId,
    );

    if (shouldPreserveTrackedEnemies) {
      await tx.autoCombatSession.update({
        where: { id: autoCombatSession.id },
        data: {
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          huntStoppedAt: stoppedAt,
          lastHuntProcessedAt: stoppedAt,
          lastProcessedAt: stoppedAt,
          foundEnemiesCount: trackedEnemies,
          selectedEncounterId,
          selectedEncounterMobId: selectedMobId,
          currentMobId: null,
          currentMobHp: null,
          currentMobMaxHp: null,
          killProgressSeconds: 0,
          killProgressMs: 0,
          estimatedKillTimeSeconds: null,
          estimatedKillTimeMs: null,
          unmodifiedKillTimeMs: null,
          baseKillTimeSeconds: null,
          appliedTtkPetDefinitionId: null,
          appliedTtkPetEffectBasisPoints: 0,
          playerOffensivePower: null,
          monsterRecommendedPower: null,
          currentMobIndex: null,
          currentRound: 0,
          battleTargetTotal: 0,
          battleTargetRemaining: 0,
          battleTargetMobId: null,
          battleTargetEncounterId: null,
        },
      });

      if (autoCombatSession.huntBatch) {
        await tx.autoCombatHuntBatch.update({
          where: { id: autoCombatSession.huntBatch.id },
          data: {
            status: AutoCombatHuntBatchStatus.READY,
            stoppedAt,
            consumedAt: null,
            cancelledAt: null,
            lastProcessedAt: stoppedAt,
            foundEnemiesCount: trackedEnemies,
            selectedEncounterId,
            selectedEncounterMobId: selectedMobId,
            cycleTargetEncounterId: null,
          },
        });
      }
    } else {
      await tx.autoCombatSession.update({
        where: { id: autoCombatSession.id },
        data: {
          status: AutoCombatSessionStatus.STOPPED,
          finishedAt: stoppedAt,
          huntStoppedAt: stoppedAt,
          lastHuntProcessedAt: stoppedAt,
          lastProcessedAt: stoppedAt,
          currentMobId: null,
          currentMobHp: null,
          currentMobMaxHp: null,
          killProgressSeconds: 0,
          killProgressMs: 0,
          estimatedKillTimeSeconds: null,
          estimatedKillTimeMs: null,
          unmodifiedKillTimeMs: null,
          baseKillTimeSeconds: null,
          appliedTtkPetDefinitionId: null,
          appliedTtkPetEffectBasisPoints: 0,
          currentRound: 0,
          battleTargetTotal: 0,
          battleTargetRemaining: 0,
          battleTargetMobId: null,
          battleTargetEncounterId: null,
        },
      });
      await tx.autoCombatHuntBatch.updateMany({
        where: {
          sessionId: autoCombatSession.id,
          status: {
            in: [
              AutoCombatHuntBatchStatus.HUNTING,
              AutoCombatHuntBatchStatus.READY,
              AutoCombatHuntBatchStatus.CONSUMED,
            ],
          },
        },
        data: {
          status: AutoCombatHuntBatchStatus.CANCELLED,
          cancelledAt: stoppedAt,
          lastProcessedAt: stoppedAt,
          cycleTargetEncounterId: null,
        },
      });
    }

    stoppedActivities.push('AUTO_COMBAT');
    return stoppedActivities;
  }

  private async recalculateParticipantCount(tx: Tx, eventId: string) {
    const registrationCount = await tx.worldBossParticipant.count({
      where: { eventId, leftAt: null },
    });
    const participantCount = await tx.worldBossParticipant.count({
      where: {
        eventId,
        leftAt: null,
        confirmedAt: { not: null },
      },
    });
    await tx.worldBossEvent.update({
      where: { id: eventId },
      data: { registrationCount, participantCount },
    });
  }

  private async refreshContributions(tx: Tx, eventId: string) {
    const event = await tx.worldBossEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: { worldBoss: true },
    });
    const participants = await tx.worldBossParticipant.findMany({
      where: { eventId, confirmedAt: { not: null } },
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
      data: {
        totalDamage,
        participantCount: activeParticipantCount,
        registrationCount: activeParticipantCount,
      },
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
        confirmedAt: { not: null },
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
        confirmedAt: { not: null },
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
        confirmedAt: { not: null },
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
    const confirmedEvent = await this.prisma.worldBossParticipant.findFirst({
      where: {
        characterId: character.id,
        leftAt: null,
        confirmedAt: { not: null },
        event: {
          mapId: character.mapId,
          status: { in: WORLD_BOSS_OPEN_STATUSES },
        },
      },
      orderBy: { joinedAt: 'desc' },
      select: { eventId: true },
    });

    if (confirmedEvent) {
      const event = await this.prisma.worldBossEvent.findUnique({
        where: { id: confirmedEvent.eventId },
        include: eventInclude,
      });
      if (event) return this.advanceEventState(event);
    }

    const registeredEvent = await this.prisma.worldBossParticipant.findFirst({
      where: {
        characterId: character.id,
        leftAt: null,
        event: {
          mapId: character.mapId,
          status: WorldBossEventStatus.SCHEDULED,
        },
      },
      orderBy: { joinedAt: 'desc' },
      select: { eventId: true },
    });

    if (registeredEvent) {
      const event = await this.prisma.worldBossEvent.findUnique({
        where: { id: registeredEvent.eventId },
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
        confirmedAt: { not: null },
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
    if (event.status === WorldBossEventStatus.ACTIVE) return event;

    let nextStatus = event.status as WorldBossEventStatus;
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
      nextStatus = WorldBossEventStatus.LOBBY_OPEN;
    }

    if (
      nextStatus === WorldBossEventStatus.LOBBY_OPEN &&
      entryWindowEndsAt.getTime() <= now.getTime()
    ) {
      const registrationCount = await this.countRegisteredParticipants(
        event.id,
      );
      if (registrationCount > 0) {
        return this.activateEventWithSnapshot(event.id, entryWindowEndsAt);
      }

      return this.expireEmptyLobby(event.id, entryWindowEndsAt);
    }

    if (nextStatus === event.status) return event;

    return this.prisma.worldBossEvent.update({
      where: { id: event.id },
      data: {
        status: nextStatus,
      },
      include: eventInclude,
    });
  }

  private async expireEmptyLobby(eventId: string, closedAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockWorldBossEvent(tx, eventId);
      const event = await tx.worldBossEvent.findUniqueOrThrow({
        where: { id: eventId },
        include: eventInclude,
      });
      if (event.status !== WorldBossEventStatus.LOBBY_OPEN) return event;

      const confirmedCount = await tx.worldBossParticipant.count({
        where: {
          eventId,
          leftAt: null,
          confirmedAt: { not: null },
        },
      });
      if (confirmedCount > 0) return event;

      await tx.worldBossParticipant.updateMany({
        where: { eventId, leftAt: null },
        data: { leftAt: closedAt, lastContributionAt: closedAt },
      });

      return tx.worldBossEvent.update({
        where: { id: eventId },
        data: {
          status: WorldBossEventStatus.EXPIRED,
          endsAt: closedAt,
          participantCount: 0,
          registrationCount: 0,
        },
        include: eventInclude,
      });
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

  private ensureEventRegistrable(event: any) {
    const now = new Date();

    if (
      event.status === WorldBossEventStatus.SCHEDULED &&
      event.startsAt.getTime() > now.getTime()
    ) {
      return;
    }

    if (
      event.status === WorldBossEventStatus.LOBBY_OPEN &&
      this.getEntryWindowEndsAt(event).getTime() > now.getTime()
    ) {
      return;
    }

    throw new ConflictException(
      event.status === WorldBossEventStatus.LOBBY_OPEN
        ? 'A preparação foi encerrada. Aguarde a próxima aparição.'
        : event.status === WorldBossEventStatus.ACTIVE
          ? 'A batalha já começou. Aguarde a próxima aparição.'
          : 'As inscrições desta Ameaça Global estão encerradas.',
    );
  }

  private ensureRegistrationEligible(character: any, boss: any) {
    if (!character.mapId || character.mapId !== boss.mapId)
      throw new ForbiddenException(
        'Personagem precisa estar no mapa da Ameaça Global.',
      );
    if (!this.testUnlockEnabled && character.level < boss.minLevel)
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
          'Você já está participando de outra Ameaça Global em andamento.',
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
      return {
        canJoin: false,
        reason: `Bloqueado: alcance o nível ${boss.minLevel}.`,
      };
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
        combatStartsAt: entryWindowEndsAt,
        nextRespawnSeconds,
        respawnIntervalSeconds,
        currentHp: event.currentHp,
        maxHp: event.maxHp,
        hpPercent,
        progressPercent: 100 - hpPercent,
        totalDamage: event.totalDamage,
        participantCount: event.participantCount,
        lobbyCount: event.participantCount,
        registrationCount: event.registrationCount,
        targetTtkSeconds: event.targetTtkSeconds,
        aggregateDamagePerSecond: event.aggregateDamagePerSecond,
        scalingVersion: event.scalingVersion,
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
          randomPetCocoon: reward.randomPetCocoon,
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
      confirmedAt: participant.confirmedAt,
      registrationStatus: participant.confirmedAt ? 'CONFIRMED' : 'REGISTERED',
      lastContributionAt: participant.lastContributionAt,
      activeSeconds: participant.activeSeconds,
      powerScoreSnapshot: participant.powerScoreSnapshot,
      damagePerSecondSnapshot: participant.damagePerSecondSnapshot,
      readinessSnapshot: participant.readinessSnapshot,
      equipmentTierSnapshot: participant.equipmentTierSnapshot,
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
