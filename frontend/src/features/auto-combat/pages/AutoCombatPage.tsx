import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { PremiumPlaceholderIcon } from '../../../components/PremiumPlaceholderIcon';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { CharacterOverviewResponse } from '../../dashboard/types/dashboard.types';
import {
  getAutoCombatMaps,
  getAutoCombatStatus,
  previewAutoCombat,
} from '../api/auto-combat.api';
import {
  buildMapVisualStyle,
  getMapImageByName,
} from '../assets/auto-combat-map-assets';
import '../auto-combat-mob-images.css';
import '../auto-combat.css';
import { AutoCombatBattleLog } from '../components/AutoCombatBattleLog';
import { AutoCombatSessionSummary } from '../components/AutoCombatSessionSummary';
import { AutoCombatStatsTab } from '../components/AutoCombatStatsTab';
import { AutoCombatTabs } from '../components/AutoCombatTabs';
import { getRealtimeEventKey } from '../realtime/autoCombatRealtime.utils';
import {
  useAutoCombatRealtime,
  useAutoCombatRealtimeState,
} from '../realtime/useAutoCombatRealtime';
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
} from '../types/auto-combat-page.types';
import type {
  AutoCombatEncounterViewModel,
  AutoCombatMapViewModel,
  AutoCombatProjectionPreview,
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from '../types/auto-combat.types';
import {
  buildCharacterViewModel,
  buildProgressFromSource,
  buildProgressFromStatus,
  buildSessionTotalsFromStatus,
  buildZeroRealtimeSessionTotals,
  clampNumber,
  clampPercent,
  flattenCombatSubMaps,
  formatPotionHeal,
  formatRiskLabel,
  formatSeconds,
  formatSessionStatus,
  getActiveEncounters,
  getApiErrorMessage,
  getCharacterInventoryRaw,
  getCharacterPotionConfigRaw,
  getDefaultSubMapId,
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
  getSubMapLabel,
  getSubMapsForMap,
  getThreatWeightPercent,
  getVisibleCombatMaps,
  isDamageRealtimeEvent,
  isSessionActive,
  isTerminalSessionStatus,
  mergeProgressKeepingHighestXp,
  normalizePotionConfigResponse,
  normalizePotionInventoryResponse,
  normalizeRealtimeEventType,
  pickHighestProgress,
  resolveCharacterStats,
  resolvePotionEventItemId,
  resolvePotionQuantityAfter,
  toSafeNumber,
  updateCharacterPotionConfigRaw,
} from '../utils/auto-combat-page.helpers';
import {
  getMobFullBodyImage,
  getMobPortraitImage,
} from '../utils/mobAssets';
import { selectVisibleCharacterProgress } from '../utils/visible-progress';

const SHOW_AUTO_COMBAT_BATTLE_LOG = false;

function getRealtimeFeedbackTarget(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event?.type);
  const eventTarget = normalizeRealtimeEventType(event?.target);

  if (eventTarget === 'PLAYER' || eventTarget === 'MOB') {
    return eventTarget;
  }

  if (eventType === 'PLAYER_HIT') {
    return 'MOB';
  }

  if (eventType === 'MOB_HIT') {
    return 'PLAYER';
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

function getOptionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Math.floor(Number(value));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function getXpFeedbackBreakdown(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event?.type);

  if (!event || eventType !== 'MOB_DEFEATED') {
    return null;
  }

  const totalXp = getOptionalPositiveInteger(event.xpGained);

  if (!totalXp || totalXp <= 0) {
    return null;
  }

  const baseXp = getOptionalPositiveInteger(event.baseXpGained) ?? totalXp;
  const premiumBonusXp =
    getOptionalPositiveInteger(event.premiumBonusXp) ?? 0;
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

function getMapRarityClassName(tier?: number | string | null) {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) {
    return 'auto-combat-map-rarity-common';
  }

  if (safeTier >= 9) return 'auto-combat-map-rarity-legendary';
  if (safeTier >= 7) return 'auto-combat-map-rarity-epic';
  if (safeTier >= 5) return 'auto-combat-map-rarity-rare';
  if (safeTier >= 3) return 'auto-combat-map-rarity-uncommon';

  return 'auto-combat-map-rarity-common';
}

function getLootInitials(name?: string | null) {
  const cleanName = String(name ?? '').trim();

  if (!cleanName) return '??';

  const words = cleanName
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2);

  return words
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

function getLootRarityClassName(rarity?: string | null) {
  const normalizedRarity = String(rarity ?? 'common').toLowerCase();

  if (normalizedRarity.includes('legendary')) {
    return 'auto-combat-threat-loot-card--legendary';
  }

  if (normalizedRarity.includes('epic')) {
    return 'auto-combat-threat-loot-card--epic';
  }

  if (normalizedRarity.includes('rare')) {
    return 'auto-combat-threat-loot-card--rare';
  }

  if (normalizedRarity.includes('uncommon')) {
    return 'auto-combat-threat-loot-card--uncommon';
  }

  return 'auto-combat-threat-loot-card--common';
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
  const requestedMapId = searchParams.get('mapId') ?? '';
  const requestedSubMapId = searchParams.get('subMapId') ?? '';
  const realtimeContext = useAutoCombatRealtime();
  const realtimeActions = getRealtimeActions(realtimeContext);
  const realtimeState =
    useAutoCombatRealtimeState() as AutoCombatRealtimeStateLoose;

  const [activeTab, setActiveTab] = useState<AutoCombatTab>('battle');
  const [hasStartedHunt, setHasStartedHunt] = useState(false);

  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [maps, setMaps] = useState<AutoCombatMapViewModel[]>([]);
  const [autoCombatStatus, setAutoCombatStatus] =
    useState<AutoCombatStatusResponse | null>(null);
  const [selectedMapId, setSelectedMapId] = useState('');
  const [selectedSubMapId, setSelectedSubMapId] = useState('');
  const [selectedThreat, setSelectedThreat] =
    useState<AutoCombatEncounterViewModel | null>(null);
  const [preparationPreview, setPreparationPreview] =
    useState<AutoCombatProjectionPreview | null>(null);

  const [availablePotions, setAvailablePotions] = useState<
    PotionInventoryOption[]
  >([]);
  const [autoPotionConfig, setAutoPotionConfig] =
    useState<CharacterPotionConfigWithItem | null>(null);
  const [isPotionConfigPanelOpen, setIsPotionConfigPanelOpen] = useState(false);
  const [isRestConfigPanelOpen, setIsRestConfigPanelOpen] = useState(false);
  const [selectedPotionSlotIndex, setSelectedPotionSlotIndex] = useState(0);
  const [selectedPotionItemId, setSelectedPotionItemId] = useState('');
  const [potionThresholdPercent, setPotionThresholdPercent] = useState(35);
  const [autoRestEnabled, setAutoRestEnabled] = useState(true);
  const [autoRestStartHpPercent, setAutoRestStartHpPercent] = useState(35);
  const [autoRestStopHpPercent, setAutoRestStopHpPercent] = useState(70);
  const [isPotionConfigLoading, setIsPotionConfigLoading] = useState(false);
  const [isRestConfigLoading, setIsRestConfigLoading] = useState(false);
  const [potionConfigMessage, setPotionConfigMessage] = useState('');
  const [restConfigMessage, setRestConfigMessage] = useState('');

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

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const autoPotionConfigRef =
    useRef<CharacterPotionConfigWithItem | null>(null);
  const selectedPotionItemIdRef = useRef('');
  const hasPendingRealtimeVisualRef = useRef(false);
  const processedPotionEventKeysRef = useRef<Set<string>>(new Set());
  const xpFeedbackShowTimeoutRef = useRef<number | null>(null);
  const xpFeedbackTimeoutRef = useRef<number | null>(null);
  const xpFeedbackEventKeyRef = useRef('');
  const stableActiveMobRef = useRef<{
    sessionId: string | null;
    name: string;
    normalizedName: string;
    level: number;
  } | null>(null);

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
    setXpFeedbackEvent(null);
    setIsPotionConfigPanelOpen(false);
    setPotionConfigMessage('');
    processedPotionEventKeysRef.current.clear();
    xpFeedbackEventKeyRef.current = '';
    if (xpFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(xpFeedbackTimeoutRef.current);
      xpFeedbackTimeoutRef.current = null;
    }
    if (xpFeedbackShowTimeoutRef.current !== null) {
      window.clearTimeout(xpFeedbackShowTimeoutRef.current);
      xpFeedbackShowTimeoutRef.current = null;
    }
    stableActiveMobRef.current = null;
  }, [characterId]);

  const realtimeStatus = getRealtimeStatus(realtimeState);
  const effectiveStatus = realtimeStatus ?? autoCombatStatus;
  const effectiveSession = getRealtimeSession(realtimeState, effectiveStatus);
  const providerRealtimeCombat = getRealtimeCombat(realtimeState);
  const providerProgress = getRealtimeProgress(realtimeState);
  const providerSessionTotals = getRealtimeTotals(realtimeState);
  const providerBattleLogEvents = getRealtimeBattleLogEvents(realtimeState);
  const providerActiveEvent = getRealtimeActiveEvent(realtimeState);
  const providerQueueLength = getRealtimeQueueLength(realtimeState);

  const visualRealtimeCombat = providerRealtimeCombat ?? localRealtimeCombat;

  const effectiveSessionIsTerminal = isTerminalSessionStatus(
    effectiveSession?.status,
  );

  const hasActiveSession =
    !effectiveSessionIsTerminal &&
    (Boolean(realtimeState.isActive) ||
      Boolean(realtimeState.hasActiveSession) ||
      Boolean(realtimeState.hasActiveAutoCombat) ||
      isSessionActive(effectiveStatus, effectiveSession));

  const hasPendingRealtimeVisual =
    !effectiveSessionIsTerminal &&
    hasActiveSession &&
    (providerQueueLength > 0 || Boolean(providerActiveEvent));

  const showActiveSession = hasActiveSession || hasPendingRealtimeVisual;

  useEffect(() => {
    hasPendingRealtimeVisualRef.current = hasPendingRealtimeVisual;
  }, [hasPendingRealtimeVisual]);

  useEffect(() => {
    if (!showActiveSession) {
      stableActiveMobRef.current = null;
    }
  }, [showActiveSession]);

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
          currentPotion?.id ?? currentConfig.potionItemId ?? '';

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
    const event = providerActiveEvent;

    if (!event || normalizeRealtimeEventType(event.type) !== 'POTION_USED') {
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
  }, [providerActiveEvent, applyPotionRealtimeQuantityUpdate]);

  const loadAutoCombatData = useCallback(async () => {
    if (!characterId) return;

    try {
      setErrorMessage('');

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
      setAutoCombatStatus(statusData);
      setMaps(mapsData);
      setAvailablePotions(normalizedPotions);
      setAutoPotionConfig(normalizedPotionConfig);

      setSelectedPotionItemId(normalizedPotionConfig?.potionItemId ?? '');
      setPotionThresholdPercent(
        clampNumber(normalizedPotionConfig?.hpThresholdPercent ?? 35, 1, 100),
      );
      setAutoRestEnabled(normalizedPotionConfig?.autoRestEnabled ?? true);
      setAutoRestStartHpPercent(
        clampNumber(normalizedPotionConfig?.autoRestStartHpPercent ?? 35, 1, 99),
      );
      setAutoRestStopHpPercent(
        clampNumber(normalizedPotionConfig?.autoRestStopHpPercent ?? 70, 2, 100),
      );

      setLocalCharacterProgress((current) => {
        if (hasPendingRealtimeVisualRef.current && current) {
          return current;
        }

        return pickHighestProgress(current, mergedProgress);
      });

      if (isSessionActive(statusData, statusSession)) {
        setLocalSessionTotals(
          buildSessionTotalsFromStatus(statusData, statusSession),
        );
      } else {
        setLocalSessionTotals(null);
        setLocalRealtimeCombat(null);
        setLocalBattleLogEvents([]);
        setLocalActiveEvent(null);
      }

      const characterLevel =
        mergedProgress?.level ?? overviewData.character.level ?? 1;

      setSelectedSubMapId((currentValue) => {
        const availableSubMaps = flattenCombatSubMaps(mapsData, characterLevel);

        if (
          currentValue &&
          availableSubMaps.some((subMap) => subMap.id === currentValue)
        ) {
          return currentValue;
        }

        return getDefaultSubMapId({
          maps: mapsData,
          characterLevel,
          status: statusData,
        });
      });
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          'Não foi possível carregar os dados do combate automático.',
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
    ? visibleRealtimeSessionTotals ??
      visibleLocalSessionTotals ??
      visibleZeroSessionTotals ??
      statusSessionTotals
    : null;

  const battleLogEvents =
    showActiveSession && providerBattleLogEvents.length > 0
      ? providerBattleLogEvents
      : showActiveSession
        ? localBattleLogEvents
        : [];

  const activeBattleLogEvent = showActiveSession
    ? providerActiveEvent ?? localActiveEvent
    : null;

  useEffect(() => {
    if (!showActiveSession) {
      xpFeedbackEventKeyRef.current = '';

      if (xpFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(xpFeedbackTimeoutRef.current);
        xpFeedbackTimeoutRef.current = null;
      }

      if (xpFeedbackShowTimeoutRef.current !== null) {
        window.clearTimeout(xpFeedbackShowTimeoutRef.current);
      }

      xpFeedbackShowTimeoutRef.current = window.setTimeout(() => {
        setXpFeedbackEvent(null);
        xpFeedbackShowTimeoutRef.current = null;
      }, 0);

      return;
    }

    const xpFeedback = getXpFeedbackBreakdown(activeBattleLogEvent);

    if (!xpFeedback || !activeBattleLogEvent) {
      return;
    }

    const eventKey = getRealtimeEventKey(activeBattleLogEvent);

    if (xpFeedbackEventKeyRef.current === eventKey) {
      return;
    }

    xpFeedbackEventKeyRef.current = eventKey;
    if (xpFeedbackShowTimeoutRef.current !== null) {
      window.clearTimeout(xpFeedbackShowTimeoutRef.current);
    }

    xpFeedbackShowTimeoutRef.current = window.setTimeout(() => {
      setXpFeedbackEvent(activeBattleLogEvent);
      xpFeedbackShowTimeoutRef.current = null;
    }, 0);

    if (xpFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(xpFeedbackTimeoutRef.current);
    }

    xpFeedbackTimeoutRef.current = window.setTimeout(() => {
      setXpFeedbackEvent((currentEvent) => {
        if (!currentEvent || getRealtimeEventKey(currentEvent) === eventKey) {
          return null;
        }

        return currentEvent;
      });

      if (xpFeedbackEventKeyRef.current === eventKey) {
        xpFeedbackEventKeyRef.current = '';
      }

      xpFeedbackTimeoutRef.current = null;
    }, 2800);
  }, [activeBattleLogEvent, showActiveSession]);

  useEffect(() => {
    return () => {
      if (xpFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(xpFeedbackTimeoutRef.current);
      }

      if (xpFeedbackShowTimeoutRef.current !== null) {
        window.clearTimeout(xpFeedbackShowTimeoutRef.current);
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
    if (!hasActiveSession || isSocketConnected) return;

    const intervalId = window.setInterval(() => {
      loadAutoCombatData();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [hasActiveSession, isSocketConnected, loadAutoCombatData]);

  const currentSelectionLevel =
    visibleCharacterProgress?.level ?? character?.level ?? 1;

  const availableMaps = useMemo(() => {
    return getVisibleCombatMaps(maps);
  }, [maps]);

  const selectedMap = useMemo(() => {
    const mapBySelectedId = availableMaps.find((gameMap) => {
      return gameMap.id === selectedMapId;
    });

    if (mapBySelectedId) return mapBySelectedId;

    if (selectedSubMapId) {
      const mapBySubMap = availableMaps.find((gameMap) => {
        return gameMap.subMaps?.some((subMap) => subMap.id === selectedSubMapId);
      });

      if (mapBySubMap) return mapBySubMap;
    }

    return availableMaps[0] ?? null;
  }, [availableMaps, selectedMapId, selectedSubMapId]);

  const availableSubMaps = useMemo(() => {
    if (selectedMap) {
      return getSubMapsForMap(selectedMap, currentSelectionLevel);
    }

    return flattenCombatSubMaps(maps, currentSelectionLevel);
  }, [maps, selectedMap, currentSelectionLevel]);

  const selectedSubMap = useMemo(() => {
    return availableSubMaps.find((subMap) => subMap.id === selectedSubMapId);
  }, [availableSubMaps, selectedSubMapId]);

  const selectedSubMapThreats = useMemo(() => {
    return getActiveEncounters(selectedSubMap).sort((a, b) => {
      return (b.weight ?? 0) - (a.weight ?? 0);
    });
  }, [selectedSubMap]);

  const selectedThreatDetails = useMemo(() => {
    if (!selectedThreat) return null;

    return (
      selectedSubMapThreats.find((encounter) => {
        return encounter.id === selectedThreat.id;
      }) ?? selectedThreat
    );
  }, [selectedSubMapThreats, selectedThreat]);

  const selectedThreatMob = selectedThreatDetails?.mob ?? null;
  const selectedThreatChance = selectedThreatDetails
    ? getThreatWeightPercent(selectedThreatDetails, selectedSubMapThreats)
    : null;
  const selectedThreatImage =
    getMobFullBodyImage(selectedThreatMob?.name) ??
    getMobPortraitImage(selectedThreatMob?.name);
  const selectedThreatDrops = selectedThreatMob?.drops ?? [];

  const selectedMapIsUnlocked = selectedMap
    ? currentSelectionLevel >= getGameMapMinLevel(selectedMap)
    : false;

  const selectedSubMapIsUnlocked = selectedSubMap
    ? currentSelectionLevel >=
      (selectedSubMap.minLevel ?? getGameMapMinLevel(selectedMap))
    : false;

  const selectedSubMapHasActiveEncounters = selectedSubMapThreats.length > 0;

  useEffect(() => {
    if (!selectedThreat) return;

    function handleThreatModalKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedThreat(null);
      }
    }

    window.addEventListener('keydown', handleThreatModalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleThreatModalKeyDown);
    };
  }, [selectedThreat]);

  useEffect(() => {
    if (!isPotionConfigPanelOpen) return;

    function handlePotionConfigModalKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsPotionConfigPanelOpen(false);
      }
    }

    window.addEventListener('keydown', handlePotionConfigModalKeyDown);

    return () => {
      window.removeEventListener('keydown', handlePotionConfigModalKeyDown);
    };
  }, [isPotionConfigPanelOpen]);

  useEffect(() => {
    if (!isRestConfigPanelOpen) return;

    function handleRestConfigModalKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsRestConfigPanelOpen(false);
      }
    }

    window.addEventListener('keydown', handleRestConfigModalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleRestConfigModalKeyDown);
    };
  }, [isRestConfigPanelOpen]);

  useEffect(() => {
    if (maps.length <= 0) return;

    const requestedMap = requestedMapId
      ? maps.find((gameMap) => gameMap.id === requestedMapId) ?? null
      : null;
    const requestedSubMapParent = requestedSubMapId
      ? maps.find((gameMap) => {
          return gameMap.subMaps?.some((subMap) => subMap.id === requestedSubMapId);
        }) ?? null
      : null;
    const nextMap = selectedMap ?? requestedMap ?? requestedSubMapParent ?? availableMaps[0] ?? null;

    if (!nextMap) {
      if (selectedMapId) {
        setSelectedMapId('');
      }

      if (selectedSubMapId) {
        setSelectedSubMapId('');
      }

      return;
    }

    if (selectedMapId !== nextMap.id) {
      setSelectedMapId(nextMap.id);
    }

    const mapSubMaps = getSubMapsForMap(nextMap, currentSelectionLevel);

    if (
      selectedSubMapId &&
      mapSubMaps.some((subMap) => subMap.id === selectedSubMapId)
    ) {
      return;
    }

    const requestedSubMap = requestedSubMapId
      ? mapSubMaps.find((subMap) => subMap.id === requestedSubMapId)
      : null;

    setSelectedSubMapId(requestedSubMap?.id ?? mapSubMaps[0]?.id ?? '');
  }, [
    maps,
    availableMaps,
    selectedMap,
    selectedMapId,
    selectedSubMapId,
    currentSelectionLevel,
    requestedMapId,
    requestedSubMapId,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadPreview() {
      if (!characterId || !selectedSubMapId || !hasStartedHunt) {
        setPreparationPreview(null);
        return;
      }

      if (
        showActiveSession ||
        !selectedSubMapIsUnlocked ||
        !selectedSubMapHasActiveEncounters
      ) {
        setPreparationPreview(null);
        return;
      }

      try {
        setIsPreviewLoading(true);

        const data = await previewAutoCombat({
          characterId,
          subMapId: selectedSubMapId,
          projectionSeconds: 1800,
        });

        if (isMounted) {
          setPreparationPreview(data.combatPreview ?? null);
        }
      } catch {
        if (isMounted) {
          setPreparationPreview(null);
        }
      } finally {
        if (isMounted) {
          setIsPreviewLoading(false);
        }
      }
    }

    loadPreview();

    return () => {
      isMounted = false;
    };
  }, [
    characterId,
    selectedSubMapId,
    hasStartedHunt,
    showActiveSession,
    selectedSubMapIsUnlocked,
    selectedSubMapHasActiveEncounters,
  ]);

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando combate automático...</span>
      </main>
    );
  }

  if (!character) {
    return <Navigate to="/characters" replace />;
  }

  const characterWithPotionConfig = character as CharacterWithSinglePotionConfig;

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
      ? '1 opção no inventário'
      : `${potionOptions.length} opções no inventário`;

  const potionSlots = Array.from({ length: 1 }, () => {
    return currentPotionConfig;
  });

  const latestKilledMob = showActiveSession
    ? getLatestKilledMob(effectiveStatus)
    : null;
  const mainThreat = selectedSubMapThreats[0] ?? null;
  const remainingSeconds = showActiveSession
    ? getRemainingSeconds(effectiveStatus)
    : 0;

  const rawCharacterMaxHp =
    showActiveSession && visualRealtimeCombat?.characterMaxHp !== undefined
      ? visualRealtimeCombat.characterMaxHp
      : hasActiveSession
        ? effectiveStatus?.character?.maxHp ??
          effectiveStatus?.sessionSummary?.hp?.max ??
          character.maxHp
        : character.maxHp;

  const currentCharacterMaxHp = Math.max(
    1,
    toSafeNumber(rawCharacterMaxHp, character.maxHp ?? 1),
  );

  const rawCharacterHp =
    showActiveSession && visualRealtimeCombat?.characterCurrentHp !== undefined
      ? visualRealtimeCombat.characterCurrentHp
      : hasActiveSession
        ? effectiveStatus?.character?.currentHp ??
          effectiveStatus?.sessionSummary?.hp?.current ??
          character.currentHp
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
      ? character.totalXp ?? character.xp ?? 0
      : effectiveStatus?.character?.totalXp ??
        effectiveStatus?.character?.levelProgress?.totalXp ??
        effectiveStatus?.character?.xp ??
        character.totalXp ??
        character.xp ??
        0);

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

  const activeSessionMapName = showActiveSession
    ? effectiveStatus?.subMap?.map?.name
    : undefined;

  const currentLayoutMapName =
    activeSessionMapName ??
    selectedMap?.name ??
    selectedSubMap?.map?.name ??
    selectedSubMap?.mapName ??
    character.currentMapName;

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

  const selectedMapName =
    selectedMap?.name ??
    selectedSubMap?.map?.name ??
    selectedSubMap?.mapName ??
    layoutCharacter.currentMapName;

  const selectedMapImage = getMapImageByName(selectedMapName);
  const selectedMapVisualStyle = buildMapVisualStyle(selectedMapImage);
  const selectedMapRarityClassName = getMapRarityClassName(
    selectedSubMap?.tier ?? selectedMap?.tier,
  );

  const characterHasHp = currentCharacterHp > 0;

  const characterHpPercent =
    currentCharacterMaxHp > 0
      ? (currentCharacterHp / currentCharacterMaxHp) * 100
      : 0;

  const characterHpStyle = {
    width: `${clampPercent(characterHpPercent)}%`,
  } as CSSProperties;

  const activeMobSessionId = effectiveSession?.id ?? null;

  const stableActiveMobForSession =
    stableActiveMobRef.current &&
    stableActiveMobRef.current.sessionId === activeMobSessionId
      ? stableActiveMobRef.current
      : null;

  const activeMobName = showActiveSession
    ? visualRealtimeCombat?.mobName ??
      effectiveStatus?.currentMob?.name ??
      stableActiveMobForSession?.name ??
      latestKilledMob?.mobName ??
      mainThreat?.mob?.name ??
      'Aguardando ameaça'
    : mainThreat?.mob?.name ?? 'Aguardando ameaça';

  const normalizedActiveMobName = activeMobName.trim().toLowerCase();

  const activeMobThreat =
    selectedSubMapThreats.find((encounter) => {
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
          effectiveStatus?.currentMob?.level ??
          activeMobThreat?.mob?.level ??
          stableActiveMobForSession?.level ??
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

  if (
    showActiveSession &&
    activeMobName &&
    activeMobName !== 'Aguardando ameaça' &&
    activeMobLevel > 1
  ) {
    stableActiveMobRef.current = {
      sessionId: activeMobSessionId,
      name: activeMobName,
      normalizedName: normalizedActiveMobName,
      level: activeMobLevel,
    };
  }

  const activeMobFullBodyImage =
    getMobFullBodyImage(activeMobName) ?? getMobPortraitImage(activeMobName);

  const rawActiveMobMaxHp = showActiveSession
    ? visualRealtimeCombat?.mobMaxHp ??
      effectiveStatus?.currentMob?.maxHp ??
      effectiveStatus?.currentMob?.hp ??
      activeMobThreat?.mob?.hp ??
      mainThreat?.mob?.hp ??
      0
    : activeMobThreat?.mob?.hp ?? mainThreat?.mob?.hp ?? 0;

  const activeMobMaxHp = Math.max(0, toSafeNumber(rawActiveMobMaxHp, 0));

  const rawActiveMobCurrentHp =
    showActiveSession && visualRealtimeCombat?.mobCurrentHp !== undefined
      ? visualRealtimeCombat.mobCurrentHp
      : showActiveSession
        ? effectiveStatus?.currentMob?.currentHp ??
          (activeMobMaxHp > 0 ? activeMobMaxHp : 0)
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

  const activeMobReference = showActiveSession
    ? visualRealtimeCombat?.combatIndex
      ? `Combate ${visualRealtimeCombat.combatIndex}${
          visualRealtimeCombat.round
            ? ` · Rodada ${visualRealtimeCombat.round}`
            : ''
        }`
      : effectiveStatus?.session?.currentCombatIndex
        ? `Combate ${effectiveStatus.session.currentCombatIndex}${
            effectiveStatus.session.currentRound
              ? ` · Rodada ${effectiveStatus.session.currentRound}`
              : ''
          }`
        : activeMobThreat?.mob
          ? `Nv. ${activeMobThreat.mob.level}`
          : mainThreat?.mob
            ? `Nv. ${mainThreat.mob.level}`
            : latestKilledMob
              ? `${latestKilledMob.kills} abate(s)`
              : '—'
    : activeMobThreat?.mob
      ? `Nv. ${activeMobThreat.mob.level}`
      : mainThreat?.mob
        ? `Nv. ${mainThreat.mob.level}`
        : '—';

  const sessionStatusText = showActiveSession
    ? effectiveStatus?.sessionSummary?.statusText ??
      formatSessionStatus(effectiveSession?.status)
    : 'Sem sessão ativa';

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

  const canStartHunt =
    !overview?.activity?.hasActiveWorldBoss &&
    Boolean(selectedMap) &&
    Boolean(selectedSubMap) &&
    selectedMapIsUnlocked &&
    selectedSubMapIsUnlocked &&
    !showActiveSession &&
    characterHasHp;

  const canStartCombat =
    canStartHunt &&
    selectedSubMapHasActiveEncounters &&
    hasStartedHunt &&
    !showActiveSession &&
    !isActionLoading &&
    characterHasHp;

  const activeVisualEventType = normalizeRealtimeEventType(
    providerActiveEvent?.type ?? visualRealtimeCombat?.lastEventType,
  );

  const latestRealtimeEvent = showActiveSession
    ? activeBattleLogEvent ?? battleLogEvents[0] ?? null
    : null;

  const latestRealtimeEventType = normalizeRealtimeEventType(
    latestRealtimeEvent?.type ?? visualRealtimeCombat?.lastEventType,
  );

  const isAutoRestingVisual =
    showActiveSession && latestRealtimeEventType === 'AUTO_REST';

  const autoRestHealedAmount = isAutoRestingVisual
    ? Math.max(0, Math.floor(Number(latestRealtimeEvent?.healedAmount ?? 0)))
    : 0;

  const isMobDefeatedVisual =
    showActiveSession &&
    (activeVisualEventType === 'MOB_DEFEATED' ||
      (activeMobMaxHp > 0 && activeMobCurrentHp <= 0));

  const isPlayerDefeatedVisual =
    showActiveSession &&
    (activeVisualEventType === 'PLAYER_DEFEATED' ||
      (currentCharacterMaxHp > 0 && currentCharacterHp <= 0));

  const realtimeFeedbackEvent = showActiveSession ? activeBattleLogEvent : null;
  const realtimeFeedbackTarget = getRealtimeFeedbackTarget(realtimeFeedbackEvent);
  const latestDamageAmount = getRealtimeFeedbackDamage(realtimeFeedbackEvent);
  const isRealtimeFeedbackCritical = Boolean(realtimeFeedbackEvent?.isCritical);
  const isRealtimeFeedbackDodged = Boolean(
    realtimeFeedbackEvent?.isDodged ||
      normalizeRealtimeEventType(realtimeFeedbackEvent?.type) === 'DODGE',
  );
  const realtimeFeedbackEventKey = realtimeFeedbackEvent
    ? getRealtimeEventKey(realtimeFeedbackEvent)
    : '';

  const canShowFloatingDamage =
    showActiveSession &&
    Boolean(realtimeFeedbackEvent) &&
    latestDamageAmount > 0;

  const shouldShowPlayerDamage =
    canShowFloatingDamage && realtimeFeedbackTarget === 'PLAYER';

  const shouldShowMobDamage =
    canShowFloatingDamage && realtimeFeedbackTarget === 'MOB';

  const shouldShowPlayerDodge =
    showActiveSession &&
    Boolean(realtimeFeedbackEvent) &&
    realtimeFeedbackTarget === 'PLAYER' &&
    isRealtimeFeedbackDodged;

  const shouldShowMobDodge =
    showActiveSession &&
    Boolean(realtimeFeedbackEvent) &&
    realtimeFeedbackTarget === 'MOB' &&
    isRealtimeFeedbackDodged;

  const playerDamageKey = shouldShowPlayerDamage
    ? `player-damage-${realtimeFeedbackEventKey}`
    : '';

  const mobDamageKey = shouldShowMobDamage
    ? `mob-damage-${realtimeFeedbackEventKey}`
    : '';

  const xpFeedbackBreakdown = getXpFeedbackBreakdown(xpFeedbackEvent);
  const shouldShowXpFeedback =
    showActiveSession && Boolean(xpFeedbackBreakdown && xpFeedbackEvent);
  const xpFeedbackKey =
    shouldShowXpFeedback && xpFeedbackEvent
      ? `mob-xp-${getRealtimeEventKey(xpFeedbackEvent)}`
      : '';

  const playerFighterClassName = [
    'auto-combat-fighter-card',
    'auto-combat-fighter-card--player',
    shouldShowPlayerDamage ? 'is-hit' : '',
    shouldShowPlayerDamage && isRealtimeFeedbackCritical
      ? 'is-critical-hit'
      : '',
    shouldShowPlayerDodge ? 'is-dodging' : '',
    isAutoRestingVisual ? 'is-resting' : '',
    isPlayerDefeatedVisual ? 'is-defeated' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const mobFighterClassName = [
    'auto-combat-fighter-card',
    'auto-combat-fighter-card--mob',
    shouldShowMobDamage ? 'is-hit' : '',
    shouldShowMobDamage && isRealtimeFeedbackCritical
      ? 'is-critical-hit'
      : '',
    shouldShowMobDodge ? 'is-dodging' : '',
    isMobDefeatedVisual ? 'is-defeated' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const configuredPotionQuantity = getPotionQuantity(
    currentPotionConfig,
    availablePotions,
  );

  function getPotionHealLabel(
    potion: PotionEquipmentItem | PotionInventoryOption | null | undefined,
  ) {
    if (!potion) {
      return 'Cura não informada';
    }

    const formattedHeal = formatPotionHeal(potion).trim();

    if (!formattedHeal) {
      return 'Cura não informada';
    }

    if (/^cura\b/i.test(formattedHeal)) {
      return formattedHeal.replace(/^cura\s*/i, 'Cura: ');
    }

    return `Cura: ${formattedHeal}`;
  }

  function handleMapChange(mapId: string) {
    const nextMap = maps.find((gameMap) => gameMap.id === mapId) ?? null;
    const nextSubMaps = getSubMapsForMap(nextMap, currentSelectionLevel);

    setSelectedMapId(mapId);
    setSelectedSubMapId(nextSubMaps[0]?.id ?? '');
    setPreparationPreview(null);
    setHasStartedHunt(false);
    setErrorMessage('');
  }

  function handleSubMapChange(subMapId: string) {
    const parentMap = maps.find((gameMap) => {
      return gameMap.subMaps?.some((subMap) => subMap.id === subMapId);
    });

    if (parentMap?.id && parentMap.id !== selectedMapId) {
      setSelectedMapId(parentMap.id);
    }

    setSelectedSubMapId(subMapId);
    setPreparationPreview(null);
    setHasStartedHunt(false);
    setErrorMessage('');
  }

  function handleStartHunt() {
    if (overview?.activity?.hasActiveWorldBoss) {
      setErrorMessage(
        'Você está aguardando um World Boss. Saia do lobby antes de iniciar auto-combate.',
      );
      return;
    }

    if (!characterHasHp) {
      setErrorMessage(
        'Este personagem está sem HP. Use a enfermaria ou uma cura antes de iniciar uma nova caça.',
      );
      return;
    }

    if (!selectedMap) {
      setErrorMessage('Nenhum mapa disponível para o nível atual.');
      return;
    }

    if (!selectedMapIsUnlocked) {
      setErrorMessage(
        `Este mapa libera no nível ${getGameMapMinLevel(selectedMap)}.`,
      );
      return;
    }

    if (!selectedSubMap) {
      setErrorMessage('Nenhum submapa disponível para o mapa selecionado.');
      return;
    }

    if (!selectedSubMapIsUnlocked) {
      setErrorMessage(
        `Este submapa libera no nível ${
          selectedSubMap.minLevel ?? getGameMapMinLevel(selectedMap)
        }.`,
      );
      return;
    }

    if (!canStartHunt) {
      setErrorMessage('Não foi possível iniciar a caça com a seleção atual.');
      return;
    }

    setErrorMessage('');

    if (!selectedSubMapId && availableSubMaps[0]) {
      setSelectedSubMapId(availableSubMaps[0].id);
    }

    setHasStartedHunt(true);
    setActiveTab('battle');
  }

  function handleResetHunt() {
    if (showActiveSession) return;

    setHasStartedHunt(false);
    setPreparationPreview(null);
    setLocalRealtimeCombat(null);
    setLocalSessionTotals(null);
    setLocalBattleLogEvents([]);
    setLocalActiveEvent(null);
  }

  function handleOpenPotionConfig(slotIndex: number) {
    const isClickingCurrentOpenSlot =
      isPotionConfigPanelOpen && selectedPotionSlotIndex === slotIndex;

    if (isClickingCurrentOpenSlot) {
      setIsPotionConfigPanelOpen(false);
      setPotionConfigMessage('');
      return;
    }

    setSelectedPotionSlotIndex(slotIndex);
    setPotionConfigMessage('');
    setIsRestConfigPanelOpen(false);
    setRestConfigMessage('');

    if (slotIndex > 0) {
      setPotionConfigMessage(
        'No backend atual existe 1 configuração de poção automática por personagem. Este slot reserva já abre a mesma configuração principal.',
      );
    }

    setSelectedPotionItemId(currentPotionConfig?.potionItemId ?? '');
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
        'Selecione uma poção antes de salvar a configuração automática.',
      );
      return;
    }

    try {
      setIsPotionConfigLoading(true);
      setPotionConfigMessage('');

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
        response.message ?? 'Configuração de poção atualizada com sucesso.',
      );

      await loadAutoCombatData();
    } catch (error) {
      setPotionConfigMessage(
        getApiErrorMessage(
          error,
          'Não foi possível salvar a configuração de poção.',
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
      setPotionConfigMessage('');

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
      setSelectedPotionItemId('');
      setIsPotionConfigPanelOpen(false);
      setPotionConfigMessage('Poção removida da configuração automática.');

      await loadAutoCombatData();
    } catch (error) {
      setPotionConfigMessage(
        getApiErrorMessage(
          error,
          'Não foi possível remover a poção configurada.',
        ),
      );
    } finally {
      setIsPotionConfigLoading(false);
    }
  }

  function handleOpenRestConfig() {
    setIsPotionConfigPanelOpen(false);
    setPotionConfigMessage('');
    setRestConfigMessage('');
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
      setRestConfigMessage('');

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
        response.message ?? 'Configuração de descanso atualizada com sucesso.',
      );

      await loadAutoCombatData();
    } catch (error) {
      setRestConfigMessage(
        getApiErrorMessage(
          error,
          'Não foi possível salvar a configuração de descanso.',
        ),
      );
    } finally {
      setIsRestConfigLoading(false);
    }
  }

  async function handleStartAutoCombat() {
    if (!characterId || !selectedSubMapId || isActionLoading) return;

    if (overview?.activity?.hasActiveWorldBoss) {
      setErrorMessage(
        'Você está aguardando um World Boss. Saia do lobby antes de iniciar auto-combate.',
      );
      return;
    }

    if (!characterHasHp) {
      setErrorMessage(
        'Este personagem está sem HP. Use a enfermaria ou uma cura antes de iniciar o combate.',
      );
      return;
    }

    if (!selectedSubMapIsUnlocked) {
      setErrorMessage(
        `Este submapa libera no nível ${
          selectedSubMap?.minLevel ?? getGameMapMinLevel(selectedMap)
        }.`,
      );
      return;
    }

    if (!selectedSubMapHasActiveEncounters) {
      setErrorMessage(
        'Este submapa ainda não possui inimigos cadastrados para o auto-combate.',
      );
      return;
    }

    try {
      setIsActionLoading(true);
      setErrorMessage('');

      setLocalRealtimeCombat(null);
      setLocalCharacterProgress(null);
      setLocalSessionTotals(null);
      setLocalBattleLogEvents([]);
      setLocalActiveEvent(null);

      const response = realtimeActions.start
        ? await realtimeActions.start({
            characterId,
            subMapId: selectedSubMapId,
          })
        : realtimeActions.startAutoCombat
          ? await realtimeActions.startAutoCombat({
              characterId,
              subMapId: selectedSubMapId,
            })
          : null;

      if (!response) {
        throw new Error(
          'O AutoCombatRealtimeProvider não expôs uma função start/startAutoCombat.',
        );
      }

      const responseSession = getSessionFromStatus(response);
      const responseProgress = buildProgressFromStatus(response, responseSession);
      const responseTotals = buildSessionTotalsFromStatus(
        response,
        responseSession,
      );

      setAutoCombatStatus(response);
      setLocalCharacterProgress(responseProgress);
      setLocalSessionTotals(responseTotals);
      setHasStartedHunt(true);
      setActiveTab('battle');

      await loadAutoCombatData();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          'Não foi possível iniciar o combate automático. Verifique o HP, o submapa e se já existe uma sessão ativa.',
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
      setErrorMessage('');

      const response = realtimeActions.stop
        ? await realtimeActions.stop()
        : realtimeActions.stopAutoCombat
          ? await realtimeActions.stopAutoCombat(characterId)
          : null;

      if (!response) {
        throw new Error(
          'O AutoCombatRealtimeProvider não expôs uma função stop/stopAutoCombat.',
        );
      }

      const responseSession = getSessionFromStatus(response);
      const responseProgress = buildProgressFromStatus(response, responseSession);

      setAutoCombatStatus(response);
      setLocalCharacterProgress((current) =>
        mergeProgressKeepingHighestXp(current, responseProgress),
      );

      setLocalSessionTotals(null);
      setLocalRealtimeCombat(null);
      setLocalBattleLogEvents([]);
      setLocalActiveEvent(null);
      setHasStartedHunt(false);
      setActiveTab('battle');

      await loadAutoCombatData();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          'Não foi possível parar o combate automático.',
        ),
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  return (
    <DashboardLayout character={layoutCharacter}>
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

          {activeTab === 'battle' ? (
            <div className="auto-combat-tab-panel">
              {!hasStartedHunt && !showActiveSession ? (
                <article
                  className={[
                    'auto-combat-stage-card',
                    'auto-combat-map-stage',
                    selectedMapRarityClassName,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="auto-combat-map-preview">
                    <div
                      className={[
                        'auto-combat-map-preview__visual',
                        selectedMapRarityClassName,
                        selectedMapImage
                          ? 'auto-combat-map-preview__visual--with-image'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={selectedMapVisualStyle}
                    >
                      <span>Zona atual</span>

                      <strong>{selectedMapName}</strong>

                      {selectedSubMap?.name ? (
                        <small>{selectedSubMap.name}</small>
                      ) : null}

                      <div className="auto-combat-map-meta auto-combat-map-meta--visual">
                        <div>
                          <span>Tier</span>
                          <strong>
                            {selectedSubMap?.tier ?? selectedMap?.tier ?? '—'}
                          </strong>
                        </div>

                        <div>
                          <span>Nível</span>
                          <strong>
                            {selectedSubMap?.minLevel && selectedSubMap.maxLevel
                              ? `${selectedSubMap.minLevel}-${selectedSubMap.maxLevel}`
                              : selectedMap
                                ? `${getGameMapMinLevel(selectedMap)}-${getGameMapMaxLevel(selectedMap)}`
                                : '—'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="auto-combat-map-preview__content">
                      <span>Preparação da incursão</span>

                      <strong>{selectedMapName}</strong>

                      <p>
                        {selectedMap?.description ??
                          selectedSubMap?.description ??
                          'Escolha um submapa disponível e inicie a caça para revelar os infectados próximos.'}
                      </p>

                      <label className="auto-combat-field auto-combat-field--map">
                        <span>Mapa</span>

                        <div className="auto-combat-select-shell">
                          <select
                            value={selectedMapId}
                            onChange={(event) =>
                              handleMapChange(event.target.value)
                            }
                            disabled={isActionLoading}
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

                      <label className="auto-combat-field auto-combat-field--submap">
                        <span>Submapa</span>

                        <div className="auto-combat-select-shell">
                          <select
                            value={selectedSubMapId}
                            onChange={(event) =>
                              handleSubMapChange(event.target.value)
                            }
                            disabled={isActionLoading || !selectedMap}
                          >
                            {availableSubMaps.length <= 0 ? (
                              <option value="">Nenhum submapa disponível</option>
                            ) : null}

                            {availableSubMaps.map((subMap) => (
                              <option key={subMap.id} value={subMap.id}>
                                {getSubMapLabel(subMap)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>

                      <div className="auto-combat-stage-actions">
                        <button
                          type="button"
                          className="auto-combat-primary-button"
                          disabled={!canStartHunt || isActionLoading}
                          title={
                            overview?.activity?.hasActiveWorldBoss
                              ? 'Você já está em um World Boss.'
                              : undefined
                          }
                          onClick={handleStartHunt}
                        >
                          Iniciar caça
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ) : null}

              {hasStartedHunt && !showActiveSession ? (
                <article className="auto-combat-stage-card auto-combat-hunt-stage">
                  <div className="auto-combat-section-title auto-combat-section-title--small">
                    <span>Inimigos Próximos</span>
                  </div>

                  {selectedSubMapThreats.length > 0 ? (
                    <div className="auto-combat-enemy-grid">
                      {selectedSubMapThreats.map((encounter) => {
                        const mob = encounter.mob;
                        const mobFullBodyImage =
                          getMobFullBodyImage(mob?.name) ??
                          getMobPortraitImage(mob?.name);

                        return (
                          <article
                            key={encounter.id}
                            className="auto-combat-enemy-card"
                            role="button"
                            tabIndex={0}
                            aria-label={`Ver detalhes de ${mob?.name ?? 'Infectado'}`}
                            onClick={() => setSelectedThreat(encounter)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') {
                                return;
                              }

                              event.preventDefault();
                              setSelectedThreat(encounter);
                            }}
                          >
                            <div
                              className={[
                                'auto-combat-enemy-card__portrait',
                                'auto-combat-enemy-card__portrait--fullbody',
                                mobFullBodyImage
                                  ? 'auto-combat-enemy-card__portrait--loaded'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {mobFullBodyImage ? (
                                <img
                                  src={mobFullBodyImage}
                                  alt={mob?.name ?? 'Infectado'}
                                  loading="lazy"
                                />
                              ) : (
                                <span className="auto-combat-enemy-card__portrait-fallback">
                                  ☣
                                </span>
                              )}
                            </div>

                            <div className="auto-combat-enemy-card__content">
                              <span>Ameaça próxima</span>

                              <strong>{mob?.name ?? 'Infectado'}</strong>
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
                        Este submapa está cadastrado, mas ainda não possui
                        encontros ativos. Quando os mobs forem vinculados ao
                        seed/backend, ele ficará disponível para combate.
                      </p>
                    </div>
                  )}

                  <div className="auto-combat-section-title auto-combat-section-title--small auto-combat-preview-divider">
                    <span>Prévia da caça</span>
                  </div>

                  <div className="auto-combat-preview-grid">
                    <div>
                      <span>Risco</span>
                      <strong>
                        {isPreviewLoading
                          ? 'Calculando...'
                          : formatRiskLabel(preparationPreview?.risk?.level)}
                      </strong>
                      <small>Perigo da caça</small>
                    </div>

                    <div>
                      <span>XP/min</span>
                      <strong>
                        {isPreviewLoading
                          ? '...'
                          : preparationPreview?.xpPerMinute ?? '—'}
                      </strong>
                      <small>Experiência média</small>
                    </div>

                    <div>
                      <span>HP esperado</span>
                      <strong>
                        {isPreviewLoading
                          ? '...'
                          : preparationPreview?.hp?.expectedFinalPercent !==
                              undefined
                            ? `${Math.round(
                                preparationPreview.hp.expectedFinalPercent,
                              )}%`
                            : '—'}
                      </strong>
                      <small>Vida ao final</small>
                    </div>
                  </div>

                  <div className="auto-combat-stage-actions">
                    <button
                      type="button"
                      className="auto-combat-primary-button"
                      disabled={!canStartCombat}
                      onClick={handleStartAutoCombat}
                    >
                      {isActionLoading ? 'Processando...' : 'Iniciar combate'}
                    </button>

                    <button
                      type="button"
                      className="auto-combat-secondary-button auto-combat-secondary-button--danger"
                      disabled={isActionLoading}
                      onClick={handleResetHunt}
                    >
                      Cancelar caça
                    </button>
                  </div>
                </article>
              ) : null}

              {showActiveSession ? (
                <div
                  className={[
                    'auto-combat-session-stage',
                    !SHOW_AUTO_COMBAT_BATTLE_LOG
                      ? 'auto-combat-session-stage--battle-log-hidden'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
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
                        data-has-avatar={characterBattleImage ? 'true' : 'false'}
                      >
                        {shouldShowPlayerDamage ? (
                          <span
                            key={playerDamageKey}
                            className={[
                              'auto-combat-floating-damage',
                              isRealtimeFeedbackCritical
                                ? 'is-critical'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
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
                            'auto-combat-fighter-card__identity',
                            'auto-combat-fighter-card__identity--player',
                            characterBattleImage
                              ? 'auto-combat-fighter-card__identity--player-with-avatar'
                              : 'auto-combat-fighter-card__identity--player-empty',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <div
                            className={[
                              'auto-combat-fighter-card__character-image',
                              characterBattleImage
                                ? 'auto-combat-fighter-card__character-image--loaded'
                                : 'auto-combat-fighter-card__character-image--empty',
                            ]
                              .filter(Boolean)
                              .join(' ')}
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
                        {shouldShowXpFeedback && xpFeedbackBreakdown ? (
                          <div
                            key={xpFeedbackKey}
                            className="auto-combat-xp-feedback"
                            role="status"
                            aria-live="polite"
                          >
                            <strong>+{xpFeedbackBreakdown.totalXp} EXP</strong>

                            <div className="auto-combat-xp-feedback__details">
                              <span>Base {xpFeedbackBreakdown.baseXp}</span>

                              <span className="auto-combat-xp-feedback__premium">
                                <PremiumPlaceholderIcon className="auto-combat-xp-feedback__premium-icon" />
                                {xpFeedbackBreakdown.isPremiumActive
                                  ? `Premium +${xpFeedbackBreakdown.premiumBonusXp}`
                                  : `Com Premium +${xpFeedbackBreakdown.premiumPotentialBonusXp}`}
                              </span>

                              <span>Total {xpFeedbackBreakdown.totalXp} EXP</span>
                            </div>
                          </div>
                        ) : null}

                        {shouldShowMobDamage ? (
                          <span
                            key={mobDamageKey}
                            className={[
                              'auto-combat-floating-damage',
                              isRealtimeFeedbackCritical
                                ? 'is-critical'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            -{latestDamageAmount} HP
                          </span>
                        ) : null}

                        {isMobDefeatedVisual ? (
                          <span className="auto-combat-defeated-badge">
                            Derrotado
                          </span>
                        ) : null}

                        <span className="auto-combat-fighter-card__level-badge auto-combat-fighter-card__level-badge--mob">
                          Nv. {activeMobLevel}
                        </span>

                        <div className="auto-combat-fighter-card__identity auto-combat-fighter-card__identity--mob">
                          <div
                            className={[
                              'auto-combat-fighter-card__mob-image',
                              activeMobFullBodyImage
                                ? 'auto-combat-fighter-card__mob-image--loaded'
                                : 'auto-combat-fighter-card__mob-image--empty',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {activeMobFullBodyImage ? (
                              <img
                                src={activeMobFullBodyImage}
                                alt={activeMobName}
                              />
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
                            <strong>
                              {activeMobMaxHp > 0
                                ? `${activeMobCurrentHp}/${activeMobMaxHp}`
                                : activeMobReference}
                            </strong>
                          </div>

                          <i>
                            <b style={activeMobHpStyle} />
                          </i>
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
                        {isActionLoading ? 'Processando...' : 'Parar sessão'}
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

                      <small>Configure a poção e o descanso em slots separados.</small>
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
                              'auto-combat-potion-slot__button',
                              isEnabled ? 'is-enabled' : 'is-empty',
                              index === selectedPotionSlotIndex &&
                              isPotionConfigPanelOpen
                                ? 'is-selected'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
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
                                : 'Configurar'}
                            </strong>

                            <span>
                              {potionItem
                                ? getPotionDescription(potionConfig)
                                : 'Clique para escolher uma poção e definir o gatilho de HP.'}
                            </span>

                            <small className="auto-combat-consumable-slot__meta">
                              {potionItem
                                ? `HP <= ${currentPotionConfig?.hpThresholdPercent ?? potionThresholdPercent}% · x${potionQuantity}`
                                : 'Escolher poção'}
                            </small>
                          </div>

                          <em className="auto-combat-consumable-slot__action">
                            {hasConfiguredPotion ? 'Editar' : 'Configurar'}
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
                            'auto-combat-potion-slot__button',
                            'auto-combat-rest-slot__button',
                            autoRestEnabled ? 'is-enabled' : 'is-empty',
                            isRestConfigPanelOpen ? 'is-selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={handleOpenRestConfig}
                        >
                          <div className="auto-combat-potion-slot__icon auto-combat-rest-slot__icon" />

                          <div className="auto-combat-consumable-slot__body">
                            <span className="auto-combat-consumable-slot__eyebrow">
                              Descanso automático
                            </span>

                            <strong>
                              {autoRestEnabled ? 'Descanso ativo' : 'Configurar'}
                            </strong>

                            <span>
                              {autoRestEnabled
                                ? 'Pausa a caça só quando o HP chegar no gatilho baixo.'
                                : 'Configure quando parar e quando voltar a caçar.'}
                            </span>

                            <small className="auto-combat-consumable-slot__meta">
                              {autoRestEnabled
                                ? `HP <= ${autoRestStartHpPercent}% · volta em ${autoRestStopHpPercent}%`
                                : 'Sem descanso'}
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
                                  : 'Inventário sem poções'}
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
                                      'auto-combat-potion-option',
                                      isSelectedPotion ? 'is-selected' : '',
                                      isUnavailable ? 'is-unavailable' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    disabled={
                                      isPotionConfigLoading || isUnavailable
                                    }
                                    onClick={() => {
                                      setSelectedPotionItemId(potionId);
                                      setPotionConfigMessage('');
                                    }}
                                  >
                                    <span className="auto-combat-potion-option__icon">
                                      ✚
                                    </span>

                                    <span className="auto-combat-potion-option__content">
                                      <strong>{potion.name}</strong>
                                      <small>{getPotionHealLabel(potion)}</small>
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
                              <strong>{potionThresholdPercent}% ou menos</strong>
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
                                    ? 'is-selected'
                                    : ''
                                }
                                aria-pressed={potionThresholdPercent === value}
                                disabled={isPotionConfigLoading}
                                onClick={() => setPotionThresholdPercent(value)}
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
                            ? 'Salvando...'
                            : 'Salvar configuração'}
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
                                    ? 'Descanso automático ativo'
                                    : 'Descanso automático desativado'}
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
                              ? 'Salvando...'
                              : 'Salvar descanso'}
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
                    totalXpGained={totalXpGained}
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
              <span>XP {selectedThreatMob.xpReward ?? '—'}</span>
              <span>Nível {selectedThreatMob.level ?? '—'}</span>
              <span>HP {selectedThreatMob.hp ?? '—'}</span>
              {selectedThreatChance !== null ? (
                <span>{selectedThreatChance}% encontro</span>
              ) : null}
            </div>

            <div className="auto-combat-threat-modal__divider">
              <span>Loot possível</span>
            </div>

            {selectedThreatDrops.length > 0 ? (
              <div className="auto-combat-threat-modal__loot-grid">
                {selectedThreatDrops.map((drop) => {
                  const itemName = drop.item?.name ?? 'Item desconhecido';
                  const chanceLabel = formatDropChance(drop.dropChance);

                  return (
                    <div
                      key={drop.id}
                      className={[
                        'auto-combat-threat-loot-card',
                        getLootRarityClassName(drop.item?.rarity),
                      ].join(' ')}
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
          </article>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
