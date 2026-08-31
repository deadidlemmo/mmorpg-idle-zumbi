import { ChevronDown, Filter, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getWikiCatalog, getWikiSummary } from "../api/wiki.api";
import { WikiBreadcrumbs } from "../components/WikiBreadcrumbs";
import { WikiEntityCard } from "../components/WikiEntityCard";
import type {
  WikiCatalogResponse,
  WikiEntityKind,
  WikiEntitySummary,
  WikiSummaryResponse,
} from "../types/wiki.types";
import { WIKI_KIND_LABELS } from "../utils/wikiFormatters";

const RARITIES = [
  ["COMMON", "Comum"],
  ["UNCOMMON", "Incomum"],
  ["RARE", "Raro"],
  ["EPIC", "Épico"],
  ["LEGENDARY", "Lendário"],
] as const;

const ITEM_SLOTS = [
  ["MAIN_HAND", "Mão principal"],
  ["OFF_HAND", "Mão secundária"],
  ["HEAD", "Cabeça"],
  ["ARMOR", "Armadura"],
  ["PANTS", "Calças"],
  ["BOOTS", "Botas"],
  ["MATERIAL", "Material"],
  ["CONSUMABLE", "Consumível"],
] as const;

const PUBLISHED_TIERS = [1, 2, 3, 4, 5] as const;

function getCatalogEntities(
  kind: WikiEntityKind,
  response: WikiCatalogResponse | null,
) {
  if (!response) return [];
  return (response[kind] ?? []) as WikiEntitySummary[];
}

