import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import type { GeneralChatHistoryResponse } from "../types/chat.types";

export async function listGeneralChatMessages(params?: {
  before?: string | null;
  limit?: number;
}) {
  const response = await apiClient.get<GeneralChatHistoryResponse>(
    API_ENDPOINTS.chat.generalMessages,
    {
      params: {
        ...(params?.before ? { before: params.before } : {}),
        ...(params?.limit ? { limit: params.limit } : {}),
      },
    },
  );

  return response.data;
}
