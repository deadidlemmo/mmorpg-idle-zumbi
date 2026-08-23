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

  test('mantem imagem continua e mostra o recibo fora do card do mob', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

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
        receiptInsideMobCard: false,
        receiptSeen: false,
        receiptVisibleStartedAt: null as number | null,
        maxReceiptVisibleMs: 0,
        receiptMobInstanceKeys: [] as string[],
        receiptCountdownLabels: [] as string[],
        transitionStarted: false,
        defeatedStartedAt: null as number | null,
        defeatedDurations: [] as number[],
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
        const receipt = document.querySelector('.auto-combat-kill-receipt');
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

        if (currentBody?.classList.contains('is-defeated')) {
          probe.defeatedStartedAt ??= now;
        }

        if (
          probe.defeatedStartedAt !== null &&
          probe.lastMobInstanceKey &&
          currentMobInstanceKey &&
          probe.lastMobInstanceKey !== currentMobInstanceKey
        ) {
          probe.defeatedDurations.push(now - probe.defeatedStartedAt);
          probe.defeatedStartedAt = null;
        }

        if (currentMobInstanceKey) {
          probe.lastMobInstanceKey = currentMobInstanceKey;
        }

        if (receipt) {
          probe.receiptSeen = true;

          if (probe.receiptVisibleStartedAt === null) {
            probe.receiptVisibleStartedAt = now;
            probe.receiptMobInstanceKeys.push(
              currentMobInstanceKey ?? 'sem-instancia',
            );
            probe.receiptCountdownLabels.push(countdownLabel ?? 'sem-status');
          }

          probe.maxReceiptVisibleMs = Math.max(
            probe.maxReceiptVisibleMs,
            now - probe.receiptVisibleStartedAt,
          );
          probe.receiptInsideMobCard ||= Boolean(
            receipt.closest(
              '[data-fighter-role="mob"], .auto-combat-inline-battle__mob-card',
            ),
          );
        } else {
          probe.receiptVisibleStartedAt = null;
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
      await expect(page.locator('.auto-combat-kill-receipt')).toBeVisible({
        timeout: 30_000,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileReceiptBox = await page
        .locator('.auto-combat-kill-receipt')
        .boundingBox();

      expect(mobileReceiptBox).not.toBeNull();
      expect(mobileReceiptBox?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect(
        (mobileReceiptBox?.x ?? 0) + (mobileReceiptBox?.width ?? 0),
      ).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: testInfo.outputPath('auto-combat-kill-receipt-mobile.png'),
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
                receiptInsideMobCard: boolean;
                receiptSeen: boolean;
                maxReceiptVisibleMs: number;
                receiptMobInstanceKeys: string[];
                receiptCountdownLabels: string[];
                transitionStarted: boolean;
                defeatedDurations: number[];
                firstMobInstanceKey: string | null;
                progressSamples: Array<{ at: number; percent: number }>;
              };
            }
          ).__autoCombatTransitionProbe,
      );

      expect(probe?.blankFrames).toBe(0);
      expect(probe?.handoffSeen).toBe(true);
      expect(probe?.receiptInsideMobCard).toBe(false);
      expect(probe?.receiptSeen).toBe(true);
      expect(
        probe?.maxReceiptVisibleMs,
        `O recibo de abate não permaneceu legível: ${JSON.stringify(probe)}`,
      ).toBeGreaterThanOrEqual(1_000);
      expect(probe?.receiptMobInstanceKeys.length ?? 0).toBeGreaterThanOrEqual(
        2,
      );
      expect(
        new Set(probe?.receiptMobInstanceKeys ?? []).size,
        `O recibo reapareceu para a mesma morte: ${JSON.stringify(probe?.receiptMobInstanceKeys)}`,
      ).toBe(probe?.receiptMobInstanceKeys.length);
      expect(
        probe?.receiptCountdownLabels.every((label) =>
          label.includes('Alvo derrotado'),
        ),
        `A EXP apareceu fora da derrota ativa: ${JSON.stringify(probe?.receiptCountdownLabels)}`,
      ).toBe(true);
      expect(probe?.transitionStarted).toBe(true);
      expect(probe?.defeatedDurations.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(
        probe?.defeatedDurations.every((duration) => duration >= 1_000),
        `A derrota visual durou menos de um segundo: ${JSON.stringify(probe?.defeatedDurations)}`,
      ).toBe(true);

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
      ).toBeLessThanOrEqual(1);

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
      const defeatedInstanceKeys = [
        ...new Set(
          countdownSamples
            .filter((sample) => sample.label.includes('Alvo derrotado'))
            .map((sample) => sample.instanceKey),
        ),
      ].slice(0, 2);

      expect(
        defeatedInstanceKeys.length,
        `O E2E não observou dois alvos derrotados: ${JSON.stringify(countdownSamples)}`,
      ).toBe(2);

      for (const instanceKey of defeatedInstanceKeys) {
        const mobCountdownSamples = countdownSamples.filter(
          (sample) => sample.instanceKey === instanceKey,
        );
        const twoSecondsIndex = mobCountdownSamples.findIndex((sample) =>
          sample.label.includes('2.0s restantes'),
        );
        const oneSecondIndex = mobCountdownSamples.findIndex(
          (sample, index) =>
            index > twoSecondsIndex && sample.label.includes('1.0s restantes'),
        );
        const defeatedIndex = mobCountdownSamples.findIndex(
          (sample, index) =>
            index > oneSecondIndex && sample.label.includes('Alvo derrotado'),
        );

        expect(
          mobCountdownSamples.some(
            (sample) => sample.label === 'Finalizando abate',
          ),
          `A fase intermediária voltou a aparecer em ${instanceKey}: ${JSON.stringify(mobCountdownSamples)}`,
        ).toBe(false);
        expect(
          [twoSecondsIndex, oneSecondIndex, defeatedIndex].every(
            (index) => index >= 0,
          ),
          `A sequência 2.0s -> 1.0s -> Alvo derrotado não foi preservada em ${instanceKey}: ${JSON.stringify(mobCountdownSamples)}`,
        ).toBe(true);
        expect(
          (mobCountdownSamples[oneSecondIndex]?.at ?? 0) -
            (mobCountdownSamples[twoSecondsIndex]?.at ?? 0),
        ).toBeGreaterThanOrEqual(850);
        expect(
          (mobCountdownSamples[defeatedIndex]?.at ?? 0) -
            (mobCountdownSamples[oneSecondIndex]?.at ?? 0),
        ).toBeGreaterThanOrEqual(850);
      }
      await page.screenshot({
        path: testInfo.outputPath('auto-combat-kill-receipt.png'),
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
          { timeout: 20_000 },
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
    } finally {
      await api.post(`/auto-combat/${characterId}/stop`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await api.dispose();
    }
  });
});
