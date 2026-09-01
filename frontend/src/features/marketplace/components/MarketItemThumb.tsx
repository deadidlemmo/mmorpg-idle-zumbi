import { Package } from "lucide-react";
import { EquipmentItemArtwork } from "../../equipment/components/EquipmentItemArtwork";
import type {
  InventoryEntry,
  InventoryItemDetails,
  InventoryItemType,
} from "../../inventory/types/inventory.types";
import {
  getInventoryItemImageUrl,
  getInventoryItemVisualRarity,
} from "../../inventory/utils/inventory.utils";

interface MarketItemThumbProps {
  item: InventoryItemDetails;
  type: InventoryItemType;
  quantity?: number;
}

export function MarketItemThumb({
  item,
  type,
  quantity = 1,
}: MarketItemThumbProps) {
  const entry: InventoryEntry = {
    inventoryItemId: item.id,
    item,
    quantity,
    type,
  };
  const imageUrl = getInventoryItemImageUrl(entry);
  const rarity = getInventoryItemVisualRarity(entry);

  return (
    <span
      className="market-item-thumb"
      data-rarity={rarity.key}
      aria-hidden="true"
    >
      <EquipmentItemArtwork
        item={item}
        imageUrl={imageUrl}
        draggable={false}
        fallback={<Package size={23} strokeWidth={1.7} />}
      />
      <small>T{item.tier ?? 1}</small>
    </span>
  );
}
