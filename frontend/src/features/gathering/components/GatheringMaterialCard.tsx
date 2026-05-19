import type { CSSProperties } from 'react';
import type {
  GatheringMaterialRecipeUsageViewModel,
  GatheringMaterialViewModel,
  GatheringSkillViewModel,
} from '../types/gathering.types';
import {
  formatGatheringOutputItemSlot,
  getGatheringMaterialPrimaryRecipe,
  getGatheringMaterialRatePerHour,
  getGatheringMaterialRelatedClasses,
  getGatheringRequiredLevel,
  getGatheringSkillLevel,
  getGatheringXpPerUnit,
  isGatheringMaterialUnlocked,
} from '../types/gathering.types';

type GatheringVisualRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

interface GatheringMaterialCardProps {
  material: GatheringMaterialViewModel;
  gatheringSkill?: GatheringSkillViewModel | null;
  fallbackRatePerHour?: number | null;

  isSelected?: boolean;
  isActive?: boolean;
  isBusy?: boolean;
  isStartDisabled?: boolean;
  startDisabledReason?: string | null;

  onSelect?: (material: GatheringMaterialViewModel) => void;
  onStart?: (material: GatheringMaterialViewModel) => void | Promise<void>;
  onViewUsage?: (material: GatheringMaterialViewModel) => void;
}

interface RarityMeta {
  key: GatheringVisualRarity;
  label: string;
  rgb: string;
  cssClass: string;
}

interface GatheringRateDisplayMeta {
  baseRatePerHour: number | null;
  effectiveRatePerHour: number | null;
  hasBonus: boolean;
  bonusPercent: number;
  label: string;
  title: string;
}

function normalizeGatheringRarity(
  rarity?: string | null,
  tier?: number | null,
): GatheringVisualRarity {
  const normalizedRarity = rarity?.trim().toUpperCase();

  if (normalizedRarity === 'COMMON') return 'common';
  if (normalizedRarity === 'UNCOMMON') return 'uncommon';
  if (normalizedRarity === 'RARE') return 'rare';
  if (normalizedRarity === 'EPIC') return 'epic';
  if (normalizedRarity === 'LEGENDARY') return 'legendary';

  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) return 'common';

  if (safeTier >= 9) return 'legendary';
  if (safeTier >= 7) return 'epic';
  if (safeTier >= 5) return 'rare';
  if (safeTier >= 3) return 'uncommon';

  return 'common';
}

function getRarityMeta(
  rarity?: string | null,
  tier?: number | null,
): RarityMeta {
  const key = normalizeGatheringRarity(rarity, tier);

  const labels: Record<GatheringVisualRarity, string> = {
    common: 'Comum',
    uncommon: 'Incomum',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Lendário',
  };

  const colors: Record<GatheringVisualRarity, string> = {
    common: '231, 227, 216',
    uncommon: '224, 182, 91',
    rare: '101, 194, 113',
    epic: '167, 111, 224',
    legendary: '218, 83, 73',
  };

  return {
    key,
    label: labels[key],
    rgb: colors[key],
    cssClass: `equipment-rarity-${key}`,
  };
}

function getMaterialInitials(materialName: string): string {
  const words = materialName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= 0) return '?';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function getMaterialIconUrl(material: GatheringMaterialViewModel): string | null {
  const materialWithOptionalIcon = material as GatheringMaterialViewModel & {
    icon?: unknown;
    iconUrl?: unknown;
    iconPath?: unknown;
    imageUrl?: unknown;
  };

  const possibleIcon =
    materialWithOptionalIcon.iconUrl ??
    materialWithOptionalIcon.imageUrl ??
    materialWithOptionalIcon.iconPath ??
    materialWithOptionalIcon.icon;

  if (typeof possibleIcon !== 'string') {
    return null;
  }

  const trimmedIcon = possibleIcon.trim();

  return trimmedIcon.length > 0 ? trimmedIcon : null;
}

function getRecipeUsageTitle(material: GatheringMaterialViewModel): string {
  const recipes = material.usedInRecipes ?? [];

  if (recipes.length <= 0) {
    return 'Nenhuma receita vinculada a este material.';
  }

  const displayedRecipes = recipes
    .slice(0, 4)
    .map((recipe) => recipe.outputItemName)
    .join(' / ');

  const hiddenCount = Math.max(0, recipes.length - 4);

  if (hiddenCount > 0) {
    return `Usado em: ${displayedRecipes} +${hiddenCount}`;
  }

  return `Usado em: ${displayedRecipes}`;
}

