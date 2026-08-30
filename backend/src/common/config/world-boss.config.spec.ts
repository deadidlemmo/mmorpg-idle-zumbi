import {
  getWorldBossCollectiveRewardMultiplier,
  getWorldBossRespawnSeconds,
  WORLD_BOSS_SCHEDULE_CONFIG,
} from './world-boss.config';

describe('world boss config', () => {
  it('mantem os dois intervalos canonicos de reaparecimento', () => {
    expect(getWorldBossRespawnSeconds(0)).toBe(6 * 60 * 60);
    expect(getWorldBossRespawnSeconds(1)).toBe(12 * 60 * 60);
    expect(WORLD_BOSS_SCHEDULE_CONFIG.entryWindowSeconds).toBe(15 * 60);
    expect(WORLD_BOSS_SCHEDULE_CONFIG.eventDurationSeconds).toBe(3 * 60 * 60);
  });

  it.each([
    [true, 0, 1],
    [false, 0.9, 0.75],
    [false, 0.75, 0.75],
    [false, 0.5, 0.5],
    [false, 0.25, 0.3],
    [false, 0.24, 0.15],
  ])(
    'calcula o multiplicador para defeated=%s e progresso=%s',
    (defeated, progressRatio, expected) => {
      expect(
        getWorldBossCollectiveRewardMultiplier({
          defeated,
          progressRatio,
        }),
      ).toBe(expected);
    },
  );
});
