import { useGatheringRealtimeState } from '../realtime/useGatheringRealtime';
import type {
  GatheringMaterialViewModel,
  GatheringProductionPreviewViewModel,
  GatheringSessionViewModel,
  GatheringStatusResponse,
} from '../types/gathering.types';
import {
  clampGatheringPercent,
  getGatheringMaterialRatePerHour,
  getGatheringXpPerUnit,
} from '../types/gathering.types';

interface GatheringActivityPanelProps {
  status?: GatheringStatusResponse | null;

  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  gatheringSkill?: unknown;

  /**
   * Mantido por compatibilidade com chamadas antigas.
   * A coleta agora é automática pelo backend/status.
   */
  isBusy?: boolean;
  onCollect?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

interface LiveProductionViewModel {
  readyQuantity: number;
  progressPercent: number;
  secondsToNextUnit: number | null;
  ratePerHour: number | null;
  timePerUnitSeconds: number | null;
}

type GatheringSessionWithCounters = GatheringSessionViewModel & {
  collectedQuantity?: unknown;
  totalCollectedQuantity?: unknown;
  sessionCollectedQuantity?: unknown;
};

function isActiveStatus(
  status?: GatheringStatusResponse | null,
): status is Extract<GatheringStatusResponse, { active: true }> {
  return status?.active === true;
}

function clampFraction(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.min(0.9999, parsed));
}

function getSafeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return parsed;
}

function getSafeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(0, Math.floor(parsed));
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

function getSessionMaterial(
  session?: GatheringSessionViewModel | null,
): GatheringMaterialViewModel | null {
  return session?.targetMaterial ?? null;
}

function getSessionPreview(params: {
  status?: GatheringStatusResponse | null;
  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
}): GatheringProductionPreviewViewModel | null {
  if (isActiveStatus(params.status)) {
    return params.status.productionPreview;
  }

  return params.productionPreview ?? params.session?.productionPreview ?? null;
}

function getActiveSession(params: {
  status?: GatheringStatusResponse | null;
  session?: GatheringSessionViewModel | null;
}): GatheringSessionViewModel | null {
  if (isActiveStatus(params.status)) {
    return params.status.session;
  }

  if (params.session?.status === 'ACTIVE') {
    return params.session;
  }

  return null;
}

function getPreviewReadyQuantity(
  preview?: GatheringProductionPreviewViewModel | null,
): number {
  const quantity = Number(preview?.estimatedQuantityToCollect ?? 0);

  if (!Number.isFinite(quantity)) return 0;

  return Math.max(0, Math.floor(quantity));
}

function getPreviewRemainder(params: {
  session?: GatheringSessionViewModel | null;
  preview?: GatheringProductionPreviewViewModel | null;
}): number {
  return clampFraction(
    params.preview?.estimatedNewProgressRemainder ??
      params.preview?.currentProgressRemainder ??
      params.session?.progressRemainder ??
      0,
  );
}

function getRatePerHour(params: {
  material?: GatheringMaterialViewModel | null;
  preview?: GatheringProductionPreviewViewModel | null;
}): number | null {
  const previewRate = Number(params.preview?.ratePerHour);

  if (Number.isFinite(previewRate) && previewRate > 0) {
    return previewRate;
  }

  return getGatheringMaterialRatePerHour(params.material, null);
}

function getStaticLiveProduction(params: {
  isActive: boolean;
  session?: GatheringSessionViewModel | null;
  preview?: GatheringProductionPreviewViewModel | null;
  material?: GatheringMaterialViewModel | null;
}): LiveProductionViewModel {
  const ratePerHour = getRatePerHour({
    material: params.material,
    preview: params.preview,
  });

  const readyQuantity = getPreviewReadyQuantity(params.preview);
  const remainder = getPreviewRemainder({
    session: params.session,
    preview: params.preview,
  });

  const progressPercent = clampGatheringPercent(remainder * 100);
  const productionPerSecond =
    ratePerHour && ratePerHour > 0 ? ratePerHour / 3600 : 0;

  const secondsToNextUnit =
    params.isActive && productionPerSecond > 0
      ? Math.max(1, Math.ceil((1 - remainder) / productionPerSecond))
      : null;

  const timePerUnitSeconds =
    productionPerSecond > 0
      ? Math.max(1, Math.ceil(1 / productionPerSecond))
      : null;

  return {
    readyQuantity,
    progressPercent,
    secondsToNextUnit,
    ratePerHour,
    timePerUnitSeconds,
  };
}

function getActivityTitle(material?: GatheringMaterialViewModel | null): string {
  return material?.name ?? 'Material em coleta';
}

function getCollectedQuantityLabel(collectedQuantity: number): string {
  return `+${Math.max(0, collectedQuantity).toLocaleString('pt-BR')}`;
}

