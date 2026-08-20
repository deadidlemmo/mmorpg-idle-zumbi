import { createContext } from 'react';
import type { GatheringRealtimeContextValue } from './GatheringRealtimeProvider';

export const GatheringRealtimeContext =
  createContext<GatheringRealtimeContextValue | null>(null);
