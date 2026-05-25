import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { HeartPulse, Package, Search, ShoppingCart } from "lucide-react";
import goldIcon from "../../../assets/images/coins/gold.png";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import "../../gathering/styles/gathering.css";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import {
  buyVendorItem,
  extractVendorApiError,
  getVendorShop,
} from "../api/vendor.api";
import { getMerchantByRouteSegment } from "../data/merchants";
import "../styles/vendor.css";
import type { VendorItemSummary, VendorShopResponse } from "../types/vendor.types";

type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

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

function itemMatchesSearch(item: VendorItemSummary, searchTerm: string) {
  const normalizedSearch = normalizeText(searchTerm);

  if (!normalizedSearch) return true;

  return [item.name, item.description, item.family]
    .map(normalizeText)
    .some((value) => value.includes(normalizedSearch));
}

function getRecommendedTierLabel(item: VendorItemSummary) {
  if (item.minTier && item.maxTier) {
    return `Tiers ${item.minTier}-${item.maxTier}`;
  }

  return `Tier ${item.tier}`;
}

function getEffectLabel(item: VendorItemSummary) {
  const healParts = [];

  if (item.healFlat > 0) {
    healParts.push(`${formatNumber(item.healFlat)} HP`);
  }

  if (item.healPercent > 0) {
    healParts.push(`${formatNumber(item.healPercent)}% do HP`);
  }

  if (healParts.length > 0) {
    return `Recupera ${healParts.join(" + ")}`;
  }

  return item.description || "Consumível de uso geral";
}

function clampQuantity(quantity: number, maxQuantity: number) {
  if (maxQuantity <= 0) return 1;

  return Math.max(1, Math.min(maxQuantity, Math.floor(quantity) || 1));
}

function VendorShopItemCard({
  item,
  onInspect,
}: {
  item: VendorItemSummary;
  onInspect: () => void;
}) {
  return (
    <button
      type="button"
      className={`vendor-shop-card vendor-shop-card--item rarity-${String(
        item.rarity,
      ).toLowerCase()}`}
      aria-label={`Ver detalhes de ${item.name}`}
      onClick={onInspect}
    >
      <div className="vendor-shop-card__visual">
        <span className="vendor-shop-card__icon" aria-hidden="true">
          <HeartPulse size={26} />
          <small>{getItemInitials(item.name)}</small>
        </span>
      </div>

      <div className="vendor-shop-card__content">
        <h3 className="vendor-shop-card__name" title={item.name}>
          {item.name}
        </h3>

        <span className="vendor-shop-card__compact-price">
          <img
            src={goldIcon}
            alt=""
            className="vendor-gold-icon"
            aria-hidden="true"
          />
          {formatNumber(item.buyPrice)}
        </span>
      </div>
    </button>
  );
}

