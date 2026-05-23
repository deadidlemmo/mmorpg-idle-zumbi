import type { MouseEvent } from 'react';
import { useEffect } from 'react';
import type {
  GatheringMaterialViewModel,
  GatheringSkillViewModel,
} from '../types/gathering.types';
import {
  formatGatheringTimePerUnitShort,
  getGatheringMaterialRatePerHour,
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
  const iconUrl = getMaterialIconUrl(material);
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
            </div>
          </div>
        </header>

        <div className="gathering-usage-modal__actions">
          <button
            type="button"
            className="gathering-usage-modal__inspect-button"
            title="Inspeção detalhada será adicionada depois."
          >
            Inspecionar item
          </button>

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
