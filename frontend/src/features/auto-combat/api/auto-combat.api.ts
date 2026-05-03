import { apiClient } from '../../../services/api/apiClient';
import { API_ENDPOINTS } from '../../../services/api/endpoints';
import type {
    AutoCombatMapViewModel,
    AutoCombatStatusResponse,
    PreviewAutoCombatPayload,
    PreviewAutoCombatResponse,
    StartAutoCombatPayload,
    StartAutoCombatResponse,
    StopAutoCombatResponse,
} from '../types/auto-combat.types';

export async function getAutoCombatMaps(): Promise<AutoCombatMapViewModel[]> {
  const response = await apiClient.get<AutoCombatMapViewModel[]>(
    API_ENDPOINTS.maps.list,
  );

  return response.data;
}

export async function getAutoCombatMapById(
  mapId: string,
): Promise<AutoCombatMapViewModel> {
  const response = await apiClient.get<AutoCombatMapViewModel>(
    API_ENDPOINTS.maps.byId(mapId),
  );

  return response.data;
}

export async function getAutoCombatStatus(
  characterId: string,
): Promise<AutoCombatStatusResponse> {
  const response = await apiClient.get<AutoCombatStatusResponse>(
    API_ENDPOINTS.autoCombat.status(characterId),
  );

  return response.data;
}

export async function previewAutoCombat(
  payload: PreviewAutoCombatPayload,
): Promise<PreviewAutoCombatResponse> {
  const response = await apiClient.post<PreviewAutoCombatResponse>(
    API_ENDPOINTS.autoCombat.preview,
    payload,
  );

  return response.data;
}

export async function startAutoCombat(
  payload: StartAutoCombatPayload,
): Promise<StartAutoCombatResponse> {
  const response = await apiClient.post<StartAutoCombatResponse>(
    API_ENDPOINTS.autoCombat.start,
    payload,
  );

  return response.data;
}

export async function stopAutoCombat(
  characterId: string,
): Promise<StopAutoCombatResponse> {
  const response = await apiClient.post<StopAutoCombatResponse>(
    API_ENDPOINTS.autoCombat.stop(characterId),
    {},
  );

  return response.data;
}