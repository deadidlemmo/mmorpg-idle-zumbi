import {
  AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY,
  AUTO_COMBAT_HUNTING_MIN_SECONDS_PER_ENEMY,
  AUTO_COMBAT_HUNTING_SPEED_GAIN_PER_LEVEL,
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
