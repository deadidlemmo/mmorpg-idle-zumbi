import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import {
  connectWorldBossSocket,
  type WorldBossSocket,
} from "../../../services/websocket/socketClient";
import {
  getActiveWorldBoss,
  joinWorldBoss,
  leaveWorldBoss,
} from "../api/world-bosses.api";
import type {
  WorldBossEventStatus,
  WorldBossRewardPreview,
  WorldBossStatusResponse,
} from "../types/world-bosses.types";
import "../styles/world-bosses.css";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.floor(value)));
}

function formatRemaining(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  return {
    ...overview.character,
    id: overview.character.id,
    name: overview.character.name,
    level: overview.character.level ?? 1,
    className:
      overview.character.class?.name ??
      overview.character.gameClass?.name ??
      "Sobrevivente",
    classId:
      overview.character.class?.name ??
      overview.character.gameClass?.name ??
      "sobrevivente",
    currentMap:
      overview.character.currentMap ??
      overview.character.map ??
      overview.progression?.currentMap ??
      null,
    map:
      overview.character.map ??
      overview.character.currentMap ??
      overview.progression?.currentMap ??
      null,
  } as DashboardCharacterViewModel;
}

function getStatusLabel(status: WorldBossEventStatus) {
  const labels: Record<WorldBossEventStatus, string> = {
    SCHEDULED: "Aguardando próximo alerta",
    LOBBY_OPEN: "Lobby aberto",
    ACTIVE: "Contenção em andamento",
    DEFEATED: "Ameaça derrotada",
    EXPIRED: "Evento expirado",
    REWARDED: "Recompensas processadas",
    CANCELLED: "Cancelado",
  };
  return labels[status];
}

function getRewardIcon(reward: WorldBossRewardPreview) {
  if (reward.rewardType === "GOLD") return "◉";
  if (reward.rewardType === "XP") return "✦";
  if (reward.rewardType === "PET_EGG") return "◈";
  if (reward.rewardType === "EQUIPMENT") return "◇";
  return "◆";
}

function getQuantityLabel(reward: WorldBossRewardPreview) {
  return reward.minQuantity === reward.maxQuantity
    ? formatNumber(reward.minQuantity)
    : `${formatNumber(reward.minQuantity)}–${formatNumber(reward.maxQuantity)}`;
}

function applyRealtimeStatus(
  previous: WorldBossStatusResponse | null,
  next: WorldBossStatusResponse,
) {
  if (!next.event) return previous;
  if (previous?.event && previous.event.id !== next.event.id) return previous;
  return {
    ...next,
    participant: next.participant ?? previous?.participant ?? null,
    eligible: next.eligible ?? previous?.eligible,
  };
}

