import type { CharacterOverviewResponse } from '../../dashboard/types/dashboard.types';
import type {
    AutoCombatRealtimeEvent,
    AutoCombatStatusResponse,
} from '../types/auto-combat.types';
import type {
    AutoCombatRealtimeCharacterState,
    AutoCombatRealtimeLocationState,
    AutoCombatRealtimeMobState,
    AutoCombatRealtimePotionState,
    AutoCombatRealtimeSessionState,
    AutoCombatRealtimeTotalsState,
    AutoCombatRealtimeVisualState,
} from './autoCombatRealtime.types';
import {
    buildCharacterStateFromProgressSource,
    buildCharacterStateFromRealtimeEvent,
    buildCharacterStateFromStatus,
    buildLocationStateFromStatus,
    buildMobStateFromRealtimeEvent,
    buildMobStateFromStatus,
    buildPotionStateFromRealtimeEvent,
    buildSessionStateFromStatus,
    buildTotalsStateFromRealtimeEvent,
    buildTotalsStateFromStatus,
    buildVisualStateFromRealtimeEvent,
    getGenericRealtimeFingerprint,
    getMobSpawnFingerprint,
    getPotionUsedFingerprint,
    getRealtimeEventKey,
    getStatusSession,
    isEventForCharacter,
    isPotionUsedEvent,
    isSameRealtimeEvent,
    isStatusActive,
    isStatusForCharacter,
    isTerminalSessionStatus,
    limitArray,
    mergeCharacterKeepingHighestXp,
    toSafeNumber,
} from './autoCombatRealtime.utils';

export type AutoCombatRealtimeState = {
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
   * Totais canônicos/reais vindos do backend/status.
   *
   * Importante:
   * - Pode estar mais avançado que a animação.
   * - Não deve ser usado diretamente em UI visual sensível a timing.
   */
  totals: AutoCombatRealtimeTotalsState | null;

  /**
   * Totais liberados para a UI mostrar ao jogador.
   *
   * Regra:
   * - Avança junto com eventos visuais relevantes.
   * - Não depende apenas do polling/status.
   * - Evita mostrar abate/XP antes do MOB_DEFEATED aparecer visualmente.
   */
  displayTotals: AutoCombatRealtimeTotalsState | null;

  visual: AutoCombatRealtimeVisualState | null;
  location: AutoCombatRealtimeLocationState | null;
  potion: AutoCombatRealtimePotionState | null;

  /**
   * Fila única visual.
   *
   * O provider deve processar somente 1 evento por vez.
   * O reducer apenas avança a fila quando recebe PROCESS_NEXT_EVENT.
   */
  eventQueue: AutoCombatRealtimeEvent[];
  activeEvent: AutoCombatRealtimeEvent | null;

  /**
   * Indica se o evento ativo já chegou ao frame de impacto.
   * Enquanto false, animação/log podem existir, mas HP/totais não devem avançar.
   */
  activeEventImpactApplied: boolean;

  battleLogEvents: AutoCombatRealtimeEvent[];

  processedEventKeys: string[];
  processedGenericFingerprints: string[];
  processedMobSpawnFingerprints: string[];
  processedPotionUsedFingerprints: string[];

  queuedEventKeys: string[];
  queuedGenericFingerprints: string[];
  queuedMobSpawnFingerprints: string[];
  queuedPotionUsedFingerprints: string[];

  /**
   * Último evento realmente aplicado ao estado visual/realtime.
   * Usado para impedir que eventos antigos ou snapshots atrasados causem rollback
   * de HP/EXP depois de Alt+Tab, reconexão ou refetch.
   */
  lastAppliedEventSequence: number | null;
  lastAppliedEventTimestamp: number | null;

  updatedAt: number;
};

export type AutoCombatRealtimeAction =
  | {
      type: 'SET_CHARACTER_ID';
      characterId: string | null;
    }
  | {
      type: 'SET_CONNECTION';
      isConnected?: boolean;
      isJoined?: boolean;
      errorMessage?: string;
    }
  | {
      type: 'SET_ERROR';
      errorMessage: string;
    }
  | {
      type: 'CLEAR_ERROR';
    }
  | {
      type: 'HYDRATE_OVERVIEW';
      characterId: string;
      overview: CharacterOverviewResponse | null;
    }
  | {
      type: 'HYDRATE_STATUS';
      characterId: string;
      status: AutoCombatStatusResponse | null;
    }
  | {
      type: 'HYDRATE_RECENT_EVENTS';
      characterId: string;
      sessionId?: string | null;
      events: AutoCombatRealtimeEvent[];

      /**
       * Quando true, aplica o último snapshot dos eventos recentes no estado
       * sem animar novamente. Ideal para retorno de Alt+Tab/reconexão.
       */
      applySnapshot?: boolean;
    }
  | {
      type: 'FLUSH_EVENT_QUEUE';
    }
  | {
      type: 'ENQUEUE_EVENT';
      characterId: string;
      event: AutoCombatRealtimeEvent;
    }
  | {
      type: 'PROCESS_NEXT_EVENT';
    }
  | {
      type: 'APPLY_ACTIVE_EVENT_IMPACT';
    }
  | {
      type: 'CLEAR_ACTIVE_EVENT';
    }
  | {
      type: 'CLEAR_QUEUE';
    }
  | {
      type: 'CLEAR_SESSION_VISUAL_STATE';
    }
  | {
      type: 'RESET';
      characterId?: string | null;
    };

const MAX_QUEUE_SIZE = 80;
const MAX_BATTLE_LOG_SIZE = 100;
const MAX_EVENT_CACHE_SIZE = 700;
const MAX_FINGERPRINT_CACHE_SIZE = 350;

export const initialAutoCombatRealtimeState: AutoCombatRealtimeState = {
  characterId: null,

  isConnected: false,
  isJoined: false,
  errorMessage: '',

  hasLoadedOnce: false,

  status: null,

  session: null,
  character: null,
  mob: null,

  totals: null,
  displayTotals: null,

  visual: null,
  location: null,
  potion: null,

  eventQueue: [],
  activeEvent: null,
  activeEventImpactApplied: false,
  battleLogEvents: [],

  processedEventKeys: [],
  processedGenericFingerprints: [],
  processedMobSpawnFingerprints: [],
  processedPotionUsedFingerprints: [],

  queuedEventKeys: [],
  queuedGenericFingerprints: [],
  queuedMobSpawnFingerprints: [],
  queuedPotionUsedFingerprints: [],

  lastAppliedEventSequence: null,
  lastAppliedEventTimestamp: null,

  updatedAt: 0,
};

type StatusMobSnapshotLike = {
  id?: string | null;
  name?: string | null;
  currentHp?: number | null;
  maxHp?: number | null;
  hp?: number | null;
  hpPercent?: number | null;
  level?: number | null;
  tier?: number | null;
};

type StatusWithMobSnapshots = AutoCombatStatusResponse & {
  currentMob?: StatusMobSnapshotLike | null;
  mob?: StatusMobSnapshotLike | null;
  lastKnownMob?: StatusMobSnapshotLike | null;
  sessionSummary?: AutoCombatStatusResponse['sessionSummary'] & {
    currentMob?: StatusMobSnapshotLike | null;
    lastKnownMob?: StatusMobSnapshotLike | null;
  };
};

function now() {
  return Date.now();
}

function normalizeSessionStatus(status?: string | null) {
  return String(status ?? '').trim().toUpperCase();
}

function normalizeRealtimeEventType(event?: AutoCombatRealtimeEvent | null) {
  return String(event?.type ?? '').trim().toUpperCase();
}

function getEventSessionId(event?: AutoCombatRealtimeEvent | null) {
  return event?.sessionId ?? null;
}

function isTerminalStatus(status?: string | null) {
  return isTerminalSessionStatus(status);
}

function isNewSession(
  currentSessionId?: string | null,
  nextSessionId?: string | null,
) {
  return Boolean(
    currentSessionId && nextSessionId && currentSessionId !== nextSessionId,
  );
}

function addUniqueLimited(
  items: string[],
  value: string,
  maxItems: number,
): string[] {
  if (!value) return items;

  if (items.includes(value)) {
    return items;
  }

  return limitArray([...items, value], maxItems);
}

