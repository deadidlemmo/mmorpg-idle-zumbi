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

const mobAssetKeyByNormalizedName: Record<string, string> = {
  'errante-do-suburbio': 'mob1-t1',
  'rato-de-lixeira-infectado': 'mob2-t1',
  'cao-de-rua-infectado': 'mob3-t1',
  'gato-de-telhado-contaminado': 'mob4-t1',
  'rastejante-de-garagem': 'mob5-t1',
  'morador-do-quintal': 'mob6-t1',
  'gamba-de-entulho-contaminado': 'mob7-t1',
  'morcego-de-caixa-d-agua': 'mob8-t1',
  'porteiro-infectado': 'mob9-t1',
  'inquilino-esticado-do-bloco': 'mob10-t1',
  'urubu-carniceiro-contaminado': 'mob11-t1',
  'sindico-devorado': 'mob12-t1',
  'carregador-de-paletes-infectado': 'mob1-t2',
  'barata-de-deposito-oleosa': 'mob2-t2',
  'operador-de-empilhadeira-infectado': 'mob3-t2',
  'arrastador-de-correntes': 'mob4-t2',
  'operario-prensado': 'mob5-t2',
  'pistoneiro-hidraulico': 'mob6-t2',
  'lacraia-de-esteira-ferruginosa': 'mob7-t2',
  'esmagado-da-prensa': 'mob8-t2',
  'vigia-do-galpao-infectado': 'mob9-t2',
  'soldador-mascarado-infectado': 'mob10-t2',
  'aranha-de-viga-contaminada': 'mob11-t2',
  'capataz-ferrugento': 'mob12-t2',
  'paciente-febril-errante': 'mob1-t3',
  'maqueiro-infectado': 'mob2-t3',
  'entubado-da-triagem': 'mob3-t3',
  'mosca-de-ferida-contaminada': 'mob4-t3',
  'enfermeira-de-isolamento-infectada': 'mob5-t3',
  'tecnico-selado-de-descontaminacao': 'mob6-t3',
  'interno-retorcido-do-isolamento': 'mob7-t3',
  'centopeia-de-tubulacao-contaminada': 'mob8-t3',
  'instrumentador-cirurgico-infectado': 'mob9-t3',
  'anestesista-colapsado': 'mob10-t3',
  'sanguessuga-de-bolsa-hematica': 'mob11-t3',
  'cirurgiao-chefe-necrosado': 'mob12-t3',
  'amontoado-de-bagagens-vivas': 'mob1-t4',
  'mandibulado-do-embarque': 'mob2-t4',
  'farejador-mutado-da-seguranca': 'mob3-t4',
  'enxame-de-carrapatos-hematicos': 'mob4-t4',
  'sinaleiro-sem-rosto': 'mob5-t4',
  'corcunda-do-bagageiro': 'mob6-t4',
  'verme-de-escapamento-toxico': 'mob7-t4',
  'casulo-de-tracas-de-plataforma': 'mob8-t4',
  'cobrador-fundido': 'mob9-t4',
  'condutor-sem-mandibula': 'mob10-t4',
  'escorpiao-de-painel-eletrico': 'mob11-t4',
  'regente-da-cabine-lacrada': 'mob12-t4',
  'isolado-da-tenda-rasgada': 'mob1-t5',
  'cadaver-de-maca-quarentenado': 'mob2-t5',
  'portador-de-mascara-fundida': 'mob3-t5',
  'larva-de-descarte-biologico': 'mob4-t5',
  'arameiro-de-contencao': 'mob5-t5',
  'sentinela-eletrocutado': 'mob6-t5',
  'vazador-toxico-de-grade': 'mob7-t5',
  'lesma-de-canaleta-quimica': 'mob8-t5',
  'operador-de-radio-infectado': 'mob9-t5',
  'oficial-de-contencao-necrosado': 'mob10-t5',
  'parasita-de-mesa-tatica': 'mob11-t5',
  'coronel-lacrado-da-zona-9': 'mob12-t5',
  'homem-tanque-rachado': 'mob1-t6',
  'afogado-em-oleo-cinzento': 'mob2-t6',
  'salamandra-de-borra-cinzenta': 'mob3-t6',
  'respirador-de-cinzas': 'mob4-t6',
  'operario-escaldado-de-vapor': 'mob5-t6',
  'queimado-de-tubulacao-viva': 'mob6-t6',
  'aracnideo-de-canos-ferventes': 'mob7-t6',
  'pressurizado-sem-face': 'mob8-t6',
  'forjado-em-cinzas': 'mob9-t6',
  'carvoeiro-sem-pele': 'mob10-t6',
  'besta-da-escoria-fervente': 'mob11-t6',
  'guardiao-da-fornalha-morta': 'mob12-t6',
  'motorista-fundido-ao-volante': 'mob1-t7',
  'buzinador-sem-cabeca': 'mob2-t7',
  'cervideo-atropelado-mutado': 'mob3-t7',
  'colosso-do-para-choque': 'mob4-t7',
  'predador-de-viela-cega': 'mob5-t7',
  'boca-de-bueiro-faminta': 'mob6-t7',
  'corpo-parede-dos-becos': 'mob7-t7',
  'cacador-de-neon-quebrado': 'mob8-t7',
  'semaforico-de-carne-exposta': 'mob9-t7',
  'fendido-do-asfalto': 'mob10-t7',
  'trauma-de-sirene-quebrada': 'mob11-t7',
  'tirano-do-cruzamento-morto': 'mob12-t7',
  'observado-de-vidro-vivo': 'mob1-t8',
  'tecnico-de-monitoracao-fundido': 'mob2-t8',
  'olho-helix-suspenso': 'mob3-t8',
  'replica-neural-incompleta': 'mob4-t8',
  'cobaia-de-tanque-rompido': 'mob5-t8',
  'gemeos-de-capsula-fundida': 'mob6-t8',
  'guardiao-de-acrilico-selado': 'mob7-t8',
  'larva-de-amostra-helix': 'mob8-t8',
  'executivo-parasitado': 'mob9-t8',
  'arquivo-vivo-helix': 'mob10-t8',
  'assessor-biomecanico': 'mob11-t8',
  'doutor-helix-primeiro-vetor': 'mob12-t8',
  'fundido-de-escoria-humana': 'mob1-t9',
  'mutilado-de-metal-derretido': 'mob2-t9',
  'besouro-de-fornalha-necrosado': 'mob3-t9',
  'colosso-de-fuligem-coagulada': 'mob4-t9',
  'costurado-da-esteira-morta': 'mob5-t9',
  'triturador-de-membros-rejeitados': 'mob6-t9',
  'caranguejo-de-sucata-organica': 'mob7-t9',
  'boneco-de-cabos-nervosos': 'mob8-t9',
  'turbina-de-carne-pulsante': 'mob9-t9',
  'forjado-de-aco-necrosado': 'mob10-t9',
  'parasita-de-caldeira-morta': 'mob11-t9',
  'soberano-da-usina-morta': 'mob12-t9',
  'eco-humano-saturado': 'mob1-t10',
  'sentinela-de-carne-cristalizada': 'mob2-t10',
  'cervical-aberta-do-marco': 'mob3-t10',
  'lacraia-de-cinza-primaria': 'mob4-t10',
  'corpo-saturado-de-mil-vozes': 'mob5-t10',
  'anjo-de-pele-invertida': 'mob6-t10',
  'raiz-neural-do-surto': 'mob7-t10',
  'besta-de-radiacao-organica': 'mob8-t10',
  'forma-primaria-do-surto': 'mob9-t10',
  'serafim-do-colapso-biologico': 'mob10-t10',
  'carcaca-do-primeiro-paciente': 'mob11-t10',
  'coracao-do-marco-zero': 'mob12-t10',
};

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