export function WorldBossesPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [status, setStatus] = useState<WorldBossStatusResponse | null>(null);
  const [selectedStatus, setSelectedStatus] =
    useState<WorldBossStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!characterId) return;
    let disposed = false;

    async function load() {
      try {
        const [overviewResponse, bossResponse] = await Promise.all([
          getCharacterOverview(characterId!),
          getActiveWorldBoss(characterId!),
        ]);
        if (disposed) return;
        setOverview(overviewResponse);
        setStatus(bossResponse);
        setError(null);
      } catch (err) {
        if (disposed) return;
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as Ameaças Globais.",
        );
      } finally {
        if (!disposed) setIsLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [characterId]);

  useEffect(() => {
    const eventId = status?.event?.id;
    if (!eventId) return;

    const socket: WorldBossSocket = connectWorldBossSocket();
    const update = (payload: WorldBossStatusResponse) => {
      setStatus((current) => applyRealtimeStatus(current, payload));
      setSelectedStatus((current) => applyRealtimeStatus(current, payload));
    };
    const fail = (payload: { message?: string }) => {
      setError(payload.message ?? "Falha no WebSocket da Ameaça Global.");
    };

    socket.on("worldBoss:lobbyOpened", update);
    socket.on("worldBoss:joinedLobby", update);
    socket.on("worldBoss:leftLobby", update);
    socket.on("worldBoss:lobbyUpdated", update);
    socket.on("worldBoss:battleStarted", update);
    socket.on("worldBoss:damage", update);
    socket.on("worldBoss:progress", update);
    socket.on("worldBoss:defeated", update);
    socket.on("worldBoss:expired", update);
    socket.on("worldBoss:rewarded", update);
    socket.on("worldBoss:left", update);
    socket.on("worldBoss:error", fail);

    if (!socket.connected) socket.connect();
    socket.emit("worldBoss:join", { eventId });

    return () => {
      socket.emit("worldBoss:leave", { eventId });
      socket.off("worldBoss:lobbyOpened", update);
      socket.off("worldBoss:joinedLobby", update);
      socket.off("worldBoss:leftLobby", update);
      socket.off("worldBoss:lobbyUpdated", update);
      socket.off("worldBoss:battleStarted", update);
      socket.off("worldBoss:damage", update);
      socket.off("worldBoss:progress", update);
      socket.off("worldBoss:defeated", update);
      socket.off("worldBoss:expired", update);
      socket.off("worldBoss:rewarded", update);
      socket.off("worldBoss:left", update);
      socket.off("worldBoss:error", fail);
    };
  }, [status?.event?.id]);

  const character = useMemo(
    () => (overview ? buildCharacterViewModel(overview) : null),
    [overview],
  );

  if (!characterId) return <Navigate to="/characters" replace />;

  async function handleJoin() {
    const eventId = selectedStatus?.event?.id ?? status?.event?.id;
    if (!characterId || !eventId) return;
    setIsBusy(true);
    try {
      const next = await joinWorldBoss(characterId, eventId);
      setStatus(next);
      setSelectedStatus(next);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível entrar no lobby.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLeave() {
    if (!characterId || !status?.event) return;
    setIsBusy(true);
    try {
      const next = await leaveWorldBoss(characterId, status.event.id);
      setStatus(next);
      setSelectedStatus(null);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível sair da sala.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  if (!character) {
    return (
      <main className="world-bosses-loading">
        Carregando Ameaças Globais...
      </main>
    );
  }

  const event = status?.event ?? null;
  const boss = event?.worldBoss ?? null;
  const participant = status?.participant ?? null;
  const currentMap = character.currentMap ?? character.map ?? boss?.map ?? null;
  const canOpenLobby = Boolean(event && boss && status?.eligible?.canJoin);
  const canJoin = Boolean(canOpenLobby && !participant);
  const isJoined = Boolean(participant);
  const isBattleActive = event?.status === "ACTIVE";
  const lobbyCount = event?.lobbyCount ?? event?.participantCount ?? 0;
  const modalStatus = selectedStatus ?? status;
  const modalEvent = modalStatus?.event ?? null;
  const modalBoss = modalEvent?.worldBoss ?? null;

  return (
    <DashboardLayout character={character} hideHero>
      <main className="world-bosses-page">
        <section className="world-bosses-hero">
          <div>
            <span className="world-bosses-eyebrow">
              Alerta de contenção coletiva
            </span>
            <h1>Ameaças Globais</h1>
            <p>
              Entre no lobby quando uma ameaça do mapa atual for detectada. Ao
              fim da contagem, todos os sobreviventes inscritos iniciam a
              batalha juntos e compartilham o progresso em tempo real.
            </p>
          </div>
          <div
            className="world-bosses-hero__signal"
            aria-label="Sinal de alerta ativo"
          >
            <i />
            <span>Rádio de contenção</span>
          </div>
        </section>

        {error ? <div className="world-bosses-alert">{error}</div> : null}

        <section className="world-bosses-map-card">
          <div className="world-bosses-map-card__image" aria-hidden="true">
            ▧
          </div>
          <div>
            <span>Mapa atual</span>
            <h2>{currentMap?.name ?? "Zona desconhecida"}</h2>
            <p>
              Tier {currentMap?.tier ?? boss?.tier ?? "—"} • Níveis{" "}
              {currentMap?.minLevel ?? boss?.minLevel ?? "—"}–
              {currentMap?.maxLevel ?? boss?.maxLevel ?? "—"}
            </p>
          </div>
        </section>

        <section className="world-bosses-section-head">
          <div>
            <span>Ameaças detectadas</span>
            <h2>World Bosses do mapa</h2>
          </div>
          {event ? <small>Sala WebSocket: world-boss:{event.id}</small> : null}
        </section>

        {isLoading ? (
          <section className="world-bosses-card world-bosses-empty">
            Sincronizando sinais da zona...
          </section>
        ) : !event || !boss ? (
          <section className="world-bosses-card world-bosses-empty">
            <strong>Nenhuma ameaça global disponível neste mapa.</strong>
            <span>Aguarde o próximo alerta de contenção.</span>
          </section>
        ) : (
          <section
            className={`world-bosses-card world-bosses-boss ${canOpenLobby || isJoined ? "" : "world-bosses-boss--locked"}`}
          >
            <div className="world-bosses-boss__portrait" aria-hidden="true">
              {boss.imageUrl ? (
                <img src={boss.imageUrl} alt="" />
              ) : (
                <span>☣</span>
              )}
              {isBattleActive ? (
                <b className="world-bosses-live-indicator" />
              ) : null}
            </div>

            <div className="world-bosses-boss__content">
              <header className="world-bosses-boss__header">
                <div>
                  <span>
                    Tier {boss.tier} • {boss.map.name}
                  </span>
                  <h2>{boss.name}</h2>
                  <p>{boss.description}</p>
                </div>
                <div className="world-bosses-state">
                  {isBattleActive ? <i aria-hidden="true" /> : null}
                  <strong>{getStatusLabel(event.status)}</strong>
                </div>
              </header>

              <div className="world-bosses-hp">
                <div className="world-bosses-hp__top">
                  <span>HP global</span>
                  <strong>
                    {formatNumber(event.currentHp)} /{" "}
                    {formatNumber(event.maxHp)}
                  </strong>
                </div>
                <div className="world-bosses-hp__track">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, event.hpPercent))}%`,
                    }}
                  />
                </div>
                <small>
                  {Math.floor(event.progressPercent)}% de progresso coletivo
                </small>
              </div>

              <div className="world-bosses-metrics">
                <span>
                  <small>
                    {event.status === "LOBBY_OPEN"
                      ? "Início da batalha"
                      : "Tempo restante"}
                  </small>
                  <strong>
                    {formatRemaining(
                      event.status === "LOBBY_OPEN"
                        ? (event.remainingSecondsToStart ?? 0)
                        : (event.remainingSecondsToEnd ??
                            event.remainingSeconds),
                    )}
                  </strong>
                </span>
                <span>
                  <small>
                    {event.status === "LOBBY_OPEN"
                      ? "No lobby"
                      : "Participantes"}
                  </small>
                  <strong>{lobbyCount}</strong>
                </span>
                <span>
                  <small>Seu dano</small>
                  <strong>{formatNumber(participant?.damageDealt ?? 0)}</strong>
                </span>
                <span>
                  <small>Sua contribuição</small>
                  <strong>
                    {(participant?.contributionPercent ?? 0).toFixed(2)}%
                  </strong>
                </span>
              </div>

              <div className="world-bosses-actions">
                {canJoin ? (
                  <button
                    type="button"
                    onClick={() => setSelectedStatus(status)}
                    disabled={isBusy}
                  >
                    Entrar no lobby
                  </button>
                ) : null}
                {isJoined &&
                (event.status === "LOBBY_OPEN" || event.status === "ACTIVE") ? (
                  <button
                    type="button"
                    className="world-bosses-actions__ghost"
                    onClick={handleLeave}
                    disabled={isBusy}
                  >
                    Sair da sala
                  </button>
                ) : null}
                {!canOpenLobby && !isJoined ? (
                  <span className="world-bosses-eligible world-bosses-eligible--pending">
                    {status?.eligible?.reason ?? "Indisponível"}
                  </span>
                ) : null}
                {participant?.eligibleForReward ? (
                  <span className="world-bosses-eligible">
                    Participação mínima atingida
                  </span>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {boss ? (
          <section className="world-bosses-card world-bosses-rewards">
            <div className="world-bosses-rewards__head">
              <span>Loot de contenção</span>
              <h2>Recompensas possíveis</h2>
            </div>
            <div className="world-bosses-rewards__grid">
              {boss.rewards.map((reward) => (
                <article
                  key={reward.id}
                  className={`world-bosses-reward world-bosses-reward--${(reward.rarity ?? reward.item?.rarity ?? "common").toLowerCase()}`}
                >
                  <div className="world-bosses-reward__icon" aria-hidden="true">
                    {getRewardIcon(reward)}
                  </div>
                  <div>
                    <strong>{reward.item?.name ?? reward.rewardType}</strong>
                    <span>{getQuantityLabel(reward)}</span>
                    <small>
                      {reward.guaranteed
                        ? "Garantido"
                        : `${reward.chance}% de chance`}
                      {reward.onlyIfDefeated ? " • só se derrotar" : ""}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {modalEvent && modalBoss && selectedStatus ? (
          <div
            className="world-bosses-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="world-boss-lobby-title"
          >
            <div className="world-bosses-modal__panel">
              <button
                type="button"
                className="world-bosses-modal__close"
                onClick={() => setSelectedStatus(null)}
                aria-label="Fechar lobby"
              >
                ×
              </button>
              <span className="world-bosses-eyebrow">Join Lobby</span>
              <h2 id="world-boss-lobby-title">
                Entrar no lobby: {modalBoss.name}
              </h2>
              <p>
                {modalBoss.map.name} • Tier {modalBoss.tier} • nível mínimo{" "}
                {modalBoss.minLevel}
              </p>
              <div className="world-bosses-modal__stats">
                <span>
                  <small>Batalha começa em</small>
                  <strong>
                    {formatRemaining(modalEvent.remainingSecondsToStart ?? 0)}
                  </strong>
                </span>
                <span>
                  <small>Sobreviventes no lobby</small>
                  <strong>{modalEvent.participantCount}</strong>
                </span>
                <span>
                  <small>Regra</small>
                  <strong>Sem entrada tardia</strong>
                </span>
              </div>
              <div className="world-bosses-modal__rewards">
                {modalBoss.rewards.slice(0, 4).map((reward) => (
                  <span key={reward.id}>
                    {getRewardIcon(reward)}{" "}
                    {reward.item?.name ?? reward.rewardType}
                  </span>
                ))}
              </div>
              <div className="world-bosses-actions">
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={isBusy || modalEvent.status !== "LOBBY_OPEN"}
                >
                  Entrar no lobby
                </button>
                <button
                  type="button"
                  className="world-bosses-actions__ghost"
                  onClick={() => setSelectedStatus(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
