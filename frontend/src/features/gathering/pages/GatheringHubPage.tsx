import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import {
    extractGatheringApiError,
    getGatheringStatusRequest,
} from '../api/gathering.api';
import { getGatheringOriginIcon } from '../constants/gathering-origin-icons';
import '../styles/gathering.css';
import type {
    GatheringAllowedOrigin,
    GatheringSkillsSummaryViewModel,
    GatheringSkillViewModel,
    GatheringStatusResponse,
} from '../types/gathering.types';
import {
    GATHERING_ORIGIN_OPTIONS,
    getGatheringOriginLabel,
    isGatheringAllowedOrigin,
} from '../types/gathering.types';
import { buildGatheringDashboardCharacter } from '../utils/gathering-dashboard-character';

const GATHERING_SLUG_BY_ORIGIN = {
  DESMANCHE: 'desmanche',
  COLETA: 'coleta',
  PATRULHA: 'patrulha',
  ARSENAL: 'arsenal',
  TECNOVARREDURA: 'tecnovarredura',
  CONTENCAO: 'contencao',
} as const satisfies Record<GatheringAllowedOrigin, string>;

type GatheringOriginSlug =
  (typeof GATHERING_SLUG_BY_ORIGIN)[GatheringAllowedOrigin];

type GatheringSkillLoose = Partial<GatheringSkillViewModel> & {
  key?: string | null;
  slug?: string | null;
  type?: string | null;
  name?: string | null;
  origin?: string | null;
};

type GatheringSkillsSummaryLoose = {
  skills?: GatheringSkillLoose[] | null;
  byOrigin?: Partial<Record<GatheringAllowedOrigin, GatheringSkillLoose | null>> | null;
};

interface CharacterOverviewWithGatheringSkills {
  gatheringSkills?:
    | GatheringSkillsSummaryViewModel
    | GatheringSkillsSummaryLoose
    | GatheringSkillLoose[]
    | null;
  character?: {
    gatheringSkills?:
      | GatheringSkillsSummaryViewModel
      | GatheringSkillsSummaryLoose
      | GatheringSkillLoose[]
      | null;
  } | null;
}

interface HubOriginViewModel {
  key: GatheringAllowedOrigin;
  slug: GatheringOriginSlug;
  label: string;
  description: string;
  statLabel: string;
  relatedClasses: string[];
}

function getOriginIconFallback(label: string): string {
  return label.slice(0, 2).toUpperCase();
}

function normalizeGatheringOriginKey(
  value?: string | null,
): GatheringAllowedOrigin | null {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const aliases: Record<string, GatheringAllowedOrigin> = {
    DESMANCHE: 'DESMANCHE',
    COLETA: 'COLETA',
    PATRULHA: 'PATRULHA',
    ARSENAL: 'ARSENAL',
    TECNOVARREDURA: 'TECNOVARREDURA',
    TECNO_VARREDURA: 'TECNOVARREDURA',
    CONTENCAO: 'CONTENCAO',
    CONTENÇÃO: 'CONTENCAO',
  };

  return aliases[normalized] ?? null;
}

function getSkillOrigin(
  skill?: GatheringSkillLoose | null,
): GatheringAllowedOrigin | null {
  if (!skill) return null;

  return (
    normalizeGatheringOriginKey(skill.origin) ??
    normalizeGatheringOriginKey(skill.key) ??
    normalizeGatheringOriginKey(skill.slug) ??
    normalizeGatheringOriginKey(skill.type) ??
    normalizeGatheringOriginKey(skill.name)
  );
}

function getSkillByOrigin(
  gatheringSkills:
    | GatheringSkillsSummaryViewModel
    | GatheringSkillsSummaryLoose
    | GatheringSkillLoose[]
    | null,
  origin: GatheringAllowedOrigin,
): GatheringSkillViewModel | null {
  if (!gatheringSkills) return null;

  if (Array.isArray(gatheringSkills)) {
    return (
      (gatheringSkills.find((skill) => getSkillOrigin(skill) === origin) as
        | GatheringSkillViewModel
        | undefined) ?? null
    );
  }

  const directSkill = gatheringSkills.byOrigin?.[origin];

  if (directSkill) {
    return directSkill as GatheringSkillViewModel;
  }

  return (
    (gatheringSkills.skills?.find((skill) => getSkillOrigin(skill) === origin) as
      | GatheringSkillViewModel
      | undefined) ?? null
  );
}

function getSkillLevelLabel(skill?: GatheringSkillViewModel | null): string {
  const level = Number(skill?.level ?? 1);

  if (!Number.isFinite(level)) {
    return 'Nv. 1';
  }

  return `Nv. ${Math.max(1, Math.floor(level))}`;
}

