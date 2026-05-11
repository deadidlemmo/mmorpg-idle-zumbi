import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { StartGatheringDto } from './dto/start-gathering.dto';
import { GatheringService } from './gathering.service';
interface GatheringSocketPayload {
    characterId?: string;
}
type GatheringSocket = Socket & {
    data: {
        gatheringCharacterIds?: Set<string>;
    };
};
export declare class GatheringGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly gatheringService;
    private readonly server;
    private readonly clientsByCharacterId;
    private readonly intervalsByCharacterId;
    constructor(gatheringService: GatheringService);
    handleConnection(client: GatheringSocket): void;
    handleDisconnect(client: GatheringSocket): void;
    handleJoin(client: GatheringSocket, payload: GatheringSocketPayload): Promise<{
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
    } | null>;
    handleLeave(client: GatheringSocket, payload: GatheringSocketPayload): {
        ok: boolean;
    } | null;
    handleStatusRequest(client: GatheringSocket, payload: GatheringSocketPayload): Promise<{
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
    } | null>;
    handleRefresh(client: GatheringSocket, payload: GatheringSocketPayload): Promise<{
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
    } | null>;
    handleStart(client: GatheringSocket, payload: StartGatheringDto): Promise<{
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
    } | null>;
    handleCollect(client: GatheringSocket, payload: GatheringSocketPayload): Promise<{
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
            origin: import("@prisma/client").MaterialOrigin;
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
    } | null>;
    handleStop(client: GatheringSocket, payload: GatheringSocketPayload): Promise<{
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
            origin: import("@prisma/client").MaterialOrigin;
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
    } | null>;
    private joinCharacterRoom;
    private addClientToCharacter;
    private removeClientFromCharacter;
    private ensureCharacterInterval;
    private clearCharacterInterval;
    private stopCharacterIntervalIfInactive;
    private emitStatusToClient;
    private emitStatusToRoom;
    private safeGetStatus;
    private emitError;
    private extractErrorMessage;
    private normalizeCharacterId;
    private getRoomName;
}
export {};
