"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EquipmentService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const stats_util_1 = require("../../common/utils/stats.util");
const prisma_service_1 = require("../../prisma/prisma.service");
let EquipmentService = class EquipmentService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findByCharacter(userId, characterId) {
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
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const equipmentItems = this.getEquipmentItems(character);
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
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
    async equip(userId, equipItemDto) {
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
            throw new common_1.NotFoundException('Personagem não encontrado.');
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
            throw new common_1.NotFoundException('Item não encontrado no inventário.');
        }
        if (inventoryItem.quantity <= 0) {
            throw new common_1.BadRequestException('Quantidade insuficiente do item.');
        }
        if (inventoryItem.type !== client_1.InventoryItemType.EQUIPMENT) {
            throw new common_1.BadRequestException('Este item não é um equipamento.');
        }
        const item = inventoryItem.item;
        if (item.classId && item.classId !== character.classId) {
            throw new common_1.BadRequestException(`Este item pertence à classe ${item.class?.name}.`);
        }
        const oldEquipmentItems = this.getEquipmentItems(character);
        const oldStats = (0, stats_util_1.calculateFullStats)(character.class, oldEquipmentItems, character.level);
        const oldMaxHp = oldStats.derivedCombatStats.maxHp;
        const oldCurrentHp = this.clampHp(character.currentHp ?? oldMaxHp, oldMaxHp);
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
        const newStats = (0, stats_util_1.calculateFullStats)(character.class, newEquipmentItems, character.level);
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
    getEquipmentItems(character) {
        return [
            character.equipment?.mainHand,
            character.equipment?.offHand,
            character.equipment?.head,
            character.equipment?.armor,
            character.equipment?.pants,
            character.equipment?.boots,
        ];
    }
    getEquipmentItemsFromEquipment(equipment) {
        return [
            equipment.mainHand,
            equipment.offHand,
            equipment.head,
            equipment.armor,
            equipment.pants,
            equipment.boots,
        ];
    }
    buildStatsResponse(stats) {
        return {
            level: stats.level,
            basePrimaryStats: stats.basePrimaryStats,
            levelBonusStats: stats.levelBonusStats,
            equipmentBonusStats: stats.equipmentBonusStats,
            totalPrimaryStats: stats.totalPrimaryStats,
            derivedCombatStats: stats.derivedCombatStats,
        };
    }
    clampHp(currentHp, maxHp) {
        return Math.max(0, Math.min(currentHp, maxHp));
    }
    calculateCurrentHpAfterEquipmentChange(params) {
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
    getEquipmentUpdateData(slot, itemId) {
        switch (slot) {
            case client_1.ItemSlot.MAIN_HAND:
                return { mainHandId: itemId };
            case client_1.ItemSlot.OFF_HAND:
                return { offHandId: itemId };
            case client_1.ItemSlot.HEAD:
                return { headId: itemId };
            case client_1.ItemSlot.ARMOR:
                return { armorId: itemId };
            case client_1.ItemSlot.PANTS:
                return { pantsId: itemId };
            case client_1.ItemSlot.BOOTS:
                return { bootsId: itemId };
            default:
                throw new common_1.BadRequestException('Este tipo de item não pode ser equipado.');
        }
    }
};
exports.EquipmentService = EquipmentService;
exports.EquipmentService = EquipmentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EquipmentService);
//# sourceMappingURL=equipment.service.js.map