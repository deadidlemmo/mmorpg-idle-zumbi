import type { InventoryEntry } from '../types/inventory.types';
import { InventoryItemCard } from './InventoryItemCard';

interface InventoryGridProps {
  items: InventoryEntry[];
  onSelectItem: (entry: InventoryEntry) => void;
}

export function InventoryGrid({ items, onSelectItem }: InventoryGridProps) {
  return (
    <div className="inventory-grid" aria-live="polite">
      {items.map((entry) => (
        <InventoryItemCard
          key={entry.inventoryItemId}
          entry={entry}
          onSelect={() => onSelectItem(entry)}
        />
      ))}
    </div>
  );
}
