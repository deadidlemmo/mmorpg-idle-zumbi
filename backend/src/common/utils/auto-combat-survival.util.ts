import { calculateCombatDamageDetails } from './combat-damage.util';

export type AutoCombatSurvivalRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';

export type AutoCombatSurvivalProjection = {
  riskLevel: AutoCombatSurvivalRiskLevel;
  expectedDamagePerKill: number;
  expectedMobHitDamage: number;
  expectedDodgeChancePercent: number;
  expectedCriticalChancePercent: number;
  expectedCriticalMultiplier: number;
  projectedKills: number;
  safeKillsWithoutPotions: number;
  safeKillsWithPotions: number;
  extraKillsFromPotions: number;
  expectedPotionsUsed: number;
  availablePotions: number;
  potionHealAmount: number;
  potionTriggerPercent: number | null;
  projectedFinalHp: number;
  projectedFinalHpPercent: number;
  willSurviveProjection: boolean;
  hpLimited: boolean;
};

export type ProjectAutoCombatSurvivalParams = {
  currentHp: number;
  maxHp: number;
  playerDefense: number;
  playerAgility: number;
  mobAttack: number;
  mobPrecision: number;
  mobTechnique: number;
  projectedKills: number;
  potion?: {
    availableQuantity?: number | null;
    healAmount?: number | null;
    hpThresholdPercent?: number | null;
  } | null;
};

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function roundNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

export function getExpectedIncomingDamagePerKill(params: {
  mobAttack: number;
  mobPrecision: number;
  mobTechnique: number;
  playerDefense: number;
  playerAgility: number;
}) {
  const safeMobPrecision = Math.max(0, Number(params.mobPrecision) || 0);
  const safeMobTechnique = Math.max(0, Number(params.mobTechnique) || 0);
  const safePlayerAgility = Math.max(0, Number(params.playerAgility) || 0);

  const damageDetails = calculateCombatDamageDetails(
    params.mobAttack,
    params.playerDefense,
  );
  const dodgeChancePercent = clampNumber(
    4 + (safePlayerAgility - safeMobPrecision) * 0.45,
    2,
    28,
  );
  const criticalChancePercent = clampNumber(
    4 +
      safeMobPrecision * 0.18 +
      safeMobTechnique * 0.12 -
      safePlayerAgility * 0.12,
    3,
    28,
  );
  const criticalMultiplier = clampNumber(
    1.45 + safeMobTechnique * 0.004,
    1.45,
    1.85,
  );
  const hitRate = 1 - dodgeChancePercent / 100;
  const expectedCriticalMultiplier =
    1 + (criticalChancePercent / 100) * (criticalMultiplier - 1);
  const expectedDamage =
    damageDetails.baseDamage * hitRate * expectedCriticalMultiplier;

  return {
    expectedDamagePerKill: roundNumber(Math.max(0, expectedDamage), 2),
    expectedMobHitDamage: damageDetails.baseDamage,
    expectedDodgeChancePercent: roundNumber(dodgeChancePercent, 2),
    expectedCriticalChancePercent: roundNumber(criticalChancePercent, 2),
    expectedCriticalMultiplier: roundNumber(criticalMultiplier, 2),
  };
}

function simulateSurvival(params: {
  currentHp: number;
  maxHp: number;
  expectedDamagePerKill: number;
  projectedKills: number;
  availablePotions: number;
  potionHealAmount: number;
  potionTriggerPercent: number | null;
}) {
  const projectedKills = Math.max(0, Math.floor(params.projectedKills));
  const maxHp = Math.max(0, params.maxHp);
  const thresholdHp =
    params.potionTriggerPercent !== null
      ? Math.floor((maxHp * params.potionTriggerPercent) / 100)
      : null;

  let hp = clampNumber(params.currentHp, 0, maxHp);
  let safeKills = 0;
  let potionsRemaining = Math.max(0, Math.floor(params.availablePotions));
  let potionsUsed = 0;

  for (let kill = 0; kill < projectedKills; kill++) {
    if (hp <= 0) {
      break;
    }

    hp = Math.max(0, hp - params.expectedDamagePerKill);

    if (hp <= 0) {
      break;
    }

    if (
      thresholdHp !== null &&
      potionsRemaining > 0 &&
      params.potionHealAmount > 0 &&
      hp <= thresholdHp
    ) {
      hp = clampNumber(hp + params.potionHealAmount, 0, maxHp);
      potionsRemaining--;
      potionsUsed++;
    }

    if (hp <= 0) {
      break;
    }

    safeKills++;
  }

  return {
    safeKills,
    potionsUsed,
    finalHp: roundNumber(hp, 2),
  };
}

