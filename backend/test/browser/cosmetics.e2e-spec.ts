import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { CosmeticGrantSource, PrismaClient, UserRole } from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
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
  const emailLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `cosmetics-${emailLabel}-${suffix}@dead-idle.test`;
  const characterName = `${label} ${suffix.slice(-8)}`;

  try {
    const registration = await api.post('/auth/register', {
      data: {
        email,
        password: 'TesteE2E123',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    if (!registration.ok()) {
      throw new Error(
        `Registro cosmético falhou: ${await registration.text()}`,
      );
    }
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
    if (!characterResponse.ok()) {
      throw new Error(
        `Personagem cosmético falhou: ${await characterResponse.text()}`,
      );
    }
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

test.describe('cosméticos e inspeção pública', () => {
  test.describe.configure({ mode: 'serial' });

  let owner: TestPlayer;
  let viewer: TestPlayer;

  test.beforeAll(async () => {
    owner = await createPlayer('Cosmetic Owner');
    viewer = await createPlayer('Cosmetic Viewer');
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { startsWith: 'cosmetics-', endsWith: '@dead-idle.test' },
      },
    });
    await prisma.$disconnect();
  });

  test('bloqueia o pacote e permite concessão administrativa idempotente', async () => {
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });

    try {
      const lockedCatalogResponse = await api.get(
        `/cosmetics/characters/${owner.characterId}`,
        { headers: { Authorization: `Bearer ${owner.accessToken}` } },
      );
      expect(lockedCatalogResponse.ok()).toBe(true);
      const lockedCatalog = (await lockedCatalogResponse.json()) as {
        collections: Array<{
          key: string;
          items: Array<{ key: string; isOwned: boolean }>;
        }>;
      };
      const premiumCollection = lockedCatalog.collections.find(
        (collection) => collection.key === 'premium-ultimo-abrigo',
      );
      expect(premiumCollection).toBeDefined();
      expect(premiumCollection!.items.every((item) => !item.isOwned)).toBe(
        true,
      );

      await prisma.user.update({
        where: { id: owner.userId },
        data: { role: UserRole.ADMIN },
      });
      const login = await api.post('/auth/login', {
        data: { email: owner.email, password: 'TesteE2E123' },
      });
      expect(login.ok()).toBe(true);
      owner.accessToken = (
        (await login.json()) as { accessToken: string }
      ).accessToken;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const grant = await api.post('/admin/cosmetics/grant', {
          headers: { Authorization: `Bearer ${owner.accessToken}` },
          data: {
            userId: owner.userId,
            collectionKey: 'premium-ultimo-abrigo',
            source: CosmeticGrantSource.BUNDLE,
            sourceReference: 'e2e-premium-bundle',
          },
        });
        expect(grant.ok()).toBe(true);
      }

      expect(
        await prisma.userCosmeticEntitlement.count({
          where: {
            userId: owner.userId,
            source: CosmeticGrantSource.BUNDLE,
            sourceReference: 'e2e-premium-bundle',
          },
        }),
      ).toBe(38);
    } finally {
      await api.dispose();
    }
  });

  test('salva o conjunto completo e restaura a rota após F5', async ({
    page,
  }, testInfo) => {
    await authenticatePage(page, owner);
    await page.goto(`/dashboard/${owner.characterId}/appearance`);

    await expect(
      page.getByRole('heading', { name: 'Aparência', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.dashboard-sidebar')).toHaveCSS(
      'position',
      'sticky',
    );
    await expect(
      page.locator('.appearance-collection-switcher button'),
    ).toHaveCount(3);
    await expect(page.locator('.appearance-collection')).toHaveCount(1);
    const premiumCollection = page.locator('.appearance-collection');
    await expect(premiumCollection.locator('.appearance-item')).toHaveCount(4);
    await page.getByRole('button', { name: 'Femininos', exact: true }).click();
    await expect(premiumCollection.locator('.appearance-item')).toHaveCount(4);
    await expect(
      page.getByRole('button', { name: 'Todos', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Masculinos', exact: true }).click();
    await premiumCollection.locator('.appearance-item').first().click();
    await premiumCollection
      .getByRole('button', { name: 'Aplicar estilo' })
      .click();
    await expect(page.getByText('Sobrevivente Premium')).toBeVisible();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Aparência atualizada.')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Sobrevivente Premium')).toBeVisible();
    await expect(page.getByText('7 itens no conjunto')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('appearance-desktop.png'),
      fullPage: true,
    });
  });

  test('aplica as linhas Helix e Carmesim com arte e efeitos próprios', async ({
    page,
  }, testInfo) => {
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });

    try {
      for (const [collectionKey, sourceReference] of [
        ['premium-nucleo-helix', 'e2e-premium-helix'],
        ['premium-protocolo-carmesim', 'e2e-premium-carmesim'],
      ] as const) {
        const grant = await api.post('/admin/cosmetics/grant', {
          headers: { Authorization: `Bearer ${owner.accessToken}` },
          data: {
            userId: owner.userId,
            collectionKey,
            source: CosmeticGrantSource.BUNDLE,
            sourceReference,
          },
        });
        expect(grant.ok()).toBe(true);
      }

      await authenticatePage(page, owner);
      await page.goto(`/dashboard/${owner.characterId}/appearance`);

      const profileCard = page.locator('.cosmetic-profile-card');
      const profilePortrait = page.locator('.cosmetic-profile-card__portrait');
      await page
        .locator('.appearance-collection-switcher button')
        .filter({ hasText: 'Núcleo Helix' })
        .click();
      const helixCollection = page.locator('.appearance-collection');
      await page
        .locator('.appearance-item')
        .filter({
          has: page.locator('[style*="avatar-helix-lutador-m-white"]'),
        })
        .click();
      await helixCollection
        .getByRole('button', { name: 'Aplicar estilo' })
        .click();
      await expect(profileCard).toHaveClass(/is-effect-helix-orbit/);
      await expect(profilePortrait).toHaveClass(/is-frame-helix-orbit/);
      await expect(profilePortrait.locator('img')).toHaveAttribute(
        'src',
        /avatar-helix-lutador-m-white/,
      );
      await expect(page.getByText('Guardião do Núcleo')).toBeVisible();
      await page.waitForTimeout(1_500);
      await page.screenshot({
        path: testInfo.outputPath('appearance-helix-desktop.png'),
        fullPage: true,
      });

      await page
        .locator('.appearance-collection-switcher button')
        .filter({ hasText: 'Protocolo Carmesim' })
        .click();
      const carmesimCollection = page.locator('.appearance-collection');
      await page
        .locator('.appearance-item')
        .filter({
          has: page.locator('[style*="avatar-carmesim-lutador-egide"]'),
        })
        .click();
      await carmesimCollection
        .getByRole('button', { name: 'Aplicar estilo' })
        .click();
      await expect(profileCard).toHaveClass(/is-effect-crimson-rift/);
      await expect(profilePortrait).toHaveClass(/is-frame-crimson-aegis/);
      await expect(profilePortrait.locator('img')).toHaveAttribute(
        'src',
        /avatar-carmesim-lutador-egide/,
      );
      await expect(page.getByText('Executor do Protocolo')).toBeVisible();
      await page.waitForTimeout(1_350);
      await page.screenshot({
        path: testInfo.outputPath('appearance-carmesim-desktop.png'),
        fullPage: true,
      });

      await page.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByText('Aparência atualizada.')).toBeVisible();
      await page.goto(`/dashboard/${owner.characterId}`);
      const dashboardShell = page.locator('.dashboard-shell');
      await expect(dashboardShell).toHaveClass(
        /dashboard-shell--cosmetic-overview/,
      );
      await expect(dashboardShell).toHaveAttribute(
        'style',
        /background-carmesim-fortaleza/,
      );
      await page.screenshot({
        path: testInfo.outputPath('overview-carmesim-desktop.png'),
        fullPage: true,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/dashboard/${owner.characterId}/appearance`);
      await expect(
        page.getByRole('heading', { name: 'Aparência', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Executor do Protocolo')).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: testInfo.outputPath('appearance-carmesim-mobile.png'),
        fullPage: true,
      });

      await page
        .locator('.appearance-collection-switcher button')
        .filter({ hasText: 'Último Abrigo' })
        .click();
      await page
        .locator('.appearance-collection')
        .getByRole('button', { name: 'Aplicar estilo' })
        .click();
      await page.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByText('Aparência atualizada.')).toBeVisible();
    } finally {
      await api.dispose();
    }
  });

  test('organiza Premium, Cash e pacotes em desktop e mobile', async ({
    page,
  }, testInfo) => {
    await authenticatePage(page, owner);
    await page.goto(`/dashboard/${owner.characterId}/membership`);

    await expect(
      page.getByRole('heading', { name: 'Premium e Cash', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(3);
    await expect(
      page.getByRole('heading', { name: 'Premium do Abrigo', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Passe Premium', exact: true }),
    ).toBeVisible();

    await page.getByRole('tab', { name: /^Cash/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Cash avulso', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Pacotes de Cash', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Cash pertence à conta')).toBeVisible();

    await page.getByRole('tab', { name: /^Passes e pacotes/ }).click();
    await expect(page.locator('.membership-package-card')).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'Núcleo Helix', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Protocolo Carmesim', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Aceleradores', exact: true }),
    ).toBeVisible();
    const paymentState = page.getByRole('region', {
      name: 'Estado dos pagamentos',
    });
    await expect(paymentState.getByText('Mercado Pago')).toBeVisible();
    await expect(paymentState.getByText('Stripe')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('storefront-desktop.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Premium e Cash', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: /^Cash/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Cash avulso', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath('storefront-mobile.png'),
      fullPage: true,
    });
  });

  test('outro jogador vê a aparência, sem controles do proprietário', async ({
    page,
  }, testInfo) => {
    await authenticatePage(page, viewer);
    await page.goto(
      `/dashboard/${viewer.characterId}/inspect/${owner.characterId}`,
    );

    await expect(
      page.getByRole('heading', { name: owner.characterName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Sobrevivente Premium')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Editar aparência' }),
    ).toHaveCount(0);
    await expect(page.locator('.character-inspection')).toHaveClass(
      /has-cosmetic-background/,
    );
    await page.screenshot({
      path: testInfo.outputPath('inspection-desktop.png'),
      fullPage: true,
    });
  });

  test('mantém a inspeção dentro do viewport móvel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, viewer);
    await page.goto(
      `/dashboard/${viewer.characterId}/inspect/${owner.characterId}`,
    );
    await expect(page.getByText('Sobrevivente Premium')).toBeVisible();

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  test('mantém o editor dentro do viewport móvel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, owner);
    await page.goto(`/dashboard/${owner.characterId}/appearance`);
    await expect(
      page.getByRole('heading', { name: 'Aparência', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});
