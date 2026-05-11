export const LAUNCH_LEVEL_CAP = 50;
export const FUTURE_LEVEL_CAP = 100;

export const LEVELS_PER_TIER = 10;

// Base de balanceamento idle.
// 120 combates por dia = 1 combate efetivo a cada 12 minutos.
export const EXPECTED_COMBATS_PER_DAY = 120;

// Meta aproximada para o lançamento 1–50.
// Total: 4 + 8 + 12 + 16 + 20 = 60 dias.
export const TIER_TARGET_DAYS: Record<number, number> = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,

  // Preparado para expansão futura 51–100.
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
};

// XP médio aproximado dos mobs por tier,
// baseado na curva documental de monstros.
export const TIER_AVERAGE_XP_PER_COMBAT: Record<number, number> = {
  1: 9,
  2: 14,
  3: 19,
  4: 26,
  5: 35,

  // Futuro 51–100.
  6: 47,
  7: 63,
  8: 83,
  9: 107,
  10: 136,
};