import { ConflictException } from '@nestjs/common';
import {
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  ItemSlot,
} from '@prisma/client';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  const tx = {
    character: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    economyLedgerEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    craftingRecipe: {
      findMany: jest.fn(),
    },
    inventoryItem: {
      upsert: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    ),
  };
  const auditService = { recordSafely: jest.fn() };
  const observabilityService = {};
  const service = new AdminService(
    prisma as never,
    auditService as never,
    observabilityService as never,
  );
  const request = {
    amount: 25,
    reason: 'Compensação por atendimento',
    requestId: '1e239df1-f40c-4d5f-8958-35c9c0e7dd6e',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.economyLedgerEntry.findUnique.mockResolvedValue(null);
    tx.economyLedgerEntry.findMany.mockResolvedValue([]);
    tx.economyLedgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
    tx.character.findFirst.mockResolvedValue({
      id: 'character-1',
      name: 'Sobrevivente',
      cash: 10,
      user: { id: 'user-1', email: 'player@example.com' },
    });
    tx.character.updateMany.mockResolvedValue({ count: 1 });
    tx.character.findUniqueOrThrow.mockResolvedValue({
      id: 'character-1',
      name: 'Sobrevivente',
      cash: 35,
      user: { id: 'user-1', email: 'player@example.com' },
    });
  });

  it('credita Cash com ledger e auditoria', async () => {
    const result = await service.grantCharacterCash(
      'admin-1',
      'character-1',
      request,
    );

    expect(tx.character.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'character-1',
        deletedAt: null,
        cash: { lte: 2_147_483_622 },
      },
      data: { cash: { increment: 25 } },
    });
    expect(tx.economyLedgerEntry.create).toHaveBeenCalledWith({
      data: {
        characterId: 'character-1',
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.CASH,
        quantity: 25,
        balanceAfter: 35,
        reason: ECONOMY_REASONS.ADMIN_CASH_GRANT,
        idempotencyKey: `admin:cash:admin-1:${request.requestId}`,
        tier: null,
        currency: null,
        itemId: null,
        referenceType: 'AdminCashGrant',
        referenceId: request.requestId,
        metadata: {
          actorUserId: 'admin-1',
          reason: request.reason,
        },
      },
    });
    expect(auditService.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'ADMIN_CHARACTER_CASH_GRANTED',
        entityId: 'character-1',
      }),
    );
    expect(result).toMatchObject({
      amount: 25,
      grantedBalanceAfter: 35,
      alreadyProcessed: false,
      character: { cash: 35 },
    });
  });

  it('não duplica o crédito quando a solicitação é repetida', async () => {
    tx.economyLedgerEntry.findUnique.mockResolvedValue({
      characterId: 'character-1',
      quantity: 25,
      balanceAfter: 35,
    });

    const result = await service.grantCharacterCash(
      'admin-1',
      'character-1',
      request,
    );

    expect(tx.character.updateMany).not.toHaveBeenCalled();
    expect(tx.economyLedgerEntry.create).not.toHaveBeenCalled();
    expect(auditService.recordSafely).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      amount: 25,
      grantedBalanceAfter: 35,
      alreadyProcessed: true,
    });
  });

  it('rejeita a reutilização da solicitação para outro crédito', async () => {
    tx.economyLedgerEntry.findUnique.mockResolvedValue({
      characterId: 'character-2',
      quantity: 25,
      balanceAfter: 25,
    });

    await expect(
      service.grantCharacterCash('admin-1', 'character-1', request),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('concede um kit idempotente para várias receitas de criação', async () => {
    tx.character.findFirst.mockResolvedValue({
      id: 'character-1',
      name: 'Nilcruz',
      classId: 'class-1',
      craftingSkill: { level: 30 },
      user: { id: 'user-1', email: 'player@example.com' },
    });
    tx.craftingRecipe.findMany.mockResolvedValue([
      {
        id: 'recipe-1',
        tier: 3,
        outputItem: { id: 'output-1', name: 'Machado T3' },
        ingredients: [
          {
            quantity: 2,
            item: {
              id: 'material-1',
              name: 'Aço',
              tier: 3,
              slot: ItemSlot.MATERIAL,
            },
          },
          {
            quantity: 1,
            item: {
              id: 'material-2',
              name: 'Couro',
              tier: 3,
              slot: ItemSlot.MATERIAL,
            },
          },
        ],
      },
      {
        id: 'recipe-2',
        tier: 3,
        outputItem: { id: 'output-2', name: 'Armadura T3' },
        ingredients: [
          {
            quantity: 3,
            item: {
              id: 'material-1',
              name: 'Aço',
              tier: 3,
              slot: ItemSlot.MATERIAL,
            },
          },
        ],
      },
    ]);
    tx.inventoryItem.upsert
      .mockResolvedValueOnce({ quantity: 125 })
      .mockResolvedValueOnce({ quantity: 45 });
    const materialsRequest = {
      recipeCount: 2,
      craftsPerRecipe: 5,
      reason: 'Teste da fila de criação',
      requestId: 'e7f4be40-683e-48ad-923f-bd5ef98ba146',
    };

    const result = await service.grantCraftingMaterials(
      'admin-1',
      'character-1',
      materialsRequest,
    );

    expect(tx.inventoryItem.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        characterId_itemId: {
          characterId: 'character-1',
          itemId: 'material-1',
        },
      },
      create: {
        characterId: 'character-1',
        itemId: 'material-1',
        type: InventoryItemType.MATERIAL,
        quantity: 25,
      },
      update: { quantity: { increment: 25 } },
      select: { quantity: true },
    });
    expect(tx.economyLedgerEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.economyLedgerEntry.create).toHaveBeenNthCalledWith(1, {
      data: {
        characterId: 'character-1',
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.ITEM,
        quantity: 25,
        balanceAfter: 125,
        reason: ECONOMY_REASONS.ADMIN_CRAFTING_MATERIALS_GRANT,
        idempotencyKey: `admin:crafting-materials:admin-1:${materialsRequest.requestId}:material-1`,
        tier: 3,
        currency: null,
        itemId: 'material-1',
        referenceType: 'AdminCraftingMaterialsGrant',
        referenceId: materialsRequest.requestId,
        metadata: {
          actorUserId: 'admin-1',
          reason: materialsRequest.reason,
          recipeNames: ['Machado T3', 'Armadura T3'],
          craftsPerRecipe: 5,
        },
      },
    });
    expect(auditService.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_CRAFTING_MATERIALS_GRANTED',
        entityId: 'character-1',
      }),
    );
    expect(result).toMatchObject({
      totalCrafts: 10,
      recipeNames: ['Machado T3', 'Armadura T3'],
      alreadyProcessed: false,
      materials: [
        { itemId: 'material-1', quantity: 25, balanceAfter: 125 },
        { itemId: 'material-2', quantity: 5, balanceAfter: 45 },
      ],
    });
  });

  it('não duplica materiais quando a solicitação é repetida', async () => {
    tx.character.findFirst.mockResolvedValue({
      id: 'character-1',
      name: 'Nilcruz',
      classId: 'class-1',
      craftingSkill: { level: 30 },
      user: { id: 'user-1', email: 'player@example.com' },
    });
    tx.economyLedgerEntry.findMany.mockResolvedValue([
      {
        characterId: 'character-1',
        quantity: 25,
        balanceAfter: 125,
        item: { id: 'material-1', name: 'Aço', tier: 3 },
      },
    ]);

    const result = await service.grantCraftingMaterials(
      'admin-1',
      'character-1',
      {
        recipeCount: 2,
        craftsPerRecipe: 5,
        reason: 'Teste da fila de criação',
        requestId: 'e7f4be40-683e-48ad-923f-bd5ef98ba146',
      },
    );

    expect(tx.craftingRecipe.findMany).not.toHaveBeenCalled();
    expect(tx.inventoryItem.upsert).not.toHaveBeenCalled();
    expect(tx.economyLedgerEntry.create).not.toHaveBeenCalled();
    expect(auditService.recordSafely).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      alreadyProcessed: true,
      materials: [{ itemId: 'material-1', quantity: 25 }],
    });
  });
});
