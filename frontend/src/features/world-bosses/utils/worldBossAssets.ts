import bossT1Primary from "../../../assets/images/mobs/full-body/mob12-t1.webp";
import bossT1Secondary from "../../../assets/images/mobs/full-body/mob3-t1.webp";
import bossT2Primary from "../../../assets/images/mobs/full-body/mob12-t2.webp";
import bossT2Secondary from "../../../assets/images/mobs/full-body/mob3-t2.webp";
import bossT3Primary from "../../../assets/images/mobs/full-body/mob12-t3.webp";
import bossT3Secondary from "../../../assets/images/mobs/full-body/mob1-t3.webp";
import bossT4Primary from "../../../assets/images/mobs/full-body/mob12-t4.webp";
import bossT4Secondary from "../../../assets/images/mobs/full-body/mob10-t4.webp";
import bossT5Primary from "../../../assets/images/mobs/full-body/mob12-t5.webp";
import bossT5Secondary from "../../../assets/images/mobs/full-body/mob7-t5.webp";
import type { WorldBossSummary } from "../types/world-bosses.types";

const WORLD_BOSS_ASSETS: Record<string, string> = {
  "sindico-devorado": bossT1Primary,
  "cao-alfa-da-rua-das-cercas": bossT1Secondary,
  "capataz-enferrujado": bossT2Primary,
  "empilhadeira-carniceira": bossT2Secondary,
  "cirurgiao-sem-pulso": bossT3Primary,
  "paciente-zero-da-ala-norte": bossT3Secondary,
  "fiscal-dos-mortos": bossT4Primary,
  "condutor-sem-rota": bossT4Secondary,
  "comandante-lacrado": bossT5Primary,
  "besta-de-descontaminacao": bossT5Secondary,
};

function normalizeWorldBossAssetKey(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getWorldBossImageUrl(
  boss?: Pick<WorldBossSummary, "assetKey" | "imageUrl" | "name"> | null,
) {
  if (!boss) return null;
  if (boss.imageUrl) return boss.imageUrl;

  const assetKey = normalizeWorldBossAssetKey(boss.assetKey ?? boss.name);
  return WORLD_BOSS_ASSETS[assetKey] ?? null;
}
