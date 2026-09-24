import { ConflictException } from '@nestjs/common';
import { EconomyDirection, EconomyResourceType } from '@prisma/client';
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
      create: jest.fn(),
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
});
