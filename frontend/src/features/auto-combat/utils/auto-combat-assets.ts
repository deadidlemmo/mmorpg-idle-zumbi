import type { CSSProperties } from 'react';

type ImageModuleMap = Record<string, string>;

type ImageLookupMap = Record<string, string>;

const mapImageModules = import.meta.glob(
  '../../../assets/images/maps/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
  },
) as ImageModuleMap;

const mobFullBodyImageModules = import.meta.glob(
  '../../../assets/images/mobs/full-body/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
  },
) as ImageModuleMap;

const mobBodyImageModules = import.meta.glob(
  '../../../assets/images/mobs/bodies/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
  },
) as ImageModuleMap;

const mobPortraitImageModules = import.meta.glob(
  '../../../assets/images/mobs/portraits/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
  },
) as ImageModuleMap;

const mobFaceImageModules = import.meta.glob(
  '../../../assets/images/mobs/faces/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
  },
) as ImageModuleMap;

const mobRootImageModules = import.meta.glob(
  '../../../assets/images/mobs/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    import: 'default',
  },
) as ImageModuleMap;

export function normalizeAssetKey(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getFileNameWithoutExtension(path: string) {
  const fileName = path.split('/').pop() ?? path;

  return fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '');
}

function buildImageLookupMap(modules: ImageModuleMap): ImageLookupMap {
  return Object.entries(modules).reduce<ImageLookupMap>((lookup, [path, url]) => {
    const key = normalizeAssetKey(getFileNameWithoutExtension(path));

    if (key) {
      lookup[key] = url;
    }

    return lookup;
  }, {});
}

function findImageByName(
  name: string | null | undefined,
  lookups: ImageLookupMap[],
) {
  const key = normalizeAssetKey(name);

  if (!key) return null;

  for (const lookup of lookups) {
    const image = lookup[key];

    if (image) return image;
  }

  return null;
}

const mapImages = buildImageLookupMap(mapImageModules);
const mobFullBodyImages = buildImageLookupMap(mobFullBodyImageModules);
const mobBodyImages = buildImageLookupMap(mobBodyImageModules);
const mobPortraitImages = buildImageLookupMap(mobPortraitImageModules);
const mobFaceImages = buildImageLookupMap(mobFaceImageModules);
const mobRootImages = buildImageLookupMap(mobRootImageModules);

export function getMapImageByName(mapName?: string | null) {
  return findImageByName(mapName, [mapImages]);
}

export function getMobPortraitImageByName(mobName?: string | null) {
  return findImageByName(mobName, [
    mobPortraitImages,
    mobFaceImages,
    mobRootImages,
    mobFullBodyImages,
    mobBodyImages,
  ]);
}

export function getMobFullBodyImageByName(mobName?: string | null) {
  return findImageByName(mobName, [
    mobFullBodyImages,
    mobBodyImages,
    mobRootImages,
    mobPortraitImages,
    mobFaceImages,
  ]);
}

export function buildMapVisualStyle(
  mapImage?: string | null,
): CSSProperties | undefined {
  if (!mapImage) return undefined;

  return {
    backgroundImage: `linear-gradient(180deg, rgba(7, 12, 11, 0.08), rgba(7, 12, 11, 0.84)), radial-gradient(circle at 18% 12%, rgba(180, 214, 112, 0.12), transparent 12rem), url(${mapImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}
