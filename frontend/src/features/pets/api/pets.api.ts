import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  PetMutationResponse,
  PetsStateResponse,
} from "../types/pets.types";

export async function getPetsState(characterId: string) {
  const response = await apiClient.get<PetsStateResponse>(
    API_ENDPOINTS.pets.byCharacter(characterId),
  );
  return response.data;
}

export async function startPetIncubation(
  characterId: string,
  petDefinitionId: string,
  requestId: string,
) {
  const response = await apiClient.post<PetMutationResponse>(
    API_ENDPOINTS.pets.incubations(characterId),
    { petDefinitionId, requestId },
  );
  return response.data;
}

export async function claimPetIncubation(
  characterId: string,
  characterPetId: string,
) {
  const response = await apiClient.post<PetMutationResponse>(
    API_ENDPOINTS.pets.claim(characterId, characterPetId),
  );
  return response.data;
}
