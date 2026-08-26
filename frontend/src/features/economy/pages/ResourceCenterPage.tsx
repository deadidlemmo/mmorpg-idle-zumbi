import {
  ArrowUpRight,
  ArrowRightLeft,
  Biohazard,
  Hammer,
  Ticket,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import { EconomyExchangePanel } from "../components/EconomyExchangePanel";
import type { EconomyCurrency } from "../types/economy.types";
import "../../dashboard/dashboard.css";
import "../styles/resource-center.css";

const TIERS = [1, 2, 3, 4, 5] as const;

function clampTier(value: number) {
  return Math.min(5, Math.max(1, Math.floor(value)));
}

function getRequestedTier(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampTier(parsed) : clampTier(fallback);
}

export function ResourceCenterPage() {
  const { characterId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!characterId) return;
    let disposed = false;

    void getCharacterOverview(characterId)
      .then((overview) => {
        if (disposed) return;
        setCharacter(buildGatheringDashboardCharacter(overview));
        setError(null);
      })
      .catch(() => {
        if (!disposed) {
          setError("Não foi possível carregar a Central de trocas.");
        }
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [characterId]);

  const mapTier = clampTier(character?.currentMap?.tier ?? 1);
  const selectedTier = getRequestedTier(searchParams.get("tier"), mapTier);
  const currency: EconomyCurrency =
    searchParams.get("currency") === "WORLD_BOSS_FRAGMENT"
      ? "WORLD_BOSS_FRAGMENT"
      : "INCURSION_TOKEN";

  function updateQuery(
    updates: Partial<{
      currency: EconomyCurrency;
      tier: number;
    }>,
  ) {
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    if (updates.currency) next.set("currency", updates.currency);
    if (updates.tier) next.set("tier", String(updates.tier));
    setSearchParams(next, { replace: true });
  }

  if (!characterId) return <Navigate to="/characters" replace />;

  if (searchParams.get("tab") === "incubator") {
    const legacyTier = getRequestedTier(searchParams.get("tier"), 1);
    return (
      <Navigate
        to={`/dashboard/${characterId}/pets?tier=${legacyTier}`}
        replace
      />
    );
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando Central de trocas...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Central indisponível</h1>
        <p>{error ?? "Não foi possível carregar este personagem."}</p>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="resource-center-page">
        <header className="resource-center-header">
          <span className="resource-center-header__mark" aria-hidden="true">
            <ArrowRightLeft size={28} />
          </span>
          <div>
            <small>Logística do abrigo</small>
            <h1>Central de trocas</h1>
            <p>Destino para fichas de incursão e fragmentos de ameaça.</p>
          </div>
          <span className="resource-center-header__context">
            <small>{character.currentMap?.name ?? "Abrigo"}</small>
            <strong>Tier {selectedTier}</strong>
          </span>
        </header>

        <div className="resource-center-tierbar">
          <span>Tier</span>
          <div className="resource-center-tierbar__options" role="group">
            {TIERS.map((tier) => (
              <button
                type="button"
                key={tier}
                className={selectedTier === tier ? "is-active" : ""}
                onClick={() => updateQuery({ tier })}
                aria-pressed={selectedTier === tier}
              >
                T{tier}
              </button>
            ))}
          </div>
        </div>

        <Link
          className="resource-center-workshop-link"
          to={`/dashboard/${characterId}/equipment`}
        >
          <span aria-hidden="true">
            <Hammer size={18} />
          </span>
          <span>
            <small>Equipamentos +1 a +3</small>
            <strong>Oficina de reforço</strong>
          </span>
          <span>
            Aplicar fragmentos
            <ArrowUpRight size={15} aria-hidden="true" />
          </span>
        </Link>

        <div className="resource-center-exchange-layout">
          <nav
            className="resource-center-currencies"
            aria-label="Origem da moeda"
          >
            <button
              type="button"
              className={currency === "INCURSION_TOKEN" ? "is-active" : ""}
              onClick={() => updateQuery({ currency: "INCURSION_TOKEN" })}
            >
              <Ticket size={19} />
              <span>
                <strong>Fichas de incursão</strong>
                <small>Reforços e contingência</small>
              </span>
            </button>
            <button
              type="button"
              className={
                currency === "WORLD_BOSS_FRAGMENT" ? "is-active" : ""
              }
              onClick={() => updateQuery({ currency: "WORLD_BOSS_FRAGMENT" })}
            >
              <Biohazard size={19} />
              <span>
                <strong>Fragmentos de ameaça</strong>
                <small>Materiais de contingência</small>
              </span>
            </button>
          </nav>

          <EconomyExchangePanel
            characterId={characterId}
            tier={selectedTier}
            currency={currency}
          />
        </div>
      </section>
    </DashboardLayout>
  );
}
