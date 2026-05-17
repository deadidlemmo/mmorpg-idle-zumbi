import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Biohazard, ShieldAlert, XCircle } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import {
  buildMapVisualStyle,
  getMapImageByName,
} from "../../auto-combat/assets/auto-combat-map-assets";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import {
  connectWorldBossSocket,
  type WorldBossSocket,
} from "../../../services/websocket/socketClient";
import {
  getAvailableWorldBosses,
  joinWorldBoss,
  leaveWorldBoss,
} from "../api/world-bosses.api";
import type {
  WorldBossEventStatus,
  WorldBossRewardPreview,
  WorldBossStatusResponse,
} from "../types/world-bosses.types";
import "../../dashboard/dashboard.css";
import "../../gathering/styles/gathering.css";
import "../../incursions/styles/incursions.css";
import "../styles/world-bosses.css";

const ACTIVE_PANEL_STATUSES = new Set<WorldBossEventStatus>([
  "LOBBY_OPEN",
  "ACTIVE",
]);

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

function getCompactStatusLabel(status: WorldBossEventStatus) {
  const labels: Record<WorldBossEventStatus, string> = {
    SCHEDULED: "Disponível em breve",
    LOBBY_OPEN: "Lobby",
    ACTIVE: "Em batalha",
    DEFEATED: "Concluído",
    EXPIRED: "Expirado",
    REWARDED: "Recompensado",
    CANCELLED: "Cancelado",
  };
  return labels[status];
}

function getCardStatusLabel(status: WorldBossStatusResponse) {
  const event = status.event;
  if (!event) return "Indisponível";
  if (status.participant && event.status === "LOBBY_OPEN") return "No lobby";
  if (status.participant && event.status === "ACTIVE") return "Em batalha";
  if (event.status === "LOBBY_OPEN" && !status.eligible?.canJoin)
    return "Bloqueado";
  return getCompactStatusLabel(event.status);
}

function getCardStatusTone(status: WorldBossStatusResponse) {
  const event = status.event;
  if (!event) return "locked";
  if (status.participant && event.status === "ACTIVE") return "battle";
  if (status.participant && event.status === "LOBBY_OPEN") return "lobby";
  if (event.status === "LOBBY_OPEN" && status.eligible?.canJoin)
    return "available";
  if (event.status === "ACTIVE") return "battle";
  if (event.status === "DEFEATED" || event.status === "REWARDED")
    return "completed";
  if (event.status === "EXPIRED" || event.status === "CANCELLED")
    return "locked";
  return "scheduled";
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

function getTierRarity(tier?: number | null): string {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) return "common";
  if (safeTier >= 9) return "legendary";
  if (safeTier >= 7) return "epic";
  if (safeTier >= 5) return "rare";
  if (safeTier >= 3) return "uncommon";

  return "common";
}

function getMapTierClassName(tier?: number | null): string {
  return `gathering-map-tier--${getTierRarity(tier)}`;
}

function getWorldBossTierClassName(tier?: number | null): string {
  return `world-bosses-tier--${getTierRarity(tier)}`;
}

function getEventTimerLabel(eventStatus: WorldBossEventStatus) {
  if (eventStatus === "LOBBY_OPEN") return "Batalha começa em";
  if (eventStatus === "SCHEDULED") return "Lobby abre em";
  if (eventStatus === "ACTIVE") return "Tempo restante";
  return "Encerramento";
}

function getEventRemainingSeconds(status: WorldBossStatusResponse | null) {
  const event = status?.event;
  if (!event) return 0;
  if (event.status === "LOBBY_OPEN") return event.remainingSecondsToStart ?? 0;
  if (event.status === "SCHEDULED") return event.remainingSecondsToStart ?? 0;
  return event.remainingSecondsToEnd ?? event.remainingSeconds;
}

function mergeWorldBossStatus(
  previous: WorldBossStatusResponse | null,
  next: WorldBossStatusResponse,
) {
  if (!next.event) return previous;
  return {
    ...next,
    eligible: next.eligible ?? previous?.eligible,
  };
}

function upsertWorldBossStatus(
  previous: WorldBossStatusResponse[],
  next: WorldBossStatusResponse,
) {
  if (!next.event) return previous;
  let wasUpdated = false;
  const updated = previous.map((item) => {
    if (item.event?.id !== next.event?.id) return item;
    wasUpdated = true;
    return mergeWorldBossStatus(item, next) ?? item;
  });
  return wasUpdated ? updated : [...previous, next];
}

