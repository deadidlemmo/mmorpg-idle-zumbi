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
  /**
   * Limpa apenas a timeline visual pendente.
   *
   * Importante:
   * - preserva sessão;
   * - preserva mob conhecido;
   * - preserva status;
   * - evita a ActivityBar cair em "Combate automático".
   */
  clearVisualTimeline?: boolean;

  /**
   * Mantido por compatibilidade interna.
   * Neste Provider, resetVisualTimeline também é tratado como limpeza suave.
   */
  resetVisualTimeline?: boolean;
};

const INITIAL_RELOAD_DELAY_MS = 300;
const AFTER_START_RELOAD_DELAY_MS = 700;
const AFTER_STOP_RELOAD_DELAY_MS = 400;
const AFTER_TERMINAL_RELOAD_DELAY_MS = 400;
const AFTER_VISIBILITY_RELOAD_DELAY_MS = 0;

const NEXT_EVENT_PROCESS_DELAY_MS = 40;

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

  if (!state.isConnected || !state.isJoined) {
    return true;
  }

  /**
   * Mesmo com WebSocket conectado, mantemos polling leve para reconciliar
   * o estado oficial do backend/banco.
   *
   * O socket é a camada visual.
   * O status do backend é a fonte da verdade para totais, sessão e persistência.
   */
  if (statusIsActive) {
    return true;
  }

  if (session && !sessionIsTerminal && !statusIsTerminal) {
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
  const reloadTimeoutRef = useRef<number | null>(null);
  const wasBackgroundedRef = useRef(false);
  const recentEventsDebugRequestRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    dispatch({
      type: 'SET_CHARACTER_ID',
      characterId: normalizedCharacterId,
    });
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
  }, []);

  /**
   * Microetapa segura:
   *
   * Busca /recent-events apenas para validar se o frontend consegue receber
   * o histórico salvo no backend.
   *
   * Não altera reducer.
   * Não altera BattleLog.
   * Não altera ActivityBar.
   * Não altera AutoCombatPage.
   */
  const loadRecentEventsForDebug = useCallback(
    async (reason: string) => {
      if (!normalizedCharacterId) return;

      const requestId = recentEventsDebugRequestRef.current + 1;
      recentEventsDebugRequestRef.current = requestId;

      try {
        const response = await getAutoCombatRecentEvents(normalizedCharacterId);

        if (recentEventsDebugRequestRef.current !== requestId) {
          return;
        }

        console.debug('[auto-combat:recent-events]', {
          reason,
          active: response.active,
          hasActiveAutoCombat: response.hasActiveAutoCombat,
          sessionId: response.session?.id ?? null,
          sessionStatus: response.session?.status ?? null,
          eventsCount: response.events.length,
          latestSequence: response.latestSequence,
          firstSequence: response.events[0]?.sequence ?? null,
          lastSequence:
            response.events[response.events.length - 1]?.sequence ?? null,
          lastEventType:
            response.events[response.events.length - 1]?.type ?? null,
        });
      } catch (error) {
        console.debug('[auto-combat:recent-events:error]', {
          reason,
          error,
        });
      }
    },
    [normalizedCharacterId],
  );

  /**
   * Limpeza suave.
   *
   * Use ao voltar de Alt+Tab, blur/focus, visibilitychange ou quando o browser
   * pode ter pausado animações/timers.
   *
   * Não limpa session/status/mob.
   * Isso é o que evita a ActivityBar voltar para "Combate automático".
   */
  const clearVisualTimeline = useCallback(() => {
    clearScheduledActiveEvent();

    dispatch({
      type: 'CLEAR_ACTIVE_EVENT',
    });

    dispatch({
      type: 'CLEAR_QUEUE',
    });
  }, [clearScheduledActiveEvent]);

  /**
   * Limpeza forte.
   *
   * Use apenas quando a sessão visual realmente deve ser descartada:
   * - troca de personagem;
   * - início de uma nova sessão;
   * - reset explícito de tela.
   */
  const resetFullSessionVisualState = useCallback(() => {
    clearScheduledActiveEvent();

    dispatch({
      type: 'CLEAR_SESSION_VISUAL_STATE',
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

      dispatch({
        type: 'ENQUEUE_EVENT',
        characterId: normalizedCharacterId,
        event,
      });
    },
    [normalizedCharacterId],
  );

  /**
   * Processa evento imediatamente quando a UI está em segundo plano.
   *
   * Motivo:
   * - em aba oculta/celular bloqueado o browser pode atrasar setTimeout;
   * - se mantivermos activeEvent/queue congelados, ao voltar a tela mostra
   *   estado antigo por alguns segundos;
   * - aqui avançamos a fila sem animação enquanto o usuário não está vendo.
   */
  const fastForwardRealtimeEvent = useCallback(
    (event: AutoCombatRealtimeEvent) => {
      if (!normalizedCharacterId) return;

      clearScheduledActiveEvent();

      dispatch({
        type: 'CLEAR_ACTIVE_EVENT',
      });

      dispatch({
        type: 'CLEAR_QUEUE',
      });

      dispatch({
        type: 'ENQUEUE_EVENT',
        characterId: normalizedCharacterId,
        event,
      });

      dispatch({
        type: 'PROCESS_NEXT_EVENT',
      });

      dispatch({
        type: 'CLEAR_ACTIVE_EVENT',
      });
    },
    [clearScheduledActiveEvent, normalizedCharacterId],
  );

  const clearRealtimeQueue = useCallback(() => {
    dispatch({
      type: 'CLEAR_QUEUE',
    });
  }, []);

  const clearSessionVisualState = useCallback(() => {
    resetFullSessionVisualState();
  }, [resetFullSessionVisualState]);

  const reload = useCallback(
    async (options?: ReloadOptions) => {
      if (!normalizedCharacterId || isLoadingRef.current) return;

      try {
        isLoadingRef.current = true;

        const shouldClearVisualTimeline =
          Boolean(options?.clearVisualTimeline) ||
          Boolean(options?.resetVisualTimeline);

        const [overviewData, statusData] = await Promise.all([
          getCharacterOverview(normalizedCharacterId).catch(() => null),
          getAutoCombatStatus(normalizedCharacterId).catch(() => null),
        ]);

        if (shouldClearVisualTimeline) {
          dispatch({
            type: 'CLEAR_ACTIVE_EVENT',
          });

          dispatch({
            type: 'CLEAR_QUEUE',
          });
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
        isLoadingRef.current = false;
      }
    },
    [normalizedCharacterId],
  );

  const scheduleReload = useCallback(
    (delayMs = INITIAL_RELOAD_DELAY_MS, options?: ReloadOptions) => {
      if (!normalizedCharacterId) return;

      clearScheduledReload();

      reloadTimeoutRef.current = window.setTimeout(() => {
        reloadTimeoutRef.current = null;
        void reload(options);
      }, delayMs);
    },
    [clearScheduledReload, normalizedCharacterId, reload],
  );

  const reconcileAfterReturningToPage = useCallback(() => {
    if (!normalizedCharacterId) return;

    clearVisualTimeline();

    scheduleReload(AFTER_VISIBILITY_RELOAD_DELAY_MS, {
      clearVisualTimeline: true,
    });

    void loadRecentEventsForDebug('return-to-page');
  }, [
    clearVisualTimeline,
    loadRecentEventsForDebug,
    normalizedCharacterId,
    scheduleReload,
  ]);

  const start = useCallback(
    async (payload: StartAutoCombatPayload) => {
      if (!normalizedCharacterId) {
        throw new Error('Personagem não informado.');
      }

      try {
        resetFullSessionVisualState();

        const response = await startAutoCombat(payload);
        const session = getStatusSession(response);
        const sessionId = session?.id ?? null;

        dispatch({
          type: 'HYDRATE_STATUS',
          characterId: normalizedCharacterId,
          status: response,
        });

        /**
         * Evento visual inicial.
         *
         * Ele existe para dar feedback imediato:
         * "um mob apareceu".
         *
         * Totais reais continuam vindo do backend/status.
         */
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
          clearVisualTimeline: false,
        });

        void loadRecentEventsForDebug('after-start');

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
      loadRecentEventsForDebug,
      normalizedCharacterId,
      resetFullSessionVisualState,
      scheduleReload,
    ],
  );

  const stop = useCallback(async () => {
    if (!normalizedCharacterId) {
      throw new Error('Personagem não informado.');
    }

    try {
      clearScheduledActiveEvent();

      const response = await stopAutoCombat(normalizedCharacterId);

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

      scheduleReload(AFTER_STOP_RELOAD_DELAY_MS, {
        clearVisualTimeline: true,
      });

      void loadRecentEventsForDebug('after-stop');

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
    clearScheduledActiveEvent,
    loadRecentEventsForDebug,
    normalizedCharacterId,
    scheduleReload,
  ]);

  const handleStatusPayload = useCallback(
    (payload: AutoCombatStatusResponse) => {
      if (!normalizedCharacterId) return;

      if (isUiBackgrounded()) {
        clearVisualTimeline();
      }

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status: payload,
      });
    },
    [clearVisualTimeline, normalizedCharacterId],
  );

  const handleFinishedPayload = useCallback(
    (payload: AutoCombatStatusResponse) => {
      if (!normalizedCharacterId) return;

      clearVisualTimeline();

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status: payload,
      });

      dispatch({
        type: 'CLEAR_QUEUE',
      });

      scheduleReload(AFTER_TERMINAL_RELOAD_DELAY_MS, {
        clearVisualTimeline: true,
      });

      void loadRecentEventsForDebug('finished');
    },
    [
      clearVisualTimeline,
      loadRecentEventsForDebug,
      normalizedCharacterId,
      scheduleReload,
    ],
  );

  const handleStoppedPayload = useCallback(
    (payload: AutoCombatStatusResponse) => {
      if (!normalizedCharacterId) return;

      clearVisualTimeline();

      dispatch({
        type: 'HYDRATE_STATUS',
        characterId: normalizedCharacterId,
        status: payload,
      });

      dispatch({
        type: 'CLEAR_QUEUE',
      });

      scheduleReload(AFTER_TERMINAL_RELOAD_DELAY_MS, {
        clearVisualTimeline: true,
      });

      void loadRecentEventsForDebug('stopped');
    },
    [
      clearVisualTimeline,
      loadRecentEventsForDebug,
      normalizedCharacterId,
      scheduleReload,
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

      if (isUiBackgrounded()) {
        fastForwardRealtimeEvent(payload);
        return;
      }

      dispatch({
        type: 'ENQUEUE_EVENT',
        characterId: normalizedCharacterId,
        event: payload,
      });
    },
    [fastForwardRealtimeEvent, normalizedCharacterId],
  );

  const socketState = useAutoCombatSocket({
    characterId: normalizedCharacterId,
    enabled: Boolean(normalizedCharacterId),

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
  }, [socketState.isConnected, socketState.isJoined, socketState.errorMessage]);

  useEffect(() => {
    if (!normalizedCharacterId) return;

    if (socketState.isConnected && socketState.isJoined) {
      scheduleReload(150, {
        clearVisualTimeline: false,
      });
    }
  }, [
    normalizedCharacterId,
    scheduleReload,
    socketState.isConnected,
    socketState.isJoined,
  ]);

  useEffect(() => {
    if (!autoLoad || !normalizedCharacterId) return;

    scheduleReload(INITIAL_RELOAD_DELAY_MS);
  }, [autoLoad, normalizedCharacterId, scheduleReload]);

  useEffect(() => {
    if (!autoLoad || !normalizedCharacterId || refreshMs <= 0) return;

    const intervalId = window.setInterval(() => {
      const currentState = stateRef.current;

      if (!shouldPollCurrentState(currentState)) {
        return;
      }

      void reload();
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
        clearVisualTimeline();
        return;
      }

      if (wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        reconcileAfterReturningToPage();
      }
    }

    function handleWindowBlur() {
      wasBackgroundedRef.current = true;
      clearVisualTimeline();
    }

    function handleWindowFocus() {
      if (!isDocumentVisible()) {
        return;
      }

      if (wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        reconcileAfterReturningToPage();
        return;
      }

      const currentState = stateRef.current;

      if (currentState.activeEvent || currentState.eventQueue.length > 0) {
        reconcileAfterReturningToPage();
        return;
      }

      scheduleReload(AFTER_VISIBILITY_RELOAD_DELAY_MS, {
        clearVisualTimeline: true,
      });

      void loadRecentEventsForDebug('window-focus');
    }

    function handlePageShow() {
      if (!isDocumentVisible()) {
        return;
      }

      reconcileAfterReturningToPage();
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
    clearVisualTimeline,
    loadRecentEventsForDebug,
    normalizedCharacterId,
    reconcileAfterReturningToPage,
    scheduleReload,
  ]);

  useEffect(() => {
    clearScheduledActiveEvent();

    /**
     * Caso 1:
     * Existe evento ativo.
     *
     * Se a UI está em segundo plano, limpamos imediatamente para não congelar
     * animação/timeline até o usuário voltar.
     */
    if (state.activeEvent) {
      if (isUiBackgrounded()) {
        dispatch({
          type: 'CLEAR_ACTIVE_EVENT',
        });

        return undefined;
      }

      activeEventTimeoutRef.current = window.setTimeout(() => {
        dispatch({
          type: 'CLEAR_ACTIVE_EVENT',
        });

        activeEventTimeoutRef.current = null;
      }, getRealtimeEventDelay(state.activeEvent));

      return () => {
        clearScheduledActiveEvent();
      };
    }

    /**
     * Caso 2:
     * Não existe evento ativo e há fila pendente.
     *
     * Em primeiro plano: processa com delay visual.
     * Em segundo plano: processa e limpa no mesmo ciclo.
     */
    if (state.eventQueue.length > 0) {
      if (isUiBackgrounded()) {
        dispatch({
          type: 'PROCESS_NEXT_EVENT',
        });

        dispatch({
          type: 'CLEAR_ACTIVE_EVENT',
        });

        return undefined;
      }

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
  }, [clearScheduledActiveEvent, state.activeEvent, state.eventQueue.length]);

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

      /**
       * Mantém compatibilidade:
       * - state.totals = canônico/backend;
       * - state.displayTotals = visual/liberado.
       *
       * Quem precisar dos totais visuais deve ler:
       * useAutoCombatRealtimeState().displayTotals
       */
      totals: state.totals,

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