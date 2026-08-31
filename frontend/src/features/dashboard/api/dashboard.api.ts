import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type { ResolvedCharacterAppearance } from "../../cosmetics/types/cosmetics.types";
import type { CharacterOverviewResponse } from "../types/dashboard.types";

export type CharacterActivitySummaryResponse = Pick<
  CharacterOverviewResponse,
  "character" | "activity"
> & {
  serverNow: string;
};

export async function getCharacterOverview(
  characterId: string,
): Promise<CharacterOverviewResponse> {
  const response = await apiClient.get<CharacterOverviewResponse>(
    API_ENDPOINTS.characters.overview(characterId),
  );

  return response.data;
}

export async function getCharacterActivitySummary(
  characterId: string,
): Promise<CharacterActivitySummaryResponse> {
  const response = await apiClient.get<CharacterActivitySummaryResponse>(
    API_ENDPOINTS.characters.activitySummary(characterId),
  );

  return response.data;
}

export async function updateCharacterCurrentMap(
  characterId: string,
  mapId: string,
): Promise<CharacterOverviewResponse> {
  const response = await apiClient.patch<CharacterOverviewResponse>(
    API_ENDPOINTS.characters.currentMap(characterId),
    { mapId },
  );

  return response.data;
}

export interface ActiveCharactersStatusResponse {
  activeCharacters: number;
  onlineCharacters: number;
  activityCharacters: number;
  offlineActivityCharacters: number;
  onlinePlayers: number;
  updatedAt: string;
}

export interface ActiveCharacterEntry {
  character: {
    id: string;
    name: string;
    level: number;
    avatarKey?: string | null;
    class?: { id: string; name: string } | null;
    map?: { id: string; name: string; tier: number } | null;
  };
  appearance?: ResolvedCharacterAppearance | null;
  presence: {
    online: boolean;
    inActivity: boolean;
    status: "ONLINE" | "ACTIVITY";
    activity?: {
      type:
        | "AUTO_COMBAT"
        | "GATHERING"
        | "CRAFTING"
        | "INCURSION"
        | "WORLD_BOSS"
        | "INFIRMARY";
      label: string;
    } | null;
  };
}

export interface ActiveCharactersResponse extends ActiveCharactersStatusResponse {
  characters: ActiveCharacterEntry[];
}

export async function getActiveCharactersStatus(): Promise<ActiveCharactersStatusResponse> {
  const response = await apiClient.get<ActiveCharactersStatusResponse>(
    API_ENDPOINTS.autoCombat.onlineCount,
  );

  return response.data;
}

export async function getActiveCharacters(): Promise<ActiveCharactersResponse> {
  const response = await apiClient.get<ActiveCharactersResponse>(
    API_ENDPOINTS.autoCombat.activeCharacters,
  );

  return response.data;
}
