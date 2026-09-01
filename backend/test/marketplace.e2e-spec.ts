import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CharacterStatus,
  InventoryItemType,
  ItemSlot,
  Rarity,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

type ListingResponseBody = {
  listing: {
    id: string;
    status: string;
    quantityRemaining: number;
    quantityCancelled: number;
    quantitySold: number;
  };
};

type PurchaseResponseBody = {
  purchase: { id: string };
};

describe('Mercado do Abrigo (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const userIds: string[] = [];
  const itemIds: string[] = [];
  const classIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'marketplace-e2e-secret';
    process.env.JWT_EXPIRES_IN ??= '1h';
    process.env.E2E_RATE_LIMIT_DISABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (itemIds.length) {
      await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    }
    if (classIds.length) {
      await prisma.gameClass.deleteMany({ where: { id: { in: classIds } } });
    }

    userIds.length = 0;
    itemIds.length = 0;
    classIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('mantém estoque, Gold e entrega consistentes sob repetição e concorrência', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const gameClass = await prisma.gameClass.create({
      data: {
        name: `Mercado E2E ${suffix}`,
        description: 'Classe temporária para o teste do mercado.',
        baseStrength: 5,
        baseVitality: 5,
        baseAgility: 5,
        basePrecision: 5,
        baseTechnique: 5,
        baseWillpower: 5,
      },
    });
    classIds.push(gameClass.id);

    const [sellerUser, buyerUser, noviceUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `market-seller-${suffix}@example.test`,
          passwordHash: 'not-used',
          role: UserRole.PLAYER,
        },
      }),
      prisma.user.create({
        data: {
          email: `market-buyer-${suffix}@example.test`,
          passwordHash: 'not-used',
          role: UserRole.PLAYER,
        },
      }),
      prisma.user.create({
        data: {
          email: `market-novice-${suffix}@example.test`,
          passwordHash: 'not-used',
          role: UserRole.PLAYER,
        },
      }),
    ]);
    userIds.push(sellerUser.id, buyerUser.id, noviceUser.id);

    const [seller, buyer, novice] = await Promise.all([
      prisma.character.create({
        data: {
          name: `Vendedor ${suffix}`,
          status: CharacterStatus.ACTIVE,
          currentHp: 100,
          maxHp: 100,
          level: 10,
          gold: 0,
          userId: sellerUser.id,
          classId: gameClass.id,
        },
      }),
      prisma.character.create({
        data: {
          name: `Comprador ${suffix}`,
          status: CharacterStatus.ACTIVE,
          currentHp: 100,
          maxHp: 100,
          level: 1,
          gold: 1000,
          userId: buyerUser.id,
          classId: gameClass.id,
        },
      }),
      prisma.character.create({
        data: {
          name: `Novato ${suffix}`,
          status: CharacterStatus.ACTIVE,
          currentHp: 100,
          maxHp: 100,
          level: 1,
          gold: 1000,
          userId: noviceUser.id,
          classId: gameClass.id,
        },
      }),
    ]);

    await prisma.characterCraftingSkill.create({
      data: { characterId: buyer.id, level: 10 },
    });

    const item = await prisma.item.create({
      data: {
        name: `Sucata de mercado ${suffix}`,
        slug: `sucata-mercado-${suffix}`,
        description: 'Item temporário para teste.',
        tier: 1,
        rarity: Rarity.COMMON,
        slot: ItemSlot.MATERIAL,
        family: 'Teste',
        isTradable: true,
      },
    });
    itemIds.push(item.id);

    await prisma.inventoryItem.create({
      data: {
        characterId: seller.id,
        itemId: item.id,
        type: InventoryItemType.MATERIAL,
        quantity: 10,
      },
    });

    const sellerToken = await jwtService.signAsync({
      sub: sellerUser.id,
      email: sellerUser.email,
      role: sellerUser.role,
      tokenVersion: sellerUser.tokenVersion,
    });
    const buyerToken = await jwtService.signAsync({
      sub: buyerUser.id,
      email: buyerUser.email,
      role: buyerUser.role,
      tokenVersion: buyerUser.tokenVersion,
    });
    const noviceToken = await jwtService.signAsync({
      sub: noviceUser.id,
      email: noviceUser.email,
      role: noviceUser.role,
      tokenVersion: noviceUser.tokenVersion,
    });
    const listingRequestId = randomUUID();
    const listingPayload = {
      characterId: seller.id,
      itemId: item.id,
      quantity: 6,
      unitPrice: 100,
      requestId: listingRequestId,
    };

    const listingResponses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post('/market/listings')
          .set('Authorization', `Bearer ${sellerToken}`)
          .send(listingPayload),
      ),
    );

    expect(listingResponses.map((response) => response.status)).toEqual([
      201, 201,
    ]);
    const firstListingBody = listingResponses[0]
      .body as unknown as ListingResponseBody;
    const secondListingBody = listingResponses[1]
      .body as unknown as ListingResponseBody;
    expect(firstListingBody.listing.id).toBe(secondListingBody.listing.id);

    const listingId = firstListingBody.listing.id;
    const sellerInventoryAfterListing = await prisma.inventoryItem.findUnique({
      where: {
        characterId_itemId: { characterId: seller.id, itemId: item.id },
      },
    });
    expect(sellerInventoryAfterListing?.quantity).toBe(4);
    expect(await prisma.marketListing.count({ where: { id: listingId } })).toBe(
      1,
    );

    const blockedNovicePurchase = await request(app.getHttpServer())
      .post(`/market/listings/${listingId}/buy`)
      .set('Authorization', `Bearer ${noviceToken}`)
      .send({
        characterId: novice.id,
        quantity: 1,
        requestId: randomUUID(),
      });

    expect(blockedNovicePurchase.status).toBe(400);
    const blockedNovicePurchaseBody = blockedNovicePurchase.body as unknown as {
      message: string;
    };
    expect(blockedNovicePurchaseBody.message).toContain('exigem Nv. 10');
    expect(
      await prisma.character.findUniqueOrThrow({ where: { id: novice.id } }),
    ).toMatchObject({ gold: 1000 });
    expect(
      await prisma.marketListing.findUniqueOrThrow({
        where: { id: listingId },
      }),
    ).toMatchObject({ quantityRemaining: 6 });

    const firstPurchaseRequestId = randomUUID();
    const repeatedPurchaseResponses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/market/listings/${listingId}/buy`)
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({
            characterId: buyer.id,
            quantity: 2,
            requestId: firstPurchaseRequestId,
          }),
      ),
    );

    expect(
      repeatedPurchaseResponses.map((response) => response.status),
    ).toEqual([200, 200]);
    const firstPurchaseBody = repeatedPurchaseResponses[0]
      .body as unknown as PurchaseResponseBody;
    const repeatedPurchaseBody = repeatedPurchaseResponses[1]
      .body as unknown as PurchaseResponseBody;
    expect(firstPurchaseBody.purchase.id).toBe(
      repeatedPurchaseBody.purchase.id,
    );

    const competingResponses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/market/listings/${listingId}/buy`)
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({
            characterId: buyer.id,
            quantity: 3,
            requestId: randomUUID(),
          }),
      ),
    );
    expect(
      competingResponses.map((response) => response.status).sort(),
    ).toEqual([200, 409]);

    const [listingAfterPurchases, buyerAfterPurchases, sellerAfterPurchases] =
      await Promise.all([
        prisma.marketListing.findUniqueOrThrow({ where: { id: listingId } }),
        prisma.character.findUniqueOrThrow({ where: { id: buyer.id } }),
        prisma.character.findUniqueOrThrow({ where: { id: seller.id } }),
      ]);
    const buyerInventory = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        characterId_itemId: { characterId: buyer.id, itemId: item.id },
      },
    });

    expect(listingAfterPurchases.quantityRemaining).toBe(1);
    expect(buyerAfterPurchases.gold).toBe(500);
    expect(sellerAfterPurchases.gold).toBe(500);
    expect(buyerInventory.quantity).toBe(5);
    expect(await prisma.marketPurchase.count({ where: { listingId } })).toBe(2);

    const cancelResponse = await request(app.getHttpServer())
      .post(`/market/listings/${listingId}/cancel`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ characterId: seller.id });

    expect(cancelResponse.status).toBe(200);
    const cancelBody = cancelResponse.body as unknown as ListingResponseBody;
    expect(cancelBody.listing).toMatchObject({
      status: 'CANCELLED',
      quantityRemaining: 0,
      quantityCancelled: 1,
      quantitySold: 5,
    });

    const sellerInventoryAfterCancel = await prisma.inventoryItem.findUnique({
      where: {
        characterId_itemId: { characterId: seller.id, itemId: item.id },
      },
    });
    expect(sellerInventoryAfterCancel?.quantity).toBe(5);
  });
});
