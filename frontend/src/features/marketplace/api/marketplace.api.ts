import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import type {
  BuyMarketListingPayload,
  CreateMarketListingPayload,
  MarketApiErrorResponse,
  MarketListingMutationResponse,
  MarketListingsQuery,
  MarketListingsResponse,
  MarketPurchaseResponse,
  MarketSellableItemsResponse,
  MyMarketListingsResponse,
} from "../types/marketplace.types";

export async function getMarketListings(
  characterId: string,
  query: MarketListingsQuery,
) {
  const response = await apiClient.get<MarketListingsResponse>(
    API_ENDPOINTS.market.listings(characterId),
    { params: query },
  );

  return response.data;
}

export async function getMarketSellableItems(characterId: string) {
  const response = await apiClient.get<MarketSellableItemsResponse>(
    API_ENDPOINTS.market.sellableItems(characterId),
  );

  return response.data;
}

export async function getMyMarketListings(
  characterId: string,
  query: MarketListingsQuery,
) {
  const response = await apiClient.get<MyMarketListingsResponse>(
    API_ENDPOINTS.market.myListings(characterId),
    { params: query },
  );

  return response.data;
}

export async function createMarketListing(payload: CreateMarketListingPayload) {
  const response = await apiClient.post<MarketListingMutationResponse>(
    API_ENDPOINTS.market.createListing,
    payload,
  );

  return response.data;
}

export async function buyMarketListing(
  listingId: string,
  payload: BuyMarketListingPayload,
) {
  const response = await apiClient.post<MarketPurchaseResponse>(
    API_ENDPOINTS.market.buy(listingId),
    payload,
  );

  return response.data;
}

export async function cancelMarketListing(
  listingId: string,
  characterId: string,
) {
  const response = await apiClient.post<MarketListingMutationResponse>(
    API_ENDPOINTS.market.cancel(listingId),
    { characterId },
  );

  return response.data;
}

export function extractMarketApiError(
  error: unknown,
  fallback = "Não foi possível concluir a operação.",
) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const apiError = error as {
      response?: { data?: MarketApiErrorResponse };
    };
    const message = apiError.response?.data?.message;

    if (Array.isArray(message)) return message.join(" ");
    if (typeof message === "string") return message;
    if (typeof apiError.response?.data?.error === "string") {
      return apiError.response.data.error;
    }
  }

  return fallback;
}
