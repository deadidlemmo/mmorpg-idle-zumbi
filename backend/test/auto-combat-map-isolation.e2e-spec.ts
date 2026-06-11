import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AutoCombatHuntBatchStatus,
  CharacterStatus,
  UserRole,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AutoCombat map isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let createdIds: {
    userId?: string;
    characterId?: string;
    gameClassId?: string;
    mapIds: string[];
    subMapIds: string[];
    mobIds: string[];
    encounterIds: string[];
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'auto-combat-map-isolation-e2e-secret';
    process.env.JWT_EXPIRES_IN ??= '1h';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    createdIds = buildEmptyCreatedIds();
  });

  afterEach(async () => {
    await cleanupCreatedData();
  });

  afterAll(async () => {
    await app.close();
  });

  it('mantem a caca e os mobs rastreados vinculados ao mapa de origem', async () => {
    const fixture = await createTwoMapFixture();
    const accessToken = await jwtService.signAsync({
      sub: fixture.user.id,
      email: fixture.user.email,
      role: fixture.user.role,
    });

    const startMapAResponse = await request(app.getHttpServer())
      .post('/auto-combat/hunt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        characterId: fixture.character.id,
        mapId: fixture.mapA.id,
      });

    expect(startMapAResponse.status).toBe(201);
    expect(startMapAResponse.body.active).toBe(true);
    expect(startMapAResponse.body.currentMapId).toBe(fixture.mapA.id);
    expect(startMapAResponse.body.session.mapId).toBe(fixture.mapA.id);
    expect(startMapAResponse.body.huntBatch.status).toBe(
      AutoCombatHuntBatchStatus.HUNTING,
    );
    expect(startMapAResponse.body.huntBatch.mapId).toBe(fixture.mapA.id);
    expect(startMapAResponse.body.huntBatch.selectedEncounterMobId).toBe(
      fixture.mobA.id,
    );
    expect(startMapAResponse.body.map.id).toBe(fixture.mapA.id);
    expect(startMapAResponse.body.subMap.map.id).toBe(fixture.mapA.id);
    expect(startMapAResponse.body.selectedEncounter.mobId).toBe(
      fixture.mobA.id,
    );
    expect(startMapAResponse.body.selectedEncounter.mobId).not.toBe(
      fixture.mobB.id,
    );

    const blockedMapBStartResponse = await request(app.getHttpServer())
      .post('/auto-combat/hunt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        characterId: fixture.character.id,
        mapId: fixture.mapB.id,
      });

    expect(blockedMapBStartResponse.status).toBe(409);

    const blockedTravelResponse = await request(app.getHttpServer())
      .patch(`/characters/${fixture.character.id}/current-map`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mapId: fixture.mapB.id,
      });

    expect(blockedTravelResponse.status).toBe(409);

    const statusResponse = await request(app.getHttpServer())
      .get(`/auto-combat/${fixture.character.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.active).toBe(true);
    expect(statusResponse.body.currentMapId).toBe(fixture.mapA.id);
    expect(statusResponse.body.currentMapId).not.toBe(fixture.mapB.id);
    expect(statusResponse.body.session.mapId).toBe(fixture.mapA.id);
    expect(statusResponse.body.hunting.mapId).toBe(fixture.mapA.id);
    expect(statusResponse.body.map.id).toBe(fixture.mapA.id);
    expect(statusResponse.body.selectedEncounter.mobId).toBe(fixture.mobA.id);
    expect(statusResponse.body.selectedEncounter.mobId).not.toBe(
      fixture.mobB.id,
    );

    const persistedSession = await prisma.autoCombatSession.findUniqueOrThrow({
      where: {
        id: statusResponse.body.session.id,
      },
    });

    expect(persistedSession.mapId).toBe(fixture.mapA.id);
    expect(persistedSession.mapId).not.toBe(fixture.mapB.id);
    expect(persistedSession.selectedEncounterMobId).toBe(fixture.mobA.id);
    expect(persistedSession.selectedEncounterMobId).not.toBe(fixture.mobB.id);

    const persistedHuntBatch =
      await prisma.autoCombatHuntBatch.findUniqueOrThrow({
        where: {
          sessionId: persistedSession.id,
        },
      });

    expect(persistedHuntBatch.status).toBe(AutoCombatHuntBatchStatus.HUNTING);
    expect(persistedHuntBatch.mapId).toBe(fixture.mapA.id);
    expect(persistedHuntBatch.mapId).not.toBe(fixture.mapB.id);
    expect(persistedHuntBatch.selectedEncounterMobId).toBe(fixture.mobA.id);
    expect(persistedHuntBatch.selectedEncounterMobId).not.toBe(fixture.mobB.id);

    const stopResponse = await request(app.getHttpServer())
      .post(`/auto-combat/${fixture.character.id}/stop`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect([200, 201]).toContain(stopResponse.status);
  });

  async function createTwoMapFixture() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        email: `auto-combat-map-isolation-${suffix}@example.test`,
        passwordHash: 'not-used',
        role: UserRole.PLAYER,
      },
    });
    createdIds.userId = user.id;

    const existingGameClass = await prisma.gameClass.findUnique({
      where: {
        name: 'Lutador',
      },
    });
    const gameClass =
      existingGameClass ??
      (await prisma.gameClass.create({
        data: {
          name: 'Lutador',
          description: 'Classe canonica para teste e2e de isolamento por mapa.',
          baseStrength: 8,
          baseVitality: 8,
          baseAgility: 2,
          basePrecision: 2,
          baseTechnique: 5,
          baseWillpower: 5,
        },
      }));

    if (!existingGameClass) {
      createdIds.gameClassId = gameClass.id;
    }

    const mapA = await prisma.gameMap.create({
      data: {
        name: `AutoCombat Map A ${suffix}`,
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        description: 'Mapa A temporario para isolamento de auto-combate.',
      },
    });
    createdIds.mapIds.push(mapA.id);

    const mapB = await prisma.gameMap.create({
      data: {
        name: `AutoCombat Map B ${suffix}`,
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        description: 'Mapa B temporario para isolamento de auto-combate.',
      },
    });
    createdIds.mapIds.push(mapB.id);

    const subMapA = await prisma.subMap.create({
      data: {
        name: `AutoCombat SubMap A ${suffix}`,
        description: 'Submapa A temporario para isolamento de auto-combate.',
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        mapId: mapA.id,
      },
    });
    createdIds.subMapIds.push(subMapA.id);

    const subMapB = await prisma.subMap.create({
      data: {
        name: `AutoCombat SubMap B ${suffix}`,
        description: 'Submapa B temporario para isolamento de auto-combate.',
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        mapId: mapB.id,
      },
    });
    createdIds.subMapIds.push(subMapB.id);

    const mobA = await prisma.mob.create({
      data: {
        name: `AutoCombat Mob A ${suffix}`,
        description: 'Mob A temporario para isolamento de auto-combate.',
        level: 1,
        tier: 1,
        hp: 20,
        attack: 1,
        defense: 1,
        speed: 1,
        xpReward: 7,
        mapId: mapA.id,
      },
    });
    createdIds.mobIds.push(mobA.id);

    const mobB = await prisma.mob.create({
      data: {
        name: `AutoCombat Mob B ${suffix}`,
        description: 'Mob B temporario para isolamento de auto-combate.',
        level: 1,
        tier: 1,
        hp: 20,
        attack: 1,
        defense: 1,
        speed: 1,
        xpReward: 7,
        mapId: mapB.id,
      },
    });
    createdIds.mobIds.push(mobB.id);

    const encounterA = await prisma.subMapEncounter.create({
      data: {
        subMapId: subMapA.id,
        mobId: mobA.id,
        weight: 100,
        isActive: true,
      },
    });
    createdIds.encounterIds.push(encounterA.id);

    const encounterB = await prisma.subMapEncounter.create({
      data: {
        subMapId: subMapB.id,
        mobId: mobB.id,
        weight: 100,
        isActive: true,
      },
    });
    createdIds.encounterIds.push(encounterB.id);

    const character = await prisma.character.create({
      data: {
        name: `AutoCombat Map Isolation Character ${suffix}`,
        status: CharacterStatus.ACTIVE,
        level: 1,
        xp: 0,
        gold: 0,
        cash: 0,
        currentHp: 100,
        maxHp: 100,
        userId: user.id,
        classId: gameClass.id,
        mapId: mapA.id,
      },
    });
    createdIds.characterId = character.id;

    return {
      user,
      character,
      mapA,
      mapB,
      mobA,
      mobB,
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

    if (createdIds.encounterIds.length > 0) {
      await prisma.subMapEncounter.deleteMany({
        where: {
          id: {
            in: createdIds.encounterIds,
          },
        },
      });
    }

    if (createdIds.mobIds.length > 0) {
      await prisma.mob.deleteMany({
        where: {
          id: {
            in: createdIds.mobIds,
          },
        },
      });
    }

    if (createdIds.subMapIds.length > 0) {
      await prisma.subMap.deleteMany({
        where: {
          id: {
            in: createdIds.subMapIds,
          },
        },
      });
    }

    if (createdIds.mapIds.length > 0) {
      await prisma.gameMap.deleteMany({
        where: {
          id: {
            in: createdIds.mapIds,
          },
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

    createdIds = buildEmptyCreatedIds();
  }

  function buildEmptyCreatedIds() {
    return {
      mapIds: [],
      subMapIds: [],
      mobIds: [],
      encounterIds: [],
    };
  }
});
