import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ActivityProgressCard } from '../../../components/game/ActivityProgressCard';
import npcArsenalNogueira from '../../../assets/images/npcs/npc_arsenal_nogueira.png';
import npcColetaDonaCelia from '../../../assets/images/npcs/npc_coleta_dona_celia.png';
import npcContencaoDrAlvaro from '../../../assets/images/npcs/npc_contencao_dr_alvaro.png';
import npcDesmancheMarta from '../../../assets/images/npcs/npc_desmanche_marta.png';
import npcPatrulhaRafa from '../../../assets/images/npcs/npc_patrulha_rafa.png';
import npcTecnovarreduraLia from '../../../assets/images/npcs/npc_tecnovarredura_lia.png';
import {
  buildMapVisualStyle,
  getMapImageByName,
} from '../../auto-combat/assets/auto-combat-map-assets';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
  DashboardMapViewModel,
} from '../../dashboard/types/dashboard.types';
import {
  extractGatheringApiError,
  listGatheringMaterialsRequest,
} from '../api/gathering.api';
import { GatheringActivityPanel } from '../components/GatheringActivityPanel';
import { GatheringMaterialList } from '../components/GatheringMaterialList';
import { GatheringUsageModal } from '../components/GatheringUsageModal';
import { getGatheringOriginIcon } from '../constants/gathering-origin-icons';
import {
  useGatheringRealtimeActions,
  useGatheringRealtimeState,
} from '../realtime/useGatheringRealtime';
import '../styles/gathering.css';
import type {
  GatheringAllowedOrigin,
  GatheringAvailableMaterialsResponse,
  GatheringMaterialViewModel,
  GatheringSkillViewModel,
  GatheringStatusResponse,
} from '../types/gathering.types';
import {
  getGatheringOriginDescription,
  getGatheringOriginLabel,
  getGatheringMaterialRelatedClasses,
  getGatheringOriginStatLabel,
} from '../types/gathering.types';
import { buildGatheringDashboardCharacter } from '../utils/gathering-dashboard-character';

const DEFAULT_MAP_ID = 'e76bcf38-a357-4bc2-b832-ee9bee2e575f';
const GATHERING_LEVEL_CAP = 50;

const GATHERING_ORIGIN_BY_SLUG = {
  desmanche: 'DESMANCHE',
  coleta: 'COLETA',
  patrulha: 'PATRULHA',
  arsenal: 'ARSENAL',
  tecnovarredura: 'TECNOVARREDURA',
  contencao: 'CONTENCAO',
} as const satisfies Record<string, GatheringAllowedOrigin>;

const WORLD_BOSS_ACTIVITY_LOCK_MESSAGE =
  'Você está aguardando ou participando de um World Boss. Saia do lobby para iniciar gathering.';

type GatheringOriginSlug = keyof typeof GATHERING_ORIGIN_BY_SLUG;

type GatheringClassFilter =
  | 'ALL'
  | 'Lutador'
  | 'Assassino'
  | 'Atirador'
  | 'Médico';

const GATHERING_CLASS_FILTERS: Array<{
  key: GatheringClassFilter;
  label: string;
}> = [
  { key: 'ALL', label: 'Todas' },
  { key: 'Lutador', label: 'Lutador' },
  { key: 'Assassino', label: 'Assassino' },
  { key: 'Atirador', label: 'Atirador' },
  { key: 'Médico', label: 'Médico' },
];

type GatheringClassDropdownOption = {
  value: GatheringClassFilter;
  label: string;
  count: number;
};

type GatheringSkillLoose = Partial<GatheringSkillViewModel> & {
  key?: string | null;
  slug?: string | null;
  type?: string | null;
  name?: string | null;
  origin?: string | null;
};

type GatheringSkillsSummaryLoose = {
  skills?: GatheringSkillLoose[] | null;
  byOrigin?: Partial<
    Record<GatheringAllowedOrigin, GatheringSkillLoose | null>
  > | null;
};

type CharacterOverviewWithGatheringSkills = {
  gatheringSkills?: GatheringSkillsSummaryLoose | GatheringSkillLoose[] | null;
  character?: {
    gatheringSkills?:
      | GatheringSkillsSummaryLoose
      | GatheringSkillLoose[]
      | null;
  } | null;
};

type GatheringActionResponseLike = {
  gatheringSkill?: GatheringSkillLoose | null;
  gatheringProgress?: {
    skill?: GatheringSkillLoose | null;
  } | null;
  collected?: {
    quantity?: number | null;
    name?: string | null;
  } | null;
};

interface OriginLoreViewModel {
  title: string;
  npcName: string;
  npcAvatar: string;
  quote: string;
  description: string;
  riskLabel: string;
  benefitLabel: string;
}

function isGatheringOriginSlug(value?: string): value is GatheringOriginSlug {
  return Boolean(value && value in GATHERING_ORIGIN_BY_SLUG);
}

function getOriginIconFallback(origin: GatheringAllowedOrigin): string {
  return getGatheringOriginLabel(origin).slice(0, 2).toUpperCase();
}

