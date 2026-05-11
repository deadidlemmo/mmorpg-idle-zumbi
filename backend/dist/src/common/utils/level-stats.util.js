"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLASS_STAT_AFFINITY = exports.LEVEL_ONE_IGNORED_STAT_VALUE = exports.LEVEL_ONE_SECONDARY_STAT_VALUE = exports.LEVEL_ONE_PRIMARY_STAT_VALUE = exports.SECONDARY_STAT_LEVEL_GAIN = exports.PRIMARY_STAT_LEVEL_GAIN = exports.LEVEL_UP_TOTAL_POINTS = exports.LEVEL_ONE_TOTAL_POINTS = void 0;
exports.createEmptyPrimaryStats = createEmptyPrimaryStats;
exports.getClassStatAffinity = getClassStatAffinity;
exports.calculateLevelOneStatsByClass = calculateLevelOneStatsByClass;
exports.calculateLevelBonusStatsByClass = calculateLevelBonusStatsByClass;
exports.calculateClassStatsAtLevel = calculateClassStatsAtLevel;
exports.getClassHpBonus = getClassHpBonus;
exports.addPrimaryStats = addPrimaryStats;
exports.LEVEL_ONE_TOTAL_POINTS = 30;
exports.LEVEL_UP_TOTAL_POINTS = 6;
exports.PRIMARY_STAT_LEVEL_GAIN = 2;
exports.SECONDARY_STAT_LEVEL_GAIN = 1;
exports.LEVEL_ONE_PRIMARY_STAT_VALUE = 8;
exports.LEVEL_ONE_SECONDARY_STAT_VALUE = 5;
exports.LEVEL_ONE_IGNORED_STAT_VALUE = 2;
exports.CLASS_STAT_AFFINITY = {
    Lutador: {
        primary: ['strength', 'vitality'],
        secondary: ['technique', 'willpower'],
        ignored: ['agility', 'precision'],
        hpBonus: 35,
    },
    Assassino: {
        primary: ['agility', 'precision'],
        secondary: ['technique', 'strength'],
        ignored: ['vitality', 'willpower'],
        hpBonus: 0,
    },
    Atirador: {
        primary: ['precision', 'agility'],
        secondary: ['strength', 'technique'],
        ignored: ['vitality', 'willpower'],
        hpBonus: 10,
    },
    Médico: {
        primary: ['technique', 'willpower'],
        secondary: ['vitality', 'precision'],
        ignored: ['strength', 'agility'],
        hpBonus: 20,
    },
};
function createEmptyPrimaryStats() {
    return {
        strength: 0,
        vitality: 0,
        agility: 0,
        precision: 0,
        technique: 0,
        willpower: 0,
    };
}
function getClassStatAffinity(className) {
    const affinity = exports.CLASS_STAT_AFFINITY[className];
    if (!affinity) {
        throw new Error(`Afinidade de atributos não configurada para ${className}.`);
    }
    return affinity;
}
function calculateLevelOneStatsByClass(className) {
    const affinity = getClassStatAffinity(className);
    const stats = createEmptyPrimaryStats();
    for (const stat of affinity.primary) {
        stats[stat] = exports.LEVEL_ONE_PRIMARY_STAT_VALUE;
    }
    for (const stat of affinity.secondary) {
        stats[stat] = exports.LEVEL_ONE_SECONDARY_STAT_VALUE;
    }
    for (const stat of affinity.ignored) {
        stats[stat] = exports.LEVEL_ONE_IGNORED_STAT_VALUE;
    }
    return stats;
}
function calculateLevelBonusStatsByClass(className, level) {
    const safeLevel = Math.max(1, level);
    const levelUps = safeLevel - 1;
    const affinity = getClassStatAffinity(className);
    const stats = createEmptyPrimaryStats();
    for (const stat of affinity.primary) {
        stats[stat] += levelUps * exports.PRIMARY_STAT_LEVEL_GAIN;
    }
    for (const stat of affinity.secondary) {
        stats[stat] += levelUps * exports.SECONDARY_STAT_LEVEL_GAIN;
    }
    return stats;
}
function calculateClassStatsAtLevel(className, level) {
    const levelOneStats = calculateLevelOneStatsByClass(className);
    const levelBonusStats = calculateLevelBonusStatsByClass(className, level);
    return {
        strength: levelOneStats.strength + levelBonusStats.strength,
        vitality: levelOneStats.vitality + levelBonusStats.vitality,
        agility: levelOneStats.agility + levelBonusStats.agility,
        precision: levelOneStats.precision + levelBonusStats.precision,
        technique: levelOneStats.technique + levelBonusStats.technique,
        willpower: levelOneStats.willpower + levelBonusStats.willpower,
    };
}
function getClassHpBonus(className) {
    return getClassStatAffinity(className).hpBonus;
}
function addPrimaryStats(baseStats, bonusStats) {
    return {
        strength: baseStats.strength + bonusStats.strength,
        vitality: baseStats.vitality + bonusStats.vitality,
        agility: baseStats.agility + bonusStats.agility,
        precision: baseStats.precision + bonusStats.precision,
        technique: baseStats.technique + bonusStats.technique,
        willpower: baseStats.willpower + bonusStats.willpower,
    };
}
//# sourceMappingURL=level-stats.util.js.map