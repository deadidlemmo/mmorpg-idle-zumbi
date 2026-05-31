export const LAUNCH_LEVEL_CAP = 50;
export const FUTURE_LEVEL_CAP = 100;

export const LEVELS_PER_TIER = 10;

// Base de balanceamento idle para auto-combate 24h.
// 7200 vitorias por dia = 1 abate efetivo a cada 12 segundos.
// O round real roda a cada 3 segundos, mas lutas longas, derrotas, troca de mob,
// pocoes e gargalos de equipamento reduzem a taxa sustentada.
export const EXPECTED_COMBATS_PER_DAY = 7200;

// Meta aproximada para o lancamento 1-50.
// Total: 2 + 7 + 12 + 18 + 26 = 65 dias no ritmo efetivo alvo.
// T1 ficou um pouco mais curto para o inicio nao parecer travado.
// Depois cada tier segura mais tempo.
export const TIER_TARGET_DAYS: Record<number, number> = {
  1: 2,
  2: 7,
  3: 12,
  4: 18,
  5: 26,

  // Preparado para expansao futura 51-100.
  6: 36,
  7: 48,
  8: 62,
  9: 78,
  10: 96,
};

// XP medio real aproximado dos mobs seedados por tier.
// Manter estes valores alinhados com mob-stats.seed-data.ts para que
// os dias-alvo continuem representando tempo real de aquisicao de XP.
export const TIER_AVERAGE_XP_PER_COMBAT: Record<number, number> = {
  1: 9,
  2: 16,
  3: 28,
  4: 45,
  5: 69,

  // Futuro 51-100.
  6: 103,
  7: 151,
  8: 218,
  9: 312,
  10: 448,
};

// Distribui o XP dentro de cada tier com arranque mais macio.
// O total continua preservando os dias-alvo do tier, mas os primeiros niveis
// chegam mais cedo e os ultimos niveis do tier seguram a progressao idle.
export const LEVEL_XP_WEIGHT_BY_POSITION: Record<number, number> = {
  1: 0.4,
  2: 0.8,
  3: 1.4,
  4: 2.4,
  5: 3.6,
  6: 5.2,
  7: 7.2,
  8: 9.4,
  9: 11.4,
  10: 13.6,
};
