import { isAxiosError } from "axios";
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  MapPin,
  PackageOpen,
  Palette,
  ShieldCheck,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import {
  getCosmeticEffectClass,
  getCosmeticImage,
} from "../../cosmetics/constants/cosmetic-assets";
import type { PublicCharacterProfileResponse } from "../../cosmetics/types/cosmetics.types";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import { getEquipmentRarityFromItem } from "../../dashboard/constants/equipment-rarity";
import type { CharacterOverviewResponse } from "../../dashboard/types/dashboard.types";
import { buildDashboardCharacter } from "../../dashboard/utils/buildDashboardCharacter";
import { EquipmentItemArtwork } from "../../equipment/components/EquipmentItemArtwork";
import { getEquipmentItemImageUrl } from "../../equipment/utils/equipmentItemAssets";
import { getPublicCharacterProfile } from "../api/social.api";
import "../styles/character-inspection.css";

const EQUIPMENT_SLOTS = [
  { key: "head", label: "Elmo" },
  { key: "mainHand", label: "Mão principal" },
  { key: "armor", label: "Armadura" },
  { key: "offHand", label: "Mão secundária" },
  { key: "pants", label: "Calça" },
  { key: "boots", label: "Botas" },
] as const;

const CHARACTER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  DEAD: "Morto",
  BLOCKED: "Bloqueado",
  DELETED: "Removido",
};

type PublicEquipmentItem = NonNullable<
  NonNullable<
    PublicCharacterProfileResponse["character"]["equipment"]
  >[string]
>;

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;
    if (Array.isArray(message)) return message.join(" ");
    if (message) return message;
  }
  return "Não foi possível inspecionar este sobrevivente.";
}

function EquipmentSlot({
  label,
  item,
}: {
  label: string;
  item?: PublicEquipmentItem | null;
}) {
  const imageUrl = getEquipmentItemImageUrl(item);
  const rarity = getEquipmentRarityFromItem(item);
  const style = item
    ? ({
        "--inspection-item-rarity": rarity.hex,
        "--inspection-item-rarity-rgb": rarity.rgb,
      } as CSSProperties)
    : undefined;

  return (
    <article
      className={`character-inspection__equipment-slot ${item ? "has-item" : "is-empty"}`}
      style={style}
    >
      <div className="character-inspection__equipment-image">
        <EquipmentItemArtwork
          item={item}
          imageUrl={imageUrl}
          alt={item?.name ?? ""}
          fallback={<PackageOpen size={22} aria-hidden="true" />}
        />
      </div>
      <div className="character-inspection__equipment-copy">
        <span>{label}</span>
        <strong title={item?.name}>{item?.name ?? "Slot vazio"}</strong>
        {item ? (
          <small>
            <em>T{item.tier}</em>
            <em>{rarity.label}</em>
          </small>
        ) : (
          <small>Nenhum item equipado</small>
        )}
      </div>
    </article>
  );
}

export function CharacterInspectionPage() {
  const { characterId, targetCharacterId } = useParams();
  const navigate = useNavigate();
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
      setError(null);
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
  const profileBanner = getCosmeticImage(
    profile?.appearance.profileBanner?.assetKey,
  );
  const effectClass = getCosmeticEffectClass(
    profile?.appearance.profileEffect?.effectPreset,
  );

  if (!characterId || !targetCharacterId) {
    return <Navigate to="/characters" replace />;
  }
  if (isLoading && (!viewerCharacter || !profile)) {
    return <main className="dashboard-loading">Inspecionando sobrevivente...</main>;
  }
  if (!viewerCharacter || !profile) {
    return (
      <main className="dashboard-error">{error ?? "Perfil indisponível."}</main>
    );
  }

  const appearance = profile.appearance;
  const statusLabel =
    CHARACTER_STATUS_LABELS[profile.character.status] ?? "Indisponível";
  const registeredAt = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(profile.character.createdAt));
  const pageStyle = overviewBackground
    ? ({
        "--inspection-background": `url("${overviewBackground}")`,
      } as CSSProperties)
    : undefined;
  const heroStyle = {
    "--inspection-accent": appearance.accentColor ?? "#86b85c",
    ...(profileBanner
      ? { "--inspection-banner": `url("${profileBanner}")` }
      : {}),
  } as CSSProperties;

  return (
    <DashboardLayout character={viewerCharacter} hideHero>
      <main
        className={[
          "character-inspection",
          overviewBackground ? "has-cosmetic-background" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={pageStyle}
      >
        <header className="character-inspection__header">
          <button type="button" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} aria-hidden="true" /> Voltar
          </button>
          <span>
            <Eye size={15} aria-hidden="true" /> Inspeção pública
          </span>
        </header>

        <section
          className={[
            "character-inspection__hero",
            "cosmetic-surface",
            profileBanner ? "has-cosmetic-banner" : "",
            effectClass,
          ]
            .filter(Boolean)
            .join(" ")}
          style={heroStyle}
        >
          <span className="cosmetic-effect-layer" aria-hidden="true" />
          <div className="character-inspection__identity">
            <CharacterPortrait
              className="character-inspection__portrait"
              name={profile.character.name}
              avatarKey={profile.character.avatarKey}
              appearance={appearance}
            />
            <div>
              <div className="character-inspection__kicker">
                <span>{profile.character.class.name}</span>
                {appearance.badge?.displayText ? (
                  <b title={appearance.badge.name}>
                    {appearance.badge.displayText}
                  </b>
                ) : null}
              </div>
              <h1>{profile.character.name}</h1>
              {appearance.title?.displayText ? (
                <p>{appearance.title.displayText}</p>
              ) : null}
              <div className="character-inspection__meta">
                <span>
                  <ShieldCheck size={14} aria-hidden="true" /> Nv. {profile.character.level}
                </span>
                {profile.character.map ? (
                  <span>
                    <MapPin size={14} aria-hidden="true" />
                    {profile.character.map.name}
                  </span>
                ) : null}
                <span className="is-status">{statusLabel}</span>
              </div>
            </div>
          </div>

          <div className="character-inspection__facts">
            <div>
              <span>Especialidade</span>
              <strong>{profile.character.class.name}</strong>
              <p>
                {profile.character.class.description ??
                  "Sobrevivente em atividade no abrigo."}
              </p>
            </div>
            <div>
              <span>Histórico no abrigo</span>
              <strong>
                <CalendarDays size={15} aria-hidden="true" /> Desde {registeredAt}
              </strong>
              <p>
                {profile.character.map
                  ? `Operando em ${profile.character.map.name}, área T${profile.character.map.tier}.`
                  : "Localização atual não divulgada."}
              </p>
            </div>
          </div>
        </section>

        <section className="character-inspection__equipment">
          <header>
            <div>
              <span>Conjunto visível</span>
              <h2>Equipamentos em uso</h2>
            </div>
            {profile.viewer.isOwner ? (
              <Link to={`/dashboard/${characterId}/appearance`}>
                <Palette size={15} aria-hidden="true" /> Editar aparência
              </Link>
            ) : null}
          </header>
          <div className="character-inspection__equipment-grid">
            {EQUIPMENT_SLOTS.map(({ key, label }) => (
              <EquipmentSlot
                key={key}
                label={label}
                item={profile.character.equipment?.[key]}
              />
            ))}
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
