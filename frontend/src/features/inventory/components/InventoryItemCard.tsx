import type { InventoryEntry } from '../types/inventory.types';
import {
  formatInventoryRarity,
  formatInventoryType,
  getInventoryBonusList,
  getInventoryItemIcon,
  getInventoryItemInitials,
  getInventoryPrimaryDetail,
} from '../utils/inventory.utils';

interface InventoryItemCardProps {
  entry: InventoryEntry;
}

export function InventoryItemCard({ entry }: InventoryItemCardProps) {
  const item = entry.item;
  const bonuses = getInventoryBonusList(item);
  const description = item.description?.trim();
  const primaryDetail = getInventoryPrimaryDetail(entry);
  const rarity = item.rarity ?? 'COMMON';

  return (
    <article className={`inventory-item-card rarity-${rarity.toLowerCase()}`} title={description}>
      <div className="inventory-item-card__topline">
        <span className="inventory-item-card__type">{formatInventoryType(entry)}</span>
        <span className="inventory-item-card__quantity">x{entry.quantity ?? 0}</span>
      </div>

      <div className="inventory-item-card__content">
        <div className="inventory-item-card__icon" aria-hidden="true">
          <span className="inventory-item-card__glyph">{getInventoryItemIcon(entry)}</span>
          <strong>{getInventoryItemInitials(item)}</strong>
        </div>

        <div className="inventory-item-card__info">
          <h3>{item.name || 'Item desconhecido'}</h3>
          <div className="inventory-item-card__meta">
            <span>{formatInventoryRarity(item.rarity)}</span>
            {typeof item.tier === 'number' ? <span>Tier {item.tier}</span> : null}
            {primaryDetail ? <span>{primaryDetail}</span> : null}
          </div>
        </div>
      </div>

      {description ? (
        <p className="inventory-item-card__description">{description}</p>
      ) : (
        <p className="inventory-item-card__description is-muted">
          Sem descrição registrada.
        </p>
      )}

      {bonuses.length > 0 || item.healFlat || item.healPercent ? (
        <div className="inventory-item-card__stats" aria-label="Atributos do item">
          {bonuses.slice(0, 4).map(([label, value]) => (
            <span key={label}>+{value} {label}</span>
          ))}
          {item.healFlat ? <span>+{item.healFlat} HP</span> : null}
          {item.healPercent ? <span>{item.healPercent}% HP</span> : null}
        </div>
      ) : null}

      <div className="inventory-item-card__footer">
        {item.isCraftable ? <span>Criável</span> : <span>Coletado</span>}
        {item.map?.name ? <span>{item.map.name}</span> : null}
        {item.class?.name ? <span>{item.class.name}</span> : null}
      </div>
    </article>
  );
}
