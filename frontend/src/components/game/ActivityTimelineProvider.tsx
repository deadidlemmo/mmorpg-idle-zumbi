import type { ReactNode } from 'react';
import type { ActivityTimelineProviderState } from './activityTimeline';
import { ActivityTimelineContext } from './activityTimelineContext';

interface ActivityTimelineProviderProps {
  children: ReactNode;
  state: ActivityTimelineProviderState | null;
}

export function ActivityTimelineProvider({
  children,
  state,
}: ActivityTimelineProviderProps) {
  return (
    <ActivityTimelineContext.Provider value={state}>
      {children}
    </ActivityTimelineContext.Provider>
  );
}

export default ActivityTimelineProvider;
