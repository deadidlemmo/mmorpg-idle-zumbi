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

export function getTutorialGuidanceVisibility(
  tutorial: Pick<
    TutorialProgress,
    "completed" | "dismissedAt" | "objective"
  >,
) {
  const showTutorial = !tutorial.completed && !tutorial.dismissedAt;

  return {
    showTutorial,
    showObjective: !showTutorial && !tutorial.objective.completed,
  };
}
