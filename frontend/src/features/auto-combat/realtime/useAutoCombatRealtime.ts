import { useContext } from 'react';
import { AutoCombatRealtimeContext } from './autoCombatRealtime.context';

export function useAutoCombatRealtime() {
  const context = useContext(AutoCombatRealtimeContext);

  if (!context) {
    throw new Error(
      'useAutoCombatRealtime deve ser usado dentro de AutoCombatRealtimeProvider.',
    );
  }

  return context;
}

export function useAutoCombatRealtimeState() {
  return useAutoCombatRealtime().state;
}
