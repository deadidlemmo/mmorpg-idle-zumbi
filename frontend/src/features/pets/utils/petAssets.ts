import cocoonArsenalT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-arsenal-t1.webp";
import cocoonColetaT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-coleta-t1.webp";
import cocoonCombateT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-combate-t1.webp";
import cocoonContencaoT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-contencao-t1.webp";
import cocoonDesmancheT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-desmanche-t1.webp";
import cocoonPatrulhaT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-patrulha-t1.webp";
import cocoonRastreamentoT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-rastreamento-t1.webp";
import cocoonTecnovarreduraT1 from "../../../assets/images/pets/cocoons/tier-01/casulo-de-tecnovarredura-t1.webp";
import cocoonArsenalT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-arsenal-t2.webp";
import cocoonColetaT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-coleta-t2.webp";
import cocoonCombateT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-combate-t2.webp";
import cocoonContencaoT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-contencao-t2.webp";
import cocoonDesmancheT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-desmanche-t2.webp";
import cocoonPatrulhaT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-patrulha-t2.webp";
import cocoonRastreamentoT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-rastreamento-t2.webp";
import cocoonTecnovarreduraT2 from "../../../assets/images/pets/cocoons/tier-02/casulo-de-tecnovarredura-t2.webp";
import petArsenalT1 from "../../../assets/images/pets/companions/tier-01/carregador-do-suburbio-t1.webp";
import petColetaT1 from "../../../assets/images/pets/companions/tier-01/catador-do-suburbio-t1.webp";
import petCombateT1 from "../../../assets/images/pets/companions/tier-01/predador-do-suburbio-t1.webp";
import petContencaoT1 from "../../../assets/images/pets/companions/tier-01/guardiao-do-suburbio-t1.webp";
import petDesmancheT1 from "../../../assets/images/pets/companions/tier-01/sucateiro-do-suburbio-t1.webp";
import petPatrulhaT1 from "../../../assets/images/pets/companions/tier-01/batedor-do-suburbio-t1.webp";
import petRastreamentoT1 from "../../../assets/images/pets/companions/tier-01/farejador-do-suburbio-t1.webp";
import petTecnovarreduraT1 from "../../../assets/images/pets/companions/tier-01/sonda-do-suburbio-t1.webp";
import petArsenalT2 from "../../../assets/images/pets/companions/tier-02/carregador-ferruginoso-t2.webp";
import petColetaT2 from "../../../assets/images/pets/companions/tier-02/catador-ferruginoso-t2.webp";
import petCombateT2 from "../../../assets/images/pets/companions/tier-02/mastim-ferruginoso-t2.webp";
import petContencaoT2 from "../../../assets/images/pets/companions/tier-02/guardiao-ferruginoso-t2.webp";
import petDesmancheT2 from "../../../assets/images/pets/companions/tier-02/sucateiro-ferruginoso-t2.webp";
import petPatrulhaT2 from "../../../assets/images/pets/companions/tier-02/batedor-ferruginoso-t2.webp";
import petRastreamentoT2 from "../../../assets/images/pets/companions/tier-02/farejador-ferruginoso-t2.webp";
import petTecnovarreduraT2 from "../../../assets/images/pets/companions/tier-02/sonda-ferruginosa-t2.webp";
import type { PetSpecialization } from "../types/pets.types";

export type PetAssetKind = "COCOON" | "PET";

type PetAssetDefinition = {
  assetKey?: string | null;
  specialization: PetSpecialization;
  tier: number;
};

type PetAssetPair = {
  cocoon: string;
  pet: string;
};

const SPECIALIZATION_KEY: Record<PetSpecialization, string> = {
  GATHERING_DESMANCHE: "desmanche",
  GATHERING_COLETA: "coleta",
  GATHERING_PATRULHA: "patrulha",
  GATHERING_ARSENAL: "arsenal",
  GATHERING_TECNOVARREDURA: "tecnovarredura",
  GATHERING_CONTENCAO: "contencao",
  AUTO_COMBAT_TTK: "combate",
  AUTO_COMBAT_HUNTING: "rastreamento",
};

const PET_ASSETS: Record<string, PetAssetPair> = {
  "pet-desmanche-t1": { cocoon: cocoonDesmancheT1, pet: petDesmancheT1 },
  "pet-coleta-t1": { cocoon: cocoonColetaT1, pet: petColetaT1 },
  "pet-patrulha-t1": { cocoon: cocoonPatrulhaT1, pet: petPatrulhaT1 },
  "pet-arsenal-t1": { cocoon: cocoonArsenalT1, pet: petArsenalT1 },
  "pet-tecnovarredura-t1": {
    cocoon: cocoonTecnovarreduraT1,
    pet: petTecnovarreduraT1,
  },
  "pet-contencao-t1": { cocoon: cocoonContencaoT1, pet: petContencaoT1 },
  "pet-combate-t1": { cocoon: cocoonCombateT1, pet: petCombateT1 },
  "pet-rastreamento-t1": {
    cocoon: cocoonRastreamentoT1,
    pet: petRastreamentoT1,
  },
  "pet-desmanche-t2": { cocoon: cocoonDesmancheT2, pet: petDesmancheT2 },
  "pet-coleta-t2": { cocoon: cocoonColetaT2, pet: petColetaT2 },
  "pet-patrulha-t2": { cocoon: cocoonPatrulhaT2, pet: petPatrulhaT2 },
  "pet-arsenal-t2": { cocoon: cocoonArsenalT2, pet: petArsenalT2 },
  "pet-tecnovarredura-t2": {
    cocoon: cocoonTecnovarreduraT2,
    pet: petTecnovarreduraT2,
  },
  "pet-contencao-t2": { cocoon: cocoonContencaoT2, pet: petContencaoT2 },
  "pet-combate-t2": { cocoon: cocoonCombateT2, pet: petCombateT2 },
  "pet-rastreamento-t2": {
    cocoon: cocoonRastreamentoT2,
    pet: petRastreamentoT2,
  },
};

function getCanonicalAssetKey(definition: PetAssetDefinition) {
  const configuredKey = definition.assetKey?.trim();
  if (configuredKey) return configuredKey;

  return `pet-${SPECIALIZATION_KEY[definition.specialization]}-t${definition.tier}`;
}

export function getPetAssetImageUrl(
  definition: PetAssetDefinition,
  kind: PetAssetKind,
): string | null {
  const assets = PET_ASSETS[getCanonicalAssetKey(definition)];
  if (!assets) return null;

  return kind === "COCOON" ? assets.cocoon : assets.pet;
}
