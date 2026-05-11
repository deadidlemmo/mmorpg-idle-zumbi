import { MaterialOrigin } from '@prisma/client';
import { StartGatheringDto } from './dto/start-gathering.dto';
import { GatheringService } from './gathering.service';
export declare class GatheringController {
    private readonly gatheringService;
    constructor(gatheringService: GatheringService);
    listAvailableMaterials(mapId: string, origin: MaterialOrigin): Promise<{
        map: {
            id: string;
            name: string;
            tier: number;
            minLevel: number;
            maxLevel: number;
        };
        origin: import("@prisma/client").$Enums.MaterialOrigin;
        ratePerHour: number;
        materials: {
            id: string;
            name: string;
            description: string | null;
            tier: number;
            rarity: import("@prisma/client").$Enums.Rarity;
            slot: import("@prisma/client").$Enums.ItemSlot;
            family: string;
            materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
            mapId: string | null;
            requiredGatheringLevel: number;
            gatheringXpPerUnit: number;
            baseGatheringRatePerHour: number | null;
            ratePerHour: number;
            isUnlockedByDefault: boolean;
            usedInRecipes: {
                recipeId: string;
                tier: number;
                outputQuantity: number;
                quantity: number;
                role: string;
                origin: MaterialOrigin;
                outputItemId: string;
                outputItemName: string;
                outputItemTier: number;
                outputItemRarity: string;
                outputItemSlot: string;
                outputItemFamily: string;
                outputItemClassId: string | null;
                outputItemClassName: string | null;
            }[];
            usedInRecipeCount: number;
            relatedClasses: string[];
        }[];
    }>;
    start(dto: StartGatheringDto): Promise<{
        message: string;
        session: {
            id: string;
            status: import("@prisma/client").$Enums.ActivityStatus;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            startedAt: Date;
            lastResolvedAt: Date;
            progressRemainder: number;
            collectedQuantity: number;
            collectedXp: number;
            character: unknown;
            map: unknown;
            targetMaterial: unknown;
        };
        gatheringSkill: {
            id: string;
            characterId: string;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            level: number;
            xp: number;
            totalXp: number;
            xpToNextLevel: number | null;
            xpProgressPercent: number;
            isAtLevelCap: boolean;
            isClassAffinity: boolean;
            statBonus: {
                stat: string;
                label: string;
                amount: number;
            };
            productionBonusPercent: number;
            affinityBonus: {
                xpMultiplier: number;
                productionMultiplier: number;
            } | null;
        };
    }>;
    getStatus(characterId: string): Promise<{
        active: boolean;
        message: string;
        session?: undefined;
        gatheringSkill?: undefined;
        productionPreview?: undefined;
        autoCollected?: undefined;
        inventoryItem?: undefined;
    } | {
        active: boolean;
        session: {
            id: string;
            status: import("@prisma/client").$Enums.ActivityStatus;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            startedAt: Date;
            lastResolvedAt: Date;
            progressRemainder: number;
            collectedQuantity: number;
            collectedXp: number;
            character: unknown;
            map: unknown;
            targetMaterial: unknown;
        };
        gatheringSkill: {
            id: string;
            characterId: string;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            level: number;
            xp: number;
            totalXp: number;
            xpToNextLevel: number | null;
            xpProgressPercent: number;
            isAtLevelCap: boolean;
            isClassAffinity: boolean;
            statBonus: {
                stat: string;
                label: string;
                amount: number;
            };
            productionBonusPercent: number;
            affinityBonus: {
                xpMultiplier: number;
                productionMultiplier: number;
            } | null;
        } | null;
        productionPreview: {
            elapsedSeconds: number;
            elapsedHours: number;
            ratePerHour: number;
            baseRatePerHour: number;
            defaultRatePerHour: number;
            skillRateMultiplier: number;
            affinityRateMultiplier: number;
            finalRateMultiplier: number;
            estimatedQuantityToCollect: number;
            currentProgressRemainder: number;
            estimatedNewProgressRemainder: number;
        };
        autoCollected: {
            itemId: string;
            name: string;
            quantity: number;
        } | {
            itemId: string;
            name: string;
            quantity: number;
        };
        inventoryItem: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            itemId: string;
            quantity: number;
            characterId: string;
            type: import("@prisma/client").$Enums.InventoryItemType;
        } | null;
        message?: undefined;
    }>;
    collect(characterId: string): Promise<{
        message: string;
        collected: {
            itemId: string;
            name: string;
            quantity: number;
        } | {
            itemId: string;
            name: string;
            quantity: number;
        };
        production: {
            elapsedSeconds: number;
            elapsedHours: number;
            ratePerHour: number;
            baseRatePerHour: number;
            defaultRatePerHour: number;
            skillRateMultiplier: number;
            affinityRateMultiplier: number;
            finalRateMultiplier: number;
            previousProgressRemainder: number;
            newProgressRemainder: number;
        };
        gatheringProgress: {
            skill: {
                id: string;
                characterId: string;
                origin: import("@prisma/client").$Enums.MaterialOrigin;
                level: number;
                xp: number;
                totalXp: number;
                xpToNextLevel: number | null;
                xpProgressPercent: number;
                isAtLevelCap: boolean;
                isClassAffinity: boolean;
                statBonus: {
                    stat: string;
                    label: string;
                    amount: number;
                };
                productionBonusPercent: number;
                affinityBonus: {
                    xpMultiplier: number;
                    productionMultiplier: number;
                } | null;
            };
            origin: MaterialOrigin;
            xpGained: number;
            previousLevel: number;
            newLevel: number;
            leveledUp: boolean;
            levelsGained: number;
            currentXp: number;
            totalXp: number;
            xpToNextLevel: number | null;
            xpProgressPercent: number;
            statBonusGained: {
                stat: string;
                label: string;
                amount: number;
            } | null;
        } | null;
        session: {
            id: string;
            status: import("@prisma/client").$Enums.ActivityStatus;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            startedAt: Date;
            lastResolvedAt: Date;
            progressRemainder: number;
            collectedQuantity: number;
            collectedXp: number;
            character: unknown;
            map: unknown;
            targetMaterial: unknown;
        };
        inventoryItem: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            itemId: string;
            quantity: number;
            characterId: string;
            type: import("@prisma/client").$Enums.InventoryItemType;
        } | null;
    }>;
    stop(characterId: string): Promise<{
        message: string;
        collected: {
            itemId: string;
            name: string;
            quantity: number;
        };
        production: {
            elapsedSeconds: number;
            elapsedHours: number;
            ratePerHour: number;
            baseRatePerHour: number;
            defaultRatePerHour: number;
            skillRateMultiplier: number;
            affinityRateMultiplier: number;
            finalRateMultiplier: number;
            previousProgressRemainder: number;
            newProgressRemainder: number;
        };
        gatheringProgress: {
            skill: {
                id: string;
                characterId: string;
                origin: import("@prisma/client").$Enums.MaterialOrigin;
                level: number;
                xp: number;
                totalXp: number;
                xpToNextLevel: number | null;
                xpProgressPercent: number;
                isAtLevelCap: boolean;
                isClassAffinity: boolean;
                statBonus: {
                    stat: string;
                    label: string;
                    amount: number;
                };
                productionBonusPercent: number;
                affinityBonus: {
                    xpMultiplier: number;
                    productionMultiplier: number;
                } | null;
            };
            origin: MaterialOrigin;
            xpGained: number;
            previousLevel: number;
            newLevel: number;
            leveledUp: boolean;
            levelsGained: number;
            currentXp: number;
            totalXp: number;
            xpToNextLevel: number | null;
            xpProgressPercent: number;
            statBonusGained: {
                stat: string;
                label: string;
                amount: number;
            } | null;
        } | null;
        session: {
            id: string;
            status: import("@prisma/client").$Enums.ActivityStatus;
            origin: import("@prisma/client").$Enums.MaterialOrigin;
            startedAt: Date;
            lastResolvedAt: Date;
            progressRemainder: number;
            collectedQuantity: number;
            collectedXp: number;
            character: unknown;
            map: unknown;
            targetMaterial: unknown;
        };
    }>;
}
