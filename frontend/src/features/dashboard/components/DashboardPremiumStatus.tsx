import { useEffect, useState } from "react";
import { PremiumPlaceholderIcon } from "../../../components/PremiumPlaceholderIcon";
import { buildPremiumTimePresentation } from "../utils/premium-time";

type DashboardPremiumStatusProps = {
  premiumUntil?: string | null;
};

export function DashboardPremiumStatus({
  premiumUntil,
}: DashboardPremiumStatusProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const presentation = buildPremiumTimePresentation(premiumUntil, nowMs);

  return (
    <div
      className={`dashboard-premium-status ${
        presentation.isActive ? "is-active" : "is-inactive"
      }`}
      aria-live="polite"
      role="status"
    >
      <PremiumPlaceholderIcon className="dashboard-premium-status__icon" />

      <div className="dashboard-premium-status__summary">
        <span className="dashboard-premium-status__state">
          <i aria-hidden="true" />
          {presentation.isActive ? "Premium ativo" : "Premium inativo"}
        </span>
        <strong>{presentation.remainingLabel}</strong>
      </div>

      <div className="dashboard-premium-status__expiration">
        <span>{presentation.isActive ? "Validade" : "Situação"}</span>
        <strong>
          {presentation.expirationLabel
            ? `Até ${presentation.expirationLabel}`
            : "Sem prazo ativo"}
        </strong>
      </div>
    </div>
  );
}
