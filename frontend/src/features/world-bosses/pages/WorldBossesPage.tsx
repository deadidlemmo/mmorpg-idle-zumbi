import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Biohazard,
  BellRing,
  Dna,
  Egg,
  Eye,
  LockKeyhole,
  PackageCheck,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { ActivityStateProgressFill } from "../../../components/game/ActivityStateProgressFill";
import { getAuthToken } from "../../../services/api/authToken";
import { canRunNetworkRefresh } from "../../../utils/networkRefresh";
import {
  buildMapVisualStyle,
  getMapImageByName,
} from "../../auto-combat/assets/auto-combat-map-assets";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { DashboardTopBarActivityOverride } from "../../dashboard/components/DashboardTopBar";
import { ResourceCenterShortcut } from "../../economy/components/ResourceCenterShortcut";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import {
  connectWorldBossSocket,
  disconnectWorldBossSocket,
  type WorldBossSocket,
} from "../../../services/websocket/socketClient";
import {
  getAvailableWorldBosses,
  joinWorldBoss,
  leaveWorldBoss,
} from "../api/world-bosses.api";
import type {
  WorldBossEventStatus,
  WorldBossGrantedReward,
  WorldBossRewardPreview,
  WorldBossSummary,
  WorldBossStatusResponse,
} from "../types/world-bosses.types";
import {
  mergeWorldBossStatusSnapshot,
  reconcileWorldBossStatusSnapshots,
  upsertWorldBossStatusSnapshot,
} from "../utils/worldBossStatus";
import {
  getWorldBossCocoonOptions,
  getWorldBossRewardImageUrl,
} from "../utils/worldBossRewardAssets";
import {
  WORLD_BOSS_REGISTRATION_NOTICE,
  WORLD_BOSS_STATUS_SYNC_EVENT,
} from "../utils/worldBossAlerts";
import { getWorldBossImageUrl } from "../utils/worldBossAssets";
import "../../dashboard/dashboard.css";
import "../../gathering/styles/gathering.css";
import "../../incursions/styles/incursions.css";
import "../styles/world-bosses.css";

const ACTIVE_PANEL_STATUSES = new Set<WorldBossEventStatus>([
  "LOBBY_OPEN",
  "ACTIVE",
]);
const WORLD_BOSS_ENTRY_WINDOW_SECONDS = 15 * 60;
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

function isWorldBossConfirmed(status?: WorldBossStatusResponse | null) {
  return Boolean(
    status?.participant &&
    (status.participant.registrationStatus === "CONFIRMED" ||
      status.participant.confirmedAt),
  );
}

function isWorldBossRegistered(status?: WorldBossStatusResponse | null) {
  return Boolean(status?.participant);
}

function getCardStatusLabel(status: WorldBossStatusResponse) {
  const event = status.event;
  if (!event) return "Indisponível";
  if (isWorldBossRegistered(status) && event.status !== "ACTIVE")
    return "Inscrito";
  if (isWorldBossConfirmed(status) && event.status === "ACTIVE")
    return "Em andamento";
  return getCompactStatusLabel(event.status);
}

