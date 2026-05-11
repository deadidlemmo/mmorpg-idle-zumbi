import { ItemSlot } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CraftItemDto } from './dto/craft-item.dto';
type MissingMaterial = {
    itemId: string;
    name: string;
    missing: number;
    required: number;
    available: number;
    role: string;
    origin: string | null;
    materialOrigin: string | null;
    mapId: string | null;
    family: string | null;
};
type MissingByOriginGroup = {
    origin: string;
    totalMissing: number;
    materials: MissingMaterial[];
};
export declare class CraftingService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listCharacterRecipes(params: {
        characterId: string;
        tier?: number;
        slot?: ItemSlot;
        craftableOnly?: boolean;
    }): Promise<{
        character: {
            id: string;
            name: string;
            level: number;
            status: import("@prisma/client").$Enums.CharacterStatus;
            class: {
                name: string;
                id: string;
            };
        };
        filters: {
            tier: number | null;
            slot: import("@prisma/client").$Enums.ItemSlot | null;
            craftableOnly: boolean;
            classId: string;
        };
        summary: {
            totalRecipes: number;
            craftableRecipes: number;
            blockedRecipes: number;
            ownedRecipes: number;
            equippedRecipes: number;
        };
        recipes: {
            recipeId: string;
            tier: number;
            isActive: boolean;
            outputQuantity: number;
            ownedQuantity: number;
            isEquipped: boolean;
            canCraft: boolean;
            maxCraftableTimes: number;
            maxOutputQuantity: number;
            progress: {
                percent: number;
                requiredTotal: number;
                availableTotal: number;
                missingTotal: number;
            };
            missingByOrigin: MissingByOriginGroup[];
            nextActions: any[];
            outputItem: {
                id: string;
                name: string;
                description: string | null;
                tier: number;
                rarity: import("@prisma/client").$Enums.Rarity;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                classId: string | null;
                mapId: string | null;
                bonuses: {
                    strength: number;
                    vitality: number;
                    agility: number;
                    precision: number;
                    technique: number;
                    willpower: number;
                };
            };
            ingredients: {
                id: string;
                itemId: string;
                name: string;
                description: string | null;
                required: number;
                available: number;
                missing: number;
                hasEnough: boolean;
                role: import("@prisma/client").$Enums.CraftIngredientRole;
                origin: import("@prisma/client").$Enums.MaterialOrigin;
                materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
                mapId: string | null;
                tier: number;
                rarity: import("@prisma/client").$Enums.Rarity;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
            }[];
            missingIngredients: {
                id: string;
                itemId: string;
                name: string;
                description: string | null;
                required: number;
                available: number;
                missing: number;
                hasEnough: boolean;
                role: import("@prisma/client").$Enums.CraftIngredientRole;
                origin: import("@prisma/client").$Enums.MaterialOrigin;
                materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
                mapId: string | null;
                tier: number;
                rarity: import("@prisma/client").$Enums.Rarity;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
            }[];
        }[];
    }>;
    getRecipeByOutputItemId(itemId: string): Promise<{
        id: string;
        tier: number;
        isActive: boolean;
        outputQuantity: number;
        outputItem: {
            id: string;
            name: string;
            description: string | null;
            tier: number;
            rarity: import("@prisma/client").$Enums.Rarity;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            classId: string | null;
            mapId: string | null;
            isCraftable: boolean;
            bonuses: {
                strength: number;
                vitality: number;
                agility: number;
                precision: number;
                technique: number;
                willpower: number;
            };
        };
        ingredients: {
            id: string;
            itemId: string;
            name: string;
            description: string | null;
            quantity: number;
            role: import("@prisma/client").$Enums.CraftIngredientRole;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
            mapId: string | null;
            tier: number;
            rarity: import("@prisma/client").$Enums.Rarity;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
        }[];
    }>;
    getRecipe(itemId: string): Promise<{
        id: string;
        tier: number;
        isActive: boolean;
        outputQuantity: number;
        outputItem: {
            id: string;
            name: string;
            description: string | null;
            tier: number;
            rarity: import("@prisma/client").$Enums.Rarity;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            classId: string | null;
            mapId: string | null;
            isCraftable: boolean;
            bonuses: {
                strength: number;
                vitality: number;
                agility: number;
                precision: number;
                technique: number;
                willpower: number;
            };
        };
        ingredients: {
            id: string;
            itemId: string;
            name: string;
            description: string | null;
            quantity: number;
            role: import("@prisma/client").$Enums.CraftIngredientRole;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
            mapId: string | null;
            tier: number;
            rarity: import("@prisma/client").$Enums.Rarity;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
        }[];
    }>;
    craft(dto: CraftItemDto): Promise<{
        message: string;
        character: {
            id: string;
            name: string;
        };
        craftedItem: {
            id: string;
            name: string;
            description: string | null;
            tier: number;
            rarity: import("@prisma/client").$Enums.Rarity;
            slot: "MAIN_HAND" | "OFF_HAND" | "HEAD" | "ARMOR" | "PANTS" | "BOOTS" | "CONSUMABLE";
            family: string;
            quantity: number;
        };
        consumed: {
            itemId: string;
            name: string;
            quantity: number;
            role: import("@prisma/client").$Enums.CraftIngredientRole;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
        }[];
        inventoryItem: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            itemId: string;
            quantity: number;
            characterId: string;
            type: import("@prisma/client").$Enums.InventoryItemType;
        };
    }>;
    private buildRecipeNextActions;
    private getGatheringActionLabel;
    private getGatheringActionDescription;
    private getOriginPriority;
}
export {};
