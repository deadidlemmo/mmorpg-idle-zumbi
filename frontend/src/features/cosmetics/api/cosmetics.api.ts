import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  CharacterCosmeticsCatalogResponse,
  UpdateCharacterAppearancePayload,
} from "../types/cosmetics.types";

export async function getCharacterCosmetics(characterId: string) {
  const response = await apiClient.get<CharacterCosmeticsCatalogResponse>(
    API_ENDPOINTS.cosmetics.catalog(characterId),
  );
  return response.data;
}

export async function updateCharacterAppearance(
  characterId: string,
  payload: UpdateCharacterAppearancePayload,
) {
  const response = await apiClient.patch<{
    message: string;
    appearance: CharacterCosmeticsCatalogResponse["appearance"];
  }>(API_ENDPOINTS.cosmetics.appearance(characterId), payload);
  return response.data;
}
