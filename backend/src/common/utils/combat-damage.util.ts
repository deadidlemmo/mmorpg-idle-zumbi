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

export function calculateCombatDamage(attack: number, defense: number) {
  const damageDetails = calculateCombatDamageDetails(attack, defense);

  return damageDetails.baseDamage;
}

export function calculateCombatDamageDetails(
  attack: number,
  defense: number,
): CombatDamageDetails {
  const safeAttack = Math.max(1, attack);
  const safeDefense = Math.max(0, defense);

  const defenseScale = 1.6;
  const maxReductionRate = 0.8;
  const minimumDamageRate = 0.12;

  const reductionRate = Math.min(
    maxReductionRate,
    safeDefense / (safeDefense + safeAttack * defenseScale),
  );

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

export function calculateVariableCombatDamage(params: {
  attack: number;
  defense: number;
  minMultiplier?: number;
  maxMultiplier?: number;
}): CombatDamageResult {
  const { attack, defense, minMultiplier = 0.9, maxMultiplier = 1.1 } = params;

  const damageDetails = calculateCombatDamageDetails(attack, defense);

  const safeMinMultiplier = Math.max(0.1, minMultiplier);
  const safeMaxMultiplier = Math.max(safeMinMultiplier, maxMultiplier);

  const variationMultiplier =
    safeMinMultiplier + Math.random() * (safeMaxMultiplier - safeMinMultiplier);

  const finalDamage = Math.max(
    damageDetails.minimumDamage,
    Math.floor(damageDetails.baseDamage * variationMultiplier),
  );

  const minPossibleDamage = Math.max(
    damageDetails.minimumDamage,
    Math.floor(damageDetails.baseDamage * safeMinMultiplier),
  );

  const maxPossibleDamage = Math.max(
    damageDetails.minimumDamage,
    Math.floor(damageDetails.baseDamage * safeMaxMultiplier),
  );

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

export function calculateCombatHit(
  params: CalculateCombatHitParams,
): CombatHitResult {
  const {
    attack,
    defense,

    attackerPrecision = 1,
    attackerTechnique = 1,
    defenderAgility = 1,

    minMultiplier = 0.9,
    maxMultiplier = 1.1,

    baseCriticalChance = 4,
    minCriticalChance = 3,
    maxCriticalChance = 28,

    baseCriticalMultiplier = 1.45,
    maxCriticalMultiplier = 1.85,

    baseDodgeChance = 4,
    minDodgeChance = 2,
    maxDodgeChance = 28,
  } = params;

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

  const maxPossibleCriticalDamage = Math.max(
    variableDamage.maxPossibleDamage + 1,
    Math.floor(
      variableDamage.maxPossibleDamage * criticalDetails.criticalMultiplier,
    ),
  );

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
    ? Math.max(
        damageBeforeCritical + 1,
        Math.floor(damageBeforeCritical * criticalDetails.criticalMultiplier),
      )
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

export function calculateDodgeDetails(params: {
  attackerPrecision: number;
  defenderAgility: number;
  baseDodgeChance?: number;
  minDodgeChance?: number;
  maxDodgeChance?: number;
}): CombatDodgeDetails {
  const {
    attackerPrecision,
    defenderAgility,
    baseDodgeChance = 4,
    minDodgeChance = 2,
    maxDodgeChance = 28,
  } = params;

  const safeAttackerPrecision = Math.max(0, attackerPrecision);
  const safeDefenderAgility = Math.max(0, defenderAgility);

  const agilityAdvantage = safeDefenderAgility - safeAttackerPrecision;

  const rawDodgeChance = baseDodgeChance + agilityAdvantage * 0.45;

  const dodgeChance = clampNumber(
    Number(rawDodgeChance.toFixed(2)),
    minDodgeChance,
    maxDodgeChance,
  );

  const dodgeRoll = randomPercent();

  const isDodged = dodgeRoll <= dodgeChance;

  return {
    isDodged,
    dodgeChance,
    dodgeRoll,
  };
}

export function calculateCriticalDetails(params: {
  attackerPrecision: number;
  attackerTechnique: number;
  defenderAgility: number;
  baseCriticalChance?: number;
  minCriticalChance?: number;
  maxCriticalChance?: number;
  baseCriticalMultiplier?: number;
  maxCriticalMultiplier?: number;
}): CombatCriticalDetails {
  const {
    attackerPrecision,
    attackerTechnique,
    defenderAgility,
    baseCriticalChance = 4,
    minCriticalChance = 3,
    maxCriticalChance = 28,
    baseCriticalMultiplier = 1.45,
    maxCriticalMultiplier = 1.85,
  } = params;

  const safePrecision = Math.max(0, attackerPrecision);
  const safeTechnique = Math.max(0, attackerTechnique);
  const safeDefenderAgility = Math.max(0, defenderAgility);

  const rawCriticalChance =
    baseCriticalChance +
    safePrecision * 0.18 +
    safeTechnique * 0.12 -
    safeDefenderAgility * 0.12;

  const criticalChance = clampNumber(
    Number(rawCriticalChance.toFixed(2)),
    minCriticalChance,
    maxCriticalChance,
  );

  const rawCriticalMultiplier = baseCriticalMultiplier + safeTechnique * 0.004;

  const criticalMultiplier = clampNumber(
    Number(rawCriticalMultiplier.toFixed(2)),
    baseCriticalMultiplier,
    maxCriticalMultiplier,
  );

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

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}
