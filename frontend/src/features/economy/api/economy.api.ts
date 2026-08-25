import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import type {
  EconomyCurrency,
  EconomyExchangeOffersResponse,
  EconomyExchangeResponse,
} from "../types/economy.types";

export async function getEconomyExchangeOffers(
  characterId: string,
  tier: number,
  currency: EconomyCurrency,
) {
  const response = await apiClient.get<EconomyExchangeOffersResponse>(
    API_ENDPOINTS.economy.exchangeOffers(characterId),
    { params: { tier, currency } },
  );
  return response.data;
}

export async function exchangeEconomyOffer(
  characterId: string,
  offerId: string,
  requestId: string,
) {
  const response = await apiClient.post<EconomyExchangeResponse>(
    API_ENDPOINTS.economy.exchanges(characterId),
    { offerId, requestId },
  );
  return response.data;
}
