import { API_ENDPOINTS } from '../../../services/api/endpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { DashboardEquipmentViewModel } from '../../dashboard/types/dashboard.types';
import type { InventoryResponse } from '../types/inventory.types';

interface InventoryItemActionPayload {
  characterId: string;
  itemId: string;
  quantity?: number;
}

interface InventoryItemUnequipPayload {
  characterId: string;
  slot: string;
}

interface InventoryItemActionResponse {
  message?: string;
  [key: string]: unknown;
}

interface CharacterEquipmentResponse {
  equipment?: DashboardEquipmentViewModel | null;
  [key: string]: unknown;
}

export async function getCharacterInventory(
  characterId: string,
): Promise<InventoryResponse> {
  const response = await apiClient.get<InventoryResponse>(
    API_ENDPOINTS.inventory.byCharacter(characterId),
  );

  return response.data;
}

export async function getCharacterBank(
  characterId: string,
): Promise<InventoryResponse> {
  const response = await apiClient.get<InventoryResponse>(
    API_ENDPOINTS.inventory.bank(characterId),
  );

  return response.data;
}

export async function getCharacterEquipment(
  characterId: string,
): Promise<CharacterEquipmentResponse> {
  const response = await apiClient.get<CharacterEquipmentResponse>(
    API_ENDPOINTS.equipment.byCharacter(characterId),
  );

  return response.data;
}

export async function depositInventoryItemToBank(
  payload: InventoryItemActionPayload,
): Promise<InventoryItemActionResponse> {
  const response = await apiClient.post<InventoryItemActionResponse>(
    API_ENDPOINTS.inventory.depositToBank,
    payload,
  );

  return response.data;
}

export async function withdrawInventoryItemFromBank(
  payload: InventoryItemActionPayload,
): Promise<InventoryItemActionResponse> {
  const response = await apiClient.post<InventoryItemActionResponse>(
    API_ENDPOINTS.inventory.withdrawFromBank,
    payload,
  );

  return response.data;
}

export async function equipInventoryItem(
  payload: InventoryItemActionPayload,
): Promise<InventoryItemActionResponse> {
  const response = await apiClient.post<InventoryItemActionResponse>(
    API_ENDPOINTS.equipment.equip,
    payload,
  );

  return response.data;
}

export async function consumeInventoryItem(
  payload: InventoryItemActionPayload,
): Promise<InventoryItemActionResponse> {
  const response = await apiClient.post<InventoryItemActionResponse>(
    API_ENDPOINTS.consumables.use,
    payload,
  );

  return response.data;
}

export async function unequipInventoryItem(
  payload: InventoryItemUnequipPayload,
): Promise<InventoryItemActionResponse> {
  const response = await apiClient.post<InventoryItemActionResponse>(
    API_ENDPOINTS.equipment.unequip,
    payload,
  );

  return response.data;
}

export function extractInventoryActionApiError(
  error: unknown,
  fallback = 'N\u00e3o foi poss\u00edvel usar este item. Tente novamente.',
): string {
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

  return fallback;
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