function formatMapLevelRange(
  map?: { minLevel?: number | null; maxLevel?: number | null } | null,
): string | null {
  const minLevel = Number(map?.minLevel);
  const maxLevel = Number(map?.maxLevel);
  const hasMinLevel = Number.isFinite(minLevel) && minLevel > 0;
  const hasMaxLevel = Number.isFinite(maxLevel) && maxLevel > 0;

  if (hasMinLevel && hasMaxLevel) {
    return `Nv. ${minLevel}–${maxLevel}`;
  }

  if (hasMinLevel) {
    return `A partir do Nv. ${minLevel}`;
  }

  if (hasMaxLevel) {
    return `Até Nv. ${maxLevel}`;
  }

  return null;
}

function getMapTierClassName(tier?: number | null): string {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) {
    return 'gathering-map-tier--common';
  }

  if (safeTier >= 9) return 'gathering-map-tier--legendary';
  if (safeTier >= 7) return 'gathering-map-tier--epic';
  if (safeTier >= 5) return 'gathering-map-tier--rare';
  if (safeTier >= 3) return 'gathering-map-tier--uncommon';

  return 'gathering-map-tier--common';
}

function normalizeGatheringOriginKey(
  value?: string | null,
): GatheringAllowedOrigin | null {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const aliases: Record<string, GatheringAllowedOrigin> = {
    DESMANCHE: 'DESMANCHE',
    COLETA: 'COLETA',
    PATRULHA: 'PATRULHA',
    ARSENAL: 'ARSENAL',
    TECNOVARREDURA: 'TECNOVARREDURA',
    TECNO_VARREDURA: 'TECNOVARREDURA',
    CONTENCAO: 'CONTENCAO',
    CONTENCAO_: 'CONTENCAO',
    ['CONTEN\u00c7AO']: 'CONTENCAO',
  };

  return aliases[normalized] ?? null;
}

function getGatheringXpToNextLevel(level: number): number | null {
  if (level >= GATHERING_LEVEL_CAP) {
    return null;
  }

  return Math.max(50, level * 50);
}

function getXpProgressPercent(
  xp: number,
  xpToNextLevel: number | null,
): number {
  if (!xpToNextLevel || xpToNextLevel <= 0) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.floor((xp / xpToNextLevel) * 100)));
}

function getOriginStatInternalName(origin: GatheringAllowedOrigin): string {
  const stats: Record<GatheringAllowedOrigin, string> = {
    DESMANCHE: 'strength',
    COLETA: 'vitality',
    PATRULHA: 'agility',
    ARSENAL: 'precision',
    TECNOVARREDURA: 'technique',
    CONTENCAO: 'willpower',
  };

  return stats[origin];
}

function normalizeGatheringSkillViewModel(
  skill: GatheringSkillLoose,
  origin: GatheringAllowedOrigin,
): GatheringSkillViewModel {
  const level = Math.max(1, Math.floor(Number(skill.level ?? 1)));
  const xp = Math.max(0, Math.floor(Number(skill.xp ?? 0)));
  const totalXp = Math.max(0, Math.floor(Number(skill.totalXp ?? xp)));

  const xpToNextLevel =
    skill.xpToNextLevel === null
      ? null
      : Number.isFinite(Number(skill.xpToNextLevel))
        ? Number(skill.xpToNextLevel)
        : getGatheringXpToNextLevel(level);

  const xpProgressPercent = Number.isFinite(Number(skill.xpProgressPercent))
    ? Math.max(0, Math.min(100, Math.floor(Number(skill.xpProgressPercent))))
    : getXpProgressPercent(xp, xpToNextLevel);

  return {
    ...skill,
    id: String(skill.id ?? `${origin}-local-skill`),
    characterId: String(skill.characterId ?? ''),
    origin,
    level,
    xp,
    totalXp,
    xpToNextLevel,
    xpProgressPercent,
    isAtLevelCap: Boolean(skill.isAtLevelCap ?? level >= GATHERING_LEVEL_CAP),
    isClassAffinity: Boolean(skill.isClassAffinity),
    statBonus: skill.statBonus ?? {
      stat: getOriginStatInternalName(origin),
      label: getGatheringOriginStatLabel(origin).replace('+ ', ''),
      amount: Math.max(0, level - 1) * 2,
    },
    productionBonusPercent:
      typeof skill.productionBonusPercent === 'number'
        ? skill.productionBonusPercent
        : Math.max(0, level - 1) * 3,
    affinityBonus: skill.affinityBonus ?? null,
  } as GatheringSkillViewModel;
}

function getSkillOrigin(
  skill?: GatheringSkillLoose | null,
): GatheringAllowedOrigin | null {
  if (!skill) return null;

  return (
    normalizeGatheringOriginKey(skill.origin) ??
    normalizeGatheringOriginKey(skill.key) ??
    normalizeGatheringOriginKey(skill.slug) ??
    normalizeGatheringOriginKey(skill.type) ??
    normalizeGatheringOriginKey(skill.name)
  );
}

function extractSkillFromCollection(
  collection:
    | GatheringSkillsSummaryLoose
    | GatheringSkillLoose[]
    | null
    | undefined,
  origin: GatheringAllowedOrigin,
): GatheringSkillViewModel | null {
  if (!collection) return null;

  if (Array.isArray(collection)) {
    const found = collection.find((skill) => getSkillOrigin(skill) === origin);

    return found ? normalizeGatheringSkillViewModel(found, origin) : null;
  }

  const byOriginSkill = collection.byOrigin?.[origin];

  if (byOriginSkill) {
    return normalizeGatheringSkillViewModel(byOriginSkill, origin);
  }

  const found = collection.skills?.find(
    (skill) => getSkillOrigin(skill) === origin,
  );

  return found ? normalizeGatheringSkillViewModel(found, origin) : null;
}