function formatGatheringDurationFriendly(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    if (minutes > 0 && remainingSeconds > 0) {
      return `${hours}h ${minutes} min ${remainingSeconds}s`;
    }

    if (minutes > 0) {
      return `${hours}h ${minutes} min`;
    }

    return `${hours}h`;
  }

  if (minutes > 0) {
    return remainingSeconds > 0
      ? `${minutes} min ${remainingSeconds}s`
      : `${minutes} min`;
  }

  return `${remainingSeconds}s`;
}

function getNextUnitLabel(secondsToNextUnit: number | null): string {
  if (secondsToNextUnit === null) {
    return 'Próximo em: —';
  }

  return `Próximo em: ${formatGatheringDurationFriendly(secondsToNextUnit)}`;
}

function getExpPerSecondLabel(params: {
  xpPerUnit: number;
  ratePerHour?: number | null;
}): string {
  const ratePerHour = Number(params.ratePerHour ?? 0);

  if (!Number.isFinite(ratePerHour) || ratePerHour <= 0) {
    return '0 EXP/s';
  }

  const expPerSecond = (ratePerHour * params.xpPerUnit) / 3600;
  const normalizedExpPerSecond =
    expPerSecond > 0 && expPerSecond < 0.1 ? 0.1 : expPerSecond;

  return `${normalizedExpPerSecond.toFixed(1)} EXP/s`;
}

function getCollectedQuantity(params: {
  realtimeState: ReturnType<typeof useGatheringRealtimeState>;
  activeSession?: GatheringSessionViewModel | null;
}): number {
  const realtimeStateWithCounters = params.realtimeState as typeof params.realtimeState & {
    collectedQuantity?: unknown;
    totalCollectedQuantity?: unknown;
    sessionCollectedQuantity?: unknown;
  };

  const activeSessionWithCounters =
    params.activeSession as GatheringSessionWithCounters | null;

  return getSafeInteger(
    realtimeStateWithCounters.collectedQuantity ??
      realtimeStateWithCounters.sessionCollectedQuantity ??
      realtimeStateWithCounters.totalCollectedQuantity ??
      activeSessionWithCounters?.collectedQuantity ??
      activeSessionWithCounters?.sessionCollectedQuantity ??
      activeSessionWithCounters?.totalCollectedQuantity ??
      0,
  );
}

function getSyncedLiveProduction(params: {
  realtimeLiveProduction?: LiveProductionViewModel | null;
  isRealtimeActive: boolean;
  fallback: LiveProductionViewModel;
}): LiveProductionViewModel {
  if (!params.isRealtimeActive || !params.realtimeLiveProduction) {
    return params.fallback;
  }

  return {
    readyQuantity: Math.max(
      0,
      Math.floor(getSafeNumber(params.realtimeLiveProduction.readyQuantity, 0)),
    ),
    progressPercent: clampGatheringPercent(
      params.realtimeLiveProduction.progressPercent,
    ),
    secondsToNextUnit: params.realtimeLiveProduction.secondsToNextUnit,
    ratePerHour: params.realtimeLiveProduction.ratePerHour,
    timePerUnitSeconds: params.realtimeLiveProduction.timePerUnitSeconds,
  };
}

