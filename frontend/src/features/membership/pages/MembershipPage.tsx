import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BadgeCheck,
  Check,
  Clock3,
  CreditCard,
  Crown,
  Palette,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
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

function getOfferTone(offer: StorefrontOffer) {
  if (offer.key === "pacote-nucleo-helix") return "helix";
  if (offer.key === "pacote-protocolo-carmesim") return "carmesim";
  return "premium";
}

function StorefrontOfferCard({
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
  const isPartialPackage =
    offer.kind === "PERMANENT_PACKAGE" &&
    offer.ownership.ownedItemCount > 0 &&
    !offer.ownership.isOwned;
  const actionLabel = offer.ownership.isOwned
    ? offer.kind === "SUBSCRIPTION"
      ? "Premium ativo"
      : "Pacote adquirido"
    : checkoutEnabled
      ? `Comprar com ${offer.price.formatted}`
      : "Compra em breve";

  return (
    <article
      className={`membership-offer membership-offer--${getOfferTone(offer)}`}
      style={{ "--offer-accent": offer.accentColor } as CSSProperties}
    >
      <div
        className="membership-offer__cover"
        style={
          coverImage ? { backgroundImage: `url("${coverImage}")` } : undefined
        }
      >
        <div className="membership-offer__cover-copy">
          <span>{offer.eyebrow}</span>
          <h2>{offer.name}</h2>
          <small>{offer.billingLabel}</small>
        </div>
        {offer.ownership.isOwned ? (
          <strong className="membership-offer__owned">
            <BadgeCheck size={14} aria-hidden="true" />
            {offer.kind === "SUBSCRIPTION" ? "Ativo" : "Seu"}
          </strong>
        ) : null}
      </div>

      <div className="membership-offer__body">
        <div className="membership-offer__price">
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

        <div className="membership-offer__footer">
          {activeUntil ? <small>Ativo até {activeUntil}</small> : null}
          {isPartialPackage ? (
            <small>
              {offer.ownership.ownedItemCount} de{" "}
              {offer.ownership.totalItemCount} itens já liberados
            </small>
          ) : null}
          {!activeUntil && !isPartialPackage ? (
            <small>
              {offer.ownership.totalItemCount} cosméticos na coleção
            </small>
          ) : null}

          <button
            type="button"
            disabled={
              offer.ownership.isOwned || !checkoutEnabled || isCheckingOut
            }
            onClick={() => onCheckout(offer)}
          >
            {offer.ownership.isOwned ? (
              <BadgeCheck size={16} aria-hidden="true" />
            ) : (
              <ShoppingBag size={16} aria-hidden="true" />
            )}
            {isCheckingOut ? "Abrindo checkout" : actionLabel}
          </button>

          {offer.ownership.isOwned ? (
            <Link to={appearanceHref}>
              <Palette size={15} aria-hidden="true" /> Gerenciar aparência
            </Link>
          ) : null}
        </div>
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
  const [selectedProvider, setSelectedProvider] =
    useState<StorefrontProviderKey>("MERCADO_PAGO");
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
  const heroImage = getCosmeticImage(
    premiumOffer?.collection?.coverAssetKey ?? "banner-premium-ultimo-abrigo",
  );
  const ownedPermanentPackages =
    storefront?.offers.filter(
      (offer) => offer.kind === "PERMANENT_PACKAGE" && offer.ownership.isOwned,
    ).length ?? 0;
  const appearanceHref = `/dashboard/${safeCharacterId}/appearance`;
  const selectedProviderAvailable = storefront?.checkout.providers.some(
    (provider) =>
      provider.key === selectedProvider && provider.state === "AVAILABLE",
  );

  async function handleCheckout(offer: StorefrontOffer) {
    if (!storefront?.checkout.enabled) return;
    setCheckingOutOfferKey(offer.key);
    setErrorMessage(null);
    try {
      const checkout = await createStorefrontCheckout({
        characterId: safeCharacterId,
        offerKey: offer.key,
        provider: selectedProvider,
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
        <section
          className="membership-hero"
          style={
            heroImage ? { backgroundImage: `url("${heroImage}")` } : undefined
          }
        >
          <div className="membership-hero__content">
            <span className="membership-eyebrow">Benefícios e cosméticos</span>
            <h1>Loja do Abrigo</h1>
            <strong>Três ofertas, sem catálogo inflado.</strong>
            <p>
              Assine o Premium para acelerar sua rotina ou adquira pacotes
              cosméticos permanentes para personalizar toda a conta.
            </p>
            <a href="#ofertas" className="membership-button">
              <ShoppingBag size={16} aria-hidden="true" /> Ver ofertas
            </a>
          </div>
        </section>

        <section
          className="membership-account-status"
          aria-label="Status da conta"
        >
          <div>
            <Crown size={19} aria-hidden="true" />
            <span>
              <small>Assinatura</small>
              <strong>
                {storefront.membership.isPremiumActive
                  ? "Premium ativo"
                  : "Conta gratuita"}
              </strong>
            </span>
          </div>
          <div>
            <Palette size={19} aria-hidden="true" />
            <span>
              <small>Pacotes permanentes</small>
              <strong>{ownedPermanentPackages} de 2 adquiridos</strong>
            </span>
          </div>
          <Link to={appearanceHref}>
            Gerenciar aparência
            <Palette size={15} aria-hidden="true" />
          </Link>
        </section>

        <section
          id="ofertas"
          className="membership-offers"
          aria-label="Ofertas"
        >
          <header className="membership-section-heading">
            <div>
              <span className="membership-eyebrow">Catálogo atual</span>
              <h2>Escolha o que combina com sua conta</h2>
            </div>
            <p>
              Pacotes cosméticos não concedem atributos nem poder de combate.
            </p>
          </header>

          <div className="membership-offers__grid">
            {storefront.offers.map((offer) => (
              <StorefrontOfferCard
                key={offer.key}
                offer={offer}
                checkoutEnabled={Boolean(
                  storefront.checkout.enabled && selectedProviderAvailable,
                )}
                isCheckingOut={checkingOutOfferKey === offer.key}
                onCheckout={(selectedOffer) =>
                  void handleCheckout(selectedOffer)
                }
                appearanceHref={appearanceHref}
              />
            ))}
          </div>
        </section>

        <section
          className="membership-checkout"
          aria-label="Formas de pagamento"
        >
          <div className="membership-checkout__copy">
            <CreditCard size={21} aria-hidden="true" />
            <span>
              <small>Checkout</small>
              <strong>Integrações preparadas para a próxima etapa</strong>
              <p>{storefront.checkout.message}</p>
            </span>
          </div>

          <div
            className="membership-provider-selector"
            role="group"
            aria-label="Provedor de pagamento preferido"
          >
            {storefront.checkout.providers.map((provider) => (
              <button
                key={provider.key}
                type="button"
                className={selectedProvider === provider.key ? "is-active" : ""}
                aria-pressed={selectedProvider === provider.key}
                onClick={() => setSelectedProvider(provider.key)}
              >
                {provider.name}
                <small>Em preparação</small>
              </button>
            ))}
          </div>
        </section>

        <section
          className="membership-premium-details"
          aria-label="Benefícios Premium"
        >
          <header className="membership-section-heading">
            <div>
              <span className="membership-eyebrow">Premium</span>
              <h2>Benefícios já definidos</h2>
            </div>
          </header>

          <div className="membership-premium-details__grid">
            <article>
              <Clock3 size={20} aria-hidden="true" />
              <strong>{MEMBERSHIP_BENEFIT_LABELS.premiumIdleLimit}</strong>
              <span>
                de progresso idle, contra{" "}
                {MEMBERSHIP_BENEFIT_LABELS.freeIdleLimit} no gratuito
              </span>
            </article>
            <article>
              <Zap size={20} aria-hidden="true" />
              <strong>{MEMBERSHIP_BENEFIT_LABELS.xpBonus} de EXP</strong>
              <span>em gathering, batalha e caça</span>
            </article>
            <article>
              <Sparkles size={20} aria-hidden="true" />
              <strong>Último Abrigo</strong>
              <span>coleção completa enquanto o Premium estiver ativo</span>
            </article>
            <article>
              <ShieldCheck size={20} aria-hidden="true" />
              <strong>Conta inteira</strong>
              <span>
                benefícios e cosméticos disponíveis para seus personagens
              </span>
            </article>
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
