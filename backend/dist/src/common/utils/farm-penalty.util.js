"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTierByCharacterLevel = getTierByCharacterLevel;
exports.calculateTierFarmPenalty = calculateTierFarmPenalty;
exports.applyXpPenalty = applyXpPenalty;
exports.applyDropChancePenalty = applyDropChancePenalty;
exports.isRareOrEquipmentDrop = isRareOrEquipmentDrop;
exports.getDropMultiplierByItemSlot = getDropMultiplierByItemSlot;
function getTierByCharacterLevel(level) {
    if (level <= 0) {
        return 1;
    }
    return Math.max(1, Math.ceil(level / 10));
}
function calculateTierFarmPenalty(characterLevel, targetTier) {
    const characterTier = getTierByCharacterLevel(characterLevel);
    const tierDifference = characterTier - targetTier;
    if (tierDifference <= 0) {
        return {
            characterTier,
            targetTier,
            tierDifference,
            xpMultiplier: 1,
            rareDropMultiplier: 1,
            commonDropMultiplier: 1,
        };
    }
    if (tierDifference === 1) {
        return {
            characterTier,
            targetTier,
            tierDifference,
            xpMultiplier: 0.35,
            rareDropMultiplier: 0.6,
            commonDropMultiplier: 0.9,
        };
    }
    if (tierDifference === 2) {
        return {
            characterTier,
            targetTier,
            tierDifference,
            xpMultiplier: 0.1,
            rareDropMultiplier: 0.3,
            commonDropMultiplier: 0.7,
        };
    }
    return {
        characterTier,
        targetTier,
        tierDifference,
        xpMultiplier: 0.03,
        rareDropMultiplier: 0.1,
        commonDropMultiplier: 0.5,
    };
}
function applyXpPenalty(baseXp, xpMultiplier) {
    if (baseXp <= 0) {
        return 0;
    }
    const finalXp = Math.floor(baseXp * xpMultiplier);
    return Math.max(0, finalXp);
}
function applyDropChancePenalty(baseDropChance, multiplier) {
    if (baseDropChance <= 0) {
        return 0;
    }
    const finalChance = Math.floor(baseDropChance * multiplier);
    return Math.min(100, Math.max(0, finalChance));
}
function isRareOrEquipmentDrop(itemSlot) {
    return itemSlot !== 'MATERIAL' && itemSlot !== 'CONSUMABLE';
}
function getDropMultiplierByItemSlot(itemSlot, penalty) {
    if (isRareOrEquipmentDrop(itemSlot)) {
        return penalty.rareDropMultiplier;
    }
    return penalty.commonDropMultiplier;
}
//# sourceMappingURL=farm-penalty.util.js.map