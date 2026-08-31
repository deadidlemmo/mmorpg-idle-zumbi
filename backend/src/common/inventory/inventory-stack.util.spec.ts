import type { Prisma } from '@prisma/client';
import {
  tryConsumeBankStack,
  tryConsumeInventoryStack,
} from './inventory-stack.util';

describe('inventory stack consumption', () => {
  const inventoryItem = {
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    deleteMany: jest.fn(),
  };
  const bankItem = {
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    deleteMany: jest.fn(),
  };
  const tx = { inventoryItem, bankItem } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('decrements a partial inventory stack without allowing zero', async () => {
    inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    inventoryItem.findUniqueOrThrow.mockResolvedValue({ quantity: 4 });

    await expect(
      tryConsumeInventoryStack(tx, {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: 6,
      }),
    ).resolves.toBe(4);

    expect(inventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: { gt: 6 },
      },
      data: { quantity: { decrement: 6 } },
    });
    expect(inventoryItem.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes an inventory stack only when its quantity is exact', async () => {
    inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    inventoryItem.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      tryConsumeInventoryStack(tx, {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: 6,
      }),
    ).resolves.toBe(0);

    expect(inventoryItem.deleteMany).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: 6,
      },
    });
  });

  it('returns null when another transaction already consumed the inventory', async () => {
    inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    inventoryItem.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      tryConsumeInventoryStack(tx, {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: 6,
      }),
    ).resolves.toBeNull();
  });

  it('preserves a reserved quantity and applies the same rule to bank stacks', async () => {
    inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    inventoryItem.findUniqueOrThrow.mockResolvedValue({ quantity: 1 });
    bankItem.updateMany.mockResolvedValue({ count: 0 });
    bankItem.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      tryConsumeInventoryStack(tx, {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: 2,
        minimumRemaining: 1,
      }),
    ).resolves.toBe(1);
    await expect(
      tryConsumeBankStack(tx, {
        characterId: 'character-1',
        itemId: 'item-2',
        quantity: 3,
      }),
    ).resolves.toBe(0);

    expect(inventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: { gte: 3 },
      },
      data: { quantity: { decrement: 2 } },
    });
  });
});
