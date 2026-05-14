import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  buildMapVisualStyle,
  getMapImageByName,
} from '../../auto-combat/assets/auto-combat-map-assets';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import {
  extractGatheringApiError,
  listGatheringMaterialsRequest,
} from '../api/gathering.api';
import { GatheringActivityPanel } from '../components/GatheringActivityPanel';
import { GatheringMaterialList } from '../components/GatheringMaterialList';
import { GatheringUsageModal } from '../components/GatheringUsageModal';
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

type GatheringOriginSlug = keyof typeof GATHERING_ORIGIN_BY_SLUG;

type GatheringSkillLoose = Partial<GatheringSkillViewModel> & {
  key?: string | null;
  slug?: string | null;
  type?: string | null;
  name?: string | null;
  origin?: string | null;
};

type GatheringSkillsSummaryLoose = {
  skills?: GatheringSkillLoose[] | null;
  byOrigin?: Partial<Record<GatheringAllowedOrigin, GatheringSkillLoose | null>> | null;
};

type CharacterOverviewWithGatheringSkills = {
  gatheringSkills?: GatheringSkillsSummaryLoose | GatheringSkillLoose[] | null;
  character?: {
    gatheringSkills?: GatheringSkillsSummaryLoose | GatheringSkillLoose[] | null;
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
    CONTENÇÃO: 'CONTENCAO',
  };

  return aliases[normalized] ?? null;
}

function getGatheringXpToNextLevel(level: number): number | null {
  if (level >= GATHERING_LEVEL_CAP) {
    return null;
  }

  return Math.max(50, level * 50);
}

