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
    steps: update.steps ?? current.steps,
    objective: update.objective ?? current.objective,
  };
}
