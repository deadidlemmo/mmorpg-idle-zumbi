import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import {
  IncursionSessionStatus,
  InventoryItemType,
  ItemSlot,
  PrismaClient,
} from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const password = 'TesteE2E123';
const prisma = new PrismaClient();

type ReinforcementItem = {
  id: string;
  name: string;
  enhancementLevel: number;
  strengthBonus: number;
  vitalityBonus: number;
  agilityBonus: number;
  precisionBonus: number;
  techniqueBonus: number;
  willpowerBonus: number;
};

type ReinforcementStateResponse = {
  character: {
    currentHp: number;
    maxHp: number;
  };
  equipment: {
    mainHand: ReinforcementItem;
  };
  stats: {
    totalPrimaryStats: Record<string, number>;
    derivedCombatStats: { maxHp: number };
  };
  reinforcement: {
    slots: Array<{
      slot: string;
      item: ReinforcementItem | null;
      nextItem: ReinforcementItem | null;
      cost: {
        level: number;
        fragmentCost: number;
        goldCost: number;
        materialBalance: number;
        goldBalance: number;
      } | null;
      canReinforce: boolean;
    }>;
  };
};

type IncursionStatusResponse = {
  rewardedSession?: {
    id: string;
    success: boolean;
    goldCostPaid: number;
    entryGoldRefund: number;
    goldReward: number;
    rewards: Array<{
      rewardType: string;
      itemId?: string | null;
      currency?: string | null;
      quantity: number;
      item?: { name: string } | null;
    }>;
  } | null;
};

let api: APIRequestContext;
let email = '';
let accessToken = '';
let characterId = '';
let incursionId = '';
let incursionName = '';
let reinforcementMaterialId = '';
let reinforcementMaterialName = '';
let baseItemId = '';
let earnedFragmentBalance = 0;
let goldAfterIncursions = 0;

async function requireOk(
  response: {
    ok: () => boolean;
    status: () => number;
    text: () => Promise<string>;
  },
  operation: string,
) {
  if (!response.ok()) {
    throw new Error(
      `${operation} falhou com HTTP ${response.status()}: ${await response.text()}`,
    );
  }
}

async function readMessage(response: { json: () => Promise<unknown> }) {
  const body = (await response.json()) as {
    message?: string | string[];
    error?: string;
  };

  return Array.isArray(body.message)
    ? body.message.join(' ')
    : (body.message ?? body.error ?? '');
}

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ({ token, currentCharacterId, tokenKey, characterKey }) => {
      localStorage.setItem(tokenKey, token);
      localStorage.setItem(characterKey, currentCharacterId);
    },
    {
      token: accessToken,
      currentCharacterId: characterId,
      tokenKey: accessTokenKey,
      characterKey: selectedCharacterKey,
    },
  );
}

async function startAndCompleteIncursion() {
  const startResponse = await api.post('/incursions/start', {
    data: {
      characterId,
      incursionId,
      approach: 'BALANCED',
    },
  });
  await requireOk(startResponse, 'Iniciar incursão da fixture');
  const started = (await startResponse.json()) as {
    session: { id: string };
  };

  await prisma.characterIncursionSession.update({
    where: { id: started.session.id },
    data: {
      endsAt: new Date(Date.now() - 1_000),
      outcomeRoll: 0,
    },
  });

  const statusResponse = await api.get(`/incursions/${characterId}/status`);
  await requireOk(statusResponse, 'Concluir incursão da fixture');
  const status = (await statusResponse.json()) as IncursionStatusResponse;

  expect(status.rewardedSession?.id).toBe(started.session.id);
  expect(status.rewardedSession?.success).toBe(true);
  expect(status.rewardedSession?.entryGoldRefund).toBe(
    status.rewardedSession?.goldCostPaid,
  );
  expect(status.rewardedSession?.goldReward).toBeGreaterThanOrEqual(
    status.rewardedSession?.entryGoldRefund ?? 0,
  );

  return status.rewardedSession;
}

async function getEquipmentState() {
  const response = await api.get(`/equipment/${characterId}`);
  await requireOk(response, 'Consultar estado de reforço');
  return (await response.json()) as ReinforcementStateResponse;
}

