import { useRef, useState } from 'react';
import type { InventoryEntry } from '../types/inventory.types';
import {
  formatInventoryType,
  getInventoryItemIcon,
  getInventoryItemInitials,
} from '../utils/inventory.utils';

interface InventoryItemCardProps {
  entry: InventoryEntry;
  onSelect: () => void;
}

type InventoryItemWithOptionalLevel = InventoryEntry['item'] & {
  level?: number | null;
  requiredLevel?: number | null;
  minLevel?: number | null;
};

type TooltipPlacement = 'center' | 'start' | 'end';

function normalizeRarityClass(rarity?: string | null) {
  return String(rarity ?? 'COMMON')
    .trim()
    .toLowerCase();
}

function formatQuantity(quantity?: number | null) {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));

  if (safeQuantity >= 1000000) {
    return `${(safeQuantity / 1000000).toFixed(
      safeQuantity >= 10000000 ? 0 : 1,
    )}M`;
  }

  if (safeQuantity >= 1000) {
    return `${(safeQuantity / 1000).toFixed(
      safeQuantity >= 10000 ? 0 : 1,
    )}K`;
  }

  return String(safeQuantity);
}

function getCompactTypeLabel(label: string) {
  const normalizedLabel = label.trim();

  const labels: Record<string, string> = {
    Equipamento: 'E',
    Equipamentos: 'E',
    Material: 'M',
    Materiais: 'M',
    Consumível: 'C',
    Consumíveis: 'C',
    Recurso: 'R',
    Recursos: 'R',
    Outro: 'O',
    Outros: 'O',
  };

  return labels[normalizedLabel] ?? normalizedLabel.slice(0, 1).toUpperCase();
}

function getItemLevelLabel(item: InventoryItemWithOptionalLevel) {
  const rawLevel = item.level ?? item.requiredLevel ?? item.minLevel;

  if (typeof rawLevel !== 'number' || !Number.isFinite(rawLevel)) {
    return null;
  }

  return `Level ${Math.max(1, Math.floor(rawLevel))}`;
}

function getItemTierLabel(item: InventoryItemWithOptionalLevel) {
  if (typeof item.tier !== 'number' || !Number.isFinite(item.tier)) {
    return null;
  }

  return `Tier ${Math.max(0, Math.floor(item.tier))}`;
}

export function InventoryItemCard({ entry, onSelect }: InventoryItemCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [tooltipPlacement, setTooltipPlacement] =
    useState<TooltipPlacement>('center');
  const item = entry.item as InventoryItemWithOptionalLevel;

  const itemName = item.name?.trim() || 'Item desconhecido';
  const rarity = item.rarity ?? 'COMMON';
  const rarityClass = normalizeRarityClass(rarity);

  const itemTypeLabel = formatInventoryType(entry);
  const compactTypeLabel = getCompactTypeLabel(itemTypeLabel);

  const tierLabel = getItemTierLabel(item);
  const levelLabel = getItemLevelLabel(item);
  const secondaryTooltipLabel = levelLabel ?? tierLabel ?? itemTypeLabel;

  const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
  const quantityLabel = formatQuantity(quantity);

  function updateTooltipPlacement() {
    const cardElement = cardRef.current;

    if (!cardElement) return;

    const cardBounds = cardElement.getBoundingClientRect();
    const edgeSafeArea = 136;

    if (cardBounds.left < edgeSafeArea) {
      setTooltipPlacement('start');
      return;
    }

    if (window.innerWidth - cardBounds.right < edgeSafeArea) {
      setTooltipPlacement('end');
      return;
    }

    setTooltipPlacement('center');
  }

  return (
    <article
      ref={cardRef}
      className={`inventory-item-card rarity-${rarityClass}`}
      data-rarity={rarityClass}
      data-type={itemTypeLabel}
    >
      <button
        type="button"
        className="inventory-item-card__button"
        onClick={onSelect}
        onFocus={updateTooltipPlacement}
        onPointerEnter={updateTooltipPlacement}
        aria-label={`Ver detalhes de ${itemName}. Quantidade: ${quantity}. ${secondaryTooltipLabel}.`}
      >
        <div className="inventory-item-card__topline" aria-hidden="true">
          {quantity > 0 ? (
            <span className="inventory-item-card__quantity">
              x{quantityLabel}
            </span>
          ) : null}

          <span className="inventory-item-card__type">
            {compactTypeLabel}
          </span>
        </div>

        <div className="inventory-item-card__content">
          <div className="inventory-item-card__icon" aria-hidden="true">
            <span className="inventory-item-card__glyph">
              {getInventoryItemIcon(entry)}
            </span>

            <strong>{getInventoryItemInitials(item)}</strong>
          </div>
        </div>

        <div
          className={`inventory-item-card__tooltip inventory-item-card__tooltip--${tooltipPlacement}`}
          aria-hidden="true"
        >
          <strong>{itemName}</strong>
          <span>{secondaryTooltipLabel}</span>
        </div>
      </button>
    </article>
  );
}
