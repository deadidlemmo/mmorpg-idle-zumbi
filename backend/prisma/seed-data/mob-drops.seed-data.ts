import { Rarity } from '@prisma/client';
import type { MobDropItemSeedData, MobDropTableSeedData } from '../seed-types';
import { mobBaseDefinitions } from './mobs.seed-data';

/**
 * Itens e tabelas de drop dos mobs.
 *
 * A economia de drops segue uma matriz simetrica:
 * - 12 mobs canonicos por tier.
 * - todo mob dropa 1 residuo da faixa de tier.
 * - todo mob dropa 1 biomaterial.
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
      description: 'Resíduo Infecto obtido de mobs. Uso: Crafting por faixa de tier.',
      tier: band.itemTier,
      rarity: band.rarity,
      family: 'Resíduo Infecto',
      dropType: 'RESIDUE' as const,
      usage: 'Crafting por faixa de tier',
    })),
  ];
}

export const mobDropItemDefinitions: MobDropItemSeedData[] = buildMobDropItems();

const tierMobCounters = new Map<number, number>();

export const mobDropTables: MobDropTableSeedData[] = mobBaseDefinitions.map(
  (mob) => {
    const band = getDropRarityBand(mob.tier);
    const tierMobIndex = tierMobCounters.get(mob.tier) ?? 0;
    tierMobCounters.set(mob.tier, tierMobIndex + 1);

    const biomaterialFamily = getBiomaterialFamilyForMob(
      mob.tier,
      tierMobIndex,
    );
    const drops: MobDropTableSeedData['drops'] = [
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
      tier: mob.tier,
      mapName: mob.mapName,
      subMapName: mob.subMapName,
      orderNoSubmap: mob.orderNoSubmap,
      mobType: mob.mobType,
      mobName: mob.name,
      rarity: band.rarity,
      drops,
    };
  },
);
