import { Link } from "react-router-dom";
import { PremiumPlaceholderIcon } from "../../../components/PremiumPlaceholderIcon";

type AutoCombatPremiumRewardBreakdownVariant = "summary" | "feedback";

type AutoCombatPremiumRewardBreakdownProps = {
  baseXp: number;
  totalXp: number;
  premiumBonusXp?: number | null;
  premiumPotentialBonusXp?: number | null;
  premiumTotalXp?: number | null;
  isPremiumActive?: boolean | null;
  membershipHref?: string;
  showCta?: boolean;
  variant?: AutoCombatPremiumRewardBreakdownVariant;
  className?: string;
};

const xpFormatter = new Intl.NumberFormat("pt-BR");

function toXpValue(value?: number | null) {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(numericValue));
}

function formatXp(value: number) {
  return xpFormatter.format(value);
}

export function AutoCombatPremiumRewardBreakdown({
  baseXp,
  totalXp,
  premiumBonusXp = 0,
  premiumPotentialBonusXp = 0,
  premiumTotalXp,
  isPremiumActive = false,
  membershipHref,
  showCta = true,
  variant = "summary",
  className = "",
}: AutoCombatPremiumRewardBreakdownProps) {
  const safeBaseXp = toXpValue(baseXp);
  const safeTotalXp = toXpValue(totalXp);
  const safePremiumBonusXp = toXpValue(premiumBonusXp);
  const safePremiumPotentialBonusXp = toXpValue(premiumPotentialBonusXp);
  const safePremiumDeltaXp = isPremiumActive
    ? safePremiumBonusXp
    : safePremiumPotentialBonusXp;
  const safePremiumTotalXp = Math.max(
    toXpValue(premiumTotalXp),
    safeBaseXp + safePremiumDeltaXp,
    safeTotalXp,
  );
  const hasPremiumValue =
    safePremiumDeltaXp > 0 || safePremiumTotalXp > safeTotalXp;

  if (safeTotalXp <= 0 && safeBaseXp <= 0 && !hasPremiumValue) {
    return null;
  }

  const isFeedback = variant === "feedback";
  const rootClassName = [
    "auto-combat-premium-reward",
    `auto-combat-premium-reward--${variant}`,
    isPremiumActive
      ? "auto-combat-premium-reward--active"
      : "auto-combat-premium-reward--locked",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const headline = `+${formatXp(safeTotalXp)} EXP recebida`;
  const badgeText = isPremiumActive ? "Premium ativo" : "Premium disponível";
  const bonusLabel = isPremiumActive
    ? isFeedback
      ? "Premium"
      : "Bônus Premium"
    : isFeedback
      ? "Perdida"
      : "Bônus perdido";
  const totalLabel = isPremiumActive
    ? isFeedback
      ? "Total"
      : "Total recebido"
    : isFeedback
      ? "Com Premium"
      : "Com Premium";
  const baseLabel = isPremiumActive
    ? isFeedback
      ? "Base"
      : "EXP Base"
    : isFeedback
      ? "Recebida"
      : "EXP recebida";
  const totalDisplayXp = isPremiumActive ? safeTotalXp : safePremiumTotalXp;
  const showFreeMessage = !isPremiumActive && safePremiumDeltaXp > 0;
  const showPremiumMessage = isPremiumActive && safePremiumDeltaXp > 0;

  return (
    <div
      className={rootClassName}
      role={isFeedback ? "status" : undefined}
      aria-live={isFeedback ? "polite" : undefined}
    >
      <div className="auto-combat-premium-reward__header">
        <span className="auto-combat-premium-reward__badge">
          <PremiumPlaceholderIcon className="auto-combat-premium-reward__icon" />
          {badgeText}
        </span>

        <strong className="auto-combat-premium-reward__headline">
          {headline}
        </strong>
      </div>

      <div className="auto-combat-premium-reward__metrics">
        <span>
          <small>{baseLabel}</small>
          <strong>{formatXp(isPremiumActive ? safeBaseXp : safeTotalXp)}</strong>
        </span>

        <span className="auto-combat-premium-reward__metric--premium">
          <small>{bonusLabel}</small>
          <strong>+{formatXp(safePremiumDeltaXp)}</strong>
        </span>

        <span>
          <small>{totalLabel}</small>
          <strong>{formatXp(totalDisplayXp)}</strong>
        </span>
      </div>

      {showPremiumMessage ? (
        <p className="auto-combat-premium-reward__note">
          Bônus Premium aplicado nesta recompensa.
        </p>
      ) : null}

      {showFreeMessage ? (
        <p className="auto-combat-premium-reward__note">
          Você deixou de ganhar{" "}
          <strong>+{formatXp(safePremiumDeltaXp)} EXP</strong>.
        </p>
      ) : null}

      {!isPremiumActive && showCta && membershipHref ? (
        <Link className="auto-combat-premium-reward__cta" to={membershipHref}>
          Ver benefícios Premium
        </Link>
      ) : null}
    </div>
  );
}
