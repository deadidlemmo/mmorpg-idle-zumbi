import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAutoCombatRealtimeState } from '../../auto-combat/realtime/useAutoCombatRealtime';
import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from '../../auto-combat/types/auto-combat.types';
import { getCharacterOverview } from '../api/dashboard.api';
import type {
  CharacterOverviewResponse,
  DashboardAutoCombatSessionViewModel,
  DashboardGatheringSessionViewModel,
} from '../types/dashboard.types';

interface DashboardActivityBarProps {
  characterId: string;
  refreshMs?: number;
}

type ActivityBarItem = {
  key: string;
  type: 'auto-combat' | 'gathering';
  icon: string;
  title: string;
  description: string;
  progressLabel: string;
  progressPercent: number;
  primaryMetric: string;
  secondaryMetric: string;
  href: string;
};

type MobHpSnapshot = {
  currentHp: number | null;
  maxHp: number | null;
  percent: number;
  hasHpData: boolean;
};

type AutoCombatTotalsSnapshot = {
  sessionId?: string | null;

  currentCombatIndex?: number | null;
  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;
};

type AutoCombatStatusCurrentMobLike = {
  id?: string | null;
  name?: string | null;
  currentHp?: number | null;
  maxHp?: number | null;
  hp?: number | null;
  hpPercent?: number | null;
};

type AutoCombatStatusWithMobSnapshots = AutoCombatStatusResponse & {
  currentMob?: AutoCombatStatusCurrentMobLike | null;
  mob?: AutoCombatStatusCurrentMobLike | null;
  lastKnownMob?: AutoCombatStatusCurrentMobLike | null;
  sessionSummary?: AutoCombatStatusResponse['sessionSummary'] & {
    currentMob?: AutoCombatStatusCurrentMobLike | null;
    lastKnownMob?: AutoCombatStatusCurrentMobLike | null;
  };
};

type AutoCombatSessionLike = {
  id?: string | null;
  status?: string | null;

  currentMobHp?: number | null;
  currentMobMaxHp?: number | null;
  currentRound?: number | null;
  currentCombatIndex?: number | null;

  totalCombatsResolved?: number | null;
  totalRoundsResolved?: number | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;

  totalPotionsUsed?: number | null;
  potionsUsed?: number | null;
};

type AutoCombatRealtimeVisualLike = {
  lastMessage?: string | null;
  lastDamage?: number | null;
  lastEventType?: string | null;
  actor?: string | null;
  target?: string | null;
  isCritical?: boolean | null;
  isDodged?: boolean | null;
  updatedAt?: number | null;
};

type AutoCombatRealtimeCombatLike = {
  sessionId?: string | null;

  mobId?: string | null;
  mobName?: string | null;
  mobCurrentHp?: number | null;
  mobMaxHp?: number | null;
  mobHpPercent?: number | null;

  currentMob?: AutoCombatStatusCurrentMobLike | null;

  round?: number | null;
  combatIndex?: number | null;

  lastMessage?: string | null;
  message?: string | null;
};

type AutoCombatRealtimeStateLoose = {
  status?: AutoCombatStatusResponse | null;
  autoCombatStatus?: AutoCombatStatusResponse | null;

  activeSession?: AutoCombatSessionLike | null;
  session?: AutoCombatSessionLike | null;

  mob?: AutoCombatStatusCurrentMobLike | null;
  visual?: AutoCombatRealtimeVisualLike | null;

  combat?: AutoCombatRealtimeCombatLike | null;
  realtimeCombat?: AutoCombatRealtimeCombatLike | null;

  /**
   * totals = estado real/canônico vindo do backend.
   * displayTotals = estado visual liberado para o jogador.
   *
   * A ActivityBar deve preferir displayTotals para não mostrar abate/XP antes
   * da animação/log terminar.
   */
  displayTotals?: AutoCombatTotalsSnapshot | null;
  sessionTotals?: AutoCombatTotalsSnapshot | null;
  totals?: AutoCombatTotalsSnapshot | null;
  realtimeSessionTotals?: AutoCombatTotalsSnapshot | null;

  activeEvent?: AutoCombatRealtimeEvent | null;
  displayedEvent?: AutoCombatRealtimeEvent | null;
  displayedAutoCombatEvent?: AutoCombatRealtimeEvent | null;
  currentEvent?: AutoCombatRealtimeEvent | null;
  lastProcessedEvent?: AutoCombatRealtimeEvent | null;
  lastEvent?: AutoCombatRealtimeEvent | null;

  eventQueue?: AutoCombatRealtimeEvent[];
  queue?: AutoCombatRealtimeEvent[];
  realtimeEventQueue?: AutoCombatRealtimeEvent[];
  battleLogEvents?: AutoCombatRealtimeEvent[];

  isActive?: boolean;
  hasActiveAutoCombat?: boolean;
  hasActiveSession?: boolean;

  isConnected?: boolean;
  isJoined?: boolean;
};

