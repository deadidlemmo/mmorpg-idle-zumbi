import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const testEmailSuffix = '@dead-idle.test';
const prisma = new PrismaClient();

type PlayerFixture = {
  email: string;
  accessToken: string;
  characterId: string;
  characterName: string;
};

async function createPlayer(label: string): Promise<PlayerFixture> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `chat-${label}-${suffix}${testEmailSuffix}`;
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
      throw new Error(`Registro do chat falhou: ${await registration.text()}`);
    }
    const auth = (await registration.json()) as { accessToken: string };
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
        `Personagem do chat falhou: ${await characterResponse.text()}`,
      );
    }
    const character = (await characterResponse.json()) as { id: string };

    return {
      email,
      accessToken: auth.accessToken,
      characterId: character.id,
      characterName,
    };
  } finally {
    await api.dispose();
  }
}

async function cleanupChatTestPlayers() {
  return prisma.user.deleteMany({
    where: {
      email: {
        startsWith: 'chat-',
        endsWith: testEmailSuffix,
      },
    },
  });
}

async function openPlayerPage(
  browser: Browser,
  player: PlayerFixture,
  options?: BrowserContextOptions,
) {
  const context = await browser.newContext(options);
  await context.addInitScript(
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
  const page = await context.newPage();
  await page.goto(`/dashboard/${player.characterId}`);
  await expect(
    page
      .getByRole('heading', { name: player.characterName, exact: true })
      .first(),
  ).toBeVisible();

  return { context, page };
}

async function openChat(page: Page) {
  await page.getByRole('button', { name: 'Abrir chat geral' }).click();
  const chat = page.getByRole('region', { name: 'Chat geral' });
  await expect(chat.getByText('Conectado', { exact: true })).toBeVisible();
  return chat;
}

async function expectChatInsideViewport(page: Page, testInfo: TestInfo) {
  const chat = page.getByRole('region', { name: 'Chat geral' });
  const box = await chat.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);

  const hasHorizontalOverflow = await chat.evaluate(
    (element) => element.scrollWidth > element.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.screenshot({
    path: testInfo.outputPath(
      `chat-${viewport!.width}x${viewport!.height}.png`,
    ),
    fullPage: true,
  });
}

test.describe('chat geral', () => {
  test.describe.configure({ mode: 'serial' });

  let firstPlayer: PlayerFixture;
  let secondPlayer: PlayerFixture;
  const contexts: BrowserContext[] = [];

  test.beforeAll(async () => {
    await cleanupChatTestPlayers();
    firstPlayer = await createPlayer('Alpha');
    secondPlayer = await createPlayer('Bravo');
  });

  test.afterAll(async () => {
    await Promise.all(contexts.map((context) => context.close()));
    const deleted = await cleanupChatTestPlayers();
    expect(deleted.count).toBeGreaterThanOrEqual(2);
    expect(
      await prisma.user.count({
        where: {
          email: { startsWith: 'chat-', endsWith: testEmailSuffix },
        },
      }),
    ).toBe(0);
    await prisma.$disconnect();
  });

  test('entrega em tempo real e recupera a mensagem após F5', async ({
    browser,
  }, testInfo) => {
    const first = await openPlayerPage(browser, firstPlayer);
    const second = await openPlayerPage(browser, secondPlayer);
    contexts.push(first.context, second.context);
    const firstChat = await openChat(first.page);
    const secondChat = await openChat(second.page);
    const message = `Canal geral ${randomUUID().slice(0, 8)}`;

    await firstChat
      .getByRole('textbox', { name: 'Mensagem para o chat geral' })
      .fill(message);
    await firstChat.getByRole('button', { name: 'Enviar mensagem' }).click();

    await expect(firstChat.getByText(message, { exact: true })).toBeVisible();
    await expect(secondChat.getByText(message, { exact: true })).toBeVisible();

    await second.page.reload();
    const reloadedChat = await openChat(second.page);
    await expect(
      reloadedChat.getByText(message, { exact: true }),
    ).toBeVisible();
    await expectChatInsideViewport(second.page, testInfo);
  });

  test('mantém o painel íntegro em viewport móvel', async ({
    browser,
  }, testInfo) => {
    const mobile = await openPlayerPage(browser, firstPlayer, {
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    contexts.push(mobile.context);

    const chat = await openChat(mobile.page);
    await expect(
      chat.getByRole('textbox', { name: 'Mensagem para o chat geral' }),
    ).toBeVisible();
    await expect(
      chat.getByRole('button', { name: 'Enviar mensagem' }),
    ).toBeVisible();
    await expectChatInsideViewport(mobile.page, testInfo);
  });
});
