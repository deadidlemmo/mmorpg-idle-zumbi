import { GATHERING_ORIGIN_ICON_BY_SKILL_KEY } from '../../gathering/constants/gathering-origin-icons';

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
    icon: GATHERING_ORIGIN_ICON_BY_SKILL_KEY.desmanche,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'coleta',
    label: 'Coleta',
    description: 'Recursos básicos, tecidos, suprimentos e materiais gerais.',
    icon: GATHERING_ORIGIN_ICON_BY_SKILL_KEY.coleta,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'patrulha',
    label: 'Patrulha',
    description: 'Exploração, mobilidade e rastreio de recursos.',
    icon: GATHERING_ORIGIN_ICON_BY_SKILL_KEY.patrulha,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'arsenal',
    label: 'Arsenal',
    description: 'Peças ofensivas, munição e componentes de armas.',
    icon: GATHERING_ORIGIN_ICON_BY_SKILL_KEY.arsenal,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'tecnovarredura',
    label: 'Tecnovarredura',
    description: 'Circuitos, módulos, sensores e tecnologia.',
    icon: GATHERING_ORIGIN_ICON_BY_SKILL_KEY.tecnovarredura,
    defaultLevel: 1,
    defaultCurrentXp: 0,
    defaultXpToNextLevel: 100,
  },
  {
    key: 'contencao',
    label: 'Contenção',
    description: 'Filtros, químicos e materiais de controle contaminado.',
    icon: GATHERING_ORIGIN_ICON_BY_SKILL_KEY.contencao,
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