const SYNCING_AUTO_COMBAT_TITLE = 'Sincronizando combate...';

function toSafeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getFirstValidNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = getOptionalNumber(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function clampPercent(value: unknown) {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(100, parsed));
}

function calculateHpPercent(currentHp?: number | null, maxHp?: number | null) {
  const safeMaxHp = toSafeNumber(maxHp, 0);

  if (safeMaxHp <= 0) {
    return 0;
  }

  const safeCurrentHp = Math.max(
    0,
    Math.min(toSafeNumber(currentHp, 0), safeMaxHp),
  );

  return clampPercent((safeCurrentHp / safeMaxHp) * 100);
}

function normalizeStatus(status?: string | null) {
  return String(status ?? '').trim().toUpperCase();
}

function isActiveStatus(status?: string | null) {
  return normalizeStatus(status) === 'ACTIVE';
}

function isTerminalStatus(status?: string | null) {
  const normalizedStatus = normalizeStatus(status);

  return (
    normalizedStatus === 'FINISHED' ||
    normalizedStatus === 'STOPPED' ||
    normalizedStatus === 'DEFEATED' ||
    normalizedStatus === 'FAILED' ||
    normalizedStatus === 'CANCELLED'
  );
}

function normalizeRealtimeEventType(event?: AutoCombatRealtimeEvent | null) {
  return String(event?.type ?? '').trim().toUpperCase();
}

function isMobDefeatedEvent(event?: AutoCombatRealtimeEvent | null) {
  return normalizeRealtimeEventType(event) === 'MOB_DEFEATED';
}

function isSyncingAutoCombatTitle(title: string) {
  return title === SYNCING_AUTO_COMBAT_TITLE || title === 'Combate automático';
}

function getReadableMobName(...names: Array<string | null | undefined>) {
  for (const name of names) {
    const normalizedName = String(name ?? '').trim();

    if (
      normalizedName &&
      normalizedName !== 'Combate automático' &&
      normalizedName !== SYNCING_AUTO_COMBAT_TITLE
    ) {
      return normalizedName;
    }
  }

  return '';
}

function getStatusCurrentMobSnapshot(
  status: AutoCombatStatusResponse | null,
): AutoCombatStatusCurrentMobLike | null {
  if (!status) return null;

  const looseStatus = status as AutoCombatStatusWithMobSnapshots;

  return (
    looseStatus.currentMob ??
    looseStatus.mob ??
    looseStatus.sessionSummary?.currentMob ??
    looseStatus.lastKnownMob ??
    looseStatus.sessionSummary?.lastKnownMob ??
    null
  );
}

function formatOrigin(origin?: string | null) {
  if (!origin) return 'Expedição';

  const labels: Record<string, string> = {
    DESMANCHE: 'Desmanche',
    COLETA: 'Coleta',
    PATRULHA: 'Patrulha',
    ARSENAL: 'Arsenal',
    TECNOVARREDURA: 'Tecnovarredura',
    CONTENCAO: 'Contenção',
    CONTENÇÃO: 'Contenção',
    DROP_MOBS: 'Saque de monstros',
  };

  return labels[origin] ?? origin;
}

function formatKillCount(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  return `${amount} ${amount === 1 ? 'abate' : 'abates'}`;
}

function formatXp(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  return `${amount} XP`;
}

function formatHpLabel(currentHp?: number | null, maxHp?: number | null) {
  const safeCurrentHp = getFirstValidNumber(currentHp);
  const safeMaxHp = getFirstValidNumber(maxHp);

  if (safeCurrentHp === undefined || safeMaxHp === undefined || safeMaxHp <= 0) {
    return 'HP do infectado';
  }

  return `HP ${Math.max(0, Math.floor(safeCurrentHp))}/${Math.max(
    1,
    Math.floor(safeMaxHp),
  )}`;
}

function getAutoCombatSessionFromStatus(status: AutoCombatStatusResponse | null) {
  return (
    status?.session ??
    status?.activeSession ??
    status?.autoCombatSession ??
    status?.lastSession ??
    null
  );
}

function isSameSessionScope(
  currentSessionId?: string | null,
  candidateSessionId?: string | null,
) {
  if (!currentSessionId) {
    return true;
  }

  return Boolean(candidateSessionId && candidateSessionId === currentSessionId);
}

function filterRealtimeEventBySession(
  event: AutoCombatRealtimeEvent | null,
  sessionId?: string | null,
) {
  if (!event) return null;

  return isSameSessionScope(sessionId, event.sessionId) ? event : null;
}

function filterRealtimeCombatBySession(
  realtimeCombat: AutoCombatRealtimeCombatLike | null,
  sessionId?: string | null,
) {
  if (!realtimeCombat) return null;

  return isSameSessionScope(sessionId, realtimeCombat.sessionId)
    ? realtimeCombat
    : null;
}

