import { useContext, useMemo } from 'react';
import {
    GatheringRealtimeContext,
    type GatheringRealtimeContextValue,
    type GatheringRealtimeLiveProduction,
    type GatheringRealtimeState,
} from './GatheringRealtimeProvider';

export function useGatheringRealtime(): GatheringRealtimeContextValue {
  const context = useContext(GatheringRealtimeContext);

  if (!context) {
    throw new Error(
      'useGatheringRealtime deve ser usado dentro de GatheringRealtimeProvider.',
    );
  }

  return context;
}

export function useGatheringRealtimeState(): GatheringRealtimeState {
  return useGatheringRealtime().state;
}

export function useGatheringRealtimeActions() {
  const { refresh, start, collect, stop, clearError } = useGatheringRealtime();

  return useMemo(
    () => ({
      refresh,
      start,
      collect,
      stop,
      clearError,
    }),
    [clearError, collect, refresh, start, stop],
  );
}

export function useGatheringRealtimeSession() {
  const state = useGatheringRealtimeState();

  return useMemo(
    () => ({
      session: state.session,
      status: state.status,
      productionPreview: state.productionPreview,
      gatheringSkill: state.gatheringSkill,
      targetMaterial: state.targetMaterial,
      isActive: state.isActive,
    }),
    [
      state.gatheringSkill,
      state.isActive,
      state.productionPreview,
      state.session,
      state.status,
      state.targetMaterial,
    ],
  );
}

export function useGatheringLiveProduction(): GatheringRealtimeLiveProduction {
  return useGatheringRealtimeState().liveProduction;
}

export function useGatheringRealtimeFlags() {
  const state = useGatheringRealtimeState();

  return useMemo(
    () => ({
      isActive: state.isActive,
      isLoading: state.isLoading,
      isRefreshing: state.isRefreshing,
      isBusy: state.isBusy,
      hasError: Boolean(state.errorMessage),
      errorMessage: state.errorMessage,
      lastUpdatedAt: state.lastUpdatedAt,
    }),
    [
      state.errorMessage,
      state.isActive,
      state.isBusy,
      state.isLoading,
      state.isRefreshing,
      state.lastUpdatedAt,
    ],
  );
}

export function useGatheringRealtimeError() {
  const { state, clearError } = useGatheringRealtime();

  return useMemo(
    () => ({
      errorMessage: state.errorMessage,
      hasError: Boolean(state.errorMessage),
      clearError,
    }),
    [clearError, state.errorMessage],
  );
}

export function useGatheringRealtimeIsActive(): boolean {
  return useGatheringRealtimeState().isActive;
}

export function useGatheringRealtimeMaterial() {
  const state = useGatheringRealtimeState();

  return useMemo(
    () => ({
      material: state.targetMaterial,
      materialName: state.targetMaterial?.name ?? null,
      materialId: state.targetMaterial?.id ?? null,
    }),
    [state.targetMaterial],
  );
}