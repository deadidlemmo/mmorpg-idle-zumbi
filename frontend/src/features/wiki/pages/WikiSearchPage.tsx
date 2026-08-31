import { BookOpen, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchWiki } from "../api/wiki.api";
import { WikiBreadcrumbs } from "../components/WikiBreadcrumbs";
import { WikiEntityCard } from "../components/WikiEntityCard";
import { searchEditorialPages } from "../content/wikiEditorialContent";
import type {
  WikiEntityKind,
  WikiSearchResponse,
} from "../types/wiki.types";

const GROUPS: Array<{
  kind: WikiEntityKind;
  label: string;
  key: keyof WikiSearchResponse["groups"];
}> = [
  { kind: "items", label: "Itens", key: "items" },
  { kind: "monsters", label: "Monstros", key: "monsters" },
  { kind: "bosses", label: "Bosses", key: "bosses" },
  { kind: "maps", label: "Mapas", key: "maps" },
];

function getEditorialPath(slug: string) {
  if (slug === "getting-started") return "/wiki/getting-started";
  if (slug === "combat") return "/wiki/combat";
  if (slug === "progression") return "/wiki/progression";
  return `/wiki/systems/${slug}`;
}

export function WikiSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [requestState, setRequestState] = useState<{
    query: string;
    results: WikiSearchResponse | null;
    error: string | null;
  }>({ query: "", results: null, error: null });
  const editorialResults = useMemo(() => searchEditorialPages(query), [query]);

  useEffect(() => {
    if (query.length < 2) {
      return;
    }
    const controller = new AbortController();
    searchWiki(query, controller.signal)
      .then((results) => setRequestState({ query, results, error: null }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setRequestState({
            query,
            results: null,
            error: "Não foi possível concluir a pesquisa.",
          });
        }
      });
    return () => controller.abort();
  }, [query]);

  const results = requestState.query === query ? requestState.results : null;
  const error = requestState.query === query ? requestState.error : null;
  const isLoading = query.length >= 2 && requestState.query !== query;

  const dynamicCount = GROUPS.reduce(
    (total, group) => total + (results?.groups[group.key].length ?? 0),
    0,
  );
  const total = dynamicCount + editorialResults.length;

  return (
    <div className="wiki-page">
      <WikiBreadcrumbs items={[{ label: "Pesquisa" }]} />
      <header className="wiki-page-heading">
        <span>Pesquisa global</span>
        <h1>{query ? `Resultados para “${query}”` : "Pesquisar na Wiki"}</h1>
        <p>{query ? `${total} resultados encontrados.` : "Digite um nome ou uma pergunta curta."}</p>
      </header>

      <form
        className="wiki-search-page-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const trimmed = String(form.get("q") ?? "").trim();
          if (trimmed.length >= 2) setSearchParams({ q: trimmed });
        }}
      >
        <Search size={19} aria-hidden="true" />
        <input key={query || "empty"} name="q" defaultValue={query} placeholder="Ex.: onde consigo poção?" />
        <button type="submit">Pesquisar</button>
      </form>

      {error ? <div className="wiki-state wiki-state--error">{error}</div> : null}
      {isLoading ? <div className="wiki-state">Pesquisando...</div> : null}

      {!isLoading && editorialResults.length ? (
        <section className="wiki-search-group">
          <h2>Sistemas e guias</h2>
          <div className="wiki-link-list wiki-link-list--columns">
            {editorialResults.map((page) => (
              <Link key={page.slug} to={getEditorialPath(page.slug)}>
                <BookOpen size={18} aria-hidden="true" />
                <span><strong>{page.title}</strong><small>{page.summary}</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading ? GROUPS.map((group) => {
        const entities = results?.groups[group.key] ?? [];
        if (!entities.length) return null;
        return (
          <section className="wiki-search-group" key={group.key}>
            <h2>{group.label}</h2>
            <div className="wiki-entity-grid wiki-entity-grid--featured">
              {entities.map((entity) => (
                <WikiEntityCard key={entity.id} kind={group.kind} entity={entity} compact />
              ))}
            </div>
          </section>
        );
      }) : null}

      {!isLoading && query.length >= 2 && total === 0 && !error ? (
        <div className="wiki-state">
          <strong>Nenhum conteúdo encontrado</strong>
          <p>Tente usar somente o nome principal ou confira a escrita.</p>
        </div>
      ) : null}
    </div>
  );
}
