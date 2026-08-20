import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import type { SocialDashboardResponse } from "../types/social.types";

export async function getSocialDashboard() {
  const response = await apiClient.get<SocialDashboardResponse>(
    API_ENDPOINTS.social.friends,
  );
  return response.data;
}

export async function sendFriendRequest(email: string) {
  const response = await apiClient.post(API_ENDPOINTS.social.request, {
    email,
  });
  return response.data;
}

export async function acceptFriendRequest(friendshipId: string) {
  const response = await apiClient.post(
    API_ENDPOINTS.social.accept(friendshipId),
  );
  return response.data;
}

export async function removeFriendship(friendshipId: string) {
  const response = await apiClient.delete(
    API_ENDPOINTS.social.remove(friendshipId),
  );
  return response.data;
}
