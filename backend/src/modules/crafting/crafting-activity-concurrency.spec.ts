import { ConflictException } from '@nestjs/common';
import { CharacterStatus, ItemSlot, Rarity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CraftingService } from './crafting.service';

describe('CraftingService activity concurrency', () => {
  it('repete a validacao de exclusividade depois de bloquear o personagem', async () => {
    const concurrentActivity = new ConflictException(
      'Outra atividade venceu a concorrencia.',
    );
    const tx = { transactionMarker: true };
    const prisma = {
      character: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'character-1',
          userId: 'user-1',
          name: 'Nilcruz',
          status: CharacterStatus.ACTIVE,
          user: { premiumUntil: null },
        }),
      },
      craftingRecipe: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'recipe-1',
          outputItemId: 'item-1',
          outputQuantity: 1,
          isActive: true,
          outputItem: {
            id: 'item-1',
            name: 'Item de teste',
            tier: 1,
            rarity: Rarity.COMMON,
            slot: ItemSlot.MAIN_HAND,
            family: 'Teste',
            isCraftable: true,
          },
          ingredients: [],
        }),
      },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const activityGuard = {
      ensureCanStartCrafting: jest
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(concurrentActivity),
    };
    const service = new CraftingService(
      prisma,
      activityGuard as never,
      {} as never,
    );
    jest
      .spyOn(service as any, 'resolveCompletedCraftingSessions')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getOrCreateCraftingSkill').mockResolvedValue({
      id: 'skill-1',
      characterId: 'character-1',
      level: 1,
      xp: 0,
      totalXp: 0,
    });

    await expect(
      service.craft('user-1', {
        characterId: 'character-1',
        itemId: 'item-1',
        quantity: 1,
      }),
    ).rejects.toBe(concurrentActivity);

    expect(activityGuard.ensureCanStartCrafting).toHaveBeenNthCalledWith(1, {
      characterId: 'character-1',
      userId: 'user-1',
    });
    expect(activityGuard.ensureCanStartCrafting).toHaveBeenNthCalledWith(2, {
      characterId: 'character-1',
      userId: 'user-1',
      client: tx,
      lockCharacter: true,
    });
  });
});
