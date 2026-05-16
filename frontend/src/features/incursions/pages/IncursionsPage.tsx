import { isAxiosError } from "axios";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Coins,
  Lock,
  MapPin,
  PackageOpen,
  Radar,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { normalizeClassName } from "../../characters/api/characters.api";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import { getAvailableIncursions } from "../api/incursions.api";
import { useIncursionsRealtime } from "../realtime/useIncursionsRealtime";
import "../styles/incursions.css";
import type {
  ClaimIncursionResponse,
  Incursion,
  IncursionLootPreview,
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
  activeIncursionId?: string | null;
}) {
  if (params.activeIncursionId === params.incursion.id) return "Em andamento";
  if (!params.incursion.canStart) return "Bloqueada";
  return "Disponível";
}

export function IncursionsPage() {
  const { characterId } = useParams();
  const {
    state: realtimeState,
    start,
    claim,
    refresh,
  } = useIncursionsRealtime();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [data, setData] = useState<IncursionsAvailableResponse | null>(null);
  const [selectedIncursionId, setSelectedIncursionId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [claimSummary, setClaimSummary] =
    useState<ClaimIncursionResponse | null>(null);

  const loadData = useCallback(async () => {
    if (!characterId) return;

    const [overviewResponse, incursionsResponse] = await Promise.all([
      getCharacterOverview(characterId),
      getAvailableIncursions(characterId),
    ]);

    setOverview(overviewResponse);
    setData(incursionsResponse);

    if (!selectedIncursionId && incursionsResponse.incursions[0]) {
      setSelectedIncursionId(incursionsResponse.incursions[0].id);
    }
  }, [characterId, selectedIncursionId]);

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

  const activeSession = realtimeState.session ?? data?.activeSession ?? null;
  const incursions = data?.incursions ?? [];
  const selectedIncursion =
    incursions.find((incursion) => incursion.id === selectedIncursionId) ??
    incursions[0] ??
    null;
  const currentMap =
    data?.currentMap ??
    selectedIncursion?.map ??
    activeSession?.incursion.map ??
    null;
  const gold = data?.character.gold ?? 0;
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
    setClaimSummary(null);

    try {
      const response = await start(incursionId);
      if (response?.message) setSuccessMessage(response.message);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  async function handleClaim(sessionId: string) {
    setActionId(sessionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await claim(sessionId);
      if (response) {
        setClaimSummary(response);
        setSuccessMessage(response.message);
      }
      await Promise.all([loadData(), refresh()]);
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
              Escolha uma operação temporizada, pague o custo em gold e
              acompanhe tudo pela Activity Bar global em tempo real.
            </p>
          </div>

          <div className="incursions-hero__status">
            <div className="incursions-wallet">
              <Coins size={18} />
              <span>Gold</span>
              <strong>{gold.toLocaleString("pt-BR")}</strong>
            </div>
            <div
              className="incursions-socket-pill"
              data-online={realtimeState.isSocketConnected}
            >
              <Radar size={16} />
              {realtimeState.isSocketConnected
                ? "Realtime conectado"
                : "Fallback por status"}
            </div>
          </div>
        </section>

        <section className="incursions-current-map">
          <MapPin size={20} />
          <div>
            <span>Mapa atual</span>
            <strong>{currentMap?.name ?? "Mapa não definido"}</strong>
          </div>
          <em>Tier {currentMap?.tier ?? "—"}</em>
        </section>

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
            Este personagem já está em outra atividade principal. Encerre ou
            colete a atividade atual antes de iniciar uma incursão.
          </div>
        ) : null}

        {activeSession ? (
          <section className="incursions-active">
            <div className="incursions-active__icon">
              {activeSession.canClaim ? (
                <CheckCircle2 size={26} />
              ) : (
                <ShieldAlert size={26} />
              )}
            </div>
            <div>
              <span>
                {activeSession.canClaim
                  ? "Coleta disponível"
                  : "Incursão ativa"}
              </span>
              <h2>{activeSession.incursion.name}</h2>
              <p>
                {activeSession.incursion.map.name} • custo pago:{" "}
                {activeSession.goldCostPaid.toLocaleString("pt-BR")} gold
              </p>
              <div className="incursions-active__progress">
                <i
                  style={{
                    width: `${Math.min(100, Math.max(0, activeSession.progressPercent))}%`,
                  }}
                />
              </div>
            </div>
            <div className="incursions-active__actions">
              <strong>
                {activeSession.canClaim
                  ? "Recompensas pendentes"
                  : `Termina em ${formatRemaining(activeSession.remainingSeconds)}`}
              </strong>
              <button
                type="button"
                disabled={
                  !activeSession.canClaim || actionId === activeSession.id
                }
                onClick={() => void handleClaim(activeSession.id)}
              >
                {actionId === activeSession.id
                  ? "Coletando..."
                  : "Coletar recompensas"}
              </button>
            </div>
          </section>
        ) : null}

        {claimSummary ? (
          <section className="incursions-claim-summary">
            <h2>Resumo da coleta</h2>
            <p>
              EXP: {claimSummary.xpGained.toLocaleString("pt-BR")} • Gold:{" "}
              {claimSummary.goldGained.toLocaleString("pt-BR")}
            </p>
            <div>
              {claimSummary.rewards.map((reward, index) => (
                <span key={`${reward.rewardType}-${reward.itemId ?? index}`}>
                  {reward.itemName ?? reward.item?.name ?? reward.rewardType} x
                  {reward.quantity}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="incursions-board">
          <div className="incursions-grid" aria-label="Incursões do mapa atual">
            {incursions.map((incursion) => {
              const lockedReasons = incursion.lockedReasons ?? [];
              const isLocked = !incursion.canStart;
              const isRunningThis = activeSession?.incursionId === incursion.id;
              const statusLabel = getIncursionStatusLabel({
                incursion,
                activeIncursionId: activeSession?.incursionId,
              });

              return (
                <button
                  className={`incursion-card ${isLocked ? "is-locked" : ""} ${selectedIncursion?.id === incursion.id ? "is-selected" : ""}`}
                  key={incursion.id}
                  type="button"
                  onClick={() => setSelectedIncursionId(incursion.id)}
                >
                  <span className="incursion-card__art" aria-hidden="true">
                    <Sparkles size={22} />
                  </span>
                  <span className="incursion-card__content">
                    <span className="incursion-card__top">
                      <em>Tier {incursion.tier}</em>
                      <strong>{statusLabel}</strong>
                    </span>
                    <span className="incursion-card__name">
                      {incursion.name}
                    </span>
                    <span className="incursion-card__meta">
                      <span>
                        <Clock size={14} />{" "}
                        {formatDuration(incursion.durationSeconds)}
                      </span>
                      <span>
                        <Coins size={14} />{" "}
                        {incursion.goldCost.toLocaleString("pt-BR")}
                      </span>
                    </span>
                    {isRunningThis ? (
                      <small>Esta é a incursão em andamento.</small>
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

          <aside className="incursions-detail">
            {selectedIncursion ? (
              <>
                <div className="incursions-detail__header">
                  <span>Detalhes da operação</span>
                  <h2>{selectedIncursion.name}</h2>
                  <p>{selectedIncursion.description}</p>
                </div>

                <div className="incursions-detail__stats">
                  <span>
                    Dificuldade:{" "}
                    {getDifficultyLabel(selectedIncursion.difficulty)}
                  </span>
                  <span>Risco {selectedIncursion.riskLevel}/10</span>
                  <span>
                    Nível {selectedIncursion.minLevel}–
                    {selectedIncursion.maxLevel}
                  </span>
                  <span>
                    {formatDuration(selectedIncursion.durationSeconds)}
                  </span>
                </div>

                <div className="incursions-detail__rewards">
                  <strong>
                    <PackageOpen size={16} /> Loot possível
                  </strong>
                  <ul>
                    {selectedIncursion.rewardsPreview.map((loot) => (
                      <li
                        key={loot.id ?? `${loot.rewardType}-${loot.sortOrder}`}
                      >
                        <Sparkles size={13} /> {formatReward(loot)}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  className="incursions-detail__action"
                  type="button"
                  disabled={
                    !selectedIncursion.canStart ||
                    Boolean(activeSession) ||
                    actionId === selectedIncursion.id ||
                    realtimeState.isBusy
                  }
                  onClick={() => void handleStart(selectedIncursion.id)}
                >
                  {actionId === selectedIncursion.id || realtimeState.isBusy
                    ? "Iniciando..."
                    : activeSession
                      ? "Atividade em andamento"
                      : selectedIncursion.canStart
                        ? "Iniciar incursão"
                        : "Incursão bloqueada"}
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <div className="incursions-empty">
                <PackageOpen size={24} />
                <h2>Nenhuma incursão neste mapa</h2>
                <p>Troque de mapa para encontrar novas operações.</p>
              </div>
            )}
          </aside>
        </section>
      </main>
    </DashboardLayout>
  );
}
