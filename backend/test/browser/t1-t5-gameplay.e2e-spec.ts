import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { InventoryItemType, ItemSlot, PrismaClient } from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { getEquipmentProgression } from '../../src/common/utils/stats.util';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const password = 'TesteE2E123';
const prisma = new PrismaClient();

const equipmentSlots = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;

const slotViewKeys: Record<(typeof equipmentSlots)[number], string> = {
  [ItemSlot.MAIN_HAND]: 'mainHand',
  [ItemSlot.OFF_HAND]: 'offHand',
  [ItemSlot.HEAD]: 'head',
  [ItemSlot.ARMOR]: 'armor',
  [ItemSlot.PANTS]: 'pants',
  [ItemSlot.BOOTS]: 'boots',
};

const slotLabels: Record<(typeof equipmentSlots)[number], string> = {
  [ItemSlot.MAIN_HAND]: 'Mão principal',
  [ItemSlot.OFF_HAND]: 'Mão secundária',
  [ItemSlot.HEAD]: 'Cabeça',
  [ItemSlot.ARMOR]: 'Armadura',
  [ItemSlot.PANTS]: 'Calças',
  [ItemSlot.BOOTS]: 'Botas',
};

const statBudgetBySlot: Record<(typeof equipmentSlots)[number], number> = {
  [ItemSlot.MAIN_HAND]: 8,
  [ItemSlot.OFF_HAND]: 6,
  [ItemSlot.HEAD]: 5,
  [ItemSlot.ARMOR]: 8,
  [ItemSlot.PANTS]: 6,
  [ItemSlot.BOOTS]: 5,
};

const classFixtures = [
  { className: 'Lutador', avatarKey: 'lutador-01' },
  { className: 'Assassino', avatarKey: 'assassino-01' },
  { className: 'Atirador', avatarKey: 'atirador-01' },
  { className: 'Médico', avatarKey: 'medico-01' },
] as const;

type IngredientFixture = {
  itemId: string;
  quantity: number;
  name: string;
};

type EquipmentFixture = {
  id: string;
  name: string;
  tier: number;
  slot: (typeof equipmentSlots)[number];
  classId: string;
  className: string;
  mapMinLevel: number;
  strengthBonus: number;
  vitalityBonus: number;
  agilityBonus: number;
  precisionBonus: number;
  techniqueBonus: number;
  willpowerBonus: number;
  recipeId: string;
  outputQuantity: number;
  ingredients: IngredientFixture[];
};

type QaCharacter = {
  id: string;
  name: string;
  email: string;
  classId: string;
  className: string;
  accessToken: string;
  api: APIRequestContext;
  equipment: EquipmentFixture[];
};

type CraftResponse = {
  craftedItem: { id: string; slot: ItemSlot; tier: number; quantity: number };
  consumed: Array<{ itemId: string; quantity: number }>;
  craftingSession: { id: string; status: string; completesAt: string };
};

const qaCharacters: QaCharacter[] = [];
const userEmails: string[] = [];
const expectedMaterials = new Map<string, Map<string, number>>();
let saleFixture: EquipmentFixture | null = null;

function getFixtureRecipes(character: QaCharacter) {
  return saleFixture && character === qaCharacters[0]
    ? [...character.equipment, saleFixture]
    : character.equipment;
}

function sumStats(items: EquipmentFixture[]) {
  const totals = items.reduce(
    (total, item) => ({
      strength: total.strength + item.strengthBonus,
      vitality: total.vitality + item.vitalityBonus,
      agility: total.agility + item.agilityBonus,
      precision: total.precision + item.precisionBonus,
      technique: total.technique + item.techniqueBonus,
      willpower: total.willpower + item.willpowerBonus,
    }),
    {
      strength: 0,
      vitality: 0,
      agility: 0,
      precision: 0,
      technique: 0,
      willpower: 0,
    },
  );
  const { bonusPercent } = getEquipmentProgression(items);

  if (bonusPercent <= 0) {
    return totals;
  }

  const multiplier = 1 + bonusPercent / 100;

  return {
    strength: Math.round(totals.strength * multiplier),
    vitality: Math.round(totals.vitality * multiplier),
    agility: Math.round(totals.agility * multiplier),
    precision: Math.round(totals.precision * multiplier),
    technique: Math.round(totals.technique * multiplier),
    willpower: Math.round(totals.willpower * multiplier),
  };
}

