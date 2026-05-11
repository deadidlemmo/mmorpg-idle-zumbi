import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
          include: {
            item: {
              include: {
                class: true,
                map: true,
              },
            },
          },
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

      items: character.inventoryItems.map((inventoryItem) => ({
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
      })),
    };
  }
}