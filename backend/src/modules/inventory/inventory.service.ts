import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MoveInventoryItemDto } from './dto/move-inventory-item.dto';

const inventoryEntryInclude = {
  item: {
    include: {
      class: true,
      map: true,
    },
  },
} satisfies Prisma.InventoryItemInclude;

const bankEntryInclude = {
  item: {
    include: {
      class: true,
      map: true,
    },
  },
} satisfies Prisma.BankItemInclude;

type InventoryEntryRecord = Prisma.InventoryItemGetPayload<{
  include: typeof inventoryEntryInclude;
}>;

type BankEntryRecord = Prisma.BankItemGetPayload<{
  include: typeof bankEntryInclude;
}>;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCharacter(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      include: {
        inventoryItems: {
          orderBy: {
            createdAt: 'asc',
          },
          include: inventoryEntryInclude,
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    return {
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        xp: character.xp,
        currentHp: character.currentHp,
        maxHp: character.maxHp,
      },

      totalItems: character.inventoryItems.length,

      items: character.inventoryItems.map((inventoryItem) =>
        this.mapInventoryEntry(inventoryItem),
      ),
    };
  }

  async findBankByCharacter(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      include: {
        bankItems: {
          orderBy: {
            createdAt: 'asc',
          },
          include: bankEntryInclude,
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem nÃ£o encontrado.');
    }

    return {
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        xp: character.xp,
        currentHp: character.currentHp,
        maxHp: character.maxHp,
      },

      totalItems: character.bankItems.length,

      items: character.bankItems.map((bankItem) =>
        this.mapInventoryEntry(bankItem),
      ),
    };
  }

  async depositToBank(userId: string, moveItemDto: MoveInventoryItemDto) {
    await this.assertCharacterOwnership(userId, moveItemDto.characterId);

    const movedItem = await this.prisma.$transaction(async (tx) => {
      const inventoryItem = await tx.inventoryItem.findFirst({
        where: {
          characterId: moveItemDto.characterId,
          itemId: moveItemDto.itemId,
        },
        include: inventoryEntryInclude,
      });

      if (!inventoryItem) {
        throw new NotFoundException('Item nÃ£o encontrado na mochila.');
      }

      const quantity = this.getMoveQuantity(
        moveItemDto.quantity,
        inventoryItem.quantity,
      );

      await this.decrementInventoryItem(tx, inventoryItem, quantity);

      await tx.bankItem.upsert({
        where: {
          characterId_itemId: {
            characterId: moveItemDto.characterId,
            itemId: moveItemDto.itemId,
          },
        },
        create: {
          characterId: moveItemDto.characterId,
          itemId: moveItemDto.itemId,
          quantity,
          type: inventoryItem.type,
        },
        update: {
          quantity: {
            increment: quantity,
          },
          type: inventoryItem.type,
        },
      });

      return {
        itemName: inventoryItem.item.name,
        quantity,
      };
    });

    return {
      message: `${movedItem.quantity}x ${movedItem.itemName} enviado ao banco.`,
      movedItem,
    };
  }

  async withdrawFromBank(userId: string, moveItemDto: MoveInventoryItemDto) {
    await this.assertCharacterOwnership(userId, moveItemDto.characterId);

    const movedItem = await this.prisma.$transaction(async (tx) => {
      const bankItem = await tx.bankItem.findFirst({
        where: {
          characterId: moveItemDto.characterId,
          itemId: moveItemDto.itemId,
        },
        include: bankEntryInclude,
      });

      if (!bankItem) {
        throw new NotFoundException('Item nÃ£o encontrado no banco.');
      }

      const quantity = this.getMoveQuantity(
        moveItemDto.quantity,
        bankItem.quantity,
      );

      await this.decrementBankItem(tx, bankItem, quantity);

      await tx.inventoryItem.upsert({
        where: {
          characterId_itemId: {
            characterId: moveItemDto.characterId,
            itemId: moveItemDto.itemId,
          },
        },
        create: {
          characterId: moveItemDto.characterId,
          itemId: moveItemDto.itemId,
          quantity,
          type: bankItem.type,
        },
        update: {
          quantity: {
            increment: quantity,
          },
          type: bankItem.type,
        },
      });

      return {
        itemName: bankItem.item.name,
        quantity,
      };
    });

    return {
      message: `${movedItem.quantity}x ${movedItem.itemName} retirado do banco.`,
      movedItem,
    };
  }

  private async assertCharacterOwnership(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem nÃ£o encontrado.');
    }
  }

  private getMoveQuantity(
    requestedQuantity: number | undefined,
    availableQuantity: number,
  ) {
    const quantity = requestedQuantity ?? availableQuantity;

    if (quantity <= 0 || quantity > availableQuantity) {
      throw new BadRequestException(
        'Quantidade invÃ¡lida para movimentaÃ§Ã£o.',
      );
    }

    return quantity;
  }

  private async decrementInventoryItem(
    tx: Prisma.TransactionClient,
    inventoryItem: { id: string; quantity: number },
    quantity: number,
  ) {
    if (inventoryItem.quantity === quantity) {
      await tx.inventoryItem.delete({
        where: {
          id: inventoryItem.id,
        },
      });

      return;
    }

    await tx.inventoryItem.update({
      where: {
        id: inventoryItem.id,
      },
      data: {
        quantity: {
          decrement: quantity,
        },
      },
    });
  }

  private async decrementBankItem(
    tx: Prisma.TransactionClient,
    bankItem: { id: string; quantity: number },
    quantity: number,
  ) {
    if (bankItem.quantity === quantity) {
      await tx.bankItem.delete({
        where: {
          id: bankItem.id,
        },
      });

      return;
    }

    await tx.bankItem.update({
      where: {
        id: bankItem.id,
      },
      data: {
        quantity: {
          decrement: quantity,
        },
      },
    });
  }

  private mapInventoryEntry(
    inventoryItem: InventoryEntryRecord | BankEntryRecord,
  ) {
    return {
      inventoryItemId: inventoryItem.id,
      quantity: inventoryItem.quantity,
      type: inventoryItem.type,

      item: {
        id: inventoryItem.item.id,
        name: inventoryItem.item.name,
        description: inventoryItem.item.description,

        tier: inventoryItem.item.tier,
        rarity: inventoryItem.item.rarity,
        slot: inventoryItem.item.slot,
        family: inventoryItem.item.family,

        materialOrigin: inventoryItem.item.materialOrigin,

        strengthBonus: inventoryItem.item.strengthBonus,
        vitalityBonus: inventoryItem.item.vitalityBonus,
        agilityBonus: inventoryItem.item.agilityBonus,
        precisionBonus: inventoryItem.item.precisionBonus,
        techniqueBonus: inventoryItem.item.techniqueBonus,
        willpowerBonus: inventoryItem.item.willpowerBonus,

        healFlat: inventoryItem.item.healFlat,
        healPercent: inventoryItem.item.healPercent,
        usableInCombat: inventoryItem.item.usableInCombat,
        usableOutOfCombat: inventoryItem.item.usableOutOfCombat,

        minTier: inventoryItem.item.minTier,
        maxTier: inventoryItem.item.maxTier,

        isCraftable: inventoryItem.item.isCraftable,

        class: inventoryItem.item.class
          ? {
              id: inventoryItem.item.class.id,
              name: inventoryItem.item.class.name,
            }
          : null,

        map: inventoryItem.item.map
          ? {
              id: inventoryItem.item.map.id,
              name: inventoryItem.item.map.name,
              tier: inventoryItem.item.map.tier,
              minLevel: inventoryItem.item.map.minLevel,
              maxLevel: inventoryItem.item.map.maxLevel,
            }
          : null,
      },

      createdAt: inventoryItem.createdAt,
      updatedAt: inventoryItem.updatedAt,
    };
  }
}
