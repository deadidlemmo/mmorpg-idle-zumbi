import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const prisma = new PrismaClient();

let userEmail = '';
let accessToken = '';
let characterId = '';
let mapId = '';

async function assertOk(response: APIResponse, label: string) {
  if (!response.ok()) {
    throw new Error(`${label}: ${await response.text()}`);
  }
}

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ({ token, selectedCharacterId }) => {
      window.localStorage.setItem('dead_idle_access_token', token);
      window.localStorage.setItem(
        'dead_idle_selected_character_id',
        selectedCharacterId,
      );
    },
    { token: accessToken, selectedCharacterId: characterId },
  );
}

async function readTimelinePair(page: Page) {
  return page.evaluate(() => {
    const local = document.querySelector<HTMLElement>(
      '.auto-combat-hunt-scan__track .activity-timeline-fill',
    );
    const global = document.querySelector<HTMLElement>(
      '.dashboard-topbar__activity-progress .activity-timeline-fill',
    );

    const read = (element: HTMLElement | null) => {
      if (!element) return null;

      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);

      return {
        activityInstanceId: element.dataset.activityInstanceId,
        cycleId: element.dataset.cycleId,
        version: element.dataset.timelineVersion,
        scaleX: matrix.a,
      };
    };

    return { local: read(local), global: read(global) };
  });
}

async function expectAlignedTimeline(page: Page) {
  await expect
    .poll(async () => {
      const pair = await readTimelinePair(page);

      if (!pair.local || !pair.global) return false;

      return (
        pair.local.activityInstanceId === pair.global.activityInstanceId &&
        pair.local.cycleId === pair.global.cycleId &&
        pair.local.version === pair.global.version &&
        Math.abs(pair.local.scaleX - pair.global.scaleX) <= 0.08
      );
    })
    .toBe(true);
}

test.describe('timeline canonica da caca', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    userEmail = `hunt-timeline-${suffix}@dead-idle.test`;

    const registration = await api.post('/auth/register', {
      data: {
        email: userEmail,
        password: 'TesteE2E123',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    await assertOk(registration, 'Registro da timeline de caca falhou');

    await prisma.user.update({
      where: { email: userEmail },
      data: { role: UserRole.ADMIN },
    });

    const login = await api.post('/auth/login', {
      data: { email: userEmail, password: 'TesteE2E123' },
    });
    await assertOk(login, 'Login administrativo da timeline de caca falhou');
    accessToken = ((await login.json()) as { accessToken: string }).accessToken;

    const characterResponse = await api.post('/characters', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `Timeline ${suffix.slice(-8)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    await assertOk(characterResponse, 'Criacao do personagem falhou');
    characterId = ((await characterResponse.json()) as { id: string }).id;

    await prisma.characterTutorialProgress.upsert({
      where: { characterId },
      create: { characterId, step: 5, completed: true },
      update: { step: 5, completed: true, completedAt: new Date() },
    });

    const mapsResponse = await api.get('/maps');
    await assertOk(mapsResponse, 'Consulta de mapas falhou');
    mapId = ((await mapsResponse.json()) as Array<{ id: string }>)[0]?.id ?? '';
    expect(mapId).not.toBe('');

    const mapSelection = await api.patch(
      `/characters/${characterId}/current-map`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { mapId },
      },
    );
    await assertOk(mapSelection, 'Selecao de mapa falhou');

    const huntResponse = await api.post('/auto-combat/hunt/start', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { characterId, mapId },
    });
    await assertOk(huntResponse, 'Inicio da caca falhou');

    const huntStatus = (await huntResponse.json()) as {
      hunting?: { timeline?: { direction?: string } | null } | null;
    };
    expect(huntStatus.hunting?.timeline?.direction).toBe('fill');

    await api.dispose();
  });

  test.afterAll(async () => {
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });

    if (characterId && accessToken) {
      await api.post(`/auto-combat/${characterId}/hunt/stop`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    await api.dispose();

    if (userEmail) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }

    await prisma.$disconnect();
  });

  test('mantem card e barra global alinhados em navegacao, F5, reconnect e Alt+Tab', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/auto-combat`);

    await expectAlignedTimeline(page);

    await page.getByRole('link', { name: 'Visão geral' }).click();
    await expect(
      page.locator(
        '.dashboard-topbar__activity-progress .activity-timeline-fill',
      ),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Combate automático' }).click();
    await expectAlignedTimeline(page);

    await page.reload();
    await expectAlignedTimeline(page);

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

    await page.evaluate(() => {
      const control = (
        window as unknown as {
          __deadIdleE2E?: { dropAutoCombatTransport: () => void };
        }
      ).__deadIdleE2E;

      if (!control) throw new Error('Controle Socket.IO E2E indisponivel.');
      control.dropAutoCombatTransport();
    });
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
    await expectAlignedTimeline(page);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1_200);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expectAlignedTimeline(page);
  });
});
