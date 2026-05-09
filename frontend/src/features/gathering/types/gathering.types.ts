export type GatheringMaterialOrigin =
  | 'DESMANCHE'
  | 'COLETA'
  | 'CONTENCAO'
  | 'ARSENAL'
  | 'PATRULHA'
  | 'TECNOVARREDURA'
  | 'DROP_MOBS';

export type GatheringAllowedOrigin = Exclude<
  GatheringMaterialOrigin,
  'DROP_MOBS'
>;

export type GatheringActivityStatus =
  | 'ACTIVE'
  | 'STOPPED'
  | 'COMPLETED'
  | (string & {});

export type GatheringItemRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'EPIC'
  | 'LEGENDARY'
  | (string & {});

export type GatheringItemSlot =
  | 'MATERIAL'
  | 'MAIN_HAND'
  | 'OFF_HAND'
  | 'HEAD'
  | 'ARMOR'
  | 'PANTS'
  | 'BOOTS'
  | 'CONSUMABLE'
  | (string & {});

export type GatheringInventoryItemType =
  | 'MATERIAL'
  | 'EQUIPMENT'
  | 'CONSUMABLE'
  | (string & {});

export type GatheringPrimaryStatKey =
  | 'strength'
  | 'vitality'
  | 'agility'
  | 'precision'
  | 'technique'
  | 'willpower'
  | (string & {});

export type GatheringCraftIngredientRole =
  | 'MAIN_COMPONENT'
  | 'SHARED_MATERIAL'
  | 'RARE_MOB_DROP'
  | (string & {});

export interface GatheringMapViewModel {
  id: string;
  name: string;
  tier: number;
  minLevel?: number | null;
  maxLevel?: number | null;
  description?: string | null;
}

export interface GatheringCharacterViewModel {
  id: string;
  name: string;
  level: number;
  status?: string | null;
  currentHp?: number | null;
  maxHp?: number | null;
  class?: {
    id?: string | null;
    name?: string | null;
  } | null;
}

export interface GatheringStatBonusViewModel {
  stat: GatheringPrimaryStatKey;
  label: string;
  amount: number;
}

export interface GatheringAffinityBonusViewModel {
  xpMultiplier: number;
  productionMultiplier: number;
}

export interface GatheringSkillViewModel {
  id: string | null;
  characterId: string;
  origin: GatheringAllowedOrigin | GatheringMaterialOrigin | string;

  level: number;
  xp: number;
  totalXp: number;

  xpToNextLevel: number | null;
  xpProgressPercent: number;
  isAtLevelCap: boolean;

  isClassAffinity: boolean;

  statBonus: GatheringStatBonusViewModel;

  productionMultiplier?: number;
  productionBonusPercent: number;

  affinityBonus?: GatheringAffinityBonusViewModel | null;
}

export interface GatheringRulesViewModel {
  levelCap: number;
  statBonusPerLevel: number;
  productionBonusPerLevel: number;
  affinityXpMultiplier: number;
  affinityProductionMultiplier: number;
}

export interface GatheringSkillsSummaryViewModel {
  skills: GatheringSkillViewModel[];
  byOrigin: Partial<Record<GatheringAllowedOrigin, GatheringSkillViewModel>> &
    Record<string, GatheringSkillViewModel | undefined>;

  affinities: GatheringAllowedOrigin[];
  className: string;
  classSlug: string;

  totalStatBonus: {
    strength: number;
    vitality: number;
    agility: number;
    precision: number;
    technique: number;
    willpower: number;
    [key: string]: number;
  };

  rules: GatheringRulesViewModel;
}

export interface GatheringMaterialRecipeUsageViewModel {
  recipeId: string;

  tier: number;
  outputQuantity: number;

  quantity: number;
  role: GatheringCraftIngredientRole | string;
  origin: GatheringMaterialOrigin | string;

  outputItemId: string;
  outputItemName: string;
  outputItemTier: number;
  outputItemRarity: GatheringItemRarity | string;
  outputItemSlot: GatheringItemSlot | string;
  outputItemFamily: string;

  outputItemClassId: string | null;
  outputItemClassName: string | null;
}

export interface GatheringMaterialViewModel {
  id: string;
  name: string;
  description?: string | null;

  tier: number;
  rarity?: GatheringItemRarity | string | null;
  slot?: GatheringItemSlot | string | null;
  family?: string | null;

  materialOrigin?: GatheringMaterialOrigin | string | null;
  mapId?: string | null;

  requiredGatheringLevel?: number | null;
  gatheringXpPerUnit?: number | null;
  baseGatheringRatePerHour?: number | null;

  ratePerHour?: number | null;

  isUnlockedByDefault?: boolean | null;

  usedInRecipes?: GatheringMaterialRecipeUsageViewModel[];
  usedInRecipeCount?: number;
  relatedClasses?: string[];
}

