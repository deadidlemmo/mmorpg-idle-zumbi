import { PrismaService } from '../../prisma/prisma.service';
export declare class InventoryService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findByCharacter(userId: string, characterId: string): Promise<{
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
