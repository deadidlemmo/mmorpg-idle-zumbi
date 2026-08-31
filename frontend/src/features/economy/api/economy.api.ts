import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import type {
  EconomyExchangeOffersResponse,
  EconomyExchangeResponse,
} from "../types/economy.types";

export async function getEconomyExchangeOffersForItem(
  characterId: string,
  itemId: string,
) {
  const response = await apiClient.get<EconomyExchangeOffersResponse>(
    API_ENDPOINTS.economy.itemExchangeOffers(characterId, itemId),
  );
  return response.data;
}

export async function exchangeEconomyOffer(
  characterId: string,
  offerId: string,
  requestId: string,
  sourceItemId: string,
  exchangeCount: number,
) {
  const response = await apiClient.post<EconomyExchangeResponse>(
    API_ENDPOINTS.economy.exchanges(characterId),
    { offerId, requestId, sourceItemId, exchangeCount },
  );
  return response.data;
}
