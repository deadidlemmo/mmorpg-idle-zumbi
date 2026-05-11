"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTierByLevel = getTierByLevel;
exports.getLevelWithinTier = getLevelWithinTier;
exports.getXpRequiredForNextLevel = getXpRequiredForNextLevel;
exports.getTotalXpRequiredForLevel = getTotalXpRequiredForLevel;
exports.calculateLevelFromTotalXp = calculateLevelFromTotalXp;
exports.getLevelProgress = getLevelProgress;
exports.calculateLevelProgress = calculateLevelProgress;
exports.buildLevelProgressViewModel = buildLevelProgressViewModel;
const progression_config_1 = require("../config/progression.config");
function normalizeLevel(level, levelCap = progression_config_1.LAUNCH_LEVEL_CAP) {
    const parsedLevel = Math.floor(Number(level));
    if (!Number.isFinite(parsedLevel)) {
        return 1;
    }
    return Math.max(1, Math.min(parsedLevel, levelCap));
}
function normalizeXp(xp) {
    const parsedXp = Math.floor(Number(xp));
    if (!Number.isFinite(parsedXp)) {
        return 0;
    }
    return Math.max(0, parsedXp);
}
function normalizeGainedXp(gainedXp) {
    const parsedGainedXp = Math.floor(Number(gainedXp));
    if (!Number.isFinite(parsedGainedXp)) {
        return 0;
    }
    return Math.max(0, parsedGainedXp);
}
function getTierByLevel(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.max(1, Math.ceil(safeLevel / progression_config_1.LEVELS_PER_TIER));
}
function getLevelWithinTier(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    const position = safeLevel % progression_config_1.LEVELS_PER_TIER;
    if (position === 0) {
        return progression_config_1.LEVELS_PER_TIER;
    }
    return position;
}
function getXpRequiredForNextLevel(currentLevel) {
    const safeLevel = normalizeLevel(currentLevel, progression_config_1.FUTURE_LEVEL_CAP);
    if (safeLevel >= progression_config_1.FUTURE_LEVEL_CAP) {
        return 0;
    }
    const tier = getTierByLevel(safeLevel);
    const levelWithinTier = getLevelWithinTier(safeLevel);
    const targetDays = progression_config_1.TIER_TARGET_DAYS[tier] ?? progression_config_1.TIER_TARGET_DAYS[10];
    const averageXpPerCombat = progression_config_1.TIER_AVERAGE_XP_PER_COMBAT[tier] ?? progression_config_1.TIER_AVERAGE_XP_PER_COMBAT[10];
    const expectedXpInTier = targetDays * progression_config_1.EXPECTED_COMBATS_PER_DAY * averageXpPerCombat;
    const totalTierWeight = 55;
    const levelWeight = levelWithinTier;
    const requiredXp = Math.round((expectedXpInTier * levelWeight) / totalTierWeight);
    return Math.max(1, requiredXp);
}
function getTotalXpRequiredForLevel(level) {
    const safeLevel = normalizeLevel(level, progression_config_1.FUTURE_LEVEL_CAP);
    if (safeLevel <= 1) {
        return 0;
    }
    let totalXp = 0;
    for (let currentLevel = 1; currentLevel < safeLevel; currentLevel++) {
        totalXp += getXpRequiredForNextLevel(currentLevel);
    }
    return totalXp;
}
function calculateLevelFromTotalXp(totalXp, levelCap = progression_config_1.LAUNCH_LEVEL_CAP) {
    const safeTotalXp = normalizeXp(totalXp);
    const safeLevelCap = normalizeLevel(levelCap, progression_config_1.FUTURE_LEVEL_CAP);
    let level = 1;
    while (level < safeLevelCap &&
        safeTotalXp >= getTotalXpRequiredForLevel(level + 1)) {
        level++;
    }
    return level;
}
function calculateProgressPercent(params) {
    const { totalXp, currentLevelStartXp, nextLevelRequiredXp } = params;
    if (nextLevelRequiredXp === null) {
        return 100;
    }
    const xpRequiredInsideLevel = nextLevelRequiredXp - currentLevelStartXp;
    if (xpRequiredInsideLevel <= 0) {
        return 100;
    }
    const xpInsideLevel = totalXp - currentLevelStartXp;
    const percent = (xpInsideLevel / xpRequiredInsideLevel) * 100;
    return Number(Math.max(0, Math.min(100, percent)).toFixed(2));
}
function buildLevelProgressResult(params) {
    const oldLevel = normalizeLevel(params.oldLevel, params.levelCap);
    const currentXp = normalizeXp(params.currentXp);
    const gainedXp = normalizeGainedXp(params.gainedXp);
    const totalXp = normalizeXp(params.totalXp);
    const levelCap = normalizeLevel(params.levelCap, progression_config_1.FUTURE_LEVEL_CAP);
    const levelByXp = calculateLevelFromTotalXp(totalXp, levelCap);
    const newLevel = Math.max(oldLevel, levelByXp);
    const currentLevelStartXp = getTotalXpRequiredForLevel(newLevel);
    const isAtLevelCap = newLevel >= levelCap;
    const nextLevelRequiredXp = isAtLevelCap
        ? null
        : getTotalXpRequiredForLevel(newLevel + 1);
    const xpIntoCurrentLevel = Math.max(0, totalXp - currentLevelStartXp);
    const xpToNextLevel = nextLevelRequiredXp === null
        ? Math.max(1, xpIntoCurrentLevel)
        : Math.max(1, nextLevelRequiredXp - currentLevelStartXp);
    const safeXpIntoCurrentLevel = Math.min(xpIntoCurrentLevel, xpToNextLevel);
    const xpNeededForNextLevel = nextLevelRequiredXp === null
        ? null
        : Math.max(0, nextLevelRequiredXp - totalXp);
    const progressPercent = calculateProgressPercent({
        totalXp,
        currentLevelStartXp,
        nextLevelRequiredXp,
    });
    const levelsGained = Math.max(0, newLevel - oldLevel);
    return {
        oldLevel,
        newLevel,
        currentXp,
        gainedXp,
        totalXp,
        leveledUp: levelsGained > 0,
        levelsGained,
        levelCap,
        isAtLevelCap,
        currentLevelStartXp,
        nextLevelRequiredXp,
        xpIntoCurrentLevel: safeXpIntoCurrentLevel,
        xpNeededForNextLevel,
        xpToNextLevel,
        currentLevelXp: safeXpIntoCurrentLevel,
        nextLevelXp: xpToNextLevel,
        xpProgressPercent: progressPercent,
        progressPercent,
    };
}
function getLevelProgress(currentLevel, currentXp, levelCap = progression_config_1.LAUNCH_LEVEL_CAP) {
    const safeCurrentLevel = normalizeLevel(currentLevel, levelCap);
    const safeCurrentXp = normalizeXp(currentXp);
    return buildLevelProgressResult({
        oldLevel: safeCurrentLevel,
        currentXp: safeCurrentXp,
        gainedXp: 0,
        totalXp: safeCurrentXp,
        levelCap,
    });
}
function calculateLevelProgress(currentLevel, currentXp, gainedXp, levelCap = progression_config_1.LAUNCH_LEVEL_CAP) {
    const safeCurrentLevel = normalizeLevel(currentLevel, levelCap);
    const safeCurrentXp = normalizeXp(currentXp);
    const safeGainedXp = normalizeGainedXp(gainedXp);
    const totalXp = safeCurrentXp + safeGainedXp;
    return buildLevelProgressResult({
        oldLevel: safeCurrentLevel,
        currentXp: safeCurrentXp,
        gainedXp: safeGainedXp,
        totalXp,
        levelCap,
    });
}
function buildLevelProgressViewModel(currentLevel, currentXp, levelCap = progression_config_1.LAUNCH_LEVEL_CAP) {
    const progress = getLevelProgress(currentLevel, currentXp, levelCap);
    return {
        level: progress.newLevel,
        xp: progress.totalXp,
        totalXp: progress.totalXp,
        currentXp: progress.currentLevelXp,
        currentLevelXp: progress.currentLevelXp,
        xpToNextLevel: progress.xpToNextLevel,
        nextLevelXp: progress.nextLevelXp,
        currentLevelStartXp: progress.currentLevelStartXp,
        nextLevelRequiredXp: progress.nextLevelRequiredXp,
        xpIntoCurrentLevel: progress.xpIntoCurrentLevel,
        xpNeededForNextLevel: progress.xpNeededForNextLevel,
        progressPercent: progress.progressPercent,
        xpProgressPercent: progress.xpProgressPercent,
        levelCap: progress.levelCap,
        isAtLevelCap: progress.isAtLevelCap,
    };
}
//# sourceMappingURL=level.util.js.map