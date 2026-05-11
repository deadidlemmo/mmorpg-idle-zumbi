import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    findByCharacter(request: any, characterId: string): Promise<{
        character: {
            id: string;
            name: string;
            level: number;
            xp: number;
            currentHp: number | null;
            maxHp: number | null;
        };
        totalItems: number;
        items: {
            inventoryItemId: string;
            quantity: number;
            type: import("@prisma/client").$Enums.InventoryItemType;
            item: {
                id: string;
                name: string;
                description: string | null;
                tier: number;
                rarity: import("@prisma/client").$Enums.Rarity;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
                strengthBonus: number;
                vitalityBonus: number;
                agilityBonus: number;
                precisionBonus: number;
                techniqueBonus: number;
                willpowerBonus: number;
                healFlat: number;
                healPercent: number;
                usableInCombat: boolean;
                usableOutOfCombat: boolean;
                minTier: number | null;
                maxTier: number | null;
                isCraftable: boolean;
                class: {
                    id: string;
                    name: string;
                } | null;
                map: {
                    id: string;
                    name: string;
                    tier: number;
                    minLevel: number;
                    maxLevel: number;
                } | null;
            };
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
}
