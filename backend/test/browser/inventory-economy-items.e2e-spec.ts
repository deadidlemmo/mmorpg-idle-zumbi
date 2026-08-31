import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { InventoryItemType, PrismaClient } from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const password = 'TesteE2E123';
const prisma = new PrismaClient();

let api: APIRequestContext;
let email = '';
let accessToken = '';
let characterId = '';
let sourceItemId = '';

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

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ({ token, currentCharacterId }) => {
      localStorage.setItem('dead_idle_access_token', token);
      localStorage.setItem(
        'dead_idle_selected_character_id',
        currentCharacterId,
      );
    },
    { token: accessToken, currentCharacterId: characterId },
  );
}

async function openExchangeModal(page: Page) {
  await page
    .getByRole('button', {
      name: /Ver detalhes de Fragmento de Ameaça T1/i,
    })
    .click({ force: true });
  await page.getByRole('button', { name: 'Trocar', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Fragmento de Ameaça T1' }),
  ).toBeVisible();
}

test.describe('recursos econômicos físicos na mochila', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    email = `inventory-economy-${suffix}@dead-idle.test`;

    const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    const registration = await publicApi.post('/auth/register', {
      data: {
        email,
        password,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    await requireOk(registration, 'Registrar conta da fixture');
    accessToken = ((await registration.json()) as { accessToken: string })
      .accessToken;
    await publicApi.dispose();

    api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    });

    const characterResponse = await api.post('/characters', {
      data: {
        name: `Troca${suffix.replaceAll('-', '').slice(-9)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    await requireOk(characterResponse, 'Criar personagem da fixture');
    characterId = ((await characterResponse.json()) as { id: string }).id;

    await prisma.characterTutorialProgress.upsert({
      where: { characterId },
      create: {
        characterId,
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

    const sourceItem = await prisma.item.findUniqueOrThrow({
      where: { slug: 'fragmento-de-ameaca-t1' },
      select: { id: true },
    });
    sourceItemId = sourceItem.id;
    await prisma.inventoryItem.upsert({
      where: { characterId_itemId: { characterId, itemId: sourceItemId } },
      create: {
        characterId,
        itemId: sourceItemId,
        type: InventoryItemType.MATERIAL,
        quantity: 12,
      },
      update: { quantity: 12, type: InventoryItemType.MATERIAL },
    });
  });

  test.afterAll(async () => {
    await api?.dispose();
    if (email) await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  test('troca atomicamente e mantém modal responsivo', async ({ page }) => {
    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/inventory`);
    await expect(
      page.getByRole('main', { name: 'Mochila do personagem' }),
    ).toBeVisible();

    await openExchangeModal(page);
    const firstOffer = page.locator('.economy-exchange__offer').first();
    await firstOffer
      .getByRole('button', { name: 'Aumentar quantidade' })
      .click();
    await expect(firstOffer).toContainText('Custo: 6x Fragmento de Ameaça T1');
    const receivedItemName = (
      await firstOffer
        .locator('.economy-exchange__offer-copy strong')
        .textContent()
    )
      ?.replace(/^4x\s+/, '')
      .trim();
    await firstOffer.locator('.economy-exchange__button').click();
    await expect(firstOffer.locator('.economy-exchange__button')).toHaveText(
      'Trocar',
    );

    const sourceStack = await prisma.inventoryItem.findUnique({
      where: { characterId_itemId: { characterId, itemId: sourceItemId } },
      select: { quantity: true },
    });
    expect(sourceStack?.quantity).toBe(6);

    expect(receivedItemName).toBeTruthy();
    const receivedStack = await prisma.inventoryItem.findFirst({
      where: { characterId, item: { name: receivedItemName } },
      select: { quantity: true },
    });
    expect(receivedStack?.quantity).toBe(4);

    await page.screenshot({
      path: 'test-results/browser/inventory-exchange-desktop.png',
      fullPage: false,
    });
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await openExchangeModal(page);
    const panel = page.locator('.inventory-exchange-modal__panel');
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    const hasHorizontalOverflow = await panel.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
    await page.screenshot({
      path: 'test-results/browser/inventory-exchange-mobile.png',
      fullPage: false,
    });
  });

  test('fragmento é negociável no Mercado do Abrigo e recusado pelo Mercado Negro', async () => {
    const blackMarketResponse = await api.post('/inventory/black-market/sell', {
      data: { characterId, itemId: sourceItemId, quantity: 1 },
    });
    expect(blackMarketResponse.status()).toBe(400);

    const listingResponse = await api.post('/market/listings', {
      data: {
        characterId,
        itemId: sourceItemId,
        quantity: 1,
        unitPrice: 10,
        requestId: randomUUID(),
      },
    });
    await requireOk(listingResponse, 'Anunciar fragmento no Mercado do Abrigo');
    const listingId = (
      (await listingResponse.json()) as { listing: { id: string } }
    ).listing.id;

    const cancelResponse = await api.post(
      `/market/listings/${listingId}/cancel`,
      {
        data: { characterId },
      },
    );
    await requireOk(cancelResponse, 'Cancelar anúncio da fixture');
    const restored = await prisma.inventoryItem.findUnique({
      where: { characterId_itemId: { characterId, itemId: sourceItemId } },
      select: { quantity: true },
    });
    expect(restored?.quantity).toBe(6);
  });
});