async function authenticatePage(page: Page, character: QaCharacter) {
  await page.addInitScript(
    ({ token, characterId, tokenKey, characterKey }) => {
      localStorage.setItem(tokenKey, token);
      localStorage.setItem(characterKey, characterId);
    },
    {
      token: character.accessToken,
      characterId: character.id,
      tokenKey: accessTokenKey,
      characterKey: selectedCharacterKey,
    },
  );
}

async function readErrorMessage(response: {
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}) {
  try {
    const body = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    return Array.isArray(body.message)
      ? body.message.join(' ')
      : (body.message ?? body.error ?? '');
  } catch {
    return response.text();
  }
}

async function requireOk(
  response: {
    ok: () => boolean;
    status: () => number;
    text: () => Promise<string>;
  },
  operation: string,
) {
  if (!response.ok()) {
    throw new Error(
      `${operation} falhou com HTTP ${response.status()}: ${await response.text()}`,
    );
  }
}

async function loadEquipmentFixtures(classId: string, className: string) {
  const items = await prisma.item.findMany({
    where: {
      classId,
      tier: 1,
      isCraftable: true,
      slot: { in: [...equipmentSlots] },
    },
    include: {
      map: { select: { minLevel: true } },
      craftingRecipeOutput: {
        include: {
          ingredients: {
            include: { item: { select: { name: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const fixtures = items.map((item): EquipmentFixture => {
    if (
      !equipmentSlots.includes(item.slot as (typeof equipmentSlots)[number])
    ) {
      throw new Error(`Slot inválido no catálogo E2E: ${item.slot}.`);
    }
    if (!item.craftingRecipeOutput) {
      throw new Error(`Receita ausente para ${item.name}.`);
    }

    return {
      id: item.id,
      name: item.name,
      tier: item.tier,
      slot: item.slot as (typeof equipmentSlots)[number],
      classId,
      className,
      mapMinLevel: item.map?.minLevel ?? 1,
      strengthBonus: item.strengthBonus,
      vitalityBonus: item.vitalityBonus,
      agilityBonus: item.agilityBonus,
      precisionBonus: item.precisionBonus,
      techniqueBonus: item.techniqueBonus,
      willpowerBonus: item.willpowerBonus,
      recipeId: item.craftingRecipeOutput.id,
      outputQuantity: item.craftingRecipeOutput.outputQuantity,
      ingredients: item.craftingRecipeOutput.ingredients.map((ingredient) => ({
        itemId: ingredient.itemId,
        quantity: ingredient.quantity,
        name: ingredient.item.name,
      })),
    };
  });

  const selected = equipmentSlots.map((slot) => {
    const item = fixtures.find((fixture) => fixture.slot === slot);
    if (!item)
      throw new Error(`${className} não possui equipamento T1 em ${slot}.`);
    return item;
  });

  return { all: fixtures, selected };
}

test.describe('ciclo jogável de equipamentos T1-T5', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    if (!browser.isConnected()) {
      throw new Error('Navegador Playwright indisponível para o E2E.');
    }
    const suffix = `${Date.now()}${randomUUID().replaceAll('-', '').slice(0, 8)}`;

    for (const [accountIndex, classes] of [
      classFixtures.slice(0, 2),
      classFixtures.slice(2, 4),
    ].entries()) {
      const email = `gameplay-e2e-${suffix}-${accountIndex}@dead-idle.test`;
      userEmails.push(email);
      const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });
      const registration = await publicApi.post('/auth/register', {
        data: {
          email,
          password,
          acceptTerms: true,
          acceptPrivacy: true,
        },
      });
      await requireOk(registration, `Registro da conta QA ${accountIndex + 1}`);
      const auth = (await registration.json()) as { accessToken: string };
      await publicApi.dispose();

      const api = await playwrightRequest.newContext({
        baseURL: apiUrl,
        extraHTTPHeaders: { Authorization: `Bearer ${auth.accessToken}` },
      });

      for (const [classIndex, classFixture] of classes.entries()) {
        const characterName = `QA${accountIndex}${classIndex}${suffix.slice(-8)}`;
        const response = await api.post('/characters', {
          data: {
            name: characterName,
            className: classFixture.className,
            avatarKey: classFixture.avatarKey,
          },
        });
        await requireOk(
          response,
          `Criação do personagem ${classFixture.className}`,
        );
        const created = (await response.json()) as { id: string };
        const persisted = await prisma.character.findUniqueOrThrow({
          where: { id: created.id },
          select: { classId: true },
        });
        const fixtures = await loadEquipmentFixtures(
          persisted.classId,
          classFixture.className,
        );

        qaCharacters.push({
          id: created.id,
          name: characterName,
          email,
          classId: persisted.classId,
          className: classFixture.className,
          accessToken: auth.accessToken,
          api,
          equipment: fixtures.selected,
        });

        await prisma.characterTutorialProgress.upsert({
          where: { characterId: created.id },
          create: {
            characterId: created.id,
            step: 5,
            completed: true,
            completedAt: new Date(),
          },
          update: {
            step: 5,
            completed: true,
            completedAt: new Date(),
            dismissedAt: null,
          },
        });

        if (classFixture.className === 'Lutador') {
          saleFixture =
            fixtures.all.filter(
              (item) => item.slot === ItemSlot.MAIN_HAND,
            )[1] ?? null;
        }
      }
    }

    if (!saleFixture) {
      throw new Error(
        'Segundo equipamento de mão principal T1 não encontrado.',
      );
    }
  });

  test.afterAll(async () => {
    for (const api of new Set(qaCharacters.map((character) => character.api))) {
      await api.dispose();
    }
    if (userEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
    }
    await prisma.$disconnect();
  });

  test('1. cria personagens QA isolados para as quatro classes', () => {
    expect(qaCharacters).toHaveLength(4);
    expect(qaCharacters.map((character) => character.className).sort()).toEqual(
      classFixtures.map((fixture) => fixture.className).sort(),
    );
    expect(new Set(qaCharacters.map((character) => character.id)).size).toBe(4);

    for (const character of qaCharacters) {
      expect(character.equipment).toHaveLength(equipmentSlots.length);
      expect(new Set(character.equipment.map((item) => item.slot))).toEqual(
        new Set(equipmentSlots),
      );
      expect(
        character.equipment.every((item) => item.classId === character.classId),
      ).toBe(true);
    }
  });

  test('2. concede somente os materiais necessários pela fixture', async () => {
    for (const character of qaCharacters) {
      await prisma.inventoryItem.deleteMany({
        where: { characterId: character.id },
      });
      const totals = new Map<string, number>();

      for (const recipe of getFixtureRecipes(character)) {
        for (const ingredient of recipe.ingredients) {
          totals.set(
            ingredient.itemId,
            (totals.get(ingredient.itemId) ?? 0) + ingredient.quantity,
          );
        }
      }

      expectedMaterials.set(character.id, totals);
      await prisma.inventoryItem.createMany({
        data: Array.from(totals, ([itemId, quantity]) => ({
          characterId: character.id,
          itemId,
          quantity,
          type: InventoryItemType.MATERIAL,
        })),
      });

      const persisted = await prisma.inventoryItem.findMany({
        where: { characterId: character.id },
        select: { itemId: true, quantity: true, type: true },
      });
      expect(persisted).toHaveLength(totals.size);
      expect(
        new Map(persisted.map((entry) => [entry.itemId, entry.quantity])),
      ).toEqual(totals);
      expect(
        persisted.every((entry) => entry.type === InventoryItemType.MATERIAL),
      ).toBe(true);
    }
  });

  test('3. fabrica um equipamento de cada slot para as quatro classes', async () => {
    for (const character of qaCharacters) {
      for (const fixture of getFixtureRecipes(character)) {
        const before = new Map(
          (
            await prisma.inventoryItem.findMany({
              where: {
                characterId: character.id,
                itemId: { in: fixture.ingredients.map((item) => item.itemId) },
              },
              select: { itemId: true, quantity: true },
            })
          ).map((entry) => [entry.itemId, entry.quantity]),
        );
        const response = await character.api.post('/crafting/craft', {
          data: { characterId: character.id, itemId: fixture.id },
        });
        await requireOk(response, `Craft de ${fixture.name}`);
        const body = (await response.json()) as CraftResponse;

        expect(body.craftedItem).toMatchObject({
          id: fixture.id,
          slot: fixture.slot,
          tier: 1,
          quantity: fixture.outputQuantity,
        });
        expect(body.consumed).toHaveLength(fixture.ingredients.length);

        const afterStart = new Map(
          (
            await prisma.inventoryItem.findMany({
              where: {
                characterId: character.id,
                itemId: { in: fixture.ingredients.map((item) => item.itemId) },
              },
              select: { itemId: true, quantity: true },
            })
          ).map((entry) => [entry.itemId, entry.quantity]),
        );

        for (const ingredient of fixture.ingredients) {
          expect(afterStart.get(ingredient.itemId) ?? 0).toBe(
            (before.get(ingredient.itemId) ?? 0) - ingredient.quantity,
          );
        }

        await prisma.craftingSession.update({
          where: { id: body.craftingSession.id },
          data: { completesAt: new Date(Date.now() - 1_000) },
        });
        const status = await character.api.get(
          `/crafting/character/${character.id}/status`,
        );
        await requireOk(status, `Conclusão do craft de ${fixture.name}`);

        await expect
          .poll(async () =>
            prisma.craftingSession.findUnique({
              where: { id: body.craftingSession.id },
              select: { status: true },
            }),
          )
          .toEqual({ status: 'COMPLETED' });

        const output = await prisma.inventoryItem.findUnique({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: fixture.id,
            },
          },
          select: { quantity: true, type: true },
        });
        expect(output).toEqual({
          quantity: fixture.outputQuantity,
          type: InventoryItemType.EQUIPMENT,
        });
      }

      const materialIds = Array.from(
        expectedMaterials.get(character.id)?.keys() ?? [],
      );
      expect(
        await prisma.inventoryItem.count({
          where: { characterId: character.id, itemId: { in: materialIds } },
        }),
      ).toBe(0);
    }
  });

  test('4. valida arte, atributos, tier, nível e consumo das receitas', async ({
    page,
  }) => {
    for (const character of qaCharacters) {
      const response = await character.api.get(
        `/crafting/character/${character.id}/recipes?tier=1`,
      );
      await requireOk(response, `Catálogo T1 de ${character.className}`);
      const body = (await response.json()) as {
        recipes: Array<{
          requiredCraftingLevel: number;
          requiredCharacterLevel: number;
          outputItem: {
            id: string;
            tier: number;
            class?: { name: string } | null;
            bonuses: Record<string, number>;
          };
        }>;
      };

      for (const fixture of character.equipment) {
        const recipe = body.recipes.find(
          (entry) => entry.outputItem.id === fixture.id,
        );
        expect(recipe).toBeDefined();
        expect(recipe?.requiredCraftingLevel).toBe(1);
        expect(recipe?.requiredCharacterLevel).toBe(1);
        expect(recipe?.outputItem).toMatchObject({
          tier: 1,
          class: { name: character.className },
        });
        expect(
          fixture.strengthBonus +
            fixture.vitalityBonus +
            fixture.agilityBonus +
            fixture.precisionBonus +
            fixture.techniqueBonus +
            fixture.willpowerBonus,
        ).toBe(statBudgetBySlot[fixture.slot]);
      }
    }

    const primary = qaCharacters[0];
    const foreignItem = qaCharacters[1].equipment[0];
    const tierTwoItem = await prisma.item.findFirstOrThrow({
      where: {
        classId: primary.classId,
        tier: 2,
        isCraftable: true,
        slot: ItemSlot.MAIN_HAND,
      },
      include: { map: { select: { minLevel: true } } },
    });
    await prisma.inventoryItem.createMany({
      data: [foreignItem.id, tierTwoItem.id].map((itemId) => ({
        characterId: primary.id,
        itemId,
        quantity: 1,
        type: InventoryItemType.EQUIPMENT,
      })),
      skipDuplicates: true,
    });

    try {
      const foreignEquip = await primary.api.post('/equipment/equip', {
        data: { characterId: primary.id, itemId: foreignItem.id },
      });
      expect(foreignEquip.status()).toBe(400);
      expect(await readErrorMessage(foreignEquip)).toContain('classe');

      const highLevelEquip = await primary.api.post('/equipment/equip', {
        data: { characterId: primary.id, itemId: tierTwoItem.id },
      });
      expect(highLevelEquip.status()).toBe(400);
      expect(await readErrorMessage(highLevelEquip)).toContain(
        `nível ${tierTwoItem.map?.minLevel ?? 11}`,
      );
    } finally {
      await prisma.inventoryItem.deleteMany({
        where: {
          characterId: primary.id,
          itemId: { in: [foreignItem.id, tierTwoItem.id] },
        },
      });
    }

    await authenticatePage(page, primary);
    await page.goto(`/dashboard/${primary.id}/equipment`);
    await expect(
      page.getByRole('heading', { name: 'Equipamentos', exact: true }),
    ).toBeVisible();

    for (const fixture of primary.equipment) {
      await page
        .locator('.equipment-slot')
        .filter({ hasText: slotLabels[fixture.slot] })
        .click();
      const candidate = page
        .locator('.equipment-candidate')
        .filter({ hasText: fixture.name });
      await candidate.scrollIntoViewIfNeeded();
      await expect(candidate).toBeVisible();
      const image = candidate.locator('img');
      await expect(image).toHaveCount(1);
      await expect
        .poll(() =>
          image.evaluate(
            (element) =>
              (element as HTMLImageElement).complete &&
              (element as HTMLImageElement).naturalWidth > 0,
          ),
        )
        .toBe(true);
    }

    await page.addInitScript(
      ({ characterId }) => {
        sessionStorage.setItem(
          `dead_idle_crafting_filters:${characterId}`,
          JSON.stringify({
            tier: '1',
            class: 'CHARACTER',
            slot: 'ALL',
            craftableOnly: false,
          }),
        );
      },
      { characterId: primary.id },
    );
    await page.goto(`/dashboard/${primary.id}/crafting`);
    await expect(
      page.getByRole('heading', { name: 'Itens disponíveis', exact: true }),
    ).toBeVisible();

    for (const fixture of primary.equipment) {
      const recipeCard = page
        .locator('.crafting-recipe-card')
        .filter({ hasText: fixture.name });
      await recipeCard.scrollIntoViewIfNeeded();
      await expect(recipeCard).toBeVisible();
      const image = recipeCard.locator('.crafting-recipe-card__icon img');
      await expect(image).toHaveCount(1);
      await expect
        .poll(() =>
          image.evaluate(
            (element) =>
              (element as HTMLImageElement).complete &&
              (element as HTMLImageElement).naturalWidth > 0,
          ),
        )
        .toBe(true);
    }

    const firstRecipeCard = page
      .locator('.crafting-recipe-card')
      .filter({ hasText: primary.equipment[0].name });
    await firstRecipeCard.locator('.crafting-recipe-card__select').click();
    const detailsModal = page.getByRole('dialog');
    await expect(detailsModal).toBeVisible();
    await expect(
      detailsModal.locator('.crafting-side-card__icon img'),
    ).toHaveCount(1);
    const ingredientImages = detailsModal.locator(
      '.crafting-ingredient__icon img',
    );
    await expect(ingredientImages).toHaveCount(
      primary.equipment[0].ingredients.length,
    );
    for (const ingredientImage of await ingredientImages.all()) {
      await expect
        .poll(() =>
          ingredientImage.evaluate(
            (element) =>
              (element as HTMLImageElement).complete &&
              (element as HTMLImageElement).naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
  });

  test('5. equipa, desequipa, vende e movimenta itens pelo banco', async () => {
    for (const character of qaCharacters) {
      for (const fixture of character.equipment) {
        const response = await character.api.post('/equipment/equip', {
          data: { characterId: character.id, itemId: fixture.id },
        });
        await requireOk(response, `Equipar ${fixture.name}`);
      }

      const equipmentResponse = await character.api.get(
        `/equipment/${character.id}`,
      );
      await requireOk(equipmentResponse, `Loadout de ${character.className}`);
      const body = (await equipmentResponse.json()) as {
        equipment: Record<string, { id: string } | null>;
        stats: { equipmentBonusStats: Record<string, number> };
      };

      for (const fixture of character.equipment) {
        expect(body.equipment[slotViewKeys[fixture.slot]]?.id).toBe(fixture.id);
      }
      expect(body.stats.equipmentBonusStats).toMatchObject(
        sumStats(character.equipment),
      );
    }

    const primary = qaCharacters[0];
    const boots = primary.equipment.find(
      (item) => item.slot === ItemSlot.BOOTS,
    );
    if (!boots || !saleFixture)
      throw new Error('Fixtures operacionais ausentes.');

    const unequip = await primary.api.post('/equipment/unequip', {
      data: { characterId: primary.id, slot: ItemSlot.BOOTS },
    });
    await requireOk(unequip, 'Desequipar botas T1');
    expect(
      await prisma.inventoryItem.findUnique({
        where: {
          characterId_itemId: { characterId: primary.id, itemId: boots.id },
        },
        select: { quantity: true },
      }),
    ).toEqual({ quantity: 1 });

    const reEquip = await primary.api.post('/equipment/equip', {
      data: { characterId: primary.id, itemId: boots.id },
    });
    await requireOk(reEquip, 'Reequipar botas T1');

    const deposit = await primary.api.post('/inventory/bank/deposit', {
      data: { characterId: primary.id, itemId: saleFixture.id, quantity: 1 },
    });
    await requireOk(deposit, 'Depositar equipamento no banco');
    const bankAfterDeposit = await primary.api.get(
      `/inventory/${primary.id}/bank`,
    );
    await requireOk(bankAfterDeposit, 'Consultar banco após depósito');
    expect(
      (
        (await bankAfterDeposit.json()) as {
          items: Array<{ item: { id: string } }>;
        }
      ).items.some((entry) => entry.item.id === saleFixture?.id),
    ).toBe(true);

    const withdraw = await primary.api.post('/inventory/bank/withdraw', {
      data: { characterId: primary.id, itemId: saleFixture.id, quantity: 1 },
    });
    await requireOk(withdraw, 'Retirar equipamento do banco');

    const goldBefore = (
      await prisma.character.findUniqueOrThrow({
        where: { id: primary.id },
        select: { gold: true },
      })
    ).gold;
    const sale = await primary.api.post('/inventory/black-market/sell', {
      data: { characterId: primary.id, itemId: saleFixture.id },
    });
    await requireOk(sale, 'Vender equipamento no Mercado Negro');
    const saleBody = (await sale.json()) as {
      gold: number;
      soldItem: { itemId: string; quantity: number; totalValue: number };
    };
    expect(saleBody.soldItem).toMatchObject({
      itemId: saleFixture.id,
      quantity: 1,
    });
    expect(saleBody.soldItem.totalValue).toBeGreaterThan(0);
    expect(saleBody.gold).toBe(goldBefore + saleBody.soldItem.totalValue);
    expect(
      await prisma.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: primary.id,
            itemId: saleFixture.id,
          },
        },
      }),
    ).toBeNull();
  });

  test('6. bloqueia novas pilhas quando mochila ou banco estão lotados', () => {
    test.fixme(
      true,
      'Mochila e banco ainda não possuem capacidade canônica no schema ou nos services.',
    );
  });

  test('7. preserva crafting, inventário e equipamento após reconnect e F5', async ({
    page,
  }) => {
    const primary = qaCharacters[0];
    const fixture = primary.equipment.find(
      (item) => item.slot === ItemSlot.HEAD,
    );
    if (!fixture) throw new Error('Receita de cabeça T1 ausente.');

    for (const ingredient of fixture.ingredients) {
      await prisma.inventoryItem.upsert({
        where: {
          characterId_itemId: {
            characterId: primary.id,
            itemId: ingredient.itemId,
          },
        },
        create: {
          characterId: primary.id,
          itemId: ingredient.itemId,
          quantity: ingredient.quantity,
          type: InventoryItemType.MATERIAL,
        },
        update: {
          quantity: ingredient.quantity,
          type: InventoryItemType.MATERIAL,
        },
      });
    }

    const craft = await primary.api.post('/crafting/craft', {
      data: { characterId: primary.id, itemId: fixture.id },
    });
    await requireOk(craft, 'Iniciar crafting para reconnect');
    const craftBody = (await craft.json()) as CraftResponse;

    await authenticatePage(page, primary);
    await page.goto(`/dashboard/${primary.id}/equipment`);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            (
              window as unknown as {
                __deadIdleE2E?: { isCraftingConnected?: () => boolean };
              }
            ).__deadIdleE2E?.isCraftingConnected?.(),
          ),
        ),
      )
      .toBe(true);
    const initialSocketId = await page.evaluate(
      () =>
        (
          window as unknown as {
            __deadIdleE2E?: { getCraftingSocketId?: () => string | null };
          }
        ).__deadIdleE2E?.getCraftingSocketId?.() ?? null,
    );
    expect(initialSocketId).not.toBeNull();

    await page.evaluate(() => {
      const control = (
        window as unknown as {
          __deadIdleE2E?: { dropCraftingTransport?: () => void };
        }
      ).__deadIdleE2E;
      if (!control?.dropCraftingTransport) {
        throw new Error('Controle E2E do socket de crafting indisponível.');
      }
      control.dropCraftingTransport();
    });

    await expect
      .poll(() =>
        page.evaluate((previousSocketId) => {
          const control = (
            window as unknown as {
              __deadIdleE2E?: {
                isCraftingConnected?: () => boolean;
                getCraftingSocketId?: () => string | null;
              };
            }
          ).__deadIdleE2E;
          const currentSocketId = control?.getCraftingSocketId?.() ?? null;
          return (
            Boolean(control?.isCraftingConnected?.()) &&
            Boolean(currentSocketId) &&
            currentSocketId !== previousSocketId
          );
        }, initialSocketId),
      )
      .toBe(true);

    const completionTimeoutMs = Math.max(
      10_000,
      Date.parse(craftBody.craftingSession.completesAt) - Date.now() + 5_000,
    );

    await expect
      .poll(
        async () =>
          prisma.inventoryItem.findUnique({
            where: {
              characterId_itemId: {
                characterId: primary.id,
                itemId: fixture.id,
              },
            },
            select: { quantity: true },
          }),
        { timeout: completionTimeoutMs },
      )
      .toEqual({ quantity: fixture.outputQuantity });

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Equipamentos', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('6/6 equipados', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.equipment-slot.has-item img')).toHaveCount(6);
    await expect
      .poll(() =>
        page
          .locator('.equipment-slot.has-item img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);

    const status = await primary.api.get(
      `/crafting/character/${primary.id}/status`,
    );
    await requireOk(status, 'Status de crafting após F5');
    expect((await status.json()) as { active: boolean }).toMatchObject({
      active: false,
    });

    const inventory = await primary.api.get(`/inventory/${primary.id}`);
    await requireOk(inventory, 'Inventário após F5');
    expect(
      (
        (await inventory.json()) as {
          items: Array<{ quantity: number; item: { id: string } }>;
        }
      ).items.find((entry) => entry.item.id === fixture.id)?.quantity,
    ).toBe(fixture.outputQuantity);
    await expect(
      page.getByText('Token de autenticação não enviado no WebSocket.'),
    ).toHaveCount(0);
  });
});
