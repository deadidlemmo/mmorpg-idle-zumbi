import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import statAgilityIcon from '../../../assets/images/stats/attributes/stat-agility.png';
import statPrecisionIcon from '../../../assets/images/stats/attributes/stat-precision.png';
import statStrengthIcon from '../../../assets/images/stats/attributes/stat-strength.png';
import statTechniqueIcon from '../../../assets/images/stats/attributes/stat-technique.png';
import statVitalityIcon from '../../../assets/images/stats/attributes/stat-vitality.png';
import statWillpowerIcon from '../../../assets/images/stats/attributes/stat-willpower.png';
import { apiClient } from '../../../services/api/apiClient';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
  DashboardEquipmentItem,
  DashboardPotionConfigViewModel,
  DashboardStats,
} from '../../dashboard/types/dashboard.types';
import {
  getAutoCombatMaps,
  getAutoCombatStatus,
  previewAutoCombat,
} from '../api/auto-combat.api';
import '../auto-combat.css';
import { AutoCombatBattleLog } from '../components/AutoCombatBattleLog';
import {
  useAutoCombatRealtime,
  useAutoCombatRealtimeState,
} from '../realtime/useAutoCombatRealtime';
import type {
  AutoCombatEncounterViewModel,
  AutoCombatMapViewModel,
  AutoCombatProjectionPreview,
  AutoCombatRealtimeEvent,
  AutoCombatSessionApiViewModel,
  AutoCombatStatusResponse,
  AutoCombatSubMapViewModel,
} from '../types/auto-combat.types';

type AutoCombatTab = 'battle' | 'stats';

type RealtimeActor = 'PLAYER' | 'MOB' | 'SYSTEM';
type RealtimeTarget = 'PLAYER' | 'MOB' | 'SYSTEM';

type LooseLevelProgressSource = {
  level?: number | null;
  oldLevel?: number | null;
  newLevel?: number | null;

  xp?: number | null;
  totalXp?: number | null;
  currentXp?: number | null;
  gainedXp?: number | null;

  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;

  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;

  progressPercent?: number | null;
  xpProgressPercent?: number | null;
  isAtLevelCap?: boolean | null;
};

type CharacterViewModelWithLayoutFields = DashboardCharacterViewModel & {
  className: string;
  classId: string;
  avatarKey?: string | null;
  avatarUrl?: string | null;
  currentMapName: string;

  totalXp?: number | null;
  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;
  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: LooseLevelProgressSource | null;
};

type PotionEquipmentItem = DashboardEquipmentItem & {
  quantity?: number | null;
  availableQuantity?: number | null;
};

type CharacterPotionConfigWithItem = Omit<
  DashboardPotionConfigViewModel,
  'potion' | 'potionItem'
> & {
  potion?: PotionEquipmentItem | null;
  potionItem?: PotionEquipmentItem | null;
};

type CharacterWithSinglePotionConfig = Omit<
  CharacterViewModelWithLayoutFields,
  'potionConfig' | 'potionConfigs' | 'autoPotionConfig'
> & {
  potionConfig?: CharacterPotionConfigWithItem | null;
  potionConfigs?: CharacterPotionConfigWithItem[];
  autoPotionConfig?: CharacterPotionConfigWithItem | null;
};

type PotionInventoryOption = PotionEquipmentItem & {
  itemId: string;
  quantity: number;
  inventoryItemId?: string | null;
};

type PotionConfigApiResponse = {
  message?: string;
  character?: {
    id?: string;
    name?: string;
  };
  config?: {
    id?: string;
    enabled?: boolean;
    potionItemId?: string | null;
    hpThresholdPercent?: number | null;
    useInManualCombat?: boolean | null;
    useInAutoCombat?: boolean | null;
  };
  potion?: PotionEquipmentItem | null;
  summary?: {
    hasPotion?: boolean;
    hasPotionInInventory?: boolean;
    availableQuantity?: number;
    canAutoUseInManualCombat?: boolean;
    canAutoUseInAutoCombat?: boolean;
    canAutoUse?: boolean;
    triggerText?: string;
  };
};

type UpdatePotionConfigPayload = {
  enabled?: boolean;
  potionItemId?: string | null;
  hpThresholdPercent?: number;
  useInManualCombat?: boolean;
  useInAutoCombat?: boolean;
};

type CharacterProgressSource = {
  level?: number | null;
  xp?: number | null;
  totalXp?: number | null;

  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;

  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: LooseLevelProgressSource | null;
};

type RealtimeCombatState = {
  sessionId?: string | null;

  mobId?: string | null;
  mobName?: string | null;
  mobCurrentHp?: number | null;
  mobMaxHp?: number | null;
  mobHpPercent?: number | null;

  characterCurrentHp?: number | null;
  characterMaxHp?: number | null;
  characterHpPercent?: number | null;

  lastMessage?: string | null;
  message?: string | null;
  lastDamage?: number | null;
  lastEventType?: string | null;
  isCritical?: boolean | null;
  isDodged?: boolean | null;

  actor?: RealtimeActor | null;
  target?: RealtimeTarget | null;

  round?: number | null;
  combatIndex?: number | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;

  updatedAt?: number;
};

type RealtimeCharacterProgressState = {
  sessionId?: string | null;

  level?: number;
  xp?: number;

  currentLevelXp?: number;
  xpToNextLevel?: number;
  nextLevelXp?: number;
  xpProgressPercent?: number;

  xpIntoCurrentLevel?: number;
  xpNeededForNextLevel?: number;
  currentLevelStartXp?: number;
  nextLevelRequiredXp?: number;
  isAtLevelCap?: boolean;

  xpGained?: number;
  leveledUp?: boolean;
  levelsGained?: number;

  updatedAt?: number;
};

type RealtimeSessionTotalsState = {
  sessionId?: string | null;

  currentCombatIndex?: number;
  totalCombats?: number;
  totalRounds?: number;
  totalKills?: number;
  totalXpGained?: number;
  totalLoot?: number;
  potionsUsed?: number;

  updatedAt?: number;
};

type AutoCombatRealtimeStateLoose = {
  status?: AutoCombatStatusResponse | null;
  autoCombatStatus?: AutoCombatStatusResponse | null;

  session?: AutoCombatSessionApiViewModel | null;
  activeSession?: AutoCombatSessionApiViewModel | null;

  character?: {
    id?: string | null;
    name?: string | null;

    level?: number | null;
    xp?: number | null;
    totalXp?: number | null;

    currentHp?: number | null;
    maxHp?: number | null;
    hpPercent?: number | null;

    currentLevelXp?: number | null;
    xpToNextLevel?: number | null;
    nextLevelXp?: number | null;
    xpProgressPercent?: number | null;

    xpIntoCurrentLevel?: number | null;
    xpNeededForNextLevel?: number | null;
    currentLevelStartXp?: number | null;
    nextLevelRequiredXp?: number | null;
    isAtLevelCap?: boolean | null;

    xpGained?: number | null;
    leveledUp?: boolean | null;
    levelsGained?: number | null;

    updatedAt?: number | null;
  } | null;

  mob?: {
    id?: string | null;
    name?: string | null;

    currentHp?: number | null;
    maxHp?: number | null;
    hpPercent?: number | null;

    level?: number | null;
    tier?: number | null;

    updatedAt?: number | null;
  } | null;

  visual?: {
    lastMessage?: string | null;
    lastDamage?: number | null;
    lastEventType?: string | null;

    actor?: RealtimeActor | null;
    target?: RealtimeTarget | null;

    isCritical?: boolean | null;
    isDodged?: boolean | null;

    updatedAt?: number | null;
  } | null;

  combat?: RealtimeCombatState | null;
  realtimeCombat?: RealtimeCombatState | null;

  characterProgress?: RealtimeCharacterProgressState | null;
  progress?: RealtimeCharacterProgressState | null;
  realtimeCharacterProgress?: RealtimeCharacterProgressState | null;

  sessionTotals?: RealtimeSessionTotalsState | null;
  totals?: RealtimeSessionTotalsState | null;
  realtimeSessionTotals?: RealtimeSessionTotalsState | null;

  battleLogEvents?: AutoCombatRealtimeEvent[];
  eventLog?: AutoCombatRealtimeEvent[];
  events?: AutoCombatRealtimeEvent[];

  activeEvent?: AutoCombatRealtimeEvent | null;
  displayedEvent?: AutoCombatRealtimeEvent | null;
  currentEvent?: AutoCombatRealtimeEvent | null;
  lastProcessedEvent?: AutoCombatRealtimeEvent | null;
  lastEvent?: AutoCombatRealtimeEvent | null;

  eventQueue?: AutoCombatRealtimeEvent[];
  queue?: AutoCombatRealtimeEvent[];
  realtimeEventQueue?: AutoCombatRealtimeEvent[];

  isConnected?: boolean;
  isJoined?: boolean;
  isActive?: boolean;
  hasActiveSession?: boolean;
  hasActiveAutoCombat?: boolean;
};

