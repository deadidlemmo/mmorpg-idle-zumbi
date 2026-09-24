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
const testEmailPrefix = 'dashboard-overview-premium-e2e-';
const prisma = new PrismaClient();

const expectedSidebarSections = [
  {
    key: 'overview',
    label: 'Visão geral',
    items: ['Visão geral', 'Premium'],
  },
  {
    key: 'character',
    label: 'Personagem',
    items: [
      'Perfil',
      'Aparência',
      'Mochila',
      'Equipamentos',
      'Pets',
      'Objetivos',
      'Mapas',
    ],
  },
  {
    key: 'activities',
    label: 'Atividades',
    items: [
      'Desmanche',
      'Coleta',
      'Patrulha',
      'Arsenal',
      'Tecnovarredura',
      'Contenção',
    ],
  },
  {
    key: 'combat',
    label: 'Combate',
    items: ['Combate Automático', 'Incursões', 'Ameaças Globais'],
  },
  {
    key: 'trades',
    label: 'Trocas',
    items: ['Comerciantes', 'Mercado'],
  },
  {
    key: 'shelter',
    label: 'Abrigo',
    items: ['Enfermaria', 'Ferreiro', 'Criação'],
  },
  {
    key: 'community',
    label: 'Comunidade',
    items: ['Ranking', 'Aliados', 'Wiki', 'Discord'],
  },
] as const;

type DashboardPlayer = {
  accessToken: string;
  characterId: string;
  email: string;
};

async function expectSidebarStructure(page: Page, characterId: string) {
  const sidebar = page.locator('.dashboard-sidebar');
  const sections = sidebar.locator('.dashboard-sidebar__nav-section');

  await expect(sections).toHaveCount(expectedSidebarSections.length);

  for (const [index, expectedSection] of expectedSidebarSections.entries()) {
    const section = sections.nth(index);
    await expect(section).toHaveAttribute(
      'data-nav-section',
      expectedSection.key,
    );
    await expect(
      section.locator(':scope > .dashboard-sidebar__section-label'),
    ).toHaveText(expectedSection.label);
    await expect(
      section.locator(':scope > .dashboard-sidebar__link > strong'),
    ).toHaveText([...expectedSection.items]);
  }

  await expect(
    sidebar.getByRole('link', { name: 'Perfil', exact: true }),
  ).toHaveAttribute('href', `/dashboard/${characterId}/inspect/${characterId}`);

  const activityLinks = sidebar.locator(
    '[data-nav-section="activities"] > .dashboard-sidebar__link',
  );
  await expect(activityLinks).toHaveCount(6);
  const activityHrefs = await activityLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  );
  expect(activityHrefs).toEqual([
    `/dashboard/${characterId}/gathering/desmanche`,
    `/dashboard/${characterId}/gathering/coleta`,
    `/dashboard/${characterId}/gathering/patrulha`,
    `/dashboard/${characterId}/gathering/arsenal`,
    `/dashboard/${characterId}/gathering/tecnovarredura`,
    `/dashboard/${characterId}/gathering/contencao`,
  ]);
  await expect(
    sidebar.locator(
      '[data-nav-section="activities"] > .dashboard-sidebar__link > .dashboard-sidebar__subitem-level',
    ),
  ).toHaveCount(6);
  await expect(sidebar.locator('.dashboard-sidebar__link--toggle')).toHaveCount(
    0,
  );
  await expect(sidebar.locator('.dashboard-sidebar__subnav')).toHaveCount(0);
  await expect(sidebar.getByText('Expedições', { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText('Mercador', { exact: true })).toHaveCount(0);
  await expect(
    sidebar.getByText('Mercado do Abrigo', { exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebar.getByRole('link', { name: 'Premium', exact: true }),
  ).toHaveClass(/dashboard-sidebar__link--premium/);
  await expect(
    sidebar.getByRole('link', { name: 'Entrar no Discord' }),
  ).toHaveClass(/dashboard-sidebar__link--discord/);
  await expect(
    sidebar.locator('.dashboard-sidebar__bottom > button'),
  ).toHaveText(['Trocar personagem', 'Sair da conta']);
}

async function dismissBlockingGuidance(page: Page) {
  for (const accessibleName of ['Ocultar tutorial', 'Fechar alerta']) {
    const button = page.getByRole('button', { name: accessibleName }).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) continue;

    await button.click();
    await expect(button).toBeHidden();
  }
}

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

  test('organiza o menu e preserva prazo Premium e sétimo slot', async ({
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
    await dismissBlockingGuidance(page);

    await expectSidebarStructure(page, player.characterId);

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

    await dismissBlockingGuidance(page);
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const mobileSidebar = page.locator('.dashboard-sidebar');
    await expect(mobileSidebar).toHaveClass(/is-open/);
    await expectSidebarStructure(page, player.characterId);
    const mobileNavOverflows = await mobileSidebar
      .locator('.dashboard-sidebar__nav-section > .dashboard-sidebar__link')
      .evaluateAll((links) =>
        links.some((link) => link.scrollWidth > link.clientWidth),
      );
    expect(mobileNavOverflows).toBe(false);
    await mobileSidebar
      .locator('[data-nav-section="activities"]')
      .scrollIntoViewIfNeeded();
    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('sidebar-mobile-activities.png'),
      });
    }
    await mobileSidebar.evaluate((sidebar) => {
      sidebar.scrollTop = sidebar.scrollHeight;
    });
    await expect(
      mobileSidebar.locator('.dashboard-sidebar__bottom'),
    ).toBeVisible();
    if (process.env.E2E_CAPTURE_UI === 'true') {
      await page.screenshot({
        path: testInfo.outputPath('sidebar-mobile-bottom.png'),
      });
    }
    await page
      .locator('[data-nav-section="overview"]')
      .getByRole('link', { name: 'Visão geral', exact: true })
      .click();
    await expect(mobileSidebar).not.toHaveClass(/is-open/);

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
