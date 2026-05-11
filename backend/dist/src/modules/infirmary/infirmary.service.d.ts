import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
export declare class InfirmaryService {
    private readonly prisma;
    private readonly activityGuard;
    constructor(prisma: PrismaService, activityGuard: ActivityGuardService);
    getStatus(userId: string, characterId: string): Promise<{
        character: {
            id: string;
            name: string;
            status: import("@prisma/client").$Enums.CharacterStatus;
            level: number;
            xp: number;
            currentHp: number;
            maxHp: number;
        };
        infirmary: {
            canHeal: boolean;
            reason: string;
            currentHp: number;
            maxHp: number;
            missingHp: number;
            hasActiveAutoCombat: boolean;
            hasActiveGathering: boolean;
            activeAutoCombatSession: any;
            activeGatheringSession: any;
            cost: {
                type: string;
                amount: number;
            };
        };
    }>;
    heal(userId: string, characterId: string): Promise<{
        message: string;
        character: {
            id: string;
            name: string;
            status: import("@prisma/client").$Enums.CharacterStatus;
            level: number;
            xp: number;
            currentHp: number | null;
            maxHp: number | null;
        };
        healing: {
            oldHp: number;
            newHp: number;
            maxHp: number;
            healedAmount: number;
        };
        cost: {
            type: string;
            amount: number;
        };
    }>;
    private findCharacterWithStats;
    private calculateCharacterMaxHp;
    private clampHp;
}
