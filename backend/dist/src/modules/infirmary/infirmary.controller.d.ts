import { InfirmaryService } from './infirmary.service';
export declare class InfirmaryController {
    private readonly infirmaryService;
    constructor(infirmaryService: InfirmaryService);
    getStatus(req: any, characterId: string): Promise<{
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
    heal(req: any, characterId: string): Promise<{
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
}
