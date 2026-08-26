/* eslint-disable react-hooks/set-state-in-effect */
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { IncursionsRealtimeContext } from "./incursionsRealtimeContext";
import {
  createActivityTimelineClockSample,
  getActivityTimelineFrame,
  getActivityTimelineMonotonicNowMs,
  getActivityTimelineReconciliationDelayMs,
  isActivityTimelineReconciliationDue,
  type ActivityTimeline,
  type ActivityTimelineClockSample,
} from "../../../components/game/activityTimeline";
import { useActivityTimelineProviderState } from "../../../components/game/useActivityTimelineProviderState";
import { getAuthToken } from "../../../services/api/authToken";
import { canRunNetworkRefresh } from "../../../utils/networkRefresh";
import {
  cancelIncursion,
  claimIncursion,
  getIncursionStatus,
  startIncursion,
} from "../api/incursions.api";
import type {
  CancelIncursionResponse,
  ClaimIncursionResponse,
  IncursionApproach,
  IncursionSession,
  IncursionStatusResponse,
  StartIncursionResponse,
} from "../types/incursions.types";

interface IncursionsRealtimeProviderProps {
  characterId: string;
  children: ReactNode;
  autoLoad?: boolean;
  enabled?: boolean;
  refreshMs?: number;
  tickMs?: number;
}

export interface IncursionsRealtimeState {
  characterId: string;
  status: IncursionStatusResponse | null;
  session: IncursionSession | null;
  isActive: boolean;
  isCompleted: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isBusy: boolean;
  isSocketConnected: boolean;
  errorMessage: string | null;
  lastUpdatedAt: number | null;
  nowMs: number;
  timeline: ActivityTimeline | null;
}

export interface IncursionsRealtimeContextValue {
  state: IncursionsRealtimeState;
  refresh: () => Promise<IncursionStatusResponse | null>;
  start: (
    incursionId: string,
    approach: IncursionApproach,
  ) => Promise<StartIncursionResponse | null>;
  claim: (sessionId: string) => Promise<ClaimIncursionResponse | null>;
  cancel: () => Promise<CancelIncursionResponse | null>;
  clearError: () => void;
}

type IncursionSocketPayload = IncursionStatusResponse & {
  session?: IncursionSession | null;
  activeSession?: IncursionSession | null;
  message?: string | null;
};

const DEFAULT_API_BASE_URL = "http://localhost:3000";
const INCURSIONS_NAMESPACE = "/incursions";
const INCURSION_STATUS_EVENTS = [
  "incursion:status",
  "incursion:started",
  "incursion:progress",
  "incursion:completed",
  "incursion:rewarded",
  "incursion:claimed",
  "incursion:cancelled",
] as const;

function normalizeSocketBaseUrl(url: unknown) {
  const rawUrl = String(url || DEFAULT_API_BASE_URL).trim();

  const normalizedUrl = rawUrl
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "")
    .replace(/\/incursions$/i, "");

  return normalizedUrl || DEFAULT_API_BASE_URL;
}

function getIncursionsSocketUrl() {
  const apiBaseUrl = normalizeSocketBaseUrl(
    import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL,
  );
  const socketBaseUrl = normalizeSocketBaseUrl(
    import.meta.env.VITE_SOCKET_URL ?? apiBaseUrl,
  );

  return `${socketBaseUrl}${INCURSIONS_NAMESPACE}`;
}

function extractApiError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response
      ?.data?.message === "string"
  ) {
    return (error as { response: { data: { message: string } } }).response.data
      .message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Não foi possível atualizar as incursões.";
}

function buildStatusFromPayload(
  payload: unknown,
): IncursionStatusResponse | null {
  const record = payload as IncursionSocketPayload | null | undefined;

  if (!record) return null;

  if ("activeSession" in record) {
    return {
      activeSession: record.activeSession ?? null,
      rewardedSession: record.rewardedSession ?? null,
    };
  }

  if (record.session) {
    return { activeSession: record.session };
  }

  return null;
}

