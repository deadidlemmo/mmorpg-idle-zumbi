import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useLootNotifications } from '../../loot-notifications/lootNotificationContext';
import {
  collectGatheringRequest,
  extractGatheringApiError,
  getGatheringStatusRequest,
  startGatheringRequest,
  stopGatheringRequest,
} from '../api/gathering.api';
import type {
  GatheringAllowedOrigin,
  GatheringCollectedViewModel,
  GatheringInventoryItemViewModel,
  GatheringMaterialViewModel,
  GatheringProductionPreviewViewModel,
  GatheringSessionViewModel,
  GatheringSkillViewModel,
  GatheringStatusResponse,
} from '../types/gathering.types';
import { getGatheringMaterialImageUrl } from '../utils/gatheringMaterialAssets';

interface GatheringRealtimeProviderProps {
  characterId: string;
  children: ReactNode;
  autoLoad?: boolean;
  enabled?: boolean;

  /**
   * Fallback por API quando o WebSocket estiver desconectado.
   * Com socket conectado, o provider usa eventos em tempo real.
   */
  refreshMs?: number;

  /**
   * Tick local para suavizar a barra entre eventos do servidor.
   */
  tickMs?: number;
}

export interface GatheringRealtimeStartPayload {
  mapId: string;
  origin: GatheringAllowedOrigin;
  targetMaterialId: string;
}

export interface GatheringRealtimeLiveProduction {
  readyQuantity: number;
  progressPercent: number;
  secondsToNextUnit: number | null;
  ratePerHour: number | null;
  timePerUnitSeconds: number | null;
}

export interface GatheringRealtimeState {
  characterId: string;

  status: GatheringStatusResponse | null;
  session: GatheringSessionViewModel | null;
  productionPreview: GatheringProductionPreviewViewModel | null;
  gatheringSkill: GatheringSkillViewModel | null;
  targetMaterial: GatheringMaterialViewModel | null;

  collectedQuantity: number;
  collectedXp: number;

  isActive: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isBusy: boolean;

  errorMessage: string | null;
  lastUpdatedAt: number | null;
  nowMs: number;

  liveProduction: GatheringRealtimeLiveProduction;
}

export interface GatheringRealtimeContextValue {
  state: GatheringRealtimeState;

  refresh: () => Promise<GatheringStatusResponse | null>;
  start: (
    payload: GatheringRealtimeStartPayload,
  ) => Promise<GatheringStatusResponse | null>;
  collect: () => Promise<unknown>;
  stop: () => Promise<unknown>;

  clearError: () => void;
}

type LooseRecord = Record<string, unknown>;

type GatheringStatusLoose = GatheringStatusResponse & {
  active?: boolean | null;
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
  autoCollected?: GatheringCollectedViewModel | null;
  inventoryItem?: GatheringInventoryItemViewModel | null;
};

type GatheringSessionLoose = GatheringSessionViewModel & {
  status?: string | null;
  lastResolvedAt?: string | null;
  progressRemainder?: number | null;
  collectedQuantity?: number | null;
  collectedXp?: number | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
};

type GatheringProductionPreviewLoose = GatheringProductionPreviewViewModel & {
  elapsedSeconds?: number | null;

  ratePerHour?: number | null;
  baseRatePerHour?: number | null;
  defaultRatePerHour?: number | null;

  estimatedQuantityToCollect?: number | null;
  readyQuantity?: number | null;

  currentProgressRemainder?: number | null;
  estimatedNewProgressRemainder?: number | null;
  progressRemainder?: number | null;

  nextUnitProgressPercent?: number | null;
  progressPercent?: number | null;

  material?: GatheringMaterialViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
};

type GatheringMaterialLoose = GatheringMaterialViewModel & {
  baseGatheringRatePerHour?: number | null;
};

const GATHERING_SOCKET_NAMESPACE = '/gathering';


type GatheringLootNotificationSource = {
  collected?: GatheringCollectedViewModel | null;
  session?: GatheringSessionViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
  inventoryItem?: GatheringInventoryItemViewModel | null;
};

function getCollectedQuantity(collected?: GatheringCollectedViewModel | null) {
  const quantity = Number(collected?.quantity ?? 0);

  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
}

