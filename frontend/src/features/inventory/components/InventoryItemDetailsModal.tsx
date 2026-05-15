import { useEffect } from 'react';
import type { InventoryEntry } from '../types/inventory.types';
import {
  formatInventoryRarity,
  formatInventorySlot,
  formatInventoryType,
  formatMaterialOrigin,
  getInventoryBonusList,
  getInventoryItemIcon,
  getInventoryItemInitials,
  getInventoryPrimaryDetail,
} from '../utils/inventory.utils';

interface InventoryItemDetailsModalProps {
  entry: InventoryEntry | null;
  onClose: () => void;
}

type InventoryItemWithVisualMetadata = InventoryEntry['item'] & {
  image?: string | null;
  imageUrl?: string | null;
  iconUrl?: string | null;
  quality?: string | null;
  value?: number | string | null;
  goldValue?: number | string | null;
  level?: number | null;
  requiredLevel?: number | null;
  minLevel?: number | null;
  className?: string | null;
};

function normalizeRarityClass(rarity?: string | null) {
  return String(rarity ?? 'COMMON')
    .trim()
    .toLowerCase();
}

function hasPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatQuantity(quantity?: number | null) {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));

  return safeQuantity.toLocaleString('pt-BR');
}

function formatValue(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return `${value.toLocaleString('pt-BR')} Gold`;
  }

  return value;
}

function getItemLevel(item: InventoryItemWithVisualMetadata) {
  return item.level ?? item.requiredLevel ?? item.minLevel ?? null;
}

function getItemImageUrl(item: InventoryItemWithVisualMetadata) {
  return item.imageUrl ?? item.iconUrl ?? item.image ?? null;
}

function buildDetails(entry: InventoryEntry): Array<[string, string]> {
  const item = entry.item as InventoryItemWithVisualMetadata;
  const level = getItemLevel(item);
  const value = formatValue(item.value ?? item.goldValue);

  const details: Array<[string, string | null]> = [
    ['Quantidade', formatQuantity(entry.quantity)],
    ['Tipo', formatInventoryType(entry)],
    ['Qualidade', item.quality ?? null],
    ['Valor', value],
    ['Origem', formatMaterialOrigin(item.materialOrigin)],
    ['Raridade', formatInventoryRarity(item.rarity)],
    ['Slot compatível', formatInventorySlot(item.slot)],
    ['Tier', typeof item.tier === 'number' ? String(item.tier) : null],
    ['Nível', typeof level === 'number' ? String(level) : null],
    ['Classe', item.class?.name ?? item.className ?? null],
    ['Família', item.family ?? null],
    ['Mapa', item.map?.name ?? null],
  ];

  return details.filter((detail): detail is [string, string] =>
    Boolean(detail[1]),
  );
}

export function InventoryItemDetailsModal({
  entry,
  onClose,
}: InventoryItemDetailsModalProps) {
  useEffect(() => {
    if (!entry) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [entry, onClose]);

  useEffect(() => {
    if (!entry) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [entry]);

  if (!entry) return null;

  const item = entry.item as InventoryItemWithVisualMetadata;

  const itemName = item.name?.trim() || 'Item desconhecido';
  const description = item.description?.trim();
  const imageUrl = getItemImageUrl(item);

  const bonuses = getInventoryBonusList(item);
  const rarity = item.rarity ?? 'COMMON';
  const rarityClass = normalizeRarityClass(rarity);
  const typeLabel = formatInventoryType(entry);
  const primaryDetail = getInventoryPrimaryDetail(entry);
  const sourceLabel = primaryDetail ?? typeLabel;
  const details = buildDetails(entry);

  const hasStats =
    bonuses.length > 0 ||
    hasPositiveNumber(item.healFlat) ||
    hasPositiveNumber(item.healPercent);

  return (
    <div
      className="inventory-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-modal-title"
      aria-describedby={description ? 'inventory-modal-description' : undefined}
    >
      <button
        type="button"
        className="inventory-modal__backdrop"
        onClick={onClose}
        aria-label="Fechar detalhes do item"
      />

      <section className={`inventory-modal__panel rarity-${rarityClass}`}>
        <button
          type="button"
          className="inventory-modal__close"
          onClick={onClose}
          aria-label="Fechar detalhes"
        >
          ×
        </button>

        <div className="inventory-modal__hero">
          <div
            className="inventory-item-card__icon inventory-modal__icon"
            aria-hidden="true"
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" />
            ) : (
              <>
                <span className="inventory-item-card__glyph">
                  {getInventoryItemIcon(entry)}
                </span>

                <strong>{getInventoryItemInitials(item)}</strong>
              </>
            )}
          </div>

          <h2 id="inventory-modal-title">{itemName}</h2>

          <span className="inventory-modal__source">{sourceLabel}</span>
        </div>

        {description ? (
          <p
            id="inventory-modal-description"
            className="inventory-modal__description"
          >
            {description}
          </p>
        ) : null}

        {details.length > 0 ? (
          <dl className="inventory-modal__details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {hasStats ? (
          <div className="inventory-modal__section">
            <h3>Atributos</h3>

            <div className="inventory-modal__stats">
              {bonuses.map(([label, value]) => (
                <span key={label}>
                  +{value} {label}
                </span>
              ))}

              {hasPositiveNumber(item.healFlat) ? (
                <span>+{item.healFlat} HP</span>
              ) : null}

              {hasPositiveNumber(item.healPercent) ? (
                <span>{item.healPercent}% HP</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
