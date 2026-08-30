import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  InventoryItemType,
} from '@prisma/client';
import { AutoCombatService } from './auto-combat.service';

const POTION_ITEM_ID = 'potion-1';

type PotionState = {
  enabled: boolean;
  potionItemId: string;
  potionItemName: string;
  hpThresholdPercent: number;
  healFlat: number;
  healPercent: number;
  availableQuantity: number;
  usedQuantity: number;
  totalHealed: number;
};

type PotionUseResult = {
  used: boolean;
  newHp: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
  usedQuantity: number | null;
};

type PotionLedgerUpsertArgs = {
  create: {
    characterId: string;
    itemId: string | null;
    quantity: number;
  };
  update: { quantity: { increment: number } };
};

type PotionTestHarness = {
  tryUseAutoPotion(params: {
    currentHp: number;
    maxHp: number;
    autoPotionState: PotionState;
    potionUsedThisCombat: boolean;
    className: string;
  }): PotionUseResult;
  applyRealtimeRoundResultToSession(
    session: unknown,
    result: ReturnType<typeof createAggregatedResult>,
  ): {
    totalPotionsUsed: number;
    character: {
      inventoryItems: Array<{ itemId: string; quantity: number }>;
    };
  };
  persistRealtimeRoundResult(
    session: unknown,
    result: ReturnType<typeof createAggregatedResult>,
  ): Promise<void>;
  claimSessionProcessingStep(...args: unknown[]): Promise<void>;
};

function createService(prisma: Record<string, unknown> = {}) {
  return new AutoCombatService(
    prisma as never,
    {
      stopActivitiesForDefeatedCharacter: jest.fn(),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function createAggregatedResult(potionsUsed: number) {
  const processedAt = new Date('2026-08-29T15:00:00.000Z');

  return {
    processedSeconds: 120,
    combatsResolved: 4,
    roundsResolved: 4,
    xpGained: 0,
    finalCurrentHp: 80,
    finalMaxHp: 100,
    finalLevel: 20,
    finalXp: 1_000,
    finalStatus: AutoCombatSessionStatus.ACTIVE,
    phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
    newLastProcessedAt: processedAt,
    finishedAt: null,
    currentMobId: 'mob-1',
    currentMobHp: 20,
    currentMobMaxHp: 100,
    currentRound: 4,
    currentCombatIndex: 5,
    battleTargetRemaining: 6,
    potionsUsed,
    potionItemId: POTION_ITEM_ID,
    potionItemName: 'Poção de Vida Leve',
    potionTriggerPercent: 35,
    potionQuantityBefore: 10,
    potionQuantityAfter: 10 - potionsUsed,
    potionQuantityRemaining: 10 - potionsUsed,
    potionUsedQuantity: 1,
    loots: new Map(),
    mobSummaries: new Map(),
    events: [],
    catchUp: true,
    actionsAvailable: 4,
    actionsProcessed: 4,
  };
}

describe('AutoCombatService potion consumption', () => {
  it('uses at most one potion in the same combat and decrements one dose', () => {
    const service = createService() as unknown as PotionTestHarness;
    const potionState: PotionState = {
      enabled: true,
      potionItemId: POTION_ITEM_ID,
      potionItemName: 'Poção de Vida Leve',
      hpThresholdPercent: 35,
      healFlat: 100,
      healPercent: 4,
      availableQuantity: 5,
      usedQuantity: 0,
      totalHealed: 0,
    };

    const firstUse = service.tryUseAutoPotion({
      currentHp: 30,
      maxHp: 100,
      autoPotionState: potionState,
      potionUsedThisCombat: false,
      className: 'Lutador',
    });
    const repeatedUse = service.tryUseAutoPotion({
      currentHp: firstUse.newHp,
      maxHp: 100,
      autoPotionState: potionState,
      potionUsedThisCombat: true,
      className: 'Lutador',
    });

    expect(firstUse).toMatchObject({
      used: true,
      quantityBefore: 5,
      quantityAfter: 4,
      usedQuantity: 1,
    });
    expect(repeatedUse.used).toBe(false);
    expect(potionState).toMatchObject({
      availableQuantity: 4,
      usedQuantity: 1,
    });
  });

  it('applies the aggregated offline consumption exactly once to the snapshot', () => {
    const service = createService() as unknown as PotionTestHarness;
    const result = createAggregatedResult(4);
    const session = {
      id: 'session-1',
      status: AutoCombatSessionStatus.ACTIVE,
      phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
      totalCombatsResolved: 10,
      totalRoundsResolved: 10,
      totalXpGained: 500,
      totalPotionsUsed: 2,
      battleTargetTotal: 10,
      battleTargetMobId: 'mob-1',
      battleTargetEncounterId: 'encounter-1',
      selectedEncounterId: 'encounter-1',
      selectedEncounterMobId: 'mob-1',
      character: {
        xp: 900,
        level: 20,
        currentHp: 50,
        maxHp: 100,
        inventoryItems: [
          {
            itemId: POTION_ITEM_ID,
            type: InventoryItemType.CONSUMABLE,
            quantity: 10,
          },
          {
            itemId: 'material-1',
            type: InventoryItemType.MATERIAL,
            quantity: 7,
          },
        ],
      },
      loots: [],
      events: [],
    };

    const nextSession = service.applyRealtimeRoundResultToSession(
      session,
      result,
    );

    expect(nextSession.totalPotionsUsed).toBe(6);
    expect(nextSession.character.inventoryItems).toEqual([
      expect.objectContaining({ itemId: POTION_ITEM_ID, quantity: 6 }),
      expect.objectContaining({ itemId: 'material-1', quantity: 7 }),
    ]);
  });

  it('persists the exact aggregated debit and matching economy ledger entry', async () => {
    const ledgerUpsert = jest.fn((args: PotionLedgerUpsertArgs) =>
      Promise.resolve(args),
    );
    const tx = {
      character: {
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inventory-potion-1',
          itemId: POTION_ITEM_ID,
          quantity: 10,
          item: { tier: 2 },
        }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      economyLedgerEntry: {
        upsert: ledgerUpsert,
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = createService(prisma) as unknown as PotionTestHarness;
    jest
      .spyOn(service, 'claimSessionProcessingStep')
      .mockResolvedValue(undefined);
    const result = createAggregatedResult(4);
    const session = {
      id: 'session-1',
      characterId: 'character-1',
      status: AutoCombatSessionStatus.ACTIVE,
      phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
      lastProcessedAt: new Date('2026-08-29T14:58:00.000Z'),
      battleTargetTotal: 10,
      battleTargetRemaining: 10,
    };

    await service.persistRealtimeRoundResult(session, result);

    expect(tx.inventoryItem.delete).not.toHaveBeenCalled();
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inventory-potion-1' },
      data: { quantity: { decrement: 4 } },
    });
    const ledgerArgs = ledgerUpsert.mock.calls[0]?.[0];

    expect(ledgerArgs).toMatchObject({
      create: {
        characterId: 'character-1',
        itemId: POTION_ITEM_ID,
        quantity: 4,
      },
      update: { quantity: { increment: 4 } },
    });
  });
});
