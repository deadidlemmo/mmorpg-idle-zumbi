import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { PremiumPlaceholderIcon } from "../../../components/PremiumPlaceholderIcon";
import {
  getCharacterOverview,
  updateCharacterCurrentMap,
} from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { DashboardTopBarActivityOverride } from "../../dashboard/components/DashboardTopBar";
import "../../dashboard/dashboard.css";
import type { CharacterOverviewResponse } from "../../dashboard/types/dashboard.types";
import {
  getAutoCombatMaps,
  getAutoCombatStatus,
} from "../api/auto-combat.api";
import {
  buildMapVisualStyle,
  getMapImageByName,
} from "../assets/auto-combat-map-assets";
import "../auto-combat-mob-images.css";
import "../auto-combat.css";
import { AutoCombatBattleLog } from "../components/AutoCombatBattleLog";
import { AutoCombatSessionSummary } from "../components/AutoCombatSessionSummary";
import { AutoCombatStatsTab } from "../components/AutoCombatStatsTab";
import { AutoCombatTabs } from "../components/AutoCombatTabs";
import { getRealtimeEventKey } from "../realtime/autoCombatRealtime.utils";
import {
  useAutoCombatRealtime,
  useAutoCombatRealtimeState,
} from "../realtime/useAutoCombatRealtime";
import type {
  AutoCombatRealtimeStateLoose,
  AutoCombatTab,
  CharacterPotionConfigWithItem,
  CharacterProgressSource,
  CharacterViewModelWithLayoutFields,
  CharacterWithSinglePotionConfig,
  PotionEquipmentItem,
  PotionInventoryOption,
  RealtimeCharacterProgressState,
  RealtimeCombatState,
  RealtimeSessionTotalsState,
} from "../types/auto-combat-page.types";
import type {
  AutoCombatEncounterViewModel,
  AutoCombatMapViewModel,
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
  AutoCombatTrackedMonsterViewModel,
  StartAutoCombatBattlePayload,
} from "../types/auto-combat.types";
import {
  buildCharacterViewModel,
  buildProgressFromSource,
  buildProgressFromStatus,
  buildSessionTotalsFromStatus,
  buildZeroRealtimeSessionTotals,
  clampNumber,
  clampPercent,
  formatPotionHeal,
  formatSeconds,
  formatSessionStatus,
  getActiveEncountersForMap,
  getApiErrorMessage,
  getCharacterInventoryRaw,
  getCharacterPotionConfigRaw,
  getGameMapMaxLevel,
  getGameMapMinLevel,
  getLatestKilledMob,
  getPotionDescription,
  getPotionEventKey,
  getPotionItem,
  getPotionName,
  getPotionQuantity,
  getRealtimeActions,
  getRealtimeActiveEvent,
  getRealtimeBattleLogEvents,
  getRealtimeCombat,
  getRealtimeProgress,
  getRealtimeQueueLength,
  getRealtimeSession,
  getRealtimeStatus,
  getRealtimeTotals,
  getRemainingSeconds,
  getSessionFromStatus,
  getThreatWeightPercent,
  getVisibleCombatMaps,
  isDamageRealtimeEvent,
  isSessionActive,
  isTerminalSessionStatus,
  mergeProgressKeepingHighestXp,
  normalizePotionConfigResponse,
  normalizePotionInventoryResponse,
  normalizeRealtimeEventType,
  normalizeSessionXpBreakdown,
  pickHighestProgress,
  resolveCharacterStats,
  resolvePotionEventItemId,
  resolvePotionQuantityAfter,
  toSafeNumber,
  updateCharacterPotionConfigRaw,
} from "../utils/auto-combat-page.helpers";
import {
  getMobFullBodyImage,
  getMobPortraitImage,
  getMobProgressionSortRank,
} from "../utils/mobAssets";
import { selectVisibleCharacterProgress } from "../utils/visible-progress";

const SHOW_AUTO_COMBAT_BATTLE_LOG = false;
const XP_FEEDBACK_VISIBLE_MS = 4800;
const MAX_SHOWN_XP_FEEDBACK_KEYS = 80;

function preloadAutoCombatImage(imageUrl?: string | null) {
  if (!imageUrl || typeof window === "undefined") {
    return;
  }

  const image = new Image();

  image.decoding = "async";
  image.src = imageUrl;
}

function compareAutoCombatThreatsByProgression(
  first: AutoCombatEncounterViewModel,
  second: AutoCombatEncounterViewModel,
) {
  const firstMob = first.mob;
  const secondMob = second.mob;
  const firstRank = getMobProgressionSortRank(
    firstMob?.name,
    firstMob?.assetKey,
  );
  const secondRank = getMobProgressionSortRank(
    secondMob?.name,
    secondMob?.assetKey,
  );
  const tierDifference =
    toSafeNumber(firstMob?.tier, firstRank.tier) -
    toSafeNumber(secondMob?.tier, secondRank.tier);

  if (tierDifference !== 0) {
    return tierDifference;
  }

  if (firstRank.tier !== secondRank.tier) {
    return firstRank.tier - secondRank.tier;
  }

  if (
    firstRank.mob !== Number.MAX_SAFE_INTEGER &&
    secondRank.mob !== Number.MAX_SAFE_INTEGER &&
    firstRank.mob !== secondRank.mob
  ) {
    return firstRank.mob - secondRank.mob;
  }

  const levelDifference =
    toSafeNumber(firstMob?.level, firstRank.mob) -
    toSafeNumber(secondMob?.level, secondRank.mob);

  if (levelDifference !== 0) {
    return levelDifference;
  }

  return String(firstMob?.name ?? "").localeCompare(
    String(secondMob?.name ?? ""),
    "pt-BR",
    { sensitivity: "base" },
  );
}

function getAutoCombatTimestampMs(value: unknown) {
  if (value instanceof Date) {
    const timestamp = value.getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function hasAutoCombatTimerData(
  status: AutoCombatStatusResponse | null,
  expectedSessionId?: string | null,
) {
  const session = getSessionFromStatus(status);

  if (!status || !session) return false;

  if (expectedSessionId && session.id && session.id !== expectedSessionId) {
    return false;
  }

  const endsAtMs = getAutoCombatTimestampMs(
    session.endsAt ?? status.sessionSummary?.duration?.endsAt,
  );

  if (endsAtMs !== null) return true;

  return (
    (typeof session.remainingSeconds === "number" &&
      session.remainingSeconds > 0) ||
    (typeof status.sessionSummary?.duration?.remainingSeconds === "number" &&
      status.sessionSummary.duration.remainingSeconds > 0)
  );
}

function pickAutoCombatTimerStatus(params: {
  realtimeStatus: AutoCombatStatusResponse | null;
  restStatus: AutoCombatStatusResponse | null;
  sessionId?: string | null;
}) {
  if (hasAutoCombatTimerData(params.realtimeStatus, params.sessionId)) {
    return params.realtimeStatus;
  }

  if (hasAutoCombatTimerData(params.restStatus, params.sessionId)) {
    return params.restStatus;
  }

  return null;
}

function getHuntSequence(status: AutoCombatStatusResponse | null) {
  return toSafeNumber(
    status?.hunting?.huntSequence ??
      status?.hunting?.lastHuntEventSequence ??
      status?.huntBatch?.huntSequence,
    0,
  );
}

function getHuntFoundCount(status: AutoCombatStatusResponse | null) {
  return toSafeNumber(
    status?.hunting?.foundEnemiesCount ??
      status?.huntBatch?.foundEnemiesCount ??
      status?.session?.foundEnemiesCount,
    0,
  );
}

function pickAutoCombatEffectiveStatus(params: {
  realtimeStatus: AutoCombatStatusResponse | null;
  restStatus: AutoCombatStatusResponse | null;
}) {
  const { realtimeStatus, restStatus } = params;

  if (!realtimeStatus) return restStatus;
  if (!restStatus) return realtimeStatus;

  const realtimePhase = String(realtimeStatus.phase ?? "").toUpperCase();
  const restPhase = String(restStatus.phase ?? "").toUpperCase();

  if (realtimePhase === "HUNTING" && restPhase === "HUNTING") {
    const realtimeHuntSequence = getHuntSequence(realtimeStatus);
    const restHuntSequence = getHuntSequence(restStatus);

    if (restHuntSequence > realtimeHuntSequence) return restStatus;

    if (
      restHuntSequence === realtimeHuntSequence &&
      getHuntFoundCount(restStatus) > getHuntFoundCount(realtimeStatus)
    ) {
      return restStatus;
    }
  }

  return realtimeStatus;
}

type MobFeedbackScope = {
  sessionId: string | null;
  combatIndex: number | null;
  mobId: string | null;
  mobName: string | null;
};

function getRealtimeFeedbackTarget(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event?.type);
  const eventTarget = normalizeRealtimeEventType(event?.target);

  if (eventTarget === "PLAYER" || eventTarget === "MOB") {
    return eventTarget;
  }

  if (eventType === "PLAYER_HIT") {
    return "MOB";
  }

  if (eventType === "MOB_HIT") {
    return "PLAYER";
  }

  return null;
}

function getRealtimeFeedbackDamage(event?: AutoCombatRealtimeEvent | null) {
  if (!event || !isDamageRealtimeEvent(event.type) || event.isDodged) {
    return 0;
  }

  const damage = toSafeNumber(event.damage, 0);

  return damage > 0 ? damage : 0;
}

function isAutoCombatBattleVisualEvent(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event?.type);

  return (
    eventType === "MOB_SPAWNED" ||
    eventType === "PLAYER_HIT" ||
    eventType === "MOB_HIT" ||
    eventType === "DODGE" ||
    eventType === "POTION_USED" ||
    eventType === "AUTO_REST" ||
    eventType === "MOB_DEFEATED" ||
    eventType === "PLAYER_DEFEATED"
  );
}

function getOptionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Math.floor(Number(value));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeMobScopeText(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized || null;
}

function normalizeMobScopeNumber(value: unknown) {
  const parsed = getOptionalPositiveInteger(value);

  return parsed && parsed > 0 ? parsed : null;
}

function createMobFeedbackScope(
  params: Partial<MobFeedbackScope>,
): MobFeedbackScope {
  return {
    sessionId: normalizeMobScopeText(params.sessionId),
    combatIndex: normalizeMobScopeNumber(params.combatIndex),
    mobId: normalizeMobScopeText(params.mobId),
    mobName: normalizeMobScopeText(params.mobName),
  };
}

function getMobFeedbackScopeFromEvent(
  event?: AutoCombatRealtimeEvent | null,
): MobFeedbackScope | null {
  if (!event) {
    return null;
  }

  return createMobFeedbackScope({
    sessionId: event.sessionId,
    combatIndex: event.combatIndex,
    mobId: event.mobId,
    mobName: event.mobName,
  });
}

function getMobFeedbackScopeKey(scope?: MobFeedbackScope | null) {
  if (!scope) {
    return "";
  }

  return [
    scope.sessionId ?? "session:any",
    scope.combatIndex ? `combat:${scope.combatIndex}` : "combat:any",
    scope.mobId ? `mob:${scope.mobId}` : "mob:any",
    scope.mobName ? `name:${scope.mobName}` : "name:any",
  ].join("|");
}

function hasUsefulMobFeedbackScope(scope?: MobFeedbackScope | null) {
  return Boolean(scope?.combatIndex || scope?.mobId || scope?.mobName);
}

function hasMobFeedbackScopeMismatch(
  feedbackScope?: MobFeedbackScope | null,
  visibleScope?: MobFeedbackScope | null,
) {
  if (!feedbackScope || !visibleScope) {
    return false;
  }

  if (
    feedbackScope.sessionId &&
    visibleScope.sessionId &&
    feedbackScope.sessionId !== visibleScope.sessionId
  ) {
    return true;
  }

  if (
    feedbackScope.combatIndex &&
    visibleScope.combatIndex &&
    feedbackScope.combatIndex !== visibleScope.combatIndex
  ) {
    return true;
  }

  if (
    feedbackScope.mobId &&
    visibleScope.mobId &&
    feedbackScope.mobId !== visibleScope.mobId
  ) {
    return true;
  }

  if (
    feedbackScope.mobName &&
    visibleScope.mobName &&
    feedbackScope.mobName !== visibleScope.mobName
  ) {
    return true;
  }

  return false;
}

function shouldClearXpFeedbackForEvent(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event?.type);

  return (
    eventType === "PLAYER_DEFEATED" ||
    eventType === "SESSION_STOPPED" ||
    eventType === "SESSION_FINISHED" ||
    eventType === "SESSION_ERROR"
  );
}

type AutoCombatLooseRecord = Record<string, unknown>;

function getAutoCombatLooseRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as AutoCombatLooseRecord)
    : null;
}