test.describe('incursão e reforço de equipamentos', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    email = `reinforcement-e2e-${suffix}@dead-idle.test`;

    const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    const registration = await publicApi.post('/auth/register', {
      data: {
        email,
        password,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    await requireOk(registration, 'Registrar conta da fixture');
    accessToken = ((await registration.json()) as { accessToken: string })
      .accessToken;
    await publicApi.dispose();

    api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    });

    const characterResponse = await api.post('/characters', {
      data: {
        name: `Reforco${suffix.replaceAll('-', '').slice(-9)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    await requireOk(characterResponse, 'Criar personagem da fixture');
    characterId = ((await characterResponse.json()) as { id: string }).id;

    await prisma.characterTutorialProgress.upsert({
      where: { characterId },
      create: {
        characterId,
        step: 5,
        completed: true,
        completedAt: new Date(),
      },
      update: {
        step: 5,
        completed: true,
        completedAt: new Date(),
        dismissedAt: null,
      },
    });

    const character = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { classId: true, mapId: true },
    });
    if (!character.mapId) throw new Error('Mapa inicial da fixture ausente.');

    const baseItem = await prisma.item.findFirstOrThrow({
      where: {
        classId: character.classId,
        tier: 1,
        slot: ItemSlot.MAIN_HAND,
        enhancementLevel: 0,
        isCraftable: true,
        enhancementVariants: {
          some: { enhancementLevel: 3 },
        },
      },
      orderBy: { name: 'asc' },
    });
    const reinforcementMaterial = await prisma.item.findFirstOrThrow({
      where: {
        name: 'Fragmento de Reforço T1',
        family: 'Material de Reforço',
        tier: 1,
      },
    });
    const incursion = await prisma.incursion.findFirstOrThrow({
      where: { mapId: character.mapId, tier: 1, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    baseItemId = baseItem.id;
    reinforcementMaterialId = reinforcementMaterial.id;
    reinforcementMaterialName = reinforcementMaterial.name;
    incursionId = incursion.id;
    incursionName = incursion.name;

    await prisma.character.update({
      where: { id: characterId },
      data: { gold: 10_000 },
    });
    await prisma.inventoryItem.upsert({
      where: {
        characterId_itemId: { characterId, itemId: baseItem.id },
      },
      create: {
        characterId,
        itemId: baseItem.id,
        quantity: 1,
        type: InventoryItemType.EQUIPMENT,
      },
      update: { quantity: 1, type: InventoryItemType.EQUIPMENT },
    });

    const equipResponse = await api.post('/equipment/equip', {
      data: { characterId, itemId: baseItem.id },
    });
    await requireOk(equipResponse, 'Equipar item base T1');
  });

  test.afterAll(async () => {
    await api?.dispose();
    if (email) await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  test('exibe a prévia, entrega recursos e preserva o resultado após F5', async ({
    page,
  }, testInfo) => {
    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/incursions`);
    await expect(
      page.getByRole('heading', { name: 'Incursões', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    await expect(
      page.getByText('Socket não autenticado.', { exact: true }),
    ).toHaveCount(0);

    for (const [name, assetSlug] of [
      ['Casas Seladas', 'casas-seladas'],
      ['Porão dos Infectados', 'porao-dos-infectados'],
    ] as const) {
      const tierOneCard = page
        .locator('.incursion-card')
        .filter({ hasText: name });
      await expect(tierOneCard).toBeVisible();
      const cardBackground = await tierOneCard
        .locator('.incursion-art')
        .evaluate((element) => getComputedStyle(element).backgroundImage);
      expect(cardBackground).toContain(assetSlug);

      await tierOneCard.click();
      const artDialog = page.getByRole('dialog');
      await expect(artDialog).toBeVisible();
      const modalBackground = await artDialog
        .locator('.incursions-modal__banner')
        .evaluate((element) => getComputedStyle(element).backgroundImage);
      expect(modalBackground).toContain(assetSlug);
      await artDialog.getByRole('button', { name: 'Fechar' }).click();
      await expect(artDialog).toHaveCount(0);
    }

    await page.screenshot({
      path: testInfo.outputPath('incursions-tier-1-desktop.png'),
      fullPage: true,
    });

    const originalCharacter = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { level: true, mapId: true },
    });
    const higherTierArtwork = [
      {
        tier: 2,
        level: 11,
        incursions: [
          ['Galpão do Capataz', 'galpao-do-capataz'],
          ['Oficina Enferrujada', 'oficina-enferrujada'],
        ],
      },
      {
        tier: 3,
        level: 21,
        incursions: [
          ['Ala de Isolamento', 'ala-de-isolamento'],
          ['Necrotério Lacrado', 'necroterio-lacrado'],
        ],
      },
      {
        tier: 4,
        level: 31,
        incursions: [
          ['Plataforma Morta', 'plataforma-morta'],
          ['Túneis de Embarque', 'tuneis-de-embarque'],
        ],
      },
      {
        tier: 5,
        level: 41,
        incursions: [
          ['Bloco de Contenção', 'bloco-de-contencao'],
          ['Posto de Triagem Selado', 'posto-de-triagem-selado'],
        ],
      },
    ] as const;

    for (const tierArtwork of higherTierArtwork) {
      const tierMap = await prisma.gameMap.findFirstOrThrow({
        where: { tier: tierArtwork.tier },
        select: { id: true },
      });
      await prisma.character.update({
        where: { id: characterId },
        data: { level: tierArtwork.level, mapId: tierMap.id },
      });
      await page.reload();

      for (const [name, assetSlug] of tierArtwork.incursions) {
        const tierCard = page
          .locator('.incursion-card')
          .filter({ hasText: name });
        await expect(tierCard).toBeVisible();
        const cardBackground = await tierCard
          .locator('.incursion-art')
          .evaluate((element) => getComputedStyle(element).backgroundImage);
        expect(cardBackground).toContain(assetSlug);

        await tierCard.click();
        const artDialog = page.getByRole('dialog');
        await expect(artDialog).toBeVisible();
        const modalBackground = await artDialog
          .locator('.incursions-modal__banner')
          .evaluate((element) => getComputedStyle(element).backgroundImage);
        expect(modalBackground).toContain(assetSlug);
        await artDialog.getByRole('button', { name: 'Fechar' }).click();
        await expect(artDialog).toHaveCount(0);
      }

      await page.screenshot({
        path: testInfo.outputPath(
          `incursions-tier-${tierArtwork.tier}-desktop.png`,
        ),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .locator('.incursion-card')
        .filter({ hasText: tierArtwork.incursions[0][0] })
        .click();
      const tierDialog = page.getByRole('dialog');
      await expect(tierDialog).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
      ).toBe(false);
      await tierDialog.screenshot({
        path: testInfo.outputPath(
          `incursion-tier-${tierArtwork.tier}-modal-mobile.png`,
        ),
      });
      await tierDialog.getByRole('button', { name: 'Fechar' }).click();
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    await prisma.character.update({
      where: { id: characterId },
      data: {
        level: originalCharacter.level,
        mapId: originalCharacter.mapId,
      },
    });
    await page.reload();

    const incursionCard = page
      .locator('.incursion-card')
      .filter({ hasText: incursionName });
    await expect(incursionCard).toContainText('frag.');
    await expect(incursionCard).toContainText('fichas');
    await incursionCard.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(reinforcementMaterialName)).toBeVisible();
    await expect(dialog.getByText('Entrada protegida')).toBeVisible();
    await expect(
      dialog.getByText('Progresso de equipamento garantido'),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await dialog.screenshot({
      path: testInfo.outputPath('incursion-tier-1-modal-mobile.png'),
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await dialog.getByRole('button', { name: /Iniciar incursão/i }).click();

    await expect
      .poll(() =>
        prisma.characterIncursionSession.findFirst({
          where: {
            characterId,
            status: IncursionSessionStatus.ACTIVE,
          },
          orderBy: { startedAt: 'desc' },
          select: { id: true },
        }),
      )
      .not.toBeNull();
    const activeSession =
      await prisma.characterIncursionSession.findFirstOrThrow({
        where: { characterId, status: IncursionSessionStatus.ACTIVE },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
    await prisma.characterIncursionSession.update({
      where: { id: activeSession.id },
      data: { endsAt: new Date(Date.now() - 1_000), outcomeRoll: 0 },
    });
    const firstStatusResponse = await api.get(
      `/incursions/${characterId}/status`,
    );
    await requireOk(firstStatusResponse, 'Concluir primeira incursão');

    await page.reload();
    const rewardResult = page.locator('.incursions-reward-result');
    await expect(rewardResult).toBeVisible();
    await page.waitForTimeout(500);
    await expect(
      page.getByText('Socket não autenticado.', { exact: true }),
    ).toHaveCount(0);
    await expect(rewardResult).toContainText('Recompensas recebidas');
    await expect(rewardResult).toContainText(reinforcementMaterialName);
    await expect(rewardResult).toContainText('Abrir oficina');

    await page.goto(`/dashboard/${characterId}/equipment`);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const balance = await prisma.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId,
            itemId: reinforcementMaterialId,
          },
        },
        select: { quantity: true },
      });
      if ((balance?.quantity ?? 0) >= 22) break;
      await startAndCompleteIncursion();
    }

    earnedFragmentBalance = (
      await prisma.inventoryItem.findUniqueOrThrow({
        where: {
          characterId_itemId: {
            characterId,
            itemId: reinforcementMaterialId,
          },
        },
        select: { quantity: true },
      })
    ).quantity;
    goldAfterIncursions = (
      await prisma.character.findUniqueOrThrow({
        where: { id: characterId },
        select: { gold: true },
      })
    ).gold;

    expect(earnedFragmentBalance).toBeGreaterThanOrEqual(22);
  });

  test('reembolsa 90% da entrada na falha sem conceder loot duplicado', async ({
    page,
  }) => {
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { gold: true, currentHp: true },
    });
    const startResponse = await api.post('/incursions/start', {
      data: {
        characterId,
        incursionId,
        approach: 'BALANCED',
      },
    });
    await requireOk(startResponse, 'Iniciar incursão destinada à falha');
    const started = (await startResponse.json()) as {
      session: { id: string; goldCostPaid: number };
    };

    await prisma.characterIncursionSession.update({
      where: { id: started.session.id },
      data: {
        endsAt: new Date(Date.now() - 1_000),
        outcomeRoll: 100,
      },
    });

    const statusResponse = await api.get(
      '/incursions/' + characterId + '/status',
    );
    await requireOk(statusResponse, 'Resolver falha da incursão');
    const rewarded = ((await statusResponse.json()) as IncursionStatusResponse)
      .rewardedSession;
    const expectedRefund = Math.floor(started.session.goldCostPaid * 0.9);

    expect(rewarded).toMatchObject({
      id: started.session.id,
      success: false,
      entryGoldRefund: expectedRefund,
      goldReward: expectedRefund,
      rewards: [],
    });

    const after = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { gold: true, currentHp: true },
    });
    expect(after.gold).toBe(
      before.gold - started.session.goldCostPaid + expectedRefund,
    );
    expect(after.currentHp).toBeLessThan(before.currentHp);

    const refunds = await prisma.economyLedgerEntry.count({
      where: {
        characterId,
        referenceId: started.session.id,
        reason: 'INCURSION_ENTRY_REFUND',
        quantity: expectedRefund,
      },
    });
    expect(refunds).toBe(1);

    await authenticatePage(page);
    await page.goto('/dashboard/' + characterId + '/incursions');
    const result = page.locator('.incursions-reward-result');
    await expect(result).toContainText('Entrada parcialmente devolvida');
    await page.reload();
    await expect(result).toContainText('Entrada parcialmente devolvida');
  });

  test('reforça do +0 ao +3 sem duplicar custos e mantém estado após reconnect', async ({
    page,
    context,
  }) => {
    const initialState = await getEquipmentState();
    const initialSlot = initialState.reinforcement.slots.find(
      (slot) => slot.slot === ItemSlot.MAIN_HAND,
    );
    expect(initialSlot?.item).toMatchObject({
      id: baseItemId,
      enhancementLevel: 0,
    });

    await prisma.inventoryItem.update({
      where: {
        characterId_itemId: { characterId, itemId: reinforcementMaterialId },
      },
      data: { quantity: 3 },
    });
    const missingFragments = await api.post('/equipment/reinforce', {
      data: {
        characterId,
        slot: ItemSlot.MAIN_HAND,
        requestId: `missing-fragments-${randomUUID()}`,
      },
    });
    expect(missingFragments.status()).toBe(400);
    expect(await readMessage(missingFragments)).toContain('necessários 4x');

    await prisma.inventoryItem.update({
      where: {
        characterId_itemId: { characterId, itemId: reinforcementMaterialId },
      },
      data: { quantity: earnedFragmentBalance },
    });
    await prisma.character.update({
      where: { id: characterId },
      data: { gold: 29 },
    });
    const missingGold = await api.post('/equipment/reinforce', {
      data: {
        characterId,
        slot: ItemSlot.MAIN_HAND,
        requestId: `missing-gold-${randomUUID()}`,
      },
    });
    expect(missingGold.status()).toBe(400);
    expect(await readMessage(missingGold)).toContain('30 Gold');

    await prisma.character.update({
      where: { id: characterId },
      data: { gold: goldAfterIncursions },
    });

    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/blacksmith`);
    await expect(
      page.getByRole('heading', { name: 'Ferreiro', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('PRÓXIMO REFORÇO', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.blacksmith-detail__stats')).not.toBeEmpty();

    await page.getByRole('button', { name: 'Reforçar para +1' }).click();
    await expect(page.getByTestId('reinforcement-confirmation')).toContainText(
      'agora está no +1',
    );

    const afterPlusOne = await getEquipmentState();
    expect(afterPlusOne.equipment.mainHand.enhancementLevel).toBe(1);
    expect(
      afterPlusOne.reinforcement.slots.find(
        (slot) => slot.slot === ItemSlot.MAIN_HAND,
      )?.cost?.level,
    ).toBe(2);

    const fragmentBeforePlusTwo = (
      await prisma.inventoryItem.findUniqueOrThrow({
        where: {
          characterId_itemId: {
            characterId,
            itemId: reinforcementMaterialId,
          },
        },
        select: { quantity: true },
      })
    ).quantity;
    const goldBeforePlusTwo = (
      await prisma.character.findUniqueOrThrow({
        where: { id: characterId },
        select: { gold: true },
      })
    ).gold;
    const duplicateRequestId = `idempotency-${randomUUID()}`;
    const plusTwo = await api.post('/equipment/reinforce', {
      data: {
        characterId,
        slot: ItemSlot.MAIN_HAND,
        requestId: duplicateRequestId,
      },
    });
    await requireOk(plusTwo, 'Aplicar reforço +2');
    expect((await plusTwo.json()) as { applied: boolean }).toMatchObject({
      applied: true,
    });

    const duplicate = await api.post('/equipment/reinforce', {
      data: {
        characterId,
        slot: ItemSlot.MAIN_HAND,
        requestId: duplicateRequestId,
      },
    });
    await requireOk(duplicate, 'Repetir reforço +2');
    expect((await duplicate.json()) as { applied: boolean }).toMatchObject({
      applied: false,
    });
    expect(
      (
        await prisma.inventoryItem.findUniqueOrThrow({
          where: {
            characterId_itemId: {
              characterId,
              itemId: reinforcementMaterialId,
            },
          },
          select: { quantity: true },
        })
      ).quantity,
    ).toBe(fragmentBeforePlusTwo - 7);
    expect(
      (
        await prisma.character.findUniqueOrThrow({
          where: { id: characterId },
          select: { gold: true },
        })
      ).gold,
    ).toBe(goldBeforePlusTwo - 60);

    await page.reload();
    await expect(
      page.locator('[data-target-key="equipped:MAIN_HAND"]'),
    ).toHaveAttribute('data-enhancement-level', '2');

    await context.setOffline(true);
    await page.waitForTimeout(250);
    await context.setOffline(false);
    await page.reload();
    await expect(
      page.locator('[data-target-key="equipped:MAIN_HAND"]'),
    ).toHaveAttribute('data-enhancement-level', '2');

    await page.getByRole('button', { name: 'Reforçar para +3' }).click();
    await expect(page.getByTestId('reinforcement-confirmation')).toContainText(
      'agora está no +3',
    );

    const finalState = await getEquipmentState();
    expect(finalState.equipment.mainHand.enhancementLevel).toBe(3);
    expect(
      finalState.reinforcement.slots.find(
        (slot) => slot.slot === ItemSlot.MAIN_HAND,
      )?.cost,
    ).toBeNull();
    expect(finalState.stats.derivedCombatStats.maxHp).toBeGreaterThanOrEqual(
      initialState.stats.derivedCombatStats.maxHp,
    );
    expect(finalState.character.maxHp).toBe(
      finalState.stats.derivedCombatStats.maxHp,
    );
    expect(finalState.character.currentHp).toBe(
      initialState.character.currentHp +
        (finalState.character.maxHp - initialState.character.maxHp),
    );

    const initialPrimaryTotal = Object.values(
      initialState.stats.totalPrimaryStats,
    ).reduce((total, value) => total + value, 0);
    const finalPrimaryTotal = Object.values(
      finalState.stats.totalPrimaryStats,
    ).reduce((total, value) => total + value, 0);
    expect(finalPrimaryTotal).toBeGreaterThan(initialPrimaryTotal);

    const alreadyMaximum = await api.post('/equipment/reinforce', {
      data: {
        characterId,
        slot: ItemSlot.MAIN_HAND,
        requestId: `already-maximum-${randomUUID()}`,
      },
    });
    expect(alreadyMaximum.status()).toBe(400);
    expect(await readMessage(alreadyMaximum)).toContain('já está no +3');

    await page.goto(`/dashboard/${characterId}/inventory`);
    await page
      .getByRole('button', {
        name: /Ver detalhes de Ficha de Incursão T1/i,
      })
      .click({ force: true });
    await page.getByRole('button', { name: 'Trocar', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Ficha de Incursão T1' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Opções de troca' }),
    ).toBeVisible();
  });
});
