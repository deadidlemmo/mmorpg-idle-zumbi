import { apiClient } from '../../../services/api/apiClient';
import { normalizeClassName } from '../../characters/api/characters.api';
import type {
  CharacterOverviewResponse,
  DashboardStats,
} from '../../dashboard/types/dashboard.types';
import { EMPTY_STATS } from '../constants/auto-combat-stat-cards';
import type {
  AutoCombatRealtimeActions,
  AutoCombatRealtimePotionEvent,
  AutoCombatRealtimeStateLoose,
  CharacterProgressSource,
  CharacterPotionConfigWithItem,
  CharacterViewModelWithLayoutFields,
  PotionConfigApiResponse,
  PotionEquipmentItem,
  PotionInventoryOption,
  RealtimeCharacterProgressState,
  RealtimeCombatState,
  RealtimeSessionTotalsState,
  UpdatePotionConfigPayload,
} from '../types/auto-combat-page.types';
import type {
  AutoCombatEncounterViewModel,
  AutoCombatMapViewModel,
  AutoCombatRealtimeEvent,
  AutoCombatSessionApiViewModel,
  AutoCombatStatusResponse,
  AutoCombatSubMapViewModel,
} from '../types/auto-combat.types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toSafeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getFirstOptionalNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = getOptionalNumber(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export function getOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

export function clampPercent(value: unknown) {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(100, parsed));
}

export function clampNumber(value: unknown, min: number, max: number) {
  const parsed = toSafeNumber(value, min);

  return Math.max(min, Math.min(parsed, max));
}

