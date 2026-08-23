import type { CSSProperties } from "react";
import { getCharacterInitials } from "../../characters/types/character.types";
import {
  getCosmeticFrameClass,
  resolveCharacterPortraitImage,
} from "../constants/cosmetic-assets";
import type { ResolvedCharacterAppearance } from "../types/cosmetics.types";
import "../styles/cosmetics.css";

interface CharacterPortraitProps {
  name: string;
  avatarKey?: string | null;
  avatarUrl?: string | null;
  appearance?: ResolvedCharacterAppearance | null;
  className?: string;
  decorative?: boolean;
}

export function CharacterPortrait({
  name,
  avatarKey,
  avatarUrl,
  appearance,
  className = "",
  decorative = false,
}: CharacterPortraitProps) {
  const image = resolveCharacterPortraitImage({
    avatarKey,
    avatarUrl,
    appearance,
  });
  const frameClass = getCosmeticFrameClass(
    appearance?.avatarFrame?.assetKey,
  );
  const style = {
    "--portrait-accent": appearance?.accentColor ?? "var(--class-accent)",
  } as CSSProperties;

  return (
    <div
      className={["character-portrait", frameClass, className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-hidden={decorative || undefined}
    >
      {image ? (
        <img src={image} alt={decorative ? "" : name} />
      ) : (
        <span>{getCharacterInitials(name)}</span>
      )}
      {frameClass ? (
        <span className="character-portrait__frame" aria-hidden="true" />
      ) : null}
    </div>
  );
}
