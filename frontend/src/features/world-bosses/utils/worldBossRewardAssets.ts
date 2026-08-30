import expIcon from "../../../assets/images/coins/exp.webp";
import goldIcon from "../../../assets/images/coins/gold.webp";
import type { WorldBossRewardType } from "../types/world-bosses.types";

const cocoonAssets = import.meta.glob<string>(
  "../../../assets/images/pets/cocoons/tier-*/*.webp",
  { eager: true, import: "default" },
);

const COCOON_SPECIALIZATIONS = [
  { key: "desmanche", label: "Desmanche" },
  { key: "coleta", label: "Coleta" },
  { key: "patrulha", label: "Patrulha" },
  { key: "arsenal", label: "Arsenal" },
  { key: "tecnovarredura", label: "Tecnovarredura" },
  { key: "contencao", label: "Contenção" },
  { key: "combate", label: "Combate" },
  { key: "rastreamento", label: "Rastreamento" },
] as const;

function normalizeLaunchTier(tier: number) {
  const safeTier = Math.max(1, Math.floor(Number(tier) || 1));
  return safeTier <= 5 ? safeTier : null;
}

function getCocoonAssetUrl(tier: number, specialization: string) {
  const launchTier = normalizeLaunchTier(tier);
  if (!launchTier) return null;

  const tierFolder = String(launchTier).padStart(2, "0");
  const path = `../../../assets/images/pets/cocoons/tier-${tierFolder}/casulo-de-${specialization}-t${launchTier}.webp`;
  return cocoonAssets[path] ?? null;
}

export function getWorldBossRewardImageUrl(
  rewardType: WorldBossRewardType,
  tier: number,
) {
  if (rewardType === "GOLD") return goldIcon;
  if (rewardType === "XP") return expIcon;
  if (rewardType === "PET_EGG") return getCocoonAssetUrl(tier, "combate");
  return null;
}

export function getWorldBossCocoonOptions(tier: number) {
  return COCOON_SPECIALIZATIONS.flatMap(({ key, label }) => {
    const imageUrl = getCocoonAssetUrl(tier, key);
    return imageUrl ? [{ key, label, imageUrl }] : [];
  });
}
