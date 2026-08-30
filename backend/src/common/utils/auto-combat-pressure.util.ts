import {
  AUTO_COMBAT_OFFENSIVE_READINESS_PER_TIER_GAP,
  AUTO_COMBAT_PRESSURE_BASE_WINDOW_SECONDS,
  AUTO_COMBAT_PRESSURE_GEAR_GAP_LINEAR,
  AUTO_COMBAT_PRESSURE_GEAR_GAP_QUADRATIC,
  AUTO_COMBAT_PRESSURE_MAX_ATTACK_OPPORTUNITIES,
  AUTO_COMBAT_PRESSURE_MAX_MOB_SPEED,
  AUTO_COMBAT_PRESSURE_MIN_OVERGEAR_MULTIPLIER,
  AUTO_COMBAT_PRESSURE_OVERGEAR_REDUCTION_PER_TIER,
  AUTO_COMBAT_PRESSURE_SPEED_BASE_MULTIPLIER,
  AUTO_COMBAT_PRESSURE_SPEED_DIVISOR,
  AUTO_COMBAT_UNDERGEARED_DAMAGE_MAX_MULTIPLIER,
  AUTO_COMBAT_UNDERGEARED_DAMAGE_PER_EXCESS_GAP,
  AUTO_COMBAT_UNDERGEARED_DAMAGE_START_GAP,
} from '../config/combat-balance.config';

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function getAutoCombatEquipmentTierGap(params: {
  mobTier?: number | null;
  equipmentTier?: number | null;
}) {
  if (
    params.equipmentTier === null ||
    params.equipmentTier === undefined ||
    !Number.isFinite(Number(params.equipmentTier))
  ) {
    return 0;
  }

  const mobTier = Math.max(1, Number(params.mobTier) || 1);
  const equipmentTier = Math.max(0, Number(params.equipmentTier) || 0);

  return Number((mobTier - equipmentTier).toFixed(2));
}

export function getAutoCombatOffensiveReadinessMultiplier(params: {
  mobTier?: number | null;
  equipmentTier?: number | null;
}) {
  const tierGap = Math.max(0, getAutoCombatEquipmentTierGap(params));

  return Number(
    Math.pow(AUTO_COMBAT_OFFENSIVE_READINESS_PER_TIER_GAP, tierGap).toFixed(4),
  );
}

export function getAutoCombatGearPressureMultiplier(params: {
  mobTier?: number | null;
  equipmentTier?: number | null;
}) {
  const tierGap = getAutoCombatEquipmentTierGap(params);

  if (tierGap > 0) {
    return Number(
      (
        1 +
        tierGap * AUTO_COMBAT_PRESSURE_GEAR_GAP_LINEAR +
        tierGap * tierGap * AUTO_COMBAT_PRESSURE_GEAR_GAP_QUADRATIC
      ).toFixed(4),
    );
  }

  return Number(
    Math.max(
      AUTO_COMBAT_PRESSURE_MIN_OVERGEAR_MULTIPLIER,
      1 + tierGap * AUTO_COMBAT_PRESSURE_OVERGEAR_REDUCTION_PER_TIER,
    ).toFixed(4),
  );
}

export function getAutoCombatIncomingDamageMultiplier(params: {
  mobTier?: number | null;
  equipmentTier?: number | null;
}) {
  const tierGap = getAutoCombatEquipmentTierGap(params);
  const excessGap = Math.max(
    0,
    tierGap - AUTO_COMBAT_UNDERGEARED_DAMAGE_START_GAP,
  );

  return Number(
    clamp(
      1 + excessGap * AUTO_COMBAT_UNDERGEARED_DAMAGE_PER_EXCESS_GAP,
      1,
      AUTO_COMBAT_UNDERGEARED_DAMAGE_MAX_MULTIPLIER,
    ).toFixed(4),
  );
}

export function calculateAutoCombatAttackOpportunities(params: {
  killTimeSeconds?: number | null;
  mobSpeed?: number | null;
  mobTier?: number | null;
  equipmentTier?: number | null;
}) {
  const killTimeSeconds = Math.max(0, Number(params.killTimeSeconds) || 0);

  if (killTimeSeconds <= 0) {
    return 1;
  }

  const mobSpeed = clamp(
    Number(params.mobSpeed) || 1,
    1,
    AUTO_COMBAT_PRESSURE_MAX_MOB_SPEED,
  );
  const durationPressure =
    1 +
    Math.log2(1 + killTimeSeconds / AUTO_COMBAT_PRESSURE_BASE_WINDOW_SECONDS);
  const speedPressure =
    AUTO_COMBAT_PRESSURE_SPEED_BASE_MULTIPLIER +
    mobSpeed / AUTO_COMBAT_PRESSURE_SPEED_DIVISOR;
  const gearPressure = getAutoCombatGearPressureMultiplier(params);

  return Number(
    clamp(
      durationPressure * speedPressure * gearPressure,
      1,
      AUTO_COMBAT_PRESSURE_MAX_ATTACK_OPPORTUNITIES,
    ).toFixed(4),
  );
}

export function resolveAutoCombatAttackAttempts(params: {
  attackOpportunities: number;
  combatIndex: number;
}) {
  const attackOpportunities = clamp(
    Number(params.attackOpportunities) || 1,
    1,
    AUTO_COMBAT_PRESSURE_MAX_ATTACK_OPPORTUNITIES,
  );
  const guaranteedAttempts = Math.floor(attackOpportunities);
  const fractionalAttempt = attackOpportunities - guaranteedAttempts;
  const combatIndex = Math.max(1, Math.floor(Number(params.combatIndex) || 1));
  const deterministicPhase = (combatIndex * 0.6180339887498949) % 1;

  return Math.max(
    1,
    guaranteedAttempts + (deterministicPhase < fractionalAttempt ? 1 : 0),
  );
}
