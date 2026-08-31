import { BadRequestException } from '@nestjs/common';
import { InventoryItemType, ItemSlot, Rarity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService - liquidação e troca de itens', () => {
  const fragmentItemId = '00000000-0000-4000-8000-000000000101';
  const inventoryItemId = '00000000-0000-4000-8000-000000000102';
  const characterId = '00000000-0000-4000-8000-000000000103';

  const tx = {
    character: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    inventoryItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    equipment: {
      findUnique: jest.fn(),
    },
    economyLedgerEntry: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
  const service = new InventoryService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.character.findFirst.mockResolvedValue({ id: characterId, gold: 500 });
    tx.equipment.findUnique.mockResolvedValue(null);
    tx.inventoryItem.findFirst.mockResolvedValue({
      id: inventoryItemId,
      characterId,
      itemId: fragmentItemId,
      quantity: 8,
      type: InventoryItemType.MATERIAL,
      createdAt: new Date('2026-08-30T12:00:00.000Z'),
      updatedAt: new Date('2026-08-30T12:00:00.000Z'),
      item: {
        id: fragmentItemId,
        name: 'Fragmento de Ameaça T3',
        slug: 'fragmento-de-ameaca-t3',
        description: null,
        tier: 3,
        rarity: Rarity.UNCOMMON,
        slot: ItemSlot.MATERIAL,
        family: 'Material de Ameaça Global',
        isSellable: false,
        isTradable: true,
        class: null,
        map: null,
      },
    });
  });

  it('rejeita a venda no Mercado Negro antes de remover item ou creditar Gold', async () => {
    await expect(
      service.sellToBlackMarket('user-1', {
        characterId,
        itemId: fragmentItemId,
        quantity: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.character.update).not.toHaveBeenCalled();
    expect(tx.economyLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('marca o fragmento físico como trocável pela mochila', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: characterId,
      name: 'Nilcruz',
      level: 20,
      xp: 0,
      currentHp: 100,
      maxHp: 100,
      inventoryItems: [
        {
          id: inventoryItemId,
          characterId,
          itemId: fragmentItemId,
          quantity: 8,
          type: InventoryItemType.MATERIAL,
          createdAt: new Date('2026-08-30T12:00:00.000Z'),
          updatedAt: new Date('2026-08-30T12:00:00.000Z'),
          item: {
            id: fragmentItemId,
            name: 'Fragmento de Ameaça T3',
            slug: 'fragmento-de-ameaca-t3',
            description: null,
            tier: 3,
            rarity: Rarity.UNCOMMON,
            slot: ItemSlot.MATERIAL,
            family: 'Material de Ameaça Global',
            materialOrigin: null,
            isCraftable: false,
            isSellable: false,
            isTradable: true,
            enhancementLevel: 0,
            class: null,
            map: null,
          },
        },
      ],
    });
    const inventoryService = new InventoryService({
      character: { findFirst },
    } as unknown as PrismaService);

    const result = await inventoryService.findByCharacter(
      'user-1',
      characterId,
    );

    expect(result.items[0].item).toMatchObject({
      id: fragmentItemId,
      isSellable: false,
      isTradable: true,
      exchangeCurrency: 'WORLD_BOSS_FRAGMENT',
    });
  });

  it('credita o piso T3 ao vender equipamento craftável no Mercado Negro', async () => {
    const equipmentItemId = '00000000-0000-4000-8000-000000000104';
    tx.inventoryItem.findFirst.mockResolvedValue({
      id: inventoryItemId,
      characterId,
      itemId: equipmentItemId,
      quantity: 1,
      type: InventoryItemType.EQUIPMENT,
      createdAt: new Date('2026-08-30T12:00:00.000Z'),
      updatedAt: new Date('2026-08-30T12:00:00.000Z'),
      item: {
        id: equipmentItemId,
        name: 'Armadura Craftável T3',
        slug: 'armadura-craftavel-t3',
        description: null,
        tier: 3,
        rarity: Rarity.UNCOMMON,
        slot: ItemSlot.ARMOR,
        family: 'Armadura de Lutador',
        isCraftable: true,
        isSellable: true,
        isTradable: true,
        class: null,
        map: null,
      },
    });
    tx.inventoryItem.deleteMany.mockResolvedValue({ count: 1 });
    tx.character.update.mockResolvedValue({ gold: 1_260 });
    tx.economyLedgerEntry.create.mockResolvedValue({});

    const result = await service.sellToBlackMarket('user-1', {
      characterId,
      itemId: equipmentItemId,
      quantity: 1,
    });

    expect(result.soldItem).toMatchObject({
      itemId: equipmentItemId,
      quantity: 1,
      unitValue: 760,
      totalValue: 760,
    });
    expect(tx.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { gold: { increment: 760 } },
      }),
    );
    expect(tx.economyLedgerEntry.create).toHaveBeenCalledTimes(2);
  });
});
