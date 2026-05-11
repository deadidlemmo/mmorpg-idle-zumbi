import { PrismaService } from '../../prisma/prisma.service';
export declare class MapsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<({
        items: {
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
        }[];
        mobs: {
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
        }[];
        subMaps: ({
            encounters: ({
                mob: {
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
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                subMapId: string;
                mobId: string;
                weight: number;
                isActive: boolean;
            })[];
        } & {
            name: string;
            id: string;
            tier: number;
            minLevel: number;
            maxLevel: number;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
            mapId: string;
        })[];
    } & {
        name: string;
        id: string;
        tier: number;
        minLevel: number;
        maxLevel: number;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    findOne(id: string): Promise<({
        items: {
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
        }[];
        mobs: ({
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
        })[];
        subMaps: ({
            encounters: ({
                mob: {
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
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                subMapId: string;
                mobId: string;
                weight: number;
                isActive: boolean;
            })[];
        } & {
            name: string;
            id: string;
            tier: number;
            minLevel: number;
            maxLevel: number;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
            mapId: string;
        })[];
    } & {
        name: string;
        id: string;
        tier: number;
        minLevel: number;
        maxLevel: number;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
    }) | null>;
}
