import { isAxiosError } from "axios";
import { ArrowLeft, CalendarDays, Eye, Palette } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getCosmeticImage } from "../../cosmetics/constants/cosmetic-assets";
import { CharacterProfileCard } from "../../cosmetics/components/CharacterProfileCard";
import type { PublicCharacterProfileResponse } from "../../cosmetics/types/cosmetics.types";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { CharacterOverviewResponse } from "../../dashboard/types/dashboard.types";
import { buildDashboardCharacter } from "../../dashboard/utils/buildDashboardCharacter";
import { getPublicCharacterProfile } from "../api/social.api";
import "../styles/character-inspection.css";

const EQUIPMENT_LABELS: Record<string, string> = {
  head: "Elmo",
  mainHand: "Mão principal",
  armor: "Armadura",
  offHand: "Mão secundária",
  pants: "Calça",
  boots: "Botas",
};

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;
    if (Array.isArray(message)) return message.join(" ");
    if (message) return message;
  }
  return "Não foi possível inspecionar este sobrevivente.";
}

export function CharacterInspectionPage() {
  const { characterId, targetCharacterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [profile, setProfile] =
    useState<PublicCharacterProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!characterId || !targetCharacterId) return;
    const [nextOverview, nextProfile] = await Promise.all([
      getCharacterOverview(characterId),
      getPublicCharacterProfile(targetCharacterId),
    ]);
    setOverview(nextOverview);
    setProfile(nextProfile);
  }, [characterId, targetCharacterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void load()
        .catch((loadError) => setError(getErrorMessage(loadError)))
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const viewerCharacter = useMemo(
    () => (overview ? buildDashboardCharacter(overview) : null),
    [overview],
  );
  const overviewBackground = getCosmeticImage(
    profile?.appearance.overviewBackground?.assetKey,
  );

  if (!characterId || !targetCharacterId) {
    return <Navigate to="/characters" replace />;
  }
  if (isLoading && (!viewerCharacter || !profile)) {
    return <main className="dashboard-loading">Inspecionando sobrevivente...</main>;
  }
  if (!viewerCharacter || !profile) {
    return <main className="dashboard-error">{error ?? "Perfil indisponível."}</main>;
  }

  const equipment = Object.entries(profile.character.equipment ?? {});

  return (
    <DashboardLayout character={viewerCharacter} hideHero>
      <main
        className={[
          "character-inspection",
          overviewBackground ? "has-cosmetic-background" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          overviewBackground
            ? ({
                "--inspection-background": `url("${overviewBackground}")`,
              } as CSSProperties)
            : undefined
        }
      >
        <header className="character-inspection__header">
          <Link to={`/dashboard/${characterId}/allies`}>
            <ArrowLeft size={16} aria-hidden="true" /> Aliados
          </Link>
          <span>
            <Eye size={15} aria-hidden="true" /> Perfil público
          </span>
        </header>

        <CharacterProfileCard
          name={profile.character.name}
          className={profile.character.class.name}
          level={profile.character.level}
          mapName={profile.character.map?.name}
          avatarKey={profile.character.avatarKey}
          appearance={profile.appearance}
          headingLevel="h1"
        />

        <section className="character-inspection__summary">
          <div>
            <span>Classe</span>
            <strong>{profile.character.class.name}</strong>
            <p>{profile.character.class.description}</p>
          </div>
          <div>
            <span>Registro</span>
            <strong>
              <CalendarDays size={15} aria-hidden="true" />
              {new Intl.DateTimeFormat("pt-BR", {
                month: "long",
                year: "numeric",
              }).format(new Date(profile.character.createdAt))}
            </strong>
            <p>Status: {profile.character.status}</p>
          </div>
        </section>

        <section className="character-inspection__equipment">
          <header>
            <div>
              <span>Conjunto visível</span>
              <h2>Equipamentos</h2>
            </div>
            {profile.viewer.isOwner ? (
              <Link to={`/dashboard/${characterId}/appearance`}>
                <Palette size={15} aria-hidden="true" /> Editar aparência
              </Link>
            ) : null}
          </header>
          <div>
            {equipment.map(([slot, item]) => (
              <article key={slot}>
                <span>{EQUIPMENT_LABELS[slot] ?? slot}</span>
                {item ? (
                  <>
                    <strong>{item.name}</strong>
                    <small>
                      T{item.tier} · {item.rarity}
                    </small>
                  </>
                ) : (
                  <strong>Vazio</strong>
                )}
              </article>
            ))}
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
