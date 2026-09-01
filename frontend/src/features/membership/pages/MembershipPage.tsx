import { isAxiosError } from "axios";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  Coins,
  CreditCard,
  Crown,
  Frame,
  Gauge,
  Hammer,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Minus,
  PackageOpen,
  PanelsTopLeft,
  Pickaxe,
  Plus,
  Radar,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import cashIcon from "../../../assets/images/coins/cash.webp";
import passesPackagesIcon from "../../../assets/images/ui/passes-packages.webp";
import { PremiumPlaceholderIcon } from "../../../components/PremiumPlaceholderIcon";
import { getCosmeticImage } from "../../cosmetics/constants/cosmetic-assets";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import "../../dashboard/dashboard.css";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import {
  createStorefrontCheckout,
  getStorefrontCatalog,
  getStorefrontOrder,
} from "../api/storefront.api";
import { getTopIdleRewardStatus } from "../api/top-idle.api";
import { TopIdleVoteBadge } from "../TopIdleVoteBadge";
import {
  MEMBERSHIP_BENEFIT_LABELS,
  MEMBERSHIP_XP_BENEFIT_TOPICS,
} from "../constants/membership-benefits";
import type {
  StorefrontCatalogResponse,
  StorefrontCosmeticItem,
  StorefrontCosmeticType,
  StorefrontOffer,
  StorefrontOrderResponse,
  StorefrontProviderKey,
} from "../types/storefront.types";
import type { TopIdleRewardStatus } from "../types/top-idle.types";
import "../styles/membership.css";

type MembershipStoreTab = "premium" | "cash" | "packages";

interface MembershipTabDefinition {
  key: MembershipStoreTab;
  label: string;
  description: string;
  icon: LucideIcon;
  artwork?: string;
}

interface CosmeticGroupDefinition {
  type: StorefrontCosmeticType;
  label: string;
  icon: LucideIcon;
}

const MEMBERSHIP_TABS: MembershipTabDefinition[] = [
  {
    key: "premium",
    label: "Premium",
    description: "Plano e passe",
    icon: Crown,
  },
  {
    key: "cash",
    label: "Cash",
    description: "Recargas",
    icon: Coins,
    artwork: cashIcon,
  },
  {
    key: "packages",
    label: "Passes e pacotes",
    description: "Coleções",
    icon: PackageOpen,
    artwork: passesPackagesIcon,
  },
];

const COSMETIC_GROUPS: CosmeticGroupDefinition[] = [
  { type: "AVATAR", label: "Avatares", icon: UserRound },
  { type: "AVATAR_FRAME", label: "Moldura", icon: Frame },
  { type: "PROFILE_BANNER", label: "Cartão de perfil", icon: PanelsTopLeft },
  { type: "OVERVIEW_BACKGROUND", label: "Background", icon: ImageIcon },
  { type: "PROFILE_EFFECT", label: "Efeito", icon: Sparkles },
  { type: "TITLE", label: "Título", icon: BadgeCheck },
  { type: "BADGE", label: "Distintivo", icon: ShieldCheck },
];

function getMembershipPageError(error: unknown) {
  if (isAxiosError<{ message?: string | string[]; error?: string }>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(" ");
    if (typeof message === "string" && message.trim()) return message;

    const responseError = error.response?.data?.error;
    if (typeof responseError === "string" && responseError.trim()) {
      return responseError;
    }
  }
  if (error instanceof Error) return error.message;
  return "Não foi possível carregar a loja do abrigo.";
}

function formatPremiumUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function formatTopIdleAvailability(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatBrl(amountCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);
}

function getOfferTone(offer: StorefrontOffer) {
  if (offer.key === "pacote-nucleo-helix") return "helix";
  if (offer.key === "pacote-protocolo-carmesim") return "carmesim";
  return "premium";
}

function getItemsByType(
  items: StorefrontCosmeticItem[],
  type: StorefrontCosmeticType,
) {
  return items.filter((item) => item.type === type);
}

