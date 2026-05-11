import type { RealtimeCharacterProgressState } from '../types/auto-combat-page.types';

function getProgressXp(progress: RealtimeCharacterProgressState | null) {
  return progress?.xp;
}

function getProgressCurrentLevelXp(
  progress: RealtimeCharacterProgressState | null,
) {
  return progress?.currentLevelXp ?? progress?.xpIntoCurrentLevel;
}

function pickHighestProgress(
  ...progresses: Array<RealtimeCharacterProgressState | null>
) {
  return progresses.reduce<RealtimeCharacterProgressState | null>(
    (best, current) => {
      if (!current) return best;
      if (!best) return current;

      const bestXp = getProgressXp(best);
      const currentXp = getProgressXp(current);

      if (bestXp !== undefined && currentXp !== undefined) {
        return currentXp >= bestXp ? current : best;
      }

      const bestLevelXp = getProgressCurrentLevelXp(best);
      const currentLevelXp = getProgressCurrentLevelXp(current);

      if (bestLevelXp !== undefined && currentLevelXp !== undefined) {
        return currentLevelXp >= bestLevelXp ? current : best;
      }

      return current;
    },
    null,
  );
}

export function selectVisibleCharacterProgress(params: {
  hasProviderVisualTimeline: boolean;
  overviewCharacterProgress: RealtimeCharacterProgressState | null;
  statusCharacterProgress: RealtimeCharacterProgressState | null;
  localCharacterProgress: RealtimeCharacterProgressState | null;
  providerProgress: RealtimeCharacterProgressState | null;
}) {
  const {
    hasProviderVisualTimeline,
    overviewCharacterProgress,
    statusCharacterProgress,
    localCharacterProgress,
    providerProgress,
  } = params;

  if (hasProviderVisualTimeline) {
    return (
      providerProgress ?? localCharacterProgress ?? overviewCharacterProgress
    );
  }

  return pickHighestProgress(
    overviewCharacterProgress,
    statusCharacterProgress,
    localCharacterProgress,
    providerProgress,
  );
}
