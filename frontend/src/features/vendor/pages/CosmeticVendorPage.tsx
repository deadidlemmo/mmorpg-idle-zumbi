import { isAxiosError } from "axios";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
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
  RotateCcw,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import goldIcon from "../../../assets/images/coins/gold.webp";
import cashIcon from "../../../assets/images/coins/cash.webp";
import {
  getCosmeticVendorCatalog,
  purchaseCosmeticVendorProduct,
} from "../../cosmetics/api/cosmetics.api";
import { CharacterProfileCard } from "../../cosmetics/components/CharacterProfileCard";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import { CosmeticEffectLayer } from "../../cosmetics/components/CosmeticEffectLayer";
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

type PreviewProductSelection = Partial<Record<CosmeticVendorCategory, string>>;

const COSMETIC_CATEGORIES: CosmeticCategoryDefinition[] = [
  { key: "avatar", label: "Avatar", icon: CircleUserRound },
  { key: "frame", label: "Moldura", icon: Frame },
  { key: "card", label: "Cartão", icon: GalleryHorizontalEnd },
  { key: "overview", label: "Visão geral", icon: Image },
  { key: "effect", label: "Efeito", icon: Sparkles },
  { key: "identity", label: "Identidade", icon: BadgeCheck },
];

const RARITY_WEIGHT: Record<CosmeticItem["rarity"], number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR");

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

function applyCosmeticsToAppearance(
  baseAppearance: ResolvedCharacterAppearance,
  cosmetics: CosmeticItem[],
): ResolvedCharacterAppearance {
  const nextAppearance = { ...baseAppearance };

  for (const cosmetic of cosmetics) {
    switch (cosmetic.type) {
      case "AVATAR":
        nextAppearance.avatar = cosmetic;
        nextAppearance.avatarKey =
          cosmetic.assetKey ?? nextAppearance.baseAvatarKey ?? null;
        break;
      case "AVATAR_FRAME":
        nextAppearance.avatarFrame = cosmetic;
        break;
      case "PROFILE_BANNER":
        nextAppearance.profileBanner = cosmetic;
        break;
      case "OVERVIEW_BACKGROUND":
        nextAppearance.overviewBackground = cosmetic;
        break;
      case "PROFILE_EFFECT":
        nextAppearance.profileEffect = cosmetic;
        break;
      case "TITLE":
        nextAppearance.title = cosmetic;
        break;
      case "BADGE":
        nextAppearance.badge = cosmetic;
        break;
    }
  }

  nextAppearance.accentColor =
    nextAppearance.profileBanner?.accentColor ??
    nextAppearance.avatarFrame?.accentColor ??
    nextAppearance.avatar?.accentColor ??
    baseAppearance.accentColor ??
    null;

  return nextAppearance;
}

function getAppearanceCosmetic(
  appearance: ResolvedCharacterAppearance,
  type: CosmeticItem["type"],
) {
  switch (type) {
    case "AVATAR":
      return appearance.avatar;
    case "AVATAR_FRAME":
      return appearance.avatarFrame;
    case "PROFILE_BANNER":
      return appearance.profileBanner;
    case "OVERVIEW_BACKGROUND":
      return appearance.overviewBackground;
    case "PROFILE_EFFECT":
      return appearance.profileEffect;
    case "TITLE":
      return appearance.title;
    case "BADGE":
      return appearance.badge;
  }
}

function isProductInUse(
  product: CosmeticVendorProduct,
  appearance: ResolvedCharacterAppearance,
) {
  return product.cosmetics.every(
    (cosmetic) =>
      cosmetic.isEquipped ||
      getAppearanceCosmetic(appearance, cosmetic.type)?.key === cosmetic.key,
  );
}

