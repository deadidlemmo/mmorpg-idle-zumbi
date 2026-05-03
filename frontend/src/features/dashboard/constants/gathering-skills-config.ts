import arsenalIcon from '../../../assets/images/gathering/skills/gathering-arsenal.png';
import coletaIcon from '../../../assets/images/gathering/skills/gathering-coleta.png';
import contencaoIcon from '../../../assets/images/gathering/skills/gathering-contencao.png';
import desmancheIcon from '../../../assets/images/gathering/skills/gathering-desmanche.png';
import patrulhaIcon from '../../../assets/images/gathering/skills/gathering-patrulha.png';
import tecnovarreduraIcon from '../../../assets/images/gathering/skills/gathering-tecnovarredura.png';

export type GatheringSkillKey =
  | 'desmanche'
  | 'coleta'
  | 'patrulha'
  | 'arsenal'
  | 'tecnovarredura'
  | 'contencao';

export interface GatheringSkillConfig {
  key: GatheringSkillKey;
  label: string;
  description: string;
  icon: string;
  defaultLevel: number;
  defaultCurrentXp: number;
  defaultXpToNextLevel: number;
}

export interface GatheringSkillViewModel extends GatheringSkillConfig {
  level: number;
  currentXp: number;
  xpToNextLevel: number;
  progressPercent: number;
}

export const GATHERING_SKILLS_CONFIG: GatheringSkillConfig[] = [
  {
    key: 'desmanche',
    label: 'Desmanche',
    description: 'Sucata, chapas, peças e materiais reaproveitáveis.',
    icon: desmancheIcon,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'coleta',
    label: 'Coleta',
    description: 'Recursos básicos, tecidos, suprimentos e materiais gerais.',
    icon: coletaIcon,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'patrulha',
    label: 'Patrulha',
    description: 'Exploração, mobilidade e rastreio de recursos.',
    icon: patrulhaIcon,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'arsenal',
    label: 'Arsenal',
    description: 'Peças ofensivas, munição e componentes de armas.',
    icon: arsenalIcon,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'tecnovarredura',
    label: 'Tecnovarredura',
    description: 'Circuitos, módulos, sensores e tecnologia.',
    icon: tecnovarreduraIcon,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'contencao',
    label: 'Contenção',
    description: 'Filtros, químicos e materiais de controle contaminado.',
    icon: contencaoIcon,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
];

export function normalizeGatheringSkillKey(
  value?: string | null,
): GatheringSkillKey | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');

  if (normalized.includes('desmanche')) return 'desmanche';
  if (normalized.includes('coleta')) return 'coleta';
  if (normalized.includes('patrulha')) return 'patrulha';
  if (normalized.includes('arsenal')) return 'arsenal';
  if (normalized.includes('tecnovarredura')) return 'tecnovarredura';
  if (normalized.includes('tecno-varredura')) return 'tecnovarredura';
  if (normalized.includes('contencao')) return 'contencao';
  if (normalized.includes('contenção')) return 'contencao';

  return null;
}

export function getGatheringSkillConfig(
  key: GatheringSkillKey,
): GatheringSkillConfig {
  return (
    GATHERING_SKILLS_CONFIG.find((skill) => skill.key === key) ??
    GATHERING_SKILLS_CONFIG[0]
  );
}

export function buildDefaultGatheringSkills(): GatheringSkillViewModel[] {
  return GATHERING_SKILLS_CONFIG.map((skill) => ({
    ...skill,
    level: skill.defaultLevel,
    currentXp: skill.defaultCurrentXp,
    xpToNextLevel: skill.defaultXpToNextLevel,
    progressPercent:
      skill.defaultXpToNextLevel > 0
        ? Math.round((skill.defaultCurrentXp / skill.defaultXpToNextLevel) * 100)
        : 0,
  }));
}