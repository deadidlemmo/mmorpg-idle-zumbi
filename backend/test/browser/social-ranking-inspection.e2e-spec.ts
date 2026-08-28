import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const prisma = new PrismaClient();

type SocialPlayer = {
  userId: string;
  email: string;
  accessToken: string;
  characterId: string;
  characterName: string;
};

async function createPlayer(params: {
  label: string;
  emailSuffix?: string;
  level: number;
}): Promise<SocialPlayer> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const safeLabel = params.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `social-e2e-${safeLabel}-${suffix}${params.emailSuffix ?? '@example.com'}`;
  const characterName = `${params.label} ${suffix.slice(-6)}`;

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
      throw new Error(`Registro social falhou: ${await registration.text()}`);
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
        `Personagem social falhou: ${await characterResponse.text()}`,
      );
    }
    const character = (await characterResponse.json()) as { id: string };

    await prisma.character.update({
      where: { id: character.id },
      data: { level: params.level, xp: params.level * 100 },
    });

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

async function authenticatePage(page: Page, player: SocialPlayer) {
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

async function openAuthenticatedPage(
  browser: Browser,
  player: SocialPlayer,
  path: string,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await authenticatePage(page, player);
  await page.goto(path);
  return { context, page };
}

test.describe('aliados, ranking e inspeção', () => {
  test.describe.configure({ mode: 'serial' });

  let requester: SocialPlayer;
  let target: SocialPlayer;
  let qaFixture: SocialPlayer;
  const extraContexts: BrowserContext[] = [];

  test.beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'social-e2e-' } },
    });
    requester = await createPlayer({ label: 'Vigia', level: 48 });
    target = await createPlayer({ label: 'Sentinela', level: 49 });
    qaFixture = await createPlayer({
      label: 'Fixture QA',
      emailSuffix: '@dead-idle.test',
      level: 50,
    });
  });

  test.afterAll(async () => {
    await Promise.all(extraContexts.map((context) => context.close()));
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'social-e2e-' } },
    });
    await prisma.$disconnect();
  });

  test('busca pelo nick, envia, aceita e persiste a aliança', async ({
    browser,
    page,
  }) => {
    await authenticatePage(page, requester);
    await page.goto(`/dashboard/${requester.characterId}/allies`);
    await expect(page.getByRole('heading', { name: 'Aliados' })).toBeVisible();

    await page.getByLabel('Apelido do personagem').fill(target.characterName);
    await page.getByRole('button', { name: 'Buscar' }).click();
    const result = page
      .locator('.social-search-result')
      .filter({ hasText: target.characterName });
    await expect(result).toHaveCount(1);
    await result.getByRole('button', { name: 'Adicionar' }).click();
    await expect(result.getByText('Enviado', { exact: true })).toBeVisible();

    const targetSession = await openAuthenticatedPage(
      browser,
      target,
      `/dashboard/${target.characterId}/allies`,
    );
    extraContexts.push(targetSession.context);
    await targetSession.page.getByRole('tab', { name: /Recebidos/ }).click();
    const incoming = targetSession.page
      .locator('.social-row')
      .filter({ hasText: requester.characterName });
    await expect(incoming).toHaveCount(1);
    await incoming.getByRole('button', { name: 'Aceitar pedido' }).click();
    await expect(targetSession.page.getByText('Aliança aceita.')).toBeVisible();

    await page.reload();
    const ally = page
      .locator('.social-row')
      .filter({ hasText: target.characterName });
    await expect(ally).toHaveCount(1);
    await expect(ally.getByText('Aliado', { exact: true })).toBeVisible();
  });

  test('remove fixtures do ranking e abre inspeção com imagens reais', async ({
    page,
  }, testInfo) => {
    await authenticatePage(page, requester);
    await page.goto(`/dashboard/${requester.characterId}/rankings`);

    await expect(
      page.getByRole('heading', { name: 'Ranking', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(target.characterName, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(qaFixture.characterName, { exact: true }),
    ).toHaveCount(0);

    const podium = page.locator('.ranking-podium');
    await expect(podium.locator('.ranking-podium-card')).toHaveCount(3);
    const firstPlaceBox = await podium
      .locator('.ranking-podium-card.is-rank-1')
      .boundingBox();
    const secondPlaceBox = await podium
      .locator('.ranking-podium-card.is-rank-2')
      .boundingBox();
    const thirdPlaceBox = await podium
      .locator('.ranking-podium-card.is-rank-3')
      .boundingBox();
    expect(firstPlaceBox).not.toBeNull();
    expect(secondPlaceBox).not.toBeNull();
    expect(thirdPlaceBox).not.toBeNull();
    expect(firstPlaceBox!.y + 16).toBeLessThan(secondPlaceBox!.y);
    expect(firstPlaceBox!.y + 16).toBeLessThan(thirdPlaceBox!.y);
    expect(
      Math.abs(
        firstPlaceBox!.y +
          firstPlaceBox!.height -
          (secondPlaceBox!.y + secondPlaceBox!.height),
      ),
    ).toBeLessThan(2);
    await podium.screenshot({
      path: testInfo.outputPath('ranking-podium-desktop.png'),
    });

    let releaseHuntingRequest: (() => void) | undefined;
    await page.route('**/social/rankings**', async (route) => {
      const requestCategory = new URL(route.request().url()).searchParams.get(
        'category',
      );
      if (requestCategory === 'HUNTING') {
        await new Promise<void>((resolve) => {
          releaseHuntingRequest = resolve;
        });
      }
      await route.continue();
    });

    const results = page.locator('.ranking-results');
    const resultsHeightBefore = await results.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await page.getByRole('tab', { name: 'Caça', exact: true }).click();
    await expect(results).toHaveClass(/is-refreshing/);
    const resultsHeightDuringRefresh = await results.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(
      Math.abs(resultsHeightBefore - resultsHeightDuringRefresh),
    ).toBeLessThan(2);
    expect(releaseHuntingRequest).toBeDefined();
    releaseHuntingRequest?.();
    await expect(
      page.getByRole('heading', { name: 'Caça', exact: true }),
    ).toBeVisible();
    await expect(results).not.toHaveClass(/is-refreshing/);
    await page.unroute('**/social/rankings**');
    await page.getByRole('tab', { name: 'Nível', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Nível geral', exact: true }),
    ).toBeVisible();

    const rankedTarget = page
      .locator('.ranking-podium-card, .ranking-row')
      .filter({ hasText: target.characterName })
      .first();
    await rankedTarget.getByRole('button', { name: 'Inspecionar' }).click();

    await expect(
      page.getByRole('heading', { name: target.characterName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Ativo', { exact: true })).toBeVisible();
    await expect(page.getByText('ACTIVE', { exact: true })).toHaveCount(0);

    const equippedSlots = page.locator(
      '.character-inspection__equipment-slot.has-item',
    );
    await expect(equippedSlots).toHaveCount(6);
    const equipmentImages = equippedSlots.locator('img');
    await expect(equipmentImages).toHaveCount(6);
    await expect
      .poll(async () =>
        equipmentImages.evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
  });

  test('mantém ranking e inspeção utilizáveis no celular', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticatePage(page, requester);
    await page.goto(`/dashboard/${requester.characterId}/rankings`);

    await expect(
      page.getByRole('heading', { name: 'Ranking', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('.ranking-podium-card')).toHaveCount(3);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.locator('.ranking-podium').screenshot({
      path: testInfo.outputPath('ranking-podium-mobile.png'),
    });

    await page.goto(
      `/dashboard/${requester.characterId}/inspect/${target.characterId}`,
    );

    await expect(
      page.getByRole('heading', { name: target.characterName, exact: true }),
    ).toBeVisible();
    const inspection = page.locator('.character-inspection');
    await expect(inspection).toBeVisible();
    const hasHorizontalOverflow = await inspection.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
