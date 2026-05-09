import type { ReactNode } from 'react';
import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    collectGatheringRequest,
    extractGatheringApiError,
    getGatheringStatusRequest,
    startGatheringRequest,
    stopGatheringRequest,
} from '../api/gathering.api';
import type {
    GatheringAllowedOrigin,
    GatheringMaterialViewModel,
    GatheringProductionPreviewViewModel,
    GatheringSessionViewModel,
    GatheringSkillViewModel,
    GatheringStatusResponse,
} from '../types/gathering.types';

interface GatheringRealtimeProviderProps {
  characterId: string;
  children: ReactNode;
  autoLoad?: boolean;
  enabled?: boolean;
  refreshMs?: number;
  tickMs?: number;
}

export interface GatheringRealtimeStartPayload {
  mapId: string;
  origin: GatheringAllowedOrigin;
  targetMaterialId: string;
}

export interface GatheringRealtimeLiveProduction {
  readyQuantity: number;
  progressPercent: number;
  secondsToNextUnit: number | null;
  ratePerHour: number | null;
  timePerUnitSeconds: number | null;
}

export interface GatheringRealtimeState {
  characterId: string;

  status: GatheringStatusResponse | null;
  session: GatheringSessionViewModel | null;
  productionPreview: GatheringProductionPreviewViewModel | null;
  gatheringSkill: GatheringSkillViewModel | null;
  targetMaterial: GatheringMaterialViewModel | null;

  isActive: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isBusy: boolean;

  errorMessage: string | null;
  lastUpdatedAt: number | null;
  nowMs: number;

  liveProduction: GatheringRealtimeLiveProduction;
}

export interface GatheringRealtimeContextValue {
  state: GatheringRealtimeState;

  refresh: () => Promise<GatheringStatusResponse | null>;
  start: (
    payload: GatheringRealtimeStartPayload,
  ) => Promise<GatheringStatusResponse | null>;
  collect: () => Promise<unknown>;
  stop: () => Promise<unknown>;

  clearError: () => void;
}

type GatheringStatusLoose = GatheringStatusResponse & {
  active?: boolean | null;
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
};

type GatheringSessionLoose = GatheringSessionViewModel & {
  status?: string | null;
  lastResolvedAt?: string | null;
  progressRemainder?: number | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
};

type GatheringProductionPreviewLoose = GatheringProductionPreviewViewModel & {
  elapsedSeconds?: number | null;

  ratePerHour?: number | null;
  baseRatePerHour?: number | null;
  defaultRatePerHour?: number | null;

  estimatedQuantityToCollect?: number | null;
  readyQuantity?: number | null;

  currentProgressRemainder?: number | null;
  estimatedNewProgressRemainder?: number | null;
  progressRemainder?: number | null;

  nextUnitProgressPercent?: number | null;
  progressPercent?: number | null;

  material?: GatheringMaterialViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
};

type GatheringMaterialLoose = GatheringMaterialViewModel & {
  baseGatheringRatePerHour?: number | null;
};

export const GatheringRealtimeContext =
  createContext<GatheringRealtimeContextValue | null>(null);

function toSafeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFirstValidNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function clampPercent(value: unknown): number {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(100, parsed));
}

function clampFraction(value: unknown): number {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(0.9999, parsed));
}

function normalizeStatus(status?: string | null): string {
  return String(status ?? '').trim().toUpperCase();
}

function isSessionActive(session?: GatheringSessionViewModel | null): boolean {
  const looseSession = session as GatheringSessionLoose | null;

  return normalizeStatus(looseSession?.status) === 'ACTIVE';
}

function isActiveGatheringStatus(
  status?: GatheringStatusResponse | null,
): status is GatheringStatusResponse & { active: true } {
  return (status as GatheringStatusLoose | null)?.active === true;
}

