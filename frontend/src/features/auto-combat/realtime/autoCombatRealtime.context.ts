import { createContext } from 'react';
import type { AutoCombatRealtimeContextValue } from './autoCombatRealtime.types';

export const AutoCombatRealtimeContext =
  createContext<AutoCombatRealtimeContextValue | null>(null);