function filterTotalsBySession(
  totals: AutoCombatTotalsSnapshot | null,
  sessionId?: string | null,
) {
  if (!totals) return null;

  return isSameSessionScope(sessionId, totals.sessionId) ? totals : null;
}

function shouldUseRealtimeEvent(
  characterId: string,
  event: AutoCombatRealtimeEvent | null,
) {
  if (!event) return false;

  return !event.characterId || event.characterId === characterId;
}

function hasPendingVisualEvents(realtimeState: AutoCombatRealtimeStateLoose) {
  return Boolean(
    realtimeState.activeEvent ||
      realtimeState.displayedEvent ||
      realtimeState.displayedAutoCombatEvent ||
      realtimeState.currentEvent ||
      (realtimeState.eventQueue?.length ?? 0) > 0 ||
      (realtimeState.queue?.length ?? 0) > 0 ||
      (realtimeState.realtimeEventQueue?.length ?? 0) > 0,
  );
}

function hasStartedVisualTimeline(realtimeState: AutoCombatRealtimeStateLoose) {
  return Boolean(
    realtimeState.activeEvent ||
      realtimeState.displayedEvent ||
      realtimeState.displayedAutoCombatEvent ||
      realtimeState.currentEvent ||
      realtimeState.lastProcessedEvent ||
      realtimeState.lastEvent ||
      (realtimeState.battleLogEvents?.length ?? 0) > 0 ||
      (realtimeState.eventQueue?.length ?? 0) > 0 ||
      (realtimeState.queue?.length ?? 0) > 0 ||
      (realtimeState.realtimeEventQueue?.length ?? 0) > 0,
  );
}

function hasReleasedTotals(totals?: AutoCombatTotalsSnapshot | null) {
  if (!totals) return false;

  return (
    toSafeNumber(totals.totalKills, 0) > 0 ||
    toSafeNumber(totals.totalXpGained, 0) > 0 ||
    toSafeNumber(totals.totalLoot, 0) > 0 ||
    toSafeNumber(totals.potionsUsed, 0) > 0 ||
    toSafeNumber(totals.totalCombats, 0) > 0 ||
    toSafeNumber(totals.totalRounds, 0) > 0
  );
}

function normalizeTotalsForSession(
  totals: AutoCombatTotalsSnapshot | null,
  session?: AutoCombatSessionLike | null,
): AutoCombatTotalsSnapshot | null {
  if (!totals && !session) return null;

  const sessionId = session?.id ?? totals?.sessionId ?? null;
  const resolvedCombats = getOptionalNumber(session?.totalCombatsResolved);

  /**
   * Blindagem:
   * Se o backend ainda diz 0 combates resolvidos, mas o reducer já liberou
   * displayTotals por evento visual, a ActivityBar deve respeitar o displayTotals.
   */
  if (
    resolvedCombats !== undefined &&
    resolvedCombats <= 0 &&
    !hasReleasedTotals(totals)
  ) {
    return {
      sessionId,
      currentCombatIndex: 1,
      totalCombats: 0,
      totalRounds: 0,
      totalKills: 0,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    };
  }

  const totalCombats = Math.max(
    0,
    Math.floor(
      getFirstValidNumber(
        totals?.totalCombats,
        totals?.totalKills,
        session?.totalCombatsResolved,
        session?.totalCombats,
        0,
      ) ?? 0,
    ),
  );

  const totalKills = Math.max(
    0,
    Math.floor(
      getFirstValidNumber(
        totals?.totalKills,
        totals?.totalCombats,
        session?.totalCombatsResolved,
        session?.totalKills,
        totalCombats,
        0,
      ) ?? 0,
    ),
  );

  const currentCombatIndex = Math.max(
    1,
    Math.floor(
      getFirstValidNumber(
        totals?.currentCombatIndex,
        session?.currentCombatIndex,
        totalKills + 1,
        1,
      ) ?? 1,
    ),
  );

  return {
    sessionId,
    currentCombatIndex,
    totalCombats,
    totalRounds: Math.max(
      0,
      Math.floor(
        getFirstValidNumber(
          totals?.totalRounds,
          session?.totalRoundsResolved,
          session?.totalRounds,
          0,
        ) ?? 0,
      ),
    ),
    totalKills,
    totalXpGained: Math.max(
      0,
      Math.floor(
        getFirstValidNumber(totals?.totalXpGained, session?.totalXpGained, 0) ??
          0,
      ),
    ),
    totalLoot: Math.max(
      0,
      Math.floor(
        getFirstValidNumber(totals?.totalLoot, session?.totalLoot, 0) ?? 0,
      ),
    ),
    potionsUsed: Math.max(
      0,
      Math.floor(
        getFirstValidNumber(
          totals?.potionsUsed,
          session?.totalPotionsUsed,
          session?.potionsUsed,
          0,
        ) ?? 0,
      ),
    ),
  };
}

