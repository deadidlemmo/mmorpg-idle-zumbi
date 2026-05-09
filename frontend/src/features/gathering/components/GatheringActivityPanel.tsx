import type { CSSProperties } from 'react';
import { useGatheringRealtimeState } from '../realtime/useGatheringRealtime';
import type {
    GatheringMaterialViewModel,
    GatheringProductionPreviewViewModel,
    GatheringSessionViewModel,
    GatheringSkillViewModel,
    GatheringStatusResponse,
} from '../types/gathering.types';
import {
    clampGatheringPercent,
    formatGatheringDuration,
    formatGatheringRate,
    formatGatheringTimePerUnitShort,
    getGatheringMaterialRatePerHour,
    getGatheringOriginLabel,
    getGatheringSkillLevel,
    getGatheringXpPerUnit,
} from '../types/gathering.types';

interface GatheringActivityPanelProps {
  status?: GatheringStatusResponse | null;

  session?: GatheringSessionViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;

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

function getSessionSkill(params: {
  status?: GatheringStatusResponse | null;
  session?: GatheringSessionViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
}): GatheringSkillViewModel | null {
  if (isActiveStatus(params.status)) {
    return params.status.gatheringSkill ?? params.status.session.gatheringSkill ?? null;
  }

  return params.gatheringSkill ?? params.session?.gatheringSkill ?? null;
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
    productionPerSecond > 0 ? Math.max(1, Math.ceil(1 / productionPerSecond)) : null;

  return {
    readyQuantity,
    progressPercent,
    secondsToNextUnit,
    ratePerHour,
    timePerUnitSeconds,
  };
}

function getActivityTitle(material?: GatheringMaterialViewModel | null): string {
  return material?.name ?? 'Coleta em andamento';
}

function getActivityDescription(params: {
  session?: GatheringSessionViewModel | null;
  material?: GatheringMaterialViewModel | null;
}): string {
  const originLabel = getGatheringOriginLabel(params.session?.origin);
  const mapName = params.session?.map?.name;

  if (mapName) {
    return `${originLabel} em ${mapName}`;
  }

  return originLabel;
}

function getSkillProgressLabel(skill?: GatheringSkillViewModel | null): string {
  if (!skill) {
    return 'Proficiência Nv. 1';
  }

  const level = getGatheringSkillLevel(skill);

  if (skill.xpToNextLevel === null || skill.isAtLevelCap) {
    return `Proficiência Nv. ${level} · nível máximo`;
  }

  return `Proficiência Nv. ${level} · ${skill.xp}/${skill.xpToNextLevel} XP`;
}

function getCollectedButtonLabel(params: {
  readyQuantity: number;
  isBusy: boolean;
}): string {
  if (params.isBusy) return 'Coletando...';

  if (params.readyQuantity <= 0) {
    return 'Nada pronto';
  }

  if (params.readyQuantity === 1) {
    return 'Coletar 1';
  }

  return `Coletar ${params.readyQuantity}`;
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
  gatheringSkill,
  isBusy = false,
  onCollect,
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

  const skill =
    realtimeState.gatheringSkill ??
    getSessionSkill({
      status: statusSource,
      session: activeSession,
      gatheringSkill,
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

  const ratePerHour =
    liveProduction.ratePerHour ??
    getRatePerHour({
      material,
      preview,
    });

  const xpPerUnit = getGatheringXpPerUnit(material);

  const progressStyle = {
    width: `${liveProduction.progressPercent}%`,
  } as CSSProperties;

  const canCollect =
    Boolean(onCollect) &&
    isActive &&
    !isBusy &&
    liveProduction.readyQuantity > 0;

  const canStop = Boolean(onStop) && isActive && !isBusy;
  const canRefresh = Boolean(onRefresh) && !isBusy;

  function handleCollect() {
    if (!canCollect) return;

    void onCollect?.();
  }

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
      <section className="gathering-session gathering-session--empty">
        <div className="gathering-card__header">
          <div className="gathering-card__title-group">
            <span className="gathering-card__eyebrow">Atividade atual</span>
            <h2>Nenhuma coleta ativa</h2>
            <p className="gathering-card__description">
              Escolha um material para iniciar uma expedição de gathering.
            </p>
          </div>
        </div>

        <div className="gathering-session__empty-state">
          <span className="gathering-session__empty-icon" aria-hidden="true">
            ⛏
          </span>

          <div>
            <strong>Pronto para iniciar</strong>
            <p>
              Quando uma coleta estiver ativa, o progresso, a taxa e a quantidade
              pronta aparecerão aqui.
            </p>
          </div>
        </div>

        {onRefresh ? (
          <div className="gathering-session__actions">
            <button
              type="button"
              className="gathering-button gathering-button--secondary"
              onClick={handleRefresh}
              disabled={!canRefresh}
            >
              Atualizar
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="gathering-session gathering-session--active">
      <div className="gathering-card__header">
        <div className="gathering-card__title-group">
          <span className="gathering-card__eyebrow">Atividade atual</span>
          <h2>Coleta em andamento</h2>
        </div>
      </div>

      <div className="gathering-session__live-hero">
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

          <span className="gathering-session__origin-mini">
            {getGatheringOriginLabel(activeSession.origin).slice(0, 2)}
          </span>
        </div>

        <div className="gathering-session__live-body">
          <span className="gathering-session__label">Coletando agora</span>

          <h2 title={getActivityTitle(material)}>{getActivityTitle(material)}</h2>

          <p className="gathering-session__description">
            {getActivityDescription({
              session: activeSession,
              material,
            })}
          </p>
        </div>
      </div>

      <div className="gathering-session__activity">
        <div className="gathering-session__activity-header">
          <span>Próxima unidade</span>
          <strong>{Math.floor(liveProduction.progressPercent)}%</strong>
        </div>

        <div
          className="gathering-session__activity-track"
          role="progressbar"
          aria-label="Progresso da próxima unidade"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(liveProduction.progressPercent)}
        >
          <i style={progressStyle} />
        </div>

        <div className="gathering-session__activity-footer">
          <span>
            Pronto:{' '}
            <strong>{liveProduction.readyQuantity.toLocaleString('pt-BR')}</strong>
          </span>

          <span>
            Próximo:{' '}
            <strong>
              {liveProduction.secondsToNextUnit === null
                ? '—'
                : formatGatheringDuration(liveProduction.secondsToNextUnit)}
            </strong>
          </span>
        </div>
      </div>

      <div className="gathering-session__rate-strip">
        <span>
          <small>Taxa</small>
          <strong>{formatGatheringRate(ratePerHour)}</strong>
        </span>

        <span>
          <small>Tempo/item</small>
          <strong>{formatGatheringTimePerUnitShort(ratePerHour)}</strong>
        </span>

        <span>
          <small>XP/item</small>
          <strong>+{xpPerUnit}</strong>
        </span>
      </div>

      <div className="gathering-session__skill-line">
        <span>{getSkillProgressLabel(skill)}</span>

        <div
          className="gathering-session__skill-track"
          role="progressbar"
          aria-label="Progresso da proficiência"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(skill?.xpProgressPercent ?? 0)}
        >
          <i
            style={
              {
                width: `${clampGatheringPercent(
                  skill?.xpProgressPercent ?? 0,
                )}%`,
              } as CSSProperties
            }
          />
        </div>
      </div>

      <div className="gathering-session__actions">
        <button
          type="button"
          className="gathering-button gathering-button--primary"
          onClick={handleCollect}
          disabled={!canCollect}
        >
          {getCollectedButtonLabel({
            readyQuantity: liveProduction.readyQuantity,
            isBusy,
          })}
        </button>

        <button
          type="button"
          className="gathering-button gathering-button--danger"
          onClick={handleStop}
          disabled={!canStop}
        >
          Parar
        </button>
      </div>
    </section>
  );
}

export default GatheringActivityPanel;