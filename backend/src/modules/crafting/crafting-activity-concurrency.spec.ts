import { ConflictException } from '@nestjs/common';
import {
  ActivityStatus,
  CharacterStatus,
  ItemSlot,
  Rarity,
} from '@prisma/client';
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
      allowActiveCrafting: true,
    });
    expect(activityGuard.ensureCanStartCrafting).toHaveBeenNthCalledWith(2, {
      characterId: 'character-1',
      userId: 'user-1',
      client: tx,
      lockCharacter: true,
      allowActiveCrafting: true,
    });
  });

  it('agenda uma nova entrada depois da ultima criacao da fila', async () => {
    const currentCompletesAt = new Date(Date.now() + 30_000);
    const createSession = jest.fn(
      (query: {
        data: {
          characterId: string;
          recipeId: string;
          outputItemId: string;
          quantity: number;
          outputQuantity: number;
          craftingXpGained: number;
          durationSeconds: number;
          startedAt: Date;
          completesAt: Date;
        };
      }) =>
        Promise.resolve({
          id: 'session-queued',
          ...query.data,
          status: ActivityStatus.ACTIVE,
          completedAt: null,
          outputItem: {
            id: 'item-1',
            name: 'Item de teste',
            description: null,
            tier: 1,
            rarity: Rarity.COMMON,
            slot: ItemSlot.MAIN_HAND,
            family: 'Teste',
          },
        }),
    );
    const tx = {
      craftingSession: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'session-current',
            completesAt: currentCompletesAt,
          },
        ]),
        create: createSession,
      },
    };
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
            description: null,
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
      ensureCanStartCrafting: jest.fn().mockResolvedValue({}),
    };
    const service = new CraftingService(
      prisma,
      activityGuard as never,
      {} as never,
    );
    jest
      .spyOn(service as any, 'resolveCompletedCraftingSessions')
      .mockResolvedValue([]);
    jest.spyOn(service as any, 'getOrCreateCraftingSkill').mockResolvedValue({
      id: 'skill-1',
      characterId: 'character-1',
      level: 1,
      xp: 0,
      totalXp: 0,
    });

    const result = await service.craft('user-1', {
      characterId: 'character-1',
      itemId: 'item-1',
      quantity: 1,
    });

    const createData = createSession.mock.calls[0][0].data;
    expect(createData.startedAt).toEqual(currentCompletesAt);
    expect(createData.completesAt.getTime()).toBe(
      currentCompletesAt.getTime() + 15_000,
    );
    expect(result).toMatchObject({
      message: 'Item adicionado à fila de criação.',
      craftingSession: {
        queuePosition: 2,
        queueState: 'QUEUED',
      },
      queue: {
        totalEntries: 2,
        queuedEntries: 1,
      },
    });
  });
});