function createMobLookupKeys(mobName?: string | null) {
  const normalizedKey = normalizeMobAssetKey(mobName);
  const lookupKeys = new Set<string>();

  createKeyVariants(normalizedKey).forEach((key) => {
    lookupKeys.add(key);

    const sequentialAssetKey = mobAssetKeyByNormalizedName[key];

    if (sequentialAssetKey) {
      createKeyVariants(sequentialAssetKey).forEach((variant) => {
        lookupKeys.add(variant);
      });
    }
  });

  return lookupKeys;
}

function parseSequentialMobAssetKey(value?: string | null) {
  const normalizedKey = normalizeMobAssetKey(value);
  const match = /^mob(\d+)-t(\d+)$/i.exec(normalizedKey);

  if (!match) {
    return null;
  }

  return {
    mobNumber: Number(match[1]),
    tierNumber: Number(match[2]),
  };
}

export function getMobProgressionSortRank(
  mobName?: string | null,
  assetKey?: string | null,
) {
  const directAssetRank = parseSequentialMobAssetKey(assetKey);

  if (directAssetRank) {
    return {
      tier: directAssetRank.tierNumber,
      mob: directAssetRank.mobNumber,
      key: normalizeMobAssetKey(assetKey),
    };
  }

  const normalizedName = normalizeMobAssetKey(mobName);
  const sequentialAssetKey = mobAssetKeyByNormalizedName[normalizedName];
  const mappedAssetRank = parseSequentialMobAssetKey(sequentialAssetKey);

  if (mappedAssetRank) {
    return {
      tier: mappedAssetRank.tierNumber,
      mob: mappedAssetRank.mobNumber,
      key: sequentialAssetKey,
    };
  }

  return {
    tier: Number.MAX_SAFE_INTEGER,
    mob: Number.MAX_SAFE_INTEGER,
    key: normalizedName,
  };
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
  const lookupKeys = createMobLookupKeys(mobName);

  if (lookupKeys.size <= 0) {
    return null;
  }

  const assetMap = type === 'full-body' ? fullBodyAssetMap : portraitAssetMap;

  for (const key of lookupKeys) {
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
