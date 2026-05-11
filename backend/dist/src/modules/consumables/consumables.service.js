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
exports.ConsumablesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const stats_util_1 = require("../../common/utils/stats.util");
const prisma_service_1 = require("../../prisma/prisma.service");
let ConsumablesService = class ConsumablesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async use(userId, useConsumableDto) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: useConsumableDto.characterId,
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
        if (!character.class) {
            throw new common_1.BadRequestException('Classe do personagem não encontrada. Não foi possível calcular o HP máximo.');
        }
        const activeAutoCombatSession = await this.prisma.autoCombatSession.findFirst({
            where: {
                characterId: character.id,
                status: client_1.AutoCombatSessionStatus.ACTIVE,
            },
        });
        if (activeAutoCombatSession) {
            throw new common_1.BadRequestException('Não é possível usar consumível manualmente durante uma sessão de auto-combate ativa.');
        }
        const inventoryItem = await this.prisma.inventoryItem.findUnique({
            where: {
                characterId_itemId: {
                    characterId: character.id,
                    itemId: useConsumableDto.itemId,
                },
            },
            include: {
                item: true,
            },
        });
        if (!inventoryItem) {
            throw new common_1.NotFoundException('Consumível não encontrado no inventário.');
        }
        if (inventoryItem.quantity <= 0) {
            throw new common_1.BadRequestException('Quantidade insuficiente do consumível.');
        }
        if (inventoryItem.type !== client_1.InventoryItemType.CONSUMABLE ||
            inventoryItem.item.slot !== client_1.ItemSlot.CONSUMABLE) {
            throw new common_1.BadRequestException('Este item não é um consumível.');
        }
        const item = inventoryItem.item;
        if (item.usableOutOfCombat !== true) {
            throw new common_1.BadRequestException('Este consumível não pode ser usado fora de combate.');
        }
        if (!this.hasHealingEffect(item)) {
            throw new common_1.BadRequestException('Este consumível não possui efeito de cura.');
        }
        const equipmentItems = this.getEquipmentItems(character);
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
        const maxHp = Math.max(1, this.toSafeNumber(stats?.derivedCombatStats?.maxHp, character.maxHp ?? 1));
        const currentHp = character.currentHp === null || character.currentHp === undefined
            ? maxHp
            : this.clampHp(character.currentHp, maxHp);
        if (currentHp <= 0) {
            throw new common_1.BadRequestException('Este personagem está sem HP. Use a enfermaria para recuperar personagens derrotados.');
        }
        if (currentHp >= maxHp) {
            throw new common_1.BadRequestException('O personagem já está com HP cheio.');
        }
        const healAmount = this.calculateHealAmount({
            maxHp,
            healFlat: this.toSafeNumber(item.healFlat, 0),
            healPercent: this.toSafeNumber(item.healPercent, 0),
        });
        if (healAmount <= 0) {
            throw new common_1.BadRequestException('Este consumível não recupera HP suficiente.');
        }
        const newCurrentHp = Math.min(maxHp, currentHp + healAmount);
        const effectiveHeal = newCurrentHp - currentHp;
        await this.prisma.$transaction(async (tx) => {
            await tx.character.update({
                where: {
                    id: character.id,
                },
                data: {
                    currentHp: newCurrentHp,
                    maxHp,
                },
            });
            if (inventoryItem.quantity <= 1) {
                await tx.inventoryItem.delete({
                    where: {
                        id: inventoryItem.id,
                    },
                });
            }
            else {
                await tx.inventoryItem.update({
                    where: {
                        id: inventoryItem.id,
                    },
                    data: {
                        quantity: {
                            decrement: 1,
                        },
                    },
                });
            }
        });
        return {
            message: `${item.name} usado com sucesso.`,
            character: {
                id: character.id,
                name: character.name,
                level: character.level,
                oldHp: currentHp,
                newHp: newCurrentHp,
                maxHp,
            },
            consumable: this.mapPotionItem(item, Math.max(0, inventoryItem.quantity - 1)),
            healing: {
                calculatedHeal: healAmount,
                effectiveHeal,
                wastedHeal: healAmount - effectiveHeal,
            },
            inventory: {
                previousQuantity: inventoryItem.quantity,
                newQuantity: Math.max(0, inventoryItem.quantity - 1),
            },
        };
    }
    async getPotionConfig(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const config = await this.prisma.characterPotionConfig.upsert({
            where: {
                characterId: character.id,
            },
            create: {
                characterId: character.id,
                enabled: false,
                potionItemId: null,
                hpThresholdPercent: 35,
                useInManualCombat: true,
                useInAutoCombat: true,
            },
            update: {},
            include: {
                potionItem: true,
            },
        });
        const availableQuantity = await this.getPotionInventoryQuantity(character.id, config.potionItemId);
        const availablePotions = await this.getAvailablePotions(character.id);
        return this.buildPotionConfigResponse({
            character,
            config,
            availableQuantity,
            availablePotions,
        });
    }
    async updatePotionConfig(userId, characterId, updatePotionConfigDto) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const existingConfig = await this.prisma.characterPotionConfig.findUnique({
            where: {
                characterId: character.id,
            },
        });
        const nextEnabled = updatePotionConfigDto.enabled ?? existingConfig?.enabled ?? false;
        const nextPotionItemId = updatePotionConfigDto.potionItemId !== undefined
            ? updatePotionConfigDto.potionItemId
            : existingConfig?.potionItemId ?? null;
        const nextHpThresholdPercent = updatePotionConfigDto.hpThresholdPercent ??
            existingConfig?.hpThresholdPercent ??
            35;
        const nextUseInManualCombat = updatePotionConfigDto.useInManualCombat ??
            existingConfig?.useInManualCombat ??
            true;
        const nextUseInAutoCombat = updatePotionConfigDto.useInAutoCombat ??
            existingConfig?.useInAutoCombat ??
            true;
        if (nextHpThresholdPercent < 1 ||
            nextHpThresholdPercent > 100 ||
            !Number.isInteger(nextHpThresholdPercent)) {
            throw new common_1.BadRequestException('O percentual de HP deve ser um número inteiro entre 1 e 100.');
        }
        if (nextEnabled && !nextPotionItemId) {
            throw new common_1.BadRequestException('Para ativar o uso automático, selecione uma poção.');
        }
        if (nextEnabled && !nextUseInManualCombat && !nextUseInAutoCombat) {
            throw new common_1.BadRequestException('Para ativar o uso automático, permita uso em combate manual, auto-combate ou ambos.');
        }
        if (nextPotionItemId) {
            const potionItem = await this.prisma.item.findUnique({
                where: {
                    id: nextPotionItemId,
                },
            });
            if (!potionItem) {
                throw new common_1.NotFoundException('Poção selecionada não encontrada.');
            }
            if (potionItem.slot !== client_1.ItemSlot.CONSUMABLE) {
                throw new common_1.BadRequestException('O item selecionado não é um consumível.');
            }
            if (!this.hasHealingEffect(potionItem)) {
                throw new common_1.BadRequestException('O consumível selecionado não possui efeito de cura.');
            }
            if ((nextUseInManualCombat || nextUseInAutoCombat) &&
                potionItem.usableInCombat !== true) {
                throw new common_1.BadRequestException('Este consumível não pode ser usado em combate.');
            }
            if (nextEnabled) {
                const inventoryItem = await this.prisma.inventoryItem.findUnique({
                    where: {
                        characterId_itemId: {
                            characterId: character.id,
                            itemId: nextPotionItemId,
                        },
                    },
                });
                if (!inventoryItem || inventoryItem.quantity <= 0) {
                    throw new common_1.BadRequestException('O personagem não possui esta poção no inventário.');
                }
                if (inventoryItem.type !== client_1.InventoryItemType.CONSUMABLE) {
                    throw new common_1.BadRequestException('O item selecionado no inventário não está registrado como consumível.');
                }
            }
        }
        const config = await this.prisma.characterPotionConfig.upsert({
            where: {
                characterId: character.id,
            },
            create: {
                characterId: character.id,
                enabled: nextEnabled,
                potionItemId: nextPotionItemId,
                hpThresholdPercent: nextHpThresholdPercent,
                useInManualCombat: nextUseInManualCombat,
                useInAutoCombat: nextUseInAutoCombat,
            },
            update: {
                enabled: nextEnabled,
                potionItemId: nextPotionItemId,
                hpThresholdPercent: nextHpThresholdPercent,
                useInManualCombat: nextUseInManualCombat,
                useInAutoCombat: nextUseInAutoCombat,
            },
            include: {
                potionItem: true,
            },
        });
        const availableQuantity = await this.getPotionInventoryQuantity(character.id, config.potionItemId);
        const availablePotions = await this.getAvailablePotions(character.id);
        return {
            message: 'Configuração de poção automática atualizada com sucesso.',
            ...this.buildPotionConfigResponse({
                character,
                config,
                availableQuantity,
                availablePotions,
            }),
        };
    }
    async getPotionInventoryQuantity(characterId, potionItemId) {
        if (!potionItemId) {
            return 0;
        }
        const inventoryItem = await this.prisma.inventoryItem.findUnique({
            where: {
                characterId_itemId: {
                    characterId,
                    itemId: potionItemId,
                },
            },
        });
        return inventoryItem?.quantity ?? 0;
    }
    async getAvailablePotions(characterId) {
        const inventoryItems = await this.prisma.inventoryItem.findMany({
            where: {
                characterId,
                type: client_1.InventoryItemType.CONSUMABLE,
                quantity: {
                    gt: 0,
                },
            },
            include: {
                item: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        return inventoryItems
            .filter((inventoryItem) => {
            return (inventoryItem.item.slot === client_1.ItemSlot.CONSUMABLE &&
                this.hasHealingEffect(inventoryItem.item));
        })
            .sort((a, b) => {
            return (a.item.tier - b.item.tier ||
                a.item.name.localeCompare(b.item.name));
        })
            .map((inventoryItem) => {
            return this.mapPotionItem(inventoryItem.item, inventoryItem.quantity);
        });
    }
    buildPotionConfigResponse(params) {
        const { character, config, availableQuantity, availablePotions } = params;
        const potion = config.potionItem
            ? this.mapPotionItem(config.potionItem, availableQuantity)
            : null;
        const hasPotion = Boolean(potion);
        const hasPotionInInventory = availableQuantity > 0;
        const canAutoUseInManualCombat = config.enabled &&
            config.useInManualCombat &&
            hasPotion &&
            hasPotionInInventory &&
            potion?.slot === client_1.ItemSlot.CONSUMABLE &&
            potion?.usableInCombat === true;
        const canAutoUseInAutoCombat = config.enabled &&
            config.useInAutoCombat &&
            hasPotion &&
            hasPotionInInventory &&
            potion?.slot === client_1.ItemSlot.CONSUMABLE &&
            potion?.usableInCombat === true;
        const flatConfig = {
            id: config.id,
            characterId: config.characterId,
            enabled: config.enabled,
            potionItemId: config.potionItemId,
            hpThresholdPercent: config.hpThresholdPercent,
            useInManualCombat: config.useInManualCombat,
            useInAutoCombat: config.useInAutoCombat,
            potion,
            potionItem: potion,
        };
        return {
            character: {
                id: character.id,
                name: character.name,
            },
            ...flatConfig,
            config: {
                id: config.id,
                characterId: config.characterId,
                enabled: config.enabled,
                potionItemId: config.potionItemId,
                hpThresholdPercent: config.hpThresholdPercent,
                useInManualCombat: config.useInManualCombat,
                useInAutoCombat: config.useInAutoCombat,
            },
            potion,
            potionItem: potion,
            potionConfigs: [flatConfig],
            availablePotions,
            summary: {
                hasPotion,
                hasPotionInInventory,
                availableQuantity,
                canAutoUseInManualCombat,
                canAutoUseInAutoCombat,
                canAutoUse: canAutoUseInManualCombat || canAutoUseInAutoCombat,
                triggerText: config.enabled
                    ? `Usar automaticamente quando HP estiver em ${config.hpThresholdPercent}% ou menos.`
                    : 'Uso automático desativado.',
            },
        };
    }
    mapPotionItem(item, availableQuantity = 0) {
        return {
            id: item.id,
            name: item.name,
            description: item.description,
            rarity: item.rarity,
            tier: item.tier,
            slot: item.slot,
            family: item.family,
            healFlat: this.toSafeNumber(item.healFlat, 0),
            healPercent: this.toSafeNumber(item.healPercent, 0),
            usableInCombat: item.usableInCombat,
            usableOutOfCombat: item.usableOutOfCombat,
            minTier: item.minTier,
            maxTier: item.maxTier,
            availableQuantity,
        };
    }
    hasHealingEffect(item) {
        return (this.toSafeNumber(item.healFlat, 0) > 0 ||
            this.toSafeNumber(item.healPercent, 0) > 0);
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
    calculateHealAmount(params) {
        const percentHeal = Math.floor((params.maxHp * params.healPercent) / 100);
        return params.healFlat + percentHeal;
    }
    clampHp(currentHp, maxHp) {
        return Math.max(0, Math.min(currentHp, maxHp));
    }
    toSafeNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === '') {
            return fallback;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
};
exports.ConsumablesService = ConsumablesService;
exports.ConsumablesService = ConsumablesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ConsumablesService);
//# sourceMappingURL=consumables.service.js.map