function getPanelStatus(statuses: WorldBossStatusResponse[]) {
  const joined = statuses.find(
    (status) =>
      status.event &&
      status.participant &&
      status.event.status !== "CANCELLED" &&
      status.event.status !== "REWARDED",
  );
  if (joined) return joined;
  return (
    statuses.find(
      (status) =>
        status.event && ACTIVE_PANEL_STATUSES.has(status.event.status),
    ) ?? null
  );
}

export function WorldBossesPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [bossStatuses, setBossStatuses] = useState<WorldBossStatusResponse[]>(
    [],
  );
  const [detailsEventId, setDetailsEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!characterId) return;
    let disposed = false;

    async function load() {
      try {
        const [overviewResponse, bossesResponse] = await Promise.all([
          getCharacterOverview(characterId!),
          getAvailableWorldBosses(characterId!),
        ]);
        if (disposed) return;
        setOverview(overviewResponse);
        setBossStatuses(bossesResponse.events);
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

  const realtimeEventIdsKey = useMemo(
    () =>
      bossStatuses
        .map((status) => status.event?.id)
        .filter((eventId): eventId is string => Boolean(eventId))
        .sort()
        .join("|"),
    [bossStatuses],
  );

  useEffect(() => {
    if (!realtimeEventIdsKey) return;
    const eventIds = realtimeEventIdsKey.split("|").filter(Boolean);
    if (eventIds.length === 0) return;

    const socket: WorldBossSocket = connectWorldBossSocket();
    const update = (payload: WorldBossStatusResponse) => {
      setBossStatuses((current) => upsertWorldBossStatus(current, payload));
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
    eventIds.forEach((eventId) => {
      socket.emit("worldBoss:join", { eventId });
    });

    return () => {
      eventIds.forEach((eventId) => {
        socket.emit("worldBoss:leave", { eventId });
      });
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
  }, [realtimeEventIdsKey]);

  useEffect(() => {
    if (!detailsEventId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsEventId(null);
    };

    document.body.classList.add("world-bosses-modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("world-bosses-modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailsEventId]);

  const character = useMemo(
    () => (overview ? buildCharacterViewModel(overview) : null),
    [overview],
  );

  if (!characterId) return <Navigate to="/characters" replace />;

  async function handleJoin(eventId: string) {
    if (!characterId) return;
    setIsBusy(true);
    try {
      const next = await joinWorldBoss(characterId, eventId);
      setBossStatuses((current) => upsertWorldBossStatus(current, next));
      setDetailsEventId(null);
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

  async function handleLeave(eventId: string) {
    if (!characterId) return;
    setIsBusy(true);
    try {
      const next = await leaveWorldBoss(characterId, eventId);
      setBossStatuses((current) => upsertWorldBossStatus(current, next));
      setDetailsEventId(null);
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
      <main className="incursions-page incursions-page--loading world-bosses-loading">
        Carregando Ameaças Globais...
      </main>
    );
  }

  const panelStatus = getPanelStatus(bossStatuses);
  const panelEvent = panelStatus?.event ?? null;
  const panelBoss = panelEvent?.worldBoss ?? null;
  const panelTierClassName = getWorldBossTierClassName(panelBoss?.tier);
  const panelParticipant = panelStatus?.participant ?? null;
  const currentMap =
    character.currentMap ??
    character.map ??
    bossStatuses[0]?.event?.worldBoss.map ??
    null;
  const currentMapName = currentMap?.name ?? "Área de contenção global";
  const currentMapImage = getMapImageByName(currentMapName);
  const currentMapVisualStyle = buildMapVisualStyle(currentMapImage);
  const currentMapTierClassName = getMapTierClassName(currentMap?.tier);
  const currentMapLevelRange = formatMapLevelRange(currentMap);
  const canJoinPanel = Boolean(
    panelStatus?.eligible?.canJoin && !panelParticipant && panelEvent,
  );
  const isJoinedPanel = Boolean(panelParticipant);
  const isBattleActive = panelEvent?.status === "ACTIVE";
  const isLobbyOpen = panelEvent?.status === "LOBBY_OPEN";
  const lobbyCount =
    panelEvent?.lobbyCount ?? panelEvent?.participantCount ?? 0;
  const panelTimerSeconds = getEventRemainingSeconds(panelStatus ?? null);
  const detailsStatus = detailsEventId
    ? (bossStatuses.find((status) => status.event?.id === detailsEventId) ??
      null)
    : null;
  const detailsEvent = detailsStatus?.event ?? null;
  const detailsBoss = detailsEvent?.worldBoss ?? null;
  const detailsParticipant = detailsStatus?.participant ?? null;
  const detailsTimerSeconds = getEventRemainingSeconds(detailsStatus);
  const detailsTierClassName = getWorldBossTierClassName(detailsBoss?.tier);
  const bossCards = bossStatuses.filter((status) => status.event);

  return (
    <DashboardLayout character={character} hideHero>
      <main className="incursions-page gathering-page--origin world-bosses-page">
        <section className="incursions-hero world-bosses-hero">
          <div>
            <span className="incursions-hero__eyebrow">
              Evento global do mapa atual
            </span>
            <h1>Ameaças Globais</h1>
            <p>
              Enfrente ameaças globais, entre no lobby e acompanhe a contenção
              coletiva em tempo real.
            </p>
          </div>
        </section>

        {error ? (
          <div className="incursions-alert incursions-alert--error world-bosses-alert">
            {error}
          </div>
        ) : null}

        <section
          className={[
            "gathering-origin-map-context",
            "gathering-origin-map-context--standalone",
            "world-bosses-map-context",
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
                {currentMapLevelRange ? (
                  <span className="gathering-origin-map-context__chip gathering-origin-map-context__chip--level">
                    {currentMapLevelRange}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <aside className="gathering-origin-premium-card incursions-premium-card world-bosses-premium-card">
          <div
            className="gathering-origin-premium-card__badge"
            aria-hidden="true"
          >
            i
          </div>
          <div>
            <h2>Benefícios premium</h2>
            <p>
              Alertas avançados, leitura compacta do lobby e preparação visual
              para eventos de contenção.
            </p>
          </div>
          <button
            type="button"
            className="gathering-origin-premium-card__button"
          >
            Ver benefícios
          </button>
        </aside>

        <section
          className="incursions-content-grid world-bosses-content-grid"
          aria-label="World Bosses e lobby atual"
        >
          <main className="incursions-main-column world-bosses-main-column">
            <section className="gathering-card gathering-card--compact incursions-list-panel world-bosses-list-panel">
              <header className="incursions-list-panel__header">
                <div className="gathering-card__title-group incursions-list-panel__title-group">
                  <span className="gathering-card__eyebrow">
                    Ameaças detectadas
                  </span>
                  <h2>World Bosses deste mapa</h2>
                </div>
              </header>

              {isLoading ? (
                <div className="incursions-empty incursions-empty--inline world-bosses-empty">
                  <span className="gathering-loading__spinner" />
                  <p>Sincronizando sinais da zona...</p>
                </div>
              ) : bossCards.length === 0 ? (
                <div className="incursions-empty incursions-empty--inline world-bosses-empty">
                  <ShieldAlert size={24} />
                  <strong>Nenhuma ameaça global disponível neste mapa.</strong>
                  <p>Aguarde o próximo alerta de contenção.</p>
                </div>
              ) : (
                <div className="world-bosses-list">
                  {bossCards.map((bossStatus) => {
                    const bossEvent = bossStatus.event!;
                    const cardBoss = bossEvent.worldBoss;
                    const cardCanJoin = Boolean(
                      bossStatus.eligible?.canJoin && !bossStatus.participant,
                    );
                    const cardIsLocked =
                      !bossStatus.eligible?.canJoin && !bossStatus.participant;
                    const cardLobbyCount =
                      bossEvent.lobbyCount ?? bossEvent.participantCount ?? 0;
                    const cardTimerSeconds =
                      getEventRemainingSeconds(bossStatus);
                    const cardTone = getCardStatusTone(bossStatus);
                    const bossTierClassName = getWorldBossTierClassName(
                      cardBoss.tier,
                    );

                    return (
                      <article
                        key={bossEvent.id}
                        className={[
                          "world-bosses-boss-card",
                          bossTierClassName,
                          `world-bosses-boss-card--${cardTone}`,
                          cardIsLocked ? "world-bosses-boss-card--locked" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <button
                          type="button"
                          className="world-bosses-boss-card__button"
                          onClick={() => setDetailsEventId(bossEvent.id)}
                        >
                          <div
                            className="world-bosses-boss-card__portrait"
                            aria-hidden="true"
                          >
                            {cardBoss.imageUrl ? (
                              <img src={cardBoss.imageUrl} alt="" />
                            ) : (
                              <span>
                                <Biohazard size={30} />
                              </span>
                            )}
                          </div>
                          <div className="world-bosses-boss-card__content">
                            <div className="world-bosses-boss-card__topline">
                              <span>Tier {cardBoss.tier}</span>
                              <strong>{getCardStatusLabel(bossStatus)}</strong>
                            </div>
                            <h3>{cardBoss.name}</h3>
                            <dl>
                              <div>
                                <dt>{getEventTimerLabel(bossEvent.status)}</dt>
                                <dd>{formatRemaining(cardTimerSeconds)}</dd>
                              </div>
                              <div>
                                <dt>Requisito</dt>
                                <dd>Nível {cardBoss.minLevel}+</dd>
                              </div>
                              <div>
                                <dt>Lobby</dt>
                                <dd>{cardLobbyCount} sobreviventes</dd>
                              </div>
                            </dl>
                            <span className="world-bosses-boss-card__cta">
                              Ver detalhes
                              <ArrowRight size={14} />
                            </span>
                          </div>
                        </button>
                        {cardCanJoin ? (
                          <button
                            type="button"
                            className="incursions-primary-button world-bosses-boss-card__quick-action"
                            onClick={() => void handleJoin(bossEvent.id)}
                            disabled={isBusy}
                          >
                            Entrar no lobby
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </main>

          <aside className="incursions-side-column world-bosses-side-column">
            <section className="gathering-origin-side-section gathering-origin-side-section--current">
              <div className="gathering-origin-section-divider">
                <span>Lobby / batalha</span>
              </div>

              <div
                className={[
                  "gathering-card",
                  "gathering-card--active",
                  "incursions-current-card",
                  "world-bosses-current-card",
                  panelTierClassName,
                ].join(" ")}
              >
                {!panelEvent || !panelBoss ? (
                  <div className="world-bosses-activity-empty">
                    <ShieldAlert size={24} />
                    <strong>Nenhum lobby ativo</strong>
                    <p>Escolha um World Boss para entrar no lobby.</p>
                  </div>
                ) : (
                  <div className="world-bosses-activity-content">
                    <div className="world-bosses-activity-boss">
                      <div
                        className="world-bosses-activity-boss__icon"
                        aria-hidden="true"
                      >
                        {panelBoss.imageUrl ? (
                          <img src={panelBoss.imageUrl} alt="" />
                        ) : (
                          <Biohazard size={24} />
                        )}
                      </div>
                      <div>
                        <span>{panelBoss.map.name}</span>
                        <h3>{panelBoss.name}</h3>
                        <p>{getStatusLabel(panelEvent.status)}</p>
                      </div>
                    </div>

                    <div className="world-bosses-state">
                      {isBattleActive ? <i aria-hidden="true" /> : null}
                      <strong>
                        {isLobbyOpen
                          ? "Aguardando no lobby"
                          : getStatusLabel(panelEvent.status)}
                      </strong>
                    </div>

                    <div className="world-bosses-hp">
                      <div className="world-bosses-hp__top">
                        <span>HP global</span>
                        <strong>
                          {formatNumber(panelEvent.currentHp)} /{" "}
                          {formatNumber(panelEvent.maxHp)}
                        </strong>
                      </div>
                      <div className="world-bosses-hp__track">
                        <i
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, panelEvent.hpPercent),
                            )}%`,
                          }}
                        />
                      </div>
                      <small>
                        {Math.floor(panelEvent.progressPercent)}% de progresso
                        coletivo
                      </small>
                    </div>

                    <div className="world-bosses-activity-metrics">
                      <span>
                        <small>{getEventTimerLabel(panelEvent.status)}</small>
                        <strong>{formatRemaining(panelTimerSeconds)}</strong>
                      </span>
                      <span>
                        <small>
                          {isLobbyOpen ? "No lobby" : "Participantes"}
                        </small>
                        <strong>{lobbyCount}</strong>
                      </span>
                      <span>
                        <small>Seu dano</small>
                        <strong>
                          {formatNumber(panelParticipant?.damageDealt ?? 0)}
                        </strong>
                      </span>
                      <span>
                        <small>Sua contribuição</small>
                        <strong>
                          {(panelParticipant?.contributionPercent ?? 0).toFixed(
                            2,
                          )}
                          %
                        </strong>
                      </span>
                    </div>

                    <div className="world-bosses-actions">
                      {canJoinPanel ? (
                        <button
                          type="button"
                          className="incursions-primary-button"
                          onClick={() => void handleJoin(panelEvent.id)}
                          disabled={isBusy}
                        >
                          Entrar no lobby
                        </button>
                      ) : null}
                      {isJoinedPanel &&
                      (panelEvent.status === "LOBBY_OPEN" ||
                        panelEvent.status === "ACTIVE") ? (
                        <button
                          type="button"
                          className="incursions-danger-button"
                          onClick={() => void handleLeave(panelEvent.id)}
                          disabled={isBusy}
                        >
                          <XCircle size={15} />
                          Sair da sala
                        </button>
                      ) : null}
                      {!canJoinPanel && !isJoinedPanel ? (
                        <span className="world-bosses-eligible world-bosses-eligible--pending">
                          {panelStatus?.eligible?.reason ?? "Indisponível"}
                        </span>
                      ) : null}
                      {panelParticipant?.eligibleForReward ? (
                        <span className="world-bosses-eligible">
                          Participação mínima atingida
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>

        {detailsEvent && detailsBoss ? (
          <div
            className="incursions-modal-backdrop world-bosses-modal"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setDetailsEventId(null);
              }
            }}
          >
            <section
              className={[
                "incursions-modal",
                "world-bosses-modal__panel",
                detailsTierClassName,
              ].join(" ")}
              role="dialog"
              aria-modal="true"
              aria-labelledby="world-boss-lobby-title"
            >
              <button
                type="button"
                className="world-bosses-modal__close"
                onClick={() => setDetailsEventId(null)}
                aria-label="Fechar detalhes do World Boss"
              >
                ×
              </button>
              <div className="world-bosses-modal__hero">
                <div
                  className="world-bosses-modal__portrait"
                  aria-hidden="true"
                >
                  {detailsBoss.imageUrl ? (
                    <img src={detailsBoss.imageUrl} alt="" />
                  ) : (
                    <span>
                      <Biohazard size={34} />
                    </span>
                  )}
                </div>
                <div>
                  <span className="incursions-modal__eyebrow">
                    Detalhes do World Boss
                  </span>
                  <h2 id="world-boss-lobby-title">{detailsBoss.name}</h2>
                  <p>{detailsBoss.description}</p>
                </div>
              </div>
              <div className="world-bosses-modal__stats">
                <span>
                  <small>Status</small>
                  <strong>{getStatusLabel(detailsEvent.status)}</strong>
                </span>
                <span>
                  <small>{getEventTimerLabel(detailsEvent.status)}</small>
                  <strong>{formatRemaining(detailsTimerSeconds)}</strong>
                </span>
                <span>
                  <small>Requisito</small>
                  <strong>Nível {detailsBoss.minLevel}+</strong>
                </span>
                <span>
                  <small>Sobreviventes</small>
                  <strong>
                    {detailsEvent.lobbyCount ?? detailsEvent.participantCount}
                  </strong>
                </span>
                <span>
                  <small>Dificuldade</small>
                  <strong>{detailsBoss.difficulty}</strong>
                </span>
                <span>
                  <small>Regra</small>
                  <strong>Sem entrada tardia</strong>
                </span>
              </div>
              <div className="world-bosses-modal__rewards">
                {detailsBoss.rewards.map((reward) => (
                  <span key={reward.id}>
                    {getRewardIcon(reward)}{" "}
                    {reward.item?.name ?? reward.rewardType} ·{" "}
                    {getQuantityLabel(reward)}
                  </span>
                ))}
              </div>
              <div className="world-bosses-actions">
                <button
                  className="incursions-primary-button"
                  type="button"
                  onClick={() => void handleJoin(detailsEvent.id)}
                  disabled={
                    isBusy ||
                    detailsEvent.status !== "LOBBY_OPEN" ||
                    Boolean(detailsParticipant) ||
                    !detailsStatus?.eligible?.canJoin
                  }
                >
                  {detailsParticipant ? "Já está no lobby" : "Entrar no lobby"}
                </button>
                <button
                  type="button"
                  className="incursions-secondary-button"
                  onClick={() => setDetailsEventId(null)}
                >
                  Fechar
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