type AutoCombatRealtimeActions = {
  start?: (payload: {
    characterId: string;
    subMapId: string;
  }) => Promise<AutoCombatStatusResponse>;

  startAutoCombat?: (payload: {
    characterId: string;
    subMapId: string;
  }) => Promise<AutoCombatStatusResponse>;

  stop?: () => Promise<AutoCombatStatusResponse>;

  stopAutoCombat?: (
    characterId?: string,
  ) => Promise<AutoCombatStatusResponse>;
};

type AutoCombatRealtimeEventLoose = AutoCombatRealtimeEvent & {
  createdAt?: string | null;

  characterXp?: number | null;
  characterLevel?: number | null;
  totalXp?: number | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;

  healedAmount?: number | null;

  potionItemId?: string | null;
  potionItemName?: string | null;
  potionTriggerPercent?: number | null;

  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;
};

type AutoCombatRealtimePotionEvent = AutoCombatRealtimeEventLoose;

const EMPTY_STATS: DashboardStats = {
  strength: 0,
  vitality: 0,
  agility: 0,
  precision: 0,
  technique: 0,
  willpower: 0,
};

const STAT_CARDS = [
  {
    key: 'strength',
    className: 'strength',
    label: 'Força',
    description: 'Impacto físico e dano com armas corpo a corpo.',
    icon: statStrengthIcon,
  },
  {
    key: 'vitality',
    className: 'vitality',
    label: 'Vitalidade',
    description: 'Vigor físico, resistência e sobrevivência.',
    icon: statVitalityIcon,
  },
  {
    key: 'agility',
    className: 'agility',
    label: 'Agilidade',
    description: 'Mobilidade, reação e ritmo de movimento.',
    icon: statAgilityIcon,
  },
  {
    key: 'precision',
    className: 'precision',
    label: 'Precisão',
    description: 'Mira, controle e eficiência em ataques certeiros.',
    icon: statPrecisionIcon,
  },
  {
    key: 'technique',
    className: 'technique',
    label: 'Técnica',
    description: 'Uso de equipamentos, ferramentas e recursos táticos.',
    icon: statTechniqueIcon,
  },
  {
    key: 'willpower',
    className: 'willpower',
    label: 'Vontade',
    description: 'Foco, resistência mental e controle sob pressão.',
    icon: statWillpowerIcon,
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function getFirstOptionalNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = getOptionalNumber(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function getOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}


function clampPercent(value: unknown) {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(100, parsed));
}

function clampNumber(value: unknown, min: number, max: number) {
  const parsed = toSafeNumber(value, min);

  return Math.max(min, Math.min(parsed, max));
}

function formatSeconds(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return '—';

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function formatSessionStatus(status?: string | null) {
  const labels: Record<string, string> = {
    ACTIVE: 'Sessão ativa',
    STOPPED: 'Sessão interrompida manualmente',
    FINISHED: 'Sessão finalizada',
    DEFEATED: 'Sobrevivente derrotado',
    FAILED: 'Sessão falhou',
    CANCELLED: 'Sessão cancelada',
  };

  if (!status) return 'Sem sessão';

  return labels[status] ?? status;
}

function formatRiskLabel(risk?: string | null) {
  const labels: Record<string, string> = {
    LOW: 'Baixo',
    MEDIUM: 'Médio',
    HIGH: 'Alto',
    LETHAL: 'Letal',
  };

  if (!risk) return '—';

  return labels[risk] ?? risk;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: {
      data?: {
        message?: string | string[];
      };
    };
  };

  const message = apiError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(' ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function normalizeStats(value: unknown): DashboardStats | null {
  if (!value || typeof value !== 'object') return null;

  const stats = value as Partial<DashboardStats>;

  return {
    strength: toSafeNumber(stats.strength, 0),
    vitality: toSafeNumber(stats.vitality, 0),
    agility: toSafeNumber(stats.agility, 0),
    precision: toSafeNumber(stats.precision, 0),
    technique: toSafeNumber(stats.technique, 0),
    willpower: toSafeNumber(stats.willpower, 0),
  };
}

function getStatsScore(stats: DashboardStats) {
  return (
    stats.strength +
    stats.vitality +
    stats.agility +
    stats.precision +
    stats.technique +
    stats.willpower
  );
}

function normalizePotionInventoryEntry(
  value: unknown,
): PotionInventoryOption | null {
  if (!isRecord(value)) return null;

  const rawItem = isRecord(value.item) ? value.item : value;
  const item = rawItem as unknown as PotionEquipmentItem;

  const id =
    typeof item.id === 'string'
      ? item.id
      : typeof value.itemId === 'string'
        ? value.itemId
        : '';

  if (!id) return null;

  const slot = item.slot ?? value.slot;
  const type = value.type ?? item.slot;

  if (slot !== 'CONSUMABLE' && type !== 'CONSUMABLE') {
    return null;
  }

  const healFlat = toSafeNumber(item.healFlat, 0);
  const healPercent = toSafeNumber(item.healPercent, 0);

  if (healFlat <= 0 && healPercent <= 0) {
    return null;
  }

  const quantity = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        value.quantity ?? item.quantity ?? item.availableQuantity,
        0,
      ),
    ),
  );

  return {
    ...item,
    id,
    itemId: id,
    inventoryItemId: typeof value.id === 'string' ? value.id : null,
    quantity,
    healFlat,
    healPercent,
  };
}

function normalizePotionInventoryResponse(data: unknown) {
  const candidates: unknown[] = [];

  if (Array.isArray(data)) {
    candidates.push(...data);
  }

  if (isRecord(data)) {
    const inventoryItems = data.inventoryItems;
    const items = data.items;
    const consumables = data.consumables;
    const inventorySummary = data.inventorySummary;

    if (Array.isArray(inventoryItems)) candidates.push(...inventoryItems);
    if (Array.isArray(items)) candidates.push(...items);
    if (Array.isArray(consumables)) candidates.push(...consumables);

    if (
      isRecord(inventorySummary) &&
      Array.isArray(inventorySummary.consumables)
    ) {
      candidates.push(...inventorySummary.consumables);
    }
  }

  const byItemId = new Map<string, PotionInventoryOption>();

  for (const candidate of candidates) {
    const potion = normalizePotionInventoryEntry(candidate);

    if (!potion) continue;

    const existing = byItemId.get(potion.itemId);

    if (!existing) {
      byItemId.set(potion.itemId, potion);
      continue;
    }

    byItemId.set(potion.itemId, {
      ...existing,
      ...potion,
      quantity: Math.max(existing.quantity, potion.quantity),
    });
  }

  return Array.from(byItemId.values()).sort((a, b) => {
    return (
      (a.tier ?? 0) - (b.tier ?? 0) ||
      String(a.name ?? '').localeCompare(String(b.name ?? ''))
    );
  });
}

