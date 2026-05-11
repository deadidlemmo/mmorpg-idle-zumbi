import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import type { CharacterOverviewResponse } from '../../dashboard/types/dashboard.types';
import {
  getAutoCombatRecentEvents,
  getAutoCombatStatus,
  startAutoCombat,
  stopAutoCombat,
} from '../api/auto-combat.api';
import { useAutoCombatSocket } from '../hooks/useAutoCombatSocket';
import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
  StartAutoCombatPayload,
} from '../types/auto-combat.types';
import {
  autoCombatRealtimeReducer,
  initialAutoCombatRealtimeState,
  type AutoCombatRealtimeState,
} from './autoCombatRealtime.reducer';
import type { AutoCombatRealtimeContextValue } from './autoCombatRealtime.types';
import {
  buildMobSpawnedEventFromStatus,
  getRealtimeEventDelay,
  getStatusSession,
  isStatusActive,
  isTerminalSessionStatus,
} from './autoCombatRealtime.utils';

interface AutoCombatRealtimeProviderProps {
  characterId?: string | null;
  children: ReactNode;
  autoLoad?: boolean;
  refreshMs?: number;
}

type ReloadOptions = {
  reason?: string;
};

type LooseAutoCombatStatus = AutoCombatStatusResponse & {
  active?: boolean | null;
  hasActiveAutoCombat?: boolean | null;
};

const INITIAL_RELOAD_DELAY_MS = 300;
const AFTER_START_RELOAD_DELAY_MS = 700;
const AFTER_VISIBILITY_RELOAD_DELAY_MS = 120;

const NEXT_EVENT_PROCESS_DELAY_MS = 120;
const ACTIVE_EVENT_IMPACT_RATIO = 0.55;

export const AutoCombatRealtimeContext =
  createContext<AutoCombatRealtimeContextValue | null>(null);

function getInitialState(characterId?: string | null): AutoCombatRealtimeState {
  return {
    ...initialAutoCombatRealtimeState,
    characterId: characterId ?? null,
    updatedAt: Date.now(),
  };
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: {
      data?: {
        message?: string | string[];
      };
    };
    message?: string;
  };

  const message = apiError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(' ');
  }

  return message ?? apiError.message ?? fallback;
}

function isStatusTerminal(status: AutoCombatStatusResponse | null) {
  const session = getStatusSession(status);

  return isTerminalSessionStatus(session?.status);
}

function isStatusInactiveOrTerminal(status: AutoCombatStatusResponse | null) {
  if (!status) return false;

  const looseStatus = status as LooseAutoCombatStatus;

  if (isStatusActive(status)) {
    return false;
  }

  if (looseStatus.active === false) {
    return true;
  }

  if (looseStatus.hasActiveAutoCombat === false) {
    return true;
  }

  return isStatusTerminal(status);
}

function isSameSession(
  firstSessionId?: string | null,
  secondSessionId?: string | null,
) {
  if (!firstSessionId || !secondSessionId) {
    return true;
  }

  return firstSessionId === secondSessionId;
}

function isDocumentVisible() {
  if (typeof document === 'undefined') {
    return true;
  }

  return document.visibilityState === 'visible';
}

function hasDocumentFocus() {
  if (typeof document === 'undefined') {
    return true;
  }

  if (typeof document.hasFocus !== 'function') {
    return true;
  }

  return document.hasFocus();
}

function isUiBackgrounded() {
  return !isDocumentVisible() || !hasDocumentFocus();
}

function shouldPollCurrentState(state: AutoCombatRealtimeState) {
  const session = state.session;
  const status = state.status;

  const statusIsActive = isStatusActive(status);
  const statusIsTerminal = isStatusTerminal(status);
  const sessionIsTerminal = isTerminalSessionStatus(session?.status);

  if (!state.hasLoadedOnce) {
    return true;
  }

  if (!status && !session) {
    return true;
  }

  if (statusIsActive) {
    return true;
  }

  if (session && !sessionIsTerminal && !statusIsTerminal) {
    return true;
  }

  return false;
}

