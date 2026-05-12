import type {
  InventoryFilterKey,
  InventoryFilterOption,
} from '../types/inventory.types';

interface InventoryFiltersProps {
  filters: InventoryFilterOption[];
  activeFilter: InventoryFilterKey;
  onChange: (filter: InventoryFilterKey) => void;
}

const FILTER_ICONS: Partial<Record<InventoryFilterKey, string>> = {
  ALL: '▦',
  MATERIAL: '◆',
  EQUIPMENT: '◇',
  CONSUMABLE: '+',
  RESOURCE: '▱',
  OTHER: '□',
};

const FILTER_SHORT_LABELS: Partial<Record<InventoryFilterKey, string>> = {
  ALL: 'Todos',
  MATERIAL: 'Materiais',
  EQUIPMENT: 'Equip.',
  CONSUMABLE: 'Cons.',
  RESOURCE: 'Rec.',
  OTHER: 'Outros',
};

function getFilterIcon(filterKey: InventoryFilterKey) {
  return FILTER_ICONS[filterKey] ?? '□';
}

function getFilterLabel(filter: InventoryFilterOption) {
  return FILTER_SHORT_LABELS[filter.key] ?? filter.label;
}

function getFilterDescription(filter: InventoryFilterOption) {
  const count = Math.max(0, filter.count ?? 0);

  return `${filter.label}: ${count} ${count === 1 ? 'tipo' : 'tipos'}`;
}

export function InventoryFilters({
  filters,
  activeFilter,
  onChange,
}: InventoryFiltersProps) {
  return (
    <nav
      className="inventory-filters"
      role="tablist"
      aria-label="Categorias da mochila"
    >
      {filters.map((filter) => {
        const isActive = activeFilter === filter.key;
        const count = Math.max(0, filter.count ?? 0);
        const label = getFilterLabel(filter);
        const description = getFilterDescription(filter);

        return (
          <button
            key={filter.key}
            type="button"
            className={`inventory-filter${isActive ? ' is-active' : ''}`}
            data-filter-key={filter.key}
            onClick={() => onChange(filter.key)}
            role="tab"
            aria-selected={isActive}
            aria-label={description}
          >
            <span className="inventory-filter__icon" aria-hidden="true">
              {getFilterIcon(filter.key)}
            </span>

            <span className="inventory-filter__label">{label}</span>

            <strong className="inventory-filter__count" aria-hidden="true">
              {count}
            </strong>
          </button>
        );
      })}
    </nav>
  );
}