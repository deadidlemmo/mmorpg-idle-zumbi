import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, request as playwrightRequest, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const prisma = new PrismaClient();

type MerchantPlayer = {
  email: string;
  accessToken: string;
  characterId: string;
};

async function createPlayer(): Promise<MerchantPlayer> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `vendor-hub-e2e-${suffix}@example.com`;

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
        `Registro do mercador falhou: ${await registration.text()}`,
      );
    }
    const auth = (await registration.json()) as { accessToken: string };
    const characterResponse = await api.post('/characters', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      data: {
        name: `Cliente Mara ${suffix.slice(-6)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    if (!characterResponse.ok()) {
      throw new Error(
        `Personagem do mercador falhou: ${await characterResponse.text()}`,
      );
    }
    const character = (await characterResponse.json()) as { id: string };

    return {
      email,
      accessToken: auth.accessToken,
      characterId: character.id,
    };
  } finally {
    await api.dispose();
  }
}

test.describe('hub de mercadores', () => {
  let player: MerchantPlayer;

  test.beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'vendor-hub-e2e-' } },
    });
    player = await createPlayer();
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'vendor-hub-e2e-' } },
    });
    await prisma.$disconnect();
  });

  test('exibe a Mara em uma linha ampliada e abre o estoque', async ({
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

    await page.goto(`/dashboard/${player.characterId}/consumables`);
    await expect(
      page.getByRole('heading', { name: 'Mercadores do Abrigo' }),
    ).toBeVisible();
    const merchantList = page.getByLabel('Lista de mercadores');
    await expect(
      merchantList.getByText('Mercador', { exact: true }),
    ).toBeVisible();
    await expect(
      merchantList.getByText('Especialidade', { exact: true }),
    ).toBeVisible();

    const heroArtwork = page.locator('.merchant-hub-hero__portrait img');
    await expect(heroArtwork).toBeVisible();
    await expect
      .poll(() =>
        heroArtwork.evaluate(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      )
      .toBe(true);

    const heroImageBox = await heroArtwork.boundingBox();
    const heroContentBox = await page
      .locator('.merchant-hub-hero .gathering-origin-npc__content')
      .boundingBox();
    expect(heroImageBox).not.toBeNull();
    expect(heroContentBox).not.toBeNull();
    expect(
      Math.abs(
        heroImageBox!.y +
          heroImageBox!.height / 2 -
          (heroContentBox!.y + heroContentBox!.height / 2),
      ),
    ).toBeLessThanOrEqual(4);

    const merchantCard = page.getByRole('link', {
      name: 'Abrir Balcão da Mara',
    });
    await expect(merchantCard).toBeVisible();
    await expect(
      merchantCard.locator('.merchant-card__offer-copy strong'),
    ).toHaveText(['Poções']);
    await expect(merchantCard).toHaveAttribute(
      'href',
      `/dashboard/${player.characterId}/consumables/mara`,
    );
    await expect
      .poll(() =>
        merchantCard
          .locator('.merchant-card__avatar img')
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
      )
      .toBe(true);

    const avatarBox = await merchantCard
      .locator('.merchant-card__avatar')
      .boundingBox();
    const avatarImageBox = await merchantCard
      .locator('.merchant-card__avatar img')
      .boundingBox();
    expect(avatarBox).not.toBeNull();
    expect(avatarImageBox).not.toBeNull();
    expect(avatarBox!.width).toBeGreaterThanOrEqual(72);
    expect(avatarImageBox!.width).toBeGreaterThanOrEqual(avatarBox!.width * 2);

    const typography = await page.evaluate(() => ({
      heroTitle: getComputedStyle(
        document.querySelector('.merchant-hub-hero h2')!,
      ).fontFamily,
      heroBody: getComputedStyle(
        document.querySelector('.merchant-hub-hero p')!,
      ).fontFamily,
      merchantTitle: getComputedStyle(
        document.querySelector('.merchant-card h3')!,
      ).fontFamily,
      merchantBody: getComputedStyle(
        document.querySelector('.merchant-card__npc > span')!,
      ).fontFamily,
    }));
    expect(typography.heroTitle).toContain('Rajdhani');
    expect(typography.heroBody).toContain('Inter');
    expect(typography.merchantTitle).toContain('Rajdhani');
    expect(typography.merchantBody).toContain('Inter');

    const desktopBox = await merchantCard.boundingBox();
    expect(desktopBox).not.toBeNull();
    expect(desktopBox!.height).toBeGreaterThanOrEqual(80);
    expect(desktopBox!.height).toBeLessThanOrEqual(124);
    await page.screenshot({
      path: testInfo.outputPath('merchant-hub-desktop.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBox = await merchantCard.boundingBox();
    expect(mobileBox).not.toBeNull();
    expect(mobileBox!.height).toBeGreaterThanOrEqual(88);
    expect(mobileBox!.height).toBeLessThanOrEqual(136);
    const mobileAvatarBox = await merchantCard
      .locator('.merchant-card__avatar')
      .boundingBox();
    expect(mobileAvatarBox).not.toBeNull();
    expect(mobileAvatarBox!.width).toBeGreaterThanOrEqual(60);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('merchant-hub-mobile.png'),
      fullPage: true,
    });

    await merchantCard.click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${player.characterId}/consumables/mara$`),
    );
    await expect(
      page.getByRole('heading', { name: 'Mara, a Mercadora' }),
    ).toBeVisible();
    await expect(
      page.getByText('Passe Premium de 30 dias', { exact: true }),
    ).toHaveCount(0);
  });
});
