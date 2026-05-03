import { apiClient } from '../../../services/api/apiClient';
import type { CharacterOverviewResponse } from '../types/dashboard.types';

export async function getCharacterOverview(
  characterId: string,
): Promise<CharacterOverviewResponse> {
  const response = await apiClient.get<CharacterOverviewResponse>(
    `/characters/${characterId}/overview`,
  );

  return response.data;
}