function shouldKeepAutoCombatSocketEnabled(params: {
  characterId?: string | null;
  state: AutoCombatRealtimeState;
}) {
  const { characterId, state } = params;

  if (!characterId) {
    return false;
  }

  if (!state.hasLoadedOnce) {
    return true;
  }

  if (isStatusActive(state.status)) {
    return true;
  }

  if (state.session && !isTerminalSessionStatus(state.session.status)) {
    return true;
  }

  if (state.activeEvent || state.eventQueue.length > 0) {
    return true;
  }

  return false;
}

function shouldReconcileCurrentState(state: AutoCombatRealtimeState) {
  const statusIsActive = isStatusActive(state.status);
  const statusIsTerminal = isStatusTerminal(state.status);
  const sessionIsTerminal = isTerminalSessionStatus(state.session?.status);

  if (statusIsActive) {
    return true;
  }

  if (state.session && !sessionIsTerminal && !statusIsTerminal) {
    return true;
  }

  if (state.activeEvent || state.eventQueue.length > 0) {
    return true;
  }

  return false;
}

function shouldAcceptRealtimeEvent(params: {
  state: AutoCombatRealtimeState;
  event: AutoCombatRealtimeEvent;
}) {
  const { state, event } = params;

  if (isTerminalSessionStatus(state.session?.status)) {
    return false;
  }

  const currentCharacterId = state.characterId ?? null;
  const eventCharacterId = event.characterId ?? null;

  if (
    currentCharacterId &&
    eventCharacterId &&
    currentCharacterId !== eventCharacterId
  ) {
    return false;
  }

  const currentSessionId = state.session?.id ?? null;
  const eventSessionId = event.sessionId ?? null;

  return isSameSession(currentSessionId, eventSessionId);
}

function normalizeInitialMobSpawnedEvent(params: {
  event: AutoCombatRealtimeEvent;
  characterId: string;
  sessionId?: string | null;
}) {
  const { event, characterId, sessionId } = params;

  return {
    ...event,
    sessionId: event.sessionId ?? sessionId ?? null,
    characterId: event.characterId ?? characterId,
    createdAt:
      event.createdAt ??
      `initial-spawn-${sessionId ?? 'no-session'}-${
        event.combatIndex ?? 1
      }-${event.mobId ?? event.mobName ?? 'mob'}`,
  };
}