function CosmeticMiniProfile({
  character,
  appearance,
}: {
  character: DashboardCharacterViewModel;
  appearance: ResolvedCharacterAppearance;
}) {
  const bannerImage = getCosmeticImage(appearance.profileBanner?.assetKey);
  const effectClass = getCosmeticEffectClass(
    appearance.profileEffect?.effectPreset,
  );
  const style = {
    "--vendor-mini-accent": appearance.accentColor ?? "#84b85c",
    ...(bannerImage ? { "--vendor-mini-banner": `url("${bannerImage}")` } : {}),
  } as CSSProperties;

  return (
    <span
      className={[
        "cosmetic-vendor-mini-profile",
        "cosmetic-surface",
        bannerImage ? "has-banner" : "",
        effectClass,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-hidden="true"
    >
      <CosmeticEffectLayer
        effectPreset={appearance.profileEffect?.effectPreset}
      />
      <CharacterPortrait
        className="cosmetic-vendor-mini-profile__portrait"
        name={character.name}
        avatarKey={character.avatarKey}
        avatarUrl={character.avatarUrl}
        appearance={appearance}
        decorative
      />
      <span className="cosmetic-vendor-mini-profile__identity">
        <small>{character.className ?? character.class?.name}</small>
        <strong>{character.name}</strong>
        {appearance.title?.displayText ? (
          <em>{appearance.title.displayText}</em>
        ) : null}
      </span>
      {appearance.badge?.displayText ? (
        <b title={appearance.badge.name}>{appearance.badge.displayText}</b>
      ) : null}
    </span>
  );
}

function CosmeticProductPreview({
  product,
  character,
  appearance,
}: {
  product: CosmeticVendorProduct;
  character: DashboardCharacterViewModel;
  appearance: ResolvedCharacterAppearance;
}) {
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
          appearance={appearance}
          decorative
        />
      </div>
    );
  }

  if (banner) {
    return (
      <div className="cosmetic-vendor-preview cosmetic-vendor-preview--banner">
        <CosmeticMiniProfile character={character} appearance={appearance} />
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
        <CosmeticMiniProfile character={character} appearance={appearance} />
      </div>
    );
  }

  if (effect) {
    return (
      <div className="cosmetic-vendor-preview cosmetic-vendor-preview--effect">
        <CosmeticMiniProfile character={character} appearance={appearance} />
      </div>
    );
  }

  if (title || badge) {
    return (
      <div className="cosmetic-vendor-preview cosmetic-vendor-preview--identity">
        <CosmeticMiniProfile character={character} appearance={appearance} />
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
  const [previewProductSelection, setPreviewProductSelection] =
    useState<PreviewProductSelection>({});
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
            cash: vendorCatalog.character.cash,
          });
          setCatalog(vendorCatalog);
          setPreviewProductSelection({});
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
  const baseAppearance = useMemo(
    () => (character ? buildBaseAppearance(character) : null),
    [character],
  );
  const previewAppearance = useMemo(() => {
    if (!baseAppearance || !catalog) return baseAppearance;

    return COSMETIC_CATEGORIES.reduce((appearance, category) => {
      const selectedProductId = previewProductSelection[category.key];
      const selectedProduct = selectedProductId
        ? catalog.products.find((product) => product.id === selectedProductId)
        : null;

      return selectedProduct
        ? applyCosmeticsToAppearance(appearance, selectedProduct.cosmetics)
        : appearance;
    }, baseAppearance);
  }, [baseAppearance, catalog, previewProductSelection]);
  const previewSelectionCount = Object.keys(previewProductSelection).length;
  const overviewPreviewImage = getCosmeticImage(
    previewAppearance?.overviewBackground?.assetKey,
  );
  const overviewPreviewStyle = overviewPreviewImage
    ? ({
        "--vendor-overview-image": `url("${overviewPreviewImage}")`,
      } as CSSProperties)
    : undefined;

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
              character: {
                ...current.character,
                gold: result.gold,
                cash: result.cash,
              },
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
              cash: result.cash,
              wallet: current.wallet
                ? {
                    ...current.wallet,
                    gold: result.gold,
                    cash: result.cash,
                  }
                : current.wallet,
              currencies: current.currencies
                ? {
                    ...current.currencies,
                    gold: result.gold,
                    cash: result.cash,
                  }
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

          <div className="cosmetic-vendor-workspace">
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

              <header className="cosmetic-vendor-category__summary">
                <strong>{activeCategory.label}</strong>
                <span>{activeProducts.length} opções</span>
              </header>

              <div className="cosmetic-vendor-stock">
                {activeProducts.map((product) => {
                  const isBusy = busyProductId === product.id;
                  const isCashProduct = product.currency === "CASH";
                  const availableBalance = isCashProduct
                    ? catalog.character.cash
                    : catalog.character.gold;
                  const hasEnoughCurrency = availableBalance >= product.price;
                  const currencyIcon = isCashProduct ? cashIcon : goldIcon;
                  const currencyLabel = isCashProduct ? "Cash" : "Gold";
                  const rarity = getProductRarity(product);
                  const isPreviewed =
                    previewProductSelection[product.category] === product.id;
                  const isInUse = baseAppearance
                    ? isProductInUse(product, baseAppearance)
                    : false;
                  const productPreviewAppearance = previewAppearance
                    ? applyCosmeticsToAppearance(
                        previewAppearance,
                        product.cosmetics,
                      )
                    : buildBaseAppearance(character);

                  return (
                    <article
                      key={product.id}
                      className={[
                        "cosmetic-vendor-product",
                        `rarity-${rarity.toLowerCase()}`,
                        product.isOwned ? "is-owned" : "",
                        isInUse ? "is-in-use" : "",
                        isPreviewed ? "is-previewed" : "",
                        isCashProduct ? "is-cash-product" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className="cosmetic-vendor-product__selector"
                        aria-label={`Visualizar ${product.name}`}
                        aria-pressed={isPreviewed}
                        onClick={() => {
                          setPreviewProductSelection((current) => ({
                            ...current,
                            [product.category]: product.id,
                          }));
                          setErrorMessage(null);
                          setSuccessMessage(null);
                        }}
                      >
                        <CosmeticProductPreview
                          product={product}
                          character={character}
                          appearance={productPreviewAppearance}
                        />
                        {isPreviewed ? (
                          <span className="cosmetic-vendor-product__preview-state">
                            <Check size={12} aria-hidden="true" /> Em prévia
                          </span>
                        ) : null}
                        <strong className="cosmetic-vendor-product__name">
                          {product.name}
                        </strong>
                      </button>

                      <footer className="cosmetic-vendor-product__footer">
                        <span
                          className={`cosmetic-vendor-product__price ${isCashProduct ? "is-cash" : "is-gold"}`}
                          title={`${CURRENCY_FORMATTER.format(product.price)} ${currencyLabel}`}
                        >
                          <img src={currencyIcon} alt="" aria-hidden="true" />
                          <strong>
                            {CURRENCY_FORMATTER.format(product.price)}
                          </strong>
                        </span>
                        <button
                          type="button"
                          disabled={
                            product.isOwned ||
                            isBusy ||
                            Boolean(busyProductId) ||
                            !hasEnoughCurrency
                          }
                          title={
                            isInUse
                              ? "Esta aparência está em uso"
                              : product.isOwned
                                ? "Esta aparência já pertence à sua conta"
                                : !hasEnoughCurrency
                                  ? `${currencyLabel} insuficiente`
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
                          <span>
                            {isInUse
                              ? "Em uso"
                              : product.isOwned
                                ? "Adquirido"
                                : "Comprar"}
                          </span>
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </div>

            <aside
              className="cosmetic-vendor-live-preview"
              aria-label="Prévia da aparência"
              aria-live="polite"
            >
              <header>
                <span>Prévia pública</span>
                <small>
                  {previewSelectionCount
                    ? `${previewSelectionCount} em prévia`
                    : "Visual atual"}
                </small>
              </header>
              <div
                className={`cosmetic-vendor-live-preview__surface ${overviewPreviewImage ? "has-overview" : ""}`}
                style={overviewPreviewStyle}
              >
                <CharacterProfileCard
                  name={character.name}
                  className={
                    character.className ??
                    character.class?.name ??
                    "Sobrevivente"
                  }
                  level={character.level}
                  mapName={character.currentMapName}
                  avatarKey={character.avatarKey}
                  appearance={previewAppearance}
                />
              </div>
              <button
                type="button"
                className="cosmetic-vendor-live-preview__reset"
                disabled={previewSelectionCount === 0}
                onClick={() => setPreviewProductSelection({})}
              >
                <RotateCcw size={15} aria-hidden="true" /> Restaurar visual
              </button>
            </aside>
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
