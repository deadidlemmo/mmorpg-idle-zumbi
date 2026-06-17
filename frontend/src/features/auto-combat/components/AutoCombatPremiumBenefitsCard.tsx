import { Link } from "react-router-dom";
import { ActivityProgressCard } from "../../../components/game/ActivityProgressCard";
import { PremiumPlaceholderIcon } from "../../../components/PremiumPlaceholderIcon";
import { MEMBERSHIP_BENEFIT_LABELS } from "../../membership/constants/membership-benefits";

type AutoCombatPremiumBenefitsCardProps = {
  isPremiumActive?: boolean;
  membershipHref: string;
  premiumBonusXp?: number | null;
  premiumPotentialBonusXp?: number | null;
  totalXpGained?: number | null;
};

const xpFormatter = new Intl.NumberFormat("pt-BR");

function toXpValue(value?: number | null) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.floor(parsed));
}

function formatXp(value: number) {
  return xpFormatter.format(value);
}

export function AutoCombatPremiumBenefitsCard({
  isPremiumActive = false,
  membershipHref,
  premiumBonusXp = 0,
  premiumPotentialBonusXp = 0,
  totalXpGained = 0,
}: AutoCombatPremiumBenefitsCardProps) {
  const safePremiumBonusXp = toXpValue(premiumBonusXp);
  const safePremiumPotentialBonusXp = toXpValue(premiumPotentialBonusXp);
  const safeTotalXpGained = toXpValue(totalXpGained);
  const visiblePremiumXp = isPremiumActive
    ? safePremiumBonusXp
    : safePremiumPotentialBonusXp;

  const premiumStatusLabel = isPremiumActive ? "Ativo" : "Bloqueado";
  const premiumBonusLabel =
    visiblePremiumXp > 0
      ? isPremiumActive
        ? `+${formatXp(visiblePremiumXp)} EXP`
        : `+${formatXp(visiblePremiumXp)} EXP bloqueado`
      : safeTotalXpGained > 0
        ? isPremiumActive
          ? "Bonus ativo"
          : "Bonus bloqueado"
        : "Ao receber EXP";
  const note = isPremiumActive
    ? "O backend aplica automaticamente os bonus elegiveis em EXP e tempo idle."
    : "Conta Free: beneficios Premium bloqueados. Clique para ver os beneficios.";
  const xpBenefitLabel = isPremiumActive
    ? `EXP ${MEMBERSHIP_BENEFIT_LABELS.xpBonus}`
    : `EXP ${MEMBERSHIP_BENEFIT_LABELS.xpBonus}`;
  const idleBenefitLabel = isPremiumActive
    ? `Idle ${MEMBERSHIP_BENEFIT_LABELS.premiumIdleLimit}`
    : `Idle ${MEMBERSHIP_BENEFIT_LABELS.premiumIdleLimit}`;

  return (
    <ActivityProgressCard
      as="aside"
      className={[
        "auto-combat-hunt-skill-card--side-panel",
        "auto-combat-premium-benefits",
        isPremiumActive
          ? "auto-combat-premium-benefits--active"
          : "auto-combat-premium-benefits--locked",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        isPremiumActive
          ? "Beneficios premium ativos no AutoCombat"
          : "Beneficios premium bloqueados no AutoCombat"
      }
      cardTitle={note}
      label="Premium"
      badge={premiumStatusLabel}
      icon={<PremiumPlaceholderIcon className="auto-combat-premium-benefits__symbol" />}
      progressPercent={100}
      classNames={{
        body: "auto-combat-premium-benefits__body",
        heading: "auto-combat-premium-benefits__heading",
        icon: "auto-combat-premium-benefits__icon",
        pills: "auto-combat-premium-benefits__pills",
        top: "auto-combat-premium-benefits__top",
        track: "auto-combat-premium-benefits__track",
      }}
      pills={[
        { content: xpBenefitLabel, key: "xp" },
        { content: premiumBonusLabel, key: "trigger" },
        { content: idleBenefitLabel, key: "idle" },
      ]}
      overlay={
        !isPremiumActive ? (
          <Link
            className="auto-combat-premium-benefits__overlay"
            to={membershipHref}
            aria-label="Ver beneficios Premium"
            title={note}
          />
        ) : null
      }
    />
  );
}
