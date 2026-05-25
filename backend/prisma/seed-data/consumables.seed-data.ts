import { Rarity } from '@prisma/client';
import type { ConsumableSeedData } from '../seed-types';

/**
 * Pocoes vendidas pela Mara.
 * Cada item cobre dois tiers de progressao e usa nomes classicos de RPG para
 * facilitar a leitura rapida na loja.
 */
export const consumableDefinitions: ConsumableSeedData[] = [
  {
    name: 'Poção de Vida Menor',
    description: 'Recupera uma pequena quantidade de HP.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Poção de Vida',
    healFlat: 80,
    healPercent: 0,
    minTier: 1,
    maxTier: 2,
  },
  {
    name: 'Poção de Vida',
    description: 'Recupera uma quantidade moderada de HP.',
    tier: 2,
    rarity: Rarity.UNCOMMON,
    family: 'Poção de Vida',
    healFlat: 180,
    healPercent: 0,
    minTier: 3,
    maxTier: 4,
  },
  {
    name: 'Poção de Vida Maior',
    description: 'Recupera uma boa quantidade de HP.',
    tier: 3,
    rarity: Rarity.RARE,
    family: 'Poção de Vida',
    healFlat: 420,
    healPercent: 0,
    minTier: 5,
    maxTier: 6,
  },
  {
    name: 'Poção de Vida Superior',
    description: 'Recupera uma alta quantidade de HP.',
    tier: 4,
    rarity: Rarity.EPIC,
    family: 'Poção de Vida',
    healFlat: 900,
    healPercent: 0,
    minTier: 7,
    maxTier: 8,
  },
  {
    name: 'Poção de Vida Suprema',
    description: 'Recupera uma quantidade extrema de HP.',
    tier: 5,
    rarity: Rarity.LEGENDARY,
    family: 'Poção de Vida',
    healFlat: 1800,
    healPercent: 0,
    minTier: 9,
    maxTier: 10,
  },
];
