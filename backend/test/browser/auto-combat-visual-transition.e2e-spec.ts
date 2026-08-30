import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import {
  AutoCombatHuntBatchStatus,
  AutoCombatSessionPhase,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const prisma = new PrismaClient();

let userEmail = '';
let accessToken = '';
let characterId = '';
let mapId = '';
let forcedDropId = '';
let forcedDropOriginalChance = 0;
let forcedDropItemName = '';

async function assertOk(response: APIResponse, label: string) {
  if (!response.ok()) {
    throw new Error(`${label}: ${await response.text()}`);
  }
}

function getCountdownSeconds(label: string) {
  const match = label.match(/([\d.,]+)s restantes/i);

  if (!match?.[1]) {
    return null;
  }

  const seconds = Number.parseFloat(match[1].replace(',', '.'));

  return Number.isFinite(seconds) ? seconds : null;
}

test.describe('transicao visual entre monstros', () => {
  test.beforeAll(async () => {
    const api = await playwrightRequest.newContext({ baseURL: apiUrl });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

    userEmail = `auto-combat-visual-${suffix}@dead-idle.test`;

    const registration = await api.post('/auth/register', {
      data: {
        email: userEmail,
        password: 'TesteE2E123',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    await assertOk(registration, 'Registro do teste visual falhou');
    accessToken = ((await registration.json()) as { accessToken: string })
      .accessToken;

    await prisma.user.update({
      where: { email: userEmail },
      data: { role: UserRole.ADMIN },
    });

    const adminLogin = await api.post('/auth/login', {
      data: {
        email: userEmail,
        password: 'TesteE2E123',
      },
    });
    await assertOk(adminLogin, 'Login administrativo do teste visual falhou');
    accessToken = ((await adminLogin.json()) as { accessToken: string })
      .accessToken;

    const characterResponse = await api.post('/characters', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: `Visual ${suffix.slice(-8)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    await assertOk(characterResponse, 'Criação do personagem visual falhou');
    characterId = ((await characterResponse.json()) as { id: string }).id;

    await prisma.characterTutorialProgress.upsert({
      where: { characterId },
      create: { characterId, step: 5, completed: true },
      update: { step: 5, completed: true, completedAt: new Date() },
    });

    const mapsResponse = await api.get('/maps');
    await assertOk(mapsResponse, 'Consulta de mapas falhou');
    const maps = (await mapsResponse.json()) as Array<{ id: string }>;
    mapId = maps[0]?.id ?? '';
    expect(mapId).not.toBe('');

    const mapSelection = await api.patch(
      `/characters/${characterId}/current-map`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { mapId },
      },
    );
    await assertOk(mapSelection, 'Seleção de mapa falhou');

    const huntResponse = await api.post('/auto-combat/hunt/start', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { characterId, mapId },
    });
    await assertOk(huntResponse, 'Início da caça falhou');

    const session = await prisma.autoCombatSession.findFirstOrThrow({
      where: { characterId, status: 'ACTIVE' },
      include: { huntBatch: true },
      orderBy: { startedAt: 'desc' },
    });
    const encounter = await prisma.subMapEncounter.findFirstOrThrow({
      where: { subMapId: session.subMapId, isActive: true },
      include: {
        mob: {
          include: {
            drops: {
              include: { item: true },
              orderBy: { item: { name: 'asc' } },
            },
          },
        },
      },
      orderBy: { weight: 'desc' },
    });
    const huntBatch = session.huntBatch;

    if (!huntBatch) {
      throw new Error('Lote de caça não foi criado para o teste visual.');
    }

    const forcedDrop = encounter.mob.drops[0];

    if (!forcedDrop) {
      throw new Error('Mob do teste visual não possui drop cadastrado.');
    }

    forcedDropId = forcedDrop.id;
    forcedDropOriginalChance = forcedDrop.dropChance;
    forcedDropItemName = forcedDrop.item.name;

    await prisma.mobDrop.update({
      where: { id: forcedDropId },
      data: { dropChance: 100 },
    });

    const readyAt = new Date();

    await prisma.$transaction([
      prisma.autoCombatHuntBatchMob.upsert({
        where: {
          batchId_mobId: {
            batchId: huntBatch.id,
            mobId: encounter.mobId,
          },
        },
        create: {
          batchId: huntBatch.id,
          mobId: encounter.mobId,
          encounterId: encounter.id,
          foundCount: 10,
          remainingCount: 10,
          weightSnapshot: encounter.weight,
          firstFoundAt: readyAt,
          lastFoundAt: readyAt,
        },
        update: {
          encounterId: encounter.id,
          foundCount: 10,
          remainingCount: 10,
          weightSnapshot: encounter.weight,
          lastFoundAt: readyAt,
        },
      }),
      prisma.autoCombatHuntBatch.update({
        where: { id: huntBatch.id },
        data: {
          status: AutoCombatHuntBatchStatus.READY,
          stoppedAt: readyAt,
          lastProcessedAt: readyAt,
          foundEnemiesCount: 10,
          selectedEncounterId: encounter.id,
          selectedEncounterMobId: encounter.mobId,
        },
      }),
      prisma.autoCombatSession.update({
        where: { id: session.id },
        data: {
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          huntStoppedAt: readyAt,
          lastHuntProcessedAt: readyAt,
          lastProcessedAt: readyAt,
          foundEnemiesCount: 10,
          selectedEncounterId: encounter.id,
          selectedEncounterMobId: encounter.mobId,
        },
      }),
    ]);

    await api.dispose();
  });

  test.afterAll(async () => {
    if (forcedDropId) {
      await prisma.mobDrop.update({
        where: { id: forcedDropId },
        data: { dropChance: forcedDropOriginalChance },
      });
    }

    if (userEmail) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
    await prisma.$disconnect();
  });

  test('mantem imagem continua e publica derrota/EXP sem bloquear o proximo mob', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);

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
    await page.goto(`/dashboard/${characterId}/auto-combat`);

    await page.evaluate(() => {
      const probe = {
        blankFrames: 0,
        handoffSeen: false,
        defeatToastInsideMobCard: false,
        defeatToastSeen: false,
        defeatToastHasImage: false,
        activeDefeatToastKey: null as string | null,
        defeatToastVisibleStartedAt: null as number | null,
        maxDefeatToastVisibleMs: 0,
        defeatToastKeys: [] as string[],
        defeatToastMobNames: [] as string[],
        defeatToastDescriptions: [] as string[],
        pendingDefeatToast: null as {
          at: number;
          mobInstanceKey: string | null;
        } | null,
        nextMobAfterDefeatToastMs: [] as number[],
        transitionStarted: false,
        firstMobInstanceKey: null as string | null,
        mobProgressSamples: [] as Array<{
          at: number;
          instanceKey: string;
          percent: number;
          isHit: boolean;
        }>,
        countdownSamples: [] as Array<{
          at: number;
          instanceKey: string;
          label: string;
        }>,
        counterSamples: [] as Array<{
          at: number;
          defeated: number;
          total: number;
        }>,
        alignedProgressSamples: [] as Array<{
          at: number;
          inlinePercent: number;
          topPercent: number;
        }>,
        progressSamples: [] as Array<{ at: number; percent: number }>,
        lastMobInstanceKey: null as string | null,
      };

      const getVisualProgressPercent = (element: HTMLElement | null) => {
        if (!element) {
          return Number.NaN;
        }

        const style = getComputedStyle(element);

        if (style.transform !== 'none') {
          const scaleX = new DOMMatrixReadOnly(style.transform).a;

          if (Number.isFinite(scaleX)) {
            return scaleX * 100;
          }
        }

        const inlineWidthPercent = Number.parseFloat(element.style.width);

        if (
          Number.isFinite(inlineWidthPercent) &&
          element.style.width.endsWith('%')
        ) {
          return inlineWidthPercent;
        }

        const trackWidth = element.parentElement?.getBoundingClientRect().width;

        if (!trackWidth || trackWidth <= 0) {
          return Number.NaN;
        }

        return (element.getBoundingClientRect().width / trackWidth) * 100;
      };

      Object.assign(window, { __autoCombatTransitionProbe: probe });
      window.setInterval(() => {
        const transition = document.querySelector(
          '.auto-combat-mob-transition',
        );
        const defeatToast = document.querySelector<HTMLElement>(
          '.loot-notification-card[data-kind="combat-result"]',
        );
        const currentImage = transition?.querySelector(
          '.auto-combat-mob-transition__layer--current img',
        );
        const outgoingImage = transition?.querySelector(
          '.auto-combat-mob-transition__layer--outgoing img',
        );
        const currentLayer = transition?.querySelector<HTMLElement>(
          '.auto-combat-mob-transition__layer--current',
        );
        const currentBody = currentLayer?.querySelector(
          '.auto-combat-mob-damage-shake',
        );
        const currentMobInstanceKey =
          currentLayer?.dataset.mobInstanceKey ?? null;
        const progressFill = document.querySelector<HTMLElement>(
          '.auto-combat-inline-battle__ttk-strip b',
        );
        const topProgressFill = document.querySelector<HTMLElement>(
          '.dashboard-topbar--auto-battle .dashboard-topbar__activity-progress > span',
        );
        const counterLabel = document.querySelector<HTMLElement>(
          '[data-testid="auto-combat-battle-defeated-count"]',
        );
        const countdownLabel = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.auto-combat-inline-battle__ttk-strip > span',
          ),
        )
          .find(
            (element) =>
              element.getClientRects().length > 0 &&
              /restantes|alvo derrotado/i.test(element.textContent ?? ''),
          )
          ?.textContent?.trim();
        const now = performance.now();
        const inlineProgressPercent = getVisualProgressPercent(progressFill);
        const topProgressPercent = getVisualProgressPercent(topProgressFill);

        if (
          Number.isFinite(inlineProgressPercent) &&
          Number.isFinite(topProgressPercent)
        ) {
          const previousAlignment = probe.alignedProgressSamples.at(-1);

          if (
            previousAlignment?.inlinePercent !== inlineProgressPercent ||
            previousAlignment.topPercent !== topProgressPercent
          ) {
            probe.alignedProgressSamples.push({
              at: now,
              inlinePercent: inlineProgressPercent,
              topPercent: topProgressPercent,
            });
          }
        }

        const counterMatch = counterLabel?.textContent?.match(
          /(\d+)\s*\/\s*(\d+)\s+abatidos/i,
        );

        if (counterMatch) {
          const defeated = Number(counterMatch[1]);
          const total = Number(counterMatch[2]);
          const previousCounter = probe.counterSamples.at(-1);

          if (
            previousCounter?.defeated !== defeated ||
            previousCounter.total !== total
          ) {
            probe.counterSamples.push({ at: now, defeated, total });
          }
        }

        if (transition) probe.transitionStarted = true;
        if (transition && !currentImage) probe.blankFrames += 1;
        if (currentImage && outgoingImage) probe.handoffSeen = true;

        if (currentMobInstanceKey && !probe.firstMobInstanceKey) {
          probe.firstMobInstanceKey = currentMobInstanceKey;
        }

        if (
          currentMobInstanceKey === probe.firstMobInstanceKey &&
          progressFill
        ) {
          const percent = getVisualProgressPercent(progressFill);

          if (Number.isFinite(percent)) {
            probe.progressSamples.push({ at: now, percent });
          }
        }

        if (currentMobInstanceKey && progressFill) {
          const percent = getVisualProgressPercent(progressFill);
          const previousSample = probe.mobProgressSamples.at(-1);
          const isHit = Boolean(
            currentBody?.classList.contains('is-impacting') ||
            currentBody?.classList.contains('is-critical-impact'),
          );

          if (
            Number.isFinite(percent) &&
            (previousSample?.instanceKey !== currentMobInstanceKey ||
              previousSample.percent !== percent ||
              previousSample.isHit !== isHit)
          ) {
            probe.mobProgressSamples.push({
              at: now,
              instanceKey: currentMobInstanceKey,
              percent,
              isHit,
            });
          }
        }

        if (currentMobInstanceKey && countdownLabel) {
          const previousCountdownSample = probe.countdownSamples.at(-1);

          if (
            previousCountdownSample?.instanceKey !== currentMobInstanceKey ||
            previousCountdownSample.label !== countdownLabel
          ) {
            probe.countdownSamples.push({
              at: now,
              instanceKey: currentMobInstanceKey,
              label: countdownLabel,
            });
          }
        }

        if (
          probe.pendingDefeatToast &&
          probe.pendingDefeatToast.mobInstanceKey &&
          currentMobInstanceKey &&
          probe.pendingDefeatToast.mobInstanceKey !== currentMobInstanceKey
        ) {
          probe.nextMobAfterDefeatToastMs.push(
            now - probe.pendingDefeatToast.at,
          );
          probe.pendingDefeatToast = null;
        }

        if (currentMobInstanceKey) {
          probe.lastMobInstanceKey = currentMobInstanceKey;
        }

        if (defeatToast) {
          const defeatToastKey =
            defeatToast.dataset.notificationKey ?? 'sem-evento';

          probe.defeatToastSeen = true;
          probe.defeatToastHasImage ||= Boolean(
            defeatToast.querySelector('img'),
          );

          if (probe.activeDefeatToastKey !== defeatToastKey) {
            probe.activeDefeatToastKey = defeatToastKey;
            probe.defeatToastVisibleStartedAt = now;
            probe.defeatToastKeys.push(defeatToastKey);
            probe.defeatToastMobNames.push(
              defeatToast
                .querySelector('.loot-notification-card__name')
                ?.textContent?.trim() ?? 'sem-nome',
            );
            probe.defeatToastDescriptions.push(
              defeatToast
                .querySelector('.loot-notification-card__description')
                ?.textContent?.trim() ?? 'sem-exp',
            );
            probe.pendingDefeatToast = {
              at: now,
              mobInstanceKey: currentMobInstanceKey,
            };
          }

          probe.maxDefeatToastVisibleMs = Math.max(
            probe.maxDefeatToastVisibleMs,
            now - (probe.defeatToastVisibleStartedAt ?? now),
          );
          probe.defeatToastInsideMobCard ||= Boolean(
            defeatToast.closest(
              '[data-fighter-role="mob"], .auto-combat-inline-battle__mob-card',
            ),
          );
        } else {
          probe.activeDefeatToastKey = null;
          probe.defeatToastVisibleStartedAt = null;
        }
      }, 16);
    });

    const api = await playwrightRequest.newContext({ baseURL: apiUrl });

    try {
      const startBattle = await api.post(
        `/auto-combat/${characterId}/battle/start`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { quantity: 10 },
        },
      );
      await assertOk(startBattle, 'Início da batalha visual falhou');

      await expect(page.locator('.auto-combat-mob-transition')).toBeVisible({
        timeout: 15_000,
      });
      const defeatToast = page
        .locator('.loot-notification-card[data-kind="combat-result"]')
        .first();
      await expect(defeatToast).toBeVisible({ timeout: 30_000 });
      await expect(defeatToast.locator('img')).toBeVisible();
      await expect(
        defeatToast.locator('.loot-notification-card__description'),
      ).toContainText('EXP');
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileDefeatToastBox = await defeatToast.boundingBox();

      expect(mobileDefeatToastBox).not.toBeNull();
      expect(mobileDefeatToastBox?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect(
        (mobileDefeatToastBox?.x ?? 0) + (mobileDefeatToastBox?.width ?? 0),
      ).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: testInfo.outputPath('auto-combat-defeat-toast-mobile.png'),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 720 });

      const forcedDropToast = page
        .locator('.loot-notification-card')
        .filter({ hasText: forcedDropItemName })
        .first();
      await expect(forcedDropToast).toBeVisible({ timeout: 15_000 });
      await expect(forcedDropToast.locator('img')).toBeVisible();
      await expect(page.locator('.auto-combat-xp-feedback')).toHaveCount(0);
      await expect(page.locator('.auto-combat-kill-receipt')).toHaveCount(0);
      await expect(
        page.locator(
          '[data-fighter-role="mob"] .auto-combat-defeated-badge, .auto-combat-inline-battle__mob-card .auto-combat-defeated-badge',
        ),
      ).toHaveCount(0);
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (
                  window as typeof window & {
                    __autoCombatTransitionProbe?: { handoffSeen: boolean };
                  }
                ).__autoCombatTransitionProbe?.handoffSeen ?? false,
            ),
          { timeout: 25_000 },
        )
        .toBe(true);
      await expect(
        page.locator('.auto-combat-hunt-side-section--battle'),
      ).toHaveCount(0);
      const progressTransitions = await page.evaluate(() => {
        const inlineFill = document.querySelector<HTMLElement>(
          '.auto-combat-inline-battle__ttk-strip b',
        );
        const topFill = document.querySelector<HTMLElement>(
          '.dashboard-topbar--auto-battle .dashboard-topbar__activity-progress > span',
        );

        return {
          inlineTransitionDuration: inlineFill
            ? getComputedStyle(inlineFill).transitionDuration
            : '',
          inlineAnimationName: inlineFill
            ? getComputedStyle(inlineFill).animationName
            : '',
          inlineAnimationDuration: inlineFill
            ? getComputedStyle(inlineFill).animationDuration
            : '',
          inlineAnimationTiming: inlineFill
            ? getComputedStyle(inlineFill).animationTimingFunction
            : '',
          topTransitionDuration: topFill
            ? getComputedStyle(topFill).transitionDuration
            : '',
          topAnimationName: topFill
            ? getComputedStyle(topFill).animationName
            : '',
          topAnimationDuration: topFill
            ? getComputedStyle(topFill).animationDuration
            : '',
          topAnimationTiming: topFill
            ? getComputedStyle(topFill).animationTimingFunction
            : '',
        };
      });

      expect(progressTransitions.inlineTransitionDuration).toBe('0s');
      expect(progressTransitions.topTransitionDuration).toBe('0s');
      expect(progressTransitions.inlineAnimationName).toContain(
        'autoCombatBattleTimelineDrain',
      );
      expect(progressTransitions.topAnimationName).toContain(
        'dashboardTopbarActivityDrain',
      );
      expect(progressTransitions.inlineAnimationTiming).toBe('linear');
      expect(progressTransitions.topAnimationTiming).toBe('linear');
      expect(progressTransitions.inlineAnimationDuration).toBe(
        progressTransitions.topAnimationDuration,
      );
      expect(
        Number.parseFloat(progressTransitions.inlineAnimationDuration),
      ).toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (
                  window as typeof window & {
                    __autoCombatTransitionProbe?: {
                      counterSamples: Array<{ defeated: number }>;
                    };
                  }
                ).__autoCombatTransitionProbe?.counterSamples.at(-1)
                  ?.defeated ?? 0,
            ),
          { timeout: 30_000 },
        )
        .toBeGreaterThanOrEqual(2);
      try {
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const probe = (
                  window as typeof window & {
                    __autoCombatTransitionProbe?: {
                      firstMobInstanceKey: string | null;
                      mobProgressSamples: Array<{
                        instanceKey: string;
                        percent: number;
                      }>;
                    };
                  }
                ).__autoCombatTransitionProbe;
                const secondMobInstanceKey = probe?.mobProgressSamples.find(
                  (sample) => sample.instanceKey !== probe.firstMobInstanceKey,
                )?.instanceKey;

                return Boolean(
                  secondMobInstanceKey &&
                  probe?.mobProgressSamples.some(
                    (sample) =>
                      sample.instanceKey === secondMobInstanceKey &&
                      sample.percent < 99.5,
                  ),
                );
              }),
            { timeout: 25_000 },
          )
          .toBe(true);
      } catch (error) {
        const diagnosticProbe = await page.evaluate(
          () =>
            (
              window as typeof window & {
                __autoCombatTransitionProbe?: unknown;
              }
            ).__autoCombatTransitionProbe,
        );

        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\nProbe: ${JSON.stringify(diagnosticProbe)}`,
        );
      }
      const probe = await page.evaluate(
        () =>
          (
            window as typeof window & {
              __autoCombatTransitionProbe?: {
                blankFrames: number;
                handoffSeen: boolean;
                mobProgressSamples: Array<{
                  at: number;
                  instanceKey: string;
                  percent: number;
                  isHit: boolean;
                }>;
                countdownSamples: Array<{
                  at: number;
                  instanceKey: string;
                  label: string;
                }>;
                counterSamples: Array<{
                  at: number;
                  defeated: number;
                  total: number;
                }>;
                alignedProgressSamples: Array<{
                  at: number;
                  inlinePercent: number;
                  topPercent: number;
                }>;
                defeatToastInsideMobCard: boolean;
                defeatToastSeen: boolean;
                defeatToastHasImage: boolean;
                maxDefeatToastVisibleMs: number;
                defeatToastKeys: string[];
                defeatToastMobNames: string[];
                defeatToastDescriptions: string[];
                nextMobAfterDefeatToastMs: number[];
                transitionStarted: boolean;
                firstMobInstanceKey: string | null;
                progressSamples: Array<{ at: number; percent: number }>;
              };
            }
          ).__autoCombatTransitionProbe,
      );

      expect(probe?.blankFrames).toBe(0);
      expect(probe?.handoffSeen).toBe(true);
      expect(probe?.defeatToastInsideMobCard).toBe(false);
      expect(probe?.defeatToastSeen).toBe(true);
      expect(probe?.defeatToastHasImage).toBe(true);
      expect(
        probe?.maxDefeatToastVisibleMs,
        `A notificação de abate não permaneceu legível: ${JSON.stringify(probe)}`,
      ).toBeGreaterThanOrEqual(1_000);
      expect(probe?.defeatToastKeys.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(
        new Set(probe?.defeatToastKeys ?? []).size,
        `A notificação reapareceu para a mesma morte: ${JSON.stringify(probe?.defeatToastKeys)}`,
      ).toBe(probe?.defeatToastKeys.length);
      expect(
        probe?.defeatToastKeys.every(
          (notificationKey) => notificationKey !== 'sem-evento',
        ),
        `A notificação perdeu o vínculo com a derrota: ${JSON.stringify(probe?.defeatToastKeys)}`,
      ).toBe(true);
      expect(
        probe?.defeatToastMobNames.every((mobName) => mobName !== 'sem-nome'),
        `A notificação perdeu o nome do alvo: ${JSON.stringify(probe?.defeatToastMobNames)}`,
      ).toBe(true);
      expect(
        probe?.defeatToastDescriptions.every((description) =>
          /\+\d[\d.]*\s+EXP/i.test(description),
        ),
        `A notificação perdeu a EXP confirmada: ${JSON.stringify(probe?.defeatToastDescriptions)}`,
      ).toBe(true);
      expect(
        probe?.nextMobAfterDefeatToastMs.length ?? 0,
        `O próximo alvo não apareceu após a notificação: ${JSON.stringify(probe)}`,
      ).toBeGreaterThanOrEqual(1);
      expect(
        Math.max(
          ...(probe?.nextMobAfterDefeatToastMs ?? [Number.POSITIVE_INFINITY]),
        ),
        `A notificação bloqueou a entrada do próximo alvo: ${JSON.stringify(probe?.nextMobAfterDefeatToastMs)}`,
      ).toBeLessThan(1_000);
      expect(probe?.transitionStarted).toBe(true);

      const counterSamples = probe?.counterSamples ?? [];
      const counterChanges = counterSamples
        .slice(1)
        .map(
          (sample, index) =>
            sample.defeated - (counterSamples[index]?.defeated ?? 0),
        );

      expect(counterSamples.length).toBeGreaterThanOrEqual(2);
      expect(
        counterChanges?.every((change) => change === 1),
        `O contador não avançou de um em um: ${JSON.stringify(probe?.counterSamples)}`,
      ).toBe(true);
      expect(new Set(counterSamples.map((sample) => sample.total)).size).toBe(
        1,
      );

      const progressAlignmentDeltas = (
        probe?.alignedProgressSamples.map((sample) =>
          Math.abs(sample.inlinePercent - sample.topPercent),
        ) ?? []
      ).sort((left, right) => left - right);
      const maxProgressAlignmentDelta = Math.max(0, ...progressAlignmentDeltas);
      const p95ProgressAlignmentDelta =
        progressAlignmentDeltas[
          Math.min(
            progressAlignmentDeltas.length - 1,
            Math.ceil(progressAlignmentDeltas.length * 0.95) - 1,
          )
        ] ?? 0;

      expect(probe?.alignedProgressSamples.length ?? 0).toBeGreaterThan(5);
      expect(
        p95ProgressAlignmentDelta,
        `As barras superior e inferior divergiram: ${JSON.stringify(probe?.alignedProgressSamples)}`,
      ).toBeLessThanOrEqual(0.1);
      expect(
        maxProgressAlignmentDelta,
        `As barras tiveram um salto de alinhamento: ${JSON.stringify(probe?.alignedProgressSamples)}`,
      ).toBeLessThanOrEqual(2);

      const secondMobInstanceKey = probe?.mobProgressSamples.find(
        (sample) => sample.instanceKey !== probe.firstMobInstanceKey,
      )?.instanceKey;
      const secondMobSamples = probe?.mobProgressSamples.filter(
        (sample) => sample.instanceKey === secondMobInstanceKey,
      );

      expect(secondMobInstanceKey).toBeTruthy();
      expect(
        secondMobSamples?.[0]?.percent,
        `O segundo mob não entrou com a barra cheia: ${JSON.stringify(secondMobSamples)}`,
      ).toBeGreaterThanOrEqual(98);
      const secondMobDistinctProgress = [
        ...new Set(secondMobSamples?.map((sample) => sample.percent) ?? []),
      ];
      expect(
        secondMobDistinctProgress.length,
        `A barra do segundo mob não desceu gradualmente: ${JSON.stringify(secondMobSamples)}`,
      ).toBeGreaterThan(5);
      expect(
        secondMobDistinctProgress.every(
          (percent, index, samples) =>
            index === 0 || percent <= (samples[index - 1] ?? percent) + 0.5,
        ),
        `A barra do segundo mob voltou para trás: ${JSON.stringify(secondMobDistinctProgress)}`,
      ).toBe(true);
      expect(Math.min(...secondMobDistinctProgress)).toBeLessThan(50);

      const firstMobProgressReset = probe?.progressSamples.find(
        (sample, index, samples) =>
          sample.percent <= 20 &&
          samples
            .slice(index + 1)
            .some(
              (laterSample) =>
                laterSample.at - sample.at <= 1_000 &&
                laterSample.percent >= 80,
            ),
      );
      const progressChanges = probe?.progressSamples.filter(
        (sample, index, samples) =>
          index === 0 || sample.percent !== samples[index - 1]?.percent,
      );

      expect(
        firstMobProgressReset,
        `A barra do primeiro mob reiniciou na mesma instância: ${JSON.stringify(progressChanges)}`,
      ).toBeUndefined();

      const countdownSamples = probe?.countdownSamples ?? [];
      const completedCountdownInstanceKeys = [
        ...new Set(
          countdownSamples
            .filter((sample) => /alvo derrotado/i.test(sample.label))
            .map((sample) => sample.instanceKey),
        ),
      ].slice(0, 2);

      expect(
        completedCountdownInstanceKeys.length,
        `O E2E não observou dois ciclos completos: ${JSON.stringify(countdownSamples)}`,
      ).toBe(2);

      for (const instanceKey of completedCountdownInstanceKeys) {
        const mobCountdownSamples = countdownSamples.filter(
          (sample) => sample.instanceKey === instanceKey,
        );
        const twoSecondsIndex = mobCountdownSamples.findIndex((sample) => {
          const seconds = getCountdownSeconds(sample.label);

          return seconds !== null && seconds >= 1.9 && seconds <= 2.1;
        });
        const oneSecondIndex = mobCountdownSamples.findIndex(
          (sample, index) => {
            const seconds = getCountdownSeconds(sample.label);

            return (
              index > twoSecondsIndex &&
              seconds !== null &&
              seconds >= 0.9 &&
              seconds <= 1.1
            );
          },
        );

        expect(
          mobCountdownSamples.some(
            (sample) => sample.label === 'Finalizando abate',
          ),
          `A fase intermediária voltou a aparecer em ${instanceKey}: ${JSON.stringify(mobCountdownSamples)}`,
        ).toBe(false);
        expect(
          [twoSecondsIndex, oneSecondIndex].every((index) => index >= 0),
          `A sequência 2.0s -> 1.0s não foi preservada em ${instanceKey}: ${JSON.stringify(mobCountdownSamples)}`,
        ).toBe(true);
        expect(
          (mobCountdownSamples[oneSecondIndex]?.at ?? 0) -
            (mobCountdownSamples[twoSecondsIndex]?.at ?? 0),
        ).toBeGreaterThanOrEqual(850);
      }
      await page.screenshot({
        path: testInfo.outputPath('auto-combat-defeat-toast.png'),
        fullPage: true,
      });

      const statusBeforeBackground = await api.get(
        `/auto-combat/${characterId}/status`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      await assertOk(
        statusBeforeBackground,
        'Consulta antes de ocultar a aba falhou',
      );
      const statusBeforeBackgroundPayload =
        (await statusBeforeBackground.json()) as {
          active?: boolean;
          session?: { currentCombatIndex?: number | null } | null;
        };
      const combatIndexBeforeBackground =
        statusBeforeBackgroundPayload.session?.currentCombatIndex ?? 0;
      const visualInstanceBeforeBackground = await page
        .locator('.auto-combat-mob-transition__layer--current')
        .getAttribute('data-mob-instance-key');

      expect(statusBeforeBackgroundPayload.active).toBe(true);
      expect(visualInstanceBeforeBackground).toBeTruthy();

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => true,
        });
        Object.defineProperty(document, 'hasFocus', {
          configurable: true,
          value: () => false,
        });
        window.dispatchEvent(new Event('blur'));
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await expect
        .poll(
          async () => {
            const statusResponse = await api.get(
              `/auto-combat/${characterId}/status`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              },
            );
            await assertOk(
              statusResponse,
              'Consulta durante a aba oculta falhou',
            );
            const payload = (await statusResponse.json()) as {
              active?: boolean;
              session?: { currentCombatIndex?: number | null } | null;
            };

            return (
              payload.active === true &&
              (payload.session?.currentCombatIndex ?? 0) >
                combatIndexBeforeBackground
            );
          },
          { timeout: 35_000 },
        )
        .toBe(true);

      await page.waitForTimeout(650);

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible',
        });
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => false,
        });
        Object.defineProperty(document, 'hasFocus', {
          configurable: true,
          value: () => true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });

      await expect
        .poll(
          () =>
            page
              .locator('.auto-combat-mob-transition__layer--current')
              .getAttribute('data-mob-instance-key'),
          { timeout: 10_000 },
        )
        .not.toBe(visualInstanceBeforeBackground);
      await expect
        .poll(
          async () => {
            const synchronizingCount = await page
              .getByText('Sincronizando', { exact: true })
              .count();
            const finalizingCount = await page
              .getByText('Finalizando abate', { exact: true })
              .count();

            return synchronizingCount + finalizingCount;
          },
          { timeout: 10_000 },
        )
        .toBe(0);

      const resumedProgressFill = page.locator(
        '.auto-combat-inline-battle__ttk-strip b',
      );
      await expect
        .poll(
          () =>
            resumedProgressFill.evaluate(
              (element) => getComputedStyle(element).animationName,
            ),
          { timeout: 10_000 },
        )
        .toContain('autoCombatBattleTimelineDrain');
      const resumedProgress = await resumedProgressFill.evaluate((element) => {
        const style = getComputedStyle(element);
        const transform = style.transform;
        const scaleX =
          transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;

        return {
          animationDelaySeconds: Number.parseFloat(style.animationDelay),
          scaleX,
        };
      });

      expect(
        resumedProgress.animationDelaySeconds,
        `A timeline voltou ao início após Alt+Tab: ${JSON.stringify(resumedProgress)}`,
      ).toBeLessThan(-0.25);
      expect(
        resumedProgress.scaleX,
        `A barra voltou visualmente cheia após Alt+Tab: ${JSON.stringify(resumedProgress)}`,
      ).toBeLessThan(0.98);

      await page
        .getByRole('link', { name: 'Visão geral', exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/${characterId}/?$`));

      const topBar = page.locator('.dashboard-topbar--auto-battle');
      await expect(topBar).toBeVisible();
      const readTopBarDefeatedCount = async () => {
        const text = await topBar.innerText();
        const match = text.match(/(\d+)\s*\/\s*(\d+)\s+abatidos/i);

        return match ? Number(match[1]) : -1;
      };
      const defeatedBeforeOtherPageCycle = await readTopBarDefeatedCount();

      expect(defeatedBeforeOtherPageCycle).toBeGreaterThanOrEqual(0);
      const topBarProgressFill = topBar.locator(
        '.dashboard-topbar__activity-progress > span',
      );
      await expect(topBarProgressFill).toBeVisible();
      await expect
        .poll(
          () =>
            topBarProgressFill.evaluate((element) => {
              const transform = getComputedStyle(element).transform;

              return transform === 'none'
                ? 1
                : new DOMMatrixReadOnly(transform).a;
            }),
          { timeout: 25_000, intervals: [50] },
        )
        .toBeLessThanOrEqual(0.02);
      await expect
        .poll(readTopBarDefeatedCount, { timeout: 5_000, intervals: [50] })
        .toBe(defeatedBeforeOtherPageCycle + 1);
      const otherPageDefeatToast = page
        .locator('.loot-notification-card[data-kind="combat-result"]')
        .first();

      await expect(otherPageDefeatToast).toBeVisible();
      await expect(
        otherPageDefeatToast.locator('.loot-notification-card__description'),
      ).toContainText('EXP');
      await expect
        .poll(
          () =>
            topBarProgressFill.evaluate((element) => {
              const transform = getComputedStyle(element).transform;
              const scaleX =
                transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;

              return scaleX >= 0.35 && scaleX <= 0.75;
            }),
          { timeout: 25_000, intervals: [50] },
        )
        .toBe(true);
      const topProgressBeforeRouteReturn = await topBarProgressFill.evaluate(
        (element) => {
          const transform = getComputedStyle(element).transform;

          return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
        },
      );

      await page
        .getByRole('link', { name: 'Combate automático', exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/dashboard/${characterId}/auto-combat/?$`),
      );

      const resumedInlineProgressFill = page.locator(
        '.auto-combat-inline-battle__ttk-strip b',
      );
      await expect(resumedInlineProgressFill).toBeVisible();
      await expect
        .poll(
          async () => {
            const [inlineScale, topScale] = await Promise.all([
              resumedInlineProgressFill.evaluate((element) => {
                const transform = getComputedStyle(element).transform;

                return transform === 'none'
                  ? 1
                  : new DOMMatrixReadOnly(transform).a;
              }),
              topBarProgressFill.evaluate((element) => {
                const transform = getComputedStyle(element).transform;

                return transform === 'none'
                  ? 1
                  : new DOMMatrixReadOnly(transform).a;
              }),
            ]);

            return Math.abs(inlineScale - topScale);
          },
          { timeout: 10_000, intervals: [50] },
        )
        .toBeLessThanOrEqual(0.02);
      const inlineProgressAfterRouteReturn =
        await resumedInlineProgressFill.evaluate((element) => {
          const transform = getComputedStyle(element).transform;

          return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
        });

      expect(
        inlineProgressAfterRouteReturn,
        'A barra reiniciou ao retornar da Visão Geral.',
      ).toBeLessThanOrEqual(topProgressBeforeRouteReturn + 0.05);
      await expect(
        page.getByText('Finalizando abate', { exact: true }),
      ).toHaveCount(0);
    } finally {
      await api.post(`/auto-combat/${characterId}/stop`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await api.dispose();
    }
  });
});
