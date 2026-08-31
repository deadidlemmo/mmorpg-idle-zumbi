import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import autoCombatActivityIcon from "../../../assets/images/auto-combat/auto-combat-activity-icon.webp";
import huntingActivityIcon from "../../../assets/images/auto-combat/hunting-activity-icon.webp";
import { ActivityProgressCard } from "../../../components/game/ActivityProgressCard";
import { ActivityTimelineFill } from "../../../components/game/ActivityTimelineFill";
import {
  getActivityTimelineFrame,
  type ActivityTimeline,
} from "../../../components/game/activityTimeline";
import { getConsumableItemImageUrl } from "../../consumables/utils/consumableItemAssets";
import {
  getCharacterOverview,
  updateCharacterCurrentMap,
} from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { DashboardTopBarActivityOverride } from "../../dashboard/components/DashboardTopBar";
import "../../dashboard/dashboard.css";
import type { CharacterOverviewResponse } from "../../dashboard/types/dashboard.types";
import {
  buildHuntingActivityQueue,
  countHuntingActivityQueue,
  type HuntingActivityTrackedSource,
} from "../../dashboard/utils/huntingActivityPresentation";
import { getGameItemImageUrl } from "../../inventory/utils/itemImageAssets";
import { getAutoCombatMaps, getAutoCombatStatus } from "../api/auto-combat.api";
import {
  buildMapVisualStyle,
  getMapImageByName,
} from "../assets/auto-combat-map-assets";
import "../auto-combat-mob-images.css";
import "../auto-combat.css";
import { AutoCombatBattleLog } from "../components/AutoCombatBattleLog";
import { AutoCombatMobTransition } from "../components/AutoCombatMobTransition";
import { AutoCombatPotionConfigModal } from "../components/AutoCombatPotionConfigModal";
import { AutoCombatPotionStockCard } from "../components/AutoCombatPotionStockCard";
import { AutoCombatPremiumBenefitsCard } from "../components/AutoCombatPremiumBenefitsCard";
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
  AutoCombatClientTelemetryPayload,
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
  formatClockSeconds,
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
  toSafeNumber,
  updateCharacterPotionConfigRaw,
} from "../utils/auto-combat-page.helpers";
import {
  getPotionQuantity,
  resolvePotionEventItemId,
  resolvePotionQuantityAfter,
} from "../utils/potion-stock";
import {
  getHuntEmptyStageCopy,
  shouldShowAutoCombatSessionStage,
} from "../utils/hunt-stage.helpers";
import { mergeAutoCombatStatusDetails } from "../utils/auto-combat-status-merge";
import {
  type BattleBatchCountdown,
  type BattleTargetDisplayCounts,
  formatAutoCombatTtkSeconds,
  getBattleBatchCountdown,
  getBattleTargetDisplayCounts,
  getBattleTopBarProgressPercent,
  getBattleVisualTimelineProgress,
  getDisplayBattleBatchCountdown,
  getStableBattleTargetDisplayCounts,
  getHuntDisplayCounts,
  getNextSecondTickDelayMs,
  getRepeatingBattleTimelineProgress,
  getRepeatingCycleProgress,
  getServerClientOffsetMs,
  getVisibleBattleCycleRemainingPercent,
} from "../utils/battle-timeline";
import {
  formatAutoCombatHuntingCountdown,
  formatAutoCombatHuntingCountdownClock,
  resolveAutoCombatHuntingCycleDurationMs,
} from "../utils/hunting-timeline";
import {
  resolveAutoCombatSelectedMapId,
  scopeInactiveAutoCombatSessionToMap,
  scopeInactiveAutoCombatStatusToMap,
} from "../utils/auto-combat-map-scope";
import {
  getMobFullBodyImage,
  getMobPortraitImage,
  getMobProgressionSortRank,
} from "../utils/mobAssets";
import {
  getAutoCombatPresentationCssTimeline,
  getAutoCombatPresentationNowMs,
  getAutoCombatPresentationProgress,
} from "../utils/presentation-timeline";
import { selectVisibleCharacterProgress } from "../utils/visible-progress";

const SHOW_AUTO_COMBAT_BATTLE_LOG = false;
const EMPTY_REALTIME_EVENTS: AutoCombatRealtimeEvent[] = [];

type AutoCombatHuntProgressStyle = CSSProperties & {
  "--hunt-progress"?: string;
};

function preloadAutoCombatImage(imageUrl?: string | null) {
  if (!imageUrl || typeof window === "undefined") {
    return;
  }

  const image = new Image();

  image.decoding = "async";
  image.src = imageUrl;
}

function AutoCombatHuntingCountdown({
  cycleEndsAtMs,
  forceComplete = false,
  serverClockOffsetMs,
  timeline,
  variant,
}: {
  cycleEndsAtMs: number;
  forceComplete?: boolean;
  serverClockOffsetMs: number;
  timeline?: ActivityTimeline | null;
  variant: "clock" | "status";
}) {
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const shouldTick = !forceComplete && (Boolean(timeline) || cycleEndsAtMs > 0);

  useEffect(() => {
    if (!shouldTick) return undefined;

    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldTick]);

  const remainingMs = forceComplete
    ? 0
    : timeline
      ? getActivityTimelineFrame(timeline).remainingMs
      : Math.max(0, cycleEndsAtMs - (clockNowMs + serverClockOffsetMs));
  const isComplete = remainingMs <= 0;
  const content = isComplete
    ? variant === "status"
      ? "Confirmando rastreio..."
      : "Sincronizando"
    : variant === "status"
      ? `Próximo rastreio em ${formatAutoCombatHuntingCountdown(remainingMs)}`
      : `Próximo em ${formatAutoCombatHuntingCountdownClock(remainingMs)}`;

  return <span className="auto-combat-hunt-countdown">{content}</span>;
}

function formatAutoCombatCount(
  count: number,
  singular: string,
  plural: string,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function estimateAutoCombatPotionUsageForSelection(params: {
  currentHp: number;
  maxHp: number;
  expectedDamagePerKill: number;
  selectedKills: number;
  availablePotions: number;
  potionHealAmount: number;
  potionTriggerPercent?: number | null;
}) {
  const selectedKills = Math.max(0, Math.floor(params.selectedKills));
  const maxHp = Math.max(0, Math.floor(params.maxHp));
  const expectedDamagePerKill = Math.max(0, params.expectedDamagePerKill);
  const potionHealAmount = Math.max(0, Math.floor(params.potionHealAmount));
  const thresholdHp =
    params.potionTriggerPercent !== null &&
    params.potionTriggerPercent !== undefined &&
    maxHp > 0
      ? Math.floor(
          (maxHp * clampNumber(params.potionTriggerPercent, 1, 100)) / 100,
        )
      : null;

  let hp = clampNumber(params.currentHp, 0, maxHp);
  let potionsRemaining = Math.max(0, Math.floor(params.availablePotions));
  let potionsUsed = 0;
  let safeKills = 0;

  for (let kill = 0; kill < selectedKills; kill += 1) {
    if (hp <= 0) break;

    hp = Math.max(0, hp - expectedDamagePerKill);

    if (hp <= 0) break;

    if (
      thresholdHp !== null &&
      potionsRemaining > 0 &&
      potionHealAmount > 0 &&
      hp <= thresholdHp
    ) {
      hp = clampNumber(hp + potionHealAmount, 0, maxHp);
      potionsRemaining -= 1;
      potionsUsed += 1;
    }

    if (hp <= 0) break;

    safeKills += 1;
  }

  return {
    finalHp: hp,
    potionsUsed,
    safeKills,
  };
}

function getAutoCombatPotionHealAmount(
  potion: PotionEquipmentItem | PotionInventoryOption | null | undefined,
  maxHp: number,
) {
  if (!potion) return 0;

  const healFlat = Math.max(0, Math.floor(toSafeNumber(potion.healFlat, 0)));
  const healPercent = Math.max(0, toSafeNumber(potion.healPercent, 0));
  const percentHeal = Math.floor((Math.max(0, maxHp) * healPercent) / 100);

  return healFlat + percentHeal;
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
  mapId?: string | null;
}) {
  const realtimeStatus = scopeInactiveAutoCombatStatusToMap(
    params.realtimeStatus,
    params.mapId,
  );
  const restStatus = scopeInactiveAutoCombatStatusToMap(
    params.restStatus,
    params.mapId,
  );

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

  return mergeAutoCombatStatusDetails(restStatus, realtimeStatus);
}

type MobFeedbackScope = {
  sessionId: string | null;
  enemyInstanceId: string | null;
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
    enemyInstanceId: normalizeMobScopeText(params.enemyInstanceId),
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
    enemyInstanceId: event.enemyInstanceId,
    combatIndex: event.combatIndex,
    mobId: event.mobId,
    mobName: event.mobName,
  });
}

