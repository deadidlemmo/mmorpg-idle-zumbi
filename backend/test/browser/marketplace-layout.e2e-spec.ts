import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import {
  InventoryItemType,
  ItemSlot,
  PrismaClient,
  Rarity,
} from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const password = 'TesteE2E123';
const testEmailPrefix = 'marketplace-layout-e2e-';
const prisma = new PrismaClient();

type MarketPlayer = {
  accessToken: string;
  characterId: string;
  email: string;
  name: string;
};

let buyer: MarketPlayer;
let seller: MarketPlayer;
let listingItemId = '';
let listingItemName = '';

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

async function createPlayer(
  api: APIRequestContext,
  role: 'Comprador' | 'Vendedor',
  suffix: string,
): Promise<MarketPlayer> {
  const email = `${testEmailPrefix}${role.toLowerCase()}-${suffix}@example.test`;
  const registration = await api.post('/auth/register', {
    data: {
      email,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
    },
  });
  await requireOk(registration, `Registrar ${role.toLowerCase()}`);
  const auth = (await registration.json()) as { accessToken: string };
  const name = `${role}QA${suffix.replaceAll('-', '').slice(-6)}`;

  const characterResponse = await api.post('/characters', {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    data: {
      name,
      className: 'Lutador',
      avatarKey: 'lutador-01',
    },
  });
  await requireOk(characterResponse, `Criar personagem ${role.toLowerCase()}`);
  const character = (await characterResponse.json()) as { id: string };

  return {
    accessToken: auth.accessToken,
    characterId: character.id,
    email,
    name,
  };
}

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ({ token, characterId }) => {
      window.localStorage.setItem('dead_idle_access_token', token);
      window.localStorage.setItem(
        'dead_idle_selected_character_id',
        characterId,
      );
    },
    { token: buyer.accessToken, characterId: buyer.characterId },
  );
}

