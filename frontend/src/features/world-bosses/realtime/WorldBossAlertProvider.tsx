import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BellRing,
  Biohazard,
  CheckCircle2,
  LockKeyhole,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { canRunNetworkRefresh } from "../../../utils/networkRefresh";
import {
  getAvailableWorldBosses,
  getWorldBossRegistrations,
  joinWorldBoss,
} from "../api/world-bosses.api";
import type { WorldBossStatusResponse } from "../types/world-bosses.types";
import { mergeWorldBossStatusSnapshot } from "../utils/worldBossStatus";
import {
  getWorldBossAlertCopy,
  getWorldBossAlertKey,
  getWorldBossAlertMilestone,
  WORLD_BOSS_REGISTRATION_NOTICE,
  WORLD_BOSS_STATUS_SYNC_EVENT,
  type WorldBossAlertMilestone,
} from "../utils/worldBossAlerts";
import { getWorldBossImageUrl } from "../utils/worldBossAssets";
import "../styles/world-bosses.css";

type WorldBossAlertProviderProps = {
  characterId: string;
  children: ReactNode;
};

type ActiveWorldBossAlert = {
  key: string;
  milestone: WorldBossAlertMilestone;
  status: WorldBossStatusResponse;
};

const MILESTONE_PRIORITY: Record<WorldBossAlertMilestone, number> = {
  LOBBY_OPEN: 3,
  FIFTEEN_MINUTES: 2,
  ONE_HOUR: 1,
};

function mergeStatuses(
  available: WorldBossStatusResponse[],
  registrations: WorldBossStatusResponse[],
) {
  const byEventId = new Map<string, WorldBossStatusResponse>();
  for (const status of available) {
    if (status.event) byEventId.set(status.event.id, status);
  }
  for (const status of registrations) {
    if (!status.event) continue;
    byEventId.set(
      status.event.id,
      mergeWorldBossStatusSnapshot(byEventId.get(status.event.id) ?? null, status),
    );
  }
  return Array.from(byEventId.values());
}

