import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock3,
  HeartPulse,
  LoaderCircle,
  ShieldCheck,
  Stethoscope,
  Swords,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import goldIcon from '../../../assets/images/coins/gold.webp';
import npcInfirmaryCelia from '../../../assets/images/npcs/npc_coleta_dona_celia.webp';
import { canRunNetworkRefresh } from '../../../utils/networkRefresh';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import { useAutoCombatRealtime } from '../../auto-combat/realtime/useAutoCombatRealtime';
import { buildGatheringDashboardCharacter } from '../../gathering/utils/gathering-dashboard-character';
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
  const { hydrateCharacterHealth } = useAutoCombatRealtime();
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

  const reconcileAutoCombatHealth = useCallback(
    (response: InfirmaryStatusResponse) => {
      hydrateCharacterHealth({
        currentHp: response.character.currentHp,
        maxHp: response.character.maxHp,
        isDefeated: response.infirmary.isDefeated,
      });
    },
    [hydrateCharacterHealth],
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
        reconcileAutoCombatHealth(response);
      } catch (error) {
        setErrorMessage(extractInfirmaryApiError(error));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [mergeCharacter, reconcileAutoCombatHealth, safeCharacterId],
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
        reconcileAutoCombatHealth(infirmaryResponse);
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
  }, [reconcileAutoCombatHealth, safeCharacterId]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      if (
        status?.infirmary.treatment.active &&
        canRunNetworkRefresh()
      ) {
        void loadStatus();
      }
    }, 15_000);

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
      reconcileAutoCombatHealth(response);
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
  const autoCombatRecovery =
    status?.infirmary.autoCombatRecovery ?? status?.autoCombatRecovery ?? null;
  const preservedTrackedEnemiesCount = Math.max(
    0,
    Math.floor(
      Number(
        autoCombatRecovery?.preservedTrackedEnemiesCount ??
          status?.infirmary.preservedTrackedEnemiesCount,
      ) || 0,
    ),
  );
  const hasPreservedTrackedEnemies = Boolean(
    (autoCombatRecovery?.hasPreservedTrackedEnemies ??
      status?.infirmary.hasPreservedTrackedEnemies ??
      preservedTrackedEnemiesCount > 0) && preservedTrackedEnemiesCount > 0,
  );
  const autoCombatReturnUrl = autoCombatRecovery?.mapId
    ? `/dashboard/${safeCharacterId}/auto-combat?mapId=${encodeURIComponent(
        autoCombatRecovery.mapId,
      )}&resume=preserved`
    : `/dashboard/${safeCharacterId}/auto-combat?resume=preserved`;
  const canReturnToPreservedCombat =
    hasPreservedTrackedEnemies &&
    !status?.infirmary.isDefeated &&
    !hasActiveTreatment;
  const currentHp = status?.infirmary.currentHp ?? character.currentHp;
  const maxHp = status?.infirmary.maxHp ?? character.maxHp;
  const missingHp = Math.max(
    0,
    status?.infirmary.missingHp ?? maxHp - currentHp,
  );
  const hpPercent = Math.max(
    0,
    Math.min(100, (currentHp / Math.max(1, maxHp)) * 100),
  );
  const healthState = status?.infirmary.isDefeated
    ? 'critical'
    : hpPercent >= 100
      ? 'healthy'
      : 'injured';
  const healthLabel =
    healthState === 'critical'
      ? 'Derrotado'
      : healthState === 'healthy'
        ? 'Saudável'
        : 'Ferido';
  const treatmentStatusLabel = hasActiveTreatment
    ? hasFinishedTreatment
      ? 'Pronto para alta'
      : `Alta em ${formatSeconds(remainingSeconds)}`
    : missingHp > 0
      ? 'Aguardando atendimento'
      : 'Nenhum tratamento necessário';

  function renderActionIcon(defaultIcon: React.ReactNode) {
    return isActionLoading ? (
      <LoaderCircle className="infirmary-action-button__spinner" size={17} />
    ) : (
      defaultIcon
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="infirmary-page">
        <header className="infirmary-intro" aria-labelledby="infirmary-title">
          <div className="infirmary-intro__portrait" aria-hidden="true">
            <img src={npcInfirmaryCelia} alt="" />
          </div>

          <div className="infirmary-intro__content">
            <span className="infirmary-eyebrow">
              <Stethoscope size={15} />
              Enfermaria do Abrigo
            </span>
            <h1 id="infirmary-title">Recupere seu sobrevivente</h1>
            <blockquote>
              “Ninguém volta para a rua sangrando no meu plantão.”
            </blockquote>
            <p>Dra. Célia · Médica do Abrigo</p>
          </div>
        </header>

        {feedbackMessage ? (
          <p
            className="infirmary-feedback infirmary-feedback--success"
            role="status"
          >
            <CheckCircle2 size={18} />
            {feedbackMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p
            className="infirmary-feedback infirmary-feedback--error"
            role="alert"
          >
            <Activity size={18} />
            {errorMessage}
          </p>
        ) : null}

        <article className="infirmary-status-card" data-health-state={healthState}>
          <header className="infirmary-status-card__header">
            <div className="infirmary-title-group">
              <span className="infirmary-title-group__icon" aria-hidden="true">
                <HeartPulse size={22} />
              </span>
              <div>
                <span className="infirmary-eyebrow">Estado clínico</span>
                <h2>{status?.character.name ?? character.name}</h2>
              </div>
            </div>

            <span className="infirmary-health-badge" data-state={healthState}>
              {healthLabel}
            </span>
          </header>

          <div className="infirmary-status-card__body">
            <section className="infirmary-health" aria-label="Vida atual">
              <div className="infirmary-health__value">
                <div>
                  <span>Vida atual</span>
                  <strong>
                    {formatGold(currentHp)}
                    <small> / {formatGold(maxHp)} HP</small>
                  </strong>
                </div>
                <span>{Math.floor(hpPercent)}%</span>
              </div>

              <div
                className="infirmary-progress"
                role="progressbar"
                aria-label="Vida do sobrevivente"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.floor(hpPercent)}
              >
                <span style={{ width: `${hpPercent}%` }} />
              </div>

              <p>
                {missingHp > 0
                  ? `${formatGold(missingHp)} HP para recuperar.`
                  : 'Vida completa. O sobrevivente está pronto.'}
              </p>
            </section>

            <section className="infirmary-treatment-state" aria-label="Tratamento atual">
              <Clock3 size={22} aria-hidden="true" />
              <div>
                <span>Tratamento atual</span>
                <strong>{treatmentStatusLabel}</strong>
                <p>
                  {hasActiveTreatment
                    ? hasFinishedTreatment
                      ? 'Conclua o atendimento para restaurar toda a Vida.'
                      : 'A recuperação continua mesmo fora desta página.'
                    : missingHp > 0
                      ? 'Escolha abaixo entre esperar ou usar Gold.'
                      : 'Nenhuma ação é necessária agora.'}
                </p>
              </div>

              {hasActiveTreatment ? (
                <div
                  className="infirmary-progress infirmary-progress--treatment"
                  role="progressbar"
                  aria-label="Progresso do tratamento"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.floor(treatmentProgressPercent)}
                >
                  <span style={{ width: `${treatmentProgressPercent}%` }} />
                </div>
              ) : null}
            </section>
          </div>

          <p className="infirmary-reason">
            <Activity size={17} aria-hidden="true" />
            <span>
              {status?.infirmary.reason ?? 'Carregando situação médica.'}
            </span>
          </p>

          {hasPreservedTrackedEnemies ? (
            <div
              className="infirmary-auto-combat-recovery"
              role="status"
              aria-live="polite"
            >
              <Swords size={21} aria-hidden="true" />

              <div className="infirmary-auto-combat-recovery__body">
                <span>Combate interrompido</span>
                <strong data-testid="infirmary-preserved-enemies-count">
                  {preservedTrackedEnemiesCount} ameaça
                  {preservedTrackedEnemiesCount === 1 ? '' : 's'} preservada
                  {preservedTrackedEnemiesCount === 1 ? '' : 's'}
                </strong>
                <p>
                  {canReturnToPreservedCombat
                    ? 'Volte ao combate e continue de onde parou.'
                    : 'Recupere-se para enfrentar os alvos já rastreados.'}
                </p>
              </div>

              {canReturnToPreservedCombat ? (
                <Link
                  to={autoCombatReturnUrl}
                  className="infirmary-action-button infirmary-action-button--combat"
                >
                  <Swords size={16} />
                  Voltar ao combate
                </Link>
              ) : (
                <span className="infirmary-auto-combat-recovery__pending">
                  Aguardando alta
                </span>
              )}
            </div>
          ) : null}
        </article>

        <section className="infirmary-treatments" aria-labelledby="treatments-title">
          <header className="infirmary-section-heading">
            <div>
              <span className="infirmary-eyebrow">Tratamentos</span>
              <h2 id="treatments-title">Escolha como se recuperar</h2>
            </div>
            <p>As duas opções restauram toda a Vida do sobrevivente.</p>
          </header>

          <div className="infirmary-treatment-grid">
            <article className="infirmary-treatment-card infirmary-treatment-card--free">
              <header className="infirmary-treatment-card__header">
                <span className="infirmary-treatment-card__icon" aria-hidden="true">
                  <ShieldCheck size={23} />
                </span>
                <div>
                  <span>Sem custo</span>
                  <h3>SUS do Abrigo</h3>
                </div>
              </header>

              <p className="infirmary-treatment-card__description">
                Recupere toda a Vida enquanto o personagem descansa na enfermaria.
              </p>

              <dl className="infirmary-treatment-facts">
                <div>
                  <dt>Tempo</dt>
                  <dd>{formatSeconds(freeDurationSeconds)}</dd>
                </div>
                <div>
                  <dt>Custo</dt>
                  <dd>Gratuito</dd>
                </div>
              </dl>

              {hasFinishedTreatment ? (
                <button
                  type="button"
                  className="infirmary-action-button infirmary-action-button--primary"
                  disabled={isActionLoading}
                  aria-busy={isActionLoading}
                  onClick={() =>
                    void runAction(() => claimInfirmaryTreatment(safeCharacterId))
                  }
                >
                  {renderActionIcon(<CheckCircle2 size={17} />)}
                  Concluir tratamento
                </button>
              ) : status?.infirmary.treatment.active ? (
                <button
                  type="button"
                  className="infirmary-action-button infirmary-action-button--secondary"
                  disabled={isActionLoading}
                  aria-busy={isActionLoading}
                  onClick={() =>
                    void runAction(() => cancelInfirmaryTreatment(safeCharacterId))
                  }
                >
                  {renderActionIcon(<X size={17} />)}
                  Cancelar tratamento
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
                  aria-busy={isActionLoading}
                  onClick={() =>
                    void runAction(() => startInfirmaryTreatment(safeCharacterId))
                  }
                >
                  {renderActionIcon(<Clock3 size={17} />)}
                  Iniciar tratamento
                </button>
              )}
            </article>

            <article className="infirmary-treatment-card infirmary-treatment-card--private">
              <header className="infirmary-treatment-card__header">
                <span className="infirmary-treatment-card__icon" aria-hidden="true">
                  <WalletCards size={23} />
                </span>
                <div>
                  <span>Recuperação imediata</span>
                  <h3>Médico particular</h3>
                </div>
              </header>

              <p className="infirmary-treatment-card__description">
                {hasActiveTreatment
                  ? 'Cancele o tratamento gratuito para usar o atendimento imediato.'
                  : instantCost <= 0
                    ? 'A Vida já está completa. Nenhum atendimento é necessário.'
                    : 'Recupere toda a Vida agora e volte imediatamente às atividades.'}
              </p>

              <dl className="infirmary-treatment-facts">
                <div>
                  <dt>Tempo</dt>
                  <dd>Imediato</dd>
                </div>
                <div>
                  <dt>Custo</dt>
                  <dd className="infirmary-gold">
                    {instantCost > 0 ? (
                      <>
                        <img src={goldIcon} alt="" aria-hidden="true" />
                        {formatGold(instantCost)} Gold
                      </>
                    ) : (
                      'Nenhum'
                    )}
                  </dd>
                </div>
              </dl>

              {instantCost > 0 ? (
                <p className="infirmary-balance">
                  Seu saldo: <strong>{formatGold(characterGold)} Gold</strong>
                </p>
              ) : null}

              <button
                type="button"
                className="infirmary-action-button infirmary-action-button--gold"
                disabled={isActionLoading || !canPayInstant}
                aria-busy={isActionLoading}
                onClick={() =>
                  void runAction(() => instantInfirmaryTreatment(safeCharacterId))
                }
              >
                {renderActionIcon(<Zap size={17} />)}
                {hasActiveTreatment
                  ? 'Tratamento em andamento'
                  : instantCost <= 0
                    ? 'Vida completa'
                    : characterGold < instantCost
                      ? 'Gold insuficiente'
                      : 'Recuperar agora'}
              </button>
            </article>
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