export function WikiCatalogPage({
  kind,
  initialSlot,
}: {
  kind: WikiEntityKind;
  initialSlot?: string;
}) {
  const labels = WIKI_KIND_LABELS[kind];
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalogState, setCatalogState] = useState<{
    key: string;
    data: WikiCatalogResponse | null;
    error: string | null;
  }>({ key: "", data: null, error: null });
  const [summary, setSummary] = useState<WikiSummaryResponse | null>(null);
  const [areFiltersOpen, setAreFiltersOpen] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 901px)").matches,
  );

  const search = searchParams.get("search") ?? undefined;
  const tier = Number(searchParams.get("tier")) || undefined;
  const rarity = searchParams.get("rarity") ?? undefined;
  const slot = initialSlot ?? searchParams.get("slot") ?? undefined;
  const mapId = searchParams.get("mapId") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const isResourcesPage = kind === "items" && initialSlot === "MATERIAL";
  const pageTitle = isResourcesPage ? "Recursos" : labels.plural;
  const pageDescription = isResourcesPage
    ? "Materiais de coleta, drops, incursões, reforço e Ameaças Globais."
    : labels.description;

  const requestKey = useMemo(
    () => JSON.stringify({ kind, search, tier, rarity, slot, mapId, page }),
    [kind, mapId, page, rarity, search, slot, tier],
  );

  useEffect(() => {
    const controller = new AbortController();
    getWikiSummary(controller.signal)
      .then(setSummary)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 901px)");
    const syncFilters = (event: MediaQueryListEvent) => {
      setAreFiltersOpen(event.matches);
    };
    mediaQuery.addEventListener("change", syncFilters);
    return () => mediaQuery.removeEventListener("change", syncFilters);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getWikiCatalog(
      kind,
      { search, tier, rarity, slot, mapId, page, pageSize: 24 },
      controller.signal,
    )
      .then((data) => setCatalogState({ key: requestKey, data, error: null }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setCatalogState({
            key: requestKey,
            data: null,
            error: "Não foi possível carregar este catálogo agora.",
          });
        }
      });
    return () => controller.abort();
  }, [kind, mapId, page, rarity, requestKey, search, slot, tier]);

  function updateFilter(key: string, value?: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

  const catalog = catalogState.key === requestKey ? catalogState.data : null;
  const error = catalogState.key === requestKey ? catalogState.error : null;
  const isLoading = catalogState.key !== requestKey;
  const entities = getCatalogEntities(kind, catalog);
  const hasFilters = Boolean(
    search || tier || rarity || mapId || (!initialSlot && slot),
  );
  const activeFilters = [
    search ? { key: "search", label: `Busca: ${search}` } : null,
    tier ? { key: "tier", label: `Tier T${tier}` } : null,
    rarity
      ? {
          key: "rarity",
          label: `Raridade: ${RARITIES.find(([value]) => value === rarity)?.[1] ?? rarity}`,
        }
      : null,
    !initialSlot && slot
      ? {
          key: "slot",
          label: `Tipo: ${ITEM_SLOTS.find(([value]) => value === slot)?.[1] ?? slot}`,
        }
      : null,
    mapId
      ? {
          key: "mapId",
          label: `Mapa: ${summary?.maps.find((map) => map.id === mapId)?.name ?? "selecionado"}`,
        }
      : null,
  ].filter((filter): filter is { key: string; label: string } =>
    Boolean(filter),
  );

  return (
    <div className="wiki-page">
      <WikiBreadcrumbs items={[{ label: pageTitle }]} />
      <header className="wiki-page-heading wiki-page-heading--catalog">
        <span>Consulta rápida</span>
        <h1>{pageTitle}</h1>
        <p>{pageDescription}</p>
      </header>

      <section className="wiki-catalog-tools" aria-label="Filtros do catálogo">
        <form
          className="wiki-catalog-search"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const value = String(form.get("search") ?? "").trim();
            updateFilter("search", value || undefined);
          }}
        >
          <Search size={17} aria-hidden="true" />
          <input
            key={search ?? "all"}
            name="search"
            defaultValue={search ?? ""}
            placeholder={`Buscar em ${pageTitle.toLowerCase()}`}
            aria-label={`Buscar em ${pageTitle}`}
          />
          <button type="submit">Buscar</button>
        </form>

        <div className={`wiki-filter-panel${areFiltersOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="wiki-filter-toggle"
            aria-expanded={areFiltersOpen}
            onClick={() => setAreFiltersOpen((isOpen) => !isOpen)}
          >
            <Filter size={16} aria-hidden="true" />
            <span>Filtros</span>
            {activeFilters.length ? <b>{activeFilters.length}</b> : null}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {areFiltersOpen ? (
            <div className="wiki-filter-grid">
              <label>
                <span>Tier</span>
                <select
                  value={tier ?? ""}
                  onChange={(event) => updateFilter("tier", event.target.value)}
                >
                  <option value="">Todos</option>
                  {PUBLISHED_TIERS.map((value) => (
                    <option key={value} value={value}>
                      T{value}
                    </option>
                  ))}
                </select>
              </label>

              {kind === "items" && !initialSlot ? (
                <label>
                  <span>Tipo</span>
                  <select
                    value={slot ?? ""}
                    onChange={(event) =>
                      updateFilter("slot", event.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    {ITEM_SLOTS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {kind === "items" ? (
                <label>
                  <span>Raridade</span>
                  <select
                    value={rarity ?? ""}
                    onChange={(event) =>
                      updateFilter("rarity", event.target.value)
                    }
                  >
                    <option value="">Todas</option>
                    {RARITIES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {kind !== "maps" && summary?.maps.length ? (
                <label>
                  <span>Mapa</span>
                  <select
                    value={mapId ?? ""}
                    onChange={(event) =>
                      updateFilter("mapId", event.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    {summary.maps.map((map) => (
                      <option key={map.id} value={map.id}>
                        T{map.tier} · {map.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {hasFilters ? (
                <button
                  type="button"
                  className="wiki-filter-reset"
                  onClick={clearFilters}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Limpar todos
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {activeFilters.length ? (
          <div className="wiki-active-filters" aria-label="Filtros ativos">
            {activeFilters.map((filter) => (
              <button
                type="button"
                key={filter.key}
                onClick={() => updateFilter(filter.key, undefined)}
                aria-label={`Remover ${filter.label}`}
              >
                <span>{filter.label}</span>
                <X size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="wiki-catalog-summary" aria-live="polite">
        <strong>{catalog?.pagination.total ?? 0}</strong>
        <span>
          {(catalog?.pagination.total ?? 0) === 1
            ? labels.singular.toLowerCase()
            : labels.plural.toLowerCase()}
        </span>
      </div>

      {error ? (
        <div className="wiki-state wiki-state--error">{error}</div>
      ) : null}
      {isLoading ? (
        <div className="wiki-state">Carregando catálogo...</div>
      ) : entities.length ? (
        <div className="wiki-entity-grid">
          {entities.map((entity) => (
            <WikiEntityCard key={entity.id} kind={kind} entity={entity} />
          ))}
        </div>
      ) : !error ? (
        <div className="wiki-state">
          <strong>Nenhum resultado encontrado</strong>
          <p>Ajuste a pesquisa ou remova um dos filtros.</p>
        </div>
      ) : null}

      {catalog && catalog.pagination.totalPages > 1 ? (
        <nav className="wiki-pagination" aria-label="Paginação do catálogo">
          <button
            type="button"
            disabled={catalog.pagination.page <= 1}
            onClick={() =>
              updateFilter("page", String(catalog.pagination.page - 1))
            }
          >
            Anterior
          </button>
          <span>
            Página <strong>{catalog.pagination.page}</strong> de{" "}
            {catalog.pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={catalog.pagination.page >= catalog.pagination.totalPages}
            onClick={() =>
              updateFilter("page", String(catalog.pagination.page + 1))
            }
          >
            Próxima
          </button>
        </nav>
      ) : null}
    </div>
  );
}