function removeValue(items: string[], value: string): string[] {
  if (!value || items.length <= 0) {
    return items;
  }

  return items.filter((item) => item !== value);
}

function hasValue(items: string[], value: string) {
  return Boolean(value && items.includes(value));
}

function hasUsefulMobIdentity(mob?: StatusMobSnapshotLike | null) {
  if (!mob) return false;

  return Boolean(
    mob.id ||
      mob.name ||
      mob.currentHp !== null ||
      mob.currentHp !== undefined ||
      mob.maxHp !== null ||
      mob.maxHp !== undefined ||
      mob.hp !== null ||
      mob.hp !== undefined ||
      mob.hpPercent !== null ||
      mob.hpPercent !== undefined,
  );
}

function hasUsefulRealtimeMobState(mob?: AutoCombatRealtimeMobState | null) {
  if (!mob) return false;

  return Boolean(
    mob.id ||
      mob.name ||
      mob.currentHp !== null ||
      mob.currentHp !== undefined ||
      mob.maxHp !== null ||
      mob.maxHp !== undefined ||
      mob.hpPercent !== null ||
      mob.hpPercent !== undefined,
  );
}

function getStatusMobSnapshot(
  status: AutoCombatStatusResponse | null,
): StatusMobSnapshotLike | null {
  if (!status) return null;

  const looseStatus = status as StatusWithMobSnapshots;

  return (
    looseStatus.currentMob ??
    looseStatus.mob ??
    looseStatus.sessionSummary?.currentMob ??
    looseStatus.lastKnownMob ??
    looseStatus.sessionSummary?.lastKnownMob ??
    null
  );
}

function statusHasUsefulMobSnapshot(status: AutoCombatStatusResponse | null) {
  return hasUsefulMobIdentity(getStatusMobSnapshot(status));
}

function shouldPreservePreviousMobOnActiveStatus(params: {
  baseState: AutoCombatRealtimeState;
  status: AutoCombatStatusResponse;
  statusIsActive: boolean;
  statusIsTerminal: boolean;
  sessionChanged: boolean;
}) {
  const { baseState, status, statusIsActive, statusIsTerminal, sessionChanged } =
    params;

  if (sessionChanged || statusIsTerminal || !statusIsActive) {
    return false;
  }

  if (!hasUsefulRealtimeMobState(baseState.mob)) {
    return false;
  }

  /**
   * Correção do "Combate automático" ao voltar do Alt+Tab:
   *
   * Em alguns reloads/reconciliações, o backend confirma que a sessão está ativa,
   * mas ainda não entrega currentMob no primeiro snapshot. Antes, isso podia
   * limpar o mob visual e fazer a ActivityBar cair no fallback genérico.
   *
   * Agora, enquanto a sessão continua ativa e não há mob novo confiável no status,
   * preservamos o último mob conhecido. Quando o backend/socket trouxer o novo mob,
   * ele substitui normalmente.
   */
  return !statusHasUsefulMobSnapshot(status);
}


function getStatusCombatIndex(status: AutoCombatStatusResponse | null) {
  const session = getStatusSession(status) as
    | { currentCombatIndex?: number | null }
    | null;

  const combatIndex = toSafeNumber(session?.currentCombatIndex, 0);

  return combatIndex > 0 ? Math.floor(combatIndex) : null;
}

function getStateCombatIndex(state: AutoCombatRealtimeState) {
  const combatIndex = toSafeNumber(state.session?.currentCombatIndex, 0);

  return combatIndex > 0 ? Math.floor(combatIndex) : null;
}

function isSameCombatScope(
  currentCombatIndex?: number | null,
  nextCombatIndex?: number | null,
) {
  if (!currentCombatIndex || !nextCombatIndex) {
    return true;
  }

  return currentCombatIndex === nextCombatIndex;
}

function isSameMobScope(
  currentMobId?: string | null,
  nextMobId?: string | null,
  currentMobName?: string | null,
  nextMobName?: string | null,
) {
  if (currentMobId && nextMobId) {
    return currentMobId === nextMobId;
  }

  if (currentMobName && nextMobName) {
    return currentMobName === nextMobName;
  }

  return true;
}

function getStatusMobCurrentHp(status: AutoCombatStatusResponse | null) {
  const mob = getStatusMobSnapshot(status);

  return getOptionalStatusNumber(mob?.currentHp ?? mob?.hp);
}

function getOptionalStatusNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function shouldPreservePreviousMobAgainstOlderStatus(params: {
  baseState: AutoCombatRealtimeState;
  status: AutoCombatStatusResponse;
  statusIsActive: boolean;
  statusIsTerminal: boolean;
  sessionChanged: boolean;
}) {
  const { baseState, status, statusIsActive, statusIsTerminal, sessionChanged } =
    params;

  if (sessionChanged || statusIsTerminal || !statusIsActive) {
    return false;
  }

  const currentMob = baseState.mob;
  const statusMob = getStatusMobSnapshot(status);

  if (!hasUsefulRealtimeMobState(currentMob) || !hasUsefulMobIdentity(statusMob)) {
    return false;
  }

  const currentCombatIndex = getStateCombatIndex(baseState);
  const nextCombatIndex = getStatusCombatIndex(status);

  if (!isSameCombatScope(currentCombatIndex, nextCombatIndex)) {
    return false;
  }

  if (
    !isSameMobScope(
      currentMob?.id ?? null,
      statusMob?.id ?? null,
      currentMob?.name ?? null,
      statusMob?.name ?? null,
    )
  ) {
    return false;
  }

  const currentHp = getOptionalStatusNumber(currentMob?.currentHp);
  const nextHp = getStatusMobCurrentHp(status);

  /**
   * Antirrollback do mob:
   * - dentro do mesmo mob/combate, HP maior vindo de status geralmente é snapshot velho;
   * - HP maior só deve ser aceito quando o combatIndex mudou, ou seja, novo spawn.
   */
  return currentHp !== undefined && nextHp !== undefined && nextHp > currentHp;
}

function getStatusCharacterHp(status: AutoCombatStatusResponse | null) {
  return getOptionalStatusNumber(
    status?.character?.currentHp ?? status?.sessionSummary?.hp?.current,
  );
}

function getStatusPotionsUsed(status: AutoCombatStatusResponse | null) {
  const totals = buildTotalsStateFromStatus(status, null);

  return totals?.potionsUsed ?? 0;
}

function getStatePotionsUsed(state: AutoCombatRealtimeState) {
  return Math.max(
    state.displayTotals?.potionsUsed ?? 0,
    state.totals?.potionsUsed ?? 0,
  );
}

function shouldPreservePreviousCharacterHpAgainstOlderStatus(params: {
  baseState: AutoCombatRealtimeState;
  status: AutoCombatStatusResponse;
  statusIsActive: boolean;
  statusIsTerminal: boolean;
  sessionChanged: boolean;
}) {
  const { baseState, status, statusIsActive, statusIsTerminal, sessionChanged } =
    params;

  if (sessionChanged || statusIsTerminal || !statusIsActive) {
    return false;
  }

  const currentHp = getOptionalStatusNumber(baseState.character?.currentHp);
  const nextHp = getStatusCharacterHp(status);

  if (currentHp === undefined || nextHp === undefined) {
    return false;
  }

  if (nextHp <= currentHp) {
    return false;
  }

  /**
   * HP maior no status durante sessão ativa só deve vencer se houver indício
   * de cura/poção mais nova. Caso contrário, costuma ser refetch antigo
   * sobrescrevendo um MOB_HIT já recebido pelo WebSocket.
   */
  return getStatusPotionsUsed(status) <= getStatePotionsUsed(baseState);
}

function preserveCharacterHpFromRealtimeState(
  previous: AutoCombatRealtimeCharacterState | null,
  incoming: AutoCombatRealtimeCharacterState | null,
): AutoCombatRealtimeCharacterState | null {
  if (!previous || !incoming) {
    return incoming ?? previous;
  }

  return {
    ...incoming,
    currentHp: previous.currentHp,
    maxHp: previous.maxHp ?? incoming.maxHp,
    hpPercent: previous.hpPercent ?? incoming.hpPercent,
    updatedAt: now(),
  };
}