function getOverviewGatheringSkill(params: {
  overview: unknown;
  origin: GatheringAllowedOrigin;
}): GatheringSkillViewModel | null {
  const overview =
    params.overview as CharacterOverviewWithGatheringSkills | null;

  return (
    extractSkillFromCollection(overview?.gatheringSkills, params.origin) ??
    extractSkillFromCollection(
      overview?.character?.gatheringSkills,
      params.origin,
    ) ??
    null
  );
}

function getStatusGatheringSkill(
  status?: GatheringStatusResponse | null,
  origin?: GatheringAllowedOrigin | null,
): GatheringSkillViewModel | null {
  if (!status?.active || !origin) return null;

  if (status.gatheringSkill?.origin === origin) {
    return normalizeGatheringSkillViewModel(status.gatheringSkill, origin);
  }

  if (status.session.gatheringSkill?.origin === origin) {
    return normalizeGatheringSkillViewModel(
      status.session.gatheringSkill,
      origin,
    );
  }

  return null;
}

function getActionResponseGatheringSkill(params: {
  response: unknown;
  origin: GatheringAllowedOrigin;
}): GatheringSkillViewModel | null {
  const response = params.response as GatheringActionResponseLike | null;

  const directSkill = response?.gatheringSkill;
  const progressSkill = response?.gatheringProgress?.skill;

  if (getSkillOrigin(directSkill) === params.origin && directSkill) {
    return normalizeGatheringSkillViewModel(directSkill, params.origin);
  }

  if (getSkillOrigin(progressSkill) === params.origin && progressSkill) {
    return normalizeGatheringSkillViewModel(progressSkill, params.origin);
  }

  return null;
}

function getOverviewCurrentMap(
  overview?: CharacterOverviewResponse | null,
): DashboardMapViewModel | null {
  return (
    overview?.character.currentMap ??
    overview?.character.map ??
    overview?.progression?.currentMap ??
    null
  );
}

function getStatusMapId(params: {
  status?: GatheringStatusResponse | null;
  overview?: CharacterOverviewResponse | null;
  currentMap?: DashboardMapViewModel | null;
}): string {
  if (params.status?.active && params.status.session.map?.id) {
    return params.status.session.map.id;
  }

  return (
    params.currentMap?.id ??
    getOverviewCurrentMap(params.overview)?.id ??
    DEFAULT_MAP_ID
  );
}

function getActiveMaterialId(
  status?: GatheringStatusResponse | null,
): string | null {
  if (!status?.active) return null;

  return status.session.targetMaterial?.id ?? null;
}

function getActiveOrigin(
  status?: GatheringStatusResponse | null,
): string | null {
  if (!status?.active) return null;

  return String(status.session.origin ?? '');
}

function getInitialSelectedMaterialId(params: {
  materials: GatheringMaterialViewModel[];
  previousSelectedMaterialId?: string | null;
  activeMaterialId?: string | null;
}): string | null {
  const previousStillExists = params.materials.some(
    (material) => material.id === params.previousSelectedMaterialId,
  );

  if (previousStillExists && params.previousSelectedMaterialId) {
    return params.previousSelectedMaterialId;
  }

  const activeStillExists = params.materials.some(
    (material) => material.id === params.activeMaterialId,
  );

  if (activeStillExists && params.activeMaterialId) {
    return params.activeMaterialId;
  }

  return params.materials[0]?.id ?? null;
}

function getCollectedFeedback(params: {
  response: unknown;
  successPrefix: string;
  emptyMessage: string;
}): string {
  const actionResponse = params.response as GatheringActionResponseLike | null;
  const quantity = Number(actionResponse?.collected?.quantity ?? 0);
  const safeQuantity = Number.isFinite(quantity)
    ? Math.max(0, Math.floor(quantity))
    : 0;
  const materialName = actionResponse?.collected?.name ?? 'material';

  if (safeQuantity > 0) {
    return `${params.successPrefix}: +${safeQuantity} ${materialName}.`;
  }

  return params.emptyMessage;
}

