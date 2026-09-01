import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, request as playwrightRequest, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const testEmailPrefix = 'dashboard-overview-premium-e2e-';
const prisma = new PrismaClient();

type DashboardPlayer = {
  accessToken: string;
  characterId: string;
  email: string;
};

async function createPremiumPlayer(): Promise<DashboardPlayer> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `${testEmailPrefix}${suffix}@example.test`;

  try {
    const registration = await api.post('/auth/register', {
      data: {
        email,
        password: 'TesteE2E123',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    expect(registration.ok()).toBe(true);
    const auth = (await registration.json()) as { accessToken: string };

    const characterResponse = await api.post('/characters', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      data: {
        name: `Premium QA ${suffix.slice(-6)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    expect(characterResponse.ok()).toBe(true);
    const character = (await characterResponse.json()) as { id: string };

    await prisma.user.update({
      where: { email },
      data: {
        premiumUntil: new Date(Date.now() + (28 * 24 + 6) * 60 * 60 * 1_000),
      },
    });

    return {
      accessToken: auth.accessToken,
      characterId: character.id,
      email,
    };
  } finally {
    await api.dispose();
  }
}

test.describe('visão geral Premium', () => {
  let player: DashboardPlayer;

  test.beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });
    player = await createPremiumPlayer();
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });
    await prisma.$disconnect();
  });

  test('exibe prazo da conta e considera o pet como sétimo slot', async ({
    page,
  }, testInfo) => {
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

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/dashboard/${player.characterId}`);

    const premiumCard = page.locator('.dashboard-card--premium-overview');
    await expect(premiumCard).toBeVisible();
    await expect(premiumCard.getByText('Premium ativo')).toBeVisible();
    await expect(
      premiumCard.getByText('28 dias e 6 horas restantes'),
    ).toBeVisible();
    await expect(
      premiumCard.getByRole('link', { name: 'Gerenciar Premium' }),
    ).toHaveAttribute('href', `/dashboard/${player.characterId}/membership`);

    const equipmentCard = page.locator('.dashboard-card--equipment');
    await expect(
      equipmentCard.locator('.equipment-summary__intro strong'),
    ).toHaveText(/^\d\/7 slots ocupados$/);
    await expect(
      equipmentCard.locator('.equipment-summary-slot--pet'),
    ).toBeVisible();

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('visao-geral-premium-desktop.png'),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });

    await expect(premiumCard).toBeVisible();
    await expect(
      premiumCard.locator('.dashboard-premium-status__expiration'),
    ).toBeVisible();

    const mobileLayout = await page.evaluate(() => ({
      documentOverflows:
        document.documentElement.scrollWidth > window.innerWidth,
      premiumCardOverflows: (() => {
        const card = document.querySelector<HTMLElement>(
          '.dashboard-card--premium-overview',
        );
        return card ? card.scrollWidth > card.clientWidth : true;
      })(),
      equipmentCardOverflows: (() => {
        const card = document.querySelector<HTMLElement>(
          '.dashboard-card--equipment',
        );
        return card ? card.scrollWidth > card.clientWidth : true;
      })(),
    }));

    expect(mobileLayout).toEqual({
      documentOverflows: false,
      premiumCardOverflows: false,
      equipmentCardOverflows: false,
    });

    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('visao-geral-premium-mobile.png'),
        fullPage: true,
      });
    }
  });
});
