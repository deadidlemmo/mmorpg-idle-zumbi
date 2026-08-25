import {
  EconomyCurrency,
  EconomyDirection,
  EconomyResourceType,
  Prisma,
} from '@prisma/client';

export interface EconomyLedgerInput {
  characterId: string;
  direction: EconomyDirection;
  resourceType: EconomyResourceType;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  tier?: number | null;
  currency?: EconomyCurrency | null;
  itemId?: string | null;
  balanceAfter?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

function assertLedgerInput(input: EconomyLedgerInput) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('A quantidade do ledger deve ser um inteiro positivo.');
  }
  if (!input.idempotencyKey || input.idempotencyKey.length > 220) {
    throw new Error('A chave idempotente do ledger e invalida.');
  }
  if (!input.reason || input.reason.length > 80) {
    throw new Error('O motivo do ledger e invalido.');
  }
  if (
    input.tier !== null &&
    input.tier !== undefined &&
    (!Number.isInteger(input.tier) || input.tier < 0 || input.tier > 10)
  ) {
    throw new Error('O tier do ledger deve estar entre 0 e 10.');
  }
  if (
    input.resourceType === EconomyResourceType.CURRENCY &&
    (!input.currency || !input.tier)
  ) {
    throw new Error('Movimentos de carteira exigem moeda e tier.');
  }
  if (input.resourceType !== EconomyResourceType.CURRENCY && input.currency) {
    throw new Error('Somente movimentos de carteira aceitam moeda.');
  }
}

export async function recordEconomyEntry(
  tx: Prisma.TransactionClient,
  input: EconomyLedgerInput,
) {
  assertLedgerInput(input);

  return tx.economyLedgerEntry.create({
    data: {
      characterId: input.characterId,
      direction: input.direction,
      resourceType: input.resourceType,
      quantity: input.quantity,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      tier: input.tier ?? null,
      currency: input.currency ?? null,
      itemId: input.itemId ?? null,
      balanceAfter: input.balanceAfter ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      metadata: input.metadata,
    },
  });
}

export async function accumulateEconomyEntry(
  tx: Prisma.TransactionClient,
  input: EconomyLedgerInput,
) {
  assertLedgerInput(input);

  return tx.economyLedgerEntry.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      characterId: input.characterId,
      direction: input.direction,
      resourceType: input.resourceType,
      quantity: input.quantity,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      tier: input.tier ?? null,
      currency: input.currency ?? null,
      itemId: input.itemId ?? null,
      balanceAfter: input.balanceAfter ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      metadata: input.metadata,
    },
    update: {
      quantity: { increment: input.quantity },
      balanceAfter: input.balanceAfter ?? undefined,
    },
  });
}

export function getEconomyHourBucket(value: Date) {
  return Math.floor(value.getTime() / (60 * 60 * 1000));
}