export interface GatheringAvailableMaterialsResponse {
  map: GatheringMapViewModel;
  origin: GatheringAllowedOrigin | string;
  ratePerHour: number;
  materials: GatheringMaterialViewModel[];
}

export interface StartGatheringPayload {
  characterId: string;
  mapId: string;
  origin: GatheringAllowedOrigin;
  targetMaterialId: string;
}

export interface GatheringSessionViewModel {
  id: string;

  status: GatheringActivityStatus;
  origin: GatheringAllowedOrigin | GatheringMaterialOrigin | string;

  startedAt: string;
  lastResolvedAt?: string | null;
  progressRemainder?: number | null;

  character?: GatheringCharacterViewModel | null;
  map?: GatheringMapViewModel | null;
  targetMaterial?: GatheringMaterialViewModel | null;

  gatheringSkill?: GatheringSkillViewModel | null;
  productionPreview?: GatheringProductionPreviewViewModel | null;
}

export interface StartGatheringResponse {
  message: string;
  session: GatheringSessionViewModel;
  gatheringSkill?: GatheringSkillViewModel | null;
}

export interface GatheringProductionPreviewViewModel {
  elapsedSeconds: number;
  elapsedHours: number;

  ratePerHour: number;
  baseRatePerHour?: number | null;
  defaultRatePerHour?: number | null;

  skillRateMultiplier?: number | null;
  affinityRateMultiplier?: number | null;
  finalRateMultiplier?: number | null;

  estimatedQuantityToCollect: number;

  currentProgressRemainder: number;
  estimatedNewProgressRemainder: number;

  nextUnitProgressPercent?: number | null;

  material?: GatheringMaterialViewModel | null;
  map?: GatheringMapViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
}

export interface GatheringStatusActiveResponse {
  active: true;
  session: GatheringSessionViewModel;
  gatheringSkill?: GatheringSkillViewModel | null;
  productionPreview: GatheringProductionPreviewViewModel;
}

export interface GatheringStatusInactiveResponse {
  active: false;
  message: string;
}

export type GatheringStatusResponse =
  | GatheringStatusActiveResponse
  | GatheringStatusInactiveResponse;

export interface GatheringCollectedViewModel {
  itemId: string;
  name: string;
  quantity: number;
}

export interface GatheringProductionResultViewModel {
  elapsedSeconds: number;
  elapsedHours: number;

  ratePerHour: number;
  baseRatePerHour?: number | null;
  defaultRatePerHour?: number | null;

  skillRateMultiplier?: number | null;
  affinityRateMultiplier?: number | null;
  finalRateMultiplier?: number | null;

  previousProgressRemainder: number;
  newProgressRemainder: number;
}

export interface GatheringStatBonusGainedViewModel {
  stat: GatheringPrimaryStatKey;
  label: string;
  amount: number;
}

export interface GatheringProgressViewModel {
  origin: GatheringAllowedOrigin | GatheringMaterialOrigin | string;

  xpGained: number;

  previousLevel: number;
  newLevel: number;

  leveledUp: boolean;
  levelsGained: number;

  currentXp: number;
  totalXp: number;

  xpToNextLevel: number | null;
  xpProgressPercent: number;

  statBonusGained?: GatheringStatBonusGainedViewModel | null;

  skill?: GatheringSkillViewModel | null;
}

export interface GatheringInventoryItemViewModel {
  id: string;

  characterId: string;
  itemId: string;

  type: GatheringInventoryItemType | string;
  quantity: number;

  createdAt?: string;
  updatedAt?: string;
}

export interface CollectGatheringResponse {
  message: string;

  collected: GatheringCollectedViewModel;
  production: GatheringProductionResultViewModel;

  gatheringProgress?: GatheringProgressViewModel | null;

  session: GatheringSessionViewModel;

  inventoryItem?: GatheringInventoryItemViewModel | null;
}

export interface StopGatheringResponse {
  message: string;

  collected: GatheringCollectedViewModel;
  production: GatheringProductionResultViewModel;

  gatheringProgress?: GatheringProgressViewModel | null;

  session: GatheringSessionViewModel;
}

export type GatheringActionResult =
  | StartGatheringResponse
  | CollectGatheringResponse
  | StopGatheringResponse;

export interface GatheringApiErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;

  receivedOrigin?: string;
  validOrigins?: string[];
  validGatheringOrigins?: string[];

  selectedGathering?: string;
  materialOrigin?: string;
  material?: string;

  selectedMapId?: string;
  materialMapId?: string;

  mapTier?: number;
  materialTier?: number;

  characterLevel?: number;
  requiredMinLevel?: number;

  origin?: string;
  currentGatheringLevel?: number;
  requiredGatheringLevel?: number;
}

export interface GatheringOriginOption {
  key: GatheringAllowedOrigin;
  label: string;
  description: string;
  statLabel: string;
  relatedClasses: string[];
}

