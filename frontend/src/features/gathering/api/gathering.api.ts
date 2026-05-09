import { apiClient } from '../../../services/api/apiClient';
import type {
    CollectGatheringResponse,
    GatheringAllowedOrigin,
    GatheringApiErrorResponse,
    GatheringAvailableMaterialsResponse,
    GatheringStatusResponse,
    StartGatheringPayload,
    StartGatheringResponse,
    StopGatheringResponse,
} from '../types/gathering.types';

const GATHERING_ENDPOINTS = {
  materials: '/gathering/materials',
  start: '/gathering/start',
  status: (characterId: string) => `/gathering/${characterId}/status`,
  collect: (characterId: string) => `/gathering/${characterId}/collect`,
  stop: (characterId: string) => `/gathering/${characterId}/stop`,
} as const;

export interface ListGatheringMaterialsParams {
  mapId: string;
  origin: GatheringAllowedOrigin;
}

export async function listGatheringMaterialsRequest({
  mapId,
  origin,
}: ListGatheringMaterialsParams): Promise<GatheringAvailableMaterialsResponse> {
  const response = await apiClient.get<GatheringAvailableMaterialsResponse>(
    GATHERING_ENDPOINTS.materials,
    {
      params: {
        mapId,
        origin,
      },
    },
  );

  return response.data;
}

export async function startGatheringRequest(
  payload: StartGatheringPayload,
): Promise<StartGatheringResponse> {
  const response = await apiClient.post<StartGatheringResponse>(
    GATHERING_ENDPOINTS.start,
    payload,
  );

  return response.data;
}

export async function getGatheringStatusRequest(
  characterId: string,
): Promise<GatheringStatusResponse> {
  const response = await apiClient.get<GatheringStatusResponse>(
    GATHERING_ENDPOINTS.status(characterId),
  );

  return response.data;
}

export async function collectGatheringRequest(
  characterId: string,
): Promise<CollectGatheringResponse> {
  const response = await apiClient.post<CollectGatheringResponse>(
    GATHERING_ENDPOINTS.collect(characterId),
  );

  return response.data;
}

export async function stopGatheringRequest(
  characterId: string,
): Promise<StopGatheringResponse> {
  const response = await apiClient.post<StopGatheringResponse>(
    GATHERING_ENDPOINTS.stop(characterId),
  );

  return response.data;
}

export function extractGatheringApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const apiError = error as {
      response?: {
        data?: GatheringApiErrorResponse;
      };
    };

    const message = apiError.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(' ');
    }

    if (typeof message === 'string') {
      return message;
    }

    if (typeof apiError.response?.data?.error === 'string') {
      return apiError.response.data.error;
    }
  }

  return 'Não foi possível executar a ação de expedição. Tente novamente.';
}

export { GATHERING_ENDPOINTS };

