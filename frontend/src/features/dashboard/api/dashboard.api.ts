import { API_ENDPOINTS } from '../../../services/api/endpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { CharacterOverviewResponse } from '../types/dashboard.types';

export async function getCharacterOverview(
  characterId: string,
): Promise<CharacterOverviewResponse> {
  const response = await apiClient.get<CharacterOverviewResponse>(
    API_ENDPOINTS.characters.overview(characterId),
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

export interface OnlinePlayersStatusResponse {
  onlinePlayers: number;
  updatedAt: string;
}

export async function getOnlinePlayersStatus(): Promise<OnlinePlayersStatusResponse> {
  const response = await apiClient.get<OnlinePlayersStatusResponse>(
    API_ENDPOINTS.autoCombat.onlineCount,
  );

  return response.data;
}
