import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CharacterPetStatus,
  EconomyResourceType,
  PetEffectType,
  PetSpecialization,
  Prisma,
  Rarity,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EconomyService } from '../economy/economy.service';
import { PetsService } from './pets.service';

const availablePet = {
  id: 'character-pet-id',
  characterId: 'character-id',
  petDefinitionId: 'pet-definition-id',
  status: CharacterPetStatus.AVAILABLE,
  incubationRequestId: 'character-id:request-id',
  incubationStartedAt: new Date('2026-08-25T10:00:00.000Z'),
  incubationEndsAt: new Date('2026-08-25T12:00:00.000Z'),
  hatchedAt: new Date('2026-08-25T12:00:00.000Z'),
  createdAt: new Date('2026-08-25T10:00:00.000Z'),
  updatedAt: new Date('2026-08-25T12:00:00.000Z'),
  petDefinition: {
    id: 'pet-definition-id',
    key: 'farejador-suburbio',
    name: 'Farejador do Subúrbio',
    description: 'Reduz o tempo de rastreamento.',
    tier: 1,
    rarity: Rarity.UNCOMMON,
    specialization: PetSpecialization.AUTO_COMBAT_HUNTING,
    effectType: PetEffectType.HUNTING_TIME_REDUCTION,
    effectBasisPoints: 300,
    npcSaleGold: 120,
    cocoonItemId: 'cocoon-item-id',
    fragmentItemId: 'fragment-item-id',
    incubationSeconds: 7_200,
    fragmentCost: 10,
    goldCost: 300,
    assetKey: 'pet-rastreamento-t1',
    isActive: true,
    sortOrder: 7,
    createdAt: new Date('2026-08-25T10:00:00.000Z'),
    updatedAt: new Date('2026-08-25T10:00:00.000Z'),
    cocoonItem: {
      id: 'cocoon-item-id',
      name: 'Casulo de Rastreamento T1',
      slug: 'casulo-de-rastreamento-t1',
      description: 'Casulo especializado.',
      tier: 1,
      rarity: Rarity.UNCOMMON,
      family: 'Casulo Infectado',
    },
    fragmentItem: {
      id: 'fragment-item-id',
      name: 'Fragmento de Ameaça T1',
      slug: 'fragmento-de-ameaca-t1',
      description: 'Fragmento físico negociável.',
      tier: 1,
      rarity: Rarity.COMMON,
      family: 'Material de Ameaça Global',
    },
  },
};

function createService(
  tx: Record<string, unknown>,
  economyService: Partial<EconomyService> = {},
) {
  const transaction = jest.fn(
    async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
  );
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  return new PetsService(prisma, economyService as EconomyService);
}

