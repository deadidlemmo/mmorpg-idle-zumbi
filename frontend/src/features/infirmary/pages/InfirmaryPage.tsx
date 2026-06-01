import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Timer, WalletCards } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import goldIcon from '../../../assets/images/coins/gold.png';
import npcInfirmaryCelia from '../../../assets/images/npcs/npc_coleta_dona_celia.png';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import { buildGatheringDashboardCharacter } from '../../gathering/utils/gathering-dashboard-character';
import '../../gathering/styles/gathering.css';
import {
  cancelInfirmaryTreatment,
  claimInfirmaryTreatment,
  extractInfirmaryApiError,
  getInfirmaryStatus,
  instantInfirmaryTreatment,
  startInfirmaryTreatment,
} from '../api/infirmary.api';
import '../styles/infirmary.css';
import type { InfirmaryStatusResponse } from '../types/infirmary.types';

function formatSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatGold(value: number) {
  return new Intl.NumberFormat('pt-BR').format(Math.max(0, Math.floor(value)));
}

function getLiveRemainingSeconds(response: InfirmaryStatusResponse | null) {
  const endsAt = response?.infirmary.treatment.endsAt;

  if (!endsAt) {
    return 0;
  }

  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
}

function getLiveProgressPercent(response: InfirmaryStatusResponse | null) {
  if (!response?.infirmary.treatment.active) {
    return 0;
  }

  const remainingSeconds = getLiveRemainingSeconds(response);
  const durationSeconds = Math.max(1, response.infirmary.durationSeconds);

  return Math.max(
    0,
    Math.min(100, ((durationSeconds - remainingSeconds) / durationSeconds) * 100),
  );
}