function getMaterialRoleLabel(role?: string | null): string {
  switch (role) {
    case 'MAIN_COMPONENT':
      return 'Base principal';

    case 'SHARED_MATERIAL':
      return 'Material de apoio';

    case 'RARE_MOB_DROP':
      return 'Drop raro';

    default:
      return 'Ingrediente';
  }
}

function getMaterialUsageSlots(material: GatheringMaterialViewModel): string[] {
  const recipes = material.usedInRecipes ?? [];
  const labels = recipes
    .map((recipe) => formatGatheringOutputItemSlot(recipe.outputItemSlot))
    .filter(Boolean);

  return Array.from(new Set(labels));
}

function getMaterialPurposeLine(
  material: GatheringMaterialViewModel,
  primaryRecipe?: GatheringMaterialRecipeUsageViewModel | null,
): string {
  if (primaryRecipe) {
    return `${getMaterialRoleLabel(primaryRecipe.role)} para ${formatGatheringOutputItemSlot(
      primaryRecipe.outputItemSlot,
    )}`;
  }

  const slots = getMaterialUsageSlots(material);

  if (slots.length <= 0) {
    return 'Sem receita vinculada';
  }

  const visibleSlots = slots.slice(0, 2).join(' / ');
  const hiddenCount = Math.max(0, slots.length - 2);

  return hiddenCount > 0
    ? `Ingrediente para ${visibleSlots} +${hiddenCount}`
    : `Ingrediente para ${visibleSlots}`;
}

function getMaterialRecipeExampleLine(
  material: GatheringMaterialViewModel,
): string {
  const recipes = material.usedInRecipes ?? [];

  if (recipes.length <= 0) {
    return 'Sem item craftável vinculado';
  }

  const firstRecipe = recipes[0];
  const hiddenCount = Math.max(0, recipes.length - 1);

  if (hiddenCount > 0) {
    return `Ex.: ${firstRecipe.outputItemName} +${hiddenCount}`;
  }

  return `Ex.: ${firstRecipe.outputItemName}`;
}

function getPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeOrigin(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();

  return normalized && normalized.length > 0 ? normalized : null;
}

function isSkillApplicableToMaterial(params: {
  material: GatheringMaterialViewModel;
  gatheringSkill?: GatheringSkillViewModel | null;
}): boolean {
  const materialOrigin = normalizeOrigin(params.material.materialOrigin);
  const skillOrigin = normalizeOrigin(params.gatheringSkill?.origin);

  if (!materialOrigin || !skillOrigin) {
    return true;
  }

  return materialOrigin === skillOrigin;
}

function getMaterialBaseRatePerHour(params: {
  material: GatheringMaterialViewModel;
  fallbackRatePerHour?: number | null;
}): number | null {
  const baseRate = getPositiveNumber(params.material.baseGatheringRatePerHour);

  if (baseRate !== null) {
    return baseRate;
  }

  const fallbackRate = getPositiveNumber(params.fallbackRatePerHour);

  if (fallbackRate !== null) {
    return fallbackRate;
  }

  const materialRate = getPositiveNumber(params.material.ratePerHour);

  if (materialRate !== null) {
    return materialRate;
  }

  return null;
}

function getGatheringSkillProductionMultiplier(
  gatheringSkill?: GatheringSkillViewModel | null,
): number {
  if (!gatheringSkill) {
    return 1;
  }

  const directMultiplier = getPositiveNumber(gatheringSkill.productionMultiplier);

  const skillMultiplier =
    directMultiplier ??
    1 + Math.max(0, Number(gatheringSkill.productionBonusPercent ?? 0)) / 100;

  const affinityMultiplier =
    gatheringSkill.isClassAffinity && gatheringSkill.affinityBonus
      ? getPositiveNumber(gatheringSkill.affinityBonus.productionMultiplier) ?? 1
      : 1;

  return Math.max(1, skillMultiplier * affinityMultiplier);
}