function getCardStatusTone(status: WorldBossStatusResponse) {
  const event = status.event;
  if (!event) return "locked";
  if (isWorldBossRegistered(status) && event.status !== "ACTIVE")
    return "registered";
  if (isWorldBossConfirmed(status) && event.status === "ACTIVE")
    return "battle";
  if (
    isWorldBossRegistered(status) &&
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

type WorldBossRewardIdentity = {
  rewardType: WorldBossRewardPreview["rewardType"];
  currency?: WorldBossRewardPreview["currency"];
  randomPetCocoon?: boolean;
  item?: { name: string } | null;
};

function getRewardIcon(reward: WorldBossRewardIdentity, tier: number) {
  const imageUrl = getWorldBossRewardImageUrl(reward.rewardType, tier);
  if (imageUrl) return <img src={imageUrl} alt="" />;
  if (reward.rewardType === "PET_EGG") return <Egg size={20} />;
  if (reward.rewardType === "CURRENCY") return <Dna size={20} />;
  return <PackageCheck size={20} />;
}

function getQuantityLabel(reward: WorldBossRewardPreview) {
  return reward.minQuantity === reward.maxQuantity
    ? formatNumber(reward.minQuantity)
    : `${formatNumber(reward.minQuantity)}–${formatNumber(reward.maxQuantity)}`;
}

function getRewardChanceLabel(reward: WorldBossRewardPreview) {
  if (reward.guaranteed) return "100%";

  const chance = Number(reward.chance);
  if (!Number.isFinite(chance) || chance <= 0) return null;

  const roundedChance = Math.round(chance * 100) / 100;

  return `~${String(roundedChance).replace(".", ",")}%`;
}

function getRewardName(reward: WorldBossRewardIdentity, tier: number) {
  if (reward.item?.name) return reward.item.name;
  if (reward.rewardType === "XP") return "EXP";
  if (reward.rewardType === "GOLD") return "Gold";
  if (reward.rewardType === "CURRENCY") {
    return reward.currency === "INCURSION_TOKEN"
      ? "Ficha de Incursão"
      : `Fragmento de Ameaça T${tier}`;
  }
  if (reward.rewardType === "PET_EGG") {
    return reward.randomPetCocoon
      ? `Casulo especializado aleatório T${tier}`
      : "Casulo infectado";
  }
  return reward.rewardType;
}

function getRewardRequirementLabel(reward: WorldBossRewardPreview) {
  const requirements: string[] = [];
  if (reward.onlyIfDefeated) requirements.push("Chefe derrotado");
  if (reward.requiresMinParticipation) {
    requirements.push("Participação mínima");
  }
  if (reward.minContributionPercent > 0) {
    requirements.push(
      `${String(reward.minContributionPercent).replace(".", ",")}% de contribuição`,
    );
  }
  return requirements.join(" · ");
}

function WorldBossRewardReceipt({
  status,
  onDismiss,
}: {
  status: WorldBossStatusResponse;
  onDismiss: () => void;
}) {
  const event = status.event;
  const participant = status.participant;
  if (!event || !participant?.rewardGranted) return null;

  const tier = event.worldBoss.tier;
  const rewards = participant.rewards ?? [];
  const defeated = event.status === "DEFEATED" || Boolean(event.defeatedAt);

  return (
    <section
      className={[
        "world-bosses-reward-receipt",
        getWorldBossTierClassName(tier),
      ].join(" ")}
      aria-live="polite"
    >
      <header className="world-bosses-reward-receipt__head">
        <span
          className="world-bosses-reward-receipt__status"
          aria-hidden="true"
        >
          <PackageCheck size={22} />
        </span>
        <div>
          <small>{defeated ? "Ameaça eliminada" : "Evento encerrado"}</small>
          <h2>{event.worldBoss.name}</h2>
          <p>Recompensas da sua participação no Tier {tier}.</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Fechar resultado">
          <X size={17} />
        </button>
      </header>

      {rewards.length > 0 ? (
        <ul className="world-bosses-reward-receipt__items">
          {rewards.map((reward: WorldBossGrantedReward) => (
            <li key={reward.id}>
              <span aria-hidden="true">{getRewardIcon(reward, tier)}</span>
              <div>
                <strong>{getRewardName(reward, tier)}</strong>
                <small>+{formatNumber(reward.quantity)}</small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="world-bosses-reward-receipt__empty">
          A participação mínima não foi atingida neste evento.
        </p>
      )}
    </section>
  );
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

function getSecondsUntil(
  value: string | Date | null | undefined,
  nowMs: number,
) {
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
    if (isWorldBossRegistered(status)) {
      return {
        label: "Status",
        seconds,
        text: `Inscrito — preparação em ${formatRemaining(seconds)}`,
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
    if (isWorldBossRegistered(status)) {
      return {
        label: "Status",
        seconds,
        text: seconds
          ? `Inscrito — batalha em ${formatRemaining(seconds)}`
          : "Inscrito — iniciando batalha",
      };
    }

    return {
      label: "Inscrições abertas",
      seconds,
      text: `Batalha em — ${formatRemaining(seconds)}`,
    };
  }

  if (event.status === "ACTIVE") {
    const seconds = getSecondsUntil(event.endsAt, nowMs);
    return {
      label: "Status",
      seconds,
      text: "Em andamento",
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
      statusText: isWorldBossRegistered(status)
        ? "Inscrito"
        : "Aguardando aparição",
      detailText: `Preparação em ${formatRemaining(seconds)}`,
      timerLabel: "Preparação em",
      timerText: formatRemaining(seconds),
    };
  }

  if (event.status === "LOBBY_OPEN") {
    const seconds = Math.max(
      0,
      Math.floor((getEntryWindowEndMs(event) - nowMs) / 1000),
    );
    const timerText = seconds ? formatRemaining(seconds) : "Iniciando";
    const registered = isWorldBossRegistered(status);
    return {
      statusText: registered ? "Inscrito" : "Inscrições abertas",
      detailText: registered
        ? `Batalha começa em ${timerText}`
        : `Inscrições encerram em ${timerText}`,
      timerLabel: registered ? "Batalha em" : "Inscrições",
      timerText,
    };
  }

  if (event.status === "ACTIVE") {
    const seconds = getSecondsUntil(event.endsAt, nowMs);
    return {
      statusText: "Em andamento",
      detailText: null,
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

function buildWorldBossTopBarActivity(
  status: WorldBossStatusResponse | null,
): DashboardTopBarActivityOverride | null {
  const event = status?.event;
  const participant = status?.participant;

  if (
    !event ||
    !participant ||
    !isWorldBossConfirmed(status) ||
    event.status !== "ACTIVE"
  ) {
    return null;
  }

  const bossName = event.worldBoss.name;
  const hpPercent = Math.max(0, Math.min(100, event.hpPercent));

  return {
    kind: "world-boss",
    title: bossName,
    subtitle: `Em andamento - ${formatNumber(event.currentHp)} HP`,
    icon: "WB",
    progressPercent: hpPercent,
    stateProgress: true,
    badge: `${Math.floor(hpPercent)}%`,
    titleText: `${bossName} - em andamento, ${formatNumber(
      event.currentHp,
    )} de ${formatNumber(event.maxHp)} HP`,
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
    status.eligible?.canJoin &&
    (eventStatus === "SCHEDULED" || eventStatus === "LOBBY_OPEN") &&
    !status.participant,
  );
}

function getWorldBossEntryActionLabel() {
  return "Inscrever-se";
}

function canLeaveWorldBossStatus(status: WorldBossStatusResponse) {
  const eventStatus = status.event?.status;
  return Boolean(
    status.participant &&
    (eventStatus === "SCHEDULED" ||
      eventStatus === "LOBBY_OPEN" ||
      eventStatus === "ACTIVE"),
  );
}

function getLeaveWorldBossActionLabel(status: WorldBossStatusResponse | null) {
  if (status?.event?.status === "ACTIVE") return "Sair do combate";
  return "Cancelar inscrição";
}

function isBlockingWorldBossStatus(status?: WorldBossStatusResponse | null) {
  const eventStatus = status?.event?.status;
  return Boolean(
    isWorldBossConfirmed(status) && eventStatus === "ACTIVE",
  );
}

function getBlockingWorldBossEventId(statuses: WorldBossStatusResponse[]) {
  return statuses.find(isBlockingWorldBossStatus)?.event?.id ?? null;
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

function getPanelStatus(statuses: WorldBossStatusResponse[]) {
  const joined =
    statuses.find(isBlockingWorldBossStatus) ??
    statuses.find(
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

function getStatusByEventId(
  statuses: WorldBossStatusResponse[],
  eventId?: string | null,
) {
  if (!eventId) return null;
  return statuses.find((status) => status.event?.id === eventId) ?? null;
}

export function WorldBossesPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [bossStatuses, setBossStatuses] = useState<WorldBossStatusResponse[]>(
    [],
  );
  const [recentRewardStatus, setRecentRewardStatus] =
    useState<WorldBossStatusResponse | null>(null);
  const [dismissedRewardEventId, setDismissedRewardEventId] = useState<
    string | null
  >(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailsEventId, setDetailsEventId] = useState<string | null>(null);
  const [revealedRewardId, setRevealedRewardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registrationFeedback, setRegistrationFeedback] = useState<
    string | null
  >(null);
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
        setBossStatuses((current) =>
          reconcileWorldBossStatusSnapshots(current, bossesResponse.events),
        );
        setRecentRewardStatus((current) =>
          bossesResponse.recentReward
            ? mergeWorldBossStatusSnapshot(current, bossesResponse.recentReward)
            : null,
        );
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
    const interval = window.setInterval(() => {
      if (canRunNetworkRefresh()) void load();
    }, 15000);
    const refreshOnResume = () => {
      if (canRunNetworkRefresh()) void load();
    };

    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("online", refreshOnResume);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("online", refreshOnResume);
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
    if (!realtimeEventIdsKey || !characterId || !getAuthToken()) return;
    const eventIds = realtimeEventIdsKey.split("|").filter(Boolean);
    if (eventIds.length === 0) return;

    const socket: WorldBossSocket = connectWorldBossSocket();
    const update = (payload: WorldBossStatusResponse) => {
      setBossStatuses((current) =>
        upsertWorldBossStatusSnapshot(current, payload),
      );
      if (
        payload.event &&
        payload.participant?.rewardGranted &&
        (payload.event.status === "DEFEATED" ||
          payload.event.status === "EXPIRED")
      ) {
        setRecentRewardStatus(payload);
      }
    };
    const fail = (payload: { message?: string }) => {
      setError(payload.message ?? "Falha no WebSocket da Ameaça Global.");
    };

    socket.on("worldBoss:lobbyOpened", update);
    socket.on("worldBoss:statusUpdated", update);
    socket.on("worldBoss:registered", update);
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
      socket.off("worldBoss:registered", update);
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
      disconnectWorldBossSocket();
    };
  }, [characterId, realtimeEventIdsKey]);

  useEffect(() => {
    if (!detailsEventId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailsEventId(null);
        setRevealedRewardId(null);
      }
    };

    document.body.classList.add("world-bosses-modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("world-bosses-modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailsEventId]);

  useEffect(() => {
    const syncRegistration = (event: Event) => {
      const status = (event as CustomEvent<WorldBossStatusResponse>).detail;
      if (!status?.event) return;
      setBossStatuses((current) =>
        upsertWorldBossStatusSnapshot(current, status),
      );
      setRegistrationFeedback(status.message ?? WORLD_BOSS_REGISTRATION_NOTICE);
      setError(null);
    };

    window.addEventListener(WORLD_BOSS_STATUS_SYNC_EVENT, syncRegistration);
    return () => {
      window.removeEventListener(WORLD_BOSS_STATUS_SYNC_EVENT, syncRegistration);
    };
  }, []);

  const character = useMemo(
    () => (overview ? buildCharacterViewModel(overview) : null),
    [overview],
  );

  if (!characterId) return <Navigate to="/characters" replace />;

  function handleCloseDetails() {
    setDetailsEventId(null);
    setRevealedRewardId(null);
  }

  async function handleJoin(eventId: string) {
    if (!characterId) return;
    if (isEventBlockedByCurrentWorldBoss(eventId)) {
      setError("Você já está em outro World Boss.");
      return;
    }
    setSelectedEventId(eventId);
    setIsBusy(true);
    try {
      const next = await joinWorldBoss(characterId, eventId);
      setBossStatuses((current) =>
        upsertWorldBossStatusSnapshot(current, next),
      );
      setRegistrationFeedback(next.message ?? WORLD_BOSS_REGISTRATION_NOTICE);
      window.dispatchEvent(
        new CustomEvent<WorldBossStatusResponse>(WORLD_BOSS_STATUS_SYNC_EVENT, {
          detail: next,
        }),
      );
      handleCloseDetails();
      setError(null);
      const refreshed = await getAvailableWorldBosses(characterId);
      setBossStatuses((current) =>
        reconcileWorldBossStatusSnapshots(current, refreshed.events),
      );
    } catch (err) {
      setRegistrationFeedback(null);
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
      setBossStatuses((current) =>
        upsertWorldBossStatusSnapshot(
          current.filter((status) => status.event?.id !== eventId),
          next,
        ),
      );
      window.dispatchEvent(
        new CustomEvent<WorldBossStatusResponse>(WORLD_BOSS_STATUS_SYNC_EVENT, {
          detail: next,
        }),
      );
      setRegistrationFeedback(null);
      handleCloseDetails();
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
    if (isEventBlockedByCurrentWorldBoss(eventId)) return;
    setSelectedEventId(eventId);
  }

  function handleOpenDetails(eventId: string) {
    if (isEventBlockedByCurrentWorldBoss(eventId)) return;
    setSelectedEventId(eventId);
    setRevealedRewardId(null);
    setDetailsEventId(eventId);
  }

  function handleCardKeyDown(
    event: ReactKeyboardEvent<HTMLElement>,
    eventId: string,
  ) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (isEventBlockedByCurrentWorldBoss(eventId)) return;
    handleSelectEvent(eventId);
  }

  function isEventBlockedByCurrentWorldBoss(eventId: string) {
    const activeEventId = getBlockingWorldBossEventId(bossStatuses);
    return Boolean(activeEventId && activeEventId !== eventId);
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
  const selectedStatus =
    blockingWorldBossStatus ??
    (selectedEventId ? getStatusByEventId(bossCards, selectedEventId) : null);
  const panelStatus = selectedStatus ?? getPanelStatus(bossStatuses);
  const panelEvent = panelStatus?.event ?? null;
  const panelBoss = panelEvent?.worldBoss ?? null;
  const panelBossImageUrl = getWorldBossImageUrl(panelBoss);
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
  const registrationCount = panelEvent?.registrationCount ?? lobbyCount;
  const panelSideInfo = getSidePanelStatusInfo(panelStatus ?? null, nowMs);
  const effectiveDetailsEventId =
    detailsEventId &&
    (!blockingWorldBossEventId || detailsEventId === blockingWorldBossEventId)
      ? detailsEventId
      : null;
  const detailsStatus = effectiveDetailsEventId
    ? (bossStatuses.find(
        (status) => status.event?.id === effectiveDetailsEventId,
      ) ?? null)
    : null;
  const detailsEvent = detailsStatus?.event ?? null;
  const detailsBoss = detailsEvent?.worldBoss ?? null;
  const detailsBossImageUrl = getWorldBossImageUrl(detailsBoss);
  const revealedReward =
    detailsBoss?.rewards.find((reward) => reward.id === revealedRewardId) ??
    null;
  const revealedCocoonOptions =
    revealedReward?.rewardType === "PET_EGG" &&
    revealedReward.randomPetCocoon &&
    detailsBoss
      ? getWorldBossCocoonOptions(detailsBoss.tier)
      : [];
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
  const isDetailsLocked = Boolean(
    detailsStatus &&
      !detailsStatus.participant &&
      !detailsStatus.eligible?.canJoin &&
      detailsEvent?.status !== "ACTIVE",
  );
  const detailsTierClassName = getWorldBossTierClassName(detailsBoss?.tier);
  const selectedPanelEventId = panelEvent?.id ?? null;
  const visibleRewardStatus =
    recentRewardStatus?.event?.id === dismissedRewardEventId
      ? null
      : recentRewardStatus;
  const topBarActivityOverride = buildWorldBossTopBarActivity(
    blockingWorldBossStatus,
  );

  return (
    <DashboardLayout
      character={character}
      hideHero
      topBarActivityOverride={topBarActivityOverride}
    >
      <main className="incursions-page gathering-page--origin world-bosses-page">
        <div className="gathering-origin-shell world-bosses-shell">
          <section className="incursions-hero world-bosses-hero">
            <div>
              <span className="incursions-hero__eyebrow">
                Evento global do mapa atual
              </span>
              <h1>Ameaças Globais</h1>
              <p>
                Inscreva-se sem parar sua atividade e acompanhe a batalha em
                tempo real quando ela começar.
              </p>
            </div>
          </section>

          {error ? (
            <div className="incursions-alert incursions-alert--error world-bosses-alert">
              {error}
            </div>
          ) : null}

          {registrationFeedback ? (
            <div className="incursions-alert world-bosses-alert world-bosses-alert--success">
              {registrationFeedback}
            </div>
          ) : null}

          {visibleRewardStatus ? (
            <WorldBossRewardReceipt
              status={visibleRewardStatus}
              onDismiss={() =>
                setDismissedRewardEventId(visibleRewardStatus.event?.id ?? null)
              }
            />
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
                Alertas antecipados e preparação visual para eventos de
                contenção global.
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
            aria-label="World Bosses e batalha atual"
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
                    <strong>
                      Nenhuma ameaça global disponível neste mapa.
                    </strong>
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
                      const cardLeaveLabel =
                        getLeaveWorldBossActionLabel(bossStatus);
                      const cardIsLocked =
                        !bossStatus.eligible?.canJoin &&
                        !bossStatus.participant &&
                        bossEvent.status !== "ACTIVE";
                      const cardLobbyCount =
                        bossEvent.lobbyCount ?? bossEvent.participantCount ?? 0;
                      const cardRegistrationCount =
                        bossEvent.registrationCount ?? cardLobbyCount;
                      const cardVisibleCount =
                        bossEvent.status === "SCHEDULED" ||
                        bossEvent.status === "LOBBY_OPEN"
                          ? cardRegistrationCount
                          : cardLobbyCount;
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
                      const cardBossImageUrl = getWorldBossImageUrl(cardBoss);

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
                            cardIsLocked
                              ? "world-bosses-boss-card--locked"
                              : "",
                            cardBlockedByOtherWorldBoss
                              ? "world-bosses-boss-card--blocked-by-current"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          tabIndex={cardBlockedByOtherWorldBoss ? -1 : 0}
                          aria-label={`Selecionar World Boss ${cardBoss.name}`}
                          aria-disabled={
                            cardBlockedByOtherWorldBoss || undefined
                          }
                          title={
                            cardBlockedByOtherWorldBoss
                              ? "Você já está em outro World Boss."
                              : undefined
                          }
                          onClick={() => {
                            if (!cardBlockedByOtherWorldBoss) {
                              handleSelectEvent(bossEvent.id);
                            }
                          }}
                          onDoubleClick={() => {
                            if (!cardBlockedByOtherWorldBoss) {
                              handleOpenDetails(bossEvent.id);
                            }
                          }}
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
                              {cardBossImageUrl ? (
                                <img src={cardBossImageUrl} alt="" />
                              ) : (
                                <span className="world-bosses-boss-card__glyph">
                                  <Biohazard size={42} />
                                </span>
                              )}
                              {cardIsLocked ? (
                                <div className="world-bosses-boss-card__lock">
                                  <span>
                                    <LockKeyhole size={26} />
                                  </span>
                                  <strong>Bloqueado</strong>
                                  <small>
                                    {bossStatus.eligible?.reason ??
                                      "Inscrição indisponível"}
                                  </small>
                                </div>
                              ) : null}
                            </div>
                            <div className="world-bosses-boss-card__content">
                              <h3 className="world-bosses-boss-card__name">
                                {cardBoss.name}
                              </h3>
                              <div className="world-bosses-boss-card__meta">
                                <span>{cardTimer.text}</span>
                                {cardVisibleCount > 0 ? (
                                  <small>
                                    {cardVisibleCount}{" "}
                                    {bossEvent.status === "ACTIVE"
                                      ? "participantes"
                                      : "inscritos"}
                                  </small>
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
                                  disabled={cardBlockedByOtherWorldBoss}
                                  title={
                                    cardBlockedByOtherWorldBoss
                                      ? "Você já está em outro World Boss."
                                      : undefined
                                  }
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
                                    <BellRing size={15} />
                                    {getWorldBossEntryActionLabel()}
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
                                    <LockKeyhole size={15} />
                                    {getWorldBossEntryActionLabel()}
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
                                    {cardLeaveLabel}
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
                      <h2>Nenhuma batalha ativa</h2>
                      <p>
                        Escolha uma ameaça global para ver os detalhes ou fazer
                        sua inscrição.
                      </p>
                    </div>
                  ) : (
                    <div className="incursions-current-card__content world-bosses-activity-content">
                      <div className="incursions-current-card__head world-bosses-activity-boss">
                        <div
                          className="incursions-current-card__icon world-bosses-activity-boss__icon"
                          aria-hidden="true"
                        >
                          {panelBossImageUrl ? (
                            <img src={panelBossImageUrl} alt="" />
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

                      <div
                        className={[
                          "world-bosses-state",
                          "world-bosses-state--current",
                          isBattleActive ? "world-bosses-state--battle" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {isBattleActive ? <i aria-hidden="true" /> : null}
                        <span className="world-bosses-state__copy">
                          <small>Status atual</small>
                          <strong>{panelSideInfo.statusText}</strong>
                          {panelSideInfo.detailText ? (
                            <em>{panelSideInfo.detailText}</em>
                          ) : null}
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
                          <ActivityStateProgressFill
                            as="em"
                            progressPercent={panelEvent.hpPercent}
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
                            {panelEvent.status === "SCHEDULED"
                              ? "Inscritos"
                              : isLobbyOpen
                                ? "Inscritos"
                                : "Participantes"}
                          </small>
                          <strong>
                            {panelEvent.status === "SCHEDULED"
                              ? registrationCount
                              : isLobbyOpen
                                ? registrationCount
                                : lobbyCount}
                          </strong>
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
                            {(
                              panelParticipant?.contributionPercent ?? 0
                            ).toFixed(2)}
                            %
                          </strong>
                        </span>
                      </div>

                      <div className="world-bosses-actions world-bosses-side-actions">
                        <button
                          type="button"
                          className="incursions-secondary-button world-bosses-side-action world-bosses-side-action--secondary"
                          onClick={() => handleOpenDetails(panelEvent.id)}
                        >
                          <Eye size={15} />
                          Ver detalhes
                        </button>
                        {canJoinPanel ? (
                          <button
                            type="button"
                            className="incursions-primary-button world-bosses-side-action world-bosses-side-action--primary"
                            onClick={() => void handleJoin(panelEvent.id)}
                            disabled={isBusy}
                          >
                            <BellRing size={15} />
                            {getWorldBossEntryActionLabel()}
                          </button>
                        ) : isPanelBlockedByOtherWorldBoss ? (
                          <button
                            type="button"
                            className="incursions-primary-button world-bosses-side-action world-bosses-side-action--primary"
                            disabled
                            title={
                              panelStatus?.eligible?.reason ??
                              "Você já está em outro World Boss."
                            }
                          >
                            <LockKeyhole size={15} />
                            {getWorldBossEntryActionLabel()}
                          </button>
                        ) : null}
                        {canLeavePanel ? (
                          <button
                            type="button"
                            className="incursions-danger-button world-bosses-side-action world-bosses-side-action--danger"
                            onClick={() => void handleLeave(panelEvent.id)}
                            disabled={isBusy}
                          >
                            <XCircle size={15} />
                            Sair
                          </button>
                        ) : null}
                        {panelStatus?.eligible?.reason && !isJoinedPanel ? (
                          <span className="world-bosses-eligible world-bosses-eligible--pending">
                            {panelStatus.eligible.reason}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <ResourceCenterShortcut
                characterId={characterId}
                source="WORLD_BOSS"
              />
            </aside>
          </section>

          {detailsEvent && detailsBoss ? (
            <div
              className="incursions-modal-backdrop world-bosses-modal"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  handleCloseDetails();
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
                  onClick={handleCloseDetails}
                  aria-label="Fechar detalhes do World Boss"
                >
                  <X size={18} />
                </button>
                <div className="world-bosses-modal__hero">
                  <div
                    className="world-bosses-modal__portrait"
                    aria-hidden="true"
                  >
                    {detailsBossImageUrl ? (
                      <img src={detailsBossImageUrl} alt="" />
                    ) : (
                      <span>
                        <Biohazard size={34} />
                      </span>
                    )}
                    {isDetailsLocked ? (
                      <span className="world-bosses-modal__portrait-lock">
                        <LockKeyhole size={22} />
                      </span>
                    ) : null}
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
                      {detailsEvent.status === "ACTIVE"
                        ? detailsEvent.participantCount
                        : (detailsEvent.registrationCount ?? 0)}
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
                {isDetailsLocked && detailsStatus?.eligible?.reason ? (
                  <div className="world-bosses-modal__blocked">
                    <LockKeyhole size={16} />
                    <div>
                      <strong>Participação bloqueada</strong>
                      <span>{detailsStatus.eligible.reason}</span>
                    </div>
                  </div>
                ) : null}
                <div className="world-bosses-modal__rewards-section">
                  <div className="world-bosses-modal__section-head">
                    <h3>Recompensas possíveis</h3>
                  </div>
                  <div className="world-bosses-modal__rewards">
                    {detailsBoss.rewards.map((reward) => {
                      const rewardName = getRewardName(
                        reward,
                        detailsBoss.tier,
                      );
                      const rewardChance = getRewardChanceLabel(reward);
                      const quantityLabel = getQuantityLabel(reward);
                      const requirementLabel =
                        getRewardRequirementLabel(reward);
                      const isRewardRevealed = revealedRewardId === reward.id;

                      return (
                        <button
                          type="button"
                          className={[
                            "world-bosses-reward-card",
                            isRewardRevealed
                              ? "world-bosses-reward-card--revealed"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={reward.id}
                          onClick={() =>
                            setRevealedRewardId((current) =>
                              current === reward.id ? null : reward.id,
                            )
                          }
                          aria-label={`${rewardName}. Quantidade ${quantityLabel}${
                            rewardChance ? `. Chance ${rewardChance}` : ""
                          }`}
                        >
                          {rewardChance ? (
                            <span className="world-bosses-reward-card__chance">
                              {rewardChance}
                            </span>
                          ) : null}
                          <span
                            className="world-bosses-reward-card__icon"
                            aria-hidden="true"
                          >
                            {getRewardIcon(reward, detailsBoss.tier)}
                          </span>
                          <span className="world-bosses-reward-card__reveal">
                            <strong>{rewardName}</strong>
                            <small>Quantidade {quantityLabel}</small>
                            {reward.randomPetCocoon ? (
                              <em>Um dos 8 casulos do tier será sorteado.</em>
                            ) : null}
                            {requirementLabel ? (
                              <em>{requirementLabel}</em>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {revealedCocoonOptions.length > 0 ? (
                    <div className="world-bosses-cocoon-pool">
                      <div className="world-bosses-cocoon-pool__head">
                        <strong>Casulo aleatório T{detailsBoss.tier}</strong>
                        <span>1 dos 8 possíveis</span>
                      </div>
                      <div className="world-bosses-cocoon-pool__grid">
                        {revealedCocoonOptions.map((option) => (
                          <span key={option.key}>
                            <img src={option.imageUrl} alt="" />
                            <small>{option.label}</small>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="world-bosses-actions world-bosses-modal-actions">
                  {canJoinDetails ? (
                    <button
                      className="incursions-primary-button world-bosses-modal-action"
                      type="button"
                      onClick={() => void handleJoin(detailsEvent.id)}
                      disabled={isBusy}
                    >
                      <BellRing size={15} />
                      {getWorldBossEntryActionLabel()}
                    </button>
                  ) : isDetailsBlockedByOtherWorldBoss ? (
                    <button
                      className="incursions-primary-button world-bosses-modal-action"
                      type="button"
                      disabled
                      title={
                        detailsStatus?.eligible?.reason ??
                        "Você já está em outro World Boss."
                      }
                    >
                      <LockKeyhole size={15} />
                      {getWorldBossEntryActionLabel()}
                    </button>
                  ) : null}
                  {canLeaveDetails ? (
                    <button
                      className="incursions-danger-button world-bosses-modal-action"
                      type="button"
                      onClick={() => void handleLeave(detailsEvent.id)}
                      disabled={isBusy}
                    >
                      <XCircle size={15} />
                      Sair
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="incursions-secondary-button world-bosses-modal-action"
                    onClick={handleCloseDetails}
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
