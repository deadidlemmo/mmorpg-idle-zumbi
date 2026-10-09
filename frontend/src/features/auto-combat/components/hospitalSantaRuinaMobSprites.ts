import pacienteAttack from "../../../assets/images/auto-combat/mobs/paciente-febril-v2/paciente-attack.png";
import pacienteDeath from "../../../assets/images/auto-combat/mobs/paciente-febril-v2/paciente-death.png";
import pacienteHurt from "../../../assets/images/auto-combat/mobs/paciente-febril-v2/paciente-hurt.png";
import pacienteWalk from "../../../assets/images/auto-combat/mobs/paciente-febril-v2/paciente-walk.png";
import maqueiroAttack from "../../../assets/images/auto-combat/mobs/maqueiro-infectado-v2/maqueiro-attack.png";
import maqueiroDeath from "../../../assets/images/auto-combat/mobs/maqueiro-infectado-v2/maqueiro-death.png";
import maqueiroHurt from "../../../assets/images/auto-combat/mobs/maqueiro-infectado-v2/maqueiro-hurt.png";
import maqueiroWalk from "../../../assets/images/auto-combat/mobs/maqueiro-infectado-v2/maqueiro-walk.png";
import entubadoAttack from "../../../assets/images/auto-combat/mobs/entubado-triagem-v2/entubado-attack.png";
import entubadoDeath from "../../../assets/images/auto-combat/mobs/entubado-triagem-v2/entubado-death.png";
import entubadoHurt from "../../../assets/images/auto-combat/mobs/entubado-triagem-v2/entubado-hurt.png";
import entubadoWalk from "../../../assets/images/auto-combat/mobs/entubado-triagem-v2/entubado-walk.png";
import moscaAttack from "../../../assets/images/auto-combat/mobs/mosca-ferida-v2/mosca-attack.png";
import moscaDeath from "../../../assets/images/auto-combat/mobs/mosca-ferida-v2/mosca-death.png";
import moscaHurt from "../../../assets/images/auto-combat/mobs/mosca-ferida-v2/mosca-hurt.png";
import moscaWalk from "../../../assets/images/auto-combat/mobs/mosca-ferida-v2/mosca-walk.png";
import enfermeiraAttack from "../../../assets/images/auto-combat/mobs/enfermeira-isolamento-v2/enfermeira-attack.png";
import enfermeiraDeath from "../../../assets/images/auto-combat/mobs/enfermeira-isolamento-v2/enfermeira-death.png";
import enfermeiraHurt from "../../../assets/images/auto-combat/mobs/enfermeira-isolamento-v2/enfermeira-hurt.png";
import enfermeiraWalk from "../../../assets/images/auto-combat/mobs/enfermeira-isolamento-v2/enfermeira-walk.png";
import tecnicoAttack from "../../../assets/images/auto-combat/mobs/tecnico-descontaminacao-v2/tecnico-attack.png";
import tecnicoDeath from "../../../assets/images/auto-combat/mobs/tecnico-descontaminacao-v2/tecnico-death.png";
import tecnicoHurt from "../../../assets/images/auto-combat/mobs/tecnico-descontaminacao-v2/tecnico-hurt.png";
import tecnicoWalk from "../../../assets/images/auto-combat/mobs/tecnico-descontaminacao-v2/tecnico-walk.png";
import internoAttack from "../../../assets/images/auto-combat/mobs/interno-retorcido-v2/interno-attack.png";
import internoDeath from "../../../assets/images/auto-combat/mobs/interno-retorcido-v2/interno-death.png";
import internoHurt from "../../../assets/images/auto-combat/mobs/interno-retorcido-v2/interno-hurt.png";
import internoWalk from "../../../assets/images/auto-combat/mobs/interno-retorcido-v2/interno-walk.png";
import centopeiaAttack from "../../../assets/images/auto-combat/mobs/centopeia-tubulacao-v2/centopeia-attack.png";
import centopeiaDeath from "../../../assets/images/auto-combat/mobs/centopeia-tubulacao-v2/centopeia-death.png";
import centopeiaHurt from "../../../assets/images/auto-combat/mobs/centopeia-tubulacao-v2/centopeia-hurt.png";
import centopeiaWalk from "../../../assets/images/auto-combat/mobs/centopeia-tubulacao-v2/centopeia-walk.png";
import instrumentadorAttack from "../../../assets/images/auto-combat/mobs/instrumentador-cirurgico-v2/instrumentador-attack.png";
import instrumentadorDeath from "../../../assets/images/auto-combat/mobs/instrumentador-cirurgico-v2/instrumentador-death.png";
import instrumentadorHurt from "../../../assets/images/auto-combat/mobs/instrumentador-cirurgico-v2/instrumentador-hurt.png";
import instrumentadorWalk from "../../../assets/images/auto-combat/mobs/instrumentador-cirurgico-v2/instrumentador-walk.png";
import anestesistaAttack from "../../../assets/images/auto-combat/mobs/anestesista-colapsado-v2/anestesista-attack.png";
import anestesistaDeath from "../../../assets/images/auto-combat/mobs/anestesista-colapsado-v2/anestesista-death.png";
import anestesistaHurt from "../../../assets/images/auto-combat/mobs/anestesista-colapsado-v2/anestesista-hurt.png";
import anestesistaWalk from "../../../assets/images/auto-combat/mobs/anestesista-colapsado-v2/anestesista-walk.png";
import sanguessugaAttack from "../../../assets/images/auto-combat/mobs/sanguessuga-hematica-v2/sanguessuga-attack.png";
import sanguessugaDeath from "../../../assets/images/auto-combat/mobs/sanguessuga-hematica-v2/sanguessuga-death.png";
import sanguessugaHurt from "../../../assets/images/auto-combat/mobs/sanguessuga-hematica-v2/sanguessuga-hurt.png";
import sanguessugaWalk from "../../../assets/images/auto-combat/mobs/sanguessuga-hematica-v2/sanguessuga-walk.png";
import cirurgiaoAttack from "../../../assets/images/auto-combat/mobs/cirurgiao-chefe-v2/cirurgiao-attack.png";
import cirurgiaoDeath from "../../../assets/images/auto-combat/mobs/cirurgiao-chefe-v2/cirurgiao-death.png";
import cirurgiaoHurt from "../../../assets/images/auto-combat/mobs/cirurgiao-chefe-v2/cirurgiao-hurt.png";
import cirurgiaoWalk from "../../../assets/images/auto-combat/mobs/cirurgiao-chefe-v2/cirurgiao-walk.png";
import type { MobCombatSpriteAssets } from "./phaser/createSuburbioHuntingGame";

