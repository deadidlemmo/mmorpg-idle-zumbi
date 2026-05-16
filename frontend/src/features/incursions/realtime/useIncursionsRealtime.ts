import { useContext, useMemo } from "react";
import type {
  IncursionsRealtimeContextValue,
  IncursionsRealtimeState,
} from "./IncursionsRealtimeProvider";
import { IncursionsRealtimeContext } from "./incursionsRealtimeContext";

export function useIncursionsRealtime(): IncursionsRealtimeContextValue {
  const context = useContext(IncursionsRealtimeContext);

  if (!context) {
    throw new Error(
      "useIncursionsRealtime deve ser usado dentro de IncursionsRealtimeProvider.",
    );
  }

  return context;
}

export function useIncursionsRealtimeState(): IncursionsRealtimeState {
  return useIncursionsRealtime().state;
}

export function useIncursionsRealtimeActions() {
  const { refresh, start, claim, cancel, clearError } = useIncursionsRealtime();

  return useMemo(
    () => ({ refresh, start, claim, cancel, clearError }),
    [cancel, claim, clearError, refresh, start],
  );
}