describe('PetsService com fragmentos físicos', () => {
  it('usa somente a pilha da mochila no estado da incubadora', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          name: 'Teste',
          gold: 1_000,
          equippedPetId: null,
          inventoryItems: [
            { itemId: 'cocoon-item-id', quantity: 1 },
            { itemId: 'fragment-item-id', quantity: 10 },
          ],
          pets: [],
        }),
      },
      petDefinition: {
        findMany: jest.fn().mockResolvedValue([availablePet.petDefinition]),
      },
    } as unknown as PrismaService;
    const service = new PetsService(prisma, {} as EconomyService);

    const state = await service.getState('user-id', 'character-id');

    expect(state.pets[0]).toMatchObject({
      canIncubate: true,
      balances: {
        cocoons: 1,
        fragments: 10,
      },
      fragmentItem: {
        id: 'fragment-item-id',
        tier: 1,
      },
    });
  });

  it('consome o custo integral da pilha física na mesma transação', async () => {
    const inventoryUpdate = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const ledgerCreate = jest.fn((input: { data: Record<string, unknown> }) => {
      void input;
      return Promise.resolve({ id: 'ledger' });
    });
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ gold: 700 }),
      },
      petDefinition: {
        findFirst: jest.fn().mockResolvedValue(availablePet.petDefinition),
      },
      characterPet: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          ...availablePet,
          status: CharacterPetStatus.INCUBATING,
          hatchedAt: null,
        }),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 10 }),
        updateMany: inventoryUpdate,
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      economyLedgerEntry: { create: ledgerCreate },
    };
    const transaction = jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const service = new PetsService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as EconomyService,
    );
    const requestId = '44444444-4444-4444-8444-444444444444';

    await expect(
      service.startIncubation('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        requestId,
      }),
    ).resolves.toMatchObject({ applied: true });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(inventoryUpdate).toHaveBeenNthCalledWith(1, {
      where: {
        characterId: 'character-id',
        itemId: 'cocoon-item-id',
        quantity: { gte: 1 },
      },
      data: { quantity: { decrement: 1 } },
    });
    expect(inventoryUpdate).toHaveBeenNthCalledWith(2, {
      where: {
        characterId: 'character-id',
        itemId: 'fragment-item-id',
        quantity: { gte: 10 },
      },
      data: { quantity: { decrement: 10 } },
    });
    expect(
      ledgerCreate.mock.calls.some(
        ([entry]) =>
          entry.data.resourceType === EconomyResourceType.ITEM &&
          entry.data.itemId === 'fragment-item-id' &&
          entry.data.quantity === 10 &&
          entry.data.balanceAfter === 0,
      ),
    ).toBe(true);
  });

  it('rejeita estoque físico insuficiente antes de debitar o casulo', async () => {
    const inventoryUpdate = jest.fn();
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
        }),
      },
      petDefinition: {
        findFirst: jest.fn().mockResolvedValue(availablePet.petDefinition),
      },
      characterPet: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 5 }),
        updateMany: inventoryUpdate,
      },
    };
    const service = new PetsService(
      {
        $transaction: jest.fn(
          (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        ),
      } as unknown as PrismaService,
      {} as EconomyService,
    );

    await expect(
      service.startIncubation('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        requestId: '55555555-5555-4555-8555-555555555555',
      }),
    ).rejects.toThrow('10x Fragmento de Ameaça T1');
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  it('reutiliza a incubação existente sem descontar recursos novamente', async () => {
    const requestId = '66666666-6666-4666-8666-666666666666';
    const inventoryUpdate = jest.fn();
    const tx = {
      characterPet: {
        findUnique: jest.fn().mockResolvedValue({
          ...availablePet,
          status: CharacterPetStatus.INCUBATING,
          incubationRequestId: `character-id:${requestId}`,
          hatchedAt: null,
        }),
      },
      inventoryItem: { updateMany: inventoryUpdate },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const service = new PetsService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as EconomyService,
    );

    await expect(
      service.startIncubation('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        requestId,
      }),
    ).resolves.toMatchObject({ applied: false });

    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  it('aborta a incubação quando o estoque físico muda durante a transação', async () => {
    const inventoryUpdate = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const goldUpdate = jest.fn();
    const petCreate = jest.fn();
    const tx = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
        }),
        updateMany: goldUpdate,
      },
      petDefinition: {
        findFirst: jest.fn().mockResolvedValue(availablePet.petDefinition),
      },
      characterPet: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: petCreate,
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 10 }),
        updateMany: inventoryUpdate,
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const service = new PetsService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as EconomyService,
    );

    await expect(
      service.startIncubation('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        requestId: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toThrow('O estoque de fragmentos mudou');

    expect(goldUpdate).not.toHaveBeenCalled();
    expect(petCreate).not.toHaveBeenCalled();
  });
});

