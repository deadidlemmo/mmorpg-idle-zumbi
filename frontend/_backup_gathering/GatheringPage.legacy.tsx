import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import arsenalIcon from '../../../assets/images/gathering/skills/gathering-arsenal.png';
import coletaIcon from '../../../assets/images/gathering/skills/gathering-coleta.png';
import contencaoIcon from '../../../assets/images/gathering/skills/gathering-contencao.png';
import desmancheIcon from '../../../assets/images/gathering/skills/gathering-desmanche.png';
import patrulhaIcon from '../../../assets/images/gathering/skills/gathering-patrulha.png';
import tecnovarreduraIcon from '../../../assets/images/gathering/skills/gathering-tecnovarredura.png';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import {
  getEquipmentRarityClassName,
  getEquipmentRarityFromItem,
} from '../../dashboard/constants/equipment-rarity';
import '../../dashboard/dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
  DashboardMapViewModel,
} from '../../dashboard/types/dashboard.types';
import {
  collectGatheringRequest,
  extractGatheringApiError,
  getGatheringStatusRequest,
  listGatheringMaterialsRequest,
  startGatheringRequest,
  stopGatheringRequest,
} from '../api/gathering.api';
import '../gathering.css';
import type {
  CollectGatheringResponse,
  GatheringAllowedOrigin,
  GatheringAvailableMaterialsResponse,
  GatheringMaterialRecipeUsageViewModel,
  GatheringMaterialViewModel,
  GatheringProgressViewModel,
  GatheringSkillViewModel,
  GatheringStatusResponse,
  StopGatheringResponse,
} from '../types/gathering.types';
import {
  clampGatheringPercent,
  formatGatheringDuration,
  formatGatheringOriginRelatedClasses,
  formatGatheringOutputItemSlot,
  formatGatheringRate,
  formatGatheringRecipeQuantity,
  formatGatheringTimePerUnitShort,
  GATHERING_ORIGIN_OPTIONS,
  getGatheringMaterialPrimaryRecipe,
  getGatheringMaterialRatePerHour,
  getGatheringMaterialUsedInRecipes,
  getGatheringOriginDescription,
  getGatheringOriginLabel,
  getGatheringOriginStatLabel,
  getGatheringRequiredLevel,
  getGatheringSkillByOrigin,
  getGatheringSkillLevel,
  getGatheringXpPerUnit,
  isGatheringAllowedOrigin,
  isGatheringMaterialUnlocked,
} from '../types/gathering.types';

const GATHERING_REFRESH_MS = 3000;

const GATHERING_ORIGIN_ICONS: Record<GatheringAllowedOrigin, string> = {
  DESMANCHE: desmancheIcon,
  COLETA: coletaIcon,
  PATRULHA: patrulhaIcon,
  ARSENAL: arsenalIcon,
  TECNOVARREDURA: tecnovarreduraIcon,
  CONTENCAO: contencaoIcon,
};

type RaritySource = {
  rarity?: string | null;
  tier?: number | null;
};

type MaterialIconSource = RaritySource & {
  id?: string | null;
  name?: string | null;
  icon?: string | null;
  iconUrl?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  assetUrl?: string | null;
  assetPath?: string | null;
  thumbnailUrl?: string | null;
};

type DashboardCharacterWithVisualWallet = DashboardCharacterViewModel & {
  gold?: number;
  cash?: number;
  wallet?: {
    gold?: number;
    cash?: number;
  };
  currencies?: {
    gold?: number;
    cash?: number;
  };
};

type OverviewWithGathering = CharacterOverviewResponse & {
  gatheringSkills?: GatheringSkillViewModel[];
  gathering?: {
    skills?: GatheringSkillViewModel[];
    byOrigin?: Record<string, GatheringSkillViewModel | undefined>;
  };
  character: CharacterOverviewResponse['character'] & {
    gatheringSkills?: GatheringSkillViewModel[];
    gathering?: {
      skills?: GatheringSkillViewModel[];
      byOrigin?: Record<string, GatheringSkillViewModel | undefined>;
    };
  };
};

type MaterialGroup = {
  key: string;
  label: string;
  description: string;
  materials: GatheringMaterialViewModel[];
};

function toSafeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFirstAvailableMap(
  overview: CharacterOverviewResponse,
): DashboardMapViewModel | null {
  return (
    overview.progression?.recommendedMap ??
    overview.character.currentMap ??
    overview.character.map ??
    overview.progression?.currentMap ??
    overview.progression?.availableMaps?.[0] ??
    null
  );
}

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;

  const className =
    character.class?.name ?? character.gameClass?.name ?? 'Lutador';

  const currentMapName =
    character.currentMap?.name ??
    character.map?.name ??
    overview.progression?.currentMap?.name ??
    'Sem mapa';

  return {
    ...character,

    id: character.id,
    name: character.name,

    className,
    classId: normalizeClassName(className),

    level: character.level ?? 1,

    xp: character.xp ?? 0,
    totalXp:
      character.totalXp ?? character.levelProgress?.totalXp ?? character.xp ?? 0,

    currentLevelXp:
      character.currentLevelXp ??
      character.xpIntoCurrentLevel ??
      character.levelProgress?.currentLevelXp ??
      character.levelProgress?.xpIntoCurrentLevel ??
      null,

    xpToNextLevel:
      character.xpToNextLevel ??
      character.nextLevelXp ??
      character.levelProgress?.xpToNextLevel ??
      character.levelProgress?.nextLevelXp ??
      null,

    nextLevelXp:
      character.nextLevelXp ??
      character.xpToNextLevel ??
      character.levelProgress?.nextLevelXp ??
      character.levelProgress?.xpToNextLevel ??
      null,

    xpProgressPercent:
      character.xpProgressPercent ??
      character.levelProgress?.xpProgressPercent ??
      character.levelProgress?.progressPercent ??
      null,

    xpIntoCurrentLevel:
      character.xpIntoCurrentLevel ??
      character.currentLevelXp ??
      character.levelProgress?.xpIntoCurrentLevel ??
      character.levelProgress?.currentLevelXp ??
      null,

    xpNeededForNextLevel:
      character.xpNeededForNextLevel ??
      character.levelProgress?.xpNeededForNextLevel ??
      null,

    currentLevelStartXp:
      character.currentLevelStartXp ??
      character.levelProgress?.currentLevelStartXp ??
      null,

    nextLevelRequiredXp:
      character.nextLevelRequiredXp ??
      character.levelProgress?.nextLevelRequiredXp ??
      null,

    isAtLevelCap:
      character.isAtLevelCap ?? character.levelProgress?.isAtLevelCap ?? false,

    levelProgress: character.levelProgress ?? null,

    status: character.status ?? 'ACTIVE',

    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,

    avatarKey: character.avatarKey ?? null,
    avatarUrl: character.avatarUrl ?? null,

    currentMapName,

    class: character.class ?? null,
    gameClass: character.gameClass ?? null,

    map: character.map ?? null,
    currentMap: character.currentMap ?? overview.progression?.currentMap ?? null,

    equipment: character.equipment ?? overview.equipment ?? {},
    inventory: character.inventory ?? [],

    potionConfig: character.potionConfig ?? character.autoPotionConfig ?? null,
    potionConfigs: character.potionConfigs ?? [],
    autoPotionConfig: character.autoPotionConfig ?? null,

    inventorySummary: character.inventorySummary,
    gatheringSkills: character.gatheringSkills,
    autoCombatSession: character.autoCombatSession ?? null,

    deletedAt: character.deletedAt ?? null,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

function getMapLabel(map: DashboardMapViewModel) {
  return `${map.name} • Tier ${map.tier} • Nv. ${map.minLevel ?? '?'}-${
    map.maxLevel ?? '?'
  }`;
}

function getOriginClassName(origin: GatheringAllowedOrigin) {
  return origin.toLowerCase();
}

function formatQuantity(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  return amount.toLocaleString('pt-BR');
}

function formatGatheringRatePerMinute(ratePerHour?: number | null) {
  const rate = toSafeNumber(ratePerHour, 0);

  if (rate <= 0) return '—/min';

  const perMinute = rate / 60;

  return `${perMinute.toLocaleString('pt-BR', {
    minimumFractionDigits: perMinute < 1 ? 1 : 0,
    maximumFractionDigits: perMinute >= 10 ? 0 : 1,
  })}/min`;
}

function getAvailableMaps(
  overview: CharacterOverviewResponse | null,
): DashboardMapViewModel[] {
  if (!overview) return [];

  const mapsById = new Map<string, DashboardMapViewModel>();

  const candidates = [
    overview.character.currentMap,
    overview.character.map,
    overview.progression?.currentMap,
    overview.progression?.recommendedMap,
    ...(overview.progression?.availableMaps ?? []),
  ];

  for (const map of candidates) {
    if (map?.id) {
      mapsById.set(map.id, map);
    }
  }

  return Array.from(mapsById.values()).sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;

    return a.name.localeCompare(b.name);
  });
}

function getOverviewGatheringSkills(
  overview: CharacterOverviewResponse | null,
): GatheringSkillViewModel[] {
  if (!overview) return [];

  const typedOverview = overview as OverviewWithGathering;

  return (
    typedOverview.character.gatheringSkills ??
    typedOverview.gatheringSkills ??
    typedOverview.character.gathering?.skills ??
    typedOverview.gathering?.skills ??
    []
  );
}

function getInitials(name?: string | null) {
  if (!name) return '??';

  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= 0) return '??';

  const ignoredWords = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'com',
    'e',
  ]);

  const meaningfulWords = words.filter(
    (word) => !ignoredWords.has(word.toLowerCase()),
  );

  const sourceWords = meaningfulWords.length > 0 ? meaningfulWords : words;

  return sourceWords
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function getOriginIcon(origin?: string | null) {
  if (!isGatheringAllowedOrigin(origin)) {
    return null;
  }

  return GATHERING_ORIGIN_ICONS[origin];
}

function getMaterialIconSrc(material?: MaterialIconSource | null) {
  return (
    material?.iconUrl ??
    material?.imageUrl ??
    material?.thumbnailUrl ??
    material?.assetUrl ??
    material?.assetPath ??
    material?.image ??
    material?.icon ??
    null
  );
}

function getMaterialRate(params: {
  materialsResponse: GatheringAvailableMaterialsResponse | null;
  material?: GatheringMaterialViewModel | null;
}) {
  return getGatheringMaterialRatePerHour(
    params.material,
    params.materialsResponse?.ratePerHour ?? null,
  );
}

function getMaterialRarityStyle(item?: RaritySource | null): CSSProperties {
  const rarity = getEquipmentRarityFromItem(item);

  return {
    '--equipment-rarity-rgb': rarity.rgb,
    '--equipment-rarity-hex': rarity.hex,
  } as CSSProperties;
}

function getMaterialRarityClassName(item?: RaritySource | null) {
  return getEquipmentRarityClassName(item);
}

function buildGatheringProgressMessage(
  progress?: GatheringProgressViewModel | null,
) {
  if (!progress) return '';

  const originLabel = getGatheringOriginLabel(progress.origin);
  const messages: string[] = [];

  if (progress.xpGained > 0) {
    messages.push(`+${progress.xpGained} XP de ${originLabel}`);
  }

  if (progress.leveledUp) {
    messages.push(`${originLabel} subiu para o nível ${progress.newLevel}`);

    if (progress.statBonusGained) {
      messages.push(
        `${progress.statBonusGained.label} +${progress.statBonusGained.amount}`,
      );
    }
  } else if (progress.xpToNextLevel) {
    messages.push(`${progress.currentXp}/${progress.xpToNextLevel} XP`);
  }

  return messages.join(' · ');
}

