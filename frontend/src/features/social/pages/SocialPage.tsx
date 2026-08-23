import { isAxiosError } from "axios";
import {
  Check,
  Clock3,
  Eye,
  Search,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { normalizeClassName } from "../../characters/api/characters.api";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import {
  acceptFriendRequest,
  getSocialDashboard,
  removeFriendship,
  searchSocialCharacters,
  sendFriendRequest,
} from "../api/social.api";
import "../styles/social.css";
import type {
  Friendship,
  SocialCharacterSearchResponse,
  SocialCharacterSearchResult,
  SocialDashboardResponse,
} from "../types/social.types";

type SocialTab = "friends" | "incoming" | "outgoing";

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
    const data = error.response?.data as { message?: string | string[] };
    if (Array.isArray(data?.message)) return data.message.join(" ");
    if (data?.message) return data.message;
  }
  return "Não foi possível atualizar seus aliados.";
}

function FriendshipRow({
  friendship,
  kind,
  isBusy,
  onAccept,
  onRemove,
  onInspect,
}: {
  friendship: Friendship;
  kind: "friend" | "incoming" | "outgoing";
  isBusy: boolean;
  onAccept?: () => void;
  onRemove: () => void;
  onInspect?: () => void;
}) {
  const leadCharacter = friendship.user.characters[0];
  const additionalCharacters = Math.max(
    0,
    friendship.user.characters.length - 1,
  );
  const removeLabel =
    kind === "friend"
      ? "Remover aliado"
      : kind === "incoming"
        ? "Recusar pedido"
        : "Cancelar pedido";

  return (
    <article className="social-row">
      <CharacterPortrait
        className="social-row__avatar"
        name={leadCharacter?.name ?? "Sobrevivente"}
        avatarKey={leadCharacter?.avatarKey}
        appearance={leadCharacter?.appearance}
        decorative
      />
      <div className="social-row__identity">
        <strong>{leadCharacter?.name ?? "Sobrevivente sem personagem"}</strong>
        <span>
          {leadCharacter
            ? `${leadCharacter.class?.name ?? "Sobrevivente"} · Nv. ${leadCharacter.level}`
            : "Nenhum personagem ativo"}
        </span>
        {additionalCharacters ? (
          <small>
            +{additionalCharacters}{" "}
            {additionalCharacters === 1 ? "personagem" : "personagens"} na conta
          </small>
        ) : leadCharacter?.map ? (
          <small>{leadCharacter.map.name}</small>
        ) : null}
      </div>
      <div className={`social-row__state is-${kind}`}>
        {kind === "friend" ? (
          <span>
            <UserCheck size={14} /> Aliado
          </span>
        ) : kind === "incoming" ? (
          <span>
            <UserPlus size={14} /> Recebido
          </span>
        ) : (
          <span>
            <Clock3 size={14} /> Enviado
          </span>
        )}
      </div>
      <div className="social-row__actions">
        {onInspect ? (
          <button
            className="is-inspect"
            type="button"
            title="Inspecionar personagem"
            aria-label="Inspecionar personagem"
            onClick={onInspect}
          >
            <Eye size={16} />
          </button>
        ) : null}
        {kind === "incoming" && onAccept ? (
          <button
            className="is-primary"
            type="button"
            title="Aceitar pedido"
            aria-label="Aceitar pedido"
            disabled={isBusy}
            onClick={onAccept}
          >
            <Check size={16} />
          </button>
        ) : null}
        <button
          type="button"
          title={removeLabel}
          aria-label={removeLabel}
          disabled={isBusy}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function SearchResultRow({
  result,
  isBusy,
  onSend,
  onAccept,
  onInspect,
}: {
  result: SocialCharacterSearchResult;
  isBusy: boolean;
  onSend: () => void;
  onAccept: (friendshipId: string) => void;
  onInspect: () => void;
}) {
  const { character, relationship } = result;
  const accepted = relationship?.status === "ACCEPTED";
  const incoming =
    relationship?.status === "PENDING" && relationship.direction === "INCOMING";
  const outgoing =
    relationship?.status === "PENDING" && relationship.direction === "OUTGOING";

  return (
    <article className="social-search-result">
      <CharacterPortrait
        className="social-search-result__avatar"
        name={character.name}
        avatarKey={character.avatarKey}
        appearance={character.appearance}
        decorative
      />
      <div className="social-search-result__identity">
        <strong>{character.name}</strong>
        <span>
          {character.class?.name ?? "Sobrevivente"} · Nv. {character.level}
        </span>
        {character.appearance?.title?.displayText ? (
          <small>{character.appearance.title.displayText}</small>
        ) : character.map ? (
          <small>{character.map.name}</small>
        ) : null}
      </div>
      <button
        className="social-search-result__inspect"
        type="button"
        title="Inspecionar personagem"
        aria-label={`Inspecionar ${character.name}`}
        onClick={onInspect}
      >
        <Eye size={15} />
      </button>
      {accepted ? (
        <span className="social-search-result__status is-accepted">
          <UserCheck size={14} /> Aliado
        </span>
      ) : outgoing ? (
        <span className="social-search-result__status">
          <Clock3 size={14} /> Enviado
        </span>
      ) : incoming && relationship ? (
        <button
          className="social-search-result__command"
          type="button"
          disabled={isBusy}
          onClick={() => onAccept(relationship.id)}
        >
          <Check size={15} /> Aceitar
        </button>
      ) : (
        <button
          className="social-search-result__command"
          type="button"
          disabled={isBusy}
          onClick={onSend}
        >
          <UserPlus size={15} /> Adicionar
        </button>
      )}
    </article>
  );
}

export function SocialPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [social, setSocial] = useState<SocialDashboardResponse | null>(null);
  const [activeTab, setActiveTab] = useState<SocialTab>("friends");
  const [nickname, setNickname] = useState("");
  const [searchResponse, setSearchResponse] =
    useState<SocialCharacterSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!characterId) return;
    const [overviewResponse, socialResponse] = await Promise.all([
      getCharacterOverview(characterId),
      getSocialDashboard(),
    ]);
    setOverview(overviewResponse);
    setSocial(socialResponse);
  }, [characterId]);

  const runSearch = useCallback(async (value: string) => {
    const query = value.trim();
    if (query.length < 2) return;

    setIsSearching(true);
    setError(null);
    try {
      setSearchResponse(await searchSocialCharacters(query));
    } catch (searchError) {
      setError(getErrorMessage(searchError));
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void load()
        .catch((loadError) => setError(getErrorMessage(loadError)))
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const character = useMemo(
    () => (overview ? buildCharacter(overview) : null),
    [overview],
  );

  if (!characterId) return <Navigate to="/characters" replace />;
  if (isLoading && !character) {
    return <main className="dashboard-loading">Carregando aliados...</main>;
  }
  if (!character || !social) {
    return (
      <main className="dashboard-error">
        {error ?? "Aliados indisponíveis."}
      </main>
    );
  }

  async function execute(
    id: string,
    action: () => Promise<unknown>,
    refreshSearch = false,
  ) {
    setActionId(id);
    setError(null);
    setMessage(null);
    try {
      const response = (await action()) as { message?: string };
      setMessage(response.message ?? "Lista de aliados atualizada.");
      await load();
      if (refreshSearch && searchResponse?.query) {
        setSearchResponse(await searchSocialCharacters(searchResponse.query));
      }
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setActionId(null);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearch(nickname);
  }

  const tabs: Array<{
    key: SocialTab;
    title: string;
    items: Friendship[];
    kind: "incoming" | "friend" | "outgoing";
  }> = [
    {
      key: "friends",
      title: "Aliados",
      items: social.friends,
      kind: "friend",
    },
    {
      key: "incoming",
      title: "Recebidos",
      items: social.incoming,
      kind: "incoming",
    },
    {
      key: "outgoing",
      title: "Enviados",
      items: social.outgoing,
      kind: "outgoing",
    },
  ];
  const activeSection = tabs.find(({ key }) => key === activeTab) ?? tabs[0];

  return (
    <DashboardLayout character={character} hideHero>
      <main className="social-page">
        <header className="social-header">
          <div>
            <span>Rede de sobreviventes</span>
            <h1>Aliados</h1>
            <p>Conexões do seu abrigo.</p>
          </div>
          <div className="social-header__summary">
            <strong>
              <Users size={17} /> {social.friends.length}
            </strong>
            <span>aliados</span>
          </div>
        </header>

        {message ? (
          <div className="social-notice is-success" role="status">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="social-notice is-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="social-workspace">
          <section
            className="social-connections"
            aria-labelledby="social-list-title"
          >
            <div className="social-section-heading">
              <div>
                <span>Minha rede</span>
                <h2 id="social-list-title">Conexões</h2>
              </div>
              {social.incoming.length ? (
                <strong>{social.incoming.length} pendente</strong>
              ) : null}
            </div>

            <div
              className="social-tabs"
              role="tablist"
              aria-label="Conexões sociais"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={activeTab === tab.key ? "is-active" : ""}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.title}
                  <span>{tab.items.length}</span>
                </button>
              ))}
            </div>

            {activeSection.items.length ? (
              <div className="social-list" role="tabpanel">
                {activeSection.items.map((friendship) => (
                  <FriendshipRow
                    key={friendship.id}
                    friendship={friendship}
                    kind={activeSection.kind}
                    isBusy={actionId === friendship.id}
                    onAccept={
                      activeSection.kind === "incoming"
                        ? () =>
                            void execute(friendship.id, () =>
                              acceptFriendRequest(friendship.id),
                            )
                        : undefined
                    }
                    onRemove={() =>
                      void execute(friendship.id, () =>
                        removeFriendship(friendship.id),
                      )
                    }
                    onInspect={
                      friendship.user.characters[0]
                        ? () =>
                            navigate(
                              `/dashboard/${characterId}/inspect/${friendship.user.characters[0].id}`,
                            )
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="social-empty">
                <Users size={22} />
                <strong>Nenhum registro</strong>
                <span>{activeSection.title}</span>
              </div>
            )}
          </section>

          <aside
            className="social-discovery"
            aria-labelledby="social-search-title"
          >
            <div className="social-section-heading">
              <div>
                <span>Recrutamento</span>
                <h2 id="social-search-title">Encontrar aliado</h2>
              </div>
              <UserPlus size={19} />
            </div>

            <form
              className="social-search"
              onSubmit={(event) => void handleSearch(event)}
            >
              <label htmlFor="friend-nickname">Apelido do personagem</label>
              <div>
                <Search size={17} aria-hidden="true" />
                <input
                  id="friend-nickname"
                  type="search"
                  value={nickname}
                  minLength={2}
                  maxLength={24}
                  required
                  autoComplete="off"
                  placeholder="Buscar apelido"
                  onChange={(event) => setNickname(event.target.value)}
                />
                <button type="submit" disabled={isSearching}>
                  <Send size={15} /> {isSearching ? "Buscando" : "Buscar"}
                </button>
              </div>
            </form>

            <div className="social-search-results" aria-live="polite">
              {isSearching ? (
                <div className="social-search-state">
                  <span className="loading-spinner" />
                  Buscando sobreviventes
                </div>
              ) : searchResponse?.results.length ? (
                searchResponse.results.map((result) => (
                  <SearchResultRow
                    key={result.character.id}
                    result={result}
                    isBusy={actionId === `search-${result.character.id}`}
                    onInspect={() =>
                      navigate(
                        `/dashboard/${characterId}/inspect/${result.character.id}`,
                      )
                    }
                    onSend={() =>
                      void execute(
                        `search-${result.character.id}`,
                        () => sendFriendRequest(result.character.id),
                        true,
                      )
                    }
                    onAccept={(friendshipId) =>
                      void execute(
                        `search-${result.character.id}`,
                        () => acceptFriendRequest(friendshipId),
                        true,
                      )
                    }
                  />
                ))
              ) : searchResponse ? (
                <div className="social-search-state">
                  <Search size={20} />
                  Nenhum sobrevivente encontrado
                </div>
              ) : (
                <div className="social-search-state is-idle">
                  <Search size={20} />
                  Busca por apelido
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </DashboardLayout>
  );
}
