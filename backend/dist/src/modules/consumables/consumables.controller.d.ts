import { ConsumablesService } from './consumables.service';
import { UpdatePotionConfigDto } from './dto/update-potion-config.dto';
import { UseConsumableDto } from './dto/use-consumable.dto';
type AuthenticatedRequest = {
    user?: {
        id?: string;
        userId?: string;
        sub?: string;
    };
};
export declare class ConsumablesController {
    private readonly consumablesService;
    constructor(consumablesService: ConsumablesService);
    private getUserId;
    use(request: AuthenticatedRequest, useConsumableDto: UseConsumableDto): Promise<{
        message: string;
        character: {
            id: string;
            name: string;
            level: number;
            oldHp: number;
            newHp: number;
            maxHp: number;
        };
        consumable: {
            id: string;
            name: string;
            description: string | null;
            rarity: import("@prisma/client").$Enums.Rarity;
            tier: number;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            healFlat: number;
            healPercent: number;
            usableInCombat: boolean;
            usableOutOfCombat: boolean;
            minTier: number | null;
            maxTier: number | null;
            availableQuantity: number;
        };
        healing: {
            calculatedHeal: number;
            effectiveHeal: number;
            wastedHeal: number;
        };
        inventory: {
            previousQuantity: number;
            newQuantity: number;
        };
    }>;
    getPotionConfig(request: AuthenticatedRequest, characterId: string): Promise<{
        config: {
            id: string;
            characterId: string;
            enabled: boolean;
            potionItemId: string | null;
            hpThresholdPercent: number;
            useInManualCombat: boolean;
            useInAutoCombat: boolean;
        };
        potion: {
            id: string;
            name: string;
            description: string | null;
            rarity: import("@prisma/client").$Enums.Rarity;
            tier: number;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            healFlat: number;
            healPercent: number;
            usableInCombat: boolean;
            usableOutOfCombat: boolean;
            minTier: number | null;
            maxTier: number | null;
            availableQuantity: number;
        } | null;
        potionItem: {
            id: string;
            name: string;
            description: string | null;
            rarity: import("@prisma/client").$Enums.Rarity;
            tier: number;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            healFlat: number;
            healPercent: number;
            usableInCombat: boolean;
            usableOutOfCombat: boolean;
            minTier: number | null;
            maxTier: number | null;
            availableQuantity: number;
        } | null;
        potionConfigs: {
            id: string;
            characterId: string;
            enabled: boolean;
            potionItemId: string | null;
            hpThresholdPercent: number;
            useInManualCombat: boolean;
            useInAutoCombat: boolean;
            potion: {
                id: string;
                name: string;
                description: string | null;
                rarity: import("@prisma/client").$Enums.Rarity;
                tier: number;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                healFlat: number;
                healPercent: number;
                usableInCombat: boolean;
                usableOutOfCombat: boolean;
                minTier: number | null;
                maxTier: number | null;
                availableQuantity: number;
            } | null;
            potionItem: {
                id: string;
                name: string;
                description: string | null;
                rarity: import("@prisma/client").$Enums.Rarity;
                tier: number;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                healFlat: number;
                healPercent: number;
                usableInCombat: boolean;
                usableOutOfCombat: boolean;
                minTier: number | null;
                maxTier: number | null;
                availableQuantity: number;
            } | null;
        }[];
        availablePotions: {
            id: string;
            name: string;
            description: string | null;
            rarity: import("@prisma/client").$Enums.Rarity;
            tier: number;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            healFlat: number;
            healPercent: number;
            usableInCombat: boolean;
            usableOutOfCombat: boolean;
            minTier: number | null;
            maxTier: number | null;
            availableQuantity: number;
        }[];
        summary: {
            hasPotion: boolean;
            hasPotionInInventory: boolean;
            availableQuantity: number;
            canAutoUseInManualCombat: boolean;
            canAutoUseInAutoCombat: boolean;
            canAutoUse: boolean;
            triggerText: string;
        };
        id: string;
        characterId: string;
        enabled: boolean;
        potionItemId: string | null;
        hpThresholdPercent: number;
        useInManualCombat: boolean;
        useInAutoCombat: boolean;
        character: {
            id: string;
            name: string;
        };
    }>;
    updatePotionConfig(request: AuthenticatedRequest, characterId: string, updatePotionConfigDto: UpdatePotionConfigDto): Promise<{
        config: {
            id: string;
            characterId: string;
            enabled: boolean;
            potionItemId: string | null;
            hpThresholdPercent: number;
            useInManualCombat: boolean;
            useInAutoCombat: boolean;
        };
        potion: {
            id: string;
            name: string;
            description: string | null;
            rarity: import("@prisma/client").$Enums.Rarity;
            tier: number;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            healFlat: number;
            healPercent: number;
            usableInCombat: boolean;
            usableOutOfCombat: boolean;
            minTier: number | null;
            maxTier: number | null;
            availableQuantity: number;
        } | null;
        potionItem: {
            id: string;
            name: string;
            description: string | null;
            rarity: import("@prisma/client").$Enums.Rarity;
            tier: number;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            healFlat: number;
            healPercent: number;
            usableInCombat: boolean;
            usableOutOfCombat: boolean;
            minTier: number | null;
            maxTier: number | null;
            availableQuantity: number;
        } | null;
        potionConfigs: {
            id: string;
            characterId: string;
            enabled: boolean;
            potionItemId: string | null;
            hpThresholdPercent: number;
            useInManualCombat: boolean;
            useInAutoCombat: boolean;
            potion: {
                id: string;
                name: string;
                description: string | null;
                rarity: import("@prisma/client").$Enums.Rarity;
                tier: number;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                healFlat: number;
                healPercent: number;
                usableInCombat: boolean;
                usableOutOfCombat: boolean;
                minTier: number | null;
                maxTier: number | null;
                availableQuantity: number;
            } | null;
            potionItem: {
                id: string;
                name: string;
                description: string | null;
                rarity: import("@prisma/client").$Enums.Rarity;
                tier: number;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                healFlat: number;
                healPercent: number;
                usableInCombat: boolean;
                usableOutOfCombat: boolean;
                minTier: number | null;
                maxTier: number | null;
                availableQuantity: number;
            } | null;
        }[];
        availablePotions: {
            id: string;
            name: string;
            description: string | null;
            rarity: import("@prisma/client").$Enums.Rarity;
            tier: number;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            healFlat: number;
            healPercent: number;
            usableInCombat: boolean;
            usableOutOfCombat: boolean;
            minTier: number | null;
            maxTier: number | null;
            availableQuantity: number;
        }[];
        summary: {
            hasPotion: boolean;
            hasPotionInInventory: boolean;
            availableQuantity: number;
            canAutoUseInManualCombat: boolean;
            canAutoUseInAutoCombat: boolean;
            canAutoUse: boolean;
            triggerText: string;
        };
        id: string;
        characterId: string;
        enabled: boolean;
        potionItemId: string | null;
        hpThresholdPercent: number;
        useInManualCombat: boolean;
        useInAutoCombat: boolean;
        character: {
            id: string;
            name: string;
        };
        message: string;
    }>;
}
export {};
