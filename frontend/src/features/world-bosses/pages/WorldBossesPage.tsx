import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Biohazard,
  Eye,
  ShieldAlert,
  Swords,
  X,
  XCircle,
} from "lucide-react";
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
  WorldBossSummary,
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
const WORLD_BOSS_ENTRY_WINDOW_SECONDS = 5 * 60;
const SHORT_RESPAWN_SECONDS = 6 * 60 * 60;
const LONG_RESPAWN_SECONDS = 12 * 60 * 60;

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.floor(value)));
}

function formatRemaining(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${String(h).padStart(2, "0")}h ${mm}m ${ss}s`;
  return `${mm}m ${ss}s`;
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

function getCompactStatusLabel(status: WorldBossEventStatus) {
  const labels: Record<WorldBossEventStatus, string> = {
    SCHEDULED: "Aguardando",
    LOBBY_OPEN: "Entrada aberta",
    ACTIVE: "Em andamento",
    DEFEATED: "Encerrado",
    EXPIRED: "Encerrado",
    REWARDED: "Encerrado",
    CANCELLED: "Encerrado",
  };
  return labels[status];
}

function getCardStatusLabel(status: WorldBossStatusResponse) {
  const event = status.event;
  if (!event) return "Indisponível";
  if (status.participant && event.status === "SCHEDULED") return "No lobby";
  if (status.participant && event.status === "LOBBY_OPEN") return "No lobby";
  if (status.participant && event.status === "ACTIVE") return "Em andamento";
  return getCompactStatusLabel(event.status);
}

function getCardStatusTone(status: WorldBossStatusResponse) {
  const event = status.event;
  if (!event) return "locked";
  if (status.participant && event.status === "ACTIVE") return "battle";
  if (
    status.participant &&
    (event.status === "SCHEDULED" || event.status === "LOBBY_OPEN")
  )
    return "lobby";
  if (event.status === "SCHEDULED" && status.eligible?.canJoin)
    return "available";
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
  if (reward.rewardType === "GOLD") return "G";
  if (reward.rewardType === "XP") return "XP";
  if (reward.rewardType === "PET_EGG") return "PET";
  if (reward.rewardType === "EQUIPMENT") return "EQ";
  return "IT";
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

function getBossLevel(boss?: WorldBossSummary | null) {
  return boss?.bossLevel ?? boss?.minLevel ?? 0;
}

function getRespawnIntervalSeconds(boss?: WorldBossSummary | null) {
  return (
    boss?.respawnIntervalSeconds ??
    (getBossLevel(boss) % 10 === 0
      ? LONG_RESPAWN_SECONDS
      : SHORT_RESPAWN_SECONDS)
  );
}

function getSecondsUntil(value: string | Date | null | undefined, nowMs: number) {
  if (!value) return 0;
  const targetMs = new Date(value).getTime();
  if (!Number.isFinite(targetMs)) return 0;
  return Math.max(0, Math.floor((targetMs - nowMs) / 1000));
}

function getEntryWindowEndMs(event: WorldBossStatusResponse["event"]) {
  if (!event) return 0;
  const apiValueMs = event.entryWindowEndsAt
    ? new Date(event.entryWindowEndsAt).getTime()
    : Number.NaN;
  if (Number.isFinite(apiValueMs)) return apiValueMs;
  return (
    new Date(event.startsAt).getTime() + WORLD_BOSS_ENTRY_WINDOW_SECONDS * 1000
  );
}

function getTerminalRespawnSeconds(
  status: WorldBossStatusResponse,
  nowMs: number,
) {
  const event = status.event;
  if (!event) return 0;
  const closedAt = event.defeatedAt ?? event.endsAt;
  const closedAtMs = new Date(closedAt).getTime();
  const respawnSeconds = getRespawnIntervalSeconds(event.worldBoss);
  if (!Number.isFinite(closedAtMs)) {
    return event.nextRespawnSeconds ?? respawnSeconds;
  }
  return Math.max(
    0,
    Math.floor((closedAtMs + respawnSeconds * 1000 - nowMs) / 1000),
  );
}

function getEventTimerInfo(
  status: WorldBossStatusResponse | null,
  nowMs: number,
) {
  const event = status?.event;
  if (!event) return { label: "Status", seconds: 0, text: "Indisponível" };

  if (event.status === "SCHEDULED") {
    const seconds = getSecondsUntil(event.startsAt, nowMs);
    if (status?.participant) {
      return {
        label: "Status",
        seconds,
        text: `Aguardando no lobby — aparece em ${formatRemaining(seconds)}`,
      };
    }

    return {
      label: "Próxima aparição em",
      seconds,
      text: `Próxima aparição em: ${formatRemaining(seconds)}`,
    };
  }

  if (event.status === "LOBBY_OPEN") {
    const seconds = Math.max(
      0,
      Math.floor((getEntryWindowEndMs(event) - nowMs) / 1000),
    );
    if (status?.participant) {
      return {
        label: "Status",
        seconds,
        text: seconds
          ? `No lobby — começa em ${formatRemaining(seconds)}`
          : "No lobby — iniciando",
      };
    }

    return {
      label: "Entrada aberta",
      seconds,
      text: `Entrada aberta — ${formatRemaining(seconds)}`,
    };
  }

  if (event.status === "ACTIVE") {
    const seconds = getSecondsUntil(event.endsAt, nowMs);
    return {
      label: "Status",
      seconds,
      text: `Em andamento — entrada bloqueada`,
    };
  }

  const seconds = getTerminalRespawnSeconds(status, nowMs);
  return {
    label: "Status",
    seconds,
    text: `Encerrado — próxima aparição em ${formatRemaining(seconds)}`,
  };
}

function getSidePanelStatusInfo(
  status: WorldBossStatusResponse | null,
  nowMs: number,
) {
  const event = status?.event;
  if (!event) {
    return {
      statusText: "Indisponível",
      detailText: "Selecione uma ameaça global.",
      timerLabel: "Timer",
      timerText: "—",
    };
  }

  if (event.status === "SCHEDULED") {
    const seconds = getSecondsUntil(event.startsAt, nowMs);
    return {
      statusText: status.participant ? "No lobby" : "Aguardando aparição",
      detailText: `Aparece em ${formatRemaining(seconds)}`,
      timerLabel: "Aparece em",
      timerText: formatRemaining(seconds),
    };
  }

  if (event.status === "LOBBY_OPEN") {
    const seconds = Math.max(
      0,
      Math.floor((getEntryWindowEndMs(event) - nowMs) / 1000),
    );
    const timerText = seconds ? formatRemaining(seconds) : "Iniciando";
    return {
      statusText: status.participant ? "No lobby" : "Entrada aberta",
      detailText: status.participant
        ? `Começa em ${timerText}`
        : `Janela aberta por ${timerText}`,
      timerLabel: status.participant ? "Começa em" : "Janela",
      timerText,
    };
  }

  if (event.status === "ACTIVE") {
    const seconds = getSecondsUntil(event.endsAt, nowMs);
    return {
      statusText: "Em andamento",
      detailText: "Entrada bloqueada",
      timerLabel: "Tempo restante",
      timerText: formatRemaining(seconds),
    };
  }

  const seconds = getTerminalRespawnSeconds(status, nowMs);
  return {
    statusText: "Encerrado",
    detailText: `Próxima aparição em ${formatRemaining(seconds)}`,
    timerLabel: "Próxima aparição",
    timerText: formatRemaining(seconds),
  };
}

function getEventStatusPriority(status: WorldBossStatusResponse) {
  const eventStatus = status.event?.status;
  if (eventStatus === "ACTIVE") return 6;
  if (eventStatus === "LOBBY_OPEN") return 5;
  if (eventStatus === "SCHEDULED") return 4;
  if (eventStatus === "DEFEATED" || eventStatus === "REWARDED") return 3;
  if (eventStatus === "EXPIRED") return 2;
  return 1;
}

function canJoinWorldBossStatus(status: WorldBossStatusResponse) {
  const eventStatus = status.event?.status;
  return Boolean(
    !status.participant &&
      status.eligible?.canJoin &&
      (eventStatus === "SCHEDULED" || eventStatus === "LOBBY_OPEN"),
  );
}

function canLeaveWorldBossStatus(status: WorldBossStatusResponse) {
  const eventStatus = status.event?.status;
  return Boolean(
    status.participant &&
      (eventStatus === "SCHEDULED" || eventStatus === "LOBBY_OPEN"),
  );
}

function isBlockingWorldBossStatus(status?: WorldBossStatusResponse | null) {
  const eventStatus = status?.event?.status;
  return Boolean(
    status?.participant &&
      (eventStatus === "SCHEDULED" ||
        eventStatus === "LOBBY_OPEN" ||
        eventStatus === "ACTIVE"),
  );
}

function isBlockedByOtherWorldBoss(
  status: WorldBossStatusResponse,
  blockingEventId?: string | null,
) {
  const eventId = status.event?.id ?? null;
  if (blockingEventId && eventId && blockingEventId !== eventId) return true;

  return Boolean(
    !status.participant &&
      status.eligible?.reason &&
      /outro World Boss|em um World Boss|Ameaça Global/i.test(
        status.eligible.reason,
      ),
  );
}

function getCanonicalBossCards(
  statuses: WorldBossStatusResponse[],
  mapTier?: number | null,
) {
  const byBoss = new Map<string, WorldBossStatusResponse>();

  for (const status of statuses) {
    const event = status.event;
    if (!event) continue;
    if (mapTier && event.worldBoss.tier !== mapTier) continue;

    const key = event.worldBoss.id;
    const previous = byBoss.get(key);
    if (!previous) {
      byBoss.set(key, status);
      continue;
    }

    const previousStartedAt = new Date(previous.event?.startsAt ?? 0).getTime();
    const nextStartedAt = new Date(event.startsAt).getTime();
    const shouldReplace =
      getEventStatusPriority(status) > getEventStatusPriority(previous) ||
      (getEventStatusPriority(status) === getEventStatusPriority(previous) &&
        nextStartedAt > previousStartedAt);

    if (shouldReplace) byBoss.set(key, status);
  }

  return Array.from(byBoss.values())
    .sort(
      (a, b) =>
        getBossLevel(a.event?.worldBoss) - getBossLevel(b.event?.worldBoss),
    )
    .slice(0, 2);
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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailsEventId, setDetailsEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

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
    if (!realtimeEventIdsKey || !characterId) return;
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
    socket.on("worldBoss:statusUpdated", update);
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
      socket.emit("worldBoss:join", { eventId, characterId });
    });

    return () => {
      eventIds.forEach((eventId) => {
        socket.emit("worldBoss:leave", { eventId });
      });
      socket.off("worldBoss:lobbyOpened", update);
      socket.off("worldBoss:statusUpdated", update);
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
  }, [characterId, realtimeEventIdsKey]);

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
    setSelectedEventId(eventId);
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
          : "Não foi possível entrar no combate.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLeave(eventId: string) {
    if (!characterId) return;
    setSelectedEventId(eventId);
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

  function handleSelectEvent(eventId: string) {
    setSelectedEventId(eventId);
  }

  function handleOpenDetails(eventId: string) {
    setSelectedEventId(eventId);
    setDetailsEventId(eventId);
  }

  function handleCardKeyDown(
    event: ReactKeyboardEvent<HTMLElement>,
    eventId: string,
  ) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleSelectEvent(eventId);
  }

  if (!character) {
    return (
      <main className="incursions-page incursions-page--loading world-bosses-loading">
        Carregando Ameaças Globais...
      </main>
    );
  }

  const currentMap =
    character.currentMap ??
    character.map ??
    bossStatuses[0]?.event?.worldBoss.map ??
    null;
  const currentContextLabel = currentMap ? "Mapa atual" : "Evento global";
  const currentMapName = currentMap?.name ?? "Área de contenção global";
  const currentMapImage = getMapImageByName(currentMapName);
  const currentMapVisualStyle = buildMapVisualStyle(currentMapImage);
  const currentMapTierClassName = getMapTierClassName(currentMap?.tier);
  const currentMapLevelRange = formatMapLevelRange(currentMap);
  const bossCards = getCanonicalBossCards(bossStatuses, currentMap?.tier);
  const blockingWorldBossStatus =
    bossStatuses.find(isBlockingWorldBossStatus) ?? null;
  const blockingWorldBossEventId = blockingWorldBossStatus?.event?.id ?? null;
  const selectedStatus = selectedEventId
    ? (bossCards.find((status) => status.event?.id === selectedEventId) ??
      null)
    : null;
  const panelStatus = selectedStatus ?? getPanelStatus(bossStatuses);
  const panelEvent = panelStatus?.event ?? null;
  const panelBoss = panelEvent?.worldBoss ?? null;
  const panelTierClassName = getWorldBossTierClassName(panelBoss?.tier);
  const panelParticipant = panelStatus?.participant ?? null;
  const isPanelBlockedByOtherWorldBoss = panelStatus
    ? isBlockedByOtherWorldBoss(panelStatus, blockingWorldBossEventId)
    : false;
  const canJoinPanel = panelStatus
    ? canJoinWorldBossStatus(panelStatus) && !isPanelBlockedByOtherWorldBoss
    : false;
  const canLeavePanel = panelStatus
    ? canLeaveWorldBossStatus(panelStatus)
    : false;
  const isJoinedPanel = Boolean(panelParticipant);
  const isBattleActive = panelEvent?.status === "ACTIVE";
  const isLobbyOpen = panelEvent?.status === "LOBBY_OPEN";
  const lobbyCount =
    panelEvent?.lobbyCount ?? panelEvent?.participantCount ?? 0;
  const panelSideInfo = getSidePanelStatusInfo(panelStatus ?? null, nowMs);
  const detailsStatus = detailsEventId
    ? (bossStatuses.find((status) => status.event?.id === detailsEventId) ??
      null)
    : null;
  const detailsEvent = detailsStatus?.event ?? null;
  const detailsBoss = detailsEvent?.worldBoss ?? null;
  const detailsTimer = getEventTimerInfo(detailsStatus, nowMs);
  const isDetailsBlockedByOtherWorldBoss = detailsStatus
    ? isBlockedByOtherWorldBoss(detailsStatus, blockingWorldBossEventId)
    : false;
  const canJoinDetails = detailsStatus
    ? canJoinWorldBossStatus(detailsStatus) && !isDetailsBlockedByOtherWorldBoss
    : false;
  const canLeaveDetails = detailsStatus
    ? canLeaveWorldBossStatus(detailsStatus)
    : false;
  const detailsTierClassName = getWorldBossTierClassName(detailsBoss?.tier);
  const selectedPanelEventId = panelEvent?.id ?? null;

  return (
    <DashboardLayout character={character} hideHero>
      <main className="incursions-page gathering-page--origin world-bosses-page">
        <div className="gathering-origin-shell world-bosses-shell">
        <section className="incursions-hero world-bosses-hero">
          <div>
            <span className="incursions-hero__eyebrow">
              Evento global do mapa atual
            </span>
            <h1>Ameaças Globais</h1>
            <p>
              Enfrente ameaças globais, entre no lobby e acompanhe a batalha em
              tempo real.
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
          aria-label={`${currentContextLabel}: ${currentMapName}`}
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
              {currentContextLabel}
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
              para eventos de contenção global.
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
                    const cardBlockedByOtherWorldBoss =
                      isBlockedByOtherWorldBoss(
                        bossStatus,
                        blockingWorldBossEventId,
                      );
                    const cardCanJoin =
                      canJoinWorldBossStatus(bossStatus) &&
                      !cardBlockedByOtherWorldBoss;
                    const cardCanLeave = canLeaveWorldBossStatus(bossStatus);
                    const cardIsLocked =
                      !bossStatus.eligible?.canJoin &&
                      !bossStatus.participant &&
                      bossEvent.status !== "ACTIVE";
                    const cardLobbyCount =
                      bossEvent.lobbyCount ?? bossEvent.participantCount ?? 0;
                    const cardTimer = getEventTimerInfo(bossStatus, nowMs);
                    const cardTone = getCardStatusTone(bossStatus);
                    const cardStatusLabel = getCardStatusLabel(bossStatus);
                    const showCardStatusBadge =
                      cardStatusLabel !== "Aguardando";
                    const shouldShowBlockedJoin =
                      cardBlockedByOtherWorldBoss &&
                      !cardCanLeave &&
                      bossEvent.status !== "ACTIVE";
                    const isCardSelected =
                      selectedPanelEventId === bossEvent.id;
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
                          isCardSelected
                            ? "world-bosses-boss-card--selected"
                            : "",
                          cardIsLocked ? "world-bosses-boss-card--locked" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        tabIndex={0}
                        aria-label={`Selecionar World Boss ${cardBoss.name}`}
                        onClick={() => handleSelectEvent(bossEvent.id)}
                        onDoubleClick={() => handleOpenDetails(bossEvent.id)}
                        onKeyDown={(event) =>
                          handleCardKeyDown(event, bossEvent.id)
                        }
                      >
                        <div className="world-bosses-boss-card__details">
                          <div className="world-bosses-boss-card__art">
                            <div className="world-bosses-boss-card__badges">
                              <span className="world-bosses-boss-card__tier">
                                Tier {cardBoss.tier}
                              </span>
                              {showCardStatusBadge ? (
                                <span className="world-bosses-boss-card__status">
                                  {cardStatusLabel}
                                </span>
                              ) : null}
                              <span className="world-bosses-boss-card__level">
                                Level {getBossLevel(cardBoss)}
                              </span>
                            </div>
                            {cardBoss.imageUrl ? (
                              <img src={cardBoss.imageUrl} alt="" />
                            ) : (
                              <span className="world-bosses-boss-card__glyph">
                                <Biohazard size={42} />
                              </span>
                            )}
                          </div>
                          <div className="world-bosses-boss-card__content">
                            <h3 className="world-bosses-boss-card__name">
                              {cardBoss.name}
                            </h3>
                            <div className="world-bosses-boss-card__meta">
                              <span>{cardTimer.text}</span>
                              {cardLobbyCount > 0 ? (
                                <small>{cardLobbyCount} no lobby</small>
                              ) : null}
                            </div>
                            <div
                              className="world-bosses-boss-card__actions"
                              onDoubleClick={(event) =>
                                event.stopPropagation()
                              }
                            >
                              <button
                                type="button"
                                className="world-bosses-boss-card__secondary-action"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenDetails(bossEvent.id);
                                }}
                              >
                                <Eye size={15} />
                                Ver detalhes
                              </button>
                              {cardCanJoin ? (
                                <button
                                  type="button"
                                  className="incursions-primary-button world-bosses-boss-card__primary-action"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleJoin(bossEvent.id);
                                  }}
                                  disabled={isBusy}
                                >
                                  <Swords size={15} />
                                  Entrar
                                </button>
                              ) : shouldShowBlockedJoin ? (
                                <button
                                  type="button"
                                  className="incursions-primary-button world-bosses-boss-card__primary-action"
                                  onClick={(event) => event.stopPropagation()}
                                  disabled
                                  title={
                                    bossStatus.eligible?.reason ??
                                    "Você já está em outro World Boss."
                                  }
                                >
                                  <Swords size={15} />
                                  Entrar
                                </button>
                              ) : null}
                              {cardCanLeave ? (
                                <button
                                  type="button"
                                  className="incursions-danger-button world-bosses-boss-card__primary-action"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleLeave(bossEvent.id);
                                  }}
                                  disabled={isBusy}
                                >
                                  <XCircle size={15} />
                                  Sair do lobby
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
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
                <span>Atividade atual</span>
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
                  <div className="incursions-current-card__empty world-bosses-activity-empty">
                    <ShieldAlert size={24} />
                    <h2>Nenhum lobby ativo</h2>
                    <p>
                      Escolha uma ameaça global para ver os detalhes ou entrar
                      no lobby.
                    </p>
                  </div>
                ) : (
                  <div className="incursions-current-card__content world-bosses-activity-content">
                    <div className="incursions-current-card__head world-bosses-activity-boss">
                      <div
                        className="incursions-current-card__icon world-bosses-activity-boss__icon"
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
                        <h2>{panelBoss.name}</h2>
                        <p>
                          Tier {panelBoss.tier} · Level{" "}
                          {getBossLevel(panelBoss)}
                        </p>
                      </div>
                    </div>

                    <div className="world-bosses-state world-bosses-state--current">
                      {isBattleActive ? <i aria-hidden="true" /> : null}
                      <span className="world-bosses-state__copy">
                        <small>Status atual</small>
                        <strong>{panelSideInfo.statusText}</strong>
                        <em>{panelSideInfo.detailText}</em>
                      </span>
                    </div>

                    <div className="incursions-current-card__progress world-bosses-hp">
                      <div>
                        <span>HP global</span>
                        <strong>
                          {formatNumber(panelEvent.currentHp)} /{" "}
                          {formatNumber(panelEvent.maxHp)}
                        </strong>
                      </div>
                      <i>
                        <em
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, panelEvent.hpPercent),
                            )}%`,
                          }}
                        />
                      </i>
                      <small>
                        {Math.floor(panelEvent.progressPercent)}% de progresso
                        coletivo
                      </small>
                    </div>

                    <div className="world-bosses-activity-metrics">
                      <span>
                        <small>{panelSideInfo.timerLabel}</small>
                        <strong>{panelSideInfo.timerText}</strong>
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
                      <button
                        type="button"
                        className="incursions-secondary-button"
                        onClick={() => handleOpenDetails(panelEvent.id)}
                      >
                        <Eye size={15} />
                        Ver detalhes
                      </button>
                      {canJoinPanel ? (
                        <button
                          type="button"
                          className="incursions-primary-button"
                          onClick={() => void handleJoin(panelEvent.id)}
                          disabled={isBusy}
                        >
                          Entrar
                        </button>
                      ) : isPanelBlockedByOtherWorldBoss ? (
                        <button
                          type="button"
                          className="incursions-primary-button"
                          disabled
                          title={
                            panelStatus?.eligible?.reason ??
                            "Você já está em outro World Boss."
                          }
                        >
                          Entrar
                        </button>
                      ) : null}
                      {canLeavePanel ? (
                        <button
                          type="button"
                          className="incursions-danger-button"
                          onClick={() => void handleLeave(panelEvent.id)}
                          disabled={isBusy}
                        >
                          <XCircle size={15} />
                          Sair do lobby
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
                <X size={18} />
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
                <span className="world-bosses-modal__status-stat">
                  <small>Status</small>
                  <strong>{detailsTimer.text}</strong>
                </span>
                <span>
                  <small>Tier</small>
                  <strong>{detailsBoss.tier}</strong>
                </span>
                <span>
                  <small>Level</small>
                  <strong>{getBossLevel(detailsBoss)}</strong>
                </span>
                <span>
                  <small>Sobreviventes</small>
                  <strong>
                    {detailsEvent.lobbyCount ?? detailsEvent.participantCount}
                  </strong>
                </span>
                <span>
                  <small>HP global</small>
                  <strong>
                    {formatNumber(detailsEvent.currentHp)} /{" "}
                    {formatNumber(detailsEvent.maxHp)}
                  </strong>
                </span>
              </div>
              <div className="world-bosses-modal__rewards-section">
                <div className="world-bosses-modal__section-head">
                  <h3>Recompensas possíveis:</h3>
                </div>
                <div className="world-bosses-modal__rewards">
                  {detailsBoss.rewards.map((reward) => {
                    const rewardName = reward.item?.name ?? reward.rewardType;

                    return (
                      <div className="world-bosses-reward-card" key={reward.id}>
                        <span
                          className="world-bosses-reward-card__icon"
                          aria-hidden="true"
                        >
                          {getRewardIcon(reward)}
                        </span>
                        <span className="world-bosses-reward-card__body">
                          <strong>{rewardName}</strong>
                          <small>{getQuantityLabel(reward)}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="world-bosses-actions">
                {canJoinDetails ? (
                  <button
                    className="incursions-primary-button"
                    type="button"
                    onClick={() => void handleJoin(detailsEvent.id)}
                    disabled={isBusy}
                  >
                    <Swords size={15} />
                    Entrar
                  </button>
                ) : isDetailsBlockedByOtherWorldBoss ? (
                  <button
                    className="incursions-primary-button"
                    type="button"
                    disabled
                    title={
                      detailsStatus?.eligible?.reason ??
                      "Você já está em outro World Boss."
                    }
                  >
                    <Swords size={15} />
                    Entrar
                  </button>
                ) : null}
                {canLeaveDetails ? (
                  <button
                    className="incursions-danger-button"
                    type="button"
                    onClick={() => void handleLeave(detailsEvent.id)}
                    disabled={isBusy}
                  >
                    <XCircle size={15} />
                    Sair do lobby
                  </button>
                ) : null}
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
        </div>
      </main>
    </DashboardLayout>
  );
}
