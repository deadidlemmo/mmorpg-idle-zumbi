interface EquipmentAssetLike {
  name?: string | null;
  tier?: number | string | null;
  assetKey?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
}

const equipmentImageModules = import.meta.glob(
  "../../../assets/images/items/equipments/**/*.{png,jpg,jpeg,webp,avif}",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

const equipmentImageByKey = new Map<string, string>();

function normalizeImageKey(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

for (const [path, imageUrl] of Object.entries(equipmentImageModules)) {
  const fileName = path
    .split("/")
    .pop()
    ?.replace(/\.(png|jpe?g|webp|avif)$/i, "");
  const fileKey = normalizeImageKey(fileName);

  if (!fileKey) continue;

  equipmentImageByKey.set(fileKey, imageUrl);

  const tierMatch = fileKey.match(/^t0?(\d+)-(.+)$/);

  if (tierMatch) {
    equipmentImageByKey.set(
      `${Number(tierMatch[1])}:${tierMatch[2]}`,
      imageUrl,
    );
  }
}

function getDirectImageUrl(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getEquipmentItemImageUrl(
  item?: EquipmentAssetLike | null,
): string | null {
  if (!item) return null;

  const directImage =
    getDirectImageUrl(item.iconUrl) ?? getDirectImageUrl(item.imageUrl);

  if (directImage) return directImage;

  const assetKey = normalizeImageKey(item.assetKey);

  if (assetKey && equipmentImageByKey.has(assetKey)) {
    return equipmentImageByKey.get(assetKey) ?? null;
  }

  const baseItemName = item.name?.replace(/\s+\+[1-3]\s*$/i, "");
  const nameKey = normalizeImageKey(baseItemName);

  if (!nameKey) return null;

  const tier = Number(item.tier);

  if (Number.isFinite(tier)) {
    const tierImage = equipmentImageByKey.get(`${Math.floor(tier)}:${nameKey}`);

    if (tierImage) return tierImage;
  }

  return equipmentImageByKey.get(nameKey) ?? null;
}