function buildGatheringLootNotificationKey(params: {
  characterId: string;
  collected: GatheringCollectedViewModel;
  session?: GatheringSessionViewModel | null;
  inventoryItem?: GatheringInventoryItemViewModel | null;
}) {
  const session = params.session as GatheringSessionLoose | null | undefined;
  const collectedTotal = getSessionCollectedQuantity(params.session);

  return [
    'gathering',
    params.characterId,
    params.session?.id ?? 'no-session',
    params.collected.itemId,
    collectedTotal,
    params.collected.quantity,
    session?.lastResolvedAt ?? params.inventoryItem?.updatedAt ?? 'no-resolved-at',
  ].join('|');
}

const GATHERING_STATUS_EVENTS = [
  'gathering:status',
  'gathering:snapshot',
  'gathering:session',
  'gathering:session:update',
  'gathering:started',
  'gathering:progress',
  'gathering:collected',
  'gathering:stopped',
] as const;

export const GatheringRealtimeContext =
  createContext<GatheringRealtimeContextValue | null>(null);

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFirstValidNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function clampPercent(value: unknown): number {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(100, parsed));
}

function clampFraction(value: unknown): number {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(0.9999, parsed));
}

function normalizeStatus(status?: string | null): string {
  return String(status ?? '').trim().toUpperCase();
}

function isSessionActive(session?: GatheringSessionViewModel | null): boolean {
  const looseSession = session as GatheringSessionLoose | null;

  return normalizeStatus(looseSession?.status) === 'ACTIVE';
}

function isActiveGatheringStatus(
  status?: GatheringStatusResponse | null,
): status is GatheringStatusResponse & { active: true } {
  return (status as GatheringStatusLoose | null)?.active === true;
}