describe('PetsService collection operations', () => {
  it('equipa um pet pertencente ao personagem e substitui o anterior', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = createService({
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          equippedPetId: 'previous-pet-id',
        }),
        update,
      },
      characterPet: { findFirst: jest.fn().mockResolvedValue(availablePet) },
    });

    await expect(
      service.equipPet('user-id', 'character-id', availablePet.id),
    ).resolves.toMatchObject({ applied: true, pet: { isEquipped: true } });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'character-id' },
      data: { equippedPetId: availablePet.id },
    });
  });

  it('não permite acessar pet que não pertence ao personagem', async () => {
    const service = createService({
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          equippedPetId: null,
        }),
      },
      characterPet: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.equipPet('user-id', 'character-id', 'foreign-pet-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('impede a venda do pet equipado', async () => {
    const deleteMany = jest.fn();
    const service = createService({
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
          equippedPetId: availablePet.id,
        }),
      },
      characterPet: {
        findFirst: jest.fn().mockResolvedValue(availablePet),
        deleteMany,
      },
    });

    await expect(
      service.sellPet('user-id', 'character-id', availablePet.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('remove o pet e credita o valor da venda uma única vez', async () => {
    const ledgerCreate = jest.fn(
      (input: {
        data: { resourceType: EconomyResourceType; quantity: number };
      }) => Promise.resolve({ resourceType: input.data.resourceType }),
    );
    const service = createService({
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
          equippedPetId: null,
        }),
        update: jest.fn().mockResolvedValue({ gold: 1_120 }),
      },
      characterPet: {
        findFirst: jest.fn().mockResolvedValue(availablePet),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      economyLedgerEntry: { create: ledgerCreate },
    });

    await expect(
      service.sellPet('user-id', 'character-id', availablePet.id),
    ).resolves.toMatchObject({
      applied: true,
      soldPetId: availablePet.id,
      saleGold: 120,
      gold: 1_120,
    });
    expect(ledgerCreate).toHaveBeenCalledTimes(2);
    expect(ledgerCreate.mock.calls[0]?.[0].data.resourceType).toBe(
      EconomyResourceType.PET,
    );
    expect(ledgerCreate.mock.calls[0]?.[0].data.quantity).toBe(1);
  });

  it('reserva o primeiro casulo quando o pet ainda não pertence à coleção', async () => {
    const inventoryUpdate = jest.fn();
    const service = createService({
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
        }),
      },
      economyLedgerEntry: { findUnique: jest.fn().mockResolvedValue(null) },
      petDefinition: {
        findFirst: jest.fn().mockResolvedValue(availablePet.petDefinition),
      },
      characterPet: { findUnique: jest.fn().mockResolvedValue(null) },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 1 }),
        updateMany: inventoryUpdate,
      },
    });

    await expect(
      service.convertDuplicateCocoons('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        quantity: 1,
        requestId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('primeiro exemplar');
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  it('converte casulos repetidos em fragmentos do mesmo tier', async () => {
    const inventoryUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const fragmentUpsert = jest.fn().mockResolvedValue({ quantity: 20 });
    const ledgerCreate = jest.fn((input: { data: Record<string, unknown> }) => {
      void input;
      return Promise.resolve({ id: 'ledger' });
    });
    const service = createService({
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
        }),
      },
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: ledgerCreate,
      },
      petDefinition: {
        findFirst: jest.fn().mockResolvedValue(availablePet.petDefinition),
      },
      characterPet: {
        findUnique: jest.fn().mockResolvedValue({ id: availablePet.id }),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 2 }),
        updateMany: inventoryUpdate,
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: fragmentUpsert,
      },
    });

    await expect(
      service.convertDuplicateCocoons('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        quantity: 2,
        requestId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toMatchObject({
      applied: true,
      action: 'CONVERT',
      recoveredCocoons: 2,
      fragmentsReceived: 20,
      balance: 20,
    });
    expect(inventoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantity: { decrement: 2 } },
      }),
    );
    const [fragmentUpsertArgs] = fragmentUpsert.mock.calls[0] as unknown as [
      Prisma.InventoryItemUpsertArgs,
    ];
    expect(fragmentUpsertArgs).toMatchObject({
      where: {
        characterId_itemId: {
          characterId: 'character-id',
          itemId: 'fragment-item-id',
        },
      },
      create: {
        itemId: 'fragment-item-id',
        quantity: 20,
      },
    });
    expect(ledgerCreate).toHaveBeenCalledTimes(2);
    expect(ledgerCreate.mock.calls[1]?.[0].data).toMatchObject({
      resourceType: EconomyResourceType.ITEM,
      itemId: 'fragment-item-id',
      tier: 1,
      quantity: 20,
    });
  });

  it('vende casulo repetido sem remover o pet da coleção', async () => {
    const characterUpdate = jest.fn().mockResolvedValue({ gold: 1_060 });
    const characterPetDelete = jest.fn();
    const service = createService({
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-id',
          gold: 1_000,
        }),
        update: characterUpdate,
      },
      economyLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      petDefinition: {
        findFirst: jest.fn().mockResolvedValue(availablePet.petDefinition),
      },
      characterPet: {
        findUnique: jest.fn().mockResolvedValue({ id: availablePet.id }),
        deleteMany: characterPetDelete,
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await expect(
      service.sellDuplicateCocoons('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        quantity: 1,
        requestId: '33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toMatchObject({
      applied: true,
      action: 'SELL',
      recoveredCocoons: 1,
      goldReceived: 60,
      balance: 1_060,
    });
    expect(characterUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { gold: { increment: 60 } } }),
    );
    expect(characterPetDelete).not.toHaveBeenCalled();
  });
});
