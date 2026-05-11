"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCombatDamage = calculateCombatDamage;
exports.calculateCombatDamageDetails = calculateCombatDamageDetails;
exports.calculateVariableCombatDamage = calculateVariableCombatDamage;
exports.calculateCombatHit = calculateCombatHit;
exports.calculateDodgeDetails = calculateDodgeDetails;
exports.calculateCriticalDetails = calculateCriticalDetails;
function calculateCombatDamage(attack, defense) {
    const damageDetails = calculateCombatDamageDetails(attack, defense);
    return damageDetails.baseDamage;
}
function calculateCombatDamageDetails(attack, defense) {
    const safeAttack = Math.max(1, attack);
    const safeDefense = Math.max(0, defense);
    const defenseScale = 2;
    const maxReductionRate = 0.75;
    const minimumDamageRate = 0.15;
    const reductionRate = Math.min(maxReductionRate, safeDefense / (safeDefense + safeAttack * defenseScale));
    const reducedDamage = Math.floor(safeAttack * (1 - reductionRate));
    const minimumDamage = Math.max(1, Math.ceil(safeAttack * minimumDamageRate));
    const baseDamage = Math.max(minimumDamage, reducedDamage);
    return {
        attack: safeAttack,
        defense: safeDefense,
        reductionRate: Number(reductionRate.toFixed(4)),
        minimumDamage,
        baseDamage,
    };
}
function calculateVariableCombatDamage(params) {
    const { attack, defense, minMultiplier = 0.9, maxMultiplier = 1.1, } = params;
    const damageDetails = calculateCombatDamageDetails(attack, defense);
    const safeMinMultiplier = Math.max(0.1, minMultiplier);
    const safeMaxMultiplier = Math.max(safeMinMultiplier, maxMultiplier);
    const variationMultiplier = safeMinMultiplier +
        Math.random() * (safeMaxMultiplier - safeMinMultiplier);
    const finalDamage = Math.max(damageDetails.minimumDamage, Math.floor(damageDetails.baseDamage * variationMultiplier));
    const minPossibleDamage = Math.max(damageDetails.minimumDamage, Math.floor(damageDetails.baseDamage * safeMinMultiplier));
    const maxPossibleDamage = Math.max(damageDetails.minimumDamage, Math.floor(damageDetails.baseDamage * safeMaxMultiplier));
    return {
        attack: damageDetails.attack,
        defense: damageDetails.defense,
        reductionRate: damageDetails.reductionRate,
        minimumDamage: damageDetails.minimumDamage,
        baseDamage: damageDetails.baseDamage,
        finalDamage,
        variationMultiplier: Number(variationMultiplier.toFixed(4)),
        minPossibleDamage,
        maxPossibleDamage,
    };
}
function calculateCombatHit(params) {
    const { attack, defense, attackerPrecision = 1, attackerTechnique = 1, defenderAgility = 1, minMultiplier = 0.9, maxMultiplier = 1.1, baseCriticalChance = 5, minCriticalChance = 5, maxCriticalChance = 35, baseCriticalMultiplier = 1.5, maxCriticalMultiplier = 2, baseDodgeChance = 5, minDodgeChance = 1, maxDodgeChance = 35, } = params;
    const variableDamage = calculateVariableCombatDamage({
        attack,
        defense,
        minMultiplier,
        maxMultiplier,
    });
    const dodgeDetails = calculateDodgeDetails({
        attackerPrecision,
        defenderAgility,
        baseDodgeChance,
        minDodgeChance,
        maxDodgeChance,
    });
    const criticalDetails = calculateCriticalDetails({
        attackerPrecision,
        attackerTechnique,
        defenderAgility,
        baseCriticalChance,
        minCriticalChance,
        maxCriticalChance,
        baseCriticalMultiplier,
        maxCriticalMultiplier,
    });
    const maxPossibleCriticalDamage = Math.max(variableDamage.maxPossibleDamage + 1, Math.floor(variableDamage.maxPossibleDamage * criticalDetails.criticalMultiplier));
    if (dodgeDetails.isDodged) {
        return {
            ...variableDamage,
            finalDamage: 0,
            damageBeforeCritical: 0,
            isDodged: true,
            dodgeChance: dodgeDetails.dodgeChance,
            dodgeRoll: dodgeDetails.dodgeRoll,
            isCritical: false,
            criticalChance: criticalDetails.criticalChance,
            criticalRoll: 0,
            criticalMultiplier: 1,
            criticalBonusDamage: 0,
            maxPossibleCriticalDamage,
        };
    }
    const damageBeforeCritical = variableDamage.finalDamage;
    const finalDamage = criticalDetails.isCritical
        ? Math.max(damageBeforeCritical + 1, Math.floor(damageBeforeCritical * criticalDetails.criticalMultiplier))
        : damageBeforeCritical;
    const criticalBonusDamage = Math.max(0, finalDamage - damageBeforeCritical);
    return {
        ...variableDamage,
        finalDamage,
        damageBeforeCritical,
        isDodged: false,
        dodgeChance: dodgeDetails.dodgeChance,
        dodgeRoll: dodgeDetails.dodgeRoll,
        isCritical: criticalDetails.isCritical,
        criticalChance: criticalDetails.criticalChance,
        criticalRoll: criticalDetails.criticalRoll,
        criticalMultiplier: criticalDetails.criticalMultiplier,
        criticalBonusDamage,
        maxPossibleCriticalDamage,
    };
}
function calculateDodgeDetails(params) {
    const { attackerPrecision, defenderAgility, baseDodgeChance = 5, minDodgeChance = 1, maxDodgeChance = 35, } = params;
    const safeAttackerPrecision = Math.max(0, attackerPrecision);
    const safeDefenderAgility = Math.max(0, defenderAgility);
    const agilityAdvantage = safeDefenderAgility - safeAttackerPrecision;
    const rawDodgeChance = baseDodgeChance + agilityAdvantage * 0.75;
    const dodgeChance = clampNumber(Number(rawDodgeChance.toFixed(2)), minDodgeChance, maxDodgeChance);
    const dodgeRoll = randomPercent();
    const isDodged = dodgeRoll <= dodgeChance;
    return {
        isDodged,
        dodgeChance,
        dodgeRoll,
    };
}
function calculateCriticalDetails(params) {
    const { attackerPrecision, attackerTechnique, defenderAgility, baseCriticalChance = 5, minCriticalChance = 5, maxCriticalChance = 35, baseCriticalMultiplier = 1.5, maxCriticalMultiplier = 2, } = params;
    const safePrecision = Math.max(0, attackerPrecision);
    const safeTechnique = Math.max(0, attackerTechnique);
    const safeDefenderAgility = Math.max(0, defenderAgility);
    const rawCriticalChance = baseCriticalChance +
        safePrecision * 0.25 +
        safeTechnique * 0.15 -
        safeDefenderAgility * 0.1;
    const criticalChance = clampNumber(Number(rawCriticalChance.toFixed(2)), minCriticalChance, maxCriticalChance);
    const rawCriticalMultiplier = baseCriticalMultiplier + safeTechnique * 0.005;
    const criticalMultiplier = clampNumber(Number(rawCriticalMultiplier.toFixed(2)), baseCriticalMultiplier, maxCriticalMultiplier);
    const criticalRoll = randomPercent();
    const isCritical = criticalRoll <= criticalChance;
    return {
        isCritical,
        criticalChance,
        criticalRoll,
        criticalMultiplier,
        criticalBonusDamage: 0,
    };
}
function randomPercent() {
    return Number((Math.random() * 100).toFixed(2));
}
function clampNumber(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
//# sourceMappingURL=combat-damage.util.js.map