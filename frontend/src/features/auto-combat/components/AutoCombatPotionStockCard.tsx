import { FlaskConical, Settings2 } from "lucide-react";
import { ActivityProgressCard } from "../../../components/game/ActivityProgressCard";

type AutoCombatPotionStockCardProps = {
  disabled?: boolean;
  enabled: boolean;
  healLabel?: string | null;
  imageUrl?: string | null;
  isBeingUsed?: boolean;
  onConfigure: () => void;
  potionName?: string | null;
  remainingQuantity: number;
  triggerPercent?: number | null;
  usedInSession: number;
};

function normalizeCount(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.floor(value));
}

export function AutoCombatPotionStockCard({
  disabled = false,
  enabled,
  healLabel,
  imageUrl,
  isBeingUsed = false,
  onConfigure,
  potionName,
  remainingQuantity,
  triggerPercent,
  usedInSession,
}: AutoCombatPotionStockCardProps) {
  const isConfigured = Boolean(potionName);
  const quantity = normalizeCount(remainingQuantity);
  const used = normalizeCount(usedInSession);
  const hasStock = quantity > 0;
  const isReady = isConfigured && enabled && hasStock;
  const normalizedTrigger =
    triggerPercent !== null &&
    triggerPercent !== undefined &&
    Number.isFinite(triggerPercent)
      ? Math.max(1, Math.min(100, Math.round(triggerPercent)))
      : null;

  const badge = !isConfigured
    ? "Vazia"
    : !enabled
      ? "Inativa"
      : hasStock
        ? `x${quantity}`
        : "Sem estoque";
  const title = !isConfigured ? "Nenhuma poção configurada" : potionName;
  const cardTitle = !isConfigured
    ? "Configure uma poção para uso automático durante as batalhas."
    : !enabled
      ? "A poção está configurada, mas o uso no autocombate está desativado."
      : !hasStock
        ? "O estoque desta poção acabou."
        : `${quantity} poções disponíveis para uso automático.`;

  const pills = isConfigured
    ? [
        {
          content: healLabel || "Cura configurada",
          key: "heal",
        },
        {
          content:
            normalizedTrigger !== null
              ? `Até ${normalizedTrigger}% HP`
              : "Gatilho automático",
          key: "trigger",
        },
        {
          content: `${used} ${used === 1 ? "usada" : "usadas"}`,
          key: "used",
        },
      ]
    : [
        {
          content: "Escolher poção",
          key: "configure",
        },
      ];

  return (
    <ActivityProgressCard
      as="aside"
      ariaLabel={`Poção automática: ${title}. ${badge}.`}
      badge={<span aria-live="polite">{badge}</span>}
      badgeClassName="auto-combat-potion-stock-card__badge"
      cardTitle={cardTitle}
      className={[
        "auto-combat-hunt-skill-card--side-panel",
        "auto-combat-potion-stock-card",
        isReady ? "auto-combat-potion-stock-card--ready" : "",
        isConfigured && enabled && !hasStock
          ? "auto-combat-potion-stock-card--depleted"
          : "",
        !isConfigured ? "auto-combat-potion-stock-card--empty" : "",
        isConfigured && !enabled
          ? "auto-combat-potion-stock-card--disabled"
          : "",
        isBeingUsed ? "auto-combat-potion-stock-card--using" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      classNames={{
        body: "auto-combat-potion-stock-card__body",
        heading: "auto-combat-potion-stock-card__heading",
        icon: "auto-combat-potion-stock-card__icon",
        pills: "auto-combat-potion-stock-card__pills",
        top: "auto-combat-potion-stock-card__top",
        track: "auto-combat-potion-stock-card__track",
      }}
      controls={
        <button
          type="button"
          className="auto-combat-potion-stock-card__configure"
          aria-label="Configurar poção automática"
          disabled={disabled}
          onClick={onConfigure}
          title="Configurar poção automática"
        >
          <Settings2 size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>
      }
      icon={
        imageUrl ? (
          <img src={imageUrl} alt="" decoding="async" />
        ) : (
          <FlaskConical size={34} strokeWidth={1.7} aria-hidden="true" />
        )
      }
      label={title}
      pills={pills}
      progressPercent={isReady ? 100 : 0}
    />
  );
}
