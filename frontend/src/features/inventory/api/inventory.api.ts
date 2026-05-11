import { API_ENDPOINTS } from '../../../services/api/endpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { InventoryResponse } from '../types/inventory.types';

export async function getCharacterInventory(
  characterId: string,
): Promise<InventoryResponse> {
  const response = await apiClient.get<InventoryResponse>(
    API_ENDPOINTS.inventory.byCharacter(characterId),
  );

  return response.data;
}

export function extractInventoryApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const apiError = error as {
      response?: {
        data?: {
          message?: string | string[];
          error?: string;
        };
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

  return 'Não foi possível carregar a mochila. Tente novamente.';
}
