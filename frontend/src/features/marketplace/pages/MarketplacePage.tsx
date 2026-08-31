import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Coins,
  PackageOpen,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Navigate, useParams } from "react-router-dom";
import goldIcon from "../../../assets/images/coins/gold.webp";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import {
  formatInventoryRarity,
  formatInventoryType,
} from "../../inventory/utils/inventory.utils";
import {
  buyMarketListing,
  cancelMarketListing,
  createMarketListing,
  extractMarketApiError,
  getMarketListings,
  getMarketSellableItems,
  getMyMarketListings,
} from "../api/marketplace.api";
import { MarketItemThumb } from "../components/MarketItemThumb";
import type {
  MarketCharacterSummary,
  MarketItemClassFilter,
  MarketListing,
  MarketListingSort,
  MarketListingStatus,
  MarketListingsResponse,
  MarketPagination,
  MarketSellableItem,
  MarketSellableItemsResponse,
  MyMarketListingsResponse,
} from "../types/marketplace.types";
import "../styles/marketplace.css";

type MarketTab = "buy" | "sell" | "mine";
type Feedback = { tone: "success" | "error"; message: string };

const EMPTY_PAGINATION: MarketPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

const STATUS_LABELS: Record<MarketListingStatus, string> = {
  ACTIVE: "Ativo",
  SOLD_OUT: "Vendido",
  CANCELLED: "Cancelado",
};

const GOLD_FORMATTER = new Intl.NumberFormat("pt-BR");

