type GatheringMaterialAssetLike = {
  slug?: string | null;
  assetKey?: string | null;
  icon?: string | null;
  iconUrl?: string | null;
  iconPath?: string | null;
  imageUrl?: string | null;
};

type GatheringRecipeOutputAssetLike = {
  outputItemName?: string | null;
  outputItemTier?: number | string | null;
  outputItemAssetKey?: string | null;
  outputItemIconUrl?: string | null;
  outputItemImageUrl?: string | null;
};

const materialImageModules = import.meta.glob(
  '../../../assets/images/items/materials/**/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
) as Record<string, string>;

const equipmentImageModules = import.meta.glob(
  '../../../assets/images/items/equipments/**/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
) as Record<string, string>;

const materialImageBySlug = new Map<string, string>();
const equipmentImageByKey = new Map<string, string>();

Object.entries(materialImageModules).forEach(([path, imageUrl]) => {
  const fileName = path.split('/').pop();
  const slug = fileName?.replace(/\.(png|jpe?g|webp)$/i, '').trim();

  if (slug && !materialImageBySlug.has(slug)) {
    materialImageBySlug.set(slug, imageUrl);
  }
});

function normalizeImageKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedValue.length > 0 ? normalizedValue : null;
}

Object.entries(equipmentImageModules).forEach(([path, imageUrl]) => {
  const fileName = path.split('/').pop();
  const key = normalizeImageKey(fileName?.replace(/\.(png|jpe?g|webp)$/i, ''));

  if (!key) return;

  if (!equipmentImageByKey.has(key)) {
    equipmentImageByKey.set(key, imageUrl);
  }

  const tierMatch = key.match(/^t0?(\d+)-(.+)$/);

  if (tierMatch) {
    const [, tier, slug] = tierMatch;
    const tierNumber = Number(tier);

    if (Number.isFinite(tierNumber) && slug) {
      const tierSlugKey = `${tierNumber}:${slug}`;

      if (!equipmentImageByKey.has(tierSlugKey)) {
        equipmentImageByKey.set(tierSlugKey, imageUrl);
      }
    }
  }
});

function getCleanImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function getGatheringMaterialImageUrl(
  material?: GatheringMaterialAssetLike | null,
): string | null {
  if (!material) return null;

  const directImage =
    getCleanImageUrl(material.iconUrl) ??
    getCleanImageUrl(material.imageUrl) ??
    getCleanImageUrl(material.iconPath) ??
    getCleanImageUrl(material.icon);

  if (directImage) return directImage;

  const slug = getCleanImageUrl(material.slug) ?? getCleanImageUrl(material.assetKey);

  if (!slug) return null;

  return materialImageBySlug.get(slug) ?? null;
}

export function getGatheringRecipeOutputImageUrl(
  recipe?: GatheringRecipeOutputAssetLike | null,
): string | null {
  if (!recipe) return null;

  const directImage =
    getCleanImageUrl(recipe.outputItemIconUrl) ??
    getCleanImageUrl(recipe.outputItemImageUrl);

  if (directImage) return directImage;

  const assetKey = normalizeImageKey(recipe.outputItemAssetKey);

  if (assetKey) {
    const imageByAssetKey = equipmentImageByKey.get(assetKey);

    if (imageByAssetKey) return imageByAssetKey;
  }

  const outputItemName = normalizeImageKey(recipe.outputItemName);

  if (!outputItemName) return null;

  const tier = Number(recipe.outputItemTier);

  if (Number.isFinite(tier)) {
    const imageByTierAndName = equipmentImageByKey.get(
      `${Math.floor(tier)}:${outputItemName}`,
    );

    if (imageByTierAndName) return imageByTierAndName;
  }

  return equipmentImageByKey.get(outputItemName) ?? null;
}