function normalizePotionConfigResponse(
  data: unknown,
): CharacterPotionConfigWithItem | null {
  if (!isRecord(data)) return null;

  const response = data as PotionConfigApiResponse & Record<string, unknown>;

  const rawConfig = isRecord(response.config)
    ? response.config
    : isRecord(response.autoPotionConfig)
      ? response.autoPotionConfig
      : isRecord(response.potionConfig)
        ? response.potionConfig
        : response;

  const rawConfigRecord = rawConfig as Record<string, unknown>;

  const rawPotion =
    response.potion ??
    (isRecord(rawConfigRecord.potion) ? rawConfigRecord.potion : null) ??
    (isRecord(rawConfigRecord.potionItem) ? rawConfigRecord.potionItem : null);

  const potion = isRecord(rawPotion)
    ? (rawPotion as unknown as PotionEquipmentItem)
    : null;

  const potionItemId =
    typeof rawConfigRecord.potionItemId === 'string'
      ? rawConfigRecord.potionItemId
      : potion?.id ?? null;

  const hasAnyConfigValue =
    Boolean(rawConfigRecord.id) ||
    typeof rawConfigRecord.enabled === 'boolean' ||
    Boolean(potionItemId) ||
    potion !== null;

  if (!hasAnyConfigValue) {
    return null;
  }

  return {
    id: typeof rawConfigRecord.id === 'string' ? rawConfigRecord.id : undefined,
    characterId:
      typeof rawConfigRecord.characterId === 'string'
        ? rawConfigRecord.characterId
        : undefined,
    enabled: Boolean(rawConfigRecord.enabled),
    potionItemId,
    hpThresholdPercent: clampNumber(rawConfigRecord.hpThresholdPercent, 1, 100) || 35,
    useInManualCombat:
      typeof rawConfigRecord.useInManualCombat === 'boolean'
        ? rawConfigRecord.useInManualCombat
        : true,
    useInAutoCombat:
      typeof rawConfigRecord.useInAutoCombat === 'boolean'
        ? rawConfigRecord.useInAutoCombat
        : true,
    potion,
    potionItem: potion,
  };
}

function getPotionItem(potionConfig?: CharacterPotionConfigWithItem | null) {
  return potionConfig?.potion ?? potionConfig?.potionItem ?? null;
}

function getPotionName(potionConfig?: CharacterPotionConfigWithItem | null) {
  return getPotionItem(potionConfig)?.name ?? 'Configurar poção';
}

function getPotionDescription(
  potionConfig?: CharacterPotionConfigWithItem | null,
) {
  const potionItem = getPotionItem(potionConfig);

  if (!potionItem) {
    return 'Clique para escolher uma poção e definir quando ela será usada.';
  }

  return potionConfig?.enabled
    ? `Usa automaticamente com ${potionConfig.hpThresholdPercent ?? 35}% de HP ou menos.`
    : 'Poção selecionada, mas uso automático desativado.';
}

function getPotionQuantity(
  potionConfig: CharacterPotionConfigWithItem | null,
  availablePotions: PotionInventoryOption[],
) {
  const potionItem = getPotionItem(potionConfig);

  if (!potionItem?.id) return 0;

  const inventoryPotion = availablePotions.find(
    (potion) => potion.itemId === potionItem.id || potion.id === potionItem.id,
  );

  return Math.max(
    0,
    toSafeNumber(
      inventoryPotion?.quantity ??
        potionItem.availableQuantity ??
        potionItem.quantity,
      0,
    ),
  );
}

function getNormalizedQuantity(value: unknown) {
  const quantity = getOptionalNumber(value);

  if (quantity === undefined) {
    return undefined;
  }

  return Math.max(0, Math.floor(quantity));
}

function resolvePotionEventItemId(
  payload: AutoCombatRealtimeEvent,
  fallbackPotionItemId?: string | null,
) {
  const event = payload as AutoCombatRealtimePotionEvent;

  if (typeof event.potionItemId === 'string' && event.potionItemId.trim()) {
    return event.potionItemId.trim();
  }

  if (
    typeof fallbackPotionItemId === 'string' &&
    fallbackPotionItemId.trim()
  ) {
    return fallbackPotionItemId.trim();
  }

  return '';
}

function resolvePotionQuantityAfter(
  payload: AutoCombatRealtimeEvent,
  currentQuantity: number,
) {
  const event = payload as AutoCombatRealtimePotionEvent;

  const explicitQuantity =
    getNormalizedQuantity(event.potionQuantityRemaining) ??
    getNormalizedQuantity(event.potionQuantityAfter);

  if (explicitQuantity !== undefined) {
    return explicitQuantity;
  }

  const quantityBefore = getNormalizedQuantity(event.potionQuantityBefore);
  const usedQuantity = getNormalizedQuantity(event.potionUsedQuantity) ?? 1;

  if (quantityBefore !== undefined) {
    return Math.max(0, quantityBefore - usedQuantity);
  }

  return Math.max(0, Math.floor(currentQuantity) - usedQuantity);
}

function formatPotionHeal(potion?: PotionEquipmentItem | null) {
  if (!potion) return 'Sem cura';

  const healFlat = toSafeNumber(potion.healFlat, 0);
  const healPercent = toSafeNumber(potion.healPercent, 0);

  if (healFlat > 0 && healPercent > 0) {
    return `Cura ${healFlat} + ${healPercent}% HP`;
  }

  if (healPercent > 0) {
    return `Cura ${healPercent}% HP`;
  }

  if (healFlat > 0) {
    return `Cura ${healFlat} HP`;
  }

  return 'Sem cura';
}

async function getCharacterInventoryRaw(characterId: string) {
  const response = await apiClient.get<unknown>(`/inventory/${characterId}`);

  return response.data;
}

async function getCharacterPotionConfigRaw(characterId: string) {
  const response = await apiClient.get<PotionConfigApiResponse>(
    `/consumables/${characterId}/config`,
  );

  return response.data;
}

async function updateCharacterPotionConfigRaw(
  characterId: string,
  payload: UpdatePotionConfigPayload,
) {
  const response = await apiClient.patch<PotionConfigApiResponse>(
    `/consumables/${characterId}/config`,
    payload,
  );

  return response.data;
}

function resolveCharacterStats(
  overview: CharacterOverviewResponse | null,
  character: CharacterViewModelWithLayoutFields | null,
): DashboardStats {
  type LooseOverview = CharacterOverviewResponse & {
    totalStats?: DashboardStats;
    stats?: DashboardStats;
    characterStats?: DashboardStats;
  };

  type LooseCharacter = CharacterOverviewResponse['character'] & {
    totalStats?: DashboardStats;
    primaryStats?: DashboardStats;
    stats?: DashboardStats;
    baseStats?: DashboardStats;
  };

  const looseOverview = overview as LooseOverview | null;
  const looseCharacter = overview?.character as LooseCharacter | undefined;

  const candidates = [
    character?.totalStats,
    looseCharacter?.totalStats,
    looseOverview?.totalStats,
    looseOverview?.stats,
    looseOverview?.characterStats,
    looseCharacter?.primaryStats,
    looseCharacter?.stats,
    looseCharacter?.baseStats,
    character?.baseStats,
  ]
    .map(normalizeStats)
    .filter((stats): stats is DashboardStats => Boolean(stats));

  if (candidates.length <= 0) return EMPTY_STATS;

  return candidates.reduce((best, current) => {
    return getStatsScore(current) > getStatsScore(best) ? current : best;
  }, candidates[0]);
}

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): CharacterViewModelWithLayoutFields {
  const character = overview.character;

  const className =
    character.className ??
    character.class?.name ??
    character.gameClass?.name ??
    'Lutador';

  const currentMapName =
    character.currentMapName ??
    character.currentMap?.name ??
    character.map?.name ??
    overview.progression?.currentMap?.name ??
    'Sem mapa';

  return {
    ...character,
    id: character.id,
    name: character.name,
    className,
    classId: character.classId ?? normalizeClassName(className),
    level: character.level ?? 1,
    xp: character.xp ?? 0,
    totalXp: character.totalXp ?? character.xp ?? 0,
    status: character.status ?? 'IDLE',
    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,
    avatarKey: character.avatarKey ?? null,
    avatarUrl: character.avatarUrl ?? null,
    currentMapName,
    totalStats: character.totalStats ?? character.baseStats ?? EMPTY_STATS,
    equipment: character.equipment ?? overview.equipment ?? {},
  } as CharacterViewModelWithLayoutFields;
}

function getSessionFromStatus(
  status: AutoCombatStatusResponse | null,
): AutoCombatSessionApiViewModel | null {
  if (!status) return null;

  return (
    status.session ??
    status.activeSession ??
    status.autoCombatSession ??
    status.lastSession ??
    null
  );
}

function normalizeSessionStatus(status?: string | null) {
  return String(status ?? '').trim().toUpperCase();
}

function isTerminalSessionStatus(status?: string | null) {
  const normalizedStatus = normalizeSessionStatus(status);

  return (
    normalizedStatus === 'STOPPED' ||
    normalizedStatus === 'FINISHED' ||
    normalizedStatus === 'DEFEATED' ||
    normalizedStatus === 'FAILED' ||
    normalizedStatus === 'CANCELLED'
  );
}

