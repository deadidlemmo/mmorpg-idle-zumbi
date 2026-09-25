import aranhaAttack from "../../../assets/images/auto-combat/mobs/aranha-viga-v1/aranha-attack.png";
import aranhaDeath from "../../../assets/images/auto-combat/mobs/aranha-viga-v1/aranha-death.png";
import aranhaHurt from "../../../assets/images/auto-combat/mobs/aranha-viga-v1/aranha-hurt.png";
import aranhaWalk from "../../../assets/images/auto-combat/mobs/aranha-viga-v1/aranha-walk.png";
import arrastadorAttack from "../../../assets/images/auto-combat/mobs/arrastador-correntes-v1/arrastador-attack.png";
import arrastadorDeath from "../../../assets/images/auto-combat/mobs/arrastador-correntes-v1/arrastador-death.png";
import arrastadorHurt from "../../../assets/images/auto-combat/mobs/arrastador-correntes-v1/arrastador-hurt.png";
import arrastadorWalk from "../../../assets/images/auto-combat/mobs/arrastador-correntes-v1/arrastador-walk.png";
import barataAttack from "../../../assets/images/auto-combat/mobs/barata-deposito-v1/barata-attack.png";
import barataDeath from "../../../assets/images/auto-combat/mobs/barata-deposito-v1/barata-death.png";
import barataHurt from "../../../assets/images/auto-combat/mobs/barata-deposito-v1/barata-hurt.png";
import barataWalk from "../../../assets/images/auto-combat/mobs/barata-deposito-v1/barata-walk.png";
import capatazAttack from "../../../assets/images/auto-combat/mobs/capataz-ferrugento-v1/capataz-attack.png";
import capatazDeath from "../../../assets/images/auto-combat/mobs/capataz-ferrugento-v1/capataz-death.png";
import capatazHurt from "../../../assets/images/auto-combat/mobs/capataz-ferrugento-v1/capataz-hurt.png";
import capatazWalk from "../../../assets/images/auto-combat/mobs/capataz-ferrugento-v1/capataz-walk.png";
import carregadorAttack from "../../../assets/images/auto-combat/mobs/carregador-paletes-v1/carregador-attack.png";
import carregadorDeath from "../../../assets/images/auto-combat/mobs/carregador-paletes-v1/carregador-death.png";
import carregadorHurt from "../../../assets/images/auto-combat/mobs/carregador-paletes-v1/carregador-hurt.png";
import carregadorWalk from "../../../assets/images/auto-combat/mobs/carregador-paletes-v1/carregador-walk.png";
import esmagadoAttack from "../../../assets/images/auto-combat/mobs/esmagado-prensa-v1/esmagado-attack.png";
import esmagadoDeath from "../../../assets/images/auto-combat/mobs/esmagado-prensa-v1/esmagado-death.png";
import esmagadoHurt from "../../../assets/images/auto-combat/mobs/esmagado-prensa-v1/esmagado-hurt.png";
import esmagadoWalk from "../../../assets/images/auto-combat/mobs/esmagado-prensa-v1/esmagado-walk.png";
import lacraiaAttack from "../../../assets/images/auto-combat/mobs/lacraia-esteira-v1/lacraia-attack.png";
import lacraiaDeath from "../../../assets/images/auto-combat/mobs/lacraia-esteira-v1/lacraia-death.png";
import lacraiaHurt from "../../../assets/images/auto-combat/mobs/lacraia-esteira-v1/lacraia-hurt.png";
import lacraiaWalk from "../../../assets/images/auto-combat/mobs/lacraia-esteira-v1/lacraia-walk.png";
import operadorAttack from "../../../assets/images/auto-combat/mobs/operador-empilhadeira-v1/operador-attack.png";
import operadorDeath from "../../../assets/images/auto-combat/mobs/operador-empilhadeira-v1/operador-death.png";
import operadorHurt from "../../../assets/images/auto-combat/mobs/operador-empilhadeira-v1/operador-hurt.png";
import operadorWalk from "../../../assets/images/auto-combat/mobs/operador-empilhadeira-v1/operador-walk.png";
import operarioAttack from "../../../assets/images/auto-combat/mobs/operario-prensado-v1/operario-attack.png";
import operarioDeath from "../../../assets/images/auto-combat/mobs/operario-prensado-v1/operario-death.png";
import operarioHurt from "../../../assets/images/auto-combat/mobs/operario-prensado-v1/operario-hurt.png";
import operarioWalk from "../../../assets/images/auto-combat/mobs/operario-prensado-v1/operario-walk.png";
import pistoneiroAttack from "../../../assets/images/auto-combat/mobs/pistoneiro-hidraulico-v1/pistoneiro-attack.png";
import pistoneiroDeath from "../../../assets/images/auto-combat/mobs/pistoneiro-hidraulico-v1/pistoneiro-death.png";
import pistoneiroHurt from "../../../assets/images/auto-combat/mobs/pistoneiro-hidraulico-v1/pistoneiro-hurt.png";
import pistoneiroWalk from "../../../assets/images/auto-combat/mobs/pistoneiro-hidraulico-v1/pistoneiro-walk.png";
import soldadorAttack from "../../../assets/images/auto-combat/mobs/soldador-mascarado-v1/soldador-attack.png";
import soldadorDeath from "../../../assets/images/auto-combat/mobs/soldador-mascarado-v1/soldador-death.png";
import soldadorHurt from "../../../assets/images/auto-combat/mobs/soldador-mascarado-v1/soldador-hurt.png";
import soldadorWalk from "../../../assets/images/auto-combat/mobs/soldador-mascarado-v1/soldador-walk.png";
import vigiaAttack from "../../../assets/images/auto-combat/mobs/vigia-galpao-v1/vigia-attack.png";
import vigiaDeath from "../../../assets/images/auto-combat/mobs/vigia-galpao-v1/vigia-death.png";
import vigiaHurt from "../../../assets/images/auto-combat/mobs/vigia-galpao-v1/vigia-hurt.png";
import vigiaWalk from "../../../assets/images/auto-combat/mobs/vigia-galpao-v1/vigia-walk.png";
import type { MobCombatSpriteAssets } from "./phaser/createSuburbioHuntingGame";

