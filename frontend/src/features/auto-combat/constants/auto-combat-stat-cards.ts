import statAgilityIcon from '../../../assets/images/stats/attributes/stat-agility.png';
import statPrecisionIcon from '../../../assets/images/stats/attributes/stat-precision.png';
import statStrengthIcon from '../../../assets/images/stats/attributes/stat-strength.png';
import statTechniqueIcon from '../../../assets/images/stats/attributes/stat-technique.png';
import statVitalityIcon from '../../../assets/images/stats/attributes/stat-vitality.png';
import statWillpowerIcon from '../../../assets/images/stats/attributes/stat-willpower.png';
import type { DashboardStats } from '../../dashboard/types/dashboard.types';

export const EMPTY_STATS: DashboardStats = {
  strength: 0,
  vitality: 0,
  agility: 0,
  precision: 0,
  technique: 0,
  willpower: 0,
};

export const STAT_CARDS = [
  {
    key: 'strength',
    className: 'strength',
    label: 'Força',
    description: 'Impacto físico e dano com armas corpo a corpo.',
    icon: statStrengthIcon,
  },
  {
    key: 'vitality',
    className: 'vitality',
    label: 'Vitalidade',
    description: 'Vigor físico, resistência e sobrevivência.',
    icon: statVitalityIcon,
  },
  {
    key: 'agility',
    className: 'agility',
    label: 'Agilidade',
    description: 'Mobilidade, reação e ritmo de movimento.',
    icon: statAgilityIcon,
  },
  {
    key: 'precision',
    className: 'precision',
    label: 'Precisão',
    description: 'Mira, controle e eficiência em ataques certeiros.',
    icon: statPrecisionIcon,
  },
  {
    key: 'technique',
    className: 'technique',
    label: 'Técnica',
    description: 'Uso de equipamentos, ferramentas e recursos táticos.',
    icon: statTechniqueIcon,
  },
  {
    key: 'willpower',
    className: 'willpower',
    label: 'Vontade',
    description: 'Foco, resistência mental e controle sob pressão.',
    icon: statWillpowerIcon,
  },
] as const;
