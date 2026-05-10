import type { MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type {
    GatheringMaterialRecipeUsageViewModel,
    GatheringMaterialViewModel,
    GatheringSkillViewModel,
} from '../types/gathering.types';
import {
    formatGatheringOutputItemSlot,
    formatGatheringRecipeQuantity,
    formatGatheringTimePerUnitShort,
    getGatheringMaterialRatePerHour,
    getGatheringMaterialUsedInRecipes,
    getGatheringRequiredLevel,
    getGatheringSkillLevel,
    getGatheringXpPerUnit,
    isGatheringMaterialUnlocked,
} from '../types/gathering.types';

interface GatheringUsageModalProps {
  isOpen: boolean;
  material?: GatheringMaterialViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
  fallbackRatePerHour?: number | null;
  isBusy?: boolean;
  onClose: () => void;
  onStart?: (material: GatheringMaterialViewModel) => void | Promise<void>;
}

function getRoleLabel(role?: string | null): string {
  switch (role) {
    case 'MAIN_COMPONENT':
      return 'Componente principal';

    case 'SHARED_MATERIAL':
      return 'Material compartilhado';

    case 'RARE_MOB_DROP':
      return 'Drop raro';

    default:
      return role ?? 'Ingrediente';
  }
}

function getRarityLabel(rarity?: string | null): string {
  switch (rarity) {
    case 'COMMON':
      return 'Comum';

    case 'UNCOMMON':
      return 'Incomum';

    case 'RARE':
      return 'Raro';

    case 'EPIC':
      return 'Épico';

    case 'LEGENDARY':
      return 'Lendário';

    default:
      return rarity ?? 'Raridade não definida';
  }
}

function getOutputInitials(recipe: GatheringMaterialRecipeUsageViewModel): string {
  const words = recipe.outputItemName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= 0) return '?';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function getMaterialInitials(material?: GatheringMaterialViewModel | null): string {
  const safeName = material?.name?.trim();

  if (!safeName) return '?';

  const words = safeName.split(/\s+/).filter(Boolean);

  if (words.length <= 0) return '?';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function getMaterialIconUrl(
  material?: GatheringMaterialViewModel | null,
): string | null {
  if (!material) return null;

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

function getRecipeClassLabel(
  recipe: GatheringMaterialRecipeUsageViewModel,
): string {
  return recipe.outputItemClassName ?? 'Classe livre';
}

function getRecipeMetaLine(recipe: GatheringMaterialRecipeUsageViewModel): string {
  const slot = formatGatheringOutputItemSlot(recipe.outputItemSlot);
  const rarity = getRarityLabel(recipe.outputItemRarity);

  return `${getRecipeClassLabel(recipe)} • ${slot} • T${recipe.outputItemTier} • ${rarity}`;
}

function getRecipeQuantityLine(
  recipe: GatheringMaterialRecipeUsageViewModel,
): string {
  const ingredientQuantity = formatGatheringRecipeQuantity(recipe);
  const outputQuantity =
    recipe.outputQuantity > 1 ? `gera ${recipe.outputQuantity}` : 'gera 1';

  return `${ingredientQuantity} usado • ${outputQuantity}`;
}

function sortRecipes(
  recipes: GatheringMaterialRecipeUsageViewModel[],
): GatheringMaterialRecipeUsageViewModel[] {
  return [...recipes].sort((first, second) => {
    if (first.outputItemTier !== second.outputItemTier) {
      return first.outputItemTier - second.outputItemTier;
    }

    const firstSlot = formatGatheringOutputItemSlot(first.outputItemSlot);
    const secondSlot = formatGatheringOutputItemSlot(second.outputItemSlot);

    const slotCompare = firstSlot.localeCompare(secondSlot, 'pt-BR');

    if (slotCompare !== 0) {
      return slotCompare;
    }

    return first.outputItemName.localeCompare(second.outputItemName, 'pt-BR');
  });
}

function getRecipeSummary(recipes: GatheringMaterialRecipeUsageViewModel[]): string {
  if (recipes.length <= 0) {
    return 'Sem receita vinculada';
  }

  if (recipes.length === 1) {
    return '1 receita vinculada';
  }

  return `${recipes.length} receitas vinculadas`;
}

function getStartButtonLabel(params: {
  isBusy: boolean;
  isUnlocked: boolean;
  requiredLevel: number;
  hasStartAction: boolean;
}): string {
  if (params.isBusy) return 'Aguarde';
  if (!params.isUnlocked) return `Req. Nv. ${params.requiredLevel}`;
  if (!params.hasStartAction) return 'Iniciar';

  return 'Iniciar';
}

export function GatheringUsageModal({
  isOpen,
  material,
  gatheringSkill,
  fallbackRatePerHour,
  isBusy = false,
  onClose,
  onStart,
}: GatheringUsageModalProps) {
  const [isInspecting, setIsInspecting] = useState(false);

  const recipes = useMemo(
    () => sortRecipes(getGatheringMaterialUsedInRecipes(material)),
    [material],
  );

  const requiredLevel = material ? getGatheringRequiredLevel(material) : 1;
  const currentSkillLevel = getGatheringSkillLevel(gatheringSkill);

  const isUnlocked = material
    ? isGatheringMaterialUnlocked({
        material,
        skill: gatheringSkill,
      })
    : false;

  const xpPerUnit = material ? getGatheringXpPerUnit(material) : 0;
  const ratePerHour = material
    ? getGatheringMaterialRatePerHour(material, fallbackRatePerHour)
    : null;

  const timePerUnitLabel = formatGatheringTimePerUnitShort(ratePerHour);
  const iconUrl = getMaterialIconUrl(material);
  const canStart = Boolean(material && onStart && isUnlocked && !isBusy);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setIsInspecting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setIsInspecting(false);
  }, [material?.id]);

  if (!isOpen || !material) {
    return null;
  }

  function handleBackdropClick() {
    onClose();
  }

  function handlePanelClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  function handleInspectClick() {
    setIsInspecting((currentValue) => !currentValue);
  }

  async function handleStartClick() {
    if (!material || !canStart) return;

    await onStart?.(material);
    onClose();
  }

  return (
    <div
      className="gathering-usage-modal"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className={[
          'gathering-usage-modal__panel',
          'gathering-usage-modal__panel--compact',
          isInspecting ? 'is-inspecting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gathering-usage-modal-title"
        onClick={handlePanelClick}
      >
        <button
          type="button"
          className="gathering-usage-modal__close"
          onClick={onClose}
          aria-label="Fechar detalhes do material"
        >
          ×
        </button>

        <header className="gathering-usage-modal__hero">
          <span className="gathering-usage-modal__material-icon" aria-hidden="true">
            {iconUrl ? (
              <img
                className="gathering-usage-modal__material-image"
                src={iconUrl}
                alt=""
                draggable={false}
              />
            ) : (
              getMaterialInitials(material)
            )}
          </span>

          <div className="gathering-usage-modal__hero-body">
            <span className="gathering-card__eyebrow">
              Material de gathering
            </span>

            <h2 id="gathering-usage-modal-title">{material.name}</h2>

            <div className="gathering-usage-modal__chips">
              <span>Lv. {requiredLevel}</span>
              <span>{timePerUnitLabel}</span>
              <span>+{xpPerUnit} XP</span>
              <span>{getRecipeSummary(recipes)}</span>
            </div>
          </div>
        </header>

        <div className="gathering-usage-modal__actions">
          <button
            type="button"
            className="gathering-usage-modal__inspect-button"
            onClick={handleInspectClick}
          >
            {isInspecting ? 'Ocultar detalhes' : 'Inspecionar item'}
          </button>

          <button
            type="button"
            className="gathering-usage-modal__start-button"
            onClick={() => void handleStartClick()}
            disabled={!canStart}
            title={
              isUnlocked
                ? undefined
                : `Requer nível ${requiredLevel}. Seu nível atual é ${currentSkillLevel}.`
            }
          >
            {getStartButtonLabel({
              isBusy,
              isUnlocked,
              requiredLevel,
              hasStartAction: Boolean(onStart),
            })}
          </button>
        </div>

        {isInspecting ? (
          <div className="gathering-usage-modal__content">
            {recipes.length > 0 ? (
              <div className="gathering-usage-modal__recipes">
                {recipes.map((recipe) => (
                  <article
                    key={recipe.recipeId}
                    className="gathering-usage-modal__recipe"
                  >
                    <span
                      className="gathering-usage-modal__recipe-icon"
                      aria-hidden="true"
                    >
                      {getOutputInitials(recipe)}
                    </span>

                    <div className="gathering-usage-modal__recipe-body">
                      <div className="gathering-usage-modal__recipe-top">
                        <strong title={recipe.outputItemName}>
                          {recipe.outputItemName}
                        </strong>

                        <span>
                          {formatGatheringOutputItemSlot(recipe.outputItemSlot)}
                        </span>
                      </div>

                      <p>{getRecipeMetaLine(recipe)}</p>

                      <div className="gathering-usage-modal__recipe-footer">
                        <span>{getRoleLabel(recipe.role)}</span>
                        <span>{getRecipeQuantityLine(recipe)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="gathering-empty gathering-empty--compact">
                <strong>Nenhuma receita vinculada.</strong>
                <p>
                  Este material já pode existir no jogo, mas ainda não está
                  associado a uma receita retornada pela API.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default GatheringUsageModal;