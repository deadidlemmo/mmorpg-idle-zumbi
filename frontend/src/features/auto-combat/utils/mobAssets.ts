const portraitImages = import.meta.glob(
  '../../../assets/images/mobs/portraits/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>;

const fullBodyImages = import.meta.glob(
  '../../../assets/images/mobs/full-body/*.{png,jpg,jpeg,webp}',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>;

type MobAssetType = 'portrait' | 'full-body';

function normalizeMobAssetKey(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .toLowerCase()
    .trim()
    .replace(/['’´`]/g, '')
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getFileNameFromPath(path: string) {
  return path.split('/').pop() ?? '';
}

function removeImageExtension(fileName: string) {
  return fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '');
}

function createKeyVariants(key: string) {
  const variants = new Set<string>();

  if (!key) {
    return variants;
  }

  variants.add(key);

  /*
   * Ajuda em nomes como:
   * Morcego de Caixa d’Água
   *
   * Pode existir como:
   * morcego-de-caixa-dagua.png
   * morcego-de-caixa-d-agua.png
   */
  variants.add(key.replace(/-d-agua/g, '-dagua'));
  variants.add(key.replace(/-dagua/g, '-d-agua'));

  /*
   * Ajuda caso algum arquivo tenha sido salvo com duplo hífen
   * ou separadores inconsistentes.
   */
  variants.add(key.replace(/--+/g, '-'));

  return variants;
}

function buildAssetMap(images: Record<string, string>) {
  const assetMap = new Map<string, string>();

  Object.entries(images).forEach(([path, imageUrl]) => {
    const fileName = getFileNameFromPath(path);
    const fileNameWithoutExtension = removeImageExtension(fileName);
    const normalizedKey = normalizeMobAssetKey(fileNameWithoutExtension);

    createKeyVariants(normalizedKey).forEach((key) => {
      if (key && !assetMap.has(key)) {
        assetMap.set(key, imageUrl);
      }
    });
  });

  return assetMap;
}

const portraitAssetMap = buildAssetMap(portraitImages);
const fullBodyAssetMap = buildAssetMap(fullBodyImages);

function getMobImage(
  mobName?: string | null,
  type: MobAssetType = 'portrait',
) {
  const normalizedKey = normalizeMobAssetKey(mobName);

  if (!normalizedKey) {
    return null;
  }

  const assetMap = type === 'full-body' ? fullBodyAssetMap : portraitAssetMap;

  for (const key of createKeyVariants(normalizedKey)) {
    const imageUrl = assetMap.get(key);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

export function getMobPortraitImage(mobName?: string | null) {
  return getMobImage(mobName, 'portrait');
}

export function getMobFullBodyImage(mobName?: string | null) {
  return getMobImage(mobName, 'full-body');
}

/*
 * Aliases para evitar erro caso algum componente antigo esteja importando
 * com outro nome.
 */
export const getMobPortraitAsset = getMobPortraitImage;
export const getMobFullBodyAsset = getMobFullBodyImage;

/*
 * Funções úteis para debug no console durante desenvolvimento.
 * Exemplo:
 * console.log(getKnownMobAssetKeys());
 */
export function getKnownMobAssetKeys() {
  return {
    portraits: Array.from(portraitAssetMap.keys()).sort(),
    fullBody: Array.from(fullBodyAssetMap.keys()).sort(),
  };
}

export function hasMobPortraitImage(mobName?: string | null) {
  return Boolean(getMobPortraitImage(mobName));
}

export function hasMobFullBodyImage(mobName?: string | null) {
  return Boolean(getMobFullBodyImage(mobName));
}