function PaymentProviderSelector({
  checkout,
  selectedProvider,
  onSelect,
}: {
  checkout: StorefrontCatalogResponse["checkout"];
  selectedProvider: StorefrontProviderKey | null;
  onSelect: (provider: StorefrontProviderKey) => void;
}) {
  const availableProviders = checkout.providers.filter(
    (provider) => provider.state === "AVAILABLE",
  );

  return (
    <section className="membership-payment-method" aria-label="Pagamento">
      <div className="membership-payment-method__label">
        {availableProviders.length > 0 ? (
          <CreditCard size={18} aria-hidden="true" />
        ) : (
          <LockKeyhole size={18} aria-hidden="true" />
        )}
        <span>
          <strong>Forma de pagamento</strong>
          <small>{checkout.message}</small>
        </span>
      </div>

      {availableProviders.length > 0 ? (
        <div
          className="membership-payment-method__options"
          role="radiogroup"
          aria-label="Escolha a forma de pagamento"
        >
          {availableProviders.map((provider) => (
            <button
              key={provider.key}
              type="button"
              role="radio"
              aria-checked={selectedProvider === provider.key}
              className={selectedProvider === provider.key ? "is-active" : ""}
              onClick={() => onSelect(provider.key)}
            >
              {provider.name}
            </button>
          ))}
        </div>
      ) : (
        <span className="membership-payment-method__locked">Em preparação</span>
      )}
    </section>
  );
}

function CheckoutStatusNotice({
  returnState,
  order,
  error,
}: {
  returnState: string | null;
  order: StorefrontOrderResponse | null;
  error: string | null;
}) {
  if (!returnState) return null;

  if (returnState === "cancelled") {
    return (
      <div className="membership-checkout-status is-neutral" role="status">
        <CircleAlert size={19} aria-hidden="true" />
        <span>
          <strong>Pagamento cancelado</strong>
          <small>Nenhuma cobrança ou entrega foi confirmada.</small>
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="membership-checkout-status is-error" role="alert">
        <CircleAlert size={19} aria-hidden="true" />
        <span>
          <strong>Não foi possível confirmar agora</strong>
          <small>{error}</small>
        </span>
      </div>
    );
  }

  if (order?.status === "FULFILLED") {
    return (
      <div className="membership-checkout-status is-success" role="status">
        <BadgeCheck size={19} aria-hidden="true" />
        <span>
          <strong>Pagamento confirmado</strong>
          <small>Compra entregue automaticamente à sua conta.</small>
        </span>
      </div>
    );
  }

  if (
    order &&
    ["FAILED", "EXPIRED", "REFUNDED", "CHARGEBACK_REVIEW"].includes(
      order.status,
    )
  ) {
    return (
      <div className="membership-checkout-status is-error" role="alert">
        <CircleAlert size={19} aria-hidden="true" />
        <span>
          <strong>Pagamento não concluído</strong>
          <small>O pedido não gerou uma entrega. Tente novamente.</small>
        </span>
      </div>
    );
  }

  return (
    <div className="membership-checkout-status is-pending" role="status">
      <LoaderCircle size={19} aria-hidden="true" />
      <span>
        <strong>Confirmando pagamento</strong>
        <small>A entrega ocorre após a confirmação do provedor.</small>
      </span>
    </div>
  );
}

function MembershipPurchaseButton({
  offer,
  checkoutEnabled,
  isCheckingOut,
  onCheckout,
  activeLabel,
}: {
  offer: StorefrontOffer;
  checkoutEnabled: boolean;
  isCheckingOut: boolean;
  onCheckout: (offer: StorefrontOffer) => void;
  activeLabel: string;
}) {
  const ownedLabel =
    offer.kind === "SUBSCRIPTION" ? "Premium ativo" : "Adquirido";

  return (
    <button
      type="button"
      className="membership-purchase-button"
      disabled={offer.ownership.isOwned || !checkoutEnabled || isCheckingOut}
      onClick={() => onCheckout(offer)}
      title={!checkoutEnabled ? "Disponível em breve" : undefined}
    >
      {offer.ownership.isOwned ? (
        <BadgeCheck size={17} aria-hidden="true" />
      ) : (
        <CreditCard size={17} aria-hidden="true" />
      )}
      {isCheckingOut
        ? "Abrindo checkout"
        : offer.ownership.isOwned
          ? ownedLabel
          : checkoutEnabled
            ? activeLabel
            : "Disponível em breve"}
    </button>
  );
}