function getLiveSession(
  session: IncursionSession | null,
  nowMs: number,
  timeline: ActivityTimeline | null,
) {
  if (!session) return null;

  if (
    session.status === "ACTIVE" &&
    timeline?.activityInstanceId === session.id
  ) {
    const frame = getActivityTimelineFrame(timeline);

    return {
      ...session,
      status: frame.isComplete ? "COMPLETED" : session.status,
      remainingSeconds: Math.max(0, Math.ceil(frame.remainingMs / 1000)),
      progressPercent: frame.progressPercent,
      canClaim: false,
    } satisfies IncursionSession;
  }

  const startedAtMs = Date.parse(session.startedAt);
  const endsAtMs = Date.parse(session.endsAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endsAtMs)) {
    return session;
  }

  const totalMs = Math.max(1, endsAtMs - startedAtMs);
  const elapsedMs = Math.max(0, Math.min(totalMs, nowMs - startedAtMs));
  const isCompleted = nowMs >= endsAtMs || session.status === "COMPLETED";

  return {
    ...session,
    status:
      session.status === "ACTIVE" && isCompleted ? "COMPLETED" : session.status,
    remainingSeconds: Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000)),
    progressPercent: Math.round((elapsedMs / totalMs) * 100),
    canClaim: false,
  } satisfies IncursionSession;
}

