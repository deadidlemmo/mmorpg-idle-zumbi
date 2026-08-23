import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import type {
  ProgressionDashboardResponse,
  TutorialProgress,
  TutorialUpdateResponse,
} from "../types/progression.types";

export async function getProgressionDashboard(characterId: string) {
  const response = await apiClient.get<ProgressionDashboardResponse>(
    API_ENDPOINTS.progression.dashboard(characterId),
  );
  return response.data;
}

export async function updateTutorial(
  characterId: string,
  payload: { step: number; completed?: boolean; dismissed?: boolean },
) {
  const response = await apiClient.patch<TutorialUpdateResponse>(
    API_ENDPOINTS.progression.tutorial(characterId),
    payload,
  );
  return response.data;
}

export async function getTutorialProgress(characterId: string) {
  const response = await apiClient.get<TutorialProgress>(
    API_ENDPOINTS.progression.tutorial(characterId),
  );
  return response.data;
}

export async function claimMission(characterId: string, missionId: string) {
  const response = await apiClient.post(
    API_ENDPOINTS.progression.claimMission(characterId, missionId),
  );
  return response.data;
}

export async function claimAchievement(
  characterId: string,
  achievementId: string,
) {
  const response = await apiClient.post(
    API_ENDPOINTS.progression.claimAchievement(characterId, achievementId),
  );
  return response.data;
}
