import { Rarity } from '@prisma/client';
import type { ConsumableSeedData } from '../seed-types';

/**
 * Pocoes vendidas pela Mara.
 * Cada item cobre dois tiers de progressao. Pocoes iniciais curam valor fixo
 * baixo, enquanto pocoes altas escalam mais por HP maximo. Isso permite usar
 * pocoes antigas no endgame, mas sem eficiencia real.
 */
export const consumableDefinitions: ConsumableSeedData[] = [
  {
    name: 'Poção de Vida Menor de Aprendiz',
    description:
      'Poção inicial vinculada ao personagem. Recupera uma pequena quantidade de HP e não pode ser vendida.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Poção de Vida',
    healFlat: 80,
    healPercent: 0,
    minTier: 1,
    maxTier: 2,
    isSellable: false,
    isTradable: false,
  },
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
    healFlat: 100,
    healPercent: 4,
    minTier: 3,
    maxTier: 4,
  },
  {
    name: 'Poção de Vida Maior',
    description: 'Recupera uma boa quantidade de HP.',
    tier: 3,
    rarity: Rarity.RARE,
    family: 'Poção de Vida',
    healFlat: 160,
    healPercent: 9,
    minTier: 5,
    maxTier: 6,
  },
  {
    name: 'Poção de Vida Superior',
    description: 'Recupera uma alta quantidade de HP.',
    tier: 4,
    rarity: Rarity.EPIC,
    family: 'Poção de Vida',
    healFlat: 220,
    healPercent: 15,
    minTier: 7,
    maxTier: 8,
  },
  {
    name: 'Poção de Vida Suprema',
    description: 'Recupera uma quantidade extrema de HP.',
    tier: 5,
    rarity: Rarity.LEGENDARY,
    family: 'Poção de Vida',
    healFlat: 200,
    healPercent: 25,
    minTier: 9,
    maxTier: 10,
  },
];