function getParsedDateMs(value?: string | null): number | null {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getActiveSession(
  status?: GatheringStatusResponse | null,
): GatheringSessionViewModel | null {
  const looseStatus = status as GatheringStatusLoose | null;

  if (isActiveGatheringStatus(status) && looseStatus?.session) {
    return looseStatus.session;
  }

  if (looseStatus?.session && isSessionActive(looseStatus.session)) {
    return looseStatus.session;
  }

  return null;
}

function getProductionPreview(params: {
  status?: GatheringStatusResponse | null;
  session?: GatheringSessionViewModel | null;
}): GatheringProductionPreviewViewModel | null {
  const looseStatus = params.status as GatheringStatusLoose | null;
  const looseSession = params.session as GatheringSessionLoose | null;

  return looseStatus?.productionPreview ?? looseSession?.productionPreview ?? null;
}

function getGatheringSkill(params: {
  status?: GatheringStatusResponse | null;
  session?: GatheringSessionViewModel | null;
}): GatheringSkillViewModel | null {
  const looseStatus = params.status as GatheringStatusLoose | null;
  const looseSession = params.session as GatheringSessionLoose | null;

  return looseStatus?.gatheringSkill ?? looseSession?.gatheringSkill ?? null;
}

function getTargetMaterial(params: {
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
}): GatheringMaterialViewModel | null {
  const looseSession = params.session as GatheringSessionLoose | null;
  const loosePreview =
    params.productionPreview as GatheringProductionPreviewLoose | null;

  return (
    looseSession?.targetMaterial ??
    loosePreview?.targetMaterial ??
    loosePreview?.material ??
    null
  );
}

function getStatusTargetMaterial(
  status?: GatheringStatusResponse | null,
): GatheringMaterialViewModel | null {
  const session = getActiveSession(status);
  const productionPreview = getProductionPreview({ status, session });

  return getTargetMaterial({ session, productionPreview });
}

function getMaterialId(
  material?: GatheringMaterialViewModel | null,
): string | null {
  return typeof material?.id === 'string' && material.id.trim().length > 0
    ? material.id
    : null;
}

function mergeMaterialSnapshot(params: {
  next?: GatheringMaterialViewModel | null;
  previous?: GatheringMaterialViewModel | null;
}): GatheringMaterialViewModel | null {
  const nextId = getMaterialId(params.next);
  const previousId = getMaterialId(params.previous);

  if (!params.next) {
    return params.previous ?? null;
  }

  if (!params.previous || !nextId || nextId !== previousId) {
    return params.next;
  }

  return {
    ...params.previous,
    ...params.next,
    slug: params.next.slug ?? params.previous.slug,
    icon: params.next.icon ?? params.previous.icon,
    iconUrl: params.next.iconUrl ?? params.previous.iconUrl,
    iconPath: params.next.iconPath ?? params.previous.iconPath,
    imageUrl: params.next.imageUrl ?? params.previous.imageUrl,
    assetKey: params.next.assetKey ?? params.previous.assetKey,
  };
}

function preserveGatheringTargetMaterial(params: {
  previous: GatheringStatusResponse | null;
  next: GatheringStatusResponse | null;
}): GatheringStatusResponse | null {
  const nextSession = getActiveSession(params.next);

  if (!nextSession) {
    return params.next;
  }

  const previousSession = getActiveSession(params.previous);

  if (previousSession?.id !== nextSession.id) {
    return params.next;
  }

  const previousMaterial = getStatusTargetMaterial(params.previous);
  const nextPreview = getProductionPreview({
    status: params.next,
    session: nextSession,
  });
  const nextMaterial = getTargetMaterial({
    session: nextSession,
    productionPreview: nextPreview,
  });
  const mergedMaterial = mergeMaterialSnapshot({
    next: nextMaterial,
    previous: previousMaterial,
  });

  if (!mergedMaterial || mergedMaterial === nextMaterial) {
    return params.next;
  }

  const nextLoose = params.next as GatheringStatusLoose;
  const mergedSession = {
    ...nextSession,
    targetMaterial: mergedMaterial,
  } as GatheringSessionViewModel;
  const mergedPreview = nextPreview
    ? ({
        ...nextPreview,
        targetMaterial:
          (nextPreview as GatheringProductionPreviewLoose).targetMaterial ??
          mergedMaterial,
        material:
          (nextPreview as GatheringProductionPreviewLoose).material ??
          mergedMaterial,
      } as GatheringProductionPreviewViewModel)
    : nextPreview;

  return {
    ...nextLoose,
    session: mergedSession,
    productionPreview: mergedPreview,
  } as GatheringStatusResponse;
}

function getSessionCollectedQuantity(
  session?: GatheringSessionViewModel | null,
): number {
  const looseSession = session as GatheringSessionLoose | null;
  const collectedQuantity = Number(looseSession?.collectedQuantity ?? 0);

  if (!Number.isFinite(collectedQuantity)) {
    return 0;
  }

  return Math.max(0, Math.floor(collectedQuantity));
}

function getSessionCollectedXp(
  session?: GatheringSessionViewModel | null,
): number {
  const looseSession = session as GatheringSessionLoose | null;
  const collectedXp = Number(looseSession?.collectedXp ?? 0);

  if (!Number.isFinite(collectedXp)) {
    return 0;
  }

  return Math.max(0, Math.floor(collectedXp));
}

function getRatePerHour(params: {
  productionPreview?: GatheringProductionPreviewViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
}): number | null {
  const loosePreview =
    params.productionPreview as GatheringProductionPreviewLoose | null;
  const looseMaterial = params.targetMaterial as GatheringMaterialLoose | null;

  const rate = getFirstValidNumber(
    loosePreview?.ratePerHour,
    loosePreview?.baseRatePerHour,
    loosePreview?.defaultRatePerHour,
    looseMaterial?.baseGatheringRatePerHour,
  );

  if (rate === undefined || rate <= 0) {
    return null;
  }

  return rate;
}

function getBaseReadyQuantity(
  productionPreview?: GatheringProductionPreviewViewModel | null,
): number {
  const loosePreview =
    productionPreview as GatheringProductionPreviewLoose | null;

  const readyQuantity = getFirstValidNumber(
    loosePreview?.estimatedQuantityToCollect,
    loosePreview?.readyQuantity,
    0,
  );

  return Math.max(0, Math.floor(readyQuantity ?? 0));
}

function getBaseProgressRemainder(params: {
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
}): number {
  const looseSession = params.session as GatheringSessionLoose | null;
  const loosePreview =
    params.productionPreview as GatheringProductionPreviewLoose | null;

  const directRemainder = getFirstValidNumber(
    loosePreview?.estimatedNewProgressRemainder,
    loosePreview?.currentProgressRemainder,
    loosePreview?.progressRemainder,
    looseSession?.progressRemainder,
  );

  if (directRemainder !== undefined) {
    return clampFraction(directRemainder);
  }

  const progressPercent = getFirstValidNumber(
    loosePreview?.nextUnitProgressPercent,
    loosePreview?.progressPercent,
  );

  if (progressPercent !== undefined) {
    return clampFraction(progressPercent / 100);
  }

  return 0;
}

function hasFreshProductionPreview(
  productionPreview?: GatheringProductionPreviewViewModel | null,
): boolean {
  const loosePreview =
    productionPreview as GatheringProductionPreviewLoose | null;

  if (!loosePreview) return false;

  return (
    loosePreview.estimatedQuantityToCollect !== undefined ||
    loosePreview.readyQuantity !== undefined ||
    loosePreview.estimatedNewProgressRemainder !== undefined ||
    loosePreview.currentProgressRemainder !== undefined ||
    loosePreview.progressRemainder !== undefined ||
    loosePreview.nextUnitProgressPercent !== undefined ||
    loosePreview.progressPercent !== undefined ||
    loosePreview.elapsedSeconds !== undefined
  );
}

function getBaseTimestampMs(params: {
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  lastUpdatedAt?: number | null;
}): number | null {
  const looseSession = params.session as GatheringSessionLoose | null;

  if (hasFreshProductionPreview(params.productionPreview)) {
    return params.lastUpdatedAt ?? Date.now();
  }

  return (
    getParsedDateMs(looseSession?.lastResolvedAt) ??
    params.lastUpdatedAt ??
    null
  );
}

function buildLiveProduction(params: {
  isActive: boolean;
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;
  nowMs: number;
  lastUpdatedAt?: number | null;
}): GatheringRealtimeLiveProduction {
  const ratePerHour = getRatePerHour({
    productionPreview: params.productionPreview,
    targetMaterial: params.targetMaterial,
  });

  const baseReadyQuantity = getBaseReadyQuantity(params.productionPreview);
  const baseRemainder = getBaseProgressRemainder({
    session: params.session,
    productionPreview: params.productionPreview,
  });

  if (!params.isActive || !ratePerHour || ratePerHour <= 0) {
    return {
      readyQuantity: baseReadyQuantity,
      progressPercent: clampPercent(baseRemainder * 100),
      secondsToNextUnit: null,
      ratePerHour,
      timePerUnitSeconds: null,
    };
  }

  const baseTimestampMs = getBaseTimestampMs({
    session: params.session,
    productionPreview: params.productionPreview,
    lastUpdatedAt: params.lastUpdatedAt,
  });

  const elapsedSeconds =
    baseTimestampMs === null
      ? 0
      : Math.max(0, Math.floor((params.nowMs - baseTimestampMs) / 1000));

  const productionPerSecond = ratePerHour / 3600;
  const producedSinceBase = elapsedSeconds * productionPerSecond;

  const totalProduction = Math.max(
    0,
    baseReadyQuantity + baseRemainder + producedSinceBase,
  );

  const readyQuantity = Math.max(0, Math.floor(totalProduction));
  const currentRemainder = clampFraction(totalProduction - readyQuantity);

  const secondsToNextUnit =
    productionPerSecond > 0
      ? Math.max(1, Math.ceil((1 - currentRemainder) / productionPerSecond))
      : null;

  const timePerUnitSeconds =
    productionPerSecond > 0
      ? Math.max(1, Math.ceil(1 / productionPerSecond))
      : null;

  return {
    readyQuantity,
    progressPercent: clampPercent(currentRemainder * 100),
    secondsToNextUnit,
    ratePerHour,
    timePerUnitSeconds,
  };
}

function buildState(params: {
  characterId: string;
  status: GatheringStatusResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isBusy: boolean;
  errorMessage: string | null;
  lastUpdatedAt: number | null;
  nowMs: number;
}): GatheringRealtimeState {
  const session = getActiveSession(params.status);
  const productionPreview = getProductionPreview({
    status: params.status,
    session,
  });

  const gatheringSkill = getGatheringSkill({
    status: params.status,
    session,
  });

  const targetMaterial = getTargetMaterial({
    session,
    productionPreview,
  });

  const isActive = Boolean(session);

  const liveProduction = buildLiveProduction({
    isActive,
    session,
    productionPreview,
    targetMaterial,
    nowMs: params.nowMs,
    lastUpdatedAt: params.lastUpdatedAt,
  });

  const collectedQuantity = getSessionCollectedQuantity(session);
  const collectedXp = getSessionCollectedXp(session);

  return {
    characterId: params.characterId,

    status: params.status,
    session,
    productionPreview,
    gatheringSkill,
    targetMaterial,

    collectedQuantity,
    collectedXp,

    isActive,
    isLoading: params.isLoading,
    isRefreshing: params.isRefreshing,
    isBusy: params.isBusy,

    errorMessage: params.errorMessage,
    lastUpdatedAt: params.lastUpdatedAt,
    nowMs: params.nowMs,

    liveProduction,
  };
}

function getStoredAuthToken(): string | null {
  const keys = [
    'authToken',
    'accessToken',
    'token',
    'jwt',
    'deadIdle.authToken',
    'zumbi.authToken',
  ];

  for (const key of keys) {
    const value = window.localStorage.getItem(key);

    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  const objectKeys = ['auth', 'user', 'session', 'deadIdle.auth'];

  for (const key of objectKeys) {
    const raw = window.localStorage.getItem(key);

    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as LooseRecord;

      const token =
        parsed.authToken ??
        parsed.accessToken ??
        parsed.token ??
        parsed.jwt;

      if (typeof token === 'string' && token.trim().length > 0) {
        return token.trim();
      }
    } catch {
      // Ignora valores que não são JSON.
    }
  }

  return null;
}

function normalizeSocketBaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/api\/?$/i, '')
    .replace(/\/$/, '');
}

function getGatheringSocketUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;

  const rawUrl =
    env.VITE_SOCKET_URL ??
    env.VITE_API_URL ??
    env.VITE_BACKEND_URL ??
    'http://localhost:3000';

  const baseUrl = normalizeSocketBaseUrl(rawUrl);

  if (baseUrl.endsWith(GATHERING_SOCKET_NAMESPACE)) {
    return baseUrl;
  }

  return `${baseUrl}${GATHERING_SOCKET_NAMESPACE}`;
}

function safeStatusSignature(status: GatheringStatusResponse | null): string {
  if (!status) return 'null';

  try {
    return JSON.stringify(status);
  } catch {
    return `invalid:${Date.now()}`;
  }
}

function looksLikeGatheringStatus(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    'active' in value ||
    'session' in value ||
    'productionPreview' in value ||
    'gatheringSkill' in value
  );
}

function unwrapSocketPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  if (looksLikeGatheringStatus(payload)) {
    return payload;
  }

  const candidates = [
    payload.status,
    payload.state,
    payload.snapshot,
    payload.data,
    payload.result,
    payload.payload,
  ];

  for (const candidate of candidates) {
    if (looksLikeGatheringStatus(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      const nested = unwrapSocketPayload(candidate);

      if (looksLikeGatheringStatus(nested)) {
        return nested;
      }
    }
  }

  return payload;
}