function getSkillProgressLabel(skill?: GatheringSkillViewModel | null): string {
  if (!skill) {
    return '0 XP';
  }

  if (skill.isAtLevelCap || skill.xpToNextLevel === null) {
    return 'Nível máximo';
  }

  return `${skill.xp}/${skill.xpToNextLevel} XP`;
}

function getSkillProgressPercent(skill?: GatheringSkillViewModel | null): number {
  if (!skill) {
    return 0;
  }

  if (skill.isAtLevelCap || skill.xpToNextLevel === null) {
    return 100;
  }

  const explicitPercent = Number(skill.xpProgressPercent);

  if (Number.isFinite(explicitPercent)) {
    return Math.max(0, Math.min(100, Math.floor(explicitPercent)));
  }

  const xp = Number(skill.xp ?? 0);
  const xpToNextLevel = Number(skill.xpToNextLevel ?? 0);

  if (!Number.isFinite(xp) || !Number.isFinite(xpToNextLevel) || xpToNextLevel <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor((xp / xpToNextLevel) * 100)));
}

function getOriginStatusLabel(params: {
  isActive: boolean;
  isClassAffinity: boolean;
}): string {
  if (params.isActive) {
    return 'Ativa';
  }

  if (params.isClassAffinity) {
    return 'Afinidade';
  }

  return 'Disponível';
}

function getActiveOrigin(status?: GatheringStatusResponse | null) {
  if (!status?.active) return null;

  const origin = status.session.origin;

  if (!isGatheringAllowedOrigin(origin)) {
    return null;
  }

  return origin;
}

function getActiveOriginSlug(
  status?: GatheringStatusResponse | null,
): GatheringOriginSlug | null {
  const activeOrigin = getActiveOrigin(status);

  if (!activeOrigin) return null;

  return GATHERING_SLUG_BY_ORIGIN[activeOrigin];
}

function getActiveMaterialName(status?: GatheringStatusResponse | null): string {
  if (!status?.active) {
    return 'Nenhuma atividade ativa';
  }

  return status.session.targetMaterial?.name ?? 'Material em coleta';
}

function getActiveOriginLabel(status?: GatheringStatusResponse | null): string {
  const activeOrigin = getActiveOrigin(status);

  if (!activeOrigin) {
    return 'Gathering parado';
  }

  return getGatheringOriginLabel(activeOrigin);
}

function buildHubOrigins(): HubOriginViewModel[] {
  return GATHERING_ORIGIN_OPTIONS.map((origin) => ({
    key: origin.key,
    slug: GATHERING_SLUG_BY_ORIGIN[origin.key],
    label: origin.label,
    description: origin.description,
    statLabel: origin.statLabel,
    relatedClasses: origin.relatedClasses,
  }));
}

