import {
  AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY,
  AUTO_COMBAT_HUNTING_LEVEL_CAP,
  AUTO_COMBAT_HUNTING_MIN_SECONDS_PER_ENEMY,
  AUTO_COMBAT_HUNTING_SPEED_GAIN_PER_LEVEL,
  AUTO_COMBAT_HUNTING_XP_BASE_TO_NEXT_LEVEL,
  AUTO_COMBAT_HUNTING_XP_LINEAR_SCALE,
  AUTO_COMBAT_HUNTING_XP_POWER_EXPONENT,
  AUTO_COMBAT_HUNTING_XP_POWER_SCALE,
  AUTO_COMBAT_HUNTING_XP_PER_ENEMY,
} from '../config/auto-combat.config';

type AutoCombatHuntingXpInput = {
  mob?: {
    tier?: number | null;
    level?: number | null;
  } | null;
  weight?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getAutoCombatHuntingSecondsPerEnemy(level: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const speedMultiplier =
    1 + (safeLevel - 1) * AUTO_COMBAT_HUNTING_SPEED_GAIN_PER_LEVEL;
  const seconds = Math.round(
    AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY / speedMultiplier,
  );

  return Math.max(AUTO_COMBAT_HUNTING_MIN_SECONDS_PER_ENEMY, seconds);
}

export function getAutoCombatHuntingXpToNextLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

  if (safeLevel >= AUTO_COMBAT_HUNTING_LEVEL_CAP) {
    return null;
  }

  return (
    AUTO_COMBAT_HUNTING_XP_BASE_TO_NEXT_LEVEL +
    safeLevel * AUTO_COMBAT_HUNTING_XP_LINEAR_SCALE +
    Math.floor(
      Math.pow(safeLevel, AUTO_COMBAT_HUNTING_XP_POWER_EXPONENT) *
        AUTO_COMBAT_HUNTING_XP_POWER_SCALE,
    )
  );
}

export function getAutoCombatHuntingXpForEncounter(
  input?: AutoCombatHuntingXpInput | null,
) {
  const tier = clamp(Math.floor(Number(input?.mob?.tier) || 1), 1, 10);
  const level = Math.max(1, Math.floor(Number(input?.mob?.level) || 1));
  const weight = Math.max(0, Math.floor(Number(input?.weight) || 0));
  const tierStartLevel = (tier - 1) * 10 + 1;
  const tierProgress = clamp((level - tierStartLevel) / 9, 0, 1);
  const tierBonus = tier - 1;
  const levelBonus = Math.floor(tierProgress * 2);
  const rarityBonus =
    weight > 0 && weight <= 6 ? 2 : weight > 0 && weight <= 15 ? 1 : 0;

  return Math.max(
    AUTO_COMBAT_HUNTING_XP_PER_ENEMY,
    AUTO_COMBAT_HUNTING_XP_PER_ENEMY + tierBonus + levelBonus + rarityBonus,
  );
}