export function IncursionsRealtimeProvider({
  characterId,
  children,
  autoLoad = true,
  enabled = true,
  refreshMs = 15000,
  tickMs = 1000,
}: IncursionsRealtimeProviderProps) {
  const {
    applySnapshot: applyTimelineSnapshot,
    clearTimeline,
    timeline,
  } = useActivityTimelineProviderState();
  const [status, setStatus] = useState<IncursionStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const socketRef = useRef<Socket | null>(null);
  const isSocketAuthenticatedRef = useRef(false);
  const statusRef = useRef<IncursionStatusResponse | null>(null);
  const isRefreshingRef = useRef(false);
  const mountedRef = useRef(false);
  const applyStatus = useCallback(
    (
      nextStatus: IncursionStatusResponse,
      clock?: ActivityTimelineClockSample,
    ) => {
      const timelineSnapshot = nextStatus.activeSession?.timeline ?? null;

      if (timelineSnapshot) {
        applyTimelineSnapshot(timelineSnapshot, clock);
      } else {
        clearTimeline();
      }

      statusRef.current = nextStatus;

      if (!mountedRef.current) return;

      setStatus(nextStatus);
      setLastUpdatedAt(Date.now());
      setIsLoading(false);
      setErrorMessage(null);
    },
    [applyTimelineSnapshot, clearTimeline],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !characterId) return null;

    if (isRefreshingRef.current) return statusRef.current;

    isRefreshingRef.current = true;
    if (mountedRef.current) setIsRefreshing(true);

    try {
      const requestStartedAtMonotonicMs =
        getActivityTimelineMonotonicNowMs();
      const response = await getIncursionStatus(characterId);
      applyStatus(
        response,
        createActivityTimelineClockSample({
          requestStartedAtMonotonicMs,
        }),
      );
      return response;
    } catch (error) {
      if (mountedRef.current) setErrorMessage(extractApiError(error));
      return null;
    } finally {
      isRefreshingRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [applyStatus, characterId, enabled]);

  const requestSocketSnapshot = useCallback(() => {
    const socket = socketRef.current;

    if (
      !socket ||
      !socket.connected ||
      !isSocketAuthenticatedRef.current ||
      !characterId
    ) {
      return;
    }

    socket.emit("incursion:status:request", { characterId });
  }, [characterId]);

  const reconcileCompletedSession = useCallback(() => {
    if (!canRunNetworkRefresh()) return;

    if (socketRef.current?.connected && isSocketAuthenticatedRef.current) {
      requestSocketSnapshot();
      return;
    }

    void refresh();
  }, [refresh, requestSocketSnapshot]);

  const start = useCallback(
    async (incursionId: string, approach: IncursionApproach) => {
      if (!enabled || !characterId) return null;

      setIsBusy(true);
      setErrorMessage(null);

      try {
        const requestStartedAtMonotonicMs =
          getActivityTimelineMonotonicNowMs();
        const response = await startIncursion(
          characterId,
          incursionId,
          approach,
        );
        applyStatus(
          { activeSession: response.session ?? null },
          createActivityTimelineClockSample({
            requestStartedAtMonotonicMs,
          }),
        );
        requestSocketSnapshot();

        if (
          !socketRef.current?.connected ||
          !isSocketAuthenticatedRef.current
        ) {
          await refresh();
        }

        return response;
      } catch (error) {
        if (mountedRef.current) setErrorMessage(extractApiError(error));
        return null;
      } finally {
        if (mountedRef.current) setIsBusy(false);
      }
    },
    [applyStatus, characterId, enabled, refresh, requestSocketSnapshot],
  );

  const claim = useCallback(
    async (sessionId: string) => {
      if (!enabled || !characterId) return null;

      setIsBusy(true);
      setErrorMessage(null);

      try {
        const response = await claimIncursion(characterId, sessionId);
        applyStatus({ activeSession: null });
        requestSocketSnapshot();

        if (
          !socketRef.current?.connected ||
          !isSocketAuthenticatedRef.current
        ) {
          await refresh();
        }

        return response;
      } catch (error) {
        if (mountedRef.current) setErrorMessage(extractApiError(error));
        return null;
      } finally {
        if (mountedRef.current) setIsBusy(false);
      }
    },
    [applyStatus, characterId, enabled, refresh, requestSocketSnapshot],
  );

  const cancel = useCallback(async () => {
    if (!enabled || !characterId) return null;

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await cancelIncursion(characterId);
      applyStatus({ activeSession: null, rewardedSession: null });
      requestSocketSnapshot();

      if (!socketRef.current?.connected || !isSocketAuthenticatedRef.current) {
        await refresh();
      }

      return response;
    } catch (error) {
      if (mountedRef.current) setErrorMessage(extractApiError(error));
      return null;
    } finally {
      if (mountedRef.current) setIsBusy(false);
    }
  }, [applyStatus, characterId, enabled, refresh, requestSocketSnapshot]);

  const clearError = useCallback(() => setErrorMessage(null), []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    statusRef.current = null;
    clearTimeline();
    setStatus(null);
    setIsLoading(autoLoad);
    setErrorMessage(null);
    setLastUpdatedAt(null);
  }, [autoLoad, characterId, clearTimeline]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), tickMs);

    return () => window.clearInterval(intervalId);
  }, [tickMs]);

  useEffect(() => {
    if (!enabled || !characterId || !autoLoad) return undefined;

    void refresh();

    const intervalId = window.setInterval(() => {
      if (!socketRef.current?.connected && canRunNetworkRefresh()) {
        void refresh();
      }
    }, refreshMs);

    return () => window.clearInterval(intervalId);
  }, [autoLoad, characterId, enabled, refresh, refreshMs]);

  useEffect(() => {
    const token = getAuthToken();

    if (!enabled || !characterId || !token) {
      isSocketAuthenticatedRef.current = false;
      setIsSocketConnected(false);
      setErrorMessage(null);
      return undefined;
    }

    const socket = io(getIncursionsSocketUrl(), {
      transports: ["websocket", "polling"],
      withCredentials: true,
      auth: {
        token,
        characterId,
      },
      query: { characterId },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4500,
      autoConnect: false,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      isSocketAuthenticatedRef.current = false;
      if (mountedRef.current) setIsSocketConnected(false);
    };

    const handleAuthenticated = () => {
      isSocketAuthenticatedRef.current = true;

      if (mountedRef.current) {
        setIsSocketConnected(true);
        setErrorMessage(null);
      }

      socket.emit("incursion:join", { characterId });
    };

    const handleDisconnect = () => {
      isSocketAuthenticatedRef.current = false;
      if (mountedRef.current) setIsSocketConnected(false);
    };

    const handleStatusEvent = (payload: unknown) => {
      const nextStatus = buildStatusFromPayload(payload);
      if (nextStatus) applyStatus(nextStatus);
    };

    const handleErrorEvent = (payload: unknown) => {
      const message =
        (payload as { message?: string } | null)?.message ??
        "Erro no realtime de incursões.";
      if (mountedRef.current) setErrorMessage(message);
    };

    socket.on("connect", handleConnect);
    socket.on("incursion:connected", handleAuthenticated);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleErrorEvent);
    socket.on("incursion:error", handleErrorEvent);

    for (const eventName of INCURSION_STATUS_EVENTS) {
      socket.on(eventName, handleStatusEvent);
    }

    socket.connect();

    return () => {
      if (isSocketAuthenticatedRef.current) {
        socket.emit("incursion:leave", { characterId });
      }

      isSocketAuthenticatedRef.current = false;
      socket.off("connect", handleConnect);
      socket.off("incursion:connected", handleAuthenticated);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleErrorEvent);
      socket.off("incursion:error", handleErrorEvent);

      for (const eventName of INCURSION_STATUS_EVENTS) {
        socket.off(eventName, handleStatusEvent);
      }

      socket.disconnect();
      socketRef.current = null;
      setIsSocketConnected(false);
    };
  }, [applyStatus, characterId, enabled]);

  const liveSession = useMemo(
    () => getLiveSession(status?.activeSession ?? null, nowMs, timeline),
    [nowMs, status?.activeSession, timeline],
  );

  useEffect(() => {
    if (!enabled || !characterId || !timeline) return undefined;

    const timeoutId = window.setTimeout(
      reconcileCompletedSession,
      getActivityTimelineReconciliationDelayMs(timeline),
    );

    return () => window.clearTimeout(timeoutId);
  }, [characterId, enabled, reconcileCompletedSession, timeline]);

  useEffect(() => {
    if (!enabled || !characterId || !timeline) return undefined;

    const reconcileIfDue = () => {
      if (
        document.visibilityState !== "hidden" &&
        isActivityTimelineReconciliationDue(timeline)
      ) {
        reconcileCompletedSession();
      }
    };

    document.addEventListener("visibilitychange", reconcileIfDue);
    window.addEventListener("online", reconcileIfDue);

    return () => {
      document.removeEventListener("visibilitychange", reconcileIfDue);
      window.removeEventListener("online", reconcileIfDue);
    };
  }, [characterId, enabled, reconcileCompletedSession, timeline]);

  const state = useMemo<IncursionsRealtimeState>(
    () => ({
      characterId,
      status: liveSession
        ? { ...status, activeSession: liveSession }
        : status,
      session: liveSession,
      isActive: liveSession?.status === "ACTIVE",
      isCompleted:
        liveSession?.status === "COMPLETED" || Boolean(liveSession?.canClaim),
      isLoading,
      isRefreshing,
      isBusy,
      isSocketConnected,
      errorMessage,
      lastUpdatedAt,
      nowMs,
      timeline,
    }),
    [
      characterId,
      errorMessage,
      isBusy,
      isLoading,
      isRefreshing,
      isSocketConnected,
      lastUpdatedAt,
      liveSession,
      nowMs,
      status,
      timeline,
    ],
  );

  const value = useMemo<IncursionsRealtimeContextValue>(
    () => ({ state, refresh, start, claim, cancel, clearError }),
    [cancel, claim, clearError, refresh, start, state],
  );

  return (
    <IncursionsRealtimeContext.Provider value={value}>
      {children}
    </IncursionsRealtimeContext.Provider>
  );
}