function buildCollectSuccessMessage(
  result: CollectGatheringResponse | StopGatheringResponse,
  fallbackMessage: string,
) {
  const collectedQuantity = result.collected?.quantity ?? 0;
  const collectedName = result.collected?.name ?? 'material';
  const progressMessage = buildGatheringProgressMessage(
    result.gatheringProgress,
  );

  const baseMessage =
    collectedQuantity > 0
      ? `Coleta realizada: ${collectedQuantity}x ${collectedName}.`
      : fallbackMessage;

  return progressMessage ? `${baseMessage} ${progressMessage}.` : baseMessage;
}

function getOutputSlotGroupKey(material: GatheringMaterialViewModel) {
  const primaryRecipe = getGatheringMaterialPrimaryRecipe(material);

  return primaryRecipe?.outputItemSlot ?? 'UNLINKED';
}

function getOutputSlotGroupLabel(slot?: string | null) {
  switch (slot) {
    case 'MAIN_HAND':
      return 'Armas';
    case 'OFF_HAND':
      return 'Apoios e secundárias';
    case 'HEAD':
      return 'Elmos e máscaras';
    case 'ARMOR':
      return 'Armaduras e coletes';
    case 'PANTS':
      return 'Calças e proteções inferiores';
    case 'BOOTS':
      return 'Botas e solados';
    case 'CONSUMABLE':
      return 'Consumíveis';
    case 'MATERIAL':
      return 'Materiais';
    case 'UNLINKED':
      return 'Sem receita vinculada';
    default:
      return slot ? formatGatheringOutputItemSlot(slot) : 'Outros itens';
  }
}

function getOutputSlotGroupDescription(slot?: string | null) {
  switch (slot) {
    case 'MAIN_HAND':
      return 'Materiais que viram armas principais.';
    case 'OFF_HAND':
      return 'Materiais usados em defesas, apoios e itens secundários.';
    case 'HEAD':
      return 'Materiais usados em proteção de cabeça.';
    case 'ARMOR':
      return 'Materiais usados em proteção corporal.';
    case 'PANTS':
      return 'Materiais usados em calças e proteções de perna.';
    case 'BOOTS':
      return 'Materiais usados em botas, solados e marcha.';
    case 'UNLINKED':
      return 'Materiais ainda sem receita registrada no seed.';
    default:
      return 'Materiais agrupados pelo tipo de item fabricado.';
  }
}

function getOutputSlotSortWeight(slot?: string | null) {
  switch (slot) {
    case 'MAIN_HAND':
      return 1;
    case 'OFF_HAND':
      return 2;
    case 'HEAD':
      return 3;
    case 'ARMOR':
      return 4;
    case 'PANTS':
      return 5;
    case 'BOOTS':
      return 6;
    case 'CONSUMABLE':
      return 7;
    case 'UNLINKED':
      return 99;
    default:
      return 50;
  }
}

function groupMaterialsByOutputSlot(
  materials: GatheringMaterialViewModel[],
): MaterialGroup[] {
  const groupsByKey = new Map<string, MaterialGroup>();

  for (const material of materials) {
    const key = getOutputSlotGroupKey(material);

    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        label: getOutputSlotGroupLabel(key),
        description: getOutputSlotGroupDescription(key),
        materials: [],
      });
    }

    groupsByKey.get(key)?.materials.push(material);
  }

  return Array.from(groupsByKey.values())
    .map((group) => ({
      ...group,
      materials: group.materials.sort((a, b) => {
        const requiredLevelA = getGatheringRequiredLevel(a);
        const requiredLevelB = getGatheringRequiredLevel(b);

        if (requiredLevelA !== requiredLevelB) {
          return requiredLevelA - requiredLevelB;
        }

        return a.name.localeCompare(b.name);
      }),
    }))
    .sort((a, b) => {
      const weightA = getOutputSlotSortWeight(a.key);
      const weightB = getOutputSlotSortWeight(b.key);

      if (weightA !== weightB) return weightA - weightB;

      return a.label.localeCompare(b.label);
    });
}