export function WorldBossAlertProvider({
  characterId,
  children,
}: WorldBossAlertProviderProps) {
  const navigate = useNavigate();
  const [activeAlert, setActiveAlert] = useState<ActiveWorldBossAlert | null>(
    null,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const activeAlertRef = useRef<ActiveWorldBossAlert | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  const refreshAlerts = useCallback(async () => {
    if (loadingRef.current || !canRunNetworkRefresh()) return;
    loadingRef.current = true;

    try {
      const [available, registrations] = await Promise.all([
        getAvailableWorldBosses(characterId),
        getWorldBossRegistrations(characterId),
      ]);
      const statuses = mergeStatuses(available.events, registrations.events);
      const current = activeAlertRef.current;

      if (current?.status.event) {
        const refreshed = statuses.find(
          (status) => status.event?.id === current.status.event?.id,
        );
        if (refreshed) {
          setActiveAlert({
            ...current,
            status: mergeWorldBossStatusSnapshot(current.status, refreshed),
          });
        }
        return;
      }

      const nowMs = Date.now();
      const nextAlert = statuses
        .flatMap((status) => {
          const event = status.event;
          const milestone = getWorldBossAlertMilestone(status, nowMs);
          if (!event || !milestone) return [];

          return [
            {
              key: getWorldBossAlertKey(characterId, event.id, milestone),
              milestone,
              status,
            } satisfies ActiveWorldBossAlert,
          ];
        })
        .filter((candidate) => !window.sessionStorage.getItem(candidate.key))
        .sort((left, right) => {
          const priority =
            MILESTONE_PRIORITY[right.milestone] -
            MILESTONE_PRIORITY[left.milestone];
          if (priority !== 0) return priority;
          return (
            Date.parse(left.status.event?.startsAt ?? "") -
            Date.parse(right.status.event?.startsAt ?? "")
          );
        })[0];

      if (nextAlert) {
        window.sessionStorage.setItem(
          nextAlert.key,
          new Date(nowMs).toISOString(),
        );
        setFeedback(null);
        setActiveAlert(nextAlert);
      }
    } catch {
      // O polling global é auxiliar; as páginas continuam reconciliando via REST.
    } finally {
      loadingRef.current = false;
    }
  }, [characterId]);

  useEffect(() => {
    void refreshAlerts();
    const interval = window.setInterval(() => {
      void refreshAlerts();
    }, 30_000);
    const refreshOnResume = () => {
      if (canRunNetworkRefresh()) void refreshAlerts();
    };

    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("online", refreshOnResume);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("online", refreshOnResume);
    };
  }, [refreshAlerts]);

  useEffect(() => {
    const syncStatus = (event: Event) => {
      const next = (event as CustomEvent<WorldBossStatusResponse>).detail;
      if (!next?.event) return;
      setActiveAlert((current) => {
        if (!current || current.status.event?.id !== next.event?.id) {
          return current;
        }
        return {
          ...current,
          status: mergeWorldBossStatusSnapshot(current.status, next),
        };
      });
    };

    window.addEventListener(WORLD_BOSS_STATUS_SYNC_EVENT, syncStatus);
    return () => {
      window.removeEventListener(WORLD_BOSS_STATUS_SYNC_EVENT, syncStatus);
    };
  }, []);

  async function handleRegister() {
    const eventId = activeAlert?.status.event?.id;
    if (!eventId || activeAlert.status.participant || isRegistering) return;

    setIsRegistering(true);
    setFeedback(null);
    try {
      const next = await joinWorldBoss(characterId, eventId);
      setActiveAlert((current) =>
        current
          ? {
              ...current,
              status: mergeWorldBossStatusSnapshot(current.status, next),
            }
          : current,
      );
      setFeedback(next.message ?? WORLD_BOSS_REGISTRATION_NOTICE);
      window.dispatchEvent(
        new CustomEvent<WorldBossStatusResponse>(WORLD_BOSS_STATUS_SYNC_EVENT, {
          detail: next,
        }),
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a inscrição.",
      );
    } finally {
      setIsRegistering(false);
    }
  }

  const status = activeAlert?.status ?? null;
  const event = status?.event ?? null;
  const isRegistered = Boolean(status?.participant);
  const canRegister = Boolean(
    event &&
      !isRegistered &&
      status?.eligible?.canJoin &&
      (event.status === "SCHEDULED" || event.status === "LOBBY_OPEN"),
  );
  const isLocked = Boolean(event && !isRegistered && !canRegister);
  const bossImageUrl = getWorldBossImageUrl(event?.worldBoss);

  return (
    <>
      {children}
      {activeAlert && event ? (
        <div className="world-boss-global-alert-layer" aria-live="polite">
          <section
            className="world-boss-global-alert"
            aria-label={`Alerta de Ameaça Global: ${event.worldBoss.name}`}
          >
            <button
              type="button"
              className="world-boss-global-alert__close"
              onClick={() => setActiveAlert(null)}
              title="Fechar alerta"
              aria-label="Fechar alerta"
            >
              <X size={18} />
            </button>

            <div className="world-boss-global-alert__visual" aria-hidden="true">
              {bossImageUrl ? (
                <img src={bossImageUrl} alt="" />
              ) : (
                <Biohazard size={42} />
              )}
              {isLocked ? (
                <span className="world-boss-global-alert__lock">
                  <LockKeyhole size={20} />
                </span>
              ) : null}
            </div>

            <div className="world-boss-global-alert__content">
              <span className="world-boss-global-alert__eyebrow">
                <BellRing size={14} />
                Alerta de Ameaça Global
              </span>
              <h2>{event.worldBoss.name}</h2>
              <p>{getWorldBossAlertCopy(activeAlert.milestone)}</p>
              <small>{WORLD_BOSS_REGISTRATION_NOTICE}</small>
              {feedback ? (
                <div
                  className={`world-boss-global-alert__feedback${
                    isRegistered
                      ? " world-boss-global-alert__feedback--success"
                      : ""
                  }`}
                >
                  {feedback}
                </div>
              ) : null}
              {isLocked && status?.eligible?.reason ? (
                <div className="world-boss-global-alert__blocked">
                  <LockKeyhole size={14} />
                  {status.eligible.reason}
                </div>
              ) : null}
            </div>

            <div className="world-boss-global-alert__actions">
              {isRegistered ? (
                <span className="world-boss-global-alert__registered">
                  <CheckCircle2 size={16} />
                  Inscrito
                </span>
              ) : (
                <button
                  type="button"
                  className="world-boss-global-alert__primary"
                  onClick={() => void handleRegister()}
                  disabled={!canRegister || isRegistering}
                  title={
                    canRegister
                      ? undefined
                      : status?.eligible?.reason ?? "Inscrição indisponível"
                  }
                >
                  {isLocked ? (
                    <LockKeyhole size={16} />
                  ) : (
                    <BellRing size={16} />
                  )}
                  {isRegistering
                    ? "Inscrevendo..."
                    : isLocked
                      ? "Bloqueado"
                      : "Inscrever-se"}
                </button>
              )}
              <button
                type="button"
                className="world-boss-global-alert__secondary"
                onClick={() =>
                  navigate(`/dashboard/${characterId}/world-bosses`)
                }
              >
                Ver ameaça
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