function VendorItemPurchaseModal({
  item,
  gold,
  quantity,
  maxQuantity,
  isBusy,
  onClose,
  onQuantityChange,
  onBuy,
}: {
  item: VendorItemSummary;
  gold: number;
  quantity: number;
  maxQuantity: number;
  isBusy: boolean;
  onClose: () => void;
  onQuantityChange: (quantity: number) => void;
  onBuy: () => void;
}) {
  const totalPrice = item.buyPrice * quantity;
  const isUnavailable = maxQuantity <= 0;
  const quickQuantities = [1, 5, 10];

  return (
    <div
      className="vendor-item-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <article
        className="vendor-item-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-item-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="vendor-item-modal__close"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>

        <div className="vendor-item-modal__hero">
          <span className="vendor-item-modal__icon" aria-hidden="true">
            <HeartPulse size={40} />
            <small>{getItemInitials(item.name)}</small>
          </span>

          <h2 id="vendor-item-modal-title">{item.name}</h2>

          <div className="vendor-item-modal__chips" aria-label="Detalhes do item">
            <span>{formatGold(item.buyPrice)}</span>
            <span>{item.category === "CONSUMABLE" ? "Consumível" : "Item"}</span>
            <span>{getRecommendedTierLabel(item)}</span>
          </div>
        </div>

        <div className="vendor-item-modal__body">
          <div className="vendor-item-modal__description">
            <strong>{getEffectLabel(item)}</strong>
            {item.description ? <p>{item.description}</p> : null}
          </div>

          <div className="vendor-item-modal__currency">
            <span>Seu Gold</span>
            <strong>
              <img
                src={goldIcon}
                alt=""
                className="vendor-gold-icon"
                aria-hidden="true"
              />
              {formatNumber(gold)}
            </strong>
          </div>

          <div className="vendor-item-modal__quantity">
            <span>Quantidade</span>
            <div className="vendor-item-modal__quantity-control">
              <input
                type="number"
                min={1}
                max={Math.max(1, maxQuantity)}
                disabled={isBusy || isUnavailable}
                value={quantity}
                onChange={(event) =>
                  onQuantityChange(Number(event.currentTarget.value))
                }
              />
              <button
                type="button"
                disabled={isBusy || isUnavailable}
                aria-label="Diminuir quantidade"
                onClick={() => onQuantityChange(quantity - 1)}
              >
                −
              </button>
              <button
                type="button"
                disabled={isBusy || isUnavailable}
                aria-label="Aumentar quantidade"
                onClick={() => onQuantityChange(quantity + 1)}
              >
                +
              </button>
            </div>

            <div className="vendor-item-modal__quick">
              {quickQuantities.map((quickQuantity) => (
                <button
                  key={quickQuantity}
                  type="button"
                  disabled={isBusy || isUnavailable}
                  className={quantity === quickQuantity ? "is-active" : ""}
                  onClick={() => onQuantityChange(quickQuantity)}
                >
                  {quickQuantity}
                </button>
              ))}
              <button
                type="button"
                disabled={isBusy || isUnavailable}
                className={
                  quantity === maxQuantity && maxQuantity > 0 ? "is-active" : ""
                }
                onClick={() => onQuantityChange(maxQuantity)}
              >
                Máx.
              </button>
            </div>
          </div>

          <div className="vendor-item-modal__total">
            <span>Total</span>
            <strong>{formatGold(totalPrice)}</strong>
          </div>
        </div>

        <footer className="vendor-item-modal__actions">
          <button
            type="button"
            className="vendor-item-modal__secondary"
            onClick={() => undefined}
          >
            Inspecionar item
          </button>

          <button
            type="button"
            className="vendor-trade-button vendor-trade-button--buy"
            disabled={isBusy || isUnavailable}
            aria-busy={isBusy}
            onClick={onBuy}
          >
            <ShoppingCart size={15} aria-hidden="true" />
            {isBusy
              ? "Comprando..."
              : isUnavailable
                ? "Gold insuficiente"
                : `Comprar por ${formatNumber(totalPrice)}`}
          </button>
        </footer>
      </article>
    </div>
  );
}

