import { createContext } from 'react';
import type { ActivityTimelineProviderState } from './activityTimeline';

export const ActivityTimelineContext =
  createContext<ActivityTimelineProviderState | null>(null);
