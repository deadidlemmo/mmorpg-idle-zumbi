import { Rarity } from '@prisma/client';
import type { MobDropItemSeedData, MobDropTableSeedData } from '../seed-types';
import {
  getAbsorbedAutoCombatMobOrder,
  isActiveAutoCombatMob,
  mobBaseDefinitions,
  type MobBaseSeedData,
} from './mobs.seed-data';

/**
 * Itens e tabelas de drop dos mobs.
 *
 * A economia de drops segue uma matriz simetrica:
 * - 12 mobs cadastrados por tier, com 6 ativos no auto-combate.
 * - todo mob ativo dropa 1 residuo da faixa de tier.
 * - todo mob ativo dropa os biomateriais dele e do mob removido pareado.
 * - elites dropam tambem 1 nucleo infectado de elite.
 * - cada familia de biomaterial aparece 2 vezes por tier, totalizando 20 fontes por familia.
 * - Biomaterial Cortante tem chance dobrada porque existem 2x mais receitas de arma principal.
 */

const BIOMATERIAL_FAMILIES = [
  'Biomaterial Articular',
  'Biomaterial Cortante',
  'Biomaterial Craniano',
  'Biomaterial de Mobilidade',
  'Biomaterial Reativo',
  'Biomaterial Torácico',
] as const;

type BiomaterialFamily = (typeof BIOMATERIAL_FAMILIES)[number];

const DROP_RARITY_BANDS = [
  {
    minTier: 1,
    maxTier: 2,
    itemTier: 1,
    suffix: 'Comum',
    rarity: Rarity.COMMON,
    residueName: 'Resíduo Infecto Pálido',
    eliteCoreName: 'Núcleo Infectado de Elite Comum',
  },
  {
    minTier: 3,
    maxTier: 4,
    itemTier: 3,
    suffix: 'Incomum',
    rarity: Rarity.UNCOMMON,
    residueName: 'Resíduo Infecto Amarelado',
    eliteCoreName: 'Núcleo Infectado de Elite Incomum',
  },
  {
    minTier: 5,
    maxTier: 6,
    itemTier: 5,
    suffix: 'Raro',
    rarity: Rarity.RARE,
    residueName: 'Resíduo Infecto Tóxico',
    eliteCoreName: 'Núcleo Infectado de Elite Raro',
  },
  {
    minTier: 7,
    maxTier: 8,
    itemTier: 7,
    suffix: 'Épico',
    rarity: Rarity.EPIC,
    residueName: 'Resíduo Infecto Mutagênico',
    eliteCoreName: 'Núcleo Infectado de Elite Épico',
  },
  {
    minTier: 9,
    maxTier: 10,
    itemTier: 9,
    suffix: 'Lendário',
    rarity: Rarity.LEGENDARY,
    residueName: 'Resíduo Infecto Saturado',
    eliteCoreName: 'Núcleo Infectado de Elite Lendário',
  },
] as const;

