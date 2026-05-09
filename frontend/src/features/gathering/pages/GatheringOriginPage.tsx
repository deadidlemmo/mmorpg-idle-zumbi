import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import {
    extractGatheringApiError,
    listGatheringMaterialsRequest,
} from '../api/gathering.api';
import { GatheringActivityPanel } from '../components/GatheringActivityPanel';
import { GatheringMaterialList } from '../components/GatheringMaterialList';
import { GatheringUsageModal } from '../components/GatheringUsageModal';
import {
    useGatheringRealtimeActions,
    useGatheringRealtimeState,
} from '../realtime/useGatheringRealtime';
import '../styles/gathering.css';
import type {
    GatheringAllowedOrigin,
    GatheringAvailableMaterialsResponse,
    GatheringMaterialViewModel,
    GatheringStatusResponse,
} from '../types/gathering.types';
import {
    formatGatheringOriginRelatedClasses,
    getGatheringOriginDescription,
    getGatheringOriginLabel,
    getGatheringOriginStatLabel,
} from '../types/gathering.types';
import { buildGatheringDashboardCharacter } from '../utils/gathering-dashboard-character';

const DEFAULT_MAP_ID = 'e76bcf38-a357-4bc2-b832-ee9bee2e575f';

const GATHERING_ORIGIN_BY_SLUG = {
  desmanche: 'DESMANCHE',
  coleta: 'COLETA',
  patrulha: 'PATRULHA',
  arsenal: 'ARSENAL',
  tecnovarredura: 'TECNOVARREDURA',
  contencao: 'CONTENCAO',
} as const satisfies Record<string, GatheringAllowedOrigin>;

type GatheringOriginSlug = keyof typeof GATHERING_ORIGIN_BY_SLUG;

type GatheringActionResponseLike = {
  collected?: {
    quantity?: number | null;
    name?: string | null;
  } | null;
};

function isGatheringOriginSlug(value?: string): value is GatheringOriginSlug {
  return Boolean(value && value in GATHERING_ORIGIN_BY_SLUG);
}

function getOriginIconFallback(origin: GatheringAllowedOrigin): string {
  return getGatheringOriginLabel(origin).slice(0, 2).toUpperCase();
}

function getStatusGatheringSkill(
  status?: GatheringStatusResponse | null,
  origin?: GatheringAllowedOrigin | null,
) {
  if (!status?.active || !origin) return null;

  if (status.gatheringSkill?.origin === origin) {
    return status.gatheringSkill;
  }

  if (status.session.gatheringSkill?.origin === origin) {
    return status.session.gatheringSkill;
  }

  return null;
}

function getStatusMapId(status?: GatheringStatusResponse | null): string {
  if (status?.active && status.session.map?.id) {
    return status.session.map.id;
  }

  return DEFAULT_MAP_ID;
}

function getActiveMaterialId(
  status?: GatheringStatusResponse | null,
): string | null {
  if (!status?.active) return null;

  return status.session.targetMaterial?.id ?? null;
}

function getActiveOrigin(status?: GatheringStatusResponse | null): string | null {
  if (!status?.active) return null;

  return String(status.session.origin ?? '');
}

function getInitialSelectedMaterialId(params: {
  materials: GatheringMaterialViewModel[];
  previousSelectedMaterialId?: string | null;
  activeMaterialId?: string | null;
}): string | null {
  const previousStillExists = params.materials.some(
    (material) => material.id === params.previousSelectedMaterialId,
  );

  if (previousStillExists && params.previousSelectedMaterialId) {
    return params.previousSelectedMaterialId;
  }

  const activeStillExists = params.materials.some(
    (material) => material.id === params.activeMaterialId,
  );

  if (activeStillExists && params.activeMaterialId) {
    return params.activeMaterialId;
  }

  return params.materials[0]?.id ?? null;
}

function getCollectedFeedback(params: {
  response: unknown;
  successPrefix: string;
  emptyMessage: string;
}): string {
  const actionResponse = params.response as GatheringActionResponseLike | null;
  const quantity = Number(actionResponse?.collected?.quantity ?? 0);
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const materialName = actionResponse?.collected?.name ?? 'material';

  if (safeQuantity > 0) {
    return `${params.successPrefix}: +${safeQuantity} ${materialName}.`;
  }

  return params.emptyMessage;
}

