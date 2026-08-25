import {
  ArrowRightLeft,
  Biohazard,
  Dna,
  FlaskConical,
  Ticket,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import { PetIncubatorPanel } from "../../pets/components/PetIncubatorPanel";
import { EconomyExchangePanel } from "../components/EconomyExchangePanel";
import type { EconomyCurrency } from "../types/economy.types";
import "../../dashboard/dashboard.css";
import "../styles/resource-center.css";

type ResourceCenterTab = "exchanges" | "incubator";

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
          setError("Não foi possível carregar a Central de recursos.");
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
  const activeTab: ResourceCenterTab =
    searchParams.get("tab") === "incubator" ? "incubator" : "exchanges";
  const currency: EconomyCurrency =
    searchParams.get("currency") === "WORLD_BOSS_FRAGMENT"
      ? "WORLD_BOSS_FRAGMENT"
      : "INCURSION_TOKEN";

  const pageContext = useMemo(() => {
    if (activeTab === "incubator") {
      return {
        eyebrow: "Biotecnologia do abrigo",
        title: "Incubadora",
        description: "Casulos em processamento e companheiros recuperados.",
      };
    }
    return {
      eyebrow: "Logística do abrigo",
      title: "Central de trocas",
      description: "Destino para fichas de incursão e fragmentos de ameaça.",
    };
  }, [activeTab]);

  function updateQuery(
    updates: Partial<{
      tab: ResourceCenterTab;
      currency: EconomyCurrency;
      tier: number;
    }>,
  ) {
    const next = new URLSearchParams(searchParams);
    if (updates.tab) next.set("tab", updates.tab);
    if (updates.currency) next.set("currency", updates.currency);
    if (updates.tier) next.set("tier", String(updates.tier));
    setSearchParams(next, { replace: true });
  }

  if (!characterId) return <Navigate to="/characters" replace />;

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando Central de recursos...</span>
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
            {activeTab === "incubator" ? (
              <FlaskConical size={28} />
            ) : (
              <ArrowRightLeft size={28} />
            )}
          </span>
          <div>
            <small>{pageContext.eyebrow}</small>
            <h1>{pageContext.title}</h1>
            <p>{pageContext.description}</p>
          </div>
          <span className="resource-center-header__context">
            <small>{character.currentMap?.name ?? "Abrigo"}</small>
            <strong>Tier {selectedTier}</strong>
          </span>
        </header>

        <nav className="resource-center-tabs" aria-label="Central de recursos">
          <button
            type="button"
            className={activeTab === "exchanges" ? "is-active" : ""}
            onClick={() => updateQuery({ tab: "exchanges" })}
            aria-current={activeTab === "exchanges" ? "page" : undefined}
          >
            <ArrowRightLeft size={17} />
            Trocas
          </button>
          <button
            type="button"
            className={activeTab === "incubator" ? "is-active" : ""}
            onClick={() => updateQuery({ tab: "incubator" })}
            aria-current={activeTab === "incubator" ? "page" : undefined}
          >
            <Dna size={17} />
            Incubadora
          </button>
        </nav>

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

        {activeTab === "exchanges" ? (
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
                  <small>Casulos e recuperação</small>
                </span>
              </button>
            </nav>

            <EconomyExchangePanel
              characterId={characterId}
              tier={selectedTier}
              currency={currency}
            />
          </div>
        ) : (
          <PetIncubatorPanel characterId={characterId} tier={selectedTier} />
        )}
      </section>
    </DashboardLayout>
  );
}
