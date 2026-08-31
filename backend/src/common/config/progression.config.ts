export const LAUNCH_LEVEL_CAP = 50;
export const FUTURE_LEVEL_CAP = 100;

export const LEVELS_PER_TIER = 10;

// Unidade historica usada para converter o orcamento de cada tier em XP.
// Nao representa um dia de calendario: a taxa real depende de caca, TTK,
// equipamento, derrotas e pausas entre sessoes.
export const EXPECTED_COMBATS_PER_DAY = 7200;

// Meta de produto para o lancamento. A comunicacao usa dias de calendario;
// os simuladores convertem a faixa para horas ativas com este perfil de
// referencia. Jogadores com mais ou menos tempo diario continuam na mesma
// curva global de XP, sem multiplicadores por classe.
export const PROGRESSION_CALENDAR_TARGET = Object.freeze({
  minCalendarDays: 60,
  maxCalendarDays: 90,
  referenceActiveHoursPerDay: 8,
  minActiveHours: 480,
  maxActiveHours: 720,
});

// Meta aproximada por fase de conteudo.
//
// Lancamento:
// - Level cap 50.
// - Conteudo ate T5.
// - Objetivo: 1-50 em 60-90 dias de calendario no perfil de referencia.
// - Niveis 1-20 preservam integralmente a curva publicada.
// - T3 recebe uma reducao intermediaria; a aceleracao principal fica em T4/T5.
//
// Expansao:
// - Futuro level cap 100.
// - Conteudo T6-T10.
// - Objetivo realista: manter 1-100 perto de 1 ano total quando a expansao
//   for liberada, com 50-100 bem mais longo que a fase de lancamento.
//
// Estes valores sao calibrados contra os relatorios de auto-combate com:
// mapas reais do seed, chance de aparicao dos mobs, tempo de caca por tier,
// TTK real, equipamentos seedados e gathering recomendado por classe.
export const TIER_TARGET_DAYS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 1.5,
  4: 0.8,
  5: 1,

  // Preparado para expansao futura 51-100.
  6: 10,
  7: 13,
  8: 16,
  9: 20,
  10: 25,
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
