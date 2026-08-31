import { BookOpen, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { searchWiki } from "../api/wiki.api";
import { searchEditorialPages } from "../content/wikiEditorialContent";
import type {
  WikiEntityKind,
  WikiSearchResponse,
} from "../types/wiki.types";
import {
  getWikiEntityMeta,
  getWikiEntityPath,
} from "../utils/wikiFormatters";

function getEditorialPath(slug: string) {
  if (slug === "getting-started") return "/wiki/getting-started";
  if (slug === "combat") return "/wiki/combat";
  if (slug === "progression") return "/wiki/progression";
  return `/wiki/systems/${slug}`;
}

const SEARCH_GROUPS: Array<{
  kind: WikiEntityKind;
  label: string;
  key: keyof WikiSearchResponse["groups"];
}> = [
  { kind: "items", label: "Itens", key: "items" },
  { kind: "monsters", label: "Monstros", key: "monsters" },
  { kind: "bosses", label: "Bosses", key: "bosses" },
  { kind: "maps", label: "Mapas", key: "maps" },
];

export function WikiSearch({ large = false }: { large?: boolean }) {
  const navigate = useNavigate();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikiSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const editorialResults = useMemo(() => searchEditorialPages(query), [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      searchWiki(trimmed, controller.signal)
        .then((response) => {
          setResults(response);
          setIsOpen(true);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  const hasDynamicResults = SEARCH_GROUPS.some(
    (group) => (results?.groups[group.key].length ?? 0) > 0,
  );
  const hasResults = hasDynamicResults || editorialResults.length > 0;

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setIsOpen(false);
    navigate(`/wiki/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className={`wiki-search${large ? " wiki-search--large" : ""}`}>
      <form role="search" onSubmit={submitSearch}>
        <label className="sr-only" htmlFor={inputId}>
          Pesquisar na Wiki
        </label>
        <Search size={large ? 22 : 18} aria-hidden="true" />
        <input
          id={inputId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={large ? "Ex.: onde consigo poção?" : "Buscar item, monstro ou sistema"}
          autoComplete="off"
        />
        {isLoading ? (
          <LoaderCircle className="wiki-search__spinner" size={18} aria-label="Pesquisando" />
        ) : query ? (
          <button
            type="button"
            className="wiki-search__clear"
            onClick={() => {
              setQuery("");
              setResults(null);
            }}
            aria-label="Limpar pesquisa"
          >
            <X size={17} />
          </button>
        ) : null}
      </form>

      {isOpen && query.trim().length >= 2 ? (
        <div className="wiki-search-results" role="region" aria-label="Resultados da pesquisa">
          {editorialResults.length > 0 ? (
            <section>
              <strong className="wiki-search-results__title">Sistemas e guias</strong>
              {editorialResults.slice(0, 4).map((page) => (
                <Link
                  key={page.slug}
                  to={getEditorialPath(page.slug)}
                  onClick={() => setIsOpen(false)}
                >
                  <BookOpen size={17} aria-hidden="true" />
                  <span>
                    <strong>{page.title}</strong>
                    <small>{page.eyebrow}</small>
                  </span>
                </Link>
              ))}
            </section>
          ) : null}

          {SEARCH_GROUPS.map((group) => {
            const entities = results?.groups[group.key] ?? [];
            if (!entities.length) return null;
            return (
              <section key={group.key}>
                <strong className="wiki-search-results__title">{group.label}</strong>
                {entities.slice(0, 4).map((entity) => (
                  <Link
                    key={entity.id}
                    to={getWikiEntityPath(group.kind, entity)}
                    onClick={() => setIsOpen(false)}
                  >
                    <Search size={16} aria-hidden="true" />
                    <span>
                      <strong>{entity.name}</strong>
                      <small>{getWikiEntityMeta(group.kind, entity).join(" · ")}</small>
                    </span>
                  </Link>
                ))}
              </section>
            );
          })}

          {!isLoading && !hasResults ? (
            <p className="wiki-search-results__empty">Nada encontrado. Tente usar somente o nome principal.</p>
          ) : null}

          {hasResults ? (
            <button type="button" onClick={submitSearch} className="wiki-search-results__all">
              Ver todos os resultados
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
