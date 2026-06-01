import { apiClient } from '../../../services/api/apiClient';
import { API_ENDPOINTS } from '../../../services/api/endpoints';
import type { InfirmaryStatusResponse } from '../types/infirmary.types';

export async function getInfirmaryStatus(
  characterId: string,
): Promise<InfirmaryStatusResponse> {
  const response = await apiClient.get<InfirmaryStatusResponse>(
    API_ENDPOINTS.infirmary.status(characterId),
  );

  return response.data;
}

export async function startInfirmaryTreatment(
  characterId: string,
): Promise<InfirmaryStatusResponse> {
  const response = await apiClient.post<InfirmaryStatusResponse>(
    API_ENDPOINTS.infirmary.start(characterId),
  );

  return response.data;
}

export async function claimInfirmaryTreatment(
  characterId: string,
): Promise<InfirmaryStatusResponse> {
  const response = await apiClient.post<InfirmaryStatusResponse>(
    API_ENDPOINTS.infirmary.claim(characterId),
  );

  return response.data;
}

export async function cancelInfirmaryTreatment(
  characterId: string,
): Promise<InfirmaryStatusResponse> {
  const response = await apiClient.post<InfirmaryStatusResponse>(
    API_ENDPOINTS.infirmary.cancel(characterId),
  );

  return response.data;
}

export async function instantInfirmaryTreatment(
  characterId: string,
): Promise<InfirmaryStatusResponse> {
  const response = await apiClient.post<InfirmaryStatusResponse>(
    API_ENDPOINTS.infirmary.instant(characterId),
  );

  return response.data;
}

export function extractInfirmaryApiError(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response
  ) {
    const data = error.response.data as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(data.message)) {
      return data.message.join(' ');
    }

    if (typeof data.message === 'string') {
      return data.message;
    }

    if (typeof data.error === 'string') {
      return data.error;
    }
  }

  return 'Nao foi possivel acessar a enfermaria agora.';
}
