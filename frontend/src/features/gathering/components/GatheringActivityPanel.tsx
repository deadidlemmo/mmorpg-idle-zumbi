import { RefreshCw, X } from 'lucide-react';
import { ActivityProgressCard } from '../../../components/game/ActivityProgressCard';
import { getGatheringOriginIcon } from '../constants/gathering-origin-icons';
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
import { getGatheringMaterialImageUrl } from '../utils/gatheringMaterialAssets';

interface GatheringActivityPanelProps {
  cardClassName?: string;
  status?: GatheringStatusResponse | null;
  origin?: string | null;
  activityLabel?: string | null;

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

type GatheringSkillLevelLike = {
  level?: unknown;
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

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
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

function getGatheringSkillLevelLabel(gatheringSkill?: unknown): string {
  const skill = gatheringSkill as GatheringSkillLevelLike | null | undefined;
  const level = Number(skill?.level ?? 1);

  if (!Number.isFinite(level)) {
    return 'Nv. 1';
  }

  return `Nv. ${Math.max(1, Math.floor(level))}`;
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
  cardClassName,
  status,
  origin,
  activityLabel,
  session,
  productionPreview,
  gatheringSkill,
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

  const originIconUrl = getGatheringOriginIcon(activeSession?.origin ?? origin);
  const materialIconUrl = getGatheringMaterialImageUrl(material);
  const iconUrl = materialIconUrl ?? originIconUrl;

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
  const skillLevelLabel = getGatheringSkillLevelLabel(gatheringSkill);
  const inactiveActivityLabel = activityLabel?.trim() || 'Gathering';

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
      <ActivityProgressCard
        as="section"
        className={joinClassNames(
          cardClassName,
          'gathering-session',
          'gathering-session--empty',
          'gathering-session--idle',
          'gathering-session--compact',
          'gathering-session--horizontal',
        )}
        icon={
          originIconUrl ? (
            <img
              src={originIconUrl}
              alt=""
              draggable={false}
            />
          ) : (
            <span className="gathering-material-card__icon-fallback">
              {getMaterialInitials(inactiveActivityLabel)}
            </span>
          )
        }
        label={inactiveActivityLabel}
        badge={skillLevelLabel}
        progressPercent={0}
        progressLabel="Nenhuma coleta ativa"
        progressTitle="Nenhuma coleta ativa"
        pills={[
          {
            content: 'Sem coleta',
            key: 'status',
          },
          {
            content: 'Disponível',
            key: 'availability',
          },
          {
            content: '0 EXP/s',
            key: 'xp',
          },
        ]}
      />
    );
  }

  return (
    <ActivityProgressCard
      as="section"
      className={joinClassNames(
        cardClassName,
        'gathering-session',
        'gathering-session--active',
        'gathering-session--compact',
        'gathering-session--horizontal',
      )}
      icon={
        iconUrl ? (
          <img src={iconUrl} alt="" draggable={false} />
        ) : (
          <span className="gathering-material-card__icon-fallback">
            {getMaterialInitials(material?.name)}
          </span>
        )
      }
      label={getActivityTitle(material)}
      badge={skillLevelLabel}
      progressPercent={progressPercent}
      progressLabel="Progresso até a próxima unidade coletada"
      progressTitle={`${Math.round(progressPercent)}% até a próxima unidade`}
      pills={[
        {
          content: getCollectedQuantityLabel(collectedQuantity),
          key: 'collected',
          title: 'Quantidade coletada automaticamente nesta sessão',
        },
        {
          content: nextUnitLabel,
          key: 'next',
          title: 'Tempo estimado para a próxima unidade',
        },
        {
          content: expPerSecondLabel,
          key: 'xp',
          title: 'Experiência gerada por segundo',
        },
      ]}
      controls={
        <div className="gathering-session__header-actions auto-combat-hunt-skill-card__controls">
          {onRefresh ? (
            <button
              type="button"
              className="gathering-session__icon-button auto-combat-hunt-skill-card__control-button"
              onClick={handleRefresh}
              disabled={!canRefresh}
              aria-label="Atualizar gathering"
              title="Atualizar"
            >
              <RefreshCw size={15} strokeWidth={2.6} />
            </button>
          ) : null}

          {onStop ? (
            <button
              type="button"
              className="gathering-session__icon-button gathering-session__icon-button--danger auto-combat-hunt-skill-card__control-button auto-combat-hunt-skill-card__control-button--danger"
              onClick={handleStop}
              disabled={!canStop}
              aria-label="Parar gathering"
              title="Parar"
            >
              <X size={16} strokeWidth={2.8} />
            </button>
          ) : null}
        </div>
      }
    />
  );
}

export default GatheringActivityPanel;