function buildZeroStartTotals(session?: AutoCombatSessionLike | null) {
  return normalizeTotalsForSession(
    {
      sessionId: session?.id ?? null,
      currentCombatIndex: 1,
      totalCombats: 0,
      totalRounds: 0,
      totalKills: 0,
      totalXpGained: 0,
      totalLoot: 0,
      potionsUsed: 0,
    },
    session,
  );
}

function buildMobHpSnapshot(params: {
  displayedEvent?: AutoCombatRealtimeEvent | null;
  realtimeCombat?: AutoCombatRealtimeCombatLike | null;
  statusCurrentMob?: AutoCombatStatusCurrentMobLike | null;
  session?: AutoCombatSessionLike | null;
  fallbackPercent?: number | null;
}): MobHpSnapshot {
  const {
    displayedEvent,
    realtimeCombat,
    statusCurrentMob,
    session,
    fallbackPercent,
  } = params;

  if (isMobDefeatedEvent(displayedEvent)) {
    const maxHp = getFirstValidNumber(
      displayedEvent?.mobMaxHp,
      realtimeCombat?.mobMaxHp,
      statusCurrentMob?.maxHp,
      session?.currentMobMaxHp,
      statusCurrentMob?.hp,
    );

    return {
      currentHp: 0,
      maxHp: maxHp ?? null,
      percent: 0,
      hasHpData: true,
    };
  }

  const currentHp = getFirstValidNumber(
    displayedEvent?.mobCurrentHp,
    realtimeCombat?.mobCurrentHp,
    statusCurrentMob?.currentHp,
    session?.currentMobHp,
  );

  const maxHp = getFirstValidNumber(
    displayedEvent?.mobMaxHp,
    realtimeCombat?.mobMaxHp,
    statusCurrentMob?.maxHp,
    session?.currentMobMaxHp,
    statusCurrentMob?.hp,
  );

  if (currentHp !== undefined && maxHp !== undefined && maxHp > 0) {
    return {
      currentHp,
      maxHp,
      percent: calculateHpPercent(currentHp, maxHp),
      hasHpData: true,
    };
  }

  const percent = getFirstValidNumber(
    displayedEvent?.mobHpPercent,
    realtimeCombat?.mobHpPercent,
    statusCurrentMob?.hpPercent,
    fallbackPercent,
  );

  if (percent !== undefined) {
    return {
      currentHp: currentHp ?? null,
      maxHp: maxHp ?? null,
      percent: clampPercent(percent),
      hasHpData: true,
    };
  }

  return {
    currentHp: currentHp ?? null,
    maxHp: maxHp ?? null,
    percent: 100,
    hasHpData: false,
  };
}

function getRealtimeStatus(state: AutoCombatRealtimeStateLoose) {
  return state.status ?? state.autoCombatStatus ?? null;
}

function getRealtimeSession(
  state: AutoCombatRealtimeStateLoose,
  status: AutoCombatStatusResponse | null,
): AutoCombatSessionLike | null {
  return (
    state.activeSession ??
    state.session ??
    getAutoCombatSessionFromStatus(status) ??
    null
  );
}

function getRealtimeCombat(
  state: AutoCombatRealtimeStateLoose,
): AutoCombatRealtimeCombatLike | null {
  if (state.combat || state.realtimeCombat) {
    return state.combat ?? state.realtimeCombat ?? null;
  }

  const mob = state.mob ?? null;
  const visual = state.visual ?? null;
  const status = getRealtimeStatus(state);
  const session = getRealtimeSession(state, status);

  if (!mob && !visual && !session) {
    return null;
  }

  return {
    sessionId: session?.id ?? null,

    mobId: mob?.id ?? null,
    mobName: mob?.name ?? null,
    mobCurrentHp: mob?.currentHp ?? session?.currentMobHp ?? null,
    mobMaxHp: mob?.maxHp ?? session?.currentMobMaxHp ?? mob?.hp ?? null,
    mobHpPercent: mob?.hpPercent ?? null,

    round: session?.currentRound ?? null,
    combatIndex: session?.currentCombatIndex ?? null,

    lastMessage: visual?.lastMessage ?? null,
    message: visual?.lastMessage ?? null,
  };
}

function getRealtimeDisplayedEvent(
  state: AutoCombatRealtimeStateLoose,
  characterId: string,
  sessionId?: string | null,
) {
  const directEvents = [
    state.activeEvent,
    state.displayedEvent,
    state.displayedAutoCombatEvent,
    state.currentEvent,
    state.lastProcessedEvent,
    state.lastEvent,
  ];

  for (const event of directEvents) {
    if (
      event &&
      shouldUseRealtimeEvent(characterId, event) &&
      isSameSessionScope(sessionId, event.sessionId)
    ) {
      return event;
    }
  }

  const logEvents = state.battleLogEvents ?? [];

  for (const event of logEvents) {
    if (
      event &&
      shouldUseRealtimeEvent(characterId, event) &&
      isSameSessionScope(sessionId, event.sessionId)
    ) {
      return event;
    }
  }

  return null;
}

