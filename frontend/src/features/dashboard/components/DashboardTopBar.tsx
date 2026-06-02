import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import {
  connectWorldBossSocket,
  type WorldBossSocket,
} from '../../../services/websocket/socketClient';
import { getMobPortraitImage } from '../../auto-combat/utils/mobAssets';
import { useAutoCombatRealtime } from '../../auto-combat/realtime/useAutoCombatRealtime';
import { useCraftingRealtime } from '../../crafting/realtime/useCraftingRealtime';
import { useGatheringRealtime } from '../../gathering/realtime/useGatheringRealtime';
import type { IncursionsRealtimeState } from '../../incursions/realtime/IncursionsRealtimeProvider';
import { useIncursionsRealtime } from '../../incursions/realtime/useIncursionsRealtime';
import type { GatheringMaterialViewModel } from '../../gathering/types/gathering.types';
import {
  getWorldBossStatus,
  leaveWorldBoss,
} from '../../world-bosses/api/world-bosses.api';
import type { WorldBossStatusResponse } from '../../world-bosses/types/world-bosses.types';
import '../styles/dashboard-topbar.css';

type DashboardTopBarResourceTone = 'default' | 'gold' | 'cash';

export interface DashboardTopBarResource {
  key: string;
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: DashboardTopBarResourceTone;
  title?: string;
}

export type DashboardTopBarActivityKind =
  | 'idle'
  | 'gathering'
  | 'auto-combat'
  | 'crafting'
  | 'incursion'
  | 'world-boss';

export interface DashboardTopBarActivityOverride {
  kind: DashboardTopBarActivityKind;
  title: string;
  subtitle: string;
  icon?: ReactNode;
  imageUrl?: string | null;
  progressPercent?: number | null;
  badge?: string | null;
  titleText?: string;
  isResting?: boolean;
}

interface DashboardTopBarProps {
  characterId?: string | null;
  characterName?: string | null;
  characterClassName?: string | null;
  characterLevel?: number | null;
  characterCurrentHp?: number | null;
  characterMaxHp?: number | null;

  resources?: DashboardTopBarResource[];

  isSidebarCollapsed?: boolean;
  className?: string;
  activityOverride?: DashboardTopBarActivityOverride | null;

  onRefresh?: () => void | Promise<void>;
}

type LooseRecord = Record<string, unknown>;

type DashboardTopBarActivityViewModel = DashboardTopBarActivityOverride;

const WORLD_BOSS_TOPBAR_REFRESH_MS = 3000;
const WORLD_BOSS_ENTRY_WINDOW_SECONDS = 5 * 60;
const WORLD_BOSS_ACTIVE_STATUSES = new Set([
  'SCHEDULED',
  'LOBBY_OPEN',
  'ACTIVE',
]);

const worldBossStatusCache = new Map<string, WorldBossStatusResponse | null>();

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function getNumber(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return null;

  return parsed;
}

function getRecordField(record: unknown, key: string): LooseRecord | null {
  if (!isRecord(record)) return null;

  const value = record[key];

  return isRecord(value) ? value : null;
}

function getStringField(record: unknown, key: string): string | null {
  if (!isRecord(record)) return null;

  return getString(record[key]);
}

function getNumberField(record: unknown, key: string): number | null {
  if (!isRecord(record)) return null;

  return getNumber(record[key]);
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function isTerminalStatus(value: unknown): boolean {
  const status = normalizeStatus(value);

  return [
    'STOPPED',
    'FINISHED',
    'COMPLETED',
    'DEFEATED',
    'EXPIRED',
    'CLAIMED',
    'CANCELLED',
    'CANCELED',
  ].includes(status);
}

function clampPercent(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.min(100, parsed));
}

function calculateHpPercent(
  currentHp?: number | null,
  maxHp?: number | null,
): number {
  const safeCurrentHp = Number(currentHp);
  const safeMaxHp = Number(maxHp);

  if (!Number.isFinite(safeMaxHp) || safeMaxHp <= 0) {
    return 0;
  }

  const normalizedCurrentHp = Number.isFinite(safeCurrentHp)
    ? safeCurrentHp
    : 0;

  return Math.max(
    0,
    Math.min(100, (normalizedCurrentHp / safeMaxHp) * 100),
  );
}

function formatNumber(value?: number | null): string {
  const safeValue = Number(value ?? 0);

  if (!Number.isFinite(safeValue)) return '0';

  return Math.floor(safeValue).toLocaleString('pt-BR');
}

function formatCompactDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  return `${remainingSeconds}s`;
}

function formatWorldBossDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '0s';

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(
      remainingSeconds,
    ).padStart(2, '0')}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
  }

  return `${remainingSeconds}s`;
}

function getWorldBossSecondsUntil(
  value?: string | Date | null,
  nowMs = Date.now(),
): number {
  if (!value) return 0;

  const targetMs = new Date(value).getTime();

  if (!Number.isFinite(targetMs)) return 0;

  return Math.max(0, Math.floor((targetMs - nowMs) / 1000));
}

function getWorldBossEntryWindowEndMs(
  event: WorldBossStatusResponse['event'],
): number {
  if (!event) return 0;

  const apiValueMs = event.entryWindowEndsAt
    ? new Date(event.entryWindowEndsAt).getTime()
    : Number.NaN;

  if (Number.isFinite(apiValueMs)) return apiValueMs;

  return (
    new Date(event.startsAt).getTime() + WORLD_BOSS_ENTRY_WINDOW_SECONDS * 1000
  );
}

function isActiveWorldBossStatus(
  status?: WorldBossStatusResponse | null,
): boolean {
  return Boolean(
    status?.participant &&
      status.event &&
      WORLD_BOSS_ACTIVE_STATUSES.has(status.event.status),
  );
}

function buildWorldBossActivity(
  status: WorldBossStatusResponse | null,
  nowMs: number,
): DashboardTopBarActivityViewModel | null {
  const event = status?.event;
  const participant = status?.participant;

  if (!event || !participant || !WORLD_BOSS_ACTIVE_STATUSES.has(event.status)) {
    return null;
  }

  const bossName = event.worldBoss.name;
  const participantCount = event.lobbyCount ?? event.participantCount ?? 0;

  if (event.status === 'SCHEDULED') {
    const seconds = getWorldBossSecondsUntil(event.startsAt, nowMs);
    const timerText = formatWorldBossDuration(seconds);

    return {
      kind: 'world-boss',
      title: bossName,
      subtitle: `No lobby - aparece em ${timerText}`,
      icon: 'WB',
      badge: participantCount > 0 ? formatNumber(participantCount) : null,
      titleText: `${bossName} - no lobby, aparece em ${timerText}`,
    };
  }

  if (event.status === 'LOBBY_OPEN') {
    const seconds = Math.max(
      0,
      Math.floor((getWorldBossEntryWindowEndMs(event) - nowMs) / 1000),
    );
    const timerText = seconds ? formatWorldBossDuration(seconds) : 'iniciando';

    return {
      kind: 'world-boss',
      title: bossName,
      subtitle: `No lobby - comeca em ${timerText}`,
      icon: 'WB',
      badge: participantCount > 0 ? formatNumber(participantCount) : null,
      titleText: `${bossName} - no lobby, comeca em ${timerText}`,
    };
  }

  const hpPercent = clampPercent(event.hpPercent);

  return {
    kind: 'world-boss',
    title: bossName,
    subtitle: `Em andamento - ${formatNumber(event.currentHp)} HP`,
    icon: 'WB',
    progressPercent: hpPercent,
    badge: `${Math.floor(hpPercent)}%`,
    titleText: `${bossName} - em andamento, ${formatNumber(
      event.currentHp,
    )} de ${formatNumber(event.maxHp)} HP`,
  };
}