function preserveCharacterProgressFromRealtimeState(
  previous: AutoCombatRealtimeCharacterState | null,
  incoming: AutoCombatRealtimeCharacterState | null,
): AutoCombatRealtimeCharacterState | null {
  if (!previous || !incoming) {
    return incoming ?? previous;
  }

  return {
    ...incoming,

    level: previous.level ?? incoming.level,
    xp: previous.xp ?? incoming.xp,
    totalXp: previous.totalXp ?? previous.xp ?? incoming.totalXp ?? incoming.xp,
    currentLevelXp: previous.currentLevelXp ?? incoming.currentLevelXp,
    xpToNextLevel: previous.xpToNextLevel ?? incoming.xpToNextLevel,
    nextLevelXp: previous.nextLevelXp ?? incoming.nextLevelXp,
    xpProgressPercent:
      previous.xpProgressPercent ?? incoming.xpProgressPercent,
    xpIntoCurrentLevel:
      previous.xpIntoCurrentLevel ?? incoming.xpIntoCurrentLevel,
    xpNeededForNextLevel:
      previous.xpNeededForNextLevel ?? incoming.xpNeededForNextLevel,
    currentLevelStartXp:
      previous.currentLevelStartXp ?? incoming.currentLevelStartXp,
    nextLevelRequiredXp:
      previous.nextLevelRequiredXp ?? incoming.nextLevelRequiredXp,
    isAtLevelCap: previous.isAtLevelCap ?? incoming.isAtLevelCap,
    xpGained: previous.xpGained ?? incoming.xpGained,
    leveledUp: previous.leveledUp ?? incoming.leveledUp,
    levelsGained: previous.levelsGained ?? incoming.levelsGained,
    updatedAt: now(),
  };
}

function isIncomingCharacterProgressAhead(
  current: AutoCombatRealtimeCharacterState | null,
  incoming: AutoCombatRealtimeCharacterState | null,
) {
  if (!current || !incoming) {
    return false;
  }

  const currentXp = current.totalXp ?? current.xp;
  const incomingXp = incoming.totalXp ?? incoming.xp;

  if (currentXp !== undefined && incomingXp !== undefined) {
    return incomingXp > currentXp;
  }

  const currentLevelXp = current.currentLevelXp ?? current.xpIntoCurrentLevel;
  const incomingLevelXp =
    incoming.currentLevelXp ?? incoming.xpIntoCurrentLevel;

  return (
    currentLevelXp !== undefined &&
    incomingLevelXp !== undefined &&
    incomingLevelXp > currentLevelXp
  );
}

function isRealtimeSessionActiveState(state: AutoCombatRealtimeState) {
  const sessionStatus = normalizeSessionStatus(state.session?.status);

  if (isTerminalSessionStatus(sessionStatus)) {
    return false;
  }

  if (sessionStatus === 'ACTIVE') {
    return true;
  }

  return isStatusActive(state.status);
}

function getEventFingerprints(event: AutoCombatRealtimeEvent) {
  const eventKey = getRealtimeEventKey(event);
  const genericFingerprint = getGenericRealtimeFingerprint(event);
  const mobSpawnFingerprint = getMobSpawnFingerprint(event);
  const potionUsedFingerprint = getPotionUsedFingerprint(event);

  return {
    eventKey,
    genericFingerprint,
    mobSpawnFingerprint,
    potionUsedFingerprint,
  };
}

function hasPendingVisualEvents(
  state: Pick<AutoCombatRealtimeState, 'activeEvent' | 'eventQueue'>,
) {
  return Boolean(state.activeEvent || state.eventQueue.length > 0);
}

function canPublishCanonicalDisplayTotals(
  state: Pick<AutoCombatRealtimeState, 'activeEvent' | 'eventQueue'>,
) {
  return !hasPendingVisualEvents(state);
}

function isDisplayTotalsReleaseEvent(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event);

  return (
    eventType === 'MOB_DEFEATED' ||
    eventType === 'PLAYER_DEFEATED' ||
    eventType === 'POTION_USED'
  );
}

function buildDisplayTotalsFromReleaseEvent(
  state: AutoCombatRealtimeState,
  releaseEvent: AutoCombatRealtimeEvent,
): AutoCombatRealtimeTotalsState | null {
  if (!isDisplayTotalsReleaseEvent(releaseEvent)) {
    return state.displayTotals;
  }

  /**
   * Ponto principal da correção:
   *
   * displayTotals não deve esperar a fila inteira terminar.
   * Ele deve avançar quando o evento visual relevante já foi exibido.
   *
   * Exemplo:
   * - MOB_DEFEATED apareceu no log/animação;
   * - ao limpar esse activeEvent, liberamos +1 abate / XP daquele evento;
   * - a ActivityBar e as estatísticas deixam de depender do polling lento.
   */
  const nextDisplayTotals = buildTotalsStateFromRealtimeEvent(
    releaseEvent,
    state.displayTotals,
  );

  return nextDisplayTotals ?? state.displayTotals ?? null;
}

function publishDisplayTotalsIfAllowed(
  state: AutoCombatRealtimeState,
  options?: {
    forceCanonical?: boolean;
    releaseEvent?: AutoCombatRealtimeEvent | null;
  },
): AutoCombatRealtimeTotalsState | null {
  const { forceCanonical = false, releaseEvent = null } = options ?? {};

  if (releaseEvent && isDisplayTotalsReleaseEvent(releaseEvent)) {
    return buildDisplayTotalsFromReleaseEvent(state, releaseEvent);
  }

  if (!canPublishCanonicalDisplayTotals(state)) {
    return state.displayTotals;
  }

  if (forceCanonical) {
    return state.totals ?? state.displayTotals ?? null;
  }

  if (isStatusProgressAheadOfReleasedVisualState(state, state.totals)) {
    return state.displayTotals ?? null;
  }

  /**
   * Quando a fila visual está completamente vazia, a UI pode reconciliar
   * com o total canônico do backend.
   *
   * Isso corrige pequenas diferenças de polling/status sem antecipar números
   * durante animações pendentes.
   */
  return state.totals ?? state.displayTotals ?? null;
}

function clearRealtimeRuntimeState(
  state: AutoCombatRealtimeState,
  options?: {
    clearStatus?: boolean;
    clearSession?: boolean;
    clearMob?: boolean;
    clearTotals?: boolean;
    clearDisplayTotals?: boolean;
    clearVisual?: boolean;
    clearPotion?: boolean;
    clearEventCaches?: boolean;
    clearBattleLog?: boolean;
  },
): AutoCombatRealtimeState {
  const {
    clearStatus = false,
    clearSession = false,
    clearMob = true,
    clearTotals = true,
    clearDisplayTotals = clearTotals,
    clearVisual = true,
    clearPotion = true,
    clearEventCaches = true,
    clearBattleLog = true,
  } = options ?? {};

  return {
    ...state,

    status: clearStatus ? null : state.status,
    session: clearSession ? null : state.session,

    mob: clearMob ? null : state.mob,
    totals: clearTotals ? null : state.totals,
    displayTotals: clearDisplayTotals ? null : state.displayTotals,

    visual: clearVisual ? null : state.visual,
    potion: clearPotion ? null : state.potion,

    eventQueue: [],
    activeEvent: null,
    activeEventImpactApplied: false,
    battleLogEvents: clearBattleLog ? [] : state.battleLogEvents,

    processedEventKeys: clearEventCaches ? [] : state.processedEventKeys,
    processedGenericFingerprints: clearEventCaches
      ? []
      : state.processedGenericFingerprints,
    processedMobSpawnFingerprints: clearEventCaches
      ? []
      : state.processedMobSpawnFingerprints,
    processedPotionUsedFingerprints: clearEventCaches
      ? []
      : state.processedPotionUsedFingerprints,

    queuedEventKeys: [],
    queuedGenericFingerprints: [],
    queuedMobSpawnFingerprints: [],
    queuedPotionUsedFingerprints: [],

    lastAppliedEventSequence: clearEventCaches
      ? null
      : state.lastAppliedEventSequence,
    lastAppliedEventTimestamp: clearEventCaches
      ? null
      : state.lastAppliedEventTimestamp,

    updatedAt: now(),
  };
}