function formatGatheringTimePerUnitReadable(
  ratePerHour?: number | null,
): string {
  const rate = Number(ratePerHour);

  if (!Number.isFinite(rate) || rate <= 0) {
    return '—';
  }

  const totalSeconds = Math.max(1, Math.ceil(3600 / rate));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes} min`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  if (minutes > 0 && seconds > 0) {
    return `${minutes} min ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes} min`;
  }

  return `${seconds}s`;
}

function formatGatheringTimePerUnitCompact(
  ratePerHour?: number | null,
): string {
  const rate = Number(ratePerHour);

  if (!Number.isFinite(rate) || rate <= 0) {
    return '—';
  }

  const totalSeconds = Math.max(1, Math.ceil(3600 / rate));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  if (minutes > 0 && seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

function getGatheringRateDisplayMeta(params: {
  material: GatheringMaterialViewModel;
  gatheringSkill?: GatheringSkillViewModel | null;
  fallbackRatePerHour?: number | null;
}): GatheringRateDisplayMeta {
  const baseRatePerHour = getMaterialBaseRatePerHour({
    material: params.material,
    fallbackRatePerHour: params.fallbackRatePerHour,
  });

  const rawRatePerHour = getGatheringMaterialRatePerHour(
    params.material,
    params.fallbackRatePerHour,
  );

  const skillApplies = isSkillApplicableToMaterial({
    material: params.material,
    gatheringSkill: params.gatheringSkill,
  });

  const skillMultiplier = skillApplies
    ? getGatheringSkillProductionMultiplier(params.gatheringSkill)
    : 1;

  const calculatedEffectiveRate =
    baseRatePerHour !== null ? baseRatePerHour * skillMultiplier : null;

  const effectiveRatePerHour =
    calculatedEffectiveRate !== null
      ? Math.max(calculatedEffectiveRate, rawRatePerHour ?? 0)
      : rawRatePerHour;

  const hasBonus =
    baseRatePerHour !== null &&
    effectiveRatePerHour !== null &&
    effectiveRatePerHour > baseRatePerHour * 1.005;

  const bonusPercent =
    hasBonus && baseRatePerHour !== null && effectiveRatePerHour !== null
      ? Math.round((effectiveRatePerHour / baseRatePerHour - 1) * 100)
      : 0;

  const effectiveTimeReadable =
    formatGatheringTimePerUnitReadable(effectiveRatePerHour);
  const baseTimeReadable = formatGatheringTimePerUnitReadable(baseRatePerHour);

  if (hasBonus) {
    return {
      baseRatePerHour,
      effectiveRatePerHour,
      hasBonus,
      bonusPercent,
      label: `${formatGatheringTimePerUnitCompact(effectiveRatePerHour)} real`,
      title: `Tempo real com bônus: ${effectiveTimeReadable}. Tempo base: ${baseTimeReadable}. Bônus aplicado: +${bonusPercent}%.`,
    };
  }

  return {
    baseRatePerHour,
    effectiveRatePerHour,
    hasBonus,
    bonusPercent,
    label: `${formatGatheringTimePerUnitCompact(effectiveRatePerHour)} base`,
    title: `Tempo base por item: ${baseTimeReadable}.`,
  };
}

export function GatheringMaterialCard({
  material,
  gatheringSkill,
  fallbackRatePerHour,
  isSelected = false,
  isActive = false,
  isBusy = false,
  isStartDisabled = false,
  startDisabledReason,
  onSelect,
  onStart,
  onViewUsage,
}: GatheringMaterialCardProps) {
  const requiredLevel = getGatheringRequiredLevel(material);
  const currentSkillLevel = getGatheringSkillLevel(gatheringSkill);
  const isUnlocked = isGatheringMaterialUnlocked({
    material,
    skill: gatheringSkill,
  });

  const xpPerUnit = getGatheringXpPerUnit(material);

  const rateDisplayMeta = getGatheringRateDisplayMeta({
    material,
    gatheringSkill,
    fallbackRatePerHour,
  });

  const rarityMeta = getRarityMeta(material.rarity, material.tier);
  const primaryRecipe = getGatheringMaterialPrimaryRecipe(material);
  const iconUrl = getMaterialIconUrl(material);

  const timePerUnitLabel = rateDisplayMeta.label;
  const timePerUnitTitle = rateDisplayMeta.title;

  const usageTitle = getRecipeUsageTitle(material);
  const purposeLine = getMaterialPurposeLine(material, primaryRecipe);
  const recipeExampleLine = getMaterialRecipeExampleLine(material);
  const relatedClasses = getGatheringMaterialRelatedClasses(material);

  const canStart =
    Boolean(onStart) && isUnlocked && !isBusy && !isActive && !isStartDisabled;
  const canViewUsage = Boolean(onViewUsage) && isUnlocked && !isBusy;

  const cardClassName = [
    'gathering-material-card',
    'gathering-material-card--visual',
    rarityMeta.cssClass,
    isSelected ? 'is-selected' : '',
    isActive ? 'is-active' : '',
    !isUnlocked ? 'is-locked is-hard-locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style = {
    '--equipment-rarity-rgb': rarityMeta.rgb,
  } as CSSProperties;

  function handleSelect() {
    if (!isUnlocked || isBusy) return;

    onSelect?.(material);

    if (canViewUsage) {
      onViewUsage?.(material);
    }
  }

  function handleStart() {
    if (!canStart) return;

    void onStart?.(material);
  }

  function handleViewUsage() {
    if (!canViewUsage) return;

    onViewUsage?.(material);
  }

  function getStartButtonLabel() {
    if (isActive) return 'Coletando';
    if (isStartDisabled) return 'Bloqueado';
    if (!isUnlocked) return `Req. Nv. ${requiredLevel}`;
    if (isBusy) return 'Aguarde';
    return 'Iniciar';
  }

  return (
    <article className={cardClassName} style={style}>
      <button
        type="button"
        className="gathering-material-card__select"
        onClick={handleSelect}
        disabled={!isUnlocked || isBusy}
        aria-label={`Abrir detalhes do material ${material.name}`}
        title={usageTitle}
      >
        <span className="gathering-material-card__visual" aria-hidden="true">
          <span className="gathering-material-card__icon-frame">
            {iconUrl ? (
              <img
                className="gathering-material-card__icon"
                src={iconUrl}
                alt=""
                draggable={false}
              />
            ) : (
              <span className="gathering-material-card__icon-fallback">
                {getMaterialInitials(material.name)}
              </span>
            )}
          </span>
        </span>

        <span className="gathering-material-card__body">
          <span className="gathering-material-card__header-line">
            <strong title={material.name}>{material.name}</strong>

            <span className="gathering-material-card__status-area">
              {!isUnlocked ? (
                <span
                  className="gathering-material-card__lock"
                  title={`Requer nível ${requiredLevel}. Seu nível atual é ${currentSkillLevel}.`}
                  aria-hidden="true"
                >
                  🔒
                </span>
              ) : null}

              {isActive ? (
                <span className="gathering-material-card__rarity-badge">
                  Ativo
                </span>
              ) : (
                <span className="gathering-material-card__rarity-badge">
                  {rarityMeta.label}
                </span>
              )}

              <span className="gathering-material-card__tier">
                T{material.tier}
              </span>
            </span>
          </span>

          <span
            className="gathering-material-card__craft-summary"
            title={usageTitle}
          >
            <span className="gathering-material-card__purpose-kicker">
              Serve para
            </span>
            <span className="gathering-material-card__purpose-text">
              {purposeLine}
            </span>
          </span>

          {relatedClasses.length > 0 ? (
            <span
              className="gathering-material-card__class-tags"
              aria-label={`Classes: ${relatedClasses.join(', ')}`}
            >
              {relatedClasses.slice(0, 3).map((className) => (
                <span key={className}>{className}</span>
              ))}
              {relatedClasses.length > 3 ? (
                <span>+{relatedClasses.length - 3}</span>
              ) : null}
            </span>
          ) : null}

          <span
            className="gathering-material-card__recipe-example"
            title={usageTitle}
          >
            {recipeExampleLine}
          </span>

          <span className="gathering-material-card__meta">
            <span
              className={
                isUnlocked
                  ? 'gathering-material-card__pill gathering-material-card__pill--level'
                  : 'gathering-material-card__pill gathering-material-card__pill--locked gathering-material-card__pill--level'
              }
            >
              Lv. {requiredLevel}
            </span>

            <span className="gathering-material-card__pill gathering-material-card__pill--rate">
              +{xpPerUnit} XP
            </span>

            <span
              className="gathering-material-card__pill gathering-material-card__pill--time"
              title={timePerUnitTitle}
            >
              {timePerUnitLabel}
            </span>
          </span>
        </span>

        <span className="gathering-material-card__active-indicator" aria-hidden="true">
          {isActive ? <span /> : null}
        </span>

        <span className="gathering-material-card__chevron" aria-hidden="true">
          ›
        </span>
      </button>

      {!isUnlocked ? (
        <div className="gathering-material-card__locked-layer" aria-hidden="true">
          <span className="gathering-material-card__locked-layer-icon">🔒</span>
          <span className="gathering-material-card__locked-layer-text">
            Bloqueado
          </span>
          <small>
            Precisa Nv. {requiredLevel} · Atual Nv. {currentSkillLevel}
          </small>
        </div>
      ) : null}

      <div className="gathering-material-card__footer-actions gathering-material-card__footer-actions--split">
        <button
          type="button"
          className="gathering-material-card__start-button"
          onClick={handleStart}
          disabled={!canStart}
          title={isStartDisabled ? (startDisabledReason ?? undefined) : undefined}
        >
          {getStartButtonLabel()}
        </button>

        <button
          type="button"
          className="gathering-material-card__recipes-button"
          onClick={handleViewUsage}
          disabled={!canViewUsage}
          title={usageTitle}
        >
          Ver usos
        </button>
      </div>
    </article>
  );
}

export default GatheringMaterialCard;
