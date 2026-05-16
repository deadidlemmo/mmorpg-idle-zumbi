import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  CancelIncursionResponse,
  ClaimIncursionResponse,
  IncursionStatusResponse,
  IncursionsAvailableResponse,
  StartIncursionResponse,
} from "../types/incursions.types";

export async function getAvailableIncursions(characterId: string) {
  const response = await apiClient.get<IncursionsAvailableResponse>(
    API_ENDPOINTS.incursions.available(characterId),
  );
  return response.data;
}

export async function getIncursionStatus(characterId: string) {
  const response = await apiClient.get<IncursionStatusResponse>(
    API_ENDPOINTS.incursions.status(characterId),
  );
  return response.data;
}

export async function startIncursion(characterId: string, incursionId: string) {
  const response = await apiClient.post<StartIncursionResponse>(
    API_ENDPOINTS.incursions.start,
    { characterId, incursionId },
  );
  return response.data;
}

export async function claimIncursion(characterId: string, sessionId: string) {
  const response = await apiClient.post<ClaimIncursionResponse>(
    API_ENDPOINTS.incursions.claim,
    { characterId, sessionId },
  );
  return response.data;
}

export async function cancelIncursion(characterId: string) {
  const response = await apiClient.post<CancelIncursionResponse>(
    API_ENDPOINTS.incursions.cancel(characterId),
  );
  return response.data;
}