function getOriginClassName(params: {
  slug: string;
  isActive: boolean;
  isClassAffinity: boolean;
}) {
  return [
    'gathering-origin-option',
    'gathering-origin-option--icon',
    `is-${params.slug}`,
    params.isActive ? 'is-active' : '',
    params.isClassAffinity ? 'is-affinity' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function getOverviewGatheringSkills(
  overview: unknown,
):
  | GatheringSkillsSummaryViewModel
  | GatheringSkillsSummaryLoose
  | GatheringSkillLoose[]
  | null {
  const overviewWithGathering =
    overview as CharacterOverviewWithGatheringSkills;

  return (
    overviewWithGathering.gatheringSkills ??
    overviewWithGathering.character?.gatheringSkills ??
    null
  );
}

export function GatheringHubPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? '';

  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);

  const [gatheringSkills, setGatheringSkills] = useState<
    | GatheringSkillsSummaryViewModel
    | GatheringSkillsSummaryLoose
    | GatheringSkillLoose[]
    | null
  >(null);

  const [status, setStatus] = useState<GatheringStatusResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hubOrigins = useMemo(() => buildHubOrigins(), []);
  const activeOrigin = getActiveOrigin(status);
  const activeOriginSlug = getActiveOriginSlug(status);

  const loadHubData = useCallback(async () => {
    if (!safeCharacterId) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [overviewResponse, statusResponse] = await Promise.all([
        getCharacterOverview(safeCharacterId),
        getGatheringStatusRequest(safeCharacterId),
      ]);

      setCharacter(buildGatheringDashboardCharacter(overviewResponse));
      setGatheringSkills(getOverviewGatheringSkills(overviewResponse));
      setStatus(statusResponse);
      setHasLoadedOnce(true);
    } catch (error) {
      setErrorMessage(extractGatheringApiError(error));
      setHasLoadedOnce(true);
    } finally {
      setIsLoading(false);
    }
  }, [safeCharacterId]);

  useEffect(() => {
    let isCancelled = false;

    queueMicrotask(() => {
      if (isCancelled) return;

      void loadHubData();
    });

    return () => {
      isCancelled = true;
    };
  }, [loadHubData]);

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando expedições...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar expedições</h1>
        <p>{errorMessage || 'Não foi possível carregar este personagem.'}</p>

        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="gathering-page gathering-page--clean gathering-page--hub">
        <header className="gathering-page__header gathering-page__header--compact">
          <div className="gathering-page__header-main">
            <span className="gathering-page__eyebrow">Proficiências</span>
            <h1>Gathering</h1>
            <p className="gathering-page__subtitle">
              Escolha uma atividade para coletar materiais, evoluir proficiências
              e desbloquear recursos melhores.
            </p>
          </div>

          <div className="gathering-page__header-actions">
            <button
              type="button"
              className="gathering-button"
              onClick={() => void loadHubData()}
              disabled={isLoading}
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

        {status?.active ? (
          <Link
            to={`/dashboard/${safeCharacterId}/gathering/${
              activeOriginSlug ?? 'desmanche'
            }`}
            className="gathering-origin-summary gathering-origin-summary--icon"
          >
            <span
              className="gathering-origin-summary__visual"
              aria-hidden="true"
            >
              <span className="gathering-origin-summary__icon">
                {getActiveOriginLabel(status).slice(0, 2).toUpperCase()}
              </span>
            </span>

            <div className="gathering-origin-summary__content">
              <div className="gathering-origin-summary__top">
                <strong>Atividade em andamento</strong>
                <span>{getActiveOriginLabel(status)}</span>
              </div>

              <p>{getActiveMaterialName(status)}</p>
            </div>
          </Link>
        ) : null}

        <div className="gathering-card gathering-card--compact">
          <div className="gathering-card__header">
            <div className="gathering-card__title-group">
              <span className="gathering-card__eyebrow">
                Atividades disponíveis
              </span>

              <h2>Escolha o tipo de gathering</h2>

              <p className="gathering-card__description">
                Cada gathering possui materiais próprios, nível de proficiência
                e progressão independente.
              </p>
            </div>
          </div>

          {isLoading && !hasLoadedOnce ? (
            <div className="gathering-loading">
              <span className="gathering-loading__spinner" />
              <p>Carregando proficiências...</p>
            </div>
          ) : (
            <div className="gathering-origins gathering-origins--icons">
              {hubOrigins.map((origin) => {
                const skill = getSkillByOrigin(gatheringSkills, origin.key);
                const isActive = activeOrigin === origin.key;
                const isClassAffinity = Boolean(skill?.isClassAffinity);
                const progressPercent = getSkillProgressPercent(skill);
                const iconUrl = getGatheringOriginIcon(origin.key);

                return (
                  <Link
                    key={origin.key}
                    to={`/dashboard/${safeCharacterId}/gathering/${origin.slug}`}
                    className={getOriginClassName({
                      slug: origin.slug,
                      isActive,
                      isClassAffinity,
                    })}
                    aria-label={`Abrir gathering ${origin.label}`}
                    title={`${origin.description}${
                      origin.relatedClasses.length > 0
                        ? ` Classes: ${origin.relatedClasses.join(' / ')}`
                        : ''
                    }`}
                  >
                    <span className="gathering-origin-option__content">
                      <span
                        className="gathering-origin-option__visual"
                        aria-hidden="true"
                      >
                        {iconUrl ? (
                          <img
                            className="gathering-origin-option__icon"
                            src={iconUrl}
                            alt=""
                            draggable={false}
                          />
                        ) : (
                          <span className="gathering-origin-option__icon-fallback">
                            {getOriginIconFallback(origin.label)}
                          </span>
                        )}
                      </span>

                      <span className="gathering-origin-option__text">
                        <span className="gathering-origin-option__heading">
                          <span className="gathering-origin-option__name">
                            <strong>{origin.label}</strong>
                            {isActive ? (
                              <span
                                className="gathering-origin-option__active-dot"
                                aria-hidden="true"
                              />
                            ) : null}
                          </span>

                          <em className="gathering-origin-option__level-badge">
                            {getSkillLevelLabel(skill)}
                          </em>
                        </span>

                        <span
                          className="gathering-origin-option__track"
                          role="progressbar"
                          aria-label={`Progresso de ${origin.label}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progressPercent}
                        >
                          <i
                            aria-hidden="true"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </span>

                        <span className="gathering-origin-option__pills">
                          <span>{getSkillProgressLabel(skill)}</span>
                          <span>{origin.statLabel}</span>
                          <span>
                            {getOriginStatusLabel({
                              isActive,
                              isClassAffinity,
                            })}
                          </span>
                        </span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}

export default GatheringHubPage;
