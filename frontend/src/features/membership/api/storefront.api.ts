import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  CreateStorefrontCheckoutPayload,
  CreateStorefrontCheckoutResponse,
  StorefrontCatalogResponse,
  StorefrontOrderResponse,
} from "../types/storefront.types";

export async function getStorefrontCatalog(characterId: string) {
  const response = await apiClient.get<StorefrontCatalogResponse>(
    API_ENDPOINTS.storefront.catalog(characterId),
  );
  return response.data;
}

export async function createStorefrontCheckout(
  payload: CreateStorefrontCheckoutPayload,
) {
  const response = await apiClient.post<CreateStorefrontCheckoutResponse>(
    API_ENDPOINTS.storefront.checkout,
    payload,
  );
  return response.data;
}

export async function getStorefrontOrder(orderId: string) {
  const response = await apiClient.get<StorefrontOrderResponse>(
    API_ENDPOINTS.storefront.order(orderId),
  );
  return response.data;
}