function isSessionActive(
  status: AutoCombatStatusResponse | null,
  session: AutoCombatSessionApiViewModel | null,
) {
  const normalizedStatus = normalizeSessionStatus(session?.status);

  if (isTerminalSessionStatus(normalizedStatus)) {
    return false;
  }

  if (normalizedStatus === 'ACTIVE') {
    return true;
  }

  return Boolean(status?.active) || Boolean(status?.hasActiveAutoCombat);
}

function getActiveEncounters(subMap?: AutoCombatSubMapViewModel | null) {
  return (subMap?.encounters ?? []).filter((encounter) => {
    return encounter.isActive !== false && Boolean(encounter.mob);
  });
}

function flattenCombatSubMaps(
  maps: AutoCombatMapViewModel[],
  characterLevel: number,
) {
  return maps
    .flatMap((gameMap) => {
      return (gameMap.subMaps ?? []).map((subMap) => {
        return {
          ...subMap,
          map: {
            id: gameMap.id,
            name: gameMap.name,
            tier: gameMap.tier,
          },
          mapName: gameMap.name,
        };
      });
    })
    .filter((subMap) => {
      const minLevel = subMap.minLevel ?? 1;

      return characterLevel >= minLevel && getActiveEncounters(subMap).length > 0;
    })
    .sort((a, b) => {
      return (
        (a.tier ?? 0) - (b.tier ?? 0) ||
        (a.minLevel ?? 0) - (b.minLevel ?? 0) ||
        a.name.localeCompare(b.name)
      );
    });
}

function getSubMapLabel(subMap: AutoCombatSubMapViewModel) {
  return subMap.name;
}

function getDefaultSubMapId(params: {
  maps: AutoCombatMapViewModel[];
  characterLevel: number;
  status: AutoCombatStatusResponse | null;
}) {
  const subMaps = flattenCombatSubMaps(params.maps, params.characterLevel);
  const sessionSubMapId = params.status?.subMap?.id;

  if (
    sessionSubMapId &&
    subMaps.some((subMap) => subMap.id === sessionSubMapId)
  ) {
    return sessionSubMapId;
  }

  return subMaps[0]?.id ?? '';
}

function getRemainingSeconds(status: AutoCombatStatusResponse | null) {
  return (
    status?.session?.remainingSeconds ??
    status?.activeSession?.remainingSeconds ??
    status?.autoCombatSession?.remainingSeconds ??
    status?.sessionSummary?.duration?.remainingSeconds ??
    0
  );
}

function getLatestKilledMob(status: AutoCombatStatusResponse | null) {
  const mobs = status?.rewards?.mobs ?? status?.sessionSummary?.mobs?.kills ?? [];

  if (mobs.length <= 0) return null;

  return mobs[mobs.length - 1];
}

function getThreatWeightPercent(
  encounter: AutoCombatEncounterViewModel,
  encounters: AutoCombatEncounterViewModel[],
) {
  const totalWeight = encounters.reduce((total, currentEncounter) => {
    return total + Math.max(0, currentEncounter.weight ?? 0);
  }, 0);

  if (totalWeight <= 0) return 0;

  return Math.round(((encounter.weight ?? 0) / totalWeight) * 100);
}

function normalizeRealtimeEventType(type?: string | null) {
  return String(type ?? '').trim().toUpperCase();
}

function isDamageRealtimeEvent(eventType?: string | null) {
  const normalizedType = normalizeRealtimeEventType(eventType);

  return normalizedType === 'PLAYER_HIT' || normalizedType === 'MOB_HIT';
}

function buildSessionTotalsFromStatus(
  status: AutoCombatStatusResponse | null,
  session: AutoCombatSessionApiViewModel | null,
): RealtimeSessionTotalsState | null {
  if (!status && !session) return null;

  const rewardsKillsTotal = status?.rewards?.mobs?.reduce((total, mob) => {
    return total + toSafeNumber(mob.kills, 0);
  }, 0);

  const rewardsLootTotal = status?.rewards?.loots?.reduce((total, loot) => {
    return total + toSafeNumber(loot.quantity, 0);
  }, 0);

  /*
   * Fonte da verdade:
   * - Para totais de sessão ativa, o backend deve mandar o valor final consolidado.
   * - Não use "maior valor" aqui, porque cache visual/realtime pode contaminar sessão nova
   *   ou manter número antigo depois de troca/stop/start.
   * - processing.* representa apenas o processamento da requisição atual em alguns endpoints,
   *   portanto não deve ser usado como total consolidado quando session/sessionSummary existem.
   */
  const totalKills =
    getFirstOptionalNumber(
      status?.sessionSummary?.mobs?.totalKills,
      session?.totalCombatsResolved,
      session?.totalKills,
      rewardsKillsTotal,
      0,
    ) ?? 0;

  const totalCombats =
    getFirstOptionalNumber(
      status?.sessionSummary?.combat?.totalCombats,
      session?.totalCombatsResolved,
      session?.totalCombats,
      totalKills,
      0,
    ) ?? 0;

  const totalRounds =
    getFirstOptionalNumber(
      status?.sessionSummary?.combat?.totalRounds,
      session?.totalRoundsResolved,
      session?.totalRounds,
      0,
    ) ?? 0;

  const totalXpGained =
    getFirstOptionalNumber(
      status?.sessionSummary?.progression?.totalXpGained,
      session?.totalXpGained,
      0,
    ) ?? 0;

  const totalLoot =
    getFirstOptionalNumber(
      status?.sessionSummary?.loot?.totalQuantity,
      session?.totalLoot,
      rewardsLootTotal,
      0,
    ) ?? 0;

  const potionsUsed =
    getFirstOptionalNumber(
      status?.sessionSummary?.potions?.used,
      session?.totalPotionsUsed,
      session?.potionsUsed,
      0,
    ) ?? 0;

  const currentCombatIndex = Math.max(
    1,
    Math.floor(
      getFirstOptionalNumber(session?.currentCombatIndex, totalKills + 1, 1) ??
        1,
    ),
  );

  return {
    sessionId: session?.id ?? null,
    currentCombatIndex,
    totalCombats: Math.max(0, Math.floor(totalCombats)),
    totalRounds: Math.max(0, Math.floor(totalRounds)),
    totalKills: Math.max(0, Math.floor(totalKills)),
    totalXpGained: Math.max(0, Math.floor(totalXpGained)),
    totalLoot: Math.max(0, Math.floor(totalLoot)),
    potionsUsed: Math.max(0, Math.floor(potionsUsed)),
    updatedAt: Date.now(),
  };
}

function buildProgressFromSource(
  source: CharacterProgressSource | null | undefined,
  sessionId?: string | null,
): RealtimeCharacterProgressState | null {
  if (!source) return null;

  const levelProgress = source.levelProgress ?? null;

  const totalXp =
    getOptionalNumber(source.totalXp) ??
    getOptionalNumber(levelProgress?.totalXp) ??
    getOptionalNumber(source.xp) ??
    getOptionalNumber(levelProgress?.xp);

  const level =
    getOptionalNumber(source.level) ?? getOptionalNumber(levelProgress?.level);

  if (totalXp === undefined && level === undefined) {
    return null;
  }

  return {
    sessionId: sessionId ?? null,

    level: level !== undefined ? Math.max(1, Math.floor(level)) : undefined,

    xp: totalXp !== undefined ? Math.max(0, Math.floor(totalXp)) : undefined,

    currentLevelXp:
      getOptionalNumber(source.currentLevelXp) ??
      getOptionalNumber(source.xpIntoCurrentLevel) ??
      getOptionalNumber(levelProgress?.currentLevelXp) ??
      getOptionalNumber(levelProgress?.xpIntoCurrentLevel),

    xpToNextLevel:
      getOptionalNumber(source.xpToNextLevel) ??
      getOptionalNumber(source.nextLevelXp) ??
      getOptionalNumber(levelProgress?.xpToNextLevel) ??
      getOptionalNumber(levelProgress?.nextLevelXp),

    nextLevelXp:
      getOptionalNumber(source.nextLevelXp) ??
      getOptionalNumber(source.xpToNextLevel) ??
      getOptionalNumber(levelProgress?.nextLevelXp) ??
      getOptionalNumber(levelProgress?.xpToNextLevel),

    xpProgressPercent:
      getOptionalNumber(source.xpProgressPercent) ??
      getOptionalNumber(levelProgress?.xpProgressPercent) ??
      getOptionalNumber(levelProgress?.progressPercent),

    xpIntoCurrentLevel:
      getOptionalNumber(source.xpIntoCurrentLevel) ??
      getOptionalNumber(source.currentLevelXp) ??
      getOptionalNumber(levelProgress?.xpIntoCurrentLevel) ??
      getOptionalNumber(levelProgress?.currentLevelXp),

    xpNeededForNextLevel:
      getOptionalNumber(source.xpNeededForNextLevel) ??
      getOptionalNumber(levelProgress?.xpNeededForNextLevel),

    currentLevelStartXp:
      getOptionalNumber(source.currentLevelStartXp) ??
      getOptionalNumber(levelProgress?.currentLevelStartXp),

    nextLevelRequiredXp:
      getOptionalNumber(source.nextLevelRequiredXp) ??
      getOptionalNumber(levelProgress?.nextLevelRequiredXp),

    isAtLevelCap:
      getOptionalBoolean(source.isAtLevelCap) ??
      getOptionalBoolean(levelProgress?.isAtLevelCap),

    updatedAt: Date.now(),
  };
}

