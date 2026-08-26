import { Biohazard, PawPrint } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { DashboardCharacterViewModel } from "../../dashboard/types/dashboard.types";
import { buildGatheringDashboardCharacter } from "../../gathering/utils/gathering-dashboard-character";
import { PetIncubatorPanel } from "../components/PetIncubatorPanel";
import "../../dashboard/dashboard.css";
import "../styles/pets-page.css";

const TIERS = [1, 2, 3, 4, 5] as const;

function clampTier(value: number) {
  return Math.min(5, Math.max(1, Math.floor(value)));
}

function getRequestedTier(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampTier(parsed) : clampTier(fallback);
}

export function PetsPage() {
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
          setError("Não foi possível carregar os companheiros.");
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

  function selectTier(tier: number) {
    const next = new URLSearchParams(searchParams);
    next.set("tier", String(tier));
    setSearchParams(next, { replace: true });
  }

  if (!characterId) return <Navigate to="/characters" replace />;

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando companheiros...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Companheiros indisponíveis</h1>
        <p>{error ?? "Não foi possível carregar este personagem."}</p>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="pets-page">
        <header className="pets-page__header">
          <span className="pets-page__header-mark" aria-hidden="true">
            <PawPrint size={27} />
          </span>
          <div>
            <small>Vínculos do sobrevivente</small>
            <h1>Companheiros</h1>
            <p>Coleção, equipamento e incubação.</p>
          </div>
          <span className="pets-page__header-context">
            <small>{character.currentMap?.name ?? "Abrigo"}</small>
            <strong>Tier {selectedTier}</strong>
          </span>
        </header>

        <div className="pets-page__toolbar">
          <div className="pets-page__tierbar">
            <span>Tier</span>
            <div className="pets-page__tier-options" role="group">
              {TIERS.map((tier) => (
                <button
                  type="button"
                  key={tier}
                  className={selectedTier === tier ? "is-active" : ""}
                  onClick={() => selectTier(tier)}
                  aria-pressed={selectedTier === tier}
                >
                  T{tier}
                </button>
              ))}
            </div>
          </div>

          <aside
            className="pets-page__drop-source"
            aria-label="Origem dos casulos"
          >
            <Biohazard size={18} aria-hidden="true" />
            <span>
              <small>Origem dos casulos</small>
              <strong>Ameaças Globais</strong>
            </span>
            <p>Drop de Ameaça Global</p>
          </aside>
        </div>

        <PetIncubatorPanel
          key={selectedTier}
          characterId={characterId}
          tier={selectedTier}
        />
      </section>
    </DashboardLayout>
  );
}
