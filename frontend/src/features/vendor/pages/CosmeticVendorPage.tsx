import { isAxiosError } from "axios";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Check,
  CircleUserRound,
  Frame,
  GalleryHorizontalEnd,
  Image,
  LoaderCircle,
  Palette,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import goldIcon from "../../../assets/images/coins/gold.webp";
import {
  getCosmeticVendorCatalog,
  purchaseCosmeticVendorProduct,
} from "../../cosmetics/api/cosmetics.api";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import {
  getCosmeticEffectClass,
  getCosmeticImage,
} from "../../cosmetics/constants/cosmetic-assets";
import type {
  CosmeticItem,
  CosmeticVendorCatalogResponse,
  CosmeticVendorCategory,
  CosmeticVendorProduct,
  ResolvedCharacterAppearance,
} from "../../cosmetics/types/cosmetics.types";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import "../../gathering/styles/gathering.css";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import { getMerchantByRouteSegment } from "../data/merchants";
import "../styles/cosmetic-vendor.css";
import "../styles/vendor.css";

type CosmeticCategoryDefinition = {
  key: CosmeticVendorCategory;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const COSMETIC_CATEGORIES: CosmeticCategoryDefinition[] = [
  { key: "avatar", label: "Avatar", icon: CircleUserRound },
  { key: "frame", label: "Moldura", icon: Frame },
  { key: "card", label: "Cartão", icon: GalleryHorizontalEnd },
  { key: "overview", label: "Visão geral", icon: Image },
  { key: "effect", label: "Efeito", icon: Sparkles },
  { key: "identity", label: "Identidade", icon: BadgeCheck },
];

const RARITY_LABELS: Record<CosmeticItem["rarity"], string> = {
  COMMON: "Comum",
  UNCOMMON: "Incomum",
  RARE: "Raro",
  EPIC: "Épico",
  LEGENDARY: "Lendário",
};

const RARITY_WEIGHT: Record<CosmeticItem["rarity"], number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
};

const GOLD_FORMATTER = new Intl.NumberFormat("pt-BR");

function getApiErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError<{ message?: string | string[] }>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message[0] ?? fallback;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

function getProductRarity(product: CosmeticVendorProduct) {
  return product.cosmetics.reduce<CosmeticItem["rarity"]>(
    (highest, cosmetic) =>
      RARITY_WEIGHT[cosmetic.rarity] > RARITY_WEIGHT[highest]
        ? cosmetic.rarity
        : highest,
    "COMMON",
  );
}

function buildBaseAppearance(
  character: DashboardCharacterViewModel,
): ResolvedCharacterAppearance {
  return {
    ...(character.appearance ?? {}),
    baseAvatarKey:
      character.appearance?.baseAvatarKey ?? character.avatarKey ?? null,
    avatarKey: character.appearance?.avatarKey ?? character.avatarKey ?? null,
  };
}

function CosmeticProductPreview({
  product,
  character,
}: {
  product: CosmeticVendorProduct;
  character: DashboardCharacterViewModel;
}) {
  const baseAppearance = buildBaseAppearance(character);
  const avatar = product.cosmetics.find((item) => item.type === "AVATAR");
  const frame = product.cosmetics.find((item) => item.type === "AVATAR_FRAME");
  const banner = product.cosmetics.find(
    (item) => item.type === "PROFILE_BANNER",
  );
  const background = product.cosmetics.find(
    (item) => item.type === "OVERVIEW_BACKGROUND",
  );
  const effect = product.cosmetics.find(
    (item) => item.type === "PROFILE_EFFECT",
  );
  const title = product.cosmetics.find((item) => item.type === "TITLE");
  const badge = product.cosmetics.find((item) => item.type === "BADGE");

  if (avatar) {
    const image = getCosmeticImage(avatar.assetKey);
    return (
      <div className="cosmetic-vendor-preview cosmetic-vendor-preview--avatar">
        {image ? <img src={image} alt="" /> : <CircleUserRound size={34} />}
      </div>
    );
  }

  if (frame) {
    return (
      <div className="cosmetic-vendor-preview cosmetic-vendor-preview--frame">
        <CharacterPortrait
          className="cosmetic-vendor-preview__portrait"
          name={character.name}
          avatarKey={character.avatarKey}
          avatarUrl={character.avatarUrl}
          appearance={{ ...baseAppearance, avatarFrame: frame }}
          decorative
        />
      </div>
    );
  }

  if (banner) {
    const image = getCosmeticImage(banner.assetKey);
    return (
      <div
        className="cosmetic-vendor-preview cosmetic-vendor-preview--banner"
        style={image ? { backgroundImage: `url("${image}")` } : undefined}
      >
        <CharacterPortrait
          className="cosmetic-vendor-preview__card-portrait"
          name={character.name}
          avatarKey={character.avatarKey}
          avatarUrl={character.avatarUrl}
          appearance={baseAppearance}
          decorative
        />
        <span>
          <small>{character.className ?? character.class?.name}</small>
          <strong>{character.name}</strong>
        </span>
      </div>
    );
  }

  if (background) {
    const image = getCosmeticImage(background.assetKey);
    return (
      <div
        className="cosmetic-vendor-preview cosmetic-vendor-preview--overview"
        style={image ? { backgroundImage: `url("${image}")` } : undefined}
      >
        <span>Visão geral</span>
      </div>
    );
  }

  if (effect) {
    const effectClass = getCosmeticEffectClass(effect.effectPreset);
    return (
      <div
        className={`cosmetic-vendor-preview cosmetic-vendor-preview--effect cosmetic-surface ${effectClass}`}
      >
        <span className="cosmetic-effect-layer" aria-hidden="true" />
        <CharacterPortrait
          className="cosmetic-vendor-preview__effect-portrait"
          name={character.name}
          avatarKey={character.avatarKey}
          avatarUrl={character.avatarUrl}
          appearance={baseAppearance}
          decorative
        />
        <strong>{character.name}</strong>
      </div>
    );
  }

  if (title || badge) {
    return (
      <div className="cosmetic-vendor-preview cosmetic-vendor-preview--identity">
        {badge?.displayText ? <b>{badge.displayText}</b> : null}
        <span>
          <small>{title?.displayText}</small>
          <strong>{character.name}</strong>
        </span>
      </div>
    );
  }

  return (
    <div className="cosmetic-vendor-preview">
      <Sparkles size={34} aria-hidden="true" />
    </div>
  );
}

