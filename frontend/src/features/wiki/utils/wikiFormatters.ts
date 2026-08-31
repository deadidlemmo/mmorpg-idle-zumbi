import { getMapImageByName } from "../../auto-combat/assets/auto-combat-map-assets";
import {
  getMobFullBodyImage,
  getMobPortraitImage,
} from "../../auto-combat/utils/mobAssets";
import { getGameItemImageUrl } from "../../inventory/utils/itemImageAssets";
import { getWorldBossImageUrl } from "../../world-bosses/utils/worldBossAssets";
import type {
  WikiBossSummary,
  WikiEntityKind,
  WikiEntitySummary,
  WikiItemSummary,
  WikiMapSummary,
  WikiMonsterSummary,
} from "../types/wiki.types";

export const WIKI_KIND_LABELS: Record<
  WikiEntityKind,
  { singular: string; plural: string; description: string }
> = {
  items: {
    singular: "Item",
    plural: "Itens",
    description: "Equipamentos, consumíveis, materiais e itens especiais.",
  },
  monsters: {
    singular: "Monstro",
    plural: "Monstros",
    description: "Inimigos, atributos, localização e possíveis drops.",
  },
  maps: {
    singular: "Mapa",
    plural: "Mapas",
    description: "Regiões, subáreas, encontros e atividades disponíveis.",
  },
  bosses: {
    singular: "Boss",
    plural: "Bosses",
    description: "Ameaças Globais, requisitos, atributos e recompensas.",
  },
};

export function toWikiRouteSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const RARITY_LABELS: Record<string, string> = {
  COMMON: "Comum",
  UNCOMMON: "Incomum",
  RARE: "Raro",
  EPIC: "Épico",
  LEGENDARY: "Lendário",
};

const SLOT_LABELS: Record<string, string> = {
  MAIN_HAND: "Mão principal",
  OFF_HAND: "Mão secundária",
  HEAD: "Cabeça",
  ARMOR: "Armadura",
  PANTS: "Calças",
  BOOTS: "Botas",
  MATERIAL: "Material",
  CONSUMABLE: "Consumível",
};

const ORIGIN_LABELS: Record<string, string> = {
  DESMANCHE: "Desmanche",
  COLETA: "Coleta",
  PATRULHA: "Patrulha",
  ARSENAL: "Arsenal",
  TECNOVARREDURA: "Tecnovarredura",
  CONTENCAO: "Contenção",
  DROP_MOBS: "Drop de monstros",
  INCURSAO: "Incursão",
  WORLD_BOSS: "Ameaça Global",
};

export function getRarityLabel(value?: string | null) {
  return RARITY_LABELS[value ?? ""] ?? value ?? "Sem raridade";
}

export function getSlotLabel(value?: string | null) {
  return SLOT_LABELS[value ?? ""] ?? value ?? "Sem categoria";
}

export function getOriginLabel(value?: string | null) {
  return ORIGIN_LABELS[value ?? ""] ?? value ?? "Origem não informada";
}

export function formatWikiNumber(value?: number | null) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, value ?? 0));
}

export function formatWikiDuration(seconds?: number | null) {
  const safe = Math.max(0, Math.round(seconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

export function formatWikiChance(value?: number | null) {
  const safe = Math.max(0, Math.min(100, value ?? 0));
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(safe)}%`;
}

export function formatWikiQuantity(min: number, max: number) {
  return min === max
    ? formatWikiNumber(min)
    : `${formatWikiNumber(min)}–${formatWikiNumber(max)}`;
}

export function getWikiEntityPath(
  kind: WikiEntityKind,
  entity: Pick<WikiEntitySummary, "slug">,
) {
  return `/wiki/${kind}/${entity.slug}`;
}

export function getWikiEntityImage(
  kind: WikiEntityKind,
  entity: WikiEntitySummary,
) {
  if (kind === "items") {
    return getGameItemImageUrl(entity as WikiItemSummary);
  }
  if (kind === "monsters") {
    const monster = entity as WikiMonsterSummary;
    return (
      getMobFullBodyImage(monster.name) ?? getMobPortraitImage(monster.name)
    );
  }
  if (kind === "maps") {
    return getMapImageByName((entity as WikiMapSummary).name);
  }
  return getWorldBossImageUrl(entity as WikiBossSummary);
}

export function getWikiEntityMeta(
  kind: WikiEntityKind,
  entity: WikiEntitySummary,
) {
  if (kind === "items") {
    const item = entity as WikiItemSummary;
    return [`T${item.tier}`, getRarityLabel(item.rarity), getSlotLabel(item.slot)];
  }
  if (kind === "monsters") {
    const monster = entity as WikiMonsterSummary;
    return [`T${monster.tier}`, `Nível ${monster.level}`, monster.map.name];
  }
  if (kind === "maps") {
    const map = entity as WikiMapSummary;
    return [`T${map.tier}`, `Níveis ${map.minLevel}–${map.maxLevel}`];
  }
  const boss = entity as WikiBossSummary;
  return [`T${boss.tier}`, `Níveis ${boss.minLevel}–${boss.maxLevel}`, boss.map.name];
}

export function getWikiEntityDescription(
  kind: WikiEntityKind,
  entity: WikiEntitySummary,
) {
  if (entity.description) return entity.description;
  if (kind === "items") return "Consulte origem, uso e formas de negociação.";
  if (kind === "monsters") return "Ameaça encontrada nesta faixa de progressão.";
  if (kind === "maps") return "Região disponível na progressão do Dead Idle.";
  return "Ameaça Global disponível nesta região.";
}
