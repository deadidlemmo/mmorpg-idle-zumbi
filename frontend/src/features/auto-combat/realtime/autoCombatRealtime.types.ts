import type { ReactNode } from 'react';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from '../../dashboard/types/dashboard.types';
import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
  StartAutoCombatPayload,
} from '../types/auto-combat.types';
import type { AutoCombatRealtimeState as AutoCombatRealtimeReducerState } from './autoCombatRealtime.reducer';

export type AutoCombatRealtimeSessionStatus =
  | 'ACTIVE'
  | 'STOPPED'
  | 'FINISHED'
  | 'DEFEATED'
  | 'FAILED'
  | 'CANCELLED'
  | string;

export type AutoCombatRealtimeActor = 'PLAYER' | 'MOB' | 'SYSTEM' | string;

export type AutoCombatRealtimeTarget = 'PLAYER' | 'MOB' | 'SYSTEM' | string;

export type AutoCombatRealtimeDelayMap = {
  MOB_SPAWNED: number;
  PLAYER_HIT: number;
  MOB_HIT: number;
  DODGE: number;
  POTION_USED: number;
  MOB_DEFEATED: number;
  PLAYER_DEFEATED: number;
  DEFAULT: number;
};

export type AutoCombatRealtimeCharacterState = {
  id?: string | null;
  name?: string | null;

  level?: number;
  xp?: number;
  totalXp?: number;

  currentHp?: number;
  maxHp?: number;
  hpPercent?: number;

  currentLevelXp?: number;
  xpToNextLevel?: number;
  nextLevelXp?: number;
  xpProgressPercent?: number;

  xpIntoCurrentLevel?: number;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean;

  xpGained?: number;
  leveledUp?: boolean;
  levelsGained?: number;

  updatedAt?: number;
};

export type AutoCombatRealtimeMobState = {
  id?: string | null;
  enemyInstanceId?: string | null;
  name?: string | null;

  currentHp?: number;
  maxHp?: number;
  hpPercent?: number;

  level?: number | null;
  tier?: number | null;

  updatedAt?: number;
};

export type AutoCombatRealtimeSessionState = {
  id?: string | null;
  characterId?: string | null;
  subMapId?: string | null;

  status?: AutoCombatRealtimeSessionStatus | null;

  startedAt?: string | Date | null;
  endsAt?: string | Date | null;
  finishedAt?: string | Date | null;

  remainingSeconds?: number | null;
  durationSeconds?: number | null;
  roundDurationSeconds?: number | null;

  /**
   * Rodada atual do combate atual.
   * Não representa total acumulado de rodadas da sessão.
   */
  currentRound?: number | null;

  /**
   * Índice do combate atual.
   * Exemplo: se 10 mobs foram abatidos, normalmente o combate atual é 11.
  */
  currentCombatIndex?: number | null;
  enemyInstanceId?: string | null;
  currentEnemyInstanceId?: string | null;
  snapshotSequence?: number | null;
  latestEventSequence?: number | null;

  updatedAt?: number;
};

export type AutoCombatRealtimeLocationState = {
  subMapId?: string | null;
  subMapName?: string | null;

  mapId?: string | null;
  mapName?: string | null;

  tier?: number | null;
  minLevel?: number | null;
  maxLevel?: number | null;
};

export type AutoCombatRealtimeTotalsState = {
  sessionId?: string | null;

  /**
   * Combate atual da sessão.
   */
  currentCombatIndex?: number;

  /**
   * Combates/mobs já resolvidos.
   */
  totalCombats?: number;

  /**
   * Rodadas totais acumuladas da sessão.
   * Não confundir com event.round/currentRound.
   */
  totalRounds?: number;

  /**
   * Abates acumulados da sessão.
   */
  totalKills?: number;

  /**
   * XP ganho nesta sessão.
   */
  totalXpGained?: number;
  baseXpGained?: number;
  premiumBonusXp?: number;
  premiumPotentialBonusXp?: number;
  premiumTotalXp?: number;
  isPremiumActive?: boolean;

  /**
   * Quantidade total de loot coletado na sessão.
   */
  totalLoot?: number;

  /**
   * Poções usadas automaticamente na sessão.
   */
  potionsUsed?: number;

  updatedAt?: number;
};

export type AutoCombatRealtimePotionState = {
  potionItemId?: string | null;
  potionItemName?: string | null;

  quantityBefore?: number | null;
  quantityAfter?: number | null;
  quantityRemaining?: number | null;
  usedQuantity?: number | null;

  healedAmount?: number | null;
  triggerPercent?: number | null;

  updatedAt?: number;
};

export type AutoCombatRealtimeVisualState = {
  lastMessage?: string | null;
  lastDamage?: number | null;
  lastEventType?: string | null;

  actor?: AutoCombatRealtimeActor | null;
  target?: AutoCombatRealtimeTarget | null;

  isCritical?: boolean;
  isDodged?: boolean;

  updatedAt?: number;
};

export type AutoCombatRealtimeQueueItem = {
  id: string;
  event: AutoCombatRealtimeEvent;
  receivedAt: number;
};

export type AutoCombatRealtimeSocketState = {
  isConnected: boolean;
  isJoined: boolean;
  errorMessage: string;
};

/**
 * Tipo legado mantido por compatibilidade.
 *
 * O estado real usado atualmente pelo Provider vem de:
 * autoCombatRealtime.reducer.ts
 *
 * Por isso, o AutoCombatRealtimeContextValue abaixo usa
 * AutoCombatRealtimeReducerState no campo "state".
 */
