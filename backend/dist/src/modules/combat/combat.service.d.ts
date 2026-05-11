import { PrismaService } from '../../prisma/prisma.service';
import { StartCombatDto } from './dto/start-combat.dto';
type CombatWinner = 'PLAYER' | 'MOB';
export declare class CombatService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    start(userId: string, startCombatDto: StartCombatDto): Promise<{
        combatId: string;
        status: import("@prisma/client").$Enums.CombatStatus;
        character: {
            id: string;
            name: string;
            class: string;
            oldLevel: number;
            newLevel: number;
            oldXp: number;
            newXp: number;
        };
        mob: {
            id: string;
            name: string;
            level: number;
            tier: number;
        };
        result: {
            winner: CombatWinner;
            rounds: number;
            playerStartHp: number;
            playerEndHp: number;
            playerFinalSavedHp: number;
            oldMaxHp: number;
            newMaxHp: number;
            maxHpGained: number;
            mobStartHp: number;
            mobEndHp: number;
            xpGained: number;
            rewards: {
                itemId: string;
                itemName: string;
                quantity: number;
            }[];
            damage: {
                dealt: number;
                taken: number;
            };
            healing: {
                fromPotions: number;
                fromLevelUp: number;
                total: number;
            };
            hp: {
                initial: number;
                final: number;
                change: number;
                lostNet: number;
                recoveredNet: number;
                tookDamage: boolean;
                wasHealed: boolean;
            };
            critical: {
                hitsDealt: number;
                hitsTaken: number;
                bonusDamageDealt: number;
                bonusDamageTaken: number;
                dealtAny: boolean;
                tookAny: boolean;
            };
            potion: {
                usedQuantity: number;
                healing: number;
                itemId: string | null;
                itemName: string | null;
                triggerPercent: number | null;
            };
        };
        levelProgress: {
            oldLevel: number;
            newLevel: number;
            leveledUp: boolean;
            levelsGained: number;
            currentXp: number;
            gainedXp: number;
            totalXp: number;
            xpIntoCurrentLevel: number;
            xpNeededForNextLevel: number | null;
            nextLevelRequiredXp: number | null;
            progressPercent: number;
            levelCap: number;
            isAtLevelCap: boolean;
        };
        statsBeforeCombat: {
            level: number;
            basePrimaryStats: import("../../common/utils/stats.util").PrimaryStats;
            levelBonusStats: import("../../common/utils/stats.util").PrimaryStats;
            equipmentBonusStats: import("../../common/utils/stats.util").PrimaryStats;
            totalPrimaryStats: import("../../common/utils/stats.util").PrimaryStats;
            derivedCombatStats: import("../../common/utils/stats.util").DerivedCombatStats;
        };
        statsAfterCombat: {
            level: number;
            basePrimaryStats: import("../../common/utils/stats.util").PrimaryStats;
            levelBonusStats: import("../../common/utils/stats.util").PrimaryStats;
            equipmentBonusStats: import("../../common/utils/stats.util").PrimaryStats;
            totalPrimaryStats: import("../../common/utils/stats.util").PrimaryStats;
            derivedCombatStats: import("../../common/utils/stats.util").DerivedCombatStats;
        };
        logs: {
            id: string;
            createdAt: Date;
            message: string;
            damage: number;
            round: number;
            actor: import("@prisma/client").$Enums.CombatActor;
            combatId: string;
        }[];
    }>;
    private getEquipmentItems;
    private buildStatsResponse;
    private calculateCurrentHpAfterCombatWin;
    private resolveTurnCombat;
    private createAutoPotionState;
    private tryUseAutoPotion;
    private calculateHealAmount;
    private calculateHit;
    private calculateMobFighterStats;
    private clampHp;
    private randomBetween;
    private getInventoryItemType;
}
export {};
