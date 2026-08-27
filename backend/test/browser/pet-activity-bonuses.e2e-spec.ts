import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import {
  ActivityStatus,
  AutoCombatHuntBatchStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterPetStatus,
  EconomyCurrency,
  InventoryItemType,
  MaterialOrigin,
  PetSpecialization,
  PrismaClient,
} from '@prisma/client';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';
const accessTokenKey = 'dead_idle_access_token';
const selectedCharacterKey = 'dead_idle_selected_character_id';
const password = 'TesteE2E123';
const prisma = new PrismaClient();

type PetFixture = {
  characterPetId: string;
  petDefinitionId: string;
  cocoonItemId: string;
  name: string;
  tier: number;
  specialization: PetSpecialization;
  effectBasisPoints: number;
};

let api: APIRequestContext;
let email = '';
let accessToken = '';
let characterId = '';
let mapId = '';
let gatheringMaterialId = '';
let pets: PetFixture[] = [];

async function requireOk(response: APIResponse, operation: string) {
  if (!response.ok()) {
    throw new Error(
      `${operation} falhou com HTTP ${response.status()}: ${await response.text()}`,
    );
  }
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

function findPet(specialization: PetSpecialization, tier: number) {
  const pet = pets.find(
    (candidate) =>
      candidate.specialization === specialization && candidate.tier === tier,
  );
  if (!pet) {
    throw new Error(
      `Pet ${specialization} T${tier} ausente na fixture canônica.`,
    );
  }
  return pet;
}

async function equipPet(pet: PetFixture) {
  const response = await api.post(
    `/pets/characters/${characterId}/collection/${pet.characterPetId}/equip`,
  );
  await requireOk(response, `Equipar ${pet.name}`);
  return (await response.json()) as { applied: boolean };
}

async function reconnectPage(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await page.waitForTimeout(300);
  await context.setOffline(false);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(
    page.getByText('Socket não autenticado.', { exact: true }),
  ).toHaveCount(0);
}

test.describe('pets aplicados às atividades', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    email = `pets-activity-e2e-${suffix}@dead-idle.test`;

    const publicApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    const registration = await publicApi.post('/auth/register', {
      data: {
        email,
        password,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    await requireOk(registration, 'Registrar conta da fixture de pets');
    accessToken = ((await registration.json()) as { accessToken: string })
      .accessToken;
    await publicApi.dispose();

    api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    });

    const characterResponse = await api.post('/characters', {
      data: {
        name: `Pets${suffix.replaceAll('-', '').slice(-10)}`,
        className: 'Lutador',
        avatarKey: 'lutador-01',
      },
    });
    await requireOk(characterResponse, 'Criar personagem da fixture de pets');
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
      select: { mapId: true },
    });
    if (!character.mapId) throw new Error('Mapa inicial da fixture ausente.');
    mapId = character.mapId;

    const material = await prisma.item.findFirstOrThrow({
      where: {
        mapId,
        tier: 1,
        isGatheringMaterial: true,
        materialOrigin: MaterialOrigin.DESMANCHE,
        requiredGatheringLevel: { lte: 1 },
      },
      orderBy: { name: 'asc' },
    });
    gatheringMaterialId = material.id;

    const definitions = await prisma.petDefinition.findMany({
      where: { isActive: true, tier: { in: [1, 2, 3, 4, 5] } },
      orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }],
    });
    expect(definitions).toHaveLength(40);
    expect(
      new Set(definitions.map((definition) => definition.specialization)).size,
    ).toBe(8);

    const availableAt = new Date(Date.now() - 60_000);
    await prisma.characterPet.createMany({
      data: definitions.map((definition) => ({
        characterId,
        petDefinitionId: definition.id,
        status: CharacterPetStatus.AVAILABLE,
        incubationRequestId: `${characterId}:e2e:${definition.key}`,
        incubationStartedAt: availableAt,
        incubationEndsAt: availableAt,
        hatchedAt: availableAt,
      })),
    });
    const characterPets = await prisma.characterPet.findMany({
      where: { characterId },
    });
    const characterPetIdByDefinition = new Map(
      characterPets.map((pet) => [pet.petDefinitionId, pet.id]),
    );
    pets = definitions.map((definition) => ({
      characterPetId: characterPetIdByDefinition.get(definition.id)!,
      petDefinitionId: definition.id,
      cocoonItemId: definition.cocoonItemId,
      name: definition.name,
      tier: definition.tier,
      specialization: definition.specialization,
      effectBasisPoints: definition.effectBasisPoints,
    }));

    await prisma.inventoryItem.createMany({
      data: definitions.map((definition) => ({
        characterId,
        itemId: definition.cocoonItemId,
        quantity: 3,
        type: InventoryItemType.MATERIAL,
      })),
    });
    await prisma.characterEconomyBalance.createMany({
      data: [1, 2, 3, 4, 5].map((tier) => ({
        characterId,
        currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
        tier,
        balance: 999,
      })),
    });
    await prisma.character.update({
      where: { id: characterId },
      data: {
        level: 50,
        gold: 999_999,
        currentHp: 50_000,
        maxHp: 50_000,
      },
    });
  });

  test.afterAll(async () => {
    await api?.dispose();
    if (email) await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  test('exibe os 40 pets, equipa pela interface e preserva após F5 e reconexão', async ({
    page,
    context,
  }) => {
    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/pets?tier=1`);

    const incubator = page.locator('.pets-incubator');
    await expect(incubator).toBeVisible();
    await expect(page.locator('.pets-page__drop-source')).toContainText(
      'Drop de Ameaça Global',
    );
    await expect(
      page.getByText('Escolher casulo', { exact: true }),
    ).toHaveCount(0);
    await expect(
      incubator.locator('.pets-incubator__collection'),
    ).toContainText('40/40');
    await expect(incubator.locator('.pets-collection-card')).toHaveCount(8);

    const visualOutputDir = process.env.E2E_VISUAL_OUTPUT_DIR;
    await incubator.getByLabel('Exibir').selectOption('COCOONS');
    await expect(incubator.locator('.pets-collection-card')).toHaveCount(8);
    await incubator.locator('.pets-collection-card').first().click();
    const cocoonModal = page.locator('.pet-detail-modal__dialog');
    await expect(cocoonModal).toBeVisible();
    await expect(
      cocoonModal.getByRole('button', { name: 'Incubar casulo' }),
    ).toBeVisible();
    if (visualOutputDir) {
      await page.screenshot({
        path: `${visualOutputDir}/pets-cocoon-modal-desktop.png`,
      });
    }
    await page.getByRole('button', { name: 'Fechar detalhes' }).click();
    await incubator.getByLabel('Exibir').selectOption('ALL');
    await expect(incubator.locator('.pets-collection-card')).toHaveCount(8);

    if (visualOutputDir) {
      await page.screenshot({
        path: `${visualOutputDir}/pets-collection-desktop.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(incubator.locator('.pets-collection-card')).toHaveCount(8);
      const overflowedSlots = await incubator
        .locator('.pets-collection-card')
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.scrollWidth > element.clientWidth + 1 ||
                element.scrollHeight > element.clientHeight + 1,
            )
            .map((element) => element.getAttribute('aria-label')),
        );
      expect(overflowedSlots).toEqual([]);
      await page.screenshot({
        path: `${visualOutputDir}/pets-collection-mobile.png`,
        fullPage: true,
      });
      await incubator
        .getByRole('button', { name: /Sucateiro do Subúrbio/ })
        .click();
      await expect(page.locator('.pet-detail-modal__dialog')).toBeVisible();
      await page.screenshot({
        path: `${visualOutputDir}/pets-modal-mobile.png`,
      });
      await page.getByRole('button', { name: 'Fechar detalhes' }).click();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.reload();
      await expect(incubator.locator('.pets-collection-card')).toHaveCount(8);
    }

    await incubator
      .getByRole('button', { name: /Sucateiro do Subúrbio/ })
      .click();
    const detailModal = page.locator('.pet-detail-modal__dialog');
    await expect(detailModal).toBeVisible();
    await expect(detailModal).toContainText('Sucateiro do Subúrbio');
    if (visualOutputDir) {
      await page.screenshot({
        path: `${visualOutputDir}/pets-modal-desktop.png`,
      });
    }
    await detailModal
      .getByRole('button', { name: 'Equipar', exact: true })
      .click();
    await expect(
      incubator.locator('.pets-incubator__equipped'),
    ).not.toContainText('Nenhum');

    await page.reload();
    await expect(
      incubator.locator('.pets-incubator__collection'),
    ).toContainText('40/40');
    await expect(
      incubator.locator('.pets-incubator__equipped'),
    ).not.toContainText('Nenhum');

    await reconnectPage(context, page);
    await expect(
      incubator.locator('.pets-incubator__collection'),
    ).toContainText('40/40');
    await expect(
      incubator.locator('.pets-incubator__equipped'),
    ).not.toContainText('Nenhum');

    await page.goto(
      `/dashboard/${characterId}/resources?currency=WORLD_BOSS_FRAGMENT&tier=1`,
    );
    await expect(page.locator('.economy-exchange__source-rule')).toContainText(
      'Casulos são obtidos exclusivamente como drop de Ameaças Globais.',
    );
    await expect(
      page.getByText('Escolher casulo', { exact: true }),
    ).toHaveCount(0);
  });

  test('incuba um casulo pelo modal e coleta o pet após o tempo', async ({
    page,
  }) => {
    const patrolPet = findPet(PetSpecialization.GATHERING_PATRULHA, 1);
    await prisma.characterPet.delete({
      where: { id: patrolPet.characterPetId },
    });

    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/pets?tier=1`);

    const incubator = page.locator('.pets-incubator');
    await expect(
      incubator.locator('.pets-incubator__collection'),
    ).toContainText('39/40');
    await incubator.getByLabel('Exibir').selectOption('COCOONS');
    await incubator
      .getByRole('button', { name: /Casulo de Patrulha T1/ })
      .click();

    const modal = page.locator('.pet-detail-modal__dialog');
    const incubateButton = modal.getByRole('button', {
      name: 'Incubar casulo',
    });
    await expect(incubateButton).toBeEnabled();
    await incubateButton.click();
    await expect(
      modal.getByRole('button', { name: 'Incubando' }),
    ).toBeVisible();

    const incubation = await prisma.characterPet.findFirstOrThrow({
      where: {
        characterId,
        petDefinitionId: patrolPet.petDefinitionId,
      },
    });
    await prisma.characterPet.update({
      where: { id: incubation.id },
      data: { incubationEndsAt: new Date(Date.now() - 1_000) },
    });

    await page.reload();
    await incubator
      .getByRole('button', { name: 'Batedor do Subúrbio. Pronto.' })
      .click();
    const claimButton = modal.getByRole('button', { name: 'Coletar pet' });
    await expect(claimButton).toBeEnabled();
    await claimButton.click();
    await expect(
      incubator.locator('.pets-incubator__collection'),
    ).toContainText('40/40');
  });

  test('mantém um único equipado, recupera duplicata uma vez e bloqueia compra de casulo', async () => {
    const huntingPet = findPet(PetSpecialization.AUTO_COMBAT_HUNTING, 1);
    const ttkPet = findPet(PetSpecialization.AUTO_COMBAT_TTK, 1);

    const [firstEquip, secondEquip] = await Promise.all([
      api.post(
        `/pets/characters/${characterId}/collection/${huntingPet.characterPetId}/equip`,
      ),
      api.post(
        `/pets/characters/${characterId}/collection/${ttkPet.characterPetId}/equip`,
      ),
    ]);
    await requireOk(firstEquip, 'Primeiro equipamento concorrente');
    await requireOk(secondEquip, 'Segundo equipamento concorrente');

    const equipped = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { equippedPetId: true },
    });
    expect([huntingPet.characterPetId, ttkPet.characterPetId]).toContain(
      equipped.equippedPetId,
    );

    const balanceBefore =
      await prisma.characterEconomyBalance.findUniqueOrThrow({
        where: {
          characterId_currency_tier: {
            characterId,
            currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
            tier: 1,
          },
        },
        select: { balance: true },
      });
    const cocoonBefore = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId,
          itemId: huntingPet.cocoonItemId,
        },
      },
      select: { quantity: true },
    });
    const requestId = randomUUID();
    const [firstRecovery, secondRecovery] = await Promise.all([
      api.post(`/pets/characters/${characterId}/cocoons/duplicates/convert`, {
        data: {
          petDefinitionId: huntingPet.petDefinitionId,
          quantity: 1,
          requestId,
        },
      }),
      api.post(`/pets/characters/${characterId}/cocoons/duplicates/convert`, {
        data: {
          petDefinitionId: huntingPet.petDefinitionId,
          quantity: 1,
          requestId,
        },
      }),
    ]);
    await requireOk(firstRecovery, 'Primeira conversão concorrente');
    await requireOk(secondRecovery, 'Segunda conversão concorrente');
    const results = (await Promise.all([
      firstRecovery.json(),
      secondRecovery.json(),
    ])) as Array<{ applied: boolean; fragmentsReceived: number }>;
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(results.filter((result) => !result.applied)).toHaveLength(1);

    const balanceAfter = await prisma.characterEconomyBalance.findUniqueOrThrow(
      {
        where: {
          characterId_currency_tier: {
            characterId,
            currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
            tier: 1,
          },
        },
        select: { balance: true },
      },
    );
    const cocoonAfter = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId,
          itemId: huntingPet.cocoonItemId,
        },
      },
      select: { quantity: true },
    });
    expect(balanceAfter.balance - balanceBefore.balance).toBe(10);
    expect(cocoonBefore.quantity - cocoonAfter.quantity).toBe(1);

    const choicePet = findPet(PetSpecialization.GATHERING_COLETA, 1);
    const choiceCocoonBefore = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId,
          itemId: choicePet.cocoonItemId,
        },
      },
      select: { quantity: true },
    });
    const offersResponse = await api.get(
      `/economy/characters/${characterId}/exchange-offers`,
      {
        params: {
          tier: '1',
          currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
        },
      },
    );
    await requireOk(offersResponse, 'Listar trocas de fragmentos de ameaça');
    const offersResult = (await offersResponse.json()) as {
      offers: Array<{ id: string; source: string; category: string }>;
    };
    expect(offersResult.offers.length).toBeGreaterThan(0);
    expect(
      offersResult.offers.every(
        (offer) =>
          offer.source === 'WORLD_BOSS_EMERGENCY_DROP' &&
          offer.category === 'EMERGENCY' &&
          offer.id.startsWith('WBEM:'),
      ),
    ).toBe(true);

    const forbiddenChoiceResponse = await api.post(
      `/economy/characters/${characterId}/exchanges`,
      {
        data: {
          offerId: `WBC:${choicePet.cocoonItemId}`,
          requestId: randomUUID(),
        },
      },
    );
    expect(forbiddenChoiceResponse.status()).toBe(400);
    const choiceCocoonAfter = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId,
          itemId: choicePet.cocoonItemId,
        },
      },
      select: { quantity: true },
    });
    const balanceAfterRejectedChoice =
      await prisma.characterEconomyBalance.findUniqueOrThrow({
        where: {
          characterId_currency_tier: {
            characterId,
            currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
            tier: 1,
          },
        },
        select: { balance: true },
      });
    expect(choiceCocoonAfter.quantity).toBe(choiceCocoonBefore.quantity);
    expect(balanceAfterRejectedChoice.balance).toBe(balanceAfter.balance);
  });

  test('aplica a troca de pet somente no próximo ciclo de gathering e preserva progresso offline', async ({
    page,
    context,
  }) => {
    const tierOne = findPet(PetSpecialization.GATHERING_DESMANCHE, 1);
    const tierFive = findPet(PetSpecialization.GATHERING_DESMANCHE, 5);
    await equipPet(tierOne);

    const startResponse = await api.post('/gathering/start', {
      data: {
        characterId,
        mapId,
        origin: MaterialOrigin.DESMANCHE,
        targetMaterialId: gatheringMaterialId,
      },
    });
    await requireOk(startResponse, 'Iniciar gathering com pet T1');
    let session = await prisma.gatheringSession.findFirstOrThrow({
      where: { characterId, status: ActivityStatus.ACTIVE },
      orderBy: { startedAt: 'desc' },
    });
    expect(session.appliedPetDefinitionId).toBe(tierOne.petDefinitionId);
    expect(session.appliedPetEffectBasisPoints).toBe(300);

    await equipPet(tierFive);
    session = await prisma.gatheringSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(session.appliedPetDefinitionId).toBe(tierOne.petDefinitionId);
    expect(session.appliedPetEffectBasisPoints).toBe(300);

    const firstDurationMs = session.cycleDurationMs!;
    const firstCycleStartedAt = new Date(Date.now() - firstDurationMs - 200);
    await prisma.gatheringSession.update({
      where: { id: session.id },
      data: {
        lastResolvedAt: firstCycleStartedAt,
        cycleStartedAt: firstCycleStartedAt,
        cycleEndsAt: new Date(firstCycleStartedAt.getTime() + firstDurationMs),
      },
    });
    const nextCycleResponse = await api.get(`/gathering/${characterId}/status`);
    await requireOk(nextCycleResponse, 'Resolver próximo ciclo de gathering');
    session = await prisma.gatheringSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(session.collectedQuantity).toBeGreaterThanOrEqual(1);
    expect(session.appliedPetDefinitionId).toBe(tierFive.petDefinitionId);
    expect(session.appliedPetEffectBasisPoints).toBe(750);
    expect(session.cycleDurationMs!).toBeLessThan(firstDurationMs);

    const collectedBeforeOffline = session.collectedQuantity;
    const offlineDurationMs = session.cycleDurationMs! * 3 + 250;
    const offlineStartedAt = new Date(Date.now() - offlineDurationMs);
    await prisma.gatheringSession.update({
      where: { id: session.id },
      data: {
        lastResolvedAt: offlineStartedAt,
        cycleStartedAt: offlineStartedAt,
        cycleEndsAt: new Date(
          offlineStartedAt.getTime() + session.cycleDurationMs!,
        ),
      },
    });
    const offlineResponse = await api.get(`/gathering/${characterId}/status`);
    await requireOk(offlineResponse, 'Resolver gathering offline');
    const offlineStatus = (await offlineResponse.json()) as {
      active: boolean;
      timeline: { activityInstanceId: string; durationMs: number };
    };
    expect(offlineStatus.active).toBe(true);
    expect(offlineStatus.timeline.activityInstanceId).toBe(session.id);
    expect(offlineStatus.timeline.durationMs).toBe(session.cycleDurationMs);
    session = await prisma.gatheringSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(session.collectedQuantity).toBeGreaterThanOrEqual(
      collectedBeforeOffline + 3,
    );

    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/gathering/desmanche`);
    await expect(
      page.getByRole('heading', { name: 'Sucata útil não nasce pronta' }),
    ).toBeVisible();
    await reconnectPage(context, page);
    await expect(
      page.getByRole('heading', { name: 'Sucata útil não nasce pronta' }),
    ).toBeVisible();

    const stopResponse = await api.post(`/gathering/${characterId}/stop`);
    await requireOk(stopResponse, 'Encerrar gathering da fixture');
  });

  test('aplica a troca de pet no próximo rastreio e mantém a caça após F5 e reconexão', async ({
    page,
    context,
  }) => {
    const tierOne = findPet(PetSpecialization.AUTO_COMBAT_HUNTING, 1);
    const tierFive = findPet(PetSpecialization.AUTO_COMBAT_HUNTING, 5);
    await equipPet(tierOne);

    const startResponse = await api.post('/auto-combat/hunt/start', {
      data: { characterId, mapId },
    });
    await requireOk(startResponse, 'Iniciar caça com pet T1');
    let batch = await prisma.autoCombatHuntBatch.findFirstOrThrow({
      where: {
        characterId,
        status: AutoCombatHuntBatchStatus.HUNTING,
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(batch.appliedPetDefinitionId).toBe(tierOne.petDefinitionId);
    expect(batch.appliedPetEffectBasisPoints).toBe(300);

    await equipPet(tierFive);
    batch = await prisma.autoCombatHuntBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(batch.appliedPetDefinitionId).toBe(tierOne.petDefinitionId);
    expect(batch.appliedPetEffectBasisPoints).toBe(300);

    const firstDurationMs = batch.cycleDurationMs!;
    const offlineDurationMs = firstDurationMs * 40 + 250;
    const offlineStartedAt = new Date(Date.now() - offlineDurationMs);
    await prisma.autoCombatHuntBatch.update({
      where: { id: batch.id },
      data: {
        lastProcessedAt: offlineStartedAt,
        cycleStartedAt: offlineStartedAt,
        cycleEndsAt: new Date(offlineStartedAt.getTime() + firstDurationMs),
      },
    });
    const offlineProcessingResponse = await api.get(
      `/auto-combat/${characterId}/status`,
    );
    await requireOk(offlineProcessingResponse, 'Resolver caça offline');
    await expect
      .poll(
        async () =>
          (
            await prisma.autoCombatHuntBatch.findUniqueOrThrow({
              where: { id: batch.id },
              select: { foundEnemiesCount: true },
            })
          ).foundEnemiesCount,
      )
      .toBeGreaterThanOrEqual(40);
    batch = await prisma.autoCombatHuntBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(batch.foundEnemiesCount).toBeGreaterThanOrEqual(40);
    expect(batch.appliedPetDefinitionId).toBe(tierFive.petDefinitionId);
    expect(batch.appliedPetEffectBasisPoints).toBe(750);
    expect(batch.cycleDurationMs!).toBeLessThan(firstDurationMs);

    const synchronizedResponse = await api.get(
      `/auto-combat/${characterId}/status`,
    );
    await requireOk(synchronizedResponse, 'Sincronizar caça após o offline');
    const offlineStatus = (await synchronizedResponse.json()) as {
      active: boolean;
      huntBatch: { id: string };
      hunting: {
        timeline: { activityInstanceId: string; durationMs: number };
      };
    };
    expect(offlineStatus.active).toBe(true);
    expect(offlineStatus.huntBatch.id).toBe(batch.id);
    expect(offlineStatus.hunting.timeline.activityInstanceId).toBe(batch.id);

    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/auto-combat`);
    await expect(page.locator('.auto-combat-hunt-tracker')).toBeVisible();
    await page.reload();
    await expect(page.locator('.auto-combat-hunt-tracker')).toBeVisible();
    await reconnectPage(context, page);
    await expect(page.locator('.auto-combat-hunt-tracker')).toBeVisible();

    const stopResponse = await api.post(
      `/auto-combat/${characterId}/hunt/stop`,
    );
    await requireOk(stopResponse, 'Encerrar caça da fixture');
  });

  test('aplica o pet de TTK somente no próximo monstro e preserva o combate após reconexão', async ({
    page,
    context,
  }) => {
    const tierOne = findPet(PetSpecialization.AUTO_COMBAT_TTK, 1);
    const tierFive = findPet(PetSpecialization.AUTO_COMBAT_TTK, 5);
    await equipPet(tierOne);

    const readyBatch = await prisma.autoCombatHuntBatch.findFirstOrThrow({
      where: {
        characterId,
        status: AutoCombatHuntBatchStatus.READY,
      },
      orderBy: { startedAt: 'desc' },
    });
    const tracked = await prisma.autoCombatHuntBatchMob.findFirstOrThrow({
      where: { batchId: readyBatch.id, remainingCount: { gte: 2 } },
      orderBy: { remainingCount: 'desc' },
    });
    const quantity = Math.min(10, tracked.remainingCount);
    const startResponse = await api.post(
      `/auto-combat/${characterId}/battle/start`,
      {
        data: {
          mobId: tracked.mobId,
          encounterId: tracked.encounterId,
          quantity,
        },
      },
    );
    await requireOk(startResponse, 'Iniciar combate com pet T1');

    let session = await prisma.autoCombatSession.findFirstOrThrow({
      where: {
        characterId,
        status: AutoCombatSessionStatus.ACTIVE,
        phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(session.appliedTtkPetDefinitionId).toBe(tierOne.petDefinitionId);
    expect(session.appliedTtkPetEffectBasisPoints).toBe(300);
    expect(session.estimatedKillTimeMs).toBe(
      Math.max(
        1_000,
        Math.ceil((session.unmodifiedKillTimeMs! * (10_000 - 300)) / 10_000),
      ),
    );
    const firstDurationMs = session.estimatedKillTimeMs!;

    await equipPet(tierFive);
    session = await prisma.autoCombatSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(session.appliedTtkPetDefinitionId).toBe(tierOne.petDefinitionId);
    expect(session.appliedTtkPetEffectBasisPoints).toBe(300);

    await prisma.autoCombatSession.update({
      where: { id: session.id },
      data: {
        lastProcessedAt: new Date(Date.now() - firstDurationMs - 200),
      },
    });
    const nextMobResponse = await api.get(`/auto-combat/${characterId}/status`);
    await requireOk(nextMobResponse, 'Resolver primeiro monstro');
    await expect
      .poll(
        async () =>
          (
            await prisma.autoCombatSession.findUniqueOrThrow({
              where: { id: session.id },
              select: { totalCombatsResolved: true },
            })
          ).totalCombatsResolved,
      )
      .toBeGreaterThanOrEqual(1);
    session = await prisma.autoCombatSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(session.totalCombatsResolved).toBeGreaterThanOrEqual(1);
    expect(session.appliedTtkPetDefinitionId).toBe(tierFive.petDefinitionId);
    expect(session.appliedTtkPetEffectBasisPoints).toBe(750);
    expect(session.estimatedKillTimeMs).toBe(
      Math.max(
        1_000,
        Math.ceil((session.unmodifiedKillTimeMs! * (10_000 - 750)) / 10_000),
      ),
    );
    expect(session.estimatedKillTimeMs!).toBeLessThanOrEqual(firstDurationMs);
    if (firstDurationMs > 1_000) {
      expect(session.estimatedKillTimeMs!).toBeLessThan(firstDurationMs);
    } else {
      expect(session.estimatedKillTimeMs).toBe(1_000);
    }
    expect(session.estimatedKillTimeMs!).toBeGreaterThanOrEqual(1_000);

    await authenticatePage(page);
    await page.goto(`/dashboard/${characterId}/auto-combat`);
    await expect(page.locator('.auto-combat-inline-battle')).toBeVisible();
    await reconnectPage(context, page);
    await expect(page.locator('.auto-combat-inline-battle')).toBeVisible();

    const stopResponse = await api.post(`/auto-combat/${characterId}/stop`);
    await requireOk(stopResponse, 'Encerrar combate da fixture');
  });
});
