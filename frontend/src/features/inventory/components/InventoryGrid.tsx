import type { InventoryEntry } from '../types/inventory.types';
import { InventoryItemCard } from './InventoryItemCard';

type InventoryEntryWithOptionalId = InventoryEntry & { id?: string | null };

interface InventoryGridProps {
  items: InventoryEntry[];
  onSelectItem: (entry: InventoryEntry) => void;

  /**
   * Opcional.
   * Use depois se quiser destacar visualmente o item selecionado no desktop.
   */
  selectedItemId?: string | null;
}

const MIN_VISIBLE_SLOTS = 42;

function getInventoryItemKey(entry: InventoryEntry, index: number) {
  const looseEntry = entry as InventoryEntryWithOptionalId;

  return (
    looseEntry.inventoryItemId ??
    looseEntry.id ??
    looseEntry.item?.id ??
    `${looseEntry.item?.name ?? 'inventory-item'}-${index}`
  );
}

function getInventoryEntryId(entry: InventoryEntry) {
  const looseEntry = entry as InventoryEntryWithOptionalId;

  return looseEntry.inventoryItemId ?? looseEntry.id ?? looseEntry.item?.id ?? null;
}

function getEmptySlotsCount(itemsCount: number) {
  if (itemsCount >= MIN_VISIBLE_SLOTS) {
    return 0;
  }

  return MIN_VISIBLE_SLOTS - itemsCount;
}

export function InventoryGrid({
  items,
  onSelectItem,
  selectedItemId = null,
}: InventoryGridProps) {
  const emptySlotsCount = getEmptySlotsCount(items.length);

  return (
    <div
      className="inventory-grid"
      aria-live="polite"
      aria-label="Grade de itens da mochila"
    >
      {items.map((entry, index) => {
        const entryId = getInventoryEntryId(entry);
        const isSelected = Boolean(
          selectedItemId && entryId && selectedItemId === entryId,
        );

        return (
          <div
            key={getInventoryItemKey(entry, index)}
            className={`inventory-grid__slot${isSelected ? ' is-selected' : ''}`}
          >
            <InventoryItemCard
              entry={entry}
              onSelect={() => onSelectItem(entry)}
            />
          </div>
        );
      })}

      {Array.from({ length: emptySlotsCount }).map((_, index) => (
        <div
          key={`inventory-empty-slot-${index}`}
          className="inventory-empty-slot inventory-grid__empty-slot"
          aria-hidden="true"
        >
          <span>Empty</span>
        </div>
      ))}
    </div>
  );
}