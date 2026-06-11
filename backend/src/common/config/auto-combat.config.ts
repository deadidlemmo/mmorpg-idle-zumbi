// Configurações centrais do combate automático idle.

import {
  FREE_IDLE_PROGRESS_LIMIT_SECONDS,
  PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS,
} from './membership.config';

/**
 * Sessão máxima de combate automático.
 *
 * 6 horas = 21.600 segundos.
 */
export const AUTO_COMBAT_SESSION_DURATION_SECONDS =
  FREE_IDLE_PROGRESS_LIMIT_SECONDS;

export const AUTO_COMBAT_PREMIUM_SESSION_DURATION_SECONDS =
  PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS;

/**
 * Duração real de cada rodada simulada no backend.
 *
 * Recomendação atual: 3 segundos.
 *
 * Motivo:
 * - 6 segundos ficou lento demais depois que o frontend passou a processar
 *   os eventos em fila única com delay visual;
 * - 5 segundos ainda pode gerar sensação de espera entre o mob aparecer,
 *   o primeiro ataque e a próxima rodada;
 * - 3 segundos deixa o backend gerar ações com mais frequência, enquanto o
 *   frontend continua responsável por dar o respiro visual entre cada evento.
 *
 * Fluxo esperado:
 * - o backend processa rodadas com boa frequência;
 * - o frontend mostra 1 evento por vez;
 * - cada hit continua aparecendo individualmente;
 * - o jogador não fica esperando tempo demais quando a fila visual esvazia.
 *
 * Importante:
 * Este valor é salvo na sessão no campo roundDurationSeconds quando o
 * auto-combate é iniciado.
 *
 * Portanto:
 * - sessões antigas continuam usando o valor antigo;
 * - após alterar este arquivo, reinicie o backend;
 * - pare a sessão ativa antiga;
 * - inicie uma nova sessão para testar o novo ritmo.
 */
export const AUTO_COMBAT_ROUND_DURATION_SECONDS = 3;

/**
 * Progressão da caça usada para estimar quanto tempo o personagem leva para
 * rastrear uma ameaça antes de entrar em combate.
 */
export const AUTO_COMBAT_HUNTING_LEVEL_CAP = 50;
export const AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY = 15;
export const AUTO_COMBAT_HUNTING_MIN_SECONDS_PER_ENEMY = 6;
export const AUTO_COMBAT_HUNTING_SPEED_GAIN_PER_LEVEL = 0.03;
export const AUTO_COMBAT_HUNTING_XP_PER_ENEMY = 5;
export const AUTO_COMBAT_HUNTING_XP_BASE_TO_NEXT_LEVEL = 1690;
export const AUTO_COMBAT_HUNTING_XP_LINEAR_SCALE = 422;
export const AUTO_COMBAT_HUNTING_XP_POWER_SCALE = 49.9;
export const AUTO_COMBAT_HUNTING_XP_POWER_EXPONENT = 2.1;
export const AUTO_COMBAT_HUNTING_MAX_EVENTS_PER_PROCESS = 500;
export const AUTO_COMBAT_HUNTING_BASE_MAX_TRACKED_ENEMIES = 600;
export const AUTO_COMBAT_HUNTING_MAX_TRACKED_LINEAR_GAIN = 50;
export const AUTO_COMBAT_HUNTING_MAX_TRACKED_POWER_SCALE = 10;
export const AUTO_COMBAT_HUNTING_MAX_TRACKED_POWER_EXPONENT = 1.25;

/**
 * Limite de segurança para evitar que uma única chamada processe combates demais.
 *
 * Com rodada de 3 segundos, uma sessão de 6h pode ter até 7.200 rodadas.
 *
 * Para o MVP, 5000 continua sendo um limite seguro para evitar processamento
 * excessivo em uma única chamada, especialmente se o personagem ficar muito
 * tempo offline.
 */
export const AUTO_COMBAT_MAX_COMBATS_PER_PROCESS = Math.ceil(
  PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS / AUTO_COMBAT_ROUND_DURATION_SECONDS,
);

/**
 * Se quiser futuramente limitar processamento por chamada, pode usar este valor.
 *
 * Por enquanto, deixamos a sessão inteira ser processável sob demanda.
 */
export const AUTO_COMBAT_MAX_SECONDS_PER_PROCESS =
  PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS;

/**
 * Define se o sistema deve finalizar automaticamente a sessão ao chegar no endsAt.
 */
export const AUTO_COMBAT_FINISH_SESSION_WHEN_TIME_ENDS = true;

export const AUTO_COMBAT_TTK_MIN_SECONDS = 1;
export const AUTO_COMBAT_TTK_MAX_SECONDS = 300;
export const AUTO_COMBAT_TTK_POWER_EXPONENT = 0.75;

export const AUTO_COMBAT_TTK_BASE_TIMES_BY_MOB_INDEX = [
  5, 6, 7, 8, 10, 12, 14, 17, 20, 24, 29, 35,
] as const;

export const AUTO_COMBAT_TTK_POWER_MULTIPLIERS_BY_MOB_INDEX = [
  0.7, 0.82, 0.95, 1.1, 1.28, 1.48, 1.72, 2, 2.32, 2.7, 3.15, 3.7,
] as const;

export const AUTO_COMBAT_TTK_PROGRESS_UPDATES_PER_SECOND = 4;