function extractSocketStatusPayload(
  payload: unknown,
): GatheringStatusResponse | null {
  const unwrapped = unwrapSocketPayload(payload);

  if (!looksLikeGatheringStatus(unwrapped)) {
    return null;
  }

  return unwrapped as GatheringStatusResponse;
}

function extractPartialPreviewFromRecord(
  record: LooseRecord,
): GatheringProductionPreviewViewModel | null {
  if (isRecord(record.productionPreview)) {
    return record.productionPreview as unknown as GatheringProductionPreviewViewModel;
  }

  const previewFields: GatheringProductionPreviewLoose =
    {} as GatheringProductionPreviewLoose;
  let hasPreviewField = false;

  const fields: Array<keyof GatheringProductionPreviewLoose> = [
    'elapsedSeconds',
    'ratePerHour',
    'baseRatePerHour',
    'defaultRatePerHour',
    'estimatedQuantityToCollect',
    'readyQuantity',
    'currentProgressRemainder',
    'estimatedNewProgressRemainder',
    'progressRemainder',
    'nextUnitProgressPercent',
    'progressPercent',
  ];

  for (const field of fields) {
    if (field in record) {
      (previewFields as unknown as LooseRecord)[field] = record[field];
      hasPreviewField = true;
    }
  }

  if (isRecord(record.material)) {
    previewFields.material = record.material as unknown as GatheringMaterialViewModel;
    hasPreviewField = true;
  }

  if (isRecord(record.targetMaterial)) {
    previewFields.targetMaterial = record.targetMaterial as unknown as GatheringMaterialViewModel;
    hasPreviewField = true;
  }

  return hasPreviewField
    ? (previewFields as unknown as GatheringProductionPreviewViewModel)
    : null;
}

