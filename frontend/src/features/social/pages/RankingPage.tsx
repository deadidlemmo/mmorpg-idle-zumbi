import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Eye,
  Medal,
  Pickaxe,
  Trophy,
  UserRoundCheck,
} from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import autoCombatActivityIcon from "../../../assets/images/auto-combat/auto-combat-activity-icon.webp";
import huntingActivityIcon from "../../../assets/images/auto-combat/hunting-activity-icon.webp";
import craftingActivityIcon from "../../../assets/images/crafting/skills/crafting.webp";
import { normalizeClassName } from "../../characters/api/characters.api";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import {
  getCosmeticEffectClass,
  getCosmeticImage,
} from "../../cosmetics/constants/cosmetic-assets";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import { GATHERING_ORIGIN_ICON_BY_ORIGIN } from "../../gathering/constants/gathering-origin-icons";
import { getSocialRanking } from "../api/social.api";
import "../styles/ranking.css";
import type {
  SocialRankingCategory,
  SocialRankingEntry,
  SocialRankingResponse,
} from "../types/social.types";

const PRIMARY_CATEGORIES: ReadonlyArray<{
  key: SocialRankingCategory;
  label: string;
  icon: string;
}> = [
  { key: "LEVEL", label: "Nível", icon: autoCombatActivityIcon },
  { key: "HUNTING", label: "Caça", icon: huntingActivityIcon },
  { key: "CRAFTING", label: "Criação", icon: craftingActivityIcon },
];

const EXPEDITION_CATEGORIES: ReadonlyArray<{
  key: SocialRankingCategory;
  label: string;
  icon: string;
}> = [
  {
    key: "DESMANCHE",
    label: "Desmanche",
    icon: GATHERING_ORIGIN_ICON_BY_ORIGIN.DESMANCHE,
  },
  {
    key: "COLETA",
    label: "Coleta",
    icon: GATHERING_ORIGIN_ICON_BY_ORIGIN.COLETA,
  },
  {
    key: "CONTENCAO",
    label: "Contenção",
    icon: GATHERING_ORIGIN_ICON_BY_ORIGIN.CONTENCAO,
  },
  {
    key: "ARSENAL",
    label: "Arsenal",
    icon: GATHERING_ORIGIN_ICON_BY_ORIGIN.ARSENAL,
  },
  {
    key: "PATRULHA",
    label: "Patrulha",
    icon: GATHERING_ORIGIN_ICON_BY_ORIGIN.PATRULHA,
  },
  {
    key: "TECNOVARREDURA",
    label: "Tecnovarredura",
    icon: GATHERING_ORIGIN_ICON_BY_ORIGIN.TECNOVARREDURA,
  },
];

const numberFormatter = new Intl.NumberFormat("pt-BR");

function getMetricLabel(category: SocialRankingCategory) {
  return category === "LEVEL" ? "Nível geral" : "Proficiência";
}

function getCategoryLabel(category: SocialRankingCategory) {
  return (
    PRIMARY_CATEGORIES.find((item) => item.key === category)?.label ??
    EXPEDITION_CATEGORIES.find((item) => item.key === category)?.label ??
    "Ranking"
  );
}

function getPodiumLabel(rank: number) {
  if (rank === 1) return "Líder";
  if (rank === 2) return "Segundo lugar";
  return "Terceiro lugar";
}