function getXpProgressPercent(xp: number, xpToNextLevel: number | null): number {
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
    statBonus:
      skill.statBonus ?? {
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

  const found = collection.skills?.find((skill) => getSkillOrigin(skill) === origin);

  return found ? normalizeGatheringSkillViewModel(found, origin) : null;
}

function getOverviewGatheringSkill(params: {
  overview: unknown;
  origin: GatheringAllowedOrigin;
}): GatheringSkillViewModel | null {
  const overview = params.overview as CharacterOverviewWithGatheringSkills | null;

  return (
    extractSkillFromCollection(overview?.gatheringSkills, params.origin) ??
    extractSkillFromCollection(overview?.character?.gatheringSkills, params.origin) ??
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
    return normalizeGatheringSkillViewModel(status.session.gatheringSkill, origin);
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

function getStatusMapId(status?: GatheringStatusResponse | null): string {
  if (status?.active && status.session.map?.id) {
    return status.session.map.id;
  }

  return DEFAULT_MAP_ID;
}

function getActiveMaterialId(
  status?: GatheringStatusResponse | null,
): string | null {
  if (!status?.active) return null;

  return status.session.targetMaterial?.id ?? null;
}

function getActiveOrigin(status?: GatheringStatusResponse | null): string | null {
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
    return 'Nível máximo';
  }

  const currentXp = Math.max(0, Math.floor(Number(skill.xp ?? 0)));
  const xpToNextLevel = Math.max(0, Math.floor(Number(skill.xpToNextLevel)));
  const xpNeeded = Math.max(0, xpToNextLevel - currentXp);

  return `${xpNeeded.toLocaleString('pt-BR')} XP necessários`;
}

function getSkillProgressPercent(skill?: GatheringSkillViewModel | null): number {
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
    Number(current.statBonus?.amount ?? 0) === Number(next.statBonus?.amount ?? 0)
  );
}

function getNextGatheringSkillState(
  current: GatheringSkillViewModel | null,
  next?: GatheringSkillViewModel | null,
): GatheringSkillViewModel | null {
  if (!next) return current;

  return areGatheringSkillsEquivalent(current, next) ? current : next;
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

  const [overviewGatheringSkill, setOverviewGatheringSkill] =
    useState<GatheringSkillViewModel | null>(null);
  const [lastKnownGatheringSkill, setLastKnownGatheringSkill] =
    useState<GatheringSkillViewModel | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPageBusy, setIsPageBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pageErrorMessage, setPageErrorMessage] = useState<string | null>(null);
  const [isSkillPanelExpanded, setIsSkillPanelExpanded] = useState(true);

  const status = gatheringRealtimeState.status;
  const isBusy = isPageBusy || gatheringRealtimeState.isBusy;
  const errorMessage = pageErrorMessage ?? gatheringRealtimeState.errorMessage;

  const originLabel = originKey ? getGatheringOriginLabel(originKey) : 'Gathering';
  const originDescription = originKey
    ? getGatheringOriginDescription(originKey)
    : 'Expedição idle para obtenção de materiais.';
  const originLore = originKey ? getOriginLore(originKey) : null;

  const materials = materialsResponse?.materials ?? [];
  const currentMap = materialsResponse?.map ?? null;
  const currentMapName = currentMap?.name ?? 'Mapa não identificado';
  const currentMapImage = getMapImageByName(currentMap?.name);
  const currentMapVisualStyle = buildMapVisualStyle(currentMapImage);
  const currentMapLevelRangeLabel = formatMapLevelRange(currentMap);
  const currentMapTierClassName = getMapTierClassName(currentMap?.tier);
  const fallbackRatePerHour = materialsResponse?.ratePerHour ?? null;

  const activeMaterialId = getActiveMaterialId(status);
  const activeOrigin = getActiveOrigin(status);
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

    setLastKnownGatheringSkill((currentSkill) =>
      getNextGatheringSkillState(currentSkill, gatheringSkill),
    );
  }, [gatheringSkill]);

  const selectedMaterial = useMemo(
    () =>
      materials.find((material) => material.id === selectedMaterialId) ??
      materials[0] ??
      null,
    [materials, selectedMaterialId],
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

      const mapId = getStatusMapId(statusResponse);

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
      setOverviewGatheringSkill((currentSkill) =>
        areGatheringSkillsEquivalent(currentSkill, overviewSkill)
          ? currentSkill
          : overviewSkill,
      );

      if (activeSkill ?? overviewSkill) {
        setLastKnownGatheringSkill((currentSkill) =>
          getNextGatheringSkillState(currentSkill, activeSkill ?? overviewSkill),
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
    void loadGatheringData();
  }, [loadGatheringData]);

  const handleRefreshActivity = useCallback(async () => {
    await refreshGathering();
  }, [refreshGathering]);

  async function handleStartMaterial(material: GatheringMaterialViewModel) {
    if (isBusy || !safeCharacterId || !originKey) return;

    setIsPageBusy(true);
    setPageErrorMessage(null);
    setFeedback(null);

    try {
      const mapId = currentMap?.id ?? getStatusMapId(status);

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

          <section className="gathering-origin-intro-grid">
            <article
              className="gathering-origin-lore-card gathering-origin-lore-card--npc"
              aria-label={`Guia de ${originLabel}`}
            >
              <div className="gathering-origin-lore-card__portrait" aria-hidden="true">
                <span>{originKey ? getOriginIconFallback(originKey) : 'GA'}</span>
              </div>

              <div className="gathering-origin-lore-card__content">
                <div className="gathering-origin-lore-card__meta">
                  <span className="gathering-origin-lore-card__npc">
                    {originLore?.npcName ?? 'Especialista do abrigo'}
                  </span>

                  <span className="gathering-origin-lore-card__role">
                    {originLabel}
                  </span>
                </div>

                <blockquote>
                  “{originLore?.quote ??
                    'Toda expedição deixa alguma coisa para trás. O segredo é saber o que vale carregar.'}”
                </blockquote>
              </div>
            </article>

            <section
              className={[
                'gathering-origin-map-context',
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
              <div className="gathering-origin-premium-card__badge" aria-hidden="true">
                i
              </div>

              <div>
                <h2>Aumente sua eficiência idle</h2>
                <p>
                  Membros premium podem receber benefícios futuros como maior
                  tempo de expedição, fila de coleta, bônus de produção e
                  notificações avançadas do abrigo.
                </p>
              </div>

              <button type="button" className="gathering-origin-premium-card__button">
                Ver benefícios
              </button>
            </aside>
          </section>

          <div className="gathering-origin-content-grid">
            <main className="gathering-origin-main">
              <section className="gathering-card gathering-card--compact gathering-origin-materials-panel">
                <header className="gathering-card__header gathering-origin-materials-panel__header">
                  <div className="gathering-card__title-group gathering-origin-materials-panel__title-group">
                    <h2>Materiais deste mapa</h2>
                  </div>
                </header>

                {isLoading ? (
                  <div className="gathering-loading">
                    <span className="gathering-loading__spinner" />
                    <p>Carregando materiais...</p>
                  </div>
                ) : (
                  <GatheringMaterialList
                    materials={materials}
                    gatheringSkill={gatheringSkill}
                    fallbackRatePerHour={fallbackRatePerHour}
                    selectedMaterialId={selectedMaterial?.id ?? null}
                    activeMaterialId={
                      isCurrentOriginActive ? activeMaterialId : null
                    }
                    isBusy={isBusy}
                    onSelectMaterial={handleSelectMaterial}
                    onStartMaterial={handleStartMaterial}
                    onViewMaterialUsage={handleViewMaterialUsage}
                  />
                )}
              </section>
            </main>

            <aside className="gathering-origin-side gathering-origin-side--stacked">
              <section className="gathering-origin-side-section gathering-origin-side-section--current">
                <div className="gathering-origin-section-divider">
                  <span>Atividade atual</span>
                </div>

                <div className="gathering-card gathering-card--active gathering-origin-current-card">
                  <GatheringActivityPanel
                    status={status}
                    productionPreview={gatheringRealtimeState.productionPreview}
                    gatheringSkill={gatheringSkill}
                    isBusy={isBusy}
                    onCollect={handleCollect}
                    onStop={handleStop}
                    onRefresh={handleRefreshActivity}
                  />
                </div>
              </section>

              <section className="gathering-origin-side-section gathering-origin-side-section--progress">
                <div className="gathering-origin-section-divider">
                  <span>Sua proficiência</span>
                </div>

                <div
                  className={[
                    'gathering-card',
                    'gathering-origin-skill-card',
                    isSkillPanelExpanded
                      ? 'gathering-origin-skill-card--expanded'
                      : 'gathering-origin-skill-card--collapsed',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className="gathering-origin-skill-card__toggle"
                    aria-expanded={isSkillPanelExpanded}
                    onClick={() =>
                      setIsSkillPanelExpanded((currentValue) => !currentValue)
                    }
                  >
                    <span
                      className="gathering-origin-skill-card__icon"
                      aria-hidden="true"
                    >
                      {getOriginIconFallback(originKey)}
                    </span>

                    <span className="gathering-origin-skill-card__heading">
                      <span>
                        <strong>{originLabel}</strong>
                        {!isSkillPanelExpanded ? (
                          <em className="gathering-origin-skill-card__level-badge">
                            {getSkillLevelLabel(gatheringSkill)}
                          </em>
                        ) : null}
                      </span>
                    </span>

                    <span
                      className={[
                        'gathering-origin-skill-card__chevron',
                        isSkillPanelExpanded
                          ? 'gathering-origin-skill-card__chevron--expanded'
                          : 'gathering-origin-skill-card__chevron--collapsed',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden="true"
                    />
                  </button>

                  <div
                    className="gathering-origin-skill-card__track"
                    role="progressbar"
                    aria-label="Progresso da proficiência"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={skillProgressPercent}
                  >
                    <i
                      aria-hidden="true"
                      style={{ width: `${skillProgressPercent}%` }}
                    />
                  </div>

                  {isSkillPanelExpanded ? (
                    <div className="gathering-origin-skill-card__details">
                      <div className="gathering-origin-skill-card__expanded-metrics">
                        <span
                          className="gathering-origin-skill-card__metric-level"
                          aria-label={`Nível atual: ${getSkillLevelLabel(gatheringSkill)}`}
                        >
                          <em className="gathering-origin-skill-card__level-badge">
                            {getSkillLevelLabel(gatheringSkill)}
                          </em>
                        </span>

                        <span
                          className="gathering-origin-skill-card__metric-progress gathering-origin-skill-card__xp-capsule"
                          aria-label={`${getSkillXpNeededLabel(
                            gatheringSkill,
                          )}. Progresso: ${skillProgressPercent}%`}
                        >
                          <span className="gathering-origin-skill-card__xp-capsule-value">
                            {getSkillXpNeededLabel(gatheringSkill)}
                          </span>

                          <span
                            className="gathering-origin-skill-card__xp-capsule-percent"
                            aria-hidden="true"
                          >
                            {skillProgressPercent}%
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>

          <GatheringUsageModal
            isOpen={Boolean(usageMaterial)}
            material={usageMaterial}
            gatheringSkill={gatheringSkill}
            fallbackRatePerHour={fallbackRatePerHour}
            isBusy={isBusy}
            onStart={handleStartMaterial}
            onClose={handleCloseUsageModal}
          />
        </div>
      </section>
    </DashboardLayout>
  );
}

export default GatheringOriginPage;