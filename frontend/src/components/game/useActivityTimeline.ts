import { useContext } from 'react';
import { ActivityTimelineContext } from './activityTimelineContext';

export function useActivityTimeline() {
  return useContext(ActivityTimelineContext);
}