function getLooseEventSequence(event?: AutoCombatRealtimeEvent | null) {
  const value = (event as unknown as { sequence?: unknown } | null | undefined)
    ?.sequence;

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getStableStatusSignature(status: AutoCombatStatusResponse | null) {
  if (!status) return 'null';

  try {
    return JSON.stringify(status);
  } catch {
    return String(Date.now());
  }
}

export function AutoCombatRealtimeProvider({
  characterId,
  children,
  autoLoad = true,
  refreshMs = 10000,
}: AutoCombatRealtimeProviderProps) {
  const normalizedCharacterId = characterId ?? null;

  const [state, dispatch] = useReducer(
    autoCombatRealtimeReducer,
    normalizedCharacterId,
    getInitialState,
  );

  const stateRef = useRef(state);
  const isLoadingRef = useRef(false);
  const activeEventTimeoutRef = useRef<number | null>(null);
  const activeEventImpactTimeoutRef = useRef<number | null>(null);
  const reloadTimeoutRef = useRef<number | null>(null);
  const reloadRequestRef = useRef(0);
  const recentEventsRequestRef = useRef(0);
  const wasBackgroundedRef = useRef(false);
  const lastInactiveStatusSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    dispatch({
      type: 'SET_CHARACTER_ID',
      characterId: normalizedCharacterId,
    });

    lastInactiveStatusSignatureRef.current = null;
  }, [normalizedCharacterId]);

  const clearScheduledReload = useCallback(() => {
    if (reloadTimeoutRef.current !== null) {
      window.clearTimeout(reloadTimeoutRef.current);
      reloadTimeoutRef.current = null;
    }
  }, []);

  const clearScheduledActiveEvent = useCallback(() => {
    if (activeEventTimeoutRef.current !== null) {
      window.clearTimeout(activeEventTimeoutRef.current);
      activeEventTimeoutRef.current = null;
    }

    if (activeEventImpactTimeoutRef.current !== null) {
      window.clearTimeout(activeEventImpactTimeoutRef.current);
      activeEventImpactTimeoutRef.current = null;
    }
  }, []);

  const flushVisualQueueWithoutAnimation = useCallback(() => {
    clearScheduledActiveEvent();

    dispatch({
      type: 'CLEAR_ACTIVE_EVENT',
    });

    dispatch({
      type: 'FLUSH_EVENT_QUEUE',
    });
  }, [clearScheduledActiveEvent]);

  const hydrateOverview = useCallback(
    (overview: CharacterOverviewResponse | null) => {
      if (!normalizedCharacterId) return;

      dispatch({
        type: 'HYDRATE_OVERVIEW',
        characterId: normalizedCharacterId,
        overview,
      });
    },
    [normalizedCharacterId],
  );

  const hydrateStatus = useCallback(
    (status: AutoCombatStatusResponse | null) => {
      if (!normalizedCharacterId) return;

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status,
      });
    },
    [normalizedCharacterId],
  );

  const enqueueRealtimeEvent = useCallback(
    (event: AutoCombatRealtimeEvent) => {
      if (!normalizedCharacterId) return;

      const currentState = stateRef.current;

      if (
        !shouldAcceptRealtimeEvent({
          state: currentState,
          event,
        })
      ) {
        return;
      }

      lastInactiveStatusSignatureRef.current = null;

      dispatch({
        type: 'ENQUEUE_EVENT',
        characterId: normalizedCharacterId,
        event,
      });
    },
    [normalizedCharacterId],
  );

  const clearRealtimeQueue = useCallback(() => {
    dispatch({
      type: 'CLEAR_QUEUE',
    });
  }, []);

  const clearSessionVisualState = useCallback(() => {
    clearScheduledActiveEvent();

    dispatch({
      type: 'CLEAR_SESSION_VISUAL_STATE',
    });
  }, [clearScheduledActiveEvent]);

  const reload = useCallback(
    async (_options?: ReloadOptions) => {
      if (!normalizedCharacterId || isLoadingRef.current) return;

      const currentState = stateRef.current;

      if (
        currentState.hasLoadedOnce &&
        isStatusInactiveOrTerminal(currentState.status) &&
        isTerminalSessionStatus(currentState.session?.status)
      ) {
        return;
      }

      const requestId = reloadRequestRef.current + 1;
      reloadRequestRef.current = requestId;

      try {
        isLoadingRef.current = true;

        const [overviewData, statusData] = await Promise.all([
          getCharacterOverview(normalizedCharacterId).catch(() => null),
          getAutoCombatStatus(normalizedCharacterId).catch(() => null),
        ]);

        if (reloadRequestRef.current !== requestId) {
          return;
        }

        if (overviewData) {
          dispatch({
            type: 'HYDRATE_OVERVIEW',
            characterId: normalizedCharacterId,
            overview: overviewData,
          });
        }

        dispatch({
          type: 'HYDRATE_STATUS',
          characterId: normalizedCharacterId,
          status: statusData,
        });

        dispatch({
          type: 'CLEAR_ERROR',
        });
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          errorMessage: getApiErrorMessage(
            error,
            'Não foi possível carregar o estado em tempo real do auto-combate.',
          ),
        });
      } finally {
        if (reloadRequestRef.current === requestId) {
          isLoadingRef.current = false;
        }
      }
    },
    [normalizedCharacterId],
  );

  const scheduleReload = useCallback(
    (delayMs = INITIAL_RELOAD_DELAY_MS, options?: ReloadOptions) => {
      if (!normalizedCharacterId) return;

      const currentState = stateRef.current;

      if (
        currentState.hasLoadedOnce &&
        isStatusInactiveOrTerminal(currentState.status) &&
        isTerminalSessionStatus(currentState.session?.status)
      ) {
        clearScheduledReload();
        return;
      }

      clearScheduledReload();

      reloadTimeoutRef.current = window.setTimeout(() => {
        reloadTimeoutRef.current = null;
        void reload(options);
      }, delayMs);
    },
    [clearScheduledReload, normalizedCharacterId, reload],
  );

  const loadRecentEventsForReconciliation = useCallback(
    async (reason: string) => {
      if (!normalizedCharacterId) return;

      const currentState = stateRef.current;

      if (!shouldReconcileCurrentState(currentState)) {
        return;
      }

      const requestId = recentEventsRequestRef.current + 1;
      recentEventsRequestRef.current = requestId;

      try {
        const response = await getAutoCombatRecentEvents(normalizedCharacterId);

        if (recentEventsRequestRef.current !== requestId) {
          return;
        }

        const events = Array.isArray(response.events) ? response.events : [];
        const sessionId = response.session?.id ?? null;

        dispatch({
          type: 'HYDRATE_RECENT_EVENTS',
          characterId: normalizedCharacterId,
          sessionId,
          events,
          applySnapshot: true,
        });

        if (import.meta.env.DEV) {
          console.debug('[auto-combat:reconcile-recent-events]', {
            reason,
            active: response.active,
            hasActiveAutoCombat: response.hasActiveAutoCombat,
            sessionId,
            sessionStatus: response.session?.status ?? null,
            eventsCount: events.length,
            latestSequence: response.latestSequence,
            firstSequence: getLooseEventSequence(events[0]),
            lastSequence: getLooseEventSequence(events[events.length - 1]),
            lastEventType: events[events.length - 1]?.type ?? null,
          });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug('[auto-combat:reconcile-recent-events:error]', {
            reason,
            error,
          });
        }
      }
    },
    [normalizedCharacterId],
  );

  const reconcileAfterReturningToPage = useCallback(
    (reason: string) => {
      if (!normalizedCharacterId) return;

      const currentState = stateRef.current;

      if (!shouldReconcileCurrentState(currentState)) {
        return;
      }

      flushVisualQueueWithoutAnimation();

      void loadRecentEventsForReconciliation(reason);

      scheduleReload(AFTER_VISIBILITY_RELOAD_DELAY_MS, {
        reason,
      });
    },
    [
      flushVisualQueueWithoutAnimation,
      loadRecentEventsForReconciliation,
      normalizedCharacterId,
      scheduleReload,
    ],
  );

  const start = useCallback(
    async (payload: StartAutoCombatPayload) => {
      if (!normalizedCharacterId) {
        throw new Error('Personagem não informado.');
      }

      try {
        lastInactiveStatusSignatureRef.current = null;
        clearScheduledReload();
        clearSessionVisualState();

        const response = await startAutoCombat(payload);
        const session = getStatusSession(response);
        const sessionId = session?.id ?? null;

        dispatch({
          type: 'HYDRATE_STATUS',
          characterId: normalizedCharacterId,
          status: response,
        });

        const initialMobSpawnedEvent = buildMobSpawnedEventFromStatus({
          status: response,
          session,
        });

        if (initialMobSpawnedEvent && !isTerminalSessionStatus(session?.status)) {
          const normalizedEvent = normalizeInitialMobSpawnedEvent({
            event: initialMobSpawnedEvent,
            characterId: normalizedCharacterId,
            sessionId,
          });

          dispatch({
            type: 'ENQUEUE_EVENT',
            characterId: normalizedCharacterId,
            event: normalizedEvent,
          });
        }

        dispatch({
          type: 'CLEAR_ERROR',
        });

        scheduleReload(AFTER_START_RELOAD_DELAY_MS, {
          reason: 'after-start',
        });

        return response;
      } catch (error) {
        const message = getApiErrorMessage(
          error,
          'Não foi possível iniciar o combate automático.',
        );

        dispatch({
          type: 'SET_ERROR',
          errorMessage: message,
        });

        throw error;
      }
    },
    [
      clearScheduledReload,
      clearSessionVisualState,
      normalizedCharacterId,
      scheduleReload,
    ],
  );

  const stop = useCallback(async () => {
    if (!normalizedCharacterId) {
      throw new Error('Personagem não informado.');
    }

    try {
      flushVisualQueueWithoutAnimation();

      const response = await stopAutoCombat(normalizedCharacterId);

      lastInactiveStatusSignatureRef.current = getStableStatusSignature(response);

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status: response,
      });

      dispatch({
        type: 'CLEAR_QUEUE',
      });

      dispatch({
        type: 'CLEAR_ERROR',
      });

      clearScheduledReload();

      return response;
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        'Não foi possível parar o combate automático.',
      );

      dispatch({
        type: 'SET_ERROR',
        errorMessage: message,
      });

      throw error;
    }
  }, [
    clearScheduledReload,
    flushVisualQueueWithoutAnimation,
    normalizedCharacterId,
  ]);

  const handleStatusPayload = useCallback(
    (payload: AutoCombatStatusResponse) => {
      if (!normalizedCharacterId) return;

      const isInactivePayload = isStatusInactiveOrTerminal(payload);

      if (isInactivePayload) {
        const signature = getStableStatusSignature(payload);

        if (lastInactiveStatusSignatureRef.current === signature) {
          return;
        }

        lastInactiveStatusSignatureRef.current = signature;
      } else {
        lastInactiveStatusSignatureRef.current = null;
      }

      if (isUiBackgrounded()) {
        flushVisualQueueWithoutAnimation();
      }

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status: payload,
      });
    },
    [flushVisualQueueWithoutAnimation, normalizedCharacterId],
  );

  const handleFinishedPayload = useCallback(
    (payload: AutoCombatStatusResponse) => {
      if (!normalizedCharacterId) return;

      flushVisualQueueWithoutAnimation();

      lastInactiveStatusSignatureRef.current = getStableStatusSignature(payload);

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status: payload,
      });

      dispatch({
        type: 'CLEAR_QUEUE',
      });

      clearScheduledReload();
    },
    [
      clearScheduledReload,
      flushVisualQueueWithoutAnimation,
      normalizedCharacterId,
    ],
  );

  const handleStoppedPayload = useCallback(
    (payload: AutoCombatStatusResponse) => {
      if (!normalizedCharacterId) return;

      flushVisualQueueWithoutAnimation();

      lastInactiveStatusSignatureRef.current = getStableStatusSignature(payload);

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status: payload,
      });

      dispatch({
        type: 'CLEAR_QUEUE',
      });

      clearScheduledReload();
    },
    [
      clearScheduledReload,
      flushVisualQueueWithoutAnimation,
      normalizedCharacterId,
    ],
  );

  const handleRealtimeEvent = useCallback(
    (payload: AutoCombatRealtimeEvent) => {
      if (!normalizedCharacterId) return;

      const currentState = stateRef.current;

      if (
        !shouldAcceptRealtimeEvent({
          state: currentState,
          event: payload,
        })
      ) {
        return;
      }

      lastInactiveStatusSignatureRef.current = null;

      dispatch({
        type: 'ENQUEUE_EVENT',
        characterId: normalizedCharacterId,
        event: payload,
      });

      if (isUiBackgrounded()) {
        dispatch({
          type: 'FLUSH_EVENT_QUEUE',
        });
      }
    },
    [normalizedCharacterId],
  );

  const shouldEnableSocket = shouldKeepAutoCombatSocketEnabled({
    characterId: normalizedCharacterId,
    state,
  });

  const socketState = useAutoCombatSocket({
    characterId: normalizedCharacterId,
    enabled: shouldEnableSocket,

    onStatus: handleStatusPayload,
    onSessionUpdated: handleStatusPayload,
    onFinished: handleFinishedPayload,
    onStopped: handleStoppedPayload,

    onRealtimeEvent: handleRealtimeEvent,
    onMobSpawned: handleRealtimeEvent,
    onHit: handleRealtimeEvent,
    onDodge: handleRealtimeEvent,
    onMobDefeated: handleRealtimeEvent,
    onPlayerDefeated: handleRealtimeEvent,
    onPotionUsed: handleRealtimeEvent,

    onError: (message) => {
      dispatch({
        type: 'SET_ERROR',
        errorMessage: message,
      });
    },
  });

  useEffect(() => {
    dispatch({
      type: 'SET_CONNECTION',
      isConnected: socketState.isConnected,
      isJoined: socketState.isJoined,
      errorMessage: socketState.errorMessage,
    });
  }, [
    socketState.isConnected,
    socketState.isJoined,
    socketState.errorMessage,
  ]);

  useEffect(() => {
    if (!autoLoad || !normalizedCharacterId) return;

    scheduleReload(INITIAL_RELOAD_DELAY_MS, {
      reason: 'initial-load',
    });
  }, [autoLoad, normalizedCharacterId, scheduleReload]);

  useEffect(() => {
    if (!autoLoad || !normalizedCharacterId || refreshMs <= 0) return;

    const intervalId = window.setInterval(() => {
      const currentState = stateRef.current;

      if (!shouldPollCurrentState(currentState)) {
        return;
      }

      void reload({ reason: 'polling' });
    }, refreshMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoLoad, normalizedCharacterId, refreshMs, reload]);

  useEffect(() => {
    if (!normalizedCharacterId) return;

    function handleVisibilityChange() {
      if (!isDocumentVisible()) {
        wasBackgroundedRef.current = true;
        flushVisualQueueWithoutAnimation();
        return;
      }

      if (wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        reconcileAfterReturningToPage('visibility-return');
      }
    }

    function handleWindowBlur() {
      wasBackgroundedRef.current = true;
      flushVisualQueueWithoutAnimation();
    }

    function handleWindowFocus() {
      if (!isDocumentVisible()) {
        return;
      }

      if (wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        reconcileAfterReturningToPage('window-focus-after-background');
        return;
      }

      const currentState = stateRef.current;

      if (currentState.activeEvent || currentState.eventQueue.length > 0) {
        reconcileAfterReturningToPage('window-focus-with-pending-events');
      }
    }

    function handlePageShow() {
      if (!isDocumentVisible()) {
        return;
      }

      reconcileAfterReturningToPage('pageshow');
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [
    flushVisualQueueWithoutAnimation,
    normalizedCharacterId,
    reconcileAfterReturningToPage,
  ]);

  useEffect(() => {
    clearScheduledActiveEvent();

    if (isUiBackgrounded()) {
      if (state.activeEvent || state.eventQueue.length > 0) {
        dispatch({
          type: 'CLEAR_ACTIVE_EVENT',
        });

        dispatch({
          type: 'FLUSH_EVENT_QUEUE',
        });
      }

      return undefined;
    }

    if (state.activeEvent) {
      const eventDelay = getRealtimeEventDelay(state.activeEvent);
      const impactDelay = Math.max(
        0,
        Math.floor(eventDelay * ACTIVE_EVENT_IMPACT_RATIO),
      );

      if (!state.activeEventImpactApplied) {
        activeEventImpactTimeoutRef.current = window.setTimeout(() => {
          dispatch({
            type: 'APPLY_ACTIVE_EVENT_IMPACT',
          });

          activeEventImpactTimeoutRef.current = null;
        }, impactDelay);
      }

      activeEventTimeoutRef.current = window.setTimeout(() => {
        dispatch({
          type: 'APPLY_ACTIVE_EVENT_IMPACT',
        });

        dispatch({
          type: 'CLEAR_ACTIVE_EVENT',
        });

        activeEventTimeoutRef.current = null;
      }, eventDelay);

      return () => {
        clearScheduledActiveEvent();
      };
    }

    if (state.eventQueue.length > 0) {
      activeEventTimeoutRef.current = window.setTimeout(() => {
        dispatch({
          type: 'PROCESS_NEXT_EVENT',
        });

        activeEventTimeoutRef.current = null;
      }, NEXT_EVENT_PROCESS_DELAY_MS);

      return () => {
        clearScheduledActiveEvent();
      };
    }

    return undefined;
  }, [
    clearScheduledActiveEvent,
    state.activeEvent,
    state.activeEventImpactApplied,
    state.eventQueue.length,
  ]);

  useEffect(() => {
    return () => {
      clearScheduledActiveEvent();
      clearScheduledReload();
    };
  }, [clearScheduledActiveEvent, clearScheduledReload]);

  const value = useMemo<AutoCombatRealtimeContextValue>(() => {
    return {
      state,

      characterId: state.characterId,

      isConnected: state.isConnected,
      isJoined: state.isJoined,
      errorMessage: state.errorMessage,
      hasLoadedOnce: state.hasLoadedOnce,

      status: state.status,
      session: state.session,
      character: state.character,
      mob: state.mob,

      totals: state.totals,
      displayTotals: state.displayTotals,

      visual: state.visual,
      location: state.location,
      potion: state.potion,

      eventQueue: state.eventQueue,
      activeEvent: state.activeEvent,
      battleLogEvents: state.battleLogEvents,

      hydrateOverview,
      hydrateStatus,
      enqueueRealtimeEvent,
      clearRealtimeQueue,
      clearSessionVisualState,

      reload,
      start,
      stop,
    };
  }, [
    state,
    hydrateOverview,
    hydrateStatus,
    enqueueRealtimeEvent,
    clearRealtimeQueue,
    clearSessionVisualState,
    reload,
    start,
    stop,
  ]);

  return (
    <AutoCombatRealtimeContext.Provider value={value}>
      {children}
    </AutoCombatRealtimeContext.Provider>
  );
}