export function GatheringActivityPanel({
  status,
  session,
  productionPreview,
  isBusy = false,
  onStop,
  onRefresh,
}: GatheringActivityPanelProps) {
  const realtimeState = useGatheringRealtimeState();

  const statusSource = realtimeState.status ?? status;
  const activeSession =
    realtimeState.session ??
    getActiveSession({
      status: statusSource,
      session,
    });

  const isActive = Boolean(activeSession);

  const preview =
    realtimeState.productionPreview ??
    getSessionPreview({
      status: statusSource,
      session: activeSession,
      productionPreview,
    });

  const material =
    realtimeState.targetMaterial ?? getSessionMaterial(activeSession);

  const iconUrl = getMaterialIconUrl(material);

  const fallbackLiveProduction = getStaticLiveProduction({
    isActive,
    session: activeSession,
    preview,
    material,
  });

  const liveProduction = getSyncedLiveProduction({
    realtimeLiveProduction: realtimeState.liveProduction,
    isRealtimeActive: realtimeState.isActive,
    fallback: fallbackLiveProduction,
  });

  const progressPercent = clampGatheringPercent(
    liveProduction.progressPercent,
  );

  const collectedQuantity = getCollectedQuantity({
    realtimeState,
    activeSession,
  });

  const xpPerUnit = getGatheringXpPerUnit(material);
  const expPerSecondLabel = getExpPerSecondLabel({
    xpPerUnit,
    ratePerHour: liveProduction.ratePerHour,
  });

  const nextUnitLabel = getNextUnitLabel(liveProduction.secondsToNextUnit);

  const canStop = Boolean(onStop) && isActive && !isBusy;
  const canRefresh = Boolean(onRefresh) && !isBusy;

  function handleStop() {
    if (!canStop) return;

    void onStop?.();
  }

  function handleRefresh() {
    if (!canRefresh) return;

    void onRefresh?.();
  }

  if (!isActive || !activeSession) {
    return (
      <section className="gathering-session gathering-session--empty gathering-session--compact">
        <div className="gathering-session__empty-card">
          <span className="gathering-session__empty-icon" aria-hidden="true">
            ⛏
          </span>

          <div className="gathering-session__empty-content">
            <strong>Nenhuma coleta ativa</strong>
            <p>Escolha um material para iniciar uma expedição.</p>
          </div>

          {onRefresh ? (
            <button
              type="button"
              className="gathering-session__icon-button"
              onClick={handleRefresh}
              disabled={!canRefresh}
              aria-label="Atualizar gathering"
              title="Atualizar"
            >
              ↻
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="gathering-session gathering-session--active gathering-session--compact gathering-session--horizontal">
      <div className="gathering-session__current-action gathering-session__current-action--horizontal">
        <div className="gathering-session__item-icon" aria-hidden="true">
          {iconUrl ? (
            <img
              className="gathering-session__item-image"
              src={iconUrl}
              alt=""
              draggable={false}
            />
          ) : (
            <span className="gathering-material-card__icon-fallback">
              {getMaterialInitials(material?.name)}
            </span>
          )}
        </div>

        <div className="gathering-session__current-body gathering-session__current-body--title-only">
          <span className="gathering-session__activity-heading">
            <span
              className="gathering-session__activity-spinner"
              aria-hidden="true"
            />
            <h2 title={getActivityTitle(material)}>
              {getActivityTitle(material)}
            </h2>
          </span>

          <div
            className="gathering-session__progress-strip"
            role="progressbar"
            aria-label="Progresso até a próxima unidade coletada"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
            title={`${Math.round(progressPercent)}% até a próxima unidade`}
          >
            <span
              className="gathering-session__progress-track"
              aria-hidden="true"
            >
              <span
                className="gathering-session__progress-fill"
                style={{
                  width: `${progressPercent}%`,
                }}
              />
            </span>
          </div>

          <div className="gathering-session__inline-stats gathering-session__inline-stats--auto">
            <span
              className="gathering-session__inline-badge gathering-session__inline-value--collected"
              title="Quantidade coletada automaticamente nesta sessão"
            >
              {getCollectedQuantityLabel(collectedQuantity)}
            </span>

            <span className="gathering-session__inline-capsule">
              <span
                className="gathering-session__inline-value gathering-session__inline-value--time"
                title="Tempo estimado para a próxima unidade"
              >
                {nextUnitLabel}
              </span>

              <span
                className="gathering-session__inline-value gathering-session__inline-value--xp"
                title="Experiência gerada por segundo"
              >
                {expPerSecondLabel}
              </span>
            </span>
          </div>
        </div>

        <div className="gathering-session__header-actions">
          {onRefresh ? (
            <button
              type="button"
              className="gathering-session__icon-button"
              onClick={handleRefresh}
              disabled={!canRefresh}
              aria-label="Atualizar gathering"
              title="Atualizar"
            >
              ↻
            </button>
          ) : null}

          {onStop ? (
            <button
              type="button"
              className="gathering-session__icon-button gathering-session__icon-button--danger"
              onClick={handleStop}
              disabled={!canStop}
              aria-label="Parar gathering"
              title="Parar"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="gathering-session__progress-strip"
        role="progressbar"
        aria-label="Progresso até a próxima unidade coletada"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        title={`${Math.round(progressPercent)}% até a próxima unidade`}
      >
        <span className="gathering-session__progress-track" aria-hidden="true">
          <span
            className="gathering-session__progress-fill"
            style={{
              width: `${progressPercent}%`,
            }}
          />
        </span>
      </div>

      <div className="gathering-session__inline-stats gathering-session__inline-stats--auto">
        <span
          className="gathering-session__inline-badge gathering-session__inline-value--collected"
          title="Quantidade coletada automaticamente nesta sessão"
        >
          {getCollectedQuantityLabel(collectedQuantity)}
        </span>

        <span className="gathering-session__inline-capsule">
          <span
            className="gathering-session__inline-value gathering-session__inline-value--time"
            title="Tempo estimado para a próxima unidade"
          >
            {nextUnitLabel}
          </span>

          <span
            className="gathering-session__inline-value gathering-session__inline-value--xp"
            title="Experiência gerada por segundo"
          >
            {expPerSecondLabel}
          </span>
        </span>
      </div>
    </section>
  );
}

export default GatheringActivityPanel;
