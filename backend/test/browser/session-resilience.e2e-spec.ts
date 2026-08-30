import 'dotenv/config';

import { createHmac, randomUUID } from 'node:crypto';
import {
  ActivityStatus,
  ItemSlot,
  MaterialOrigin,
  PrismaClient,
} from '@prisma/client';
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

let userEmail = '';
let accessToken = '';
let characterId = '';
let characterName = '';
let mapId = '';

function encodeJwtPart(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createExpiredToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJwtPart({
    sub: randomUUID(),
    email: 'expired-e2e@dead-idle.test',
    role: 'PLAYER',
    tokenVersion: 0,
    iat: now - 3600,
    exp: now - 60,
  });
  const signature = createHmac(
    'sha256',
    process.env.JWT_SECRET ?? 'dev-secret-change-me',
  )
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

async function authenticatePage(page: Page, token = accessToken) {
  await page.addInitScript(
    ({ authToken, selectedCharacterId, tokenKey, characterKey }) => {
      window.localStorage.setItem(tokenKey, authToken);
      window.localStorage.setItem(characterKey, selectedCharacterId);
    },
    {
      authToken: token,
      selectedCharacterId: characterId,
      tokenKey: accessTokenKey,
      characterKey: selectedCharacterKey,
    },
  );
}

async function openDashboard(page: Page) {
  await authenticatePage(page);
  await page.goto(`/dashboard/${characterId}`);
  await expect(
    page.getByRole('heading', { name: characterName, exact: true }).first(),
  ).toBeVisible();
}

test.describe('resiliencia da sessao e tutorial', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    userEmail = `browser-e2e-${suffix}@dead-idle.test`;
    characterName = `E2E ${suffix.slice(-8)}`;

    const registration = await api.post('/auth/register', {
      data: {
        email: userEmail,
        password: 'TesteE2E123',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    if (!registration.ok()) {
      throw new Error(`Registro E2E falhou: ${await registration.text()}`);
    }
    const auth = (await registration.json()) as { accessToken: string };
    accessToken = auth.accessToken;

    const characterResponse = await api.post('/characters', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: characterName,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    if (!characterResponse.ok()) {
      throw new Error(
        `Criação de personagem E2E falhou: ${await characterResponse.text()}`,
      );
    }
    const character = (await characterResponse.json()) as { id: string };
    characterId = character.id;

    const mapsResponse = await api.get('/maps');
    if (!mapsResponse.ok()) {
      throw new Error(
        `Consulta de mapas E2E falhou: ${await mapsResponse.text()}`,
      );
    }
    const maps = (await mapsResponse.json()) as Array<{ id: string }>;
    if (!maps[0]?.id)
      throw new Error('Nenhum mapa canônico disponível no E2E.');
    mapId = maps[0].id;

    const mapSelection = await api.patch(
      `/characters/${characterId}/current-map`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { mapId },
      },
    );
    if (!mapSelection.ok()) {
      throw new Error(
        `Seleção de mapa E2E falhou: ${await mapSelection.text()}`,
      );
    }
    await api.dispose();
  });

  test.afterAll(async () => {
    if (userEmail) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
    await prisma.$disconnect();
  });

  test('remove token expirado e retorna ao login', async ({ page }) => {
    await authenticatePage(page, createExpiredToken());
    await page.goto('/characters');

    await expect(
      page.getByRole('button', { name: 'Entrar no abrigo' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), accessTokenKey),
      )
      .toBeNull();
  });

  test('restaura personagem e estado do servidor depois de F5', async ({
    page,
  }) => {
    await openDashboard(page);
    await page.reload();

    await expect(page).toHaveURL(new RegExp(`/dashboard/${characterId}/?$`));
    await expect(
      page.getByRole('heading', { name: characterName, exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Tutorial do sobrevivente' }),
    ).toBeVisible();
  });

  test('reconecta os WebSockets depois de perda de transporte', async ({
    page,
  }) => {
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });
    const startHunt = await api.post('/auto-combat/hunt/start', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { characterId, mapId },
    });

    if (!startHunt.ok()) {
      throw new Error(`Início da caça E2E falhou: ${await startHunt.text()}`);
    }

    const socketUrls: string[] = [];
    page.on('websocket', (socket) => socketUrls.push(socket.url()));

    try {
      await openDashboard(page);
      await expect
        .poll(() => socketUrls.filter((url) => url.includes('EIO=4')).length)
        .toBeGreaterThan(0);
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as {
                __deadIdleE2E?: { isAutoCombatConnected: () => boolean };
              }
            ).__deadIdleE2E?.isAutoCombatConnected(),
          ),
        )
        .toBe(true);
      const initialSocketCount = socketUrls.length;

      const reconnected = page.waitForEvent('websocket', {
        predicate: (socket) => socket.url().includes('EIO=4'),
        timeout: 20_000,
      });
      await page.evaluate(() => {
        const control = (
          window as unknown as {
            __deadIdleE2E?: { dropAutoCombatTransport: () => void };
          }
        ).__deadIdleE2E;

        if (!control) throw new Error('Controle Socket.IO E2E indisponível.');
        control.dropAutoCombatTransport();
      });
      await reconnected;

      await expect
        .poll(() => socketUrls.length)
        .toBeGreaterThan(initialSocketCount);
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as {
                __deadIdleE2E?: { isAutoCombatConnected: () => boolean };
              }
            ).__deadIdleE2E?.isAutoCombatConnected(),
          ),
        )
        .toBe(true);
      await expect(
        page.getByRole('heading', { name: characterName, exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText('Token de autenticação não enviado no WebSocket.'),
      ).toHaveCount(0);
    } finally {
      await api.post(`/auto-combat/${characterId}/hunt/stop`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await api.dispose();
    }
  });

  test('troca o material de gathering sem manter duas sessões ativas', async () => {
    const materials = await prisma.item.findMany({
      where: {
        isGatheringMaterial: true,
        materialOrigin: {
          not: null,
          notIn: [MaterialOrigin.DROP_MOBS],
        },
        map: { minLevel: { lte: 1 } },
      },
      select: {
        id: true,
        name: true,
        mapId: true,
        materialOrigin: true,
        requiredGatheringLevel: true,
      },
      orderBy: [{ mapId: 'asc' }, { materialOrigin: 'asc' }, { name: 'asc' }],
    });
    const materialGroups = new Map<string, typeof materials>();

    for (const material of materials) {
      if (!material.mapId || !material.materialOrigin) continue;
      const key = `${material.mapId}:${material.materialOrigin}`;
      materialGroups.set(key, [...(materialGroups.get(key) ?? []), material]);
    }

    const pair = [...materialGroups.values()].find(
      (group) => group.length >= 2,
    );
    if (!pair?.[0]?.mapId || !pair[0].materialOrigin || !pair[1]) {
      throw new Error(
        'O E2E precisa de dois materiais de gathering nível 1 no mesmo mapa e origem.',
      );
    }

    const requiredGatheringLevel = Math.max(
      pair[0].requiredGatheringLevel,
      pair[1].requiredGatheringLevel,
    );
    await prisma.characterGatheringSkill.upsert({
      where: {
        characterId_origin: {
          characterId,
          origin: pair[0].materialOrigin,
        },
      },
      create: {
        characterId,
        origin: pair[0].materialOrigin,
        level: requiredGatheringLevel,
      },
      update: { level: requiredGatheringLevel },
    });

    await prisma.gatheringSession.updateMany({
      where: { characterId, status: ActivityStatus.ACTIVE },
      data: { status: ActivityStatus.STOPPED },
    });

    const api = await playwrightRequest.newContext({ baseURL: apiUrl });

    try {
      const firstStart = await api.post('/gathering/start', {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          characterId,
          mapId: pair[0].mapId,
          origin: pair[0].materialOrigin,
          targetMaterialId: pair[0].id,
        },
      });
      if (!firstStart.ok()) {
        throw new Error(
          `Primeiro gathering E2E falhou: ${await firstStart.text()}`,
        );
      }
      const first = (await firstStart.json()) as {
        session: { id: string };
      };

      const persistedFirstSession =
        await prisma.gatheringSession.findUniqueOrThrow({
          where: { id: first.session.id },
          select: { cycleDurationMs: true },
        });
      const cycleDurationMs = persistedFirstSession.cycleDurationMs ?? 10_000;
      const lastResolvedAt = new Date(Date.now() - 60_000);
      const cycleStartedAt = new Date(
        lastResolvedAt.getTime() - Math.floor(cycleDurationMs * 0.9999),
      );

      await prisma.gatheringSession.update({
        where: { id: first.session.id },
        data: {
          lastResolvedAt,
          progressRemainder: 0.9999,
          cycleStartedAt,
          cycleEndsAt: new Date(cycleStartedAt.getTime() + cycleDurationMs),
        },
      });

      const secondStart = await api.post('/gathering/start', {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          characterId,
          mapId: pair[0].mapId,
          origin: pair[0].materialOrigin,
          targetMaterialId: pair[1].id,
        },
      });
      if (!secondStart.ok()) {
        throw new Error(
          `Troca de gathering E2E falhou: ${await secondStart.text()}`,
        );
      }
      const second = (await secondStart.json()) as {
        switched: boolean;
        session: { id: string; targetMaterial: { id: string } };
        previousGathering: {
          collected: { quantity: number };
          session: { id: string; status: string };
        } | null;
      };

      expect(second.switched).toBe(true);
      expect(second.session.targetMaterial.id).toBe(pair[1].id);
      expect(second.previousGathering?.session.id).toBe(first.session.id);
      expect(second.previousGathering?.session.status).toBe(
        ActivityStatus.STOPPED,
      );
      expect(second.previousGathering?.collected.quantity ?? 0).toBeGreaterThan(
        0,
      );

      const activeSessions = await prisma.gatheringSession.findMany({
        where: { characterId, status: ActivityStatus.ACTIVE },
        select: { id: true, targetMaterialId: true },
      });
      expect(activeSessions).toEqual([
        { id: second.session.id, targetMaterialId: pair[1].id },
      ]);
    } finally {
      await api.post(`/gathering/${characterId}/stop`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await api.dispose();
    }
  });

  test('avanca e persiste todas as etapas do tutorial', async ({ page }) => {
    const visualOutputDir = process.env.E2E_VISUAL_OUTPUT_DIR;
    await prisma.gatheringSession.deleteMany({ where: { characterId } });
    await prisma.craftingSession.deleteMany({ where: { characterId } });
    await prisma.characterTutorialProgress.upsert({
      where: { characterId },
      create: { characterId },
      update: {
        step: 0,
        completed: false,
        completedAt: null,
        dismissedAt: null,
      },
    });
    await openDashboard(page);

    const tutorial = page.getByRole('complementary', {
      name: 'Tutorial do sobrevivente',
    });
    const permanentObjective = page.getByRole('complementary', {
      name: 'Objetivo inicial permanente',
    });
    await expect(permanentObjective).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });

    await expect(tutorial.getByText('Conheça o abrigo')).toBeVisible();
    await tutorial.getByRole('button', { name: 'Entendi' }).click();

    await expect(tutorial.getByText('Vá para Mapas')).toBeVisible();
    await tutorial.getByRole('button', { name: 'Abrir mapas' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${characterId}/maps/?$`),
    );
    await expect(tutorial.getByText('Colete seu primeiro recurso')).toBeVisible(
      { timeout: 10_000 },
    );

    const tutorialAfterMap =
      await prisma.characterTutorialProgress.findUniqueOrThrow({
        where: { characterId },
      });
    const tutorialMaterial = await prisma.item.findFirst({
      where: {
        isGatheringMaterial: true,
        mapId: { not: null },
        materialOrigin: { not: null },
      },
      select: { id: true, mapId: true, materialOrigin: true },
    });
    if (!tutorialMaterial?.mapId || !tutorialMaterial.materialOrigin) {
      throw new Error('Material canônico indisponível para o tutorial E2E.');
    }

    await prisma.gatheringSession.create({
      data: {
        characterId,
        mapId: tutorialMaterial.mapId,
        origin: tutorialMaterial.materialOrigin,
        targetMaterialId: tutorialMaterial.id,
        status: ActivityStatus.STOPPED,
        startedAt: new Date(),
        lastResolvedAt: new Date(),
        collectedQuantity: 1,
        updatedAt: new Date(tutorialAfterMap.updatedAt.getTime() + 1),
      },
    });
    await expect(
      tutorial.getByText('Fabrique seu primeiro equipamento T1'),
    ).toBeVisible({ timeout: 10_000 });
    if (visualOutputDir) {
      await tutorial.screenshot({
        path: `${visualOutputDir}/tutorial-crafting-desktop.png`,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await tutorial.screenshot({
        path: `${visualOutputDir}/tutorial-crafting-mobile.png`,
      });
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    const tutorialAfterGathering =
      await prisma.characterTutorialProgress.findUniqueOrThrow({
        where: { characterId },
      });
    const recipe = await prisma.craftingRecipe.findFirst({
      where: {
        isActive: true,
        tier: 1,
        outputItem: { slot: ItemSlot.MAIN_HAND },
      },
      select: { id: true, outputItemId: true, outputQuantity: true },
    });
    if (!recipe) {
      throw new Error('Receita canônica indisponível para o tutorial E2E.');
    }

    const craftedAt = new Date(tutorialAfterGathering.updatedAt.getTime() + 1);
    await prisma.craftingSession.create({
      data: {
        characterId,
        recipeId: recipe.id,
        outputItemId: recipe.outputItemId,
        status: ActivityStatus.COMPLETED,
        quantity: 1,
        outputQuantity: recipe.outputQuantity,
        craftingXpGained: 1,
        durationSeconds: 1,
        startedAt: new Date(craftedAt.getTime() - 1_000),
        completesAt: craftedAt,
        completedAt: craftedAt,
        updatedAt: craftedAt,
      },
    });
    await expect(tutorial.getByText('Equipe seu primeiro item T1')).toBeVisible(
      { timeout: 10_000 },
    );

    const tutorialAfterCrafting =
      await prisma.characterTutorialProgress.findUniqueOrThrow({
        where: { characterId },
      });
    const equipmentItem = await prisma.item.findFirst({
      where: { id: recipe.outputItemId, tier: 1, slot: ItemSlot.MAIN_HAND },
      select: { id: true },
    });
    if (!equipmentItem) {
      throw new Error('Equipamento canônico indisponível para o tutorial E2E.');
    }

    await prisma.equipment.upsert({
      where: { characterId },
      create: {
        characterId,
        mainHandId: equipmentItem.id,
        updatedAt: new Date(tutorialAfterCrafting.updatedAt.getTime() + 1),
      },
      update: {
        mainHandId: equipmentItem.id,
        updatedAt: new Date(tutorialAfterCrafting.updatedAt.getTime() + 1),
      },
    });

    await expect(
      page.getByRole('complementary', { name: 'Tutorial do sobrevivente' }),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(permanentObjective).toBeVisible();
    await expect(permanentObjective.getByText('1/6')).toBeVisible();
    await expect
      .poll(async () => {
        const progress = await prisma.characterTutorialProgress.findUnique({
          where: { characterId },
          select: { step: true, completed: true },
        });
        return progress;
      })
      .toEqual({ step: 5, completed: true });
  });

  test('exibe o painel operacional para administradores', async ({ page }) => {
    await prisma.user.update({
      where: { email: userEmail },
      data: { role: 'ADMIN' },
    });
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });

    try {
      const login = await api.post('/auth/login', {
        data: { email: userEmail, password: 'TesteE2E123' },
      });
      if (!login.ok()) {
        throw new Error(
          `Login administrativo E2E falhou: ${await login.text()}`,
        );
      }
      const auth = (await login.json()) as { accessToken: string };

      await authenticatePage(page, auth.accessToken);
      await page.goto('/admin');

      await expect(
        page.getByRole('heading', { name: 'Operação do jogo' }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Infraestrutura' }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Produto e primeira hora' }),
      ).toBeVisible();
      await expect(
        page.getByRole('group', { name: 'Período das métricas' }),
      ).toBeVisible();
      await expect(page.locator('.admin-economy table')).toBeVisible();
      await expect(page.getByText('T1', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible();
      await expect(page.getByText('Backups', { exact: true })).toBeVisible();
      await expect(page.getByText('HTTP', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Não foi possível carregar os dados administrativos.'),
      ).toHaveCount(0);
    } finally {
      await api.dispose();
    }
  });
});
