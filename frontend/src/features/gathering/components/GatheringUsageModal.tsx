import type { MouseEvent } from 'react';
import { useEffect } from 'react';
import type {
    GatheringMaterialRecipeUsageViewModel,
    GatheringMaterialViewModel,
} from '../types/gathering.types';
import {
    formatGatheringOutputItemSlot,
    formatGatheringRecipeQuantity,
    getGatheringMaterialUsedInRecipes,
} from '../types/gathering.types';

interface GatheringUsageModalProps {
  isOpen: boolean;
  material?: GatheringMaterialViewModel | null;
  onClose: () => void;
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
    return 'Este material ainda não possui receita vinculada.';
  }

  if (recipes.length === 1) {
    return 'Este material é usado em 1 receita.';
  }

  return `Este material é usado em ${recipes.length} receitas.`;
}

export function GatheringUsageModal({
  isOpen,
  material,
  onClose,
}: GatheringUsageModalProps) {
  const recipes = sortRecipes(getGatheringMaterialUsedInRecipes(material));

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

  if (!isOpen || !material) {
    return null;
  }

  function handleBackdropClick() {
    onClose();
  }

  function handlePanelClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  return (
    <div
      className="gathering-usage-modal"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className="gathering-usage-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gathering-usage-modal-title"
        onClick={handlePanelClick}
      >
        <header className="gathering-usage-modal__header">
          <div className="gathering-usage-modal__material">
            <span className="gathering-usage-modal__material-icon" aria-hidden="true">
              {getMaterialInitials(material)}
            </span>

            <div>
              <span className="gathering-card__eyebrow">Usos do material</span>
              <h2 id="gathering-usage-modal-title">{material.name}</h2>
              <p>{getRecipeSummary(recipes)}</p>
            </div>
          </div>

          <button
            type="button"
            className="gathering-usage-modal__close"
            onClick={onClose}
            aria-label="Fechar usos do material"
          >
            ×
          </button>
        </header>

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

                      <span>{formatGatheringOutputItemSlot(recipe.outputItemSlot)}</span>
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
      </div>
    </div>
  );
}

export default GatheringUsageModal;