export function projectAutoCombatSurvival(
  params: ProjectAutoCombatSurvivalParams,
): AutoCombatSurvivalProjection {
  const currentHp = Math.max(0, Number(params.currentHp) || 0);
  const maxHp = Math.max(0, Number(params.maxHp) || 0);
  const projectedKills = Math.max(0, Math.floor(Number(params.projectedKills) || 0));
  const availablePotions = Math.max(
    0,
    Math.floor(Number(params.potion?.availableQuantity) || 0),
  );
  const potionHealAmount = Math.max(0, Number(params.potion?.healAmount) || 0);
  const potionTriggerPercent =
    params.potion?.hpThresholdPercent === null ||
    params.potion?.hpThresholdPercent === undefined
      ? null
      : clampNumber(Number(params.potion.hpThresholdPercent) || 0, 1, 100);
  const incomingDamage = getExpectedIncomingDamagePerKill(params);

  if (projectedKills <= 0 || maxHp <= 0 || currentHp <= 0) {
    return {
      riskLevel: currentHp > 0 ? 'LOW' : 'LETHAL',
      ...incomingDamage,
      projectedKills,
      safeKillsWithoutPotions: 0,
      safeKillsWithPotions: 0,
      extraKillsFromPotions: 0,
      expectedPotionsUsed: 0,
      availablePotions,
      potionHealAmount,
      potionTriggerPercent,
      projectedFinalHp: roundNumber(currentHp, 2),
      projectedFinalHpPercent: maxHp > 0 ? roundNumber((currentHp / maxHp) * 100) : 0,
      willSurviveProjection: projectedKills <= 0 && currentHp > 0,
      hpLimited: currentHp <= 0,
    };
  }

  const withoutPotions = simulateSurvival({
    currentHp,
    maxHp,
    expectedDamagePerKill: incomingDamage.expectedDamagePerKill,
    projectedKills,
    availablePotions: 0,
    potionHealAmount: 0,
    potionTriggerPercent: null,
  });
  const withPotions = simulateSurvival({
    currentHp,
    maxHp,
    expectedDamagePerKill: incomingDamage.expectedDamagePerKill,
    projectedKills,
    availablePotions,
    potionHealAmount,
    potionTriggerPercent,
  });
  const projectedFinalHpPercent =
    maxHp > 0 ? roundNumber((withPotions.finalHp / maxHp) * 100) : 0;
  const willSurviveProjection = withPotions.safeKills >= projectedKills;

  let riskLevel: AutoCombatSurvivalRiskLevel = 'LOW';

  if (!willSurviveProjection) {
    riskLevel = withPotions.safeKills <= 0 ? 'LETHAL' : 'HIGH';
  } else if (projectedFinalHpPercent < 25) {
    riskLevel = 'HIGH';
  } else if (projectedFinalHpPercent < 55) {
    riskLevel = 'MEDIUM';
  }

  return {
    riskLevel,
    ...incomingDamage,
    projectedKills,
    safeKillsWithoutPotions: withoutPotions.safeKills,
    safeKillsWithPotions: withPotions.safeKills,
    extraKillsFromPotions: Math.max(
      0,
      withPotions.safeKills - withoutPotions.safeKills,
    ),
    expectedPotionsUsed: withPotions.potionsUsed,
    availablePotions,
    potionHealAmount,
    potionTriggerPercent,
    projectedFinalHp: withPotions.finalHp,
    projectedFinalHpPercent,
    willSurviveProjection,
    hpLimited: !willSurviveProjection,
  };
}
