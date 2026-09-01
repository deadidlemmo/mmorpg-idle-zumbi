import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, request as playwrightRequest, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const testEmailPrefix = 'incursions-modal-e2e-';
const prisma = new PrismaClient();

type IncursionPlayer = {
  accessToken: string;
  characterId: string;
};

async function createPlayer(): Promise<IncursionPlayer> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  try {
    const registration = await api.post('/auth/register', {
      data: {
        email: `${testEmailPrefix}${suffix}@example.test`,
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
        name: `Incursão QA ${suffix.slice(-6)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    expect(characterResponse.ok()).toBe(true);
    const character = (await characterResponse.json()) as { id: string };

    return {
      accessToken: auth.accessToken,
      characterId: character.id,
    };
  } finally {
    await api.dispose();
  }
}

test.describe('modal de incursões', () => {
  let player: IncursionPlayer;

  test.beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });
    player = await createPlayer();
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });
    await prisma.$disconnect();
  });

  test('mantém arte, dificuldades e recompensas equilibradas', async ({
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

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/dashboard/${player.characterId}/incursions`);
    await expect(
      page.getByRole('heading', { name: 'Incursões', exact: true }),
    ).toBeVisible();
    const closeWorldBossAlert = page.getByRole('button', {
      name: 'Fechar alerta',
    });
    if ((await closeWorldBossAlert.count()) > 0) {
      await closeWorldBossAlert.click();
    }
    await page.locator('.incursion-card').first().click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    const desktop = await modal.evaluate((element) => {
      const hero = element.querySelector<HTMLElement>(
        '.incursions-modal__hero',
      )!;
      const body = element.querySelector<HTMLElement>(
        '.incursions-modal__body',
      )!;
      const approach = element.querySelector<HTMLElement>(
        '.incursions-modal__approach',
      )!;
      const rewards = element.querySelector<HTMLElement>(
        '.incursions-modal__rewards',
      )!;
      const bodyRect = body.getBoundingClientRect();
      const approachRect = approach.getBoundingClientRect();
      const rewardsRect = rewards.getBoundingClientRect();

      return {
        heroHeight: hero.getBoundingClientRect().height,
        sectionsAligned: Math.abs(approachRect.y - rewardsRect.y),
        rewardsVisibleHeight:
          Math.min(rewardsRect.bottom, bodyRect.bottom) -
          Math.max(rewardsRect.top, bodyRect.top),
        hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
      };
    });

    expect(desktop.heroHeight).toBeLessThanOrEqual(210);
    expect(desktop.sectionsAligned).toBeLessThanOrEqual(2);
    expect(desktop.rewardsVisibleHeight).toBeGreaterThan(260);
    expect(desktop.hasHorizontalOverflow).toBe(false);
    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('modal-incursoes-desktop.png'),
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });

    const mobile = await modal.evaluate((element) => {
      const hero = element.querySelector<HTMLElement>(
        '.incursions-modal__hero',
      )!;
      const body = element.querySelector<HTMLElement>(
        '.incursions-modal__body',
      )!;
      const approach = element.querySelector<HTMLElement>(
        '.incursions-modal__approach',
      )!;
      const rewards = element.querySelector<HTMLElement>(
        '.incursions-modal__rewards',
      )!;
      const firstReward = element.querySelector<HTMLElement>(
        '.incursion-loot-card',
      )!;
      const bodyRect = body.getBoundingClientRect();
      const approachRect = approach.getBoundingClientRect();
      const rewardsRect = rewards.getBoundingClientRect();
      const firstRewardRect = firstReward.getBoundingClientRect();

      return {
        heroHeight: hero.getBoundingClientRect().height,
        rewardsFollowApproach: rewardsRect.y > approachRect.y,
        firstRewardVisible: firstRewardRect.top < bodyRect.bottom,
        hasHorizontalOverflow:
          element.scrollWidth > element.clientWidth ||
          document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(mobile.heroHeight).toBeLessThanOrEqual(150);
    expect(mobile.rewardsFollowApproach).toBe(true);
    expect(mobile.firstRewardVisible).toBe(true);
    expect(mobile.hasHorizontalOverflow).toBe(false);
    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('modal-incursoes-mobile.png'),
      });
    }
  });
});
