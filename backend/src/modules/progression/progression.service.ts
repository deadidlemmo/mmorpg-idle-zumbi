import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EconomyDirection,
  EconomyResourceType,
  IncursionSessionStatus,
  InventoryItemType,
  ItemSlot,
  MissionStatus,
  MissionType,
  Prisma,
} from '@prisma/client';
import { grantCharacterXp } from '../../common/utils/character-xp.util';
import {
  getMissionBalanceTier,
  getMissionReward,
} from '../../common/config/mission-balance.config';
import { AuditService } from '../../common/audit/audit.service';
import {
  PRODUCT_EVENT_ACTIONS,
  PRODUCT_MILESTONE_KEYS,
} from '../../common/audit/product-events.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { UpdateTutorialDto } from './dto/update-tutorial.dto';

const TUTORIAL_STEPS = [
  {
    key: 'shelter',
    title: 'Conheça o abrigo',
    description:
      'Este é o centro da sua sobrevivência. Acompanhe aqui seus recursos, atividades e progresso.',
    href: '',
    actionLabel: 'Entendi',
  },
  {
    key: 'map',
    title: 'Vá para Mapas',
    description:
      'Abra Mapas para conhecer as regiões disponíveis e o nível recomendado de cada área.',
    href: 'maps',
    actionLabel: 'Abrir mapas',
  },
  {
    key: 'gathering',
    title: 'Colete seu primeiro recurso',
    description:
      'Escolha uma expedição, inicie uma coleta e aguarde pelo menos uma unidade chegar ao inventário.',
    href: 'gathering',
    actionLabel: 'Abrir expedições',
  },
  {
    key: 'crafting',
    title: 'Fabrique seu primeiro equipamento T1',
    description:
      'Use os materiais coletados em Criação. A etapa avança quando um equipamento T1 ficar pronto.',
    href: 'crafting',
    actionLabel: 'Abrir criação',
  },
  {
    key: 'equipment',
    title: 'Equipe seu primeiro item T1',
    description:
      'Abra Equipamentos e substitua uma peça de Aprendiz pelo equipamento T1 criado.',
    href: 'equipment',
    actionLabel: 'Abrir equipamentos',
  },
];

const LAST_MANUAL_TUTORIAL_STEP = 2;

type MissionAssignmentWithDefinition = Prisma.CharacterMissionGetPayload<{
  include: { mission: true };
}>;

type AchievementProgressWithDefinition = Prisma.CharacterAchievementGetPayload<{
  include: { achievement: true };
}>;

