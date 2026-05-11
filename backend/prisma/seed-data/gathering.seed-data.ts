import { MaterialOrigin } from '@prisma/client';
import type { GatheringSeedData } from '../seed-types';

export const gatheringDefinitions: GatheringSeedData[] = [
  {
    key: 'DESMANCHE',
    label: 'Desmanche',
    description: 'Recuperação de sucata, estruturas pesadas e componentes rígidos.',
    materialOrigin: MaterialOrigin.DESMANCHE,
    statBonus: 'strength',
  },
  {
    key: 'COLETA',
    label: 'Coleta',
    description: 'Coleta de tecidos, couro, suprimentos civis e materiais básicos.',
    materialOrigin: MaterialOrigin.COLETA,
    statBonus: 'vitality',
  },
  {
    key: 'PATRULHA',
    label: 'Patrulha',
    description: 'Rotas de mobilidade, reconhecimento e recuperação de peças leves.',
    materialOrigin: MaterialOrigin.PATRULHA,
    statBonus: 'agility',
  },
  {
    key: 'ARSENAL',
    label: 'Arsenal',
    description: 'Recuperação de munição, mecanismos e partes de armamentos.',
    materialOrigin: MaterialOrigin.ARSENAL,
    statBonus: 'precision',
  },
  {
    key: 'TECNOVARREDURA',
    label: 'Tecnovarredura',
    description: 'Varredura de circuitos, sensores, módulos e ferramentas técnicas.',
    materialOrigin: MaterialOrigin.TECNOVARREDURA,
    statBonus: 'technique',
  },
  {
    key: 'CONTENCAO',
    label: 'Contenção',
    description: 'Recuperação de filtros, lacres e materiais químicos/biológicos controlados.',
    materialOrigin: MaterialOrigin.CONTENCAO,
    statBonus: 'willpower',
  },
];
