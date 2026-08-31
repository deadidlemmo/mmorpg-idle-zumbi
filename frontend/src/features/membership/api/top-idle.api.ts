import { API_ENDPOINTS } from "../../../services/api/endpoints";
import { apiClient } from "../../../services/api/apiClient";
import type { TopIdleRewardStatus } from "../types/top-idle.types";

export async function getTopIdleRewardStatus() {
  const response = await apiClient.get<TopIdleRewardStatus>(
    API_ENDPOINTS.topIdle.reward,
  );
  return response.data;
}
