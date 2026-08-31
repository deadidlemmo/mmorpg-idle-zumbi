import { isAxiosError } from "axios";
import {
  CalendarClock,
  Check,
  CircleCheck,
  Clock3,
  Coins,
  Medal,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { normalizeClassName } from "../../characters/api/characters.api";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import {
  claimAchievement,
  claimMission,
  getProgressionDashboard,
} from "../api/progression.api";
import "../styles/progression.css";
import type {
  CharacterAchievement,
  CharacterMission,
  ProgressionDashboardResponse,
} from "../types/progression.types";

type ProgressionTab = "missions" | "achievements";

function buildCharacter(
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
    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,
    status: character.status ?? "ACTIVE",
  } as DashboardCharacterViewModel;
}

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: string })?.message;
    if (message) return message;
  }
  return "Não foi possível atualizar os objetivos.";
}

function MissionCard({
  mission,
  isBusy,
  onClaim,
}: {
  mission: CharacterMission;
  isBusy: boolean;
  onClaim: () => void;
}) {
  const percent = Math.min(
    100,
    Math.round((mission.progress / Math.max(1, mission.targetValue)) * 100),
  );
  const canClaim = mission.status === "COMPLETED" && !mission.claimedAt;

  return (
    <article
      className={`progression-item progression-item--${mission.status.toLowerCase()}`}
    >
      <div className="progression-item__icon">
        {canClaim ? <CircleCheck size={21} /> : <Target size={21} />}
      </div>
      <div className="progression-item__content">
        <div className="progression-item__heading">
          <div>
            <span>
              {mission.mission.type} · T{mission.rewardTier}
            </span>
            <h3>{mission.mission.title}</h3>
          </div>
          <strong>
            {mission.progress}/{mission.targetValue}
          </strong>
        </div>
        <p>{mission.mission.description}</p>
        <div className="progression-item__track">
          <i style={{ width: `${percent}%` }} />
        </div>
        <div className="progression-item__footer">
          <span>
            <Sparkles size={14} /> {mission.mission.rewardXp} XP
          </span>
          <span>
            <Coins size={14} /> {mission.mission.rewardGold} gold
          </span>
          {mission.expiresAt ? (
            <span>
              <Clock3 size={14} /> prazo ativo
            </span>
          ) : null}
          <button
            type="button"
            disabled={!canClaim || isBusy}
            onClick={onClaim}
          >
            {mission.claimedAt
              ? "Resgatada"
              : canClaim
                ? "Resgatar"
                : "Em progresso"}
          </button>
        </div>
      </div>
    </article>
  );
}

