import premiumBackground from "../../../assets/images/cosmetics/premium-ultimo-abrigo/background-premium-ultimo-abrigo.webp";
import premiumBanner from "../../../assets/images/cosmetics/premium-ultimo-abrigo/banner-premium-ultimo-abrigo.webp";
import helixBackground from "../../../assets/images/cosmetics/premium-nucleo-helix/background-helix-observatorio.webp";
import helixBanner from "../../../assets/images/cosmetics/premium-nucleo-helix/banner-helix-nucleo-vivo.webp";
import carmesimBackground from "../../../assets/images/cosmetics/premium-protocolo-carmesim/background-carmesim-fortaleza.webp";
import carmesimBanner from "../../../assets/images/cosmetics/premium-protocolo-carmesim/banner-carmesim-sala-de-guerra.webp";
import { getAvatarImage } from "../../characters/constants/avatar-options";
import type { ResolvedCharacterAppearance } from "../types/cosmetics.types";

const cosmeticAvatarModules = import.meta.glob<string>(
  "../../../assets/images/cosmetics/*/avatar-*.webp",
  { eager: true, query: "?url", import: "default" },
);

const COSMETIC_AVATAR_ASSETS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(cosmeticAvatarModules).map(([path, url]) => {
      const fileName = path.slice(path.lastIndexOf("/") + 1);
      return [fileName.replace(/\.webp$/, ""), url];
    }),
  );

const COSMETIC_IMAGE_ASSETS: Readonly<Record<string, string>> = {
  "banner-premium-ultimo-abrigo": premiumBanner,
  "background-premium-ultimo-abrigo": premiumBackground,
  "banner-helix-nucleo-vivo": helixBanner,
  "background-helix-observatorio": helixBackground,
  "banner-carmesim-sala-de-guerra": carmesimBanner,
  "background-carmesim-fortaleza": carmesimBackground,
};

const COSMETIC_FRAME_CLASSES: Readonly<Record<string, string>> = {
  "frame-premium-signal-green": "is-frame-premium-signal",
  "frame-helix-orbit": "is-frame-helix-orbit",
  "frame-crimson-aegis": "is-frame-crimson-aegis",
};

const COSMETIC_EFFECT_CLASSES: Readonly<Record<string, string>> = {
  "signal-scan": "is-effect-signal-scan",
  "helix-orbit": "is-effect-helix-orbit",
  "crimson-rift": "is-effect-crimson-rift",
};

export function getCosmeticImage(assetKey?: string | null) {
  if (!assetKey) return null;
  return (
    COSMETIC_AVATAR_ASSETS[assetKey] ?? COSMETIC_IMAGE_ASSETS[assetKey] ?? null
  );
}

export function getCosmeticFrameClass(assetKey?: string | null) {
  if (!assetKey) return "";
  return COSMETIC_FRAME_CLASSES[assetKey] ?? "";
}

export function getCosmeticEffectClass(effectPreset?: string | null) {
  if (!effectPreset) return "";
  return COSMETIC_EFFECT_CLASSES[effectPreset] ?? "";
}

export function resolveCharacterPortraitImage({
  avatarKey,
  avatarUrl,
  appearance,
}: {
  avatarKey?: string | null;
  avatarUrl?: string | null;
  appearance?: ResolvedCharacterAppearance | null;
}) {
  return (
    getCosmeticImage(appearance?.avatar?.assetKey) ??
    avatarUrl ??
    getAvatarImage(appearance?.avatarKey ?? avatarKey) ??
    null
  );
}
