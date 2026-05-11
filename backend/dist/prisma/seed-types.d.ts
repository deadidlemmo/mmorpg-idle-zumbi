import type { CraftIngredientRole, ItemSlot, MaterialOrigin, Rarity } from '@prisma/client';
export type MapDefinition = {
    name: string;
    tier: number;
    minLevel: number;
    maxLevel: number;
    description: string;
    subMaps: string[];
};
export type GameClassSeedData = {
    name: string;
    description: string;
    baseStrength: number;
    baseVitality: number;
    baseAgility: number;
    basePrecision: number;
    baseTechnique: number;
    baseWillpower: number;
};
export type MobSeedData = {
    name: string;
    aliases?: string[];
    description: string;
    level: number;
    tier: number;
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    xpReward: number;
    mapName: string;
};
export type SubMapEncounterSeedData = {
    subMapName: string;
    mobName: string;
    weight: number;
    isActive?: boolean;
};
export type MobDropSeedData = {
    mobName: string;
    itemName: string;
    dropChance: number;
    minQuantity: number;
    maxQuantity: number;
};
export type EquipmentSeedData = {
    name: string;
    description: string;
    tier: number;
    rarity: Rarity;
    slot: ItemSlot;
    family: string;
    className: string;
    mapName: string;
    strengthBonus?: number;
    vitalityBonus?: number;
    agilityBonus?: number;
    precisionBonus?: number;
    techniqueBonus?: number;
    willpowerBonus?: number;
    isCraftable?: boolean;
};
export type MaterialSeedData = {
    name: string;
    description: string;
    tier: number;
    rarity?: Rarity;
    family?: string;
    mapName: string;
    materialOrigin: MaterialOrigin;
};
export type ConsumableSeedData = {
    name: string;
    description: string;
    tier: number;
    rarity: Rarity;
    family: string;
    healFlat: number;
    healPercent: number;
    minTier: number;
    maxTier: number;
    isCraftable?: boolean;
};
export type CraftingIngredientSeedData = {
    itemName: string;
    quantity: number;
    role: CraftIngredientRole;
    origin: MaterialOrigin;
};
export type CraftingRecipeSeedData = {
    outputItemName: string;
    tier: number;
    outputQuantity?: number;
    ingredients: CraftingIngredientSeedData[];
};
export type GatheringSeedData = {
    key: string;
    label: string;
    description: string;
    materialOrigin: MaterialOrigin;
    statBonus: string;
};
