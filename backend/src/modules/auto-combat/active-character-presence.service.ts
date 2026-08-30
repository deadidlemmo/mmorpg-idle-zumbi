import { Injectable } from '@nestjs/common';
import {
  ActivityStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
  IncursionSessionStatus,
  WorldBossEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CosmeticsService } from '../cosmetics/cosmetics.service';

const ACTIVE_AUTO_COMBAT_PHASES = [
  AutoCombatSessionPhase.HUNTING,
  AutoCombatSessionPhase.COMBAT_ACTIVE,
];

const ACTIVE_WORLD_BOSS_STATUSES = [WorldBossEventStatus.ACTIVE];

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosmeticsService: CosmeticsService,
  ) {}

  async getStatus(
    onlineCharacterIds: Iterable<string>,
    now = new Date(),
  ): Promise<ActiveCharacterPresenceStatus> {
    const onlineIds = new Set(onlineCharacterIds);
    const activityIds = await this.getActivityCharacterIds(now);
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

  async getActiveCharacters(
    onlineCharacterIds: Iterable<string>,
    now = new Date(),
  ) {
    const onlineIds = new Set(onlineCharacterIds);
    const activityIds = await this.getActivityCharacterIds(now);
    const activeIds = new Set([...onlineIds, ...activityIds]);
    const status = this.buildStatus(onlineIds, activityIds, now);

    if (activeIds.size === 0) {
      return { ...status, characters: [] };
    }

    const characters = await this.prisma.character.findMany({
      where: {
        id: { in: [...activeIds] },
        status: CharacterStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        level: true,
        xp: true,
        avatarKey: true,
        class: { select: { id: true, name: true } },
        map: { select: { id: true, name: true, tier: true } },
      },
    });
    const appearances = await this.cosmeticsService.getResolvedAppearances(
      characters.map(({ id }) => id),
    );

    characters.sort((left, right) => {
      const onlineOrder =
        Number(onlineIds.has(right.id)) - Number(onlineIds.has(left.id));
      return (
        onlineOrder ||
        right.level - left.level ||
        right.xp - left.xp ||
        left.name.localeCompare(right.name, 'pt-BR') ||
        left.id.localeCompare(right.id)
      );
    });

    return {
      ...status,
      characters: characters.map((character) => ({
        character: {
          id: character.id,
          name: character.name,
          level: character.level,
          avatarKey: character.avatarKey,
          class: character.class,
          map: character.map,
        },
        appearance: appearances[character.id] ?? null,
        presence: {
          online: onlineIds.has(character.id),
          inActivity: activityIds.has(character.id),
          status: onlineIds.has(character.id) ? 'ONLINE' : 'ACTIVITY',
        },
      })),
    };
  }

  private async getActivityCharacterIds(now: Date) {
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
                confirmedAt: { not: null },
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

    return new Set(activityRows.map(({ id }) => id));
  }

  private buildStatus(
    onlineIds: Set<string>,
    activityIds: Set<string>,
    now: Date,
  ): ActiveCharacterPresenceStatus {
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
