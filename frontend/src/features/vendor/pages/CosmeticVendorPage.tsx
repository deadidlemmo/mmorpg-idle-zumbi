import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  BadgeCheck,
  CircleUserRound,
  Frame,
  GalleryHorizontalEnd,
  Image,
  Palette,
  Sparkles,
} from "lucide-react";
import cashIcon from "../../../assets/images/coins/cash.webp";
import goldIcon from "../../../assets/images/coins/gold.webp";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import "../../gathering/styles/gathering.css";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import { getMerchantByRouteSegment } from "../data/merchants";
import "../styles/cosmetic-vendor.css";
import "../styles/vendor.css";

type CosmeticCategoryKey =
  | "avatar"
  | "frame"
  | "card"
  | "overview"
  | "effect"
  | "identity";

type CosmeticCategoryDefinition = {
  key: CosmeticCategoryKey;
  label: string;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const COSMETIC_CATEGORIES: CosmeticCategoryDefinition[] = [
  {
    key: "avatar",
    label: "Avatar",
    title: "Avatares",
    description: "Retratos que substituem a imagem base do sobrevivente.",
    icon: CircleUserRound,
  },
  {
    key: "frame",
    label: "Moldura",
    title: "Molduras",
    description: "Acabamentos visuais aplicados ao retrato do personagem.",
    icon: Frame,
  },
  {
    key: "card",
    label: "Cartão",
    title: "Cartões",
    description: "Cenários exibidos no cartão público do sobrevivente.",
    icon: GalleryHorizontalEnd,
  },
  {
    key: "overview",
    label: "Visão geral",
    title: "Visão geral",
    description: "Ambientes que transformam o fundo da página principal.",
    icon: Image,
  },
  {
    key: "effect",
    label: "Efeito",
    title: "Efeitos",
    description: "Animações e sinais visuais aplicados ao perfil.",
    icon: Sparkles,
  },
  {
    key: "identity",
    label: "Identidade",
    title: "Identidade",
    description: "Títulos e distintivos exibidos junto ao nome.",
    icon: BadgeCheck,
  },
];

export function CosmeticVendorPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? "";
  const merchant = getMerchantByRouteSegment("vera");
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [activeCategoryKey, setActiveCategoryKey] =
    useState<CosmeticCategoryKey>("avatar");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCharacter() {
      if (!safeCharacterId) return;

      try {
        setIsLoading(true);
        setErrorMessage(null);
        const overview = await getCharacterOverview(safeCharacterId);

        if (isMounted) {
          setCharacter(buildGatheringDashboardCharacter(overview));
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Não foi possível carregar o Ateliê da Vera.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCharacter();

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

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (!merchant || merchant.shopType !== "COSMETICS") {
    return <Navigate to={`/dashboard/${safeCharacterId}/consumables`} replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando ateliê...</span>
      </main>
    );
  }

  if (!character) {
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

  const ActiveCategoryIcon = activeCategory.icon;
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
              <span className="gathering-origin-npc__role">{merchant.role}</span>
            </div>

            <h2>{merchant.title}</h2>
            <blockquote>{merchant.quote}</blockquote>
            <p>{merchant.shopDescription}</p>
          </div>
        </article>

        <section className="cosmetic-vendor-catalog" aria-labelledby="cosmetic-vendor-catalog-title">
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
                  onClick={() => setActiveCategoryKey(category.key)}
                >
                  <CategoryIcon size={18} strokeWidth={1.8} aria-hidden="true" />
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
            <div className="cosmetic-vendor-category__intro">
              <span aria-hidden="true">
                <ActiveCategoryIcon size={31} strokeWidth={1.55} />
              </span>
              <div>
                <small>Categoria selecionada</small>
                <h3>{activeCategory.title}</h3>
                <p>{activeCategory.description}</p>
              </div>
            </div>

            <div className="cosmetic-vendor-price-tiers" aria-label="Formas de compra">
              <div>
                <img src={goldIcon} alt="" aria-hidden="true" />
                <span>
                  <strong>Coleção regular</strong>
                  <small>Compras com Gold</small>
                </span>
              </div>
              <div>
                <img src={cashIcon} alt="" aria-hidden="true" />
                <span>
                  <strong>Seleção especial</strong>
                  <small>Peças raras por Cash</small>
                </span>
              </div>
            </div>

            <div className="cosmetic-vendor-empty">
              <ActiveCategoryIcon size={28} strokeWidth={1.45} aria-hidden="true" />
              <strong>Estoque em preparação</strong>
              <p>Vera ainda está catalogando os novos itens de {activeCategory.label.toLowerCase()}.</p>
            </div>
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
