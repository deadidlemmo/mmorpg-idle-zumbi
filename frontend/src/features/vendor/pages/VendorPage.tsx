import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  Coins,
  HandCoins,
  Package,
  Search,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import "../../gathering/styles/gathering.css";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import {
  buyVendorItem,
  extractVendorApiError,
  getVendorSellable,
  getVendorShop,
  sellVendorItem,
} from "../api/vendor.api";
import { getMerchantByRouteSegment } from "../data/merchants";
import "../styles/vendor.css";
import type {
  VendorCategory,
  VendorItemEffect,
  VendorItemSummary,
  VendorSellableItem,
  VendorSellableResponse,
  VendorShopResponse,
} from "../types/vendor.types";

type VendorMode = "BUY" | "SELL";
type VendorTierFilter = "CURRENT" | "ALL" | `${number}`;
type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

const CATEGORY_LABELS: Record<VendorCategory, string> = {
  ALL: "Todos",
  CONSUMABLE: "Pocoes",
  GATHERING: "Gathering",
  MOB_DROP: "Drops de mobs",
};

function formatNumber(value?: number | null) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("pt-BR");
}

function formatGold(value?: number | null) {
  return `${formatNumber(value)} Gold`;
}

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getItemInitials(name?: string | null) {
  const words = String(name ?? "Item")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= 1) {
    return words[0]?.slice(0, 2).toUpperCase() ?? "IT";
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function formatSlot(slot?: string | null) {
  switch (slot) {
    case "MAIN_HAND":
      return "Arma";
    case "OFF_HAND":
      return "Apoio";
    case "HEAD":
      return "Elmo";
    case "ARMOR":
      return "Armadura";
    case "PANTS":
      return "Pernas";
    case "BOOTS":
      return "Pes";
    case "MATERIAL":
      return "Material";
    case "CONSUMABLE":
      return "Consumivel";
    default:
      return slot ?? "Item";
  }
}

function formatRarity(rarity?: string | null) {
  switch (rarity) {
    case "COMMON":
      return "Comum";
    case "UNCOMMON":
      return "Incomum";
    case "RARE":
      return "Raro";
    case "EPIC":
      return "Epico";
    case "LEGENDARY":
      return "Lendario";
    default:
      return rarity ?? "Comum";
  }
}

function getCharacterTier(level?: number | null) {
  return Math.max(1, Math.min(10, Math.ceil(Math.max(1, level ?? 1) / 10)));
}

function itemMatchesSearch(
  item: VendorItemSummary | VendorSellableItem,
  searchTerm: string,
) {
  const normalizedSearch = normalizeText(searchTerm);

  if (!normalizedSearch) return true;

  return [
    item.name,
    item.description,
    item.family,
    item.map?.name,
    item.class?.name,
    formatSlot(item.slot),
    CATEGORY_LABELS[item.category],
  ]
    .map(normalizeText)
    .some((value) => value.includes(normalizedSearch));
}

function itemMatchesCategory(
  item: VendorItemSummary | VendorSellableItem,
  category: VendorCategory,
) {
  return category === "ALL" || item.category === category;
}

function itemMatchesTier(
  item: VendorItemSummary | VendorSellableItem,
  tierFilter: VendorTierFilter,
  currentTier: number,
) {
  if (tierFilter === "ALL") return true;

  const targetTier = tierFilter === "CURRENT" ? currentTier : Number(tierFilter);
  return item.tier === targetTier;
}

function getEffectSummary(effects: VendorItemEffect[]) {
  if (effects.length <= 0) return null;

  return effects
    .slice(0, 3)
    .map((effect) => `+${effect.value} ${effect.label}`)
    .join(" • ");
}

function QuantitySelector({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (quantity: number) => void;
}) {
  const safeMax = Math.max(1, max);
  const quickValues = [1, 5, 10];

  return (
    <div className="vendor-quantity-selector" aria-label="Quantidade">
      <div className="vendor-quantity-selector__row">
        {quickValues.map((quantity) => (
          <button
            key={quantity}
            type="button"
            disabled={disabled || quantity > safeMax}
            onClick={() => onChange(Math.min(quantity, safeMax))}
          >
            {quantity}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(safeMax)}
        >
          Max
        </button>
      </div>

      <input
        type="number"
        min={1}
        max={safeMax}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = Math.floor(Number(event.currentTarget.value) || 1);
          onChange(Math.max(1, Math.min(safeMax, nextValue)));
        }}
      />
    </div>
  );
}

function VendorItemCard({
  item,
  mode,
  gold,
  quantity,
  maxQuantity,
  isBusy,
  onQuantityChange,
  onAction,
}: {
  item: VendorItemSummary | VendorSellableItem;
  mode: VendorMode;
  gold: number;
  quantity: number;
  maxQuantity: number;
  isBusy: boolean;
  onQuantityChange: (quantity: number) => void;
  onAction: () => void;
}) {
  const isSellMode = mode === "SELL";
  const sellableItem = isSellMode ? (item as VendorSellableItem) : null;
  const unitPrice = isSellMode ? sellableItem?.unitSellPrice ?? 0 : item.buyPrice;
  const totalPrice = unitPrice * quantity;
  const effectSummary = getEffectSummary(item.effects);
  const cannotBuy = !isSellMode && totalPrice > gold;
  const cannotSell = Boolean(
    isSellMode && (!sellableItem?.canSell || maxQuantity <= 0),
  );
  const actionDisabled = isBusy || cannotBuy || cannotSell || maxQuantity <= 0;

  return (
    <article
      className={`vendor-item-card rarity-${String(item.rarity).toLowerCase()}`}
    >
      <div className="vendor-item-card__icon" aria-hidden="true">
        <span>{getItemInitials(item.name)}</span>
      </div>

      <div className="vendor-item-card__body">
        <div className="vendor-item-card__meta">
          <span>T{item.tier}</span>
          <span>{formatRarity(item.rarity)}</span>
          <span>{formatSlot(item.slot)}</span>
        </div>

        <h3>{item.name}</h3>
        <p>{effectSummary ?? item.description ?? item.family}</p>

        <div className="vendor-item-card__details">
          <span>{CATEGORY_LABELS[item.category]}</span>
          <span>{item.family}</span>
          {isSellMode && sellableItem ? (
            <span>Possui {formatNumber(sellableItem.availableQuantity)}</span>
          ) : null}
        </div>
      </div>

      <div className="vendor-item-card__trade">
        <div className="vendor-item-card__price">
          <small>{isSellMode ? "Venda un." : "Preco un."}</small>
          <strong>{formatGold(unitPrice)}</strong>
        </div>

        {item.stackable ? (
          <QuantitySelector
            value={quantity}
            max={maxQuantity}
            disabled={isBusy || maxQuantity <= 0}
            onChange={onQuantityChange}
          />
        ) : (
          <span className="vendor-item-card__single-quantity">Qtd. 1</span>
        )}

        <div className="vendor-item-card__total">
          <small>Total</small>
          <strong>{formatGold(totalPrice)}</strong>
        </div>

        {cannotBuy ? (
          <span className="vendor-item-card__warning">Gold insuficiente</span>
        ) : null}

        {cannotSell && sellableItem?.sellBlockReason ? (
          <span className="vendor-item-card__warning">
            {sellableItem.sellBlockReason}
          </span>
        ) : null}

        <button
          type="button"
          className="vendor-trade-button"
          disabled={actionDisabled}
          onClick={onAction}
        >
          {isBusy
            ? "Processando..."
            : isSellMode
              ? "Vender"
              : "Comprar"}
        </button>
      </div>
    </article>
  );
}

export function VendorPage() {
  const { characterId, merchantId } = useParams();
  const safeCharacterId = characterId ?? "";
  const activeMerchant = getMerchantByRouteSegment(merchantId ?? "mara");
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [shopData, setShopData] = useState<VendorShopResponse | null>(null);
  const [sellableData, setSellableData] =
    useState<VendorSellableResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [mode, setMode] = useState<VendorMode>("BUY");
  const [category, setCategory] = useState<VendorCategory>("ALL");
  const [tierFilter, setTierFilter] = useState<VendorTierFilter>("CURRENT");
  const [searchTerm, setSearchTerm] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadVendorData = useCallback(async () => {
    if (!safeCharacterId) return;

    const [overviewResponse, shopResponse, sellableResponse] =
      await Promise.all([
        getCharacterOverview(safeCharacterId),
        getVendorShop(safeCharacterId),
        getVendorSellable(safeCharacterId),
      ]);

    setCharacter(buildGatheringDashboardCharacter(overviewResponse));
    setShopData(shopResponse);
    setSellableData(sellableResponse);
  }, [safeCharacterId]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!safeCharacterId) return;

      try {
        setIsLoading(true);
        await loadVendorData();
      } catch (error) {
        if (isMounted) {
          setFeedback({
            tone: "error",
            message: extractVendorApiError(
              error,
              "Nao foi possivel carregar o Mercador.",
            ),
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [loadVendorData, safeCharacterId]);

  const gold = shopData?.gold ?? sellableData?.gold ?? character?.gold ?? 0;
  const currentTier = getCharacterTier(character?.level);

  const activeCategories =
    mode === "BUY" ? shopData?.categories : sellableData?.categories;

  const categoryOptions = useMemo(
    () =>
      (activeCategories ?? []).filter((categorySummary) => {
        if (categorySummary.key === "ALL") return true;
        if (categorySummary.count <= 0) return false;

        return mode === "BUY"
          ? categorySummary.key === "CONSUMABLE"
          : true;
      }),
    [activeCategories, mode],
  );

  const effectiveCategory = categoryOptions.some(
    (categorySummary) => categorySummary.key === category,
  )
    ? category
    : "ALL";

  const rawItems = useMemo<Array<VendorItemSummary | VendorSellableItem>>(
    () => (mode === "BUY" ? shopData?.items ?? [] : sellableData?.items ?? []),
    [mode, sellableData?.items, shopData?.items],
  );

  const filteredItems = useMemo(
    () =>
      rawItems.filter(
        (item) =>
          itemMatchesCategory(item, effectiveCategory) &&
          itemMatchesTier(item, tierFilter, currentTier) &&
          itemMatchesSearch(item, searchTerm),
      ),
    [currentTier, effectiveCategory, rawItems, searchTerm, tierFilter],
  );

  const setItemQuantity = useCallback((key: string, quantity: number) => {
    setQuantities((current) => ({
      ...current,
      [key]: quantity,
    }));
  }, []);

  const getQuantity = useCallback(
    (key: string, maxQuantity: number) => {
      const max = Math.max(1, maxQuantity);
      return Math.max(1, Math.min(max, quantities[key] ?? 1));
    },
    [quantities],
  );

  const getMaxBuyQuantity = useCallback(
    (item: VendorItemSummary) => {
      if (!item.stackable) {
        return gold >= item.buyPrice ? 1 : 0;
      }

      if (item.buyPrice <= 0) return 0;

      return Math.floor(gold / item.buyPrice);
    },
    [gold],
  );

  async function handleBuy(item: VendorItemSummary) {
    const maxQuantity = getMaxBuyQuantity(item);
    const quantity = getQuantity(item.id, maxQuantity);

    try {
      setBusyKey(`buy-${item.id}`);
      const response = await buyVendorItem(safeCharacterId, {
        itemId: item.id,
        quantity,
      });

      setFeedback({ tone: "success", message: response.message });
      await loadVendorData();
    } catch (error) {
      setFeedback({ tone: "error", message: extractVendorApiError(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSell(item: VendorSellableItem) {
    const maxQuantity = item.stackable ? item.availableQuantity : 1;
    const quantity = getQuantity(item.inventoryItemId, maxQuantity);

    try {
      setBusyKey(`sell-${item.inventoryItemId}`);
      const response = await sellVendorItem(safeCharacterId, {
        inventoryItemId: item.inventoryItemId,
        quantity,
      });

      setFeedback({ tone: "success", message: response.message });
      await loadVendorData();
    } catch (error) {
      setFeedback({ tone: "error", message: extractVendorApiError(error) });
    } finally {
      setBusyKey(null);
    }
  }

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (!activeMerchant) {
    return <Navigate to={`/dashboard/${safeCharacterId}/consumables`} replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando mercador...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar Mercador</h1>
        <p>{feedback?.message ?? "Nao foi possivel carregar este personagem."}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para selecao
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="vendor-page gathering-page gathering-page--clean">
        <article
          className="gathering-origin-lore-card gathering-origin-lore-card--npc gathering-origin-npc vendor-lore-card"
          aria-label={activeMerchant.title}
        >
          <div className="gathering-origin-npc__stage" aria-hidden="true">
            <div className="gathering-origin-npc__portrait vendor-npc-fallback">
              {activeMerchant.portraitUrl ? (
                <img src={activeMerchant.portraitUrl} alt="" />
              ) : (
                <span>{activeMerchant.initials}</span>
              )}
            </div>
          </div>

          <div className="gathering-origin-npc__content">
            <div className="gathering-origin-npc__meta">
              <strong className="gathering-origin-npc__name">
                {activeMerchant.npcName}
              </strong>
              <span className="gathering-origin-npc__role">
                {activeMerchant.role}
              </span>
            </div>

            <h2>{activeMerchant.title}</h2>
            <blockquote>{activeMerchant.quote}</blockquote>
            <p>{activeMerchant.shopDescription}</p>

            <div className="vendor-wallet-chip" aria-label="Gold atual">
              <Coins size={16} aria-hidden="true" />
              <span>{formatGold(gold)}</span>
            </div>
          </div>
        </article>

        {feedback ? (
          <div className={`vendor-feedback vendor-feedback--${feedback.tone}`}>
            {feedback.message}
          </div>
        ) : null}

        <section className="vendor-layout" aria-label="Mercador">
          <main className="vendor-main-panel">
            <div className="vendor-panel-header">
              <div>
                <span className="vendor-eyebrow">Mercador</span>
                <h2>{mode === "BUY" ? "Comprar itens" : "Vender itens"}</h2>
                <p>
                  {mode === "BUY"
                    ? "Mara vende apenas pocoes por enquanto."
                    : "Venda pocoes e materiais excedentes para recuperar Gold."}
                </p>
              </div>

              <label className="vendor-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Buscar item"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.currentTarget.value)}
                />
              </label>
            </div>

            <div className="vendor-mode-tabs" role="tablist" aria-label="Operacao">
              <button
                type="button"
                className={mode === "BUY" ? "is-active" : ""}
                onClick={() => {
                  setMode("BUY");
                  setCategory("ALL");
                }}
              >
                <ShoppingBag size={16} aria-hidden="true" />
                Comprar
              </button>
              <button
                type="button"
                className={mode === "SELL" ? "is-active" : ""}
                onClick={() => {
                  setMode("SELL");
                  setCategory("ALL");
                }}
              >
                <HandCoins size={16} aria-hidden="true" />
                Vender
              </button>
            </div>

            <div className="vendor-filter-panel" aria-label="Filtros do Mercador">
              <label className="vendor-filter-field">
                <span>Tier</span>
                <select
                  value={tierFilter}
                  onChange={(event) =>
                    setTierFilter(event.currentTarget.value as VendorTierFilter)
                  }
                >
                  <option value="CURRENT">Meu tier (T{currentTier})</option>
                  <option value="ALL">Todos os tiers</option>
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(
                    (tier) => (
                      <option key={tier} value={String(tier)}>
                        Tier {tier}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="vendor-filter-field">
                <span>Tipo</span>
                <select
                  value={effectiveCategory}
                  onChange={(event) =>
                    setCategory(event.currentTarget.value as VendorCategory)
                  }
                >
                  {categoryOptions.map((categorySummary) => (
                    <option
                      key={categorySummary.key}
                      value={categorySummary.key}
                    >
                      {CATEGORY_LABELS[categorySummary.key]} (
                      {categorySummary.count})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="vendor-result-row">
              <span>
                Resultado <strong>{filteredItems.length}</strong> de{" "}
                <strong>{rawItems.length}</strong> itens
              </span>
            </div>

            {filteredItems.length > 0 ? (
              <div className="vendor-items-grid">
                {filteredItems.map((item) => {
                  if (mode === "SELL") {
                    const sellableItem = item as VendorSellableItem;
                    const maxQuantity = sellableItem.stackable
                      ? sellableItem.availableQuantity
                      : 1;
                    const quantity = getQuantity(
                      sellableItem.inventoryItemId,
                      maxQuantity,
                    );

                    return (
                      <VendorItemCard
                        key={sellableItem.inventoryItemId}
                        item={sellableItem}
                        mode={mode}
                        gold={gold}
                        quantity={quantity}
                        maxQuantity={maxQuantity}
                        isBusy={busyKey === `sell-${sellableItem.inventoryItemId}`}
                        onQuantityChange={(nextQuantity) =>
                          setItemQuantity(
                            sellableItem.inventoryItemId,
                            nextQuantity,
                          )
                        }
                        onAction={() => handleSell(sellableItem)}
                      />
                    );
                  }

                  const shopItem = item as VendorItemSummary;
                  const maxQuantity = getMaxBuyQuantity(shopItem);
                  const quantity = getQuantity(shopItem.id, maxQuantity);

                  return (
                    <VendorItemCard
                      key={shopItem.id}
                      item={shopItem}
                      mode={mode}
                      gold={gold}
                      quantity={quantity}
                      maxQuantity={maxQuantity}
                      isBusy={busyKey === `buy-${shopItem.id}`}
                      onQuantityChange={(nextQuantity) =>
                        setItemQuantity(shopItem.id, nextQuantity)
                      }
                      onAction={() => handleBuy(shopItem)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="vendor-empty-state">
                <Package size={28} aria-hidden="true" />
                <strong>Nenhum item nesta categoria</strong>
                <p>Altere o tier, tipo ou modo de negociacao.</p>
              </div>
            )}
          </main>

          <aside className="vendor-side-column" aria-label="Resumo do Mercador">
            <section className="vendor-side-card vendor-gold-card">
              <span className="vendor-side-card__icon" aria-hidden="true">
                <Wallet size={18} />
              </span>
              <div>
                <span className="vendor-eyebrow">Carteira</span>
                <h2>{formatGold(gold)}</h2>
                <p>Saldo atual do personagem.</p>
              </div>
            </section>

            <section className="vendor-side-card">
              <span className="vendor-side-card__icon" aria-hidden="true">
                <Store size={18} />
              </span>
              <div>
                <span className="vendor-eyebrow">Regras da banca</span>
                <ul>
                  <li>Itens empilhaveis aceitam compra e venda em lote.</li>
                  <li>A loja vende somente pocoes por enquanto.</li>
                  <li>Mara compra pocoes, gathering e drops de mobs.</li>
                  <li>Equipamentos ficam fora da banca do Mercador.</li>
                </ul>
              </div>
            </section>
          </aside>
        </section>
      </section>
    </DashboardLayout>
  );
}