function formatGold(value: number) {
  return GOLD_FORMATTER.format(Math.max(0, Math.floor(value)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatUnitLabel(quantity: number) {
  return quantity === 1 ? "unidade" : "unidades";
}

function getItemTypeLabel(item: MarketSellableItem) {
  return formatInventoryType({
    inventoryItemId: item.id,
    item: item.item,
    quantity: item.quantity,
    type: item.type,
  });
}

function Pagination({
  pagination,
  onPageChange,
}: {
  pagination: MarketPagination;
  onPageChange: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) return null;

  return (
    <nav className="market-pagination" aria-label="Paginação do mercado">
      <button
        type="button"
        aria-label="Página anterior"
        title="Página anterior"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        <ChevronLeft size={17} />
      </button>
      <span>
        Página <strong>{pagination.page}</strong> de {pagination.totalPages}
      </span>
      <button
        type="button"
        aria-label="Próxima página"
        title="Próxima página"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        <ChevronRight size={17} />
      </button>
    </nav>
  );
}

function MarketRowsLoading() {
  return (
    <div className="market-loading-rows" aria-label="Carregando anúncios">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function MarketplacePage() {
  const { characterId } = useParams();
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [marketCharacter, setMarketCharacter] =
    useState<MarketCharacterSummary | null>(null);
  const [activeTab, setActiveTab] = useState<MarketTab>("buy");
  const [isCharacterLoading, setIsCharacterLoading] = useState(true);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [isSectionLoading, setIsSectionLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [typeFilter, setTypeFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [classFilter, setClassFilter] = useState<MarketItemClassFilter | "">(
    "",
  );
  const [sort, setSort] = useState<MarketListingSort>("NEWEST");
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  const [catalog, setCatalog] = useState<MarketListingsResponse>({
    character: { id: "", name: "", gold: 0 },
    listings: [],
    pagination: EMPTY_PAGINATION,
  });
  const [catalogPage, setCatalogPage] = useState(1);

  const [sellable, setSellable] = useState<MarketSellableItemsResponse | null>(
    null,
  );
  const [mine, setMine] = useState<MyMarketListingsResponse | null>(null);
  const [minePage, setMinePage] = useState(1);
  const [mineStatus, setMineStatus] = useState<MarketListingStatus | "">("");

  const [buyTarget, setBuyTarget] = useState<MarketListing | null>(null);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [buyRequestId, setBuyRequestId] = useState(() => crypto.randomUUID());
  const [sellTarget, setSellTarget] = useState<MarketSellableItem | null>(null);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [sellUnitPrice, setSellUnitPrice] = useState(1);
  const [sellRequestId, setSellRequestId] = useState(() => crypto.randomUUID());
  const [cancelTarget, setCancelTarget] = useState<MarketListing | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const reloadCharacter = async () => {
    if (!characterId) return;
    const overview = await getCharacterOverview(characterId);
    setCharacter(buildGatheringDashboardCharacter(overview));
  };

  useEffect(() => {
    if (!characterId) return;
    let disposed = false;

    void getCharacterOverview(characterId)
      .then((overview) => {
        if (disposed) return;
        setCharacter(buildGatheringDashboardCharacter(overview));
        setCharacterError(null);
      })
      .catch(() => {
        if (!disposed) {
          setCharacterError("Não foi possível carregar o Mercado do Abrigo.");
        }
      })
      .finally(() => {
        if (!disposed) setIsCharacterLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [characterId]);

  useEffect(() => {
    if (!characterId) return;
    let disposed = false;

    const load = async () => {
      setIsSectionLoading(true);

      if (activeTab === "buy") {
        const response = await getMarketListings(characterId, {
          search: deferredSearch.trim() || undefined,
          type: typeFilter || undefined,
          tier: tierFilter ? Number(tierFilter) : undefined,
          rarity: rarityFilter || undefined,
          itemClass: classFilter || undefined,
          sort,
          page: catalogPage,
          pageSize: 20,
        });
        if (!disposed) {
          setCatalog(response);
          setMarketCharacter(response.character);
        }
        return;
      }

      if (activeTab === "sell") {
        const response = await getMarketSellableItems(characterId);
        if (!disposed) {
          setSellable(response);
          setMarketCharacter(response.character);
        }
        return;
      }

      const response = await getMyMarketListings(characterId, {
        status: mineStatus || undefined,
        page: minePage,
        pageSize: 20,
      });
      if (!disposed) {
        setMine(response);
        setMarketCharacter(response.character);
      }
    };

    void load()
      .catch((error) => {
        if (!disposed) {
          setFeedback({
            tone: "error",
            message: extractMarketApiError(
              error,
              "Não foi possível carregar os dados do mercado.",
            ),
          });
        }
      })
      .finally(() => {
        if (!disposed) setIsSectionLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [
    activeTab,
    catalogPage,
    characterId,
    classFilter,
    deferredSearch,
    minePage,
    mineStatus,
    rarityFilter,
    refreshVersion,
    sort,
    tierFilter,
    typeFilter,
  ]);

  useEffect(() => {
    if (!buyTarget && !sellTarget && !cancelTarget) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isMutating) {
        setBuyTarget(null);
        setSellTarget(null);
        setCancelTarget(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [buyTarget, cancelTarget, isMutating, sellTarget]);

  const balance = marketCharacter?.gold ?? character?.gold ?? 0;
  const buyTotal = buyTarget ? buyTarget.unitPrice * buyQuantity : 0;
  const sellTotal = sellUnitPrice * sellQuantity;
  const buyMax = buyTarget
    ? Math.min(
        buyTarget.quantityRemaining,
        Math.floor(balance / buyTarget.unitPrice),
      )
    : 0;
  const canPublish = Boolean(
    sellTarget &&
    sellQuantity >= 1 &&
    sellQuantity <= sellTarget.quantity &&
    sellUnitPrice >= 1 &&
    Number.isSafeInteger(sellTotal) &&
    sellTotal <= 2_000_000_000 &&
    (sellable?.activeListings ?? 0) <
      (sellable?.maxActiveListings ?? Number.POSITIVE_INFINITY),
  );

  const filterCount = useMemo(
    () =>
      [typeFilter, tierFilter, rarityFilter, classFilter].filter(Boolean).length,
    [classFilter, rarityFilter, tierFilter, typeFilter],
  );

  function changeTab(tab: MarketTab) {
    setActiveTab(tab);
    setFeedback(null);
    if (tab === "buy") setCatalogPage(1);
    if (tab === "mine") setMinePage(1);
  }

  function openBuy(listing: MarketListing) {
    setBuyTarget(listing);
    setBuyQuantity(1);
    setBuyRequestId(crypto.randomUUID());
    setFeedback(null);
  }

  function openSell(item: MarketSellableItem) {
    setSellTarget(item);
    setSellQuantity(1);
    setSellUnitPrice(1);
    setSellRequestId(crypto.randomUUID());
    setFeedback(null);
  }

  function changeBuyQuantity(value: number) {
    setBuyQuantity(value);
    setBuyRequestId(crypto.randomUUID());
  }

  function changeSellQuantity(value: number) {
    setSellQuantity(value);
    setSellRequestId(crypto.randomUUID());
  }

  function changeSellPrice(value: number) {
    setSellUnitPrice(value);
    setSellRequestId(crypto.randomUUID());
  }

  async function handleBuy(event: FormEvent) {
    event.preventDefault();
    if (!characterId || !buyTarget || buyQuantity < 1 || buyQuantity > buyMax) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await buyMarketListing(buyTarget.id, {
        characterId,
        quantity: buyQuantity,
        requestId: buyRequestId,
      });
      setMarketCharacter((current) =>
        current ? { ...current, gold: response.purchase.buyerGold } : current,
      );
      setBuyTarget(null);
      setFeedback({ tone: "success", message: response.message });
      setRefreshVersion((value) => value + 1);
      await reloadCharacter();
    } catch (error) {
      setFeedback({ tone: "error", message: extractMarketApiError(error) });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSell(event: FormEvent) {
    event.preventDefault();
    if (!characterId || !sellTarget || !canPublish) return;

    setIsMutating(true);
    try {
      const response = await createMarketListing({
        characterId,
        itemId: sellTarget.itemId,
        quantity: sellQuantity,
        unitPrice: sellUnitPrice,
        requestId: sellRequestId,
      });
      setSellTarget(null);
      setFeedback({ tone: "success", message: response.message });
      setActiveTab("mine");
      setMinePage(1);
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      setFeedback({ tone: "error", message: extractMarketApiError(error) });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCancel() {
    if (!characterId || !cancelTarget) return;

    setIsMutating(true);
    try {
      const response = await cancelMarketListing(cancelTarget.id, characterId);
      setCancelTarget(null);
      setFeedback({ tone: "success", message: response.message });
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      setFeedback({ tone: "error", message: extractMarketApiError(error) });
    } finally {
      setIsMutating(false);
    }
  }

  if (!characterId) return <Navigate to="/characters" replace />;

  if (isCharacterLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando Mercado do Abrigo...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Mercado indisponível</h1>
        <p>{characterError ?? "Não foi possível carregar o personagem."}</p>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="market-page">
        <header className="market-header">
          <span className="market-header__icon" aria-hidden="true">
            <Store size={27} />
          </span>
          <div className="market-header__title">
            <small>Comércio entre sobreviventes</small>
            <h1>Mercado do Abrigo</h1>
          </div>
          <div
            className="market-balance"
            aria-label={`${formatGold(balance)} Gold`}
          >
            <img src={goldIcon} alt="" />
            <span>
              <small>Seu saldo</small>
              <strong>{formatGold(balance)} Gold</strong>
            </span>
          </div>
        </header>

        <nav className="market-tabs" aria-label="Áreas do mercado">
          <button
            type="button"
            className={activeTab === "buy" ? "is-active" : ""}
            onClick={() => changeTab("buy")}
          >
            <ShoppingCart size={17} />
            Comprar
          </button>
          <button
            type="button"
            className={activeTab === "sell" ? "is-active" : ""}
            onClick={() => changeTab("sell")}
          >
            <Tag size={17} />
            Vender
          </button>
          <button
            type="button"
            className={activeTab === "mine" ? "is-active" : ""}
            onClick={() => changeTab("mine")}
          >
            <ClipboardList size={17} />
            Meus anúncios
          </button>
        </nav>

        {feedback ? (
          <div className={`market-feedback is-${feedback.tone}`} role="status">
            {feedback.tone === "error" ? (
              <CircleAlert size={17} />
            ) : (
              <Coins size={17} />
            )}
            <span>{feedback.message}</span>
            <button
              type="button"
              aria-label="Fechar aviso"
              title="Fechar"
              onClick={() => setFeedback(null)}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        {activeTab === "buy" ? (
          <>
            <div className="market-toolbar">
              <label className="market-search">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCatalogPage(1);
                  }}
                  placeholder="Buscar item ou vendedor"
                  aria-label="Buscar item ou vendedor"
                />
              </label>
              <div className="market-toolbar__controls">
                <button
                  type="button"
                  className={`market-filter-toggle${areFiltersOpen ? " is-open" : ""}`}
                  aria-expanded={areFiltersOpen}
                  aria-controls="market-filter-options"
                  onClick={() => setAreFiltersOpen((isOpen) => !isOpen)}
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  <span>Filtros</span>
                  {filterCount > 0 ? <strong>{filterCount}</strong> : null}
                </button>
                <div
                  id="market-filter-options"
                  className={`market-filters${areFiltersOpen ? " is-open" : ""}`}
                >
                  <select
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(event.target.value);
                      setCatalogPage(1);
                    }}
                    aria-label="Filtrar por tipo"
                  >
                    <option value="">Todos os tipos</option>
                    <option value="MATERIAL">Materiais</option>
                    <option value="EQUIPMENT">Equipamentos</option>
                    <option value="CONSUMABLE">Consumíveis</option>
                  </select>
                  <select
                    value={tierFilter}
                    onChange={(event) => {
                      setTierFilter(event.target.value);
                      setCatalogPage(1);
                    }}
                    aria-label="Filtrar por tier"
                  >
                    <option value="">Todos os tiers</option>
                    {Array.from({ length: 11 }, (_, tier) => (
                      <option key={tier} value={tier}>
                        T{tier}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rarityFilter}
                    onChange={(event) => {
                      setRarityFilter(event.target.value);
                      setCatalogPage(1);
                    }}
                    aria-label="Filtrar por raridade"
                  >
                    <option value="">Todas as raridades</option>
                    <option value="COMMON">Comum</option>
                    <option value="UNCOMMON">Incomum</option>
                    <option value="RARE">Raro</option>
                    <option value="EPIC">Épico</option>
                    <option value="LEGENDARY">Lendário</option>
                  </select>
                  <select
                    value={classFilter}
                    onChange={(event) => {
                      setClassFilter(
                        event.target.value as MarketItemClassFilter | "",
                      );
                      setCatalogPage(1);
                    }}
                    aria-label="Filtrar por classe"
                  >
                    <option value="">Todas as classes</option>
                    <option value="GENERAL">Uso geral</option>
                    <option value="LUTADOR">Lutador</option>
                    <option value="ASSASSINO">Assassino</option>
                    <option value="ATIRADOR">Atirador</option>
                    <option value="MEDICO">Médico</option>
                  </select>
                  {filterCount > 0 ? (
                    <button
                      type="button"
                      className="market-clear-filters"
                      onClick={() => {
                        setTypeFilter("");
                        setTierFilter("");
                        setRarityFilter("");
                        setClassFilter("");
                        setCatalogPage(1);
                      }}
                    >
                      Limpar {filterCount}
                    </button>
                  ) : null}
                </div>
                <label className="market-sort">
                  <ArrowDownUp size={16} aria-hidden="true" />
                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as MarketListingSort)
                    }
                    aria-label="Ordenar anúncios"
                  >
                    <option value="NEWEST">Mais recentes</option>
                    <option value="PRICE_ASC">Menor preço</option>
                    <option value="PRICE_DESC">Maior preço</option>
                    <option value="QUANTITY_DESC">Maior estoque</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="market-list-heading market-list-heading--catalog">
              <span>Item</span>
              <span>Vendedor</span>
              <span>Disponível</span>
              <span>Preço unitário</span>
              <span />
            </div>
            {isSectionLoading ? (
              <MarketRowsLoading />
            ) : catalog.listings.length ? (
              <div className="market-list">
                {catalog.listings.map((listing) => (
                  <article
                    className="market-row market-row--catalog"
                    key={listing.id}
                  >
                    <div className="market-row__item">
                      <MarketItemThumb
                        item={listing.item}
                        type={listing.type}
                        quantity={listing.quantityRemaining}
                      />
                      <span>
                        <strong>{listing.item.name}</strong>
                        <small>
                          T{listing.item.tier ?? 1} ·{" "}
                          {formatInventoryRarity(listing.item.rarity)}
                        </small>
                      </span>
                    </div>
                    <div className="market-row__seller" data-label="Vendedor">
                      <strong>{listing.seller.name}</strong>
                      <small>{formatDate(listing.createdAt)}</small>
                    </div>
                    <div className="market-row__stock" data-label="Disponível">
                      <strong>{formatGold(listing.quantityRemaining)}</strong>
                      <small>{formatUnitLabel(listing.quantityRemaining)}</small>
                    </div>
                    <div
                      className="market-row__price"
                      data-label="Preço unitário"
                    >
                      <img src={goldIcon} alt="" />
                      <strong>{formatGold(listing.unitPrice)}</strong>
                    </div>
                    <button
                      type="button"
                      className="market-row__action"
                      aria-label={`Comprar ${listing.item.name}`}
                      onClick={() => openBuy(listing)}
                    >
                      <ShoppingCart size={16} />
                      <span>Comprar</span>
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="market-empty">
                <PackageOpen size={28} />
                <strong>Nenhum anúncio encontrado</strong>
                <span>Ajuste os filtros ou coloque um item à venda.</span>
                <button type="button" onClick={() => changeTab("sell")}>
                  <Tag size={15} />
                  Vender item
                </button>
              </div>
            )}
            <Pagination
              pagination={catalog.pagination}
              onPageChange={setCatalogPage}
            />
          </>
        ) : null}

        {activeTab === "sell" ? (
          <>
            <div className="market-section-summary">
              <div>
                <small>Itens disponíveis</small>
                <strong>{sellable?.items.length ?? 0}</strong>
              </div>
              <div>
                <small>Anúncios ativos</small>
                <strong>
                  {sellable?.activeListings ?? 0} /{" "}
                  {sellable?.maxActiveListings ?? 30}
                </strong>
              </div>
            </div>
            <div className="market-list-heading market-list-heading--sell">
              <span>Item na mochila</span>
              <span>Quantidade</span>
              <span />
            </div>
            {isSectionLoading ? (
              <MarketRowsLoading />
            ) : sellable?.items.length ? (
              <div className="market-list">
                {sellable.items.map((entry) => (
                  <article
                    className="market-row market-row--sell"
                    key={entry.id}
                  >
                    <div className="market-row__item">
                      <MarketItemThumb
                        item={entry.item}
                        type={entry.type}
                        quantity={entry.quantity}
                      />
                      <span>
                        <strong>{entry.item.name}</strong>
                        <small>
                          T{entry.item.tier ?? 1} · {getItemTypeLabel(entry)} ·{" "}
                          {formatInventoryRarity(entry.item.rarity)}
                        </small>
                      </span>
                    </div>
                    <div className="market-row__stock" data-label="Na mochila">
                      <strong>{formatGold(entry.quantity)}</strong>
                      <small>{formatUnitLabel(entry.quantity)}</small>
                    </div>
                    <button
                      type="button"
                      className="market-row__action"
                      aria-label={`Vender ${entry.item.name}`}
                      disabled={
                        (sellable.activeListings ?? 0) >=
                        (sellable.maxActiveListings ?? 30)
                      }
                      onClick={() => openSell(entry)}
                    >
                      <Tag size={16} />
                      <span>Vender</span>
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="market-empty">
                <PackageOpen size={28} />
                <strong>Nenhum item comercializável</strong>
                <span>Os itens vinculados não aparecem nesta lista.</span>
              </div>
            )}
          </>
        ) : null}

        {activeTab === "mine" ? (
          <>
            <div className="market-mine-toolbar">
              <div className="market-section-summary">
                <div>
                  <small>Anúncios ativos</small>
                  <strong>
                    {mine?.activeListings ?? 0} /{" "}
                    {mine?.maxActiveListings ?? 30}
                  </strong>
                </div>
                <div>
                  <small>Total listado</small>
                  <strong>{mine?.pagination.total ?? 0}</strong>
                </div>
              </div>
              <select
                value={mineStatus}
                onChange={(event) => {
                  setMineStatus(event.target.value as MarketListingStatus | "");
                  setMinePage(1);
                }}
                aria-label="Filtrar meus anúncios por status"
              >
                <option value="">Todos os status</option>
                <option value="ACTIVE">Ativos</option>
                <option value="SOLD_OUT">Vendidos</option>
                <option value="CANCELLED">Cancelados</option>
              </select>
            </div>
            <div className="market-list-heading market-list-heading--mine">
              <span>Item anunciado</span>
              <span>Status</span>
              <span>Vendido / total</span>
              <span>Recebido</span>
              <span />
            </div>
            {isSectionLoading ? (
              <MarketRowsLoading />
            ) : mine?.listings.length ? (
              <div className="market-list">
                {mine.listings.map((listing) => (
                  <article
                    className="market-row market-row--mine"
                    key={listing.id}
                  >
                    <div className="market-row__item">
                      <MarketItemThumb
                        item={listing.item}
                        type={listing.type}
                        quantity={listing.quantityInitial}
                      />
                      <span>
                        <strong>{listing.item.name}</strong>
                        <small>
                          {formatDate(listing.createdAt)} ·{" "}
                          {formatGold(listing.unitPrice)} Gold/un.
                        </small>
                      </span>
                    </div>
                    <div className="market-row__status" data-label="Status">
                      <span data-status={listing.status}>
                        {STATUS_LABELS[listing.status]}
                      </span>
                    </div>
                    <div className="market-row__stock" data-label="Vendido">
                      <strong>
                        {formatGold(listing.quantitySold)} /{" "}
                        {formatGold(listing.quantityInitial)}
                      </strong>
                      <small>
                        {formatGold(listing.quantityRemaining)} restantes
                      </small>
                    </div>
                    <div className="market-row__price" data-label="Recebido">
                      <img src={goldIcon} alt="" />
                      <strong>{formatGold(listing.goldEarned)}</strong>
                    </div>
                    {listing.status === "ACTIVE" ? (
                      <button
                        type="button"
                        className="market-row__action market-row__action--danger"
                        onClick={() => setCancelTarget(listing)}
                      >
                        <Trash2 size={16} />
                        <span>Cancelar</span>
                      </button>
                    ) : (
                      <span className="market-row__closed">Concluído</span>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="market-empty">
                <ClipboardList size={28} />
                <strong>Nenhum anúncio nesta categoria</strong>
                <button type="button" onClick={() => changeTab("sell")}>
                  <Tag size={15} />
                  Vender item
                </button>
              </div>
            )}
            <Pagination
              pagination={mine?.pagination ?? EMPTY_PAGINATION}
              onPageChange={setMinePage}
            />
          </>
        ) : null}
      </section>

      {buyTarget ? (
        <div
          className="market-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isMutating) {
              setBuyTarget(null);
            }
          }}
        >
          <form
            className="market-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-buy-title"
            onSubmit={handleBuy}
          >
            <button
              type="button"
              className="market-modal__close"
              aria-label="Fechar"
              title="Fechar"
              disabled={isMutating}
              onClick={() => setBuyTarget(null)}
            >
              <X size={18} />
            </button>
            <header>
              <small>Confirmar compra</small>
              <h2 id="market-buy-title">{buyTarget.item.name}</h2>
            </header>
            <div className="market-modal__item">
              <MarketItemThumb
                item={buyTarget.item}
                type={buyTarget.type}
                quantity={buyTarget.quantityRemaining}
              />
              <span>
                <strong>{buyTarget.seller.name}</strong>
                <small>
                  {formatGold(buyTarget.quantityRemaining)} disponíveis
                </small>
              </span>
            </div>
            <label className="market-field">
              <span>Quantidade</span>
              <input
                type="number"
                min={1}
                max={buyTarget.quantityRemaining}
                step={1}
                value={buyQuantity}
                disabled={isMutating}
                onChange={(event) =>
                  changeBuyQuantity(Number(event.target.value))
                }
              />
              <small>Máximo com seu saldo: {formatGold(buyMax)}</small>
            </label>
            <div className="market-modal__calculation">
              <span>
                <small>Preço unitário</small>
                <strong>{formatGold(buyTarget.unitPrice)} Gold</strong>
              </span>
              <span>
                <small>Total</small>
                <strong>{formatGold(buyTotal)} Gold</strong>
              </span>
            </div>
            {buyQuantity > buyMax ? (
              <p className="market-modal__error">
                <CircleAlert size={15} /> Quantidade acima do estoque ou saldo
                disponível.
              </p>
            ) : null}
            <footer>
              <button
                type="button"
                className="market-button market-button--secondary"
                disabled={isMutating}
                onClick={() => setBuyTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="market-button market-button--primary"
                disabled={isMutating || buyQuantity < 1 || buyQuantity > buyMax}
              >
                <ShoppingCart size={16} />
                {isMutating ? "Processando..." : "Confirmar compra"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {sellTarget ? (
        <div
          className="market-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isMutating) {
              setSellTarget(null);
            }
          }}
        >
          <form
            className="market-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-sell-title"
            onSubmit={handleSell}
          >
            <button
              type="button"
              className="market-modal__close"
              aria-label="Fechar"
              title="Fechar"
              disabled={isMutating}
              onClick={() => setSellTarget(null)}
            >
              <X size={18} />
            </button>
            <header>
              <small>Novo anúncio</small>
              <h2 id="market-sell-title">{sellTarget.item.name}</h2>
            </header>
            <div className="market-modal__item">
              <MarketItemThumb
                item={sellTarget.item}
                type={sellTarget.type}
                quantity={sellTarget.quantity}
              />
              <span>
                <strong>{formatInventoryRarity(sellTarget.item.rarity)}</strong>
                <small>{formatGold(sellTarget.quantity)} na mochila</small>
              </span>
            </div>
            <div className="market-modal__fields">
              <label className="market-field">
                <span>Quantidade</span>
                <input
                  type="number"
                  min={1}
                  max={sellTarget.quantity}
                  step={1}
                  value={sellQuantity}
                  disabled={isMutating}
                  onChange={(event) =>
                    changeSellQuantity(Number(event.target.value))
                  }
                />
              </label>
              <label className="market-field">
                <span>Preço por unidade</span>
                <input
                  type="number"
                  min={1}
                  max={1_000_000_000}
                  step={1}
                  value={sellUnitPrice}
                  disabled={isMutating}
                  onChange={(event) =>
                    changeSellPrice(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className="market-modal__calculation market-modal__calculation--single">
              <span>
                <small>Valor total do lote</small>
                <strong>{formatGold(sellTotal)} Gold</strong>
              </span>
            </div>
            {!canPublish ? (
              <p className="market-modal__error">
                <CircleAlert size={15} /> Verifique a quantidade, o preço e o
                limite de anúncios.
              </p>
            ) : null}
            <footer>
              <button
                type="button"
                className="market-button market-button--secondary"
                disabled={isMutating}
                onClick={() => setSellTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="market-button market-button--primary"
                disabled={isMutating || !canPublish}
              >
                <Tag size={16} />
                {isMutating ? "Publicando..." : "Colocar à venda"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="market-modal-backdrop" role="presentation">
          <section
            className="market-modal market-modal--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-cancel-title"
          >
            <button
              type="button"
              className="market-modal__close"
              aria-label="Fechar"
              title="Fechar"
              disabled={isMutating}
              onClick={() => setCancelTarget(null)}
            >
              <X size={18} />
            </button>
            <header>
              <small>Cancelar anúncio</small>
              <h2 id="market-cancel-title">{cancelTarget.item.name}</h2>
            </header>
            <p>
              {formatGold(cancelTarget.quantityRemaining)} unidades retornarão
              para a mochila.
            </p>
            <footer>
              <button
                type="button"
                className="market-button market-button--secondary"
                disabled={isMutating}
                onClick={() => setCancelTarget(null)}
              >
                Manter anúncio
              </button>
              <button
                type="button"
                className="market-button market-button--danger"
                disabled={isMutating}
                onClick={() => void handleCancel()}
              >
                <Trash2 size={16} />
                {isMutating ? "Cancelando..." : "Cancelar anúncio"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
