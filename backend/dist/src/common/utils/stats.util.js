"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyPrimaryStats = createEmptyPrimaryStats;
exports.getBasePrimaryStats = getBasePrimaryStats;
exports.getLevelPrimaryBonus = getLevelPrimaryBonus;
exports.getEquipmentPrimaryBonus = getEquipmentPrimaryBonus;
exports.sumPrimaryStats = sumPrimaryStats;
exports.sumManyPrimaryStats = sumManyPrimaryStats;
exports.calculateDerivedCombatStats = calculateDerivedCombatStats;
exports.calculateFullStats = calculateFullStats;
const level_stats_util_1 = require("./level-stats.util");
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
function getBasePrimaryStats(gameClass) {
    return {
        strength: gameClass.baseStrength,
        vitality: gameClass.baseVitality,
        agility: gameClass.baseAgility,
        precision: gameClass.basePrecision,
        technique: gameClass.baseTechnique,
        willpower: gameClass.baseWillpower,
    };
}
function getLevelPrimaryBonus(className, level) {
    const safeLevel = Math.max(1, level);
    return (0, level_stats_util_1.calculateLevelBonusStatsByClass)(className, safeLevel);
}
function getEquipmentPrimaryBonus(equipmentItems) {
    return equipmentItems.filter(Boolean).reduce((total, item) => {
        return {
            strength: total.strength + (item?.strengthBonus ?? 0),
            vitality: total.vitality + (item?.vitalityBonus ?? 0),
            agility: total.agility + (item?.agilityBonus ?? 0),
            precision: total.precision + (item?.precisionBonus ?? 0),
            technique: total.technique + (item?.techniqueBonus ?? 0),
            willpower: total.willpower + (item?.willpowerBonus ?? 0),
        };
    }, createEmptyPrimaryStats());
}
function sumPrimaryStats(baseStats, bonusStats) {
    return {
        strength: baseStats.strength + bonusStats.strength,
        vitality: baseStats.vitality + bonusStats.vitality,
        agility: baseStats.agility + bonusStats.agility,
        precision: baseStats.precision + bonusStats.precision,
        technique: baseStats.technique + bonusStats.technique,
        willpower: baseStats.willpower + bonusStats.willpower,
    };
}
function sumManyPrimaryStats(statsList) {
    return statsList.reduce((total, stats) => sumPrimaryStats(total, stats), createEmptyPrimaryStats());
}
function calculateDerivedCombatStats(className, level, stats) {
    const safeLevel = Math.max(1, level);
    const normalizedClassName = className
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const classHpBonus = (0, level_stats_util_1.getClassHpBonus)(className);
    const maxHp = 120 +
        (safeLevel - 1) * 12 +
        stats.vitality * 6 +
        stats.willpower * 3 +
        classHpBonus;
    const defense = stats.vitality + stats.willpower;
    const speed = stats.agility;
    let attack;
    switch (normalizedClassName) {
        case 'lutador':
            attack = stats.strength * 2;
            break;
        case 'atirador':
            attack = stats.precision * 2;
            break;
        case 'assassino':
            attack = stats.agility + stats.precision;
            break;
        case 'medico':
            attack = stats.technique + stats.precision;
            break;
        default:
            attack = stats.strength + stats.precision;
            break;
    }
    return {
        maxHp,
        attack,
        defense,
        speed,
    };
}
function calculateFullStats(gameClass, equipmentItems, level = 1) {
    const safeLevel = Math.max(1, level);
    const basePrimaryStats = getBasePrimaryStats(gameClass);
    const levelBonusStats = getLevelPrimaryBonus(gameClass.name, safeLevel);
    const equipmentBonusStats = getEquipmentPrimaryBonus(equipmentItems);
    const totalPrimaryStats = sumManyPrimaryStats([
        basePrimaryStats,
        levelBonusStats,
        equipmentBonusStats,
    ]);
    const derivedCombatStats = calculateDerivedCombatStats(gameClass.name, safeLevel, totalPrimaryStats);
    return {
        level: safeLevel,
        basePrimaryStats,
        levelBonusStats,
        equipmentBonusStats,
        totalPrimaryStats,
        derivedCombatStats,
    };
}
//# sourceMappingURL=stats.util.js.map