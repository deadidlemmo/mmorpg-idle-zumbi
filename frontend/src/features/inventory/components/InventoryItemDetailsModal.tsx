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
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [entry, onClose]);

  if (!entry) return null;

  const item = entry.item;
  const bonuses = getInventoryBonusList(item);
  const description = item.description?.trim();
  const rarity = item.rarity ?? 'COMMON';
  const details = [
    ['Quantidade', `x${entry.quantity ?? 0}`],
    ['Tipo', formatInventoryType(entry)],
    ['Raridade', formatInventoryRarity(item.rarity)],
    ['Tier', typeof item.tier === 'number' ? String(item.tier) : null],
    ['Slot', formatInventorySlot(item.slot)],
    ['Origem', formatMaterialOrigin(item.materialOrigin)],
    ['Família', item.family ?? null],
    ['Mapa', item.map?.name ?? null],
    ['Classe', item.class?.name ?? null],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title">
      <button
        type="button"
        className="inventory-modal__backdrop"
        onClick={onClose}
        aria-label="Fechar detalhes do item"
      />

      <section className={`inventory-modal__panel rarity-${rarity.toLowerCase()}`}>
        <button type="button" className="inventory-modal__close" onClick={onClose}>
          Fechar
        </button>

        <div className="inventory-modal__header">
          <div className="inventory-item-card__icon inventory-modal__icon" aria-hidden="true">
            <span className="inventory-item-card__glyph">{getInventoryItemIcon(entry)}</span>
            <strong>{getInventoryItemInitials(item)}</strong>
          </div>

          <div>
            <span className="inventory-modal__eyebrow">{getInventoryPrimaryDetail(entry) ?? formatInventoryType(entry)}</span>
            <h2 id="inventory-modal-title">{item.name || 'Item desconhecido'}</h2>
            <div className="inventory-item-card__meta">
              <span>{formatInventoryRarity(item.rarity)}</span>
              <span>{formatInventoryType(entry)}</span>
              <span>x{entry.quantity ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="inventory-modal__section">
          <h3>Descrição</h3>
          <p>{description || 'Sem descrição registrada para este item.'}</p>
        </div>

        {bonuses.length > 0 || item.healFlat || item.healPercent ? (
          <div className="inventory-modal__section">
            <h3>Atributos principais</h3>
            <div className="inventory-modal__stats">
              {bonuses.map(([label, value]) => (
                <span key={label}>+{value} {label}</span>
              ))}
              {item.healFlat ? <span>+{item.healFlat} HP</span> : null}
              {item.healPercent ? <span>{item.healPercent}% HP</span> : null}
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
