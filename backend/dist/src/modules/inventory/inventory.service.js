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
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let InventoryService = class InventoryService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findByCharacter(userId, characterId) {
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
            throw new common_1.NotFoundException('Personagem não encontrado.');
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
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map