function buildTotalsFromStatusFallback(params: {
  status: AutoCombatStatusResponse | null;
  session: AutoCombatSessionLike | null;
}): AutoCombatTotalsSnapshot | null {
  const { status, session } = params;

  if (!status && !session) {
    return null;
  }

  const sessionId = session?.id ?? null;
  const resolvedCombats = getOptionalNumber(session?.totalCombatsResolved);

  if (resolvedCombats !== undefined && resolvedCombats <= 0) {
    return buildZeroStartTotals(session);
  }

  const rewardsKillsTotal = status?.rewards?.mobs?.reduce((total, mob) => {
    return total + toSafeNumber(mob.kills, 0);
  }, 0);

  const rewardsLootTotal = status?.rewards?.loots?.reduce((total, loot) => {
    return total + toSafeNumber(loot.quantity, 0);
  }, 0);

  const totalKills =
    getFirstValidNumber(
      session?.totalCombatsResolved,
      status?.sessionSummary?.mobs?.totalKills,
      session?.totalKills,
      rewardsKillsTotal,
      0,
    ) ?? 0;

  const totalCombats =
    getFirstValidNumber(
      session?.totalCombatsResolved,
      status?.sessionSummary?.combat?.totalCombats,
      session?.totalCombats,
      totalKills,
      0,
    ) ?? 0;

  const totalRounds =
    getFirstValidNumber(
      session?.totalRoundsResolved,
      status?.sessionSummary?.combat?.totalRounds,
      session?.totalRounds,
      0,
    ) ?? 0;

  const totalXpGained =
    getFirstValidNumber(
      session?.totalXpGained,
      status?.sessionSummary?.progression?.totalXpGained,
      0,
    ) ?? 0;

  const totalLoot =
    getFirstValidNumber(
      status?.sessionSummary?.loot?.totalQuantity,
      session?.totalLoot,
      rewardsLootTotal,
      0,
    ) ?? 0;

  const potionsUsed =
    getFirstValidNumber(
      session?.totalPotionsUsed,
      status?.sessionSummary?.potions?.used,
      session?.potionsUsed,
      0,
    ) ?? 0;

  return normalizeTotalsForSession(
    {
      sessionId,
      currentCombatIndex:
        getFirstValidNumber(session?.currentCombatIndex, totalKills + 1, 1) ?? 1,
      totalCombats,
      totalRounds,
      totalKills,
      totalXpGained,
      totalLoot,
      potionsUsed,
    },
    session,
  );
}

function getVisualTotalsForRealtime(params: {
  realtimeState: AutoCombatRealtimeStateLoose;
  status: AutoCombatStatusResponse | null;
  session: AutoCombatSessionLike | null;
}): AutoCombatTotalsSnapshot | null {
  const { realtimeState, status, session } = params;
  const sessionId = session?.id ?? null;

  const displayTotals = normalizeTotalsForSession(
    filterTotalsBySession(realtimeState.displayTotals ?? null, sessionId),
    session,
  );

  if (displayTotals) {
    return displayTotals;
  }

  /**
   * Se a timeline visual já começou, mas ainda não houve um evento liberador
   * de totais, mantemos 0 visualmente.
   *
   * Depois que o reducer liberar displayTotals via MOB_DEFEATED/POTION_USED,
   * a ActivityBar passa a mostrar os números imediatamente.
   */
  if (
    hasPendingVisualEvents(realtimeState) ||
    hasStartedVisualTimeline(realtimeState)
  ) {
    return buildZeroStartTotals(session);
  }

  const legacyVisualTotals = normalizeTotalsForSession(
    filterTotalsBySession(
      realtimeState.sessionTotals ?? realtimeState.realtimeSessionTotals ?? null,
      sessionId,
    ),
    session,
  );

  if (legacyVisualTotals) {
    return legacyVisualTotals;
  }

  const canonicalRealtimeTotals = normalizeTotalsForSession(
    filterTotalsBySession(realtimeState.totals ?? null, sessionId),
    session,
  );

  if (canonicalRealtimeTotals) {
    return canonicalRealtimeTotals;
  }

  return buildTotalsFromStatusFallback({ status, session });
}