function getOriginLore(origin: GatheringAllowedOrigin): OriginLoreViewModel {
  const loreByOrigin: Record<GatheringAllowedOrigin, OriginLoreViewModel> = {
    DESMANCHE: {
      title: 'Sucata útil não nasce pronta',
      npcName: 'Marta, a desmontadora',
      npcAvatar: npcDesmancheMarta,
      quote:
        'Se ainda está de pé, dá para desmontar. Se já caiu, dá para aproveitar melhor ainda.',
      description:
        'Vasculhe estruturas danificadas, ferragens, carcaças e peças pesadas para alimentar receitas de força, armas brutas e reforços improvisados.',
      riskLabel: 'Risco: cortes, ruído e peso excessivo',
      benefitLabel: '+ Força ao evoluir',
    },
    COLETA: {
      title: 'Sobrevivência começa pelo básico',
      npcName: 'Dona Célia, triagem do abrigo',
      npcAvatar: npcColetaDonaCelia,
      quote:
        'Pano seco, couro limpo e suprimento separado salvam mais gente do que parece.',
      description:
        'Recupere fibras, tecidos, couro, recipientes e materiais de suporte usados em proteções, roupas e itens de sustentação.',
      riskLabel: 'Risco: contaminação leve e escassez',
      benefitLabel: '+ Vitalidade ao evoluir',
    },
    PATRULHA: {
      title: 'Quem conhece o caminho volta vivo',
      npcName: 'Rafa, batedor avançado',
      npcAvatar: npcPatrulhaRafa,
      quote:
        'A rua muda toda noite. Marca a rota, pisa leve e volta antes do barulho aumentar.',
      description:
        'Percorra rotas inseguras, atalhos, telhados e acessos laterais para encontrar peças ligadas a mobilidade, encaixes e deslocamento.',
      riskLabel: 'Risco: emboscadas e rotas instáveis',
      benefitLabel: '+ Agilidade ao evoluir',
    },
    ARSENAL: {
      title: 'Precisão depende de manutenção',
      npcName: 'Nogueira, armeiro do abrigo',
      npcAvatar: npcArsenalNogueira,
      quote:
        'Munição ruim falha na pior hora. Mecanismo sujo também. Aqui nada passa sem revisão.',
      description:
        'Recupere componentes de armas, mecanismos, cartuchos, peças calibradas e materiais usados em equipamentos de precisão.',
      riskLabel: 'Risco: disparos, travas e ruído',
      benefitLabel: '+ Precisão ao evoluir',
    },
    TECNOVARREDURA: {
      title: 'Sinal fraco ainda é sinal',
      npcName: 'Lia, técnica de varredura',
      npcAvatar: npcTecnovarreduraLia,
      quote:
        'Circuito queimado também conta história. Só precisa saber onde medir.',
      description:
        'Rastreie sensores, placas, cabos, módulos, ferramentas e componentes técnicos para receitas avançadas e equipamentos inteligentes.',
      riskLabel: 'Risco: curto, energia residual e alarmes',
      benefitLabel: '+ Técnica ao evoluir',
    },
    CONTENCAO: {
      title: 'Controle antes da contaminação',
      npcName: 'Dr. Álvaro, contenção química',
      npcAvatar: npcContencaoDrAlvaro,
      quote:
        'Filtro vencido ainda filtra poeira. Lacre intacto ainda compra tempo. Tempo é vida.',
      description:
        'Recupere filtros, lacres, reagentes, materiais químicos controlados e itens de isolamento usados em proteção biológica e suporte médico.',
      riskLabel: 'Risco: vazamento químico e exposição biológica',
      benefitLabel: '+ Vontade ao evoluir',
    },
  };

  return loreByOrigin[origin];
}

function getSkillLevelLabel(skill?: GatheringSkillViewModel | null): string {
  const level = Math.max(1, Math.floor(Number(skill?.level ?? 1)));

  return `Nv. ${level}`;
}

function getSkillXpNeededLabel(skill?: GatheringSkillViewModel | null): string {
  if (!skill) {
    return '50 XP necessários';
  }

  if (skill.isAtLevelCap || skill.xpToNextLevel === null) {
    return 'XP completo';
  }

  const currentXp = Math.max(0, Math.floor(Number(skill.xp ?? 0)));
  const xpToNextLevel = Math.max(0, Math.floor(Number(skill.xpToNextLevel)));
  const xpNeeded = Math.max(0, xpToNextLevel - currentXp);

  return `${xpNeeded.toLocaleString('pt-BR')} XP necessários`;
}

function getSkillProgressPercent(
  skill?: GatheringSkillViewModel | null,
): number {
  const percent = Number(skill?.xpProgressPercent ?? 0);

  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(percent)));
}

function areGatheringSkillsEquivalent(
  current?: GatheringSkillViewModel | null,
  next?: GatheringSkillViewModel | null,
): boolean {
  if (current === next) return true;
  if (!current || !next) return false;

  return (
    current.id === next.id &&
    current.origin === next.origin &&
    Number(current.level ?? 1) === Number(next.level ?? 1) &&
    Number(current.xp ?? 0) === Number(next.xp ?? 0) &&
    Number(current.totalXp ?? 0) === Number(next.totalXp ?? 0) &&
    Number(current.xpToNextLevel ?? 0) === Number(next.xpToNextLevel ?? 0) &&
    Number(current.xpProgressPercent ?? 0) ===
      Number(next.xpProgressPercent ?? 0) &&
    Boolean(current.isAtLevelCap) === Boolean(next.isAtLevelCap) &&
    Number(current.productionBonusPercent ?? 0) ===
      Number(next.productionBonusPercent ?? 0) &&
    Number(current.statBonus?.amount ?? 0) ===
      Number(next.statBonus?.amount ?? 0)
  );
}

function getNextGatheringSkillState(
  current: GatheringSkillViewModel | null,
  next?: GatheringSkillViewModel | null,
): GatheringSkillViewModel | null {
  if (!next) return current;

  return areGatheringSkillsEquivalent(current, next) ? current : next;
}

