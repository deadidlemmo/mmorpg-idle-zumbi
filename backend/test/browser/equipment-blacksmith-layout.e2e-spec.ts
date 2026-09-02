import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { InventoryItemType, ItemSlot, PrismaClient } from '@prisma/client';
import { expect, request as playwrightRequest, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const testEmailPrefix = 'equipment-blacksmith-layout-e2e-';
const prisma = new PrismaClient();

type TestPlayer = {
  accessToken: string;
  characterId: string;
  inventoryItemId: string;
  sourceItemId: string;
  itemName: string;
  nextItemId: string;
  materialItemId: string;
};

let player: TestPlayer;

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

test.describe('Equipamentos e Ferreiro responsivos', () => {
  test.beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });

    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const email = `${testEmailPrefix}${suffix}@example.test`;
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });

    try {
      const registration = await api.post('/auth/register', {
        data: {
          email,
          password: 'TesteE2E123',
          acceptTerms: true,
          acceptPrivacy: true,
        },
      });
      await requireOk(registration, 'Registrar jogador');
      const auth = (await registration.json()) as { accessToken: string };

      const characterResponse = await api.post('/characters', {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        data: {
          name: `FerreiroQA${suffix.replaceAll('-', '').slice(-6)}`,
          className: 'Lutador',
          avatarKey: 'lutador-01',
        },
      });
      await requireOk(characterResponse, 'Criar personagem');
      const character = (await characterResponse.json()) as { id: string };

      const item = await prisma.item.findFirstOrThrow({
        where: {
          tier: 1,
          slot: ItemSlot.MAIN_HAND,
          enhancementLevel: 0,
          class: { name: 'Lutador' },
          enhancementVariants: { some: { enhancementLevel: 1 } },
        },
        select: {
          id: true,
          name: true,
          enhancementVariants: {
            where: { enhancementLevel: 1 },
            select: { id: true },
          },
        },
      });
      const material = await prisma.item.findFirstOrThrow({
        where: { tier: 1, family: 'Material de Reforço' },
        select: { id: true },
      });
      const nextItemId = item.enhancementVariants[0]?.id;
      if (!nextItemId) {
        throw new Error('Variante +1 ausente para o item de teste.');
      }
      const inventoryItem = await prisma.inventoryItem.upsert({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: item.id,
          },
        },
        create: {
          characterId: character.id,
          itemId: item.id,
          type: InventoryItemType.EQUIPMENT,
          quantity: 2,
        },
        update: {
          type: InventoryItemType.EQUIPMENT,
          quantity: 2,
        },
      });

      await prisma.character.update({
        where: { id: character.id },
        data: { gold: 0 },
      });
      await prisma.inventoryItem.deleteMany({
        where: {
          characterId: character.id,
          item: { family: 'Material de Reforço' },
        },
      });
      await prisma.characterTutorialProgress.upsert({
        where: { characterId: character.id },
        create: {
          characterId: character.id,
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

      player = {
        accessToken: auth.accessToken,
        characterId: character.id,
        inventoryItemId: inventoryItem.id,
        sourceItemId: item.id,
        itemName: item.name,
        nextItemId,
        materialItemId: material.id,
      };
    } finally {
      await api.dispose();
    }
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ token, characterId }) => {
        window.localStorage.setItem('dead_idle_access_token', token);
        window.localStorage.setItem(
          'dead_idle_selected_character_id',
          characterId,
        );
      },
      { token: player.accessToken, characterId: player.characterId },
    );
  });

  test('mantém seleção e comparação juntas no desktop e abre painel no mobile', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1365, height: 850 });
    await page.goto(`/dashboard/${player.characterId}/equipment`);

    await expect(
      page.getByRole('heading', { name: 'Equipamentos', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Reforço garantido' }),
    ).toHaveCount(0);

    const candidate = page
      .locator('.equipment-candidates')
      .getByRole('button', { name: new RegExp(player.itemName, 'i') })
      .first();
    await candidate.click();
    const comparison = page.locator('.equipment-comparison');
    await expect(comparison).toContainText(player.itemName);

    const desktopLayout = await comparison.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        comparisonVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        documentOverflows:
          document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(desktopLayout).toEqual({
      comparisonVisible: true,
      documentOverflows: false,
    });

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('equipamentos-desktop.png'),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await candidate.click();
    const mobileDialog = page.locator('.equipment-comparison[role="dialog"]');
    await expect(mobileDialog).toBeVisible();
    await expect(mobileDialog).toContainText(player.itemName);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('equipamentos-mobile.png'),
        fullPage: true,
      });
    }
  });

  test('lista peça sem recursos no Ferreiro e centraliza detalhes no mobile', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1365, height: 850 });
    await page.goto(`/dashboard/${player.characterId}/blacksmith`);

    await expect(
      page.getByRole('heading', { name: 'Ferreiro', exact: true }),
    ).toBeVisible();
    const item = page.locator(
      `[data-target-key="inventory:${player.inventoryItemId}"]`,
    );
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute(
      'title',
      'Fragmentos de reforço insuficientes.',
    );
    await item.click();
    await expect(
      page.getByRole('button', { name: 'Reforçar para +1' }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('ferreiro-desktop.png'),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await item.click();
    const detailDialog = page.locator('.blacksmith-detail[role="dialog"]');
    await expect(detailDialog).toBeVisible();
    const centering = await detailDialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        centerDeltaX: Math.abs(
          rect.left + rect.width / 2 - window.innerWidth / 2,
        ),
        fitsViewport:
          rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight,
        documentOverflows:
          document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(centering.centerDeltaX).toBeLessThanOrEqual(1);
    expect(centering.fitsViewport).toBe(true);
    expect(centering.documentOverflows).toBe(false);

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('ferreiro-mobile.png'),
        fullPage: true,
      });
    }

    await page
      .getByRole('button', { name: 'Fechar detalhes do reforço' })
      .click();
    await prisma.character.update({
      where: { id: player.characterId },
      data: { gold: 30 },
    });
    await prisma.inventoryItem.upsert({
      where: {
        characterId_itemId: {
          characterId: player.characterId,
          itemId: player.materialItemId,
        },
      },
      create: {
        characterId: player.characterId,
        itemId: player.materialItemId,
        type: InventoryItemType.MATERIAL,
        quantity: 4,
      },
      update: { type: InventoryItemType.MATERIAL, quantity: 4 },
    });

    await page.reload();
    await item.click();
    const reinforceButton = page
      .locator('.blacksmith-detail[role="dialog"]')
      .getByRole('button', { name: 'Reforçar para +1' });
    await expect(reinforceButton).toBeEnabled();
    await reinforceButton.click();
    await expect(page.getByTestId('reinforcement-confirmation')).toContainText(
      'agora está no +1',
    );

    await expect
      .poll(async () => {
        const [source, output] = await Promise.all([
          prisma.inventoryItem.findUnique({
            where: {
              characterId_itemId: {
                characterId: player.characterId,
                itemId: player.sourceItemId,
              },
            },
            select: { quantity: true },
          }),
          prisma.inventoryItem.findUnique({
            where: {
              characterId_itemId: {
                characterId: player.characterId,
                itemId: player.nextItemId,
              },
            },
            select: { quantity: true },
          }),
        ]);
        return {
          source: source?.quantity ?? 0,
          output: output?.quantity ?? 0,
        };
      })
      .toEqual({ source: 1, output: 1 });
  });
});
