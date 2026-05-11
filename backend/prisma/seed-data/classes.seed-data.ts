import type { GameClassSeedData } from '../seed-types';

export const classDefinitions: GameClassSeedData[] = [
  {
    name: 'Lutador',
    description:
      'Classe de linha de frente, resistente, brutal e focada em combate corpo a corpo.',
    baseStrength: 8,
    baseVitality: 8,
    baseAgility: 2,
    basePrecision: 2,
    baseTechnique: 5,
    baseWillpower: 5,
  },
  {
    name: 'Assassino',
    description:
      'Classe ágil, furtiva e focada em precisão, evasão e execução.',
    baseStrength: 5,
    baseVitality: 2,
    baseAgility: 8,
    basePrecision: 8,
    baseTechnique: 5,
    baseWillpower: 2,
  },
  {
    name: 'Atirador',
    description:
      'Classe de médio e longo alcance, focada em mira, estabilidade e controle tático.',
    baseStrength: 5,
    baseVitality: 2,
    baseAgility: 8,
    basePrecision: 8,
    baseTechnique: 5,
    baseWillpower: 2,
  },
  {
    name: 'Médico',
    description:
      'Classe de suporte técnico, contenção biológica e sobrevivência clínica.',
    baseStrength: 2,
    baseVitality: 5,
    baseAgility: 2,
    basePrecision: 5,
    baseTechnique: 8,
    baseWillpower: 8,
  },
];