function normalizeClassFilterValue(value?: string | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function materialMatchesClassFilter(
  material: GatheringMaterialViewModel,
  classFilter: GatheringClassFilter,
): boolean {
  if (classFilter === 'ALL') return true;

  const targetClass = normalizeClassFilterValue(classFilter);

  return getGatheringMaterialRelatedClasses(material).some(
    (className) => normalizeClassFilterValue(className) === targetClass,
  );
}

function countMaterialsByClass(materials: GatheringMaterialViewModel[]) {
  return GATHERING_CLASS_FILTERS.reduce(
    (accumulator, option) => {
      accumulator[option.key] =
        option.key === 'ALL'
          ? materials.length
          : materials.filter((material) =>
              materialMatchesClassFilter(material, option.key),
            ).length;

      return accumulator;
    },
    {} as Record<GatheringClassFilter, number>,
  );
}

function GatheringClassDropdown({
  value,
  options,
  onChange,
}: {
  value: GatheringClassFilter;
  options: GatheringClassDropdownOption[];
  onChange: (value: GatheringClassFilter) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="gathering-class-dropdown-filter">
      <span>Classe</span>

      <div
        className="gathering-class-dropdown"
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;

          if (
            nextFocus instanceof Node &&
            event.currentTarget.contains(nextFocus)
          ) {
            return;
          }

          setIsOpen(false);
        }}
      >
        <button
          type="button"
          className="gathering-class-dropdown__button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="gathering-class-dropdown__value">
            {selectedOption?.label ?? 'Todas'}
          </span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>

        {isOpen ? (
          <div className="gathering-class-dropdown__menu" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={[
                  'gathering-class-dropdown__option',
                  option.value === value ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span>{option.label}</span>
                <em>{option.count}</em>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function GatheringOriginPage() {
  const { characterId, origin } = useParams();

  const safeCharacterId = characterId ?? '';
  const originKey = isGatheringOriginSlug(origin)
    ? GATHERING_ORIGIN_BY_SLUG[origin]
    : null;

  const gatheringRealtimeState = useGatheringRealtimeState();
  const {
    refresh: refreshGathering,
    start: startGathering,
    collect: collectGathering,
    stop: stopGathering,
  } = useGatheringRealtimeActions();

  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);

  const [materialsResponse, setMaterialsResponse] =
    useState<GatheringAvailableMaterialsResponse | null>(null);

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );
  const [usageMaterial, setUsageMaterial] =
    useState<GatheringMaterialViewModel | null>(null);
  const [classFilter, setClassFilter] =
    useState<GatheringClassFilter>('ALL');

  const [overviewGatheringSkill, setOverviewGatheringSkill] =
    useState<GatheringSkillViewModel | null>(null);
  const [lastKnownGatheringSkill, setLastKnownGatheringSkill] =
    useState<GatheringSkillViewModel | null>(null);
  const [hasActiveWorldBoss, setHasActiveWorldBoss] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isPageBusy, setIsPageBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pageErrorMessage, setPageErrorMessage] = useState<string | null>(null);

  const status = gatheringRealtimeState.status;
  const isBusy = isPageBusy || gatheringRealtimeState.isBusy;
  const errorMessage = pageErrorMessage ?? gatheringRealtimeState.errorMessage;

  const originLabel = originKey
    ? getGatheringOriginLabel(originKey)
    : 'Gathering';
  const originDescription = originKey
    ? getGatheringOriginDescription(originKey)
    : 'Expedição idle para obtenção de materiais.';
  const originLore = originKey ? getOriginLore(originKey) : null;
  const originIcon = originKey ? getGatheringOriginIcon(originKey) : null;
  const originStatLabel = originKey
    ? getGatheringOriginStatLabel(originKey)
    : 'Progressão';
  const originActivityClassName = origin ? `is-${origin}` : '';
  const originQuote = `“${
    originLore?.quote ??
    'Toda expedição deixa alguma coisa para trás. O segredo é saber o que vale carregar.'
  }”`;

  const materials = useMemo(
    () => materialsResponse?.materials ?? [],
    [materialsResponse?.materials],
  );
  const materialClassCounts = useMemo(
    () => countMaterialsByClass(materials),
    [materials],
  );
  const classFilterOptions = useMemo<GatheringClassDropdownOption[]>(
    () =>
      GATHERING_CLASS_FILTERS.map((option) => {
        const count = materialClassCounts[option.key] ?? 0;

        return {
          value: option.key,
          label: option.label,
          count,
        };
      }),
    [materialClassCounts],
  );
  const filteredMaterials = useMemo(
    () =>
      materials.filter((material) =>
        materialMatchesClassFilter(material, classFilter),
      ),
    [classFilter, materials],
  );
  const activeClassFilterLabel =
    GATHERING_CLASS_FILTERS.find((option) => option.key === classFilter)
      ?.label ?? 'Todas';
  const currentMap = materialsResponse?.map ?? null;
  const currentMapName = currentMap?.name ?? 'Mapa não identificado';
  const currentMapImage = getMapImageByName(currentMap?.name);
  const currentMapVisualStyle = buildMapVisualStyle(currentMapImage);
  const currentMapLevelRangeLabel = formatMapLevelRange(currentMap);
  const currentMapTierClassName = getMapTierClassName(currentMap?.tier);
  const fallbackRatePerHour = materialsResponse?.ratePerHour ?? null;

  const activeMaterialId = getActiveMaterialId(status);
  const activeOrigin = getActiveOrigin(status);
  const hasActiveGatheringSession = status?.active === true;
  const isCurrentOriginActive = activeOrigin === originKey;

  const gatheringSkill = useMemo(() => {
    const activeSkill = getStatusGatheringSkill(status, originKey);

    if (activeSkill) {
      return activeSkill;
    }

    if (
      originKey &&
      gatheringRealtimeState.gatheringSkill?.origin === originKey
    ) {
      return normalizeGatheringSkillViewModel(
        gatheringRealtimeState.gatheringSkill,
        originKey,
      );
    }

    if (overviewGatheringSkill?.origin === originKey) {
      return overviewGatheringSkill;
    }

    if (lastKnownGatheringSkill?.origin === originKey) {
      return lastKnownGatheringSkill;
    }

    return null;
  }, [
    gatheringRealtimeState.gatheringSkill,
    lastKnownGatheringSkill,
    originKey,
    overviewGatheringSkill,
    status,
  ]);

  useEffect(() => {
    if (!gatheringSkill) return;

    let isCancelled = false;

    queueMicrotask(() => {
      if (isCancelled) return;

      setLastKnownGatheringSkill((currentSkill) =>
        getNextGatheringSkillState(currentSkill, gatheringSkill),
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [gatheringSkill]);

  const selectedMaterial = useMemo(
    () =>
      filteredMaterials.find((material) => material.id === selectedMaterialId) ??
      filteredMaterials[0] ??
      null,
    [filteredMaterials, selectedMaterialId],
  );

  const skillProgressPercent = getSkillProgressPercent(gatheringSkill);

  const loadGatheringData = useCallback(async () => {
    if (!safeCharacterId || !originKey) return;

    setIsLoading(true);
    setPageErrorMessage(null);

    try {
      const [overviewResponse, statusResponse] = await Promise.all([
        getCharacterOverview(safeCharacterId),
        refreshGathering(),
      ]);

      const mapId = getStatusMapId({
        status: statusResponse,
        overview: overviewResponse,
      });

      const availableMaterialsResponse = await listGatheringMaterialsRequest({
        mapId,
        origin: originKey,
      });

      const overviewSkill = getOverviewGatheringSkill({
        overview: overviewResponse,
        origin: originKey,
      });

      const activeSkill = getStatusGatheringSkill(statusResponse, originKey);

      setCharacter(buildGatheringDashboardCharacter(overviewResponse));
      setHasActiveWorldBoss(
        Boolean(overviewResponse.activity?.hasActiveWorldBoss),
      );
      setOverviewGatheringSkill((currentSkill) =>
        areGatheringSkillsEquivalent(currentSkill, overviewSkill)
          ? currentSkill
          : overviewSkill,
      );

      if (activeSkill ?? overviewSkill) {
        setLastKnownGatheringSkill((currentSkill) =>
          getNextGatheringSkillState(
            currentSkill,
            activeSkill ?? overviewSkill,
          ),
        );
      }

      setMaterialsResponse(availableMaterialsResponse);

      setSelectedMaterialId((previousSelectedMaterialId) =>
        getInitialSelectedMaterialId({
          materials: availableMaterialsResponse.materials,
          previousSelectedMaterialId,
          activeMaterialId: getActiveMaterialId(statusResponse),
        }),
      );
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, [originKey, refreshGathering, safeCharacterId]);

  useEffect(() => {
    let isCancelled = false;

    queueMicrotask(() => {
      if (isCancelled) return;

      void loadGatheringData();
    });

    return () => {
      isCancelled = true;
    };
  }, [loadGatheringData]);

  const handleRefreshActivity = useCallback(async () => {
    await refreshGathering();
  }, [refreshGathering]);

  async function handleStartMaterial(material: GatheringMaterialViewModel) {
    if (isBusy || !safeCharacterId || !originKey) return;

    if (hasActiveWorldBoss) {
      setPageErrorMessage(WORLD_BOSS_ACTIVITY_LOCK_MESSAGE);
      setFeedback(null);
      return;
    }

    setIsPageBusy(true);
    setPageErrorMessage(null);
    setFeedback(null);

    try {
      const mapId = getStatusMapId({
        status,
        currentMap:
          currentMap ?? character?.currentMap ?? character?.map ?? null,
      });

      const response = await startGathering({
        mapId,
        origin: originKey,
        targetMaterialId: material.id,
      });

      if (!response) {
        setPageErrorMessage('Não foi possível iniciar esta coleta.');
        return;
      }

      const responseSkill = getActionResponseGatheringSkill({
        response,
        origin: originKey,
      });

      if (responseSkill) {
        setLastKnownGatheringSkill((currentSkill) =>
          getNextGatheringSkillState(currentSkill, responseSkill),
        );
      }

      setSelectedMaterialId(material.id);
      setUsageMaterial(null);
      setFeedback(`Coleta iniciada: ${material.name}.`);
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsPageBusy(false);
    }
  }

  async function handleCollect() {
    if (isBusy || !safeCharacterId || !originKey) return;

    setIsPageBusy(true);
    setPageErrorMessage(null);
    setFeedback(null);

    try {
      const response = await collectGathering();

      const responseSkill = getActionResponseGatheringSkill({
        response,
        origin: originKey,
      });

      if (responseSkill) {
        setLastKnownGatheringSkill((currentSkill) =>
          getNextGatheringSkillState(currentSkill, responseSkill),
        );
      }

      setFeedback(
        getCollectedFeedback({
          response,
          successPrefix: 'Coleta realizada',
          emptyMessage: 'Nenhuma unidade pronta para coletar ainda.',
        }),
      );
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsPageBusy(false);
    }
  }

  async function handleStop() {
    if (isBusy || !safeCharacterId || !originKey) return;

    setIsPageBusy(true);
    setPageErrorMessage(null);
    setFeedback(null);

    try {
      const response = await stopGathering();

      const responseSkill = getActionResponseGatheringSkill({
        response,
        origin: originKey,
      });

      if (responseSkill) {
        setLastKnownGatheringSkill((currentSkill) =>
          getNextGatheringSkillState(currentSkill, responseSkill),
        );
      }

      setFeedback(
        getCollectedFeedback({
          response,
          successPrefix: 'Gathering encerrado. Coletado',
          emptyMessage: 'Gathering encerrado.',
        }),
      );
    } catch (error) {
      setPageErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsPageBusy(false);
    }
  }

  function handleSelectMaterial(material: GatheringMaterialViewModel) {
    setSelectedMaterialId(material.id);
  }

  function handleViewMaterialUsage(material: GatheringMaterialViewModel) {
    setUsageMaterial(material);
  }

  function handleCloseUsageModal() {
    setUsageMaterial(null);
  }

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (!originKey) {
    return <Navigate to={`/dashboard/${safeCharacterId}/gathering`} replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando expedição...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar expedição</h1>
        <p>{errorMessage || 'Não foi possível carregar este personagem.'}</p>

        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="gathering-page gathering-page--clean gathering-page--origin">
        <div className="gathering-origin-shell">
          <header className="gathering-origin-topbar">
            <div className="gathering-origin-topbar__main">
              <span className="gathering-page__eyebrow">Expedições</span>
              <h1>{originLabel}</h1>
              <p>{originDescription}</p>
            </div>

            <div className="gathering-origin-topbar__actions">
              <Link
                to={`/dashboard/${safeCharacterId}/gathering`}
                className="gathering-button gathering-button--secondary"
              >
                Voltar
              </Link>

              <button
                type="button"
                className="gathering-button"
                onClick={() => void loadGatheringData()}
                disabled={isLoading || isBusy}
              >
                Atualizar
              </button>
            </div>
          </header>

          {errorMessage ? (
            <div className="gathering-feedback gathering-feedback--error">
              {errorMessage}
            </div>
          ) : null}

          {feedback ? (
            <div className="gathering-feedback gathering-feedback--success">
              {feedback}
            </div>
          ) : null}

          {hasActiveWorldBoss ? (
            <div className="gathering-feedback gathering-feedback--error">
              {WORLD_BOSS_ACTIVITY_LOCK_MESSAGE}
            </div>
          ) : null}

          <section className="gathering-origin-intro-grid">
            <article
              className="gathering-origin-lore-card gathering-origin-lore-card--npc gathering-origin-npc"
              aria-label={`Guia de ${originLabel}`}
            >
              <div className="gathering-origin-npc__stage" aria-hidden="true">
                <div className="gathering-origin-npc__portrait">
                  {originLore?.npcAvatar ? (
                    <img src={originLore.npcAvatar} alt="" />
                  ) : (
                    <span>
                      {originKey ? getOriginIconFallback(originKey) : 'GA'}
                    </span>
                  )}
                </div>
              </div>

              <div className="gathering-origin-npc__content">
                <div className="gathering-origin-npc__meta">
                  <strong className="gathering-origin-npc__name">
                    {originLore?.npcName ?? 'Especialista do abrigo'}
                  </strong>

                  <span className="gathering-origin-npc__role">
                    Serviço de {originLabel}
                  </span>
                </div>

                <h2>{originLore?.title ?? originLabel}</h2>

                <blockquote>{originQuote}</blockquote>

                <p>{originLore?.description ?? originDescription}</p>
              </div>
            </article>
          </section>

          <section
            className={[
              'gathering-origin-map-context',
              'gathering-origin-map-context--standalone',
              currentMapTierClassName,
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`Mapa atual: ${currentMapName}`}
          >
            <div
              className="gathering-origin-map-context__media"
              style={currentMapVisualStyle}
            >
              {!currentMapImage ? (
                <span aria-hidden="true">
                  {currentMapName.slice(0, 2).toUpperCase()}
                </span>
              ) : null}
            </div>

            <div className="gathering-origin-map-context__body">
              <span className="gathering-origin-map-context__eyebrow">
                Mapa atual
              </span>

              <div className="gathering-origin-map-context__title-row">
                <h2>{currentMapName}</h2>

                <div className="gathering-origin-map-context__chips">
                  {currentMap?.tier ? (
                    <span className="gathering-origin-map-context__chip gathering-origin-map-context__chip--tier">
                      Tier {currentMap.tier}
                    </span>
                  ) : null}

                  {currentMapLevelRangeLabel ? (
                    <span className="gathering-origin-map-context__chip gathering-origin-map-context__chip--level">
                      {currentMapLevelRangeLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <aside className="gathering-origin-premium-card">
            <div
              className="gathering-origin-premium-card__badge"
              aria-hidden="true"
            >
              i
            </div>

            <div>
              <h2>Benefícios premium</h2>
              <p>Fila, bônus e notificações avançadas para expedições.</p>
            </div>

            <button
              type="button"
              className="gathering-origin-premium-card__button"
            >
              Ver benefícios
            </button>
          </aside>

          <section
            className="gathering-origin-content-grid"
            aria-label="Materiais e status da expedição"
          >
            <main className="gathering-origin-main">
              <section className="gathering-card gathering-card--compact gathering-origin-materials-panel">
                <header className="gathering-origin-materials-panel__header">
                  <div className="gathering-card__title-group gathering-origin-materials-panel__title-group">
                    <span className="gathering-card__eyebrow">Materiais</span>
                    <h2>Materiais deste mapa</h2>
                  </div>
                </header>

                <div
                  className="gathering-material-class-filter"
                  aria-label="Filtrar materiais por classe"
                >
                  <div className="gathering-material-class-filter__copy">
                    <strong>Filtrar por classe</strong>
                    <span>
                      Veja apenas materiais que entram em receitas dessa classe.
                    </span>
                  </div>

                  <GatheringClassDropdown
                    value={classFilter}
                    options={classFilterOptions}
                    onChange={setClassFilter}
                  />
                </div>

                {isLoading ? (
                  <div className="gathering-loading">
                    <span className="gathering-loading__spinner" />
                    <p>Carregando materiais...</p>
                  </div>
                ) : (
                  <GatheringMaterialList
                    materials={filteredMaterials}
                    totalMaterialsCount={materials.length}
                    activeClassFilterLabel={activeClassFilterLabel}
                    isClassFiltered={classFilter !== 'ALL'}
                    gatheringSkill={gatheringSkill}
                    fallbackRatePerHour={fallbackRatePerHour}
                    selectedMaterialId={selectedMaterial?.id ?? null}
                    activeMaterialId={
                      isCurrentOriginActive ? activeMaterialId : null
                    }
                    isBusy={isBusy}
                    isStartDisabled={hasActiveWorldBoss}
                    startDisabledReason={WORLD_BOSS_ACTIVITY_LOCK_MESSAGE}
                    onSelectMaterial={handleSelectMaterial}
                    onStartMaterial={handleStartMaterial}
                    onViewMaterialUsage={handleViewMaterialUsage}
                  />
                )}
              </section>
            </main>

            <aside className="gathering-origin-side gathering-origin-side--stacked">
              {hasActiveGatheringSession ? (
                <section className="gathering-origin-side-section gathering-origin-side-section--current">
                  <div className="gathering-origin-section-divider">
                    <span>Atividade atual</span>
                  </div>

                  <GatheringActivityPanel
                    cardClassName={[
                      'gathering-card',
                      'gathering-card--active',
                      'gathering-origin-current-card',
                      'auto-combat-hunt-skill-card--with-controls',
                      originActivityClassName,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    status={status}
                    origin={originKey}
                    activityLabel={originLabel}
                    productionPreview={gatheringRealtimeState.productionPreview}
                    gatheringSkill={gatheringSkill}
                    isBusy={isBusy}
                    onCollect={handleCollect}
                    onStop={handleStop}
                    onRefresh={handleRefreshActivity}
                  />
                </section>
              ) : null}

              <section className="gathering-origin-side-section gathering-origin-side-section--progress">
                <div className="gathering-origin-section-divider">
                  <span>Sua proficiência</span>
                </div>

                <ActivityProgressCard
                  className={[
                    'gathering-card',
                    'gathering-origin-skill-card',
                    originActivityClassName,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  icon={
                    originIcon ? (
                      <img src={originIcon} alt="" draggable={false} />
                    ) : (
                      getOriginIconFallback(originKey)
                    )
                  }
                  label={originLabel}
                  badge={getSkillLevelLabel(gatheringSkill)}
                  progressPercent={skillProgressPercent}
                  progressLabel={'Progresso da profici\u00eancia'}
                  pills={[
                    {
                      content: getSkillXpNeededLabel(gatheringSkill),
                      key: 'xp-needed',
                    },
                    {
                      content: `${skillProgressPercent}%`,
                      key: 'progress',
                    },
                    {
                      content: originStatLabel,
                      key: 'stat',
                    },
                  ]}
                />
              </section>
            </aside>
          </section>

          <GatheringUsageModal
            isOpen={Boolean(usageMaterial)}
            material={usageMaterial}
            gatheringSkill={gatheringSkill}
            fallbackRatePerHour={fallbackRatePerHour}
            isBusy={isBusy}
            isStartDisabled={hasActiveWorldBoss}
            startDisabledReason={WORLD_BOSS_ACTIVITY_LOCK_MESSAGE}
            onStart={handleStartMaterial}
            onClose={handleCloseUsageModal}
          />
        </div>
      </section>
    </DashboardLayout>
  );
}

export default GatheringOriginPage;