function getParsedDateMs(value?: string | null): number | null {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getActiveSession(
  status?: GatheringStatusResponse | null,
): GatheringSessionViewModel | null {
  const looseStatus = status as GatheringStatusLoose | null;

  if (isActiveGatheringStatus(status) && looseStatus?.session) {
    return looseStatus.session;
  }

  if (looseStatus?.session && isSessionActive(looseStatus.session)) {
    return looseStatus.session;
  }

  return null;
}

function getProductionPreview(params: {
  status?: GatheringStatusResponse | null;
  session?: GatheringSessionViewModel | null;
}): GatheringProductionPreviewViewModel | null {
  const looseStatus = params.status as GatheringStatusLoose | null;
  const looseSession = params.session as GatheringSessionLoose | null;

  return (
    looseStatus?.productionPreview ??
    looseSession?.productionPreview ??
    null
  );
}

function getGatheringSkill(params: {
  status?: GatheringStatusResponse | null;
  session?: GatheringSessionViewModel | null;
}): GatheringSkillViewModel | null {
  const looseStatus = params.status as GatheringStatusLoose | null;
  const looseSession = params.session as GatheringSessionLoose | null;

  return looseStatus?.gatheringSkill ?? looseSession?.gatheringSkill ?? null;
}

function getTargetMaterial(params: {
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
}): GatheringMaterialViewModel | null {
  const looseSession = params.session as GatheringSessionLoose | null;
  const loosePreview =
    params.productionPreview as GatheringProductionPreviewLoose | null;

  return (
    looseSession?.targetMaterial ??
    loosePreview?.targetMaterial ??
    loosePreview?.material ??
    null
  );
}

function getRatePerHour(params: {
  productionPreview?: GatheringProductionPreviewViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
}): number | null {
  const loosePreview =
    params.productionPreview as GatheringProductionPreviewLoose | null;
  const looseMaterial = params.targetMaterial as GatheringMaterialLoose | null;

  const rate = getFirstValidNumber(
    loosePreview?.ratePerHour,
    loosePreview?.baseRatePerHour,
    loosePreview?.defaultRatePerHour,
    looseMaterial?.baseGatheringRatePerHour,
  );

  if (rate === undefined || rate <= 0) {
    return null;
  }

  return rate;
}

function getBaseReadyQuantity(
  productionPreview?: GatheringProductionPreviewViewModel | null,
): number {
  const loosePreview =
    productionPreview as GatheringProductionPreviewLoose | null;

  const readyQuantity = getFirstValidNumber(
    loosePreview?.estimatedQuantityToCollect,
    loosePreview?.readyQuantity,
    0,
  );

  return Math.max(0, Math.floor(readyQuantity ?? 0));
}

function getBaseProgressRemainder(params: {
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
}): number {
  const looseSession = params.session as GatheringSessionLoose | null;
  const loosePreview =
    params.productionPreview as GatheringProductionPreviewLoose | null;

  return clampFraction(
    getFirstValidNumber(
      loosePreview?.estimatedNewProgressRemainder,
      loosePreview?.currentProgressRemainder,
      loosePreview?.progressRemainder,
      looseSession?.progressRemainder,
      0,
    ),
  );
}

function hasFreshProductionPreview(
  productionPreview?: GatheringProductionPreviewViewModel | null,
): boolean {
  const loosePreview =
    productionPreview as GatheringProductionPreviewLoose | null;

  if (!loosePreview) return false;

  return (
    loosePreview.estimatedQuantityToCollect !== undefined ||
    loosePreview.readyQuantity !== undefined ||
    loosePreview.estimatedNewProgressRemainder !== undefined ||
    loosePreview.currentProgressRemainder !== undefined ||
    loosePreview.progressRemainder !== undefined ||
    loosePreview.nextUnitProgressPercent !== undefined ||
    loosePreview.progressPercent !== undefined ||
    loosePreview.elapsedSeconds !== undefined
  );
}

function getBaseTimestampMs(params: {
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  lastUpdatedAt?: number | null;
}): number | null {
  const looseSession = params.session as GatheringSessionLoose | null;

  /*
   * Quando existe productionPreview, o backend já calculou a produção
   * até o momento em que a resposta chegou.
   *
   * Então o front deve continuar a contagem a partir de lastUpdatedAt,
   * não de lastResolvedAt. Usar lastResolvedAt aqui soma novamente o tempo
   * que o backend já considerou e faz a Activity Bar correr mais rápido.
   */
  if (hasFreshProductionPreview(params.productionPreview)) {
    return params.lastUpdatedAt ?? Date.now();
  }

  return getParsedDateMs(looseSession?.lastResolvedAt) ?? params.lastUpdatedAt ?? null;
}

function buildLiveProduction(params: {
  isActive: boolean;
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
  nowMs: number;
  lastUpdatedAt?: number | null;
}): GatheringRealtimeLiveProduction {
  const ratePerHour = getRatePerHour({
    productionPreview: params.productionPreview,
    targetMaterial: params.targetMaterial,
  });

  const baseReadyQuantity = getBaseReadyQuantity(params.productionPreview);
  const baseRemainder = getBaseProgressRemainder({
    session: params.session,
    productionPreview: params.productionPreview,
  });

  if (!params.isActive || !ratePerHour || ratePerHour <= 0) {
    return {
      readyQuantity: baseReadyQuantity,
      progressPercent: clampPercent(baseRemainder * 100),
      secondsToNextUnit: null,
      ratePerHour,
      timePerUnitSeconds: null,
    };
  }

  const baseTimestampMs = getBaseTimestampMs({
    session: params.session,
    productionPreview: params.productionPreview,
    lastUpdatedAt: params.lastUpdatedAt,
  });

  const elapsedSeconds =
    baseTimestampMs === null
      ? 0
      : Math.max(0, Math.floor((params.nowMs - baseTimestampMs) / 1000));

  const productionPerSecond = ratePerHour / 3600;
  const producedSinceBase = elapsedSeconds * productionPerSecond;

  const totalProduction = Math.max(
    0,
    baseReadyQuantity + baseRemainder + producedSinceBase,
  );

  const readyQuantity = Math.max(0, Math.floor(totalProduction));
  const currentRemainder = clampFraction(totalProduction - readyQuantity);

  const secondsToNextUnit =
    productionPerSecond > 0
      ? Math.max(1, Math.ceil((1 - currentRemainder) / productionPerSecond))
      : null;

  const timePerUnitSeconds =
    productionPerSecond > 0
      ? Math.max(1, Math.ceil(1 / productionPerSecond))
      : null;

  return {
    readyQuantity,
    progressPercent: clampPercent(currentRemainder * 100),
    secondsToNextUnit,
    ratePerHour,
    timePerUnitSeconds,
  };
}

function buildState(params: {
  characterId: string;
  status: GatheringStatusResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isBusy: boolean;
  errorMessage: string | null;
  lastUpdatedAt: number | null;
  nowMs: number;
}): GatheringRealtimeState {
  const session = getActiveSession(params.status);
  const productionPreview = getProductionPreview({
    status: params.status,
    session,
  });

  const gatheringSkill = getGatheringSkill({
    status: params.status,
    session,
  });

  const targetMaterial = getTargetMaterial({
    session,
    productionPreview,
  });

  const isActive = Boolean(session);

  const liveProduction = buildLiveProduction({
    isActive,
    session,
    productionPreview,
    targetMaterial,
    nowMs: params.nowMs,
    lastUpdatedAt: params.lastUpdatedAt,
  });

  return {
    characterId: params.characterId,

    status: params.status,
    session,
    productionPreview,
    gatheringSkill,
    targetMaterial,

    isActive,
    isLoading: params.isLoading,
    isRefreshing: params.isRefreshing,
    isBusy: params.isBusy,

    errorMessage: params.errorMessage,
    lastUpdatedAt: params.lastUpdatedAt,
    nowMs: params.nowMs,

    liveProduction,
  };
}

export function GatheringRealtimeProvider({
  characterId,
  children,
  autoLoad = true,
  enabled = true,
  refreshMs = 5000,
  tickMs = 1000,
}: GatheringRealtimeProviderProps) {
  const [status, setStatus] = useState<GatheringStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isMountedRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const statusRef = useRef<GatheringStatusResponse | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const refresh = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    if (isRefreshingRef.current) {
      return statusRef.current;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const response = await getGatheringStatusRequest(characterId);

      if (!isMountedRef.current) {
        return response;
      }

      statusRef.current = response;
      setStatus(response);
      setLastUpdatedAt(Date.now());
      setErrorMessage(null);

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractGatheringApiError(error));
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }

      isRefreshingRef.current = false;
    }
  }, [characterId, enabled]);

  const start = useCallback(
    async (payload: GatheringRealtimeStartPayload) => {
      if (!enabled || !characterId) {
        return null;
      }

      setIsBusy(true);
      setErrorMessage(null);

      try {
        await startGatheringRequest({
          characterId,
          mapId: payload.mapId,
          origin: payload.origin,
          targetMaterialId: payload.targetMaterialId,
        });

        return await refresh();
      } catch (error) {
        if (isMountedRef.current) {
          setErrorMessage(extractGatheringApiError(error));
        }

        return null;
      } finally {
        if (isMountedRef.current) {
          setIsBusy(false);
        }
      }
    },
    [characterId, enabled, refresh],
  );

  const collect = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await collectGatheringRequest(characterId);

      await refresh();

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractGatheringApiError(error));
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [characterId, enabled, refresh]);

  const stop = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await stopGatheringRequest(characterId);

      await refresh();

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractGatheringApiError(error));
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [characterId, enabled, refresh]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, tickMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, tickMs]);

  useEffect(() => {
    if (!enabled || !characterId || !autoLoad) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void refresh();
  }, [autoLoad, characterId, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !characterId || refreshMs <= 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, refreshMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [characterId, enabled, refresh, refreshMs]);

  const state = useMemo(
    () =>
      buildState({
        characterId,
        status,
        isLoading,
        isRefreshing,
        isBusy,
        errorMessage,
        lastUpdatedAt,
        nowMs,
      }),
    [
      characterId,
      errorMessage,
      isBusy,
      isLoading,
      isRefreshing,
      lastUpdatedAt,
      nowMs,
      status,
    ],
  );

  const value = useMemo<GatheringRealtimeContextValue>(
    () => ({
      state,
      refresh,
      start,
      collect,
      stop,
      clearError,
    }),
    [clearError, collect, refresh, start, state, stop],
  );

  return (
    <GatheringRealtimeContext.Provider value={value}>
      {children}
    </GatheringRealtimeContext.Provider>
  );
}

export default GatheringRealtimeProvider;