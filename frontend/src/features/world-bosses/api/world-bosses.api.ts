import { apiClient } from '../../../services/api/apiClient';
import { API_ENDPOINTS } from '../../../services/api/endpoints';
import type { WorldBossStatusResponse } from '../types/world-bosses.types';

export async function getWorldBossStatus(characterId: string) {
  const response = await apiClient.get<WorldBossStatusResponse>(
    API_ENDPOINTS.worldBosses.status(characterId),
  );
  return response.data;
}

export async function getActiveWorldBoss(characterId: string) {
  const response = await apiClient.get<WorldBossStatusResponse>(
    API_ENDPOINTS.worldBosses.active(characterId),
  );
  return response.data;
}

export async function joinWorldBoss(characterId: string, eventId: string) {
  const response = await apiClient.post<WorldBossStatusResponse>(
    API_ENDPOINTS.worldBosses.join,
    { characterId, eventId },
  );
  return response.data;
}

export async function leaveWorldBoss(characterId: string, eventId: string) {
  const response = await apiClient.post<WorldBossStatusResponse>(
    API_ENDPOINTS.worldBosses.leave,
    { characterId, eventId },
  );
  return response.data;
}
