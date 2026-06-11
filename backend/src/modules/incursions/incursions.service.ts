/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-redundant-type-constituents */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterStatus,
  IncursionRewardType,
  IncursionSessionStatus,
  InventoryItemType,
  ItemSlot,
  Prisma,
} from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { calculateLevelProgress } from '../../common/utils/level.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaimIncursionDto } from './dto/claim-incursion.dto';
import { StartIncursionDto } from './dto/start-incursion.dto';

const MIN_INCURSION_DURATION_SECONDS = 1800;

const incursionInclude = {
  map: {
    select: {
      id: true,
      name: true,
      tier: true,
      minLevel: true,
      maxLevel: true,
      description: true,
    },
  },
  lootTable: {
    orderBy: {
      sortOrder: 'asc' as const,
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          tier: true,
          rarity: true,
          slot: true,
          family: true,
          materialOrigin: true,
        },
      },
    },
  },
};

@Injectable()
export class IncursionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
  ) {}

  async listAll() {
    const incursions = await this.prisma.incursion.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: incursionInclude,
    });

    return {
      incursions: incursions.map((incursion) =>
        this.formatIncursion(incursion),
      ),
    };
  }

  async listAvailable(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const now = new Date();
    const sessionState = await this.resolveOpenSession(characterId, now);
    const refreshedCharacter = sessionState.rewardedSession
      ? await this.getCharacterOrThrow(userId, characterId)
      : character;

    const [incursions, activityState] = await Promise.all([
      this.prisma.incursion.findMany({
        where: {
          isActive: true,
          mapId: refreshedCharacter.mapId ?? '__sem-mapa-atual__',
        },
        orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: incursionInclude,
      }),
      this.activityGuard.getCharacterActivityState({ characterId, userId }),
    ]);

    return {
      character: this.formatCharacterWallet(refreshedCharacter),
      currentMap: refreshedCharacter.map,
      activeSession: sessionState.activeSession
        ? this.formatSession(sessionState.activeSession, now)
        : null,
      rewardedSession: sessionState.rewardedSession
        ? this.formatSession(sessionState.rewardedSession, now)
        : null,
      incursions: incursions.map((incursion) =>
        this.formatAvailableIncursion(
          incursion,
          refreshedCharacter,
          sessionState.activeSession,
          activityState,
        ),
      ),
    };
  }

  async getStatus(userId: string, characterId: string) {
    await this.getCharacterOrThrow(userId, characterId);

    const now = new Date();
    const sessionState = await this.resolveOpenSession(characterId, now);

    return {
      activeSession: sessionState.activeSession
        ? this.formatSession(sessionState.activeSession, now)
        : null,
      rewardedSession: sessionState.rewardedSession
        ? this.formatSession(sessionState.rewardedSession, now)
        : null,
    };
  }

  async start(userId: string, dto: StartIncursionDto) {
    await this.getCharacterOrThrow(userId, dto.characterId);
    await this.resolveOpenSession(dto.characterId, new Date());

    await this.activityGuard.ensureCanStartIncursion({
      characterId: dto.characterId,
      userId,
    });

    const character = await this.getCharacterOrThrow(userId, dto.characterId);

    const incursion = await this.prisma.incursion.findUnique({
      where: { id: dto.incursionId },
      include: incursionInclude,
    });

    if (!incursion || !incursion.isActive) {
      throw new NotFoundException('Incursão não encontrada.');
    }

    this.validateIncursionAccess(character, incursion);

    if (incursion.durationSeconds < MIN_INCURSION_DURATION_SECONDS) {
      throw new BadRequestException(
        `A duração mínima de uma incursão é ${MIN_INCURSION_DURATION_SECONDS} segundos.`,
      );
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + incursion.durationSeconds * 1000);

    let session;

    try {
      session = await this.prisma.$transaction(
        async (tx) => {
          await this.activityGuard.ensureCanStartIncursion({
            characterId: dto.characterId,
            userId,
            client: tx,
            lockCharacter: true,
          });

          const activeIncursion = await tx.characterIncursionSession.findFirst({
            where: {
              characterId: character.id,
              status: {
                in: [
                  IncursionSessionStatus.ACTIVE,
                  IncursionSessionStatus.COMPLETED,
                ],
              },
            },
            select: { id: true, status: true },
          });

          if (activeIncursion) {
            throw new ConflictException(
              'Este personagem já possui uma incursão ativa.',
            );
          }

          const debit = await tx.character.updateMany({
            where: {
              id: character.id,
              userId,
              gold: { gte: incursion.goldCost },
              status: CharacterStatus.ACTIVE,
            },
            data: {
              gold: { decrement: incursion.goldCost },
            },
          });

          if (debit.count <= 0) {
            throw new BadRequestException(
              'Gold insuficiente para iniciar esta incursão.',
            );
          }

          return tx.characterIncursionSession.create({
            data: {
              characterId: character.id,
              incursionId: incursion.id,
              status: IncursionSessionStatus.ACTIVE,
              startedAt: now,
              endsAt,
              goldCostPaid: incursion.goldCost,
            },
            include: this.sessionInclude(),
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (this.isTransactionConflictError(error)) {
        throw new ConflictException(
          'Voce ja esta realizando outra atividade. Encerre a atividade atual antes de iniciar uma nova.',
        );
      }

      throw error;
    }

    return {
      message: 'Incursão iniciada com sucesso.',
      session: this.formatSession(session, now),
    };
  }

  async claim(userId: string, dto: ClaimIncursionDto) {
    await this.getCharacterOrThrow(userId, dto.characterId);
    const now = new Date();
    const result = await this.rewardSession(
      dto.sessionId,
      dto.characterId,
      now,
      {
        requireFinished: true,
        notFoundMessage: 'Sessão de incursão não encontrada.',
        alreadyRewardedMessage:
          'As recompensas desta incursão já foram entregues.',
      },
    );

    return this.formatRewardResult(
      result,
      now,
      'Recompensas da incursão entregues.',
    );
  }

  async cancel(userId: string, characterId: string) {
    await this.getCharacterOrThrow(userId, characterId);

    const now = new Date();

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const session = await tx.characterIncursionSession.findFirst({
        where: {
          characterId,
          status: IncursionSessionStatus.ACTIVE,
        },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          endsAt: true,
          claimedAt: true,
        },
      });

      if (!session) {
        throw new NotFoundException('Nenhuma incursão ativa encontrada.');
      }

      if (session.claimedAt || session.endsAt.getTime() <= now.getTime()) {
        throw new ConflictException(
          'Esta incursão já terminou ou já foi recompensada e não pode ser cancelada.',
        );
      }

      const update = await tx.characterIncursionSession.updateMany({
        where: {
          id: session.id,
          characterId,
          status: IncursionSessionStatus.ACTIVE,
          claimedAt: null,
          endsAt: { gt: now },
        },
        data: {
          status: IncursionSessionStatus.CANCELLED,
          completedAt: null,
        },
      });

      if (update.count <= 0) {
        throw new ConflictException(
          'Esta incursão já foi finalizada por outra ação e não pode ser cancelada.',
        );
      }

      return tx.characterIncursionSession.findUniqueOrThrow({
        where: { id: session.id },
        include: this.sessionInclude(),
      });
    });

    return {
      message: 'Incursão cancelada. O custo em gold não é reembolsado.',
      session: this.formatSession(cancelled, now),
    };
  }

  private async getCharacterOrThrow(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        level: true,
        xp: true,
        gold: true,
        cash: true,
        currentHp: true,
        maxHp: true,
        mapId: true,
        map: {
          select: {
            id: true,
            name: true,
            tier: true,
            minLevel: true,
            maxLevel: true,
            description: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    return character;
  }

  private async resolveOpenSession(characterId: string, now = new Date()) {
    const session = await this.prisma.characterIncursionSession.findFirst({
      where: {
        characterId,
        status: {
          in: [IncursionSessionStatus.ACTIVE, IncursionSessionStatus.COMPLETED],
        },
      },
      orderBy: { startedAt: 'desc' },
      include: this.sessionInclude(),
    });

    if (!session) {
      return { activeSession: null, rewardedSession: null };
    }

    const hasFinished = session.endsAt.getTime() <= now.getTime();
    const mustAutoReward =
      (session.status === IncursionSessionStatus.ACTIVE && hasFinished) ||
      session.status === IncursionSessionStatus.COMPLETED;

    if (!mustAutoReward) {
      return { activeSession: session, rewardedSession: null };
    }

    const result = await this.rewardSession(session.id, characterId, now, {
      requireFinished: false,
    });

    return { activeSession: null, rewardedSession: result.session };
  }

  private async rewardSession(
    sessionId: string,
    characterId: string,
    now: Date,
    options: {
      requireFinished?: boolean;
      notFoundMessage?: string;
      alreadyRewardedMessage?: string;
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.characterIncursionSession.findFirst({
        where: {
          id: sessionId,
          characterId,
        },
        include: this.sessionInclude(),
      });

      if (!session) {
        throw new NotFoundException(
          options.notFoundMessage ?? 'Sessão de incursão não encontrada.',
        );
      }

      if (session.status === IncursionSessionStatus.CLAIMED) {
        throw new ConflictException(
          options.alreadyRewardedMessage ??
            'As recompensas desta incursão já foram entregues.',
        );
      }

      if (
        session.status !== IncursionSessionStatus.ACTIVE &&
        session.status !== IncursionSessionStatus.COMPLETED
      ) {
        throw new BadRequestException(
          'Esta incursão não está disponível para recompensa.',
        );
      }

      if (
        options.requireFinished !== false &&
        session.endsAt.getTime() > now.getTime()
      ) {
        throw new BadRequestException('A incursão ainda não terminou.');
      }

      const effectiveCompletedAt = session.completedAt ?? session.endsAt;
      const rewards = this.rollRewards(session.incursion.lootTable);
      const xpReward = rewards
        .filter((reward) => reward.rewardType === IncursionRewardType.XP)
        .reduce((total, reward) => total + reward.quantity, 0);
      const goldReward = rewards
        .filter((reward) => reward.rewardType === IncursionRewardType.GOLD)
        .reduce((total, reward) => total + reward.quantity, 0);

      const claim = await tx.characterIncursionSession.updateMany({
        where: {
          id: session.id,
          characterId,
          status: {
            in: [
              IncursionSessionStatus.ACTIVE,
              IncursionSessionStatus.COMPLETED,
            ],
          },
          claimedAt: null,
        },
        data: {
          status: IncursionSessionStatus.CLAIMED,
          completedAt: effectiveCompletedAt,
          claimedAt: now,
          xpReward,
          goldReward,
          generatedRewardsJson: rewards,
        },
      });

      if (claim.count <= 0) {
        throw new ConflictException(
          'Esta incursão já foi recompensada ou atualizada por outra ação.',
        );
      }

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
        await tx.incursionSessionReward.create({
          data: {
            sessionId: session.id,
            rewardType: reward.rewardType,
            itemId: reward.itemId,
            quantity: reward.quantity,
            rarity: reward.rarity,
          },
        });

        if (reward.itemId && reward.quantity > 0) {
          await tx.inventoryItem.upsert({
            where: {
              characterId_itemId: {
                characterId,
                itemId: reward.itemId,
              },
            },
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

      const updatedSession =
        await tx.characterIncursionSession.findUniqueOrThrow({
          where: { id: session.id },
          include: this.sessionInclude(),
        });

      return { session: updatedSession, rewards, levelProgress };
    });
  }

  private formatRewardResult(
    result: {
      session: any;
      rewards: ReturnType<IncursionsService['rollRewards']>;
      levelProgress: ReturnType<typeof calculateLevelProgress>;
    },
    now: Date,
    message: string,
  ) {
    return {
      message,
      session: this.formatSession(result.session, now),
      xpGained: result.levelProgress.gainedXp,
      goldGained: result.session.goldReward,
      goldSpent: result.session.goldCostPaid,
      levelUp: {
        leveledUp: result.levelProgress.leveledUp,
        levelsGained: result.levelProgress.levelsGained,
        oldLevel: result.levelProgress.oldLevel,
        newLevel: result.levelProgress.newLevel,
      },
      rewards: result.rewards.map((reward) =>
        this.formatGeneratedReward(reward),
      ),
    };
  }

  private sessionInclude() {
    return {
      incursion: {
        include: incursionInclude,
      },
      rewards: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              tier: true,
              rarity: true,
              slot: true,
              family: true,
              materialOrigin: true,
            },
          },
        },
      },
    };
  }

  private validateIncursionAccess(
    character: { level: number; gold: number; mapId: string | null },
    incursion: any,
  ) {
    if (!character.mapId || incursion.mapId !== character.mapId) {
      throw new ForbiddenException(
        'Esta incursão não pertence ao mapa atual do personagem.',
      );
    }

    if (character.level < incursion.minLevel) {
      throw new ForbiddenException(
        `Disponível a partir do nível ${incursion.minLevel}.`,
      );
    }

    if (incursion.map.minLevel > character.level) {
      throw new ForbiddenException(
        'Mapa da incursão ainda não liberado para este personagem.',
      );
    }

    if (character.gold < incursion.goldCost) {
      throw new BadRequestException(
        'Gold insuficiente para iniciar esta incursão.',
      );
    }
  }

  private rollRewards(lootTable: any[]) {
    const rewards: Array<{
      rewardType: IncursionRewardType;
      itemId: string | null;
      itemName?: string | null;
      quantity: number;
      rarity: any;
      inventoryType: InventoryItemType;
    }> = [];

    for (const loot of lootTable) {
      const chance = Math.max(0, Math.min(100, Number(loot.chance) || 0));
      const shouldReward =
        Boolean(loot.guaranteed) || Math.random() * 100 < chance;

      if (!shouldReward) continue;

      const minQuantity = Math.max(
        0,
        Math.floor(Number(loot.minQuantity) || 0),
      );
      const maxQuantity = Math.max(
        minQuantity,
        Math.floor(Number(loot.maxQuantity) || minQuantity),
      );
      const quantity =
        minQuantity +
        Math.floor(Math.random() * (maxQuantity - minQuantity + 1));

      if (quantity <= 0) continue;

      rewards.push({
        rewardType: loot.rewardType,
        itemId: loot.itemId ?? null,
        itemName: loot.item?.name ?? null,
        quantity,
        rarity: loot.rarity ?? loot.item?.rarity ?? null,
        inventoryType: this.resolveInventoryType(loot),
      });
    }

    return rewards;
  }

  private resolveInventoryType(loot: any) {
    if (loot.rewardType === IncursionRewardType.MATERIAL)
      return InventoryItemType.MATERIAL;
    if (loot.rewardType === IncursionRewardType.CONSUMABLE)
      return InventoryItemType.CONSUMABLE;
    if (loot.rewardType === IncursionRewardType.EQUIPMENT)
      return InventoryItemType.EQUIPMENT;
    if (loot.item?.slot === ItemSlot.MATERIAL)
      return InventoryItemType.MATERIAL;
    if (loot.item?.slot === ItemSlot.CONSUMABLE)
      return InventoryItemType.CONSUMABLE;
    return InventoryItemType.EQUIPMENT;
  }

  private formatCharacterWallet(character: {
    id: string;
    name: string;
    level: number;
    gold: number;
    cash: number;
  }) {
    return {
      id: character.id,
      name: character.name,
      level: character.level,
      gold: character.gold,
      cash: character.cash,
      wallet: { gold: character.gold, cash: character.cash },
    };
  }

  private formatIncursion(incursion: any) {
    return {
      id: incursion.id,
      name: incursion.name,
      slug: incursion.slug,
      description: incursion.description,
      map: incursion.map,
      mapId: incursion.mapId,
      tier: incursion.tier,
      minLevel: incursion.minLevel,
      maxLevel: incursion.maxLevel,
      goldCost: incursion.goldCost,
      durationSeconds: incursion.durationSeconds,
      difficulty: incursion.difficulty,
      riskLevel: incursion.riskLevel,
      isActive: incursion.isActive,
      sortOrder: incursion.sortOrder,
      rewardsPreview: incursion.lootTable.map((loot: any) =>
        this.formatLoot(loot),
      ),
      lootTable: incursion.lootTable.map((loot: any) => this.formatLoot(loot)),
    };
  }

  private formatAvailableIncursion(
    incursion: any,
    character: any,
    activeSession: any | null,
    activityState?: {
      hasActiveAutoCombat?: boolean;
      hasActiveGathering?: boolean;
      hasActiveIncursion?: boolean;
      hasActiveWorldBoss?: boolean;
    },
  ) {
    const lockedReasons: string[] = [];

    if (character.level < incursion.minLevel)
      lockedReasons.push(`Disponível no nível ${incursion.minLevel}`);
    if (character.gold < incursion.goldCost)
      lockedReasons.push('Gold insuficiente');
    if (activeSession || activityState?.hasActiveIncursion)
      lockedReasons.push('Já existe incursão ativa');
    if (activityState?.hasActiveAutoCombat)
      lockedReasons.push('Auto-combate em andamento');
    if (activityState?.hasActiveGathering)
      lockedReasons.push('Gathering em andamento');
    if (activityState?.hasActiveWorldBoss)
      lockedReasons.push('Você já está em um World Boss');

    return {
      ...this.formatIncursion(incursion),
      isUnlocked: lockedReasons.length === 0,
      lockedReasons,
      canStart: lockedReasons.length === 0,
    };
  }

  private formatLoot(loot: any) {
    return {
      id: loot.id,
      rewardType: loot.rewardType,
      itemId: loot.itemId,
      item: loot.item,
      chance: loot.chance,
      minQuantity: loot.minQuantity,
      maxQuantity: loot.maxQuantity,
      guaranteed: loot.guaranteed,
      rarity: loot.rarity,
      sortOrder: loot.sortOrder,
    };
  }

  private formatSession(session: any, now: Date) {
    const effectiveStatus =
      session.status === IncursionSessionStatus.ACTIVE &&
      session.endsAt.getTime() <= now.getTime()
        ? IncursionSessionStatus.COMPLETED
        : session.status;
    const totalMs = Math.max(
      1,
      session.endsAt.getTime() - session.startedAt.getTime(),
    );
    const elapsedMs = Math.max(
      0,
      Math.min(totalMs, now.getTime() - session.startedAt.getTime()),
    );

    return {
      id: session.id,
      characterId: session.characterId,
      incursionId: session.incursionId,
      status: effectiveStatus,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      completedAt: session.completedAt,
      claimedAt: session.claimedAt,
      goldCostPaid: session.goldCostPaid,
      xpReward: session.xpReward,
      goldReward: session.goldReward,
      progressPercent: Math.round((elapsedMs / totalMs) * 100),
      remainingSeconds: Math.max(
        0,
        Math.ceil((session.endsAt.getTime() - now.getTime()) / 1000),
      ),
      canClaim: false,
      incursion: this.formatIncursion(session.incursion),
      rewards: (session.rewards ?? []).map((reward: any) => ({
        id: reward.id,
        rewardType: reward.rewardType,
        itemId: reward.itemId,
        item: reward.item,
        quantity: reward.quantity,
        rarity: reward.rarity,
      })),
    };
  }

  private formatGeneratedReward(reward: {
    rewardType: IncursionRewardType;
    itemId: string | null;
    itemName?: string | null;
    quantity: number;
    rarity: any;
  }) {
    return {
      rewardType: reward.rewardType,
      itemId: reward.itemId,
      itemName: reward.itemName,
      quantity: reward.quantity,
      rarity: reward.rarity,
    };
  }

  private isTransactionConflictError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