const BIOMATERIAL_DROP_CHANCE_BY_FAMILY: Record<BiomaterialFamily, number> = {
  'Biomaterial Articular': 35,
  'Biomaterial Cortante': 70,
  'Biomaterial Craniano': 35,
  'Biomaterial de Mobilidade': 35,
  'Biomaterial Reativo': 35,
  'Biomaterial Torácico': 35,
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getDropRarityBand(tier: number) {
  const band = DROP_RARITY_BANDS.find(
    (candidate) => tier >= candidate.minTier && tier <= candidate.maxTier,
  );

  if (!band) {
    throw new Error(`Tier sem faixa de drops configurada: ${tier}.`);
  }

  return band;
}

function getBiomaterialName(family: BiomaterialFamily, tier: number) {
  const band = getDropRarityBand(tier);
  return `${family} ${band.suffix}`;
}

function getBiomaterialFamilyForMob(tier: number, tierMobIndex: number) {
  const tierOffset = (tier - 1) % BIOMATERIAL_FAMILIES.length;
  return BIOMATERIAL_FAMILIES[
    (tierMobIndex + tierOffset) % BIOMATERIAL_FAMILIES.length
  ];
}

function buildMobDropItems(): MobDropItemSeedData[] {
  return [
    ...DROP_RARITY_BANDS.flatMap((band) =>
      BIOMATERIAL_FAMILIES.map((family) => ({
        name: `${family} ${band.suffix}`,
        slug: slugify(`${family} ${band.suffix}`),
        description: `${family} obtido de mobs. Uso: Crafting por família de slot.`,
        tier: band.itemTier,
        rarity: band.rarity,
        family,
        dropType: 'BIOMATERIAL' as const,
        usage: 'Crafting por família de slot',
      })),
    ),
    ...DROP_RARITY_BANDS.map((band) => ({
      name: band.eliteCoreName,
      slug: slugify(band.eliteCoreName),
      description:
        'Núcleo Infectado de Elite obtido de mobs. Uso: Crafting raro / upgrades de elite.',
      tier: band.itemTier,
      rarity: band.rarity,
      family: 'Núcleo Infectado de Elite',
      dropType: 'ELITE_CORE' as const,
      usage: 'Crafting raro / upgrades de elite',
    })),
    ...DROP_RARITY_BANDS.map((band) => ({
      name: band.residueName,
      slug: slugify(band.residueName),
      description:
        'Resíduo Infecto obtido de mobs. Uso: Crafting por faixa de tier.',
      tier: band.itemTier,
      rarity: band.rarity,
      family: 'Resíduo Infecto',
      dropType: 'RESIDUE' as const,
      usage: 'Crafting por faixa de tier',
    })),
  ];
}

export const mobDropItemDefinitions: MobDropItemSeedData[] =
  buildMobDropItems();

type MobDropEntry = MobDropTableSeedData['drops'][number];

type MobDropSource = {
  mob: MobBaseSeedData;
  rarity: MobDropTableSeedData['rarity'];
  drops: MobDropEntry[];
};

function getMobDefinitionKey(
  mob: Pick<MobBaseSeedData, 'mapName' | 'subMapName' | 'orderNoSubmap'>,
) {
  return `${mob.mapName}::${mob.subMapName}::${mob.orderNoSubmap}`;
}

function buildBaseDropsForMob(
  mob: MobBaseSeedData,
  tierMobIndex: number,
): Pick<MobDropSource, 'rarity' | 'drops'> {
  const band = getDropRarityBand(mob.tier);
  const biomaterialFamily = getBiomaterialFamilyForMob(mob.tier, tierMobIndex);
  const drops: MobDropEntry[] = [
    {
      itemName: band.residueName,
      dropType: 'RESIDUE',
      dropChance: 45,
      minQuantity: 1,
      maxQuantity: 2,
    },
    {
      itemName: getBiomaterialName(biomaterialFamily, mob.tier),
      dropType: 'BIOMATERIAL',
      dropChance: BIOMATERIAL_DROP_CHANCE_BY_FAMILY[biomaterialFamily],
      minQuantity: 1,
      maxQuantity: 1,
    },
  ];

  if (mob.mobType === 'ELITE') {
    drops.push({
      itemName: band.eliteCoreName,
      dropType: 'ELITE_CORE',
      dropChance: 25,
      minQuantity: 1,
      maxQuantity: 1,
    });
  }

  return {
    rarity: band.rarity,
    drops,
  };
}

function mergeMobDrops(drops: MobDropEntry[]) {
  const mergedDropsByItemName = new Map<string, MobDropEntry>();

  for (const drop of drops) {
    const currentDrop = mergedDropsByItemName.get(drop.itemName);

    if (!currentDrop) {
      mergedDropsByItemName.set(drop.itemName, drop);
      continue;
    }

    mergedDropsByItemName.set(drop.itemName, {
      ...currentDrop,
      dropChance: Math.max(currentDrop.dropChance, drop.dropChance),
      minQuantity: Math.min(currentDrop.minQuantity, drop.minQuantity),
      maxQuantity: Math.max(currentDrop.maxQuantity, drop.maxQuantity),
    });
  }

  return Array.from(mergedDropsByItemName.values());
}

const tierMobCounters = new Map<number, number>();

const mobDropSources: MobDropSource[] = mobBaseDefinitions.map((mob) => {
  const tierMobIndex = tierMobCounters.get(mob.tier) ?? 0;
  tierMobCounters.set(mob.tier, tierMobIndex + 1);

  const baseDrops = buildBaseDropsForMob(mob, tierMobIndex);

  return {
    mob,
    rarity: baseDrops.rarity,
    drops: baseDrops.drops,
  };
});

const mobDropSourceByDefinitionKey = new Map(
  mobDropSources.map((source) => [getMobDefinitionKey(source.mob), source]),
);

export const mobDropTables: MobDropTableSeedData[] = mobDropSources
  .filter((source) => isActiveAutoCombatMob(source.mob))
  .map((source) => {
    const absorbedOrder = getAbsorbedAutoCombatMobOrder(source.mob);
    const absorbedSource =
      absorbedOrder === null
        ? null
        : mobDropSourceByDefinitionKey.get(
            getMobDefinitionKey({
              mapName: source.mob.mapName,
              subMapName: source.mob.subMapName,
              orderNoSubmap: absorbedOrder,
            }),
          );

    const drops = mergeMobDrops([
      ...source.drops,
      ...(absorbedSource?.drops ?? []),
    ]);

    return {
      tier: source.mob.tier,
      mapName: source.mob.mapName,
      subMapName: source.mob.subMapName,
      orderNoSubmap: source.mob.orderNoSubmap,
      mobType: source.mob.mobType,
      mobName: source.mob.name,
      rarity: source.rarity,
      drops,
    };
  });
