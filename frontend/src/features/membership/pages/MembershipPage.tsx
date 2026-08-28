import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowRightLeft,
  BadgeCheck,
  Check,
  Clock3,
  Coins,
  CreditCard,
  Crown,
  Frame,
  Gauge,
  Image as ImageIcon,
  LockKeyhole,
  PackageOpen,
  Palette,
  ShieldCheck,
  ShoppingBag,
  Store,
  Ticket,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import cashIcon from "../../../assets/images/coins/cash.webp";
import { getCosmeticImage } from "../../cosmetics/constants/cosmetic-assets";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import {
  createStorefrontCheckout,
  getStorefrontCatalog,
} from "../api/storefront.api";
import { MEMBERSHIP_BENEFIT_LABELS } from "../constants/membership-benefits";
import type {
  StorefrontCatalogResponse,
  StorefrontOffer,
  StorefrontProviderKey,
} from "../types/storefront.types";
import "../styles/membership.css";

type MembershipStoreTab = "premium" | "cash" | "packages";

interface MembershipTabDefinition {
  key: MembershipStoreTab;
  label: string;
  description: string;
  icon: LucideIcon;
}

const MEMBERSHIP_TABS: MembershipTabDefinition[] = [
  {
    key: "premium",
    label: "Premium",
    description: "Assinatura e passe",
    icon: Crown,
  },
  {
    key: "cash",
    label: "Cash",
    description: "Saldo da conta",
    icon: Coins,
  },
  {
    key: "packages",
    label: "Passes e pacotes",
    description: "Cosméticos e itens",
    icon: PackageOpen,
  },
];

function getMembershipPageError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível carregar a loja do abrigo.";
}

function formatPremiumUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function formatStoreNumber(value?: number | null) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR").format(
    Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
  );
}

function getOfferTone(offer: StorefrontOffer) {
  if (offer.key === "pacote-nucleo-helix") return "helix";
  if (offer.key === "pacote-protocolo-carmesim") return "carmesim";
  return "premium";
}

function MembershipStatusItem({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="membership-account-strip__item">
      <Icon size={19} aria-hidden="true" />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail ? <em>{detail}</em> : null}
      </span>
    </div>
  );
}

function MembershipFeature({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="membership-feature">
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
    </article>
  );
}

function MembershipPurchaseButton({
  offer,
  checkoutEnabled,
  isCheckingOut,
  onCheckout,
}: {
  offer: StorefrontOffer;
  checkoutEnabled: boolean;
  isCheckingOut: boolean;
  onCheckout: (offer: StorefrontOffer) => void;
}) {
  const actionLabel = offer.ownership.isOwned
    ? offer.kind === "SUBSCRIPTION"
      ? "Premium ativo"
      : "Pacote adquirido"
    : checkoutEnabled
      ? `Comprar por ${offer.price.formatted}`
      : "Indisponível nos testes";

  return (
    <button
      type="button"
      className="membership-purchase-button"
      disabled={offer.ownership.isOwned || !checkoutEnabled || isCheckingOut}
      onClick={() => onCheckout(offer)}
    >
      {offer.ownership.isOwned ? (
        <BadgeCheck size={17} aria-hidden="true" />
      ) : (
        <ShoppingBag size={17} aria-hidden="true" />
      )}
      {isCheckingOut ? "Abrindo checkout" : actionLabel}
    </button>
  );
}