function mergeSocketPartialStatus(params: {
  previous: GatheringStatusResponse | null;
  payload: unknown;
}): GatheringStatusResponse | null {
  const unwrapped = unwrapSocketPayload(params.payload);

  if (!isRecord(unwrapped)) {
    return null;
  }

  const previousLoose = params.previous as GatheringStatusLoose | null;

  const incomingSession = isRecord(unwrapped.session)
    ? (unwrapped.session as unknown as GatheringSessionViewModel)
    : null;

  const session = incomingSession ?? previousLoose?.session ?? null;

  const incomingPreview = extractPartialPreviewFromRecord(unwrapped);
  const previousPreview =
    previousLoose?.productionPreview ??
    ((session as GatheringSessionLoose | null)?.productionPreview ?? null);

  const productionPreview =
    incomingPreview || previousPreview
      ? ({
          ...((previousPreview as unknown as LooseRecord | null) ?? {}),
          ...((incomingPreview as unknown as LooseRecord | null) ?? {}),
        } as unknown as GatheringProductionPreviewViewModel)
      : null;

  const incomingGatheringSkill = isRecord(unwrapped.gatheringSkill)
    ? (unwrapped.gatheringSkill as unknown as GatheringSkillViewModel)
    : null;

  const gatheringSkill =
    incomingGatheringSkill ?? previousLoose?.gatheringSkill ?? null;

  const hasUsefulPatch =
    session !== null ||
    productionPreview !== null ||
    gatheringSkill !== null ||
    'active' in unwrapped;

  if (!hasUsefulPatch && !params.previous) {
    return null;
  }

  const active =
    typeof unwrapped.active === 'boolean'
      ? unwrapped.active
      : session
        ? isSessionActive(session)
        : Boolean(previousLoose?.active);

  return {
    ...((previousLoose as LooseRecord | null) ?? {}),
    active,
    session,
    productionPreview,
    gatheringSkill,
  } as GatheringStatusResponse;
}

function extractSocketError(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const possibleMessage =
    payload.message ??
    payload.error ??
    payload.reason ??
    (isRecord(payload.data) ? payload.data.message : null);

  return typeof possibleMessage === 'string' && possibleMessage.trim().length > 0
    ? possibleMessage.trim()
    : null;
}

