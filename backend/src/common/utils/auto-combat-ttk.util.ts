import {
  AUTO_COMBAT_TTK_BASE_TIMES_BY_MOB_INDEX,
  AUTO_COMBAT_TTK_MAX_SECONDS,
  AUTO_COMBAT_TTK_MIN_SECONDS,
  AUTO_COMBAT_TTK_POWER_EXPONENT,
  AUTO_COMBAT_TTK_POWER_MULTIPLIERS_BY_MOB_INDEX,
} from '../config/auto-combat.config';

export type AutoCombatTtkDifficultyLabel =
  | 'Muito facil'
  | 'Ideal'
  | 'Desafiador'
  | 'Perigoso'
  | 'Ineficiente';

export type AutoCombatTtkStatsInput = {
  attack?: number | null;
  speed?: number | null;
  precision?: number | null;
  technique?: number | null;
  agility?: number | null;
};

export type AutoCombatTtkMobInput = {
  tier?: number | null;
  level?: number | null;
  hp?: number | null;
  attack?: number | null;
  defense?: number | null;
  speed?: number | null;
  xpReward?: number | null;
  name?: string | null;
};

export function clampAutoCombatTtkSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return AUTO_COMBAT_TTK_MAX_SECONDS;
  }

  return Math.min(
    AUTO_COMBAT_TTK_MAX_SECONDS,
    Math.max(AUTO_COMBAT_TTK_MIN_SECONDS, value),
  );
}

export function getAutoCombatMobIndex(mob: AutoCombatTtkMobInput) {
  const candidates = [mob.level, mob.hp, mob.attack, mob.defense, mob.speed]
    .map((value) => Math.floor(Number(value) || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (candidates.length <= 0) {
    return 1;
  }

  const inferredIndex = Math.min(...candidates);

  return Math.min(
    AUTO_COMBAT_TTK_BASE_TIMES_BY_MOB_INDEX.length,
    Math.max(1, inferredIndex),
  );
}

export function getAutoCombatBaseKillTimeSeconds(mobIndex: number) {
  const safeIndex = Math.min(
    AUTO_COMBAT_TTK_BASE_TIMES_BY_MOB_INDEX.length,
    Math.max(1, Math.floor(Number(mobIndex) || 1)),
  );

  return AUTO_COMBAT_TTK_BASE_TIMES_BY_MOB_INDEX[safeIndex - 1];
}

export function getAutoCombatRecommendedPower(params: {
  tier?: number | null;
  mobIndex: number;
}) {
  const safeTier = Math.max(1, Math.floor(Number(params.tier) || 1));
  const safeIndex = Math.min(
    AUTO_COMBAT_TTK_POWER_MULTIPLIERS_BY_MOB_INDEX.length,
    Math.max(1, Math.floor(Number(params.mobIndex) || 1)),
  );
  const tierBasePower = 20 * Math.pow(safeTier, 1.85);

  return Math.max(
    1,
    tierBasePower * AUTO_COMBAT_TTK_POWER_MULTIPLIERS_BY_MOB_INDEX[safeIndex - 1],
  );
}

export function calculatePlayerOffensivePower(stats: AutoCombatTtkStatsInput) {
  const attack = Math.max(1, Number(stats.attack) || 1);
  const speed = Math.max(1, Number(stats.speed) || 1);
  const precision = Math.max(0, Number(stats.precision) || 0);
  const technique = Math.max(0, Number(stats.technique) || 0);
  const agility = Math.max(0, Number(stats.agility) || 0);

  const attackSpeed = 1 + speed / 120;
  const hitChance = Math.min(1.35, Math.max(0.65, 0.85 + precision / 220));
  const critChance = Math.min(0.65, Math.max(0, technique / 300));
  const critDamageMultiplier = 1.5 + Math.min(0.75, agility / 400);
  const averageCritMultiplier =
    1 + critChance * (critDamageMultiplier - 1);

  return Math.max(1, attack * attackSpeed * hitChance * averageCritMultiplier);
}

export function calculateAutoCombatTtkSeconds(params: {
  baseKillTimeSeconds: number;
  recommendedPower: number;
  playerOffensivePower: number;
}) {
  const baseKillTimeSeconds = Math.max(
    AUTO_COMBAT_TTK_MIN_SECONDS,
    Number(params.baseKillTimeSeconds) || AUTO_COMBAT_TTK_MIN_SECONDS,
  );
  const recommendedPower = Math.max(1, Number(params.recommendedPower) || 1);
  const playerOffensivePower = Math.max(
    1,
    Number(params.playerOffensivePower) || 1,
  );
  const rawSeconds =
    baseKillTimeSeconds *
    Math.pow(
      recommendedPower / playerOffensivePower,
      AUTO_COMBAT_TTK_POWER_EXPONENT,
    );

  return clampAutoCombatTtkSeconds(rawSeconds);
}

export function getAutoCombatTtkDifficultyLabel(
  finalKillTimeSeconds: number,
): AutoCombatTtkDifficultyLabel {
  if (finalKillTimeSeconds < 3) {
    return 'Muito facil';
  }

  if (finalKillTimeSeconds < 15) {
    return 'Ideal';
  }

  if (finalKillTimeSeconds < 45) {
    return 'Desafiador';
  }

  if (finalKillTimeSeconds < 90) {
    return 'Perigoso';
  }

  return 'Ineficiente';
}

export function calculateAutoCombatTtk(params: {
  mob: AutoCombatTtkMobInput;
  playerStats: AutoCombatTtkStatsInput;
}) {
  const mobIndex = getAutoCombatMobIndex(params.mob);
  const baseKillTimeSeconds = getAutoCombatBaseKillTimeSeconds(mobIndex);
  const recommendedPower = getAutoCombatRecommendedPower({
    tier: params.mob.tier,
    mobIndex,
  });
  const playerOffensivePower = calculatePlayerOffensivePower(
    params.playerStats,
  );
  const estimatedKillTimeSeconds = calculateAutoCombatTtkSeconds({
    baseKillTimeSeconds,
    recommendedPower,
    playerOffensivePower,
  });

  return {
    mobIndex,
    tier: Math.max(1, Math.floor(Number(params.mob.tier) || 1)),
    baseKillTimeSeconds,
    estimatedKillTimeSeconds,
    playerOffensivePower,
    monsterRecommendedPower: recommendedPower,
    killsPerMinute: 60 / estimatedKillTimeSeconds,
    killsPerHour: 3600 / estimatedKillTimeSeconds,
    difficultyLabel: getAutoCombatTtkDifficultyLabel(
      estimatedKillTimeSeconds,
    ),
  };
}