function buildAutoCombatTotalsFromOverview(
  session: DashboardAutoCombatSessionViewModel | null | undefined,
): AutoCombatTotalsSnapshot | null {
  if (!session) {
    return null;
  }

  const looseSession = session as DashboardAutoCombatSessionViewModel &
    AutoCombatSessionLike & {
      id?: string | null;
      totalKills?: number | null;
      totalLoot?: number | null;
      combatPreview?: {
        totals?: {
          combatsResolved?: number | null;
          roundsResolved?: number | null;
          xpGained?: number | null;
        } | null;
      } | null;
    };

  const resolvedCombats = getOptionalNumber(looseSession.totalCombatsResolved);

  if (resolvedCombats !== undefined && resolvedCombats <= 0) {
    return buildZeroStartTotals(looseSession);
  }

  const totalKills =
    getFirstValidNumber(
      looseSession.totalCombatsResolved,
      looseSession.totalKills,
      looseSession.combatPreview?.totals?.combatsResolved,
      0,
    ) ?? 0;

  const totalCombats =
    getFirstValidNumber(
      looseSession.totalCombatsResolved,
      looseSession.totalCombats,
      looseSession.combatPreview?.totals?.combatsResolved,
      totalKills,
      0,
    ) ?? 0;

  const totalRounds =
    getFirstValidNumber(
      looseSession.totalRoundsResolved,
      looseSession.totalRounds,
      looseSession.combatPreview?.totals?.roundsResolved,
      0,
    ) ?? 0;

  const totalXpGained =
    getFirstValidNumber(
      looseSession.totalXpGained,
      looseSession.combatPreview?.totals?.xpGained,
      0,
    ) ?? 0;

  const totalLoot = getFirstValidNumber(looseSession.totalLoot, 0) ?? 0;

  const potionsUsed =
    getFirstValidNumber(
      looseSession.totalPotionsUsed,
      looseSession.potionsUsed,
      0,
    ) ?? 0;

  return normalizeTotalsForSession(
    {
      sessionId: looseSession.id ?? null,
      currentCombatIndex:
        getFirstValidNumber(
          looseSession.currentCombatIndex,
          Math.max(0, Math.floor(totalKills)) + 1,
          1,
        ) ?? 1,
      totalCombats,
      totalRounds,
      totalKills,
      totalXpGained,
      totalLoot,
      potionsUsed,
    },
    looseSession,
  );
}

function buildAutoCombatItemFromRealtime(params: {
  characterId: string;
  realtimeState: AutoCombatRealtimeStateLoose;
}): ActivityBarItem | null {
  const { characterId, realtimeState } = params;

  const status = getRealtimeStatus(realtimeState);
  const session = getRealtimeSession(realtimeState, status);

  if (!session) {
    return null;
  }

  const sessionIsActive = isActiveStatus(session.status);
  const sessionIsTerminal = isTerminalStatus(session.status);

  const hasActiveAutoCombat =
    sessionIsActive ||
    (!sessionIsTerminal &&
      (Boolean(realtimeState.isActive) ||
        Boolean(realtimeState.hasActiveAutoCombat) ||
        Boolean(realtimeState.hasActiveSession) ||
        Boolean(status?.active) ||
        Boolean(status?.hasActiveAutoCombat)));

  if (!hasActiveAutoCombat || sessionIsTerminal) {
    return null;
  }

  const sessionId = session.id ?? null;

  const visualTotals = getVisualTotalsForRealtime({
    realtimeState,
    status,
    session,
  });

  const rawRealtimeCombat = getRealtimeCombat(realtimeState);
  const rawDisplayedEvent = getRealtimeDisplayedEvent(
    realtimeState,
    characterId,
    sessionId,
  );

  const displayedEvent = filterRealtimeEventBySession(
    rawDisplayedEvent,
    sessionId,
  );

  const realtimeCombat = filterRealtimeCombatBySession(
    rawRealtimeCombat,
    sessionId,
  );

  const statusCurrentMob =
    getStatusCurrentMobSnapshot(status) ??
    realtimeCombat?.currentMob ??
    realtimeState.mob ??
    null;

  const subMapName = status?.subMap?.name;
  const mapName = status?.subMap?.map?.name ?? status?.subMap?.mapName;

  const locationLabel =
    mapName && subMapName
      ? `${mapName} • ${subMapName}`
      : subMapName ?? mapName ?? 'Combate em andamento';

  const mobHp = buildMobHpSnapshot({
    displayedEvent,
    realtimeCombat,
    statusCurrentMob,
    session,
  });

  const mobName =
    getReadableMobName(
      displayedEvent?.mobName,
      realtimeCombat?.mobName,
      statusCurrentMob?.name,
      realtimeState.mob?.name,
    ) || SYNCING_AUTO_COMBAT_TITLE;

  const totalKills = Math.max(
    0,
    Math.floor(toSafeNumber(visualTotals?.totalKills, 0)),
  );

  const totalXpGained = Math.max(
    0,
    Math.floor(toSafeNumber(visualTotals?.totalXpGained, 0)),
  );

  const description =
    displayedEvent?.message ??
    realtimeCombat?.lastMessage ??
    realtimeCombat?.message ??
    status?.message ??
    locationLabel;

  return {
    key: `auto-combat-${session.id ?? 'active'}`,
    type: 'auto-combat',
    icon: '⚔',
    title: mobName,
    description,
    progressLabel: formatHpLabel(mobHp.currentHp, mobHp.maxHp),
    progressPercent: mobHp.percent,
    primaryMetric: formatKillCount(totalKills),
    secondaryMetric: formatXp(totalXpGained),
    href: `/dashboard/${characterId}/auto-combat`,
  };
}