export function VendorPage() {
  const { characterId, merchantId } = useParams();
  const safeCharacterId = characterId ?? "";
  const activeMerchant = getMerchantByRouteSegment(merchantId ?? "mara");
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [shopData, setShopData] = useState<VendorShopResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const loadVendorData = useCallback(async () => {
    if (!safeCharacterId) return;

    const [overviewResponse, shopResponse] = await Promise.all([
      getCharacterOverview(safeCharacterId),
      getVendorShop(safeCharacterId),
    ]);

    setCharacter(buildGatheringDashboardCharacter(overviewResponse));
    setShopData(shopResponse);
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
              "Não foi possível carregar o Mercador.",
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

  const gold = shopData?.gold ?? character?.gold ?? 0;
  const rawItems = useMemo(() => shopData?.items ?? [], [shopData?.items]);
  const selectedItem = useMemo(
    () => rawItems.find((item) => item.id === selectedItemId) ?? null,
    [rawItems, selectedItemId],
  );

  const filteredItems = useMemo(
    () => rawItems.filter((item) => itemMatchesSearch(item, searchTerm)),
    [rawItems, searchTerm],
  );

  useEffect(() => {
    if (!selectedItem) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedItemId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItem]);

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

  const getQuantity = useCallback(
    (item: VendorItemSummary) => {
      const maxQuantity = getMaxBuyQuantity(item);
      const savedQuantity = quantities[item.id] ?? 1;

      return clampQuantity(savedQuantity, maxQuantity);
    },
    [getMaxBuyQuantity, quantities],
  );

  const setItemQuantity = useCallback(
    (item: VendorItemSummary, nextQuantity: number) => {
      const maxQuantity = getMaxBuyQuantity(item);

      setQuantities((currentQuantities) => ({
        ...currentQuantities,
        [item.id]: clampQuantity(nextQuantity, maxQuantity),
      }));
    },
    [getMaxBuyQuantity],
  );

  async function handleBuy(item: VendorItemSummary) {
    const maxQuantity = getMaxBuyQuantity(item);
    const quantity = getQuantity(item);

    if (maxQuantity <= 0) {
      setFeedback({
        tone: "error",
        message: "Gold insuficiente para comprar este item.",
      });
      return;
    }

    try {
      setBusyKey(`buy-${item.id}`);
      const response = await buyVendorItem(safeCharacterId, {
        itemId: item.id,
        quantity,
      });

      setFeedback({ tone: "success", message: response.message });
      await loadVendorData();
      setSelectedItemId(null);
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
        <p>{feedback?.message ?? "Não foi possível carregar este personagem."}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
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
          </div>
        </article>

        <aside
          className="gathering-origin-premium-card"
          aria-label="Benefícios premium do Mercador"
        >
          <div
            className="gathering-origin-premium-card__badge"
            aria-hidden="true"
          >
            i
          </div>

          <div>
            <h2>Benefícios premium</h2>
            <p>Fila, bônus e notificações avançadas para compras e estoque.</p>
          </div>

          <button
            type="button"
            className="gathering-origin-premium-card__button"
          >
            Ver benefícios
          </button>
        </aside>

        {feedback ? (
          <div className={`vendor-feedback vendor-feedback--${feedback.tone}`}>
            {feedback.message}
          </div>
        ) : null}

        <section className="vendor-layout" aria-label="Mercador">
          <main className="vendor-main-panel">
            <div className="vendor-panel-header vendor-panel-header--shop">
              <div>
                <span className="vendor-eyebrow">Loja da Mara</span>
                <h2>Estoque da Mara</h2>
                <p>Compre consumíveis e suprimentos com Gold.</p>
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

            <div className="vendor-result-row">
              <span>
                <strong>{filteredItems.length}</strong> de{" "}
                <strong>{rawItems.length}</strong> itens
              </span>
            </div>

            {filteredItems.length > 0 ? (
              <div className="vendor-items-grid vendor-items-grid--shop">
                {filteredItems.map((item) => (
                  <VendorShopItemCard
                    key={item.id}
                    item={item}
                    onInspect={() => setSelectedItemId(item.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="vendor-empty-state">
                <Package size={28} aria-hidden="true" />
                <strong>Nenhum item encontrado</strong>
                <p>Limpe a busca para ver o estoque da Mara.</p>
              </div>
            )}
          </main>
        </section>

        {selectedItem ? (
          <VendorItemPurchaseModal
            item={selectedItem}
            gold={gold}
            quantity={getQuantity(selectedItem)}
            maxQuantity={getMaxBuyQuantity(selectedItem)}
            isBusy={busyKey === `buy-${selectedItem.id}`}
            onClose={() => setSelectedItemId(null)}
            onQuantityChange={(nextQuantity) =>
              setItemQuantity(selectedItem, nextQuantity)
            }
            onBuy={() => handleBuy(selectedItem)}
          />
        ) : null}
      </section>
    </DashboardLayout>
  );
}