function PremiumOptionCard({
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
  const isMonthlyPlan = offer.kind === "SUBSCRIPTION";
  const activeUntil = formatPremiumUntil(offer.ownership.activeUntil);

  return (
    <article
      className={`membership-premium-option${isMonthlyPlan ? " is-primary" : ""}`}
      style={{ "--offer-accent": offer.accentColor } as CSSProperties}
    >
      <div className="membership-premium-option__body">
        <header className="membership-premium-option__header">
          <PremiumPlaceholderIcon className="membership-premium-icon" />
          <div className="membership-premium-option__identity">
            <span className="membership-premium-option__eyebrow">
              {isMonthlyPlan ? "Plano mensal" : "Consumível de 30 dias"}
            </span>
            <h3>{offer.name}</h3>
            <span>{offer.billingLabel}</span>
          </div>
          <strong className="membership-premium-option__price">
            {offer.price.formatted}
          </strong>
        </header>

        <p>{offer.description}</p>

        <div className="membership-premium-option__activation">
          {isMonthlyPlan ? (
            <BadgeCheck size={19} aria-hidden="true" />
          ) : (
            <PackageOpen size={19} aria-hidden="true" />
          )}
          <span>
            <strong>
              {isMonthlyPlan
                ? "Ativação direta na conta"
                : "Consumível entregue na Mochila"}
            </strong>
            <small>
              {isMonthlyPlan
                ? "Renovação mensal até o cancelamento."
                : "Ative quando quiser, sem renovação automática."}
            </small>
          </span>
        </div>

        <div className="membership-premium-option__shared-benefits">
          <Check size={15} aria-hidden="true" />
          <span>Inclui todos os benefícios Premium acima</span>
        </div>

        {activeUntil ? <small>Ativo até {activeUntil}</small> : null}

        <MembershipPurchaseButton
          offer={offer}
          checkoutEnabled={checkoutEnabled}
          isCheckingOut={isCheckingOut}
          onCheckout={onCheckout}
          activeLabel={isMonthlyPlan ? "Assinar plano" : "Comprar passe"}
        />
      </div>
    </article>
  );
}

function PremiumBenefitTopic({
  icon: Icon,
  value,
  label,
  detail,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  detail: string;
}) {
  return (
    <article className="membership-premium-benefit">
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function TopIdleRewardBanner({ status }: { status: TopIdleRewardStatus }) {
  if (!status.enabled || !status.voteUrl) return null;

  const nextRewardAt = formatTopIdleAvailability(status.nextRewardAt);

  return (
    <section
      className="membership-topidle-reward"
      aria-labelledby="membership-topidle-title"
    >
      <PremiumPlaceholderIcon className="membership-topidle-reward__icon" />

      <div className="membership-topidle-reward__body">
        <span className="membership-eyebrow">1 dia de Premium</span>
        <h2 id="membership-topidle-title">
          Vote no Dead Idle e receba Premium
        </h2>
        <p>
          O benefício entra automaticamente na sua conta após um voto válido.
          Limite de uma recompensa a cada {status.reward.cooldownHours} horas.
        </p>
        {!status.canReceiveReward && nextRewardAt ? (
          <small>
            <Clock3 size={14} aria-hidden="true" />
            Próxima recompensa em {nextRewardAt}
          </small>
        ) : null}
      </div>

      {status.canReceiveReward ? (
        <TopIdleVoteBadge
          className="membership-topidle-reward__vote"
          href={status.voteUrl}
        />
      ) : (
        <span className="membership-topidle-reward__cooldown">
          <Check size={16} aria-hidden="true" />
          Recompensa recebida
        </span>
      )}
    </section>
  );
}

function CashOfferCard({
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
  const cashAmount = offer.cashAmount ?? 0;
  const regularCashAmount = Math.round(offer.price.amountCents / 100);
  const bonusCash = Math.max(0, cashAmount - regularCashAmount);

  return (
    <article
      className={`membership-cash-card membership-cash-card--${offer.key}${bonusCash > 0 ? " membership-cash-card--bonus" : ""}`}
      style={{ "--offer-accent": offer.accentColor } as CSSProperties}
    >
      <span className="membership-cash-card__eyebrow">{offer.eyebrow}</span>
      <div className="membership-cash-card__amount">
        <img src={cashIcon} alt="" aria-hidden="true" />
        <strong>{cashAmount}</strong>
        <span>Cash</span>
      </div>
      {bonusCash > 0 ? (
        <span className="membership-cash-card__bonus">
          +{bonusCash} Cash de bônus
        </span>
      ) : null}
      <div className="membership-cash-card__price">
        <strong>{offer.price.formatted}</strong>
        <span>{offer.billingLabel}</span>
      </div>
      <p>{offer.description}</p>
      <MembershipPurchaseButton
        offer={offer}
        checkoutEnabled={checkoutEnabled}
        isCheckingOut={isCheckingOut}
        onCheckout={onCheckout}
        activeLabel={`Comprar ${cashAmount} Cash`}
      />
    </article>
  );
}

const CUSTOM_CASH_SHORTCUTS = [5, 10, 25, 50] as const;

function CustomCashPurchase({
  offer,
  amount,
  checkoutEnabled,
  isCheckingOut,
  onAmountChange,
  onCheckout,
}: {
  offer: StorefrontOffer;
  amount: number;
  checkoutEnabled: boolean;
  isCheckingOut: boolean;
  onAmountChange: (amount: number) => void;
  onCheckout: (offer: StorefrontOffer, amount: number) => void;
}) {
  const limits = offer.customQuantity;
  if (!limits) return null;

  const clampAmount = (value: number) =>
    Math.min(limits.max, Math.max(limits.min, Math.trunc(value)));
  const total = amount * limits.unitPriceCents;

  return (
    <section
      className="membership-custom-cash"
      style={{ "--offer-accent": offer.accentColor } as CSSProperties}
      aria-labelledby="membership-custom-cash-title"
    >
      <header className="membership-custom-cash__header">
        <span className="membership-custom-cash__artwork" aria-hidden="true">
          <img src={cashIcon} alt="" />
        </span>
        <div>
          <span className="membership-eyebrow">Cash sob medida</span>
          <h2 id="membership-custom-cash-title">Digite quanto quer comprar</h2>
          <p>Escolha qualquer quantidade de 1 a 1.000 Cash por compra.</p>
        </div>
        <strong>R$ 1,00 <small>por Cash</small></strong>
      </header>

      <div className="membership-custom-cash__body">
        <div className="membership-custom-cash__shortcuts">
          <span>Atalhos</span>
          <div role="group" aria-label="Quantidades sugeridas">
            {CUSTOM_CASH_SHORTCUTS.filter(
              (value) => value >= limits.min && value <= limits.max,
            ).map((value) => (
              <button
                key={value}
                type="button"
                className={amount === value ? "is-active" : ""}
                onClick={() => onAmountChange(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <label className="membership-custom-cash__quantity">
          <span>Cash desejado</span>
          <div>
            <button
              type="button"
              aria-label="Diminuir quantidade"
              title="Diminuir"
              disabled={amount <= limits.min}
              onClick={() => onAmountChange(clampAmount(amount - 1))}
            >
              <Minus size={17} aria-hidden="true" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={limits.min}
              max={limits.max}
              step={1}
              value={amount}
              aria-label="Quantidade de Cash"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                onAmountChange(clampAmount(Number(event.currentTarget.value)))
              }
            />
            <button
              type="button"
              aria-label="Aumentar quantidade"
              title="Aumentar"
              disabled={amount >= limits.max}
              onClick={() => onAmountChange(clampAmount(amount + 1))}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
          </div>
        </label>

        <div className="membership-custom-cash__summary" aria-live="polite">
          <span>Você recebe</span>
          <strong>{amount} Cash</strong>
          <small>{formatBrl(total)}</small>
        </div>

        <button
          type="button"
          className="membership-purchase-button membership-custom-cash__checkout"
          disabled={!checkoutEnabled || isCheckingOut}
          onClick={() => onCheckout(offer, amount)}
        >
          {isCheckingOut ? (
            <LoaderCircle size={17} aria-hidden="true" />
          ) : (
            <CreditCard size={17} aria-hidden="true" />
          )}
          {isCheckingOut ? "Abrindo checkout" : `Comprar ${amount} Cash`}
        </button>
      </div>
    </section>
  );
}

function CashUse({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="membership-cash-use">
      <Icon size={19} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function PackagePreviewStrip({ items }: { items: StorefrontCosmeticItem[] }) {
  const avatars = getItemsByType(items, "AVATAR");
  const visibleAvatars = avatars.slice(0, 4);

  return (
    <div className="membership-package-preview" aria-label="Prévia de avatares">
      {visibleAvatars.map((avatar) => {
        const image = getCosmeticImage(avatar.assetKey);
        return (
          <span key={avatar.id}>
            {image ? <img src={image} alt="" /> : <UserRound size={20} />}
          </span>
        );
      })}
      {avatars.length > visibleAvatars.length ? (
        <em>+{avatars.length - visibleAvatars.length}</em>
      ) : null}
    </div>
  );
}

function StorefrontPackageCard({
  offer,
  checkoutEnabled,
  isCheckingOut,
  onCheckout,
  onOpenContents,
}: {
  offer: StorefrontOffer;
  checkoutEnabled: boolean;
  isCheckingOut: boolean;
  onCheckout: (offer: StorefrontOffer) => void;
  onOpenContents: (offer: StorefrontOffer) => void;
}) {
  const coverImage = getCosmeticImage(offer.collection?.coverAssetKey);
  const items = offer.collection?.items ?? [];
  const avatarCount = getItemsByType(items, "AVATAR").length;
  const profileItemCount = Math.max(0, items.length - avatarCount);

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
            <h3>{offer.name}</h3>
            <span>Desbloqueio permanente</span>
          </div>
          <strong>{offer.price.formatted}</strong>
        </header>

        <p>{offer.description}</p>

        <div className="membership-package-card__summary">
          <span>
            <UserRound size={15} aria-hidden="true" />
            {avatarCount} avatares
          </span>
          <span>
            <Sparkles size={15} aria-hidden="true" />
            {profileItemCount} itens de perfil
          </span>
          <span>
            <PackageOpen size={15} aria-hidden="true" />
            {items.length} itens
          </span>
        </div>

        <PackagePreviewStrip items={items} />

        <footer>
          <button
            type="button"
            className="membership-package-card__details-button"
            onClick={() => onOpenContents(offer)}
          >
            <PackageOpen size={16} aria-hidden="true" />
            Ver conteúdo
          </button>
          <MembershipPurchaseButton
            offer={offer}
            checkoutEnabled={checkoutEnabled}
            isCheckingOut={isCheckingOut}
            onCheckout={onCheckout}
            activeLabel="Comprar pacote"
          />
        </footer>
      </div>
    </article>
  );
}

function CosmeticItemPreview({ item }: { item: StorefrontCosmeticItem }) {
  const image = getCosmeticImage(item.assetKey);
  const group = COSMETIC_GROUPS.find(
    (candidate) => candidate.type === item.type,
  );
  const Icon = group?.icon ?? Sparkles;

  return (
    <article
      className={`membership-cosmetic-item membership-cosmetic-item--${item.type.toLowerCase()}`}
      style={{ "--cosmetic-accent": item.accentColor } as CSSProperties}
    >
      <div className="membership-cosmetic-item__visual" aria-hidden="true">
        {image ? <img src={image} alt="" /> : <Icon size={25} />}
      </div>
      <div>
        <strong>{item.displayText ?? item.name}</strong>
        <span>{item.class?.name ?? group?.label}</span>
      </div>
    </article>
  );
}

function PackageContentsModal({
  offer,
  onClose,
}: {
  offer: StorefrontOffer;
  onClose: () => void;
}) {
  const collection = offer.collection;
  const coverImage = getCosmeticImage(collection?.coverAssetKey);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!collection) return null;

  return createPortal(
    <div
      className="membership-package-modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="membership-package-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-package-modal-title"
      >
        <header className="membership-package-modal__header">
          <div
            className="membership-package-modal__cover"
            style={
              coverImage
                ? { backgroundImage: `url("${coverImage}")` }
                : undefined
            }
            aria-hidden="true"
          />
          <div>
            <span>{collection.items.length} itens permanentes</span>
            <h2 id="membership-package-modal-title">{offer.name}</h2>
            <p>{collection.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar conteúdo">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="membership-package-modal__content">
          {COSMETIC_GROUPS.map((group) => {
            const items = getItemsByType(collection.items, group.type);
            if (items.length === 0) return null;
            const Icon = group.icon;

            return (
              <section key={group.type} className="membership-cosmetic-group">
                <header>
                  <Icon size={17} aria-hidden="true" />
                  <h3>{group.label}</h3>
                  <span>{items.length}</span>
                </header>
                <div>
                  {items.map((item) => (
                    <CosmeticItemPreview key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function MembershipPage() {
  const { characterId } = useParams();
  const [searchParams] = useSearchParams();
  const safeCharacterId = characterId ?? "";
  const checkoutReturnState = searchParams.get("checkout");
  const checkoutOrderId = searchParams.get("orderId");
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [storefront, setStorefront] =
    useState<StorefrontCatalogResponse | null>(null);
  const [topIdleReward, setTopIdleReward] =
    useState<TopIdleRewardStatus | null>(null);
  const [activeTab, setActiveTab] = useState<MembershipStoreTab>("premium");
  const [selectedPackage, setSelectedPackage] =
    useState<StorefrontOffer | null>(null);
  const [checkingOutOfferKey, setCheckingOutOfferKey] = useState<string | null>(
    null,
  );
  const [customCashAmount, setCustomCashAmount] = useState(10);
  const [selectedProviderKey, setSelectedProviderKey] =
    useState<StorefrontProviderKey | null>(null);
  const [returnedOrder, setReturnedOrder] =
    useState<StorefrontOrderResponse | null>(null);
  const [checkoutReturnError, setCheckoutReturnError] = useState<{
    orderId: string;
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!safeCharacterId) return;

      try {
        setIsLoading(true);
        setErrorMessage(null);
        const [overviewResponse, storefrontResponse, topIdleResponse] =
          await Promise.all([
          getCharacterOverview(safeCharacterId),
          getStorefrontCatalog(safeCharacterId),
            getTopIdleRewardStatus().catch(() => null),
          ]);

        if (!isMounted) return;
        setCharacter(buildGatheringDashboardCharacter(overviewResponse));
        setStorefront(storefrontResponse);
        setTopIdleReward(topIdleResponse);
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

  useEffect(() => {
    if (!safeCharacterId || !topIdleReward?.enabled) return;

    let isMounted = true;
    async function refreshRewardAfterFocus() {
      try {
        const [rewardStatus, storefrontResponse] = await Promise.all([
          getTopIdleRewardStatus(),
          getStorefrontCatalog(safeCharacterId),
        ]);
        if (!isMounted) return;
        setTopIdleReward(rewardStatus);
        setStorefront(storefrontResponse);
      } catch {
        // O estado anterior continua válido até a próxima atualização.
      }
    }

    window.addEventListener("focus", refreshRewardAfterFocus);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshRewardAfterFocus);
    };
  }, [safeCharacterId, topIdleReward?.enabled]);

  const availableProviders = useMemo(
    () =>
      storefront?.checkout.providers.filter(
        (provider) => provider.state === "AVAILABLE",
      ) ?? [],
    [storefront],
  );

  useEffect(() => {
    if (
      !safeCharacterId ||
      !checkoutOrderId ||
      !checkoutReturnState ||
      checkoutReturnState === "cancelled"
    ) {
      return;
    }

    const orderId = checkoutOrderId;

    let isMounted = true;
    let timerId: number | undefined;
    let attempts = 0;

    async function refreshAfterDelivery() {
      const [overviewResponse, storefrontResponse] = await Promise.all([
        getCharacterOverview(safeCharacterId),
        getStorefrontCatalog(safeCharacterId),
      ]);
      if (!isMounted) return;
      setCharacter(buildGatheringDashboardCharacter(overviewResponse));
      setStorefront(storefrontResponse);
    }

    async function pollOrder() {
      try {
        const order = await getStorefrontOrder(orderId);
        if (!isMounted) return;

        setReturnedOrder(order);
        setCheckoutReturnError(null);

        if (order.status === "FULFILLED") {
          await refreshAfterDelivery();
          return;
        }

        if (
          [
            "FAILED",
            "EXPIRED",
            "CANCELLED",
            "REFUNDED",
            "CHARGEBACK_REVIEW",
          ].includes(order.status)
        ) {
          return;
        }

        attempts += 1;
        if (attempts >= 30) {
          setCheckoutReturnError({
            orderId,
            message:
              "A confirmação ainda está pendente. O pedido continuará sendo processado pelo servidor.",
          });
          return;
        }

        timerId = window.setTimeout(() => void pollOrder(), 2_000);
      } catch (error) {
        if (!isMounted) return;
        attempts += 1;
        if (attempts < 5) {
          timerId = window.setTimeout(() => void pollOrder(), 2_000);
          return;
        }
        setCheckoutReturnError({
          orderId,
          message: getMembershipPageError(error),
        });
      }
    }

    void pollOrder();

    return () => {
      isMounted = false;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [checkoutOrderId, checkoutReturnState, safeCharacterId]);

  const premiumOffers = useMemo(
    () =>
      storefront?.offers.filter(
        (offer) =>
          offer.kind === "SUBSCRIPTION" || offer.kind === "PREMIUM_ITEM",
      ) ?? [],
    [storefront],
  );
  const premiumPlan = premiumOffers.find(
    (offer) => offer.kind === "SUBSCRIPTION",
  );
  const cashOffers = useMemo(
    () =>
      storefront?.offers.filter((offer) => offer.kind === "CASH_PACKAGE") ?? [],
    [storefront],
  );
  const customCashOffer = cashOffers.find(
    (offer) => offer.key === "cash-custom",
  );
  const fixedCashOffers = cashOffers.filter(
    (offer) => offer.key !== "cash-custom",
  );
  const packageOffers = useMemo(
    () =>
      storefront?.offers.filter(
        (offer) => offer.kind === "PERMANENT_PACKAGE",
      ) ?? [],
    [storefront],
  );
  const checkoutProvider =
    availableProviders.find(
      (provider) => provider.key === selectedProviderKey,
    ) ?? availableProviders[0];
  const checkoutEnabled = Boolean(
    storefront?.checkout.enabled && checkoutProvider,
  );
  const premiumCosmeticCount = premiumPlan?.collection?.items.length ?? 0;

  async function handleCheckout(offer: StorefrontOffer, cashAmount?: number) {
    if (!checkoutEnabled || !checkoutProvider) return;
    setCheckingOutOfferKey(offer.key);
    setErrorMessage(null);
    try {
      const checkout = await createStorefrontCheckout({
        requestId: crypto.randomUUID(),
        characterId: safeCharacterId,
        offerKey: offer.key,
        provider: checkoutProvider.key,
        ...(cashAmount !== undefined ? { cashAmount } : {}),
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
          <span className="membership-eyebrow">Loja do Abrigo</span>
          <h1>Premium, Cash e pacotes</h1>
          <p>Escolha uma categoria e veja exatamente o que recebe.</p>
        </header>

        <CheckoutStatusNotice
          returnState={checkoutReturnState}
          order={returnedOrder?.id === checkoutOrderId ? returnedOrder : null}
          error={
            checkoutReturnError?.orderId === checkoutOrderId
              ? checkoutReturnError.message
              : null
          }
        />

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
                data-membership-tab={tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.key === "premium" ? (
                  <PremiumPlaceholderIcon className="membership-tab-premium-icon" />
                ) : tab.artwork ? (
                  <img
                    className="membership-tab-artwork"
                    src={tab.artwork}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <Icon size={19} aria-hidden="true" />
                )}
                <span>
                  <strong>{tab.label}</strong>
                  <small>{tab.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <PaymentProviderSelector
          checkout={storefront.checkout}
          selectedProvider={checkoutProvider?.key ?? null}
          onSelect={setSelectedProviderKey}
        />

        {activeTab === "premium" ? (
          <section
            id="membership-panel-premium"
            className="membership-tab-panel"
            role="tabpanel"
            aria-labelledby="membership-tab-premium"
          >
            <section
              className="membership-premium-benefits"
              aria-labelledby="membership-premium-benefits-title"
            >
              <header className="membership-premium-benefits__header">
                <PremiumPlaceholderIcon className="membership-premium-benefits__icon" />
                <div>
                  <span className="membership-eyebrow">
                    Incluído no plano e no passe
                  </span>
                  <h2 id="membership-premium-benefits-title">
                    Mais EXP e o dobro de progresso idle
                  </h2>
                  <p>
                    As duas opções ativam exatamente os mesmos benefícios em
                    toda a conta.
                  </p>
                </div>
              </header>

              <div className="membership-premium-benefits__grid">
                {MEMBERSHIP_XP_BENEFIT_TOPICS.map((benefit) => {
                  const Icon =
                    benefit.key === "character"
                      ? Swords
                      : benefit.key === "tracking"
                        ? Radar
                        : benefit.key === "expeditions"
                          ? Pickaxe
                          : Hammer;

                  return (
                    <PremiumBenefitTopic
                      key={benefit.key}
                      icon={Icon}
                      value={MEMBERSHIP_BENEFIT_LABELS.xpBonus}
                      label={benefit.label}
                      detail={benefit.detail}
                    />
                  );
                })}
                <PremiumBenefitTopic
                  icon={Clock3}
                  value={MEMBERSHIP_BENEFIT_LABELS.premiumIdleLimit}
                  label="de progresso idle"
                  detail={`Conta gratuita: ${MEMBERSHIP_BENEFIT_LABELS.freeIdleLimit}`}
                />
                <PremiumBenefitTopic
                  icon={Sparkles}
                  value={String(premiumCosmeticCount)}
                  label="cosméticos Premium"
                  detail="Coleção Último Abrigo enquanto ativo"
                />
                <PremiumBenefitTopic
                  icon={ShieldCheck}
                  value="Toda a conta"
                  label="um Premium para todos"
                  detail="Válido para todos os personagens"
                />
              </div>
            </section>

            <header className="membership-section-heading">
              <div>
                <span className="membership-eyebrow">Comprar Premium</span>
                <h2>Escolha a forma de ativação</h2>
              </div>
              <p>Os benefícios são iguais. Muda apenas como você ativa.</p>
            </header>

            <div className="membership-premium-options">
              {premiumOffers.map((offer) => (
                <PremiumOptionCard
                  key={offer.key}
                  offer={offer}
                  checkoutEnabled={checkoutEnabled}
                  isCheckingOut={checkingOutOfferKey === offer.key}
                  onCheckout={(selectedOffer) =>
                    void handleCheckout(selectedOffer)
                  }
                />
              ))}
            </div>

            {topIdleReward ? (
              <TopIdleRewardBanner status={topIdleReward} />
            ) : null}
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
                <span className="membership-eyebrow">Comprar Cash</span>
                <h2>Escolha sua recarga</h2>
              </div>
              <p>Crédito aplicado ao personagem selecionado.</p>
            </header>

            {customCashOffer ? (
              <CustomCashPurchase
                offer={customCashOffer}
                amount={customCashAmount}
                checkoutEnabled={checkoutEnabled}
                isCheckingOut={checkingOutOfferKey === customCashOffer.key}
                onAmountChange={setCustomCashAmount}
                onCheckout={(selectedOffer, amount) =>
                  void handleCheckout(selectedOffer, amount)
                }
              />
            ) : null}

            <header className="membership-cash-packages-heading">
              <span className="membership-eyebrow">Pacotes com bônus</span>
              <h2>Quanto maior o pacote, maior o bônus</h2>
            </header>

            <div className="membership-cash-grid">
              {fixedCashOffers.map((offer) => (
                <CashOfferCard
                  key={offer.key}
                  offer={offer}
                  checkoutEnabled={checkoutEnabled}
                  isCheckingOut={checkingOutOfferKey === offer.key}
                  onCheckout={(selectedOffer) =>
                    void handleCheckout(selectedOffer)
                  }
                />
              ))}
            </div>

            <section className="membership-cash-uses" aria-label="Uso do Cash">
              <header>
                <span className="membership-eyebrow">Uso do saldo</span>
                <h2>O que pode ser comprado com Cash</h2>
              </header>
              <div>
                <CashUse
                  icon={UserRound}
                  title="Avatares"
                  detail="Retratos permanentes"
                />
                <CashUse
                  icon={ImageIcon}
                  title="Backgrounds"
                  detail="Perfil e visão geral"
                />
                <CashUse
                  icon={Frame}
                  title="Molduras e efeitos"
                  detail="Personalização visual"
                />
                <CashUse
                  icon={Gauge}
                  title="Aceleradores"
                  detail="Itens temporários"
                />
              </div>
            </section>
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
                <span className="membership-eyebrow">Passes e pacotes</span>
                <h2>Pacotes permanentes</h2>
              </div>
              <p>Abra o conteúdo para conferir todos os itens.</p>
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
                  onOpenContents={setSelectedPackage}
                />
              ))}
            </div>
          </section>
        ) : null}

        {errorMessage ? (
          <p className="membership-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </main>

      {selectedPackage ? (
        <PackageContentsModal
          offer={selectedPackage}
          onClose={() => setSelectedPackage(null)}
        />
      ) : null}
    </DashboardLayout>
  );
}