function buildProgressFromStatus(
  status: AutoCombatStatusResponse | null,
  session: AutoCombatSessionApiViewModel | null,
): RealtimeCharacterProgressState | null {
  return buildProgressFromSource(
    status?.character as CharacterProgressSource | null | undefined,
    session?.id ?? null,
  );
}

function mergeProgressKeepingHighestXp(
  current: RealtimeCharacterProgressState | null,
  incoming: RealtimeCharacterProgressState | null,
): RealtimeCharacterProgressState | null {
  if (!incoming) return current;
  if (!current) return incoming;

  const currentXp = current.xp;
  const incomingXp = incoming.xp;

  if (
    currentXp !== undefined &&
    incomingXp !== undefined &&
    currentXp > incomingXp
  ) {
    return {
      ...incoming,
      ...current,
      sessionId: incoming.sessionId ?? current.sessionId ?? null,
      updatedAt: Date.now(),
    };
  }

  return {
    ...current,
    ...incoming,
    sessionId: incoming.sessionId ?? current.sessionId ?? null,
    level: incoming.level ?? current.level,
    xp: incoming.xp ?? current.xp,
    currentLevelXp: incoming.currentLevelXp ?? current.currentLevelXp,
    xpToNextLevel: incoming.xpToNextLevel ?? current.xpToNextLevel,
    nextLevelXp: incoming.nextLevelXp ?? current.nextLevelXp,
    xpProgressPercent:
      incoming.xpProgressPercent ?? current.xpProgressPercent,
    xpIntoCurrentLevel:
      incoming.xpIntoCurrentLevel ?? current.xpIntoCurrentLevel,
    xpNeededForNextLevel:
      incoming.xpNeededForNextLevel ?? current.xpNeededForNextLevel,
    currentLevelStartXp:
      incoming.currentLevelStartXp ?? current.currentLevelStartXp,
    nextLevelRequiredXp:
      incoming.nextLevelRequiredXp ?? current.nextLevelRequiredXp,
    isAtLevelCap: incoming.isAtLevelCap ?? current.isAtLevelCap,
    xpGained: incoming.xpGained ?? current.xpGained,
    leveledUp: incoming.leveledUp ?? current.leveledUp,
    levelsGained: incoming.levelsGained ?? current.levelsGained,
    updatedAt: Date.now(),
  };
}

function pickHighestProgress(
  ...progresses: Array<RealtimeCharacterProgressState | null>
) {
  return progresses.reduce<RealtimeCharacterProgressState | null>(
    (best, current) => mergeProgressKeepingHighestXp(best, current),
    null,
  );
}

function getRealtimeStatus(state: AutoCombatRealtimeStateLoose) {
  return state.status ?? state.autoCombatStatus ?? null;
}

function getRealtimeSession(
  state: AutoCombatRealtimeStateLoose,
  status: AutoCombatStatusResponse | null,
) {
  return state.activeSession ?? state.session ?? getSessionFromStatus(status);
}

function getRealtimeCombat(state: AutoCombatRealtimeStateLoose) {
  if (state.combat || state.realtimeCombat) {
    return state.combat ?? state.realtimeCombat ?? null;
  }

  const mob = state.mob ?? null;
  const character = state.character ?? null;
  const visual = state.visual ?? null;
  const totals =
    state.totals ?? state.sessionTotals ?? state.realtimeSessionTotals ?? null;
  const status = getRealtimeStatus(state);
  const session = state.session ?? state.activeSession ?? getSessionFromStatus(status);

  if (!mob && !character && !visual && !totals && !session) {
    return null;
  }

  return {
    sessionId: session?.id ?? totals?.sessionId ?? null,

    mobId: mob?.id ?? null,
    mobName: mob?.name ?? null,
    mobCurrentHp: mob?.currentHp ?? null,
    mobMaxHp: mob?.maxHp ?? null,
    mobHpPercent: mob?.hpPercent ?? null,

    characterCurrentHp: character?.currentHp ?? null,
    characterMaxHp: character?.maxHp ?? null,
    characterHpPercent: character?.hpPercent ?? null,

    lastMessage: visual?.lastMessage ?? null,
    message: visual?.lastMessage ?? null,
    lastDamage: visual?.lastDamage ?? null,
    lastEventType: visual?.lastEventType ?? null,
    isCritical: visual?.isCritical ?? false,
    isDodged: visual?.isDodged ?? false,

    actor: visual?.actor ?? null,
    target: visual?.target ?? null,

    round: session?.currentRound ?? null,
    combatIndex:
      session?.currentCombatIndex ?? totals?.currentCombatIndex ?? null,

    totalCombats: totals?.totalCombats ?? null,
    totalRounds: totals?.totalRounds ?? null,
    totalKills: totals?.totalKills ?? null,
    totalXpGained: totals?.totalXpGained ?? null,
    totalLoot: totals?.totalLoot ?? null,
    potionsUsed: totals?.potionsUsed ?? null,

    updatedAt:
      visual?.updatedAt ??
      mob?.updatedAt ??
      character?.updatedAt ??
      totals?.updatedAt ??
      Date.now(),
  } satisfies RealtimeCombatState;
}

function getRealtimeProgress(state: AutoCombatRealtimeStateLoose) {
  if (
    state.characterProgress ||
    state.realtimeCharacterProgress ||
    state.progress
  ) {
    return (
      state.characterProgress ??
      state.realtimeCharacterProgress ??
      state.progress ??
      null
    );
  }

  const character = state.character ?? null;
  const status = getRealtimeStatus(state);
  const session = state.session ?? state.activeSession ?? getSessionFromStatus(status);

  if (!character) {
    return null;
  }

  return {
    sessionId: session?.id ?? null,

    level:
      character.level !== null && character.level !== undefined
        ? Math.max(1, Math.floor(character.level))
        : undefined,

    xp:
      character.totalXp !== null && character.totalXp !== undefined
        ? Math.max(0, Math.floor(character.totalXp))
        : character.xp !== null && character.xp !== undefined
          ? Math.max(0, Math.floor(character.xp))
          : undefined,

    currentLevelXp:
      character.currentLevelXp ?? character.xpIntoCurrentLevel ?? undefined,
    xpToNextLevel: character.xpToNextLevel ?? character.nextLevelXp ?? undefined,
    nextLevelXp: character.nextLevelXp ?? character.xpToNextLevel ?? undefined,
    xpProgressPercent: character.xpProgressPercent ?? undefined,

    xpIntoCurrentLevel:
      character.xpIntoCurrentLevel ?? character.currentLevelXp ?? undefined,
    xpNeededForNextLevel: character.xpNeededForNextLevel ?? undefined,
    currentLevelStartXp: character.currentLevelStartXp ?? undefined,
    nextLevelRequiredXp: character.nextLevelRequiredXp ?? undefined,
    isAtLevelCap: character.isAtLevelCap ?? undefined,

    xpGained: character.xpGained ?? undefined,
    leveledUp: character.leveledUp ?? undefined,
    levelsGained: character.levelsGained ?? undefined,

    updatedAt: character.updatedAt ?? Date.now(),
  } satisfies RealtimeCharacterProgressState;
}

