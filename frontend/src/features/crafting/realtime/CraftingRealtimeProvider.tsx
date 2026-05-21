/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { getAuthToken } from "../../../services/api/authToken";
import { useLootNotifications } from "../../loot-notifications/lootNotificationContext";
import {
  extractCraftingApiError,
  getCraftingStatusRequest,
  stopCraftingRequest,
} from "../api/crafting.api";
import type {
  CraftingSessionViewModel,
  CraftingSkillViewModel,
  CraftingStatusResponse,
} from "../types/crafting.types";

interface CraftingRealtimeProviderProps {
  characterId: string;
  children: ReactNode;
  autoLoad?: boolean;
  enabled?: boolean;
  refreshMs?: number;
  tickMs?: number;
}

export interface CraftingRealtimeLiveSession {
  remainingSeconds: number;
  progressPercent: number;
  isComplete: boolean;
}

export interface CraftingRealtimeState {
  characterId: string;
  status: CraftingStatusResponse | null;
  session: CraftingSessionViewModel | null;
  craftingSkill: CraftingSkillViewModel | null;
  completedSessions: CraftingSessionViewModel[];
  isActive: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isBusy: boolean;
  isSocketConnected: boolean;
  errorMessage: string | null;
  lastUpdatedAt: number | null;
  nowMs: number;
  liveSession: CraftingRealtimeLiveSession;
}

export interface CraftingRealtimeContextValue {
  state: CraftingRealtimeState;
  refresh: () => Promise<CraftingStatusResponse | null>;
  stop: () => Promise<CraftingStatusResponse | null>;
  requestSnapshot: () => void;
  clearError: () => void;
}

type LooseRecord = Record<string, unknown>;

const CRAFTING_SOCKET_NAMESPACE = "/crafting";
const MAX_PROCESSED_CRAFTING_LOOT_KEYS = 240;
const CRAFTING_STATUS_EVENTS = [
  "crafting:status",
  "crafting:snapshot",
  "crafting:session",
  "crafting:session:update",
  "crafting:started",
  "crafting:progress",
  "crafting:completed",
  "crafting:stopped",
] as const;

export const CraftingRealtimeContext =
  createContext<CraftingRealtimeContextValue | null>(null);

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value: unknown) {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(100, parsed));
}

function getParsedDateMs(value?: string | null) {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSocketBaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/api\/?$/i, "")
    .replace(/\/$/, "");
}

function getCraftingSocketUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;

  const rawUrl =
    env.VITE_SOCKET_URL ??
    env.VITE_API_URL ??
    env.VITE_BACKEND_URL ??
    "http://localhost:3000";

  const baseUrl = normalizeSocketBaseUrl(rawUrl);

  if (baseUrl.endsWith(CRAFTING_SOCKET_NAMESPACE)) {
    return baseUrl;
  }

  return `${baseUrl}${CRAFTING_SOCKET_NAMESPACE}`;
}

function looksLikeCraftingStatus(
  value: unknown,
): value is CraftingStatusResponse {
  if (!isRecord(value)) return false;

  return (
    "active" in value ||
    "activeSession" in value ||
    "craftingSkill" in value ||
    "completedSessions" in value
  );
}

function unwrapSocketPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  if (looksLikeCraftingStatus(payload)) {
    return payload;
  }

  const candidates = [
    payload.status,
    payload.state,
    payload.snapshot,
    payload.data,
    payload.result,
    payload.payload,
  ];

  for (const candidate of candidates) {
    if (looksLikeCraftingStatus(candidate)) {
      return candidate;
    }
  }

  return payload;
}

function extractSocketError(payload: unknown) {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  if (isRecord(payload) && typeof payload.message === "string") {
    return payload.message;
  }

  return null;
}

function buildLiveSession(
  session: CraftingSessionViewModel | null,
  nowMs: number,
): CraftingRealtimeLiveSession {
  if (!session || session.status !== "ACTIVE") {
    return {
      remainingSeconds: 0,
      progressPercent: session ? 100 : 0,
      isComplete: Boolean(session && session.status === "COMPLETED"),
    };
  }

  const completesAtMs = getParsedDateMs(session.completesAt) ?? nowMs;
  const remainingSeconds = Math.max(
    0,
    Math.ceil((completesAtMs - nowMs) / 1000),
  );
  const durationSeconds = Math.max(1, toSafeNumber(session.durationSeconds, 1));
  const elapsedSeconds = Math.max(0, durationSeconds - remainingSeconds);

  return {
    remainingSeconds,
    progressPercent: clampPercent((elapsedSeconds / durationSeconds) * 100),
    isComplete: remainingSeconds <= 0,
  };
}

