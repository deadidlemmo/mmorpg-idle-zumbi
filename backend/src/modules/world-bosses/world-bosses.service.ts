/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterStatus,
  InventoryItemType,
  Prisma,
  WorldBossEventStatus,
  WorldBossRewardType,
} from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { calculateLevelProgress } from '../../common/utils/level.util';
import { calculateFullStats } from '../../common/utils/stats.util';
import { PrismaService } from '../../prisma/prisma.service';
import { JoinWorldBossDto } from './dto/join-world-boss.dto';
import { LeaveWorldBossDto } from './dto/leave-world-boss.dto';

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

@Injectable()
export class WorldBossesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
  ) {}

  async getActive(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const status = await this.getStatus(userId, characterId);
    return {
      ...status,
      eligible: this.getEligibility(character, status.event?.worldBoss ?? null),
    };
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
    this.ensureEventActive(event);
    this.ensureEligible(character, event.worldBoss);

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

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const participant = await tx.worldBossParticipant.upsert({
        where: {
          eventId_characterId: {
            eventId: dto.eventId,
            characterId: dto.characterId,
          },
        },
        update: { lastContributionAt: now },
        create: {
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

    return this.formatStatus(
      result.event,
      result.participant,
      now,
      null,
      'Você entrou na Ameaça Global.',
    );
  }

  async leave(userId: string, dto: LeaveWorldBossDto) {
    await this.getCharacterOrThrow(userId, dto.characterId);
    const resolved = await this.resolveEventAndContribution({
      userId,
      characterId: dto.characterId,
      eventId: dto.eventId,
    });
    if (!resolved.participant)
      throw new NotFoundException('Participação não encontrada.');
    return this.formatStatus(
      resolved.event,
      resolved.participant,
      new Date(),
      resolved.rewards,
      'Você saiu da sala, mas sua contribuição permanece registrada.',
    );
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
            event.currentHp > 0 &&
            event.endsAt.getTime() > now.getTime()
          ) {
            const damage = await this.calculateElapsedDamage(
              tx,
              params.characterId,
              event.worldBoss,
              participant.lastContributionAt,
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
                        (now.getTime() -
                          participant.lastContributionAt.getTime()) /
                          1000,
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

        if (
          participant &&
          (event.status === WorldBossEventStatus.DEFEATED ||
            event.status === WorldBossEventStatus.EXPIRED) &&
          !participant.rewardGranted
        ) {
          rewards = await this.grantReward(
            tx,
            event,
            participant.id,
            params.characterId,
            now,
          );
          participant = await tx.worldBossParticipant.findUnique({
            where: { id: participant.id },
            include: { rewards: { include: { item: true } } },
          });
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
    const stats = calculateFullStats(character.class, items, character.level);
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
      const stats = calculateFullStats(
        p.character.class,
        items,
        p.character.level,
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
    const count = await tx.worldBossParticipant.count({ where: { eventId } });
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
      data: { totalDamage, participantCount: participants.length },
    });
  }

  private async grantReward(
    tx: Tx,
    event: any,
    participantId: string,
    characterId: string,
    now: Date,
  ) {
    const participant = await tx.worldBossParticipant.findUniqueOrThrow({
      where: { id: participantId },
    });
    const progress =
      event.maxHp > 0 ? Math.min(1, event.totalDamage / event.maxHp) : 0;
    const collectiveMultiplier =
      event.status === WorldBossEventStatus.DEFEATED
        ? 1
        : progress >= 0.75
          ? 0.75
          : progress >= 0.5
            ? 0.5
            : progress >= 0.25
              ? 0.3
              : 0.15;
    const eligible = participant.eligibleForReward;
    const rewards: any[] = [];

    for (const reward of event.worldBoss.rewards) {
      if (reward.requiresMinParticipation && !eligible) continue;
      if (
        reward.onlyIfDefeated &&
        event.status !== WorldBossEventStatus.DEFEATED
      )
        continue;
      if (participant.contributionPercent < reward.minContributionPercent)
        continue;
      const chance = reward.guaranteed
        ? 100
        : reward.chance *
          (event.status === WorldBossEventStatus.DEFEATED ? 1 : 0.55);
      if (!reward.guaranteed && Math.random() * 100 > chance) continue;
      const quantity = Math.max(
        0,
        Math.floor(
          this.randomInt(reward.minQuantity, reward.maxQuantity) *
            (reward.rewardType === WorldBossRewardType.XP ||
            reward.rewardType === WorldBossRewardType.GOLD
              ? collectiveMultiplier
              : 1),
        ),
      );
      if (quantity <= 0) continue;
      rewards.push({
        rewardType: reward.rewardType,
        itemId: reward.itemId,
        quantity,
        rarity: reward.rarity,
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

    for (const reward of rewards) {
      await tx.worldBossGrantedReward.create({
        data: {
          participantId,
          rewardType: reward.rewardType,
          itemId: reward.itemId,
          quantity: reward.quantity,
          rarity: reward.rarity,
        },
      });
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
      }
    }

    await tx.worldBossParticipant.update({
      where: { id: participantId },
      data: { rewardGranted: true, rewardGrantedAt: now },
    });
    return rewards;
  }

  private async findActiveEventForCharacter(character: any) {
    if (!character.mapId) return null;
    return this.prisma.worldBossEvent.findFirst({
      where: {
        mapId: character.mapId,
        status: {
          in: [
            WorldBossEventStatus.ACTIVE,
            WorldBossEventStatus.DEFEATED,
            WorldBossEventStatus.EXPIRED,
          ],
        },
        startsAt: { lte: new Date() },
      },
      orderBy: [{ status: 'asc' }, { startsAt: 'desc' }],
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

  private ensureEventActive(event: any) {
    const now = new Date();
    if (
      event.status !== WorldBossEventStatus.ACTIVE ||
      event.startsAt > now ||
      event.endsAt <= now
    )
      throw new ConflictException('Esta Ameaça Global não está ativa.');
  }

  private ensureEligible(character: any, boss: any) {
    if (!character.mapId || character.mapId !== boss.mapId)
      throw new ForbiddenException(
        'Personagem precisa estar no mapa da Ameaça Global.',
      );
    if (character.level < boss.minLevel)
      throw new ForbiddenException(
        `Nível mínimo ${boss.minLevel} necessário para participar desta Ameaça Global.`,
      );
  }

  private getEligibility(character: any, boss: any | null) {
    if (!boss) return { canJoin: false, reason: 'Nenhuma ameaça ativa.' };
    if (!character.mapId || character.mapId !== boss.mapId)
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
    const hpPercent =
      event.maxHp > 0
        ? Math.max(0, Math.min(100, (event.currentHp / event.maxHp) * 100))
        : 0;
    return {
      message,
      event: {
        id: event.id,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        remainingSeconds,
        currentHp: event.currentHp,
        maxHp: event.maxHp,
        hpPercent,
        progressPercent: 100 - hpPercent,
        totalDamage: event.totalDamage,
        participantCount: event.participantCount,
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
      minLevel: boss.minLevel,
      maxLevel: boss.maxLevel,
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
          item: reward.item,
          minQuantity: reward.minQuantity,
          maxQuantity: reward.maxQuantity,
          chance: reward.chance,
          guaranteed: reward.guaranteed,
          onlyIfDefeated: reward.onlyIfDefeated,
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