function getMaterialInitials(materialName?: string | null): string {
  const safeName = materialName?.trim();

  if (!safeName) return '?';

  const words = safeName.split(/\s+/).filter(Boolean);

  if (words.length <= 0) return '?';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function getMaterialIconUrl(
  material?: GatheringMaterialViewModel | null,
): string | null {
  if (!material) return null;

  const materialWithOptionalIcon = material as GatheringMaterialViewModel & {
    icon?: unknown;
    iconUrl?: unknown;
    iconPath?: unknown;
    imageUrl?: unknown;
  };

  const possibleIcon =
    materialWithOptionalIcon.iconUrl ??
    materialWithOptionalIcon.imageUrl ??
    materialWithOptionalIcon.iconPath ??
    materialWithOptionalIcon.icon;

  if (typeof possibleIcon !== 'string') {
    return null;
  }

  const trimmedIcon = possibleIcon.trim();

  return trimmedIcon.length > 0 ? trimmedIcon : null;
}


function getAutoCombatMobRecord(autoCombatState: unknown): LooseRecord | null {
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');
  const statusSession = getRecordField(status, 'session');
  const activeSession = getRecordField(status, 'activeSession');
  const autoCombatSession = getRecordField(status, 'autoCombatSession');

  return (
    getRecordField(autoCombatState, 'mob') ??
    getRecordField(autoCombatState, 'currentMob') ??
    getRecordField(status, 'currentMob') ??
    getRecordField(statusSession, 'currentMob') ??
    getRecordField(activeSession, 'currentMob') ??
    getRecordField(autoCombatSession, 'currentMob') ??
    getRecordField(status, 'mob') ??
    getRecordField(session, 'currentMob') ??
    getRecordField(session, 'mob') ??
    getRecordField(status, 'lastKnownMob')
  );
}

function getAutoCombatCurrentHpEvent(autoCombatState: unknown): LooseRecord | null {
  const activeEvent = getRecordField(autoCombatState, 'activeEvent');
  const displayedEvent = getRecordField(autoCombatState, 'displayedEvent');
  const displayedAutoCombatEvent = getRecordField(
    autoCombatState,
    'displayedAutoCombatEvent',
  );
  const currentEvent = getRecordField(autoCombatState, 'currentEvent');
  const lastProcessedEvent = getRecordField(autoCombatState, 'lastProcessedEvent');
  const lastEvent = getRecordField(autoCombatState, 'lastEvent');

  return (
    activeEvent ??
    displayedEvent ??
    displayedAutoCombatEvent ??
    currentEvent ??
    lastProcessedEvent ??
    lastEvent
  );
}

function autoCombatEventMatchesMob(
  event: LooseRecord | null,
  mob: LooseRecord | null,
): boolean {
  if (!event || !mob) return false;

  const eventMobId = getStringField(event, 'mobId');
  const mobId = getStringField(mob, 'id');

  if (eventMobId && mobId) {
    return eventMobId === mobId;
  }

  const eventMobName = getStringField(event, 'mobName')?.trim().toLowerCase();
  const mobName = getStringField(mob, 'name')?.trim().toLowerCase();

  return Boolean(eventMobName && mobName && eventMobName === mobName);
}

function getAutoCombatMonsterHpPercent(autoCombatState: unknown): number | null {
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');
  const statusSession = getRecordField(status, 'session');
  const activeSession = getRecordField(status, 'activeSession');
  const autoCombatSession = getRecordField(status, 'autoCombatSession');
  const mob = getAutoCombatMobRecord(autoCombatState);
  const rawEvent = getAutoCombatCurrentHpEvent(autoCombatState);
  const event = autoCombatEventMatchesMob(rawEvent, mob) ? rawEvent : null;

  const maxHp =
    getNumberField(mob, 'maxHp') ??
    getNumberField(event, 'mobMaxHp') ??
    getNumberField(session, 'currentMobMaxHp') ??
    getNumberField(statusSession, 'currentMobMaxHp') ??
    getNumberField(activeSession, 'currentMobMaxHp') ??
    getNumberField(autoCombatSession, 'currentMobMaxHp') ??
    getNumberField(mob, 'hp');

  const currentHp =
    getNumberField(mob, 'currentHp') ??
    getNumberField(event, 'mobCurrentHp') ??
    getNumberField(session, 'currentMobHp') ??
    getNumberField(statusSession, 'currentMobHp') ??
    getNumberField(activeSession, 'currentMobHp') ??
    getNumberField(autoCombatSession, 'currentMobHp') ??
    maxHp;

  if (maxHp !== null) {
    return calculateHpPercent(currentHp, maxHp);
  }

  const explicitPercent =
    getNumberField(mob, 'hpPercent') ??
    getNumberField(event, 'mobHpPercent');

  return explicitPercent !== null ? clampPercent(explicitPercent) : null;
}

function getAutoCombatMobName(autoCombatState: unknown): string | null {
  const mob = getAutoCombatMobRecord(autoCombatState);

  return (
    getStringField(mob, 'name') ??
    getStringField(mob, 'mobName') ??
    getStringField(mob, 'displayName')
  );
}

function getRecordArrayField(record: unknown, key: string): LooseRecord[] {
  if (!isRecord(record)) return [];

  const value = record[key];

  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sumNumberField(records: LooseRecord[], key: string): number | null {
  if (records.length <= 0) return null;

  const total = records.reduce((sum, record) => {
    return sum + (getNumberField(record, key) ?? 0);
  }, 0);

  return Number.isFinite(total) ? total : null;
}

function normalizeKillCount(value: number | null): number | null {
  if (value === null) return null;

  return Math.max(0, Math.floor(value));
}

function getAutoCombatKills(autoCombatState: unknown): number | null {
  const totals = getRecordField(autoCombatState, 'totals');
  const displayTotals = getRecordField(autoCombatState, 'displayTotals');
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');
  const statusSession = getRecordField(status, 'session');
  const activeSession = getRecordField(status, 'activeSession');
  const autoCombatSession = getRecordField(status, 'autoCombatSession');
  const sessionSummary = getRecordField(status, 'sessionSummary');
  const summaryMobs = getRecordField(sessionSummary, 'mobs');
  const rewards = getRecordField(status, 'rewards');
  const rewardsKills = sumNumberField(getRecordArrayField(rewards, 'mobs'), 'kills');

  return normalizeKillCount(
    getNumberField(displayTotals, 'totalKills') ??
      getNumberField(displayTotals, 'kills') ??
      getNumberField(displayTotals, 'killCount') ??
      getNumberField(displayTotals, 'mobsDefeated') ??
      getNumberField(totals, 'totalKills') ??
      getNumberField(totals, 'kills') ??
      getNumberField(totals, 'killCount') ??
      getNumberField(totals, 'mobsDefeated') ??
      getNumberField(session, 'totalKills') ??
      getNumberField(session, 'totalCombatsResolved') ??
      getNumberField(session, 'totalCombats') ??
      getNumberField(statusSession, 'totalKills') ??
      getNumberField(statusSession, 'totalCombatsResolved') ??
      getNumberField(activeSession, 'totalKills') ??
      getNumberField(activeSession, 'totalCombatsResolved') ??
      getNumberField(autoCombatSession, 'totalKills') ??
      getNumberField(autoCombatSession, 'totalCombatsResolved') ??
      getNumberField(summaryMobs, 'totalKills') ??
      rewardsKills ??
      getNumberField(status, 'totalKills'),
  );
}

function getLatestAutoCombatEvent(autoCombatState: unknown): LooseRecord | null {
  return (
    getRecordField(autoCombatState, 'activeEvent') ??
    getRecordField(autoCombatState, 'displayedEvent') ??
    getRecordField(autoCombatState, 'currentEvent') ??
    getRecordField(autoCombatState, 'lastProcessedEvent') ??
    getRecordField(autoCombatState, 'lastEvent') ??
    getRecordArrayField(autoCombatState, 'battleLogEvents')[0] ??
    null
  );
}

function getAutoCombatRestSnapshot(autoCombatState: unknown): {
  healedAmount: number | null;
  hpPercent: number | null;
} | null {
  const latestEvent = getLatestAutoCombatEvent(autoCombatState);
  const visual = getRecordField(autoCombatState, 'visual');

  const eventType = normalizeStatus(
    getStringField(latestEvent, 'type') ??
      getStringField(visual, 'lastEventType'),
  );

  if (eventType !== 'AUTO_REST') return null;

  const characterCurrentHp =
    getNumberField(latestEvent, 'characterCurrentHp') ??
    getNumberField(visual, 'characterCurrentHp');
  const characterMaxHp =
    getNumberField(latestEvent, 'characterMaxHp') ??
    getNumberField(visual, 'characterMaxHp');
  const explicitHpPercent =
    getNumberField(latestEvent, 'characterHpPercent') ??
    getNumberField(visual, 'characterHpPercent');
  const hpPercent =
    explicitHpPercent !== null
      ? clampPercent(explicitHpPercent)
      : characterMaxHp
        ? calculateHpPercent(characterCurrentHp, characterMaxHp)
        : null;

  return {
    healedAmount: getNumberField(latestEvent, 'healedAmount'),
    hpPercent,
  };
}

function isAutoCombatActive(autoCombatState: unknown): boolean {
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');

  const statusActive = status?.active;
  const hasActiveAutoCombat = status?.hasActiveAutoCombat;

  const sessionStatus =
    getStringField(session, 'status') ??
    getStringField(getRecordField(status, 'session'), 'status') ??
    getStringField(getRecordField(status, 'activeSession'), 'status') ??
    getStringField(getRecordField(status, 'autoCombatSession'), 'status');

  if (statusActive === true || hasActiveAutoCombat === true) {
    return true;
  }

  if (statusActive === false || hasActiveAutoCombat === false) {
    return false;
  }

  if (session && !isTerminalStatus(sessionStatus)) {
    return true;
  }

  return false;
}

function buildAutoCombatActivity(
  autoCombatState: unknown,
): DashboardTopBarActivityViewModel | null {
  if (!isAutoCombatActive(autoCombatState)) return null;

  const restSnapshot = getAutoCombatRestSnapshot(autoCombatState);

  if (restSnapshot) {
    const healedAmount =
      restSnapshot.healedAmount !== null
        ? Math.max(0, Math.floor(restSnapshot.healedAmount))
        : null;

    return {
      kind: 'auto-combat',
      title: 'Descanso automático',
      subtitle:
        healedAmount && healedAmount > 0
          ? `+${formatNumber(healedAmount)} HP recuperado`
          : 'Recuperando HP',
      icon: 'HP',
      progressPercent: restSnapshot.hpPercent,
      badge:
        healedAmount && healedAmount > 0
          ? `+${formatNumber(healedAmount)}`
          : null,
      titleText: 'Descanso automático em andamento - recuperando HP.',
      isResting: true,
    };
  }

  const mobName =
    getAutoCombatMobName(autoCombatState) ?? 'Combate automático';

  const kills = getAutoCombatKills(autoCombatState) ?? 0;
  const monsterHpPercent = getAutoCombatMonsterHpPercent(autoCombatState);
  const mobPortraitUrl = getMobPortraitImage(mobName);

  return {
    kind: 'auto-combat',
    title: mobName,
    subtitle: `${formatNumber(kills)} monstros mortos`,
    imageUrl: mobPortraitUrl,
    icon: '☠',
    progressPercent: monsterHpPercent,
    badge: formatNumber(kills),
    titleText: `Combate automático em andamento • ${formatNumber(
      kills,
    )} monstros mortos`,
  };
}

function buildGatheringActivity(
  gatheringState: ReturnType<typeof useGatheringRealtime>['state'],
): DashboardTopBarActivityViewModel | null {
  if (!gatheringState.isActive || !gatheringState.session) return null;

  const material = gatheringState.targetMaterial;
  const materialName = material?.name ?? 'Expedição ativa';
  const materialIconUrl = getMaterialIconUrl(material);

  const progressPercent = clampPercent(
    gatheringState.liveProduction?.progressPercent ?? 0,
  );

  const secondsToNextUnit =
    gatheringState.liveProduction?.secondsToNextUnit ?? null;

  const collectedQuantity = Number(gatheringState.collectedQuantity ?? 0);
  const readyQuantity = Number(gatheringState.liveProduction?.readyQuantity ?? 0);

  const badgeValue =
    Number.isFinite(collectedQuantity) && collectedQuantity > 0
      ? collectedQuantity
      : Number.isFinite(readyQuantity) && readyQuantity > 0
        ? readyQuantity
        : null;

  return {
    kind: 'gathering',
    title: materialName,
    subtitle: `+${formatNumber(collectedQuantity)} · ${formatCompactDuration(
      secondsToNextUnit,
    )}`,
    icon: materialIconUrl ? null : getMaterialInitials(materialName),
    imageUrl: materialIconUrl,
    progressPercent,
    badge: badgeValue !== null ? formatNumber(badgeValue) : null,
    titleText: 'Expedição ativa em tempo real',
  };
}

function buildCraftingActivity(
  craftingState: ReturnType<typeof useCraftingRealtime>['state'],
): DashboardTopBarActivityViewModel | null {
  if (!craftingState.isActive || !craftingState.session) return null;

  const session = craftingState.session;
  const itemName = session.outputItem.name || 'Criação ativa';
  const outputQuantity = Math.max(
    1,
    Math.floor(Number(session.outputQuantity ?? session.quantity ?? 1)),
  );
  const progressPercent = clampPercent(
    craftingState.liveSession.progressPercent ?? session.progressPercent ?? 0,
  );
  const remainingSeconds =
    craftingState.liveSession.remainingSeconds ?? session.remainingSeconds ?? 0;
  const isComplete = craftingState.liveSession.isComplete;
  const timerText = isComplete
    ? 'finalizando'
    : `pronto em ${formatCompactDuration(remainingSeconds)}`;
  const quantityText = `${formatNumber(outputQuantity)} ${
    outputQuantity === 1 ? 'item' : 'itens'
  }`;

  return {
    kind: 'crafting',
    title: itemName,
    subtitle: `${quantityText} · ${timerText}`,
    icon: getMaterialInitials(itemName),
    progressPercent: isComplete ? 100 : progressPercent,
    badge: `${Math.floor(isComplete ? 100 : progressPercent)}%`,
    titleText: `${itemName} em criação · ${quantityText} · ${timerText}`,
  };
}

function buildIncursionActivity(
  incursionsState: IncursionsRealtimeState,
): DashboardTopBarActivityViewModel | null {
  const session = incursionsState.session;

  if (
    !session ||
    session.status === 'CANCELLED' ||
    session.status === 'CLAIMED' ||
    session.status === 'FAILED'
  ) {
    return null;
  }

  const incursionName = session.incursion?.name ?? 'Incursão ativa';
  const mapName = session.incursion?.map?.name ?? 'Mapa desconhecido';
  const remainingSeconds = Number(session.remainingSeconds ?? 0);
  const progressPercent = clampPercent(session.progressPercent ?? 0);
  const isCompleted =
    session.status === 'COMPLETED' || remainingSeconds <= 0 || session.canClaim;

  return {
    kind: 'incursion',
    title: incursionName,
    subtitle: isCompleted
      ? 'Recompensa automática'
      : `${mapName} · ${formatCompactDuration(remainingSeconds)}`,
    icon: '⌬',
    progressPercent: isCompleted ? 100 : progressPercent,
    badge: isCompleted ? 'Fim' : `${Math.floor(progressPercent)}%`,
    titleText: isCompleted
      ? 'Incursão concluída, recompensas automáticas em processamento'
      : `Incursão ativa em ${mapName}`,
  };
}

function buildIdleActivity(): DashboardTopBarActivityViewModel {
  return {
    kind: 'idle',
    title: 'Ocioso',
    subtitle: 'Sem atividade',
    icon: '⌂',
    progressPercent: null,
    badge: null,
    titleText: 'Nenhuma atividade ativa',
  };
}

function isGoldResource(resource: DashboardTopBarResource): boolean {
  const key = String(resource.key ?? '').trim().toLowerCase();
  const label = String(resource.label ?? '').trim().toLowerCase();

  return key === 'gold' || label === 'gold' || resource.tone === 'gold';
}

function isCashResource(resource: DashboardTopBarResource): boolean {
  const key = String(resource.key ?? '').trim().toLowerCase();
  const label = String(resource.label ?? '').trim().toLowerCase();

  return key === 'cash' || label === 'cash' || resource.tone === 'cash';
}

function buildVisibleResources(
  resources: DashboardTopBarResource[],
): DashboardTopBarResource[] {
  const goldResource =
    resources.find(isGoldResource) ??
    ({
      key: 'gold',
      label: 'Gold',
      value: 0,
      icon: '●',
      tone: 'gold',
      title: 'Gold disponível',
    } satisfies DashboardTopBarResource);

  const cashResource =
    resources.find(isCashResource) ??
    ({
      key: 'cash',
      label: 'Cash',
      value: 0,
      icon: '◆',
      tone: 'cash',
      title: 'Cash disponível',
    } satisfies DashboardTopBarResource);

  return [
    {
      ...goldResource,
      key: 'gold',
      label: goldResource.label || 'Gold',
      tone: 'gold',
      icon: goldResource.icon ?? '●',
    },
    {
      ...cashResource,
      key: 'cash',
      label: cashResource.label || 'Cash',
      tone: 'cash',
      icon: cashResource.icon ?? '◆',
    },
  ];
}

function getResourceClassName(resource: DashboardTopBarResource): string {
  const tone = resource.tone ?? 'default';

  return ['dashboard-topbar__resource', `dashboard-topbar__resource--${tone}`]
    .filter(Boolean)
    .join(' ');
}

function getActivityStopTitle(kind: DashboardTopBarActivityKind): string {
  const titles: Record<DashboardTopBarActivityKind, string> = {
    idle: 'Nenhuma atividade ativa',
    gathering: 'Parar coleta',
    'auto-combat': 'Parar combate automÃ¡tico',
    crafting: 'Cancelar criaÃ§Ã£o',
    incursion: 'Cancelar incursÃ£o',
    'world-boss': 'Sair do World Boss',
  };

  return titles[kind] ?? 'Encerrar atividade';
}

export function DashboardTopBar({
  characterId,
  resources = [],
  isSidebarCollapsed = false,
  className,
  activityOverride,
  onRefresh,
}: DashboardTopBarProps) {
  const autoCombatRealtime = useAutoCombatRealtime();
  const gatheringRealtime = useGatheringRealtime();
  const craftingRealtime = useCraftingRealtime();
  const incursionsRealtime = useIncursionsRealtime();
  const autoCombatState = autoCombatRealtime.state;
  const gatheringState = gatheringRealtime.state;
  const craftingState = craftingRealtime.state;
  const incursionsState = incursionsRealtime.state;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isStoppingActivity, setIsStoppingActivity] = useState(false);
  const [worldBossStatus, setWorldBossStatus] =
    useState<WorldBossStatusResponse | null>(() =>
      characterId ? (worldBossStatusCache.get(characterId) ?? null) : null,
    );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!characterId) {
      const resetTimer = window.setTimeout(() => {
        setWorldBossStatus(null);
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    let isDisposed = false;
    const safeCharacterId = characterId;
    const cachedStatus = worldBossStatusCache.get(safeCharacterId) ?? null;

    const cacheTimer = window.setTimeout(() => {
      if (!isDisposed) {
        setWorldBossStatus(cachedStatus);
      }
    }, 0);

    async function loadWorldBossStatus() {
      try {
        const status = await getWorldBossStatus(safeCharacterId);

        if (isDisposed) return;

        worldBossStatusCache.set(safeCharacterId, status);
        setWorldBossStatus(status);
        setNowMs(Date.now());
      } catch {
        if (isDisposed) return;

        worldBossStatusCache.set(safeCharacterId, null);
        setWorldBossStatus(null);
      }
    }

    void loadWorldBossStatus();

    const intervalId = window.setInterval(
      () => void loadWorldBossStatus(),
      WORLD_BOSS_TOPBAR_REFRESH_MS,
    );

    return () => {
      isDisposed = true;
      window.clearTimeout(cacheTimer);
      window.clearInterval(intervalId);
    };
  }, [characterId]);

  const worldBossEventId = worldBossStatus?.event?.id ?? null;
  const worldBossId = worldBossStatus?.event?.worldBoss.id ?? null;
  const hasActiveWorldBossStatus = isActiveWorldBossStatus(worldBossStatus);

  useEffect(() => {
    const eventId = worldBossEventId;

    if (!characterId || !eventId || !hasActiveWorldBossStatus) {
      return;
    }

    const socket: WorldBossSocket = connectWorldBossSocket();
    const update = (payload: WorldBossStatusResponse) => {
      const payloadEventId = payload.event?.id ?? null;
      const payloadWorldBossId = payload.event?.worldBoss.id ?? null;

      if (payloadEventId !== eventId && payloadWorldBossId !== worldBossId) {
        return;
      }

      worldBossStatusCache.set(characterId, payload);
      setWorldBossStatus(payload);
      setNowMs(Date.now());
    };

    socket.on('worldBoss:lobbyOpened', update);
    socket.on('worldBoss:statusUpdated', update);
    socket.on('worldBoss:joinedLobby', update);
    socket.on('worldBoss:leftLobby', update);
    socket.on('worldBoss:lobbyUpdated', update);
    socket.on('worldBoss:battleStarted', update);
    socket.on('worldBoss:damage', update);
    socket.on('worldBoss:progress', update);
    socket.on('worldBoss:defeated', update);
    socket.on('worldBoss:expired', update);
    socket.on('worldBoss:rewarded', update);
    socket.on('worldBoss:left', update);

    if (!socket.connected) socket.connect();
    socket.emit('worldBoss:join', { eventId, characterId });

    return () => {
      socket.off('worldBoss:lobbyOpened', update);
      socket.off('worldBoss:statusUpdated', update);
      socket.off('worldBoss:joinedLobby', update);
      socket.off('worldBoss:leftLobby', update);
      socket.off('worldBoss:lobbyUpdated', update);
      socket.off('worldBoss:battleStarted', update);
      socket.off('worldBoss:damage', update);
      socket.off('worldBoss:progress', update);
      socket.off('worldBoss:defeated', update);
      socket.off('worldBoss:expired', update);
      socket.off('worldBoss:rewarded', update);
      socket.off('worldBoss:left', update);
    };
  }, [
    characterId,
    hasActiveWorldBossStatus,
    worldBossEventId,
    worldBossId,
  ]);

  const worldBossActivity = useMemo(() => {
    return buildWorldBossActivity(worldBossStatus, nowMs);
  }, [nowMs, worldBossStatus]);

  const activity = useMemo(() => {
    return (
      activityOverride ??
      worldBossActivity ??
      buildAutoCombatActivity(autoCombatState) ??
      buildGatheringActivity(gatheringState) ??
      buildCraftingActivity(craftingState) ??
      buildIncursionActivity(incursionsState) ??
      buildIdleActivity()
    );
  }, [
    activityOverride,
    autoCombatState,
    craftingState,
    gatheringState,
    incursionsState,
    worldBossActivity,
  ]);

  const visibleResources = useMemo(() => {
    return buildVisibleResources(resources);
  }, [resources]);

  const rootClassName = [
    'dashboard-topbar',
    `dashboard-topbar--${activity.kind}`,
    activity.isResting ? 'dashboard-topbar--auto-resting' : '',
    isSidebarCollapsed ? 'dashboard-topbar--sidebar-collapsed' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const activityCanBeStopped = (() => {
    if (activity.kind === 'idle') return false;

    if (activity.kind === 'auto-combat') {
      return Boolean(buildAutoCombatActivity(autoCombatState));
    }

    if (activity.kind === 'gathering') {
      return gatheringState.isActive;
    }

    if (activity.kind === 'crafting') {
      return craftingState.isActive;
    }

    if (activity.kind === 'incursion') {
      return incursionsState.session?.status === 'ACTIVE';
    }

    if (activity.kind === 'world-boss') {
      return Boolean(
        characterId &&
          worldBossStatus?.event?.id &&
          isActiveWorldBossStatus(worldBossStatus),
      );
    }

    return false;
  })();
  const canStopActivity = activityCanBeStopped && !isStoppingActivity;

  const stopActivityTitle = getActivityStopTitle(activity.kind);

  function handleRefresh() {
    if (!onRefresh) return;

    void onRefresh();
  }

  async function handleStopActivity(
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();

    if (!canStopActivity || !characterId) return;

    setIsStoppingActivity(true);

    try {
      if (activity.kind === 'auto-combat') {
        await autoCombatRealtime.stop();
      } else if (activity.kind === 'gathering') {
        await gatheringRealtime.stop();
      } else if (activity.kind === 'crafting') {
        await craftingRealtime.stop();
      } else if (activity.kind === 'incursion') {
        await incursionsRealtime.cancel();
      } else if (activity.kind === 'world-boss' && worldBossStatus?.event?.id) {
        const status = await leaveWorldBoss(
          characterId,
          worldBossStatus.event.id,
        );

        worldBossStatusCache.set(characterId, status);
        setWorldBossStatus(status);
        setNowMs(Date.now());
      }
    } finally {
      setIsStoppingActivity(false);
    }
  }

  return (
    <header
      className={rootClassName}
      data-character-id={characterId ?? undefined}
      aria-label="Barra superior do dashboard"
    >
      <section
        className={[
          'dashboard-topbar__activity',
          activityCanBeStopped ? 'dashboard-topbar__activity--stoppable' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Atividade atual"
        title={activity.titleText}
      >
        {activity.progressPercent !== null &&
        activity.progressPercent !== undefined ? (
          <span className="dashboard-topbar__activity-progress" aria-hidden="true">
            <span
              style={{
                width: `${clampPercent(activity.progressPercent)}%`,
              }}
            />
          </span>
        ) : null}

        <span className="dashboard-topbar__activity-icon" aria-hidden="true">
          {activity.imageUrl ? (
            <img
              src={activity.imageUrl}
              alt=""
              draggable={false}
              className="dashboard-topbar__activity-image"
            />
          ) : (
            <span>{activity.icon}</span>
          )}
        </span>

        <span className="dashboard-topbar__activity-copy">
          <strong title={activity.title}>{activity.title}</strong>
          <small>{activity.subtitle}</small>
        </span>

        <span className="dashboard-topbar__activity-status" aria-hidden="true">
          <span className="dashboard-topbar__activity-status-ring" />
          <span className="dashboard-topbar__activity-status-core" />

          {activity.badge ? (
            <span className="dashboard-topbar__activity-status-bubble">
              {activity.badge}
            </span>
          ) : null}
        </span>

        {activityCanBeStopped ? (
          <button
            type="button"
            className="dashboard-topbar__activity-stop"
            onClick={handleStopActivity}
            disabled={isStoppingActivity}
            aria-label={stopActivityTitle}
            title={stopActivityTitle}
          >
            <X size={13} strokeWidth={3} aria-hidden="true" />
          </button>
        ) : null}
      </section>

      <nav className="dashboard-topbar__resources" aria-label="Recursos rápidos">
        {visibleResources.map((resource) => (
          <span
            key={resource.key}
            className={getResourceClassName(resource)}
            title={resource.title ?? resource.label}
          >
            {resource.icon ? (
              <span className="dashboard-topbar__resource-icon">
                {resource.icon}
              </span>
            ) : null}

            <span className="dashboard-topbar__resource-value">
              {resource.value}
            </span>
          </span>
        ))}

        {onRefresh ? (
          <button
            type="button"
            className="dashboard-topbar__refresh"
            onClick={handleRefresh}
            aria-label="Atualizar painel"
            title="Atualizar painel"
          >
            ↻
          </button>
        ) : null}
      </nav>
    </header>
  );
}

export default DashboardTopBar;