function getRealtimeTotals(state: AutoCombatRealtimeStateLoose) {
  return (
    state.sessionTotals ??
    state.realtimeSessionTotals ??
    state.totals ??
    null
  );
}

function getRealtimeBattleLogEvents(state: AutoCombatRealtimeStateLoose) {
  return state.battleLogEvents ?? state.eventLog ?? state.events ?? [];
}

function getRealtimeActiveEvent(state: AutoCombatRealtimeStateLoose) {
  return (
    state.activeEvent ??
    state.displayedEvent ??
    state.currentEvent ??
    state.lastProcessedEvent ??
    state.lastEvent ??
    null
  );
}

function getRealtimeQueueLength(state: AutoCombatRealtimeStateLoose) {
  return (
    state.eventQueue?.length ??
    state.realtimeEventQueue?.length ??
    state.queue?.length ??
    0
  );
}

function getPotionEventKey(payload: AutoCombatRealtimeEvent) {
  const event = payload as AutoCombatRealtimePotionEvent;

  return [
    event.sessionId ?? 'no-session',
    event.characterId ?? 'no-character',
    event.potionItemId ?? 'no-potion',
    event.potionQuantityBefore ?? 'no-before',
    event.potionQuantityAfter ?? 'no-after',
    event.potionQuantityRemaining ?? 'no-remaining',
    event.potionUsedQuantity ?? 'no-used',
    event.characterCurrentHp ?? 'no-hp',
    event.round ?? 'no-round',
    event.combatIndex ?? 'no-combat',
  ].join('|');
}

function getRealtimeActions(context: unknown): AutoCombatRealtimeActions {
  return context as AutoCombatRealtimeActions;
}

