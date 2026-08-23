import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import type {
  SocialCharacterSearchResponse,
  SocialDashboardResponse,
  SocialRankingCategory,
  SocialRankingResponse,
} from "../types/social.types";
import type { PublicCharacterProfileResponse } from "../../cosmetics/types/cosmetics.types";

export async function getSocialDashboard() {
  const response = await apiClient.get<SocialDashboardResponse>(
    API_ENDPOINTS.social.friends,
  );
  return response.data;
}

export async function searchSocialCharacters(nickname: string) {
  const response = await apiClient.get<SocialCharacterSearchResponse>(
    API_ENDPOINTS.social.searchCharacters,
    { params: { nickname } },
  );
  return response.data;
}

export async function sendFriendRequest(targetCharacterId: string) {
  const response = await apiClient.post(API_ENDPOINTS.social.request, {
    targetCharacterId,
  });
  return response.data;
}

export async function getSocialRanking(
  category: SocialRankingCategory,
  limit = 50,
) {
  const response = await apiClient.get<SocialRankingResponse>(
    API_ENDPOINTS.social.rankings,
    { params: { category, limit } },
  );
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

export async function getPublicCharacterProfile(characterId: string) {
  const response = await apiClient.get<PublicCharacterProfileResponse>(
    API_ENDPOINTS.social.characterProfile(characterId),
  );
  return response.data;
}
