import { Rarity } from '@prisma/client';
import type { ConsumableSeedData } from '../seed-types';

/**
 * Consumiveis basicos vendidos pelo Mercador.
 * Mantidos pequenos e idempotentes para servir como suprimentos iniciais sem
 * interferir na economia principal de crafting/gathering.
 */
export const consumableDefinitions: ConsumableSeedData[] = [
  {
    name: 'Pocao Pequena de Vida',
    description:
      'Frasco improvisado que recupera uma pequena porcao de HP em combate ou fora dele.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Pocao de Vida',
    healFlat: 60,
    healPercent: 8,
    minTier: 1,
    maxTier: 3,
  },
  {
    name: 'Pocao Media de Vida',
    description:
      'Mistura estabilizada para recuperar HP com mais seguranca durante expedicoes longas.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Pocao de Vida',
    healFlat: 140,
    healPercent: 12,
    minTier: 3,
    maxTier: 6,
  },
  {
    name: 'Pocao Grande de Vida',
    description:
      'Reserva concentrada para emergencias, valiosa em confrontos de alto risco.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Pocao de Vida',
    healFlat: 320,
    healPercent: 16,
    minTier: 5,
    maxTier: 10,
  },
];