export const GATHERING_ORIGIN_OPTIONS: GatheringOriginOption[] = [
  {
    key: 'DESMANCHE',
    label: 'Desmanche',
    description: 'Recupere sucata, estruturas pesadas e componentes rígidos.',
    statLabel: '+ Força',
    relatedClasses: ['Lutador', 'Atirador'],
  },
  {
    key: 'COLETA',
    label: 'Coleta',
    description: 'Colete tecidos, couro, suprimentos civis e materiais básicos.',
    statLabel: '+ Vitalidade',
    relatedClasses: ['Lutador', 'Médico'],
  },
  {
    key: 'PATRULHA',
    label: 'Patrulha',
    description: 'Explore rotas, reconhecimento e peças leves de mobilidade.',
    statLabel: '+ Agilidade',
    relatedClasses: ['Atirador', 'Assassino'],
  },
  {
    key: 'ARSENAL',
    label: 'Arsenal',
    description: 'Busque munição, mecanismos e partes de armamentos.',
    statLabel: '+ Precisão',
    relatedClasses: ['Atirador', 'Assassino'],
  },
  {
    key: 'TECNOVARREDURA',
    label: 'Tecnovarredura',
    description: 'Varra circuitos, sensores, módulos e ferramentas técnicas.',
    statLabel: '+ Técnica',
    relatedClasses: ['Assassino', 'Médico'],
  },
  {
    key: 'CONTENCAO',
    label: 'Contenção',
    description: 'Recupere filtros, lacres e materiais químicos controlados.',
    statLabel: '+ Vontade',
    relatedClasses: ['Lutador', 'Médico'],
  },
];

export function isGatheringAllowedOrigin(
  value: unknown,
): value is GatheringAllowedOrigin {
  return (
    value === 'DESMANCHE' ||
    value === 'COLETA' ||
    value === 'CONTENCAO' ||
    value === 'ARSENAL' ||
    value === 'PATRULHA' ||
    value === 'TECNOVARREDURA'
  );
}

export function getGatheringOriginLabel(origin?: string | null): string {
  if (!origin) return 'Expedição';

  const option = GATHERING_ORIGIN_OPTIONS.find((item) => item.key === origin);

  return option?.label ?? origin;
}

export function getGatheringOriginDescription(origin?: string | null): string {
  if (!origin) return 'Expedição idle para obtenção de materiais.';

  const option = GATHERING_ORIGIN_OPTIONS.find((item) => item.key === origin);

  return option?.description ?? 'Expedição idle para obtenção de materiais.';
}

export function getGatheringOriginStatLabel(origin?: string | null): string {
  if (!origin) return 'Progressão';

  const option = GATHERING_ORIGIN_OPTIONS.find((item) => item.key === origin);

  return option?.statLabel ?? 'Progressão';
}

export function getGatheringOriginRelatedClasses(
  origin?: string | null,
): string[] {
  if (!origin) return [];

  const option = GATHERING_ORIGIN_OPTIONS.find((item) => item.key === origin);

  return option?.relatedClasses ?? [];
}

export function formatGatheringOriginRelatedClasses(
  origin?: string | null,
): string {
  const relatedClasses = getGatheringOriginRelatedClasses(origin);

  if (relatedClasses.length <= 0) {
    return 'Classes: —';
  }

  return `Classes: ${relatedClasses.join(' / ')}`;
}

export function getGatheringSkillByOrigin(
  skills: GatheringSkillViewModel[] | undefined | null,
  origin: string | undefined | null,
): GatheringSkillViewModel | null {
  if (!skills || !origin) return null;

  return skills.find((skill) => skill.origin === origin) ?? null;
}

export function getGatheringRequiredLevel(
  material?: GatheringMaterialViewModel | null,
): number {
  const requiredLevel = Number(material?.requiredGatheringLevel ?? 1);

  if (!Number.isFinite(requiredLevel)) return 1;

  return Math.max(1, Math.floor(requiredLevel));
}

export function getGatheringSkillLevel(
  skill?: GatheringSkillViewModel | null,
): number {
  const level = Number(skill?.level ?? 1);

  if (!Number.isFinite(level)) return 1;

  return Math.max(1, Math.floor(level));
}

export function isGatheringMaterialUnlocked(params: {
  material?: GatheringMaterialViewModel | null;
  skill?: GatheringSkillViewModel | null;
}): boolean {
  const requiredLevel = getGatheringRequiredLevel(params.material);
  const currentLevel = getGatheringSkillLevel(params.skill);

  return currentLevel >= requiredLevel;
}

export function getGatheringXpPerUnit(
  material?: GatheringMaterialViewModel | null,
): number {
  const xp = Number(material?.gatheringXpPerUnit ?? 0);

  if (!Number.isFinite(xp)) return 0;

  return Math.max(0, Math.floor(xp));
}

