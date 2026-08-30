import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  ItemSlot,
  Prisma,
  Rarity,
} from '@prisma/client';
import { getPetRarityByTier } from '../../common/config/economy.config';
import { calculateBlackMarketSellValue } from '../../common/config/item-economy.config';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { MoveInventoryItemDto } from './dto/move-inventory-item.dto';
import { SellInventoryItemDto } from './dto/sell-inventory-item.dto';

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

  async sellToBlackMarket(userId: string, sellItemDto: SellInventoryItemDto) {
    const operationId = randomUUID();
    const soldItem = await this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          id: sellItemDto.characterId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          gold: true,
        },
      });

      if (!character) {
        throw new NotFoundException('Personagem não encontrado.');
      }

      const inventoryItem = await tx.inventoryItem.findFirst({
        where: {
          characterId: character.id,
          itemId: sellItemDto.itemId,
        },
        include: inventoryEntryInclude,
      });

      if (!inventoryItem) {
        throw new NotFoundException('Item não encontrado na mochila.');
      }

      await this.assertItemIsNotEquipped(
        tx,
        character.id,
        inventoryItem.itemId,
      );

      if (inventoryItem.item.isSellable === false) {
        throw new BadRequestException(
          'Este item é vinculado e não pode ser vendido no Mercado Negro.',
        );
      }

      const isStackable = this.isStackableForBlackMarket(inventoryItem);
      const quantity = this.getSellQuantity(
        sellItemDto.quantity,
        inventoryItem.quantity,
        isStackable,
      );
      const unitValue = this.calculateBlackMarketSellValue(inventoryItem);
      const totalValue = unitValue * quantity;

      if (totalValue <= 0) {
        throw new BadRequestException(
          'Este item não possui valor no Mercado Negro.',
        );
      }

      await this.decrementInventoryItem(tx, inventoryItem, quantity);

      const updatedCharacter = await tx.character.update({
        where: {
          id: character.id,
        },
        data: {
          gold: {
            increment: totalValue,
          },
        },
        select: {
          gold: true,
        },
      });

      await recordEconomyEntry(tx, {
        characterId: character.id,
        direction: EconomyDirection.DEBIT,
        resourceType: EconomyResourceType.ITEM,
        itemId: inventoryItem.item.id,
        tier: inventoryItem.item.tier,
        quantity,
        reason: ECONOMY_REASONS.BLACK_MARKET_ITEM_SOLD,
        referenceType: 'BlackMarketSale',
        referenceId: operationId,
        idempotencyKey: `black-market:${operationId}:item`,
      });
      await recordEconomyEntry(tx, {
        characterId: character.id,
        direction: EconomyDirection.CREDIT,
        resourceType: EconomyResourceType.GOLD,
        tier: inventoryItem.item.tier,
        quantity: totalValue,
        balanceAfter: updatedCharacter.gold,
        reason: ECONOMY_REASONS.BLACK_MARKET_GOLD_RECEIVED,
        referenceType: 'BlackMarketSale',
        referenceId: operationId,
        idempotencyKey: `black-market:${operationId}:gold`,
      });

      return {
        itemId: inventoryItem.item.id,
        itemName: inventoryItem.item.name,
        quantity,
        unitValue,
        totalValue,
        gold: updatedCharacter.gold,
      };
    });

    return {
      message: `${soldItem.quantity}x ${soldItem.itemName} vendido no Mercado Negro por ${soldItem.totalValue} Gold.`,
      gold: soldItem.gold,
      soldItem,
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

  private getSellQuantity(
    requestedQuantity: number | undefined,
    availableQuantity: number,
    stackable: boolean,
  ) {
    const quantity = stackable ? (requestedQuantity ?? 1) : 1;

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > availableQuantity
    ) {
      throw new BadRequestException(
        'Quantidade inválida para venda no Mercado Negro.',
      );
    }

    return quantity;
  }

  private async assertItemIsNotEquipped(
    tx: Prisma.TransactionClient,
    characterId: string,
    itemId: string,
  ) {
    const equipment = await tx.equipment.findUnique({
      where: {
        characterId,
      },
      select: {
        mainHandId: true,
        offHandId: true,
        headId: true,
        armorId: true,
        pantsId: true,
        bootsId: true,
      },
    });

    if (!equipment) return;

    const equippedItemIds = [
      equipment.mainHandId,
      equipment.offHandId,
      equipment.headId,
      equipment.armorId,
      equipment.pantsId,
      equipment.bootsId,
    ];

    if (equippedItemIds.includes(itemId)) {
      throw new BadRequestException(
        'Item equipado não pode ser vendido no Mercado Negro.',
      );
    }
  }

  private isStackableForBlackMarket(
    inventoryItem: InventoryEntryRecord | BankEntryRecord,
  ) {
    return (
      inventoryItem.type !== InventoryItemType.EQUIPMENT &&
      (inventoryItem.item.slot === ItemSlot.MATERIAL ||
        inventoryItem.item.slot === ItemSlot.CONSUMABLE)
    );
  }

  private calculateBlackMarketSellValue(
    inventoryItem: InventoryEntryRecord | BankEntryRecord,
  ) {
    return calculateBlackMarketSellValue({
      tier: inventoryItem.item.tier,
      rarity: this.getCanonicalItemRarity(inventoryItem.item),
      inventoryType: inventoryItem.type,
      family: inventoryItem.item.family,
      isSellable: inventoryItem.item.isSellable,
    });
  }

  private getCanonicalItemRarity(item: InventoryEntryRecord['item']): Rarity {
    const isPetCocoon =
      item.family === 'Casulo Infectado' && item.slug?.startsWith('casulo-de-');

    if (!isPetCocoon) return item.rarity;

    return Rarity[getPetRarityByTier(item.tier)];
  }

  private async decrementInventoryItem(
    tx: Prisma.TransactionClient,
    inventoryItem: { id: string; quantity: number },
    quantity: number,
  ) {
    if (inventoryItem.quantity === quantity) {
      const deletedItem = await tx.inventoryItem.deleteMany({
        where: {
          id: inventoryItem.id,
        },
      });

      if (deletedItem.count <= 0) {
        throw new BadRequestException('Quantidade insuficiente do item.');
      }

      return;
    }

    const updatedItem = await tx.inventoryItem.updateMany({
      where: {
        id: inventoryItem.id,
        quantity: {
          gte: quantity,
        },
      },
      data: {
        quantity: {
          decrement: quantity,
        },
      },
    });

    if (updatedItem.count <= 0) {
      throw new BadRequestException('Quantidade insuficiente do item.');
    }
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
    const rarity = this.getCanonicalItemRarity(inventoryItem.item);

    return {
      inventoryItemId: inventoryItem.id,
      quantity: inventoryItem.quantity,
      type: inventoryItem.type,
      blackMarketSellPrice: this.calculateBlackMarketSellValue(inventoryItem),

      item: {
        id: inventoryItem.item.id,
        name: inventoryItem.item.name,
        description: inventoryItem.item.description,
        slug: inventoryItem.item.slug,

        tier: inventoryItem.item.tier,
        rarity,
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
        isSellable: inventoryItem.item.isSellable,
        isTradable: inventoryItem.item.isTradable,
        baseItemId: inventoryItem.item.baseItemId,
        enhancementLevel: inventoryItem.item.enhancementLevel,

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
