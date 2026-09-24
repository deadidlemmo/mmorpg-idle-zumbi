import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
} from '@prisma/client';
import type { Redis } from 'ioredis';
import { REDIS_COORDINATION_CLIENT } from '../../common/redis/redis.constants';
import { PrismaService } from '../../prisma/prisma.service';

export type StoredHuntingVisualPose = {
  areaId: 'suburbio' | 'casa-abandonada';
  tileX: number;
  tileY: number;
  direction: 'up' | 'down' | 'left' | 'right';
};

const VISUAL_POSITION_TTL_SECONDS = 24 * 60 * 60;
const AREA_BOUNDS = {
  suburbio: [48, 32],
  'casa-abandonada': [44, 28],
} as const;

export function parseStoredHuntingVisualPose(
  value: unknown,
): StoredHuntingVisualPose | null {
  if (!value || typeof value !== 'object') return null;
  const pose = value as Partial<StoredHuntingVisualPose>;
  if (pose.areaId !== 'suburbio' && pose.areaId !== 'casa-abandonada')
    return null;
  const [width, height] = AREA_BOUNDS[pose.areaId];
  if (
    typeof pose.tileX !== 'number' ||
    !Number.isFinite(pose.tileX) ||
    typeof pose.tileY !== 'number' ||
    !Number.isFinite(pose.tileY) ||
    pose.tileX < 0 ||
    pose.tileX >= width ||
    pose.tileY < 0 ||
    pose.tileY >= height ||
    !['up', 'down', 'left', 'right'].includes(pose.direction ?? '')
  )
    return null;
  return {
    areaId: pose.areaId,
    tileX: pose.tileX,
    tileY: pose.tileY,
    direction: pose.direction,
  } as StoredHuntingVisualPose;
}

@Injectable()
export class HuntingVisualPositionService {
  private readonly logger = new Logger(HuntingVisualPositionService.name);
  private warned = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_COORDINATION_CLIENT) private readonly redis: Redis | null,
  ) {}

  async getForCharacter(userId: string, characterId: string) {
    const session = await this.prisma.autoCombatSession.findFirst({
      where: {
        characterId,
        character: { userId, status: CharacterStatus.ACTIVE, deletedAt: null },
        status: AutoCombatSessionStatus.ACTIVE,
        phase: {
          in: [
            AutoCombatSessionPhase.HUNTING,
            AutoCombatSessionPhase.ENCOUNTER_READY,
            AutoCombatSessionPhase.COMBAT_ACTIVE,
          ],
        },
        endsAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, mapId: true, subMapId: true },
    });
    if (!session)
      return { sessionId: null, mapId: null, subMapId: null, pose: null };
    return {
      ...session,
      sessionId: session.id,
      pose: await this.load(session.id),
    };
  }

  async getPeersForCharacter(
    userId: string,
    characterId: string,
    onlineCharacterIds: Iterable<string>,
  ) {
    const own = await this.getForCharacter(userId, characterId);
    if (!own.sessionId || !own.mapId) {
      return { mapId: null, subMapId: null, players: [] };
    }
    const onlinePeerIds = [...new Set(onlineCharacterIds)].filter(
      (id) => id !== characterId,
    );
    if (onlinePeerIds.length <= 0) {
      return { mapId: own.mapId, subMapId: own.subMapId, players: [] };
    }
    const sessions = await this.prisma.autoCombatSession.findMany({
      where: {
        id: { not: own.sessionId },
        characterId: { not: characterId, in: onlinePeerIds },
        mapId: own.mapId,
        subMapId: own.subMapId,
        status: AutoCombatSessionStatus.ACTIVE,
        phase: {
          in: [
            AutoCombatSessionPhase.HUNTING,
            AutoCombatSessionPhase.ENCOUNTER_READY,
            AutoCombatSessionPhase.COMBAT_ACTIVE,
          ],
        },
        endsAt: { gt: new Date() },
        character: { status: CharacterStatus.ACTIVE, deletedAt: null },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      distinct: ['characterId'],
      take: 24,
      select: {
        id: true,
        phase: true,
        currentCombatIndex: true,
        currentMobId: true,
        currentMob: { select: { name: true } },
        character: { select: { id: true, name: true } },
      },
    });
    const players = await Promise.all(
      sessions.map(async (session) => {
        const pose = await this.load(session.id);
        if (!pose) return null;
        return {
          characterId: session.character.id,
          displayName: session.character.name,
          ...pose,
          visualState:
            session.phase === AutoCombatSessionPhase.COMBAT_ACTIVE &&
            session.currentMob
              ? ('combat' as const)
              : ('walking' as const),
          moving: false,
          combatMobName: session.currentMob?.name ?? null,
          combatCycleKey:
            session.phase === AutoCombatSessionPhase.COMBAT_ACTIVE &&
            session.currentMobId
              ? `${session.id}:${session.currentCombatIndex}:${session.currentMobId}`
              : null,
        };
      }),
    );
    return {
      mapId: own.mapId,
      subMapId: own.subMapId,
      players: players.filter((player) => player !== null),
    };
  }

  async load(sessionId: string): Promise<StoredHuntingVisualPose | null> {
    if (this.redis?.status !== 'ready') return null;
    try {
      const raw = await this.redis.get(this.key(sessionId));
      return raw
        ? parseStoredHuntingVisualPose(JSON.parse(raw) as unknown)
        : null;
    } catch (error) {
      this.warnOnce(error);
      return null;
    }
  }

  async save(sessionId: string, value: StoredHuntingVisualPose): Promise<void> {
    if (this.redis?.status !== 'ready') return;
    const pose = parseStoredHuntingVisualPose(value);
    if (!pose) return;
    try {
      await this.redis.set(
        this.key(sessionId),
        JSON.stringify(pose),
        'EX',
        VISUAL_POSITION_TTL_SECONDS,
      );
    } catch (error) {
      this.warnOnce(error);
    }
  }

  private key(sessionId: string) {
    return `auto-combat:visual-position:${sessionId}`;
  }

  private warnOnce(error: unknown) {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(
      `Posicao visual indisponivel: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