export function formatSeconds(seconds?: number | null) {
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

export function formatSessionStatus(status?: string | null) {
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

export function formatRiskLabel(risk?: string | null) {
  const labels: Record<string, string> = {
    LOW: 'Baixo',
    MEDIUM: 'Médio',
    HIGH: 'Alto',
    LETHAL: 'Letal',
  };

  if (!risk) return '—';

  return labels[risk] ?? risk;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
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

export function normalizeStats(value: unknown): DashboardStats | null {
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

export function getStatsScore(stats: DashboardStats) {
  return (
    stats.strength +
    stats.vitality +
    stats.agility +
    stats.precision +
    stats.technique +
    stats.willpower
  );
}

export function normalizePotionInventoryEntry(
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

export function normalizePotionInventoryResponse(data: unknown) {
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

export function normalizePotionConfigResponse(
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
    autoRestEnabled:
      typeof rawConfigRecord.autoRestEnabled === 'boolean'
        ? rawConfigRecord.autoRestEnabled
        : true,
    autoRestStartHpPercent:
      clampNumber(rawConfigRecord.autoRestStartHpPercent, 1, 99) || 35,
    autoRestStopHpPercent:
      clampNumber(rawConfigRecord.autoRestStopHpPercent, 2, 100) || 70,
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

export function getPotionItem(potionConfig?: CharacterPotionConfigWithItem | null) {
  return potionConfig?.potion ?? potionConfig?.potionItem ?? null;
}

export function getPotionName(potionConfig?: CharacterPotionConfigWithItem | null) {
  return getPotionItem(potionConfig)?.name ?? 'Configurar poção';
}

export function getPotionDescription(
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

export function getPotionQuantity(
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

export function getNormalizedQuantity(value: unknown) {
  const quantity = getOptionalNumber(value);

  if (quantity === undefined) {
    return undefined;
  }

  return Math.max(0, Math.floor(quantity));
}

export function resolvePotionEventItemId(
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

export function resolvePotionQuantityAfter(
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

export function formatPotionHeal(potion?: PotionEquipmentItem | null) {
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

export async function getCharacterInventoryRaw(characterId: string) {
  const response = await apiClient.get<unknown>(`/inventory/${characterId}`);

  return response.data;
}

export async function getCharacterPotionConfigRaw(characterId: string) {
  const response = await apiClient.get<PotionConfigApiResponse>(
    `/consumables/${characterId}/config`,
  );

  return response.data;
}

export async function updateCharacterPotionConfigRaw(
  characterId: string,
  payload: UpdatePotionConfigPayload,
) {
  const response = await apiClient.patch<PotionConfigApiResponse>(
    `/consumables/${characterId}/config`,
    payload,
  );

  return response.data;
}

export function resolveCharacterStats(
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

export function buildCharacterViewModel(
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

export function getSessionFromStatus(
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

export function normalizeSessionStatus(status?: string | null) {
  return String(status ?? '').trim().toUpperCase();
}

export function isTerminalSessionStatus(status?: string | null) {
  const normalizedStatus = normalizeSessionStatus(status);

  return (
    normalizedStatus === 'STOPPED' ||
    normalizedStatus === 'FINISHED' ||
    normalizedStatus === 'DEFEATED' ||
    normalizedStatus === 'FAILED' ||
    normalizedStatus === 'CANCELLED'
  );
}

export function isSessionActive(
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

export function getActiveEncounters(subMap?: AutoCombatSubMapViewModel | null) {
  return (subMap?.encounters ?? [])
    .filter((encounter) => {
      return encounter.isActive !== false && Boolean(encounter.mob);
    })
    .sort((a, b) => {
      return (
        toSafeNumber(a.mob?.level, 0) - toSafeNumber(b.mob?.level, 0) ||
        toSafeNumber(a.mob?.tier, 0) - toSafeNumber(b.mob?.tier, 0) ||
        (a.mob?.name ?? '').localeCompare(b.mob?.name ?? '')
      );
    });
}

export function getFallbackLevelRangeFromTier(tier?: number | null) {
  const safeTier = Math.max(1, Math.floor(toSafeNumber(tier, 1)));
  const minLevel = (safeTier - 1) * 10 + 1;

  return {
    minLevel,
    maxLevel: safeTier * 10,
  };
}

type AutoCombatMapWithLevelBounds = AutoCombatMapViewModel & {
  minLevel?: number | null;
  maxLevel?: number | null;
};

export function getGameMapMinLevel(gameMap?: AutoCombatMapViewModel | null) {
  if (!gameMap) return 1;

  const looseMap = gameMap as AutoCombatMapWithLevelBounds;
  const fallback = getFallbackLevelRangeFromTier(gameMap.tier);

  return Math.max(
    1,
    Math.floor(toSafeNumber(looseMap.minLevel, fallback.minLevel)),
  );
}

export function getGameMapMaxLevel(gameMap?: AutoCombatMapViewModel | null) {
  if (!gameMap) return 100;

  const looseMap = gameMap as AutoCombatMapWithLevelBounds;
  const fallback = getFallbackLevelRangeFromTier(gameMap.tier);

  return Math.max(
    1,
    Math.floor(toSafeNumber(looseMap.maxLevel, fallback.maxLevel)),
  );
}

export function getEnrichedSubMap(
  gameMap: AutoCombatMapViewModel,
  subMap: AutoCombatSubMapViewModel,
) {
  const mapMinLevel = getGameMapMinLevel(gameMap);
  const mapMaxLevel = getGameMapMaxLevel(gameMap);

  return {
    ...subMap,
    tier: subMap.tier ?? gameMap.tier,
    minLevel: subMap.minLevel ?? mapMinLevel,
    maxLevel: subMap.maxLevel ?? mapMaxLevel,
    map: {
      id: gameMap.id,
      name: gameMap.name,
      tier: gameMap.tier,
    },
    mapName: gameMap.name,
  };
}

export function getVisibleCombatMaps(maps: AutoCombatMapViewModel[]) {
  return maps.slice().sort((a, b) => {
    return (
      (a.tier ?? 0) - (b.tier ?? 0) ||
      getGameMapMinLevel(a) - getGameMapMinLevel(b) ||
      a.name.localeCompare(b.name)
    );
  });
}

export function getSubMapsForMap(
  gameMap: AutoCombatMapViewModel | null | undefined,
  _characterLevel: number,
) {
  if (!gameMap) return [];

  return (gameMap.subMaps ?? [])
    .map((subMap) => getEnrichedSubMap(gameMap, subMap))
    .sort((a, b) => {
      return (
        (a.tier ?? 0) - (b.tier ?? 0) ||
        (a.minLevel ?? 0) - (b.minLevel ?? 0) ||
        a.name.localeCompare(b.name)
      );
    });
}

export function flattenCombatSubMaps(
  maps: AutoCombatMapViewModel[],
  characterLevel: number,
) {
  return getVisibleCombatMaps(maps).flatMap((gameMap) => {
    return getSubMapsForMap(gameMap, characterLevel);
  });
}

export function getSubMapLabel(subMap: AutoCombatSubMapViewModel) {
  return subMap.name;
}

export function getDefaultSubMapId(params: {
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

function getTimestampMs(value: unknown) {
  if (value instanceof Date) {
    const timestamp = value.getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getRemainingSeconds(
  status: AutoCombatStatusResponse | null,
  nowMs = Date.now(),
) {
  const session = getSessionFromStatus(status);
  const endsAtMs = getTimestampMs(
    session?.endsAt ?? status?.sessionSummary?.duration?.endsAt,
  );

  if (endsAtMs !== null) {
    return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
  }

  return (
    session?.remainingSeconds ??
    status?.sessionSummary?.duration?.remainingSeconds ??
    0
  );
}

export function getLatestKilledMob(status: AutoCombatStatusResponse | null) {
  const mobs = status?.rewards?.mobs ?? status?.sessionSummary?.mobs?.kills ?? [];

  if (mobs.length <= 0) return null;

  return mobs[mobs.length - 1];
}

export function getThreatWeightPercent(
  encounter: AutoCombatEncounterViewModel,
  encounters: AutoCombatEncounterViewModel[],
) {
  const totalWeight = encounters.reduce((total, currentEncounter) => {
    return total + Math.max(0, currentEncounter.weight ?? 0);
  }, 0);

  if (totalWeight <= 0) return 0;

  return Math.round(((encounter.weight ?? 0) / totalWeight) * 100);
}

export function normalizeRealtimeEventType(type?: string | null) {
  return String(type ?? '').trim().toUpperCase();
}

export function isDamageRealtimeEvent(eventType?: string | null) {
  const normalizedType = normalizeRealtimeEventType(eventType);

  return (
    normalizedType === 'PLAYER_HIT' ||
    normalizedType === 'MOB_HIT' ||
    normalizedType === 'MOB_DEFEATED' ||
    normalizedType === 'PLAYER_DEFEATED'
  );
}

export function buildSessionTotalsFromStatus(
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

  const baseXpGained =
    getFirstOptionalNumber(
      status?.sessionSummary?.progression?.baseXpGained,
      session?.baseXpGained,
      totalXpGained,
      0,
    ) ?? 0;

  const premiumBonusXp =
    getFirstOptionalNumber(
      status?.sessionSummary?.progression?.premiumBonusXp,
      session?.premiumBonusXp,
      0,
    ) ?? 0;

  const premiumPotentialBonusXp =
    getFirstOptionalNumber(
      status?.sessionSummary?.progression?.premiumPotentialBonusXp,
      session?.premiumPotentialBonusXp,
      0,
    ) ?? 0;

  const premiumTotalXp =
    getFirstOptionalNumber(
      status?.sessionSummary?.progression?.premiumTotalXp,
      session?.premiumTotalXp,
      baseXpGained + Math.max(premiumBonusXp, premiumPotentialBonusXp),
      0,
    ) ?? 0;

  const isPremiumActive = Boolean(
    status?.sessionSummary?.progression?.isPremiumActive ??
      session?.isPremiumActive ??
      false,
  );

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
    baseXpGained: Math.max(0, Math.floor(baseXpGained)),
    premiumBonusXp: Math.max(0, Math.floor(premiumBonusXp)),
    premiumPotentialBonusXp: Math.max(0, Math.floor(premiumPotentialBonusXp)),
    premiumTotalXp: Math.max(0, Math.floor(premiumTotalXp)),
    isPremiumActive,
    totalLoot: Math.max(0, Math.floor(totalLoot)),
    potionsUsed: Math.max(0, Math.floor(potionsUsed)),
    updatedAt: Date.now(),
  };
}

export function buildProgressFromSource(
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

export function buildProgressFromStatus(
  status: AutoCombatStatusResponse | null,
  session: AutoCombatSessionApiViewModel | null,
): RealtimeCharacterProgressState | null {
  return buildProgressFromSource(
    status?.character as CharacterProgressSource | null | undefined,
    session?.id ?? null,
  );
}

export function mergeProgressKeepingHighestXp(
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

export function pickHighestProgress(
  ...progresses: Array<RealtimeCharacterProgressState | null>
) {
  return progresses.reduce<RealtimeCharacterProgressState | null>(
    (best, current) => mergeProgressKeepingHighestXp(best, current),
    null,
  );
}

export function getRealtimeStatus(state: AutoCombatRealtimeStateLoose) {
  return state.status ?? state.autoCombatStatus ?? null;
}

export function getRealtimeSession(
  state: AutoCombatRealtimeStateLoose,
  status: AutoCombatStatusResponse | null,
) {
  return state.activeSession ?? state.session ?? getSessionFromStatus(status);
}

export function getRealtimeCombat(state: AutoCombatRealtimeStateLoose) {
  if (state.combat || state.realtimeCombat) {
    return state.combat ?? state.realtimeCombat ?? null;
  }

  const mob = state.mob ?? null;
  const character = state.character ?? null;
  const visual = state.visual ?? null;
  const totals =
    state.displayTotals ??
    state.sessionTotals ??
    state.realtimeSessionTotals ??
    state.totals ??
    null;
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
    baseXpGained: totals?.baseXpGained ?? null,
    premiumBonusXp: totals?.premiumBonusXp ?? null,
    premiumPotentialBonusXp: totals?.premiumPotentialBonusXp ?? null,
    premiumTotalXp: totals?.premiumTotalXp ?? null,
    isPremiumActive: totals?.isPremiumActive ?? null,
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

export function getRealtimeProgress(state: AutoCombatRealtimeStateLoose) {
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

export function getRealtimeTotals(state: AutoCombatRealtimeStateLoose) {
  return (
    state.displayTotals ??
    state.sessionTotals ??
    state.realtimeSessionTotals ??
    state.totals ??
    null
  );
}

export function buildZeroRealtimeSessionTotals(
  session?: AutoCombatSessionApiViewModel | null,
): RealtimeSessionTotalsState {
  return {
    sessionId: session?.id ?? null,
    currentCombatIndex: Math.max(
      1,
      Math.floor(toSafeNumber(session?.currentCombatIndex, 1)),
    ),
    totalCombats: 0,
    totalRounds: 0,
    totalKills: 0,
    totalXpGained: 0,
    baseXpGained: 0,
    premiumBonusXp: 0,
    premiumPotentialBonusXp: 0,
    premiumTotalXp: 0,
    isPremiumActive: Boolean(session?.isPremiumActive ?? false),
    totalLoot: 0,
    potionsUsed: 0,
  };
}

export function getRealtimeBattleLogEvents(state: AutoCombatRealtimeStateLoose) {
  return state.battleLogEvents ?? state.eventLog ?? state.events ?? [];
}

export function getRealtimeActiveEvent(state: AutoCombatRealtimeStateLoose) {
  return (
    state.activeEvent ??
    state.displayedEvent ??
    state.currentEvent ??
    state.lastProcessedEvent ??
    state.lastEvent ??
    null
  );
}

export function getRealtimeQueueLength(state: AutoCombatRealtimeStateLoose) {
  return (
    state.eventQueue?.length ??
    state.realtimeEventQueue?.length ??
    state.queue?.length ??
    0
  );
}

export function getPotionEventKey(payload: AutoCombatRealtimeEvent) {
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

export function getRealtimeActions(context: unknown): AutoCombatRealtimeActions {
  return context as AutoCombatRealtimeActions;
}
