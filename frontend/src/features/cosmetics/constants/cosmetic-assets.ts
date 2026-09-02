import premiumBackground from "../../../assets/images/cosmetics/premium-ultimo-abrigo/background-premium-ultimo-abrigo.webp";
import premiumBanner from "../../../assets/images/cosmetics/premium-ultimo-abrigo/banner-premium-ultimo-abrigo.webp";
import helixBackground from "../../../assets/images/cosmetics/premium-nucleo-helix/background-helix-observatorio.webp";
import helixBanner from "../../../assets/images/cosmetics/premium-nucleo-helix/banner-helix-nucleo-vivo.webp";
import carmesimBackground from "../../../assets/images/cosmetics/premium-protocolo-carmesim/background-carmesim-fortaleza.webp";
import carmesimBanner from "../../../assets/images/cosmetics/premium-protocolo-carmesim/banner-carmesim-sala-de-guerra.webp";
import shelterWorkshopBackground from "../../../assets/images/cosmetics/acervo-do-abrigo/background-acervo-oficina-abrigo.webp";
import shelterSortingYardBackground from "../../../assets/images/cosmetics/acervo-do-abrigo/background-acervo-patio-triagem.webp";
import shelterWorkshopBanner from "../../../assets/images/cosmetics/acervo-do-abrigo/banner-acervo-bancada-manutencao.webp";
import shelterWarehouseBanner from "../../../assets/images/cosmetics/acervo-do-abrigo/banner-acervo-corredor-almoxarifado.webp";
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
  "banner-acervo-bancada-manutencao": shelterWorkshopBanner,
  "banner-acervo-corredor-almoxarifado": shelterWarehouseBanner,
  "background-acervo-oficina-abrigo": shelterWorkshopBackground,
  "background-acervo-patio-triagem": shelterSortingYardBackground,
};

const COSMETIC_FRAME_CLASSES: Readonly<Record<string, string>> = {
  "frame-premium-signal-green": "is-frame-premium-signal",
  "frame-helix-orbit": "is-frame-helix-orbit",
  "frame-crimson-aegis": "is-frame-crimson-aegis",
  "frame-shelter-riveted-plate": "is-frame-shelter-riveted",
  "frame-shelter-marked-canvas": "is-frame-shelter-canvas",
};

const COSMETIC_EFFECT_CLASSES: Readonly<Record<string, string>> = {
  "signal-scan": "is-effect-signal-scan",
  "helix-orbit": "is-effect-helix-orbit",
  "crimson-rift": "is-effect-crimson-rift",
  "workshop-dust": "is-effect-workshop-dust",
  "flashlight-sweep": "is-effect-flashlight-sweep",
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
