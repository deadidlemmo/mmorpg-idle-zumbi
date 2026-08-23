export type MissionType = "DAILY" | "WEEKLY" | "STORY";
export type MissionStatus = "ACTIVE" | "COMPLETED" | "CLAIMED" | "EXPIRED";

export interface TutorialStep {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}

export interface TutorialProgress {
  id: string;
  characterId: string;
  step: number;
  completed: boolean;
  completedAt?: string | null;
  dismissedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  steps: TutorialStep[];
}

export type TutorialUpdateResponse = Omit<TutorialProgress, "steps">;

export interface CharacterMission {
  id: string;
  status: MissionStatus;
  progress: number;
  targetValue: number;
  periodKey: string;
  assignedAt: string;
  expiresAt?: string | null;
  completedAt?: string | null;
  claimedAt?: string | null;
  mission: {
    id: string;
    key: string;
    title: string;
    description: string;
    type: MissionType;
    objectiveType: string;
    targetValue: number;
    rewardXp: number;
    rewardGold: number;
  };
}

export interface CharacterAchievement {
  id: string;
  progress: number;
  unlockedAt?: string | null;
  claimedAt?: string | null;
  achievement: {
    id: string;
    key: string;
    title: string;
    description: string;
    metricKey: string;
    targetValue: number;
    rewardCash: number;
  };
}

export interface ProgressionDashboardResponse {
  serverNow: string;
  tutorial: TutorialProgress;
  missions: CharacterMission[];
  achievements: CharacterAchievement[];
}
