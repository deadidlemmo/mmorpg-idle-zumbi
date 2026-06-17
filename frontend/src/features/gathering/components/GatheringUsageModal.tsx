import type { MouseEvent } from 'react';
import { useEffect } from 'react';
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
import {
  getGatheringMaterialImageUrl,
  getGatheringRecipeOutputImageUrl,
} from '../utils/gatheringMaterialAssets';

interface GatheringUsageModalProps {
  isOpen: boolean;
  material?: GatheringMaterialViewModel | null;
  gatheringSkill?: GatheringSkillViewModel | null;
  fallbackRatePerHour?: number | null;
  isBusy?: boolean;
  isStartDisabled?: boolean;
  startDisabledReason?: string | null;
  onClose: () => void;
  onStart?: (material: GatheringMaterialViewModel) => void | Promise<void>;
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

function getRecipeInitials(recipe: GatheringMaterialRecipeUsageViewModel): string {
  const words = recipe.outputItemName.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 0) return '?';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function sortRecipeUsages(
  recipes: GatheringMaterialRecipeUsageViewModel[],
): GatheringMaterialRecipeUsageViewModel[] {
  return [...recipes].sort((first, second) => {
    if (first.outputItemTier !== second.outputItemTier) {
      return first.outputItemTier - second.outputItemTier;
    }

    const firstClass = first.outputItemClassName ?? '';
    const secondClass = second.outputItemClassName ?? '';

    if (firstClass !== secondClass) {
      return firstClass.localeCompare(secondClass, 'pt-BR');
    }

    return first.outputItemName.localeCompare(second.outputItemName, 'pt-BR');
  });
}

function formatRecipeRarity(rarity?: string | null): string {
  switch (rarity) {
    case 'COMMON':
      return 'Comum';
    case 'UNCOMMON':
      return 'Incomum';
    case 'RARE':
      return 'Raro';
    case 'EPIC':
      return 'Epico';
    case 'LEGENDARY':
      return 'Lendario';
    default:
      return rarity ?? 'Item';
  }
}

function formatOutputQuantity(recipe: GatheringMaterialRecipeUsageViewModel): string {
  const quantity = Number(recipe.outputQuantity ?? 1);

  if (!Number.isFinite(quantity) || quantity <= 1) {
    return 'Cria x1';
  }

  return `Cria x${Math.floor(quantity)}`;
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
  isStartDisabled = false,
  startDisabledReason,
  onClose,
  onStart,
}: GatheringUsageModalProps) {
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
  const iconUrl = getGatheringMaterialImageUrl(material);
  const usedInRecipes = material
    ? sortRecipeUsages(getGatheringMaterialUsedInRecipes(material))
    : [];
  const usedInRecipesCountLabel =
    usedInRecipes.length === 1
      ? '1 item final'
      : `${usedInRecipes.length} itens finais`;
  const canStart = Boolean(
    material && onStart && isUnlocked && !isBusy && !isStartDisabled,
  );

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

  function handleClose() {
    onClose();
  }

  function handleBackdropClick() {
    handleClose();
  }

  function handlePanelClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  async function handleStartClick() {
    if (!material || !canStart) return;

    await onStart?.(material);
    handleClose();
  }

  return (
    <div
      className="gathering-usage-modal"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className="gathering-usage-modal__panel gathering-usage-modal__panel--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gathering-usage-modal-title"
        onClick={handlePanelClick}
      >
        <button
          type="button"
          className="gathering-usage-modal__close"
          onClick={handleClose}
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
            <h2 id="gathering-usage-modal-title">{material.name}</h2>

            <div className="gathering-usage-modal__chips">
              <span>Lv. {requiredLevel}</span>
              <span>{timePerUnitLabel}</span>
              <span>+{xpPerUnit} XP</span>
              <span>{usedInRecipesCountLabel}</span>
            </div>
          </div>
        </header>

        <section
          className="gathering-usage-modal__content gathering-usage-modal__content--inline"
          aria-label="Itens finais criados com este material"
        >
          <div className="gathering-usage-modal__recipes-heading">
            <span>Usado para criar</span>
            <strong>{usedInRecipesCountLabel}</strong>
          </div>

          {usedInRecipes.length > 0 ? (
            <div className="gathering-usage-modal__recipes">
              {usedInRecipes.map((recipe) => {
                const classLabel = recipe.outputItemClassName ?? 'Todas as classes';
                const slotLabel = formatGatheringOutputItemSlot(recipe.outputItemSlot);
                const outputImageUrl = getGatheringRecipeOutputImageUrl(recipe);

                return (
                  <article
                    className="gathering-usage-modal__recipe"
                    key={`${recipe.recipeId}-${recipe.outputItemId}`}
                  >
                    <span
                      className="gathering-usage-modal__recipe-icon"
                      aria-hidden="true"
                    >
                      {outputImageUrl ? (
                        <img src={outputImageUrl} alt="" draggable={false} />
                      ) : (
                        getRecipeInitials(recipe)
                      )}
                    </span>

                    <div className="gathering-usage-modal__recipe-body">
                      <div className="gathering-usage-modal__recipe-top">
                        <strong title={recipe.outputItemName}>
                          {recipe.outputItemName}
                        </strong>
                        <span>T{recipe.outputItemTier}</span>
                      </div>

                      <p>
                        {slotLabel} - {classLabel}
                      </p>

                      <footer className="gathering-usage-modal__recipe-footer">
                        <span>{formatGatheringRecipeQuantity(recipe)} deste material</span>
                        <span>{formatOutputQuantity(recipe)}</span>
                        <span>{formatRecipeRarity(recipe.outputItemRarity)}</span>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="gathering-usage-modal__empty-usage">
              <strong>Sem item final vinculado</strong>
              <span>Este material ainda nao aparece em receitas de crafting.</span>
            </div>
          )}
        </section>

        <div className="gathering-usage-modal__actions">
          <span className="gathering-usage-modal__usage-count">
            {usedInRecipes.length > 0 ? usedInRecipesCountLabel : 'Sem receita'}
          </span>

          <button
            type="button"
            className="gathering-usage-modal__start-button"
            onClick={() => void handleStartClick()}
            disabled={!canStart}
            title={
              isStartDisabled
                ? (startDisabledReason ?? undefined)
                : isUnlocked
                  ? undefined
                  : `Requer nível ${requiredLevel}. Seu nível atual é ${currentSkillLevel}.`
            }
          >
            {isStartDisabled
              ? 'Bloqueado'
              : getStartButtonLabel({
                  isBusy,
                  isUnlocked,
                  requiredLevel,
                  hasStartAction: Boolean(onStart),
                })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GatheringUsageModal;