@Injectable()
export class ProgressionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getDashboard(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const tutorial = await this.getTutorialProgress(userId, characterId);

    await this.ensureMissionAssignments(characterId, character.level);
    const [missions, achievements] = await Promise.all([
      this.refreshMissions(characterId, character.level),
      this.syncAchievements(characterId, character.level),
    ]);

    return {
      serverNow: new Date().toISOString(),
      tutorial,
      missions: missions.map((mission) =>
        this.formatMissionAssignment(mission),
      ),
      achievements,
    };
  }

  async getTutorial(userId: string, characterId: string) {
    await this.getCharacterOrThrow(userId, characterId);
    return this.getTutorialProgress(userId, characterId);
  }

  async updateTutorial(
    userId: string,
    characterId: string,
    dto: UpdateTutorialDto,
  ) {
    await this.getCharacterOrThrow(userId, characterId);
    const existing = await this.prisma.characterTutorialProgress.upsert({
      where: { characterId },
      update: {},
      create: { characterId },
    });
    const requestedStep = Math.min(dto.step, LAST_MANUAL_TUTORIAL_STEP);
    const step = Math.max(existing.step, requestedStep);
    const completed = existing.completed || step >= TUTORIAL_STEPS.length;

    const updated = await this.prisma.characterTutorialProgress.update({
      where: { characterId },
      data: {
        step,
        completed,
        completedAt: completed ? (existing.completedAt ?? new Date()) : null,
        dismissedAt: dto.dismissed
          ? (existing.dismissedAt ?? new Date())
          : existing.dismissedAt,
      },
    });

    this.recordTutorialAdvancement({
      userId,
      characterId,
      previousStep: existing.step,
      nextStep: updated.step,
      completed: updated.completed,
    });

    return this.getTutorialProgress(userId, characterId);
  }

  private async reconcileTutorialProgress(
    userId: string,
    tutorial: {
      id: string;
      characterId: string;
      step: number;
      completed: boolean;
      completedAt: Date | null;
      dismissedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    if (tutorial.completed || tutorial.step < 2) {
      return tutorial;
    }

    let stepCompleted = false;

    if (tutorial.step === 2) {
      stepCompleted = Boolean(
        await this.prisma.gatheringSession.findFirst({
          where: {
            characterId: tutorial.characterId,
            collectedQuantity: { gt: 0 },
          },
          select: { id: true },
        }),
      );
    } else if (tutorial.step === 3) {
      stepCompleted = Boolean(
        await this.prisma.craftingSession.findFirst({
          where: {
            characterId: tutorial.characterId,
            status: 'COMPLETED',
            completedAt: { not: null },
            outputItem: {
              tier: 1,
              slot: {
                in: [
                  ItemSlot.MAIN_HAND,
                  ItemSlot.OFF_HAND,
                  ItemSlot.HEAD,
                  ItemSlot.ARMOR,
                  ItemSlot.PANTS,
                  ItemSlot.BOOTS,
                ],
              },
            },
          },
          select: { id: true },
        }),
      );
    } else if (tutorial.step === 4) {
      stepCompleted = Boolean(
        await this.prisma.equipment.findFirst({
          where: {
            characterId: tutorial.characterId,
            OR: [
              { mainHand: { tier: 1 } },
              { offHand: { tier: 1 } },
              { head: { tier: 1 } },
              { armor: { tier: 1 } },
              { pants: { tier: 1 } },
              { boots: { tier: 1 } },
            ],
          },
          select: { id: true },
        }),
      );
    }

    if (!stepCompleted) {
      return tutorial;
    }

    const nextStep = tutorial.step + 1;
    const completed = nextStep >= TUTORIAL_STEPS.length;
    const now = new Date();

    const advanced = await this.prisma.characterTutorialProgress.updateMany({
      where: {
        id: tutorial.id,
        step: tutorial.step,
        completed: false,
      },
      data: {
        step: nextStep,
        completed,
        completedAt: completed ? now : null,
      },
    });

    if (advanced.count === 1) {
      this.recordTutorialAdvancement({
        userId,
        characterId: tutorial.characterId,
        previousStep: tutorial.step,
        nextStep,
        completed,
      });
    }

    return this.prisma.characterTutorialProgress.findUniqueOrThrow({
      where: { id: tutorial.id },
    });
  }

  private async getTutorialProgress(userId: string, characterId: string) {
    const storedTutorial = await this.prisma.characterTutorialProgress.upsert({
      where: { characterId },
      update: {},
      create: { characterId },
    });
    const tutorial = await this.reconcileTutorialProgress(
      userId,
      storedTutorial,
    );

    return {
      ...tutorial,
      steps: TUTORIAL_STEPS,
      objective: await this.buildT1Objective(characterId),
    };
  }

  private async buildT1Objective(characterId: string) {
    const equipmentSlots = [
      ItemSlot.MAIN_HAND,
      ItemSlot.OFF_HAND,
      ItemSlot.HEAD,
      ItemSlot.ARMOR,
      ItemSlot.PANTS,
      ItemSlot.BOOTS,
    ];
    const [collectedResource, craftedT1, equipment, availableT1Items] =
      await Promise.all([
        this.prisma.gatheringSession.findFirst({
          where: { characterId, collectedQuantity: { gt: 0 } },
          select: { id: true },
        }),
        this.prisma.craftingSession.findFirst({
          where: {
            characterId,
            status: 'COMPLETED',
            completedAt: { not: null },
            outputItem: { tier: 1, slot: { in: equipmentSlots } },
          },
          select: { id: true },
        }),
        this.prisma.equipment.findUnique({
          where: { characterId },
          select: {
            mainHand: { select: { tier: true } },
            offHand: { select: { tier: true } },
            head: { select: { tier: true } },
            armor: { select: { tier: true } },
            pants: { select: { tier: true } },
            boots: { select: { tier: true } },
          },
        }),
        this.prisma.inventoryItem.count({
          where: {
            characterId,
            quantity: { gt: 0 },
            type: InventoryItemType.EQUIPMENT,
            item: { tier: 1, slot: { in: equipmentSlots } },
          },
        }),
      ]);
    const equippedItems = equipment
      ? [
          equipment.mainHand,
          equipment.offHand,
          equipment.head,
          equipment.armor,
          equipment.pants,
          equipment.boots,
        ]
      : [];
    const equippedT1Slots = equippedItems.filter(
      (item) => (item?.tier ?? 0) >= 1,
    ).length;
    const completed = equippedT1Slots === equipmentSlots.length;
    const collected = Boolean(collectedResource);
    const crafted = Boolean(craftedT1);
    const completedUnits =
      Number(collected) + Number(crafted) + equippedT1Slots;
    const totalUnits = equipmentSlots.length + 2;

    let currentAction = {
      key: 'gather-first-resource',
      title: 'Colete materiais para seu primeiro T1',
      description:
        'Inicie uma expedição T1 e aguarde a primeira unidade chegar à mochila.',
      href: 'gathering',
      actionLabel: 'Abrir expedições',
    };

    if (availableT1Items > 0 && !completed) {
      currentAction = {
        key: 'equip-next-t1',
        title: 'Equipe a próxima peça T1',
        description: `Há ${availableT1Items} peça(s) T1 na mochila. Substitua os itens de Aprendiz para avançar o conjunto.`,
        href: 'equipment',
        actionLabel: 'Abrir equipamentos',
      };
    } else if (collected && !crafted) {
      currentAction = {
        key: 'craft-first-t1',
        title: 'Fabrique seu primeiro equipamento T1',
        description:
          'Use os materiais da expedição em uma receita T1 da sua classe.',
        href: 'crafting',
        actionLabel: 'Abrir criação',
      };
    } else if (!completed && equippedT1Slots > 0) {
      currentAction = {
        key: 'complete-t1-set',
        title: 'Complete seu conjunto T1',
        description: `Você já preparou ${equippedT1Slots} de ${equipmentSlots.length} slots. Fabrique a próxima peça que ainda falta.`,
        href: 'crafting',
        actionLabel: 'Criar próxima peça',
      };
    } else if (crafted && !completed) {
      currentAction = {
        key: 'equip-first-t1',
        title: 'Equipe seu primeiro item T1',
        description:
          'Abra Equipamentos e substitua uma peça de Aprendiz pelo item criado.',
        href: 'equipment',
        actionLabel: 'Abrir equipamentos',
      };
    }

    if (completed) {
      currentAction = {
        key: 't1-set-completed',
        title: 'Primeiro conjunto T1 completo',
        description:
          'Os seis slots estão preparados. Seu sobrevivente concluiu a jornada inicial.',
        href: 'auto-combat',
        actionLabel: 'Testar conjunto',
      };
    }

    return {
      ...currentAction,
      completed,
      equippedT1Slots,
      targetT1Slots: equipmentSlots.length,
      progressPercent: Math.round((completedUnits / totalUnits) * 100),
      checklist: [
        {
          key: 'resource',
          label: 'Recurso',
          current: collected ? 1 : 0,
          target: 1,
          completed: collected,
        },
        {
          key: 'craft',
          label: 'T1 criado',
          current: crafted ? 1 : 0,
          target: 1,
          completed: crafted,
        },
        {
          key: 'equipment',
          label: 'Slots',
          current: equippedT1Slots,
          target: equipmentSlots.length,
          completed,
        },
      ],
    };
  }

  private recordTutorialAdvancement(params: {
    userId: string;
    characterId: string;
    previousStep: number;
    nextStep: number;
    completed: boolean;
  }) {
    for (
      let completedStep = params.previousStep;
      completedStep < params.nextStep && completedStep < TUTORIAL_STEPS.length;
      completedStep += 1
    ) {
      const definition = TUTORIAL_STEPS[completedStep];
      this.auditService.recordMilestoneSafely({
        actorUserId: params.userId,
        action: PRODUCT_EVENT_ACTIONS.TUTORIAL_STEP_COMPLETED,
        entityType: 'Character',
        entityId: params.characterId,
        deduplicationKey: PRODUCT_MILESTONE_KEYS.tutorialStep(
          params.characterId,
          completedStep,
        ),
        metadata: {
          step: completedStep,
          stepKey: definition.key,
          title: definition.title,
        },
      });
    }

    if (params.completed) {
      this.auditService.recordMilestoneSafely({
        actorUserId: params.userId,
        action: PRODUCT_EVENT_ACTIONS.TUTORIAL_COMPLETED,
        entityType: 'Character',
        entityId: params.characterId,
        deduplicationKey: PRODUCT_MILESTONE_KEYS.tutorialCompleted(
          params.characterId,
        ),
      });
    }
  }

  async claimMission(userId: string, characterId: string, missionId: string) {
    await this.getCharacterOrThrow(userId, characterId);

    return this.prisma.$transaction(
      async (tx) => {
        const assignment = await tx.characterMission.findFirst({
          where: { id: missionId, characterId },
          include: { mission: true },
        });

        if (!assignment) throw new NotFoundException('Missao nao encontrada.');
        if (assignment.status !== MissionStatus.COMPLETED) {
          throw new ConflictException(
            'Esta missao ainda nao pode ser resgatada.',
          );
        }

        const claimed = await tx.characterMission.updateMany({
          where: {
            id: assignment.id,
            characterId,
            status: MissionStatus.COMPLETED,
            claimedAt: null,
          },
          data: { status: MissionStatus.CLAIMED, claimedAt: new Date() },
        });

        if (claimed.count !== 1) {
          throw new ConflictException('A recompensa ja foi resgatada.');
        }

        const levelProgress = await grantCharacterXp(
          tx,
          characterId,
          assignment.rewardXp,
        );

        await tx.character.update({
          where: { id: characterId },
          data: {
            gold: { increment: assignment.rewardGold },
          },
        });

        if (assignment.rewardXp > 0) {
          await recordEconomyEntry(tx, {
            characterId,
            direction: EconomyDirection.CREDIT,
            resourceType: EconomyResourceType.XP,
            tier: assignment.rewardTier,
            quantity: assignment.rewardXp,
            reason: ECONOMY_REASONS.MISSION_XP_REWARD,
            referenceType: 'CharacterMission',
            referenceId: assignment.id,
            idempotencyKey: `mission:${assignment.id}:reward:xp`,
          });
        }
        if (assignment.rewardGold > 0) {
          await recordEconomyEntry(tx, {
            characterId,
            direction: EconomyDirection.CREDIT,
            resourceType: EconomyResourceType.GOLD,
            tier: assignment.rewardTier,
            quantity: assignment.rewardGold,
            reason: ECONOMY_REASONS.MISSION_GOLD_REWARD,
            referenceType: 'CharacterMission',
            referenceId: assignment.id,
            idempotencyKey: `mission:${assignment.id}:reward:gold`,
          });
        }

        return {
          message: 'Recompensa da missao resgatada.',
          rewardTier: assignment.rewardTier,
          rewardXp: assignment.rewardXp,
          rewardGold: assignment.rewardGold,
          levelProgress,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async claimAchievement(
    userId: string,
    characterId: string,
    achievementId: string,
  ) {
    await this.getCharacterOrThrow(userId, characterId);

    return this.prisma.$transaction(async (tx) => {
      const achievement = await tx.characterAchievement.findFirst({
        where: { id: achievementId, characterId },
        include: { achievement: true },
      });

      if (!achievement?.unlockedAt) {
        throw new ConflictException('Conquista ainda nao desbloqueada.');
      }

      const claimed = await tx.characterAchievement.updateMany({
        where: { id: achievement.id, claimedAt: null },
        data: { claimedAt: new Date() },
      });

      if (claimed.count !== 1) {
        throw new ConflictException('Recompensa da conquista ja resgatada.');
      }

      await tx.character.update({
        where: { id: characterId },
        data: { cash: { increment: achievement.achievement.rewardCash } },
      });

      if (achievement.achievement.rewardCash > 0) {
        await recordEconomyEntry(tx, {
          characterId,
          direction: EconomyDirection.CREDIT,
          resourceType: EconomyResourceType.CASH,
          quantity: achievement.achievement.rewardCash,
          reason: ECONOMY_REASONS.ACHIEVEMENT_CASH_REWARD,
          referenceType: 'CharacterAchievement',
          referenceId: achievement.id,
          idempotencyKey: `achievement:${achievement.id}:reward:cash`,
        });
      }

      return {
        message: 'Recompensa da conquista resgatada.',
        rewardCash: achievement.achievement.rewardCash,
      };
    });
  }

  private async ensureMissionAssignments(
    characterId: string,
    characterLevel: number,
  ) {
    const now = new Date();
    const rewardTier = getMissionBalanceTier(characterLevel);
    const definitions = await this.prisma.missionDefinition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    await this.prisma.characterMission.updateMany({
      where: {
        characterId,
        status: { in: [MissionStatus.ACTIVE, MissionStatus.COMPLETED] },
        expiresAt: { lt: now },
      },
      data: { status: MissionStatus.EXPIRED },
    });

    for (const definition of definitions) {
      const period = this.getMissionPeriod(definition.type, now);
      const reward = getMissionReward({
        missionKey: definition.key,
        tier: rewardTier,
        baseGold: definition.rewardGold,
        baseXp: definition.rewardXp,
      });
      await this.prisma.characterMission.upsert({
        where: {
          characterId_missionId_periodKey: {
            characterId,
            missionId: definition.id,
            periodKey: period.key,
          },
        },
        update:
          definition.type === MissionType.STORY
            ? {}
            : { assignedAt: period.startsAt },
        create: {
          characterId,
          missionId: definition.id,
          periodKey: period.key,
          assignedAt: period.startsAt,
          targetValue: definition.targetValue,
          rewardTier: reward.tier,
          rewardXp: reward.xp,
          rewardGold: reward.gold,
          expiresAt: period.expiresAt,
        },
      });
    }
  }

  private async refreshMissions(characterId: string, characterLevel: number) {
    const now = new Date();
    const assignments = await this.prisma.characterMission.findMany({
      where: {
        characterId,
        status: { in: [MissionStatus.ACTIVE, MissionStatus.COMPLETED] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { mission: true },
      orderBy: { mission: { sortOrder: 'asc' } },
    });

    const refreshed: MissionAssignmentWithDefinition[] = [];

    for (const assignment of assignments) {
      const measuredProgress = await this.getObjectiveProgress(
        characterId,
        assignment.mission.objectiveType,
        assignment.assignedAt,
        characterLevel,
        assignment.rewardTier,
      );
      const progress = Math.min(
        assignment.targetValue,
        Math.max(assignment.progress, measuredProgress),
      );
      const isComplete = progress >= assignment.targetValue;
      const updated = await this.prisma.characterMission.update({
        where: { id: assignment.id },
        data: {
          progress,
          status: isComplete ? MissionStatus.COMPLETED : MissionStatus.ACTIVE,
          completedAt: isComplete
            ? (assignment.completedAt ?? now)
            : assignment.completedAt,
        },
        include: { mission: true },
      });
      refreshed.push(updated);
    }

    return refreshed;
  }

  private async syncAchievements(characterId: string, characterLevel: number) {
    const [killAggregate, craftAggregate, incursionCount, definitions] =
      await Promise.all([
        this.prisma.autoCombatSessionMobSummary.aggregate({
          where: { session: { characterId } },
          _sum: { kills: true },
        }),
        this.prisma.craftingSession.aggregate({
          where: { characterId, completedAt: { not: null } },
          _sum: { outputQuantity: true },
        }),
        this.prisma.characterIncursionSession.count({
          where: { characterId, status: IncursionSessionStatus.CLAIMED },
        }),
        this.prisma.achievementDefinition.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
      ]);
    const metrics: Record<string, number> = {
      CHARACTER_LEVEL: characterLevel,
      TOTAL_MOB_KILLS: killAggregate._sum.kills ?? 0,
      TOTAL_CRAFTS: craftAggregate._sum.outputQuantity ?? 0,
      TOTAL_INCURSIONS: incursionCount,
    };
    const results: AchievementProgressWithDefinition[] = [];

    for (const definition of definitions) {
      const progress = Math.min(
        definition.targetValue,
        metrics[definition.metricKey] ?? 0,
      );
      const unlocked = progress >= definition.targetValue;
      const current = await this.prisma.characterAchievement.upsert({
        where: {
          characterId_achievementId: {
            characterId,
            achievementId: definition.id,
          },
        },
        create: {
          characterId,
          achievementId: definition.id,
          progress,
          unlockedAt: unlocked ? new Date() : null,
        },
        update: { progress },
      });

      if (unlocked && !current.unlockedAt) {
        results.push(
          await this.prisma.characterAchievement.update({
            where: { id: current.id },
            data: { unlockedAt: new Date() },
            include: { achievement: true },
          }),
        );
      } else {
        results.push({ ...current, achievement: definition });
      }
    }

    return results;
  }

  private async getObjectiveProgress(
    characterId: string,
    objectiveType: string,
    since: Date,
    characterLevel: number,
    missionTier: number,
  ) {
    if (objectiveType === 'REACH_LEVEL') return characterLevel;

    if (objectiveType === 'GATHER_UNITS') {
      const result = await this.prisma.gatheringSession.aggregate({
        where: {
          characterId,
          createdAt: { gte: since },
          map: { tier: missionTier },
        },
        _sum: { collectedQuantity: true },
      });
      return result._sum.collectedQuantity ?? 0;
    }

    if (objectiveType === 'CRAFT_ITEMS') {
      const result = await this.prisma.craftingSession.aggregate({
        where: {
          characterId,
          completedAt: { gte: since },
          outputItem: { tier: missionTier },
        },
        _sum: { outputQuantity: true },
      });
      return result._sum.outputQuantity ?? 0;
    }

    if (objectiveType === 'DEFEAT_MOBS') {
      return this.getAutoCombatMissionKills(characterId, since, missionTier);
    }

    if (objectiveType === 'COMPLETE_INCURSIONS') {
      return this.prisma.characterIncursionSession.count({
        where: {
          characterId,
          status: IncursionSessionStatus.CLAIMED,
          claimedAt: { gte: since },
          incursion: { tier: missionTier },
        },
      });
    }

    return 0;
  }

  private async getAutoCombatMissionKills(
    characterId: string,
    since: Date,
    missionTier: number,
  ) {
    const events = await this.prisma.autoCombatSessionEvent.findMany({
      where: {
        characterId,
        type: 'MOB_DEFEATED',
        createdAt: { gte: since },
        session: { map: { tier: missionTier } },
      },
      orderBy: [{ sessionId: 'asc' }, { sequence: 'asc' }],
      select: {
        sessionId: true,
        payloadJson: true,
        session: { select: { startedAt: true } },
      },
    });

    if (events.length === 0) return 0;

    const sinceTimestamp = since.getTime();
    const sessionsNeedingBaseline = new Set(
      events
        .filter(
          (event) =>
            event.session.startedAt.getTime() < sinceTimestamp &&
            this.getEventPayloadInteger(event.payloadJson, 'killsGained', 1) ===
              null,
        )
        .map((event) => event.sessionId),
    );
    const previousTotals = new Map<string, number>();

    await Promise.all(
      Array.from(sessionsNeedingBaseline).map(async (sessionId) => {
        const previousEvent =
          await this.prisma.autoCombatSessionEvent.findFirst({
            where: {
              sessionId,
              type: 'MOB_DEFEATED',
              createdAt: { lt: since },
            },
            orderBy: { sequence: 'desc' },
            select: { payloadJson: true },
          });
        const previousTotal = this.getCumulativeMobKills(
          previousEvent?.payloadJson,
        );

        if (previousTotal !== null) {
          previousTotals.set(sessionId, previousTotal);
        }
      }),
    );

    let kills = 0;

    for (const event of events) {
      const explicitKills = this.getEventPayloadInteger(
        event.payloadJson,
        'killsGained',
        1,
      );
      const cumulativeKills = this.getCumulativeMobKills(event.payloadJson);

      if (explicitKills !== null) {
        kills += explicitKills;
      } else if (cumulativeKills !== null) {
        const previousTotal = previousTotals.get(event.sessionId);

        if (previousTotal !== undefined) {
          kills += Math.max(1, cumulativeKills - previousTotal);
        } else if (event.session.startedAt.getTime() >= sinceTimestamp) {
          kills += Math.max(1, cumulativeKills);
        } else {
          // Sem o evento anterior preservado, a linha antiga comprova uma
          // derrota, mas nao permite atribuir todo o acumulado da sessao.
          kills += 1;
        }
      } else {
        kills += 1;
      }

      if (cumulativeKills !== null) {
        previousTotals.set(event.sessionId, cumulativeKills);
      }
    }

    return kills;
  }

  private getCumulativeMobKills(payload: Prisma.JsonValue | undefined) {
    return (
      this.getEventPayloadInteger(payload, 'totalKills', 0) ??
      this.getEventPayloadInteger(payload, 'totalCombats', 0)
    );
  }

  private getEventPayloadInteger(
    payload: Prisma.JsonValue | undefined,
    key: string,
    minimum: number,
  ) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const value = payload[key];

    if (typeof value !== 'number' && typeof value !== 'string') {
      return null;
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) return null;

    const integerValue = Math.floor(numericValue);

    return integerValue >= minimum ? integerValue : null;
  }

  private formatMissionAssignment(assignment: MissionAssignmentWithDefinition) {
    return {
      ...assignment,
      mission: {
        ...assignment.mission,
        targetValue: assignment.targetValue,
        rewardXp: assignment.rewardXp,
        rewardGold: assignment.rewardGold,
      },
    };
  }

  private getMissionPeriod(type: MissionType, now: Date) {
    if (type === MissionType.STORY) {
      return { key: 'story', startsAt: now, expiresAt: null };
    }

    const utcDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    if (type === MissionType.DAILY) {
      const expiresAt = new Date(utcDay);
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
      return {
        key: utcDay.toISOString().slice(0, 10),
        startsAt: utcDay,
        expiresAt,
      };
    }

    if (type === MissionType.MONTHLY) {
      const month = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const expiresAt = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      return {
        key: `month-${month.toISOString().slice(0, 7)}`,
        startsAt: month,
        expiresAt,
      };
    }

    const day = utcDay.getUTCDay() || 7;
    const monday = new Date(utcDay);
    monday.setUTCDate(monday.getUTCDate() - day + 1);
    const expiresAt = new Date(monday);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);
    return {
      key: `week-${monday.toISOString().slice(0, 10)}`,
      startsAt: monday,
      expiresAt,
    };
  }

  private async getCharacterOrThrow(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: { id: true, level: true },
    });

    if (!character) throw new NotFoundException('Personagem nao encontrado.');
    return character;
  }
}
