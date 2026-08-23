import type { CSSProperties } from "react";
import { MapPin } from "lucide-react";
import { CharacterPortrait } from "./CharacterPortrait";
import {
  getCosmeticEffectClass,
  getCosmeticImage,
} from "../constants/cosmetic-assets";
import type { ResolvedCharacterAppearance } from "../types/cosmetics.types";

interface CharacterProfileCardProps {
  name: string;
  className: string;
  level: number;
  mapName?: string | null;
  avatarKey?: string | null;
  appearance?: ResolvedCharacterAppearance | null;
  headingLevel?: "h1" | "h2";
}

export function CharacterProfileCard({
  name,
  className,
  level,
  mapName,
  avatarKey,
  appearance,
  headingLevel = "h2",
}: CharacterProfileCardProps) {
  const bannerImage = getCosmeticImage(appearance?.profileBanner?.assetKey);
  const effectClass = getCosmeticEffectClass(
    appearance?.profileEffect?.effectPreset,
  );
  const style = {
    "--profile-accent": appearance?.accentColor ?? "#84b85c",
    ...(bannerImage
      ? { "--profile-banner-image": `url("${bannerImage}")` }
      : {}),
  } as CSSProperties;
  const Heading = headingLevel;

  return (
    <section
      className={[
        "cosmetic-profile-card",
        "cosmetic-surface",
        bannerImage ? "has-cosmetic-banner" : "",
        effectClass,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <span className="cosmetic-effect-layer" aria-hidden="true" />
      <CharacterPortrait
        className="cosmetic-profile-card__portrait"
        name={name}
        avatarKey={avatarKey}
        appearance={appearance}
      />
      <div className="cosmetic-profile-card__identity">
        <div className="cosmetic-profile-card__kicker">
          <span>{className}</span>
          {appearance?.badge?.displayText ? (
            <strong title={appearance.badge.name}>
              {appearance.badge.displayText}
            </strong>
          ) : null}
        </div>
        <Heading>{name}</Heading>
        {appearance?.title?.displayText ? (
          <p>{appearance.title.displayText}</p>
        ) : null}
        <div className="cosmetic-profile-card__meta">
          <span>Nv. {level}</span>
          {mapName ? (
            <span>
              <MapPin size={13} aria-hidden="true" /> {mapName}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
