interface ConsumableAssetLike {
  name?: string | null;
  tier?: number | string | null;
  assetKey?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  image?: string | null;
}

const consumableImageModules = import.meta.glob(
  "../../../assets/images/items/consumables/**/*.{png,jpg,jpeg,webp,avif,svg}",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

const consumableImageByKey = new Map<string, string>();

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

for (const [path, imageUrl] of Object.entries(consumableImageModules)) {
  const fileName = path
    .split("/")
    .pop()
    ?.replace(/\.(png|jpe?g|webp|avif|svg)$/i, "");
  const fileKey = normalizeImageKey(fileName);

  if (!fileKey) continue;

  consumableImageByKey.set(fileKey, imageUrl);

  const tierMatch = fileKey.match(/^t0?(\d+)-(.+)$/);

  if (tierMatch) {
    consumableImageByKey.set(
      `${Number(tierMatch[1])}:${tierMatch[2]}`,
      imageUrl,
    );
  }
}

function getDirectImageUrl(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getConsumableItemImageUrl(
  item?: ConsumableAssetLike | null,
): string | null {
  if (!item) return null;

  const directImage =
    getDirectImageUrl(item.iconUrl) ??
    getDirectImageUrl(item.imageUrl) ??
    getDirectImageUrl(item.image);

  if (directImage) return directImage;

  const assetKey = normalizeImageKey(item.assetKey);

  if (assetKey && consumableImageByKey.has(assetKey)) {
    return consumableImageByKey.get(assetKey) ?? null;
  }

  const nameKey = normalizeImageKey(item.name);

  if (!nameKey) return null;

  const tier = Number(item.tier);

  if (Number.isFinite(tier)) {
    const tierImage = consumableImageByKey.get(
      `${Math.floor(tier)}:${nameKey}`,
    );

    if (tierImage) return tierImage;

    if (nameKey.startsWith("pocao-de-vida")) {
      const potionTierPrefix = `${Math.floor(tier)}:pocao-de-vida`;
      const potionTierImage = Array.from(consumableImageByKey.entries()).find(
        ([key]) => key.startsWith(potionTierPrefix),
      )?.[1];

      if (potionTierImage) return potionTierImage;
    }
  }

  return consumableImageByKey.get(nameKey) ?? null;
}
