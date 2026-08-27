import { Injectable } from '@nestjs/common';
import {
  ActivityStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  IncursionSessionStatus,
  WorldBossEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_AUTO_COMBAT_PHASES = [
  AutoCombatSessionPhase.HUNTING,
  AutoCombatSessionPhase.COMBAT_ACTIVE,
];

const ACTIVE_WORLD_BOSS_STATUSES = [
  WorldBossEventStatus.SCHEDULED,
  WorldBossEventStatus.LOBBY_OPEN,
  WorldBossEventStatus.ACTIVE,
];

export type ActiveCharacterPresenceStatus = {
  activeCharacters: number;
  onlineCharacters: number;
  activityCharacters: number;
  offlineActivityCharacters: number;
  /** Compatibilidade com clientes anteriores do endpoint /online-count. */
  onlinePlayers: number;
  updatedAt: string;
};

@Injectable()
export class ActiveCharacterPresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(
    onlineCharacterIds: Iterable<string>,
    now = new Date(),
  ): Promise<ActiveCharacterPresenceStatus> {
    const onlineIds = new Set(onlineCharacterIds);
    const activityRows = await this.prisma.character.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            autoCombatSessions: {
              some: {
                status: AutoCombatSessionStatus.ACTIVE,
                phase: { in: ACTIVE_AUTO_COMBAT_PHASES },
                endsAt: { gt: now },
              },
            },
          },
          {
            gatheringSessions: {
              some: { status: ActivityStatus.ACTIVE },
            },
          },
          {
            craftingSessions: {
              some: {
                status: ActivityStatus.ACTIVE,
                completesAt: { gt: now },
              },
            },
          },
          {
            incursionSessions: {
              some: {
                status: IncursionSessionStatus.ACTIVE,
                endsAt: { gt: now },
              },
            },
          },
          {
            worldBossParticipations: {
              some: {
                leftAt: null,
                event: {
                  status: { in: ACTIVE_WORLD_BOSS_STATUSES },
                  endsAt: { gt: now },
                },
              },
            },
          },
          { infirmaryEndsAt: { gt: now } },
        ],
      },
      select: { id: true },
    });

    const activityIds = new Set(activityRows.map(({ id }) => id));
    const activeIds = new Set([...onlineIds, ...activityIds]);
    const offlineActivityCharacters = [...activityIds].filter(
      (characterId) => !onlineIds.has(characterId),
    ).length;

    return {
      activeCharacters: activeIds.size,
      onlineCharacters: onlineIds.size,
      activityCharacters: activityIds.size,
      offlineActivityCharacters,
      onlinePlayers: activeIds.size,
      updatedAt: now.toISOString(),
    };
  }
}