function AchievementCard({
  achievement,
  isBusy,
  onClaim,
}: {
  achievement: CharacterAchievement;
  isBusy: boolean;
  onClaim: () => void;
}) {
  const definition = achievement.achievement;
  const percent = Math.min(
    100,
    Math.round(
      (achievement.progress / Math.max(1, definition.targetValue)) * 100,
    ),
  );
  const canClaim = Boolean(achievement.unlockedAt && !achievement.claimedAt);

  return (
    <article
      className={`progression-item progression-item--achievement ${
        achievement.unlockedAt ? "is-unlocked" : ""
      }`}
    >
      <div className="progression-item__icon">
        <Medal size={21} />
      </div>
      <div className="progression-item__content">
        <div className="progression-item__heading">
          <div>
            <span>CONQUISTA</span>
            <h3>{definition.title}</h3>
          </div>
          <strong>
            {achievement.progress}/{definition.targetValue}
          </strong>
        </div>
        <p>{definition.description}</p>
        <div className="progression-item__track">
          <i style={{ width: `${percent}%` }} />
        </div>
        <div className="progression-item__footer">
          <span>
            <Sparkles size={14} /> {definition.rewardCash} cash
          </span>
          <button
            type="button"
            disabled={!canClaim || isBusy}
            onClick={onClaim}
          >
            {achievement.claimedAt
              ? "Resgatada"
              : canClaim
                ? "Resgatar"
                : "Bloqueada"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProgressionPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [progression, setProgression] =
    useState<ProgressionDashboardResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ProgressionTab>("missions");
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!characterId) return;
    const [overviewResponse, progressionResponse] = await Promise.all([
      getCharacterOverview(characterId),
      getProgressionDashboard(characterId),
    ]);
    setOverview(overviewResponse);
    setProgression(progressionResponse);
  }, [characterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void load()
        .catch((loadError) => setError(getErrorMessage(loadError)))
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const refreshVisibleProgress = () => {
      if (document.visibilityState !== "visible") return;
      void load().catch(() => undefined);
    };
    const interval = window.setInterval(refreshVisibleProgress, 10_000);

    document.addEventListener("visibilitychange", refreshVisibleProgress);
    window.addEventListener("focus", refreshVisibleProgress);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisibleProgress);
      window.removeEventListener("focus", refreshVisibleProgress);
    };
  }, [load]);

  const character = useMemo(
    () => (overview ? buildCharacter(overview) : null),
    [overview],
  );

  if (!characterId) return <Navigate to="/characters" replace />;
  if (isLoading && !character) {
    return <main className="dashboard-loading">Carregando objetivos...</main>;
  }
  if (!character || !progression) {
    return (
      <main className="dashboard-error">
        {error ?? "Objetivos indisponíveis."}
      </main>
    );
  }

  async function runClaim(id: string, action: () => Promise<unknown>) {
    setActionId(id);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage("Recompensa adicionada ao personagem.");
      await load();
    } catch (claimError) {
      setError(getErrorMessage(claimError));
    } finally {
      setActionId(null);
    }
  }

  const readyMissions = progression.missions.filter(
    (mission) => mission.status === "COMPLETED",
  ).length;
  const unlockedAchievements = progression.achievements.filter(
    (achievement) => achievement.unlockedAt,
  ).length;

  return (
    <DashboardLayout character={character} hideHero>
      <main className="progression-page">
        <header className="progression-header">
          <div>
            <span>Diretivas do abrigo</span>
            <h1>Objetivos</h1>
            <p>Missões renováveis e marcos permanentes do sobrevivente.</p>
          </div>
          <div className="progression-header__stats">
            <span>
              <CalendarClock size={16} /> {readyMissions} missões para resgatar
            </span>
            <span>
              <Trophy size={16} /> {unlockedAchievements} conquistas
            </span>
          </div>
        </header>

        {message ? (
          <div className="progression-notice is-success">{message}</div>
        ) : null}
        {error ? (
          <div className="progression-notice is-error">{error}</div>
        ) : null}

        <div className="progression-tabs" role="tablist" aria-label="Objetivos">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "missions"}
            className={activeTab === "missions" ? "is-active" : ""}
            onClick={() => setActiveTab("missions")}
          >
            <Target size={16} /> Missões
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "achievements"}
            className={activeTab === "achievements" ? "is-active" : ""}
            onClick={() => setActiveTab("achievements")}
          >
            <Trophy size={16} /> Conquistas
          </button>
        </div>

        <section className="progression-list">
          {activeTab === "missions"
            ? progression.missions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  isBusy={actionId === mission.id}
                  onClaim={() =>
                    void runClaim(mission.id, () =>
                      claimMission(characterId, mission.id),
                    )
                  }
                />
              ))
            : progression.achievements.map((achievement) => (
                <AchievementCard
                  key={achievement.id}
                  achievement={achievement}
                  isBusy={actionId === achievement.id}
                  onClaim={() =>
                    void runClaim(achievement.id, () =>
                      claimAchievement(characterId, achievement.id),
                    )
                  }
                />
              ))}
        </section>

        {activeTab === "missions" && progression.missions.length === 0 ? (
          <div className="progression-empty">
            <Check size={20} /> Nenhuma missão ativa.
          </div>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
