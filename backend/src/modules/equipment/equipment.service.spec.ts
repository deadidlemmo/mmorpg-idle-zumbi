import { BadRequestException } from '@nestjs/common';
import { InventoryItemType, ItemSlot } from '@prisma/client';
import { EquipmentService } from './equipment.service';

describe('EquipmentService', () => {
  const prisma = {
    character: {
      findFirst: jest.fn(),
    },
    inventoryItem: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new EquipmentService(prisma as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consulta o personagem pelo usuário autenticado', async () => {
    prisma.character.findFirst.mockResolvedValue(null);

    await expect(
      service.findByCharacter('user-1', 'character-1'),
    ).rejects.toThrow('Personagem não encontrado.');

    expect(prisma.character.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'character-1',
          userId: 'user-1',
        },
      }),
    );
  });

  it('impede equipar item acima do nível do personagem', async () => {
    const tx = {
      character: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'character-1',
          userId: 'user-1',
          classId: 'class-1',
          level: 30,
          class: {},
          equipment: null,
          gatheringSkills: [],
        }),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inventory-1',
          characterId: 'character-1',
          itemId: 'item-1',
          quantity: 1,
          type: InventoryItemType.EQUIPMENT,
          item: {
            id: 'item-1',
            name: 'Armadura de Barreira Selada',
            classId: 'class-1',
            class: { id: 'class-1', name: 'Lutador' },
            map: { minLevel: 41 },
            slot: ItemSlot.ARMOR,
          },
        }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    );

    await expect(
      service.equip('user-1', {
        characterId: 'character-1',
        itemId: 'item-1',
      }),
    ).rejects.toEqual(new BadRequestException('Este item exige nível 41.'));

    expect(tx.character.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'character-1', userId: 'user-1' },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
