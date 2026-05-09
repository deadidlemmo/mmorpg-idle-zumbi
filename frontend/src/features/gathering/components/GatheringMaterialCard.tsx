import type { CSSProperties } from 'react';
import type {
    GatheringMaterialRecipeUsageViewModel,
    GatheringMaterialViewModel,
    GatheringSkillViewModel,
} from '../types/gathering.types';
import {
    formatGatheringOutputItemSlot,
    formatGatheringTimePerUnitShort,
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

function getPrimaryRecipeSummary(
  recipe?: GatheringMaterialRecipeUsageViewModel | null,
): string {
  if (!recipe) {
    return 'Receita ainda não vinculada';
  }

  const outputSlot = formatGatheringOutputItemSlot(recipe.outputItemSlot);
  const outputClass = recipe.outputItemClassName ?? 'Classe livre';

  return `${outputClass} • ${outputSlot}`;
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

function getMaterialRelatedSummary(
  material: GatheringMaterialViewModel,
  primaryRecipe?: GatheringMaterialRecipeUsageViewModel | null,
): string {
  const relatedClasses = getGatheringMaterialRelatedClasses(material);

  if (relatedClasses.length > 0 && primaryRecipe) {
    return `${relatedClasses.join(' / ')} • ${formatGatheringOutputItemSlot(
      primaryRecipe.outputItemSlot,
    )}`;
  }

  if (relatedClasses.length > 0) {
    return relatedClasses.join(' / ');
  }

  return getPrimaryRecipeSummary(primaryRecipe);
}

export function GatheringMaterialCard({
  material,
  gatheringSkill,
  fallbackRatePerHour,
  isSelected = false,
  isActive = false,
  isBusy = false,
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
  const ratePerHour = getGatheringMaterialRatePerHour(
    material,
    fallbackRatePerHour,
  );

  const rarityMeta = getRarityMeta(material.rarity, material.tier);
  const primaryRecipe = getGatheringMaterialPrimaryRecipe(material);
  const iconUrl = getMaterialIconUrl(material);

  const timePerUnitLabel = formatGatheringTimePerUnitShort(ratePerHour);
  const relatedSummary = getMaterialRelatedSummary(material, primaryRecipe);
  const usageTitle = getRecipeUsageTitle(material);

  const canStart = Boolean(onStart) && isUnlocked && !isBusy && !isActive;
  const canViewUsage = Boolean(onViewUsage);

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
        aria-label={`Selecionar material ${material.name}`}
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
            {relatedSummary}
          </span>

          <span className="gathering-material-card__meta">
            <span
              className={
                isUnlocked
                  ? 'gathering-material-card__pill'
                  : 'gathering-material-card__pill gathering-material-card__pill--locked'
              }
            >
              Req. Nv. {requiredLevel}
            </span>

            <span className="gathering-material-card__pill gathering-material-card__pill--rate">
              +{xpPerUnit} XP
            </span>

            <span className="gathering-material-card__pill gathering-material-card__pill--time">
              {timePerUnitLabel}
            </span>
          </span>
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