function hasProcessedEvent(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const {
    eventKey,
    genericFingerprint,
    mobSpawnFingerprint,
    potionUsedFingerprint,
  } = getEventFingerprints(event);

  if (hasValue(state.processedEventKeys, eventKey)) {
    return true;
  }

  if (
    genericFingerprint &&
    hasValue(state.processedGenericFingerprints, genericFingerprint)
  ) {
    return true;
  }

  if (
    mobSpawnFingerprint &&
    hasValue(state.processedMobSpawnFingerprints, mobSpawnFingerprint)
  ) {
    return true;
  }

  if (
    potionUsedFingerprint &&
    hasValue(state.processedPotionUsedFingerprints, potionUsedFingerprint)
  ) {
    return true;
  }

  return false;
}

function hasQueuedEvent(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const {
    eventKey,
    genericFingerprint,
    mobSpawnFingerprint,
    potionUsedFingerprint,
  } = getEventFingerprints(event);

  if (hasValue(state.queuedEventKeys, eventKey)) {
    return true;
  }

  if (
    genericFingerprint &&
    hasValue(state.queuedGenericFingerprints, genericFingerprint)
  ) {
    return true;
  }

  if (
    mobSpawnFingerprint &&
    hasValue(state.queuedMobSpawnFingerprints, mobSpawnFingerprint)
  ) {
    return true;
  }

  if (
    potionUsedFingerprint &&
    hasValue(state.queuedPotionUsedFingerprints, potionUsedFingerprint)
  ) {
    return true;
  }

  return state.eventQueue.some((queuedEvent) => {
    return isSameRealtimeEvent(queuedEvent, event);
  });
}

function markEventAsQueued(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const {
    eventKey,
    genericFingerprint,
    mobSpawnFingerprint,
    potionUsedFingerprint,
  } = getEventFingerprints(event);

  return {
    queuedEventKeys: addUniqueLimited(
      state.queuedEventKeys,
      eventKey,
      MAX_EVENT_CACHE_SIZE,
    ),
    queuedGenericFingerprints: addUniqueLimited(
      state.queuedGenericFingerprints,
      genericFingerprint,
      MAX_EVENT_CACHE_SIZE,
    ),
    queuedMobSpawnFingerprints: addUniqueLimited(
      state.queuedMobSpawnFingerprints,
      mobSpawnFingerprint,
      MAX_FINGERPRINT_CACHE_SIZE,
    ),
    queuedPotionUsedFingerprints: addUniqueLimited(
      state.queuedPotionUsedFingerprints,
      potionUsedFingerprint,
      MAX_FINGERPRINT_CACHE_SIZE,
    ),
  };
}

function unmarkEventAsQueued(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const {
    eventKey,
    genericFingerprint,
    mobSpawnFingerprint,
    potionUsedFingerprint,
  } = getEventFingerprints(event);

  return {
    queuedEventKeys: removeValue(state.queuedEventKeys, eventKey),
    queuedGenericFingerprints: removeValue(
      state.queuedGenericFingerprints,
      genericFingerprint,
    ),
    queuedMobSpawnFingerprints: removeValue(
      state.queuedMobSpawnFingerprints,
      mobSpawnFingerprint,
    ),
    queuedPotionUsedFingerprints: removeValue(
      state.queuedPotionUsedFingerprints,
      potionUsedFingerprint,
    ),
  };
}

function markEventAsProcessed(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const {
    eventKey,
    genericFingerprint,
    mobSpawnFingerprint,
    potionUsedFingerprint,
  } = getEventFingerprints(event);

  return {
    processedEventKeys: addUniqueLimited(
      state.processedEventKeys,
      eventKey,
      MAX_EVENT_CACHE_SIZE,
    ),
    processedGenericFingerprints: addUniqueLimited(
      state.processedGenericFingerprints,
      genericFingerprint,
      MAX_EVENT_CACHE_SIZE,
    ),
    processedMobSpawnFingerprints: addUniqueLimited(
      state.processedMobSpawnFingerprints,
      mobSpawnFingerprint,
      MAX_FINGERPRINT_CACHE_SIZE,
    ),
    processedPotionUsedFingerprints: addUniqueLimited(
      state.processedPotionUsedFingerprints,
      potionUsedFingerprint,
      MAX_FINGERPRINT_CACHE_SIZE,
    ),
  };
}

function markEventsAsProcessed(
  state: AutoCombatRealtimeState,
  events: AutoCombatRealtimeEvent[],
) {
  let processedEventKeys = state.processedEventKeys;
  let processedGenericFingerprints = state.processedGenericFingerprints;
  let processedMobSpawnFingerprints = state.processedMobSpawnFingerprints;
  let processedPotionUsedFingerprints = state.processedPotionUsedFingerprints;

  for (const event of events) {
    const {
      eventKey,
      genericFingerprint,
      mobSpawnFingerprint,
      potionUsedFingerprint,
    } = getEventFingerprints(event);

    processedEventKeys = addUniqueLimited(
      processedEventKeys,
      eventKey,
      MAX_EVENT_CACHE_SIZE,
    );

    processedGenericFingerprints = addUniqueLimited(
      processedGenericFingerprints,
      genericFingerprint,
      MAX_EVENT_CACHE_SIZE,
    );

    processedMobSpawnFingerprints = addUniqueLimited(
      processedMobSpawnFingerprints,
      mobSpawnFingerprint,
      MAX_FINGERPRINT_CACHE_SIZE,
    );

    processedPotionUsedFingerprints = addUniqueLimited(
      processedPotionUsedFingerprints,
      potionUsedFingerprint,
      MAX_FINGERPRINT_CACHE_SIZE,
    );
  }

  return {
    processedEventKeys,
    processedGenericFingerprints,
    processedMobSpawnFingerprints,
    processedPotionUsedFingerprints,
  };
}

function getRealtimeEventUnknownField(
  event: AutoCombatRealtimeEvent,
  fieldName: string,
) {
  const eventRecord = event as unknown as Record<string, unknown>;

  return eventRecord[fieldName];
}