function ExpeditionRankingPicker({
  value,
  onChange,
}: {
  value: SocialRankingCategory | "";
  onChange: (category: SocialRankingCategory) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = EXPEDITION_CATEGORIES.find(
    (option) => option.key === value,
  );

  return (
    <div
      className={`ranking-expedition-picker${selectedOption ? " is-active" : ""}`}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;

        if (
          nextFocus instanceof Node &&
          event.currentTarget.contains(nextFocus)
        ) {
          return;
        }

        setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>("button")
            ?.focus();
        }
      }}
    >
      <button
        type="button"
        className="ranking-expedition-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="ranking-expedition-picker__icon" aria-hidden="true">
          {selectedOption ? (
            <img src={selectedOption.icon} alt="" draggable={false} />
          ) : (
            <Pickaxe size={20} />
          )}
        </span>
        <span className="ranking-expedition-picker__copy">
          <small>Expedições</small>
          <strong>{selectedOption?.label ?? "Escolher atividade"}</strong>
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className="ranking-expedition-picker__menu"
          role="listbox"
          aria-label="Ranking de expedições"
        >
          {EXPEDITION_CATEGORIES.map((option) => {
            const isSelected = option.key === value;

            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={isSelected ? "is-selected" : ""}
                onClick={() => {
                  onChange(option.key);
                  setIsOpen(false);
                }}
              >
                <span aria-hidden="true">
                  <img src={option.icon} alt="" draggable={false} />
                </span>
                <strong>{option.label}</strong>
                {isSelected ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

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

function RankingPosition({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="ranking-position is-gold" aria-label="Primeiro lugar">
        <Crown size={18} />
        <strong>1</strong>
      </span>
    );
  }

  if (rank <= 3) {
    return (
      <span
        className={`ranking-position ${rank === 2 ? "is-silver" : "is-bronze"}`}
        aria-label={`${rank}º lugar`}
      >
        <Medal size={17} />
        <strong>{rank}</strong>
      </span>
    );
  }

  return (
    <span className="ranking-position" aria-label={`${rank}º lugar`}>
      <strong>{rank}</strong>
    </span>
  );
}

function RankingRow({
  entry,
  category,
  isCurrentCharacter,
  inspectHref,
}: {
  entry: SocialRankingEntry;
  category: SocialRankingCategory;
  isCurrentCharacter: boolean;
  inspectHref: string;
}) {
  const appearance = entry.appearance ?? entry.character.appearance;
  const bannerImage = getCosmeticImage(
    appearance?.profileBanner?.assetKey ??
      appearance?.overviewBackground?.assetKey,
  );
  const effectClass = getCosmeticEffectClass(
    appearance?.profileEffect?.effectPreset,
  );
  const style = {
    "--ranking-accent": appearance?.accentColor ?? "#86b85c",
    ...(bannerImage
      ? { "--ranking-banner-image": `url("${bannerImage}")` }
      : {}),
  } as CSSProperties;
  const metricLabel = getMetricLabel(category);

  return (
    <Link
      to={inspectHref}
      className={[
        "ranking-row",
        entry.rank <= 3 ? "is-podium" : "",
        `is-rank-${entry.rank}`,
        bannerImage ? "has-cosmetic-banner" : "",
        isCurrentCharacter ? "is-current-character" : "",
        effectClass,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-label={`Abrir perfil de ${entry.character.name}`}
    >
      <span className="cosmetic-effect-layer" aria-hidden="true" />
      <RankingPosition rank={entry.rank} />
      <CharacterPortrait
        className="ranking-row__avatar"
        name={entry.character.name}
        avatarKey={entry.character.avatarKey}
        appearance={appearance}
        decorative
      />
      <div className="ranking-row__identity">
        <div>
          <strong>{entry.character.name}</strong>
          {isCurrentCharacter ? <em>Você</em> : null}
          {appearance?.badge?.displayText ? (
            <b title={appearance.badge.name}>{appearance.badge.displayText}</b>
          ) : null}
        </div>
        <span>
          {entry.character.class?.name ?? "Sobrevivente"}
          {entry.character.map ? ` · ${entry.character.map.name}` : ""}
        </span>
        {appearance?.title?.displayText ? (
          <small>{appearance.title.displayText}</small>
        ) : null}
      </div>
      <div className="ranking-row__score">
        <span>{metricLabel}</span>
        <strong>Nv. {entry.score.level}</strong>
        <small>{numberFormatter.format(entry.score.totalXp)} XP total</small>
      </div>
      <span className="ranking-row__action" aria-hidden="true">
        <ChevronRight size={18} />
      </span>
    </Link>
  );
}

function RankingPodiumCard({
  entry,
  category,
  isCurrentCharacter,
  onInspect,
}: {
  entry: SocialRankingEntry;
  category: SocialRankingCategory;
  isCurrentCharacter: boolean;
  onInspect: () => void;
}) {
  const appearance = entry.appearance ?? entry.character.appearance;
  const bannerImage = getCosmeticImage(
    appearance?.profileBanner?.assetKey ??
      appearance?.overviewBackground?.assetKey,
  );
  const effectClass = getCosmeticEffectClass(
    appearance?.profileEffect?.effectPreset,
  );
  const style = {
    "--ranking-accent": appearance?.accentColor ?? "#86b85c",
    ...(bannerImage
      ? { "--ranking-banner-image": `url("${bannerImage}")` }
      : {}),
  } as CSSProperties;

  return (
    <article
      className={[
        "ranking-podium-card",
        `is-rank-${entry.rank}`,
        bannerImage ? "has-cosmetic-banner" : "",
        isCurrentCharacter ? "is-current-character" : "",
        effectClass,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-label={`${entry.rank}º lugar: ${entry.character.name}`}
    >
      <div className="ranking-podium-card__profile">
        <span className="cosmetic-effect-layer" aria-hidden="true" />
        <CharacterPortrait
          className="ranking-podium-card__avatar"
          name={entry.character.name}
          avatarKey={entry.character.avatarKey}
          appearance={appearance}
          decorative
        />
        <div className="ranking-podium-card__identity">
          <div>
            <strong>{entry.character.name}</strong>
            {isCurrentCharacter ? <em>Você</em> : null}
            {appearance?.badge?.displayText ? (
              <b title={appearance.badge.name}>
                {appearance.badge.displayText}
              </b>
            ) : null}
          </div>
          <span>{entry.character.class?.name ?? "Sobrevivente"}</span>
          {appearance?.title?.displayText ? (
            <small>{appearance.title.displayText}</small>
          ) : null}
        </div>
        <div className="ranking-podium-card__score">
          <span>{getMetricLabel(category)}</span>
          <strong>Nv. {entry.score.level}</strong>
          <small>{numberFormatter.format(entry.score.totalXp)} XP total</small>
        </div>
        <button
          type="button"
          aria-label={`Inspecionar ${entry.character.name}`}
          onClick={onInspect}
        >
          <Eye size={15} aria-hidden="true" />
          <span>Inspecionar</span>
        </button>
      </div>
      <div className="ranking-podium-card__step" aria-hidden="true">
        <strong>{entry.rank}</strong>
        <span>{getPodiumLabel(entry.rank)}</span>
      </div>
    </article>
  );
}

export function RankingPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [category, setCategory] = useState<SocialRankingCategory>("LEVEL");
  const [ranking, setRanking] = useState<SocialRankingResponse | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(true);
  const [isLoadingRanking, setIsLoadingRanking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!characterId) return;
    setOverview(await getCharacterOverview(characterId));
  }, [characterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoadingCharacter(true);
      void loadOverview()
        .catch(() => setError("Não foi possível carregar o personagem."))
        .finally(() => setIsLoadingCharacter(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoadingRanking(true);
      setError(null);
      void getSocialRanking(category)
        .then((response) => {
          if (active) setRanking(response);
        })
        .catch(() => {
          if (active) setError("Não foi possível carregar o ranking.");
        })
        .finally(() => {
          if (active) setIsLoadingRanking(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [category]);

  const character = useMemo(
    () => (overview ? buildCharacter(overview) : null),
    [overview],
  );
  const expeditionCategory = EXPEDITION_CATEGORIES.some(
    ({ key }) => key === category,
  )
    ? category
    : "";
  const rankingEntries = ranking?.entries ?? [];
  const displayedCategory = ranking?.category ?? category;
  const requestedCategoryLabel = getCategoryLabel(category);
  const isRefreshingRanking = isLoadingRanking && ranking !== null;
  const podiumEntries = rankingEntries.slice(0, 3);
  const remainingEntries = rankingEntries.slice(3);
  const currentEntry = rankingEntries.find(
    (entry) => entry.character.id === characterId,
  );
  if (!characterId) return <Navigate to="/characters" replace />;
  if (isLoadingCharacter && !character) {
    return <main className="dashboard-loading">Carregando ranking...</main>;
  }
  if (!character) {
    return (
      <main className="dashboard-error">
        {error ?? "Ranking indisponível."}
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <main className="ranking-page">
        <header className="ranking-header">
          <div>
            <span>Classificação do abrigo</span>
            <h1>Ranking</h1>
            <p>Classificação geral e por atividade.</p>
          </div>
        </header>

        <section className="ranking-controls" aria-label="Categoria do ranking">
          <div className="ranking-primary-tabs" role="tablist">
            {PRIMARY_CATEGORIES.map((item) => {
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={category === item.key}
                  className={category === item.key ? "is-active" : ""}
                  onClick={() => setCategory(item.key)}
                >
                  <span
                    className="ranking-primary-tabs__icon"
                    aria-hidden="true"
                  >
                    <img src={item.icon} alt="" draggable={false} />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <ExpeditionRankingPicker
            value={expeditionCategory}
            onChange={setCategory}
          />
        </section>

        {error ? (
          <div className="ranking-notice" role="alert">
            {error}
          </div>
        ) : null}

        <section
          className={`ranking-board${isRefreshingRanking ? " is-refreshing" : ""}`}
          aria-labelledby="ranking-title"
          aria-busy={isLoadingRanking}
        >
          <div className="ranking-board__heading">
            <div>
              <span>Classificação atual</span>
              <h2 id="ranking-title">
                {ranking?.label ?? requestedCategoryLabel}
              </h2>
            </div>
            {isRefreshingRanking ? (
              <span className="ranking-board__refresh" role="status">
                <span className="loading-spinner" aria-hidden="true" />
                Atualizando {requestedCategoryLabel}
              </span>
            ) : null}
          </div>

          {rankingEntries.length ? (
            <div
              className={`ranking-results${isRefreshingRanking ? " is-refreshing" : ""}`}
            >
              <div
                className={`ranking-current ${currentEntry ? "is-ranked" : "is-unranked"}`}
              >
                <UserRoundCheck size={20} aria-hidden="true" />
                <div>
                  <span>Sua classificação</span>
                  <strong>
                    {currentEntry
                      ? `${currentEntry.rank}º lugar`
                      : "Sem posição nesta categoria"}
                  </strong>
                </div>
                {currentEntry ? (
                  <div>
                    <span>{getMetricLabel(displayedCategory)}</span>
                    <strong>
                      Nv. {currentEntry.score.level} ·{" "}
                      {numberFormatter.format(currentEntry.score.totalXp)} XP
                    </strong>
                  </div>
                ) : (
                  <div>
                    <span>{getMetricLabel(displayedCategory)}</span>
                    <strong>Sem pontuação registrada</strong>
                  </div>
                )}
              </div>

              <div className="ranking-section-heading">
                <div>
                  <span>Destaques do abrigo</span>
                  <h3>Pódio</h3>
                </div>
              </div>
              <div className="ranking-podium" aria-label="Pódio do ranking">
                {podiumEntries.map((entry) => (
                  <RankingPodiumCard
                    key={entry.character.id}
                    entry={entry}
                    category={displayedCategory}
                    isCurrentCharacter={entry.character.id === characterId}
                    onInspect={() =>
                      navigate(
                        `/dashboard/${characterId}/inspect/${entry.character.id}`,
                      )
                    }
                  />
                ))}
              </div>

              {remainingEntries.length ? (
                <>
                  <div className="ranking-section-heading is-list-heading">
                    <div>
                      <span>Demais classificados</span>
                      <h3>Classificação geral</h3>
                    </div>
                    <strong>{remainingEntries.length} sobreviventes</strong>
                  </div>
                  <div className="ranking-list">
                    {remainingEntries.map((entry) => (
                      <RankingRow
                        key={entry.character.id}
                        entry={entry}
                        category={displayedCategory}
                        isCurrentCharacter={entry.character.id === characterId}
                        inspectHref={`/dashboard/${characterId}/inspect/${entry.character.id}`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : isLoadingRanking ? (
            <div className="ranking-state">
              <span className="loading-spinner" aria-hidden="true" />
              Carregando classificação
            </div>
          ) : (
            <div className="ranking-state">
              <Trophy size={23} />
              Nenhum sobrevivente classificado
            </div>
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}
