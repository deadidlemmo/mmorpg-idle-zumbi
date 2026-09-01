import { InventoryItemType, ItemSlot } from '@prisma/client';
import { EquipmentReinforcementService } from './equipment-reinforcement.service';

function equipmentItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-base',
    name: 'Lâmina de teste',
    description: null,
    tier: 1,
    rarity: 'COMMON',
    slot: ItemSlot.MAIN_HAND,
    family: 'Lâmina',
    baseItemId: null,
    enhancementLevel: 0,
    strengthBonus: 5,
    vitalityBonus: 0,
    agilityBonus: 0,
    precisionBonus: 0,
    techniqueBonus: 0,
    willpowerBonus: 0,
    ...overrides,
  };
}

describe('EquipmentReinforcementService', () => {
  it('lista peças elegíveis mesmo quando faltam recursos', async () => {
    const baseItem = equipmentItem();
    const nextItem = equipmentItem({
      id: 'item-plus-one',
      name: 'Lâmina de teste +1',
      baseItemId: baseItem.id,
      enhancementLevel: 1,
      strengthBonus: 6,
    });
    const maxedItem = equipmentItem({
      id: 'item-maxed',
      name: 'Lâmina máxima',
      baseItemId: 'item-other-base',
      enhancementLevel: 3,
    });
    const material = equipmentItem({
      id: 'material-t1',
      name: 'Fragmento de Reforço T1',
      slot: ItemSlot.MATERIAL,
      family: 'Material de Reforço',
    });
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          gold: 0,
          equipment: {
            mainHand: baseItem,
            offHand: null,
            head: null,
            armor: null,
            pants: null,
            boots: null,
          },
          inventoryItems: [
            {
              id: 'material-stack',
              quantity: 0,
              type: InventoryItemType.MATERIAL,
              item: material,
            },
            {
              id: 'inventory-equipment',
              quantity: 2,
              type: InventoryItemType.EQUIPMENT,
              item: baseItem,
            },
            {
              id: 'inventory-maxed',
              quantity: 1,
              type: InventoryItemType.EQUIPMENT,
              item: maxedItem,
            },
          ],
        }),
      },
      item: {
        findMany: jest.fn().mockResolvedValue([nextItem]),
      },
    };
    const service = new EquipmentReinforcementService(prisma as never);

    const state = await service.getState('user-1', 'character-1');

    expect(state.items).toHaveLength(2);
    expect(state.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'equipped:MAIN_HAND',
          canReinforce: false,
          reason: 'Fragmentos de reforço insuficientes.',
        }),
        expect.objectContaining({
          key: 'inventory:inventory-equipment',
          quantity: 2,
          canReinforce: false,
          reason: 'Fragmentos de reforço insuficientes.',
        }),
      ]),
    );
    expect(state.items.some((entry) => entry.item.id === maxedItem.id)).toBe(
      false,
    );
  });

  it('reforça uma unidade da mochila sem alterar o equipamento ativo', async () => {
    const sourceItem = equipmentItem();
    const nextItem = equipmentItem({
      id: 'item-plus-one',
      name: 'Lâmina de teste +1',
      baseItemId: sourceItem.id,
      enhancementLevel: 1,
      strengthBonus: 6,
    });
    const material = equipmentItem({
      id: 'material-t1',
      name: 'Fragmento de Reforço T1',
      slot: ItemSlot.MATERIAL,
      family: 'Material de Reforço',
    });
    const tx = {
      character: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'character-1',
          gold: 100,
          level: 1,
          currentHp: 100,
          class: {},
          gatheringSkills: [],
          equipment: {
            mainHand: null,
            offHand: null,
            head: null,
            armor: null,
            pants: null,
            boots: null,
          },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ gold: 70 }),
      },
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inventory-equipment',
          characterId: 'character-1',
          itemId: sourceItem.id,
          quantity: 2,
          type: InventoryItemType.EQUIPMENT,
          item: sourceItem,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ quantity: 6 })
          .mockResolvedValueOnce({ quantity: 1 }),
        deleteMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
      item: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(nextItem)
          .mockResolvedValueOnce(material),
      },
      equipment: {
        update: jest.fn(),
      },
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new EquipmentReinforcementService(prisma as never);

    const result = await service.reinforce('user-1', {
      characterId: 'character-1',
      inventoryItemId: 'inventory-equipment',
      requestId: 'inventory-reinforcement-request',
    });

    expect(tx.inventoryItem.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        characterId: 'character-1',
        itemId: sourceItem.id,
        quantity: { gt: 1 },
      },
      data: { quantity: { decrement: 1 } },
    });
    expect(tx.inventoryItem.upsert).toHaveBeenCalledWith({
      where: {
        characterId_itemId: {
          characterId: 'character-1',
          itemId: nextItem.id,
        },
      },
      create: {
        characterId: 'character-1',
        itemId: nextItem.id,
        type: InventoryItemType.EQUIPMENT,
        quantity: 1,
      },
      update: {
        type: InventoryItemType.EQUIPMENT,
        quantity: { increment: 1 },
      },
    });
    expect(tx.equipment.update).not.toHaveBeenCalled();
    expect(tx.economyLedgerEntry.create).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      applied: true,
      gold: 70,
      reinforcedItem: { id: nextItem.id, enhancementLevel: 1 },
    });
  });
});
