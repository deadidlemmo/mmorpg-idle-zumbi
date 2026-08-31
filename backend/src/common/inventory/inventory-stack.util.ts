import type { Prisma } from '@prisma/client';

type StackConsumptionParams = {
  characterId: string;
  itemId: string;
  quantity: number;
  minimumRemaining?: number;
};

function assertConsumptionParams(params: StackConsumptionParams) {
  const minimumRemaining = params.minimumRemaining ?? 0;

  if (
    !Number.isSafeInteger(params.quantity) ||
    params.quantity <= 0 ||
    !Number.isSafeInteger(minimumRemaining) ||
    minimumRemaining < 0 ||
    !Number.isSafeInteger(params.quantity + minimumRemaining)
  ) {
    throw new RangeError('Quantidade de consumo invalida.');
  }

  return minimumRemaining;
}

export async function tryConsumeInventoryStack(
  tx: Prisma.TransactionClient,
  params: StackConsumptionParams,
): Promise<number | null> {
  const minimumRemaining = assertConsumptionParams(params);
  const updated = await tx.inventoryItem.updateMany({
    where: {
      characterId: params.characterId,
      itemId: params.itemId,
      quantity:
        minimumRemaining > 0
          ? { gte: params.quantity + minimumRemaining }
          : { gt: params.quantity },
    },
    data: { quantity: { decrement: params.quantity } },
  });

  if (updated.count === 1) {
    const remaining = await tx.inventoryItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: params.characterId,
          itemId: params.itemId,
        },
      },
      select: { quantity: true },
    });
    return remaining.quantity;
  }

  if (minimumRemaining > 0) return null;

  const deleted = await tx.inventoryItem.deleteMany({
    where: {
      characterId: params.characterId,
      itemId: params.itemId,
      quantity: params.quantity,
    },
  });

  return deleted.count === 1 ? 0 : null;
}

export async function tryConsumeBankStack(
  tx: Prisma.TransactionClient,
  params: StackConsumptionParams,
): Promise<number | null> {
  const minimumRemaining = assertConsumptionParams(params);
  const updated = await tx.bankItem.updateMany({
    where: {
      characterId: params.characterId,
      itemId: params.itemId,
      quantity:
        minimumRemaining > 0
          ? { gte: params.quantity + minimumRemaining }
          : { gt: params.quantity },
    },
    data: { quantity: { decrement: params.quantity } },
  });

  if (updated.count === 1) {
    const remaining = await tx.bankItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: params.characterId,
          itemId: params.itemId,
        },
      },
      select: { quantity: true },
    });
    return remaining.quantity;
  }

  if (minimumRemaining > 0) return null;

  const deleted = await tx.bankItem.deleteMany({
    where: {
      characterId: params.characterId,
      itemId: params.itemId,
      quantity: params.quantity,
    },
  });

  return deleted.count === 1 ? 0 : null;
}