export function CosmeticVendorPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? "";
  const merchant = getMerchantByRouteSegment("vera");
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [catalog, setCatalog] = useState<CosmeticVendorCatalogResponse | null>(
    null,
  );
  const [activeCategoryKey, setActiveCategoryKey] =
    useState<CosmeticVendorCategory>("avatar");
  const [isLoading, setIsLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const pendingRequestIds = useRef(new Map<string, string>());

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!safeCharacterId) return;

      try {
        setIsLoading(true);
        setErrorMessage(null);
        const [overview, vendorCatalog] = await Promise.all([
          getCharacterOverview(safeCharacterId),
          getCosmeticVendorCatalog(safeCharacterId),
        ]);

        if (isMounted) {
          setCharacter({
            ...buildGatheringDashboardCharacter(overview),
            gold: vendorCatalog.character.gold,
          });
          setCatalog(vendorCatalog);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            getApiErrorMessage(
              error,
              "Não foi possível carregar o Ateliê da Vera.",
            ),
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [safeCharacterId]);

  const activeCategory = useMemo(
    () =>
      COSMETIC_CATEGORIES.find(
        (category) => category.key === activeCategoryKey,
      ) ?? COSMETIC_CATEGORIES[0],
    [activeCategoryKey],
  );
  const activeProducts = useMemo(
    () =>
      catalog?.products
        .filter((product) => product.category === activeCategory.key)
        .sort((left, right) => left.sortOrder - right.sortOrder) ?? [],
    [activeCategory.key, catalog?.products],
  );

  async function handlePurchase(product: CosmeticVendorProduct) {
    if (!catalog || product.isOwned || busyProductId) return;

    const requestId =
      pendingRequestIds.current.get(product.id) ?? crypto.randomUUID();
    pendingRequestIds.current.set(product.id, requestId);
    setBusyProductId(product.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await purchaseCosmeticVendorProduct(
        safeCharacterId,
        product.id,
        requestId,
      );
      pendingRequestIds.current.delete(product.id);
      setCatalog((current) =>
        current
          ? {
              ...current,
              character: { ...current.character, gold: result.gold },
              products: current.products.map((item) =>
                item.id === product.id
                  ? { ...item, isOwned: true, isPartiallyOwned: false }
                  : item,
              ),
            }
          : current,
      );
      setCharacter((current) =>
        current
          ? {
              ...current,
              gold: result.gold,
              wallet: current.wallet
                ? { ...current.wallet, gold: result.gold }
                : current.wallet,
              currencies: current.currencies
                ? { ...current.currencies, gold: result.gold }
                : current.currencies,
            }
          : current,
      );
      setSuccessMessage(result.message);
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "Não foi possível concluir esta compra."),
      );
    } finally {
      setBusyProductId(null);
    }
  }

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (!merchant || merchant.shopType !== "COSMETICS") {
    return (
      <Navigate to={`/dashboard/${safeCharacterId}/consumables`} replace />
    );
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando ateliê...</span>
      </main>
    );
  }

  if (!character || !catalog) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar mercador</h1>
        <p>{errorMessage ?? "Não foi possível carregar este personagem."}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="cosmetic-vendor-page gathering-page gathering-page--clean">
        <article
          className="gathering-origin-lore-card gathering-origin-lore-card--npc gathering-origin-npc vendor-lore-card"
          aria-label={merchant.title}
          data-merchant={merchant.id}
        >
          <div className="gathering-origin-npc__stage" aria-hidden="true">
            <div className="gathering-origin-npc__portrait vendor-npc-fallback">
              {merchant.portraitUrl ? (
                <img src={merchant.portraitUrl} alt="" />
              ) : (
                <span>{merchant.initials}</span>
              )}
            </div>
          </div>

          <div className="gathering-origin-npc__content">
            <div className="gathering-origin-npc__meta">
              <strong className="gathering-origin-npc__name">
                {merchant.npcName}
              </strong>
              <span className="gathering-origin-npc__role">
                {merchant.role}
              </span>
            </div>

            <h2>{merchant.title}</h2>
            <blockquote>{merchant.quote}</blockquote>
            <p>{merchant.shopDescription}</p>
          </div>
        </article>

        <section
          className="cosmetic-vendor-catalog"
          aria-labelledby="cosmetic-vendor-catalog-title"
        >
          <header className="cosmetic-vendor-catalog__header">
            <div>
              <span>Catálogo de aparência</span>
              <h2 id="cosmetic-vendor-catalog-title">Arquivo visual da Vera</h2>
            </div>
            <Link to={`/dashboard/${safeCharacterId}/appearance`}>
              <Palette size={16} aria-hidden="true" />
              Minha aparência
            </Link>
          </header>

          <div
            className="cosmetic-vendor-tabs"
            role="tablist"
            aria-label="Categorias de aparência"
          >
            {COSMETIC_CATEGORIES.map((category) => {
              const CategoryIcon = category.icon;
              const isActive = category.key === activeCategory.key;

              return (
                <button
                  key={category.key}
                  id={`cosmetic-vendor-tab-${category.key}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`cosmetic-vendor-panel-${category.key}`}
                  className={isActive ? "is-active" : ""}
                  onClick={() => {
                    setActiveCategoryKey(category.key);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                >
                  <CategoryIcon
                    size={18}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </div>

          <div
            id={`cosmetic-vendor-panel-${activeCategory.key}`}
            className="cosmetic-vendor-category"
            role="tabpanel"
            aria-labelledby={`cosmetic-vendor-tab-${activeCategory.key}`}
          >
            {errorMessage || successMessage ? (
              <p
                className={`cosmetic-vendor-notice ${errorMessage ? "is-error" : "is-success"}`}
                role={errorMessage ? "alert" : "status"}
              >
                {errorMessage ?? successMessage}
              </p>
            ) : null}

            <div className="cosmetic-vendor-stock">
              {activeProducts.map((product) => {
                const isBusy = busyProductId === product.id;
                const hasEnoughGold =
                  catalog.character.gold >= product.goldPrice;
                const rarity = getProductRarity(product);

                return (
                  <article
                    key={product.id}
                    className={`cosmetic-vendor-product rarity-${rarity.toLowerCase()} ${product.isOwned ? "is-owned" : ""}`}
                  >
                    <CosmeticProductPreview
                      product={product}
                      character={character}
                    />

                    <div className="cosmetic-vendor-product__body">
                      <div className="cosmetic-vendor-product__meta">
                        <span>{RARITY_LABELS[rarity]}</span>
                        {product.isOwned ? (
                          <strong>
                            <Check size={12} aria-hidden="true" /> Adquirido
                          </strong>
                        ) : null}
                      </div>
                      <h3>{product.name}</h3>
                      <p>{product.description}</p>
                      {product.cosmetics.length > 1 ? (
                        <small className="cosmetic-vendor-product__bundle">
                          Título + distintivo
                        </small>
                      ) : null}
                    </div>

                    <footer className="cosmetic-vendor-product__footer">
                      <span className="cosmetic-vendor-product__price">
                        <img src={goldIcon} alt="" aria-hidden="true" />
                        <strong>
                          {GOLD_FORMATTER.format(product.goldPrice)}
                        </strong>
                      </span>
                      <button
                        type="button"
                        disabled={
                          product.isOwned ||
                          isBusy ||
                          Boolean(busyProductId) ||
                          !hasEnoughGold
                        }
                        title={
                          product.isOwned
                            ? "Esta aparência já pertence à sua conta"
                            : !hasEnoughGold
                              ? "Gold insuficiente"
                              : `Comprar ${product.name}`
                        }
                        onClick={() => void handlePurchase(product)}
                      >
                        {isBusy ? (
                          <LoaderCircle
                            className="is-spinning"
                            size={15}
                            aria-hidden="true"
                          />
                        ) : product.isOwned ? (
                          <Check size={15} aria-hidden="true" />
                        ) : (
                          <ShoppingBag size={15} aria-hidden="true" />
                        )}
                        <span>{product.isOwned ? "Adquirido" : "Comprar"}</span>
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
