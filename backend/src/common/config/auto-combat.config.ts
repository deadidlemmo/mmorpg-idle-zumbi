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

export const AUTO_COMBAT_REST_DEFAULT_START_HP_PERCENT = 35;

export const AUTO_COMBAT_REST_DEFAULT_STOP_HP_PERCENT = 70;

/**
 * Cura fora da luta, entre uma ameaça e outra.
 *
 * 0.5% do HP máximo por segundo recupera de 35% para 70% em cerca de 70s.
 * Isso permite idle no início sem tornar poções irrelevantes, pois descanso
 * troca segurança por tempo sem XP, Gold ou loot.
 */
export const AUTO_COMBAT_REST_HEAL_PERCENT_PER_SECOND = 0.5;

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
