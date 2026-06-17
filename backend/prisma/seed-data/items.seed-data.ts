import { ItemSlot, MaterialOrigin, Rarity } from '@prisma/client';
import type { EquipmentSeedData, MaterialSeedData } from '../seed-types';

type MaterialSeedDataWithGatheringProgression = MaterialSeedData & {
  requiredGatheringLevel?: number;
  gatheringXpPerUnit?: number;
  baseGatheringRatePerHour?: number | null;
};

type EquipmentStatKey =
  | 'strengthBonus'
  | 'vitalityBonus'
  | 'agilityBonus'
  | 'precisionBonus'
  | 'techniqueBonus'
  | 'willpowerBonus';

type EquipmentStatWeights = Record<EquipmentStatKey, number>;

const EQUIPMENT_STAT_KEYS: EquipmentStatKey[] = [
  'strengthBonus',
  'vitalityBonus',
  'agilityBonus',
  'precisionBonus',
  'techniqueBonus',
  'willpowerBonus',
];

const BALANCED_EQUIPMENT_SLOT_POINTS_PER_TIER: Partial<
  Record<ItemSlot, number>
> = {
  [ItemSlot.MAIN_HAND]: 6,
  [ItemSlot.OFF_HAND]: 5,
  [ItemSlot.HEAD]: 4,
  [ItemSlot.ARMOR]: 6,
  [ItemSlot.PANTS]: 5,
  [ItemSlot.BOOTS]: 4,
};

const BALANCED_STARTER_ITEM_POINTS = 2;
const GLASS_CANNON_DEFENSIVE_PADDING_START_TIER = 6;
const GLASS_CANNON_DEFENSIVE_PADDING_SLOT_MULTIPLIER = 0.4;
const GLASS_CANNON_DEFENSIVE_PADDING_CLASSES = new Set([
  'assassino',
  'atirador',
]);

const BALANCED_EQUIPMENT_WEIGHTS_BY_CLASS: Record<
  string,
  EquipmentStatWeights
> = {
  lutador: {
    strengthBonus: 0.32,
    vitalityBonus: 0.34,
    agilityBonus: 0.06,
    precisionBonus: 0.04,
    techniqueBonus: 0.1,
    willpowerBonus: 0.14,
  },
  assassino: {
    strengthBonus: 0.08,
    vitalityBonus: 0.08,
    agilityBonus: 0.34,
    precisionBonus: 0.32,
    techniqueBonus: 0.14,
    willpowerBonus: 0.04,
  },
  atirador: {
    strengthBonus: 0.08,
    vitalityBonus: 0.08,
    agilityBonus: 0.24,
    precisionBonus: 0.36,
    techniqueBonus: 0.18,
    willpowerBonus: 0.06,
  },
  medico: {
    strengthBonus: 0.04,
    vitalityBonus: 0.18,
    agilityBonus: 0.04,
    precisionBonus: 0.14,
    techniqueBonus: 0.32,
    willpowerBonus: 0.28,
  },
};