function PremiumPlanPanel({
  offer,
  checkoutEnabled,
  isCheckingOut,
  onCheckout,
  appearanceHref,
}: {
  offer: StorefrontOffer;
  checkoutEnabled: boolean;
  isCheckingOut: boolean;
  onCheckout: (offer: StorefrontOffer) => void;
  appearanceHref: string;
}) {
  const coverImage = getCosmeticImage(offer.collection?.coverAssetKey);
  const activeUntil = formatPremiumUntil(offer.ownership.activeUntil);

  return (
    <article
      className="membership-premium-plan"
      style={{ "--offer-accent": offer.accentColor } as CSSProperties}
    >
      <div
        className="membership-premium-plan__cover"
        style={
          coverImage ? { backgroundImage: `url("${coverImage}")` } : undefined
        }
      >
        <span>Assinatura da conta</span>
        <strong>{offer.name}</strong>
        <small>{offer.billingLabel}</small>
      </div>

      <div className="membership-premium-plan__details">
        <header>
          <div>
            <span className="membership-product-kicker">Plano atual</span>
            <h2>{offer.name}</h2>
          </div>
          <strong className="membership-product-state">
            {offer.ownership.isOwned ? "Ativo" : "Disponível em breve"}
          </strong>
        </header>

        <div className="membership-premium-plan__price">
          <strong>{offer.price.formatted}</strong>
          <span>{offer.billingLabel}</span>
        </div>

        <p>{offer.description}</p>

        <ul>
          {offer.benefits.map((benefit) => (
            <li key={benefit}>
              <Check size={15} aria-hidden="true" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <footer>
          <span className="membership-product-meta">
            <UserRound size={15} aria-hidden="true" />
            Vinculado à conta e não negociável
          </span>
          {activeUntil ? <small>Ativo até {activeUntil}</small> : null}
          <div className="membership-product-actions">
            <MembershipPurchaseButton
              offer={offer}
              checkoutEnabled={checkoutEnabled}
              isCheckingOut={isCheckingOut}
              onCheckout={onCheckout}
            />
            {offer.ownership.isOwned ? (
              <Link to={appearanceHref}>
                <Palette size={16} aria-hidden="true" />
                Aparência
              </Link>
            ) : null}
          </div>
        </footer>
      </div>
    </article>
  );
}

function StorefrontPackageCard({
  offer,
  checkoutEnabled,
  isCheckingOut,
  onCheckout,
  appearanceHref,
}: {
  offer: StorefrontOffer;
  checkoutEnabled: boolean;
  isCheckingOut: boolean;
  onCheckout: (offer: StorefrontOffer) => void;
  appearanceHref: string;
}) {
  const coverImage = getCosmeticImage(offer.collection?.coverAssetKey);
  const isPartialPackage =
    offer.ownership.ownedItemCount > 0 && !offer.ownership.isOwned;

  return (
    <article
      className={`membership-package-card membership-package-card--${getOfferTone(offer)}`}
      style={{ "--offer-accent": offer.accentColor } as CSSProperties}
    >
      <div
        className="membership-package-card__cover"
        style={
          coverImage ? { backgroundImage: `url("${coverImage}")` } : undefined
        }
      >
        <span>{offer.eyebrow}</span>
        {offer.ownership.isOwned ? (
          <strong>
            <BadgeCheck size={14} aria-hidden="true" />
            Adquirido
          </strong>
        ) : null}
      </div>

      <div className="membership-package-card__body">
        <header>
          <div>
            <h2>{offer.name}</h2>
            <span>{offer.billingLabel}</span>
          </div>
          <strong>{offer.price.formatted}</strong>
        </header>

        <p>{offer.description}</p>

        <ul>
          {offer.benefits.map((benefit) => (
            <li key={benefit}>
              <Check size={14} aria-hidden="true" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <footer>
          <small>
            {isPartialPackage
              ? `${offer.ownership.ownedItemCount} de ${offer.ownership.totalItemCount} itens liberados`
              : `${offer.ownership.totalItemCount} cosméticos na coleção`}
          </small>
          <MembershipPurchaseButton
            offer={offer}
            checkoutEnabled={checkoutEnabled}
            isCheckingOut={isCheckingOut}
            onCheckout={onCheckout}
          />
          {offer.ownership.isOwned ? (
            <Link to={appearanceHref}>
              <Palette size={15} aria-hidden="true" />
              Usar coleção
            </Link>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

export function MembershipPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? "";
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [storefront, setStorefront] =
    useState<StorefrontCatalogResponse | null>(null);
  const [activeTab, setActiveTab] =
    useState<MembershipStoreTab>("premium");
  const [checkingOutOfferKey, setCheckingOutOfferKey] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!safeCharacterId) return;

      try {
        setIsLoading(true);
        setErrorMessage(null);
        const [overviewResponse, storefrontResponse] = await Promise.all([
          getCharacterOverview(safeCharacterId),
          getStorefrontCatalog(safeCharacterId),
        ]);

        if (!isMounted) return;
        setCharacter(buildGatheringDashboardCharacter(overviewResponse));
        setStorefront(storefrontResponse);
      } catch (error) {
        if (isMounted) setErrorMessage(getMembershipPageError(error));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadPage();
    return () => {
      isMounted = false;
    };
  }, [safeCharacterId]);

  const premiumOffer = useMemo(
    () => storefront?.offers.find((offer) => offer.kind === "SUBSCRIPTION"),
    [storefront],
  );
  const packageOffers = useMemo(
    () =>
      storefront?.offers.filter(
        (offer) => offer.kind === "PERMANENT_PACKAGE",
      ) ?? [],
    [storefront],
  );
  const ownedPermanentPackages = packageOffers.filter(
    (offer) => offer.ownership.isOwned,
  ).length;
  const appearanceHref = `/dashboard/${safeCharacterId}/appearance`;
  const checkoutProvider = storefront?.checkout.providers.find(
    (provider) => provider.state === "AVAILABLE",
  );
  const checkoutEnabled = Boolean(
    storefront?.checkout.enabled && checkoutProvider,
  );
  const premiumActiveUntil = formatPremiumUntil(
    storefront?.membership.premiumUntil,
  );
  const cashBalance = formatStoreNumber(
    character?.cash ?? character?.wallet?.cash ?? character?.currencies?.cash,
  );

  async function handleCheckout(offer: StorefrontOffer) {
    if (!checkoutEnabled || !checkoutProvider) return;
    setCheckingOutOfferKey(offer.key);
    setErrorMessage(null);
    try {
      const checkout = await createStorefrontCheckout({
        characterId: safeCharacterId,
        offerKey: offer.key,
        provider: checkoutProvider.key as StorefrontProviderKey,
      });
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setErrorMessage(getMembershipPageError(error));
    } finally {
      setCheckingOutOfferKey(null);
    }
  }

  if (!safeCharacterId) return <Navigate to="/characters" replace />;

  if (isLoading && (!character || !storefront)) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando loja...</span>
      </main>
    );
  }

  if (!character || !storefront) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar a loja</h1>
        <p>{errorMessage ?? "Não foi possível carregar este personagem."}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <main className="membership-page" aria-label="Loja Premium do Abrigo">
        <header className="membership-store-header">
          <div className="membership-store-header__title">
            <span className="membership-store-header__icon" aria-hidden="true">
              <Store size={24} />
            </span>
            <div>
              <span className="membership-eyebrow">Suprimentos da conta</span>
              <h1>Premium e Cash</h1>
              <p>Benefícios, moeda da conta e itens especiais do abrigo.</p>
            </div>
          </div>

          <div
            className={`membership-checkout-state${storefront.checkout.enabled ? " is-available" : ""}`}
          >
            {storefront.checkout.enabled ? (
              <CreditCard size={18} aria-hidden="true" />
            ) : (
              <LockKeyhole size={18} aria-hidden="true" />
            )}
            <span>
              <small>Compras</small>
              <strong>
                {storefront.checkout.enabled
                  ? "Disponíveis"
                  : "Pausadas durante os testes"}
              </strong>
            </span>
          </div>
        </header>

        <section
          className="membership-account-strip"
          aria-label="Resumo da conta"
        >
          <MembershipStatusItem
            icon={Crown}
            label="Premium"
            value={
              storefront.membership.isPremiumActive ? "Ativo" : "Conta gratuita"
            }
            detail={premiumActiveUntil ? `Até ${premiumActiveUntil}` : null}
          />
          <MembershipStatusItem
            icon={Coins}
            label="Saldo"
            value={`${cashBalance} Cash`}
            detail="Vinculado à conta"
          />
          <MembershipStatusItem
            icon={PackageOpen}
            label="Coleções"
            value={`${ownedPermanentPackages} de ${packageOffers.length}`}
            detail="Pacotes permanentes"
          />
          <Link to={appearanceHref} className="membership-account-strip__link">
            <Palette size={16} aria-hidden="true" />
            Aparência
          </Link>
        </section>

        <nav
          className="membership-tabs"
          role="tablist"
          aria-label="Categorias da loja"
        >
          {MEMBERSHIP_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                id={`membership-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`membership-panel-${tab.key}`}
                className={isActive ? "is-active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>
                  <strong>{tab.label}</strong>
                  <small>{tab.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        {activeTab === "premium" ? (
          <section
            id="membership-panel-premium"
            className="membership-tab-panel"
            role="tabpanel"
            aria-labelledby="membership-tab-premium"
          >
            <header className="membership-section-heading">
              <div>
                <span className="membership-eyebrow">Conta Premium</span>
                <h2>Escolha como ativar</h2>
              </div>
              <p>Assinatura direta ou item negociável.</p>
            </header>

            {premiumOffer ? (
              <PremiumPlanPanel
                offer={premiumOffer}
                checkoutEnabled={checkoutEnabled}
                isCheckingOut={checkingOutOfferKey === premiumOffer.key}
                onCheckout={(offer) => void handleCheckout(offer)}
                appearanceHref={appearanceHref}
              />
            ) : (
              <p className="membership-empty-state">
                A assinatura Premium não está disponível no catálogo atual.
              </p>
            )}

            <article className="membership-planned-item">
              <div className="membership-planned-item__icon">
                <Ticket size={24} aria-hidden="true" />
              </div>
              <div className="membership-planned-item__copy">
                <span className="membership-product-kicker">Item negociável</span>
                <h3>Passe Premium</h3>
                <p>
                  Item de inventário para ativar Premium ou negociar com outro
                  jogador.
                </p>
              </div>
              <div className="membership-planned-item__rules">
                <span>
                  <Store size={15} aria-hidden="true" /> Market
                </span>
                <span>
                  <ArrowRightLeft size={15} aria-hidden="true" /> Trade
                </span>
              </div>
              <button type="button" disabled>
                Em desenvolvimento
              </button>
            </article>

            <div className="membership-premium-facts">
              <MembershipFeature icon={Clock3} title="Limite idle">
                {MEMBERSHIP_BENEFIT_LABELS.premiumIdleLimit}, contra{" "}
                {MEMBERSHIP_BENEFIT_LABELS.freeIdleLimit} na conta gratuita.
              </MembershipFeature>
              <MembershipFeature icon={Zap} title="Bônus de EXP">
                {MEMBERSHIP_BENEFIT_LABELS.xpBonus} em gathering, batalha e caça.
              </MembershipFeature>
              <MembershipFeature icon={ShieldCheck} title="Toda a conta">
                Benefícios ativos em todos os personagens do jogador.
              </MembershipFeature>
            </div>
          </section>
        ) : null}

        {activeTab === "cash" ? (
          <section
            id="membership-panel-cash"
            className="membership-tab-panel"
            role="tabpanel"
            aria-labelledby="membership-tab-cash"
          >
            <header className="membership-section-heading">
              <div>
                <span className="membership-eyebrow">Moeda da conta</span>
                <h2>Cash avulso</h2>
              </div>
              <p>Recargas serão pagas em reais e creditadas na conta.</p>
            </header>

            <div className="membership-cash-overview">
              <section className="membership-cash-balance">
                <img src={cashIcon} alt="" aria-hidden="true" />
                <span>
                  <small>Saldo disponível</small>
                  <strong>{cashBalance}</strong>
                  <em>Cash</em>
                </span>
              </section>

              <section className="membership-cash-purchase">
                <div>
                  <span className="membership-product-kicker">
                    Compra direta
                  </span>
                  <h3>Pacotes de Cash</h3>
                  <p>
                    Quantidades e preços serão exibidos aqui quando o catálogo
                    financeiro estiver definido no servidor.
                  </p>
                </div>
                <button type="button" disabled>
                  <CreditCard size={17} aria-hidden="true" />
                  Aguardando valores
                </button>
              </section>
            </div>

            <section className="membership-cash-uses" aria-label="Uso do Cash">
              <header>
                <span className="membership-eyebrow">Catálogo de Cash</span>
                <h3>Onde o saldo será usado</h3>
              </header>
              <div>
                <MembershipFeature icon={UserRound} title="Avatares">
                  Retratos permanentes para os personagens.
                </MembershipFeature>
                <MembershipFeature icon={ImageIcon} title="Backgrounds">
                  Cenários de perfil e visão geral.
                </MembershipFeature>
                <MembershipFeature icon={Frame} title="Molduras e efeitos">
                  Acabamentos visuais sem atributos de combate.
                </MembershipFeature>
                <MembershipFeature icon={Gauge} title="Aceleradores">
                  Consumíveis entregues como itens de inventário.
                </MembershipFeature>
              </div>
            </section>

            <div className="membership-account-rule">
              <ShieldCheck size={19} aria-hidden="true" />
              <span>
                <strong>Cash pertence à conta</strong>
                <small>Não pode ser listado no Market nem enviado por trade.</small>
              </span>
            </div>
          </section>
        ) : null}

        {activeTab === "packages" ? (
          <section
            id="membership-panel-packages"
            className="membership-tab-panel"
            role="tabpanel"
            aria-labelledby="membership-tab-packages"
          >
            <header className="membership-section-heading">
              <div>
                <span className="membership-eyebrow">Itens especiais</span>
                <h2>Passes e pacotes</h2>
              </div>
              <p>Itens de pacote poderão circular entre jogadores.</p>
            </header>

            <div className="membership-packages-grid">
              {packageOffers.map((offer) => (
                <StorefrontPackageCard
                  key={offer.key}
                  offer={offer}
                  checkoutEnabled={checkoutEnabled}
                  isCheckingOut={checkingOutOfferKey === offer.key}
                  onCheckout={(selectedOffer) =>
                    void handleCheckout(selectedOffer)
                  }
                  appearanceHref={appearanceHref}
                />
              ))}
            </div>

            <article className="membership-planned-item">
              <div className="membership-planned-item__icon">
                <Gauge size={24} aria-hidden="true" />
              </div>
              <div className="membership-planned-item__copy">
                <span className="membership-product-kicker">Consumíveis</span>
                <h3>Aceleradores</h3>
                <p>
                  Itens temporários comprados com Cash, armazenados no inventário
                  e elegíveis para negociação.
                </p>
              </div>
              <div className="membership-planned-item__rules">
                <span>
                  <Store size={15} aria-hidden="true" /> Market
                </span>
                <span>
                  <ArrowRightLeft size={15} aria-hidden="true" /> Trade
                </span>
              </div>
              <button type="button" disabled>
                Catálogo em definição
              </button>
            </article>

            <div className="membership-market-rule">
              <ArrowRightLeft size={20} aria-hidden="true" />
              <div>
                <strong>Market e trade entre jogadores</strong>
                <span>
                  O dono define o preço no Market; no trade, ambos confirmam os
                  itens antes da troca.
                </span>
              </div>
              <em>Próxima etapa</em>
            </div>
          </section>
        ) : null}

        <section
          className="membership-checkout-notice"
          aria-label="Estado dos pagamentos"
        >
          <LockKeyhole size={20} aria-hidden="true" />
          <div>
            <strong>Checkout ainda não habilitado</strong>
            <span>{storefront.checkout.message}</span>
          </div>
          <div className="membership-provider-list" aria-label="Provedores">
            {storefront.checkout.providers.map((provider) => (
              <span key={provider.key}>
                {provider.name}
                <small>
                  {provider.state === "AVAILABLE" ? "Ativo" : "Planejado"}
                </small>
              </span>
            ))}
          </div>
        </section>

        {errorMessage ? (
          <p className="membership-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
