import { Rarity } from '@prisma/client';
import type { ConsumableSeedData } from '../seed-types';

export const consumableDefinitions: ConsumableSeedData[] = [
  {
    name: 'Soro de Recuperação Pálido',
    description:
      'Soro básico de campo, preparado com solução salina reaproveitada e estabilizante fraco. Usado para recuperação emergencial nos primeiros tiers.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Soro de Cura',
    healFlat: 60,
    healPercent: 5,
    minTier: 1,
    maxTier: 2,
    isCraftable: false,
  },
  {
    name: 'Ampola Antisséptica Amarelada',
    description:
      'Ampola selada com agente antisséptico instável, usada para conter infecção leve e acelerar recuperação de tecidos danificados.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Ampola de Cura',
    healFlat: 150,
    healPercent: 8,
    minTier: 3,
    maxTier: 4,
    isCraftable: false,
  },
  {
    name: 'Injetor Hemostático Militar',
    description:
      'Dispositivo tático de contenção médica usado por equipes de quarentena para estancar sangramento e manter o combatente ativo.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Injetor de Cura',
    healFlat: 350,
    healPercent: 10,
    minTier: 5,
    maxTier: 6,
    isCraftable: false,
  },
  {
    name: 'Bioampola Helix Instável',
    description:
      'Ampola experimental de bioestimulação criada a partir de protocolos Helix corrompidos. Acelera a regeneração, mas carrega sinais de instabilidade biológica.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Bioampola de Cura',
    healFlat: 700,
    healPercent: 12,
    minTier: 7,
    maxTier: 8,
    isCraftable: false,
  },
  {
    name: 'Soro Vermelho de Estabilização Total',
    description:
      'Soro de emergência usado em colapso crítico. Reativa funções vitais, estabiliza trauma extremo e desacelera falência biológica.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Soro de Cura',
    healFlat: 1400,
    healPercent: 15,
    minTier: 9,
    maxTier: 10,
    isCraftable: false,
  },
];