function normalizeClassKey(className: string): string {
  return className
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function createEmptyEquipmentStats(): Record<EquipmentStatKey, number> {
  return EQUIPMENT_STAT_KEYS.reduce(
    (stats, statKey) => ({
      ...stats,
      [statKey]: 0,
    }),
    {} as Record<EquipmentStatKey, number>,
  );
}

function distributeEquipmentStatPoints(
  totalPoints: number,
  weights: EquipmentStatWeights,
): Record<EquipmentStatKey, number> {
  const entries = EQUIPMENT_STAT_KEYS.map((statKey) => {
    const exactPoints = totalPoints * weights[statKey];

    return {
      statKey,
      points: Math.floor(exactPoints),
      remainder: exactPoints - Math.floor(exactPoints),
      weight: weights[statKey],
    };
  });
  let remainingPoints =
    totalPoints - entries.reduce((sum, entry) => sum + entry.points, 0);

  entries
    .sort(
      (left, right) =>
        right.remainder - left.remainder || right.weight - left.weight,
    )
    .forEach((entry) => {
      if (remainingPoints <= 0) {
        return;
      }

      entry.points += 1;
      remainingPoints -= 1;
    });

  return entries.reduce(
    (stats, entry) => ({
      ...stats,
      [entry.statKey]: entry.points,
    }),
    createEmptyEquipmentStats(),
  );
}

function getEquipmentStatBudget(item: EquipmentSeedData): number {
  if (item.tier <= 0) {
    return BALANCED_STARTER_ITEM_POINTS;
  }

  return item.tier * (BALANCED_EQUIPMENT_SLOT_POINTS_PER_TIER[item.slot] ?? 0);
}

function getGlassCannonDefensivePadding(item: EquipmentSeedData) {
  const classKey = normalizeClassKey(item.className);

  if (
    !GLASS_CANNON_DEFENSIVE_PADDING_CLASSES.has(classKey) ||
    item.tier < GLASS_CANNON_DEFENSIVE_PADDING_START_TIER
  ) {
    return {
      vitalityBonus: 0,
      willpowerBonus: 0,
    };
  }

  const tierOffset =
    item.tier - GLASS_CANNON_DEFENSIVE_PADDING_START_TIER + 1;
  const slotPoints = BALANCED_EQUIPMENT_SLOT_POINTS_PER_TIER[item.slot] ?? 0;
  const totalPadding = Math.max(
    0,
    Math.round(
      slotPoints *
        tierOffset *
        GLASS_CANNON_DEFENSIVE_PADDING_SLOT_MULTIPLIER,
    ),
  );
  const vitalityBonus = Math.ceil(totalPadding * 0.6);
  const willpowerBonus = Math.max(0, totalPadding - vitalityBonus);

  return {
    vitalityBonus,
    willpowerBonus,
  };
}

function normalizeEquipmentItemStats(
  item: EquipmentSeedData,
): EquipmentSeedData {
  const classKey = normalizeClassKey(item.className);
  const weights = BALANCED_EQUIPMENT_WEIGHTS_BY_CLASS[classKey];

  if (!weights) {
    return item;
  }

  const baseStats = distributeEquipmentStatPoints(
    getEquipmentStatBudget(item),
    weights,
  );
  const defensivePadding = getGlassCannonDefensivePadding(item);

  return {
    ...item,
    ...createEmptyEquipmentStats(),
    ...baseStats,
    vitalityBonus: baseStats.vitalityBonus + defensivePadding.vitalityBonus,
    willpowerBonus: baseStats.willpowerBonus + defensivePadding.willpowerBonus,
  };
}

function normalizeEquipmentStats(
  definitions: EquipmentSeedData[],
): EquipmentSeedData[] {
  return definitions.map(normalizeEquipmentItemStats);
}

const rawStarterEquipmentDefinitions: EquipmentSeedData[] = [
  {
    name: 'Porrete de Aprendiz',
    description: 'Arma inicial de Tier 0 para Lutador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.MAIN_HAND,
    family: 'Maça',
    className: 'Lutador',
    mapName: 'Subúrbio Silencioso',
    strengthBonus: 2,
    isCraftable: false,
  },
  {
    name: 'Tampa de Aprendiz',
    description: 'Apoio inicial de Tier 0 para Lutador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.OFF_HAND,
    family: 'Escudo',
    className: 'Lutador',
    mapName: 'Subúrbio Silencioso',
    strengthBonus: 1,
    vitalityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Capacete de Aprendiz',
    description: 'Elmo inicial de Tier 0 para Lutador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.HEAD,
    family: 'Elmo',
    className: 'Lutador',
    mapName: 'Subúrbio Silencioso',
    willpowerBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Colete Pesado de Aprendiz',
    description: 'Armadura inicial de Tier 0 para Lutador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.ARMOR,
    family: 'Armadura',
    className: 'Lutador',
    mapName: 'Subúrbio Silencioso',
    vitalityBonus: 2,
    isCraftable: false,
  },
  {
    name: 'Calça Reforçada de Aprendiz',
    description: 'Pernas iniciais de Tier 0 para Lutador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.PANTS,
    family: 'Grevas',
    className: 'Lutador',
    mapName: 'Subúrbio Silencioso',
    vitalityBonus: 1,
    agilityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Botas de Aprendiz',
    description: 'Botas iniciais de Tier 0 para Lutador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.BOOTS,
    family: 'Botas',
    className: 'Lutador',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Faca de Aprendiz',
    description: 'Arma inicial de Tier 0 para Assassino.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.MAIN_HAND,
    family: 'Adagas',
    className: 'Assassino',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 2,
    precisionBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Lâmina Reserva de Aprendiz',
    description: 'Apoio inicial de Tier 0 para Assassino.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.OFF_HAND,
    family: 'Bombas',
    className: 'Assassino',
    mapName: 'Subúrbio Silencioso',
    precisionBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Capuz de Aprendiz',
    description: 'Elmo inicial de Tier 0 para Assassino.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.HEAD,
    family: 'Capuz',
    className: 'Assassino',
    mapName: 'Subúrbio Silencioso',
    techniqueBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Jaqueta Leve de Aprendiz',
    description: 'Armadura inicial de Tier 0 para Assassino.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.ARMOR,
    family: 'Traje',
    className: 'Assassino',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Perneiras de Aprendiz',
    description: 'Pernas iniciais de Tier 0 para Assassino.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.PANTS,
    family: 'Perneiras',
    className: 'Assassino',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Sapatilhas de Aprendiz',
    description: 'Pés iniciais de Tier 0 para Assassino.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.BOOTS,
    family: 'Sapatilhas',
    className: 'Assassino',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 2,
    isCraftable: false,
  },
  {
    name: 'Pistola de Aprendiz',
    description: 'Arma inicial de Tier 0 para Atirador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.MAIN_HAND,
    family: 'Pistola',
    className: 'Atirador',
    mapName: 'Subúrbio Silencioso',
    precisionBonus: 2,
    isCraftable: false,
  },
  {
    name: 'Carregador de Aprendiz',
    description: 'Apoio inicial de Tier 0 para Atirador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.OFF_HAND,
    family: 'Carregador',
    className: 'Atirador',
    mapName: 'Subúrbio Silencioso',
    precisionBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Viseira de Aprendiz',
    description: 'Elmo inicial de Tier 0 para Atirador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.HEAD,
    family: 'Viseira',
    className: 'Atirador',
    mapName: 'Subúrbio Silencioso',
    precisionBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Jaqueta de Patrulha Aprendiz',
    description: 'Armadura inicial de Tier 0 para Atirador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.ARMOR,
    family: 'Jaqueta',
    className: 'Atirador',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Cargueira de Aprendiz',
    description: 'Pernas iniciais de Tier 0 para Atirador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.PANTS,
    family: 'Cargueiras',
    className: 'Atirador',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Coturnos de Aprendiz',
    description: 'Pés iniciais de Tier 0 para Atirador.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.BOOTS,
    family: 'Coturnos',
    className: 'Atirador',
    mapName: 'Subúrbio Silencioso',
    agilityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Serra de Aprendiz',
    description: 'Arma inicial de Tier 0 para Médico.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.MAIN_HAND,
    family: 'Serra',
    className: 'Médico',
    mapName: 'Subúrbio Silencioso',
    techniqueBonus: 2,
    isCraftable: false,
  },
  {
    name: 'Injetor de Aprendiz',
    description: 'Apoio inicial de Tier 0 para Médico.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.OFF_HAND,
    family: 'Injetor',
    className: 'Médico',
    mapName: 'Subúrbio Silencioso',
    willpowerBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Máscara de Aprendiz',
    description: 'Elmo inicial de Tier 0 para Médico.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.HEAD,
    family: 'Máscara',
    className: 'Médico',
    mapName: 'Subúrbio Silencioso',
    willpowerBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Colete Clínico de Aprendiz',
    description: 'Armadura inicial de Tier 0 para Médico.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.ARMOR,
    family: 'Colete',
    className: 'Médico',
    mapName: 'Subúrbio Silencioso',
    vitalityBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Calças Clínicas de Aprendiz',
    description: 'Pernas iniciais de Tier 0 para Médico.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.PANTS,
    family: 'Calças',
    className: 'Médico',
    mapName: 'Subúrbio Silencioso',
    willpowerBonus: 1,
    isCraftable: false,
  },
  {
    name: 'Sapatos Clínicos de Aprendiz',
    description: 'Pés iniciais de Tier 0 para Médico.',
    tier: 0,
    rarity: Rarity.COMMON,
    slot: ItemSlot.BOOTS,
    family: 'Sapatos',
    className: 'Médico',
    mapName: 'Subúrbio Silencioso',
    vitalityBonus: 1,
    isCraftable: false,
  },
];

type LaunchGatheringMaterialTierConfig = {
  tier: number;
  mapName: string;
  requiredLevels: readonly [number, number];
};

type LaunchGatheringMaterialFamilyConfig = {
  origin: MaterialOrigin;
  activityLabel: string;
  family: string;
  variantsByTier: readonly (readonly [string, string])[];
};

const LAUNCH_GATHERING_MATERIAL_TIER_CONFIG: readonly LaunchGatheringMaterialTierConfig[] =
  [
    {
      tier: 1,
      mapName: 'Subúrbio Silencioso',
      requiredLevels: [1, 5],
    },
    {
      tier: 2,
      mapName: 'Distrito da Ferrugem',
      requiredLevels: [6, 10],
    },
    {
      tier: 3,
      mapName: 'Hospital Santa Ruína',
      requiredLevels: [11, 15],
    },
    {
      tier: 4,
      mapName: 'Terminal dos Esquecidos',
      requiredLevels: [16, 20],
    },
    {
      tier: 5,
      mapName: 'Zona de Quarentena 9',
      requiredLevels: [21, 25],
    },
    {
      tier: 6,
      mapName: 'Refinaria do Pó Cinzento',
      requiredLevels: [26, 30],
    },
    {
      tier: 7,
      mapName: 'Avenida dos Caídos',
      requiredLevels: [31, 35],
    },
    {
      tier: 8,
      mapName: 'Complexo Helix',
      requiredLevels: [36, 40],
    },
    {
      tier: 9,
      mapName: 'Necrópole Industrial',
      requiredLevels: [41, 45],
    },
    {
      tier: 10,
      mapName: 'Marco Zero',
      requiredLevels: [46, 50],
    },
  ];

const LAUNCH_GATHERING_MATERIAL_FAMILIES: readonly LaunchGatheringMaterialFamilyConfig[] =
  [
    {
      origin: MaterialOrigin.DESMANCHE,
      activityLabel: 'Desmanche',
      family: 'Sucata',
      variantsByTier: [
        ['Sucata Leve', 'Sucata Oxidada'],
        ['Sucata Rebitada', 'Sucata Industrial'],
        ['Sucata Reforçada', 'Sucata Selada'],
        ['Sucata Militar', 'Sucata Blindada'],
        ['Sucata Quarentenada', 'Sucata Antimuta'],
        ['Sucata Pressurizada', 'Sucata de Caldeira'],
        ['Sucata Tática', 'Sucata de Contenção'],
        ['Sucata Experimental', 'Sucata Helix'],
        ['Sucata Titânica', 'Sucata Necrosada'],
        ['Sucata Carmesim', 'Sucata Marco Zero'],
      ],
    },
    {
      origin: MaterialOrigin.COLETA,
      activityLabel: 'Coleta',
      family: 'Tecido',
      variantsByTier: [
        ['Tecido Puído', 'Tecido Remendado'],
        ['Tecido Encerado', 'Tecido Industrial'],
        ['Tecido Esterilizado', 'Tecido Reforçado'],
        ['Tecido Tático', 'Tecido Balístico'],
        ['Tecido Quarentenado', 'Tecido Antimuta'],
        ['Tecido Cinzento', 'Tecido Ignífugo'],
        ['Tecido Urbano', 'Tecido Antimotim'],
        ['Tecido Helix', 'Tecido Biofibra'],
        ['Tecido Necrótico', 'Tecido Titânico'],
        ['Tecido Carmesim', 'Tecido Marco Zero'],
      ],
    },
    {
      origin: MaterialOrigin.PATRULHA,
      activityLabel: 'Patrulha',
      family: 'Suprimento',
      variantsByTier: [
        ['Suprimento Básico', 'Suprimento de Rua'],
        ['Suprimento de Oficina', 'Suprimento Ferruginoso'],
        ['Suprimento Médico', 'Suprimento Esterilizado'],
        ['Suprimento de Terminal', 'Suprimento Tático'],
        ['Suprimento de Quarentena', 'Suprimento Selado'],
        ['Suprimento de Refinaria', 'Suprimento Cinzento'],
        ['Suprimento de Avenida', 'Suprimento Antimotim'],
        ['Suprimento Helix', 'Suprimento Experimental'],
        ['Suprimento Necrótico', 'Suprimento Titânico'],
        ['Suprimento Carmesim', 'Suprimento Marco Zero'],
      ],
    },
    {
      origin: MaterialOrigin.ARSENAL,
      activityLabel: 'Arsenal',
      family: 'Componente',
      variantsByTier: [
        ['Componente Improvisado', 'Componente Gasto'],
        ['Componente Rebitado', 'Componente Industrial'],
        ['Componente Clínico', 'Componente Calibrado'],
        ['Componente Tático', 'Componente de Embarque'],
        ['Componente Quarentenado', 'Componente Antimuta'],
        ['Componente Pressurizado', 'Componente de Refinaria'],
        ['Componente Antimotim', 'Componente Urbano'],
        ['Componente Helix', 'Componente Experimental'],
        ['Componente Titânico', 'Componente Necrosado'],
        ['Componente Carmesim', 'Componente Marco Zero'],
      ],
    },
    {
      origin: MaterialOrigin.TECNOVARREDURA,
      activityLabel: 'Tecnovarredura',
      family: 'Circuito',
      variantsByTier: [
        ['Circuito Frágil', 'Circuito Remendado'],
        ['Circuito Oxidado', 'Circuito Industrial'],
        ['Circuito Clínico', 'Circuito Selado'],
        ['Circuito Tático', 'Circuito de Terminal'],
        ['Circuito Quarentenado', 'Circuito Antimuta'],
        ['Circuito Pressurizado', 'Circuito de Refinaria'],
        ['Circuito Urbano', 'Circuito Antimotim'],
        ['Circuito Helix', 'Circuito Experimental'],
        ['Circuito Titânico', 'Circuito Necrosado'],
        ['Circuito Carmesim', 'Circuito Marco Zero'],
      ],
    },
    {
      origin: MaterialOrigin.CONTENCAO,
      activityLabel: 'Contenção',
      family: 'Filtro',
      variantsByTier: [
        ['Filtro Gasto', 'Filtro Pálido'],
        ['Filtro Rebitado', 'Filtro Industrial'],
        ['Filtro Clínico', 'Filtro Selado'],
        ['Filtro Tático', 'Filtro Blindado'],
        ['Filtro Quarentenado', 'Filtro Antimuta'],
        ['Filtro Pressurizado', 'Filtro de Refinaria'],
        ['Filtro Antimotim', 'Filtro Urbano'],
        ['Filtro Helix', 'Filtro Experimental'],
        ['Filtro Titânico', 'Filtro Necrosado'],
        ['Filtro Carmesim', 'Filtro Marco Zero'],
      ],
    },
  ];

function createItemSlug(value: string) {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function createLaunchGatheringMaterialDefinitions(): MaterialSeedDataWithGatheringProgression[] {
  return LAUNCH_GATHERING_MATERIAL_FAMILIES.flatMap((familyConfig) =>
    LAUNCH_GATHERING_MATERIAL_TIER_CONFIG.flatMap((tierConfig, tierIndex) =>
      familyConfig.variantsByTier[tierIndex].map((materialName, variantIndex) => ({
        name: materialName,
        slug: createItemSlug(materialName),
        description: `${materialName} obtido em ${familyConfig.activityLabel} no mapa ${tierConfig.mapName}. Material genérico da família ${familyConfig.family} para a base de crafting.`,
        tier: tierConfig.tier,
        family: familyConfig.family,
        mapName: tierConfig.mapName,
        materialOrigin: familyConfig.origin,
        materialSlot: null,
        isGatheringMaterial: true,
        requiredGatheringLevel: tierConfig.requiredLevels[variantIndex],
      })),
    ),
  );
}

export const materialDefinitions: MaterialSeedDataWithGatheringProgression[] =
  createLaunchGatheringMaterialDefinitions();

// Catalogo de equipamentos finais/de set resetado intencionalmente.
// Os equipamentos iniciais de aprendiz continuam em starterEquipmentDefinitions.
const rawEquipmentDefinitions: EquipmentSeedData[] = [];

export const starterEquipmentDefinitions: EquipmentSeedData[] =
  normalizeEquipmentStats(rawStarterEquipmentDefinitions);

export const equipmentDefinitions: EquipmentSeedData[] = normalizeEquipmentStats(
  rawEquipmentDefinitions,
);
