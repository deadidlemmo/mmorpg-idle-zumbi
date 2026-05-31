import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItemType, ItemSlot, Prisma, Rarity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VendorBuyDto } from './dto/vendor-transaction.dto';

const VENDOR_ITEM_INCLUDE = {
  class: true,
  map: true,
} satisfies Prisma.ItemInclude;

const VENDOR_INVENTORY_INCLUDE = {
  item: {
    include: VENDOR_ITEM_INCLUDE,
  },
} satisfies Prisma.InventoryItemInclude;

type VendorItemRecord = Prisma.ItemGetPayload<{
  include: typeof VENDOR_ITEM_INCLUDE;
}>;

type VendorInventoryRecord = Prisma.InventoryItemGetPayload<{
  include: typeof VENDOR_INVENTORY_INCLUDE;
}>;

type VendorCharacterRecord = {
  id: string;
  name: string;
  level: number;
  gold: number;
  userId: string;
};

const VENDOR_FIXED_BUY_PRICE_BY_NAME: Record<string, number> = {
  'Poção de Vida Menor': 25,
  'Poção de Vida': 80,
  'Poção de Vida Maior': 180,
  'Poção de Vida Superior': 420,
  'Poção de Vida Suprema': 900,
  'Pocao Pequena de Vida': 25,
  'Pocao Media de Vida': 80,
  'Pocao Grande de Vida': 180,
};

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService) {}

  async getShop(userId: string, characterId: string) {
    const character = await this.findCharacter(userId, characterId);

    const items = await this.prisma.item.findMany({
      where: {
        slot: ItemSlot.CONSUMABLE,
        isTradable: true,
      },
      include: VENDOR_ITEM_INCLUDE,
      orderBy: [{ minTier: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
    });

    const shopItems = items
      .filter((item) => this.isAvailableForPurchase(item))
      .map((item) => this.mapShopItem(item));

    return {
      npc: this.getNpc(),
      character: this.mapCharacter(character),
      gold: character.gold,
      categories: this.buildCategorySummary(shopItems),
      items: shopItems,
    };
  }

  async buy(userId: string, characterId: string, vendorBuyDto: VendorBuyDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          id: characterId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          level: true,
          gold: true,
          userId: true,
        },
      });

      if (!character) {
        throw new NotFoundException('Personagem nao encontrado.');
      }

      const item = await tx.item.findUnique({
        where: { id: vendorBuyDto.itemId },
        include: VENDOR_ITEM_INCLUDE,
      });

      if (!item) {
        throw new NotFoundException('Item indisponivel no mercador.');
      }

      if (!this.isAvailableForPurchase(item)) {
        throw new BadRequestException('Item indisponivel para compra.');
      }

      const stackable = this.isStackable(item);
      const quantity = this.normalizeQuantity(vendorBuyDto.quantity, stackable);
      const unitPrice = this.calculateBuyPrice(item);
      const totalPrice = unitPrice * quantity;

      if (totalPrice <= 0) {
        throw new BadRequestException('Item sem preco de compra configurado.');
      }

      const updatedGold = await tx.character.updateMany({
        where: {
          id: character.id,
          gold: {
            gte: totalPrice,
          },
        },
        data: {
          gold: {
            decrement: totalPrice,
          },
        },
      });

      if (updatedGold.count <= 0) {
        throw new BadRequestException('Gold insuficiente para esta compra.');
      }

      const inventoryItem = await tx.inventoryItem.upsert({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: item.id,
          },
        },
        create: {
          characterId: character.id,
          itemId: item.id,
          quantity,
          type: this.getInventoryType(item),
        },
        update: {
          quantity: {
            increment: quantity,
          },
          type: this.getInventoryType(item),
        },
        include: VENDOR_INVENTORY_INCLUDE,
      });

      const updatedCharacter = await tx.character.findUniqueOrThrow({
        where: { id: character.id },
        select: {
          id: true,
          name: true,
          level: true,
          gold: true,
          userId: true,
        },
      });

      return {
        character: updatedCharacter,
        item,
        inventoryItem,
        quantity,
        unitPrice,
        totalPrice,
      };
    });

    return {
      message: `${result.quantity}x ${result.item.name} comprado com sucesso.`,
      gold: result.character.gold,
      character: this.mapCharacter(result.character),
      transaction: {
        type: 'BUY',
        quantity: result.quantity,
        unitPrice: result.unitPrice,
        totalPrice: result.totalPrice,
      },
      item: this.mapShopItem(result.item),
      inventoryItem: this.mapInventoryEntry(result.inventoryItem),
    };
  }

  private async findCharacter(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        level: true,
        gold: true,
        userId: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }

    return character;
  }

  private getNpc() {
    return {
      name: 'Mara',
      title: 'Mara, a Mercadora',
      description:
        'Suprimentos, remédios e recursos para quem ainda sobrevive.',
    };
  }

  private mapCharacter(character: VendorCharacterRecord) {
    return {
      id: character.id,
      name: character.name,
      level: character.level,
      gold: character.gold,
    };
  }

  private mapShopItem(item: VendorItemRecord) {
    const buyPrice = this.calculateBuyPrice(item);

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      tier: item.tier,
      rarity: item.rarity,
      slot: item.slot,
      family: item.family,
      category: this.getCategory(item),
      stackable: this.isStackable(item),
      buyPrice,
      effects: this.getItemEffects(item),
      healFlat: item.healFlat,
      healPercent: item.healPercent,
      minTier: item.minTier,
      maxTier: item.maxTier,
      isSellable: item.isSellable,
      isTradable: item.isTradable,
      class: item.class
        ? {
            id: item.class.id,
            name: item.class.name,
          }
        : null,
      map: item.map
        ? {
            id: item.map.id,
            name: item.map.name,
            tier: item.map.tier,
          }
        : null,
    };
  }

  private mapInventoryEntry(inventoryItem: VendorInventoryRecord) {
    return {
      inventoryItemId: inventoryItem.id,
      quantity: inventoryItem.quantity,
      type: inventoryItem.type,
      item: this.mapShopItem(inventoryItem.item),
      createdAt: inventoryItem.createdAt,
      updatedAt: inventoryItem.updatedAt,
    };
  }

  private buildCategorySummary(items: Array<{ category: string }>) {
    const categories = ['CONSUMABLE', 'GATHERING', 'MOB_DROP'];

    return [
      {
        key: 'ALL',
        label: 'Todos',
        count: items.length,
      },
      ...categories.map((category) => ({
        key: category,
        label: this.getCategoryLabel(category),
        count: items.filter((item) => item.category === category).length,
      })),
    ];
  }

  private getCategory(item: {
    slot: ItemSlot;
    materialOrigin?: string | null;
  }) {
    if (item.slot === ItemSlot.CONSUMABLE) {
      return 'CONSUMABLE';
    }

    if (item.slot === ItemSlot.MATERIAL) {
      if ('materialOrigin' in item && item.materialOrigin === 'DROP_MOBS') {
        return 'MOB_DROP';
      }

      return 'GATHERING';
    }

    return 'UNAVAILABLE';
  }

  private getCategoryLabel(category: string) {
    switch (category) {
      case 'CONSUMABLE':
        return 'Pocoes';
      case 'GATHERING':
        return 'Gathering';
      case 'MOB_DROP':
        return 'Drops de mobs';
      default:
        return 'Indisponivel';
    }
  }

  private getInventoryType(item: { slot: ItemSlot }) {
    if (item.slot === ItemSlot.CONSUMABLE) return InventoryItemType.CONSUMABLE;
    if (item.slot === ItemSlot.MATERIAL) return InventoryItemType.MATERIAL;

    throw new BadRequestException('Item indisponivel para o Mercador.');
  }

  private isStackable(item: { slot: ItemSlot }) {
    return item.slot === ItemSlot.CONSUMABLE || item.slot === ItemSlot.MATERIAL;
  }

  private isAvailableForPurchase(item: VendorItemRecord) {
    return item.slot === ItemSlot.CONSUMABLE && item.isTradable !== false;
  }

  private normalizeQuantity(
    requestedQuantity: number | undefined,
    stackable: boolean,
    availableQuantity?: number,
  ) {
    const quantity = stackable ? (requestedQuantity ?? 1) : 1;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantidade invalida.');
    }

    if (availableQuantity !== undefined && quantity > availableQuantity) {
      throw new BadRequestException('Quantidade maior que a disponivel.');
    }

    return quantity;
  }

  private calculateBuyPrice(item: VendorItemRecord) {
    const fixedPotionPrice = VENDOR_FIXED_BUY_PRICE_BY_NAME[item.name];

    if (fixedPotionPrice) {
      return fixedPotionPrice;
    }

    const tier = Math.max(1, item.tier);
    const rarityMultiplier = this.getRarityMultiplier(item.rarity);

    if (item.slot === ItemSlot.CONSUMABLE) {
      const healValue = item.healFlat + item.healPercent * 8;
      return Math.max(8, Math.ceil((18 * tier + healValue) * rarityMultiplier));
    }

    if (item.slot === ItemSlot.MATERIAL) {
      const base = item.materialOrigin === 'DROP_MOBS' ? 26 : 14;
      return Math.max(3, Math.ceil(base * tier * rarityMultiplier));
    }

    return 0;
  }

  private getRarityMultiplier(rarity: Rarity) {
    switch (rarity) {
      case Rarity.UNCOMMON:
        return 1.8;
      case Rarity.RARE:
        return 3.1;
      case Rarity.EPIC:
        return 5.4;
      case Rarity.LEGENDARY:
        return 9;
      case Rarity.COMMON:
      default:
        return 1;
    }
  }

  private getItemEffects(item: VendorItemRecord) {
    const effects: Array<{ key: string; label: string; value: number }> = [];

    const pushEffect = (key: string, label: string, value: number) => {
      if (value > 0) {
        effects.push({ key, label, value });
      }
    };

    pushEffect('strength', 'Forca', item.strengthBonus);
    pushEffect('vitality', 'Vitalidade', item.vitalityBonus);
    pushEffect('agility', 'Agilidade', item.agilityBonus);
    pushEffect('precision', 'Precisao', item.precisionBonus);
    pushEffect('technique', 'Tecnica', item.techniqueBonus);
    pushEffect('willpower', 'Vontade', item.willpowerBonus);
    pushEffect('healFlat', 'Cura fixa', item.healFlat);
    pushEffect('healPercent', 'Cura percentual', item.healPercent);

    return effects;
  }
}