export function GatheringRealtimeProvider({
  characterId,
  children,
  autoLoad = true,
  enabled = true,
  refreshMs = 5000,
  tickMs = 1000,
}: GatheringRealtimeProviderProps) {
  const [status, setStatus] = useState<GatheringStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const isMountedRef = useRef(false);
  const processedLootNotificationKeysRef = useRef<Set<string>>(new Set());
  const { notifyLoot } = useLootNotifications();
  const isRefreshingRef = useRef(false);
  const statusRef = useRef<GatheringStatusResponse | null>(null);
  const statusSignatureRef = useRef<string>('null');
  const socketConnectedRef = useRef(false);

  const publishGatheringLootNotification = useCallback(
    ({ collected, session, targetMaterial, inventoryItem }: GatheringLootNotificationSource) => {
      if (!enabled || !characterId || !collected) return;

      const quantity = getCollectedQuantity(collected);
      const itemName = String(collected.name ?? targetMaterial?.name ?? 'Item').trim();

      if (quantity <= 0 || !itemName) {
        return;
      }

      const idempotencyKey = buildGatheringLootNotificationKey({
        characterId,
        collected,
        session,
        inventoryItem,
      });

      if (processedLootNotificationKeysRef.current.has(idempotencyKey)) {
        return;
      }

      processedLootNotificationKeysRef.current.add(idempotencyKey);

      if (processedLootNotificationKeysRef.current.size > 240) {
        processedLootNotificationKeysRef.current = new Set(
          Array.from(processedLootNotificationKeysRef.current).slice(-120),
        );
      }

      notifyLoot({
        idempotencyKey,
        itemId: collected.itemId,
        itemName,
        quantity,
        imageUrl: getGatheringMaterialImageUrl(targetMaterial),
        rarity: targetMaterial?.rarity,
        source: 'gathering',
      });
    },
    [characterId, enabled, notifyLoot],
  );

  const applyStatus = useCallback((nextStatus: GatheringStatusResponse | null) => {
    if (!isMountedRef.current) return;

    const previousStatus = statusRef.current;
    const normalizedStatus = preserveGatheringTargetMaterial({
      previous: previousStatus,
      next: nextStatus,
    });
    const nextSignature = safeStatusSignature(normalizedStatus);

    if (statusSignatureRef.current === nextSignature) {
      statusRef.current = normalizedStatus;
      return;
    }

    statusSignatureRef.current = nextSignature;
    statusRef.current = normalizedStatus;

    if (previousStatus) {
      const activeStatus = normalizedStatus as GatheringStatusLoose | null;
      publishGatheringLootNotification({
        collected: activeStatus?.autoCollected ?? null,
        session: getActiveSession(normalizedStatus),
        targetMaterial: getStatusTargetMaterial(normalizedStatus),
        inventoryItem: activeStatus?.inventoryItem ?? null,
      });
    }

    setStatus(normalizedStatus);
    setLastUpdatedAt(Date.now());
    setErrorMessage(null);
  }, [publishGatheringLootNotification]);

  const applySocketPayload = useCallback(
    (payload: unknown) => {
      const fullStatus = extractSocketStatusPayload(payload);

      if (fullStatus) {
        applyStatus(fullStatus);
        return;
      }

      const mergedStatus = mergeSocketPartialStatus({
        previous: statusRef.current,
        payload,
      });

      if (mergedStatus) {
        applyStatus(mergedStatus);
      }
    },
    [applyStatus],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    if (isRefreshingRef.current) {
      return statusRef.current;
    }

    isRefreshingRef.current = true;

    if (isMountedRef.current) {
      setIsRefreshing((previous) => (previous ? previous : true));
    }

    try {
      const response = await getGatheringStatusRequest(characterId);

      applyStatus(response);

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractGatheringApiError(error));
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading((previous) => (previous ? false : previous));
        setIsRefreshing((previous) => (previous ? false : previous));
      }

      isRefreshingRef.current = false;
    }
  }, [applyStatus, characterId, enabled]);

  const requestSocketSnapshot = useCallback(() => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || !characterId) {
      return;
    }

    socket.emit('gathering:join', { characterId });
    socket.emit('gathering:status:request', { characterId });
    socket.emit('gathering:refresh', { characterId });
  }, [characterId]);

  const start = useCallback(
    async (payload: GatheringRealtimeStartPayload) => {
      if (!enabled || !characterId) {
        return null;
      }

      setIsBusy((previous) => (previous ? previous : true));
      setErrorMessage(null);

      try {
        await startGatheringRequest({
          characterId,
          mapId: payload.mapId,
          origin: payload.origin,
          targetMaterialId: payload.targetMaterialId,
        });

        requestSocketSnapshot();

        if (socketConnectedRef.current) {
          return statusRef.current;
        }

        return await refresh();
      } catch (error) {
        if (isMountedRef.current) {
          setErrorMessage(extractGatheringApiError(error));
        }

        return null;
      } finally {
        if (isMountedRef.current) {
          setIsBusy((previous) => (previous ? false : previous));
        }
      }
    },
    [characterId, enabled, refresh, requestSocketSnapshot],
  );

  const collect = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    setIsBusy((previous) => (previous ? previous : true));
    setErrorMessage(null);

    try {
      const response = await collectGatheringRequest(characterId);

      publishGatheringLootNotification({
        collected: response.collected,
        session: response.session,
        targetMaterial:
          response.session?.targetMaterial ??
          getStatusTargetMaterial(statusRef.current),
        inventoryItem: response.inventoryItem ?? null,
      });

      requestSocketSnapshot();

      if (!socketConnectedRef.current) {
        await refresh();
      }

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractGatheringApiError(error));
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsBusy((previous) => (previous ? false : previous));
      }
    }
  }, [
    characterId,
    enabled,
    publishGatheringLootNotification,
    refresh,
    requestSocketSnapshot,
  ]);

  const stop = useCallback(async () => {
    if (!enabled || !characterId) {
      return null;
    }

    setIsBusy((previous) => (previous ? previous : true));
    setErrorMessage(null);

    try {
      const response = await stopGatheringRequest(characterId);

      requestSocketSnapshot();

      if (!socketConnectedRef.current) {
        await refresh();
      }

      return response;
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(extractGatheringApiError(error));
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsBusy((previous) => (previous ? false : previous));
      }
    }
  }, [characterId, enabled, refresh, requestSocketSnapshot]);

  const clearError = useCallback(() => {
    setErrorMessage((previous) => (previous === null ? previous : null));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    statusRef.current = null;
    statusSignatureRef.current = 'null';
    processedLootNotificationKeysRef.current.clear();

    setStatus((previous) => (previous === null ? previous : null));
    setLastUpdatedAt((previous) => (previous === null ? previous : null));
    setErrorMessage((previous) => (previous === null ? previous : null));
    setIsLoading((previous) => (previous === autoLoad ? previous : autoLoad));
    setIsRefreshing((previous) => (previous ? false : previous));
    setIsBusy((previous) => (previous ? false : previous));
  }, [autoLoad, characterId]);

  useEffect(() => {
    if (!enabled || !characterId) {
      socketConnectedRef.current = false;
      setIsSocketConnected((previous) => (previous ? false : previous));
      return undefined;
    }

    const token = getStoredAuthToken();
    const socketUrl = getGatheringSocketUrl();

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: {
        token,
        characterId,
      },
      query: {
        characterId,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4500,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      socketConnectedRef.current = true;

      if (isMountedRef.current) {
        setIsSocketConnected((previous) => (previous ? previous : true));
        setErrorMessage(null);
      }

      socket.emit('gathering:join', { characterId });
      socket.emit('gathering:status:request', { characterId });
      socket.emit('gathering:refresh', { characterId });
    };

    const handleDisconnect = () => {
      socketConnectedRef.current = false;

      if (isMountedRef.current) {
        setIsSocketConnected((previous) => (previous ? false : previous));
      }
    };

    const handleConnectError = (error: Error) => {
      socketConnectedRef.current = false;

      if (isMountedRef.current) {
        setIsSocketConnected((previous) => (previous ? false : previous));

        if (!statusRef.current) {
          setErrorMessage(
            error.message || 'Falha ao conectar ao gathering em tempo real.',
          );
        }
      }
    };

    const handleStatusEvent = (payload: unknown) => {
      applySocketPayload(payload);
    };

    const handleErrorEvent = (payload: unknown) => {
      const message =
        extractSocketError(payload) ??
        'Erro recebido do gathering em tempo real.';

      if (isMountedRef.current) {
        setErrorMessage(message);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('gathering:error', handleErrorEvent);

    for (const eventName of GATHERING_STATUS_EVENTS) {
      socket.on(eventName, handleStatusEvent);
    }

    return () => {
      socket.emit('gathering:leave', { characterId });

      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('gathering:error', handleErrorEvent);

      for (const eventName of GATHERING_STATUS_EVENTS) {
        socket.off(eventName, handleStatusEvent);
      }

      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      socketConnectedRef.current = false;

      if (isMountedRef.current) {
        setIsSocketConnected((previous) => (previous ? false : previous));
      }
    };
  }, [applySocketPayload, characterId, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, Math.max(250, tickMs));

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, tickMs]);

  useEffect(() => {
    if (!enabled || !characterId || !autoLoad) {
      setIsLoading((previous) => (previous ? false : previous));
      return;
    }

    setIsLoading((previous) => (previous ? previous : true));
    void refresh();
  }, [autoLoad, characterId, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !characterId || refreshMs <= 0 || isSocketConnected) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, refreshMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [characterId, enabled, isSocketConnected, refresh, refreshMs]);

  const state = useMemo(
    () =>
      buildState({
        characterId,
        status,
        isLoading,
        isRefreshing,
        isBusy,
        errorMessage,
        lastUpdatedAt,
        nowMs,
      }),
    [
      characterId,
      errorMessage,
      isBusy,
      isLoading,
      isRefreshing,
      lastUpdatedAt,
      nowMs,
      status,
    ],
  );

  const value = useMemo<GatheringRealtimeContextValue>(
    () => ({
      state,
      refresh,
      start,
      collect,
      stop,
      clearError,
    }),
    [clearError, collect, refresh, start, state, stop],
  );

  return (
    <GatheringRealtimeContext.Provider value={value}>
      {children}
    </GatheringRealtimeContext.Provider>
  );
}

export default GatheringRealtimeProvider;