function hasUsefulMobFeedbackScope(scope?: MobFeedbackScope | null) {
  return Boolean(
    scope?.enemyInstanceId ||
    scope?.combatIndex ||
    scope?.mobId ||
    scope?.mobName,
  );
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
    feedbackScope.enemyInstanceId &&
    visibleScope.enemyInstanceId &&
    feedbackScope.enemyInstanceId !== visibleScope.enemyInstanceId
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

function AutoCombatVisualTelemetryReporter({
  enemyInstanceId,
  visualCycleStartedAtMs,
  expectedDurationMs,
  remainingPercent,
  isAwaitingImpact,
  usesPresentationClock,
  reportTelemetry,
}: {
  enemyInstanceId?: string | null;
  visualCycleStartedAtMs?: number | null;
  expectedDurationMs?: number | null;
  remainingPercent: number;
  isAwaitingImpact: boolean;
  usesPresentationClock: boolean;
  reportTelemetry: (
    payload: Omit<AutoCombatClientTelemetryPayload, "characterId">,
  ) => void;
}) {
  const trackingRef = useRef<{
    key: string;
    startedAtMs: number;
    expectedDurationMs: number;
    reported: boolean;
  } | null>(null);

  useEffect(() => {
    const startedAtMs =
      typeof visualCycleStartedAtMs === "number"
        ? visualCycleStartedAtMs
        : null;
    const expectedMs = Math.max(0, expectedDurationMs ?? 0);

    if (!enemyInstanceId || startedAtMs === null || expectedMs <= 0) {
      if (!enemyInstanceId) {
        trackingRef.current = null;
      }

      return;
    }

    const key = `${enemyInstanceId}:${startedAtMs}`;
    const currentTracking = trackingRef.current;
    const tracking =
      currentTracking?.key === key
        ? currentTracking
        : {
            key,
            startedAtMs,
            expectedDurationMs: expectedMs,
            reported: false,
          };

    if (currentTracking !== tracking) {
      trackingRef.current = tracking;
    }

    if (tracking.reported || isAwaitingImpact || remainingPercent > 0) {
      return;
    }

    tracking.reported = true;
    reportTelemetry({
      kind: "VISUAL_CYCLE",
      visualDurationMs: Math.max(
        0,
        (usesPresentationClock
          ? getAutoCombatPresentationNowMs()
          : Date.now()) - tracking.startedAtMs,
      ),
      expectedDurationMs: tracking.expectedDurationMs,
    });
  }, [
    enemyInstanceId,
    expectedDurationMs,
    isAwaitingImpact,
    remainingPercent,
    reportTelemetry,
    usesPresentationClock,
    visualCycleStartedAtMs,
  ]);

  return null;
}

type AutoCombatPresentationCssTimeline = NonNullable<
  ReturnType<typeof getAutoCombatPresentationCssTimeline>
>;

function AutoCombatBattleProgressFill({
  timeline,
  progressPercent,
}: {
  timeline: AutoCombatPresentationCssTimeline | null;
  progressPercent: number;
}) {
  const [anchoredTimeline] = useState(timeline);
  const style = anchoredTimeline
    ? ({
        width: "100%",
        transformOrigin: "left center",
        animationName: "autoCombatBattleTimelineDrain",
        animationDuration: `${anchoredTimeline.durationSeconds}s`,
        animationDelay: `${-anchoredTimeline.elapsedSeconds}s`,
        animationTimingFunction: anchoredTimeline.timingFunction ?? "linear",
        animationFillMode: "both",
        animationIterationCount: anchoredTimeline.iterationCount,
        transitionDuration: "0ms",
      } as CSSProperties)
    : ({
        width: `${clampPercent(progressPercent)}%`,
      } as CSSProperties);

  return <b style={style} />;
}

export function AutoCombatPage() {
  "use no memo";

  const { characterId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedMapId = searchParams.get("mapId") ?? "";
  const requestedSubMapId = searchParams.get("subMapId") ?? "";
  const realtimeContext = useAutoCombatRealtime();
  const presentationTimelineEnabled =
    realtimeContext.presentationTimelineEnabled;
  const presentationTimeline = presentationTimelineEnabled
    ? realtimeContext.presentationTimeline
    : null;
  const huntingTimelineEnabled = realtimeContext.huntingTimelineEnabled;
  const huntingTimeline = huntingTimelineEnabled
    ? realtimeContext.huntingTimeline
    : null;
  const reportAutoCombatTelemetry = realtimeContext.reportTelemetry;
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
  const [isThreatPotionPickerOpen, setIsThreatPotionPickerOpen] =
    useState(false);
  const [isStopHuntConfirmOpen, setIsStopHuntConfirmOpen] = useState(false);
  const [availablePotions, setAvailablePotions] = useState<
    PotionInventoryOption[]
  >([]);
  const [autoPotionConfig, setAutoPotionConfig] =
    useState<CharacterPotionConfigWithItem | null>(null);
  const [isPotionConfigPanelOpen, setIsPotionConfigPanelOpen] = useState(false);
  const [selectedPotionSlotIndex, setSelectedPotionSlotIndex] = useState(0);
  const [selectedPotionItemId, setSelectedPotionItemId] = useState("");
  const [isPotionConfigLoading, setIsPotionConfigLoading] = useState(false);
  const [potionConfigMessage, setPotionConfigMessage] = useState("");

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

  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isStartingHunt, setIsStartingHunt] = useState(false);
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
  const stableBattleBatchCountdownRef = useRef<{
    key: string;
    countdown: BattleBatchCountdown;
  } | null>(null);
  const stableBattleTargetCountsRef = useRef<{
    key: string;
    counts: BattleTargetDisplayCounts;
  } | null>(null);
  const processedPotionEventKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    autoPotionConfigRef.current = autoPotionConfig;
  }, [autoPotionConfig]);

  useEffect(() => {
    selectedPotionItemIdRef.current = selectedPotionItemId;
  }, [selectedPotionItemId]);

  /* eslint-disable react-hooks/set-state-in-effect -- Route-scoped visual state must reset when the character changes. */
  useEffect(() => {
    setLocalRealtimeCombat(null);
    setLocalCharacterProgress(null);
    setLocalSessionTotals(null);
    setLocalBattleLogEvents([]);
    setLocalActiveEvent(null);
    setIsStartingHunt(false);
    setIsPotionConfigPanelOpen(false);
    setPotionConfigMessage("");
    processedPotionEventKeysRef.current.clear();
    lastPositiveRemainingSecondsRef.current = null;
    stableBattleBatchCountdownRef.current = null;
    stableBattleTargetCountsRef.current = null;
  }, [characterId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const realtimeStatus = getRealtimeStatus(realtimeState);
  const isRealtimeSynchronizing = Boolean(realtimeState.isSynchronizing);
  const currentCharacterMapId =
    overview?.character.currentMap?.id ??
    overview?.character.map?.id ??
    overview?.progression?.currentMap?.id ??
    null;
  const statusScopeMapId =
    selectedMapId || requestedMapId || currentCharacterMapId;
  const effectiveStatus = pickAutoCombatEffectiveStatus({
    realtimeStatus,
    restStatus: autoCombatStatus,
    mapId: statusScopeMapId,
  });
  const effectiveSession = scopeInactiveAutoCombatSessionToMap(
    getRealtimeSession(realtimeState, effectiveStatus),
    statusScopeMapId,
  );
  const providerRealtimeCombat = getRealtimeCombat(realtimeState);
  const providerProgress = getRealtimeProgress(realtimeState);
  const providerSessionTotals = getRealtimeTotals(realtimeState);
  const providerBattleLogEvents = getRealtimeBattleLogEvents(realtimeState);
  const providerActiveEvent = getRealtimeActiveEvent(realtimeState);
  const providerActiveEventType = normalizeRealtimeEventType(
    providerActiveEvent?.type,
  );
  const providerPublicActiveEvent =
    !isRealtimeSynchronizing && realtimeState.activeEventImpactApplied
      ? providerActiveEvent
      : null;
  const providerQueuedEventsRaw = isRealtimeSynchronizing
    ? EMPTY_REALTIME_EVENTS
    : (realtimeState.eventQueue ?? EMPTY_REALTIME_EVENTS);
  const providerQueueLength = isRealtimeSynchronizing
    ? 0
    : providerQueuedEventsRaw.length || getRealtimeQueueLength(realtimeState);
  const hasPendingCombatVisualEvent =
    isAutoCombatBattleVisualEvent(providerActiveEvent) ||
    providerQueuedEventsRaw.some(isAutoCombatBattleVisualEvent);

  const visualRealtimeCombat = providerRealtimeCombat ?? localRealtimeCombat;

  const effectiveSessionIsTerminal = isTerminalSessionStatus(
    effectiveSession?.status,
  );
  const preservedTrackedEnemiesCount = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        effectiveStatus?.autoCombatRecovery?.preservedTrackedEnemiesCount ??
          effectiveStatus?.preservedTrackedEnemiesCount ??
          effectiveSession?.autoCombatRecovery?.preservedTrackedEnemiesCount ??
          effectiveSession?.preservedTrackedEnemiesCount ??
          effectiveStatus?.huntBatch?.autoCombatRecovery
            ?.preservedTrackedEnemiesCount ??
          effectiveStatus?.huntBatch?.preservedTrackedEnemiesCount,
        0,
      ),
    ),
  );
  const hasPreservedTrackedEnemies =
    preservedTrackedEnemiesCount > 0 &&
    Boolean(
      effectiveStatus?.autoCombatRecovery?.hasPreservedTrackedEnemies ??
      effectiveStatus?.hasPreservedTrackedEnemies ??
      effectiveSession?.autoCombatRecovery?.hasPreservedTrackedEnemies ??
      effectiveSession?.hasPreservedTrackedEnemies ??
      effectiveStatus?.huntBatch?.autoCombatRecovery
        ?.hasPreservedTrackedEnemies ??
      effectiveStatus?.huntBatch?.hasPreservedTrackedEnemies,
    );

  const hasActiveSession =
    !effectiveSessionIsTerminal &&
    ((Boolean(effectiveSession) &&
      (Boolean(realtimeState.isActive) ||
        Boolean(realtimeState.hasActiveSession) ||
        Boolean(realtimeState.hasActiveAutoCombat))) ||
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
  const showActiveSession = shouldShowAutoCombatSessionStage({
    isStartingHunt,
    shouldDelayActiveSessionUntilStartSnapshot,
    isBackendCombatPhase,
    hasPendingRealtimeVisual,
  });
  const activeBattleSelection =
    effectiveStatus?.battleSelection ??
    effectiveSession?.battleSelection ??
    null;
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
  const activeBattleTargetRemainingSource =
    effectiveSession?.battleTargetRemaining ?? activeBattleSelection?.remaining;
  const hasAuthoritativeBattleTargetRemaining =
    activeBattleTargetRemainingSource !== null &&
    activeBattleTargetRemainingSource !== undefined;
  const activeBattleTargetRemaining = Math.max(
    0,
    Math.floor(toSafeNumber(activeBattleTargetRemainingSource, 0)),
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
    (isBackendHuntFlow ||
      isStartingHunt ||
      hasStartedHunt ||
      hasActiveSession ||
      showInlineHuntBattle ||
      hasPreservedTrackedEnemies);
  const showTravelEmptyStage =
    showHuntStage &&
    (isStartingHunt || (!isBackendHuntFlow && !showInlineHuntBattle));
  const showTrackedHuntStage =
    !isStartingHunt &&
    showHuntStage &&
    (isBackendHuntFlow || showInlineHuntBattle);
  const showHuntTrackerCard =
    showTrackedHuntStage && isBackendHuntingPhase && !showInlineHuntBattle;
  const hasCombatSnapshotWhileSynchronizing = Boolean(
    canRenderRestActiveSnapshot ||
    visualRealtimeCombat?.mobId ||
    visualRealtimeCombat?.mobName ||
    visualRealtimeCombat?.mobMaxHp ||
    visualRealtimeCombat?.battleProgressSeconds ||
    visualRealtimeCombat?.cycleStartedAt ||
    effectiveStatus?.currentMob?.id ||
    effectiveStatus?.currentMob?.name ||
    effectiveStatus?.battleProgress?.cycleStartedAt ||
    effectiveSession?.battleProgress?.cycleStartedAt,
  );
  const isCombatViewSynchronizing =
    showActiveSession &&
    isRealtimeSynchronizing &&
    !hasCombatSnapshotWhileSynchronizing;
  const [sessionClockNowMs, setSessionClockNowMs] = useState(() => Date.now());
  const [suppressProgressTransition, setSuppressProgressTransition] =
    useState(false);
  const [stableTimerStatus, setStableTimerStatus] = useState<{
    sessionId: string | null;
    status: AutoCombatStatusResponse;
  } | null>(null);
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
  const serverClockOffsetMs = useMemo(() => {
    const serverNow =
      activeTimerStatus?.serverNow ?? effectiveStatus?.serverNow;

    return getAutoCombatTimestampMs(serverNow) === null
      ? 0
      : getServerClientOffsetMs(serverNow, Date.now());
  }, [activeTimerStatus?.serverNow, effectiveStatus?.serverNow]);
  const syncedSessionNowMs = sessionClockNowMs + serverClockOffsetMs;
  const battleClockSyncKey = [
    visualRealtimeCombat?.mobId,
    visualRealtimeCombat?.mobName,
    visualRealtimeCombat?.cycleStartedAt,
    visualRealtimeCombat?.progressUpdatedAt,
    visualRealtimeCombat?.battleProgressSeconds,
    effectiveStatus?.battleProgress?.cycleStartedAt,
    effectiveStatus?.battleProgress?.progressUpdatedAt,
    effectiveStatus?.battleProgress?.progressSeconds,
    effectiveSession?.battleProgress?.cycleStartedAt,
    effectiveSession?.battleProgress?.progressUpdatedAt,
    effectiveSession?.battleProgress?.progressSeconds,
    providerPublicActiveEvent?.eventId,
    providerPublicActiveEvent?.sequence,
    providerPublicActiveEvent?.type,
    providerPublicActiveEvent?.createdAt,
    effectiveSession?.currentMobId,
    effectiveSession?.currentCombatIndex,
    effectiveSession?.battleTargetRemaining,
    effectiveSession?.lastProcessedAt,
  ]
    .map((value) => String(value ?? ""))
    .join("|");
  const battleClockProgressSource =
    visualRealtimeCombat ||
    effectiveStatus?.battleProgress ||
    effectiveSession?.battleProgress
      ? {
          cycleStartedAt:
            visualRealtimeCombat?.cycleStartedAt ??
            effectiveStatus?.battleProgress?.cycleStartedAt ??
            effectiveSession?.battleProgress?.cycleStartedAt,
          cycleDurationMs:
            visualRealtimeCombat?.cycleDurationMs ??
            effectiveStatus?.battleProgress?.cycleDurationMs ??
            effectiveSession?.battleProgress?.cycleDurationMs,
          cycleDurationSeconds:
            visualRealtimeCombat?.cycleDurationSeconds ??
            effectiveStatus?.battleProgress?.cycleDurationSeconds ??
            effectiveSession?.battleProgress?.cycleDurationSeconds,
          progressSeconds:
            visualRealtimeCombat?.battleProgressSeconds ??
            effectiveStatus?.battleProgress?.progressSeconds ??
            effectiveSession?.battleProgress?.progressSeconds,
          estimatedKillTimeSeconds:
            visualRealtimeCombat?.estimatedKillTimeSeconds ??
            effectiveStatus?.battleProgress?.estimatedKillTimeSeconds ??
            effectiveSession?.battleProgress?.estimatedKillTimeSeconds,
          progressUpdatedAt:
            visualRealtimeCombat?.progressUpdatedAt ??
            effectiveStatus?.battleProgress?.progressUpdatedAt ??
            effectiveSession?.battleProgress?.progressUpdatedAt ??
            visualRealtimeCombat?.updatedAt ??
            visualRealtimeCombat?.serverNow ??
            effectiveStatus?.battleProgress?.serverNow ??
            effectiveSession?.battleProgress?.serverNow ??
            activeTimerStatus?.serverNow ??
            effectiveStatus?.serverNow,
          serverNow:
            visualRealtimeCombat?.serverNow ??
            effectiveStatus?.battleProgress?.serverNow ??
            effectiveSession?.battleProgress?.serverNow ??
            activeTimerStatus?.serverNow ??
            effectiveStatus?.serverNow,
        }
      : null;
  const battleClockTimelineProgress = getRepeatingBattleTimelineProgress({
    source: battleClockProgressSource,
    nowMs: syncedSessionNowMs,
    fallbackServerNow:
      activeTimerStatus?.serverNow ?? effectiveStatus?.serverNow,
    fallbackProgressUpdatedAt:
      activeTimerStatus?.serverNow ?? effectiveStatus?.serverNow,
  });
  const battleAlignedSecondTickDelayMs = getNextSecondTickDelayMs(
    battleClockTimelineProgress,
  );

  useEffect(() => {
    if (!showActiveSession && !showHuntStage) return undefined;

    const intervalId = window.setInterval(
      () => {
        setSessionClockNowMs(Date.now());
      },
      showActiveSession && isBackendCombatPhase ? 100 : 1000,
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isBackendCombatPhase, showActiveSession, showHuntStage]);

  useEffect(() => {
    if (!showActiveSession || !isBackendCombatPhase) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSessionClockNowMs(Date.now());
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [battleClockSyncKey, isBackendCombatPhase, showActiveSession]);

  useEffect(() => {
    if (
      !showActiveSession ||
      !isBackendCombatPhase ||
      battleAlignedSecondTickDelayMs === null
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSessionClockNowMs(Date.now());
    }, battleAlignedSecondTickDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    battleAlignedSecondTickDelayMs,
    battleClockSyncKey,
    isBackendCombatPhase,
    showActiveSession,
    syncedSessionNowMs,
  ]);

  useEffect(() => {
    let releaseTimeoutId: number | null = null;

    const snapProgressToCurrentTime = () => {
      if (document.visibilityState === "hidden") {
        setSuppressProgressTransition(true);
        return;
      }

      flushSync(() => {
        setSuppressProgressTransition(true);
        setSessionClockNowMs(Date.now());
      });

      if (releaseTimeoutId !== null) {
        window.clearTimeout(releaseTimeoutId);
      }

      releaseTimeoutId = window.setTimeout(() => {
        setSuppressProgressTransition(false);
        releaseTimeoutId = null;
      }, 240);
    };

    document.addEventListener("visibilitychange", snapProgressToCurrentTime);
    window.addEventListener("focus", snapProgressToCurrentTime);
    window.addEventListener("pageshow", snapProgressToCurrentTime);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        snapProgressToCurrentTime,
      );
      window.removeEventListener("focus", snapProgressToCurrentTime);
      window.removeEventListener("pageshow", snapProgressToCurrentTime);

      if (releaseTimeoutId !== null) {
        window.clearTimeout(releaseTimeoutId);
      }
    };
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- Preserve the last authoritative timer across transient socket gaps. */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
        const overviewCurrentMapId =
          overviewData.character.currentMap?.id ??
          overviewData.character.map?.id ??
          overviewData.progression?.currentMap?.id ??
          null;

        return resolveAutoCombatSelectedMapId({
          maps: getVisibleCombatMaps(mapsData),
          activeSessionMapId: activeStatusMapId,
          currentSelectionMapId: currentValue,
          requestedMapId,
          requestedSubMapId,
          characterMapId: overviewCurrentMapId,
        });
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
  }, [characterId, requestedMapId, requestedSubMapId]);

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

  const battleLogEvents = useMemo(
    () =>
      providerBattleLogEvents.length > 0
        ? providerBattleLogEvents
        : localBattleLogEvents,
    [localBattleLogEvents, providerBattleLogEvents],
  );

  const activeBattleLogEvent = showActiveSession
    ? (providerPublicActiveEvent ?? localActiveEvent)
    : null;
  const visibleMobFeedbackScope = useMemo(
    () =>
      showActiveSession
        ? createMobFeedbackScope({
            sessionId: visualRealtimeCombat?.sessionId ?? effectiveSession?.id,
            enemyInstanceId:
              visualRealtimeCombat?.enemyInstanceId ??
              realtimeState.mob?.enemyInstanceId ??
              effectiveStatus?.currentMob?.enemyInstanceId ??
              effectiveSession?.currentEnemyInstanceId ??
              effectiveSession?.enemyInstanceId ??
              null,
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
      effectiveSession?.currentEnemyInstanceId,
      effectiveSession?.currentMob?.id,
      effectiveSession?.currentMob?.name,
      effectiveSession?.currentMobId,
      effectiveSession?.enemyInstanceId,
      effectiveSession?.id,
      effectiveStatus?.currentMob?.enemyInstanceId,
      effectiveStatus?.currentMob?.id,
      effectiveStatus?.currentMob?.name,
      effectiveStatus?.session?.currentCombatIndex,
      showActiveSession,
      realtimeState.mob?.enemyInstanceId,
      visualRealtimeCombat?.combatIndex,
      visualRealtimeCombat?.enemyInstanceId,
      visualRealtimeCombat?.mobId,
      visualRealtimeCombat?.mobName,
      visualRealtimeCombat?.sessionId,
    ],
  );
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

    const mapThreat = selectedMapThreats.find((encounter) => {
      return encounter.id === selectedThreat.id;
    });

    if (!mapThreat) {
      return selectedThreat;
    }

    const mapDrops = mapThreat.mob?.drops ?? [];
    const selectedDrops = selectedThreat.mob?.drops ?? [];
    const mergedMob =
      mapThreat.mob || selectedThreat.mob
        ? {
            ...(mapThreat.mob ?? {}),
            ...(selectedThreat.mob ?? {}),
            drops: selectedDrops.length > 0 ? selectedDrops : mapDrops,
          }
        : null;

    return {
      ...mapThreat,
      ...selectedThreat,
      mob: mergedMob,
    } as AutoCombatEncounterViewModel;
  }, [selectedMapThreats, selectedThreat]);

  const selectedThreatMob = selectedThreatDetails?.mob ?? null;
  const selectedThreatChance = selectedThreatDetails
    ? getThreatWeightPercent(selectedThreatDetails, selectedMapThreats)
    : null;
  const selectedThreatImage =
    getMobFullBodyImage(selectedThreatMob?.name) ??
    getMobPortraitImage(selectedThreatMob?.name);
  const selectedThreatDrops = selectedThreatMob?.drops ?? [];

  const selectedMapCombatIsUnlocked = selectedMap
    ? currentSelectionLevel >= getGameMapMinLevel(selectedMap)
    : false;

  const selectedMapHasActiveEncounters = selectedMapThreats.length > 0;

  useEffect(() => {
    if (!selectedThreat) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleThreatModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsThreatPotionPickerOpen(false);
        setSelectedThreat(null);
      }
    }

    window.addEventListener("keydown", handleThreatModalKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
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

  /* eslint-disable react-hooks/set-state-in-effect -- Selection mirrors the active session and route request. */
  useEffect(() => {
    if (maps.length <= 0) return;

    const nextMapId = resolveAutoCombatSelectedMapId({
      maps: availableMaps,
      activeSessionMapId: isMapSelectionLocked
        ? resolvedActiveSessionMapId
        : null,
      currentSelectionMapId: selectedMapId,
      requestedMapId,
      requestedSubMapId,
      characterMapId: currentCharacterMapId,
    });

    if (selectedMapId !== nextMapId) {
      setSelectedMapId(nextMapId);
    }
  }, [
    maps,
    availableMaps,
    currentCharacterMapId,
    isMapSelectionLocked,
    resolvedActiveSessionMapId,
    selectedMapId,
    requestedMapId,
    requestedSubMapId,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!characterId) {
    return <Navigate to="/characters" replace />;
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

  const membershipHref = `/dashboard/${characterId}/membership`;

  const characterWithPotionConfig =
    character as CharacterWithSinglePotionConfig;

  const fallbackPotionConfig =
    characterWithPotionConfig.autoPotionConfig ??
    characterWithPotionConfig.potionConfig ??
    characterWithPotionConfig.potionConfigs?.[0] ??
    null;

  const currentPotionConfig = autoPotionConfig ?? fallbackPotionConfig;

  const configuredPotionItem = getPotionItem(currentPotionConfig);
  const configuredPotionImage = getConsumableItemImageUrl(configuredPotionItem);

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

  const configuredPotionQuantity = getPotionQuantity(
    currentPotionConfig,
    availablePotions,
  );

  const potionSlots = Array.from({ length: 1 }, () => {
    return currentPotionConfig;
  });

  const latestKilledMob = showActiveSession
    ? getLatestKilledMob(effectiveStatus)
    : null;
  const mainThreat = selectedMapThreats[0] ?? null;
  const activeTimerSession = getSessionFromStatus(activeTimerStatus);
  const activeTimerEndsAtMs = getAutoCombatTimestampMs(
    activeTimerSession?.endsAt ??
      activeTimerStatus?.sessionSummary?.duration?.endsAt,
  );
  const activeTimerDeadlineReached =
    activeTimerEndsAtMs !== null && syncedSessionNowMs >= activeTimerEndsAtMs;
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
    !activeTimerDeadlineReached &&
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
      : showActiveSession
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
      : showActiveSession
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
  const huntEmptyStageCopy = getHuntEmptyStageCopy({
    isStartingHunt,
    isActionLoading,
    hasPreservedTrackedEnemies,
    preservedTrackedEnemiesCount,
    characterHasHp,
  });

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
  const activeMobEnemyInstanceId = showActiveSession
    ? (visualRealtimeCombat?.enemyInstanceId ??
      realtimeState.mob?.enemyInstanceId ??
      statusActiveMob?.enemyInstanceId ??
      effectiveSession?.currentEnemyInstanceId ??
      effectiveSession?.enemyInstanceId ??
      null)
    : null;

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
  const activeBattleImpactTargetKey = [
    effectiveSession?.id ?? visualRealtimeCombat?.sessionId ?? "session:any",
    activeMobEnemyInstanceId ?? "enemy:any",
    visualRealtimeCombat?.combatIndex ??
      effectiveStatus?.session?.currentCombatIndex ??
      effectiveSession?.currentCombatIndex ??
      "combat:any",
    activeBattleTargetMobId ??
      activeBattleTargetEncounterId ??
      visualRealtimeCombat?.mobId ??
      statusActiveMob?.id ??
      normalizedActiveMobName ??
      "mob:any",
  ].join(":");

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
    : showActiveSession && visualRealtimeCombat?.mobCurrentHp != null
      ? visualRealtimeCombat.mobCurrentHp
      : showActiveSession && statusActiveMob?.currentHp != null
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
  const hasDefeatedMobSnapshot =
    showActiveSession && activeMobMaxHp > 0 && activeMobCurrentHp <= 0;

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
        cycleStartedAt?: string | number | Date | null;
        cycleDurationMs?: number | string | null;
        cycleDurationSeconds?: number | string | null;
        progressUpdatedAt?: string | number | Date | null;
        serverNow?: string | number | Date | null;
        killsPerMinute?: number | string | null;
        killsPerHour?: number | string | null;
        difficultyLabel?: string | null;
        updatedAt?: number | string | null;
      }
    | null
    | undefined;
  const activeBattleProgressServerNow =
    visualBattleProgress?.serverNow ??
    activeBattleProgressSource?.serverNow ??
    activeTimerStatus?.serverNow ??
    effectiveStatus?.serverNow ??
    null;
  const hasLocalVisualCycle = Boolean(
    activeMobEnemyInstanceId &&
    realtimeState.visualCycleEnemyInstanceId === activeMobEnemyInstanceId &&
    typeof realtimeState.visualCycleStartedAtMs === "number" &&
    Number.isFinite(realtimeState.visualCycleStartedAtMs),
  );
  const localVisualCycleStartedAtMs = hasLocalVisualCycle
    ? realtimeState.visualCycleStartedAtMs
    : null;
  const authoritativeBattleCycleStartedAt =
    visualBattleProgress?.cycleStartedAt ??
    activeBattleProgressSource?.cycleStartedAt ??
    null;
  const hasAuthoritativeBattleCycle =
    getAutoCombatTimestampMs(authoritativeBattleCycleStartedAt) !== null;
  const activeBattleNowMs = hasAuthoritativeBattleCycle
    ? syncedSessionNowMs
    : sessionClockNowMs;
  const activeBattleTimelineProgress = getBattleVisualTimelineProgress({
    source: {
      cycleStartedAt:
        authoritativeBattleCycleStartedAt ?? localVisualCycleStartedAtMs,
      cycleDurationMs:
        visualBattleProgress?.cycleDurationMs ??
        activeBattleProgressSource?.cycleDurationMs,
      cycleDurationSeconds:
        visualBattleProgress?.cycleDurationSeconds ??
        activeBattleProgressSource?.cycleDurationSeconds,
      progressSeconds:
        visualBattleProgress?.battleProgressSeconds ??
        activeBattleProgressSource?.progressSeconds,
      estimatedKillTimeSeconds:
        visualBattleProgress?.estimatedKillTimeSeconds ??
        activeBattleProgressSource?.estimatedKillTimeSeconds,
      progressUpdatedAt:
        visualBattleProgress?.progressUpdatedAt ??
        activeBattleProgressSource?.progressUpdatedAt ??
        visualBattleProgress?.updatedAt ??
        activeBattleProgressServerNow,
      serverNow: activeBattleProgressServerNow,
    },
    nowMs: activeBattleNowMs,
    fallbackServerNow: activeBattleProgressServerNow,
    fallbackProgressUpdatedAt: activeBattleProgressServerNow,
  });
  const activePresentationTimelineProgress =
    presentationTimeline &&
    (!activeMobEnemyInstanceId ||
      presentationTimeline.enemyInstanceId === activeMobEnemyInstanceId)
      ? getAutoCombatPresentationProgress({
          timeline: presentationTimeline,
          nowMs: getAutoCombatPresentationNowMs(),
        })
      : null;
  const activeDisplayBattleTimelineProgress =
    activePresentationTimelineProgress ?? activeBattleTimelineProgress;
  const fallbackEstimatedKillTimeSeconds = Math.max(
    0,
    toSafeNumber(
      visualBattleProgress?.estimatedKillTimeSeconds ??
        activeBattleProgressSource?.estimatedKillTimeSeconds,
      0,
    ),
  );
  const activeEstimatedKillTimeSeconds = Math.max(
    0,
    activeDisplayBattleTimelineProgress
      ? activeDisplayBattleTimelineProgress.cycleDurationMs / 1000
      : fallbackEstimatedKillTimeSeconds,
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
  const activeKillProgressTickSeconds = activeDisplayBattleTimelineProgress
    ? activeDisplayBattleTimelineProgress.cycleElapsedMs / 1000
    : activeKillProgressSnapshotSeconds;
  const activeKillProgressSeconds = clampNumber(
    activeKillProgressTickSeconds,
    0,
    activeEstimatedKillTimeSeconds || Number.MAX_SAFE_INTEGER,
  );
  const hasTtkBattleProgress =
    showActiveSession && activeEstimatedKillTimeSeconds > 0;
  const isBattleCycleVisuallyComplete = Boolean(
    activeDisplayBattleTimelineProgress?.isComplete,
  );
  const confirmedMobDefeatedEventScope = getMobFeedbackScopeFromEvent(
    providerPublicActiveEvent,
  );
  const hasConfirmedMobDefeatedEvent =
    normalizeRealtimeEventType(providerPublicActiveEvent?.type) ===
      "MOB_DEFEATED" &&
    (!hasUsefulMobFeedbackScope(confirmedMobDefeatedEventScope) ||
      !hasUsefulMobFeedbackScope(visibleMobFeedbackScope) ||
      !hasMobFeedbackScopeMismatch(
        confirmedMobDefeatedEventScope,
        visibleMobFeedbackScope,
      ));
  const isMobDefeatVisuallyConfirmed =
    hasDefeatedMobSnapshot || hasConfirmedMobDefeatedEvent;
  const isRawBattleBatchComplete =
    activeBattleTargetTotal > 0 &&
    hasAuthoritativeBattleTargetRemaining &&
    activeBattleTargetRemaining <= 0;
  const isBattleBatchVisuallyComplete =
    isRawBattleBatchComplete && isMobDefeatVisuallyConfirmed;
  const activeKillRemainingSeconds = hasTtkBattleProgress
    ? clampNumber(
        activeEstimatedKillTimeSeconds - activeKillProgressSeconds,
        0,
        activeEstimatedKillTimeSeconds,
      )
    : 0;
  const isPresentationCycleAwaitingAnchor = Boolean(
    presentationTimelineEnabled &&
    showActiveSession &&
    hasTtkBattleProgress &&
    !activePresentationTimelineProgress &&
    !isMobDefeatVisuallyConfirmed,
  );
  const isMobSpawnAwaitingImpact =
    providerActiveEventType === "MOB_SPAWNED" &&
    !realtimeState.activeEventImpactApplied &&
    !hasDefeatedMobSnapshot;
  const shouldHoldBattleAtFullProgress =
    isMobSpawnAwaitingImpact || isPresentationCycleAwaitingAnchor;
  const shouldHoldCountdownAtLastSecond =
    hasTtkBattleProgress &&
    isBattleCycleVisuallyComplete &&
    !isMobDefeatVisuallyConfirmed;
  const displayedKillRemainingSeconds = shouldHoldBattleAtFullProgress
    ? activeEstimatedKillTimeSeconds
    : isMobDefeatVisuallyConfirmed || isBattleBatchVisuallyComplete
      ? 0
      : shouldHoldCountdownAtLastSecond
        ? Math.min(1, activeEstimatedKillTimeSeconds)
        : activeKillRemainingSeconds;
  const visibleBattleCycleRemainingPercent =
    activePresentationTimelineProgress?.remainingPercent ??
    getVisibleBattleCycleRemainingPercent({
      progress: activeBattleTimelineProgress,
      visualCycleStartedAtMs: localVisualCycleStartedAtMs,
      clientNowMs: sessionClockNowMs,
      serverClientOffsetMs: serverClockOffsetMs,
    });
  const activeTopBarBattleProgressPercent = getBattleTopBarProgressPercent({
    timelineRemainingPercent:
      visibleBattleCycleRemainingPercent ??
      (activeBattleTimelineProgress
        ? 100 - activeBattleTimelineProgress.progressPercent
        : undefined),
    mobHpPercent: activeMobHpPercent,
    isMobSpawnAwaitingImpact: shouldHoldBattleAtFullProgress,
    isMobDefeated: isMobDefeatVisuallyConfirmed,
  });
  const activeBattleProgressTimelineCandidate =
    activePresentationTimelineProgress &&
    !shouldHoldBattleAtFullProgress &&
    !isMobDefeatVisuallyConfirmed
      ? getAutoCombatPresentationCssTimeline({
          timeline: presentationTimeline,
          nowMs: getAutoCombatPresentationNowMs(),
        })
      : null;
  const activeBattleProgressTimeline = activeBattleProgressTimelineCandidate;

  const activeBattleProgressElementKey =
    activePresentationTimelineProgress?.key ?? activeBattleImpactTargetKey;
  const activeKillProgressLabel = isMobDefeatVisuallyConfirmed
    ? "Alvo derrotado"
    : hasTtkBattleProgress
      ? `${formatAutoCombatTtkSeconds(displayedKillRemainingSeconds)} restantes`
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
  const activeBattleTargetCountsKey = [
    effectiveSession?.id ?? visualRealtimeCombat?.sessionId ?? "session",
    activeBattleTargetMobId ??
      activeBattleTargetEncounterId ??
      activeMobName ??
      "target",
    activeBattleTargetTotal,
  ].join(":");
  const confirmedBattleTargetCounts = getBattleTargetDisplayCounts({
    total: activeBattleTargetTotal,
    remaining: activeBattleTargetRemaining,
    defeated: activeBattleTargetDefeated,
    completedCycles: 0,
  });
  const previousStableBattleTargetCounts =
    stableBattleTargetCountsRef.current?.key === activeBattleTargetCountsKey
      ? stableBattleTargetCountsRef.current.counts
      : null;
  const displayedBattleTargetCounts =
    showInlineHuntBattle && previousStableBattleTargetCounts
      ? getStableBattleTargetDisplayCounts({
          current: confirmedBattleTargetCounts,
          previous: previousStableBattleTargetCounts,
        })
      : confirmedBattleTargetCounts;

  if (showInlineHuntBattle && confirmedBattleTargetCounts.total > 0) {
    stableBattleTargetCountsRef.current = {
      key: activeBattleTargetCountsKey,
      counts: displayedBattleTargetCounts,
    };
  } else if (!showInlineHuntBattle) {
    stableBattleTargetCountsRef.current = null;
  }

  const displayedBattleTargetTotal = displayedBattleTargetCounts.total;
  const displayedBattleTargetRemaining = displayedBattleTargetCounts.remaining;
  const displayedBattleTargetDefeated = displayedBattleTargetCounts.defeated;
  const activeBattleBatchCountdown = getBattleBatchCountdown({
    total: displayedBattleTargetTotal,
    defeated: displayedBattleTargetDefeated,
    cycleDurationSeconds: activeEstimatedKillTimeSeconds,
    currentCycleRemainingSeconds: activeKillRemainingSeconds,
  });
  const activeBattleBatchCountdownKey = [
    effectiveSession?.id ?? visualRealtimeCombat?.sessionId ?? "session",
    activeBattleTargetMobId ??
      activeBattleTargetEncounterId ??
      activeMobName ??
      "target",
  ].join(":");
  const lastStableBattleBatchCountdown = stableBattleBatchCountdownRef.current;
  const stableBattleBatchCountdown =
    lastStableBattleBatchCountdown?.key === activeBattleBatchCountdownKey
      ? lastStableBattleBatchCountdown.countdown
      : null;
  const hasUnresolvedBattleBatchTargets =
    showInlineHuntBattle &&
    (displayedBattleTargetCounts.snapshotRemaining > 0 ||
      displayedBattleTargetRemaining > 0 ||
      activeBattleTargetRemaining > 0);
  const displayedBattleBatchCountdown =
    activeBattleBatchCountdown.totalSeconds > 0
      ? getDisplayBattleBatchCountdown({
          current: activeBattleBatchCountdown,
          previous: stableBattleBatchCountdown,
          hasUnresolvedTargets: hasUnresolvedBattleBatchTargets,
          fallbackRemainingSeconds:
            displayedBattleTargetCounts.snapshotRemaining > 0 &&
            activeEstimatedKillTimeSeconds > 0
              ? displayedBattleTargetCounts.snapshotRemaining *
                activeEstimatedKillTimeSeconds
              : null,
        })
      : showInlineHuntBattle && stableBattleBatchCountdown
        ? stableBattleBatchCountdown
        : activeBattleBatchCountdown;

  if (
    showInlineHuntBattle &&
    displayedBattleBatchCountdown.totalSeconds > 0 &&
    displayedBattleBatchCountdown.remainingSeconds > 0
  ) {
    stableBattleBatchCountdownRef.current = {
      key: activeBattleBatchCountdownKey,
      countdown: displayedBattleBatchCountdown,
    };
  } else if (!showInlineHuntBattle) {
    stableBattleBatchCountdownRef.current = null;
  }

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
  const activeMobHpDisplayLabel =
    activeMobMaxHp > 0
      ? `${Math.round(activeMobCurrentHp)}/${Math.round(activeMobMaxHp)} HP`
      : activeMobReference;

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

  const characterPremiumUntilMs = Date.parse(
    String(character.premiumUntil ?? character.membership?.premiumUntil ?? ""),
  );
  const characterPremiumUntilActive =
    Number.isFinite(characterPremiumUntilMs) &&
    characterPremiumUntilMs > Date.now();
  const characterPremiumActive = Boolean(
    character.isPremiumActive ||
    character.membership?.isPremiumActive ||
    characterPremiumUntilActive,
  );

  const rewardPremiumActive = Boolean(
    visibleSessionTotals?.isPremiumActive ??
    effectiveStatus?.sessionSummary?.progression?.isPremiumActive ??
    effectiveSession?.isPremiumActive ??
    visualRealtimeCombat?.isPremiumActive ??
    false,
  );

  const isPremiumActive = rewardPremiumActive || characterPremiumActive;

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
  const isConfiguredPotionAutoUseEnabled = Boolean(
    configuredPotionItem?.id &&
    currentPotionConfig?.enabled !== false &&
    currentPotionConfig?.useInAutoCombat !== false,
  );
  const configuredPotionTriggerPercent = isConfiguredPotionAutoUseEnabled
    ? clampNumber(currentPotionConfig?.hpThresholdPercent, 1, 100)
    : null;
  const isPotionUseFeedbackActive = Boolean(
    providerPublicActiveEvent && providerActiveEventType === "POTION_USED",
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
  const trackedMonsterSnapshots: AutoCombatTrackedMonsterViewModel[] =
    effectiveStatus?.trackedMonsters ??
    effectiveStatus?.huntBatch?.mobs ??
    effectiveStatus?.rewards?.trackedMonsters ??
    huntingSnapshot?.trackedMonsters ??
    [];
  const hasTrackedMonsterSnapshot = trackedMonsterSnapshots.length > 0;
  const trackedEnemiesRemainingCount = trackedMonsterSnapshots.reduce(
    (total, trackedMonster) => {
      const remainingCount = Math.max(
        0,
        Math.floor(
          toSafeNumber(
            trackedMonster.remainingCount ?? trackedMonster.foundCount,
            0,
          ),
        ),
      );

      return total + remainingCount;
    },
    0,
  );
  const authoritativeAvailableEnemiesCount = toSafeNumber(
    huntingSnapshot?.availableEnemiesCount ??
      huntingSnapshot?.remainingEnemiesCount ??
      effectiveStatus?.huntCapacity?.availableEnemiesCount ??
      effectiveStatus?.huntCapacity?.remainingEnemiesCount ??
      effectiveStatus?.huntBatch?.availableEnemiesCount ??
      effectiveStatus?.huntBatch?.remainingEnemiesCount ??
      effectiveSession?.availableEnemiesCount ??
      effectiveSession?.remainingEnemiesCount,
    Number.NaN,
  );
  const hasAuthoritativeAvailableEnemiesCount = Number.isFinite(
    authoritativeAvailableEnemiesCount,
  );
  const availableEnemiesCount = Math.max(
    0,
    Math.floor(
      hasTrackedMonsterSnapshot
        ? trackedEnemiesRemainingCount
        : hasAuthoritativeAvailableEnemiesCount
          ? authoritativeAvailableEnemiesCount
          : foundEnemiesCount,
    ),
  );
  const effectiveRemainingHuntCapacity =
    maxTrackedEnemies > 0
      ? Math.max(0, maxTrackedEnemies - availableEnemiesCount)
      : remainingHuntCapacity;
  const effectiveIsHuntLimitReached =
    hasTrackedMonsterSnapshot || hasAuthoritativeAvailableEnemiesCount
      ? maxTrackedEnemies > 0 && availableEnemiesCount >= maxTrackedEnemies
      : isHuntLimitReached;
  const trackedMonstersForSelection = trackedMonsterSnapshots.filter(
    (trackedMonster) => {
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
    },
  );
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
          const matchingMob = matchingEncounter?.mob ?? null;
          const matchingDrops = matchingMob?.drops ?? [];
          const displayMob =
            matchingMob || trackedMob
              ? {
                  id:
                    trackedMob?.id ??
                    matchingMob?.id ??
                    safeMobId ??
                    safeEncounterId,
                  name:
                    trackedMob?.name ??
                    matchingMob?.name ??
                    trackedMonster.mobName ??
                    "Infectado",
                  description:
                    trackedMob?.description ?? matchingMob?.description ?? null,
                  level:
                    trackedMob?.level ??
                    matchingMob?.level ??
                    trackedMonster.mobLevel ??
                    1,
                  tier:
                    trackedMob?.tier ??
                    matchingMob?.tier ??
                    trackedMonster.mobTier ??
                    1,
                  hp:
                    trackedMob?.hp ?? trackedMob?.maxHp ?? matchingMob?.hp ?? 1,
                  attack: trackedMob?.attack ?? matchingMob?.attack ?? 0,
                  defense: trackedMob?.defense ?? matchingMob?.defense ?? 0,
                  speed: trackedMob?.speed ?? matchingMob?.speed ?? 0,
                  xpReward: trackedMob?.xpReward ?? matchingMob?.xpReward ?? 0,
                  currentHp:
                    trackedMob?.currentHp ??
                    trackedMob?.hp ??
                    matchingMob?.currentHp ??
                    matchingMob?.hp ??
                    null,
                  maxHp:
                    trackedMob?.maxHp ??
                    trackedMob?.hp ??
                    matchingMob?.maxHp ??
                    matchingMob?.hp ??
                    null,
                  hpPercent:
                    trackedMob?.hpPercent ?? matchingMob?.hpPercent ?? null,
                  battleProgress:
                    trackedMob?.battleProgress ??
                    matchingMob?.battleProgress ??
                    null,
                  survivalProjection:
                    trackedMob?.survivalProjection ??
                    matchingMob?.survivalProjection ??
                    null,
                  foundCount: safeRemainingCount,
                  huntFoundCount: safeRemainingCount,
                  iconUrl: trackedMob?.iconUrl ?? matchingMob?.iconUrl ?? null,
                  imageUrl:
                    trackedMob?.imageUrl ?? matchingMob?.imageUrl ?? null,
                  assetKey:
                    trackedMob?.assetKey ?? matchingMob?.assetKey ?? null,
                  drops: matchingDrops,
                }
              : null;

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
            mob: displayMob,
          } as AutoCombatEncounterViewModel;
        })
      : selectedMapThreats
  )
    .filter((encounter) => {
      if (!showInlineHuntBattle) {
        return true;
      }

      const encounterMobId = encounter.mob?.id ?? encounter.mobId;

      return (
        encounter.id !== activeBattleTargetEncounterId &&
        encounterMobId !== activeBattleTargetMobId
      );
    })
    .sort(compareAutoCombatThreatsByProgression);
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
  const selectedThreatSurvivalProjection =
    selectedThreatMob?.survivalProjection ?? null;
  const selectedThreatPotionEnabled = Boolean(isConfiguredPotionAutoUseEnabled);
  const selectedThreatAvailablePotions = selectedThreatPotionEnabled
    ? configuredPotionQuantity
    : 0;
  const selectedThreatPotionHealAmount = selectedThreatPotionEnabled
    ? getAutoCombatPotionHealAmount(configuredPotionItem, currentCharacterMaxHp)
    : 0;
  const selectedThreatPotionTriggerPercent = selectedThreatPotionEnabled
    ? (currentPotionConfig?.hpThresholdPercent ??
      selectedThreatSurvivalProjection?.potionTriggerPercent ??
      null)
    : null;
  const selectedThreatProjectionKillLimit = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        selectedThreatSurvivalProjection?.projectedKills,
        selectedThreatRemainingCount,
      ),
    ),
  );
  const selectedThreatExpectedDamage = Math.max(
    0,
    Math.ceil(
      toSafeNumber(selectedThreatSurvivalProjection?.expectedDamagePerKill, 0),
    ),
  );
  const selectedThreatExpectedDodge = clampPercent(
    selectedThreatSurvivalProjection?.expectedDodgeChancePercent,
  );
  const selectedThreatEstimatedSeconds = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        selectedThreatSurvivalProjection?.estimatedKillTimeSeconds,
        0,
      ) * normalizedSelectedBattleQuantity,
    ),
  );
  const selectedThreatProjectedSurvivalWithPotions =
    selectedThreatSurvivalProjection
      ? estimateAutoCombatPotionUsageForSelection({
          currentHp: currentCharacterHp,
          maxHp: currentCharacterMaxHp,
          expectedDamagePerKill: toSafeNumber(
            selectedThreatSurvivalProjection.expectedDamagePerKill,
            0,
          ),
          selectedKills: selectedThreatProjectionKillLimit,
          availablePotions: selectedThreatAvailablePotions,
          potionHealAmount: selectedThreatPotionHealAmount,
          potionTriggerPercent: selectedThreatPotionTriggerPercent,
        })
      : null;
  const selectedThreatProjectedSurvivalWithoutPotions =
    selectedThreatSurvivalProjection
      ? estimateAutoCombatPotionUsageForSelection({
          currentHp: currentCharacterHp,
          maxHp: currentCharacterMaxHp,
          expectedDamagePerKill: toSafeNumber(
            selectedThreatSurvivalProjection.expectedDamagePerKill,
            0,
          ),
          selectedKills: selectedThreatProjectionKillLimit,
          availablePotions: 0,
          potionHealAmount: 0,
          potionTriggerPercent: null,
        })
      : null;
  const selectedThreatSafeKillsWithPotions = Math.max(
    0,
    Math.floor(selectedThreatProjectedSurvivalWithPotions?.safeKills ?? 0),
  );
  const selectedThreatSafeKillsWithoutPotions = Math.max(
    0,
    Math.floor(selectedThreatProjectedSurvivalWithoutPotions?.safeKills ?? 0),
  );
  const selectedThreatSelectionPotionUsage = selectedThreatSurvivalProjection
    ? estimateAutoCombatPotionUsageForSelection({
        currentHp: currentCharacterHp,
        maxHp: currentCharacterMaxHp,
        expectedDamagePerKill: toSafeNumber(
          selectedThreatSurvivalProjection.expectedDamagePerKill,
          0,
        ),
        selectedKills: normalizedSelectedBattleQuantity,
        availablePotions: selectedThreatAvailablePotions,
        potionHealAmount: selectedThreatPotionHealAmount,
        potionTriggerPercent: selectedThreatPotionTriggerPercent,
      })
    : null;
  const selectedThreatSelectionPotionsUsed =
    selectedThreatSelectionPotionUsage?.potionsUsed ?? 0;
  const selectedThreatSelectionSafeKills =
    selectedThreatSelectionPotionUsage?.safeKills ?? 0;
  const selectedThreatSurvivesSelection =
    !selectedThreatSurvivalProjection ||
    selectedThreatSelectionSafeKills >= normalizedSelectedBattleQuantity;
  const selectedThreatSurvivalRiskClass = selectedThreatSurvivalProjection
    ? selectedThreatSurvivesSelection
      ? "auto-combat-threat-modal__survival--selection-safe"
      : "auto-combat-threat-modal__survival--selection-danger"
    : "";
  const selectedThreatSurvivalStatusLabel = selectedThreatSurvivesSelection
    ? "Sobrevive"
    : "Não sobrevive";
  const selectedThreatSelectionCountLabel = formatAutoCombatCount(
    normalizedSelectedBattleQuantity,
    "selecionado",
    "selecionados",
  );
  const selectedThreatSafeKillsLabel = formatAutoCombatCount(
    selectedThreatSafeKillsWithPotions,
    "abate",
    "abates",
  );
  const selectedThreatWithoutPotionsCountLabel = formatAutoCombatCount(
    selectedThreatSafeKillsWithoutPotions,
    "abate",
    "abates",
  );
  const selectedThreatPotionStockLabel = formatAutoCombatCount(
    selectedThreatAvailablePotions,
    "poção",
    "poções",
  );
  const selectedThreatSafeKillsDetailLabel =
    selectedThreatAvailablePotions > 0
      ? `Sem poções: ${selectedThreatWithoutPotionsCountLabel}`
      : "Sem poções equipadas";
  const selectedThreatPotionUsageDetailLabel =
    selectedThreatAvailablePotions > 0
      ? `${selectedThreatPotionStockLabel} no inventário`
      : "Nenhuma poção equipada";
  const selectedThreatUnsafeNote =
    selectedThreatSafeKillsWithPotions <= 0
      ? "HP baixo: cure-se antes de lutar."
      : selectedThreatAvailablePotions > 0
        ? `Reduza para ${selectedThreatSafeKillsLabel} ou menos.`
        : `Reduza para ${selectedThreatSafeKillsLabel} ou adicione poções.`;
  const selectedThreatSurvivalNote = selectedThreatSurvivesSelection
    ? "Seleção segura para lutar agora."
    : selectedThreatUnsafeNote;
  const selectedThreatSelectionStatusLabel = selectedThreatSurvivesSelection
    ? "Seguro"
    : "Passe do limite";
  const selectedThreatPotionsUsedDisplay =
    selectedThreatAvailablePotions > 0
      ? `${selectedThreatSelectionPotionsUsed}/${selectedThreatAvailablePotions}`
      : "0";
  const canBattleSelectedThreat =
    isBackendEncounterReadyPhase && selectedThreatRemainingCount > 0;
  const reportedHuntingSecondsPerFind = Math.max(
    1,
    toSafeNumber(
      huntingSnapshot?.secondsPerFind ??
        huntingSnapshot?.secondsPerEnemy ??
        huntingSkill?.secondsPerEnemy,
      12,
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
  const huntingWindowMs = resolveAutoCombatHuntingCycleDurationMs({
    lastFindAtMs: hasAuthoritativeHuntWindow ? huntLastFindAtMs : null,
    nextFindAtMs: hasAuthoritativeHuntWindow ? huntNextFindAtMs : null,
    secondsPerFind: huntingTimeline
      ? huntingTimeline.durationMs / 1_000
      : reportedHuntingSecondsPerFind,
  });
  const huntingWindowSeconds = huntingWindowMs / 1_000;
  const huntCycleEndsAtMs = hasAuthoritativeHuntWindow
    ? huntNextFindAtMs
    : huntLastFindAtMs + huntingWindowMs;
  const huntElapsedSinceLastSeconds = Math.max(
    0,
    (syncedSessionNowMs - huntLastFindAtMs) / 1_000,
  );
  const canonicalHuntTimelineFrame = huntingTimeline
    ? getActivityTimelineFrame(huntingTimeline)
    : null;
  const huntTimelineProgress =
    !huntingTimeline && !showInlineHuntBattle && !isBackendEncounterReadyPhase
      ? getRepeatingCycleProgress({
          nowMs: syncedSessionNowMs,
          cycleStartedAtMs: huntLastFindAtMs,
          cycleDurationMs: huntingWindowMs,
        })
      : null;
  const huntTimelineElapsedSeconds = canonicalHuntTimelineFrame
    ? Math.max(
        0,
        Math.min(
          canonicalHuntTimelineFrame.elapsedMs / 1_000,
          huntingWindowSeconds,
        ),
      )
    : huntTimelineProgress
      ? Math.max(
          0,
          Math.min(
            huntTimelineProgress.cycleElapsedMs / 1_000,
            huntingWindowSeconds,
          ),
        )
      : null;
  const huntTimelineProgressPercent = canonicalHuntTimelineFrame
    ? canonicalHuntTimelineFrame.fillPercent
    : huntTimelineProgress
      ? huntTimelineProgress.progressPercent
      : null;
  const projectedHuntCounts = getHuntDisplayCounts({
    found: availableEnemiesCount,
    maxTrackedEnemies,
    remainingCapacity: effectiveRemainingHuntCapacity,
    completedCycles:
      isBackendHuntingPhase &&
      !huntingTimeline &&
      !showInlineHuntBattle &&
      !isBackendEncounterReadyPhase
        ? huntTimelineProgress?.completedCycles
        : 0,
    isLimitReached: effectiveIsHuntLimitReached,
  });
  const displayedFoundEnemiesCount = projectedHuntCounts.found;
  const displayedRemainingHuntCapacity = projectedHuntCounts.remainingCapacity;
  const displayedIsHuntLimitReached = projectedHuntCounts.isLimitReached;
  const huntingCapacityLabel =
    maxTrackedEnemies > 0
      ? `${displayedFoundEnemiesCount} / ${maxTrackedEnemies}`
      : `${displayedFoundEnemiesCount}`;
  const hasPendingHuntProcessing =
    !isBackendEncounterReadyPhase &&
    (canonicalHuntTimelineFrame?.isComplete === true ||
      (!huntingTimeline &&
        !huntTimelineProgress &&
        huntElapsedSinceLastSeconds >= huntingWindowSeconds));
  const huntCycleElapsedSeconds = hasPendingHuntProcessing
    ? huntingWindowSeconds
    : huntTimelineElapsedSeconds !== null
      ? huntTimelineElapsedSeconds
      : huntElapsedSinceLastSeconds;
  const huntProgressPercent = showInlineHuntBattle
    ? displayedBattleTargetTotal > 0
      ? clampNumber(
          (displayedBattleTargetDefeated / displayedBattleTargetTotal) * 100,
          0,
          100,
        )
      : 0
    : isBackendEncounterReadyPhase
      ? 100
      : huntTimelineProgressPercent !== null
        ? huntTimelineProgressPercent
        : clampNumber(
            (huntCycleElapsedSeconds / huntingWindowSeconds) * 100,
            0,
            100,
          );
  const huntTotalElapsedSeconds = Math.max(
    0,
    Math.floor((syncedSessionNowMs - huntStartedAtMs) / 1000),
  );
  const huntSessionRemainingSeconds =
    hasActiveSession && activeTimerStatus
      ? getRemainingSeconds(activeTimerStatus, syncedSessionNowMs)
      : hasActiveSession
        ? Math.max(
            0,
            Math.floor(
              toSafeNumber(
                effectiveSession?.remainingSeconds ??
                  effectiveStatus?.sessionSummary?.duration?.remainingSeconds,
                0,
              ),
            ),
          )
        : 0;
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
    huntTotalElapsedSeconds > 0 ? huntingXpGained / huntTotalElapsedSeconds : 0;
  const huntingXpPerSecondLabel =
    huntingXpPerSecond >= 10
      ? huntingXpPerSecond.toFixed(1)
      : huntingXpPerSecond.toFixed(2);
  const huntingFoundLabel = displayedFoundEnemiesCount.toLocaleString("pt-BR");
  const huntingRemainingLabel =
    displayedRemainingHuntCapacity.toLocaleString("pt-BR");
  const huntProgressStatusContent = showInlineHuntBattle ? (
    displayedBattleTargetTotal > 0 ? (
      `${displayedBattleTargetDefeated}/${displayedBattleTargetTotal} abatidos`
    ) : (
      "Batalha em andamento"
    )
  ) : displayedIsHuntLimitReached ? (
    "Limite do mapa atingido"
  ) : isBackendEncounterReadyPhase ? (
    "Ameaça pronta para combate"
  ) : (
    <AutoCombatHuntingCountdown
      cycleEndsAtMs={huntCycleEndsAtMs}
      forceComplete={hasPendingHuntProcessing}
      serverClockOffsetMs={serverClockOffsetMs}
      timeline={huntingTimeline}
      variant="status"
    />
  );
  const huntingActivityNextContent = displayedIsHuntLimitReached ? (
    "Limite atingido"
  ) : isBackendEncounterReadyPhase ? (
    "Ameaça pronta"
  ) : (
    <AutoCombatHuntingCountdown
      cycleEndsAtMs={huntCycleEndsAtMs}
      forceComplete={hasPendingHuntProcessing}
      serverClockOffsetMs={serverClockOffsetMs}
      timeline={huntingTimeline}
      variant="clock"
    />
  );
  const huntProgressStyle: AutoCombatHuntProgressStyle = {
    "--hunt-progress": `${huntProgressPercent}%`,
  };
  const huntScanClassName = [
    "auto-combat-hunt-scan",
    huntingTimeline ? "auto-combat-hunt-scan--timeline" : "",
    !huntingTimeline && !showInlineHuntBattle && huntProgressPercent <= 0.05
      ? "auto-combat-hunt-scan--snap"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const shouldShowHuntSkillControls = hasActiveSession && isBackendHuntingPhase;
  const isHuntSkillTracking =
    hasActiveSession && isBackendHuntingPhase && !showInlineHuntBattle;
  const isHuntSkillReady =
    hasActiveSession && isBackendEncounterReadyPhase && !isHuntSkillTracking;
  const huntingSkillCardClassName = [
    isHuntSkillTracking ? "auto-combat-hunt-skill-card--tracking" : "",
    isHuntSkillReady ? "auto-combat-hunt-skill-card--ready" : "",
    !isHuntSkillTracking && !isHuntSkillReady
      ? "auto-combat-hunt-skill-card--idle"
      : "",
    shouldShowHuntSkillControls
      ? "auto-combat-hunt-skill-card--with-controls"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
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
      ? `${huntingSpeedPercent}% mais rápida · ${formatAutoCombatHuntingCountdown(huntingWindowMs)} por rastreio`
      : `${formatAutoCombatHuntingCountdown(huntingWindowMs)} por rastreio`;
  const shouldShowHuntTopBarActivity = isBackendHuntingPhase;
  const topBarHuntingQueue = buildHuntingActivityQueue([
    trackedMonsterSnapshots as HuntingActivityTrackedSource[],
  ]);
  const topBarHuntFoundCount = topBarHuntingQueue.length
    ? countHuntingActivityQueue(topBarHuntingQueue)
    : displayedFoundEnemiesCount;
  const topBarHuntFoundLabel = `${topBarHuntFoundCount.toLocaleString("pt-BR")} rastreado${topBarHuntFoundCount === 1 ? "" : "s"}`;
  const topBarHuntingQueueKey =
    effectiveStatus?.huntBatch?.id ?? effectiveSession?.id ?? "active-hunt";

  const autoCombatTopBarActivityOverride: DashboardTopBarActivityOverride | null =
    showInlineHuntBattle
      ? {
          kind: "auto-combat",
          title: "Em combate",
          subtitle:
            displayedBattleTargetTotal > 0
              ? `${activeMobName} - ${displayedBattleTargetDefeated}/${displayedBattleTargetTotal} abatidos`
              : sessionStatusText,
          imageUrl: getMobPortraitImage(activeMobName),
          icon: "AC",
          progressPercent: activeTopBarBattleProgressPercent,
          progressTimeline: activeBattleProgressTimeline,
          badge:
            displayedBattleTargetTotal > 0
              ? `${displayedBattleTargetDefeated}`
              : null,
          titleText:
            displayedBattleTargetTotal > 0
              ? `Combatendo ${activeMobName} - ${displayedBattleTargetDefeated}/${displayedBattleTargetTotal} abatidos. ${displayedBattleTargetRemaining} restantes.`
              : "Combate automatico em andamento.",
          isBattle: true,
        }
      : shouldShowHuntTopBarActivity
        ? {
            kind: "auto-combat",
            title: trackedThreatMob?.name ?? "Rastreando",
            subtitle:
              topBarHuntFoundCount > 0
                ? `Rastreando · ${topBarHuntFoundLabel}`
                : "Buscando a primeira ameaça",
            icon: "AC",
            imageUrl:
              getMobPortraitImage(trackedThreatMob?.name) ??
              trackedThreatImage ??
              null,
            progressPercent: huntProgressPercent,
            progressTimeline: null,
            timeline: huntingTimeline,
            badge: topBarHuntFoundCount > 0 ? `${topBarHuntFoundCount}` : null,
            titleText:
              topBarHuntFoundCount > 0
                ? `AutoCombat em caca - ${topBarHuntFoundLabel}.`
                : "AutoCombat em caca - rastreando rota.",
            isHunting: isBackendHuntingPhase,
            huntingQueue: topBarHuntingQueue,
            huntingQueueKey: topBarHuntingQueueKey,
          }
        : null;

  const canResumeHunt =
    isBackendEncounterReadyPhase &&
    !effectiveIsHuntLimitReached &&
    !showActiveSession &&
    characterHasHp;

  const canStartHunt =
    !overview?.activity?.hasActiveWorldBoss &&
    Boolean(selectedMap) &&
    selectedMapCombatIsUnlocked &&
    characterHasHp &&
    (!hasActiveSession || canResumeHunt);

  const canTravelToSelectedMap =
    !overview?.activity?.hasActiveWorldBoss &&
    Boolean(selectedMap) &&
    !hasActiveSession;

  const canStartCombat =
    !isBackendEncounterReadyPhase &&
    selectedMapHasActiveEncounters &&
    selectedMapCombatIsUnlocked &&
    !showActiveSession &&
    !isActionLoading &&
    characterHasHp;
  const activeVisualEventType = normalizeRealtimeEventType(
    providerPublicActiveEvent?.type ?? visualRealtimeCombat?.lastEventType,
  );
  const activeVisualEventScope = getMobFeedbackScopeFromEvent(
    providerPublicActiveEvent,
  );
  const activeVisualEventMatchesVisibleMob =
    hasUsefulMobFeedbackScope(activeVisualEventScope) &&
    hasUsefulMobFeedbackScope(visibleMobFeedbackScope) &&
    !hasMobFeedbackScopeMismatch(
      activeVisualEventScope,
      visibleMobFeedbackScope,
    );
  const isMobDefeatedVisual =
    showActiveSession &&
    ((activeVisualEventType === "MOB_DEFEATED" &&
      activeVisualEventMatchesVisibleMob) ||
      hasDefeatedMobSnapshot);

  const isPlayerDefeatedVisual =
    showActiveSession &&
    (activeVisualEventType === "PLAYER_DEFEATED" ||
      (currentCharacterMaxHp > 0 && currentCharacterHp <= 0));

  const realtimeFeedbackEvent = showActiveSession ? activeBattleLogEvent : null;
  const realtimeFeedbackScope = getMobFeedbackScopeFromEvent(
    realtimeFeedbackEvent,
  );
  const realtimeFeedbackMatchesVisibleMob =
    !hasUsefulMobFeedbackScope(visibleMobFeedbackScope) ||
    (hasUsefulMobFeedbackScope(realtimeFeedbackScope) &&
      !hasMobFeedbackScopeMismatch(
        realtimeFeedbackScope,
        visibleMobFeedbackScope,
      ));
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
    realtimeFeedbackMatchesVisibleMob &&
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
  const shouldShowLethalMobImpact = Boolean(
    hasDefeatedMobSnapshot &&
    (providerActiveEventType === "PLAYER_HIT" ||
      providerActiveEventType === "MOB_DEFEATED"),
  );
  const lethalMobImpactKey =
    shouldShowLethalMobImpact && providerActiveEvent
      ? `mob-lethal-${getRealtimeEventKey(providerActiveEvent)}`
      : "";
  const shouldShowMobBodyImpact = Boolean(
    activeMobFullBodyImage &&
    !isCombatViewSynchronizing &&
    (shouldShowMobDamage || shouldShowLethalMobImpact),
  );
  const mobBodyImpactKey = shouldShowMobBodyImpact
    ? [
        "mob-body-impact",
        activeBattleImpactTargetKey,
        mobDamageKey || lethalMobImpactKey,
      ].join(":")
    : `mob-body-${activeBattleImpactTargetKey}`;
  const mobBodyImpactClassName = [
    "auto-combat-mob-damage-shake",
    shouldShowMobBodyImpact ? "is-impacting" : "",
    shouldShowMobDamage && isRealtimeFeedbackCritical
      ? "is-critical-impact"
      : "",
    isMobDefeatedVisual ? "is-defeated" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const playerFighterClassName = [
    "auto-combat-fighter-card",
    "auto-combat-fighter-card--player",
    shouldShowPlayerDamage ? "is-hit" : "",
    shouldShowPlayerDamage && isRealtimeFeedbackCritical
      ? "is-critical-hit"
      : "",
    shouldShowPlayerDodge ? "is-dodging" : "",
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
    isCombatViewSynchronizing ? "is-syncing" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
        "Você está em uma batalha de Ameaça Global. Encerre a participação antes de viajar para outra rota de caça.",
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
        "Você está em uma batalha de Ameaça Global. Encerre a participação antes de iniciar auto-combate.",
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

    if (!selectedMapCombatIsUnlocked) {
      setErrorMessage(
        `O combate neste mapa libera no nível ${getGameMapMinLevel(selectedMap)}. A viagem e a coleta continuam disponíveis.`,
      );
      return;
    }

    if (!canStartHunt) {
      setErrorMessage(
        effectiveIsHuntLimitReached
          ? "Limite de rastreio atingido neste mapa. Inicie o combate para liberar a caça."
          : "Não foi possível iniciar a caça com a seleção atual.",
      );
      return;
    }

    try {
      setIsStartingHunt(true);
      setIsActionLoading(true);
      setErrorMessage("");

      setLocalRealtimeCombat(null);
      setLocalCharacterProgress(null);
      setLocalSessionTotals(null);
      setLocalBattleLogEvents([]);
      setLocalActiveEvent(null);

      // O provider limpa a apresentacao de combate. Preservar este snapshot
      // evita trocar ENCOUNTER_READY pelo estado vazio enquanto a caca retoma.

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
      setIsStopHuntConfirmOpen(false);
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
      setIsStartingHunt(false);
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
      setIsStopHuntConfirmOpen(false);
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

  async function handleRefreshHuntActivityPanel() {
    if (isActionLoading) return;

    await loadAutoCombatData();
  }

  function handleStopHuntActivityPanel() {
    if (isActionLoading || !hasActiveSession) return;

    if (isBackendHuntingPhase && !showInlineHuntBattle) {
      setIsStopHuntConfirmOpen(true);
      return;
    }

    void handleStopAutoCombat();
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

    if (slotIndex > 0) {
      setPotionConfigMessage(
        "No backend atual existe 1 configuração de poção automática por personagem. Este slot reserva já abre a mesma configuração principal.",
      );
    }

    setSelectedPotionItemId(currentPotionConfig?.potionItemId ?? "");
    setIsPotionConfigPanelOpen(true);
  }

  async function handleSavePotionConfig() {
    if (!characterId || isPotionConfigLoading) return;

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
        useInManualCombat: false,
        useInAutoCombat: true,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setSelectedPotionItemId(normalized?.potionItemId ?? selectedPotionItemId);
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

  async function handleSelectThreatPotion(potionItemId: string) {
    if (!characterId || isPotionConfigLoading) return;

    const selectedPotion = potionOptions.find(
      (potion) => potion.itemId === potionItemId || potion.id === potionItemId,
    );

    if (!selectedPotion || selectedPotion.quantity <= 0) {
      setErrorMessage("Esta poção não está disponível no inventário.");
      return;
    }

    try {
      setIsPotionConfigLoading(true);
      setErrorMessage("");
      setPotionConfigMessage("");

      const response = await updateCharacterPotionConfigRaw(characterId, {
        enabled: true,
        potionItemId,
        useInManualCombat: false,
        useInAutoCombat: true,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setSelectedPotionItemId(normalized?.potionItemId ?? potionItemId);
      setIsThreatPotionPickerOpen(false);

      await loadAutoCombatData();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          "Não foi possível adicionar esta poção ao combate.",
        ),
      );
    } finally {
      setIsPotionConfigLoading(false);
    }
  }

  async function handleStartAutoCombat(
    battleSelection?: StartAutoCombatBattlePayload,
  ) {
    if (!characterId || isActionLoading) return;

    if (overview?.activity?.hasActiveWorldBoss) {
      setErrorMessage(
        "Você está em uma batalha de Ameaça Global. Encerre a participação antes de iniciar auto-combate.",
      );
      return;
    }

    if (!characterHasHp) {
      setErrorMessage(
        "Este personagem está sem HP. Use a enfermaria ou uma cura antes de iniciar o combate.",
      );
      return;
    }

    if (!selectedMapCombatIsUnlocked) {
      setErrorMessage(
        `O combate neste mapa libera no nível ${getGameMapMinLevel(selectedMap)}. A viagem e a coleta continuam disponíveis.`,
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
      if (presentationTimelineEnabled) {
        setAutoCombatStatus(null);
      }

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
      setIsThreatPotionPickerOpen(false);
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

  function renderHuntSkillActivityCard(extraClassName = "") {
    const cardClassName = [huntingSkillCardClassName, extraClassName]
      .filter(Boolean)
      .join(" ");

    return (
      <ActivityProgressCard
        className={cardClassName}
        iconAriaLabel={"Ca\u00e7a"}
        icon={<img src={huntingActivityIcon} alt="" />}
        label={"Ca\u00e7a"}
        badge={`Nv. ${huntingLevel}`}
        progressPercent={huntingXpProgressPercent}
        progressLabel={`Progresso de ca\u00e7a: ${huntingSkillXpLabel}, ${huntingXpProgressPercent}%`}
        progressTitle={`${huntingSkillXpLabel} (${huntingXpProgressPercent}%)`}
        pills={[
          {
            content: `+${huntingFoundLabel}`,
            key: "capacity",
            title: `${huntingCapacityLabel} rastreados`,
          },
          ...(!showInlineHuntBattle
            ? [
                {
                  content: huntingActivityNextContent,
                  key: "next",
                  title: huntingSpeedLabel,
                },
              ]
            : []),
          {
            content: `${huntingXpPerSecondLabel} EXP/s`,
            key: "xp",
          },
        ]}
        controls={
          shouldShowHuntSkillControls ? (
            <div
              className="auto-combat-hunt-skill-card__controls"
              aria-label="Controles da caça"
            >
              <strong>{formatClockSeconds(huntSessionRemainingSeconds)}</strong>

              <button
                type="button"
                className="auto-combat-hunt-skill-card__control-button"
                disabled={isActionLoading}
                aria-label="Atualizar caçada"
                title="Atualizar caçada"
                onClick={() => void handleRefreshHuntActivityPanel()}
              >
                <RefreshCw size={15} strokeWidth={2.6} />
              </button>

              <button
                type="button"
                className="auto-combat-hunt-skill-card__control-button auto-combat-hunt-skill-card__control-button--danger"
                disabled={isActionLoading || !shouldShowHuntSkillControls}
                aria-label="Parar caçada"
                title="Parar caçada"
                onClick={handleStopHuntActivityPanel}
              >
                <X size={16} strokeWidth={2.8} />
              </button>
            </div>
          ) : null
        }
      />
    );
  }

  return (
    <DashboardLayout
      character={layoutCharacter}
      topBarActivityOverride={autoCombatTopBarActivityOverride}
      suppressAutoCombatTopBarFallback={
        autoCombatTopBarActivityOverride === null
      }
    >
      <AutoCombatVisualTelemetryReporter
        enemyInstanceId={activeMobEnemyInstanceId}
        visualCycleStartedAtMs={
          activePresentationTimelineProgress?.startedAtMs ??
          localVisualCycleStartedAtMs
        }
        expectedDurationMs={
          activeDisplayBattleTimelineProgress?.cycleDurationMs
        }
        remainingPercent={activeTopBarBattleProgressPercent}
        isAwaitingImpact={shouldHoldBattleAtFullProgress}
        usesPresentationClock={Boolean(activePresentationTimelineProgress)}
        reportTelemetry={reportAutoCombatTelemetry}
      />
      <div
        className={[
          "auto-combat-page",
          suppressProgressTransition ? "auto-combat-page--snap-progress" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {errorMessage ? (
          <div className="auto-combat-alert" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <section className="auto-combat-app-shell">
          <div className="auto-combat-section-title">
            <img
              className="auto-combat-section-title__icon"
              src={autoCombatActivityIcon}
              alt=""
              aria-hidden="true"
            />
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
                      <span>Zona selecionada</span>

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
                        {!selectedMapCombatIsUnlocked && selectedMap
                          ? `Viagem liberada. Combate disponível no nível ${getGameMapMinLevel(selectedMap)}; a coleta depende apenas da profissão.`
                          : (selectedMap?.description ??
                            "Escolha um mapa e inicie a caça para revelar os infectados próximos.")}
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
                                {gameMap.name} · combate Nv.{" "}
                                {getGameMapMinLevel(gameMap)}
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
                    {huntEmptyStageCopy.eyebrow}
                  </span>

                  <strong>{huntEmptyStageCopy.title}</strong>

                  <p>{huntEmptyStageCopy.description}</p>

                  <button
                    type="button"
                    className="auto-combat-primary-button"
                    disabled={!canStartHunt || isActionLoading}
                    onClick={handleStartHunt}
                  >
                    {huntEmptyStageCopy.actionLabel}
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
                            <strong>
                              {formatClockSeconds(huntSessionRemainingSeconds)}
                            </strong>
                          </div>

                          <div>
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
                          className={huntScanClassName}
                          style={
                            huntingTimeline ? undefined : huntProgressStyle
                          }
                        >
                          <div className="auto-combat-hunt-scan__track">
                            {huntingTimeline ? (
                              <ActivityTimelineFill
                                as="i"
                                timeline={huntingTimeline}
                              />
                            ) : (
                              <i />
                            )}
                          </div>

                          <div className="auto-combat-hunt-scan__footer">
                            <span>{huntProgressStatusContent}</span>
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
                    <section className="auto-combat-hunt-side-section auto-combat-hunt-side-section--progress auto-combat-hunt-side-section--desktop-status-card">
                      <div className="auto-combat-hunt-side__section-title">
                        <span>Sua proficiência</span>
                      </div>

                      {renderHuntSkillActivityCard(
                        "auto-combat-hunt-skill-card--side-panel",
                      )}
                    </section>

                    <section className="auto-combat-hunt-side-section auto-combat-hunt-side-section--potion">
                      <div className="auto-combat-hunt-side__section-title">
                        <span>Poção automática</span>
                      </div>

                      <AutoCombatPotionStockCard
                        disabled={isPotionConfigLoading}
                        enabled={isConfiguredPotionAutoUseEnabled}
                        healLabel={formatPotionHeal(configuredPotionItem)}
                        imageUrl={configuredPotionImage}
                        isBeingUsed={isPotionUseFeedbackActive}
                        onConfigure={() => handleOpenPotionConfig(0)}
                        potionName={
                          configuredPotionItem
                            ? getPotionName(currentPotionConfig)
                            : null
                        }
                        remainingQuantity={configuredPotionQuantity}
                        triggerPercent={configuredPotionTriggerPercent}
                        usedInSession={potionsUsed}
                      />
                    </section>

                    <section className="auto-combat-hunt-side-section auto-combat-hunt-side-section--premium">
                      <div className="auto-combat-hunt-side__section-title">
                        <span>Premium</span>
                      </div>

                      <AutoCombatPremiumBenefitsCard
                        isPremiumActive={normalizedSessionXp.isPremiumActive}
                        membershipHref={membershipHref}
                        premiumBonusXp={normalizedSessionXp.premiumBonusXp}
                        premiumPotentialBonusXp={
                          normalizedSessionXp.premiumPotentialBonusXp
                        }
                        totalXpGained={normalizedSessionXp.totalXpGained}
                      />
                    </section>
                  </aside>

                  {showInlineHuntBattle ? (
                    <section
                      className="auto-combat-inline-battle"
                      aria-label="Batalha da caça em andamento"
                    >
                      <div className="auto-combat-inline-battle__header">
                        <span>Alvo atual</span>

                        <div className="auto-combat-inline-battle__metrics">
                          {displayedBattleTargetTotal > 0 ? (
                            <>
                              <em data-testid="auto-combat-battle-defeated-count">
                                {displayedBattleTargetDefeated}/
                                {displayedBattleTargetTotal} abatidos
                              </em>
                              <em>
                                {displayedBattleTargetRemaining} restantes
                              </em>
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
                          isCombatViewSynchronizing ? "is-syncing" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
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

                        {hasConfirmedActiveMob ? (
                          <span className="auto-combat-fighter-card__level-badge auto-combat-fighter-card__level-badge--mob">
                            Nv. {activeMobLevel}
                          </span>
                        ) : null}

                        <div className="auto-combat-inline-battle__mob-visual">
                          {activeMobFullBodyImage ? (
                            <AutoCombatMobTransition
                              imageUrl={activeMobFullBodyImage}
                              alt={activeMobName}
                              instanceKey={activeBattleImpactTargetKey}
                              impactKey={mobBodyImpactKey}
                              bodyClassName={mobBodyImpactClassName}
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

                        <div className="auto-combat-inline-battle__mob-heading">
                          <span>Ameaça atual</span>
                          <strong>{activeMobName}</strong>
                        </div>

                        {hasTtkBattleProgress ? (
                          <div
                            className="auto-combat-inline-battle__ttk-strip"
                            aria-label={`Progresso do abate: ${activeKillProgressLabel}. Vida do alvo: ${activeMobHpDisplayLabel}`}
                          >
                            <i>
                              <AutoCombatBattleProgressFill
                                key={activeBattleProgressElementKey}
                                timeline={activeBattleProgressTimeline}
                                progressPercent={
                                  activeTopBarBattleProgressPercent
                                }
                              />
                            </i>
                            <span>
                              {activeMobHpDisplayLabel} ·{" "}
                              {activeKillProgressLabel}
                            </span>
                          </div>
                        ) : null}

                        <div className="auto-combat-resource">
                          <div>
                            <span>HP</span>
                            <strong>{activeMobHpDisplayLabel}</strong>
                          </div>

                          <i>
                            <b
                              key={activeBattleImpactTargetKey}
                              style={activeMobHpStyle}
                            />
                          </i>

                          {hasTtkBattleProgress ? (
                            <small className="auto-combat-resource__hint">
                              {activeKillProgressLabel}
                              {activeKillsPerMinute > 0 ? " · " : ""}
                              {activeKillsPerMinute > 0
                                ? `${activeKillsPerMinute.toFixed(1)} abates/min`
                                : ""}
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
                          {isActionLoading ? "Processando..." : "Parar sessão"}
                        </button>
                      </div>
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
                          isBackendHuntFlow || showInlineHuntBattle
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
                                isBackendHuntFlow || showInlineHuntBattle
                                  ? "auto-combat-enemy-card--compact"
                                  : "",
                                shouldShowCardFoundCount
                                  ? "auto-combat-enemy-card--found"
                                  : "",
                                shouldShowCardFoundCount
                                  ? "auto-combat-enemy-card--with-found-count"
                                  : "auto-combat-enemy-card--without-found-count",
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
                                setIsThreatPotionPickerOpen(false);
                                setSelectedThreat(encounter);
                              }}
                              onKeyDown={(event) => {
                                if (
                                  event.key !== "Enter" &&
                                  event.key !== " "
                                ) {
                                  return;
                                }

                                event.preventDefault();
                                setSelectedBattleQuantity(1);
                                setIsThreatPotionPickerOpen(false);
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

                        <strong>
                          {showInlineHuntBattle
                            ? "Nenhuma outra ameaça rastreada"
                            : "Nenhum inimigo encontrado"}
                        </strong>

                        <p>
                          {showInlineHuntBattle
                            ? "O alvo selecionado continua em batalha. Outras ameaças aparecerão aqui quando houver rastreios pendentes."
                            : "Este mapa está cadastrado, mas ainda não possui encontros ativos. Quando os mobs forem vinculados ao seed/backend, ele ficará disponível para combate."}
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
                                  : effectiveIsHuntLimitReached
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

                        <div className="auto-combat-resource">
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
                              <AutoCombatMobTransition
                                imageUrl={activeMobFullBodyImage}
                                alt={activeMobName}
                                instanceKey={activeBattleImpactTargetKey}
                                impactKey={mobBodyImpactKey}
                                bodyClassName={mobBodyImpactClassName}
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

                        <div className="auto-combat-resource">
                          <div>
                            <span>HP</span>
                            <strong>{activeMobHpDisplayLabel}</strong>
                          </div>

                          <i>
                            <b
                              key={activeBattleProgressElementKey}
                              style={activeMobHpStyle}
                            />
                          </i>

                          {hasTtkBattleProgress ? (
                            <small className="auto-combat-resource__hint">
                              {activeKillProgressLabel}
                              {activeKillsPerMinute > 0 ? " · " : ""}
                              {activeKillsPerMinute > 0
                                ? `${activeKillsPerMinute.toFixed(1)} abates/min`
                                : ""}
                              {activeDifficultyLabel
                                ? ` · ${activeDifficultyLabel}`
                                : ""}
                            </small>
                          ) : null}
                        </div>
                      </div>
                    </div>

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
                        <strong>Cura por poções</strong>
                      </div>

                      <small>
                        Escolha a poção que poderá ser usada durante as
                        batalhas.
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
                                    : "Clique para escolher a poção da batalha."}
                                </span>

                                <small className="auto-combat-consumable-slot__meta">
                                  {potionItem
                                    ? `Selecionada · x${potionQuantity}`
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
                    </div>
                  </div>

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
                    membershipHref={membershipHref}
                    totalLoot={totalLoot}
                    potionsUsed={potionsUsed}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="auto-combat-status-tab-stack">
              <section className="auto-combat-mobile-status-hunt-card auto-combat-hunt-side-section auto-combat-hunt-side-section--progress">
                <div className="auto-combat-hunt-side__section-title">
                  <span>Sua proficiência</span>
                </div>

                {renderHuntSkillActivityCard(
                  "auto-combat-hunt-skill-card--mobile-status",
                )}
              </section>

              <section className="auto-combat-mobile-status-hunt-card auto-combat-hunt-side-section auto-combat-hunt-side-section--potion">
                <div className="auto-combat-hunt-side__section-title">
                  <span>Poção automática</span>
                </div>

                <AutoCombatPotionStockCard
                  disabled={isPotionConfigLoading}
                  enabled={isConfiguredPotionAutoUseEnabled}
                  healLabel={formatPotionHeal(configuredPotionItem)}
                  imageUrl={configuredPotionImage}
                  isBeingUsed={isPotionUseFeedbackActive}
                  onConfigure={() => handleOpenPotionConfig(0)}
                  potionName={
                    configuredPotionItem
                      ? getPotionName(currentPotionConfig)
                      : null
                  }
                  remainingQuantity={configuredPotionQuantity}
                  triggerPercent={configuredPotionTriggerPercent}
                  usedInSession={potionsUsed}
                />
              </section>

              <section className="auto-combat-mobile-status-hunt-card auto-combat-hunt-side-section auto-combat-hunt-side-section--premium">
                <div className="auto-combat-hunt-side__section-title">
                  <span>Premium</span>
                </div>

                <AutoCombatPremiumBenefitsCard
                  isPremiumActive={normalizedSessionXp.isPremiumActive}
                  membershipHref={membershipHref}
                  premiumBonusXp={normalizedSessionXp.premiumBonusXp}
                  premiumPotentialBonusXp={
                    normalizedSessionXp.premiumPotentialBonusXp
                  }
                  totalXpGained={normalizedSessionXp.totalXpGained}
                />
              </section>

              <AutoCombatStatsTab totalStats={totalStats} />
            </div>
          )}
        </section>
      </div>

      <AutoCombatPotionConfigModal
        getHealLabel={getPotionHealLabel}
        isLoading={isPotionConfigLoading}
        isOpen={isPotionConfigPanelOpen}
        message={potionConfigMessage}
        onClear={handleClearPotionConfig}
        onClose={() => setIsPotionConfigPanelOpen(false)}
        onSave={handleSavePotionConfig}
        onSelect={(potionItemId) => {
          setSelectedPotionItemId(potionItemId);
          setPotionConfigMessage("");
        }}
        options={potionOptions}
        optionsCountLabel={potionOptionsCountLabel}
        selectedPotionItemId={selectedPotionItemId}
      />

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
                  Os inimigos que você já rastreou ficarão prontos para batalha
                  imediatamente.
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
          onClick={() => {
            setIsThreatPotionPickerOpen(false);
            setSelectedThreat(null);
          }}
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
              onClick={() => {
                setIsThreatPotionPickerOpen(false);
                setSelectedThreat(null);
              }}
            >
              <X size={17} strokeWidth={2.4} aria-hidden="true" />
            </button>

            <div className="auto-combat-threat-modal__overview">
              <div className="auto-combat-threat-modal__visual">
                {selectedThreatImage ? (
                  <img
                    src={selectedThreatImage}
                    alt={selectedThreatMob.name}
                    decoding="async"
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
            </div>

            <div className="auto-combat-threat-modal__core">
              <div className="auto-combat-threat-modal__divider auto-combat-threat-modal__divider--compact">
                <span>Poções</span>
              </div>

              <div className="auto-combat-threat-modal__potion-loadout">
                <button
                  type="button"
                  className={[
                    "auto-combat-threat-modal__potion-current",
                    configuredPotionItem ? "has-potion" : "is-empty",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={isPotionConfigLoading}
                  onClick={() =>
                    setIsThreatPotionPickerOpen((isOpen) => !isOpen)
                  }
                >
                  <span
                    className="auto-combat-threat-modal__potion-icon"
                    aria-hidden="true"
                  >
                    {configuredPotionImage ? (
                      <img src={configuredPotionImage} alt="" />
                    ) : (
                      <span>
                        {configuredPotionItem
                          ? getLootInitials(configuredPotionItem.name)
                          : "+"}
                      </span>
                    )}
                  </span>

                  <span className="auto-combat-threat-modal__potion-body">
                    <strong>
                      {configuredPotionItem
                        ? getPotionName(currentPotionConfig)
                        : "Adicionar poção"}
                    </strong>
                    <small>
                      {configuredPotionItem
                        ? getPotionHealLabel(configuredPotionItem)
                        : potionOptions.length > 0
                          ? "Escolher do inventário"
                          : "Sem poções no inventário"}
                    </small>
                  </span>

                  <em>
                    {configuredPotionItem
                      ? `${configuredPotionQuantity}x`
                      : "Adicionar"}
                  </em>
                </button>

                {configuredPotionItem ? (
                  <button
                    type="button"
                    className="auto-combat-threat-modal__potion-remove"
                    disabled={isPotionConfigLoading}
                    onClick={() => {
                      setIsThreatPotionPickerOpen(false);
                      void handleClearPotionConfig();
                    }}
                  >
                    Remover
                  </button>
                ) : null}

                {isThreatPotionPickerOpen ? (
                  <div className="auto-combat-threat-modal__potion-picker">
                    {potionOptions.length > 0 ? (
                      potionOptions.map((potion) => {
                        const quantity = Math.max(
                          0,
                          Math.floor(toSafeNumber(potion.quantity, 0)),
                        );
                        const potionImage = getConsumableItemImageUrl(potion);
                        const isSelected =
                          currentPotionConfig?.potionItemId === potion.itemId ||
                          currentPotionConfig?.potionItemId === potion.id;

                        return (
                          <button
                            key={potion.itemId}
                            type="button"
                            className={[
                              "auto-combat-threat-modal__potion-option",
                              isSelected ? "is-selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            disabled={isPotionConfigLoading || quantity <= 0}
                            aria-pressed={isSelected}
                            onClick={() =>
                              handleSelectThreatPotion(potion.itemId)
                            }
                          >
                            <span
                              className="auto-combat-threat-modal__potion-icon"
                              aria-hidden="true"
                            >
                              {potionImage ? (
                                <img src={potionImage} alt="" />
                              ) : (
                                <span>{getLootInitials(potion.name)}</span>
                              )}
                            </span>

                            <span className="auto-combat-threat-modal__potion-body">
                              <strong>{potion.name}</strong>
                              <small>{getPotionHealLabel(potion)}</small>
                            </span>

                            <em>{quantity}x</em>
                          </button>
                        );
                      })
                    ) : (
                      <p>Nenhuma poção de cura disponível.</p>
                    )}
                  </div>
                ) : null}
              </div>

              {selectedThreatSurvivalProjection ? (
                <div
                  className={[
                    "auto-combat-threat-modal__survival",
                    selectedThreatSurvivalRiskClass,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="auto-combat-threat-modal__survival-header">
                    <span>Sobrevivência da seleção</span>
                    <strong>{selectedThreatSurvivalStatusLabel}</strong>
                  </div>

                  <div className="auto-combat-threat-modal__survival-grid">
                    <div className="auto-combat-threat-modal__survival-metric">
                      <span>Seleção atual</span>
                      <strong>{selectedThreatSelectionCountLabel}</strong>
                      <small>{selectedThreatSelectionStatusLabel}</small>
                    </div>

                    <div className="auto-combat-threat-modal__survival-metric">
                      <span>Limite seguro</span>
                      <strong>{selectedThreatSafeKillsLabel}</strong>
                      <small>{selectedThreatSafeKillsDetailLabel}</small>
                    </div>

                    <div className="auto-combat-threat-modal__survival-metric">
                      <span>Poções na seleção</span>
                      <strong>{selectedThreatPotionsUsedDisplay}</strong>
                      <small>{selectedThreatPotionUsageDetailLabel}</small>
                    </div>

                    <div className="auto-combat-threat-modal__survival-metric">
                      <span>Dano/ciclo</span>
                      <strong>{selectedThreatExpectedDamage} HP</strong>
                      <small>
                        {Math.round(selectedThreatExpectedDodge)}% esquiva ·{" "}
                        {formatSeconds(selectedThreatEstimatedSeconds)}
                      </small>
                    </div>
                  </div>

                  <p className="auto-combat-threat-modal__survival-note">
                    {selectedThreatSurvivalNote}
                  </p>
                </div>
              ) : null}

              {canBattleSelectedThreat ? (
                <div className="auto-combat-threat-modal__battle-select">
                  <div className="auto-combat-threat-modal__battle-copy">
                    <span>Disponíveis</span>
                    <strong>{selectedThreatRemainingCount}</strong>
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
                  </div>

                  <div className="auto-combat-threat-modal__battle-actions">
                    <button
                      type="button"
                      className="auto-combat-threat-modal__max-button"
                      onClick={() =>
                        setSelectedBattleQuantity(selectedThreatRemainingCount)
                      }
                    >
                      Máx.
                    </button>

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
                </div>
              ) : null}
            </div>

            <div className="auto-combat-threat-modal__loot-section">
              <div className="auto-combat-threat-modal__divider">
                <span>Loot possível</span>
              </div>

              {selectedThreatDrops.length > 0 ? (
                <div className="auto-combat-threat-modal__loot-grid">
                  {selectedThreatDrops.map((drop) => {
                    const itemName = drop.item?.name ?? "Item desconhecido";
                    const chanceLabel = formatDropChance(drop.dropChance);
                    const itemImage = getGameItemImageUrl(drop.item);

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
                          {itemImage ? (
                            <img src={itemImage} alt="" />
                          ) : (
                            <span>{getLootInitials(itemName)}</span>
                          )}
                        </span>

                        <strong>{itemName}</strong>

                        <small>
                          {formatDropQuantity(
                            drop.minQuantity,
                            drop.maxQuantity,
                          )}
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
            </div>
          </article>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
