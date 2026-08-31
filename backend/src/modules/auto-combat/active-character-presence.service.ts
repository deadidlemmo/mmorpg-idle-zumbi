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

export type ActiveCharacterActivity = {
  type:
    | 'AUTO_COMBAT'
    | 'GATHERING'
    | 'CRAFTING'
    | 'INCURSION'
    | 'WORLD_BOSS'
    | 'INFIRMARY';
  label: string;
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
        infirmaryEndsAt: true,
        class: { select: { id: true, name: true } },
        map: { select: { id: true, name: true, tier: true } },
        autoCombatSessions: {
          where: {
            status: AutoCombatSessionStatus.ACTIVE,
            phase: { in: ACTIVE_AUTO_COMBAT_PHASES },
            endsAt: { gt: now },
          },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            phase: true,
            map: { select: { name: true } },
            subMap: { select: { name: true } },
          },
        },
        gatheringSessions: {
          where: { status: ActivityStatus.ACTIVE },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            targetMaterial: { select: { name: true } },
          },
        },
        craftingSessions: {
          where: {
            status: ActivityStatus.ACTIVE,
            completesAt: { gt: now },
          },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            outputItem: { select: { name: true } },
          },
        },
        incursionSessions: {
          where: {
            status: IncursionSessionStatus.ACTIVE,
            endsAt: { gt: now },
          },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            incursion: { select: { name: true } },
          },
        },
        worldBossParticipations: {
          where: {
            leftAt: null,
            confirmedAt: { not: null },
            event: {
              status: { in: ACTIVE_WORLD_BOSS_STATUSES },
              endsAt: { gt: now },
            },
          },
          orderBy: { joinedAt: 'desc' },
          take: 1,
          select: {
            event: {
              select: {
                worldBoss: { select: { name: true } },
              },
            },
          },
        },
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
      characters: characters.map((character) => {
        const activity = this.resolveActivity(character, now);

        return {
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
            activity,
          },
        };
      }),
    };
  }

  private async getActivityCharacterIds(now: Date) {
    const activityRows = await this.prisma.character.findMany({
      where: {
        status: CharacterStatus.ACTIVE,
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

  private resolveActivity(
    character: {
      infirmaryEndsAt?: Date | null;
      autoCombatSessions?: Array<{
        phase: AutoCombatSessionPhase;
        map: { name: string };
        subMap: { name: string };
      }>;
      gatheringSessions?: Array<{
        targetMaterial: { name: string };
      }>;
      craftingSessions?: Array<{
        outputItem: { name: string };
      }>;
      incursionSessions?: Array<{
        incursion: { name: string };
      }>;
      worldBossParticipations?: Array<{
        event: { worldBoss: { name: string } };
      }>;
    },
    now: Date,
  ): ActiveCharacterActivity | null {
    const worldBoss = character.worldBossParticipations?.[0];
    if (worldBoss) {
      return {
        type: 'WORLD_BOSS',
        label: `Ameaça Global: ${worldBoss.event.worldBoss.name}`,
      };
    }

    const incursion = character.incursionSessions?.[0];
    if (incursion) {
      return {
        type: 'INCURSION',
        label: `Incursão: ${incursion.incursion.name}`,
      };
    }

    const autoCombat = character.autoCombatSessions?.[0];
    if (autoCombat) {
      return {
        type: 'AUTO_COMBAT',
        label:
          autoCombat.phase === AutoCombatSessionPhase.HUNTING
            ? `Rastreando em ${autoCombat.map.name}`
            : `Em combate em ${autoCombat.subMap.name}`,
      };
    }

    const gathering = character.gatheringSessions?.[0];
    if (gathering) {
      return {
        type: 'GATHERING',
        label: `Coletando ${gathering.targetMaterial.name}`,
      };
    }

    const crafting = character.craftingSessions?.[0];
    if (crafting) {
      return {
        type: 'CRAFTING',
        label: `Fabricando ${crafting.outputItem.name}`,
      };
    }

    if (character.infirmaryEndsAt && character.infirmaryEndsAt > now) {
      return { type: 'INFIRMARY', label: 'Na enfermaria' };
    }

    return null;
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
