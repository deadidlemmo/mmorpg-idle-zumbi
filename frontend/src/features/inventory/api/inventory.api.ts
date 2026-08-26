import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  DashboardEquipmentProgression,
  DashboardDerivedStats,
  DashboardEquipmentItem,
  DashboardEquipmentViewModel,
  DashboardStats,
} from "../../dashboard/types/dashboard.types";
import type { InventoryResponse } from "../types/inventory.types";

interface InventoryItemActionPayload {
  characterId: string;
  itemId: string;
  quantity?: number;
}

interface InventoryItemUnequipPayload {
  characterId: string;
  slot: string;
}

interface ReinforceEquipmentPayload {
  characterId: string;
  slot: string;
  requestId: string;
}

export interface EquipmentReinforcementItem extends DashboardEquipmentItem {
  baseItemId?: string | null;
  enhancementLevel: number;
}

export interface EquipmentReinforcementSlotState {
  slot: string;
  item: EquipmentReinforcementItem | null;
  nextItem: EquipmentReinforcementItem | null;
  cost: {
    level: number;
    fragmentCost: number;
    goldCost: number;
    materialName: string;
    materialBalance: number;
    goldBalance: number;
  } | null;
  canReinforce?: boolean;
  reason?: string | null;
}

export interface EquipmentReinforcementState {
  maxLevel: number;
  gold: number;
  materials: Array<{
    tier: number;
    itemId: string | null;
    name: string;
    quantity: number;
  }>;
  slots: EquipmentReinforcementSlotState[];
}

export interface InventoryItemActionResponse {
  message?: string;
  [key: string]: unknown;
}

interface InventoryBlackMarketSaleResponse extends InventoryItemActionResponse {
  gold?: number;
  soldItem?: {
    itemId: string;
    itemName: string;
    quantity: number;
    unitValue: number;
    totalValue: number;
    gold: number;
  };
}

export interface CharacterEquipmentResponse {
  character?: {
    id: string;
    name: string;
    class: string;
    level: number;
    xp: number;
    currentHp: number;
    maxHp: number;
  };
  equipment?: DashboardEquipmentViewModel | null;
  stats?: {
    level?: number;
    basePrimaryStats?: DashboardStats;
    levelBonusStats?: DashboardStats;
    equipmentBonusStats?: DashboardStats;
    gatheringBonusStats?: DashboardStats;
    totalPrimaryStats?: DashboardStats;
    derivedCombatStats?: DashboardDerivedStats;
    equipmentProgression?: DashboardEquipmentProgression;
  };
  reinforcement?: EquipmentReinforcementState;
  [key: string]: unknown;
}

export interface ReinforceEquipmentResponse extends InventoryItemActionResponse {
  applied: boolean;
  reinforcedItem: EquipmentReinforcementItem | null;
  gold?: number;
  equipment?: DashboardEquipmentViewModel;
  stats?: CharacterEquipmentResponse["stats"];
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

export async function sellInventoryItemToBlackMarket(
  payload: InventoryItemActionPayload,
): Promise<InventoryBlackMarketSaleResponse> {
  const response = await apiClient.post<InventoryBlackMarketSaleResponse>(
    API_ENDPOINTS.inventory.sellToBlackMarket,
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

export async function reinforceEquippedItem(
  payload: ReinforceEquipmentPayload,
): Promise<ReinforceEquipmentResponse> {
  const response = await apiClient.post<ReinforceEquipmentResponse>(
    API_ENDPOINTS.equipment.reinforce,
    payload,
  );

  return response.data;
}

export function extractInventoryActionApiError(
  error: unknown,
  fallback = "N\u00e3o foi poss\u00edvel usar este item. Tente novamente.",
): string {
  if (typeof error === "object" && error !== null && "response" in error) {
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
      return message.join(" ");
    }

    if (typeof message === "string") {
      return message;
    }

    if (typeof apiError.response?.data?.error === "string") {
      return apiError.response.data.error;
    }
  }

  return fallback;
}

export function extractInventoryApiError(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
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
      return message.join(" ");
    }

    if (typeof message === "string") {
      return message;
    }

    if (typeof apiError.response?.data?.error === "string") {
      return apiError.response.data.error;
    }
  }

  return "Não foi possível carregar a mochila. Tente novamente.";
}