function buildAutoCombatItemFromOverview(params: {
  characterId: string;
  session: DashboardAutoCombatSessionViewModel;
}): ActivityBarItem {
  const { characterId } = params;

  const session = params.session as DashboardAutoCombatSessionViewModel &
    AutoCombatSessionLike & {
      id?: string;
      status?: string | null;

      currentMob?: AutoCombatStatusCurrentMobLike | null;
      lastKnownMob?: AutoCombatStatusCurrentMobLike | null;

      subMap?: {
        name?: string | null;
        map?: {
          name?: string | null;
        } | null;
        mapName?: string | null;
      } | null;

      combatPreview?: {
        label?: string | null;
        currentMob?: AutoCombatStatusCurrentMobLike | null;
        lastKnownMob?: AutoCombatStatusCurrentMobLike | null;
        currentMobHp?: number | null;
        currentMobMaxHp?: number | null;
        totals?: {
          combatsResolved?: number | null;
          roundsResolved?: number | null;
          xpGained?: number | null;
        } | null;
      } | null;
    };

  const visualTotals = buildAutoCombatTotalsFromOverview(session);
  const previewCurrentMob = session.combatPreview?.currentMob;
  const currentMob =
    session.currentMob ??
    previewCurrentMob ??
    session.lastKnownMob ??
    session.combatPreview?.lastKnownMob ??
    null;

  const mobHp = buildMobHpSnapshot({
    statusCurrentMob: currentMob,
    session: {
      id: session.id,
      status: session.status,
      currentCombatIndex: session.currentCombatIndex,
      currentMobHp:
        session.currentMobHp ?? session.combatPreview?.currentMobHp ?? null,
      currentMobMaxHp:
        session.currentMobMaxHp ??
        session.combatPreview?.currentMobMaxHp ??
        null,
    },
  });

  const subMapName = session.subMap?.name;
  const mapName = session.subMap?.map?.name ?? session.subMap?.mapName;

  const locationLabel =
    mapName && subMapName
      ? `${mapName} • ${subMapName}`
      : subMapName ?? mapName ?? 'Combate em andamento';

  const totalKills = Math.max(
    0,
    Math.floor(toSafeNumber(visualTotals?.totalKills, 0)),
  );

  const totalXpGained = Math.max(
    0,
    Math.floor(toSafeNumber(visualTotals?.totalXpGained, 0)),
  );

  return {
    key: `auto-combat-${session.id ?? 'active'}`,
    type: 'auto-combat',
    icon: '⚔',
    title: getReadableMobName(currentMob?.name) || SYNCING_AUTO_COMBAT_TITLE,
    description: session.combatPreview?.label ?? locationLabel,
    progressLabel: formatHpLabel(mobHp.currentHp, mobHp.maxHp),
    progressPercent: mobHp.percent,
    primaryMetric: formatKillCount(totalKills),
    secondaryMetric: formatXp(totalXpGained),
    href: `/dashboard/${characterId}/auto-combat`,
  };
}

function buildGatheringItem(params: {
  characterId: string;
  session: DashboardGatheringSessionViewModel;
}): ActivityBarItem {
  const { characterId, session } = params;

  const productionPreview = session.productionPreview;

  const progressPercent = clampPercent(
    productionPreview?.nextUnitProgressPercent ?? 0,
  );

  const originLabel = formatOrigin(session.origin);

  const materialName =
    session.targetMaterial?.name ??
    productionPreview?.material?.name ??
    'material';

  const mapName =
    session.map?.name ?? productionPreview?.map?.name ?? 'Mapa atual';

  const estimatedQuantity = productionPreview?.estimatedQuantityToCollect ?? 0;
  const ratePerHour = productionPreview?.ratePerHour;

  return {
    key: `gathering-${session.id}`,
    type: 'gathering',
    icon: '⛏',
    title: originLabel,
    description:
      productionPreview?.label ??
      `${originLabel} em ${mapName} coletando ${materialName}.`,
    progressLabel: 'Próximo material',
    progressPercent,
    primaryMetric: `${Math.round(progressPercent)}%`,
    secondaryMetric:
      ratePerHour !== undefined
        ? `${estimatedQuantity} item(ns) • ${ratePerHour}/h`
        : `${estimatedQuantity} item(ns)`,
    href: `/dashboard/${characterId}/gathering`,
  };
}

