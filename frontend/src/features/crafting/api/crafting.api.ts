import { API_ENDPOINTS } from '../../../services/api/endpoints';
import { apiClient } from '../../../services/api/apiClient';
import type {
  CraftingApiErrorResponse,
  CraftingRecipesResponse,
  CraftItemPayload,
  CraftItemResponse,
  CraftingSlot,
} from '../types/crafting.types';

interface ListCraftingRecipesParams {
  characterId: string;
  tier?: number | null;
  slot?: CraftingSlot | 'ALL' | null;
  craftableOnly?: boolean;
}

export async function listCraftingRecipesRequest({
  characterId,
  tier,
  slot,
  craftableOnly,
}: ListCraftingRecipesParams): Promise<CraftingRecipesResponse> {
  const response = await apiClient.get<CraftingRecipesResponse>(
    API_ENDPOINTS.crafting.recipes(characterId),
    {
      params: {
        tier: tier ?? undefined,
        slot: slot && slot !== 'ALL' ? slot : undefined,
        craftableOnly: craftableOnly ? 'true' : undefined,
      },
    },
  );

  return response.data;
}

export async function craftItemRequest(
  payload: CraftItemPayload,
): Promise<CraftItemResponse> {
  const response = await apiClient.post<CraftItemResponse>(
    API_ENDPOINTS.crafting.craft,
    payload,
  );

  return response.data;
}

export function extractCraftingApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const apiError = error as {
      response?: {
        data?: CraftingApiErrorResponse;
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

  return 'Não foi possível executar a criação. Tente novamente.';
}
