import type { InventoryFilterKey, InventoryFilterOption } from '../types/inventory.types';

interface InventoryFiltersProps {
  filters: InventoryFilterOption[];
  activeFilter: InventoryFilterKey;
  onChange: (filter: InventoryFilterKey) => void;
}

export function InventoryFilters({
  filters,
  activeFilter,
  onChange,
}: InventoryFiltersProps) {
  return (
    <div className="inventory-filters" role="tablist" aria-label="Categorias da mochila">
      {filters.map((filter) => (
        <button
          key={filter.key}
          type="button"
          className={`inventory-filter${activeFilter === filter.key ? ' is-active' : ''}`}
          onClick={() => onChange(filter.key)}
          role="tab"
          aria-selected={activeFilter === filter.key}
        >
          <span>{filter.label}</span>
          <strong>{filter.count}</strong>
        </button>
      ))}
    </div>
  );
}
