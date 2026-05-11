import { CharacterStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
type ActivityGuardParams = {
    characterId: string;
    userId?: string;
};
type CharacterActivityState = {
    character: {
        id: string;
        name: string;
        status: CharacterStatus;
        level: number;
        currentHp: number | null;
        maxHp: number | null;
    };
    currentHp: number;
    activeAutoCombatSession: any | null;
    activeGatheringSession: any | null;
    hasActiveAutoCombat: boolean;
    hasActiveGathering: boolean;
};
export declare class ActivityGuardService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getCharacterActivityState(params: ActivityGuardParams): Promise<CharacterActivityState>;
    ensureCanStartGathering(params: ActivityGuardParams): Promise<CharacterActivityState>;
    ensureCanCollectGathering(params: ActivityGuardParams): Promise<CharacterActivityState>;
    ensureCanStartAutoCombat(params: ActivityGuardParams): Promise<CharacterActivityState>;
    ensureCanUseInfirmary(params: ActivityGuardParams): Promise<CharacterActivityState>;
    private ensureCharacterIsActive;
    private ensureCharacterHasHp;
    private resolveCurrentHp;
}
export {};
