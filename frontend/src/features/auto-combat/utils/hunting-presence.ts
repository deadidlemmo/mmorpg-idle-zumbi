import type { HuntingVisualPresence } from "../../../services/websocket/socketClient";
import type { HuntingVisualPlayer } from "../components/phaser/createSuburbioHuntingGame";

const REMOTE_PLAYER_BASE_SPEED = 96;
const REMOTE_POSE_INTERVAL_SECONDS = 0.2;
const REMOTE_PLAYER_MAX_CATCH_UP_SPEED = 320;

export function getRemotePlayerInterpolationSpeed(distance: number) {
  const normalizedDistance = Math.max(0, Number(distance) || 0);
  if (normalizedDistance <= 0) return 0;

  return Math.min(
    REMOTE_PLAYER_MAX_CATCH_UP_SPEED,
    Math.max(
      REMOTE_PLAYER_BASE_SPEED,
      normalizedDistance / REMOTE_POSE_INTERVAL_SECONDS,
    ),
  );
}

export function mergeHuntingVisualPlayers(
  restPlayers: readonly HuntingVisualPresence[],
  livePlayers: readonly HuntingVisualPresence[],
): HuntingVisualPlayer[] {
  const merged = new Map(restPlayers.map((player) => [player.characterId, player]));
  const liveIds = new Set(livePlayers.map((player) => player.characterId));
  for (const player of livePlayers) merged.set(player.characterId, player);
  return [...merged.values()].map((player) => ({
    id: player.characterId,
    displayName: player.displayName,
    areaId: player.areaId,
    worldX: player.tileX * 32,
    worldY: player.tileY * 32,
    direction: player.direction,
    visualState: player.visualState,
    moving: player.moving,
    ...(player.visualState === "combat"
      ? {
          combatMobName: player.combatMobName ?? null,
          combatCycleKey: player.combatCycleKey ?? null,
          ...(player.combatEventType || player.combatEventKey
            ? {
                combatEventType: player.combatEventType ?? null,
                combatEventKey: player.combatEventKey ?? null,
              }
            : {}),
        }
      : {}),
    updatedAt: player.updatedAt,
    idle: !liveIds.has(player.characterId),
  }));
}

export type AutoCombatHuntingPresenceResponse = {
  mapId: string | null;
  subMapId: string | null;
  updatedAt: string;
  characters: Array<{
    id: string;
    name: string;
    avatarKey: string | null;
    phase: "HUNTING" | "ENCOUNTER_READY";
    startedAt: string;
    cycleStartedAt?: string | null;
    cycleEndsAt?: string | null;
  }>;
};

export type ActiveCharactersPresenceResponse = {
  characters?: Array<{
    character?: {
      id?: string;
      name?: string;
      avatarKey?: string | null;
      map?: { id?: string | null } | null;
    };
    presence?: {
      activity?: { type?: string | null; label?: string | null } | null;
    };
  }>;
};

export function buildLegacyHuntingPresenceResponse(
  response: ActiveCharactersPresenceResponse,
  characterId: string,
  currentMapId: string | null,
  now = new Date(),
): AutoCombatHuntingPresenceResponse {
  const characters = (response.characters ?? [])
    .filter((entry) => {
      const activity = entry.presence?.activity;
      return (
        entry.character?.id !== characterId &&
        Boolean(currentMapId) &&
        entry.character?.map?.id === currentMapId &&
        activity?.type === "AUTO_COMBAT" &&
        String(activity.label ?? "").startsWith("Rastreando")
      );
    })
    .slice(0, 24)
    .flatMap((entry) => {
      const character = entry.character;
      if (!character?.id || !character.name) return [];
      return [
        {
          id: character.id,
          name: character.name,
          avatarKey: character.avatarKey ?? null,
          phase: "HUNTING" as const,
          startedAt: now.toISOString(),
        },
      ];
    });

  return {
    mapId: currentMapId,
    subMapId: null,
    updatedAt: now.toISOString(),
    characters,
  };
}
