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
import afterLawHighwayBackground from "../../../assets/images/cosmetics/cash-depois-da-lei/background-depois-da-lei-rodovia-silenciosa.webp";
import afterLawFarmBackground from "../../../assets/images/cosmetics/cash-depois-da-lei/background-depois-da-lei-refugio-colina.webp";
import afterLawPatrolBanner from "../../../assets/images/cosmetics/cash-depois-da-lei/banner-depois-da-lei-ultima-patrulha.webp";
import afterLawYardBanner from "../../../assets/images/cosmetics/cash-depois-da-lei/banner-depois-da-lei-patio-quarentena.webp";
import afterLawAshesEffect from "../../../assets/images/cosmetics/cash-depois-da-lei/efeito-cinzas-da-lei.webp";
import afterLawAshesEffectPoster from "../../../assets/images/cosmetics/cash-depois-da-lei/efeito-cinzas-da-lei-poster.webp";
import afterLawSiegeEffect from "../../../assets/images/cosmetics/cash-depois-da-lei/efeito-pulso-de-cerco.webp";
import afterLawSiegeEffectPoster from "../../../assets/images/cosmetics/cash-depois-da-lei/efeito-pulso-de-cerco-poster.webp";
import quarantineRainBackground from "../../../assets/images/cosmetics/cash-chuva-quarentena/background-chuva-quarentena-cidade-encharcada.webp";
import quarantineRainBanner from "../../../assets/images/cosmetics/cash-chuva-quarentena/banner-chuva-quarentena-posto-emergencia.webp";
import quarantineRainEffect from "../../../assets/images/cosmetics/cash-chuva-quarentena/efeito-chuva-quarentena.webp";
import quarantineRainEffectPoster from "../../../assets/images/cosmetics/cash-chuva-quarentena/efeito-chuva-quarentena-poster.webp";
import { getAvatarImage } from "../../characters/constants/avatar-options";
import type { ResolvedCharacterAppearance } from "../types/cosmetics.types";

const cosmeticAvatarModules = import.meta.glob<string>(
  [
    "../../../assets/images/cosmetics/*/avatar-*.webp",
    "../../../assets/images/cosmetics/*/avatar-*.png",
  ],
  { eager: true, query: "?url", import: "default" },
);

const COSMETIC_AVATAR_ASSETS: Readonly<Record<string, string>> = (() => {
  const assets: Record<string, string> = {};

  for (const [path, url] of Object.entries(cosmeticAvatarModules)) {
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    const assetKey = fileName.replace(/\.(?:png|webp)$/, "");

    // PNGs substitutos vencem; os WebPs continuam no build para abas antigas.
    if (!assets[assetKey] || fileName.endsWith(".png")) {
      assets[assetKey] = url;
    }
  }

  return Object.freeze(assets);
})();

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
  "banner-depois-da-lei-ultima-patrulha": afterLawPatrolBanner,
  "banner-depois-da-lei-patio-quarentena": afterLawYardBanner,
  "background-depois-da-lei-rodovia-silenciosa": afterLawHighwayBackground,
  "background-depois-da-lei-refugio-colina": afterLawFarmBackground,
  "banner-chuva-quarentena-posto-emergencia": quarantineRainBanner,
  "background-chuva-quarentena-cidade-encharcada": quarantineRainBackground,
};

const COSMETIC_FRAME_CLASSES: Readonly<Record<string, string>> = {
  "frame-premium-signal-green": "is-frame-premium-signal",
  "frame-helix-orbit": "is-frame-helix-orbit",
  "frame-crimson-aegis": "is-frame-crimson-aegis",
  "frame-shelter-riveted-plate": "is-frame-shelter-riveted",
  "frame-shelter-marked-canvas": "is-frame-shelter-canvas",
  "frame-after-law-broken-star": "is-frame-after-law-star",
  "frame-after-law-steel-siege": "is-frame-after-law-siege",
  "frame-quarantine-rpd": "is-frame-quarantine-rpd",
};

const COSMETIC_EFFECT_CLASSES: Readonly<Record<string, string>> = {
  "signal-scan": "is-effect-signal-scan",
  "helix-orbit": "is-effect-helix-orbit",
  "crimson-rift": "is-effect-crimson-rift",
  "workshop-dust": "is-effect-workshop-dust",
  "flashlight-sweep": "is-effect-flashlight-sweep",
  "law-ashes": "is-effect-law-ashes",
  "siege-pulse": "is-effect-siege-pulse",
  "quarantine-rain": "is-effect-quarantine-rain",
};

interface CosmeticEffectMedia {
  animated: string;
  poster: string;
}

const COSMETIC_EFFECT_MEDIA: Readonly<Record<string, CosmeticEffectMedia>> = {
  "law-ashes": {
    animated: afterLawAshesEffect,
    poster: afterLawAshesEffectPoster,
  },
  "siege-pulse": {
    animated: afterLawSiegeEffect,
    poster: afterLawSiegeEffectPoster,
  },
  "quarantine-rain": {
    animated: quarantineRainEffect,
    poster: quarantineRainEffectPoster,
  },
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

export function getCosmeticEffectMedia(effectPreset?: string | null) {
  if (!effectPreset) return null;
  return COSMETIC_EFFECT_MEDIA[effectPreset] ?? null;
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
  const appearanceAvatarKey =
    appearance?.avatar?.assetKey ?? appearance?.avatarKey ?? null;

  return (
    getCosmeticImage(appearanceAvatarKey) ??
    getAvatarImage(appearanceAvatarKey) ??
    avatarUrl ??
    getAvatarImage(avatarKey) ??
    null
  );
}
