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
  ariaLabel?: string;
  emptySlotLabel?: string;
  onSelectEmptySlot?: (slotNumber: number) => void;
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

  return (
    looseEntry.inventoryItemId ?? looseEntry.id ?? looseEntry.item?.id ?? null
  );
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
  ariaLabel = 'Grade de itens da mochila',
  emptySlotLabel = 'Vazio',
  onSelectEmptySlot,
}: InventoryGridProps) {
  const emptySlotsCount = getEmptySlotsCount(items.length);

  return (
    <div className="inventory-grid" aria-live="polite" aria-label={ariaLabel}>
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

      {Array.from({ length: emptySlotsCount }).map((_, index) => {
        const slotNumber = items.length + index + 1;

        if (onSelectEmptySlot) {
          return (
            <button
              key={`inventory-empty-slot-${index}`}
              type="button"
              className="inventory-empty-slot inventory-grid__empty-slot inventory-grid__empty-slot--button"
              onClick={() => onSelectEmptySlot(slotNumber)}
              aria-label={`Selecionar slot vazio ${slotNumber}`}
            >
              <span>{emptySlotLabel}</span>
            </button>
          );
        }

        return (
          <div
            key={`inventory-empty-slot-${index}`}
            className="inventory-empty-slot inventory-grid__empty-slot"
            aria-hidden="true"
          >
            <span>{emptySlotLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
