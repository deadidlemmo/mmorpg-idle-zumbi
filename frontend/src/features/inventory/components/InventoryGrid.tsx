import type { InventoryEntry } from '../types/inventory.types';
import { InventoryItemCard } from './InventoryItemCard';

interface InventoryGridProps {
  items: InventoryEntry[];
}

export function InventoryGrid({ items }: InventoryGridProps) {
  return (
    <div className="inventory-grid" aria-live="polite">
      {items.map((entry) => (
        <InventoryItemCard key={entry.inventoryItemId} entry={entry} />
      ))}
    </div>
  );
}
