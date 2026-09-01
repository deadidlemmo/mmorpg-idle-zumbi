import casasSeladasImage from "../../../assets/images/incursions/tier-1/casas-seladas.webp";
import poraoInfectadosImage from "../../../assets/images/incursions/tier-1/porao-dos-infectados.webp";
import galpaoCapatazImage from "../../../assets/images/incursions/tier-2/galpao-do-capataz.webp";
import oficinaEnferrujadaImage from "../../../assets/images/incursions/tier-2/oficina-enferrujada.webp";
import alaIsolamentoImage from "../../../assets/images/incursions/tier-3/ala-de-isolamento.webp";
import necroterioLacradoImage from "../../../assets/images/incursions/tier-3/necroterio-lacrado.webp";
import plataformaMortaImage from "../../../assets/images/incursions/tier-4/plataforma-morta.webp";
import tuneisEmbarqueImage from "../../../assets/images/incursions/tier-4/tuneis-de-embarque.webp";

const INCURSION_IMAGE_BY_SLUG: Record<string, string> = {
  "casas-seladas": casasSeladasImage,
  "porao-dos-infectados": poraoInfectadosImage,
  "galpao-do-capataz": galpaoCapatazImage,
  "oficina-enferrujada": oficinaEnferrujadaImage,
  "ala-de-isolamento": alaIsolamentoImage,
  "necroterio-lacrado": necroterioLacradoImage,
  "plataforma-morta": plataformaMortaImage,
  "tuneis-de-embarque": tuneisEmbarqueImage,
};

function normalizeIncursionImageKey(incursionName?: string | null) {
  return String(incursionName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getIncursionImageByName(incursionName?: string | null) {
  const key = normalizeIncursionImageKey(incursionName);

  if (!key) return null;

  return INCURSION_IMAGE_BY_SLUG[key] ?? null;
}