function getAutoCombatStringField(source: unknown, key: string): string | null {
  const record = getAutoCombatLooseRecord(source);
  const value = record?.[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

function getAutoCombatBooleanField(source: unknown, key: string) {
  const record = getAutoCombatLooseRecord(source);

  return record?.[key] === true;
}

function normalizeAutoCombatStatusField(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function shouldRedirectAutoCombatToInfirmary(params: {
  status?: AutoCombatStatusResponse | null;
  session?: unknown;
  event?: AutoCombatRealtimeEvent | null;
}) {
  const { status, session, event } = params;
  const characterCurrentHp = getOptionalPositiveInteger(
    status?.character?.currentHp,
  );
  const eventCharacterHp =
    getOptionalPositiveInteger(event?.characterCurrentHp) ??
    getOptionalPositiveInteger(event?.characterHpAfter);

  if (characterCurrentHp !== null && characterCurrentHp > 0) {
    return false;
  }

  const sessionStatus = normalizeAutoCombatStatusField(
    getAutoCombatStringField(session, "status"),
  );
  const eventSessionStatus = normalizeAutoCombatStatusField(
    event?.sessionStatus,
  );
  const endReason = normalizeAutoCombatStatusField(
    status?.endReason ??
      getAutoCombatStringField(session, "endReason") ??
      event?.endReason,
  );
  const eventType = normalizeRealtimeEventType(event?.type);
  const hasDefeatSignal = Boolean(
    status?.shouldRedirectToInfirmary ||
      getAutoCombatBooleanField(session, "shouldRedirectToInfirmary") ||
      event?.shouldRedirectToInfirmary ||
      status?.sessionSummary?.defeated ||
      sessionStatus === "DEFEATED" ||
      eventSessionStatus === "DEFEATED" ||
      endReason === "PLAYER_DEFEATED" ||
      eventType === "PLAYER_DEFEATED",
  );

  if (!hasDefeatSignal) {
    return false;
  }

  if (characterCurrentHp !== null) {
    return characterCurrentHp <= 0;
  }

  if (eventCharacterHp !== null) {
    return eventCharacterHp <= 0;
  }

  return true;
}

function getXpFeedbackBreakdown(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event?.type);

  if (!event || eventType !== "MOB_DEFEATED") {
    return null;
  }

  const totalXp = getOptionalPositiveInteger(event.xpGained);

  if (!totalXp || totalXp <= 0) {
    return null;
  }

  const baseXp = getOptionalPositiveInteger(event.baseXpGained) ?? totalXp;
  const premiumBonusXp = getOptionalPositiveInteger(event.premiumBonusXp) ?? 0;
  const premiumPotentialBonusXp =
    getOptionalPositiveInteger(event.premiumPotentialBonusXp) ?? 0;
  const premiumTotalXp =
    getOptionalPositiveInteger(event.premiumTotalXp) ??
    baseXp + Math.max(premiumBonusXp, premiumPotentialBonusXp);

  return {
    baseXp,
    totalXp,
    premiumBonusXp,
    premiumPotentialBonusXp,
    premiumTotalXp,
    isPremiumActive: Boolean(event.isPremiumActive || premiumBonusXp > 0),
  };
}

function getSynchronizedXpFeedbackEvent(
  events: Array<AutoCombatRealtimeEvent | null | undefined>,
  visibleScope?: MobFeedbackScope | null,
) {
  for (const event of events) {
    if (!getXpFeedbackBreakdown(event)) {
      continue;
    }

    const feedbackScope = getMobFeedbackScopeFromEvent(event);

    if (
      hasUsefulMobFeedbackScope(feedbackScope) &&
      hasUsefulMobFeedbackScope(visibleScope) &&
      hasMobFeedbackScopeMismatch(feedbackScope, visibleScope)
    ) {
      continue;
    }

    if (
      hasUsefulMobFeedbackScope(visibleScope) &&
      !hasUsefulMobFeedbackScope(feedbackScope)
    ) {
      continue;
    }

    return event ?? null;
  }

  return null;
}

function getXpFeedbackDisplayKey(event?: AutoCombatRealtimeEvent | null) {
  const breakdown = getXpFeedbackBreakdown(event);

  if (!event || !breakdown) {
    return "";
  }

  const feedbackScope = getMobFeedbackScopeFromEvent(event);

  if (!hasUsefulMobFeedbackScope(feedbackScope)) {
    return getRealtimeEventKey(event);
  }

  return [
    getMobFeedbackScopeKey(feedbackScope),
    `round:${event.round ?? "any"}`,
    `kills:${event.totalKills ?? "any"}`,
    `combats:${event.totalCombats ?? "any"}`,
    `total:${breakdown.totalXp}`,
    `base:${breakdown.baseXp}`,
    `premium:${breakdown.premiumBonusXp}`,
    `potential:${breakdown.premiumPotentialBonusXp}`,
  ].join("|");
}

function getMapRarityClassName(tier?: number | string | null) {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) {
    return "auto-combat-map-rarity-common";
  }

  if (safeTier >= 9) return "auto-combat-map-rarity-legendary";
  if (safeTier >= 7) return "auto-combat-map-rarity-epic";
  if (safeTier >= 5) return "auto-combat-map-rarity-rare";
  if (safeTier >= 3) return "auto-combat-map-rarity-uncommon";

  return "auto-combat-map-rarity-common";
}

function getLootInitials(name?: string | null) {
  const cleanName = String(name ?? "").trim();

  if (!cleanName) return "??";

  const words = cleanName
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2);

  return words
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

function getLootRarityClassName(rarity?: string | null) {
  const normalizedRarity = String(rarity ?? "common").toLowerCase();

  if (normalizedRarity.includes("legendary")) {
    return "auto-combat-threat-loot-card--legendary";
  }

  if (normalizedRarity.includes("epic")) {
    return "auto-combat-threat-loot-card--epic";
  }

  if (normalizedRarity.includes("rare")) {
    return "auto-combat-threat-loot-card--rare";
  }

  if (normalizedRarity.includes("uncommon")) {
    return "auto-combat-threat-loot-card--uncommon";
  }

  return "auto-combat-threat-loot-card--common";
}

function formatDropChance(chance?: number | null) {
  const safeChance = Number(chance);

  if (!Number.isFinite(safeChance)) return null;

  return `~${Math.max(0, Math.min(100, safeChance))}%`;
}

function formatDropQuantity(
  minQuantity?: number | null,
  maxQuantity?: number | null,
) {
  const min = Math.max(1, Number(minQuantity) || 1);
  const max = Math.max(min, Number(maxQuantity) || min);

  return min === max ? `x${min}` : `x${min}-${max}`;
}

export function AutoCombatPage() {
  const { characterId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedMapId = searchParams.get("mapId") ?? "";
  const requestedSubMapId = searchParams.get("subMapId") ?? "";
  const realtimeContext = useAutoCombatRealtime();
  const realtimeActions = getRealtimeActions(realtimeContext);
  const realtimeState =
    useAutoCombatRealtimeState() as AutoCombatRealtimeStateLoose;

  const [activeTab, setActiveTab] = useState<AutoCombatTab>("battle");
  const [hasStartedHunt, setHasStartedHunt] = useState(false);

  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [maps, setMaps] = useState<AutoCombatMapViewModel[]>([]);
  const [autoCombatStatus, setAutoCombatStatus] =
    useState<AutoCombatStatusResponse | null>(null);
  const [selectedMapId, setSelectedMapId] = useState("");
  const [selectedThreat, setSelectedThreat] =
    useState<AutoCombatEncounterViewModel | null>(null);
  const [selectedBattleQuantity, setSelectedBattleQuantity] = useState(1);
  const [isStopHuntConfirmOpen, setIsStopHuntConfirmOpen] = useState(false);
  const [availablePotions, setAvailablePotions] = useState<
    PotionInventoryOption[]
  >([]);
  const [autoPotionConfig, setAutoPotionConfig] =
    useState<CharacterPotionConfigWithItem | null>(null);
  const [isPotionConfigPanelOpen, setIsPotionConfigPanelOpen] = useState(false);
  const [isRestConfigPanelOpen, setIsRestConfigPanelOpen] = useState(false);
  const [selectedPotionSlotIndex, setSelectedPotionSlotIndex] = useState(0);
  const [selectedPotionItemId, setSelectedPotionItemId] = useState("");
  const [potionThresholdPercent, setPotionThresholdPercent] = useState(35);
  const [autoRestEnabled, setAutoRestEnabled] = useState(true);
  const [autoRestStartHpPercent, setAutoRestStartHpPercent] = useState(35);
  const [autoRestStopHpPercent, setAutoRestStopHpPercent] = useState(70);
  const [isPotionConfigLoading, setIsPotionConfigLoading] = useState(false);
  const [isRestConfigLoading, setIsRestConfigLoading] = useState(false);
  const [potionConfigMessage, setPotionConfigMessage] = useState("");
  const [restConfigMessage, setRestConfigMessage] = useState("");

  const [localRealtimeCombat, setLocalRealtimeCombat] =
    useState<RealtimeCombatState | null>(null);
  const [localCharacterProgress, setLocalCharacterProgress] =
    useState<RealtimeCharacterProgressState | null>(null);
  const [localSessionTotals, setLocalSessionTotals] =
    useState<RealtimeSessionTotalsState | null>(null);
  const [localBattleLogEvents, setLocalBattleLogEvents] = useState<
    AutoCombatRealtimeEvent[]
  >([]);
  const [localActiveEvent, setLocalActiveEvent] =
    useState<AutoCombatRealtimeEvent | null>(null);
  const [xpFeedbackEvent, setXpFeedbackEvent] =
    useState<AutoCombatRealtimeEvent | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const autoPotionConfigRef = useRef<CharacterPotionConfigWithItem | null>(
    null,
  );
  const selectedPotionItemIdRef = useRef("");
  const hasPendingRealtimeVisualRef = useRef(false);
  const loadAutoCombatDataRequestRef = useRef(0);
  const lastPositiveRemainingSecondsRef = useRef<{
    sessionId: string | null;
    seconds: number;
  } | null>(null);
  const processedPotionEventKeysRef = useRef<Set<string>>(new Set());
  const xpFeedbackHideTimeoutRef = useRef<number | null>(null);
  const xpFeedbackEventKeyRef = useRef("");
  const shownXpFeedbackEventKeysRef = useRef<Set<string>>(new Set());
  const clearXpFeedbackTimers = useCallback(() => {
    if (xpFeedbackHideTimeoutRef.current !== null) {
      window.clearTimeout(xpFeedbackHideTimeoutRef.current);
      xpFeedbackHideTimeoutRef.current = null;
    }
  }, []);

  const queueClearXpFeedback = useCallback(
    (options?: { resetShownEvents?: boolean }) => {
      clearXpFeedbackTimers();

      xpFeedbackEventKeyRef.current = "";

      if (options?.resetShownEvents) {
        shownXpFeedbackEventKeysRef.current.clear();
      }

      setXpFeedbackEvent(null);
    },
    [clearXpFeedbackTimers],
  );

  useEffect(() => {
    autoPotionConfigRef.current = autoPotionConfig;
  }, [autoPotionConfig]);

  useEffect(() => {
    selectedPotionItemIdRef.current = selectedPotionItemId;
  }, [selectedPotionItemId]);

  useEffect(() => {
    setLocalRealtimeCombat(null);
    setLocalCharacterProgress(null);
    setLocalSessionTotals(null);
    setLocalBattleLogEvents([]);
    setLocalActiveEvent(null);
    setIsPotionConfigPanelOpen(false);
    setPotionConfigMessage("");
    processedPotionEventKeysRef.current.clear();
    lastPositiveRemainingSecondsRef.current = null;
    queueClearXpFeedback({ resetShownEvents: true });
  }, [characterId, queueClearXpFeedback]);

  const realtimeStatus = getRealtimeStatus(realtimeState);
  const isRealtimeSynchronizing = Boolean(realtimeState.isSynchronizing);
  const effectiveStatus = pickAutoCombatEffectiveStatus({
    realtimeStatus,
    restStatus: autoCombatStatus,
  });
  const effectiveSession = getRealtimeSession(realtimeState, effectiveStatus);
  const providerRealtimeCombat = isRealtimeSynchronizing
    ? null
    : getRealtimeCombat(realtimeState);
  const providerProgress = getRealtimeProgress(realtimeState);
  const providerSessionTotals = getRealtimeTotals(realtimeState);
  const providerBattleLogEvents = getRealtimeBattleLogEvents(realtimeState);
  const providerActiveEvent = getRealtimeActiveEvent(realtimeState);
  const providerPublicActiveEvent =
    !isRealtimeSynchronizing && realtimeState.activeEventImpactApplied
      ? providerActiveEvent
      : null;
  const providerQueuedEventsRaw = isRealtimeSynchronizing
    ? []
    : (realtimeState.eventQueue ?? []);
  const providerQueueLength = isRealtimeSynchronizing
    ? 0
    : providerQueuedEventsRaw.length || getRealtimeQueueLength(realtimeState);
  const hasPendingCombatVisualEvent =
    isAutoCombatBattleVisualEvent(providerActiveEvent) ||
    providerQueuedEventsRaw.some(isAutoCombatBattleVisualEvent);

  const visualRealtimeCombat = isRealtimeSynchronizing
    ? null
    : (providerRealtimeCombat ?? localRealtimeCombat);

  const effectiveSessionIsTerminal = isTerminalSessionStatus(
    effectiveSession?.status,
  );

  const hasActiveSession =
    !effectiveSessionIsTerminal &&
    (Boolean(realtimeState.isActive) ||
      Boolean(realtimeState.hasActiveSession) ||
      Boolean(realtimeState.hasActiveAutoCombat) ||
      isSessionActive(effectiveStatus, effectiveSession));
  const activeSessionSubMapId = hasActiveSession
    ? (effectiveSession?.subMapId ??
      effectiveStatus?.currentSubMapId ??
      effectiveStatus?.hunting?.subMapId ??
      effectiveStatus?.subMap?.id ??
      null)
    : null;
  const activeSessionMapId = hasActiveSession
    ? (effectiveSession?.mapId ??
      effectiveStatus?.currentMapId ??
      effectiveStatus?.hunting?.mapId ??
      effectiveStatus?.subMap?.map?.id ??
      null)
    : null;
  const effectiveSessionPhase = String(
    effectiveSession?.phase ?? effectiveStatus?.phase ?? "",
  ).toUpperCase();
  const isBackendHuntingPhase =
    hasActiveSession && effectiveSessionPhase === "HUNTING";
  const isBackendEncounterReadyPhase =
    hasActiveSession && effectiveSessionPhase === "ENCOUNTER_READY";
  const isBackendHuntFlow =
    isBackendHuntingPhase || isBackendEncounterReadyPhase;
  const isBackendCombatPhase =
    hasActiveSession &&
    !isBackendHuntFlow &&
    (effectiveSessionPhase === "COMBAT_ACTIVE" ||
      effectiveSessionPhase === "PLAYER_TURN" ||
      effectiveSessionPhase === "MOB_TURN" ||
      effectiveSessionPhase === "WAITING_NEXT_ROUND" ||
      effectiveSessionPhase === "MOB_DEFEATED" ||
      effectiveSessionPhase === "SPAWNING" ||
      (!effectiveSessionPhase &&
        Boolean(effectiveStatus?.currentMob ?? effectiveSession?.currentMob)) ||
      (!effectiveSessionPhase && Boolean(providerActiveEvent)));

  const hasPendingRealtimeVisual =
    !effectiveSessionIsTerminal &&
    (isBackendCombatPhase || effectiveSessionPhase === "ENCOUNTER_READY") &&
    (hasPendingCombatVisualEvent ||
      (isBackendCombatPhase &&
        (providerQueueLength > 0 || Boolean(providerActiveEvent))));

  const restActiveSession = getSessionFromStatus(autoCombatStatus);
  const restActiveMob = autoCombatStatus?.currentMob ?? null;
  const canRenderRestActiveSnapshot = Boolean(
    autoCombatStatus?.active &&
    (restActiveMob?.id || restActiveMob?.name) &&
    (!effectiveSession?.id ||
      !restActiveSession?.id ||
      restActiveSession.id === effectiveSession.id),
  );
  const shouldDelayActiveSessionUntilStartSnapshot = Boolean(
    isActionLoading &&
    isBackendCombatPhase &&
    isRealtimeSynchronizing &&
    !canRenderRestActiveSnapshot,
  );
  const showActiveSession =
    !shouldDelayActiveSessionUntilStartSnapshot &&
    (isBackendCombatPhase || hasPendingRealtimeVisual);
  const activeBattleSelection =
    effectiveStatus?.battleSelection ?? effectiveSession?.battleSelection ?? null;
  const activeBattleTargetMobId =
    effectiveSession?.battleTargetMobId ?? activeBattleSelection?.mobId ?? null;
  const activeBattleTargetEncounterId =
    effectiveSession?.battleTargetEncounterId ??
    activeBattleSelection?.encounterId ??
    null;
  const activeBattleTargetTotal = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        effectiveSession?.battleTargetTotal ?? activeBattleSelection?.total,
        0,
      ),
    ),
  );
  const activeBattleTargetRemaining = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        effectiveSession?.battleTargetRemaining ??
          activeBattleSelection?.remaining,
        0,
      ),
    ),
  );
  const activeBattleTargetDefeated = Math.max(
    0,
    activeBattleTargetTotal - activeBattleTargetRemaining,
  );
  const showInlineHuntBattle =
    showActiveSession &&
    Boolean(
      activeBattleTargetMobId ||
        activeBattleTargetEncounterId ||
        activeBattleTargetTotal > 0 ||
        activeBattleSelection?.mob,
    );
  const showArenaActiveSession = showActiveSession && !showInlineHuntBattle;
  const showHuntStage =
    (!showActiveSession || showInlineHuntBattle) &&
    (isBackendHuntFlow || hasStartedHunt || showInlineHuntBattle);
  const showTravelEmptyStage =
    showHuntStage && !isBackendHuntFlow && !showInlineHuntBattle;
  const showTrackedHuntStage =
    showHuntStage && (isBackendHuntFlow || showInlineHuntBattle);
  const showHuntTrackerCard =
    showTrackedHuntStage && isBackendHuntingPhase && !showInlineHuntBattle;
  const isCombatViewSynchronizing =
    showActiveSession &&
    isRealtimeSynchronizing &&
    !canRenderRestActiveSnapshot;
  const [sessionClockNowMs, setSessionClockNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [stableTimerStatus, setStableTimerStatus] = useState<{
    sessionId: string | null;
    status: AutoCombatStatusResponse;
  } | null>(null);
  const syncedSessionNowMs = sessionClockNowMs + serverClockOffsetMs;
  const effectiveSessionId = effectiveSession?.id ?? null;
  const timerStatusCandidate = useMemo(
    () =>
      pickAutoCombatTimerStatus({
        realtimeStatus,
        restStatus: autoCombatStatus,
        sessionId: effectiveSessionId,
      }),
    [realtimeStatus, autoCombatStatus, effectiveSessionId],
  );

  const stableTimerStatusMatches =
    stableTimerStatus &&
    (!effectiveSessionId || stableTimerStatus.sessionId === effectiveSessionId);

  const activeTimerStatus =
    timerStatusCandidate ??
    (showActiveSession && stableTimerStatusMatches
      ? stableTimerStatus.status
      : null);

  useEffect(() => {
    const serverNowMs = getAutoCombatTimestampMs(
      activeTimerStatus?.serverNow ?? effectiveStatus?.serverNow,
    );

    if (serverNowMs === null) {
      setServerClockOffsetMs(0);
      return;
    }

    setServerClockOffsetMs(serverNowMs - Date.now());
  }, [activeTimerStatus?.serverNow, effectiveStatus?.serverNow]);

  useEffect(() => {
    setSessionClockNowMs(Date.now());

    if (!showActiveSession && !showHuntStage) return undefined;

    const intervalMs = showActiveSession && isBackendCombatPhase ? 200 : 1000;
    const intervalId = window.setInterval(() => {
      setSessionClockNowMs(Date.now());
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isBackendCombatPhase, showActiveSession, showHuntStage]);

  useEffect(() => {
    if (!showActiveSession) {
      setStableTimerStatus(null);
      return;
    }

    if (!timerStatusCandidate) return;

    const timerSessionId =
      getSessionFromStatus(timerStatusCandidate)?.id ?? effectiveSessionId;

    setStableTimerStatus((currentStatus) => {
      if (
        currentStatus?.sessionId === timerSessionId &&
        currentStatus.status === timerStatusCandidate
      ) {
        return currentStatus;
      }

      return {
        sessionId: timerSessionId,
        status: timerStatusCandidate,
      };
    });
  }, [showActiveSession, timerStatusCandidate, effectiveSessionId]);

  useEffect(() => {
    hasPendingRealtimeVisualRef.current = hasPendingRealtimeVisual;
  }, [hasPendingRealtimeVisual]);

  const isSocketConnected = Boolean(realtimeState.isConnected);

  const applyPotionRealtimeQuantityUpdate = useCallback(
    (payload: AutoCombatRealtimeEvent) => {
      const currentAutoPotionConfig = autoPotionConfigRef.current;
      const configuredPotion = getPotionItem(currentAutoPotionConfig);

      const potionItemId = resolvePotionEventItemId(
        payload,
        configuredPotion?.id ??
          currentAutoPotionConfig?.potionItemId ??
          selectedPotionItemIdRef.current,
      );

      if (!potionItemId) {
        return;
      }

      setAvailablePotions((currentPotions) => {
        let changed = false;

        const nextPotions = currentPotions.map((potion) => {
          const isSamePotion =
            potion.itemId === potionItemId || potion.id === potionItemId;

          if (!isSamePotion) {
            return potion;
          }

          changed = true;

          const nextQuantity = resolvePotionQuantityAfter(
            payload,
            potion.quantity,
          );

          return {
            ...potion,
            quantity: nextQuantity,
            availableQuantity: nextQuantity,
          };
        });

        return changed ? nextPotions : currentPotions;
      });

      setAutoPotionConfig((currentConfig) => {
        if (!currentConfig) {
          return currentConfig;
        }

        const currentPotion = getPotionItem(currentConfig);
        const currentPotionId =
          currentPotion?.id ?? currentConfig.potionItemId ?? "";

        if (!currentPotion || currentPotionId !== potionItemId) {
          return currentConfig;
        }

        const currentQuantity = toSafeNumber(
          currentPotion.availableQuantity ?? currentPotion.quantity,
          0,
        );

        const nextQuantity = resolvePotionQuantityAfter(
          payload,
          currentQuantity,
        );

        const nextPotion: PotionEquipmentItem = {
          ...currentPotion,
          quantity: nextQuantity,
          availableQuantity: nextQuantity,
        };

        return {
          ...currentConfig,
          potion: nextPotion,
          potionItem: nextPotion,
        };
      });
    },
    [],
  );

  useEffect(() => {
    const event = providerPublicActiveEvent;

    if (!event || normalizeRealtimeEventType(event.type) !== "POTION_USED") {
      return;
    }

    const eventKey = getPotionEventKey(event);

    if (processedPotionEventKeysRef.current.has(eventKey)) {
      return;
    }

    processedPotionEventKeysRef.current.add(eventKey);

    if (processedPotionEventKeysRef.current.size > 250) {
      processedPotionEventKeysRef.current = new Set(
        Array.from(processedPotionEventKeysRef.current).slice(-125),
      );
    }

    applyPotionRealtimeQuantityUpdate(event);
  }, [providerPublicActiveEvent, applyPotionRealtimeQuantityUpdate]);

  const loadAutoCombatData = useCallback(async () => {
    if (!characterId) return;

    const requestId = loadAutoCombatDataRequestRef.current + 1;
    loadAutoCombatDataRequestRef.current = requestId;

    try {
      setErrorMessage("");

      const [
        overviewData,
        statusData,
        mapsData,
        inventoryData,
        potionConfigData,
      ] = await Promise.all([
        getCharacterOverview(characterId),
        getAutoCombatStatus(characterId).catch(() => null),
        getAutoCombatMaps().catch(() => []),
        getCharacterInventoryRaw(characterId).catch(() => null),
        getCharacterPotionConfigRaw(characterId).catch(() => null),
      ]);

      if (requestId !== loadAutoCombatDataRequestRef.current) {
        return;
      }

      const statusSession = getSessionFromStatus(statusData);
      const statusProgress = buildProgressFromStatus(statusData, statusSession);
      const overviewProgress = buildProgressFromSource(
        overviewData.character as CharacterProgressSource,
        statusSession?.id ?? null,
      );

      const mergedProgress = pickHighestProgress(
        overviewProgress,
        statusProgress,
      );

      const normalizedPotions = normalizePotionInventoryResponse(inventoryData);

      const overviewCharacter =
        overviewData.character as CharacterWithSinglePotionConfig;

      const normalizedPotionConfig =
        normalizePotionConfigResponse(potionConfigData) ??
        overviewCharacter.autoPotionConfig ??
        overviewCharacter.potionConfig ??
        null;

      setOverview(overviewData);
      if (statusData) {
        setAutoCombatStatus(statusData);
      }
      setMaps(mapsData);
      setAvailablePotions(normalizedPotions);
      setAutoPotionConfig(normalizedPotionConfig);

      setSelectedPotionItemId(normalizedPotionConfig?.potionItemId ?? "");
      setPotionThresholdPercent(
        clampNumber(normalizedPotionConfig?.hpThresholdPercent ?? 35, 1, 100),
      );
      setAutoRestEnabled(normalizedPotionConfig?.autoRestEnabled ?? true);
      setAutoRestStartHpPercent(
        clampNumber(
          normalizedPotionConfig?.autoRestStartHpPercent ?? 35,
          1,
          99,
        ),
      );
      setAutoRestStopHpPercent(
        clampNumber(
          normalizedPotionConfig?.autoRestStopHpPercent ?? 70,
          2,
          100,
        ),
      );

      setLocalCharacterProgress((current) => {
        if (hasPendingRealtimeVisualRef.current && current) {
          return current;
        }

        return pickHighestProgress(current, mergedProgress);
      });

      if (statusData && isSessionActive(statusData, statusSession)) {
        setLocalSessionTotals(
          buildSessionTotalsFromStatus(statusData, statusSession),
        );
      } else if (statusData) {
        setHasStartedHunt(false);
        setLocalSessionTotals(null);
        setLocalRealtimeCombat(null);
        setLocalBattleLogEvents([]);
        setLocalActiveEvent(null);
      }

      setSelectedMapId((currentValue) => {
        const activeStatusMapId =
          statusData && isSessionActive(statusData, statusSession)
            ? (statusSession?.mapId ??
              statusData.currentMapId ??
              statusData.hunting?.mapId ??
              statusData.subMap?.map?.id ??
              null)
            : null;

        if (
          activeStatusMapId &&
          mapsData.some((gameMap) => gameMap.id === activeStatusMapId)
        ) {
          return activeStatusMapId;
        }

        if (
          currentValue &&
          mapsData.some((gameMap) => gameMap.id === currentValue)
        ) {
          return currentValue;
        }

        const requestedMap = requestedMapId
          ? (mapsData.find((gameMap) => gameMap.id === requestedMapId) ?? null)
          : null;
        const requestedSubMapParent = requestedSubMapId
          ? (mapsData.find((gameMap) => {
              return gameMap.subMaps?.some(
                (subMap) => subMap.id === requestedSubMapId,
              );
            }) ?? null)
          : null;

        return (
          requestedMap?.id ?? requestedSubMapParent?.id ?? mapsData[0]?.id ?? ""
        );
      });
    } catch (error) {
      if (requestId !== loadAutoCombatDataRequestRef.current) {
        return;
      }

      setErrorMessage(
        getApiErrorMessage(
          error,
          "Não foi possível carregar os dados do combate automático.",
        ),
      );
    }
  }, [characterId]);

  const character = useMemo(() => {
    if (!overview) return null;

    return buildCharacterViewModel(overview);
  }, [overview]);

  const totalStats = useMemo(() => {
    return resolveCharacterStats(overview, character);
  }, [overview, character]);

  const overviewCharacterProgress = useMemo(() => {
    return buildProgressFromSource(
      character as CharacterProgressSource | null | undefined,
      effectiveSession?.id ?? null,
    );
  }, [character, effectiveSession?.id]);

  const statusCharacterProgress = useMemo(() => {
    return buildProgressFromStatus(effectiveStatus, effectiveSession);
  }, [effectiveStatus, effectiveSession]);

  const hasProviderVisualTimeline =
    showActiveSession &&
    (providerBattleLogEvents.length > 0 ||
      providerQueueLength > 0 ||
      Boolean(providerActiveEvent));

  const visibleCharacterProgress = useMemo(() => {
    return selectVisibleCharacterProgress({
      hasProviderVisualTimeline: showActiveSession && Boolean(providerProgress),
      overviewCharacterProgress,
      statusCharacterProgress,
      localCharacterProgress,
      providerProgress,
    });
  }, [
    showActiveSession,
    overviewCharacterProgress,
    statusCharacterProgress,
    localCharacterProgress,
    providerProgress,
  ]);

  const visibleRealtimeSessionTotals =
    providerSessionTotals?.sessionId && effectiveSession?.id
      ? providerSessionTotals.sessionId === effectiveSession.id
        ? providerSessionTotals
        : null
      : providerSessionTotals;

  const visibleLocalSessionTotals =
    localSessionTotals?.sessionId && effectiveSession?.id
      ? localSessionTotals.sessionId === effectiveSession.id
        ? localSessionTotals
        : null
      : localSessionTotals;

  const statusSessionTotals = hasActiveSession
    ? buildSessionTotalsFromStatus(effectiveStatus, effectiveSession)
    : null;

  const visibleZeroSessionTotals =
    hasActiveSession && hasProviderVisualTimeline
      ? buildZeroRealtimeSessionTotals(effectiveSession)
      : null;

  const visibleSessionTotals = hasActiveSession
    ? (visibleRealtimeSessionTotals ??
      visibleLocalSessionTotals ??
      visibleZeroSessionTotals ??
      statusSessionTotals)
    : null;

  const battleLogEvents =
    showActiveSession && providerBattleLogEvents.length > 0
      ? providerBattleLogEvents
      : showActiveSession
        ? localBattleLogEvents
        : [];

  const activeBattleLogEvent = showActiveSession
    ? (providerPublicActiveEvent ?? localActiveEvent)
    : null;
  const providerQueuedEvents = showActiveSession
    ? isRealtimeSynchronizing
      ? []
      : providerQueuedEventsRaw
    : [];
  const shouldDeferInfirmaryRedirect =
    isLoading || isRealtimeSynchronizing || !effectiveStatus;
  const shouldRedirectToInfirmary = Boolean(
    characterId &&
      !shouldDeferInfirmaryRedirect &&
      shouldRedirectAutoCombatToInfirmary({
        status: effectiveStatus,
        session: effectiveSession,
        event: activeBattleLogEvent ?? providerActiveEvent,
      }),
  );

  useEffect(() => {
    if (!shouldRedirectToInfirmary) return;

    setLocalRealtimeCombat(null);
    setLocalCharacterProgress(null);
    setLocalSessionTotals(null);
    setLocalBattleLogEvents([]);
    setLocalActiveEvent(null);
    queueClearXpFeedback({ resetShownEvents: true });
  }, [queueClearXpFeedback, shouldRedirectToInfirmary]);

  const visibleMobFeedbackScope = useMemo(
    () =>
      showActiveSession
        ? createMobFeedbackScope({
            sessionId: visualRealtimeCombat?.sessionId ?? effectiveSession?.id,
            combatIndex:
              visualRealtimeCombat?.combatIndex ??
              effectiveStatus?.session?.currentCombatIndex ??
              effectiveSession?.currentCombatIndex ??
              null,
            mobId:
              visualRealtimeCombat?.mobId ??
              effectiveStatus?.currentMob?.id ??
              effectiveSession?.currentMobId ??
              effectiveSession?.currentMob?.id,
            mobName:
              visualRealtimeCombat?.mobName ??
              effectiveStatus?.currentMob?.name ??
              effectiveSession?.currentMob?.name ??
              null,
          })
        : null,
    [
      effectiveSession?.currentCombatIndex,
      effectiveSession?.currentMob?.id,
      effectiveSession?.currentMob?.name,
      effectiveSession?.currentMobId,
      effectiveSession?.id,
      effectiveStatus?.currentMob?.id,
      effectiveStatus?.currentMob?.name,
      effectiveStatus?.session?.currentCombatIndex,
      showActiveSession,
      visualRealtimeCombat?.combatIndex,
      visualRealtimeCombat?.mobId,
      visualRealtimeCombat?.mobName,
      visualRealtimeCombat?.sessionId,
    ],
  );
  const visibleMobFeedbackScopeKey = getMobFeedbackScopeKey(
    visibleMobFeedbackScope,
  );
  const activeBattleLogEventType = normalizeRealtimeEventType(
    activeBattleLogEvent?.type,
  );
  const activeBattleLogMobHp = getOptionalPositiveInteger(
    activeBattleLogEvent?.mobCurrentHp,
  );
  const visualRealtimeMobHp = getOptionalPositiveInteger(
    visualRealtimeCombat?.mobCurrentHp,
  );
  const canSyncXpFeedbackWithMobDeath =
    showActiveSession &&
    (activeBattleLogEventType === "MOB_DEFEATED" ||
      activeBattleLogMobHp === 0 ||
      visualRealtimeMobHp === 0);
  const synchronizedXpFeedbackEvent = useMemo(() => {
    if (!canSyncXpFeedbackWithMobDeath) {
      return null;
    }

    return getSynchronizedXpFeedbackEvent(
      [activeBattleLogEvent, ...providerQueuedEvents, ...battleLogEvents],
      visibleMobFeedbackScope,
    );
  }, [
    activeBattleLogEvent,
    battleLogEvents,
    canSyncXpFeedbackWithMobDeath,
    providerQueuedEvents,
    visibleMobFeedbackScope,
    visibleMobFeedbackScopeKey,
  ]);

  useEffect(() => {
    if (isCombatViewSynchronizing) {
      queueClearXpFeedback();

      return;
    }

    if (!showActiveSession) {
      queueClearXpFeedback();

      return;
    }

    if (shouldClearXpFeedbackForEvent(activeBattleLogEvent)) {
      queueClearXpFeedback();

      return;
    }

    if (xpFeedbackEvent && activeBattleLogEvent) {
      const activeEventType = normalizeRealtimeEventType(
        activeBattleLogEvent.type,
      );

      if (activeEventType !== "MOB_DEFEATED") {
        const feedbackScope = getMobFeedbackScopeFromEvent(xpFeedbackEvent);
        const activeEventScope =
          getMobFeedbackScopeFromEvent(activeBattleLogEvent);

        if (
          hasUsefulMobFeedbackScope(feedbackScope) &&
          hasUsefulMobFeedbackScope(activeEventScope) &&
          hasMobFeedbackScopeMismatch(feedbackScope, activeEventScope)
        ) {
          queueClearXpFeedback();

          return;
        }
      }
    }

    const xpFeedback = getXpFeedbackBreakdown(synchronizedXpFeedbackEvent);

    if (!xpFeedback || !synchronizedXpFeedbackEvent) {
      return;
    }

    const eventKey = getXpFeedbackDisplayKey(synchronizedXpFeedbackEvent);

    if (
      !eventKey ||
      xpFeedbackEventKeyRef.current === eventKey ||
      shownXpFeedbackEventKeysRef.current.has(eventKey)
    ) {
      return;
    }

    shownXpFeedbackEventKeysRef.current.add(eventKey);

    if (shownXpFeedbackEventKeysRef.current.size > MAX_SHOWN_XP_FEEDBACK_KEYS) {
      const oldestKey = shownXpFeedbackEventKeysRef.current
        .values()
        .next().value;

      if (oldestKey) {
        shownXpFeedbackEventKeysRef.current.delete(oldestKey);
      }
    }

    xpFeedbackEventKeyRef.current = eventKey;
    if (xpFeedbackHideTimeoutRef.current !== null) {
      window.clearTimeout(xpFeedbackHideTimeoutRef.current);
    }

    setXpFeedbackEvent(synchronizedXpFeedbackEvent);

    xpFeedbackHideTimeoutRef.current = window.setTimeout(() => {
      setXpFeedbackEvent((currentEvent) => {
        if (
          !currentEvent ||
          getXpFeedbackDisplayKey(currentEvent) === eventKey
        ) {
          return null;
        }

        return currentEvent;
      });

      if (xpFeedbackEventKeyRef.current === eventKey) {
        xpFeedbackEventKeyRef.current = "";
      }

      xpFeedbackHideTimeoutRef.current = null;
    }, XP_FEEDBACK_VISIBLE_MS);
  }, [
    activeBattleLogEvent,
    isCombatViewSynchronizing,
    queueClearXpFeedback,
    showActiveSession,
    synchronizedXpFeedbackEvent,
    xpFeedbackEvent,
  ]);

  useEffect(() => {
    if (!xpFeedbackEvent) {
      return;
    }

    if (!showActiveSession) {
      queueClearXpFeedback();

      return;
    }

    const feedbackScope = getMobFeedbackScopeFromEvent(xpFeedbackEvent);

    if (
      hasUsefulMobFeedbackScope(feedbackScope) &&
      hasUsefulMobFeedbackScope(visibleMobFeedbackScope) &&
      hasMobFeedbackScopeMismatch(feedbackScope, visibleMobFeedbackScope)
    ) {
      queueClearXpFeedback();
    }
  }, [
    queueClearXpFeedback,
    showActiveSession,
    visibleMobFeedbackScope,
    visibleMobFeedbackScopeKey,
    xpFeedbackEvent,
  ]);

  useEffect(() => {
    return () => {
      if (xpFeedbackHideTimeoutRef.current !== null) {
        window.clearTimeout(xpFeedbackHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!characterId) return;

      try {
        setIsLoading(true);
        await loadAutoCombatData();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [characterId, loadAutoCombatData]);

  useEffect(() => {
    if (hasActiveSession) {
      setHasStartedHunt(true);
    }
  }, [hasActiveSession]);

  useEffect(() => {
    if (!hasActiveSession && !providerActiveEvent) {
      const timeoutId = window.setTimeout(() => {
        setLocalRealtimeCombat(null);
        setLocalSessionTotals(null);
        setLocalBattleLogEvents([]);
        setLocalActiveEvent(null);
      }, 300);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    return undefined;
  }, [hasActiveSession, providerActiveEvent]);

  useEffect(() => {
    if (!hasActiveSession) return;

    const shouldPollActiveSession = !isSocketConnected && isBackendHuntingPhase;

    if (!shouldPollActiveSession) return;

    const intervalId = window.setInterval(() => {
      loadAutoCombatData();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [
    hasActiveSession,
    isBackendHuntingPhase,
    isSocketConnected,
    loadAutoCombatData,
  ]);

  const currentSelectionLevel =
    visibleCharacterProgress?.level ?? character?.level ?? 1;

  const availableMaps = useMemo(() => {
    return getVisibleCombatMaps(maps);
  }, [maps]);

  const resolvedActiveSessionMapId = useMemo(() => {
    if (!hasActiveSession) return null;

    if (activeSessionMapId) return activeSessionMapId;

    if (!activeSessionSubMapId) return null;

    return (
      availableMaps.find((gameMap) => {
        return gameMap.subMaps?.some((subMap) => {
          return subMap.id === activeSessionSubMapId;
        });
      })?.id ?? null
    );
  }, [
    activeSessionMapId,
    activeSessionSubMapId,
    availableMaps,
    hasActiveSession,
  ]);

  const isMapSelectionLocked = hasActiveSession;
  const effectiveSelectedMapId = isMapSelectionLocked
    ? (resolvedActiveSessionMapId ?? selectedMapId)
    : selectedMapId;

  const selectedMap = useMemo(() => {
    const mapBySelectedId = availableMaps.find((gameMap) => {
      return gameMap.id === effectiveSelectedMapId;
    });

    if (mapBySelectedId) return mapBySelectedId;

    return availableMaps[0] ?? null;
  }, [availableMaps, effectiveSelectedMapId]);

  const selectedMapThreats = useMemo(() => {
    return getActiveEncountersForMap(selectedMap).sort(
      compareAutoCombatThreatsByProgression,
    );
  }, [selectedMap]);

  const selectedMapThreatImages = useMemo(() => {
    return selectedMapThreats
      .map((encounter) => {
        return (
          getMobFullBodyImage(encounter.mob?.name) ??
          getMobPortraitImage(encounter.mob?.name)
        );
      })
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
  }, [selectedMapThreats]);

  useEffect(() => {
    selectedMapThreatImages.forEach(preloadAutoCombatImage);
  }, [selectedMapThreatImages]);

  const selectedThreatDetails = useMemo(() => {
    if (!selectedThreat) return null;

    return (
      selectedMapThreats.find((encounter) => {
        return encounter.id === selectedThreat.id;
      }) ?? selectedThreat
    );
  }, [selectedMapThreats, selectedThreat]);

  const selectedThreatMob = selectedThreatDetails?.mob ?? null;
  const selectedThreatChance = selectedThreatDetails
    ? getThreatWeightPercent(selectedThreatDetails, selectedMapThreats)
    : null;
  const selectedThreatImage =
    getMobFullBodyImage(selectedThreatMob?.name) ??
    getMobPortraitImage(selectedThreatMob?.name);
  const selectedThreatDrops = selectedThreatMob?.drops ?? [];

  const selectedMapIsUnlocked = selectedMap
    ? currentSelectionLevel >= getGameMapMinLevel(selectedMap)
    : false;

  const selectedMapHasActiveEncounters = selectedMapThreats.length > 0;

  useEffect(() => {
    if (!selectedThreat) return;

    function handleThreatModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedThreat(null);
      }
    }

    window.addEventListener("keydown", handleThreatModalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleThreatModalKeyDown);
    };
  }, [selectedThreat]);

  useEffect(() => {
    if (!isPotionConfigPanelOpen) return;

    function handlePotionConfigModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPotionConfigPanelOpen(false);
      }
    }

    window.addEventListener("keydown", handlePotionConfigModalKeyDown);

    return () => {
      window.removeEventListener("keydown", handlePotionConfigModalKeyDown);
    };
  }, [isPotionConfigPanelOpen]);

  useEffect(() => {
    if (!isRestConfigPanelOpen) return;

    function handleRestConfigModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsRestConfigPanelOpen(false);
      }
    }

    window.addEventListener("keydown", handleRestConfigModalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleRestConfigModalKeyDown);
    };
  }, [isRestConfigPanelOpen]);

  useEffect(() => {
    if (maps.length <= 0) return;

    if (isMapSelectionLocked) {
      if (
        resolvedActiveSessionMapId &&
        selectedMapId !== resolvedActiveSessionMapId
      ) {
        setSelectedMapId(resolvedActiveSessionMapId);
      }

      return;
    }

    const requestedMap = requestedMapId
      ? (maps.find((gameMap) => gameMap.id === requestedMapId) ?? null)
      : null;
    const requestedSubMapParent = requestedSubMapId
      ? (maps.find((gameMap) => {
          return gameMap.subMaps?.some(
            (subMap) => subMap.id === requestedSubMapId,
          );
        }) ?? null)
      : null;
    const nextMap =
      selectedMap ??
      requestedMap ??
      requestedSubMapParent ??
      availableMaps[0] ??
      null;

    if (!nextMap) {
      if (selectedMapId) {
        setSelectedMapId("");
      }

      return;
    }

    if (selectedMapId !== nextMap.id) {
      setSelectedMapId(nextMap.id);
    }
  }, [
    maps,
    availableMaps,
    isMapSelectionLocked,
    resolvedActiveSessionMapId,
    selectedMap,
    selectedMapId,
    requestedMapId,
    requestedSubMapId,
  ]);

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (shouldRedirectToInfirmary) {
    return <Navigate to={`/dashboard/${characterId}/infirmary`} replace />;
  }

  if (isLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Sincronizando combate...</span>
      </main>
    );
  }

  if (!character) {
    return <Navigate to="/characters" replace />;
  }

  const characterWithPotionConfig =
    character as CharacterWithSinglePotionConfig;

  const fallbackPotionConfig =
    characterWithPotionConfig.autoPotionConfig ??
    characterWithPotionConfig.potionConfig ??
    characterWithPotionConfig.potionConfigs?.[0] ??
    null;

  const currentPotionConfig = autoPotionConfig ?? fallbackPotionConfig;

  const configuredPotionItem = getPotionItem(currentPotionConfig);

  const potionOptions = (() => {
    const byId = new Map<string, PotionInventoryOption>();

    for (const potion of availablePotions) {
      byId.set(potion.itemId, potion);
    }

    if (configuredPotionItem?.id && !byId.has(configuredPotionItem.id)) {
      byId.set(configuredPotionItem.id, {
        ...configuredPotionItem,
        itemId: configuredPotionItem.id,
        quantity: Math.max(
          0,
          toSafeNumber(
            configuredPotionItem.availableQuantity ??
              configuredPotionItem.quantity,
            0,
          ),
        ),
      });
    }

    return Array.from(byId.values());
  })();

  const potionOptionsCountLabel =
    potionOptions.length === 1
      ? "1 opção no inventário"
      : `${potionOptions.length} opções no inventário`;

  const potionSlots = Array.from({ length: 1 }, () => {
    return currentPotionConfig;
  });

  const latestKilledMob = showActiveSession
    ? getLatestKilledMob(effectiveStatus)
    : null;
  const mainThreat = selectedMapThreats[0] ?? null;
  const calculatedRemainingSeconds =
    showActiveSession && activeTimerStatus
      ? getRemainingSeconds(activeTimerStatus, syncedSessionNowMs)
      : 0;
  const lastPositiveRemainingSeconds = lastPositiveRemainingSecondsRef.current;
  const hasMatchingLastPositiveRemainingSeconds =
    Boolean(lastPositiveRemainingSeconds) &&
    (!effectiveSessionId ||
      lastPositiveRemainingSeconds?.sessionId === effectiveSessionId);
  const shouldKeepLastPositiveRemainingSeconds =
    showActiveSession &&
    calculatedRemainingSeconds <= 0 &&
    hasMatchingLastPositiveRemainingSeconds &&
    (lastPositiveRemainingSeconds?.seconds ?? 0) > 0;
  const remainingSeconds = shouldKeepLastPositiveRemainingSeconds
    ? (lastPositiveRemainingSeconds?.seconds ?? 0)
    : calculatedRemainingSeconds;

  if (showActiveSession && calculatedRemainingSeconds > 0) {
    lastPositiveRemainingSecondsRef.current = {
      sessionId: effectiveSessionId,
      seconds: calculatedRemainingSeconds,
    };
  } else if (!showActiveSession || effectiveSessionIsTerminal) {
    lastPositiveRemainingSecondsRef.current = null;
  }

  const rawCharacterMaxHp =
    showActiveSession && visualRealtimeCombat?.characterMaxHp !== undefined
      ? visualRealtimeCombat.characterMaxHp
      : hasActiveSession
        ? (effectiveStatus?.character?.maxHp ??
          effectiveStatus?.sessionSummary?.hp?.max ??
          character.maxHp)
        : character.maxHp;

  const currentCharacterMaxHp = Math.max(
    1,
    toSafeNumber(rawCharacterMaxHp, character.maxHp ?? 1),
  );

  const rawCharacterHp =
    showActiveSession && visualRealtimeCombat?.characterCurrentHp !== undefined
      ? visualRealtimeCombat.characterCurrentHp
      : hasActiveSession
        ? (effectiveStatus?.character?.currentHp ??
          effectiveStatus?.sessionSummary?.hp?.current ??
          character.currentHp)
        : character.currentHp;

  const currentCharacterHp = clampNumber(
    rawCharacterHp,
    0,
    currentCharacterMaxHp,
  );

  const currentCharacterLevel =
    visibleCharacterProgress?.level ??
    effectiveStatus?.character?.level ??
    character.level ??
    1;

  const currentCharacterXp =
    visibleCharacterProgress?.xp ??
    (showActiveSession
      ? (character.totalXp ?? character.xp ?? 0)
      : (effectiveStatus?.character?.totalXp ??
        effectiveStatus?.character?.levelProgress?.totalXp ??
        effectiveStatus?.character?.xp ??
        character.totalXp ??
        character.xp ??
        0));

  const currentLevelXp =
    visibleCharacterProgress?.currentLevelXp ??
    visibleCharacterProgress?.xpIntoCurrentLevel ??
    character.currentLevelXp ??
    character.levelProgress?.currentLevelXp ??
    character.levelProgress?.xpIntoCurrentLevel ??
    undefined;

  const xpToNextLevel =
    visibleCharacterProgress?.xpToNextLevel ??
    visibleCharacterProgress?.nextLevelXp ??
    character.xpToNextLevel ??
    character.nextLevelXp ??
    character.levelProgress?.xpToNextLevel ??
    character.levelProgress?.nextLevelXp ??
    undefined;

  const xpProgressPercent =
    visibleCharacterProgress?.xpProgressPercent ??
    character.xpProgressPercent ??
    character.levelProgress?.xpProgressPercent ??
    character.levelProgress?.progressPercent ??
    undefined;

  const xpIntoCurrentLevel =
    visibleCharacterProgress?.xpIntoCurrentLevel ??
    visibleCharacterProgress?.currentLevelXp ??
    character.xpIntoCurrentLevel ??
    character.currentLevelXp ??
    character.levelProgress?.xpIntoCurrentLevel ??
    character.levelProgress?.currentLevelXp ??
    undefined;

  const xpNeededForNextLevel =
    visibleCharacterProgress?.xpNeededForNextLevel ??
    character.xpNeededForNextLevel ??
    character.levelProgress?.xpNeededForNextLevel ??
    undefined;

  const currentLevelStartXp =
    visibleCharacterProgress?.currentLevelStartXp ??
    character.currentLevelStartXp ??
    character.levelProgress?.currentLevelStartXp ??
    undefined;

  const nextLevelRequiredXp =
    visibleCharacterProgress?.nextLevelRequiredXp ??
    character.nextLevelRequiredXp ??
    character.levelProgress?.nextLevelRequiredXp ??
    undefined;

  const isAtLevelCap =
    visibleCharacterProgress?.isAtLevelCap ??
    character.isAtLevelCap ??
    character.levelProgress?.isAtLevelCap ??
    undefined;

  const activeSessionMapName = hasActiveSession
    ? effectiveStatus?.subMap?.map?.name
    : undefined;

  const currentLayoutMapName =
    activeSessionMapName ?? selectedMap?.name ?? character.currentMapName;

  const layoutCharacter: CharacterViewModelWithLayoutFields = {
    ...character,
    level: currentCharacterLevel,
    xp: currentCharacterXp,
    totalXp: currentCharacterXp,

    currentLevelXp,
    xpToNextLevel,
    nextLevelXp: xpToNextLevel,
    xpProgressPercent,
    xpIntoCurrentLevel,
    xpNeededForNextLevel,
    currentLevelStartXp,
    nextLevelRequiredXp,
    isAtLevelCap,

    currentHp: currentCharacterHp,
    maxHp: currentCharacterMaxHp,
    currentMapName: currentLayoutMapName,
  };

  const characterBattleImage = layoutCharacter.avatarUrl ?? null;

  const selectedMapName = selectedMap?.name ?? layoutCharacter.currentMapName;
  const mapSelectValue = selectedMap?.id ?? effectiveSelectedMapId;

  const selectedMapImage = getMapImageByName(selectedMapName);
  const selectedMapVisualStyle = buildMapVisualStyle(selectedMapImage);
  const selectedMapRarityClassName = getMapRarityClassName(selectedMap?.tier);

  const characterHasHp = currentCharacterHp > 0;

  const characterHpPercent =
    currentCharacterMaxHp > 0
      ? (currentCharacterHp / currentCharacterMaxHp) * 100
      : 0;

  const characterHpStyle = {
    width: `${clampPercent(characterHpPercent)}%`,
  } as CSSProperties;

  const activeMobStatusSource =
    canRenderRestActiveSnapshot && autoCombatStatus
      ? autoCombatStatus
      : effectiveStatus;
  const statusActiveMob = isCombatViewSynchronizing
    ? null
    : (activeMobStatusSource?.currentMob ?? null);
  const hasConfirmedActiveMob = Boolean(
    !isCombatViewSynchronizing &&
    (visualRealtimeCombat?.mobId ||
      visualRealtimeCombat?.mobName ||
      statusActiveMob?.id ||
      statusActiveMob?.name),
  );

  const activeMobName = showActiveSession
    ? isCombatViewSynchronizing
      ? "Sincronizando combate"
      : (visualRealtimeCombat?.mobName ??
        statusActiveMob?.name ??
        "Aguardando ameaça")
    : (mainThreat?.mob?.name ?? "Aguardando ameaça");

  const normalizedActiveMobName = activeMobName.trim().toLowerCase();

  const activeMobThreat =
    selectedMapThreats.find((encounter) => {
      const encounterMobName = encounter.mob?.name;

      return Boolean(
        encounterMobName &&
        encounterMobName.trim().toLowerCase() === normalizedActiveMobName,
      );
    }) ?? null;

  const activeMobLevel = Math.max(
    1,
    Math.floor(
      toSafeNumber(
        (
          visualRealtimeCombat as
            | { mobLevel?: number | string; level?: number | string }
            | null
            | undefined
        )?.mobLevel ??
          (
            visualRealtimeCombat as
              | { mobLevel?: number | string; level?: number | string }
              | null
              | undefined
          )?.level ??
          statusActiveMob?.level ??
          activeMobThreat?.mob?.level ??
          (
            latestKilledMob as
              | { mobLevel?: number | string; level?: number | string }
              | null
              | undefined
          )?.mobLevel ??
          (
            latestKilledMob as
              | { mobLevel?: number | string; level?: number | string }
              | null
              | undefined
          )?.level ??
          mainThreat?.mob?.level ??
          1,
        1,
      ),
    ),
  );

  const activeMobFullBodyImage = isCombatViewSynchronizing
    ? null
    : hasConfirmedActiveMob
      ? (getMobFullBodyImage(activeMobName) ??
        getMobPortraitImage(activeMobName))
      : null;

  const rawActiveMobMaxHp = showActiveSession
    ? isCombatViewSynchronizing
      ? 0
      : hasConfirmedActiveMob
        ? (visualRealtimeCombat?.mobMaxHp ??
          statusActiveMob?.maxHp ??
          statusActiveMob?.hp ??
          activeMobThreat?.mob?.hp ??
          0)
        : 0
    : (activeMobThreat?.mob?.hp ?? mainThreat?.mob?.hp ?? 0);

  const activeMobMaxHp = Math.max(0, toSafeNumber(rawActiveMobMaxHp, 0));

  const rawActiveMobCurrentHp = isCombatViewSynchronizing
    ? 0
    : showActiveSession && visualRealtimeCombat?.mobCurrentHp !== undefined
      ? visualRealtimeCombat.mobCurrentHp
      : showActiveSession && statusActiveMob?.currentHp !== undefined
        ? statusActiveMob.currentHp
        : showActiveSession && hasConfirmedActiveMob
          ? Math.max(0, activeMobMaxHp)
          : showActiveSession
            ? 0
            : activeMobMaxHp;

  const activeMobCurrentHp = clampNumber(
    rawActiveMobCurrentHp,
    0,
    activeMobMaxHp,
  );

  const activeMobHpPercent =
    activeMobMaxHp > 0 ? (activeMobCurrentHp / activeMobMaxHp) * 100 : 0;

  const activeMobHpStyle = {
    width: `${clampPercent(activeMobHpPercent)}%`,
  } as CSSProperties;

  const activeBattleProgressSource =
    statusActiveMob?.battleProgress ??
    effectiveStatus?.battleProgress ??
    effectiveSession?.battleProgress ??
    null;
  const visualBattleProgress = visualRealtimeCombat as
    | {
        battleProgressSeconds?: number | string | null;
        battleProgressPercent?: number | string | null;
        estimatedKillTimeSeconds?: number | string | null;
        killsPerMinute?: number | string | null;
        killsPerHour?: number | string | null;
        difficultyLabel?: string | null;
        updatedAt?: number | string | null;
      }
    | null
    | undefined;
  const activeEstimatedKillTimeSeconds = Math.max(
    0,
    toSafeNumber(
      visualBattleProgress?.estimatedKillTimeSeconds ??
        activeBattleProgressSource?.estimatedKillTimeSeconds,
      0,
    ),
  );
  const activeKillProgressSnapshotSeconds = clampNumber(
    toSafeNumber(
      visualBattleProgress?.battleProgressSeconds ??
        activeBattleProgressSource?.progressSeconds,
      0,
    ),
    0,
    activeEstimatedKillTimeSeconds || Number.MAX_SAFE_INTEGER,
  );
  const activeBattleProgressAnchorMs =
    toSafeNumber(visualBattleProgress?.updatedAt, 0) ||
    getAutoCombatTimestampMs(
      activeTimerStatus?.serverNow ?? effectiveStatus?.serverNow,
    ) ||
    sessionClockNowMs;
  const activeBattleProgressClockMs =
    toSafeNumber(visualBattleProgress?.updatedAt, 0)
      ? sessionClockNowMs
      : syncedSessionNowMs;
  const activeKillProgressElapsedSeconds =
    activeEstimatedKillTimeSeconds > 0 &&
    showActiveSession &&
    !isCombatViewSynchronizing
      ? Math.max(
          0,
          (activeBattleProgressClockMs - activeBattleProgressAnchorMs) / 1000,
        )
      : 0;
  const activeKillProgressCeilingSeconds =
    activeEstimatedKillTimeSeconds > 0
      ? activeEstimatedKillTimeSeconds * 0.995
      : Number.MAX_SAFE_INTEGER;
  const activeKillProgressSeconds = clampNumber(
    activeKillProgressSnapshotSeconds + activeKillProgressElapsedSeconds,
    0,
    activeKillProgressCeilingSeconds,
  );
  const activeKillProgressPercent =
    activeEstimatedKillTimeSeconds > 0
      ? clampPercent(
          (activeKillProgressSeconds / activeEstimatedKillTimeSeconds) * 100,
        )
      : activeMobHpPercent;
  const hasTtkBattleProgress =
    showActiveSession && activeEstimatedKillTimeSeconds > 0;
  const activeKillRemainingSeconds = hasTtkBattleProgress
    ? clampNumber(
        activeEstimatedKillTimeSeconds - activeKillProgressSeconds,
        0,
        activeEstimatedKillTimeSeconds,
      )
    : 0;
  const activeKillRemainingPercent = hasTtkBattleProgress
    ? clampPercent(100 - activeKillProgressPercent)
    : clampPercent(activeMobHpPercent);
  const activeBattleProgressStyle = {
    width: `${activeKillRemainingPercent}%`,
  } as CSSProperties;
  const formatTtkSeconds = (value: number) =>
    value >= 10 ? `${Math.round(value)}s` : `${value.toFixed(1)}s`;
  const activeKillProgressLabel = hasTtkBattleProgress
    ? `${formatTtkSeconds(activeKillRemainingSeconds)} restantes`
    : "Aguardando";
  const activeKillsPerMinute = toSafeNumber(
    visualBattleProgress?.killsPerMinute ??
      activeBattleProgressSource?.killsPerMinute,
    0,
  );
  const activeDifficultyLabel =
    visualBattleProgress?.difficultyLabel ??
    activeBattleProgressSource?.difficultyLabel ??
    null;
  const activeBatchTotalEstimatedSeconds =
    hasTtkBattleProgress && activeBattleTargetTotal > 0
      ? activeBattleTargetTotal * activeEstimatedKillTimeSeconds
      : 0;
  const activeBatchRemainingEstimatedSeconds =
    hasTtkBattleProgress && activeBattleTargetRemaining > 0
      ? Math.max(0, activeBattleTargetRemaining - 1) *
          activeEstimatedKillTimeSeconds +
        activeKillRemainingSeconds
      : 0;
  const activeBatchElapsedEstimatedSeconds =
    activeBatchTotalEstimatedSeconds > 0
      ? clampNumber(
          activeBatchTotalEstimatedSeconds -
            activeBatchRemainingEstimatedSeconds,
          0,
          activeBatchTotalEstimatedSeconds,
        )
      : 0;
  const activeBatchElapsedLabel =
    activeBatchTotalEstimatedSeconds > 0
      ? formatSeconds(activeBatchElapsedEstimatedSeconds)
      : "Calculando";
  const activeBatchTotalLabel =
    activeBatchTotalEstimatedSeconds > 0
      ? formatSeconds(activeBatchTotalEstimatedSeconds)
      : null;
  const activeBattleRateLabel =
    activeKillsPerMinute > 0
      ? `${activeKillsPerMinute.toFixed(1)} abates/min`
      : "Calculando ritmo";
  const activeBattleBatchLabel =
    activeBattleTargetTotal > 0
      ? `${activeBattleTargetDefeated}/${activeBattleTargetTotal} abatidos`
      : "Batalha em andamento";

  const activeMobReference = showActiveSession
    ? isCombatViewSynchronizing
      ? "Sincronizando"
      : visualRealtimeCombat?.combatIndex
        ? `Combate ${visualRealtimeCombat.combatIndex}${
            visualRealtimeCombat.round
              ? ` · Rodada ${visualRealtimeCombat.round}`
              : ""
          }`
        : effectiveStatus?.session?.currentCombatIndex
          ? `Combate ${effectiveStatus.session.currentCombatIndex}${
              effectiveStatus.session.currentRound
                ? ` · Rodada ${effectiveStatus.session.currentRound}`
                : ""
            }`
          : activeMobThreat?.mob
            ? `Nv. ${activeMobThreat.mob.level}`
            : mainThreat?.mob
              ? `Nv. ${mainThreat.mob.level}`
              : latestKilledMob
                ? `${latestKilledMob.kills} abate(s)`
                : "—"
    : activeMobThreat?.mob
      ? `Nv. ${activeMobThreat.mob.level}`
      : mainThreat?.mob
        ? `Nv. ${mainThreat.mob.level}`
        : "—";

  const sessionStatusText = showActiveSession
    ? (effectiveStatus?.sessionSummary?.statusText ??
      formatSessionStatus(effectiveSession?.status))
    : "Sem sessão ativa";

  const totalKills = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.totalKills ??
        effectiveStatus?.sessionSummary?.mobs?.totalKills ??
        effectiveSession?.totalCombatsResolved ??
        effectiveSession?.totalKills ??
        effectiveStatus?.rewards?.mobs?.reduce((total, mob) => {
          return total + mob.kills;
        }, 0) ??
        visualRealtimeCombat?.totalKills ??
        0,
    ),
  );

  const currentCombatIndex = Math.max(
    1,
    Math.floor(
      visibleSessionTotals?.currentCombatIndex ??
        effectiveSession?.currentCombatIndex ??
        visualRealtimeCombat?.combatIndex ??
        totalKills + 1,
    ),
  );

  const totalCombats = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.totalCombats ??
        effectiveStatus?.sessionSummary?.combat?.totalCombats ??
        effectiveSession?.totalCombatsResolved ??
        effectiveSession?.totalCombats ??
        totalKills ??
        visualRealtimeCombat?.totalCombats ??
        0,
    ),
  );

  const totalXpGained = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.totalXpGained ??
        effectiveStatus?.sessionSummary?.progression?.totalXpGained ??
        effectiveSession?.totalXpGained ??
        visualRealtimeCombat?.totalXpGained ??
        0,
    ),
  );

  const baseXpGained = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.baseXpGained ??
        effectiveStatus?.sessionSummary?.progression?.baseXpGained ??
        effectiveSession?.baseXpGained ??
        visualRealtimeCombat?.baseXpGained ??
        0,
    ),
  );

  const premiumBonusXp = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.premiumBonusXp ??
        effectiveStatus?.sessionSummary?.progression?.premiumBonusXp ??
        effectiveSession?.premiumBonusXp ??
        visualRealtimeCombat?.premiumBonusXp ??
        0,
    ),
  );

  const premiumPotentialBonusXp = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.premiumPotentialBonusXp ??
        effectiveStatus?.sessionSummary?.progression?.premiumPotentialBonusXp ??
        effectiveSession?.premiumPotentialBonusXp ??
        visualRealtimeCombat?.premiumPotentialBonusXp ??
        0,
    ),
  );

  const premiumTotalXp = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.premiumTotalXp ??
        effectiveStatus?.sessionSummary?.progression?.premiumTotalXp ??
        effectiveSession?.premiumTotalXp ??
        visualRealtimeCombat?.premiumTotalXp ??
        baseXpGained + Math.max(premiumBonusXp, premiumPotentialBonusXp),
    ),
  );

  const isPremiumActive = Boolean(
    visibleSessionTotals?.isPremiumActive ??
    effectiveStatus?.sessionSummary?.progression?.isPremiumActive ??
    effectiveSession?.isPremiumActive ??
    visualRealtimeCombat?.isPremiumActive ??
    false,
  );

  const normalizedSessionXp = normalizeSessionXpBreakdown({
    totalXpGained,
    baseXpGained,
    premiumBonusXp,
    premiumPotentialBonusXp,
    premiumTotalXp,
    isPremiumActive,
  });

  const totalLoot = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.totalLoot ??
        effectiveStatus?.sessionSummary?.loot?.totalQuantity ??
        effectiveSession?.totalLoot ??
        effectiveStatus?.rewards?.loots?.reduce((total, loot) => {
          return total + loot.quantity;
        }, 0) ??
        visualRealtimeCombat?.totalLoot ??
        0,
    ),
  );

  const potionsUsed = Math.max(
    0,
    Math.floor(
      visibleSessionTotals?.potionsUsed ??
        effectiveStatus?.sessionSummary?.potions?.used ??
        effectiveSession?.totalPotionsUsed ??
        effectiveSession?.potionsUsed ??
        visualRealtimeCombat?.potionsUsed ??
        0,
    ),
  );
  const huntingSnapshot = effectiveStatus?.hunting ?? null;
  const huntingSkill =
    effectiveStatus?.huntingSkill ?? huntingSnapshot?.skill ?? null;
  const foundEnemiesCount = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        huntingSnapshot?.foundEnemiesCount ??
          effectiveSession?.foundEnemiesCount,
        0,
      ),
    ),
  );
  const maxTrackedEnemies = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        huntingSnapshot?.maxTrackedEnemies ??
          effectiveStatus?.huntCapacity?.maxTrackedEnemies ??
          effectiveStatus?.huntBatch?.maxTrackedEnemies ??
          effectiveSession?.maxTrackedEnemies ??
          huntingSkill?.maxTrackedEnemies,
        0,
      ),
    ),
  );
  const remainingHuntCapacity = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        huntingSnapshot?.remainingCapacity ??
          effectiveStatus?.huntCapacity?.remainingCapacity ??
          effectiveStatus?.huntBatch?.remainingCapacity ??
          effectiveSession?.remainingHuntCapacity,
        maxTrackedEnemies > 0 ? maxTrackedEnemies - foundEnemiesCount : 0,
      ),
    ),
  );
  const isHuntLimitReached = Boolean(
    huntingSnapshot?.isLimitReached ??
    effectiveStatus?.huntCapacity?.isLimitReached ??
    effectiveStatus?.huntBatch?.isLimitReached ??
    effectiveSession?.isHuntLimitReached ??
    (maxTrackedEnemies > 0 && foundEnemiesCount >= maxTrackedEnemies),
  );
  const huntingCapacityLabel =
    maxTrackedEnemies > 0
      ? `${foundEnemiesCount} / ${maxTrackedEnemies}`
      : `${foundEnemiesCount}`;
  const huntingLevel = Math.max(
    1,
    Math.floor(
      toSafeNumber(
        huntingSkill?.level ?? effectiveSession?.huntingLevelAtStart,
        1,
      ),
    ),
  );
  const huntingXpProgressPercent = Math.max(
    0,
    Math.min(100, Math.floor(toSafeNumber(huntingSkill?.xpProgressPercent, 0))),
  );
  const trackedEncounter =
    huntingSnapshot?.currentTarget ??
    huntingSnapshot?.targetEncounter ??
    effectiveStatus?.selectedEncounter ??
    null;
  const trackedThreatMob = trackedEncounter?.mob ?? null;
  const trackedThreatImage =
    getMobFullBodyImage(trackedThreatMob?.name) ??
    getMobPortraitImage(trackedThreatMob?.name);
  const trackedThreatFoundCount = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        huntingSnapshot?.targetFoundCount ??
          huntingSnapshot?.currentTargetFoundCount ??
          trackedEncounter?.huntFoundCount ??
          trackedEncounter?.foundCount ??
          trackedThreatMob?.huntFoundCount ??
          trackedThreatMob?.foundCount,
        0,
      ),
    ),
  );
  const shouldUseTrackedThreatCards =
    isBackendEncounterReadyPhase || showInlineHuntBattle;
  const trackedMonstersForSelection: AutoCombatTrackedMonsterViewModel[] = (
    effectiveStatus?.trackedMonsters ??
    effectiveStatus?.huntBatch?.mobs ??
    effectiveStatus?.rewards?.trackedMonsters ??
    huntingSnapshot?.trackedMonsters ??
    []
  ).filter((trackedMonster) => {
    const remainingCount = Math.max(
      0,
      Math.floor(
        toSafeNumber(
          trackedMonster.remainingCount ?? trackedMonster.foundCount,
          0,
        ),
      ),
    );

    return remainingCount > 0;
  });
  const trackedThreatRemainingCount = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        trackedThreatMob?.id || trackedEncounter?.id
          ? trackedMonstersForSelection.find((trackedMonster) => {
              return (
                trackedMonster.mobId === trackedThreatMob?.id ||
                trackedMonster.encounterId === trackedEncounter?.id
              );
            })?.remainingCount
          : null,
        0,
      ),
    ),
  );
  const trackedThreatDisplayCount =
    shouldUseTrackedThreatCards && trackedThreatRemainingCount > 0
      ? trackedThreatRemainingCount
      : trackedThreatFoundCount;
  const shouldShowTrackedThreatFoundCount =
    shouldUseTrackedThreatCards && trackedThreatDisplayCount > 0;
  const huntFoundCountByMobId = new Map<string, number>();

  for (const trackedMonster of trackedMonstersForSelection) {
    const safeRemainingCount = Math.max(
      0,
      Math.floor(
        toSafeNumber(
          trackedMonster.remainingCount ?? trackedMonster.foundCount,
          0,
        ),
      ),
    );

    if (!trackedMonster.mobId || safeRemainingCount <= 0) {
      continue;
    }

    huntFoundCountByMobId.set(
      trackedMonster.mobId,
      Math.max(
        huntFoundCountByMobId.get(trackedMonster.mobId) ?? 0,
        safeRemainingCount,
      ),
    );
  }

  if (!shouldUseTrackedThreatCards) {
    for (const foundMob of effectiveStatus?.sessionSummary?.mobs?.found ?? []) {
      const safeFoundCount = Math.max(
        0,
        Math.floor(toSafeNumber(foundMob.foundCount, 0)),
      );

      if (!foundMob.mobId || safeFoundCount <= 0) {
        continue;
      }

      huntFoundCountByMobId.set(
        foundMob.mobId,
        Math.max(
          huntFoundCountByMobId.get(foundMob.mobId) ?? 0,
          safeFoundCount,
        ),
      );
    }
  }

  if (
    !shouldUseTrackedThreatCards &&
    trackedThreatMob?.id &&
    trackedThreatFoundCount > 0
  ) {
    huntFoundCountByMobId.set(
      trackedThreatMob.id,
      Math.max(
        huntFoundCountByMobId.get(trackedThreatMob.id) ?? 0,
        trackedThreatFoundCount,
      ),
    );
  }
  const displayedThreats = (
    shouldUseTrackedThreatCards
      ? trackedMonstersForSelection.map((trackedMonster) => {
        const matchingEncounter = selectedMapThreats.find((encounter) => {
          return (
            encounter.id === trackedMonster.encounterId ||
            encounter.mobId === trackedMonster.mobId
          );
        });
        const trackedMob = trackedMonster.mob;
        const safeMobId =
          trackedMonster.mobId ?? trackedMob?.id ?? matchingEncounter?.mobId;
        const safeEncounterId =
          trackedMonster.encounterId ??
          matchingEncounter?.id ??
          safeMobId ??
          "tracked-threat";
        const safeRemainingCount = Math.max(
          0,
          Math.floor(
            toSafeNumber(
              trackedMonster.remainingCount ?? trackedMonster.foundCount,
              0,
            ),
          ),
        );

        return {
          ...(matchingEncounter ?? {
            id: safeEncounterId,
            subMapId: selectedMap?.subMaps?.[0]?.id ?? "",
            mobId: safeMobId ?? safeEncounterId,
            weight: trackedMonster.weightSnapshot ?? 100,
            isActive: true,
          }),
          id: safeEncounterId,
          mobId: safeMobId ?? safeEncounterId,
          foundCount: safeRemainingCount,
          huntFoundCount: safeRemainingCount,
          mob:
            matchingEncounter?.mob ??
            (trackedMob
              ? {
                  id: trackedMob.id ?? safeMobId ?? safeEncounterId,
                  name: trackedMob.name ?? trackedMonster.mobName,
                  description: trackedMob.description ?? null,
                  level: trackedMob.level ?? trackedMonster.mobLevel ?? 1,
                  tier: trackedMob.tier ?? trackedMonster.mobTier ?? 1,
                  hp: trackedMob.hp ?? trackedMob.maxHp ?? 1,
                  attack: trackedMob.attack ?? 0,
                  defense: trackedMob.defense ?? 0,
                  speed: trackedMob.speed ?? 0,
                  xpReward: trackedMob.xpReward ?? 0,
                  currentHp: trackedMob.currentHp ?? trackedMob.hp ?? null,
                  maxHp: trackedMob.maxHp ?? trackedMob.hp ?? null,
                  hpPercent: trackedMob.hpPercent ?? null,
                  foundCount: safeRemainingCount,
                  huntFoundCount: safeRemainingCount,
                  iconUrl: trackedMob.iconUrl ?? null,
                  imageUrl: trackedMob.imageUrl ?? null,
                  assetKey: trackedMob.assetKey ?? null,
                  drops: [],
                }
              : null),
        } as AutoCombatEncounterViewModel;
      })
      : selectedMapThreats
  ).sort(compareAutoCombatThreatsByProgression);
  const selectedThreatRemainingCount = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        selectedThreatMob?.id
          ? huntFoundCountByMobId.get(selectedThreatMob.id)
          : null,
        selectedThreatDetails?.huntFoundCount ??
          selectedThreatDetails?.foundCount ??
          selectedThreatMob?.huntFoundCount ??
          selectedThreatMob?.foundCount ??
          0,
      ),
    ),
  );
  const normalizedSelectedBattleQuantity =
    selectedThreatRemainingCount > 0
      ? clampNumber(selectedBattleQuantity, 1, selectedThreatRemainingCount)
      : 1;
  const canBattleSelectedThreat =
    isBackendEncounterReadyPhase && selectedThreatRemainingCount > 0;
  const huntingTargetSequence = Math.max(
    1,
    Math.floor(
      toSafeNumber(
        huntingSnapshot?.currentTargetSequence ??
          huntingSnapshot?.foundEnemySequence ??
          foundEnemiesCount,
        foundEnemiesCount > 0 ? foundEnemiesCount : 1,
      ),
    ),
  );
  const huntingSecondsPerFind = Math.max(
    1,
    Math.floor(
      toSafeNumber(
        huntingSnapshot?.secondsPerFind ??
          huntingSnapshot?.secondsPerEnemy ??
          huntingSkill?.secondsPerEnemy,
        12,
      ),
    ),
  );
  const huntStartedAtMs =
    getAutoCombatTimestampMs(
      huntingSnapshot?.startedAt ??
        effectiveSession?.huntStartedAt ??
        effectiveSession?.startedAt,
    ) ?? syncedSessionNowMs;
  const huntLastFindAtMs =
    getAutoCombatTimestampMs(
      huntingSnapshot?.lastFindAt ??
        huntingSnapshot?.lastProcessedAt ??
        effectiveSession?.lastHuntProcessedAt,
    ) ?? huntStartedAtMs;
  const huntNextFindAtMs = getAutoCombatTimestampMs(
    huntingSnapshot?.nextFindAt,
  );
  const hasAuthoritativeHuntWindow =
    huntNextFindAtMs !== null &&
    huntNextFindAtMs > huntLastFindAtMs &&
    huntLastFindAtMs > 0;
  const huntingWindowSeconds = hasAuthoritativeHuntWindow
    ? Math.max(1, Math.round((huntNextFindAtMs - huntLastFindAtMs) / 1000))
    : huntingSecondsPerFind;
  const huntElapsedSinceLastSeconds = Math.max(
    0,
    hasAuthoritativeHuntWindow
      ? Math.floor((syncedSessionNowMs - huntLastFindAtMs) / 1000)
      : Math.floor(
          toSafeNumber(
            huntingSnapshot?.elapsedSeconds,
            (syncedSessionNowMs - huntLastFindAtMs) / 1000,
          ),
        ),
  );
  const hasPendingHuntProcessing =
    !isBackendEncounterReadyPhase &&
    huntElapsedSinceLastSeconds >= huntingWindowSeconds;
  const huntCycleElapsedSeconds = hasPendingHuntProcessing
    ? huntingWindowSeconds
    : huntElapsedSinceLastSeconds;
  const huntProgressPercent = showInlineHuntBattle
    ? activeBattleTargetTotal > 0
      ? clampNumber(
          (activeBattleTargetDefeated / activeBattleTargetTotal) * 100,
          0,
          100,
        )
      : 0
    : isBackendEncounterReadyPhase
      ? 100
      : clampNumber(
          (huntCycleElapsedSeconds / huntingWindowSeconds) * 100,
          0,
          100,
        );
  const huntRemainingSeconds = isBackendEncounterReadyPhase
    ? 0
    : hasPendingHuntProcessing
      ? 0
      : hasAuthoritativeHuntWindow
        ? Math.max(1, Math.ceil((huntNextFindAtMs - syncedSessionNowMs) / 1000))
        : Math.max(
            1,
            Math.ceil(huntingWindowSeconds - huntCycleElapsedSeconds),
          );
  const huntTotalElapsedSeconds = Math.max(
    0,
    Math.floor((syncedSessionNowMs - huntStartedAtMs) / 1000),
  );
  const huntingXpGained = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        huntingSnapshot?.huntingXpGained ??
          effectiveStatus?.huntBatch?.huntingXpGained ??
          effectiveSession?.huntingXpGained,
        0,
      ),
    ),
  );
  const huntingXpPerSecond =
    huntTotalElapsedSeconds > 0
      ? huntingXpGained / huntTotalElapsedSeconds
      : 0;
  const huntingXpPerSecondLabel =
    huntingXpPerSecond >= 10
      ? huntingXpPerSecond.toFixed(1)
      : huntingXpPerSecond.toFixed(2);
  const huntingFoundLabel = foundEnemiesCount.toLocaleString("pt-BR");
  const huntingRemainingLabel = remainingHuntCapacity.toLocaleString("pt-BR");
  const huntProgressStatusText = showInlineHuntBattle
    ? activeBattleTargetTotal > 0
      ? `${activeBattleTargetDefeated}/${activeBattleTargetTotal} abatidos`
      : "Batalha em andamento"
    : isHuntLimitReached
      ? "Limite do mapa atingido"
      : isBackendEncounterReadyPhase
        ? "Ameaça pronta para combate"
        : hasPendingHuntProcessing
          ? "Confirmando rastreio..."
          : `Próximo rastreio em ${huntRemainingSeconds}s`;
  const huntProgressStyle = {
    "--hunt-progress": `${huntProgressPercent}%`,
  } as CSSProperties;
  const huntingSkillProgressStyle = {
    "--hunt-skill-progress": `${huntingXpProgressPercent}%`,
  } as CSSProperties;
  const huntingSkillCurrentXp = Math.max(
    0,
    Math.floor(toSafeNumber(huntingSkill?.xp, 0)),
  );
  const huntingSkillXpToNext = Math.max(
    0,
    Math.floor(toSafeNumber(huntingSkill?.xpToNextLevel, 0)),
  );
  const huntingSkillXpLabel = huntingSkill?.isAtLevelCap
    ? "Nível máximo"
    : huntingSkillXpToNext > 0
      ? `${huntingSkillCurrentXp} / ${huntingSkillXpToNext} XP`
      : `${huntingXpProgressPercent}% do nível`;
  const huntingSpeedPercent = Math.max(
    0,
    Math.floor(toSafeNumber(huntingSkill?.bonuses?.speedPercent, 0)),
  );
  const huntingSpeedLabel =
    huntingSpeedPercent > 0
      ? `${huntingSpeedPercent}% mais rápida`
      : `${huntingSecondsPerFind}s por rastreio`;
  const huntingActivityTitle = showInlineHuntBattle
    ? "Combatendo lote"
    : isBackendEncounterReadyPhase
      ? "Ameaça localizada"
      : hasPendingHuntProcessing
        ? "Confirmando rastreio"
        : isBackendHuntingPhase
          ? "Caça em andamento"
          : "Preparando caça";
  const huntingActivityDetail = showInlineHuntBattle
    ? activeBattleTargetTotal > 0
      ? `${activeMobName} • ${activeBattleTargetRemaining}/${activeBattleTargetTotal} restantes`
      : activeMobName
    : trackedThreatMob?.name
      ? `${trackedThreatMob.name} #${huntingTargetSequence}`
      : isBackendHuntingPhase
        ? "Rastreando rota"
        : "Nenhum alvo confirmado";

  const autoCombatTopBarActivityOverride: DashboardTopBarActivityOverride | null =
    showInlineHuntBattle
      ? {
          kind: "auto-combat",
          title: activeMobName,
          subtitle:
            activeBattleTargetTotal > 0
              ? `${activeBattleTargetDefeated}/${activeBattleTargetTotal} abatidos do lote`
              : sessionStatusText,
          imageUrl: getMobPortraitImage(activeMobName),
          icon: "AC",
          progressPercent: hasTtkBattleProgress
            ? activeKillProgressPercent
            : activeMobHpPercent,
          badge:
            activeBattleTargetRemaining > 0
              ? `${activeBattleTargetRemaining}`
              : null,
          titleText:
            activeBattleTargetTotal > 0
              ? `Combate automatico em andamento - ${activeBattleTargetDefeated}/${activeBattleTargetTotal} abatidos do lote.`
              : "Combate automatico em andamento.",
        }
      : isBackendHuntingPhase || isBackendEncounterReadyPhase
        ? {
            kind: "auto-combat",
            title: isBackendEncounterReadyPhase
              ? "AmeaÃ§as rastreadas"
              : "Rastreando",
            subtitle:
              foundEnemiesCount > 0
                ? `${foundEnemiesCount} rastreado${foundEnemiesCount === 1 ? "" : "s"}`
                : huntingActivityDetail,
            icon: "AC",
            progressPercent: huntProgressPercent,
            badge: foundEnemiesCount > 0 ? `${foundEnemiesCount}` : null,
            titleText:
              foundEnemiesCount > 0
                ? `AutoCombat em caca - ${foundEnemiesCount} rastreado${foundEnemiesCount === 1 ? "" : "s"}.`
                : "AutoCombat em caca - rastreando rota.",
            isHunting: true,
          }
        : null;

  const canResumeHunt =
    isBackendEncounterReadyPhase &&
    !isHuntLimitReached &&
    !showActiveSession &&
    characterHasHp;

  const canStartHunt =
    !overview?.activity?.hasActiveWorldBoss &&
    Boolean(selectedMap) &&
    selectedMapIsUnlocked &&
    characterHasHp &&
    (!hasActiveSession || canResumeHunt);

  const canTravelToSelectedMap =
    !overview?.activity?.hasActiveWorldBoss &&
    Boolean(selectedMap) &&
    selectedMapIsUnlocked &&
    !hasActiveSession;

  const canStartCombat =
    !isBackendEncounterReadyPhase &&
    selectedMapHasActiveEncounters &&
    !showActiveSession &&
    !isActionLoading &&
    characterHasHp;
  const activeVisualEventType = normalizeRealtimeEventType(
    providerPublicActiveEvent?.type ?? visualRealtimeCombat?.lastEventType,
  );

  const latestRealtimeEvent = showActiveSession
    ? (activeBattleLogEvent ?? battleLogEvents[0] ?? null)
    : null;

  const latestRealtimeEventType = normalizeRealtimeEventType(
    latestRealtimeEvent?.type ?? visualRealtimeCombat?.lastEventType,
  );

  const isAutoRestingVisual =
    showActiveSession && latestRealtimeEventType === "AUTO_REST";

  const autoRestHealedAmount = isAutoRestingVisual
    ? Math.max(0, Math.floor(Number(latestRealtimeEvent?.healedAmount ?? 0)))
    : 0;

  const isMobDefeatedVisual =
    showActiveSession &&
    (activeVisualEventType === "MOB_DEFEATED" ||
      (activeMobMaxHp > 0 && activeMobCurrentHp <= 0));

  const isPlayerDefeatedVisual =
    showActiveSession &&
    (activeVisualEventType === "PLAYER_DEFEATED" ||
      (currentCharacterMaxHp > 0 && currentCharacterHp <= 0));

  const realtimeFeedbackEvent = showActiveSession ? activeBattleLogEvent : null;
  const realtimeFeedbackTarget = getRealtimeFeedbackTarget(
    realtimeFeedbackEvent,
  );
  const latestDamageAmount = getRealtimeFeedbackDamage(realtimeFeedbackEvent);
  const isRealtimeFeedbackCritical = Boolean(realtimeFeedbackEvent?.isCritical);
  const isRealtimeFeedbackDodged = Boolean(
    realtimeFeedbackEvent?.isDodged ||
    normalizeRealtimeEventType(realtimeFeedbackEvent?.type) === "DODGE",
  );
  const realtimeFeedbackEventKey = realtimeFeedbackEvent
    ? getRealtimeEventKey(realtimeFeedbackEvent)
    : "";

  const canShowFloatingDamage =
    showActiveSession &&
    Boolean(realtimeFeedbackEvent) &&
    latestDamageAmount > 0;

  const shouldShowPlayerDamage =
    canShowFloatingDamage && realtimeFeedbackTarget === "PLAYER";

  const shouldShowMobDamage =
    canShowFloatingDamage && realtimeFeedbackTarget === "MOB";

  const shouldShowPlayerDodge =
    showActiveSession &&
    Boolean(realtimeFeedbackEvent) &&
    realtimeFeedbackTarget === "PLAYER" &&
    isRealtimeFeedbackDodged;

  const shouldShowMobDodge =
    showActiveSession &&
    Boolean(realtimeFeedbackEvent) &&
    realtimeFeedbackTarget === "MOB" &&
    isRealtimeFeedbackDodged;

  const playerDamageKey = shouldShowPlayerDamage
    ? `player-damage-${realtimeFeedbackEventKey}`
    : "";

  const mobDamageKey = shouldShowMobDamage
    ? `mob-damage-${realtimeFeedbackEventKey}`
    : "";

  const xpFeedbackBreakdown = getXpFeedbackBreakdown(xpFeedbackEvent);
  const xpFeedbackMobScope = getMobFeedbackScopeFromEvent(xpFeedbackEvent);
  const xpFeedbackMatchesVisibleMob =
    !hasUsefulMobFeedbackScope(xpFeedbackMobScope) ||
    !hasUsefulMobFeedbackScope(visibleMobFeedbackScope) ||
    !hasMobFeedbackScopeMismatch(xpFeedbackMobScope, visibleMobFeedbackScope);
  const shouldShowXpFeedback =
    showActiveSession &&
    xpFeedbackMatchesVisibleMob &&
    Boolean(xpFeedbackBreakdown && xpFeedbackEvent);
  const xpFeedbackKey =
    shouldShowXpFeedback && xpFeedbackEvent
      ? `mob-xp-${getXpFeedbackDisplayKey(xpFeedbackEvent)}`
      : "";
  const xpFeedbackPremiumXp = xpFeedbackBreakdown?.isPremiumActive
    ? xpFeedbackBreakdown.premiumBonusXp
    : (xpFeedbackBreakdown?.premiumPotentialBonusXp ?? 0);
  const shouldShowMobDeathFeedback = shouldShowXpFeedback;
  const mobDeathFeedbackKey =
    shouldShowMobDeathFeedback && xpFeedbackEvent
      ? `mob-defeated-${getXpFeedbackDisplayKey(xpFeedbackEvent)}`
      : "";

  const playerFighterClassName = [
    "auto-combat-fighter-card",
    "auto-combat-fighter-card--player",
    shouldShowPlayerDamage ? "is-hit" : "",
    shouldShowPlayerDamage && isRealtimeFeedbackCritical
      ? "is-critical-hit"
      : "",
    shouldShowPlayerDodge ? "is-dodging" : "",
    isAutoRestingVisual ? "is-resting" : "",
    isPlayerDefeatedVisual ? "is-defeated" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const mobFighterClassName = [
    "auto-combat-fighter-card",
    "auto-combat-fighter-card--mob",
    shouldShowMobDamage ? "is-hit" : "",
    shouldShowMobDamage && isRealtimeFeedbackCritical ? "is-critical-hit" : "",
    shouldShowMobDodge ? "is-dodging" : "",
    isMobDefeatedVisual ? "is-defeated" : "",
    isCombatViewSynchronizing ? "is-syncing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const configuredPotionQuantity = getPotionQuantity(
    currentPotionConfig,
    availablePotions,
  );

  function getPotionHealLabel(
    potion: PotionEquipmentItem | PotionInventoryOption | null | undefined,
  ) {
    if (!potion) {
      return "Cura não informada";
    }

    const formattedHeal = formatPotionHeal(potion).trim();

    if (!formattedHeal) {
      return "Cura não informada";
    }

    if (/^cura\b/i.test(formattedHeal)) {
      return formattedHeal.replace(/^cura\s*/i, "Cura: ");
    }

    return `Cura: ${formattedHeal}`;
  }

  function handleMapChange(mapId: string) {
    if (isMapSelectionLocked) {
      setErrorMessage(
        "Você não pode trocar de mapa enquanto está caçando ou em combate. Cancele ou encerre a atividade atual antes de viajar.",
      );
      return;
    }

    setSelectedMapId(mapId);
    setHasStartedHunt(false);
    setErrorMessage("");
  }

  async function handleTravelToMap() {
    if (!characterId || !overview || !selectedMap || isActionLoading) {
      return;
    }

    if (overview?.activity?.hasActiveWorldBoss) {
      setErrorMessage(
        "Você está aguardando um World Boss. Saia do lobby antes de viajar para outra rota de caça.",
      );
      return;
    }

    if (!selectedMapIsUnlocked) {
      setErrorMessage(
        `Este mapa libera no nível ${getGameMapMinLevel(selectedMap)}.`,
      );
      return;
    }

    if (!canTravelToSelectedMap) {
      setErrorMessage(
        "Não foi possível viajar com a seleção atual. Verifique se já existe uma atividade ativa.",
      );
      return;
    }

    const currentMapId =
      overview.character.currentMap?.id ??
      overview.character.map?.id ??
      overview.progression?.currentMap?.id ??
      null;

    try {
      setIsActionLoading(true);
      setErrorMessage("");

      if (selectedMap.id !== currentMapId) {
        const updatedOverview = await updateCharacterCurrentMap(
          characterId,
          selectedMap.id,
        );

        setOverview(updatedOverview);
      }

      setHasStartedHunt(true);
      setActiveTab("battle");
      setIsStopHuntConfirmOpen(false);
    } catch (error) {
      setIsStopHuntConfirmOpen(false);
      setErrorMessage(
        getApiErrorMessage(
          error,
          "Não foi possível viajar para este mapa agora.",
        ),
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleStartHunt() {
    if (!characterId || !selectedMap?.id || isActionLoading) return;

    if (overview?.activity?.hasActiveWorldBoss) {
      setErrorMessage(
        "Você está aguardando um World Boss. Saia do lobby antes de iniciar auto-combate.",
      );
      return;
    }

    if (!characterHasHp) {
      setErrorMessage(
        "Este personagem está sem HP. Use a enfermaria ou uma cura antes de iniciar uma nova caça.",
      );
      return;
    }

    if (!selectedMap) {
      setErrorMessage("Nenhum mapa disponível para o nível atual.");
      return;
    }

    if (!selectedMapIsUnlocked) {
      setErrorMessage(
        `Este mapa libera no nível ${getGameMapMinLevel(selectedMap)}.`,
      );
      return;
    }

    if (!canStartHunt) {
      setErrorMessage(
        isHuntLimitReached
          ? "Limite de rastreio atingido neste mapa. Inicie o combate para liberar a caça."
          : "Não foi possível iniciar a caça com a seleção atual.",
      );
      return;
    }

    try {
      setIsActionLoading(true);
      setErrorMessage("");

      setLocalRealtimeCombat(null);
      setLocalCharacterProgress(null);
      setLocalSessionTotals(null);
      setLocalBattleLogEvents([]);
      setLocalActiveEvent(null);

      const response = realtimeActions.start
        ? await realtimeActions.start({
            characterId,
            mapId: selectedMap.id,
          })
        : realtimeActions.startAutoCombat
          ? await realtimeActions.startAutoCombat({
              characterId,
              mapId: selectedMap.id,
            })
          : null;

      if (!response) {
        throw new Error(
          "O AutoCombatRealtimeProvider não expôs uma função start/startAutoCombat.",
        );
      }

      const responseSession = getSessionFromStatus(response);
      const responseProgress = buildProgressFromStatus(
        response,
        responseSession,
      );
      const responseTotals = buildSessionTotalsFromStatus(
        response,
        responseSession,
      );

      setAutoCombatStatus(response);
      setLocalCharacterProgress(responseProgress);
      setLocalSessionTotals(responseTotals);
      setHasStartedHunt(true);
      setActiveTab("battle");

      await loadAutoCombatData();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          "Não foi possível iniciar a caça. Verifique o HP, o mapa e se já existe uma atividade ativa.",
        ),
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleStopHunt() {
    if (!characterId || isActionLoading || !isBackendHuntingPhase) return;

    try {
      setIsActionLoading(true);
      setErrorMessage("");

      const response = realtimeActions.stopHunt
        ? await realtimeActions.stopHunt()
        : null;

      if (!response) {
        throw new Error(
          "O AutoCombatRealtimeProvider não expôs uma função stopHunt.",
        );
      }

      const responseSession = getSessionFromStatus(response);
      const responseProgress = buildProgressFromStatus(
        response,
        responseSession,
      );
      const responseTotals = buildSessionTotalsFromStatus(
        response,
        responseSession,
      );

      setAutoCombatStatus(response);
      setLocalCharacterProgress(responseProgress);
      setLocalSessionTotals(responseTotals);
      setHasStartedHunt(true);
      setActiveTab("battle");

      await loadAutoCombatData();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "Não foi possível parar a caça."),
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  function handleOpenPotionConfig(slotIndex: number) {
    const isClickingCurrentOpenSlot =
      isPotionConfigPanelOpen && selectedPotionSlotIndex === slotIndex;

    if (isClickingCurrentOpenSlot) {
      setIsPotionConfigPanelOpen(false);
      setPotionConfigMessage("");
      return;
    }

    setSelectedPotionSlotIndex(slotIndex);
    setPotionConfigMessage("");
    setIsRestConfigPanelOpen(false);
    setRestConfigMessage("");

    if (slotIndex > 0) {
      setPotionConfigMessage(
        "No backend atual existe 1 configuração de poção automática por personagem. Este slot reserva já abre a mesma configuração principal.",
      );
    }

    setSelectedPotionItemId(currentPotionConfig?.potionItemId ?? "");
    setPotionThresholdPercent(
      clampNumber(currentPotionConfig?.hpThresholdPercent ?? 35, 1, 100),
    );
    setIsPotionConfigPanelOpen(true);
  }

  async function handleSavePotionConfig() {
    if (!characterId || isPotionConfigLoading) return;

    const safeThreshold = Math.floor(
      clampNumber(potionThresholdPercent, 1, 100),
    );

    const shouldEnable = Boolean(selectedPotionItemId);

    if (!selectedPotionItemId) {
      setPotionConfigMessage(
        "Selecione uma poção antes de salvar a configuração automática.",
      );
      return;
    }

    try {
      setIsPotionConfigLoading(true);
      setPotionConfigMessage("");

      const response = await updateCharacterPotionConfigRaw(characterId, {
        enabled: shouldEnable,
        potionItemId: selectedPotionItemId || null,
        hpThresholdPercent: safeThreshold,
        useInManualCombat: false,
        useInAutoCombat: true,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setSelectedPotionItemId(normalized?.potionItemId ?? selectedPotionItemId);
      setPotionThresholdPercent(
        clampNumber(normalized?.hpThresholdPercent ?? safeThreshold, 1, 100),
      );
      setIsPotionConfigPanelOpen(false);
      setPotionConfigMessage(
        response.message ?? "Configuração de poção atualizada com sucesso.",
      );

      await loadAutoCombatData();
    } catch (error) {
      setPotionConfigMessage(
        getApiErrorMessage(
          error,
          "Não foi possível salvar a configuração de poção.",
        ),
      );
    } finally {
      setIsPotionConfigLoading(false);
    }
  }

  async function handleClearPotionConfig() {
    if (!characterId || isPotionConfigLoading) return;

    try {
      setIsPotionConfigLoading(true);
      setPotionConfigMessage("");

      const response = await updateCharacterPotionConfigRaw(characterId, {
        enabled: false,
        potionItemId: null,
        hpThresholdPercent: Math.floor(
          clampNumber(potionThresholdPercent, 1, 100),
        ),
        useInManualCombat: false,
        useInAutoCombat: true,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setSelectedPotionItemId("");
      setIsPotionConfigPanelOpen(false);
      setPotionConfigMessage("Poção removida da configuração automática.");

      await loadAutoCombatData();
    } catch (error) {
      setPotionConfigMessage(
        getApiErrorMessage(
          error,
          "Não foi possível remover a poção configurada.",
        ),
      );
    } finally {
      setIsPotionConfigLoading(false);
    }
  }

  function handleOpenRestConfig() {
    setIsPotionConfigPanelOpen(false);
    setPotionConfigMessage("");
    setRestConfigMessage("");
    setAutoRestEnabled(currentPotionConfig?.autoRestEnabled ?? true);
    setAutoRestStartHpPercent(
      clampNumber(currentPotionConfig?.autoRestStartHpPercent ?? 35, 1, 99),
    );
    setAutoRestStopHpPercent(
      clampNumber(currentPotionConfig?.autoRestStopHpPercent ?? 70, 2, 100),
    );
    setIsRestConfigPanelOpen(true);
  }

  async function handleSaveRestConfig(nextEnabled = autoRestEnabled) {
    if (!characterId || isRestConfigLoading) return;

    const safeRestStart = Math.floor(
      clampNumber(autoRestStartHpPercent, 1, 99),
    );
    const safeRestStop = Math.floor(
      clampNumber(autoRestStopHpPercent, safeRestStart + 1, 100),
    );
    const existingPotionItemId = currentPotionConfig?.potionItemId ?? null;
    const existingPotionEnabled = Boolean(
      currentPotionConfig?.enabled && existingPotionItemId,
    );

    try {
      setIsRestConfigLoading(true);
      setRestConfigMessage("");

      const response = await updateCharacterPotionConfigRaw(characterId, {
        enabled: existingPotionEnabled,
        potionItemId: existingPotionItemId,
        hpThresholdPercent: Math.floor(
          clampNumber(
            currentPotionConfig?.hpThresholdPercent ?? potionThresholdPercent,
            1,
            100,
          ),
        ),
        useInManualCombat: false,
        useInAutoCombat: true,
        autoRestEnabled: nextEnabled,
        autoRestStartHpPercent: safeRestStart,
        autoRestStopHpPercent: safeRestStop,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setAutoRestEnabled(normalized?.autoRestEnabled ?? nextEnabled);
      setAutoRestStartHpPercent(
        clampNumber(normalized?.autoRestStartHpPercent ?? safeRestStart, 1, 99),
      );
      setAutoRestStopHpPercent(
        clampNumber(normalized?.autoRestStopHpPercent ?? safeRestStop, 2, 100),
      );
      setIsRestConfigPanelOpen(false);
      setRestConfigMessage(
        response.message ?? "Configuração de descanso atualizada com sucesso.",
      );

      await loadAutoCombatData();
    } catch (error) {
      setRestConfigMessage(
        getApiErrorMessage(
          error,
          "Não foi possível salvar a configuração de descanso.",
        ),
      );
    } finally {
      setIsRestConfigLoading(false);
    }
  }

  async function handleStartAutoCombat(
    battleSelection?: StartAutoCombatBattlePayload,
  ) {
    if (!characterId || isActionLoading) return;

    if (overview?.activity?.hasActiveWorldBoss) {
      setErrorMessage(
        "Você está aguardando um World Boss. Saia do lobby antes de iniciar auto-combate.",
      );
      return;
    }

    if (!characterHasHp) {
      setErrorMessage(
        "Este personagem está sem HP. Use a enfermaria ou uma cura antes de iniciar o combate.",
      );
      return;
    }

    if (!selectedMapHasActiveEncounters) {
      setErrorMessage(
        "Este mapa ainda não possui inimigos cadastrados para o auto-combate.",
      );
      return;
    }

    try {
      setIsActionLoading(true);
      setErrorMessage("");

      setLocalRealtimeCombat(null);
      setLocalCharacterProgress(null);
      setLocalSessionTotals(null);
      setLocalBattleLogEvents([]);
      setLocalActiveEvent(null);

      const response = realtimeActions.startBattle
        ? await realtimeActions.startBattle(battleSelection)
        : null;

      if (!response) {
        throw new Error(
          "O AutoCombatRealtimeProvider não expôs uma função startBattle.",
        );
      }

      const responseSession = getSessionFromStatus(response);
      const responseProgress = buildProgressFromStatus(
        response,
        responseSession,
      );
      const responseTotals = buildSessionTotalsFromStatus(
        response,
        responseSession,
      );

      setAutoCombatStatus(response);
      setLocalCharacterProgress(responseProgress);
      setLocalSessionTotals(responseTotals);
      setHasStartedHunt(true);
      setActiveTab("battle");
      setSelectedThreat(null);
      setSelectedBattleQuantity(1);
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          "Não foi possível iniciar o combate automático. Verifique o HP, o mapa e se já existe uma sessão ativa.",
        ),
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleStopAutoCombat() {
    if (!characterId || isActionLoading) return;

    try {
      setIsActionLoading(true);
      setErrorMessage("");

      const response = realtimeActions.stop
        ? await realtimeActions.stop()
        : realtimeActions.stopAutoCombat
          ? await realtimeActions.stopAutoCombat(characterId)
          : null;

      if (!response) {
        throw new Error(
          "O AutoCombatRealtimeProvider não expôs uma função stop/stopAutoCombat.",
        );
      }

      const responseSession = getSessionFromStatus(response);
      const responseProgress = buildProgressFromStatus(
        response,
        responseSession,
      );

      setAutoCombatStatus(response);
      setLocalCharacterProgress((current) =>
        mergeProgressKeepingHighestXp(current, responseProgress),
      );

      setLocalSessionTotals(null);
      setLocalRealtimeCombat(null);
      setLocalBattleLogEvents([]);
      setLocalActiveEvent(null);
      setHasStartedHunt(false);
      setActiveTab("battle");

      await loadAutoCombatData();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          "Não foi possível parar o combate automático.",
        ),
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  return (
    <DashboardLayout
      character={layoutCharacter}
      topBarActivityOverride={autoCombatTopBarActivityOverride}
    >
      <div className="auto-combat-page">
        {errorMessage ? (
          <div className="auto-combat-alert" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <section className="auto-combat-app-shell">
          <div className="auto-combat-section-title">
            <span>Combate Automático</span>
          </div>

          <AutoCombatTabs activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === "battle" ? (
            <div className="auto-combat-tab-panel">
              {!showHuntStage && !showActiveSession ? (
                <article
                  className={[
                    "auto-combat-stage-card",
                    "auto-combat-map-stage",
                    selectedMapRarityClassName,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="auto-combat-map-preview">
                    <div
                      className={[
                        "auto-combat-map-preview__visual",
                        selectedMapRarityClassName,
                        selectedMapImage
                          ? "auto-combat-map-preview__visual--with-image"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={selectedMapVisualStyle}
                    >
                      <span>Zona atual</span>

                      <strong>{selectedMapName}</strong>

                      <div className="auto-combat-map-meta auto-combat-map-meta--visual">
                        <div>
                          <span>Tier</span>
                          <strong>{selectedMap?.tier ?? "—"}</strong>
                        </div>

                        <div>
                          <span>Nível</span>
                          <strong>
                            {selectedMap
                              ? `${getGameMapMinLevel(selectedMap)}-${getGameMapMaxLevel(selectedMap)}`
                              : "—"}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="auto-combat-map-preview__content">
                      <span>Preparação da caçada</span>

                      <strong>{selectedMapName}</strong>

                      <p>
                        {selectedMap?.description ??
                          "Escolha um mapa disponível e inicie a caça para revelar os infectados próximos."}
                      </p>

                      <label className="auto-combat-field auto-combat-field--map">
                        <span>Mapa</span>

                        <div className="auto-combat-select-shell">
                          <select
                            value={mapSelectValue}
                            onChange={(event) =>
                              handleMapChange(event.target.value)
                            }
                            disabled={isActionLoading || isMapSelectionLocked}
                          >
                            {availableMaps.length <= 0 ? (
                              <option value="">Nenhum mapa disponível</option>
                            ) : null}

                            {availableMaps.map((gameMap) => (
                              <option key={gameMap.id} value={gameMap.id}>
                                {gameMap.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>

                      <div className="auto-combat-stage-actions">
                        <button
                          type="button"
                          className="auto-combat-primary-button"
                          disabled={!canTravelToSelectedMap || isActionLoading}
                          title={
                            overview?.activity?.hasActiveWorldBoss
                              ? "Você já está em um World Boss."
                              : undefined
                          }
                          onClick={handleTravelToMap}
                        >
                          {isActionLoading ? "Viajando..." : "Viajar"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ) : null}

              {showTravelEmptyStage ? (
                <article className="auto-combat-stage-card auto-combat-hunt-stage auto-combat-hunt-stage--empty">
                  <span className="auto-combat-hunt-empty__eyebrow">
                    Rastreamento da área
                  </span>

                  <strong>Nenhuma ameaça rastreada</strong>

                  <p>
                    Rota selecionada. Inicie uma caçada para localizar
                    infectados neste mapa.
                  </p>

                  <button
                    type="button"
                    className="auto-combat-primary-button"
                    disabled={!canStartHunt || isActionLoading}
                    onClick={handleStartHunt}
                  >
                    {isActionLoading ? "Iniciando..." : "Iniciar Caçada"}
                  </button>
                </article>
              ) : null}

              {showTrackedHuntStage ? (
                <article
                  className={[
                    "auto-combat-stage-card",
                    "auto-combat-hunt-stage",
                    showInlineHuntBattle
                      ? "auto-combat-hunt-stage--battle-focused"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {showHuntTrackerCard ? (
                    <div
                      className={[
                        "auto-combat-hunt-tracker",
                        "auto-combat-hunt-tracker--active-panel",
                        trackedThreatMob
                          ? "auto-combat-hunt-tracker--has-target"
                          : "auto-combat-hunt-tracker--searching",
                        isBackendEncounterReadyPhase
                          ? "auto-combat-hunt-tracker--ready"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                    <div className="auto-combat-hunt-tracker__visual">
                      {trackedThreatMob && trackedThreatImage ? (
                        <img
                          src={trackedThreatImage}
                          alt={trackedThreatMob.name ?? "Ameaça localizada"}
                          loading="eager"
                          decoding="async"
                        />
                      ) : (
                        <span>?</span>
                      )}

                      {shouldShowTrackedThreatFoundCount ? (
                        <div className="auto-combat-hunt-tracker__found-badge">
                          <strong>{trackedThreatDisplayCount}</strong>
                          <span>
                            {trackedThreatDisplayCount === 1
                              ? "encontrado"
                              : "encontrados"}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="auto-combat-hunt-tracker__content">
                      <div className="auto-combat-hunt-tracker__metrics">
                        <div>
                          <span>Tempo</span>
                          <strong>{formatSeconds(huntTotalElapsedSeconds)}</strong>
                        </div>

                        <div className="auto-combat-hunt-tracker__metric--primary">
                          <span>Encontrados</span>
                          <strong>{huntingFoundLabel}</strong>
                        </div>

                        <div>
                          <span>Restantes</span>
                          <strong>{huntingRemainingLabel}</strong>
                        </div>

                        <div>
                          <span>EXP/s</span>
                          <strong>{huntingXpPerSecondLabel}</strong>
                        </div>
                      </div>

                      <div
                        className="auto-combat-hunt-scan"
                        style={huntProgressStyle}
                      >
                        <div className="auto-combat-hunt-scan__track">
                          <i />
                        </div>

                        <div className="auto-combat-hunt-scan__footer">
                          <span>{huntProgressStatusText}</span>
                          <strong>{Math.round(huntProgressPercent)}%</strong>
                        </div>
                      </div>

                      <div className="auto-combat-hunt-tracker__actions">
                        <button
                          type="button"
                          className="auto-combat-hunt-tracker__stop"
                          disabled={isActionLoading}
                          onClick={() => setIsStopHuntConfirmOpen(true)}
                        >
                          {isActionLoading ? "Processando..." : "Parar Caça"}
                        </button>
                      </div>
                    </div>
                    </div>
                  ) : null}

                  <aside
                    className="auto-combat-hunt-side auto-combat-hunt-side--stacked"
                    aria-label="Resumo da caça"
                  >
                    {showInlineHuntBattle ? (
                      <section className="auto-combat-hunt-side-section auto-combat-hunt-side-section--battle">
                        <div className="auto-combat-hunt-side__section-title">
                          <span>Batalha</span>
                        </div>

                        <div className="auto-combat-hunt-battle-card">
                          <div className="auto-combat-hunt-battle-card__top">
                            <div className="auto-combat-hunt-battle-card__portrait">
                              {activeMobFullBodyImage ? (
                                <img
                                  src={activeMobFullBodyImage}
                                  alt={activeMobName}
                                  loading="eager"
                                  decoding="async"
                                />
                              ) : (
                                <span>AC</span>
                              )}
                            </div>

                            <div className="auto-combat-hunt-battle-card__body">
                              <strong>{activeMobName}</strong>
                              <span>{activeBattleBatchLabel}</span>
                            </div>

                            <div className="auto-combat-hunt-battle-card__time">
                              <strong>{activeBatchElapsedLabel}</strong>
                              {activeBatchTotalLabel ? (
                                <span>de {activeBatchTotalLabel}</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="auto-combat-hunt-battle-card__track">
                            <i>
                              <b style={activeBattleProgressStyle} />
                            </i>
                          </div>

                          <div className="auto-combat-hunt-battle-card__meta">
                            <span>{activeKillProgressLabel}</span>
                            <strong>{activeBattleRateLabel}</strong>
                          </div>

                          {activeDifficultyLabel ? (
                            <div className="auto-combat-hunt-battle-card__difficulty">
                              {activeDifficultyLabel}
                            </div>
                          ) : null}

                          <div className="auto-combat-hunt-battle-card__actions">
                            <button
                              type="button"
                              className="auto-combat-hunt-battle-card__button"
                              onClick={() => setActiveTab("stats")}
                            >
                              Status
                            </button>

                            <button
                              type="button"
                              className="auto-combat-hunt-battle-card__button auto-combat-hunt-battle-card__button--danger"
                              disabled={isActionLoading || !hasActiveSession}
                              onClick={handleStopAutoCombat}
                            >
                              {isActionLoading ? "..." : "Parar"}
                            </button>
                          </div>
                        </div>
                      </section>
                    ) : !showHuntTrackerCard ? (
                      <section className="auto-combat-hunt-side-section auto-combat-hunt-side-section--current">
                        <div className="auto-combat-hunt-side__section-title">
                          <span>Atividade atual</span>
                        </div>

                        <div className="auto-combat-hunt-activity-card">
                          <div className="auto-combat-hunt-activity-card__icon">
                            CA
                          </div>
                          <div className="auto-combat-hunt-activity-card__body">
                            <strong>{huntingActivityTitle}</strong>
                            <span>{huntingActivityDetail}</span>
                            <small>{huntProgressStatusText}</small>
                          </div>
                          <em>
                            {isBackendEncounterReadyPhase
                              ? "OK"
                              : `${Math.round(huntProgressPercent)}%`}
                          </em>
                        </div>
                      </section>
                    ) : null}

                    <section className="auto-combat-hunt-side-section auto-combat-hunt-side-section--progress">
                      <div className="auto-combat-hunt-side__section-title">
                        <span>Sua proficiência</span>
                      </div>

                      <div
                        className="auto-combat-hunt-skill-card"
                        style={huntingSkillProgressStyle}
                      >
                        <div className="auto-combat-hunt-skill-card__top">
                          <div className="auto-combat-hunt-skill-card__icon">
                            CA
                          </div>

                          <div className="auto-combat-hunt-skill-card__heading">
                            <span>
                              <strong>Caça</strong>
                              <em>Nv. {huntingLevel}</em>
                            </span>
                            <small>Rastreia ameaças antes do combate.</small>
                          </div>
                        </div>

                        <div className="auto-combat-hunt-skill-card__track">
                          <i />
                        </div>

                        <div className="auto-combat-hunt-skill-card__metrics">
                          <span>{huntingSkillXpLabel}</span>
                          <strong>{huntingXpProgressPercent}%</strong>
                        </div>

                        <div className="auto-combat-hunt-skill-card__details">
                          <span>{huntingSpeedLabel}</span>
                          <span>{huntingCapacityLabel} rastreados</span>
                        </div>
                      </div>
                    </section>
                  </aside>

                  {showInlineHuntBattle ? (
                    <section
                      className="auto-combat-inline-battle"
                      aria-label="Batalha da caÃ§a em andamento"
                    >
                      <div className="auto-combat-inline-battle__header">
                        <span>Alvo atual</span>

                        <div className="auto-combat-inline-battle__metrics">
                          {activeBattleTargetTotal > 0 ? (
                            <>
                              <em>{activeBattleTargetDefeated} derrotados</em>
                              <em>{activeBattleTargetRemaining} restantes</em>
                            </>
                          ) : (
                            <em>{sessionStatusText}</em>
                          )}
                        </div>
                      </div>

                      <div
                        className={[
                          "auto-combat-inline-battle__mob-card",
                          shouldShowMobDamage ? "is-hit" : "",
                          isRealtimeFeedbackCritical ? "is-critical-hit" : "",
                          shouldShowMobDeathFeedback ? "is-defeated" : "",
                          isCombatViewSynchronizing ? "is-syncing" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {shouldShowXpFeedback && xpFeedbackBreakdown ? (
                          <div
                            key={xpFeedbackKey}
                            className="auto-combat-xp-feedback auto-combat-inline-battle__xp"
                            role="status"
                            aria-live="polite"
                          >
                            <strong>
                              +{xpFeedbackBreakdown.totalXp} EXP TOTAL
                            </strong>

                            <div className="auto-combat-xp-feedback__details">
                              <span>
                                Base: {xpFeedbackBreakdown.baseXp} EXP
                              </span>

                              <span className="auto-combat-xp-feedback__premium">
                                <PremiumPlaceholderIcon className="auto-combat-xp-feedback__premium-icon" />
                                + {xpFeedbackPremiumXp} EXP PREMIUM
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {shouldShowMobDamage ? (
                          <span
                            key={mobDamageKey}
                            className={[
                              "auto-combat-floating-damage",
                              isRealtimeFeedbackCritical ? "is-critical" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            -{latestDamageAmount} HP
                          </span>
                        ) : null}

                        {shouldShowMobDeathFeedback ? (
                          <span
                            key={mobDeathFeedbackKey}
                            className="auto-combat-defeated-badge"
                          >
                            Derrotado
                          </span>
                        ) : null}

                        {hasConfirmedActiveMob ? (
                          <span className="auto-combat-fighter-card__level-badge auto-combat-fighter-card__level-badge--mob">
                            Nv. {activeMobLevel}
                          </span>
                        ) : null}

                        <div className="auto-combat-inline-battle__mob-visual">
                          {activeMobFullBodyImage ? (
                            <img
                              src={activeMobFullBodyImage}
                              alt={activeMobName}
                              loading="eager"
                              decoding="async"
                            />
                          ) : isCombatViewSynchronizing ? (
                            <span className="auto-combat-fighter-card__sync-placeholder">
                              Sincronizando
                            </span>
                          ) : showActiveSession && !hasConfirmedActiveMob ? (
                            <span className="auto-combat-fighter-card__sync-placeholder">
                              Aguardando
                            </span>
                          ) : (
                            <span className="auto-combat-fighter-card__mob-placeholder">
                              â˜£
                            </span>
                          )}
                        </div>

                        <div className="auto-combat-inline-battle__mob-heading">
                          <span>AmeaÃ§a atual</span>
                          <strong>{activeMobName}</strong>
                        </div>

                        <div
                          className={[
                            "auto-combat-resource",
                            hasTtkBattleProgress
                              ? "auto-combat-resource--countdown"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div>
                            <span>
                              {hasTtkBattleProgress ? "Abate" : "HP"}
                            </span>
                            <strong>
                              {hasTtkBattleProgress
                                ? activeKillProgressLabel
                                : activeMobMaxHp > 0
                                  ? `${activeMobCurrentHp}/${activeMobMaxHp}`
                                  : activeMobReference}
                            </strong>
                          </div>

                          <i>
                            <b
                              style={
                                hasTtkBattleProgress
                                  ? activeBattleProgressStyle
                                  : activeMobHpStyle
                              }
                            />
                          </i>

                          {hasTtkBattleProgress ? (
                            <small className="auto-combat-resource__hint">
                              {activeKillsPerMinute > 0
                                ? `${activeKillsPerMinute.toFixed(1)} abates/min`
                                : "Calculando ritmo"}
                              {activeDifficultyLabel
                                ? ` · ${activeDifficultyLabel}`
                                : ""}
                            </small>
                          ) : null}
                        </div>
                      </div>

                      <div className="auto-combat-inline-battle__footer">
                        <div className="auto-combat-inline-battle__player-hp">
                          <span>HP do sobrevivente</span>
                          <strong>
                            {currentCharacterHp}/{currentCharacterMaxHp}
                          </strong>
                          <i>
                            <b style={characterHpStyle} />
                          </i>
                        </div>

                        <button
                          type="button"
                          className="auto-combat-secondary-button auto-combat-secondary-button--danger"
                          disabled={isActionLoading || !hasActiveSession}
                          onClick={handleStopAutoCombat}
                        >
                          {isActionLoading ? "Processando..." : "Parar sessÃ£o"}
                        </button>
                      </div>

                      {isAutoRestingVisual ? (
                        <div
                          className="auto-combat-resting-callout"
                          role="status"
                          aria-live="polite"
                        >
                          <span
                            className="auto-combat-resting-callout__pulse"
                            aria-hidden="true"
                          />

                          <div className="auto-combat-resting-callout__copy">
                            <strong>Descanso automÃ¡tico</strong>
                            <span>Recuperando HP antes de continuar.</span>
                          </div>

                          <em>
                            {autoRestHealedAmount > 0
                              ? `+${autoRestHealedAmount} HP`
                              : `${currentCharacterHp}/${currentCharacterMaxHp} HP`}
                          </em>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <>
                  <div className="auto-combat-section-title auto-combat-section-title--small">
                    <span>
                      {showInlineHuntBattle
                        ? "Ameaças restantes"
                        : "Possíveis ameaças da área"}
                    </span>
                  </div>

                  {displayedThreats.length > 0 ? (
                    <div
                      className={[
                        "auto-combat-enemy-grid",
                        isBackendHuntFlow
                          ? "auto-combat-enemy-grid--compact"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {displayedThreats.map((encounter) => {
                        const mob = encounter.mob;
                        const mobFullBodyImage =
                          getMobFullBodyImage(mob?.name) ??
                          getMobPortraitImage(mob?.name);
                        const mobId = mob?.id ?? encounter.mobId;
                        const cardFoundCount =
                          shouldUseTrackedThreatCards && mobId
                            ? (huntFoundCountByMobId.get(mobId) ?? 0)
                            : 0;
                        const shouldShowCardFoundCount = cardFoundCount > 0;
                        const cardFoundCountLabel =
                          cardFoundCount === 1
                            ? "1 encontrado"
                            : `${cardFoundCount} encontrados`;
                        const isTrackedThreatCard =
                          shouldUseTrackedThreatCards &&
                          ((Boolean(trackedEncounter) &&
                            (encounter.id === trackedEncounter?.id ||
                              mob?.id === trackedThreatMob?.id)) ||
                            encounter.id === activeBattleTargetEncounterId ||
                            mobId === activeBattleTargetMobId);

                        return (
                          <article
                            key={encounter.id}
                            className={[
                              "auto-combat-enemy-card",
                              isBackendHuntFlow
                                ? "auto-combat-enemy-card--compact"
                                : "",
                              shouldShowCardFoundCount
                                ? "auto-combat-enemy-card--found"
                                : "",
                              isTrackedThreatCard
                                ? "auto-combat-enemy-card--tracked-found"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            role="button"
                            tabIndex={0}
                            aria-label={`Ver detalhes de ${mob?.name ?? "Infectado"}`}
                            onClick={() => {
                              setSelectedBattleQuantity(1);
                              setSelectedThreat(encounter);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }

                              event.preventDefault();
                              setSelectedBattleQuantity(1);
                              setSelectedThreat(encounter);
                            }}
                          >
                            {shouldShowCardFoundCount ? (
                              <div
                                className={[
                                  "auto-combat-enemy-card__found-count",
                                  isTrackedThreatCard
                                    ? "auto-combat-enemy-card__found-count--tracked"
                                    : "auto-combat-enemy-card__found-count--secondary",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                aria-label={`${cardFoundCountLabel} nesta caça`}
                              >
                                <strong>{cardFoundCount}</strong>
                                <span>
                                  {cardFoundCount === 1
                                    ? "encontrado"
                                    : "encontrados"}
                                </span>
                              </div>
                            ) : null}

                            <div
                              className={[
                                "auto-combat-enemy-card__portrait",
                                "auto-combat-enemy-card__portrait--fullbody",
                                mobFullBodyImage
                                  ? "auto-combat-enemy-card__portrait--loaded"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {mobFullBodyImage ? (
                                <img
                                  src={mobFullBodyImage}
                                  alt={mob?.name ?? "Infectado"}
                                  loading="eager"
                                  decoding="async"
                                />
                              ) : (
                                <span className="auto-combat-enemy-card__portrait-fallback">
                                  ☣
                                </span>
                              )}
                            </div>

                            <div className="auto-combat-enemy-card__content">
                              <span>Ameaça próxima</span>

                              <strong>{mob?.name ?? "Infectado"}</strong>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="auto-combat-hunt-empty auto-combat-hunt-empty--compact">
                      <div className="auto-combat-hunt-empty__icon">!</div>

                      <strong>Nenhum inimigo encontrado</strong>

                      <p>
                        Este mapa está cadastrado, mas ainda não possui
                        encontros ativos. Quando os mobs forem vinculados ao
                        seed/backend, ele ficará disponível para combate.
                      </p>
                    </div>
                  )}
                  </>

                  {!showInlineHuntBattle ? (
                    <>
                  <div className="auto-combat-stage-actions">
                    {!isBackendHuntingPhase ? (
                      <>
                        <button
                          type="button"
                          className="auto-combat-primary-button"
                          disabled={
                            isBackendEncounterReadyPhase || !canStartCombat
                          }
                          onClick={() => handleStartAutoCombat()}
                        >
                          {isBackendEncounterReadyPhase
                            ? "Escolha um mob"
                            : isActionLoading
                              ? "Processando..."
                              : "Iniciar combate"}
                        </button>

                        {isBackendEncounterReadyPhase ? (
                          <button
                            type="button"
                            className="auto-combat-secondary-button"
                            disabled={!canStartHunt || isActionLoading}
                            onClick={handleStartHunt}
                          >
                            {isActionLoading
                              ? "Processando..."
                              : isHuntLimitReached
                                ? "Limite atingido"
                                : "Continuar caçada"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                    </>
                  ) : null}
                </article>
              ) : null}

              {showArenaActiveSession ? (
                <div
                  className={[
                    "auto-combat-session-stage",
                    !SHOW_AUTO_COMBAT_BATTLE_LOG
                      ? "auto-combat-session-stage--battle-log-hidden"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <article className="auto-combat-arena-card">
                    <div className="auto-combat-arena-card__top">
                      <span>{sessionStatusText}</span>

                      <strong>{formatSeconds(remainingSeconds)}</strong>
                    </div>

                    <div className="auto-combat-duel-row">
                      <div
                        className={playerFighterClassName}
                        data-fighter-role="player"
                        data-has-avatar={
                          characterBattleImage ? "true" : "false"
                        }
                      >
                        {shouldShowPlayerDamage ? (
                          <span
                            key={playerDamageKey}
                            className={[
                              "auto-combat-floating-damage",
                              isRealtimeFeedbackCritical ? "is-critical" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            -{latestDamageAmount} HP
                          </span>
                        ) : null}

                        {isPlayerDefeatedVisual ? (
                          <span className="auto-combat-defeated-badge auto-combat-defeated-badge--player">
                            Derrotado
                          </span>
                        ) : null}

                        <span className="auto-combat-fighter-card__level-badge auto-combat-fighter-card__level-badge--player">
                          Nv. {currentCharacterLevel}
                        </span>

                        <div
                          className={[
                            "auto-combat-fighter-card__identity",
                            "auto-combat-fighter-card__identity--player",
                            characterBattleImage
                              ? "auto-combat-fighter-card__identity--player-with-avatar"
                              : "auto-combat-fighter-card__identity--player-empty",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div
                            className={[
                              "auto-combat-fighter-card__character-image",
                              characterBattleImage
                                ? "auto-combat-fighter-card__character-image--loaded"
                                : "auto-combat-fighter-card__character-image--empty",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-hidden={!characterBattleImage}
                          >
                            {characterBattleImage ? (
                              <img
                                src={characterBattleImage}
                                alt={layoutCharacter.name}
                              />
                            ) : (
                              <span
                                className="auto-combat-fighter-card__character-placeholder"
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          <div className="auto-combat-fighter-card__heading auto-combat-fighter-card__heading--player">
                            <span>Sobrevivente</span>
                            <strong>{layoutCharacter.name}</strong>
                          </div>
                        </div>

                          <div
                            className={[
                              "auto-combat-resource",
                              hasTtkBattleProgress
                                ? "auto-combat-resource--countdown"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                          <div>
                            <span>HP</span>
                            <strong>
                              {currentCharacterHp}/{currentCharacterMaxHp}
                            </strong>
                          </div>

                          <i>
                            <b style={characterHpStyle} />
                          </i>
                        </div>
                      </div>

                      <div className="auto-combat-vs">VS</div>

                      <div
                        className={mobFighterClassName}
                        data-fighter-role="mob"
                      >
                        {shouldShowXpFeedback && xpFeedbackBreakdown ? (
                          <div
                            key={xpFeedbackKey}
                            className="auto-combat-xp-feedback"
                            role="status"
                            aria-live="polite"
                          >
                            <strong>
                              +{xpFeedbackBreakdown.totalXp} EXP TOTAL
                            </strong>

                            <div className="auto-combat-xp-feedback__details">
                              <span>
                                Base: {xpFeedbackBreakdown.baseXp} EXP
                              </span>

                              <span className="auto-combat-xp-feedback__premium">
                                <PremiumPlaceholderIcon className="auto-combat-xp-feedback__premium-icon" />
                                + {xpFeedbackPremiumXp} EXP PREMIUM
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {shouldShowMobDamage ? (
                          <span
                            key={mobDamageKey}
                            className={[
                              "auto-combat-floating-damage",
                              isRealtimeFeedbackCritical ? "is-critical" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            -{latestDamageAmount} HP
                          </span>
                        ) : null}

                        {shouldShowMobDeathFeedback ? (
                          <span
                            key={mobDeathFeedbackKey}
                            className="auto-combat-defeated-badge"
                          >
                            Derrotado
                          </span>
                        ) : null}

                        {hasConfirmedActiveMob ? (
                          <span className="auto-combat-fighter-card__level-badge auto-combat-fighter-card__level-badge--mob">
                            Nv. {activeMobLevel}
                          </span>
                        ) : null}

                        <div className="auto-combat-fighter-card__identity auto-combat-fighter-card__identity--mob">
                          <div
                            className={[
                              "auto-combat-fighter-card__mob-image",
                              activeMobFullBodyImage
                                ? "auto-combat-fighter-card__mob-image--loaded"
                                : "auto-combat-fighter-card__mob-image--empty",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {activeMobFullBodyImage ? (
                              <img
                                src={activeMobFullBodyImage}
                                alt={activeMobName}
                                loading="eager"
                                decoding="async"
                              />
                            ) : isCombatViewSynchronizing ? (
                              <span className="auto-combat-fighter-card__sync-placeholder">
                                Sincronizando
                              </span>
                            ) : showActiveSession && !hasConfirmedActiveMob ? (
                              <span className="auto-combat-fighter-card__sync-placeholder">
                                Aguardando
                              </span>
                            ) : (
                              <span className="auto-combat-fighter-card__mob-placeholder">
                                ☣
                              </span>
                            )}
                          </div>

                          <div className="auto-combat-fighter-card__heading auto-combat-fighter-card__heading--mob">
                            <span>Ameaça atual</span>
                            <strong>{activeMobName}</strong>
                          </div>
                        </div>

                        <div
                          className={[
                            "auto-combat-resource",
                            hasTtkBattleProgress
                              ? "auto-combat-resource--countdown"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div>
                            <span>
                              {hasTtkBattleProgress ? "Abate" : "HP"}
                            </span>
                            <strong>
                              {hasTtkBattleProgress
                                ? activeKillProgressLabel
                                : activeMobMaxHp > 0
                                  ? `${activeMobCurrentHp}/${activeMobMaxHp}`
                                  : activeMobReference}
                            </strong>
                          </div>

                          <i>
                            <b
                              style={
                                hasTtkBattleProgress
                                  ? activeBattleProgressStyle
                                  : activeMobHpStyle
                              }
                            />
                          </i>

                          {hasTtkBattleProgress ? (
                            <small className="auto-combat-resource__hint">
                              {activeKillsPerMinute > 0
                                ? `${activeKillsPerMinute.toFixed(1)} abates/min`
                                : "Calculando ritmo"}
                              {activeDifficultyLabel
                                ? ` · ${activeDifficultyLabel}`
                                : ""}
                            </small>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {isAutoRestingVisual ? (
                      <div
                        className="auto-combat-resting-callout"
                        role="status"
                        aria-live="polite"
                      >
                        <span
                          className="auto-combat-resting-callout__pulse"
                          aria-hidden="true"
                        />

                        <div className="auto-combat-resting-callout__copy">
                          <strong>Descanso automático</strong>
                          <span>
                            O sobrevivente pausou a caça para recuperar HP.
                          </span>
                        </div>

                        <em>
                          {autoRestHealedAmount > 0
                            ? `+${autoRestHealedAmount} HP`
                            : `${currentCharacterHp}/${currentCharacterMaxHp} HP`}
                        </em>
                      </div>
                    ) : null}

                    <div className="auto-combat-stage-actions auto-combat-stage-actions--session">
                      <button
                        type="button"
                        className="auto-combat-secondary-button auto-combat-secondary-button--danger"
                        disabled={isActionLoading || !hasActiveSession}
                        onClick={handleStopAutoCombat}
                      >
                        {isActionLoading ? "Processando..." : "Parar sessão"}
                      </button>
                    </div>
                  </article>

                  {SHOW_AUTO_COMBAT_BATTLE_LOG ? (
                    <AutoCombatBattleLog
                      events={battleLogEvents}
                      activeEvent={activeBattleLogEvent}
                      isActive={showActiveSession}
                      maxItems={20}
                    />
                  ) : null}

                  <div className="auto-combat-potion-belt">
                    <div className="auto-combat-potion-belt__header">
                      <div>
                        <span>Automação de sobrevivência</span>
                        <strong>Cura e descanso</strong>
                      </div>

                      <small>
                        Configure a poção e o descanso em slots separados.
                      </small>
                    </div>

                    <div className="auto-combat-potion-slot-grid">
                      {potionSlots.map((potionConfig, index) => {
                        const potionItem = getPotionItem(potionConfig);
                        const potionQuantity = configuredPotionQuantity;
                        const hasConfiguredPotion = Boolean(potionItem);
                        const isEnabled = hasConfiguredPotion;

                        return (
                          <div
                            key={potionConfig?.id ?? `auto-potion-${index}`}
                            className="auto-combat-potion-slot"
                          >
                            <button
                              type="button"
                              className={[
                                "auto-combat-potion-slot__button",
                                isEnabled ? "is-enabled" : "is-empty",
                                index === selectedPotionSlotIndex &&
                                isPotionConfigPanelOpen
                                  ? "is-selected"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => handleOpenPotionConfig(index)}
                            >
                              <div className="auto-combat-potion-slot__icon">
                                ✚
                              </div>

                              <div className="auto-combat-consumable-slot__body">
                                <span className="auto-combat-consumable-slot__eyebrow">
                                  Poção automática
                                </span>

                                <strong>
                                  {potionItem
                                    ? getPotionName(potionConfig)
                                    : "Configurar"}
                                </strong>

                                <span>
                                  {potionItem
                                    ? getPotionDescription(potionConfig)
                                    : "Clique para escolher uma poção e definir o gatilho de HP."}
                                </span>

                                <small className="auto-combat-consumable-slot__meta">
                                  {potionItem
                                    ? `HP <= ${currentPotionConfig?.hpThresholdPercent ?? potionThresholdPercent}% · x${potionQuantity}`
                                    : "Escolher poção"}
                                </small>
                              </div>

                              <em className="auto-combat-consumable-slot__action">
                                {hasConfiguredPotion ? "Editar" : "Configurar"}
                              </em>
                            </button>

                            {hasConfiguredPotion ? (
                              <button
                                type="button"
                                className="auto-combat-potion-slot__remove"
                                aria-label="Remover poção automática"
                                disabled={isPotionConfigLoading}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleClearPotionConfig();
                                }}
                              >
                                X
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      <div className="auto-combat-potion-slot auto-combat-rest-slot">
                        <button
                          type="button"
                          className={[
                            "auto-combat-potion-slot__button",
                            "auto-combat-rest-slot__button",
                            autoRestEnabled ? "is-enabled" : "is-empty",
                            isRestConfigPanelOpen ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={handleOpenRestConfig}
                        >
                          <div className="auto-combat-potion-slot__icon auto-combat-rest-slot__icon" />

                          <div className="auto-combat-consumable-slot__body">
                            <span className="auto-combat-consumable-slot__eyebrow">
                              Descanso automático
                            </span>

                            <strong>
                              {autoRestEnabled
                                ? "Descanso ativo"
                                : "Configurar"}
                            </strong>

                            <span>
                              {autoRestEnabled
                                ? "Pausa a caça só quando o HP chegar no gatilho baixo."
                                : "Configure quando parar e quando voltar a caçar."}
                            </span>

                            <small className="auto-combat-consumable-slot__meta">
                              {autoRestEnabled
                                ? `HP <= ${autoRestStartHpPercent}% · volta em ${autoRestStopHpPercent}%`
                                : "Sem descanso"}
                            </small>
                          </div>

                          <em className="auto-combat-consumable-slot__action">
                            Configurar
                          </em>
                        </button>
                      </div>
                    </div>
                  </div>

                  {isPotionConfigPanelOpen ? (
                    <div
                      className="auto-combat-potion-config-modal-backdrop"
                      role="presentation"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          setIsPotionConfigPanelOpen(false);
                        }
                      }}
                    >
                      <article
                        className="auto-combat-potion-config-panel auto-combat-potion-config-panel--minimal auto-combat-potion-config-panel--modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="auto-combat-potion-config-title"
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <div className="auto-combat-potion-config-panel__header">
                          <div>
                            <span>Poção automática</span>
                            <strong id="auto-combat-potion-config-title">
                              Escolha a poção e o gatilho de HP
                            </strong>
                          </div>

                          <button
                            type="button"
                            className="auto-combat-potion-config-panel__close"
                            aria-label="Fechar configuração de poção"
                            onClick={() => setIsPotionConfigPanelOpen(false)}
                          >
                            Fechar
                          </button>
                        </div>

                        <div className="auto-combat-potion-config-grid auto-combat-potion-config-grid--minimal">
                          <section className="auto-combat-potion-picker">
                            <div className="auto-combat-potion-picker__header">
                              <div className="auto-combat-potion-picker__title">
                                <span>Poções disponíveis</span>
                                <strong>
                                  {potionOptions.length > 0
                                    ? potionOptionsCountLabel
                                    : "Inventário sem poções"}
                                </strong>
                              </div>
                            </div>

                            {potionOptions.length > 0 ? (
                              <div className="auto-combat-potion-grid">
                                {potionOptions.map((potion) => {
                                  const potionId = potion.itemId;
                                  const potionQuantity = Math.max(
                                    0,
                                    toSafeNumber(potion.quantity, 0),
                                  );
                                  const isSelectedPotion =
                                    selectedPotionItemId === potionId;
                                  const isUnavailable = potionQuantity <= 0;

                                  return (
                                    <button
                                      key={potionId}
                                      type="button"
                                      className={[
                                        "auto-combat-potion-option",
                                        isSelectedPotion ? "is-selected" : "",
                                        isUnavailable ? "is-unavailable" : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                      disabled={
                                        isPotionConfigLoading || isUnavailable
                                      }
                                      onClick={() => {
                                        setSelectedPotionItemId(potionId);
                                        setPotionConfigMessage("");
                                      }}
                                    >
                                      <span className="auto-combat-potion-option__icon">
                                        ✚
                                      </span>

                                      <span className="auto-combat-potion-option__content">
                                        <strong>{potion.name}</strong>
                                        <small>
                                          {getPotionHealLabel(potion)}
                                        </small>
                                      </span>

                                      <span className="auto-combat-potion-option__quantity">
                                        x{potionQuantity}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="auto-combat-potion-grid auto-combat-potion-grid--empty">
                                <div className="auto-combat-potion-empty-state">
                                  <span className="auto-combat-potion-empty-state__icon">
                                    +
                                  </span>
                                  <strong>Inventário sem poções</strong>
                                  <p>
                                    Nenhuma poção de cura foi encontrada no
                                    inventário deste personagem.
                                  </p>
                                </div>
                              </div>
                            )}
                          </section>

                          <section className="auto-combat-potion-threshold auto-combat-potion-threshold--minimal">
                            <div className="auto-combat-potion-threshold__header">
                              <div>
                                <span>Usar quando o HP estiver em</span>
                                <strong>
                                  {potionThresholdPercent}% ou menos
                                </strong>
                              </div>

                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={potionThresholdPercent}
                                disabled={isPotionConfigLoading}
                                onChange={(event) =>
                                  setPotionThresholdPercent(
                                    clampNumber(event.target.value, 1, 100),
                                  )
                                }
                              />
                            </div>

                            <input
                              type="range"
                              min={1}
                              max={100}
                              value={potionThresholdPercent}
                              disabled={isPotionConfigLoading}
                              onChange={(event) =>
                                setPotionThresholdPercent(
                                  clampNumber(event.target.value, 1, 100),
                                )
                              }
                            />

                            <div className="auto-combat-potion-threshold__presets">
                              {[25, 35, 50, 65].map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={
                                    potionThresholdPercent === value
                                      ? "is-selected"
                                      : ""
                                  }
                                  aria-pressed={
                                    potionThresholdPercent === value
                                  }
                                  disabled={isPotionConfigLoading}
                                  onClick={() =>
                                    setPotionThresholdPercent(value)
                                  }
                                >
                                  {value}%
                                </button>
                              ))}
                            </div>
                          </section>
                        </div>

                        {potionConfigMessage ? (
                          <p className="auto-combat-potion-config-message">
                            {potionConfigMessage}
                          </p>
                        ) : null}

                        <div className="auto-combat-potion-config-actions auto-combat-potion-config-actions--minimal">
                          <button
                            type="button"
                            className="auto-combat-primary-button"
                            disabled={isPotionConfigLoading}
                            onClick={handleSavePotionConfig}
                          >
                            {isPotionConfigLoading
                              ? "Salvando..."
                              : "Salvar configuração"}
                          </button>

                          <button
                            type="button"
                            className="auto-combat-secondary-button auto-combat-secondary-button--danger"
                            disabled={isPotionConfigLoading}
                            onClick={handleClearPotionConfig}
                          >
                            Remover
                          </button>
                        </div>
                      </article>
                    </div>
                  ) : null}

                  {isRestConfigPanelOpen ? (
                    <div
                      className="auto-combat-potion-config-modal-backdrop"
                      role="presentation"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          setIsRestConfigPanelOpen(false);
                        }
                      }}
                    >
                      <article
                        className="auto-combat-potion-config-panel auto-combat-potion-config-panel--minimal auto-combat-potion-config-panel--modal auto-combat-rest-config-panel--modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="auto-combat-rest-config-title"
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <div className="auto-combat-potion-config-panel__header">
                          <div>
                            <span>Descanso automático</span>
                            <strong id="auto-combat-rest-config-title">
                              Configure a pausa de recuperação
                            </strong>
                          </div>

                          <button
                            type="button"
                            className="auto-combat-potion-config-panel__close"
                            aria-label="Fechar configuração de descanso"
                            onClick={() => setIsRestConfigPanelOpen(false)}
                          >
                            Fechar
                          </button>
                        </div>

                        <div className="auto-combat-potion-config-grid auto-combat-potion-config-grid--minimal auto-combat-rest-config-modal__grid">
                          <section className="auto-combat-potion-threshold auto-combat-potion-threshold--minimal auto-combat-rest-config">
                            <div className="auto-combat-potion-threshold__header auto-combat-rest-config__header">
                              <div>
                                <span>Estado</span>
                                <strong>
                                  {autoRestEnabled
                                    ? "Descanso automático ativo"
                                    : "Descanso automático desativado"}
                                </strong>
                              </div>

                              <label className="auto-combat-rest-toggle">
                                <input
                                  type="checkbox"
                                  checked={autoRestEnabled}
                                  disabled={isRestConfigLoading}
                                  onChange={(event) =>
                                    setAutoRestEnabled(event.target.checked)
                                  }
                                />
                                <span>Ativo</span>
                              </label>
                            </div>

                            <p className="auto-combat-rest-config__hint">
                              O descanso só começa quando o HP cair no limite
                              baixo. A caça volta quando alcançar o limite de
                              retorno.
                            </p>

                            <div className="auto-combat-rest-threshold-grid">
                              <label>
                                <span>Iniciar descanso em</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={autoRestStartHpPercent}
                                  disabled={isRestConfigLoading}
                                  onChange={(event) => {
                                    const nextStart = Math.floor(
                                      clampNumber(event.target.value, 1, 99),
                                    );

                                    setAutoRestStartHpPercent(nextStart);
                                    setAutoRestStopHpPercent((currentStop) =>
                                      Math.max(nextStart + 1, currentStop),
                                    );
                                  }}
                                />
                              </label>

                              <label>
                                <span>Voltar a caçar em</span>
                                <input
                                  type="number"
                                  min={autoRestStartHpPercent + 1}
                                  max={100}
                                  value={autoRestStopHpPercent}
                                  disabled={isRestConfigLoading}
                                  onChange={(event) =>
                                    setAutoRestStopHpPercent(
                                      Math.floor(
                                        clampNumber(
                                          event.target.value,
                                          autoRestStartHpPercent + 1,
                                          100,
                                        ),
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </div>
                          </section>
                        </div>

                        {restConfigMessage ? (
                          <p className="auto-combat-potion-config-message">
                            {restConfigMessage}
                          </p>
                        ) : null}

                        <div className="auto-combat-potion-config-actions auto-combat-potion-config-actions--minimal">
                          <button
                            type="button"
                            className="auto-combat-primary-button"
                            disabled={isRestConfigLoading}
                            onClick={() => void handleSaveRestConfig()}
                          >
                            {isRestConfigLoading
                              ? "Salvando..."
                              : "Salvar descanso"}
                          </button>

                          <button
                            type="button"
                            className="auto-combat-secondary-button auto-combat-secondary-button--danger"
                            disabled={isRestConfigLoading}
                            onClick={() => void handleSaveRestConfig(false)}
                          >
                            Desativar
                          </button>
                        </div>
                      </article>
                    </div>
                  ) : null}

                  <AutoCombatSessionSummary
                    status={effectiveSession?.status}
                    currentCombatIndex={currentCombatIndex}
                    totalCombats={totalCombats}
                    totalKills={totalKills}
                    totalXpGained={normalizedSessionXp.totalXpGained}
                    baseXpGained={normalizedSessionXp.baseXpGained}
                    premiumBonusXp={normalizedSessionXp.premiumBonusXp}
                    premiumPotentialBonusXp={
                      normalizedSessionXp.premiumPotentialBonusXp
                    }
                    premiumTotalXp={normalizedSessionXp.premiumTotalXp}
                    isPremiumActive={normalizedSessionXp.isPremiumActive}
                    totalLoot={totalLoot}
                    potionsUsed={potionsUsed}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <AutoCombatStatsTab totalStats={totalStats} />
          )}
        </section>
      </div>

      {isStopHuntConfirmOpen ? (
        <div
          className="auto-combat-hunt-stop-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!isActionLoading) {
              setIsStopHuntConfirmOpen(false);
            }
          }}
        >
          <article
            className="auto-combat-hunt-stop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-combat-hunt-stop-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="auto-combat-hunt-stop-modal__header">
              <div>
                <span className="auto-combat-hunt-stop-modal__icon">
                  <i />
                  <i />
                  <i />
                </span>
                <strong id="auto-combat-hunt-stop-modal-title">
                  Parar caça
                </strong>
              </div>

              <button
                type="button"
                className="auto-combat-hunt-stop-modal__close"
                aria-label="Fechar confirmação"
                disabled={isActionLoading}
                onClick={() => setIsStopHuntConfirmOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="auto-combat-hunt-stop-modal__body">
              <div className="auto-combat-hunt-stop-modal__notice">
                <span aria-hidden="true">i</span>
                <p>
                  Os inimigos que você já rastreou ficarão prontos para
                  batalha imediatamente.
                </p>
              </div>

              <div className="auto-combat-hunt-stop-modal__notice">
                <span aria-hidden="true">i</span>
                <p>
                  Você pode voltar para a caça quando quiser, desde que ainda
                  não tenha atingido o limite. Novos inimigos encontrados serão
                  somados aos que você já rastreou.
                </p>
              </div>
            </div>

            <footer className="auto-combat-hunt-stop-modal__actions">
              <button
                type="button"
                className="auto-combat-hunt-stop-modal__button auto-combat-hunt-stop-modal__button--secondary"
                disabled={isActionLoading}
                onClick={() => setIsStopHuntConfirmOpen(false)}
              >
                Fechar
              </button>

              <button
                type="button"
                className="auto-combat-hunt-stop-modal__button auto-combat-hunt-stop-modal__button--danger"
                disabled={isActionLoading}
                onClick={handleStopHunt}
              >
                {isActionLoading ? "Parando..." : "Parar Caça"}
              </button>
            </footer>
          </article>
        </div>
      ) : null}

      {selectedThreatDetails && selectedThreatMob ? (
        <div
          className="auto-combat-threat-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedThreat(null)}
        >
          <article
            className="auto-combat-threat-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-combat-threat-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="auto-combat-threat-modal__close"
              aria-label="Fechar detalhes do monstro"
              onClick={() => setSelectedThreat(null)}
            >
              ×
            </button>

            <div className="auto-combat-threat-modal__visual">
              {selectedThreatImage ? (
                <img
                  src={selectedThreatImage}
                  alt={selectedThreatMob.name}
                  loading="lazy"
                />
              ) : (
                <span className="auto-combat-threat-modal__fallback">☣</span>
              )}
            </div>

            <div className="auto-combat-threat-modal__heading">
              <span>Ameaça próxima</span>
              <strong id="auto-combat-threat-modal-title">
                {selectedThreatMob.name}
              </strong>
            </div>

            <div className="auto-combat-threat-modal__pills">
              <span>XP {selectedThreatMob.xpReward ?? "—"}</span>
              <span>Nível {selectedThreatMob.level ?? "—"}</span>
              <span>HP {selectedThreatMob.hp ?? "—"}</span>
              {selectedThreatChance !== null ? (
                <span>{selectedThreatChance}% encontro</span>
              ) : null}
            </div>

            {canBattleSelectedThreat ? (
              <div className="auto-combat-threat-modal__battle-select">
                <div className="auto-combat-threat-modal__battle-copy">
                  <span>Disponíveis</span>
                  <strong>{selectedThreatRemainingCount}</strong>
                  <small>Escolha quantos deste mob deseja enfrentar.</small>
                </div>

                <div className="auto-combat-threat-modal__quantity">
                  <button
                    type="button"
                    aria-label="Diminuir quantidade"
                    onClick={() =>
                      setSelectedBattleQuantity((currentQuantity) =>
                        clampNumber(
                          currentQuantity - 1,
                          1,
                          selectedThreatRemainingCount,
                        ),
                      )
                    }
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={selectedThreatRemainingCount}
                    value={normalizedSelectedBattleQuantity}
                    onChange={(event) => {
                      setSelectedBattleQuantity(
                        clampNumber(
                          Number(event.target.value) || 1,
                          1,
                          selectedThreatRemainingCount,
                        ),
                      );
                    }}
                  />

                  <button
                    type="button"
                    aria-label="Aumentar quantidade"
                    onClick={() =>
                      setSelectedBattleQuantity((currentQuantity) =>
                        clampNumber(
                          currentQuantity + 1,
                          1,
                          selectedThreatRemainingCount,
                        ),
                      )
                    }
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="auto-combat-threat-modal__max-button"
                    onClick={() =>
                      setSelectedBattleQuantity(selectedThreatRemainingCount)
                    }
                  >
                    Máx.
                  </button>
                </div>

                <button
                  type="button"
                  className="auto-combat-primary-button auto-combat-threat-modal__battle-button"
                  disabled={isActionLoading}
                  onClick={() =>
                    handleStartAutoCombat({
                      mobId:
                        selectedThreatMob.id ?? selectedThreatDetails.mobId,
                      encounterId: selectedThreatDetails.id,
                      quantity: normalizedSelectedBattleQuantity,
                    })
                  }
                >
                  {isActionLoading ? "Processando..." : "Batalhar"}
                </button>
              </div>
            ) : null}

            <div className="auto-combat-threat-modal__divider">
              <span>Loot possível</span>
            </div>

            {selectedThreatDrops.length > 0 ? (
              <div className="auto-combat-threat-modal__loot-grid">
                {selectedThreatDrops.map((drop) => {
                  const itemName = drop.item?.name ?? "Item desconhecido";
                  const chanceLabel = formatDropChance(drop.dropChance);

                  return (
                    <div
                      key={drop.id}
                      className={[
                        "auto-combat-threat-loot-card",
                        getLootRarityClassName(drop.item?.rarity),
                      ].join(" ")}
                      title={itemName}
                    >
                      {chanceLabel ? (
                        <span className="auto-combat-threat-loot-card__chance">
                          {chanceLabel}
                        </span>
                      ) : null}

                      <span
                        className="auto-combat-threat-loot-card__icon"
                        aria-hidden="true"
                      >
                        {getLootInitials(itemName)}
                      </span>

                      <strong>{itemName}</strong>

                      <small>
                        {formatDropQuantity(drop.minQuantity, drop.maxQuantity)}
                      </small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="auto-combat-threat-modal__empty-loot">
                Nenhum drop cadastrado para este monstro.
              </p>
            )}
          </article>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
