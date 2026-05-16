import { isAxiosError } from "axios";
import {
  ArrowRight,
  Clock,
  Lock,
  PackageOpen,
  ShieldAlert,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import goldIcon from "../../../assets/images/coins/gold.png";
import { normalizeClassName } from "../../characters/api/characters.api";
import {
  buildMapVisualStyle,
  getMapImageByName,
} from "../../auto-combat/assets/auto-combat-map-assets";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import "../../gathering/styles/gathering.css";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import { getAvailableIncursions } from "../api/incursions.api";
import { useIncursionsRealtime } from "../realtime/useIncursionsRealtime";
import "../styles/incursions.css";
import type {
  Incursion,
  IncursionLootPreview,
  IncursionSession,
  IncursionsAvailableResponse,
} from "../types/incursions.types";

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;
  const className =
    character.class?.name ?? character.gameClass?.name ?? "Lutador";

  return {
    ...character,
    id: character.id,
    name: character.name,
    className,
    classId: character.classId ?? normalizeClassName(className),
    level: character.level ?? 1,
    xp: character.xp ?? 0,
    totalXp:
      character.totalXp ??
      character.levelProgress?.totalXp ??
      character.xp ??
      0,
    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,
    status: character.status ?? "ACTIVE",
  };
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatRemaining(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatReward(loot: IncursionLootPreview) {
  const quantity =
    loot.minQuantity === loot.maxQuantity
      ? `${loot.minQuantity}`
      : `${loot.minQuantity}-${loot.maxQuantity}`;
  const chance = loot.guaranteed ? "Garantido" : `${loot.chance}%`;

  if (loot.rewardType === "XP") return `${quantity} EXP • ${chance}`;
  if (loot.rewardType === "GOLD") return `${quantity} gold • ${chance}`;

  return `${loot.item?.name ?? loot.rewardType} x${quantity} • ${chance}`;
}

function formatMapLevelRange(
  map?: { minLevel?: number | null; maxLevel?: number | null } | null,
): string | null {
  const minLevel = Number(map?.minLevel);
  const maxLevel = Number(map?.maxLevel);
  const hasMinLevel = Number.isFinite(minLevel) && minLevel > 0;
  const hasMaxLevel = Number.isFinite(maxLevel) && maxLevel > 0;

  if (hasMinLevel && hasMaxLevel) return `Nv. ${minLevel}–${maxLevel}`;
  if (hasMinLevel) return `A partir do Nv. ${minLevel}`;
  if (hasMaxLevel) return `Até Nv. ${maxLevel}`;

  return null;
}

function getMapTierClassName(tier?: number | null): string {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) return "gathering-map-tier--common";
  if (safeTier >= 9) return "gathering-map-tier--legendary";
  if (safeTier >= 7) return "gathering-map-tier--epic";
  if (safeTier >= 5) return "gathering-map-tier--rare";
  if (safeTier >= 3) return "gathering-map-tier--uncommon";

  return "gathering-map-tier--common";
}

function getDifficultyLabel(difficulty: string) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    MEDIUM: "Média",
    HIGH: "Alta",
    EXTREME: "Extrema",
  };

  return labels[difficulty] ?? difficulty;
}

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (Array.isArray(data?.message)) return data.message.join(" ");
    if (data?.message) return data.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Não foi possível executar a ação de incursão.";
}

function getIncursionStatusLabel(params: {
  incursion: Incursion;
  activeSession?: IncursionSession | null;
  rewardedSession?: IncursionSession | null;
}) {
  if (params.activeSession?.incursionId === params.incursion.id) {
    return params.activeSession.status === "ACTIVE"
      ? "Em andamento"
      : "Finalizando";
  }

  if (params.rewardedSession?.incursionId === params.incursion.id) {
    return "Recompensada";
  }

  if (!params.incursion.canStart) return "Bloqueada";
  return "Disponível";
}

function getStatusTone(statusLabel: string) {
  if (/andamento|finalizando/i.test(statusLabel)) return "running";
  if (/bloqueada/i.test(statusLabel)) return "locked";
  if (/recompensada|conclu/i.test(statusLabel)) return "done";
  return "available";
}

function GoldAmount({ value }: { value: number }) {
  return (
    <span className="incursions-gold-amount">
      <img src={goldIcon} alt="" aria-hidden="true" />
      <strong>{value.toLocaleString("pt-BR")}</strong>
    </span>
  );
}

function IncursionArt({ incursion }: { incursion: Incursion }) {
  return (
    <span className="incursion-art" aria-hidden="true">
      <span className="incursion-art__sigil">
        {incursion.name.slice(0, 2).toUpperCase()}
      </span>
      <Sparkles size={20} />
    </span>
  );
}

