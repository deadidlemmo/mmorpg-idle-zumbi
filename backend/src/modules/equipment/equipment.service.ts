import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItemType, ItemSlot } from '@prisma/client';
import { calculateFullStats } from '../../common/utils/stats.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EquipItemDto } from './dto/equip-item.dto';

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCharacter(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
      },
      include: {
        class: true,
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const equipmentItems = this.getEquipmentItems(character);

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
    );

    return {
      character: {
        id: character.id,
        name: character.name,
        class: character.class.name,
        level: character.level,
        xp: character.xp,
        currentHp: character.currentHp,
        maxHp: stats.derivedCombatStats.maxHp,
      },
      equipment: character.equipment,
      stats: this.buildStatsResponse(stats),
    };
  }

  async equip(userId: string, equipItemDto: EquipItemDto) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: equipItemDto.characterId,
        userId,
      },
      include: {
        class: true,
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const inventoryItem = await this.prisma.inventoryItem.findFirst({
      where: {
        characterId: character.id,
        itemId: equipItemDto.itemId,
      },
      include: {
        item: {
          include: {
            class: true,
          },
        },
      },
    });

    if (!inventoryItem) {
      throw new NotFoundException('Item não encontrado no inventário.');
    }

    if (inventoryItem.quantity <= 0) {
      throw new BadRequestException('Quantidade insuficiente do item.');
    }

    if (inventoryItem.type !== InventoryItemType.EQUIPMENT) {
      throw new BadRequestException('Este item não é um equipamento.');
    }

    const item = inventoryItem.item;

    if (item.classId && item.classId !== character.classId) {
      throw new BadRequestException(
        `Este item pertence à classe ${item.class?.name}.`,
      );
    }

    const oldEquipmentItems = this.getEquipmentItems(character);

    const oldStats = calculateFullStats(
      character.class,
      oldEquipmentItems,
      character.level,
    );

    const oldMaxHp = oldStats.derivedCombatStats.maxHp;

    const oldCurrentHp = this.clampHp(
      character.currentHp ?? oldMaxHp,
      oldMaxHp,
    );

    const updateData = this.getEquipmentUpdateData(item.slot, item.id);

    const equipment = await this.prisma.equipment.upsert({
      where: {
        characterId: character.id,
      },
      create: {
        characterId: character.id,
        ...updateData,
      },
      update: updateData,
      include: {
        mainHand: true,
        offHand: true,
        head: true,
        armor: true,
        pants: true,
        boots: true,
      },
    });

    const newEquipmentItems = this.getEquipmentItemsFromEquipment(equipment);

    const newStats = calculateFullStats(
      character.class,
      newEquipmentItems,
      character.level,
    );

    const newMaxHp = newStats.derivedCombatStats.maxHp;

    const newCurrentHp = this.calculateCurrentHpAfterEquipmentChange({
      oldCurrentHp,
      oldMaxHp,
      newMaxHp,
    });

    await this.prisma.character.update({
      where: {
        id: character.id,
      },
      data: {
        maxHp: newMaxHp,
        currentHp: newCurrentHp,
      },
    });

    return {
      message: `${item.name} equipado com sucesso.`,

      equippedItem: {
        id: item.id,
        name: item.name,
        slot: item.slot,
        rarity: item.rarity,
        tier: item.tier,
        family: item.family,

        strengthBonus: item.strengthBonus,
        vitalityBonus: item.vitalityBonus,
        agilityBonus: item.agilityBonus,
        precisionBonus: item.precisionBonus,
        techniqueBonus: item.techniqueBonus,
        willpowerBonus: item.willpowerBonus,
      },

      hpChange: {
        oldCurrentHp,
        oldMaxHp,
        newCurrentHp,
        newMaxHp,
        maxHpDifference: newMaxHp - oldMaxHp,
        currentHpDifference: newCurrentHp - oldCurrentHp,
      },

      equipment,

      stats: this.buildStatsResponse(newStats),
    };
  }

  private getEquipmentItems(character: any) {
    return [
      character.equipment?.mainHand,
      character.equipment?.offHand,
      character.equipment?.head,
      character.equipment?.armor,
      character.equipment?.pants,
      character.equipment?.boots,
    ];
  }

  private getEquipmentItemsFromEquipment(equipment: any) {
    return [
      equipment.mainHand,
      equipment.offHand,
      equipment.head,
      equipment.armor,
      equipment.pants,
      equipment.boots,
    ];
  }

  private buildStatsResponse(stats: ReturnType<typeof calculateFullStats>) {
    return {
      level: stats.level,
      basePrimaryStats: stats.basePrimaryStats,
      levelBonusStats: stats.levelBonusStats,
      equipmentBonusStats: stats.equipmentBonusStats,
      totalPrimaryStats: stats.totalPrimaryStats,
      derivedCombatStats: stats.derivedCombatStats,
    };
  }

  private clampHp(currentHp: number, maxHp: number) {
    return Math.max(0, Math.min(currentHp, maxHp));
  }

  private calculateCurrentHpAfterEquipmentChange(params: {
    oldCurrentHp: number;
    oldMaxHp: number;
    newMaxHp: number;
  }) {
    const { oldCurrentHp, oldMaxHp, newMaxHp } = params;

    if (oldCurrentHp <= 0) {
      return 0;
    }

    const maxHpDifference = newMaxHp - oldMaxHp;

    if (maxHpDifference > 0) {
      return this.clampHp(oldCurrentHp + maxHpDifference, newMaxHp);
    }

    return this.clampHp(oldCurrentHp, newMaxHp);
  }

  private getEquipmentUpdateData(slot: ItemSlot, itemId: string) {
    switch (slot) {
      case ItemSlot.MAIN_HAND:
        return { mainHandId: itemId };

      case ItemSlot.OFF_HAND:
        return { offHandId: itemId };

      case ItemSlot.HEAD:
        return { headId: itemId };

      case ItemSlot.ARMOR:
        return { armorId: itemId };

      case ItemSlot.PANTS:
        return { pantsId: itemId };

      case ItemSlot.BOOTS:
        return { bootsId: itemId };

      default:
        throw new BadRequestException(
          'Este tipo de item não pode ser equipado.',
        );
    }
  }
}