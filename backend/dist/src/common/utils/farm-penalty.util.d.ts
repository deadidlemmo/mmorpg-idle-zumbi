export type FarmPenaltyResult = {
    characterTier: number;
    targetTier: number;
    tierDifference: number;
    xpMultiplier: number;
    rareDropMultiplier: number;
    commonDropMultiplier: number;
};
export declare function getTierByCharacterLevel(level: number): number;
export declare function calculateTierFarmPenalty(characterLevel: number, targetTier: number): FarmPenaltyResult;
export declare function applyXpPenalty(baseXp: number, xpMultiplier: number): number;
export declare function applyDropChancePenalty(baseDropChance: number, multiplier: number): number;
export declare function isRareOrEquipmentDrop(itemSlot: string): boolean;
export declare function getDropMultiplierByItemSlot(itemSlot: string, penalty: FarmPenaltyResult): number;