export const DISTRITO_FERRUGEM_MOB_SPRITES: readonly MobCombatSpriteAssets[] = [
  { key: "carregador", mobNameKey: "carregador-de-paletes-infectado", attack: carregadorAttack, death: carregadorDeath, hurt: carregadorHurt, walk: carregadorWalk },
  { key: "barata", mobNameKey: "barata-de-deposito-oleosa", attack: barataAttack, death: barataDeath, hurt: barataHurt, walk: barataWalk },
  { key: "operador", mobNameKey: "operador-de-empilhadeira-infectado", attack: operadorAttack, death: operadorDeath, hurt: operadorHurt, walk: operadorWalk },
  { key: "arrastador", mobNameKey: "arrastador-de-correntes", attack: arrastadorAttack, death: arrastadorDeath, hurt: arrastadorHurt, walk: arrastadorWalk },
  { key: "operario", mobNameKey: "operario-prensado", attack: operarioAttack, death: operarioDeath, hurt: operarioHurt, walk: operarioWalk },
  { key: "pistoneiro", mobNameKey: "pistoneiro-hidraulico", attack: pistoneiroAttack, death: pistoneiroDeath, hurt: pistoneiroHurt, walk: pistoneiroWalk },
  { key: "lacraia", mobNameKey: "lacraia-de-esteira-ferruginosa", attack: lacraiaAttack, death: lacraiaDeath, hurt: lacraiaHurt, walk: lacraiaWalk },
  { key: "esmagado", mobNameKey: "esmagado-da-prensa", attack: esmagadoAttack, death: esmagadoDeath, hurt: esmagadoHurt, walk: esmagadoWalk },
  { key: "vigia", mobNameKey: "vigia-do-galpao-infectado", attack: vigiaAttack, death: vigiaDeath, hurt: vigiaHurt, walk: vigiaWalk },
  { key: "soldador", mobNameKey: "soldador-mascarado-infectado", attack: soldadorAttack, death: soldadorDeath, hurt: soldadorHurt, walk: soldadorWalk },
  { key: "aranha", mobNameKey: "aranha-de-viga-contaminada", attack: aranhaAttack, death: aranhaDeath, hurt: aranhaHurt, walk: aranhaWalk },
  { key: "capataz", mobNameKey: "capataz-ferrugento", attack: capatazAttack, death: capatazDeath, hurt: capatazHurt, walk: capatazWalk },
];
