import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const password = 'TesteE2E123';
const prisma = new PrismaClient();

type TestPlayer = {
  userId: string;
  email: string;
  accessToken: string;
  characterId: string;
  characterName: string;
};

async function createPlayer(label: string): Promise<TestPlayer> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `admin-grants-${label}-${suffix}@dead-idle.test`;
  const characterName = `${label} ${suffix.slice(-8)}`;

  try {
    const registration = await api.post('/auth/register', {
      data: {
        email,
        password,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    expect(registration.ok()).toBe(true);
    const auth = (await registration.json()) as {
      user: { id: string };
      accessToken: string;
    };
    const characterResponse = await api.post('/characters', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      data: {
        name: characterName,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    expect(characterResponse.ok()).toBe(true);
    const character = (await characterResponse.json()) as { id: string };

    return {
      userId: auth.user.id,
      email,
      accessToken: auth.accessToken,
      characterId: character.id,
      characterName,
    };
  } finally {
    await api.dispose();
  }
}

async function authenticatePage(page: Page, player: TestPlayer) {
  await page.addInitScript(
    ({ token, characterId, tokenKey, characterKey }) => {
      window.localStorage.setItem(tokenKey, token);
      window.localStorage.setItem(characterKey, characterId);
    },
    {
      token: player.accessToken,
      characterId: player.characterId,
      tokenKey: accessTokenKey,
      characterKey: selectedCharacterKey,
    },
  );
}

test.describe('concessões administrativas para jogadores', () => {
  test.describe.configure({ mode: 'serial' });

  let admin: TestPlayer;
  let target: TestPlayer;

  test.beforeAll(async () => {
    admin = await createPlayer('admin');
    target = await createPlayer('target');
    await prisma.user.update({
      where: { id: admin.userId },
      data: { role: UserRole.ADMIN },
    });

    const api = await playwrightRequest.newContext({ baseURL: apiUrl });
    try {
      const login = await api.post('/auth/login', {
        data: { email: admin.email, password },
      });
      expect(login.ok()).toBe(true);
      const auth = (await login.json()) as { accessToken: string };
      admin.accessToken = auth.accessToken;
    } finally {
      await api.dispose();
    }
  });

  test.afterAll(async () => {
    if (target?.characterId && target?.userId) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [target.characterId, target.userId] } },
      });
    }
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'admin-grants-' } },
    });
    await prisma.$disconnect();
  });

  test('bloqueia jogador comum nas rotas de concessão', async () => {
    const api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: {
        Authorization: `Bearer ${target.accessToken}`,
      },
    });

    try {
      const catalog = await api.get('/admin/cosmetics/catalog');
      expect(catalog.status()).toBe(403);
      const grant = await api.post(
        `/admin/characters/${target.characterId}/cash/grant`,
        {
          data: {
            amount: 5,
            reason: 'Tentativa sem permissão',
            requestId: randomUUID(),
          },
        },
      );
      expect(grant.status()).toBe(403);
    } finally {
      await api.dispose();
    }
  });

  test('adiciona Cash e concede uma aparência pelo painel', async ({
    page,
  }) => {
    await authenticatePage(page, admin);
    await page.goto('/admin');

    await expect(
      page.getByRole('heading', { name: 'Operação do jogo' }),
    ).toBeVisible();
    const search = page.getByLabel('Buscar e-mail ou personagem');
    await search.fill(target.characterName);
    await search.press('Enter');

    const accountRow = page.locator('tbody tr', { hasText: target.email });
    await expect(accountRow).toBeVisible();
    await accountRow.getByRole('button', { name: 'Cash' }).click();

    const cashDialog = page.getByRole('dialog', { name: 'Adicionar Cash' });
    await expect(cashDialog).toBeVisible();
    await expect(cashDialog.getByText('Saldo atual')).toBeVisible();
    await cashDialog.getByLabel('Quantidade').fill('25');
    await cashDialog
      .getByLabel('Motivo')
      .fill('Compensação validada pelo suporte');
    await cashDialog.getByRole('button', { name: 'Adicionar Cash' }).click();
    await expect(cashDialog.getByText(/25 Cash adicionado/)).toBeVisible();

    await expect
      .poll(async () => {
        const character = await prisma.character.findUnique({
          where: { id: target.characterId },
          select: { cash: true },
        });
        return character?.cash;
      })
      .toBe(25);
    await cashDialog.getByRole('button', { name: 'Fechar' }).click();

    await accountRow.getByRole('button', { name: 'Aparências' }).click();
    const appearanceDialog = page.getByRole('dialog', {
      name: 'Aparências da conta',
    });
    await expect(appearanceDialog).toBeVisible();
    await appearanceDialog
      .getByLabel('Produto')
      .selectOption('cash-avatar-leon');
    await appearanceDialog
      .getByRole('button', { name: 'Conceder aparência' })
      .click();
    await expect(
      appearanceDialog.getByText('Leon', { exact: true }),
    ).toBeVisible();
    await expect(
      appearanceDialog.getByText('1 cosmético(s) concedido(s).'),
    ).toBeVisible();

    const entitlement = await prisma.userCosmeticEntitlement.findFirst({
      where: {
        userId: target.userId,
        revokedAt: null,
        cosmetic: { key: 'avatar-chuva-quarentena-leon' },
      },
      select: { source: true },
    });
    expect(entitlement?.source).toBe('ADMIN');
    await page.screenshot({
      path: test.info().outputPath('admin-player-grants-desktop.png'),
      fullPage: true,
    });
  });

  test('mantém os controles utilizáveis no celular', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, admin);
    await page.goto('/admin');

    const search = page.getByLabel('Buscar e-mail ou personagem');
    await search.fill(target.email);
    await search.press('Enter');
    const accountRow = page.locator('tbody tr', { hasText: target.email });
    await expect(accountRow).toBeVisible();
    await accountRow.getByRole('button', { name: 'Cash' }).click();

    const cashDialog = page.getByRole('dialog', { name: 'Adicionar Cash' });
    await expect(cashDialog.getByLabel('Personagem')).toBeVisible();
    await expect(cashDialog.getByLabel('Quantidade')).toBeVisible();
    await expect(cashDialog.getByLabel('Motivo')).toBeVisible();
    await expect
      .poll(() =>
        cashDialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath('admin-player-cash-mobile.png'),
      fullPage: false,
    });
    await cashDialog.getByRole('button', { name: 'Fechar' }).click();

    await accountRow.getByRole('button', { name: 'Aparências' }).click();
    const appearanceDialog = page.getByRole('dialog', {
      name: 'Aparências da conta',
    });
    await expect(
      appearanceDialog.getByRole('button', { name: 'Produto da Vera' }),
    ).toBeVisible();
    await expect(
      appearanceDialog.getByRole('button', { name: 'Peça individual' }),
    ).toBeVisible();
    await expect(
      appearanceDialog.getByRole('button', { name: 'Coleção completa' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        appearanceDialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true);
  });
});
