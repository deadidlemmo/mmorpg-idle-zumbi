import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItemType, ItemSlot, Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import {
  PRODUCT_EVENT_ACTIONS,
  PRODUCT_MILESTONE_KEYS,
} from '../../common/audit/product-events.constants';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
} from '../../common/utils/stats.util';
import { tryConsumeInventoryStack } from '../../common/inventory/inventory-stack.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EquipItemDto } from './dto/equip-item.dto';
import { UnequipItemDto } from './dto/unequip-item.dto';

type EquipmentItemForStats = {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: string | null;
  tier: number | null;
  family: string | null;
  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;
};

type EquipmentSetForStats = {
  mainHand?: EquipmentItemForStats | null;
  offHand?: EquipmentItemForStats | null;
  head?: EquipmentItemForStats | null;
  armor?: EquipmentItemForStats | null;
  pants?: EquipmentItemForStats | null;
  boots?: EquipmentItemForStats | null;
};

type CharacterEquipmentContainer = {
  equipment?: EquipmentSetForStats | null;
};

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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
        gatheringSkills: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const equipmentItems = this.getEquipmentItems(character);
    const gatheringBonus = calculateGatheringPrimaryBonus(
      character.gatheringSkills,
    );

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringBonus,
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
    const result = await this.prisma.$transaction(async (tx) => {
      const character = await this.lockAndLoadCharacter(
        tx,
        userId,
        equipItemDto.characterId,
      );
      const inventoryItem = await tx.inventoryItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: equipItemDto.itemId,
          },
        },
        include: {
          item: {
            include: {
              class: true,
              map: true,
            },
          },
        },
      });

      if (!inventoryItem) {
        throw new NotFoundException('Item não encontrado no inventário.');
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
      if (item.map?.minLevel && character.level < item.map.minLevel) {
        throw new BadRequestException(
          `Este item exige nível ${item.map.minLevel}.`,
        );
      }

      const gatheringBonus = calculateGatheringPrimaryBonus(
        character.gatheringSkills,
      );
      const oldStats = calculateFullStats(
        character.class,
        this.getEquipmentItems(character),
        character.level,
        gatheringBonus,
      );
      const oldMaxHp = oldStats.derivedCombatStats.maxHp;
      const oldCurrentHp = this.clampHp(
        character.currentHp ?? oldMaxHp,
        oldMaxHp,
      );
      const currentlyEquippedItem = this.getEquippedItemBySlot(
        character.equipment ?? {},
        item.slot,
      );

      if (currentlyEquippedItem?.id === item.id) {
        throw new BadRequestException('Este item já está equipado.');
      }

      const remaining = await tryConsumeInventoryStack(tx, {
        characterId: character.id,
        itemId: item.id,
        quantity: 1,
      });
      if (remaining === null) {
        throw new BadRequestException('Quantidade insuficiente do item.');
      }

      const updateData = this.getEquipmentUpdateData(item.slot, item.id);
      const equipment = await tx.equipment.upsert({
        where: { characterId: character.id },
        create: { characterId: character.id, ...updateData },
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

      if (currentlyEquippedItem) {
        await this.incrementInventoryItem(tx, {
          characterId: character.id,
          itemId: currentlyEquippedItem.id,
          type: InventoryItemType.EQUIPMENT,
        });
      }

      const newEquipmentItems = this.getEquipmentItemsFromEquipment(equipment);
      const newStats = calculateFullStats(
        character.class,
        newEquipmentItems,
        character.level,
        gatheringBonus,
      );
      const newMaxHp = newStats.derivedCombatStats.maxHp;
      const newCurrentHp = this.calculateCurrentHpAfterEquipmentChange({
        oldCurrentHp,
        oldMaxHp,
        newMaxHp,
      });

      await tx.character.update({
        where: { id: character.id },
        data: { maxHp: newMaxHp, currentHp: newCurrentHp },
      });

      return {
        character,
        equipment,
        item,
        newEquipmentItems,
        newStats,
        oldCurrentHp,
        oldMaxHp,
        newCurrentHp,
        newMaxHp,
      };
    });
    const {
      character,
      equipment,
      item,
      newEquipmentItems,
      newStats,
      oldCurrentHp,
      oldMaxHp,
      newCurrentHp,
      newMaxHp,
    } = result;

    const equippedT1Slots = newEquipmentItems.filter(
      (equippedItem) => (equippedItem?.tier ?? 0) >= 1,
    ).length;

    if (item.tier === 1) {
      this.auditService.recordMilestoneSafely({
        actorUserId: userId,
        action: PRODUCT_EVENT_ACTIONS.FIRST_T1_EQUIPPED,
        entityType: 'Character',
        entityId: character.id,
        deduplicationKey: PRODUCT_MILESTONE_KEYS.firstT1Equipped(character.id),
        metadata: {
          itemId: item.id,
          itemName: item.name,
          slot: item.slot,
        },
      });
    }

    if (equippedT1Slots === 6) {
      this.auditService.recordMilestoneSafely({
        actorUserId: userId,
        action: PRODUCT_EVENT_ACTIONS.FIRST_T1_SET_COMPLETED,
        entityType: 'Character',
        entityId: character.id,
        deduplicationKey: PRODUCT_MILESTONE_KEYS.firstT1SetCompleted(
          character.id,
        ),
        metadata: { equippedT1Slots },
      });
    }

    return {
      message: `${item.name} equipado com sucesso.`,

      equippedItem: {
        id: item.id,
        name: item.name,
        slot: item.slot,
        rarity: item.rarity,
        tier: item.tier,
        family: item.family,
        baseItemId: item.baseItemId,
        enhancementLevel: item.enhancementLevel,

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

  async unequip(userId: string, unequipItemDto: UnequipItemDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const character = await this.lockAndLoadCharacter(
        tx,
        userId,
        unequipItemDto.characterId,
      );

      if (!character.equipment) {
        throw new BadRequestException('Nenhum equipamento encontrado.');
      }

      const equippedItem = this.getEquippedItemBySlot(
        character.equipment,
        unequipItemDto.slot,
      );
      if (!equippedItem) {
        throw new BadRequestException('Nenhum item equipado neste slot.');
      }

      const gatheringBonus = calculateGatheringPrimaryBonus(
        character.gatheringSkills,
      );
      const oldStats = calculateFullStats(
        character.class,
        this.getEquipmentItems(character),
        character.level,
        gatheringBonus,
      );
      const oldMaxHp = oldStats.derivedCombatStats.maxHp;
      const oldCurrentHp = this.clampHp(
        character.currentHp ?? oldMaxHp,
        oldMaxHp,
      );
      const equipment = await tx.equipment.update({
        where: { characterId: character.id },
        data: this.getEquipmentClearData(unequipItemDto.slot),
        include: {
          mainHand: true,
          offHand: true,
          head: true,
          armor: true,
          pants: true,
          boots: true,
        },
      });

      await this.incrementInventoryItem(tx, {
        characterId: character.id,
        itemId: equippedItem.id,
        type: InventoryItemType.EQUIPMENT,
      });

      const newEquipmentItems = this.getEquipmentItemsFromEquipment(equipment);
      const newStats = calculateFullStats(
        character.class,
        newEquipmentItems,
        character.level,
        gatheringBonus,
      );
      const newMaxHp = newStats.derivedCombatStats.maxHp;
      const newCurrentHp = this.calculateCurrentHpAfterEquipmentChange({
        oldCurrentHp,
        oldMaxHp,
        newMaxHp,
      });

      await tx.character.update({
        where: { id: character.id },
        data: { maxHp: newMaxHp, currentHp: newCurrentHp },
      });

      return {
        equipment,
        equippedItem,
        newStats,
        oldCurrentHp,
        oldMaxHp,
        newCurrentHp,
        newMaxHp,
      };
    });
    const {
      equipment,
      equippedItem,
      newStats,
      oldCurrentHp,
      oldMaxHp,
      newCurrentHp,
      newMaxHp,
    } = result;

    return {
      message: `${equippedItem.name} desequipado com sucesso.`,

      unequippedItem: {
        id: equippedItem.id,
        name: equippedItem.name,
        slot: equippedItem.slot,
        rarity: equippedItem.rarity,
        tier: equippedItem.tier,
        family: equippedItem.family,
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

  private async lockAndLoadCharacter(
    tx: Prisma.TransactionClient,
    userId: string,
    characterId: string,
  ) {
    const locked = await tx.character.updateMany({
      where: { id: characterId, userId },
      data: { updatedAt: new Date() },
    });
    if (locked.count !== 1) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    return tx.character.findUniqueOrThrow({
      where: { id: characterId },
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
        gatheringSkills: true,
      },
    });
  }

  private getEquipmentItems(character: CharacterEquipmentContainer) {
    return [
      character.equipment?.mainHand,
      character.equipment?.offHand,
      character.equipment?.head,
      character.equipment?.armor,
      character.equipment?.pants,
      character.equipment?.boots,
    ];
  }

  private getEquipmentItemsFromEquipment(equipment: EquipmentSetForStats) {
    return [
      equipment.mainHand,
      equipment.offHand,
      equipment.head,
      equipment.armor,
      equipment.pants,
      equipment.boots,
    ];
  }

  private async incrementInventoryItem(
    tx: Prisma.TransactionClient,
    params: {
      characterId: string;
      itemId: string;
      type: InventoryItemType;
    },
  ) {
    await tx.inventoryItem.upsert({
      where: {
        characterId_itemId: {
          characterId: params.characterId,
          itemId: params.itemId,
        },
      },
      create: {
        characterId: params.characterId,
        itemId: params.itemId,
        quantity: 1,
        type: params.type,
      },
      update: {
        quantity: {
          increment: 1,
        },
        type: params.type,
      },
    });
  }

  private getEquippedItemBySlot(
    equipment: EquipmentSetForStats,
    slot: ItemSlot,
  ) {
    switch (slot) {
      case ItemSlot.MAIN_HAND:
        return equipment.mainHand;

      case ItemSlot.OFF_HAND:
        return equipment.offHand;

      case ItemSlot.HEAD:
        return equipment.head;

      case ItemSlot.ARMOR:
        return equipment.armor;

      case ItemSlot.PANTS:
        return equipment.pants;

      case ItemSlot.BOOTS:
        return equipment.boots;

      default:
        throw new BadRequestException(
          'Este tipo de item nÃ£o pode ser desequipado.',
        );
    }
  }

  private buildStatsResponse(stats: ReturnType<typeof calculateFullStats>) {
    return {
      level: stats.level,
      basePrimaryStats: stats.basePrimaryStats,
      levelBonusStats: stats.levelBonusStats,
      equipmentBonusStats: stats.equipmentBonusStats,
      gatheringBonusStats: stats.gatheringBonusStats,
      totalPrimaryStats: stats.totalPrimaryStats,
      derivedCombatStats: stats.derivedCombatStats,
      equipmentProgression: stats.equipmentProgression,
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

  private getEquipmentClearData(slot: ItemSlot) {
    switch (slot) {
      case ItemSlot.MAIN_HAND:
        return { mainHandId: null };

      case ItemSlot.OFF_HAND:
        return { offHandId: null };

      case ItemSlot.HEAD:
        return { headId: null };

      case ItemSlot.ARMOR:
        return { armorId: null };

      case ItemSlot.PANTS:
        return { pantsId: null };

      case ItemSlot.BOOTS:
        return { bootsId: null };

      default:
        throw new BadRequestException(
          'Este tipo de item nÃ£o pode ser desequipado.',
        );
    }
  }
}
