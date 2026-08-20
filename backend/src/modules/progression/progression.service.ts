import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IncursionSessionStatus,
  MissionStatus,
  MissionType,
  Prisma,
} from '@prisma/client';
import { calculateLevelProgress } from '../../common/utils/level.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateTutorialDto } from './dto/update-tutorial.dto';

const TUTORIAL_STEPS = [
  { key: 'shelter', title: 'Conheca o abrigo', href: '' },
  { key: 'map', title: 'Escolha um mapa', href: 'maps' },
  { key: 'gathering', title: 'Colete recursos', href: 'gathering' },
  { key: 'crafting', title: 'Fabrique seu primeiro item', href: 'crafting' },
  { key: 'equipment', title: 'Equipe o sobrevivente', href: 'equipment' },
];

type MissionAssignmentWithDefinition = Prisma.CharacterMissionGetPayload<{
  include: { mission: true };
}>;

type AchievementProgressWithDefinition = Prisma.CharacterAchievementGetPayload<{
  include: { achievement: true };
}>;

@Injectable()
export class ProgressionService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string, characterId: string) {
    const character = await this.getCharacterOrThrow(userId, characterId);
    const tutorial = await this.prisma.characterTutorialProgress.upsert({
      where: { characterId },
      update: {},
      create: { characterId },
    });

    await this.ensureMissionAssignments(characterId);
    const [missions, achievements] = await Promise.all([
      this.refreshMissions(characterId, character.level),
      this.syncAchievements(characterId, character.level),
    ]);

    return {
      serverNow: new Date().toISOString(),
      tutorial: { ...tutorial, steps: TUTORIAL_STEPS },
      missions,
      achievements,
    };
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
    const step = Math.max(existing.step, dto.step);
    const completed = Boolean(dto.completed || step >= TUTORIAL_STEPS.length);

    return this.prisma.characterTutorialProgress.update({
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

        const character = await tx.character.findUniqueOrThrow({
          where: { id: characterId },
          select: { level: true, xp: true },
        });
        const levelProgress = calculateLevelProgress(
          character.level,
          character.xp,
          assignment.mission.rewardXp,
        );

        await tx.character.update({
          where: { id: characterId },
          data: {
            level: levelProgress.newLevel,
            xp: levelProgress.totalXp,
            gold: { increment: assignment.mission.rewardGold },
          },
        });

        return {
          message: 'Recompensa da missao resgatada.',
          rewardXp: assignment.mission.rewardXp,
          rewardGold: assignment.mission.rewardGold,
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

      return {
        message: 'Recompensa da conquista resgatada.',
        rewardCash: achievement.achievement.rewardCash,
      };
    });
  }

  private async ensureMissionAssignments(characterId: string) {
    const now = new Date();
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
      await this.prisma.characterMission.upsert({
        where: {
          characterId_missionId_periodKey: {
            characterId,
            missionId: definition.id,
            periodKey: period.key,
          },
        },
        update: {},
        create: {
          characterId,
          missionId: definition.id,
          periodKey: period.key,
          targetValue: definition.targetValue,
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
      const progress = Math.min(
        assignment.targetValue,
        await this.getObjectiveProgress(
          characterId,
          assignment.mission.objectiveType,
          assignment.assignedAt,
          characterLevel,
        ),
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
  ) {
    if (objectiveType === 'REACH_LEVEL') return characterLevel;

    if (objectiveType === 'GATHER_UNITS') {
      const result = await this.prisma.gatheringSession.aggregate({
        where: { characterId, createdAt: { gte: since } },
        _sum: { collectedQuantity: true },
      });
      return result._sum.collectedQuantity ?? 0;
    }

    if (objectiveType === 'CRAFT_ITEMS') {
      const result = await this.prisma.craftingSession.aggregate({
        where: { characterId, completedAt: { gte: since } },
        _sum: { outputQuantity: true },
      });
      return result._sum.outputQuantity ?? 0;
    }

    if (objectiveType === 'DEFEAT_MOBS') {
      return this.prisma.autoCombatSessionEvent.count({
        where: {
          characterId,
          type: 'MOB_DEFEATED',
          createdAt: { gte: since },
        },
      });
    }

    if (objectiveType === 'COMPLETE_INCURSIONS') {
      return this.prisma.characterIncursionSession.count({
        where: {
          characterId,
          status: IncursionSessionStatus.CLAIMED,
          claimedAt: { gte: since },
        },
      });
    }

    return 0;
  }

  private getMissionPeriod(type: MissionType, now: Date) {
    if (type === MissionType.STORY) return { key: 'story', expiresAt: null };

    const utcDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    if (type === MissionType.DAILY) {
      const expiresAt = new Date(utcDay);
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
      return { key: utcDay.toISOString().slice(0, 10), expiresAt };
    }

    const day = utcDay.getUTCDay() || 7;
    const monday = new Date(utcDay);
    monday.setUTCDate(monday.getUTCDate() - day + 1);
    const expiresAt = new Date(monday);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);
    return { key: `week-${monday.toISOString().slice(0, 10)}`, expiresAt };
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