export function GatheringPage() {
  const { characterId } = useParams();

  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [status, setStatus] = useState<GatheringStatusResponse | null>(null);
  const [materialsResponse, setMaterialsResponse] =
    useState<GatheringAvailableMaterialsResponse | null>(null);

  const [selectedMapId, setSelectedMapId] = useState('');
  const [selectedOrigin, setSelectedOrigin] =
    useState<GatheringAllowedOrigin>('DESMANCHE');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [usageModalMaterialId, setUsageModalMaterialId] = useState('');

  const [sessionCollectedCount, setSessionCollectedCount] = useState(0);
  const [sessionCollectedSessionId, setSessionCollectedSessionId] =
    useState('');

  const [statusFetchedAt, setStatusFetchedAt] = useState(Date.now());
  const [liveNow, setLiveNow] = useState(Date.now());

  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadOverview = useCallback(async () => {
    if (!characterId) return;

    try {
      setIsLoadingOverview(true);
      setErrorMessage('');

      const data = await getCharacterOverview(characterId);

      setOverview(data);

      const firstMap = getFirstAvailableMap(data);

      setSelectedMapId((currentMapId) => {
        if (currentMapId) return currentMapId;

        return firstMap?.id ?? '';
      });
    } catch {
      setErrorMessage('Não foi possível carregar os dados do personagem.');
    } finally {
      setIsLoadingOverview(false);
    }
  }, [characterId]);

  const loadStatus = useCallback(async () => {
    if (!characterId) return;

    try {
      setIsLoadingStatus(true);

      const data = await getGatheringStatusRequest(characterId);
      const receivedAt = Date.now();

      setStatus(data);
      setStatusFetchedAt(receivedAt);
      setLiveNow(receivedAt);
    } catch {
      setStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [characterId]);

  const loadMaterials = useCallback(async () => {
    if (!selectedMapId || !selectedOrigin) {
      setMaterialsResponse(null);
      setSelectedMaterialId('');
      setUsageModalMaterialId('');
      return;
    }

    try {
      setIsLoadingMaterials(true);
      setErrorMessage('');

      const data = await listGatheringMaterialsRequest({
        mapId: selectedMapId,
        origin: selectedOrigin,
      });

      setMaterialsResponse(data);

      setSelectedMaterialId((currentMaterialId) => {
        const currentStillExists = data.materials.some(
          (material) => material.id === currentMaterialId,
        );

        if (currentStillExists) {
          return currentMaterialId;
        }

        const firstUnlockedMaterial = data.materials.find((material) => {
          const skill = getGatheringSkillByOrigin(
            getOverviewGatheringSkills(overview),
            isGatheringAllowedOrigin(material.materialOrigin)
              ? material.materialOrigin
              : selectedOrigin,
          );

          return isGatheringMaterialUnlocked({
            material,
            skill,
          });
        });

        return firstUnlockedMaterial?.id ?? data.materials[0]?.id ?? '';
      });

      setUsageModalMaterialId((currentMaterialId) => {
        const currentStillExists = data.materials.some(
          (material) => material.id === currentMaterialId,
        );

        return currentStillExists ? currentMaterialId : '';
      });
    } catch (error) {
      setMaterialsResponse(null);
      setSelectedMaterialId('');
      setUsageModalMaterialId('');
      setErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsLoadingMaterials(false);
    }
  }, [overview, selectedMapId, selectedOrigin]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadStatus();

    if (!characterId) return undefined;

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, GATHERING_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [characterId, loadStatus]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    if (!usageModalMaterialId) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setUsageModalMaterialId('');
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [usageModalMaterialId]);

  const character = useMemo(() => {
    if (!overview) return null;

    return buildCharacterViewModel(overview);
  }, [overview]);

  const characterWithVisualWallet = useMemo(() => {
    if (!character) return null;

    const nextCharacter: DashboardCharacterWithVisualWallet = {
      ...character,
      gold: 0,
      cash: 0,
      wallet: {
        gold: 0,
        cash: 0,
      },
      currencies: {
        gold: 0,
        cash: 0,
      },
    };

    return nextCharacter;
  }, [character]);

  const availableMaps = useMemo(() => {
    return getAvailableMaps(overview);
  }, [overview]);

  const gatheringSkills = useMemo(() => {
    return getOverviewGatheringSkills(overview);
  }, [overview]);

  const selectedMap = useMemo(() => {
    return (
      availableMaps.find((map) => map.id === selectedMapId) ??
      availableMaps[0] ??
      null
    );
  }, [availableMaps, selectedMapId]);

  const selectedOriginOption = useMemo(() => {
    return (
      GATHERING_ORIGIN_OPTIONS.find((origin) => origin.key === selectedOrigin) ??
      GATHERING_ORIGIN_OPTIONS[0]
    );
  }, [selectedOrigin]);

  const selectedOriginSkill = useMemo(() => {
    return getGatheringSkillByOrigin(gatheringSkills, selectedOrigin);
  }, [gatheringSkills, selectedOrigin]);

  const materialGroups = useMemo(() => {
    return groupMaterialsByOutputSlot(materialsResponse?.materials ?? []);
  }, [materialsResponse]);

  const selectedMaterial = useMemo(() => {
    return (
      materialsResponse?.materials.find(
        (material) => material.id === selectedMaterialId,
      ) ?? null
    );
  }, [materialsResponse, selectedMaterialId]);

  const usageModalMaterial = useMemo(() => {
    return (
      materialsResponse?.materials.find(
        (material) => material.id === usageModalMaterialId,
      ) ?? null
    );
  }, [materialsResponse, usageModalMaterialId]);

  const selectedOriginIcon = GATHERING_ORIGIN_ICONS[selectedOrigin];

  const selectedOriginLevel = getGatheringSkillLevel(selectedOriginSkill);

  const activeSession = status?.active ? status.session : null;
  const activeGatheringSkill = status?.active
    ? status.gatheringSkill ??
      getGatheringSkillByOrigin(gatheringSkills, activeSession?.origin)
    : null;
  const productionPreview = status?.active ? status.productionPreview : null;
  const hasActiveGathering = Boolean(status?.active && activeSession);

  const activeSessionOriginIcon = getOriginIcon(activeSession?.origin);

  const activeTargetMaterial =
    (activeSession?.targetMaterial as Partial<GatheringMaterialViewModel> | null) ??
    null;

  const activeFullMaterial = useMemo(() => {
    if (!activeSession?.targetMaterial?.id) return null;

    return (
      materialsResponse?.materials.find(
        (material) => material.id === activeSession.targetMaterial?.id,
      ) ?? null
    );
  }, [activeSession?.targetMaterial?.id, materialsResponse]);

  const activeMaterialForVisual =
    activeFullMaterial ?? activeTargetMaterial ?? selectedMaterial ?? null;

  const activeMaterialIconSrc = getMaterialIconSrc(
    activeMaterialForVisual as MaterialIconSource | null,
  );

  const activeMaterialName =
    activeTargetMaterial?.name ?? selectedMaterial?.name ?? 'Material';

  const activeMaterialXpPerUnit =
    activeTargetMaterial?.gatheringXpPerUnit ??
    getGatheringXpPerUnit(activeFullMaterial ?? selectedMaterial);

  const activeMaterialRate =
    productionPreview?.ratePerHour ??
    activeTargetMaterial?.baseGatheringRatePerHour ??
    getMaterialRate({
      materialsResponse,
      material: activeFullMaterial ?? selectedMaterial,
    });

  const ratePerHour =
    productionPreview?.ratePerHour ??
    activeMaterialRate ??
    materialsResponse?.ratePerHour ??
    0;

  const baseReadyToCollect = Math.max(
    0,
    Math.floor(toSafeNumber(productionPreview?.estimatedQuantityToCollect, 0)),
  );

  const baseProgressRemainder = toSafeNumber(
    productionPreview?.estimatedNewProgressRemainder,
    0,
  );

  const extraLiveSeconds =
    hasActiveGathering && statusFetchedAt > 0
      ? Math.max(0, Math.floor((liveNow - statusFetchedAt) / 1000))
      : 0;

  const liveAddedProgress =
    ratePerHour > 0 ? (extraLiveSeconds * ratePerHour) / 3600 : 0;

  const liveTotalRemainder = baseProgressRemainder + liveAddedProgress;

  const liveReadyToCollect =
    baseReadyToCollect + Math.floor(Math.max(0, liveTotalRemainder));

  const liveProgressPercent = clampGatheringPercent(
    ((liveTotalRemainder % 1) + 1) % 1 * 100,
  );

  const liveElapsedSeconds =
    toSafeNumber(productionPreview?.elapsedSeconds, 0) + extraLiveSeconds;

  const liveProgressStyle = {
    width: `${liveProgressPercent}%`,
  };

  useEffect(() => {
    if (!hasActiveGathering) {
      setLiveNow(Date.now());
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setLiveNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveGathering]);

  useEffect(() => {
    if (!activeSession?.id) {
      if (sessionCollectedSessionId || sessionCollectedCount > 0) {
        setSessionCollectedSessionId('');
        setSessionCollectedCount(0);
      }

      return;
    }

    if (sessionCollectedSessionId !== activeSession.id) {
      setSessionCollectedSessionId(activeSession.id);
      setSessionCollectedCount(0);
    }
  }, [activeSession?.id, sessionCollectedCount, sessionCollectedSessionId]);

  async function refreshAfterAction() {
    await Promise.all([loadStatus(), loadOverview(), loadMaterials()]);
  }

  async function handleStartGathering(
    targetMaterial?: GatheringMaterialViewModel | null,
  ) {
    if (!characterId || !selectedMapId) return;

    const material = targetMaterial ?? selectedMaterial;

    if (!material) {
      setErrorMessage('Selecione um material para iniciar a expedição.');
      setSuccessMessage('');
      return;
    }

    const materialOrigin = isGatheringAllowedOrigin(material.materialOrigin)
      ? material.materialOrigin
      : selectedOrigin;

    const materialSkill = getGatheringSkillByOrigin(
      gatheringSkills,
      materialOrigin,
    );

    const requiredLevel = getGatheringRequiredLevel(material);
    const currentLevel = getGatheringSkillLevel(materialSkill);
    const isUnlocked = isGatheringMaterialUnlocked({
      material,
      skill: materialSkill,
    });

    setSelectedMaterialId(material.id);

    if (!isUnlocked) {
      setErrorMessage(
        `Este material requer ${getGatheringOriginLabel(
          materialOrigin,
        )} nível ${requiredLevel}. Seu nível atual é ${currentLevel}.`,
      );
      setSuccessMessage('');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      setSuccessMessage('');
      setSessionCollectedCount(0);
      setSessionCollectedSessionId('');

      const result = await startGatheringRequest({
        characterId,
        mapId: selectedMapId,
        origin: materialOrigin,
        targetMaterialId: material.id,
      });

      setSuccessMessage(result.message || 'Expedição iniciada com sucesso.');

      await refreshAfterAction();
    } catch (error) {
      setErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCollectGathering() {
    if (!characterId) return;

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      setSuccessMessage('');

      const result = await collectGatheringRequest(characterId);
      const collectedQuantity = result.collected?.quantity ?? 0;

      if (collectedQuantity > 0) {
        setSessionCollectedCount((currentValue) => {
          return currentValue + collectedQuantity;
        });
      }

      setSuccessMessage(
        buildCollectSuccessMessage(
          result,
          'Coleta realizada. Nenhuma unidade inteira estava pronta ainda.',
        ),
      );

      await refreshAfterAction();
    } catch (error) {
      setErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStopGathering() {
    if (!characterId) return;

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      setSuccessMessage('');

      const result = await stopGatheringRequest(characterId);
      const collectedQuantity = result.collected?.quantity ?? 0;

      if (collectedQuantity > 0) {
        setSessionCollectedCount((currentValue) => {
          return currentValue + collectedQuantity;
        });
      }

      setSuccessMessage(
        buildCollectSuccessMessage(
          result,
          result.message || 'Expedição encerrada.',
        ),
      );

      await refreshAfterAction();
    } catch (error) {
      setErrorMessage(extractGatheringApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSelectMaterial(material: GatheringMaterialViewModel) {
    setSelectedMaterialId(material.id);
  }

  function handleOpenUsageModal(material: GatheringMaterialViewModel) {
    setSelectedMaterialId(material.id);
    setUsageModalMaterialId(material.id);
  }

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoadingOverview) {
    return (
      <main className="gathering-loading">
        <div className="gathering-loading__content">
          <span className="gathering-loading__spinner" aria-hidden="true" />
          <span>Carregando expedições...</span>
        </div>
      </main>
    );
  }

  if (!overview || !character || !characterWithVisualWallet) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar expedições</h1>
        <p>{errorMessage || 'Personagem não encontrado.'}</p>

        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={characterWithVisualWallet}>
      <div className="gathering-page gathering-page--clean">
        <header className="gathering-page__header gathering-page__header--compact">
          <div className="gathering-page__header-main">
            <span className="gathering-page__eyebrow">Expedições</span>

            <h1>Gathering</h1>

            <p className="gathering-page__subtitle">
              Escolha uma origem, veja quais classes usam aquele recurso e
              inicie a coleta direto pelo material desejado.
            </p>
          </div>

          <div className="gathering-page__header-actions">
            <span
              className={`gathering-page__status-pill ${
                hasActiveGathering ? 'is-active' : ''
              }`}
            >
              {hasActiveGathering ? 'Expedição ativa' : 'Sem expedição'}
            </span>
          </div>
        </header>

        {errorMessage ? (
          <div className="gathering-feedback gathering-feedback--error">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="gathering-feedback gathering-feedback--success">
            {successMessage}
          </div>
        ) : null}

        <div className="gathering-page__grid gathering-page__grid--clean">
          <div className="gathering-page__main-column">
            <section className="gathering-card gathering-card--compact">
              <div className="gathering-card__header">
                <div className="gathering-card__title-group">
                  <span className="gathering-card__eyebrow">Preparação</span>

                  <h2>Rota de coleta</h2>

                  <p className="gathering-card__description">
                    Selecione o mapa e o tipo de gathering.
                  </p>
                </div>

                <span className="gathering-card__badge">
                  {selectedMap ? `Tier ${selectedMap.tier}` : 'Sem mapa'}
                </span>
              </div>

              <div className="gathering-form gathering-form--compact">
                <div className="gathering-field">
                  <label htmlFor="gathering-map">Mapa</label>

                  <select
                    id="gathering-map"
                    className="gathering-select"
                    value={selectedMapId}
                    disabled={hasActiveGathering || isSubmitting}
                    onChange={(event) => {
                      setSelectedMapId(event.target.value);
                      setSelectedMaterialId('');
                      setUsageModalMaterialId('');
                    }}
                  >
                    {availableMaps.length <= 0 ? (
                      <option value="">Nenhum mapa disponível</option>
                    ) : null}

                    {availableMaps.map((map) => (
                      <option key={map.id} value={map.id}>
                        {getMapLabel(map)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="gathering-field">
                  <span className="gathering-field__label">Origem</span>

                  <div className="gathering-origins gathering-origins--compact gathering-origins--icons">
                    {GATHERING_ORIGIN_OPTIONS.map((origin) => {
                      const isActive = selectedOrigin === origin.key;
                      const originIcon = GATHERING_ORIGIN_ICONS[origin.key];
                      const skill = getGatheringSkillByOrigin(
                        gatheringSkills,
                        origin.key,
                      );

                      return (
                        <button
                          key={origin.key}
                          type="button"
                          className={[
                            'gathering-origin-option',
                            'gathering-origin-option--compact',
                            'gathering-origin-option--icon',
                            `is-${getOriginClassName(origin.key)}`,
                            isActive ? 'is-active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          disabled={hasActiveGathering || isSubmitting}
                          onClick={() => {
                            setSelectedOrigin(origin.key);
                            setSelectedMaterialId('');
                            setUsageModalMaterialId('');
                          }}
                        >
                          <div className="gathering-origin-option__content">
                            <div className="gathering-origin-option__visual">
                              <img
                                src={originIcon}
                                alt=""
                                width={42}
                                height={42}
                                className="gathering-origin-option__icon"
                                loading="lazy"
                              />
                            </div>

                            <div className="gathering-origin-option__text">
                              <strong>{origin.label}</strong>

                              <span className="gathering-origin-option__stat">
                                Nv. {skill?.level ?? 1}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="gathering-origin-summary gathering-origin-summary--icon">
                    <div className="gathering-origin-summary__visual">
                      <img
                        src={selectedOriginIcon}
                        alt=""
                        width={38}
                        height={38}
                        className="gathering-origin-summary__icon"
                        loading="lazy"
                      />
                    </div>

                    <div className="gathering-origin-summary__content">
                      <div className="gathering-origin-summary__top">
                        <strong>{selectedOriginOption.label}</strong>

                        <span>
                          Nv. {selectedOriginLevel} ·{' '}
                          {getGatheringOriginStatLabel(selectedOrigin)}
                        </span>
                      </div>

                      <p>
                        {formatGatheringOriginRelatedClasses(selectedOrigin)} ·{' '}
                        {getGatheringOriginDescription(selectedOrigin)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="gathering-card gathering-card--compact">
              <div className="gathering-card__header">
                <div className="gathering-card__title-group">
                  <span className="gathering-card__eyebrow">Materiais</span>

                  <h2>{getGatheringOriginLabel(selectedOrigin)}</h2>

                  <p className="gathering-card__description">
                    Cada card mostra nível exigido, XP por item, tempo por
                    unidade e o tipo de item que usa esse material.
                  </p>
                </div>

                <span className="gathering-card__badge">
                  Nv. atual {selectedOriginLevel}
                </span>
              </div>

              <div className="gathering-materials-toolbar gathering-materials-toolbar--compact">
                <div className="gathering-materials-toolbar__summary">
                  <strong>{materialsResponse?.materials.length ?? 0}</strong>{' '}
                  material(is)
                </div>

                {isLoadingMaterials ? (
                  <span className="gathering-card__badge">Atualizando</span>
                ) : null}
              </div>

              {materialGroups.length > 0 ? (
                <div className="gathering-material-groups">
                  {materialGroups.map((group) => (
                    <section
                      key={group.key}
                      className="gathering-material-group"
                    >
                      <div className="gathering-material-group__header">
                        <div>
                          <h3>{group.label}</h3>
                          <p>{group.description}</p>
                        </div>

                        <span>{group.materials.length}</span>
                      </div>

                      <div className="gathering-material-grid gathering-material-grid--compact gathering-material-grid--visual">
                        {group.materials.map((material) => {
                          const isSelected = selectedMaterialId === material.id;
                          const materialOrigin = isGatheringAllowedOrigin(
                            material.materialOrigin,
                          )
                            ? material.materialOrigin
                            : selectedOrigin;
                          const materialSkill = getGatheringSkillByOrigin(
                            gatheringSkills,
                            materialOrigin,
                          );
                          const isUnlocked = isGatheringMaterialUnlocked({
                            material,
                            skill: materialSkill,
                          });

                          const requiredLevel =
                            getGatheringRequiredLevel(material);
                          const currentLevel =
                            getGatheringSkillLevel(materialSkill);
                          const xpPerUnit = getGatheringXpPerUnit(material);
                          const materialRate = getMaterialRate({
                            materialsResponse,
                            material,
                          });
                          const primaryRecipe =
                            getGatheringMaterialPrimaryRecipe(material);
                          const rarity = getEquipmentRarityFromItem(material);
                          const materialIconSrc = getMaterialIconSrc(
                            material as MaterialIconSource,
                          );
                          const lockedMaterialTitle = `Bloqueado até ${getGatheringOriginLabel(
                            materialOrigin,
                          )} nível ${requiredLevel}`;
                          const lockedMaterialSubtitle = `Seu nível atual é ${currentLevel}`;

                          const canStartThisMaterial =
                            !hasActiveGathering &&
                            Boolean(characterId) &&
                            Boolean(selectedMapId) &&
                            isUnlocked &&
                            !isSubmitting;

                          return (
                            <article
                              key={material.id}
                              className={[
                                'gathering-material-card',
                                'gathering-material-card--compact',
                                'gathering-material-card--visual',
                                getMaterialRarityClassName(material),
                                isSelected ? 'is-selected' : '',
                                !isUnlocked ? 'is-locked' : '',
                                !isUnlocked ? 'is-hard-locked' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              style={getMaterialRarityStyle(material)}
                            >
                              <button
                                type="button"
                                className="gathering-material-card__select"
                                title={
                                  isUnlocked
                                    ? `${material.name} · ${rarity.label}`
                                    : `${lockedMaterialTitle}. ${lockedMaterialSubtitle}.`
                                }
                                disabled={
                                  hasActiveGathering || isSubmitting || !isUnlocked
                                }
                                aria-disabled={
                                  hasActiveGathering || isSubmitting || !isUnlocked
                                }
                                onClick={() => {
                                  if (!isUnlocked) return;

                                  handleSelectMaterial(material);
                                }}
                              >
                                <span className="gathering-material-card__visual">
                                  <span className="gathering-material-card__icon-frame">
                                    {materialIconSrc ? (
                                      <img
                                        src={materialIconSrc}
                                        alt=""
                                        className="gathering-material-card__icon"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <span className="gathering-material-card__icon-fallback">
                                        {getInitials(material.name)}
                                      </span>
                                    )}
                                  </span>
                                </span>

                                <span className="gathering-material-card__body">
                                  <span className="gathering-material-card__header-line">
                                    <strong>{material.name}</strong>

                                    <span className="gathering-material-card__status-area">
                                      {!isUnlocked ? (
                                        <span
                                          className="gathering-material-card__lock"
                                          title={`Bloqueado até ${getGatheringOriginLabel(
                                            materialOrigin,
                                          )} nível ${requiredLevel}`}
                                          aria-label={`Bloqueado até o nível ${requiredLevel}`}
                                        >
                                          🔒
                                        </span>
                                      ) : null}

                                      <span className="gathering-material-card__rarity-badge">
                                        {rarity.label}
                                      </span>

                                      <span className="gathering-material-card__tier">
                                        T{material.tier}
                                      </span>
                                    </span>
                                  </span>

                                  <span className="gathering-material-card__craft-summary">
                                    {primaryRecipe
                                      ? `${
                                          primaryRecipe.outputItemClassName ??
                                          'Classe livre'
                                        } · ${formatGatheringOutputItemSlot(
                                          primaryRecipe.outputItemSlot,
                                        )}`
                                      : 'Sem receita vinculada'}
                                  </span>

                                  <span className="gathering-material-card__meta">
                                    <span
                                      className={[
                                        'gathering-material-card__pill',
                                        isUnlocked
                                          ? 'gathering-material-card__pill--rate'
                                          : 'gathering-material-card__pill--locked',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      {isUnlocked
                                        ? `Req. Nv ${requiredLevel}`
                                        : `Bloq. Nv ${requiredLevel}`}
                                    </span>

                                    <span className="gathering-material-card__pill gathering-material-card__pill--time">
                                      +{xpPerUnit} XP
                                    </span>

                                    <span className="gathering-material-card__pill gathering-material-card__pill--time">
                                      {formatGatheringTimePerUnitShort(
                                        materialRate,
                                      )}
                                    </span>
                                  </span>
                                </span>
                              </button>

                              {!isUnlocked ? (
                                <div
                                  className="gathering-material-card__locked-layer"
                                  aria-hidden="true"
                                >
                                  <span className="gathering-material-card__locked-layer-icon">
                                    🔒
                                  </span>

                                  <span className="gathering-material-card__locked-layer-text">
                                    Bloqueado
                                  </span>

                                  <small>
                                    {getGatheringOriginLabel(materialOrigin)} Nv.{' '}
                                    {requiredLevel} · atual {currentLevel}
                                  </small>
                                </div>
                              ) : null}

                              <div className="gathering-material-card__footer-actions gathering-material-card__footer-actions--split">
                                <button
                                  type="button"
                                  className="gathering-material-card__start-button"
                                  disabled={!canStartThisMaterial}
                                  onClick={() => {
                                    void handleStartGathering(material);
                                  }}
                                >
                                  {hasActiveGathering
                                    ? 'Em andamento'
                                    : isSubmitting
                                      ? 'Aguarde'
                                      : isUnlocked
                                        ? 'Iniciar'
                                        : 'Bloqueado'}
                                </button>

                                <button
                                  type="button"
                                  className="gathering-material-card__recipes-button"
                                  onClick={() => handleOpenUsageModal(material)}
                                >
                                  Ver usos
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="gathering-empty gathering-empty--compact">
                  <strong>Nenhum material encontrado</strong>

                  <p>
                    Não há material dessa origem para o mapa selecionado. Tente
                    outro mapa/origem ou confira o seed.
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="gathering-page__side-column gathering-page__side-column--clean">
            <section
              className={[
                'gathering-card',
                'gathering-card--active',
                'gathering-card--compact',
                hasActiveGathering ? '' : 'gathering-card--muted',
                hasActiveGathering
                  ? getMaterialRarityClassName(activeMaterialForVisual)
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={getMaterialRarityStyle(activeMaterialForVisual)}
            >
              <div className="gathering-card__header">
                <div className="gathering-card__title-group">
                  <span className="gathering-card__eyebrow">Sessão</span>

                  <h2>Expedição atual</h2>

                  <p className="gathering-card__description">
                    Acompanhe a produção ativa em tempo real.
                  </p>
                </div>

                <span
                  className={`gathering-card__badge ${
                    hasActiveGathering ? 'is-live' : ''
                  }`}
                >
                  {isLoadingStatus
                    ? 'Sincronizando'
                    : hasActiveGathering
                      ? 'Ativa'
                      : 'Parada'}
                </span>
              </div>

              {hasActiveGathering && activeSession ? (
                <div className="gathering-session gathering-session--compact">
                  <div className="gathering-session__live-hero">
                    <div className="gathering-session__item-icon">
                      {activeMaterialIconSrc ? (
                        <img
                          src={activeMaterialIconSrc}
                          alt=""
                          className="gathering-session__item-image"
                          loading="lazy"
                        />
                      ) : (
                        <span className="gathering-material-card__icon-fallback">
                          {getInitials(activeMaterialName)}
                        </span>
                      )}

                      {activeSessionOriginIcon ? (
                        <span className="gathering-session__origin-mini">
                          <img
                            src={activeSessionOriginIcon}
                            alt=""
                            width={22}
                            height={22}
                            loading="lazy"
                          />
                        </span>
                      ) : null}
                    </div>

                    <div className="gathering-session__live-body">
                      <span className="gathering-session__label">
                        Coletando agora
                      </span>

                      <h2 title={activeMaterialName}>{activeMaterialName}</h2>

                      <div className="gathering-session__rate-strip">
                        <span>
                          <strong>{formatGatheringRatePerMinute(ratePerHour)}</strong>
                          <small>média</small>
                        </span>

                        <span>
                          <strong>{formatGatheringRate(ratePerHour)}</strong>
                          <small>produção</small>
                        </span>

                        <span>
                          <strong>
                            {formatGatheringTimePerUnitShort(activeMaterialRate)}
                          </strong>
                          <small>por item</small>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="gathering-session__activity-progress">
                    <div className="gathering-session__progress-header">
                      <span>Próxima unidade</span>
                      <strong>{Math.round(liveProgressPercent)}%</strong>
                    </div>

                    <div className="gathering-session__activity-track">
                      <i style={liveProgressStyle} />
                    </div>

                    <div className="gathering-session__activity-footer">
                      <span>
                        {liveReadyToCollect > 0
                          ? `${formatQuantity(
                              liveReadyToCollect,
                            )} item(ns) pronto(s)`
                          : 'Nenhum item pronto ainda'}
                      </span>

                      <strong>
                        {formatGatheringDuration(liveElapsedSeconds)}
                      </strong>
                    </div>
                  </div>

                  <div className="gathering-session__meta gathering-session__meta--compact">
                    <div className="gathering-session__metric gathering-session__metric--highlight">
                      <span>Coletado na sessão</span>
                      <strong>
                        {formatQuantity(sessionCollectedCount)} item(ns)
                      </strong>
                    </div>

                    <div className="gathering-session__metric gathering-session__metric--highlight">
                      <span>Pronto agora</span>
                      <strong>{formatQuantity(liveReadyToCollect)} item(ns)</strong>
                    </div>

                    <div className="gathering-session__metric">
                      <span>XP por item</span>
                      <strong>+{activeMaterialXpPerUnit} XP</strong>
                    </div>

                    <div className="gathering-session__metric">
                      <span>Proficiência</span>
                      <strong>
                        Nv. {activeGatheringSkill?.level ?? 1} ·{' '}
                        {activeGatheringSkill?.xp ?? 0}/
                        {activeGatheringSkill?.xpToNextLevel ?? 50} XP
                      </strong>
                    </div>
                  </div>

                  <div className="gathering-session__actions">
                    <button
                      type="button"
                      className="gathering-button gathering-button--success"
                      disabled={isSubmitting}
                      onClick={handleCollectGathering}
                    >
                      {isSubmitting ? 'Coletando...' : 'Coletar'}
                    </button>

                    <button
                      type="button"
                      className="gathering-button gathering-button--danger"
                      disabled={isSubmitting}
                      onClick={handleStopGathering}
                    >
                      {isSubmitting ? 'Encerrando...' : 'Parar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="gathering-empty gathering-empty--compact">
                  <strong>Nenhuma expedição ativa</strong>

                  <p>
                    Escolha um material e clique em <strong>Iniciar</strong>.
                    Quando a expedição começar, este painel passa a mostrar a
                    produção em tempo real.
                  </p>
                </div>
              )}
            </section>
          </aside>
        </div>

        {usageModalMaterial ? (
          <div
            className="gathering-usage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gathering-usage-modal-title"
            onClick={() => setUsageModalMaterialId('')}
          >
            <div
              className={[
                'gathering-usage-modal__panel',
                getMaterialRarityClassName(usageModalMaterial),
              ]
                .filter(Boolean)
                .join(' ')}
              style={getMaterialRarityStyle(usageModalMaterial)}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="gathering-usage-modal__header">
                <div>
                  <span className="gathering-usage-modal__eyebrow">
                    Usos do material
                  </span>

                  <h2 id="gathering-usage-modal-title">
                    {usageModalMaterial.name}
                  </h2>

                  <p>
                    Veja quais equipamentos ou itens usam este material nas
                    receitas.
                  </p>
                </div>

                <button
                  type="button"
                  className="gathering-usage-modal__close"
                  aria-label="Fechar"
                  onClick={() => setUsageModalMaterialId('')}
                >
                  ×
                </button>
              </header>

              <div className="gathering-usage-modal__content">
                {getGatheringMaterialUsedInRecipes(usageModalMaterial).length >
                0 ? (
                  getGatheringMaterialUsedInRecipes(usageModalMaterial).map(
                    (recipe: GatheringMaterialRecipeUsageViewModel) => (
                      <div
                        key={`${usageModalMaterial.id}-${recipe.recipeId}`}
                        className="gathering-usage-modal__recipe"
                      >
                        <span className="gathering-usage-modal__recipe-icon">
                          {getInitials(recipe.outputItemName)}
                        </span>

                        <div className="gathering-usage-modal__recipe-body">
                          <strong>{recipe.outputItemName}</strong>

                          <span>
                            {recipe.outputItemClassName ?? 'Classe livre'} ·{' '}
                            {formatGatheringOutputItemSlot(
                              recipe.outputItemSlot,
                            )}{' '}
                            · {formatGatheringRecipeQuantity(recipe)}
                          </span>
                        </div>
                      </div>
                    ),
                  )
                ) : (
                  <div className="gathering-empty gathering-empty--compact">
                    <strong>Sem receita vinculada</strong>

                    <p>
                      Esse material ainda não está conectado a uma receita no
                      seed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}