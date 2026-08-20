import agilityIcon from '../../../assets/images/stats/attributes/stat-agility.webp';
import precisionIcon from '../../../assets/images/stats/attributes/stat-precision.webp';
import strengthIcon from '../../../assets/images/stats/attributes/stat-strength.webp';
import techniqueIcon from '../../../assets/images/stats/attributes/stat-technique.webp';
import vitalityIcon from '../../../assets/images/stats/attributes/stat-vitality.webp';
import willpowerIcon from '../../../assets/images/stats/attributes/stat-willpower.webp';

export type DashboardAttributeKey =
  | 'strength'
  | 'vitality'
  | 'agility'
  | 'precision'
  | 'technique'
  | 'willpower';

export interface DashboardAttributeConfig {
  key: DashboardAttributeKey;
  label: string;
  description: string;
  icon: string;
  tone:
    | 'strength'
    | 'vitality'
    | 'agility'
    | 'precision'
    | 'technique'
    | 'willpower';
}

/**
 * Atributos principais:
 * São a base do personagem e influenciam HP, dano, defesa,
 * velocidade, eficiência com equipamentos e resistência geral.
 */
export const ATTRIBUTE_STATS_CONFIG: DashboardAttributeConfig[] = [
  {
    key: 'strength',
    label: 'Força',
    description: 'Impacto físico e dano com armas corpo a corpo.',
    icon: strengthIcon,
    tone: 'strength',
  },
  {
    key: 'vitality',
    label: 'Vitalidade',
    description: 'Vigor físico, resistência e sobrevivência.',
    icon: vitalityIcon,
    tone: 'vitality',
  },
  {
    key: 'agility',
    label: 'Agilidade',
    description: 'Mobilidade, reação e ritmo de movimento.',
    icon: agilityIcon,
    tone: 'agility',
  },
  {
    key: 'precision',
    label: 'Precisão',
    description: 'Mira, controle e eficiência em ataques certeiros.',
    icon: precisionIcon,
    tone: 'precision',
  },
  {
    key: 'technique',
    label: 'Técnica',
    description: 'Uso de equipamentos, ferramentas e recursos táticos.',
    icon: techniqueIcon,
    tone: 'technique',
  },
  {
    key: 'willpower',
    label: 'Vontade',
    description: 'Foco, resistência mental e controle sob pressão.',
    icon: willpowerIcon,
    tone: 'willpower',
  },
];

export function getStatValue(
  source: Record<string, number | undefined>,
  key: string,
): number {
  return source[key] ?? 0;
}