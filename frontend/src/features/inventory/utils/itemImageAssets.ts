import { getConsumableItemImageUrl } from '../../consumables/utils/consumableItemAssets';
import { getEquipmentItemImageUrl } from '../../equipment/utils/equipmentItemAssets';
import { getGatheringMaterialImageUrl } from '../../gathering/utils/gatheringMaterialAssets';
import { getPetCocoonAssetImageUrl } from '../../pets/utils/petAssets';

export type GameItemAssetLike = {
  name?: string | null;
  slug?: string | null;
  assetKey?: string | null;
  tier?: number | string | null;
  slot?: string | null;
  family?: string | null;
  materialOrigin?: string | null;
  icon?: string | null;
  iconUrl?: string | null;
  iconPath?: string | null;
  image?: string | null;
  imageUrl?: string | null;
};

function getDirectImageUrl(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getGameItemImageUrl(
  item?: GameItemAssetLike | null,
): string | null {
  if (!item) return null;

  const directImage =
    getDirectImageUrl(item.iconUrl) ??
    getDirectImageUrl(item.imageUrl) ??
    getDirectImageUrl(item.iconPath) ??
    getDirectImageUrl(item.image) ??
    getDirectImageUrl(item.icon);

  if (directImage) return directImage;

  const parsedTier = Number(item.tier);
  const cocoonImage = getPetCocoonAssetImageUrl({
    assetKey: item.assetKey,
    slug: item.slug,
    name: item.name,
    tier: Number.isFinite(parsedTier) ? parsedTier : null,
  });

  if (cocoonImage) return cocoonImage;

  const normalizedSlot = item.slot?.trim().toUpperCase();
  const isMaterial =
    normalizedSlot === 'MATERIAL' || Boolean(item.materialOrigin?.trim());
  const isConsumable = normalizedSlot === 'CONSUMABLE';

  if (isMaterial) {
    return (
      getGatheringMaterialImageUrl(item) ??
      getEquipmentItemImageUrl(item) ??
      getConsumableItemImageUrl(item)
    );
  }

  if (isConsumable) {
    return (
      getConsumableItemImageUrl(item) ??
      getGatheringMaterialImageUrl(item) ??
      getEquipmentItemImageUrl(item)
    );
  }

  return (
    getEquipmentItemImageUrl(item) ??
    getGatheringMaterialImageUrl(item) ??
    getConsumableItemImageUrl(item)
  );
}