export function AutoCombatPage() {
  const { characterId } = useParams();
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
  const [selectedSubMapId, setSelectedSubMapId] = useState('');
  const [preparationPreview, setPreparationPreview] =
    useState<AutoCombatProjectionPreview | null>(null);

  const [availablePotions, setAvailablePotions] = useState<
    PotionInventoryOption[]
  >([]);
  const [autoPotionConfig, setAutoPotionConfig] =
    useState<CharacterPotionConfigWithItem | null>(null);
  const [isPotionConfigPanelOpen, setIsPotionConfigPanelOpen] = useState(false);
  const [selectedPotionSlotIndex, setSelectedPotionSlotIndex] = useState(0);
  const [selectedPotionItemId, setSelectedPotionItemId] = useState('');
  const [potionThresholdPercent, setPotionThresholdPercent] = useState(35);
  const [isPotionEnabled, setIsPotionEnabled] = useState(true);
  const [isPotionConfigLoading, setIsPotionConfigLoading] = useState(false);
  const [potionConfigMessage, setPotionConfigMessage] = useState('');

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

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const autoPotionConfigRef =
    useRef<CharacterPotionConfigWithItem | null>(null);
  const selectedPotionItemIdRef = useRef('');
  const processedPotionEventKeysRef = useRef<Set<string>>(new Set());

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
    setPotionConfigMessage('');
    processedPotionEventKeysRef.current.clear();
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
      setIsPotionEnabled(Boolean(normalizedPotionConfig?.enabled));

      setLocalCharacterProgress((current) =>
        pickHighestProgress(current, mergedProgress),
      );

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

  const visibleCharacterProgress = useMemo(() => {
    return pickHighestProgress(
      overviewCharacterProgress,
      statusCharacterProgress,
      localCharacterProgress,
      providerProgress,
    );
  }, [
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

  const visibleSessionTotals = hasActiveSession
    ? statusSessionTotals ?? visibleRealtimeSessionTotals ?? visibleLocalSessionTotals
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

  const availableSubMaps = useMemo(() => {
    return flattenCombatSubMaps(
      maps,
      visibleCharacterProgress?.level ?? character?.level ?? 1,
    );
  }, [maps, visibleCharacterProgress?.level, character?.level]);

  const selectedSubMap = useMemo(() => {
    return availableSubMaps.find((subMap) => subMap.id === selectedSubMapId);
  }, [availableSubMaps, selectedSubMapId]);

  const selectedMap = useMemo(() => {
    if (!selectedSubMap) return null;

    return maps.find((gameMap) => {
      return gameMap.subMaps?.some((subMap) => subMap.id === selectedSubMap.id);
    });
  }, [maps, selectedSubMap]);

  const selectedSubMapThreats = useMemo(() => {
    return getActiveEncounters(selectedSubMap).sort((a, b) => {
      return (b.weight ?? 0) - (a.weight ?? 0);
    });
  }, [selectedSubMap]);

  useEffect(() => {
    let isMounted = true;

    async function loadPreview() {
      if (!characterId || !selectedSubMapId || !hasStartedHunt) {
        setPreparationPreview(null);
        return;
      }

      if (showActiveSession) {
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
  }, [characterId, selectedSubMapId, hasStartedHunt, showActiveSession]);

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

  const potionSlots = Array.from({ length: 3 }, (_, index) => {
    return index === 0 ? currentPotionConfig : null;
  });

  const latestKilledMob = showActiveSession ? getLatestKilledMob(effectiveStatus) : null;
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

  const characterHasHp = currentCharacterHp > 0;

  const characterHpPercent =
    currentCharacterMaxHp > 0
      ? (currentCharacterHp / currentCharacterMaxHp) * 100
      : 0;

  const characterHpStyle = {
    width: `${clampPercent(characterHpPercent)}%`,
  } as CSSProperties;

  const activeMobName = showActiveSession
    ? visualRealtimeCombat?.mobName ??
      effectiveStatus?.currentMob?.name ??
      mainThreat?.mob?.name ??
      latestKilledMob?.mobName ??
      'Aguardando ameaça'
    : mainThreat?.mob?.name ?? 'Aguardando ameaça';

  const rawActiveMobMaxHp = showActiveSession
    ? visualRealtimeCombat?.mobMaxHp ??
      effectiveStatus?.currentMob?.maxHp ??
      effectiveStatus?.currentMob?.hp ??
      mainThreat?.mob?.hp ??
      0
    : mainThreat?.mob?.hp ?? 0;

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
          visualRealtimeCombat.round ? ` · Rodada ${visualRealtimeCombat.round}` : ''
        }`
      : effectiveStatus?.session?.currentCombatIndex
        ? `Combate ${effectiveStatus.session.currentCombatIndex}${
            effectiveStatus.session.currentRound
              ? ` · Rodada ${effectiveStatus.session.currentRound}`
              : ''
          }`
        : mainThreat?.mob
          ? `Nv. ${mainThreat.mob.level}`
          : latestKilledMob
            ? `${latestKilledMob.kills} abate(s)`
            : '—'
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
    availableSubMaps.length > 0 && !showActiveSession && characterHasHp;

  const canStartCombat =
    Boolean(selectedSubMap) &&
    hasStartedHunt &&
    !showActiveSession &&
    !isActionLoading &&
    characterHasHp;

  const latestDamageAmount =
    visualRealtimeCombat?.lastDamage && visualRealtimeCombat.lastDamage > 0
      ? visualRealtimeCombat.lastDamage
      : 0;

  const canShowFloatingDamage =
    showActiveSession &&
    isDamageRealtimeEvent(visualRealtimeCombat?.lastEventType) &&
    !visualRealtimeCombat?.isDodged &&
    latestDamageAmount > 0;

  const shouldShowPlayerDamage =
    canShowFloatingDamage && visualRealtimeCombat?.target === 'PLAYER';

  const shouldShowMobDamage =
    canShowFloatingDamage && visualRealtimeCombat?.target === 'MOB';

  const shouldShowPlayerDodge =
    showActiveSession &&
    visualRealtimeCombat?.target === 'PLAYER' &&
    visualRealtimeCombat?.isDodged;

  const shouldShowMobDodge =
    showActiveSession &&
    visualRealtimeCombat?.target === 'MOB' &&
    visualRealtimeCombat?.isDodged;

  const playerDamageKey = shouldShowPlayerDamage
    ? `player-damage-${visualRealtimeCombat?.updatedAt ?? Date.now()}`
    : '';

  const mobDamageKey = shouldShowMobDamage
    ? `mob-damage-${visualRealtimeCombat?.updatedAt ?? Date.now()}`
    : '';

  const playerFighterClassName = [
    'auto-combat-fighter-card',
    'auto-combat-fighter-card--player',
    shouldShowPlayerDamage ? 'is-hit' : '',
    shouldShowPlayerDamage && visualRealtimeCombat?.isCritical
      ? 'is-critical-hit'
      : '',
    shouldShowPlayerDodge ? 'is-dodging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const mobFighterClassName = [
    'auto-combat-fighter-card',
    'auto-combat-fighter-card--mob',
    shouldShowMobDamage ? 'is-hit' : '',
    shouldShowMobDamage && visualRealtimeCombat?.isCritical
      ? 'is-critical-hit'
      : '',
    shouldShowMobDodge ? 'is-dodging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const configuredPotionQuantity = getPotionQuantity(
    currentPotionConfig,
    availablePotions,
  );

  function handleStartHunt() {
    if (!characterHasHp) {
      setErrorMessage(
        'Este personagem está sem HP. Use a enfermaria ou uma cura antes de iniciar uma nova caça.',
      );
      return;
    }

    if (!canStartHunt) {
      setErrorMessage(
        'Nenhum submapa com encontros ativos foi encontrado para o nível atual.',
      );
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
    setSelectedPotionSlotIndex(slotIndex);
    setPotionConfigMessage('');

    if (slotIndex > 0) {
      setPotionConfigMessage(
        'No backend atual existe 1 configuração de poção automática por personagem. Este slot reserva já abre a mesma configuração principal.',
      );
    }

    setSelectedPotionItemId(currentPotionConfig?.potionItemId ?? '');
    setPotionThresholdPercent(
      clampNumber(currentPotionConfig?.hpThresholdPercent ?? 35, 1, 100),
    );
    setIsPotionEnabled(Boolean(currentPotionConfig?.enabled));
    setIsPotionConfigPanelOpen(true);
  }
  async function handleSavePotionConfig() {
    if (!characterId || isPotionConfigLoading) return;

    const safeThreshold = Math.floor(
      clampNumber(potionThresholdPercent, 1, 100),
    );

    const shouldEnable = Boolean(isPotionEnabled && selectedPotionItemId);

    if (isPotionEnabled && !selectedPotionItemId) {
      setPotionConfigMessage(
        'Selecione uma poção antes de ativar o uso automático.',
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
        useInManualCombat: true,
        useInAutoCombat: true,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setSelectedPotionItemId(normalized?.potionItemId ?? selectedPotionItemId);
      setPotionThresholdPercent(
        clampNumber(normalized?.hpThresholdPercent ?? safeThreshold, 1, 100),
      );
      setIsPotionEnabled(Boolean(normalized?.enabled));
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

  async function handleDisablePotionConfig() {
    if (!characterId || isPotionConfigLoading) return;

    try {
      setIsPotionConfigLoading(true);
      setPotionConfigMessage('');

      const response = await updateCharacterPotionConfigRaw(characterId, {
        enabled: false,
        potionItemId:
          selectedPotionItemId || currentPotionConfig?.potionItemId || null,
        hpThresholdPercent: Math.floor(
          clampNumber(potionThresholdPercent, 1, 100),
        ),
        useInManualCombat: true,
        useInAutoCombat: true,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setIsPotionEnabled(false);
      setPotionConfigMessage('Uso automático de poção desativado.');

      await loadAutoCombatData();
    } catch (error) {
      setPotionConfigMessage(
        getApiErrorMessage(
          error,
          'Não foi possível desativar a configuração de poção.',
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
        useInManualCombat: true,
        useInAutoCombat: true,
      });

      const normalized = normalizePotionConfigResponse(response);

      setAutoPotionConfig(normalized);
      setSelectedPotionItemId('');
      setIsPotionEnabled(false);
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

  async function handleStartAutoCombat() {
    if (!characterId || !selectedSubMapId || isActionLoading) return;

    if (!characterHasHp) {
      setErrorMessage(
        'Este personagem está sem HP. Use a enfermaria ou uma cura antes de iniciar o combate.',
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
        <header className="auto-combat-app-header">
          <button
            type="button"
            className="auto-combat-back-button"
            onClick={() => window.history.back()}
          >
            ‹ Voltar
          </button>

          <strong>Combate</strong>

          <span />
        </header>

        {errorMessage ? (
          <div className="auto-combat-alert" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <section className="auto-combat-app-shell">
          <div className="auto-combat-section-title">
            <span>Combate Automático</span>
          </div>

          <div className="auto-combat-tabs" role="tablist">
            <button
              type="button"
              className={activeTab === 'battle' ? 'is-active' : ''}
              onClick={() => setActiveTab('battle')}
            >
              Combate
            </button>

            <button
              type="button"
              className={activeTab === 'stats' ? 'is-active' : ''}
              onClick={() => setActiveTab('stats')}
            >
              Status
            </button>
          </div>

          {activeTab === 'battle' ? (
            <div className="auto-combat-tab-panel">
              {!hasStartedHunt && !showActiveSession ? (
                <article className="auto-combat-stage-card auto-combat-map-stage">
                  <div className="auto-combat-map-preview">
                    <div className="auto-combat-map-preview__visual">
                      <span>Zona atual</span>

                      <strong>
                        {selectedMap?.name ??
                          selectedSubMap?.map?.name ??
                          selectedSubMap?.mapName ??
                          layoutCharacter.currentMapName}
                      </strong>

                      {selectedSubMap?.name ? (
                        <small>{selectedSubMap.name}</small>
                      ) : null}
                    </div>

                    <div className="auto-combat-map-preview__content">
                      <span>Preparação da incursão</span>

                      <strong>
                        {selectedMap?.name ??
                          selectedSubMap?.map?.name ??
                          selectedSubMap?.mapName ??
                          layoutCharacter.currentMapName}
                      </strong>

                      <p>
                        {selectedMap?.description ??
                          selectedSubMap?.description ??
                          'Escolha um submapa disponível e inicie a caça para revelar os infectados próximos.'}
                      </p>

                      <label className="auto-combat-field auto-combat-field--submap">
                        <span>Submapa</span>

                        <div className="auto-combat-select-shell">
                          <select
                            value={selectedSubMapId}
                            onChange={(event) =>
                              setSelectedSubMapId(event.target.value)
                            }
                            disabled={isActionLoading}
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

                      <div className="auto-combat-map-meta">
                        <div>
                          <span>Mapa</span>
                          <strong>
                            {selectedMap?.name ??
                              selectedSubMap?.map?.name ??
                              selectedSubMap?.mapName ??
                              layoutCharacter.currentMapName}
                          </strong>
                        </div>

                        <div>
                          <span>Tier</span>
                          <strong>{selectedSubMap?.tier ?? '—'}</strong>
                        </div>

                        <div>
                          <span>Nível</span>
                          <strong>
                            {selectedSubMap?.minLevel && selectedSubMap.maxLevel
                              ? `${selectedSubMap.minLevel}-${selectedSubMap.maxLevel}`
                              : '—'}
                          </strong>
                        </div>
                      </div>

                      <div className="auto-combat-stage-actions">
                        <button
                          type="button"
                          className="auto-combat-primary-button"
                          disabled={!canStartHunt || isActionLoading}
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
                        const chance = getThreatWeightPercent(
                          encounter,
                          selectedSubMapThreats,
                        );

                        return (
                          <article
                            key={encounter.id}
                            className="auto-combat-enemy-card"
                          >
                            <div className="auto-combat-enemy-card__level">
                              Nv. {mob?.level ?? '—'}
                            </div>

                            <div className="auto-combat-enemy-card__xp">
                              XP {mob?.xpReward ?? '—'}
                            </div>

                            <div className="auto-combat-enemy-card__portrait">
                              ☣
                            </div>

                            <div className="auto-combat-enemy-card__content">
                              <span>Ameaça próxima</span>

                              <strong>{mob?.name ?? 'Infectado'}</strong>

                              <div className="auto-combat-enemy-card__hp">
                                <div className="auto-combat-enemy-card__hp-header">
                                  <span>HP</span>
                                  <strong>{mob?.hp ?? '—'}</strong>
                                </div>

                                <i className="auto-combat-enemy-card__hp-track">
                                  <b
                                    style={{
                                      width: mob?.hp ? '100%' : '0%',
                                    }}
                                  />
                                </i>
                              </div>

                              <div className="auto-combat-enemy-card__stats">
                                <span>ATQ {mob?.attack ?? '—'}</span>
                                <span>DEF {mob?.defense ?? '—'}</span>
                                <span>VEL {mob?.speed ?? '—'}</span>
                                <span>Chance {chance}%</span>
                              </div>
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
                        Este submapa não possui encontros ativos no momento.
                      </p>
                    </div>
                  )}

                  <div className="auto-combat-preview-grid">
                    <div>
                      <span>Risco</span>
                      <strong>
                        {isPreviewLoading
                          ? 'Calculando...'
                          : formatRiskLabel(preparationPreview?.risk?.level)}
                      </strong>
                    </div>

                    <div>
                      <span>XP/min</span>
                      <strong>
                        {isPreviewLoading
                          ? '...'
                          : preparationPreview?.xpPerMinute ?? '—'}
                      </strong>
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
                <div className="auto-combat-session-stage">
                  <article className="auto-combat-arena-card">
                    <div className="auto-combat-arena-card__top">
                      <span>{sessionStatusText}</span>

                      <strong>{formatSeconds(remainingSeconds)}</strong>
                    </div>

                    <div className="auto-combat-duel-row">
                      <div className={playerFighterClassName}>
                        {shouldShowPlayerDamage ? (
                          <span
                            key={playerDamageKey}
                            className={[
                              'auto-combat-floating-damage',
                              visualRealtimeCombat?.isCritical
                                ? 'is-critical'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            -{latestDamageAmount} HP
                          </span>
                        ) : null}

                        <span>Sobrevivente</span>

                        <strong>{layoutCharacter.name}</strong>

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

                      <div className={mobFighterClassName}>
                        {shouldShowMobDamage ? (
                          <span
                            key={mobDamageKey}
                            className={[
                              'auto-combat-floating-damage',
                              visualRealtimeCombat?.isCritical
                                ? 'is-critical'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            -{latestDamageAmount} HP
                          </span>
                        ) : null}

                        <span>Ameaça atual</span>

                        <strong>{activeMobName}</strong>

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

                  <AutoCombatBattleLog
                    events={battleLogEvents}
                    activeEvent={activeBattleLogEvent}
                    isActive={showActiveSession}
                    maxItems={20}
                  />

                  <div className="auto-combat-consumables">
                    {potionSlots.map((potionConfig, index) => {
                      const potionItem = getPotionItem(potionConfig);
                      const potionQuantity =
                        index === 0 ? configuredPotionQuantity : 0;

                      return (
                        <button
                          key={potionConfig?.id ?? `empty-potion-${index}`}
                          type="button"
                          className={[
                            'auto-combat-consumable-slot',
                            potionConfig?.enabled ? 'is-enabled' : 'is-empty',
                            index === selectedPotionSlotIndex &&
                            isPotionConfigPanelOpen
                              ? 'is-selected'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => handleOpenPotionConfig(index)}
                        >
                          <div className="auto-combat-consumable-slot__icon">
                            ✚
                          </div>

                          <div>
                            <strong>
                              {index === 0
                                ? getPotionName(potionConfig)
                                : 'Slot reserva'}
                            </strong>

                            <span>
                              {index === 0
                                ? getPotionDescription(potionConfig)
                                : 'Clique para configurar. O backend atual usa 1 poção automática.'}
                            </span>

                            <small className="auto-combat-consumable-slot__meta">
                              {potionItem
                                ? `${formatPotionHeal(potionItem)} · Qtd. ${potionQuantity}`
                                : 'Defina poção e gatilho de HP'}
                            </small>
                          </div>

                          <em className="auto-combat-consumable-slot__action">
                            Configurar
                          </em>
                        </button>
                      );
                    })}
                  </div>

                  {isPotionConfigPanelOpen ? (
                    <article className="auto-combat-potion-config-panel">
                      <div className="auto-combat-potion-config-panel__header">
                        <div>
                          <span>Poção automática</span>
                          <strong>
                            {selectedPotionSlotIndex === 0
                              ? 'Configurar slot principal'
                              : `Configurar slot reserva ${
                                  selectedPotionSlotIndex + 1
                                }`}
                          </strong>
                        </div>

                        <button
                          type="button"
                          className="auto-combat-potion-config-panel__close"
                          onClick={() => setIsPotionConfigPanelOpen(false)}
                        >
                          Fechar
                        </button>
                      </div>

                      <div className="auto-combat-potion-config-grid">
                        <label className="auto-combat-field">
                          <span>Poção</span>

                          <div className="auto-combat-select-shell">
                            <select
                              value={selectedPotionItemId}
                              disabled={isPotionConfigLoading}
                              onChange={(event) =>
                                setSelectedPotionItemId(event.target.value)
                              }
                            >
                              <option value="">Nenhuma poção selecionada</option>

                              {potionOptions.map((potion) => (
                                <option key={potion.itemId} value={potion.itemId}>
                                  {potion.name} · Qtd. {potion.quantity} ·{' '}
                                  {formatPotionHeal(potion)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </label>

                        <label className="auto-combat-potion-toggle">
                          <input
                            type="checkbox"
                            checked={isPotionEnabled}
                            disabled={isPotionConfigLoading}
                            onChange={(event) =>
                              setIsPotionEnabled(event.target.checked)
                            }
                          />

                          <span>Ativar uso automático no auto-combate</span>
                        </label>

                        <div className="auto-combat-potion-threshold">
                          <div>
                            <span>Gatilho de HP</span>
                            <strong>{potionThresholdPercent}% ou menos</strong>
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
                      </div>

                      {potionOptions.length <= 0 ? (
                        <p className="auto-combat-potion-config-warning">
                          Nenhuma poção de cura foi encontrada no inventário
                          deste personagem.
                        </p>
                      ) : null}

                      {potionConfigMessage ? (
                        <p className="auto-combat-potion-config-message">
                          {potionConfigMessage}
                        </p>
                      ) : null}

                      <div className="auto-combat-potion-config-actions">
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
                          className="auto-combat-secondary-button"
                          disabled={isPotionConfigLoading}
                          onClick={handleDisablePotionConfig}
                        >
                          Desativar
                        </button>

                        <button
                          type="button"
                          className="auto-combat-secondary-button auto-combat-secondary-button--danger"
                          disabled={isPotionConfigLoading}
                          onClick={handleClearPotionConfig}
                        >
                          Remover poção
                        </button>
                      </div>
                    </article>
                  ) : null}

                  <article className="auto-combat-session-panel">
                    <div className="auto-combat-session-panel__header">
                      <span>Estatísticas da sessão</span>
                      <strong>{formatSessionStatus(effectiveSession?.status)}</strong>
                    </div>

                    <div className="auto-combat-session-summary">
                      <div>
                        <span>Combate atual</span>
                        <strong>{currentCombatIndex}</strong>
                        <small>{totalCombats} luta(s) resolvida(s)</small>
                      </div>

                      <div>
                        <span>Abates</span>
                        <strong>{totalKills}</strong>
                        <small>infectados derrotados</small>
                      </div>

                      <div>
                        <span>XP ganho</span>
                        <strong>{totalXpGained}</strong>
                        <small>progressão obtida</small>
                      </div>

                      <div>
                        <span>Loot</span>
                        <strong>{totalLoot}</strong>
                        <small>itens coletados</small>
                      </div>

                      <div>
                        <span>Poções</span>
                        <strong>{potionsUsed}</strong>
                        <small>usadas automaticamente</small>
                      </div>
                    </div>
                  </article>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="auto-combat-tab-panel auto-combat-tab-panel--stats">
              <div className="auto-combat-character-stats-panel character-stats-panel character-stats-panel--primary-only">
                <section className="character-stats-group character-stats-group--primary">
                  <header className="character-stats-group__header">
                    <span>Base do personagem</span>
                    <h3>Atributos primários</h3>
                  </header>

                  <div className="character-stats-grid character-stats-grid--primary">
                    {STAT_CARDS.map((stat) => {
                      const value = totalStats[stat.key] ?? 0;

                      return (
                        <article
                          key={stat.key}
                          className={`character-stat-card character-stat-card--${stat.className}`}
                        >
                          <div className="character-stat-card__icon">
                            <img src={stat.icon} alt="" aria-hidden="true" />
                          </div>

                          <div className="character-stat-card__content">
                            <strong>{stat.label}</strong>
                            <p>{stat.description}</p>
                          </div>

                          <div className="character-stat-card__value">
                            {value}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
