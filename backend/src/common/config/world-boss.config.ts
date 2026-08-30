export const WORLD_BOSS_SCHEDULE_CONFIG = Object.freeze({
  entryWindowSeconds: 15 * 60,
  initialLobbyLeadSeconds: 10 * 60,
  eventDurationSeconds: 3 * 60 * 60,
  slots: [
    {
      index: 0,
      key: 'SHORT',
      label: 'Contencao',
      respawnSeconds: 6 * 60 * 60,
    },
    {
      index: 1,
      key: 'LONG',
      label: 'Exterminio',
      respawnSeconds: 12 * 60 * 60,
    },
  ],
} as const);

export const WORLD_BOSS_REWARD_CONFIG = Object.freeze({
  nonDefeatedChanceMultiplier: 0.55,
  collectiveMultipliers: {
    defeated: 1,
    progress75: 0.75,
    progress50: 0.5,
    progress25: 0.3,
    progressBelow25: 0.15,
  },
} as const);

export function getWorldBossRespawnSeconds(slotIndex: number) {
  return (
    WORLD_BOSS_SCHEDULE_CONFIG.slots.find((slot) => slot.index === slotIndex) ??
    WORLD_BOSS_SCHEDULE_CONFIG.slots[1]
  ).respawnSeconds;
}

export function getWorldBossCollectiveRewardMultiplier(params: {
  defeated: boolean;
  progressRatio: number;
}) {
  const multipliers = WORLD_BOSS_REWARD_CONFIG.collectiveMultipliers;
  if (params.defeated) return multipliers.defeated;

  const progress = Math.max(0, Math.min(1, params.progressRatio));
  if (progress >= 0.75) return multipliers.progress75;
  if (progress >= 0.5) return multipliers.progress50;
  if (progress >= 0.25) return multipliers.progress25;
  return multipliers.progressBelow25;
}
