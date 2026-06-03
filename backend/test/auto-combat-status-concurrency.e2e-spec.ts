import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
  UserRole,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const HUNTING_XP_PER_ENEMY = 5;
const LEVEL_1_HUNTING_SECONDS_PER_ENEMY = 15;

describe('AutoCombat status concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let createdIds: {
    userId?: string;
    characterId?: string;
    gameClassId?: string;
    mapId?: string;
    subMapId?: string;
    mobId?: string;
    encounterId?: string;
    sessionId?: string;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'auto-combat-e2e-secret';
    process.env.JWT_EXPIRES_IN ??= '1h';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    createdIds = {};
  });

  afterEach(async () => {
    await cleanupCreatedData();
  });

  afterAll(async () => {
    await app.close();
  });

  it('processa duas chamadas simultaneas de status sem duplicar ciclo de caca', async () => {
    const fixture = await createActiveHuntingSessionFixture();
    const accessToken = await jwtService.signAsync({
      sub: fixture.user.id,
      email: fixture.user.email,
      role: fixture.user.role,
    });

    const statusPath = `/auto-combat/${fixture.character.id}/status`;

    const [firstResponse, secondResponse] = await Promise.all([
      request(app.getHttpServer())
        .get(statusPath)
        .set('Authorization', `Bearer ${accessToken}`),
      request(app.getHttpServer())
        .get(statusPath)
        .set('Authorization', `Bearer ${accessToken}`),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const session = await prisma.autoCombatSession.findUniqueOrThrow({
      where: {
        id: fixture.session.id,
      },
    });
    const huntingSkill = await prisma.characterHuntingSkill.findUniqueOrThrow({
      where: {
        characterId: fixture.character.id,
      },
    });
    const huntEvents = await prisma.autoCombatSessionEvent.findMany({
      where: {
        sessionId: fixture.session.id,
        type: 'HUNT_TARGET_FOUND',
      },
      orderBy: {
        sequence: 'asc',
      },
    });

    expect(session.phase).toBe(AutoCombatSessionPhase.HUNTING);
    expect(session.status).toBe(AutoCombatSessionStatus.ACTIVE);
    expect(session.foundEnemiesCount).toBe(1);
    expect(session.huntingXpGained).toBe(HUNTING_XP_PER_ENEMY);
    expect(huntingSkill.totalXp).toBe(HUNTING_XP_PER_ENEMY);
    expect(huntingSkill.xp).toBe(HUNTING_XP_PER_ENEMY);
    expect(huntEvents).toHaveLength(1);
    expect(huntEvents[0].eventKey).toBe(`${fixture.session.id}:hunt:1`);
    expect(huntEvents[0].sequence).toBe(1);
  });

  async function createActiveHuntingSessionFixture() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const lastProcessedAt = new Date(
      now.getTime() - (LEVEL_1_HUNTING_SECONDS_PER_ENEMY + 2) * 1000,
    );
    const user = await prisma.user.create({
      data: {
        email: `auto-combat-e2e-${suffix}@example.test`,
        passwordHash: 'not-used',
        role: UserRole.PLAYER,
      },
    });
    createdIds.userId = user.id;

    const gameClass = await prisma.gameClass.create({
      data: {
        name: `AutoCombat E2E Class ${suffix}`,
        description: 'Classe temporaria para teste e2e de auto-combate.',
        baseStrength: 5,
        baseVitality: 5,
        baseAgility: 5,
        basePrecision: 5,
        baseTechnique: 5,
        baseWillpower: 5,
      },
    });
    createdIds.gameClassId = gameClass.id;

    const gameMap = await prisma.gameMap.create({
      data: {
        name: `AutoCombat E2E Map ${suffix}`,
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        description: 'Mapa temporario para teste e2e de auto-combate.',
      },
    });
    createdIds.mapId = gameMap.id;

    const subMap = await prisma.subMap.create({
      data: {
        name: `AutoCombat E2E SubMap ${suffix}`,
        description: 'Submapa temporario para teste e2e de auto-combate.',
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        mapId: gameMap.id,
      },
    });
    createdIds.subMapId = subMap.id;

    const mob = await prisma.mob.create({
      data: {
        name: `AutoCombat E2E Mob ${suffix}`,
        description: 'Mob temporario para teste e2e de auto-combate.',
        level: 1,
        tier: 1,
        hp: 20,
        attack: 1,
        defense: 1,
        speed: 1,
        xpReward: 7,
        mapId: gameMap.id,
      },
    });
    createdIds.mobId = mob.id;

    const encounter = await prisma.subMapEncounter.create({
      data: {
        subMapId: subMap.id,
        mobId: mob.id,
        weight: 100,
        isActive: true,
      },
    });
    createdIds.encounterId = encounter.id;

    const character = await prisma.character.create({
      data: {
        name: `AutoCombat E2E Character ${suffix}`,
        status: CharacterStatus.ACTIVE,
        level: 1,
        xp: 0,
        gold: 0,
        cash: 0,
        currentHp: 100,
        maxHp: 100,
        userId: user.id,
        classId: gameClass.id,
        mapId: gameMap.id,
      },
    });
    createdIds.characterId = character.id;

    await prisma.characterHuntingSkill.create({
      data: {
        characterId: character.id,
        level: 1,
        xp: 0,
        totalXp: 0,
      },
    });

    const session = await prisma.autoCombatSession.create({
      data: {
        characterId: character.id,
        subMapId: subMap.id,
        status: AutoCombatSessionStatus.ACTIVE,
        phase: AutoCombatSessionPhase.HUNTING,
        startedAt: lastProcessedAt,
        endsAt: new Date(now.getTime() + 60 * 60 * 1000),
        lastProcessedAt,
        durationSeconds: 60 * 60,
        roundDurationSeconds: 3,
        huntStartedAt: lastProcessedAt,
        lastHuntProcessedAt: lastProcessedAt,
        huntingLevelAtStart: 1,
        huntingXpGained: 0,
        foundEnemiesCount: 0,
        bonusEnemiesFound: 0,
        selectedEncounterId: encounter.id,
        selectedEncounterMobId: mob.id,
        currentMobId: null,
        currentMobHp: null,
        currentMobMaxHp: null,
        currentRound: 0,
        currentCombatIndex: 1,
      },
    });
    createdIds.sessionId = session.id;

    return {
      user,
      character,
      session,
    };
  }

  async function cleanupCreatedData() {
    if (createdIds.characterId) {
      await prisma.autoCombatSessionEvent.deleteMany({
        where: {
          characterId: createdIds.characterId,
        },
      });
      await prisma.autoCombatSession.deleteMany({
        where: {
          characterId: createdIds.characterId,
        },
      });
      await prisma.characterHuntingSkill.deleteMany({
        where: {
          characterId: createdIds.characterId,
        },
      });
      await prisma.character.deleteMany({
        where: {
          id: createdIds.characterId,
        },
      });
    }

    if (createdIds.encounterId) {
      await prisma.subMapEncounter.deleteMany({
        where: {
          id: createdIds.encounterId,
        },
      });
    }

    if (createdIds.mobId) {
      await prisma.mob.deleteMany({
        where: {
          id: createdIds.mobId,
        },
      });
    }

    if (createdIds.subMapId) {
      await prisma.subMap.deleteMany({
        where: {
          id: createdIds.subMapId,
        },
      });
    }

    if (createdIds.mapId) {
      await prisma.gameMap.deleteMany({
        where: {
          id: createdIds.mapId,
        },
      });
    }

    if (createdIds.gameClassId) {
      await prisma.gameClass.deleteMany({
        where: {
          id: createdIds.gameClassId,
        },
      });
    }

    if (createdIds.userId) {
      await prisma.user.deleteMany({
        where: {
          id: createdIds.userId,
        },
      });
    }

    createdIds = {};
  }
});
