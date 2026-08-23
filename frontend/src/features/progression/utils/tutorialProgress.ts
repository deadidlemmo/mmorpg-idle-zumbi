import type {
  TutorialProgress,
  TutorialUpdateResponse,
} from "../types/progression.types";

export function mergeTutorialUpdate(
  current: TutorialProgress,
  update: TutorialUpdateResponse,
): TutorialProgress {
  return {
    ...current,
    ...update,
    steps: current.steps,
  };
}
