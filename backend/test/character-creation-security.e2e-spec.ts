import { ConflictException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CharacterStatus, UserRole } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { CharactersService } from './../src/modules/characters/characters.service';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Character creation security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let charactersService: CharactersService;
  let userId = '';
  const createdCharacterIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'character-creation-security-e2e-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    charactersService = app.get(CharactersService);
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (userId) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorUserId: userId },
            { entityId: { in: createdCharacterIds } },
          ],
        },
      });
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    userId = '';
    createdCharacterIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serializa o limite e concede os 250 Gold uma unica vez por conta', async () => {
    const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        email: `character-security-${suffix}@example.test`,
        passwordHash: 'not-used',
        role: UserRole.PLAYER,
      },
    });
    userId = user.id;

    const attempts = await Promise.allSettled(
      ['Alpha', 'Beta', 'Gamma'].map((name) =>
        charactersService.create(user.id, {
          name: `${name} ${suffix}`.slice(0, 24),
          className: 'Lutador',
        }),
      ),
    );
    const fulfilled = attempts.filter(
      (attempt) => attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt) => attempt.status === 'rejected',
    );

    if (fulfilled.length !== 2 || rejected.length !== 1) {
      const rejectionMessages = rejected.map((attempt) =>
        attempt.status === 'rejected'
          ? attempt.reason instanceof Error
            ? `${attempt.reason.name}: ${attempt.reason.message}`
            : String(attempt.reason)
          : '',
      );
      throw new Error(
        `Resultado concorrente inesperado: ${JSON.stringify({
          fulfilled: fulfilled.length,
          rejected: rejectionMessages,
        })}`,
      );
    }

    const rejectedReason: unknown = rejected[0].reason;
    expect(rejectedReason).toBeInstanceOf(ConflictException);

    const activeCharacters = await prisma.character.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, gold: true },
      orderBy: { createdAt: 'asc' },
    });
    createdCharacterIds.push(
      ...activeCharacters.map((character) => character.id),
    );

    expect(activeCharacters).toHaveLength(2);
    expect(
      activeCharacters.reduce((total, character) => total + character.gold, 0),
    ).toBe(250);
    expect(activeCharacters.map((character) => character.gold).sort()).toEqual([
      0, 250,
    ]);

    const [grantState] = await prisma.$queryRaw<
      Array<{ starterGoldGrantedAt: Date | null }>
    >`
      SELECT "starterGoldGrantedAt"
      FROM "users"
      WHERE "id" = ${user.id}
    `;
    expect(grantState?.starterGoldGrantedAt).toBeInstanceOf(Date);

    await prisma.character.update({
      where: { id: activeCharacters[0].id },
      data: {
        status: CharacterStatus.DELETED,
        deletedAt: new Date(),
      },
    });

    const replacement = await charactersService.create(user.id, {
      name: `Delta ${suffix}`.slice(0, 24),
      className: 'Lutador',
    });
    createdCharacterIds.push(replacement.id);
    const persistedReplacement = await prisma.character.findUniqueOrThrow({
      where: { id: replacement.id },
      select: { gold: true },
    });

    expect(persistedReplacement.gold).toBe(0);

    const initialGoldEntries = await prisma.economyLedgerEntry.count({
      where: {
        character: { userId: user.id },
        reason: 'CHARACTER_INITIAL_GOLD',
      },
    });
    expect(initialGoldEntries).toBe(1);
  }, 20_000);
});
