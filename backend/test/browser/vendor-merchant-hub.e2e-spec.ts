import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
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

type MerchantPlayer = {
  email: string;
  accessToken: string;
  characterId: string;
};

async function dismissBlockingGuidance(page: Page) {
  for (const accessibleName of ['Ocultar tutorial', 'Fechar alerta']) {
    const button = page.getByRole('button', { name: accessibleName }).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) continue;

    await button.click();
    await expect(button).toBeHidden();
  }
}

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
    await dismissBlockingGuidance(page);
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

    const cosmeticMerchantCard = page.getByRole('link', {
      name: 'Abrir Ateliê da Vera',
    });
    await expect(cosmeticMerchantCard).toBeVisible();
    await expect(
      cosmeticMerchantCard.locator('.merchant-card__offer-copy strong'),
    ).toHaveText(['Aparência']);
    await expect(cosmeticMerchantCard).toHaveAttribute(
      'href',
      `/dashboard/${player.characterId}/consumables/vera`,
    );
    const cosmeticMerchantPortrait = cosmeticMerchantCard.locator(
      '.merchant-card__avatar img',
    );
    await expect(cosmeticMerchantPortrait).toBeVisible();
    await expect
      .poll(() =>
        cosmeticMerchantPortrait.evaluate(
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
    await dismissBlockingGuidance(page);
    const maraHero = page.getByLabel('Mara, a Mercadora');
    await expect(maraHero).toHaveAttribute('data-merchant', 'mara');
    await expect(maraHero.locator('.vendor-npc-fallback img')).toBeVisible();
    await expect(
      page.getByText('Passe Premium de 30 dias', { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('merchant-mara-mobile.png'),
      fullPage: true,
    });
  });

  test('abre o Ateliê da Vera com as seis áreas de aparência', async ({
    page,
  }, testInfo) => {
    await prisma.character.update({
      where: { id: player.characterId },
      data: { gold: 5_000 },
    });

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

    await page.goto(`/dashboard/${player.characterId}/consumables/vera`);
    await expect(
      page.getByRole('heading', { name: 'Vera, a Curadora' }),
    ).toBeVisible();
    await dismissBlockingGuidance(page);
    const veraHero = page.getByLabel('Vera, a Curadora');
    await expect(veraHero).toHaveClass(/vendor-lore-card/);
    await expect(veraHero).toHaveAttribute('data-merchant', 'vera');
    const veraPortrait = veraHero.locator('.vendor-npc-fallback img');
    await expect(veraPortrait).toBeVisible();
    await expect
      .poll(() =>
        veraPortrait.evaluate(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(page.getByLabel('Seus saldos')).toHaveCount(0);
    await expect(page.getByText('Coleção regular')).toHaveCount(0);
    await expect(page.getByText('Seleção especial')).toHaveCount(0);
    await expect(page.getByText('Categoria selecionada')).toHaveCount(0);

    const tabs = page.getByRole('tablist', {
      name: 'Categorias de aparência',
    });
    const categoryLabels = [
      'Avatar',
      'Moldura',
      'Cartão',
      'Visão geral',
      'Efeito',
      'Identidade',
    ];
    for (const label of categoryLabels) {
      await expect(tabs.getByRole('tab', { name: label })).toBeVisible();
    }

    for (const label of categoryLabels) {
      await tabs.getByRole('tab', { name: label }).click();
      await expect(page.locator('.cosmetic-vendor-product')).toHaveCount(2);
    }

    const stock = page.locator('.cosmetic-vendor-stock');
    await expect
      .poll(() =>
        stock.evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
      )
      .toBe(2);
    await expect(page.getByText('Estoque em preparação')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Minha aparência' }),
    ).toHaveAttribute('href', `/dashboard/${player.characterId}/appearance`);

    await tabs.getByRole('tab', { name: 'Avatar' }).click();
    const avatarProducts = page.locator('.cosmetic-vendor-product');
    await expect(avatarProducts).toHaveCount(2);
    for (const product of await avatarProducts.all()) {
      const artwork = product.locator('.cosmetic-vendor-preview img');
      await expect(artwork).toBeVisible();
      await expect
        .poll(() =>
          artwork.evaluate(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }

    const firstProduct = avatarProducts.first();
    await firstProduct.getByRole('button', { name: 'Comprar' }).click();
    await expect(
      firstProduct.getByRole('button', { name: 'Adquirido' }),
    ).toBeVisible();
    await expect(
      firstProduct.locator('.cosmetic-vendor-product__meta strong'),
    ).toHaveText('Adquirido');

    await page.screenshot({
      path: testInfo.outputPath('cosmetic-merchant-desktop.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForTimeout(250);
    await dismissBlockingGuidance(page);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await expect(tabs.getByRole('tab', { name: 'Visão geral' })).toBeVisible();
    await expect
      .poll(() =>
        stock.evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
      )
      .toBe(2);
    const mobileCards = await page.locator('.cosmetic-vendor-product').all();
    expect(mobileCards).toHaveLength(2);
    const [firstMobileCardBox, secondMobileCardBox] = await Promise.all([
      mobileCards[0].boundingBox(),
      mobileCards[1].boundingBox(),
    ]);
    expect(firstMobileCardBox).not.toBeNull();
    expect(secondMobileCardBox).not.toBeNull();
    expect(
      Math.abs(firstMobileCardBox!.y - secondMobileCardBox!.y),
    ).toBeLessThanOrEqual(2);
    expect(secondMobileCardBox!.x).toBeGreaterThan(firstMobileCardBox!.x);
    await page.screenshot({
      path: testInfo.outputPath('cosmetic-merchant-mobile.png'),
      fullPage: true,
    });
  });
});
