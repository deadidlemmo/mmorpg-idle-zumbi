import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CharacterStatus, UserRole } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { grantCharacterXp } from './../src/common/utils/character-xp.util';
import { calculateLevelProgress } from './../src/common/utils/level.util';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Character XP concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string | null = null;
  let gameClassId: string | null = null;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'character-xp-concurrency-e2e-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (gameClassId) {
      await prisma.gameClass.delete({ where: { id: gameClassId } });
    }
    userId = null;
    gameClassId = null;
  });

  afterAll(async () => {
    await app.close();
  });

  it('soma todas as recompensas simultaneas sem perder XP ou nivel', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const gameClass = await prisma.gameClass.create({
      data: {
        name: `Classe XP ${suffix}`,
        description: 'Classe temporaria para teste de concorrencia de XP.',
        baseStrength: 5,
        baseVitality: 5,
        baseAgility: 5,
        basePrecision: 5,
        baseTechnique: 5,
        baseWillpower: 5,
      },
    });
    gameClassId = gameClass.id;
    const user = await prisma.user.create({
      data: {
        email: `xp-${suffix}@example.test`,
        passwordHash: 'not-used',
        role: UserRole.PLAYER,
      },
    });
    userId = user.id;
    const character = await prisma.character.create({
      data: {
        name: `XP ${suffix}`,
        status: CharacterStatus.ACTIVE,
        currentHp: 100,
        maxHp: 100,
        userId: user.id,
        classId: gameClass.id,
      },
    });
    const rewards = Array.from({ length: 24 }, (_, index) => 101 + index);

    await Promise.all(
      rewards.map((reward) =>
        prisma.$transaction(
          (tx) => grantCharacterXp(tx, character.id, reward),
          { maxWait: 15_000, timeout: 30_000 },
        ),
      ),
    );

    const persisted = await prisma.character.findUniqueOrThrow({
      where: { id: character.id },
      select: { level: true, xp: true },
    });
    const expectedXp = rewards.reduce((total, reward) => total + reward, 0);
    const expectedProgress = calculateLevelProgress(1, 0, expectedXp);

    expect(persisted).toEqual({
      level: expectedProgress.newLevel,
      xp: expectedXp,
    });
  });
});
