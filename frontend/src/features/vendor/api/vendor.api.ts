import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type {
  VendorApiErrorResponse,
  VendorShopResponse,
  VendorTransactionPayload,
  VendorTransactionResponse,
} from "../types/vendor.types";

export async function getVendorShop(
  characterId: string,
): Promise<VendorShopResponse> {
  const response = await apiClient.get<VendorShopResponse>(
    API_ENDPOINTS.vendor.shop(characterId),
  );

  return response.data;
}

export async function buyVendorItem(
  characterId: string,
  payload: Required<Pick<VendorTransactionPayload, "itemId">> &
    Pick<VendorTransactionPayload, "quantity">,
): Promise<VendorTransactionResponse> {
  const response = await apiClient.post<VendorTransactionResponse>(
    API_ENDPOINTS.vendor.buy(characterId),
    payload,
  );

  return response.data;
}

export function extractVendorApiError(
  error: unknown,
  fallback = "Nao foi possivel concluir a transacao. Tente novamente.",
): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const apiError = error as {
      response?: {
        data?: VendorApiErrorResponse;
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