function getCraftingOutputQuantity(session: CraftingSessionViewModel) {
  const quantity = toSafeNumber(session.outputQuantity ?? session.quantity, 1);

  return Math.max(1, Math.floor(quantity));
}

function buildCraftingLootNotificationKey(params: {
  characterId: string;
  session: CraftingSessionViewModel;
}) {
  return [
    "crafting",
    params.characterId,
    params.session.id,
    params.session.outputItemId,
    getCraftingOutputQuantity(params.session),
    params.session.completedAt ?? params.session.completesAt,
  ].join("|");
}

export function CraftingRealtimeProvider({
  characterId,
  children,
  autoLoad = false,
  enabled = true,
  refreshMs = 5000,
  tickMs = 1000,
}: CraftingRealtimeProviderProps) {
  const [status, setStatus] = useState<CraftingStatusResponse | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const statusRef = useRef<CraftingStatusResponse | null>(null);
  const isMountedRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const socketConnectedRef = useRef(false);
  const processedLootNotificationKeysRef = useRef<Set<string>>(new Set());
  const { notifyLoot } = useLootNotifications();

  const publishCraftingLootNotifications = useCallback(
    (nextStatus: CraftingStatusResponse) => {
      if (!enabled || !characterId) {
        return;
      }

      const completedSessions = nextStatus.completedSessions ?? [];

      for (const session of completedSessions) {
        if (!session?.outputItem?.name) {
          continue;
        }

        const quantity = getCraftingOutputQuantity(session);
        const idempotencyKey = buildCraftingLootNotificationKey({
          characterId,
          session,
        });

        if (processedLootNotificationKeysRef.current.has(idempotencyKey)) {
          continue;
        }

        processedLootNotificationKeysRef.current.add(idempotencyKey);

        if (
          processedLootNotificationKeysRef.current.size >
          MAX_PROCESSED_CRAFTING_LOOT_KEYS
        ) {
          processedLootNotificationKeysRef.current = new Set(
            Array.from(processedLootNotificationKeysRef.current).slice(-120),
          );
        }

        notifyLoot({
          idempotencyKey,
          itemId: session.outputItem.id,
          itemName: session.outputItem.name,
          quantity,
          rarity: session.outputItem.rarity,
          source: "crafting",
        });
      }
    },
    [characterId, enabled, notifyLoot],
  );

  const applyStatus = useCallback(
    (nextStatus: CraftingStatusResponse) => {
      statusRef.current = nextStatus;
      publishCraftingLootNotifications(nextStatus);

      if (isMountedRef.current) {
        setStatus(nextStatus);
        setLastUpdatedAt(Date.now());
        setIsLoading(false);
        setErrorMessage(null);
      }
    },
    [publishCraftingLootNotifications],
  );

  const applySocketPayload = useCallback(
    (payload: unknown) => {
      const unwrappedPayload = unwrapSocketPayload(payload);

      if (looksLikeCraftingStatus(unwrappedPayload)) {
        applyStatus(unwrappedPayload);
      }
    },
    [applyStatus],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    if (isRefreshingRef.current) {
      return statusRef.current;
    }

    isRefreshingRef.current = true;

    if (isMountedRef.current) {
      setIsRefreshing(true);
    }

    try {
      const response = await getCraftingStatusRequest(characterId);

      applyStatus(response);

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractCraftingApiError(error));
      }

      return null;
    } finally {
      isRefreshingRef.current = false;

      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [applyStatus, characterId, enabled]);

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || !characterId) {
      return;
    }

    socket.emit("crafting:join", { characterId });
    socket.emit("crafting:status:request", { characterId });
    socket.emit("crafting:refresh", { characterId });
  }, [characterId]);

  const stop = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    if (isMountedRef.current) {
      setIsBusy(true);
      setErrorMessage(null);
    }

    try {
      const response = await stopCraftingRequest(characterId);

      applyStatus(response);
      requestSnapshot();

      if (!socketRef.current?.connected) {
        await refresh();
      }

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractCraftingApiError(error));
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [applyStatus, characterId, enabled, refresh, requestSnapshot]);

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
    statusRef.current = null;
    processedLootNotificationKeysRef.current.clear();

    const resetTimer = window.setTimeout(() => {
      if (!isMountedRef.current) return;

      setStatus(null);
      setLastUpdatedAt(null);
      setErrorMessage(null);
      setIsLoading(autoLoad);
      setIsRefreshing(false);
      setIsBusy(false);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [autoLoad, characterId]);

  useEffect(() => {
    if (!enabled || !characterId) {
      socketConnectedRef.current = false;
      const disconnectTimer = window.setTimeout(() => {
        if (isMountedRef.current) {
          setIsSocketConnected(false);
        }
      }, 0);

      return () => window.clearTimeout(disconnectTimer);
    }

    const socket = io(getCraftingSocketUrl(), {
      transports: ["websocket", "polling"],
      withCredentials: true,
      auth: {
        token: getAuthToken(),
        characterId,
      },
      query: {
        characterId,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4500,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      socketConnectedRef.current = true;

      if (isMountedRef.current) {
        setIsSocketConnected(true);
        setErrorMessage(null);
      }

      socket.emit("crafting:join", { characterId });
      socket.emit("crafting:status:request", { characterId });
      socket.emit("crafting:refresh", { characterId });
    };

    const handleDisconnect = () => {
      socketConnectedRef.current = false;

      if (isMountedRef.current) {
        setIsSocketConnected(false);
      }
    };

    const handleConnectError = (error: Error) => {
      socketConnectedRef.current = false;

      if (isMountedRef.current) {
        setIsSocketConnected(false);

        if (!statusRef.current) {
          setErrorMessage(
            error.message || "Falha ao conectar à criação em tempo real.",
          );
        }
      }
    };

    const handleStatusEvent = (payload: unknown) => {
      applySocketPayload(payload);
    };

    const handleErrorEvent = (payload: unknown) => {
      const message =
        extractSocketError(payload) ??
        "Erro recebido da criação em tempo real.";

      if (isMountedRef.current) {
        setErrorMessage(message);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("crafting:error", handleErrorEvent);

    for (const eventName of CRAFTING_STATUS_EVENTS) {
      socket.on(eventName, handleStatusEvent);
    }

    return () => {
      socket.emit("crafting:leave", { characterId });

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("crafting:error", handleErrorEvent);

      for (const eventName of CRAFTING_STATUS_EVENTS) {
        socket.off(eventName, handleStatusEvent);
      }

      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      socketConnectedRef.current = false;

      if (isMountedRef.current) {
        setIsSocketConnected(false);
      }
    };
  }, [applySocketPayload, characterId, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const intervalId = window.setInterval(
      () => {
        setNowMs(Date.now());
      },
      Math.max(250, tickMs),
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, tickMs]);

  useEffect(() => {
    if (!enabled || !characterId || !autoLoad) {
      const loadingTimer = window.setTimeout(() => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }, 0);

      return () => window.clearTimeout(loadingTimer);
    }

    void refresh();
  }, [autoLoad, characterId, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !characterId || !autoLoad) {
      return undefined;
    }

    const intervalId = window.setInterval(
      () => {
        if (!socketConnectedRef.current) {
          void refresh();
        }
      },
      Math.max(1000, refreshMs),
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoLoad, characterId, enabled, refresh, refreshMs]);

  useEffect(() => {
    const session = statusRef.current?.activeSession ?? null;
    const liveSession = buildLiveSession(session, nowMs);

    if (!session || !liveSession.isComplete) {
      return;
    }

    if (socketConnectedRef.current) {
      requestSnapshot();
      return;
    }

    void refresh();
  }, [nowMs, refresh, requestSnapshot]);

  const session = status?.activeSession ?? null;
  const liveSession = useMemo(
    () => buildLiveSession(session, nowMs),
    [nowMs, session],
  );

  const state = useMemo<CraftingRealtimeState>(
    () => ({
      characterId,
      status,
      session,
      craftingSkill:
        status?.craftingSkill ?? status?.character.craftingSkill ?? null,
      completedSessions: status?.completedSessions ?? [],
      isActive: Boolean(session && session.status === "ACTIVE"),
      isLoading,
      isRefreshing,
      isBusy,
      isSocketConnected,
      errorMessage,
      lastUpdatedAt,
      nowMs,
      liveSession,
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
      session,
      status,
    ],
  );

  const contextValue = useMemo<CraftingRealtimeContextValue>(
    () => ({
      state,
      refresh,
      stop,
      requestSnapshot,
      clearError,
    }),
    [clearError, refresh, requestSnapshot, state, stop],
  );

  return (
    <CraftingRealtimeContext.Provider value={contextValue}>
      {children}
    </CraftingRealtimeContext.Provider>
  );
}