export type AutoCombatRealtimeState = {
  characterId: string | null;

  socket: AutoCombatRealtimeSocketState;

  character: AutoCombatRealtimeCharacterState | null;
  session: AutoCombatRealtimeSessionState | null;
  currentMob: AutoCombatRealtimeMobState | null;
  location: AutoCombatRealtimeLocationState | null;

  /**
   * Totais canônicos/reais vindos do backend/status.
   * Este estado pode estar à frente da animação visual.
   */
  totals: AutoCombatRealtimeTotalsState | null;

  /**
   * Totais liberados para a UI exibir ao jogador.
   * Deve ser usado por ActivityBar e painel de estatísticas.
   * Ele só acompanha "totals" quando não há evento visual pendente.
   */
  displayTotals: AutoCombatRealtimeTotalsState | null;

  potion: AutoCombatRealtimePotionState | null;
  visual: AutoCombatRealtimeVisualState | null;

  status: AutoCombatStatusResponse | null;
  overview: CharacterOverviewResponse | null;
  baseCharacter: DashboardCharacterViewModel | null;

  activeEvent: AutoCombatRealtimeEvent | null;
  lastProcessedEvent: AutoCombatRealtimeEvent | null;

  eventQueue: AutoCombatRealtimeQueueItem[];
  battleLogEvents: AutoCombatRealtimeEvent[];

  processedEventKeys: string[];

  hasLoadedOnce: boolean;
  isProcessingQueue: boolean;

  updatedAt: number;
};

export type AutoCombatRealtimeHydrateOverviewPayload = {
  overview: CharacterOverviewResponse;
  character?: DashboardCharacterViewModel | null;
};

export type AutoCombatRealtimeHydrateStatusPayload = {
  status: AutoCombatStatusResponse | null;
  source?: 'socket' | 'api' | 'start' | 'stop' | 'fallback';
};

export type AutoCombatRealtimeSetSocketStatePayload = Partial<
  AutoCombatRealtimeSocketState
>;

export type AutoCombatRealtimeAction =
  | {
      type: 'RESET_CHARACTER';
      characterId: string | null;
    }
  | {
      type: 'HYDRATE_FROM_OVERVIEW';
      payload: AutoCombatRealtimeHydrateOverviewPayload;
    }
  | {
      type: 'HYDRATE_FROM_STATUS';
      payload: AutoCombatRealtimeHydrateStatusPayload;
    }
  | {
      type: 'ENQUEUE_EVENT';
      event: AutoCombatRealtimeEvent;
    }
  | {
      type: 'PROCESS_NEXT_EVENT';
    }
  | {
      type: 'FINISH_EVENT_PROCESSING';
      eventKey?: string;
    }
  | {
      type: 'CLEAR_QUEUE';
    }
  | {
      type: 'CLEAR_SESSION';
    }
  | {
      type: 'SET_SOCKET_STATE';
      payload: AutoCombatRealtimeSetSocketStatePayload;
    }
  | {
      type: 'SET_ERROR';
      message: string;
    }
  | {
      type: 'CLEAR_ERROR';
    };

export type AutoCombatRealtimeContextValue = {
  state: AutoCombatRealtimeReducerState;

  characterId: string | null;

  isConnected: boolean;
  isJoined: boolean;
  errorMessage: string;
  hasLoadedOnce: boolean;

  status: AutoCombatStatusResponse | null;
  session: AutoCombatRealtimeSessionState | null;
  character: AutoCombatRealtimeCharacterState | null;
  mob: AutoCombatRealtimeMobState | null;

  /**
   * Totais reais/canônicos vindos do backend/status.
   * Útil para depuração e lógica interna.
   */
  totals: AutoCombatRealtimeTotalsState | null;

  /**
   * Totais visuais liberados para exibição ao jogador.
   * Use este campo na ActivityBar e no painel de estatísticas para evitar
   * contador de abates/XP subir antes da barra/log terminarem a animação.
   */
  displayTotals: AutoCombatRealtimeTotalsState | null;

  visual: AutoCombatRealtimeVisualState | null;
  location: AutoCombatRealtimeLocationState | null;
  potion: AutoCombatRealtimePotionState | null;

  eventQueue: AutoCombatRealtimeEvent[];
  activeEvent: AutoCombatRealtimeEvent | null;
  battleLogEvents: AutoCombatRealtimeEvent[];

  hydrateOverview: (overview: CharacterOverviewResponse | null) => void;
  hydrateStatus: (status: AutoCombatStatusResponse | null) => void;
  enqueueRealtimeEvent: (event: AutoCombatRealtimeEvent) => void;

  clearRealtimeQueue: () => void;
  clearSessionVisualState: () => void;

  reload: () => Promise<void>;
  start: (payload: StartAutoCombatPayload) => Promise<AutoCombatStatusResponse>;
  stop: () => Promise<AutoCombatStatusResponse>;
};

export type AutoCombatRealtimeProviderProps = {
  characterId?: string | null;
  children: ReactNode;
};

export const AUTO_COMBAT_REALTIME_INITIAL_SOCKET_STATE: AutoCombatRealtimeSocketState =
  {
    isConnected: false,
    isJoined: false,
    errorMessage: '',
  };

export const AUTO_COMBAT_REALTIME_INITIAL_STATE: AutoCombatRealtimeState = {
  characterId: null,

  socket: AUTO_COMBAT_REALTIME_INITIAL_SOCKET_STATE,

  character: null,
  session: null,
  currentMob: null,
  location: null,

  totals: null,
  displayTotals: null,

  potion: null,
  visual: null,

  status: null,
  overview: null,
  baseCharacter: null,

  activeEvent: null,
  lastProcessedEvent: null,

  eventQueue: [],
  battleLogEvents: [],

  processedEventKeys: [],

  hasLoadedOnce: false,
  isProcessingQueue: false,

  updatedAt: Date.now(),
};
