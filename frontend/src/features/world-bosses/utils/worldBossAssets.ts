import caoAlfaImage from "../../../assets/images/world-bosses/tier-1/cao-alfa-da-rua-das-cercas.webp";
import sindicoDevoradoImage from "../../../assets/images/world-bosses/tier-1/sindico-devorado.webp";
import capatazEnferrujadoImage from "../../../assets/images/world-bosses/tier-2/capataz-enferrujado.webp";
import empilhadeiraCarniceiraImage from "../../../assets/images/world-bosses/tier-2/empilhadeira-carniceira.webp";
import cirurgiaoSemPulsoImage from "../../../assets/images/world-bosses/tier-3/cirurgiao-sem-pulso.webp";
import pacienteZeroImage from "../../../assets/images/world-bosses/tier-3/paciente-zero-da-ala-norte.webp";
import condutorSemRotaImage from "../../../assets/images/world-bosses/tier-4/condutor-sem-rota.webp";
import fiscalDosMortosImage from "../../../assets/images/world-bosses/tier-4/fiscal-dos-mortos.webp";
import bestaDescontaminacaoImage from "../../../assets/images/world-bosses/tier-5/besta-de-descontaminacao.webp";
import comandanteLacradoImage from "../../../assets/images/world-bosses/tier-5/comandante-lacrado.webp";
import type { WorldBossSummary } from "../types/world-bosses.types";

const WORLD_BOSS_ASSETS: Record<string, string> = {
  "sindico-devorado": sindicoDevoradoImage,
  "cao-alfa-da-rua-das-cercas": caoAlfaImage,
  "capataz-enferrujado": capatazEnferrujadoImage,
  "empilhadeira-carniceira": empilhadeiraCarniceiraImage,
  "cirurgiao-sem-pulso": cirurgiaoSemPulsoImage,
  "paciente-zero-da-ala-norte": pacienteZeroImage,
  "fiscal-dos-mortos": fiscalDosMortosImage,
  "condutor-sem-rota": condutorSemRotaImage,
  "comandante-lacrado": comandanteLacradoImage,
  "besta-de-descontaminacao": bestaDescontaminacaoImage,
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
