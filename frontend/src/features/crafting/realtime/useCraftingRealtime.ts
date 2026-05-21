import { useContext, useMemo } from "react";
import {
  CraftingRealtimeContext,
  type CraftingRealtimeContextValue,
  type CraftingRealtimeLiveSession,
  type CraftingRealtimeState,
} from "./CraftingRealtimeProvider";

export function useCraftingRealtime(): CraftingRealtimeContextValue {
  const context = useContext(CraftingRealtimeContext);

  if (!context) {
    throw new Error(
      "useCraftingRealtime deve ser usado dentro de CraftingRealtimeProvider.",
    );
  }

  return context;
}

export function useCraftingRealtimeState(): CraftingRealtimeState {
  return useCraftingRealtime().state;
}

export function useCraftingRealtimeActions() {
  const { refresh, stop, requestSnapshot, clearError } = useCraftingRealtime();

  return useMemo(
    () => ({
      refresh,
      stop,
      requestSnapshot,
      clearError,
    }),
    [clearError, refresh, requestSnapshot, stop],
  );
}

export function useCraftingLiveSession(): CraftingRealtimeLiveSession {
  return useCraftingRealtimeState().liveSession;
}
