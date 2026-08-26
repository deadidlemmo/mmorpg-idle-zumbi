import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  PetCocoonRecoveryResponse,
  PetMutationResponse,
  PetSaleResponse,
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

export async function equipPet(characterId: string, characterPetId: string) {
  const response = await apiClient.post<PetMutationResponse>(
    API_ENDPOINTS.pets.equip(characterId, characterPetId),
  );
  return response.data;
}

export async function unequipPet(characterId: string) {
  const response = await apiClient.delete<PetMutationResponse>(
    API_ENDPOINTS.pets.equipment(characterId),
  );
  return response.data;
}

export async function sellPet(characterId: string, characterPetId: string) {
  const response = await apiClient.post<PetSaleResponse>(
    API_ENDPOINTS.pets.sell(characterId, characterPetId),
  );
  return response.data;
}

export async function sellDuplicateCocoons(
  characterId: string,
  petDefinitionId: string,
  quantity: number,
  requestId: string,
) {
  const response = await apiClient.post<PetCocoonRecoveryResponse>(
    API_ENDPOINTS.pets.sellDuplicateCocoons(characterId),
    { petDefinitionId, quantity, requestId },
  );
  return response.data;
}

export async function convertDuplicateCocoons(
  characterId: string,
  petDefinitionId: string,
  quantity: number,
  requestId: string,
) {
  const response = await apiClient.post<PetCocoonRecoveryResponse>(
    API_ENDPOINTS.pets.convertDuplicateCocoons(characterId),
    { petDefinitionId, quantity, requestId },
  );
  return response.data;
}
