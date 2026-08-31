import {
  Backpack,
  Biohazard,
  BookOpenCheck,
  Crown,
  FlaskConical,
  Hammer,
  HeartPulse,
  MapPinned,
  Palette,
  PawPrint,
  Shield,
  ShoppingCart,
  Store,
  Swords,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { PremiumPlaceholderIcon } from "../../../components/PremiumPlaceholderIcon";
import autoCombatIcon from "../../../assets/images/auto-combat/auto-combat-activity-icon.webp";
import appearanceAvatar from "../../../assets/images/cosmetics/premium-protocolo-carmesim/avatar-carmesim-assassino-lamina.webp";
import craftingIcon from "../../../assets/images/crafting/skills/crafting.webp";
import desmancheIcon from "../../../assets/images/gathering/skills/gathering-desmanche.webp";
import potionIcon from "../../../assets/images/items/consumables/potions/t01-pocao-de-vida-menor.webp";
import equipmentIcon from "../../../assets/images/items/equipments/lutador/armadura/t01-armadura-de-retalhos-pesados.webp";
import incursionTokenIcon from "../../../assets/images/items/materials/tier-01/incursions/ficha-de-incursao-t1.webp";
import reinforcementIcon from "../../../assets/images/items/materials/tier-01/incursions/fragmento-de-reforco-t1.webp";
import suburbMap from "../../../assets/images/maps/suburbio-silencioso.webp";
import worldBossIcon from "../../../assets/images/mobs/full-body/mob12-t1.webp";
import npcInfirmary from "../../../assets/images/npcs/npc_coleta_dona_celia.webp";
import npcMerchant from "../../../assets/images/npcs/npc_mercadora_mara.webp";
import petIcon from "../../../assets/images/pets/companions/tier-01/farejador-do-suburbio-t1.webp";
import expIcon from "../../../assets/images/coins/exp.webp";
import marketplaceIcon from "../../../assets/images/ui/mercadores-abrigo.webp";

export type WikiSystemVisualTone = "green" | "gold" | "blue" | "red" | "purple";

export interface WikiSystemPresentation {
  icon: LucideIcon;
  customIcon?: ComponentType<{ className?: string }>;
  image?: string;
  fit?: "contain" | "cover";
  tone: WikiSystemVisualTone;
}

export const WIKI_SYSTEM_PRESENTATIONS: Record<string, WikiSystemPresentation> =
  {
    "combate-automatico": {
      icon: Swords,
      image: autoCombatIcon,
      tone: "red",
    },
    expedicoes: {
      icon: MapPinned,
      image: desmancheIcon,
      tone: "green",
    },
    criacao: {
      icon: Hammer,
      image: craftingIcon,
      tone: "gold",
    },
    "mochila-e-banco": {
      icon: Backpack,
      image: equipmentIcon,
      tone: "blue",
    },
    "equipamentos-e-reforco": {
      icon: Shield,
      image: reinforcementIcon,
      tone: "gold",
    },
    pocoes: {
      icon: FlaskConical,
      image: potionIcon,
      tone: "green",
    },
    enfermaria: {
      icon: HeartPulse,
      image: npcInfirmary,
      fit: "cover",
      tone: "green",
    },
    incursoes: {
      icon: Shield,
      image: incursionTokenIcon,
      tone: "purple",
    },
    "ameacas-globais": {
      icon: Biohazard,
      image: worldBossIcon,
      tone: "red",
    },
    pets: {
      icon: PawPrint,
      image: petIcon,
      tone: "green",
    },
    mercador: {
      icon: Store,
      image: npcMerchant,
      fit: "cover",
      tone: "gold",
    },
    "mercado-do-abrigo": {
      icon: ShoppingCart,
      image: marketplaceIcon,
      tone: "gold",
    },
    objetivos: {
      icon: BookOpenCheck,
      image: expIcon,
      tone: "blue",
    },
    mapas: {
      icon: MapPinned,
      image: suburbMap,
      fit: "cover",
      tone: "green",
    },
    premium: {
      icon: Crown,
      customIcon: PremiumPlaceholderIcon,
      tone: "gold",
    },
    comunidade: {
      icon: UsersRound,
      tone: "blue",
    },
    aparencia: {
      icon: Palette,
      image: appearanceAvatar,
      fit: "cover",
      tone: "purple",
    },
  };

export function getWikiSystemPresentation(slug?: string | null) {
  if (!slug) return null;
  return WIKI_SYSTEM_PRESENTATIONS[slug] ?? null;
}
