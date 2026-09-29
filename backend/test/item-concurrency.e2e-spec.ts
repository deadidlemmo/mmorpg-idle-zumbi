import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ActivityStatus,
  CharacterStatus,
  CraftIngredientRole,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  Rarity,
  UserRole,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Item operations concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const userIds: string[] = [];
  const gameClassIds: string[] = [];
  const itemIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'item-concurrency-e2e-secret';
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
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (itemIds.length > 0) {
      await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    }
    if (gameClassIds.length > 0) {
      await prisma.gameClass.deleteMany({
        where: { id: { in: gameClassIds } },
      });
    }

    userIds.length = 0;
    itemIds.length = 0;
    gameClassIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createCharacterFixture(label: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let gameClass = await prisma.gameClass.findUnique({
      where: { name: 'Lutador' },
    });
    if (!gameClass) {
      gameClass = await prisma.gameClass.create({
        data: {
          name: 'Lutador',
          description: 'Classe temporaria para teste de concorrencia.',
          baseStrength: 5,
          baseVitality: 5,
          baseAgility: 5,
          basePrecision: 5,
          baseTechnique: 5,
          baseWillpower: 5,
        },
      });
      gameClassIds.push(gameClass.id);
    }

    const user = await prisma.user.create({
      data: {
        email: `${label.toLowerCase()}-${suffix}@example.test`,
        passwordHash: 'not-used',
        role: UserRole.PLAYER,
      },
    });
    userIds.push(user.id);

    const character = await prisma.character.create({
      data: {
        name: `${label} ${suffix}`,
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

    return { character, accessToken };
  }

  async function createItem(params: {
    name: string;
    slot: ItemSlot;
    isCraftable?: boolean;
    materialOrigin?: MaterialOrigin;
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item = await prisma.item.create({
      data: {
        name: `${params.name} ${suffix}`,
        slug: `${params.name.toLowerCase().replaceAll(' ', '-')}-${suffix}`,
        description: 'Item temporario para teste de concorrencia.',
        tier: 1,
        rarity: Rarity.COMMON,
        slot: params.slot,
        family: 'Teste de concorrencia',
        isCraftable: params.isCraftable ?? false,
        materialOrigin: params.materialOrigin,
      },
    });
    itemIds.push(item.id);
    return item;
  }

  it('permite somente uma retirada concorrente do mesmo estoque bancario', async () => {
    const { character, accessToken } = await createCharacterFixture('Banco');
    const item = await createItem({
      name: 'Material bancario',
      slot: ItemSlot.MATERIAL,
      materialOrigin: MaterialOrigin.DESMANCHE,
    });
    await prisma.bankItem.create({
      data: {
        characterId: character.id,
        itemId: item.id,
        type: InventoryItemType.MATERIAL,
        quantity: 10,
      },
    });

    const payload = {
      characterId: character.id,
      itemId: item.id,
      quantity: 6,
    };
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post('/inventory/bank/withdraw')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payload),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 400]);
    const [bankItem, inventoryItem] = await Promise.all([
      prisma.bankItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: item.id,
          },
        },
      }),
      prisma.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: item.id,
          },
        },
      }),
    ]);

    expect(bankItem?.quantity).toBe(4);
    expect(inventoryItem?.quantity).toBe(6);
  });

  it('devolve um item equipado somente uma vez sob duas requisicoes', async () => {
    const { character, accessToken } =
      await createCharacterFixture('Equipamento');
    const item = await createItem({
      name: 'Armadura equipada',
      slot: ItemSlot.ARMOR,
    });
    await prisma.equipment.create({
      data: {
        characterId: character.id,
        armorId: item.id,
      },
    });

    const payload = { characterId: character.id, slot: ItemSlot.ARMOR };
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post('/equipment/unequip')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payload),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 400]);
    const [equipment, inventoryItem] = await Promise.all([
      prisma.equipment.findUnique({ where: { characterId: character.id } }),
      prisma.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: item.id,
          },
        },
      }),
    ]);

    expect(equipment?.armorId).toBeNull();
    expect(inventoryItem?.quantity).toBe(1);
  });

  it('nao fabrica com ingredientes movidos concorrentemente ao banco', async () => {
    const { character, accessToken } = await createCharacterFixture('Criacao');
    const ingredient = await createItem({
      name: 'Ingrediente disputado',
      slot: ItemSlot.MATERIAL,
      materialOrigin: MaterialOrigin.DESMANCHE,
    });
    const output = await createItem({
      name: 'Armadura fabricada',
      slot: ItemSlot.ARMOR,
      isCraftable: true,
    });
    await prisma.craftingRecipe.create({
      data: {
        outputItemId: output.id,
        tier: 1,
        outputQuantity: 1,
        ingredients: {
          create: {
            itemId: ingredient.id,
            quantity: 6,
            role: CraftIngredientRole.MAIN_COMPONENT,
            origin: MaterialOrigin.DESMANCHE,
          },
        },
      },
    });
    await prisma.inventoryItem.create({
      data: {
        characterId: character.id,
        itemId: ingredient.id,
        type: InventoryItemType.MATERIAL,
        quantity: 6,
      },
    });

    const [craftResponse, depositResponse] = await Promise.all([
      request(app.getHttpServer())
        .post('/crafting/craft')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          characterId: character.id,
          itemId: output.id,
          quantity: 1,
        }),
      request(app.getHttpServer())
        .post('/inventory/bank/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          characterId: character.id,
          itemId: ingredient.id,
          quantity: 6,
        }),
    ]);

    expect(
      [craftResponse.status, depositResponse.status].filter(
        (status) => status === 201,
      ),
    ).toHaveLength(1);
    const [inventoryItem, bankItem, craftingSessions] = await Promise.all([
      prisma.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: ingredient.id,
          },
        },
      }),
      prisma.bankItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: ingredient.id,
          },
        },
      }),
      prisma.craftingSession.count({
        where: { characterId: character.id },
      }),
    ]);

    expect(inventoryItem).toBeNull();
    if (craftResponse.status === 201) {
      expect(depositResponse.status).toBeGreaterThanOrEqual(400);
      expect(bankItem).toBeNull();
      expect(craftingSessions).toBe(1);
    } else {
      expect(depositResponse.status).toBe(201);
      expect(craftResponse.status).toBeGreaterThanOrEqual(400);
      expect(bankItem?.quantity).toBe(6);
      expect(craftingSessions).toBe(0);
    }
  });

  it.each([false, true])(
    'enfileira receitas iguais e diferentes sem sobrepor horarios (concorrente: %s)',
    async (concurrent) => {
      const { character, accessToken } = await createCharacterFixture('Fila');
      const ingredient = await createItem({
        name: 'Material para fila',
        slot: ItemSlot.MATERIAL,
        materialOrigin: MaterialOrigin.DESMANCHE,
      });
      const outputs = await Promise.all(
        ['Armadura da fila', 'Elmo da fila'].map((name) =>
          createItem({ name, slot: ItemSlot.ARMOR, isCraftable: true }),
        ),
      );
      for (const output of outputs) {
        await prisma.craftingRecipe.create({
          data: {
            outputItemId: output.id,
            tier: 1,
            ingredients: {
              create: {
                itemId: ingredient.id,
                quantity: 2,
                role: CraftIngredientRole.MAIN_COMPONENT,
                origin: MaterialOrigin.DESMANCHE,
              },
            },
          },
        });
      }
      await prisma.inventoryItem.create({
        data: {
          characterId: character.id,
          itemId: ingredient.id,
          type: InventoryItemType.MATERIAL,
          quantity: 10,
        },
      });
      const enqueue = (itemId: string) =>
        request(app.getHttpServer())
          .post('/crafting/craft')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ characterId: character.id, itemId, quantity: 1 });

      expect((await enqueue(outputs[0].id)).status).toBe(201);
      const responses = concurrent
        ? await Promise.all(outputs.map((output) => enqueue(output.id)))
        : [await enqueue(outputs[0].id), await enqueue(outputs[1].id)];
      expect(responses.map(({ status }) => status)).toEqual([201, 201]);

      const sessions = await prisma.craftingSession.findMany({
        where: { characterId: character.id, status: ActivityStatus.ACTIVE },
        orderBy: { startedAt: 'asc' },
      });
      expect(sessions).toHaveLength(3);
      for (let index = 1; index < sessions.length; index += 1) {
        expect(sessions[index].startedAt).toEqual(
          sessions[index - 1].completesAt,
        );
      }
      expect(
        await prisma.inventoryItem.findUnique({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: ingredient.id,
            },
          },
          select: { quantity: true },
        }),
      ).toEqual({ quantity: 4 });

      const statusPath = `/crafting/character/${character.id}/status`;
      const snapshot = await request(app.getHttpServer())
        .get(statusPath)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(snapshot.body).toMatchObject({
        queue: { totalEntries: 3, queuedEntries: 2 },
        queuedSessions: [
          { id: sessions[1].id, queuePosition: 2, queueState: 'QUEUED' },
          { id: sessions[2].id, queuePosition: 3, queueState: 'QUEUED' },
        ],
      });

      // Complete the persisted queue without waiting for wall-clock timers.
      await prisma.craftingSession.updateMany({
        where: { characterId: character.id },
        data: { completesAt: new Date(Date.now() - 1000) },
      });
      for (let reload = 0; reload < 2; reload += 1) {
        await request(app.getHttpServer())
          .get(statusPath)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }
      const craftedItems = await prisma.inventoryItem.findMany({
        where: {
          characterId: character.id,
          itemId: { in: outputs.map(({ id }) => id) },
        },
        select: { itemId: true, quantity: true },
      });
      expect(craftedItems).toEqual(
        expect.arrayContaining([
          { itemId: outputs[0].id, quantity: 2 },
          { itemId: outputs[1].id, quantity: 1 },
        ]),
      );
      expect(
        await prisma.craftingSession.count({
          where: {
            characterId: character.id,
            status: ActivityStatus.COMPLETED,
          },
        }),
      ).toBe(3);
    },
  );

  it('rejeita pilhas com quantidade zero no PostgreSQL', async () => {
    const { character } = await createCharacterFixture('Restricao');
    const item = await createItem({
      name: 'Material invalido',
      slot: ItemSlot.MATERIAL,
      materialOrigin: MaterialOrigin.DESMANCHE,
    });
    const data = {
      characterId: character.id,
      itemId: item.id,
      type: InventoryItemType.MATERIAL,
      quantity: 0,
    };

    await expect(prisma.inventoryItem.create({ data })).rejects.toThrow();
    await expect(prisma.bankItem.create({ data })).rejects.toThrow();
  });
});
