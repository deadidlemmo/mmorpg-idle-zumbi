export type PrimaryStats = {
    strength: number;
    vitality: number;
    agility: number;
    precision: number;
    technique: number;
    willpower: number;
};
export type DerivedCombatStats = {
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
};
type GameClassStats = {
    name: string;
    baseStrength: number;
    baseVitality: number;
    baseAgility: number;
    basePrecision: number;
    baseTechnique: number;
    baseWillpower: number;
};
type ItemStatsBonus = {
    strengthBonus?: number | null;
    vitalityBonus?: number | null;
    agilityBonus?: number | null;
    precisionBonus?: number | null;
    techniqueBonus?: number | null;
    willpowerBonus?: number | null;
};
export declare function createEmptyPrimaryStats(): PrimaryStats;
export declare function getBasePrimaryStats(gameClass: GameClassStats): PrimaryStats;
export declare function getLevelPrimaryBonus(className: string, level: number): PrimaryStats;
export declare function getEquipmentPrimaryBonus(equipmentItems: Array<ItemStatsBonus | null | undefined>): PrimaryStats;
export declare function sumPrimaryStats(baseStats: PrimaryStats, bonusStats: PrimaryStats): PrimaryStats;
export declare function sumManyPrimaryStats(statsList: PrimaryStats[]): PrimaryStats;
export declare function calculateDerivedCombatStats(className: string, level: number, stats: PrimaryStats): DerivedCombatStats;
export declare function calculateFullStats(gameClass: GameClassStats, equipmentItems: Array<ItemStatsBonus | null | undefined>, level?: number): {
    level: number;
    basePrimaryStats: PrimaryStats;
    levelBonusStats: PrimaryStats;
    equipmentBonusStats: PrimaryStats;
    totalPrimaryStats: PrimaryStats;
    derivedCombatStats: DerivedCombatStats;
};
export {};