export function InfirmaryPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? '';
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [status, setStatus] = useState<InfirmaryStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);

  const mergeCharacter = useCallback(
    (response: InfirmaryStatusResponse) => {
      setCharacter((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          status: response.character.status,
          currentHp: response.character.currentHp,
          maxHp: response.character.maxHp,
          gold: response.character.gold,
          cash: response.character.cash,
          wallet: {
            ...(current.wallet ?? {}),
            gold: response.character.gold,
            cash: response.character.cash,
          },
          currencies: {
            ...(current.currencies ?? {}),
            gold: response.character.gold,
            cash: response.character.cash,
          },
        };
      });
    },
    [],
  );

  const loadStatus = useCallback(
    async (showLoading = false) => {
      if (!safeCharacterId) {
        return;
      }

      try {
        if (showLoading) {
          setIsLoading(true);
        }

        const response = await getInfirmaryStatus(safeCharacterId);
        setStatus(response);
        mergeCharacter(response);
      } catch (error) {
        setErrorMessage(extractInfirmaryApiError(error));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [mergeCharacter, safeCharacterId],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!safeCharacterId) {
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage(null);

        const [overviewResponse, infirmaryResponse] = await Promise.all([
          getCharacterOverview(safeCharacterId),
          getInfirmaryStatus(safeCharacterId),
        ]);

        if (!isMounted) {
          return;
        }

        const nextCharacter = buildGatheringDashboardCharacter(overviewResponse);

        setCharacter({
          ...nextCharacter,
          status: infirmaryResponse.character.status,
          currentHp: infirmaryResponse.character.currentHp,
          maxHp: infirmaryResponse.character.maxHp,
          gold: infirmaryResponse.character.gold,
          cash: infirmaryResponse.character.cash,
          wallet: {
            ...(nextCharacter.wallet ?? {}),
            gold: infirmaryResponse.character.gold,
            cash: infirmaryResponse.character.cash,
          },
        });
        setStatus(infirmaryResponse);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(extractInfirmaryApiError(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [safeCharacterId]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      if (status?.infirmary.treatment.active) {
        void loadStatus();
      }
    }, 10_000);

    return () => window.clearInterval(refreshId);
  }, [loadStatus, status?.infirmary.treatment.active]);

  const remainingSeconds = useMemo(() => {
    void nowTick;
    return getLiveRemainingSeconds(status);
  }, [nowTick, status]);

  const treatmentProgressPercent = useMemo(() => {
    void nowTick;
    return getLiveProgressPercent(status);
  }, [nowTick, status]);

  const hpPercent = status
    ? Math.max(
        0,
        Math.min(
          100,
          (status.infirmary.currentHp / Math.max(1, status.infirmary.maxHp)) *
            100,
        ),
      )
    : 0;

  const hasFinishedTreatment =
    Boolean(status?.infirmary.treatment.active) && remainingSeconds <= 0;

  async function runAction(action: () => Promise<InfirmaryStatusResponse>) {
    try {
      setIsActionLoading(true);
      setErrorMessage(null);
      setFeedbackMessage(null);

      const response = await action();

      setStatus(response);
      mergeCharacter(response);
      setFeedbackMessage(response.message ?? 'Enfermaria atualizada.');
    } catch (error) {
      setErrorMessage(extractInfirmaryApiError(error));
    } finally {
      setIsActionLoading(false);
    }
  }

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando enfermaria...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar Enfermaria</h1>
        <p>{errorMessage ?? 'Nao foi possivel carregar este personagem.'}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para selecao
        </Link>
      </main>
    );
  }

  const freeDurationSeconds = status?.infirmary.costs.free.durationSeconds ?? 1800;
  const instantCost = status?.infirmary.costs.instant.amount ?? 0;
  const characterGold = status?.character.gold ?? character.gold ?? 0;
  const hasActiveTreatment = Boolean(status?.infirmary.treatment.active);
  const canPayInstant =
    Boolean(status?.infirmary.canInstantTreatment) &&
    !hasActiveTreatment &&
    characterGold >= instantCost;
  const privateDoctorHint = hasActiveTreatment
    ? 'Cancele o SUS para usar atendimento particular.'
    : instantCost <= 0
      ? 'Nenhum atendimento necessario no momento.'
      : 'Cura total na hora. Custa';

  return (
    <DashboardLayout character={character} hideHero>
      <section className="infirmary-page gathering-page gathering-page--clean">
        <article
          className="gathering-origin-lore-card gathering-origin-lore-card--npc gathering-origin-npc infirmary-hero"
          aria-label="Enfermaria do Abrigo"
        >
          <div className="gathering-origin-npc__stage" aria-hidden="true">
            <div className="gathering-origin-npc__portrait infirmary-hero__portrait">
              <img
                src={npcInfirmaryCelia}
                alt=""
                className="infirmary-hero__image"
              />
            </div>
          </div>

          <div className="gathering-origin-npc__content">
            <div className="gathering-origin-npc__meta">
              <strong className="gathering-origin-npc__name">
                Dra. Celia, medica do abrigo
              </strong>
              <span className="gathering-origin-npc__role">
                Servico de enfermaria
              </span>
            </div>

            <h2>Enfermaria do Abrigo</h2>
            <blockquote>
              "Ninguem volta para a rua sangrando no meu plantao."
            </blockquote>
            <p>
              Recupere sobreviventes feridos com atendimento gratuito do abrigo
              ou pague uma consulta imediata quando cada minuto importar.
            </p>
          </div>
        </article>

        <aside className="gathering-origin-premium-card infirmary-premium-card">
          <div
            className="gathering-origin-premium-card__badge"
            aria-hidden="true"
          >
            i
          </div>

          <div>
            <h2>Beneficios premium</h2>
            <p>Fila, bonus e notificacoes avancadas para recuperacao.</p>
          </div>

          <button
            type="button"
            className="gathering-origin-premium-card__button"
          >
            Ver beneficios
          </button>
        </aside>

        <section className="infirmary-grid">
          <article className="infirmary-panel infirmary-status-card">
            <div className="infirmary-panel__heading">
              <span>Status clinico</span>
              <strong>{status?.character.name ?? character.name}</strong>
            </div>

            <div className="infirmary-vitals">
              <div>
                <span>Vida atual</span>
                <strong>
                  {status?.infirmary.currentHp ?? character.currentHp} /{' '}
                  {status?.infirmary.maxHp ?? character.maxHp}
                </strong>
              </div>

              <span
                className="infirmary-vitals__badge"
                data-state={status?.infirmary.isDefeated ? 'critical' : 'stable'}
              >
                {status?.infirmary.isDefeated ? 'Derrotado' : 'Estavel'}
              </span>
            </div>

            <div
              className="infirmary-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(hpPercent)}
            >
              <span style={{ width: `${hpPercent}%` }} />
            </div>

            <div className="infirmary-current-treatment">
              <div className="infirmary-current-treatment__icon">
                <Timer size={20} />
              </div>

              <div>
                <span>Atendimento gratuito</span>
                <strong>
                  {status?.infirmary.treatment.active
                    ? hasFinishedTreatment
                      ? 'Pronto para alta'
                      : `Alta em ${formatSeconds(remainingSeconds)}`
                    : 'Nenhum atendimento ativo'}
                </strong>
              </div>
            </div>

            {status?.infirmary.treatment.active ? (
              <div
                className="infirmary-progress infirmary-progress--treatment"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.floor(treatmentProgressPercent)}
              >
                <span style={{ width: `${treatmentProgressPercent}%` }} />
              </div>
            ) : null}

            <p className="infirmary-reason">
              {status?.infirmary.reason ?? 'Carregando situacao medica.'}
            </p>

            {feedbackMessage ? (
              <p className="infirmary-feedback infirmary-feedback--success">
                {feedbackMessage}
              </p>
            ) : null}

            {errorMessage ? (
              <p className="infirmary-feedback infirmary-feedback--error">
                {errorMessage}
              </p>
            ) : null}
          </article>

          <div className="infirmary-actions">
            <article className="infirmary-treatment-card">
              <div className="infirmary-treatment-card__icon">
                <ShieldCheck size={24} />
              </div>

              <div className="infirmary-treatment-card__body">
                <span>Atendimento gratuito</span>
                <h3>SUS do Abrigo</h3>
                <p>
                  Recuperacao completa em {formatSeconds(freeDurationSeconds)}.
                  Ideal para voltar depois sem gastar Gold.
                </p>
              </div>

              {hasFinishedTreatment ? (
                <button
                  type="button"
                  className="infirmary-action-button infirmary-action-button--primary"
                  disabled={isActionLoading}
                  onClick={() =>
                    void runAction(() => claimInfirmaryTreatment(safeCharacterId))
                  }
                >
                  Concluir recuperacao
                </button>
              ) : status?.infirmary.treatment.active ? (
                <button
                  type="button"
                  className="infirmary-action-button infirmary-action-button--secondary"
                  disabled={isActionLoading}
                  onClick={() =>
                    void runAction(() => cancelInfirmaryTreatment(safeCharacterId))
                  }
                >
                  Cancelar SUS
                </button>
              ) : (
                <button
                  type="button"
                  className="infirmary-action-button infirmary-action-button--primary"
                  disabled={
                    isActionLoading ||
                    !status?.infirmary.canStartTreatment ||
                    status.infirmary.treatment.active
                  }
                  onClick={() =>
                    void runAction(() => startInfirmaryTreatment(safeCharacterId))
                  }
                >
                  Iniciar recuperacao
                </button>
              )}
            </article>

            <article className="infirmary-treatment-card infirmary-treatment-card--private">
              <div className="infirmary-treatment-card__icon">
                <WalletCards size={24} />
              </div>

              <div className="infirmary-treatment-card__body">
                <span>Atendimento imediato</span>
                <h3>Medico particular</h3>
                <p>
                  {privateDoctorHint}{' '}
                  {instantCost > 0 && !hasActiveTreatment ? (
                    <strong className="infirmary-gold">
                      <img src={goldIcon} alt="" aria-hidden="true" />
                      {formatGold(instantCost)}
                    </strong>
                  ) : null}
                  {instantCost > 0 && !hasActiveTreatment ? ' Gold.' : null}
                </p>
              </div>

              <button
                type="button"
                className="infirmary-action-button infirmary-action-button--gold"
                disabled={isActionLoading || !canPayInstant}
                onClick={() =>
                  void runAction(() => instantInfirmaryTreatment(safeCharacterId))
                }
              >
                {hasActiveTreatment
                  ? 'SUS em andamento'
                  : instantCost <= 0
                    ? 'HP cheio'
                    : characterGold < instantCost
                      ? 'Gold insuficiente'
                      : 'Pagar e recuperar'}
              </button>
            </article>
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