function getRealtimeEventStringField(
  event: AutoCombatRealtimeEvent,
  fieldName: string,
) {
  const value = getRealtimeEventUnknownField(event, fieldName);

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getRealtimeEventNumberField(
  event: AutoCombatRealtimeEvent,
  fieldName: string,
) {
  const value = getRealtimeEventUnknownField(event, fieldName);

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getStoredRealtimeEventId(event: AutoCombatRealtimeEvent) {
  return (
    getRealtimeEventStringField(event, 'eventId') ??
    getRealtimeEventStringField(event, 'id')
  );
}

function getStoredRealtimeEventSequence(event: AutoCombatRealtimeEvent) {
  return getRealtimeEventNumberField(event, 'sequence');
}

function getRealtimeEventCreatedAtTimestamp(event: AutoCombatRealtimeEvent) {
  const createdAt = getRealtimeEventStringField(event, 'createdAt');

  if (!createdAt) {
    return 0;
  }

  const timestamp = new Date(createdAt).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRealtimeEventAppliedTimestamp(event: AutoCombatRealtimeEvent) {
  const timestamp = getRealtimeEventCreatedAtTimestamp(event);

  return timestamp > 0 ? timestamp : now();
}

function getEventCombatIndexNumber(event?: AutoCombatRealtimeEvent | null) {
  if (!event) return null;

  const value = getRealtimeEventUnknownField(event, 'combatIndex');

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getEventCurrentRoundNumber(event?: AutoCombatRealtimeEvent | null) {
  if (!event) return null;

  const value = getRealtimeEventUnknownField(event, 'round');

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function compareRealtimeEventsChronologically(
  firstEvent: AutoCombatRealtimeEvent,
  secondEvent: AutoCombatRealtimeEvent,
) {
  const firstSequence = getStoredRealtimeEventSequence(firstEvent);
  const secondSequence = getStoredRealtimeEventSequence(secondEvent);

  if (firstSequence !== null && secondSequence !== null) {
    return firstSequence - secondSequence;
  }

  const firstTimestamp = getRealtimeEventCreatedAtTimestamp(firstEvent);
  const secondTimestamp = getRealtimeEventCreatedAtTimestamp(secondEvent);

  if (firstTimestamp !== secondTimestamp) {
    return firstTimestamp - secondTimestamp;
  }

  const firstCombatIndex = getEventCombatIndexNumber(firstEvent) ?? 0;
  const secondCombatIndex = getEventCombatIndexNumber(secondEvent) ?? 0;

  if (firstCombatIndex !== secondCombatIndex) {
    return firstCombatIndex - secondCombatIndex;
  }

  const firstRound = getEventCurrentRoundNumber(firstEvent) ?? 0;
  const secondRound = getEventCurrentRoundNumber(secondEvent) ?? 0;

  if (firstRound !== secondRound) {
    return firstRound - secondRound;
  }

  return getBattleLogTypeOrderFromRealtimeEvent(firstEvent) -
    getBattleLogTypeOrderFromRealtimeEvent(secondEvent);
}

function getBattleLogTypeOrderFromRealtimeEvent(event: AutoCombatRealtimeEvent) {
  const eventType = normalizeRealtimeEventType(event);

  switch (eventType) {
    case 'MOB_SPAWNED':
      return 10;
    case 'PLAYER_HIT':
      return 20;
    case 'MOB_HIT':
      return 30;
    case 'DODGE':
      return 35;
    case 'POTION_USED':
      return 40;
    case 'MOB_DEFEATED':
      return 50;
    case 'PLAYER_DEFEATED':
      return 60;
    default:
      return 90;
  }
}

function sortRealtimeEventsChronologically(events: AutoCombatRealtimeEvent[]) {
  return [...events].sort(compareRealtimeEventsChronologically);
}

function shouldRejectOutOfOrderEvent(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const eventSequence = getStoredRealtimeEventSequence(event);

  if (
    eventSequence !== null &&
    state.lastAppliedEventSequence !== null &&
    eventSequence <= state.lastAppliedEventSequence
  ) {
    return true;
  }

  return false;
}

function getEventMobCurrentHp(event: AutoCombatRealtimeEvent) {
  return getRealtimeEventNumberField(event, 'mobCurrentHp');
}

function getEventCharacterCurrentHp(event: AutoCombatRealtimeEvent) {
  return getRealtimeEventNumberField(event, 'characterCurrentHp');
}

function shouldRejectRollbackRealtimeEvent(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const eventType = normalizeRealtimeEventType(event);

  if (eventType === 'MOB_SPAWNED') {
    return false;
  }

  const stateCombatIndex = getStateCombatIndex(state);
  const eventCombatIndex = getEventCombatIndexNumber(event);

  const sameCombat = isSameCombatScope(stateCombatIndex, eventCombatIndex);

  const sameMob = isSameMobScope(
    state.mob?.id ?? null,
    event.mobId ?? null,
    state.mob?.name ?? null,
    event.mobName ?? null,
  );

  if (sameCombat && sameMob) {
    const currentMobHp = getOptionalStatusNumber(state.mob?.currentHp);
    const eventMobHp = getEventMobCurrentHp(event);

    if (
      currentMobHp !== undefined &&
      eventMobHp !== null &&
      eventMobHp > currentMobHp
    ) {
      return true;
    }
  }

  if (eventType !== 'POTION_USED') {
    const currentCharacterHp = getOptionalStatusNumber(state.character?.currentHp);
    const eventCharacterHp = getEventCharacterCurrentHp(event);

    if (
      currentCharacterHp !== undefined &&
      eventCharacterHp !== null &&
      eventCharacterHp > currentCharacterHp
    ) {
      return true;
    }
  }

  return false;
}

function updateAppliedEventClock(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
) {
  const eventSequence = getStoredRealtimeEventSequence(event);
  const eventTimestamp = getRealtimeEventAppliedTimestamp(event);

  return {
    lastAppliedEventSequence:
      eventSequence !== null
        ? Math.max(state.lastAppliedEventSequence ?? 0, eventSequence)
        : state.lastAppliedEventSequence,
    lastAppliedEventTimestamp: Math.max(
      state.lastAppliedEventTimestamp ?? 0,
      eventTimestamp,
    ),
  };
}

function getStoredRealtimeEventStableKey(event: AutoCombatRealtimeEvent) {
  const eventId = getStoredRealtimeEventId(event);

  if (eventId) {
    return `event:${eventId}`;
  }

  const sessionId = getEventSessionId(event);
  const sequence = getStoredRealtimeEventSequence(event);

  if (sessionId && sequence !== null) {
    return `session:${sessionId}:sequence:${sequence}`;
  }

  return '';
}

function isSameBattleLogEvent(
  firstEvent: AutoCombatRealtimeEvent,
  secondEvent: AutoCombatRealtimeEvent,
) {
  const firstStableKey = getStoredRealtimeEventStableKey(firstEvent);
  const secondStableKey = getStoredRealtimeEventStableKey(secondEvent);

  if (firstStableKey && secondStableKey && firstStableKey === secondStableKey) {
    return true;
  }

  return isSameRealtimeEvent(firstEvent, secondEvent);
}

function sortBattleLogEventsNewestFirst(events: AutoCombatRealtimeEvent[]) {
  return [...events].sort((firstEvent, secondEvent) => {
    const firstSequence = getStoredRealtimeEventSequence(firstEvent);
    const secondSequence = getStoredRealtimeEventSequence(secondEvent);

    if (firstSequence !== null && secondSequence !== null) {
      return secondSequence - firstSequence;
    }

    const firstTimestamp = getRealtimeEventCreatedAtTimestamp(firstEvent);
    const secondTimestamp = getRealtimeEventCreatedAtTimestamp(secondEvent);

    if (firstTimestamp !== secondTimestamp) {
      return secondTimestamp - firstTimestamp;
    }

    const firstCombatIndex = toSafeNumber(
      getRealtimeEventUnknownField(firstEvent, 'combatIndex'),
      0,
    );

    const secondCombatIndex = toSafeNumber(
      getRealtimeEventUnknownField(secondEvent, 'combatIndex'),
      0,
    );

    if (firstCombatIndex !== secondCombatIndex) {
      return secondCombatIndex - firstCombatIndex;
    }

    const firstRound = toSafeNumber(
      getRealtimeEventUnknownField(firstEvent, 'round'),
      0,
    );

    const secondRound = toSafeNumber(
      getRealtimeEventUnknownField(secondEvent, 'round'),
      0,
    );

    return secondRound - firstRound;
  });
}

function appendBattleLogEvent(
  currentEvents: AutoCombatRealtimeEvent[],
  event: AutoCombatRealtimeEvent,
) {
  const alreadyExists = currentEvents.some((currentEvent) => {
    return isSameBattleLogEvent(currentEvent, event);
  });

  if (alreadyExists) {
    return currentEvents;
  }

  /**
   * Mantém o log interno com o mais recente primeiro.
   * O componente de log pode inverter somente para renderizar antigo -> recente.
   */
  return sortBattleLogEventsNewestFirst([event, ...currentEvents]).slice(
    0,
    MAX_BATTLE_LOG_SIZE,
  );
}

function mergeRecentEventsIntoBattleLog(
  currentEvents: AutoCombatRealtimeEvent[],
  recentEvents: AutoCombatRealtimeEvent[],
) {
  let hasNewEvent = false;
  const nextEvents = [...currentEvents];

  for (const recentEvent of recentEvents) {
    const alreadyExists = nextEvents.some((currentEvent) => {
      return isSameBattleLogEvent(currentEvent, recentEvent);
    });

    if (alreadyExists) {
      continue;
    }

    nextEvents.push(recentEvent);
    hasNewEvent = true;
  }

  if (!hasNewEvent) {
    return currentEvents;
  }

  return sortBattleLogEventsNewestFirst(nextEvents).slice(
    0,
    MAX_BATTLE_LOG_SIZE,
  );
}

function isStatusProgressAheadOfReleasedVisualState(
  state: AutoCombatRealtimeState,
  incomingTotals: AutoCombatRealtimeTotalsState | null,
) {
  if (!state.hasLoadedOnce || !incomingTotals) {
    return false;
  }

  const incomingXpGained = incomingTotals.totalXpGained ?? 0;
  const releasedXpGained = state.displayTotals?.totalXpGained ?? 0;

  if (incomingXpGained > releasedXpGained) {
    return true;
  }

  const incomingKills = incomingTotals.totalKills ?? incomingTotals.totalCombats ?? 0;
  const releasedKills =
    state.displayTotals?.totalKills ?? state.displayTotals?.totalCombats ?? 0;

  return incomingKills > releasedKills;
}

function shouldDeferStatusProgress(
  state: AutoCombatRealtimeState,
  incomingTotals?: AutoCombatRealtimeTotalsState | null,
) {
  return (
    hasPendingVisualEvents(state) ||
    isStatusProgressAheadOfReleasedVisualState(state, incomingTotals ?? null)
  );
}

function buildOverviewCharacterState(
  overview: CharacterOverviewResponse | null,
  fallback: AutoCombatRealtimeCharacterState | null,
): AutoCombatRealtimeCharacterState | null {
  if (!overview?.character) {
    return fallback;
  }

  const character = overview.character as unknown as Record<string, unknown>;

  const characterState = buildCharacterStateFromProgressSource(
    overview.character as Parameters<
      typeof buildCharacterStateFromProgressSource
    >[0],
    {
      ...fallback,

      id:
        typeof character.id === 'string'
          ? character.id
          : fallback?.id ?? undefined,

      name:
        typeof character.name === 'string'
          ? character.name
          : fallback?.name ?? undefined,

      currentHp:
        character.currentHp !== undefined
          ? Math.max(0, Math.floor(toSafeNumber(character.currentHp, 0)))
          : fallback?.currentHp,

      maxHp:
        character.maxHp !== undefined
          ? Math.max(1, Math.floor(toSafeNumber(character.maxHp, 1)))
          : fallback?.maxHp,
    },
  );

  return mergeCharacterKeepingHighestXp(fallback, characterState);
}

function buildOverviewLocationState(
  overview: CharacterOverviewResponse | null,
  fallback: AutoCombatRealtimeLocationState | null,
): AutoCombatRealtimeLocationState | null {
  if (!overview?.character) {
    return fallback;
  }

  const character = overview.character as unknown as Record<string, unknown>;
  const progression = overview.progression as
    | Record<string, unknown>
    | undefined;

  const currentMap = character.currentMap as
    | Record<string, unknown>
    | null
    | undefined;

  const map = character.map as Record<string, unknown> | null | undefined;

  const progressionCurrentMap = progression?.currentMap as
    | Record<string, unknown>
    | null
    | undefined;

  const mapName =
    typeof character.currentMapName === 'string'
      ? character.currentMapName
      : typeof currentMap?.name === 'string'
        ? currentMap.name
        : typeof map?.name === 'string'
          ? map.name
          : typeof progressionCurrentMap?.name === 'string'
            ? progressionCurrentMap.name
            : fallback?.mapName ?? null;

  if (!mapName && !fallback) {
    return null;
  }

  return {
    ...fallback,

    mapId:
      typeof currentMap?.id === 'string'
        ? currentMap.id
        : typeof map?.id === 'string'
          ? map.id
          : typeof progressionCurrentMap?.id === 'string'
            ? progressionCurrentMap.id
            : fallback?.mapId ?? null,

    mapName,

    tier:
      typeof currentMap?.tier === 'number'
        ? currentMap.tier
        : typeof map?.tier === 'number'
          ? map.tier
          : typeof progressionCurrentMap?.tier === 'number'
            ? progressionCurrentMap.tier
            : fallback?.tier ?? null,
  };
}

function hydrateFromOverview(
  state: AutoCombatRealtimeState,
  characterId: string,
  overview: CharacterOverviewResponse | null,
): AutoCombatRealtimeState {
  const overviewCharacter = buildOverviewCharacterState(
    overview,
    state.character,
  );
  const location = buildOverviewLocationState(overview, state.location);

  const shouldPreserveRealtimeProgress =
    isRealtimeSessionActiveState(state) &&
    isIncomingCharacterProgressAhead(state.character, overviewCharacter);

  const progressSafeCharacter = shouldPreserveRealtimeProgress
    ? preserveCharacterProgressFromRealtimeState(
        state.character,
        overviewCharacter,
      )
    : overviewCharacter;

  const shouldPreserveRealtimeHp =
    isRealtimeSessionActiveState(state) &&
    state.character?.currentHp !== undefined &&
    progressSafeCharacter?.currentHp !== undefined;

  const character = shouldPreserveRealtimeHp
    ? preserveCharacterHpFromRealtimeState(
        state.character,
        progressSafeCharacter,
      )
    : progressSafeCharacter;

  return {
    ...state,

    characterId,
    character,
    location,

    hasLoadedOnce: true,
    updatedAt: now(),
  };
}

function hydrateFromStatus(
  state: AutoCombatRealtimeState,
  characterId: string,
  status: AutoCombatStatusResponse | null,
): AutoCombatRealtimeState {
  if (!status) {
    return {
      ...state,
      characterId,
      status: null,
      hasLoadedOnce: true,
      updatedAt: now(),
    };
  }

  if (!isStatusForCharacter(characterId, status)) {
    return state;
  }

  const rawSession = getStatusSession(status);
  const nextSessionId = rawSession?.id ?? null;
  const currentSessionId = state.session?.id ?? null;

  const statusIsTerminal = isTerminalStatus(rawSession?.status);
  const statusIsActive =
    !statusIsTerminal &&
    (isStatusActive(status) ||
      normalizeSessionStatus(rawSession?.status) === 'ACTIVE');

  const sessionChanged = isNewSession(currentSessionId, nextSessionId);

  const baseState = sessionChanged
    ? clearRealtimeRuntimeState(state, {
        clearStatus: false,
        clearSession: false,
        clearMob: true,
        clearTotals: true,
        clearDisplayTotals: true,
        clearVisual: true,
        clearPotion: true,
        clearEventCaches: true,
        clearBattleLog: true,
      })
    : state;

  const nextTotals = buildTotalsStateFromStatus(status, null);

  const deferCharacterProgress =
    !sessionChanged &&
    !statusIsTerminal &&
    shouldDeferStatusProgress(baseState, nextTotals);

  const nextSession = buildSessionStateFromStatus(status, baseState.session);
  const nextLocation = buildLocationStateFromStatus(status, baseState.location);

  const statusCharacterState = buildCharacterStateFromStatus(
    status,
    baseState.character,
  );

  const mergedCharacter = deferCharacterProgress
    ? baseState.character
    : mergeCharacterKeepingHighestXp(baseState.character, statusCharacterState);

  const shouldPreservePreviousCharacterHp =
    shouldPreservePreviousCharacterHpAgainstOlderStatus({
      baseState,
      status,
      statusIsActive,
      statusIsTerminal,
      sessionChanged,
    });

  const nextCharacter = shouldPreservePreviousCharacterHp
    ? preserveCharacterHpFromRealtimeState(baseState.character, mergedCharacter)
    : mergedCharacter;

  const mobFromStatus = buildMobStateFromStatus(
    status,
    sessionChanged ? null : baseState.mob,
  );

  const deferMobProgress =
    !sessionChanged &&
    !statusIsTerminal &&
    shouldDeferStatusProgress(baseState, nextTotals);

  const shouldPreservePreviousMob =
    deferMobProgress ||
    shouldPreservePreviousMobOnActiveStatus({
      baseState,
      status,
      statusIsActive,
      statusIsTerminal,
      sessionChanged,
    }) ||
    shouldPreservePreviousMobAgainstOlderStatus({
      baseState,
      status,
      statusIsActive,
      statusIsTerminal,
      sessionChanged,
    });

  const nextMob = shouldPreservePreviousMob
    ? baseState.mob
    : mobFromStatus ??
      (!sessionChanged && !statusIsTerminal ? baseState.mob : null);

  /**
   * Em sessão ativa, HYDRATE_STATUS atualiza os totais canônicos,
   * mas não deve empurrar displayTotals para frente enquanto a camada visual
   * ainda está contando a batalha.
   *
   * displayTotals avança por:
   * - MOB_DEFEATED;
   * - PLAYER_DEFEATED;
   * - POTION_USED;
   * - terminal da sessão;
   * - reconciliação canônica quando a fila está realmente vazia.
   */
  const canPublishStatusTotals =
    statusIsTerminal ||
    sessionChanged ||
    (!deferCharacterProgress &&
      !baseState.displayTotals &&
      canPublishCanonicalDisplayTotals(baseState) &&
      baseState.battleLogEvents.length <= 0);

  const nextDisplayTotals = canPublishStatusTotals
    ? nextTotals
    : baseState.displayTotals ?? null;

  if (statusIsTerminal) {
    return {
      ...baseState,

      characterId,
      status,

      session: nextSession,
      character: nextCharacter,
      totals: nextTotals,
      displayTotals: nextDisplayTotals,
      location: nextLocation,
      mob: nextMob,

      activeEvent: null,
      eventQueue: [],

      queuedEventKeys: [],
      queuedGenericFingerprints: [],
      queuedMobSpawnFingerprints: [],
      queuedPotionUsedFingerprints: [],

      isJoined: false,

      hasLoadedOnce: true,
      updatedAt: now(),
    };
  }

  return {
    ...baseState,

    characterId,
    status,

    session: nextSession,
    character: nextCharacter,
    totals: nextTotals,
    displayTotals: nextDisplayTotals,
    location: nextLocation,
    mob: nextMob,

    hasLoadedOnce: true,

    isJoined: statusIsActive ? true : baseState.isJoined,

    updatedAt: now(),
  };
}


function applyRealtimeEventSnapshot(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
): AutoCombatRealtimeState {
  if (shouldRejectOutOfOrderEvent(state, event)) {
    return state;
  }

  if (shouldRejectRollbackRealtimeEvent(state, event)) {
    return {
      ...state,
      battleLogEvents: appendBattleLogEvent(state.battleLogEvents, event),
      ...markEventAsProcessed(state, event),
      updatedAt: now(),
    };
  }

  const eventType = normalizeRealtimeEventType(event);

  const nextCharacter =
    eventType === 'MOB_DEFEATED' ||
    eventType === 'PLAYER_DEFEATED' ||
    eventType === 'POTION_USED'
      ? mergeCharacterKeepingHighestXp(
          state.character,
          buildCharacterStateFromRealtimeEvent(event, state.character),
        )
      : buildCharacterStateFromRealtimeEvent(event, state.character);

  const nextMob = buildMobStateFromRealtimeEvent(event, state.mob);

  const nextDisplayTotals = isDisplayTotalsReleaseEvent(event)
    ? buildDisplayTotalsFromReleaseEvent(state, event)
    : state.displayTotals;

  const nextPotion = isPotionUsedEvent(event)
    ? buildPotionStateFromRealtimeEvent(event, state.potion)
    : state.potion;

  const nextVisual = buildVisualStateFromRealtimeEvent(event, state.visual);

  const nextSession: AutoCombatRealtimeSessionState | null = state.session
    ? {
        ...state.session,
        id: event.sessionId ?? state.session.id ?? null,
        currentRound:
          event.round !== undefined && event.round !== null
            ? Math.max(0, Math.floor(toSafeNumber(event.round, 0)))
            : state.session.currentRound,
        currentCombatIndex:
          event.combatIndex !== undefined && event.combatIndex !== null
            ? Math.max(1, Math.floor(toSafeNumber(event.combatIndex, 1)))
            : state.session.currentCombatIndex,
        updatedAt: now(),
      }
    : event.sessionId
      ? {
          id: event.sessionId,
          characterId: event.characterId ?? state.characterId,
          subMapId: null,
          status: 'ACTIVE',
          startedAt: null,
          endsAt: null,
          finishedAt: null,
          remainingSeconds: null,
          durationSeconds: null,
          roundDurationSeconds: null,
          currentRound:
            event.round !== undefined && event.round !== null
              ? Math.max(0, Math.floor(toSafeNumber(event.round, 0)))
              : null,
          currentCombatIndex:
            event.combatIndex !== undefined && event.combatIndex !== null
              ? Math.max(1, Math.floor(toSafeNumber(event.combatIndex, 1)))
              : null,
          updatedAt: now(),
        }
      : null;

  return {
    ...state,

    session: nextSession,
    character: nextCharacter,
    mob: nextMob,
    displayTotals: nextDisplayTotals,
    visual: nextVisual,
    potion: nextPotion,
    battleLogEvents: appendBattleLogEvent(state.battleLogEvents, event),

    ...markEventAsProcessed(state, event),
    ...updateAppliedEventClock(state, event),

    hasLoadedOnce: true,
    updatedAt: now(),
  };
}

function flushEventQueueWithoutAnimation(
  state: AutoCombatRealtimeState,
): AutoCombatRealtimeState {
  if (state.eventQueue.length <= 0 && !state.activeEvent) {
    return {
      ...state,
      activeEvent: null,
      activeEventImpactApplied: false,
      displayTotals: publishDisplayTotalsIfAllowed({
        ...state,
        activeEvent: null,
        activeEventImpactApplied: false,
      }),
      updatedAt: now(),
    };
  }

  let nextState: AutoCombatRealtimeState = {
    ...state,
    activeEvent: null,
    activeEventImpactApplied: false,
    eventQueue: [],
    queuedEventKeys: [],
    queuedGenericFingerprints: [],
    queuedMobSpawnFingerprints: [],
    queuedPotionUsedFingerprints: [],
    updatedAt: now(),
  };

  const pendingEvents = state.activeEvent
    ? [state.activeEvent, ...state.eventQueue]
    : state.eventQueue;

  for (const event of sortRealtimeEventsChronologically(pendingEvents)) {
    nextState = applyRealtimeEventSnapshot(nextState, event);
  }

  return {
    ...nextState,
    displayTotals: publishDisplayTotalsIfAllowed(nextState),
    updatedAt: now(),
  };
}

function hydrateRecentEvents(
  state: AutoCombatRealtimeState,
  characterId: string,
  sessionId: string | null | undefined,
  events: AutoCombatRealtimeEvent[],
  applySnapshot = false,
): AutoCombatRealtimeState {
  if (state.characterId && state.characterId !== characterId) {
    return state;
  }

  if (!Array.isArray(events) || events.length <= 0) {
    return state;
  }

  const currentSessionId = state.session?.id ?? null;
  const targetSessionId = sessionId ?? currentSessionId ?? null;

  const validEvents = events.filter((event) => {
    if (!event) {
      return false;
    }

    if (!isEventForCharacter(characterId, event)) {
      return false;
    }

    const eventSessionId = getEventSessionId(event);

    if (targetSessionId && eventSessionId && eventSessionId !== targetSessionId) {
      return false;
    }

    if (currentSessionId && eventSessionId && eventSessionId !== currentSessionId) {
      return false;
    }

    return true;
  });

  if (validEvents.length <= 0) {
    return state;
  }

  /**
   * Importante:
   * recentEvents são histórico/snapshot, não animação.
   *
   * Por isso:
   * - não entram em eventQueue;
   * - não viram activeEvent;
   * - não disparam visual/hit novamente;
   * - apenas completam o BattleLog.
   */
  const nextBattleLogEvents = mergeRecentEventsIntoBattleLog(
    state.battleLogEvents,
    validEvents,
  );

  /**
   * Marca como processado para evitar que eventos antigos, caso cheguem atrasados
   * pelo socket, sejam enfileirados e animados novamente.
   */
  const processedMarkers = markEventsAsProcessed(state, validEvents);

  const didChange =
    nextBattleLogEvents !== state.battleLogEvents ||
    processedMarkers.processedEventKeys !== state.processedEventKeys ||
    processedMarkers.processedGenericFingerprints !==
      state.processedGenericFingerprints ||
    processedMarkers.processedMobSpawnFingerprints !==
      state.processedMobSpawnFingerprints ||
    processedMarkers.processedPotionUsedFingerprints !==
      state.processedPotionUsedFingerprints;

  if (!didChange && !applySnapshot) {
    return state;
  }

  let nextState: AutoCombatRealtimeState = {
    ...state,

    characterId,
    battleLogEvents: nextBattleLogEvents,

    ...processedMarkers,

    hasLoadedOnce: true,
    updatedAt: now(),
  };

  if (applySnapshot) {
    for (const event of sortRealtimeEventsChronologically(validEvents)) {
      nextState = applyRealtimeEventSnapshot(nextState, event);
    }
  }

  return nextState;
}

function enqueueRealtimeEvent(
  state: AutoCombatRealtimeState,
  characterId: string,
  event: AutoCombatRealtimeEvent,
): AutoCombatRealtimeState {
  if (!isEventForCharacter(characterId, event)) {
    return state;
  }

  const activeSessionId = state.session?.id ?? null;
  const eventSessionId = getEventSessionId(event);

  if (eventSessionId && activeSessionId && eventSessionId !== activeSessionId) {
    return state;
  }

  if (isTerminalStatus(state.session?.status)) {
    return state;
  }

  /**
   * Deduplicação forte:
   * - evita MOB_SPAWNED duplicado;
   * - evita repetir hits iguais vindos por canais diferentes do socket;
   * - evita duplicar evento já processado ou já aguardando na fila.
   */
  if (hasProcessedEvent(state, event) || hasQueuedEvent(state, event)) {
    return state;
  }

  const queuedMarkers = markEventAsQueued(state, event);
  const nextQueue = limitArray([...state.eventQueue, event], MAX_QUEUE_SIZE);

  return {
    ...state,

    characterId,
    eventQueue: nextQueue,

    ...queuedMarkers,

    hasLoadedOnce: true,
    updatedAt: now(),
  };
}

function discardQueuedEvent(
  state: AutoCombatRealtimeState,
  event: AutoCombatRealtimeEvent,
): AutoCombatRealtimeState {
  const queuedMarkers = unmarkEventAsQueued(state, event);

  const nextState: AutoCombatRealtimeState = {
    ...state,
    eventQueue: state.eventQueue.slice(1),
    ...queuedMarkers,
    updatedAt: now(),
  };

  return {
    ...nextState,
    displayTotals: publishDisplayTotalsIfAllowed(nextState),
  };
}

function processRealtimeEvent(
  state: AutoCombatRealtimeState,
): AutoCombatRealtimeState {
  const event = state.eventQueue[0];

  if (!event) {
    return state;
  }

  /**
   * Garante fila única:
   * se já existe evento ativo, não processa outro.
   * O próximo só deve entrar após CLEAR_ACTIVE_EVENT.
   */
  if (state.activeEvent) {
    return state;
  }

  const activeSessionId = state.session?.id ?? null;
  const eventSessionId = getEventSessionId(event);

  if (eventSessionId && activeSessionId && eventSessionId !== activeSessionId) {
    return discardQueuedEvent(state, event);
  }

  if (isTerminalStatus(state.session?.status)) {
    return discardQueuedEvent(state, event);
  }

  if (
    shouldRejectOutOfOrderEvent(state, event) ||
    shouldRejectRollbackRealtimeEvent(state, event)
  ) {
    return discardQueuedEvent(state, event);
  }

  const processedMarkers = markEventAsProcessed(state, event);
  const queuedMarkers = unmarkEventAsQueued(state, event);

  const nextQueue = state.eventQueue.slice(1);

  /**
   * PROCESS_NEXT_EVENT coloca a cena/animação no ar e aplica o snapshot do
   * mesmo evento no mesmo reducer pass. Assim HP, cura de poção e label
   * flutuante mudam juntos, sem o atraso visual entre feedback e barra.
   */
  const stagedState: AutoCombatRealtimeState = {
    ...state,

    activeEvent: event,
    activeEventImpactApplied: false,
    eventQueue: nextQueue,

    ...processedMarkers,
    ...queuedMarkers,

    hasLoadedOnce: true,
    updatedAt: now(),
  };

  const impactedState = applyRealtimeEventSnapshot(stagedState, event);

  return {
    ...impactedState,

    activeEvent: event,
    activeEventImpactApplied: true,
    eventQueue: nextQueue,

    ...processedMarkers,
    ...queuedMarkers,

    hasLoadedOnce: true,
    updatedAt: now(),
  };
}


function applyActiveEventImpact(
  state: AutoCombatRealtimeState,
): AutoCombatRealtimeState {
  if (!state.activeEvent || state.activeEventImpactApplied) {
    return state;
  }

  const impactedState = applyRealtimeEventSnapshot(state, state.activeEvent);

  return {
    ...impactedState,
    activeEvent: state.activeEvent,
    activeEventImpactApplied: true,
    eventQueue: state.eventQueue,
    updatedAt: now(),
  };
}

function resetSessionVisualState(
  state: AutoCombatRealtimeState,
): AutoCombatRealtimeState {
  return clearRealtimeRuntimeState(state, {
    clearStatus: true,
    clearSession: true,
    clearMob: true,
    clearTotals: true,
    clearDisplayTotals: true,
    clearVisual: true,
    clearPotion: true,
    clearEventCaches: true,
    clearBattleLog: true,
  });
}

export function autoCombatRealtimeReducer(
  state: AutoCombatRealtimeState,
  action: AutoCombatRealtimeAction,
): AutoCombatRealtimeState {
  switch (action.type) {
    case 'SET_CHARACTER_ID': {
      if (state.characterId === action.characterId) {
        return state;
      }

      return {
        ...initialAutoCombatRealtimeState,
        characterId: action.characterId ?? null,
        updatedAt: now(),
      };
    }

    case 'SET_CONNECTION': {
      return {
        ...state,

        isConnected: action.isConnected ?? state.isConnected,
        isJoined: action.isJoined ?? state.isJoined,
        errorMessage: action.errorMessage ?? state.errorMessage,

        updatedAt: now(),
      };
    }

    case 'SET_ERROR': {
      if (state.errorMessage === action.errorMessage) {
        return state;
      }

      return {
        ...state,
        errorMessage: action.errorMessage,
        updatedAt: now(),
      };
    }

    case 'CLEAR_ERROR': {
      if (!state.errorMessage) {
        return state;
      }

      return {
        ...state,
        errorMessage: '',
        updatedAt: now(),
      };
    }

    case 'HYDRATE_OVERVIEW': {
      return hydrateFromOverview(state, action.characterId, action.overview);
    }

    case 'HYDRATE_STATUS': {
      return hydrateFromStatus(state, action.characterId, action.status);
    }

    case 'HYDRATE_RECENT_EVENTS': {
      return hydrateRecentEvents(
        state,
        action.characterId,
        action.sessionId,
        action.events,
        action.applySnapshot ?? false,
      );
    }

    case 'FLUSH_EVENT_QUEUE': {
      return flushEventQueueWithoutAnimation(state);
    }

    case 'ENQUEUE_EVENT': {
      return enqueueRealtimeEvent(state, action.characterId, action.event);
    }

    case 'PROCESS_NEXT_EVENT': {
      return processRealtimeEvent(state);
    }

    case 'APPLY_ACTIVE_EVENT_IMPACT': {
      return applyActiveEventImpact(state);
    }

    case 'CLEAR_ACTIVE_EVENT': {
      if (!state.activeEvent) {
        return state;
      }

      const nextState: AutoCombatRealtimeState = {
        ...state,
        activeEvent: null,
        activeEventImpactApplied: false,
        updatedAt: now(),
      };

      return {
        ...nextState,
        displayTotals: publishDisplayTotalsIfAllowed(nextState),
      };
    }

    case 'CLEAR_QUEUE': {
      if (
        state.eventQueue.length <= 0 &&
        state.queuedEventKeys.length <= 0 &&
        state.queuedGenericFingerprints.length <= 0 &&
        state.queuedMobSpawnFingerprints.length <= 0 &&
        state.queuedPotionUsedFingerprints.length <= 0
      ) {
        const nextDisplayTotals = publishDisplayTotalsIfAllowed(state);

        if (nextDisplayTotals === state.displayTotals) {
          return state;
        }

        return {
          ...state,
          displayTotals: nextDisplayTotals,
          updatedAt: now(),
        };
      }

      const nextState: AutoCombatRealtimeState = {
        ...state,

        eventQueue: [],

        queuedEventKeys: [],
        queuedGenericFingerprints: [],
        queuedMobSpawnFingerprints: [],
        queuedPotionUsedFingerprints: [],

        updatedAt: now(),
      };

      return {
        ...nextState,
        displayTotals: publishDisplayTotalsIfAllowed(nextState),
      };
    }

    case 'CLEAR_SESSION_VISUAL_STATE': {
      return resetSessionVisualState(state);
    }

    case 'RESET': {
      return {
        ...initialAutoCombatRealtimeState,
        characterId: action.characterId ?? null,
        updatedAt: now(),
      };
    }

    default: {
      return state;
    }
  }
}
