import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CharacterPetStatus,
  EconomyResourceType,
  PetEffectType,
  PetSpecialization,
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
    const creditWalletInTransaction = jest.fn();
    const service = createService(
      {
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
      },
      { creditWalletInTransaction },
    );

    await expect(
      service.convertDuplicateCocoons('user-id', 'character-id', {
        petDefinitionId: availablePet.petDefinition.id,
        quantity: 1,
        requestId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('primeiro exemplar');
    expect(inventoryUpdate).not.toHaveBeenCalled();
    expect(creditWalletInTransaction).not.toHaveBeenCalled();
  });

  it('converte casulos repetidos em fragmentos do mesmo tier', async () => {
    const creditWalletInTransaction = jest.fn().mockResolvedValue({
      applied: true,
      balance: 24,
    });
    const inventoryUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const ledgerCreate = jest.fn().mockResolvedValue({});
    const service = createService(
      {
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
        },
      },
      { creditWalletInTransaction },
    );

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
      balance: 24,
    });
    expect(inventoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantity: { decrement: 2 } },
      }),
    );
    expect(creditWalletInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tier: 1,
        quantity: 20,
      }),
    );
    expect(ledgerCreate).toHaveBeenCalledTimes(1);
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