export function IncursionsPage() {
  const { characterId } = useParams();
  const { state: realtimeState, start, cancel } = useIncursionsRealtime();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [data, setData] = useState<IncursionsAvailableResponse | null>(null);
  const [modalIncursionId, setModalIncursionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!characterId) return;

    const [overviewResponse, incursionsResponse] = await Promise.all([
      getCharacterOverview(characterId),
      getAvailableIncursions(characterId),
    ]);

    setOverview(overviewResponse);
    setData(incursionsResponse);
  }, [characterId]);

  useEffect(() => {
    if (!characterId) return;

    async function load() {
      try {
        setIsLoading(true);
        await loadData();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [characterId, loadData]);

  useEffect(() => {
    if (!modalIncursionId) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalIncursionId(null);
    };

    document.body.classList.add("incursions-modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("incursions-modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalIncursionId]);

  useEffect(() => {
    if (!characterId || !data?.activeSession || realtimeState.session) return;

    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [characterId, data?.activeSession, loadData, realtimeState.session]);

  const activeSession = realtimeState.session ?? data?.activeSession ?? null;
  const rewardedSession = data?.rewardedSession ?? null;
  const incursions = data?.incursions ?? [];
  const modalIncursion =
    incursions.find((incursion) => incursion.id === modalIncursionId) ?? null;
  const currentMap =
    data?.currentMap ?? activeSession?.incursion.map ?? incursions[0]?.map ?? null;
  const currentMapName = currentMap?.name ?? "Mapa não definido";
  const currentMapImage = getMapImageByName(currentMapName);
  const currentMapVisualStyle = buildMapVisualStyle(currentMapImage);
  const currentMapTierClassName = getMapTierClassName(currentMap?.tier);
  const currentMapLevelRangeLabel = formatMapLevelRange(currentMap);
  const hasBlockingActivity = incursions.some((incursion) =>
    (incursion.lockedReasons ?? []).some((reason) =>
      /auto-combate|gathering|atividade/i.test(reason),
    ),
  );

  if (!characterId) return <Navigate to="/characters" replace />;

  if (!overview && isLoading) {
    return (
      <div className="incursions-page incursions-page--loading">
        Carregando incursões...
      </div>
    );
  }

  if (!overview) return <Navigate to="/characters" replace />;

  const character = buildCharacterViewModel(overview);

  async function handleStart(incursionId: string) {
    setActionId(incursionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await start(incursionId);
      if (response?.message) setSuccessMessage(response.message);
      if (response?.session) setModalIncursionId(null);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  async function handleCancel() {
    if (!activeSession || activeSession.status !== "ACTIVE") return;

    setActionId("cancel-incursion");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await cancel();
      if (response?.message) setSuccessMessage(response.message);
      setModalIncursionId(null);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  return (
    <DashboardLayout character={character} hideHero>
      <main className="incursions-page">
        <section className="incursions-hero">
          <div>
            <span className="incursions-hero__eyebrow">
              Atividade de risco do mapa atual
            </span>
            <h1>Incursões</h1>
            <p>
              Operações temporizadas do mapa atual. Escolha uma incursão, pague
              o custo em gold e acompanhe a operação pela Activity Bar global em
              tempo real.
            </p>
          </div>
        </section>

        <section
          className={[
            "gathering-origin-map-context",
            "gathering-origin-map-context--standalone",
            currentMapTierClassName,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`Mapa atual: ${currentMapName}`}
        >
          <div
            className="gathering-origin-map-context__media"
            style={currentMapVisualStyle}
          >
            {!currentMapImage ? (
              <span aria-hidden="true">
                {currentMapName.slice(0, 2).toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="gathering-origin-map-context__body">
            <span className="gathering-origin-map-context__eyebrow">
              Mapa atual
            </span>

            <div className="gathering-origin-map-context__title-row">
              <h2>{currentMapName}</h2>

              <div className="gathering-origin-map-context__chips">
                {currentMap?.tier ? (
                  <span className="gathering-origin-map-context__chip gathering-origin-map-context__chip--tier">
                    Tier {currentMap.tier}
                  </span>
                ) : null}

                {currentMapLevelRangeLabel ? (
                  <span className="gathering-origin-map-context__chip gathering-origin-map-context__chip--level">
                    {currentMapLevelRangeLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <aside className="gathering-origin-premium-card incursions-premium-card">
          <div
            className="gathering-origin-premium-card__badge"
            aria-hidden="true"
          >
            i
          </div>

          <div>
            <h2>Benefícios premium</h2>
            <p>
              Alertas avançados, priorização visual e relatórios compactos para
              operações idle de alto risco.
            </p>
          </div>

          <button type="button" className="gathering-origin-premium-card__button">
            Ver benefícios
          </button>
        </aside>

        {errorMessage || realtimeState.errorMessage ? (
          <div className="incursions-alert incursions-alert--error">
            {errorMessage ?? realtimeState.errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="incursions-alert incursions-alert--success">
            {successMessage}
          </div>
        ) : null}
        {hasBlockingActivity && !activeSession ? (
          <div className="incursions-alert incursions-alert--warning">
            Este personagem já está em outra atividade principal. Encerre a
            atividade atual antes de iniciar uma incursão.
          </div>
        ) : null}

        <section
          className="incursions-content-grid"
          aria-label="Incursões e atividade atual"
        >
          <main className="incursions-main-column">
            <section className="gathering-card gathering-card--compact incursions-list-panel">
              <header className="incursions-list-panel__header">
                <div className="gathering-card__title-group incursions-list-panel__title-group">
                  <span className="gathering-card__eyebrow">Operações</span>
                  <h2>Incursões deste mapa</h2>
                </div>
              </header>

              {isLoading ? (
                <div className="incursions-empty incursions-empty--inline">
                  <span className="gathering-loading__spinner" />
                  <p>Carregando incursões...</p>
                </div>
              ) : incursions.length > 0 ? (
                <div
                  className="incursions-grid"
                  aria-label="Incursões do mapa atual"
                >
                  {incursions.map((incursion) => {
                    const lockedReasons = incursion.lockedReasons ?? [];
                    const isLocked = !incursion.canStart;
                    const isRunningThis =
                      activeSession?.incursionId === incursion.id;
                    const statusLabel = getIncursionStatusLabel({
                      incursion,
                      activeSession,
                      rewardedSession,
                    });
                    const statusTone = getStatusTone(statusLabel);

                    return (
                      <button
                        className={[
                          "incursion-card",
                          isLocked ? "is-locked" : "",
                          isRunningThis ? "is-running" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={incursion.id}
                        type="button"
                        onClick={() => setModalIncursionId(incursion.id)}
                      >
                        <IncursionArt incursion={incursion} />

                        <span className="incursion-card__content">
                          <span className="incursion-card__top">
                            <em>Tier {incursion.tier}</em>
                            <strong
                              className={`incursion-card__status incursion-card__status--${statusTone}`}
                            >
                              {statusLabel}
                            </strong>
                          </span>

                          <span className="incursion-card__name">
                            {incursion.name}
                          </span>

                          <span className="incursion-card__meta">
                            <span>
                              <Clock size={14} />
                              {formatDuration(incursion.durationSeconds)}
                            </span>
                            <GoldAmount value={incursion.goldCost} />
                          </span>

                          <span className="incursion-card__difficulty">
                            {getDifficultyLabel(incursion.difficulty)} • Risco{" "}
                            {incursion.riskLevel}/10
                          </span>

                          {isRunningThis ? (
                            <small>Esta operação está em andamento.</small>
                          ) : null}
                          {isLocked && lockedReasons[0] ? (
                            <small>
                              <Lock size={13} /> {lockedReasons[0]}
                            </small>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="incursions-empty incursions-empty--inline">
                  <PackageOpen size={24} />
                  <h2>Nenhuma incursão neste mapa</h2>
                  <p>Troque de mapa para encontrar novas operações.</p>
                </div>
              )}
            </section>
          </main>

          <aside className="incursions-side-column">
            <section className="gathering-origin-side-section gathering-origin-side-section--current">
              <div className="gathering-origin-section-divider">
                <span>Atividade atual</span>
              </div>

              <div className="gathering-card gathering-card--active incursions-current-card">
                {activeSession ? (
                  <div className="incursions-current-card__content">
                    <div className="incursions-current-card__head">
                      <div className="incursions-current-card__icon">
                        <ShieldAlert size={22} />
                      </div>

                      <div>
                        <span>
                          {activeSession.status === "ACTIVE"
                            ? "Incursão ativa"
                            : "Finalizando recompensas"}
                        </span>
                        <h2>{activeSession.incursion.name}</h2>
                        <p>{activeSession.incursion.map.name}</p>
                      </div>
                    </div>

                    <div className="incursions-current-card__meta">
                      <span>
                        Status
                        <strong>
                          {activeSession.status === "ACTIVE"
                            ? "Em andamento"
                            : "Recompensa automática"}
                        </strong>
                      </span>
                      <span>
                        Custo pago
                        <GoldAmount value={activeSession.goldCostPaid} />
                      </span>
                    </div>

                    <div className="incursions-current-card__progress">
                      <div>
                        <span>Progresso</span>
                        <strong>
                          {Math.min(
                            100,
                            Math.max(0, activeSession.progressPercent),
                          )}
                          %
                        </strong>
                      </div>
                      <i>
                        <em
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, activeSession.progressPercent),
                            )}%`,
                          }}
                        />
                      </i>
                    </div>

                    <strong className="incursions-current-card__timer">
                      {activeSession.status === "ACTIVE"
                        ? `Termina em ${formatRemaining(activeSession.remainingSeconds)}`
                        : "Entregando automaticamente"}
                    </strong>

                    {activeSession.status === "ACTIVE" ? (
                      <button
                        className="incursions-danger-button"
                        type="button"
                        disabled={
                          actionId === "cancel-incursion" ||
                          realtimeState.isBusy
                        }
                        onClick={() => void handleCancel()}
                      >
                        <XCircle size={15} />
                        {actionId === "cancel-incursion" ||
                        realtimeState.isBusy
                          ? "Cancelando..."
                          : "Cancelar incursão"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="incursions-current-card__empty">
                    <ShieldAlert size={24} />
                    <h2>Nenhuma incursão ativa</h2>
                    <p>Escolha uma incursão para iniciar uma operação.</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>

        {modalIncursion ? (
          <div
            className="incursions-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setModalIncursionId(null);
              }
            }}
          >
            <section
              className="incursions-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="incursions-modal-title"
            >
              <header className="incursions-modal__hero">
                <IncursionArt incursion={modalIncursion} />

                <div className="incursions-modal__title-group">
                  <span>Detalhes da operação</span>
                  <h2 id="incursions-modal-title">{modalIncursion.name}</h2>
                  <p>{modalIncursion.description}</p>
                </div>

                <button
                  className="incursions-modal__close"
                  type="button"
                  aria-label="Fechar detalhes da incursão"
                  onClick={() => setModalIncursionId(null)}
                >
                  <X size={18} />
                </button>
              </header>

              <div className="incursions-modal__body">
                <div className="incursions-modal__stats">
                  <span>
                    Mapa
                    <strong>{modalIncursion.map.name}</strong>
                  </span>
                  <span>
                    Tier
                    <strong>{modalIncursion.tier}</strong>
                  </span>
                  <span>
                    Nível recomendado
                    <strong>
                      {modalIncursion.minLevel}–{modalIncursion.maxLevel}
                    </strong>
                  </span>
                  <span>
                    Duração
                    <strong>
                      {formatDuration(modalIncursion.durationSeconds)}
                    </strong>
                  </span>
                  <span>
                    Custo
                    <GoldAmount value={modalIncursion.goldCost} />
                  </span>
                  <span>
                    Dificuldade
                    <strong>{getDifficultyLabel(modalIncursion.difficulty)}</strong>
                  </span>
                  <span>
                    Risco
                    <strong>{modalIncursion.riskLevel}/10</strong>
                  </span>
                  <span>
                    Status
                    <strong>
                      {getIncursionStatusLabel({
                        incursion: modalIncursion,
                        activeSession,
                        rewardedSession,
                      })}
                    </strong>
                  </span>
                </div>

                <section className="incursions-modal__rewards">
                  <strong>
                    <PackageOpen size={16} /> Loot e EXP possíveis
                  </strong>

                  {modalIncursion.rewardsPreview.length > 0 ? (
                    <ul>
                      {modalIncursion.rewardsPreview.map((loot) => (
                        <li key={loot.id ?? `${loot.rewardType}-${loot.sortOrder}`}>
                          <Sparkles size={13} /> {formatReward(loot)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>As recompensas desta operação ainda são desconhecidas.</p>
                  )}
                </section>

                {modalIncursion.lockedReasons?.length ? (
                  <div className="incursions-modal__lock-message">
                    <Lock size={15} /> {modalIncursion.lockedReasons[0]}
                  </div>
                ) : null}
              </div>

              <footer className="incursions-modal__actions">
                {activeSession?.incursionId === modalIncursion.id &&
                activeSession.status === "ACTIVE" ? (
                  <button
                    className="incursions-danger-button"
                    type="button"
                    disabled={
                      actionId === "cancel-incursion" || realtimeState.isBusy
                    }
                    onClick={() => void handleCancel()}
                  >
                    <XCircle size={15} />
                    {actionId === "cancel-incursion" || realtimeState.isBusy
                      ? "Cancelando..."
                      : "Cancelar incursão"}
                  </button>
                ) : (
                  <button
                    className="incursions-primary-button"
                    type="button"
                    disabled={
                      !modalIncursion.canStart ||
                      Boolean(activeSession) ||
                      actionId === modalIncursion.id ||
                      realtimeState.isBusy
                    }
                    onClick={() => void handleStart(modalIncursion.id)}
                  >
                    {actionId === modalIncursion.id || realtimeState.isBusy
                      ? "Iniciando..."
                      : activeSession
                        ? "Atividade em andamento"
                        : modalIncursion.canStart
                          ? "Iniciar incursão"
                          : "Incursão bloqueada"}
                    <ArrowRight size={16} />
                  </button>
                )}

                <button
                  className="incursions-secondary-button"
                  type="button"
                  onClick={() => setModalIncursionId(null)}
                >
                  Fechar
                </button>
              </footer>
            </section>
          </div>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
