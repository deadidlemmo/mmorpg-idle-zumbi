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

  return `x${safeQuantity.toLocaleString('pt-BR')}`;
}

function buildDetails(entry: InventoryEntry): Array<[string, string]> {
  const item = entry.item;

  const details: Array<[string, string | null]> = [
    ['Quantidade', formatQuantity(entry.quantity)],
    ['Tipo', formatInventoryType(entry)],
    ['Raridade', formatInventoryRarity(item.rarity)],
    ['Tier', typeof item.tier === 'number' ? String(item.tier) : null],
    ['Slot', formatInventorySlot(item.slot)],
    ['Origem', formatMaterialOrigin(item.materialOrigin)],
    ['Família', item.family ?? null],
    ['Mapa', item.map?.name ?? null],
    ['Classe', item.class?.name ?? null],
  ];

  return details.filter(
    (detail): detail is [string, string] => Boolean(detail[1]),
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

  const item = entry.item;

  const itemName = item.name?.trim() || 'Item desconhecido';
  const description = item.description?.trim();

  const bonuses = getInventoryBonusList(item);
  const rarity = item.rarity ?? 'COMMON';
  const rarityClass = normalizeRarityClass(rarity);
  const rarityLabel = formatInventoryRarity(item.rarity);
  const typeLabel = formatInventoryType(entry);
  const primaryDetail = getInventoryPrimaryDetail(entry);
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
      aria-describedby="inventory-modal-description"
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
          Fechar
        </button>

        <div className="inventory-modal__header">
          <div
            className="inventory-item-card__icon inventory-modal__icon"
            aria-hidden="true"
          >
            <span className="inventory-item-card__glyph">
              {getInventoryItemIcon(entry)}
            </span>

            <strong>{getInventoryItemInitials(item)}</strong>
          </div>

          <div>
            <span className="inventory-modal__eyebrow">
              {primaryDetail ?? typeLabel}
            </span>

            <h2 id="inventory-modal-title">{itemName}</h2>

            <div className="inventory-modal__stats" aria-label="Resumo do item">
              <span>{rarityLabel}</span>
              <span>{typeLabel}</span>
              <span>{formatQuantity(entry.quantity)}</span>

              {typeof item.tier === 'number' ? (
                <span>Tier {item.tier}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="inventory-modal__section">
          <h3>Descrição</h3>

          <p id="inventory-modal-description">
            {description || 'Sem descrição registrada para este item.'}
          </p>
        </div>

        {hasStats ? (
          <div className="inventory-modal__section">
            <h3>Atributos principais</h3>

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

        <div className="inventory-modal__section">
          <h3>Informações</h3>

          <dl className="inventory-modal__details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}