export function GatheringOriginPage() {
  const { characterId, origin } = useParams();

  const safeCharacterId = characterId ?? '';
  const originKey = isGatheringOriginSlug(origin)
    ? GATHERING_ORIGIN_BY_SLUG[origin]
    : null;

  const gatheringRealtimeState = useGatheringRealtimeState();
  const {
    refresh: refreshGathering,
    start: startGathering,
    collect: collectGathering,
    stop: stopGathering,
  } = useGatheringRealtimeActions();

  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);

  const [materialsResponse, setMaterialsResponse] =
    useState<GatheringAvailableMaterialsResponse | null>(null);

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );
  const [usageMaterial, setUsageMaterial] =
    useState<GatheringMaterialViewModel | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPageBusy, setIsPageBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pageErrorMessage, setPageErrorMessage] = useState<string | null>(null);

  const status = gatheringRealtimeState.status;
  const isBusy = isPageBusy || gatheringRealtimeState.isBusy;
  const errorMessage = pageErrorMessage ?? gatheringRealtimeState.errorMessage;

  const originLabel = originKey ? getGatheringOriginLabel(originKey) : 'Gathering';
  const originDescription = originKey
    ? getGatheringOriginDescription(originKey)
    : 'Expedição idle para obtenção de materiais.';
  const originStatLabel = originKey
    ? getGatheringOriginStatLabel(originKey)
    : 'Progressão';
  const originRelatedClasses = originKey
    ? formatGatheringOriginRelatedClasses(originKey)
    : 'Classes: —';

  const materials = materialsResponse?.materials ?? [];
  const currentMap = materialsResponse?.map ?? null;
  const fallbackRatePerHour = materialsResponse?.ratePerHour ?? null;

  const activeMaterialId = getActiveMaterialId(status);
  const activeOrigin = getActiveOrigin(status);
  const isCurrentOriginActive = activeOrigin === originKey;

  const gatheringSkill = useMemo(() => {
    const activeSkill = getStatusGatheringSkill(status, originKey);

    if (activeSkill) {
      return activeSkill;
    }

    if (gatheringRealtimeState.gatheringSkill?.origin === originKey) {
      return gatheringRealtimeState.gatheringSkill;
    }

    return null;
  }, [gatheringRealtimeState.gatheringSkill, originKey, status]);

  const selectedMaterial = useMemo(
    () =>
      materials.find((material) => material.id === selectedMaterialId) ??
      materials[0] ??
      null,
    [materials, selectedMaterialId],
  );

  const loadGatheringData = useCallback(async () => {
    if (!safeCharacterId || !originKey) return;

    setIsLoading(true);
    setPageErrorMessage(null);

    try {
      const [overviewResponse, statusResponse] = await Promise.all([
        getCharacterOverview(safeCharacterId),
        refreshGathering(),
      ]);

      const mapId = getStatusMapId(statusResponse);

      const availableMaterialsResponse = await listGatheringMaterialsRequest({
        mapId,
        origin: originKey,
      });

      setCharacter(buildGatheringDashboardCharacter(overviewResponse));
      setMaterialsResponse(availableMaterialsResponse);

      setSelectedMaterialId((previousSelectedMaterialId) =>
        getInitialSelectedMaterialId({
          materials: availableMaterialsResponse.materials,
          previousSelectedMaterialId,
          activeMaterialId: getActiveMaterialId(statusResponse),
        }),
      );
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, [originKey, refreshGathering, safeCharacterId]);

  useEffect(() => {
    void loadGatheringData();
  }, [loadGatheringData]);

  async function handleStartMaterial(material: GatheringMaterialViewModel) {
    if (isBusy || !safeCharacterId || !originKey) return;

    setIsPageBusy(true);
    setPageErrorMessage(null);
    setFeedback(null);

    try {
      const mapId = currentMap?.id ?? getStatusMapId(status);

      const response = await startGathering({
        mapId,
        origin: originKey,
        targetMaterialId: material.id,
      });

      if (!response) {
        setPageErrorMessage('Não foi possível iniciar esta coleta.');
        return;
      }

      setSelectedMaterialId(material.id);
      setFeedback(`Coleta iniciada: ${material.name}.`);

      await loadGatheringData();
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsPageBusy(false);
    }
  }

  async function handleCollect() {
    if (isBusy || !safeCharacterId) return;

    setIsPageBusy(true);
    setPageErrorMessage(null);
    setFeedback(null);

    try {
      const response = await collectGathering();

      setFeedback(
        getCollectedFeedback({
          response,
          successPrefix: 'Coleta realizada',
          emptyMessage: 'Nenhuma unidade pronta para coletar ainda.',
        }),
      );

      await loadGatheringData();
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsPageBusy(false);
    }
  }

  async function handleStop() {
    if (isBusy || !safeCharacterId) return;

    setIsPageBusy(true);
    setPageErrorMessage(null);
    setFeedback(null);

    try {
      const response = await stopGathering();

      setFeedback(
        getCollectedFeedback({
          response,
          successPrefix: 'Gathering encerrado. Coletado',
          emptyMessage: 'Gathering encerrado.',
        }),
      );

      await loadGatheringData();
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsPageBusy(false);
    }
  }

  function handleSelectMaterial(material: GatheringMaterialViewModel) {
    setSelectedMaterialId(material.id);
  }

  function handleViewMaterialUsage(material: GatheringMaterialViewModel) {
    setUsageMaterial(material);
  }

  function handleCloseUsageModal() {
    setUsageMaterial(null);
  }

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (!originKey) {
    return <Navigate to={`/dashboard/${safeCharacterId}/gathering`} replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando expedição...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar expedição</h1>
        <p>{errorMessage || 'Não foi possível carregar este personagem.'}</p>

        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character}>
      <section className="gathering-page gathering-page--clean">
        <header className="gathering-page__header gathering-page__header--compact">
          <div className="gathering-page__header-main">
            <span className="gathering-page__eyebrow">Gathering</span>
            <h1>{originLabel}</h1>
            <p className="gathering-page__subtitle">{originDescription}</p>
          </div>

          <div className="gathering-page__header-actions">
            <Link
              to={`/dashboard/${safeCharacterId}/gathering`}
              className="gathering-button gathering-button--secondary"
            >
              Voltar
            </Link>

            <button
              type="button"
              className="gathering-button"
              onClick={() => void loadGatheringData()}
              disabled={isLoading || isBusy}
            >
              Atualizar
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="gathering-feedback gathering-feedback--error">
            {errorMessage}
          </div>
        ) : null}

        {feedback ? (
          <div className="gathering-feedback gathering-feedback--success">
            {feedback}
          </div>
        ) : null}

        <div className="gathering-page__grid gathering-page__grid--clean">
          <main className="gathering-page__main-column">
            <section className="gathering-card gathering-card--compact">
              <div className="gathering-card__header">
                <div className="gathering-card__title-group">
                  <span className="gathering-card__eyebrow">
                    Materiais de {originLabel}
                  </span>

                  <h2>
                    {currentMap
                      ? `${currentMap.name} · Tier ${currentMap.tier}`
                      : 'Lista de materiais'}
                  </h2>

                  <p className="gathering-card__description">
                    Selecione um material para iniciar uma coleta idle. Materiais
                    bloqueados exigem nível maior nesta proficiência.
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="gathering-loading">
                  <span className="gathering-loading__spinner" />
                  <p>Carregando materiais...</p>
                </div>
              ) : (
                <GatheringMaterialList
                  materials={materials}
                  gatheringSkill={gatheringSkill}
                  fallbackRatePerHour={fallbackRatePerHour}
                  selectedMaterialId={selectedMaterial?.id ?? null}
                  activeMaterialId={
                    isCurrentOriginActive ? activeMaterialId : null
                  }
                  isBusy={isBusy}
                  onSelectMaterial={handleSelectMaterial}
                  onStartMaterial={handleStartMaterial}
                  onViewMaterialUsage={handleViewMaterialUsage}
                />
              )}
            </section>
          </main>

          <aside className="gathering-page__side-column gathering-page__side-column--clean">
            <section className="gathering-card gathering-card--compact">
              <div className="gathering-origin-summary gathering-origin-summary--icon">
                <span className="gathering-origin-summary__visual">
                  <span className="gathering-origin-summary__icon">
                    {getOriginIconFallback(originKey)}
                  </span>
                </span>

                <div className="gathering-origin-summary__content">
                  <div className="gathering-origin-summary__top">
                    <strong>{originLabel}</strong>
                    <span>{originStatLabel}</span>
                  </div>

                  <p>
                    {originRelatedClasses} ·{' '}
                    {gatheringSkill
                      ? `Nv. ${gatheringSkill.level} · ${gatheringSkill.xp}/${
                          gatheringSkill.xpToNextLevel ?? 'MAX'
                        } XP`
                      : 'Nv. 1'}
                  </p>
                </div>
              </div>
            </section>

            <section className="gathering-card gathering-card--active">
              <GatheringActivityPanel
                status={status}
                productionPreview={gatheringRealtimeState.productionPreview}
                gatheringSkill={gatheringRealtimeState.gatheringSkill}
                isBusy={isBusy}
                onCollect={handleCollect}
                onStop={handleStop}
                onRefresh={loadGatheringData}
              />
            </section>
          </aside>
        </div>

        <GatheringUsageModal
          isOpen={Boolean(usageMaterial)}
          material={usageMaterial}
          onClose={handleCloseUsageModal}
        />
      </section>
    </DashboardLayout>
  );
}

export default GatheringOriginPage;