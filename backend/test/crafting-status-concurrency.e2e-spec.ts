import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { CharacterStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Crafting status concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let userId = '';
  let gameClassId = '';

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'crafting-concurrency-e2e-secret';
    process.env.JWT_EXPIRES_IN ??= '1h';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    if (gameClassId) {
      await prisma.gameClass.deleteMany({ where: { id: gameClassId } });
    }

    userId = '';
    gameClassId = '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria uma unica habilidade em consultas simultaneas de status', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        email: `crafting-concurrency-${suffix}@example.test`,
        passwordHash: 'not-used',
        role: UserRole.PLAYER,
      },
    });
    userId = user.id;

    const gameClass = await prisma.gameClass.create({
      data: {
        name: `Crafting E2E ${suffix}`,
        description: 'Classe temporaria para concorrencia de crafting.',
        baseStrength: 5,
        baseVitality: 5,
        baseAgility: 5,
        basePrecision: 5,
        baseTechnique: 5,
        baseWillpower: 5,
      },
    });
    gameClassId = gameClass.id;

    const character = await prisma.character.create({
      data: {
        name: `Crafting ${suffix}`,
        status: CharacterStatus.ACTIVE,
        currentHp: 100,
        maxHp: 100,
        userId: user.id,
        classId: gameClass.id,
      },
    });

    const accessToken = await jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    const statusPath = `/crafting/character/${character.id}/status`;

    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app.getHttpServer())
          .get(statusPath)
          .set('Authorization', `Bearer ${accessToken}`),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 12 }, () => 200),
    );

    const skills = await prisma.characterCraftingSkill.findMany({
      where: {
        characterId: character.id,
      },
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      characterId: character.id,
      level: 1,
      xp: 0,
      totalXp: 0,
    });
  });
});