function buildActivityItems(params: {
  characterId: string;
  overview: CharacterOverviewResponse | null;
  realtimeState: AutoCombatRealtimeStateLoose;
}) {
  const { characterId, overview, realtimeState } = params;

  const items: ActivityBarItem[] = [];

  const realtimeAutoCombatItem = buildAutoCombatItemFromRealtime({
    characterId,
    realtimeState,
  });

  if (realtimeAutoCombatItem) {
    items.push(realtimeAutoCombatItem);
  } else if (overview?.activity) {
    const activeAutoCombat = overview.activity.activeAutoCombatSession ?? null;

    const activeAutoCombatIsActive = isActiveStatus(activeAutoCombat?.status);
    const activeAutoCombatIsTerminal = isTerminalStatus(
      activeAutoCombat?.status,
    );

    const hasActiveAutoCombat =
      activeAutoCombatIsActive ||
      (Boolean(overview.activity.hasActiveAutoCombat) &&
        !activeAutoCombatIsTerminal);

    if (hasActiveAutoCombat && activeAutoCombat && !activeAutoCombatIsTerminal) {
      items.push(
        buildAutoCombatItemFromOverview({
          characterId,
          session: activeAutoCombat,
        }),
      );
    }
  }

  if (overview?.activity) {
    const activeGathering = overview.activity.activeGatheringSession ?? null;

    const activeGatheringIsTerminal = isTerminalStatus(activeGathering?.status);

    const hasActiveGathering =
      !activeGatheringIsTerminal &&
      (Boolean(overview.activity.hasActiveGathering) ||
        isActiveStatus(activeGathering?.status));

    if (hasActiveGathering && activeGathering) {
      items.push(
        buildGatheringItem({
          characterId,
          session: activeGathering,
        }),
      );
    }
  }

  return items;
}

export function DashboardActivityBar({
  characterId,
  refreshMs = 10000,
}: DashboardActivityBarProps) {
  const realtimeState =
    useAutoCombatRealtimeState() as AutoCombatRealtimeStateLoose;

  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const lastKnownAutoCombatTitleByKeyRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!characterId) return;

    let isDisposed = false;
    let intervalId: number | undefined;

    setOverview(null);
    setHasLoadedOnce(false);

    async function loadActivity() {
      try {
        const data = await getCharacterOverview(characterId);

        if (isDisposed) return;

        setOverview(data);
        setHasLoadedOnce(true);
      } catch {
        if (isDisposed) return;

        setHasLoadedOnce(true);
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void loadActivity();
      }
    }

    void loadActivity();

    if (refreshMs > 0) {
      intervalId = window.setInterval(() => {
        void loadActivity();
      }, refreshMs);
    }

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      isDisposed = true;

      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }

      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [characterId, refreshMs]);

  const activityItems = useMemo(() => {
    const items = buildActivityItems({
      characterId,
      overview,
      realtimeState,
    });

    /**
     * Polimento visual:
     * se o navegador ficou em segundo plano e voltou antes do primeiro snapshot
     * trazer o mob atual, mantemos o último nome conhecido da sessão.
     *
     * Assim a UI evita piscar "Combate automático" / "Sincronizando combate..."
     * quando já havia um mob conhecido anteriormente.
     */
    return items.map((item) => {
      if (item.type !== 'auto-combat') {
        return item;
      }

      const lastKnownTitle = lastKnownAutoCombatTitleByKeyRef.current[item.key];

      if (isSyncingAutoCombatTitle(item.title) && lastKnownTitle) {
        return {
          ...item,
          title: lastKnownTitle,
        };
      }

      return item;
    });
  }, [characterId, overview, realtimeState]);

  useEffect(() => {
    for (const item of activityItems) {
      if (item.type !== 'auto-combat') {
        continue;
      }

      if (!isSyncingAutoCombatTitle(item.title)) {
        lastKnownAutoCombatTitleByKeyRef.current[item.key] = item.title;
      }
    }
  }, [activityItems]);

  if (!hasLoadedOnce || activityItems.length <= 0) {
    return null;
  }

  return (
    <section
      className={[
        'dashboard-activity-bar',
        activityItems.length > 1 ? 'dashboard-activity-bar--multiple' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Atividades em andamento"
    >
      {activityItems.map((item) => {
        const progressStyle = {
          width: `${item.progressPercent}%`,
        };

        return (
          <Link
            key={item.key}
            to={item.href}
            title={item.description}
            className={[
              'dashboard-activity-bar__item',
              `dashboard-activity-bar__item--${item.type}`,
            ].join(' ')}
          >
            <span className="dashboard-activity-bar__icon" aria-hidden="true">
              {item.icon}
            </span>

            <div className="dashboard-activity-bar__body">
              <div className="dashboard-activity-bar__top">
                <strong>{item.title}</strong>

                <span>
                  {item.progressLabel} • {Math.round(item.progressPercent)}%
                </span>
              </div>

              <div className="dashboard-activity-bar__track">
                <i style={progressStyle} />
              </div>
            </div>

            <div className="dashboard-activity-bar__metrics">
              <strong>{item.primaryMetric}</strong>
              <span>{item.secondaryMetric}</span>
            </div>
          </Link>
        );
      })}
    </section>
  );
}