export function getGatheringMaterialRatePerHour(
  material?: GatheringMaterialViewModel | null,
  fallbackRatePerHour?: number | null,
): number | null {
  const rate = Number(
    material?.ratePerHour ??
      material?.baseGatheringRatePerHour ??
      fallbackRatePerHour ??
      NaN,
  );

  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return rate;
}

export function getGatheringMaterialUsedInRecipes(
  material?: GatheringMaterialViewModel | null,
): GatheringMaterialRecipeUsageViewModel[] {
  return material?.usedInRecipes ?? [];
}

export function getGatheringMaterialPrimaryRecipe(
  material?: GatheringMaterialViewModel | null,
): GatheringMaterialRecipeUsageViewModel | null {
  const usedInRecipes = getGatheringMaterialUsedInRecipes(material);

  return usedInRecipes[0] ?? null;
}

export function getGatheringMaterialRelatedClasses(
  material?: GatheringMaterialViewModel | null,
): string[] {
  if (!material) return [];

  if (material.relatedClasses && material.relatedClasses.length > 0) {
    return material.relatedClasses;
  }

  const recipeClasses = getGatheringMaterialUsedInRecipes(material)
    .map((recipe) => recipe.outputItemClassName)
    .filter((className): className is string => Boolean(className));

  return Array.from(new Set(recipeClasses));
}

export function formatGatheringMaterialRelatedClasses(
  material?: GatheringMaterialViewModel | null,
): string {
  const relatedClasses = getGatheringMaterialRelatedClasses(material);

  if (relatedClasses.length <= 0) {
    return 'Classe: —';
  }

  if (relatedClasses.length === 1) {
    return `Classe: ${relatedClasses[0]}`;
  }

  return `Classes: ${relatedClasses.join(' / ')}`;
}

export function formatGatheringMaterialUsedInRecipes(
  material?: GatheringMaterialViewModel | null,
  limit = 2,
): string {
  const usedInRecipes = getGatheringMaterialUsedInRecipes(material);

  if (usedInRecipes.length <= 0) {
    return 'Usado em: receita não vinculada';
  }

  const displayedRecipes = usedInRecipes
    .slice(0, limit)
    .map((recipe) => recipe.outputItemName);

  const hiddenCount = Math.max(0, usedInRecipes.length - displayedRecipes.length);

  if (hiddenCount > 0) {
    return `Usado em: ${displayedRecipes.join(' / ')} +${hiddenCount}`;
  }

  return `Usado em: ${displayedRecipes.join(' / ')}`;
}

export function formatGatheringRecipeQuantity(
  recipe?: GatheringMaterialRecipeUsageViewModel | null,
): string {
  if (!recipe) return 'Qtd. —';

  const quantity = Number(recipe.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'Qtd. —';
  }

  return `Qtd. ${Math.floor(quantity)}`;
}

export function formatGatheringOutputItemSlot(slot?: string | null): string {
  switch (slot) {
    case 'MAIN_HAND':
      return 'Arma';
    case 'OFF_HAND':
      return 'Apoio';
    case 'HEAD':
      return 'Elmo';
    case 'ARMOR':
      return 'Armadura';
    case 'PANTS':
      return 'Calça';
    case 'BOOTS':
      return 'Botas';
    case 'CONSUMABLE':
      return 'Consumível';
    case 'MATERIAL':
      return 'Material';
    default:
      return slot ?? 'Item';
  }
}

export function formatGatheringDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

export function formatGatheringRate(ratePerHour?: number | null): string {
  const rate = Number(ratePerHour);

  if (!Number.isFinite(rate) || rate <= 0) {
    return 'Taxa —';
  }

  return `${Number(rate.toFixed(2)).toLocaleString('pt-BR')}/h`;
}

export function formatGatheringTimePerUnit(
  ratePerHour?: number | null,
): string {
  const rate = Number(ratePerHour);

  if (!Number.isFinite(rate) || rate <= 0) {
    return 'Tempo indefinido';
  }

  const totalSeconds = Math.max(1, Math.ceil(3600 / rate));

  if (totalSeconds < 60) {
    return `${totalSeconds}s por item`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}min por item`;
  }

  if (hours > 0) {
    return `${hours}h por item`;
  }

  if (seconds > 0) {
    return `${minutes}min ${seconds}s por item`;
  }

  return `${minutes}min por item`;
}

export function formatGatheringTimePerUnitShort(
  ratePerHour?: number | null,
): string {
  const rate = Number(ratePerHour);

  if (!Number.isFinite(rate) || rate <= 0) {
    return '—';
  }

  const totalSeconds = Math.max(1, Math.ceil(3600 / rate));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  if (seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${minutes}m`;
}

export function clampGatheringPercent(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.min(100, parsed));
}