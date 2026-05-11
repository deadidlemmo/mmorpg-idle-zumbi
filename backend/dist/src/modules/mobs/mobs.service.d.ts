import { PrismaService } from '../../prisma/prisma.service';
export declare class MobsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<({
        map: {
            name: string;
            id: string;
            tier: number;
            minLevel: number;
            maxLevel: number;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        drops: ({
            item: {
                name: string;
                id: string;
                tier: number;
                description: string | null;
                createdAt: Date;
                updatedAt: Date;
                mapId: string | null;
                rarity: import("@prisma/client").$Enums.Rarity;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
                requiredGatheringLevel: number;
                gatheringXpPerUnit: number;
                baseGatheringRatePerHour: number | null;
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
                classId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            mobId: string;
            itemId: string;
            dropChance: number;
            minQuantity: number;
            maxQuantity: number;
        })[];
    } & {
        name: string;
        id: string;
        tier: number;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        mapId: string;
        level: number;
        hp: number;
        attack: number;
        defense: number;
        speed: number;
        xpReward: number;
    })[]>;
    findOne(id: string): Promise<({
        map: {
            name: string;
            id: string;
            tier: number;
            minLevel: number;
            maxLevel: number;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        drops: ({
            item: {
                name: string;
                id: string;
                tier: number;
                description: string | null;
                createdAt: Date;
                updatedAt: Date;
                mapId: string | null;
                rarity: import("@prisma/client").$Enums.Rarity;
                slot: import("@prisma/client").$Enums.ItemSlot;
                family: string;
                materialOrigin: import("@prisma/client").$Enums.MaterialOrigin | null;
                requiredGatheringLevel: number;
                gatheringXpPerUnit: number;
                baseGatheringRatePerHour: number | null;
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
                classId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            mobId: string;
            itemId: string;
            dropChance: number;
            minQuantity: number;
            maxQuantity: number;
        })[];
    } & {
        name: string;
        id: string;
        tier: number;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        mapId: string;
        level: number;
        hp: number;
        attack: number;
        defense: number;
        speed: number;
        xpReward: number;
    }) | null>;
}
