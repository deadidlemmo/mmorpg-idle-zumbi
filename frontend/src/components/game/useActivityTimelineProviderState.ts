import { useCallback, useMemo, useState } from 'react';
import {
  createActivityTimelineClockSample,
  reconcileActivityTimelineProviderState,
  type ActivityTimelineClockSample,
  type ActivityTimelineProviderState,
  type ActivityTimelineSnapshot,
} from './activityTimeline';

export function useActivityTimelineProviderState(
  initialSnapshot: ActivityTimelineSnapshot | null = null,
) {
  const [state, setState] = useState<ActivityTimelineProviderState | null>(() =>
    reconcileActivityTimelineProviderState(
      null,
      initialSnapshot,
      createActivityTimelineClockSample(),
    ),
  );

  const applySnapshot = useCallback(
    (
      snapshot: ActivityTimelineSnapshot | null,
      clock?: ActivityTimelineClockSample,
    ) => {
      setState((current) =>
        reconcileActivityTimelineProviderState(
          current,
          snapshot,
          clock ?? createActivityTimelineClockSample(),
        ),
      );
    },
    [],
  );

  const clearTimeline = useCallback(() => {
    setState(null);
  }, []);

  return useMemo(
    () => ({
      applySnapshot,
      clearTimeline,
      state,
      timeline: state?.timeline ?? null,
    }),
    [applySnapshot, clearTimeline, state],
  );
}
