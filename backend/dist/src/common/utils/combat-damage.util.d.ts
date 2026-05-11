export type CombatDamageDetails = {
    attack: number;
    defense: number;
    reductionRate: number;
    minimumDamage: number;
    baseDamage: number;
};
export type CombatDamageResult = {
    baseDamage: number;
    finalDamage: number;
    variationMultiplier: number;
    minPossibleDamage: number;
    maxPossibleDamage: number;
    attack: number;
    defense: number;
    reductionRate: number;
    minimumDamage: number;
};
export type CombatCriticalDetails = {
    isCritical: boolean;
    criticalChance: number;
    criticalRoll: number;
    criticalMultiplier: number;
    criticalBonusDamage: number;
};
export type CombatDodgeDetails = {
    isDodged: boolean;
    dodgeChance: number;
    dodgeRoll: number;
};
export type CombatHitResult = CombatDamageResult & {
    damageBeforeCritical: number;
    isDodged: boolean;
    dodgeChance: number;
    dodgeRoll: number;
    isCritical: boolean;
    criticalChance: number;
    criticalRoll: number;
    criticalMultiplier: number;
    criticalBonusDamage: number;
    maxPossibleCriticalDamage: number;
};
type CalculateCombatHitParams = {
    attack: number;
    defense: number;
    attackerPrecision?: number;
    attackerTechnique?: number;
    defenderAgility?: number;
    minMultiplier?: number;
    maxMultiplier?: number;
    baseCriticalChance?: number;
    minCriticalChance?: number;
    maxCriticalChance?: number;
    baseCriticalMultiplier?: number;
    maxCriticalMultiplier?: number;
    baseDodgeChance?: number;
    minDodgeChance?: number;
    maxDodgeChance?: number;
};
export declare function calculateCombatDamage(attack: number, defense: number): number;
export declare function calculateCombatDamageDetails(attack: number, defense: number): CombatDamageDetails;
export declare function calculateVariableCombatDamage(params: {
    attack: number;
    defense: number;
    minMultiplier?: number;
    maxMultiplier?: number;
}): CombatDamageResult;
export declare function calculateCombatHit(params: CalculateCombatHitParams): CombatHitResult;
export declare function calculateDodgeDetails(params: {
    attackerPrecision: number;
    defenderAgility: number;
    baseDodgeChance?: number;
    minDodgeChance?: number;
    maxDodgeChance?: number;
}): CombatDodgeDetails;
export declare function calculateCriticalDetails(params: {
    attackerPrecision: number;
    attackerTechnique: number;
    defenderAgility: number;
    baseCriticalChance?: number;
    minCriticalChance?: number;
    maxCriticalChance?: number;
    baseCriticalMultiplier?: number;
    maxCriticalMultiplier?: number;
}): CombatCriticalDetails;
export {};
