import {
  AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY,
  AUTO_COMBAT_HUNTING_LEVEL_CAP,
  AUTO_COMBAT_HUNTING_MIN_SECONDS_PER_ENEMY,
  AUTO_COMBAT_HUNTING_SPEED_GAIN_PER_LEVEL,
  AUTO_COMBAT_HUNTING_XP_BASE_TO_NEXT_LEVEL,
  AUTO_COMBAT_HUNTING_XP_LINEAR_SCALE,
  AUTO_COMBAT_HUNTING_XP_POWER_EXPONENT,
  AUTO_COMBAT_HUNTING_XP_POWER_SCALE,
} from '../config/auto-combat.config';

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