export const HOSPITAL_SANTA_RUINA_MOB_SPRITES: readonly MobCombatSpriteAssets[] = [
  { key: "paciente", mobNameKey: "paciente-febril-errante", attack: pacienteAttack, death: pacienteDeath, hurt: pacienteHurt, walk: pacienteWalk },
  { key: "maqueiro", mobNameKey: "maqueiro-infectado", attack: maqueiroAttack, death: maqueiroDeath, hurt: maqueiroHurt, walk: maqueiroWalk },
  { key: "entubado", mobNameKey: "entubado-da-triagem", attack: entubadoAttack, death: entubadoDeath, hurt: entubadoHurt, walk: entubadoWalk },
  { key: "mosca", mobNameKey: "mosca-de-ferida-contaminada", attack: moscaAttack, death: moscaDeath, hurt: moscaHurt, walk: moscaWalk },
  { key: "enfermeira", mobNameKey: "enfermeira-de-isolamento-infectada", attack: enfermeiraAttack, death: enfermeiraDeath, hurt: enfermeiraHurt, walk: enfermeiraWalk },
  { key: "tecnico", mobNameKey: "tecnico-selado-de-descontaminacao", attack: tecnicoAttack, death: tecnicoDeath, hurt: tecnicoHurt, walk: tecnicoWalk },
  { key: "interno", mobNameKey: "interno-retorcido-do-isolamento", attack: internoAttack, death: internoDeath, hurt: internoHurt, walk: internoWalk },
  { key: "centopeia", mobNameKey: "centopeia-de-tubulacao-contaminada", attack: centopeiaAttack, death: centopeiaDeath, hurt: centopeiaHurt, walk: centopeiaWalk },
  { key: "instrumentador", mobNameKey: "instrumentador-cirurgico-infectado", attack: instrumentadorAttack, death: instrumentadorDeath, hurt: instrumentadorHurt, walk: instrumentadorWalk },
  { key: "anestesista", mobNameKey: "anestesista-colapsado", attack: anestesistaAttack, death: anestesistaDeath, hurt: anestesistaHurt, walk: anestesistaWalk },
  { key: "sanguessuga", mobNameKey: "sanguessuga-de-bolsa-hematica", attack: sanguessugaAttack, death: sanguessugaDeath, hurt: sanguessugaHurt, walk: sanguessugaWalk },
  { key: "cirurgiao", mobNameKey: "cirurgiao-chefe-necrosado", attack: cirurgiaoAttack, death: cirurgiaoDeath, hurt: cirurgiaoHurt, walk: cirurgiaoWalk },
];