test.describe('layout do Mercado do Abrigo', () => {
  test.beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });

    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });

    try {
      buyer = await createPlayer(publicApi, 'Comprador', suffix);
      seller = await createPlayer(publicApi, 'Vendedor', suffix);
    } finally {
      await publicApi.dispose();
    }

    await prisma.characterTutorialProgress.upsert({
      where: { characterId: buyer.characterId },
      create: {
        characterId: buyer.characterId,
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

    listingItemName = `Componente Pressurizado QA ${suffix.slice(-8)}`;
    const item = await prisma.item.create({
      data: {
        name: listingItemName,
        slug: `componente-pressurizado-qa-${suffix}`,
        description: 'Item temporário para validar o layout do mercado.',
        tier: 5,
        rarity: Rarity.LEGENDARY,
        slot: ItemSlot.MATERIAL,
        family: 'Teste de interface',
        isTradable: true,
      },
    });
    listingItemId = item.id;

    await prisma.inventoryItem.createMany({
      data: [
        {
          characterId: seller.characterId,
          itemId: item.id,
          type: InventoryItemType.MATERIAL,
          quantity: 2,
        },
        {
          characterId: buyer.characterId,
          itemId: item.id,
          type: InventoryItemType.MATERIAL,
          quantity: 3,
        },
      ],
    });

    const sellerApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: {
        Authorization: `Bearer ${seller.accessToken}`,
      },
    });

    try {
      const listingResponse = await sellerApi.post('/market/listings', {
        data: {
          characterId: seller.characterId,
          itemId: item.id,
          quantity: 2,
          unitPrice: 999_999_999,
          requestId: randomUUID(),
        },
      });
      await requireOk(listingResponse, 'Criar anúncio para o teste de layout');
    } finally {
      await sellerApi.dispose();
    }

    const buyerApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: {
        Authorization: `Bearer ${buyer.accessToken}`,
      },
    });

    try {
      const ownListingResponse = await buyerApi.post('/market/listings', {
        data: {
          characterId: buyer.characterId,
          itemId: item.id,
          quantity: 1,
          unitPrice: 1_234,
          requestId: randomUUID(),
        },
      });
      await requireOk(
        ownListingResponse,
        'Criar anúncio próprio para revisar todas as abas',
      );
    } finally {
      await buyerApi.dispose();
    }
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });
    if (listingItemId) {
      await prisma.item.deleteMany({ where: { id: listingItemId } });
    }
    await prisma.$disconnect();
  });

  test('mantém preço, ações e modal legíveis no desktop e no mobile', async ({
    page,
  }, testInfo) => {
    await authenticatePage(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/dashboard/${buyer.characterId}/market`);
    await expect(
      page.getByRole('heading', { name: 'Mercado do Abrigo' }),
    ).toBeVisible();

    const closeWorldBossAlert = page.getByRole('button', {
      name: 'Fechar alerta',
    });
    if ((await closeWorldBossAlert.count()) > 0) {
      await closeWorldBossAlert.click();
    }

    await page
      .getByRole('searchbox', { name: 'Buscar item ou vendedor' })
      .fill(listingItemName);

    const row = page.locator('.market-row--catalog').first();
    const price = row.locator('.market-row__price');
    await expect(row).toBeVisible();
    await expect(price).toContainText('999.999.999');
    await expect(row.getByRole('button', { name: /Comprar/ })).toBeVisible();

    const desktop = await row.evaluate((element) => ({
      rowOverflows: element.scrollWidth > element.clientWidth,
      pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
    }));
    expect(desktop).toEqual({ rowOverflows: false, pageOverflows: false });

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('mercado-desktop.png'),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });

    const mobilePositions = await price.evaluate((element) => {
      const label = element.querySelector<HTMLElement>(
        '.market-row__field-label',
      )!;
      const coin = element.querySelector<HTMLImageElement>(
        '.market-row__price-value img',
      )!;
      const value = element.querySelector<HTMLElement>(
        '.market-row__price-value strong',
      )!;
      const labelRect = label.getBoundingClientRect();
      const coinRect = coin.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();

      return {
        labelVisible: labelRect.width > 0 && labelRect.height > 0,
        coinBelowLabel: coinRect.top >= labelRect.bottom,
        valueBelowLabel: valueRect.top >= labelRect.bottom,
        priceOverflows: element.scrollWidth > element.clientWidth,
        rowOverflows:
          element.parentElement!.scrollWidth >
          element.parentElement!.clientWidth,
        pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(mobilePositions).toEqual({
      labelVisible: true,
      coinBelowLabel: true,
      valueBelowLabel: true,
      priceOverflows: false,
      rowOverflows: false,
      pageOverflows: false,
    });

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('mercado-mobile-lista.png'),
        fullPage: true,
      });
    }

    const tabs = page.locator('.market-tabs');
    await tabs.getByRole('button', { name: 'Vender', exact: true }).click();
    const sellRow = page.locator('.market-row--sell').first();
    await expect(sellRow).toBeVisible();
    await expect(
      sellRow.getByText('Na mochila', { exact: true }),
    ).toBeVisible();
    expect(
      await sellRow.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(false);

    await tabs
      .getByRole('button', { name: 'Meus anúncios', exact: true })
      .click();
    const mineRow = page.locator('.market-row--mine').first();
    await expect(mineRow).toBeVisible();
    for (const label of ['Status', 'Vendido', 'Recebido']) {
      await expect(mineRow.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(mineRow.locator('.market-row__status-value')).toHaveText(
      'Ativo',
    );
    expect(
      await mineRow.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(false);

    await tabs.getByRole('button', { name: 'Comprar', exact: true }).click();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /Comprar/ }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    const modalLayout = await modal.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        fitsViewport: rect.left >= 0 && rect.right <= window.innerWidth,
        overflowsHorizontally: element.scrollWidth > element.clientWidth,
      };
    });
    expect(modalLayout).toEqual({
      fitsViewport: true,
      overflowsHorizontally: false,
    });

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('mercado-mobile-modal.png'),
        fullPage: true,
      });
    }
  });
});
