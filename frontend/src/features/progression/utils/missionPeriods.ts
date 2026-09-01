import type {
  CharacterMission,
  MissionType,
} from "../types/progression.types";

export type RecurringMissionType = Exclude<MissionType, "STORY">;

export const RECURRING_MISSION_TYPES: RecurringMissionType[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];

const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  DAILY: "Diária",
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  STORY: "Jornada",
};

export function getMissionTypeLabel(type: MissionType) {
  return MISSION_TYPE_LABELS[type];
}

export function filterRecurringMissions(
  missions: CharacterMission[],
  type: RecurringMissionType,
) {
  return missions.filter((mission) => mission.mission.type === type);
}

export function formatMissionRemaining(
  expiresAt?: string | null,
  serverNow?: string | null,
) {
  if (!expiresAt) return null;

  const expiresTimestamp = Date.parse(expiresAt);
  const nowTimestamp = serverNow ? Date.parse(serverNow) : Date.now();

  if (!Number.isFinite(expiresTimestamp) || !Number.isFinite(nowTimestamp)) {
    return null;
  }

  const remainingMinutes = Math.ceil(
    Math.max(0, expiresTimestamp - nowTimestamp) / 60_000,
  );

  if (remainingMinutes <= 0) return "Renovando";

  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;

  if (days > 0) return `Renova em ${days}d ${hours}h`;
  if (hours > 0) return `Renova em ${hours}h ${minutes}min`;
  return `Renova em ${minutes}min`;
}
