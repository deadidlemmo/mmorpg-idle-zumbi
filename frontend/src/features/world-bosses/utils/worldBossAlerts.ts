import type { WorldBossStatusResponse } from "../types/world-bosses.types";

export type WorldBossAlertMilestone =
  | "ONE_HOUR"
  | "FIFTEEN_MINUTES"
  | "LOBBY_OPEN";

export const WORLD_BOSS_STATUS_SYNC_EVENT =
  "dead-idle:world-boss-status-sync";

export const WORLD_BOSS_REGISTRATION_NOTICE =
  "Sua atividade continuará normalmente. Quando a batalha começar, ela será encerrada automaticamente e deverá ser iniciada novamente depois do boss. Criações e incursões interrompidas não recuperam materiais ou custos.";

export function getWorldBossAlertMilestone(
  status: WorldBossStatusResponse,
  nowMs: number,
): WorldBossAlertMilestone | null {
  const event = status.event;
  if (!event) return null;
  if (event.status === "LOBBY_OPEN") return "LOBBY_OPEN";
  if (event.status !== "SCHEDULED") return null;

  const startsAtMs = Date.parse(event.startsAt);
  if (!Number.isFinite(startsAtMs)) return null;
  const remainingSeconds = Math.floor((startsAtMs - nowMs) / 1000);
  if (remainingSeconds <= 0) return null;
  if (remainingSeconds <= 15 * 60) return "FIFTEEN_MINUTES";
  if (remainingSeconds <= 60 * 60) return "ONE_HOUR";
  return null;
}

export function getWorldBossAlertKey(
  characterId: string,
  eventId: string,
  milestone: WorldBossAlertMilestone,
) {
  return `dead-idle.world-boss-alert.${characterId}.${eventId}.${milestone}`;
}

export function getWorldBossAlertCopy(milestone: WorldBossAlertMilestone) {
  if (milestone === "ONE_HOUR") {
    return "A preparação começa em até 1 hora. Inscreva-se sem encerrar sua atividade.";
  }
  if (milestone === "FIFTEEN_MINUTES") {
    return "A preparação começa em até 15 minutos. Ainda dá tempo de se inscrever.";
  }
  return "Preparação final aberta. A batalha começa em até 15 minutos.";
}
