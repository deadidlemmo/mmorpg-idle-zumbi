import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, Crown, X } from "lucide-react";
import { useAuthStore } from "../../store/auth.store";
import { getTopIdleRewardStatus } from "./api/top-idle.api";
import type { TopIdleRewardStatus } from "./types/top-idle.types";
import { TopIdleVoteBadge } from "./TopIdleVoteBadge";

function formatNextRewardAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function TopIdleLoginPrompt() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loginEventId = useAuthStore((state) => state.loginEventId);
  const [status, setStatus] = useState<TopIdleRewardStatus | null>(null);
  const [visibleForLogin, setVisibleForLogin] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || loginEventId <= 0) {
      return;
    }

    let isMounted = true;

    async function loadRewardStatus() {
      try {
        const rewardStatus = await getTopIdleRewardStatus();
        if (!isMounted) return;

        if (!rewardStatus.enabled || !rewardStatus.voteUrl) {
          setStatus(null);
          setVisibleForLogin(null);
          return;
        }

        setStatus(rewardStatus);
        setVisibleForLogin(loginEventId);
      } catch {
        if (!isMounted) return;
        setStatus(null);
        setVisibleForLogin(null);
      }
    }

    void loadRewardStatus();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, loginEventId]);

  useEffect(() => {
    if (visibleForLogin === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setVisibleForLogin(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visibleForLogin]);

  if (
    !isAuthenticated ||
    !status ||
    visibleForLogin !== loginEventId ||
    !status.voteUrl
  ) {
    return null;
  }

  const nextRewardAt = formatNextRewardAt(status.nextRewardAt);

  return createPortal(
    <div
      className="topidle-login-notification"
      aria-live="polite"
      aria-atomic="true"
    >
      <aside
        className={`topidle-login-card ${
          status.canReceiveReward ? "is-available" : "is-waiting"
        }`}
        aria-labelledby="topidle-login-title"
      >
        <button
          type="button"
          className="topidle-login-card__close"
          aria-label="Fechar aviso do TopIdle"
          title="Fechar"
          onClick={() => setVisibleForLogin(null)}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="topidle-login-card__heading">
          <span className="topidle-login-card__icon" aria-hidden="true">
            <Crown size={21} />
          </span>
          <div>
            <span>Recompensa por voto</span>
            <h2 id="topidle-login-title">
              {status.canReceiveReward
                ? `Ganhe ${status.reward.premiumDays} dia de Premium`
                : "Recompensa já recebida"}
            </h2>
          </div>
        </div>

        <p>
          {status.canReceiveReward
            ? "Vote no Dead Idle e o Premium será adicionado automaticamente à sua conta."
            : "Seu voto deste período já foi recompensado. Você poderá receber novamente no próximo intervalo."}
        </p>

        {status.canReceiveReward ? (
          <TopIdleVoteBadge
            href={status.voteUrl}
            className="topidle-login-card__vote"
            onClick={() => setVisibleForLogin(null)}
          />
        ) : (
          <span className="topidle-login-card__cooldown">
            <Clock3 size={15} aria-hidden="true" />
            {nextRewardAt
              ? `Disponível em ${nextRewardAt}`
              : `Uma recompensa a cada ${status.reward.cooldownHours} horas`}
          </span>
        )}
      </aside>
    </div>,
    document.body,
  );
}
