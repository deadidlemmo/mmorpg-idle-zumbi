import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import {
  AutoCombatHuntBatchStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  PrismaClient,
} from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const prisma = new PrismaClient();
const trackedEnemiesTotal = 8;

type DefeatFixture = {
  userEmail: string;
  accessToken: string;
  characterId: string;
  mapId: string;
  sessionId: string;
  huntBatchId: string;
  mobId: string;
};

let fixture: DefeatFixture | null = null;

async function assertOk(response: APIResponse, label: string) {
  if (!response.ok()) {
    throw new Error(`${label}: ${await response.text()}`);
  }
}

async function createDefeatFixture(): Promise<DefeatFixture> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userEmail = `auto-combat-defeat-${suffix}@dead-idle.test`;
  let createdMobId = '';

  try {
    const registration = await api.post('/auth/register', {
      data: {
        email: userEmail,
        password: 'TesteE2E123',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    await assertOk(registration, 'Registro do teste de derrota falhou');
    const accessToken = ((await registration.json()) as { accessToken: string })
      .accessToken;

    const characterResponse = await api.post('/characters', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `Derrota ${suffix.slice(-8)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    await assertOk(
      characterResponse,
      'Criação do personagem de derrota falhou',
    );
    const characterId = ((await characterResponse.json()) as { id: string }).id;

    await prisma.characterTutorialProgress.upsert({
      where: { characterId },
      create: { characterId, step: 5, completed: true },
      update: { step: 5, completed: true, completedAt: new Date() },
    });

    const mapsResponse = await api.get('/maps');
    await assertOk(
      mapsResponse,
      'Consulta de mapas do teste de derrota falhou',
    );
    const maps = (await mapsResponse.json()) as Array<{ id: string }>;
    const mapId = maps[0]?.id ?? '';

    if (!mapId) {
      throw new Error('Nenhum mapa disponível para o teste de derrota.');
    }

    const mapSelection = await api.patch(
      `/characters/${characterId}/current-map`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { mapId },
      },
    );
    await assertOk(mapSelection, 'Seleção de mapa do teste de derrota falhou');

    const huntResponse = await api.post('/auto-combat/hunt/start', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { characterId, mapId },
    });
    await assertOk(huntResponse, 'Início da caça do teste de derrota falhou');

    const session = await prisma.autoCombatSession.findFirstOrThrow({
      where: { characterId, status: AutoCombatSessionStatus.ACTIVE },
      include: { huntBatch: true },
      orderBy: { startedAt: 'desc' },
    });

    if (!session.huntBatch) {
      throw new Error('O lote de caça do teste de derrota não foi criado.');
    }

    const mob = await prisma.mob.create({
      data: {
        name: `Ameaça E2E ${suffix}`,
        description: 'Mob isolado para validar derrota e recuperação.',
        level: 1,
        tier: 1,
        hp: 1_000_000,
        attack: 1_000_000,
        defense: 1_000_000,
        speed: 1,
        xpReward: 1,
        mapId,
      },
    });
    createdMobId = mob.id;
    const encounter = await prisma.subMapEncounter.create({
      data: {
        subMapId: session.subMapId,
        mobId: mob.id,
        weight: 1_000_000,
        isActive: true,
      },
    });
    const readyAt = new Date();

    await prisma.$transaction([
      prisma.character.update({
        where: { id: characterId },
        data: { currentHp: 1, maxHp: 100, gold: 1_000_000 },
      }),
      prisma.autoCombatHuntBatchMob.upsert({
        where: {
          batchId_mobId: {
            batchId: session.huntBatch.id,
            mobId: mob.id,
          },
        },
        create: {
          batchId: session.huntBatch.id,
          mobId: mob.id,
          encounterId: encounter.id,
          foundCount: trackedEnemiesTotal,
          remainingCount: trackedEnemiesTotal,
          weightSnapshot: encounter.weight,
          firstFoundAt: readyAt,
          lastFoundAt: readyAt,
        },
        update: {
          encounterId: encounter.id,
          foundCount: trackedEnemiesTotal,
          remainingCount: trackedEnemiesTotal,
          weightSnapshot: encounter.weight,
          lastFoundAt: readyAt,
        },
      }),
      prisma.autoCombatHuntBatch.update({
        where: { id: session.huntBatch.id },
        data: {
          status: AutoCombatHuntBatchStatus.READY,
          stoppedAt: readyAt,
          consumedAt: null,
          cancelledAt: null,
          lastProcessedAt: readyAt,
          foundEnemiesCount: trackedEnemiesTotal,
          selectedEncounterId: encounter.id,
          selectedEncounterMobId: mob.id,
        },
      }),
      prisma.autoCombatSession.update({
        where: { id: session.id },
        data: {
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          huntStoppedAt: readyAt,
          lastHuntProcessedAt: readyAt,
          lastProcessedAt: readyAt,
          foundEnemiesCount: trackedEnemiesTotal,
          selectedEncounterId: encounter.id,
          selectedEncounterMobId: mob.id,
          battleTargetTotal: 0,
          battleTargetRemaining: 0,
          currentMobId: null,
          currentMobHp: null,
          currentMobMaxHp: null,
        },
      }),
    ]);

    return {
      userEmail,
      accessToken,
      characterId,
      mapId,
      sessionId: session.id,
      huntBatchId: session.huntBatch.id,
      mobId: mob.id,
    };
  } catch (error) {
    await prisma.user.deleteMany({ where: { email: userEmail } });
    if (createdMobId) {
      await prisma.mob.deleteMany({ where: { id: createdMobId } });
    }
    throw error;
  } finally {
    await api.dispose();
  }
}

async function cleanupFixture(current: DefeatFixture | null) {
  if (!current) return;

  await prisma.user.deleteMany({ where: { email: current.userEmail } });
  await prisma.mob.deleteMany({ where: { id: current.mobId } });
}

async function authenticatePage(page: Page, current: DefeatFixture) {
  await page.addInitScript(
    ({ token, characterId }) => {
      window.localStorage.setItem('dead_idle_access_token', token);
      window.localStorage.setItem(
        'dead_idle_selected_character_id',
        characterId,
      );
    },
    { token: current.accessToken, characterId: current.characterId },
  );
}

async function waitForAutoCombatPage(page: Page) {
  await expect(page.locator('.auto-combat-page')).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __deadIdleE2E?: { isAutoCombatConnected: () => boolean };
              }
            ).__deadIdleE2E?.isAutoCombatConnected() ?? false,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function startLethalBattle(current: DefeatFixture) {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });

  try {
    const response = await api.post(
      `/auto-combat/${current.characterId}/battle/start`,
      {
        headers: { Authorization: `Bearer ${current.accessToken}` },
        data: { quantity: trackedEnemiesTotal },
      },
    );
    await assertOk(response, 'Início da batalha letal falhou');
  } finally {
    await api.dispose();
  }
}

async function waitForBackendDefeat(current: DefeatFixture) {
  await expect
    .poll(
      async () =>
        (
          await prisma.autoCombatSession.findUnique({
            where: { id: current.sessionId },
            select: { status: true },
          })
        )?.status ?? null,
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBe(AutoCombatSessionStatus.DEFEATED);
}

async function getPreservedCount(current: DefeatFixture) {
  const mobs = await prisma.autoCombatHuntBatchMob.findMany({
    where: { batchId: current.huntBatchId },
    select: { remainingCount: true },
  });

  return mobs.reduce((total, mob) => total + mob.remainingCount, 0);
}

async function expectInfirmaryRecovery(page: Page, current: DefeatFixture) {
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/${current.characterId}/infirmary(?:[/?#]|$)`),
    { timeout: 30_000 },
  );
  const preservedCount = await getPreservedCount(current);
  const terminalSession = await prisma.autoCombatSession.findUniqueOrThrow({
    where: { id: current.sessionId },
    select: { totalCombatsResolved: true },
  });

  expect(preservedCount).toBeGreaterThan(0);
  expect(preservedCount).toBe(
    trackedEnemiesTotal - terminalSession.totalCombatsResolved,
  );
  await expect(
    page.getByTestId('infirmary-preserved-enemies-count'),
  ).toContainText(
    `${preservedCount} ameaça${preservedCount === 1 ? '' : 's'} preservada${preservedCount === 1 ? '' : 's'}`,
  );
  await expect(page.locator('.dashboard-topbar--auto-combat')).toHaveCount(0);
  await expect.poll(() => getPreservedCount(current)).toBe(preservedCount);

  const batch = await prisma.autoCombatHuntBatch.findUniqueOrThrow({
    where: { id: current.huntBatchId },
    select: { status: true, consumedAt: true, cancelledAt: true },
  });

  expect(batch.status).toBe(AutoCombatHuntBatchStatus.READY);
  expect(batch.consumedAt).toBeNull();
  expect(batch.cancelledAt).toBeNull();

  return preservedCount;
}

async function restoreNetwork(context: BrowserContext) {
  await context.setOffline(false).catch(() => undefined);
}

test.describe('derrota global e recuperação do auto-combate', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    fixture = await createDefeatFixture();
  });

  test.afterEach(async ({ context }) => {
    await restoreNetwork(context);
    await cleanupFixture(fixture);
    fixture = null;
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('encerra na tela de combate e retoma o mesmo lote após a cura', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const current = fixture!;

    await authenticatePage(page, current);
    await page.goto(`/dashboard/${current.characterId}/auto-combat`);
    await waitForAutoCombatPage(page);
    await startLethalBattle(current);
    const preservedCount = await expectInfirmaryRecovery(page, current);

    await page.getByRole('button', { name: 'Recuperar agora' }).click();
    await expect(
      page.getByRole('link', { name: 'Voltar ao combate' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Voltar ao combate' }).click();
    await expect(page).toHaveURL(/\/auto-combat\?mapId=.*resume=preserved/);
    await page.getByRole('button', { name: 'Continuar ameaças' }).click();

    await expect
      .poll(
        async () => {
          const batch = await prisma.autoCombatHuntBatch.findUnique({
            where: { id: current.huntBatchId },
            select: { sessionId: true, status: true },
          });

          return {
            sessionChanged: Boolean(
              batch?.sessionId && batch.sessionId !== current.sessionId,
            ),
            status: batch?.status ?? null,
            remaining: await getPreservedCount(current),
          };
        },
        { timeout: 20_000 },
      )
      .toEqual({
        sessionChanged: true,
        status: AutoCombatHuntBatchStatus.READY,
        remaining: preservedCount,
      });
  });

  test('redireciona quando a morte acontece em outra página', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const current = fixture!;

    await authenticatePage(page, current);
    await page.goto(`/dashboard/${current.characterId}/inventory`);
    await startLethalBattle(current);
    await expectInfirmaryRecovery(page, current);
  });

  test('reconcilia a derrota após desconexão sem exigir F5', async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    const current = fixture!;

    await authenticatePage(page, current);
    await page.goto(`/dashboard/${current.characterId}/auto-combat`);
    await waitForAutoCombatPage(page);
    await context.setOffline(true);
    await startLethalBattle(current);
    await waitForBackendDefeat(current);
    await context.setOffline(false);
    await expectInfirmaryRecovery(page, current);
  });

  test('reconcilia por REST após F5 quando o evento foi perdido', async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    const current = fixture!;

    await authenticatePage(page, current);
    await page.goto(`/dashboard/${current.characterId}/auto-combat`);
    await waitForAutoCombatPage(page);
    await context.setOffline(true);
    await startLethalBattle(current);
    await waitForBackendDefeat(current);
    await context.setOffline(false);
    await page.reload();
    await expectInfirmaryRecovery(page, current);
  });
});
