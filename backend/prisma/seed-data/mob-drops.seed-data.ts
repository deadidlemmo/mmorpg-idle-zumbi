import { Rarity } from '@prisma/client';
import type { MobDropItemSeedData, MobDropTableSeedData } from '../seed-types';

/**
 * Itens e tabelas de drop dos mobs.
 *
 * Fonte: itens_dropaveis_dos_mobs_biomateriais.csv.
 * Use nomes de mob/item como identificadores estaveis para evitar depender de IDs do banco.
 */
export const mobDropItemDefinitions: MobDropItemSeedData[] = [
  {
    name: 'Biomaterial Articular Comum',
    slug: 'biomaterial-articular-comum',
    description:
      'Biomaterial Articular obtido de mobs. Uso: Crafting por família de slot.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Biomaterial Articular',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Cortante Comum',
    slug: 'biomaterial-cortante-comum',
    description:
      'Biomaterial Cortante obtido de mobs. Uso: Crafting por família de slot.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Biomaterial Cortante',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Craniano Comum',
    slug: 'biomaterial-craniano-comum',
    description:
      'Biomaterial Craniano obtido de mobs. Uso: Crafting por família de slot.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Biomaterial Craniano',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial de Mobilidade Comum',
    slug: 'biomaterial-de-mobilidade-comum',
    description:
      'Biomaterial de Mobilidade obtido de mobs. Uso: Crafting por família de slot.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Biomaterial de Mobilidade',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Reativo Comum',
    slug: 'biomaterial-reativo-comum',
    description:
      'Biomaterial Reativo obtido de mobs. Uso: Crafting por família de slot.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Biomaterial Reativo',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Torácico Comum',
    slug: 'biomaterial-toracico-comum',
    description:
      'Biomaterial Torácico obtido de mobs. Uso: Crafting por família de slot.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Biomaterial Torácico',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Núcleo Infectado de Elite Comum',
    slug: 'nucleo-infectado-de-elite-comum',
    description:
      'Núcleo Infectado de Elite obtido de mobs. Uso: Crafting raro / upgrades de elite.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Núcleo Infectado de Elite',
    dropType: 'NUCLEO_ELITE',
    usage: 'Crafting raro / upgrades de elite',
  },
  {
    name: 'Resíduo Infecto Pálido',
    slug: 'residuo-infecto-palido',
    description:
      'Resíduo Infecto obtido de mobs. Uso: Crafting por faixa de tier.',
    tier: 1,
    rarity: Rarity.COMMON,
    family: 'Resíduo Infecto',
    dropType: 'RESIDUO',
    usage: 'Crafting por faixa de tier',
  },
  {
    name: 'Biomaterial Articular Incomum',
    slug: 'biomaterial-articular-incomum',
    description:
      'Biomaterial Articular obtido de mobs. Uso: Crafting por família de slot.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Biomaterial Articular',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Cortante Incomum',
    slug: 'biomaterial-cortante-incomum',
    description:
      'Biomaterial Cortante obtido de mobs. Uso: Crafting por família de slot.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Biomaterial Cortante',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Craniano Incomum',
    slug: 'biomaterial-craniano-incomum',
    description:
      'Biomaterial Craniano obtido de mobs. Uso: Crafting por família de slot.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Biomaterial Craniano',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial de Mobilidade Incomum',
    slug: 'biomaterial-de-mobilidade-incomum',
    description:
      'Biomaterial de Mobilidade obtido de mobs. Uso: Crafting por família de slot.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Biomaterial de Mobilidade',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Reativo Incomum',
    slug: 'biomaterial-reativo-incomum',
    description:
      'Biomaterial Reativo obtido de mobs. Uso: Crafting por família de slot.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Biomaterial Reativo',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Torácico Incomum',
    slug: 'biomaterial-toracico-incomum',
    description:
      'Biomaterial Torácico obtido de mobs. Uso: Crafting por família de slot.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Biomaterial Torácico',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Núcleo Infectado de Elite Incomum',
    slug: 'nucleo-infectado-de-elite-incomum',
    description:
      'Núcleo Infectado de Elite obtido de mobs. Uso: Crafting raro / upgrades de elite.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Núcleo Infectado de Elite',
    dropType: 'NUCLEO_ELITE',
    usage: 'Crafting raro / upgrades de elite',
  },
  {
    name: 'Resíduo Infecto Amarelado',
    slug: 'residuo-infecto-amarelado',
    description:
      'Resíduo Infecto obtido de mobs. Uso: Crafting por faixa de tier.',
    tier: 3,
    rarity: Rarity.UNCOMMON,
    family: 'Resíduo Infecto',
    dropType: 'RESIDUO',
    usage: 'Crafting por faixa de tier',
  },
  {
    name: 'Biomaterial Articular Raro',
    slug: 'biomaterial-articular-raro',
    description:
      'Biomaterial Articular obtido de mobs. Uso: Crafting por família de slot.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Biomaterial Articular',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Cortante Raro',
    slug: 'biomaterial-cortante-raro',
    description:
      'Biomaterial Cortante obtido de mobs. Uso: Crafting por família de slot.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Biomaterial Cortante',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Craniano Raro',
    slug: 'biomaterial-craniano-raro',
    description:
      'Biomaterial Craniano obtido de mobs. Uso: Crafting por família de slot.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Biomaterial Craniano',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Reativo Raro',
    slug: 'biomaterial-reativo-raro',
    description:
      'Biomaterial Reativo obtido de mobs. Uso: Crafting por família de slot.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Biomaterial Reativo',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Torácico Raro',
    slug: 'biomaterial-toracico-raro',
    description:
      'Biomaterial Torácico obtido de mobs. Uso: Crafting por família de slot.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Biomaterial Torácico',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Núcleo Infectado de Elite Raro',
    slug: 'nucleo-infectado-de-elite-raro',
    description:
      'Núcleo Infectado de Elite obtido de mobs. Uso: Crafting raro / upgrades de elite.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Núcleo Infectado de Elite',
    dropType: 'NUCLEO_ELITE',
    usage: 'Crafting raro / upgrades de elite',
  },
  {
    name: 'Resíduo Infecto Tóxico',
    slug: 'residuo-infecto-toxico',
    description:
      'Resíduo Infecto obtido de mobs. Uso: Crafting por faixa de tier.',
    tier: 5,
    rarity: Rarity.RARE,
    family: 'Resíduo Infecto',
    dropType: 'RESIDUO',
    usage: 'Crafting por faixa de tier',
  },
  {
    name: 'Biomaterial de Mobilidade Raro',
    slug: 'biomaterial-de-mobilidade-raro',
    description:
      'Biomaterial de Mobilidade obtido de mobs. Uso: Crafting por família de slot.',
    tier: 6,
    rarity: Rarity.RARE,
    family: 'Biomaterial de Mobilidade',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Articular Épico',
    slug: 'biomaterial-articular-epico',
    description:
      'Biomaterial Articular obtido de mobs. Uso: Crafting por família de slot.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Biomaterial Articular',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Cortante Épico',
    slug: 'biomaterial-cortante-epico',
    description:
      'Biomaterial Cortante obtido de mobs. Uso: Crafting por família de slot.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Biomaterial Cortante',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Craniano Épico',
    slug: 'biomaterial-craniano-epico',
    description:
      'Biomaterial Craniano obtido de mobs. Uso: Crafting por família de slot.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Biomaterial Craniano',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial de Mobilidade Épico',
    slug: 'biomaterial-de-mobilidade-epico',
    description:
      'Biomaterial de Mobilidade obtido de mobs. Uso: Crafting por família de slot.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Biomaterial de Mobilidade',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Reativo Épico',
    slug: 'biomaterial-reativo-epico',
    description:
      'Biomaterial Reativo obtido de mobs. Uso: Crafting por família de slot.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Biomaterial Reativo',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Torácico Épico',
    slug: 'biomaterial-toracico-epico',
    description:
      'Biomaterial Torácico obtido de mobs. Uso: Crafting por família de slot.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Biomaterial Torácico',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Núcleo Infectado de Elite Épico',
    slug: 'nucleo-infectado-de-elite-epico',
    description:
      'Núcleo Infectado de Elite obtido de mobs. Uso: Crafting raro / upgrades de elite.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Núcleo Infectado de Elite',
    dropType: 'NUCLEO_ELITE',
    usage: 'Crafting raro / upgrades de elite',
  },
  {
    name: 'Resíduo Infecto Mutagênico',
    slug: 'residuo-infecto-mutagenico',
    description:
      'Resíduo Infecto obtido de mobs. Uso: Crafting por faixa de tier.',
    tier: 7,
    rarity: Rarity.EPIC,
    family: 'Resíduo Infecto',
    dropType: 'RESIDUO',
    usage: 'Crafting por faixa de tier',
  },
  {
    name: 'Biomaterial Articular Lendário',
    slug: 'biomaterial-articular-lendario',
    description:
      'Biomaterial Articular obtido de mobs. Uso: Crafting por família de slot.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Biomaterial Articular',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Cortante Lendário',
    slug: 'biomaterial-cortante-lendario',
    description:
      'Biomaterial Cortante obtido de mobs. Uso: Crafting por família de slot.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Biomaterial Cortante',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial de Mobilidade Lendário',
    slug: 'biomaterial-de-mobilidade-lendario',
    description:
      'Biomaterial de Mobilidade obtido de mobs. Uso: Crafting por família de slot.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Biomaterial de Mobilidade',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Reativo Lendário',
    slug: 'biomaterial-reativo-lendario',
    description:
      'Biomaterial Reativo obtido de mobs. Uso: Crafting por família de slot.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Biomaterial Reativo',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Biomaterial Torácico Lendário',
    slug: 'biomaterial-toracico-lendario',
    description:
      'Biomaterial Torácico obtido de mobs. Uso: Crafting por família de slot.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Biomaterial Torácico',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
  {
    name: 'Núcleo Infectado de Elite Lendário',
    slug: 'nucleo-infectado-de-elite-lendario',
    description:
      'Núcleo Infectado de Elite obtido de mobs. Uso: Crafting raro / upgrades de elite.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Núcleo Infectado de Elite',
    dropType: 'NUCLEO_ELITE',
    usage: 'Crafting raro / upgrades de elite',
  },
  {
    name: 'Resíduo Infecto Saturado',
    slug: 'residuo-infecto-saturado',
    description:
      'Resíduo Infecto obtido de mobs. Uso: Crafting por faixa de tier.',
    tier: 9,
    rarity: Rarity.LEGENDARY,
    family: 'Resíduo Infecto',
    dropType: 'RESIDUO',
    usage: 'Crafting por faixa de tier',
  },
  {
    name: 'Biomaterial Craniano Lendário',
    slug: 'biomaterial-craniano-lendario',
    description:
      'Biomaterial Craniano obtido de mobs. Uso: Crafting por família de slot.',
    tier: 10,
    rarity: Rarity.LEGENDARY,
    family: 'Biomaterial Craniano',
    dropType: 'BIOMATERIAL',
    usage: 'Crafting por família de slot',
  },
];

export const mobDropTables: MobDropTableSeedData[] = [
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Bloco do Síndico',
    mobName: 'Inquilino Esticado do Bloco',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Bloco do Síndico',
    mobName: 'Porteiro Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Bloco do Síndico',
    mobName: 'Síndico Devorado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Comum',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Bloco do Síndico',
    mobName: 'Urubu Carniceiro Contaminado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Quintais Abandonados',
    mobName: 'Gambá de Entulho Contaminado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Quintais Abandonados',
    mobName: 'Morador do Quintal',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Quintais Abandonados',
    mobName: 'Morcego de Caixa d’Água',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Quintais Abandonados',
    mobName: 'Rastejante de Garagem',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Rua das Cercas',
    mobName: 'Cão de Rua Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Rua das Cercas',
    mobName: 'Errante do Subúrbio',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Rua das Cercas',
    mobName: 'Gato de Telhado Contaminado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 1,
    mapName: 'Subúrbio Silencioso',
    subMapName: 'Rua das Cercas',
    mobName: 'Rato de Lixeira Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Galpão do Capataz',
    mobName: 'Aranha de Viga Contaminada',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Galpão do Capataz',
    mobName: 'Capataz Ferrugento',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Comum',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Galpão do Capataz',
    mobName: 'Soldador Mascarado Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Galpão do Capataz',
    mobName: 'Vigia do Galpão Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Linha de Prensas',
    mobName: 'Esmagado da Prensa',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Linha de Prensas',
    mobName: 'Lacraia de Esteira Ferruginosa',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Linha de Prensas',
    mobName: 'Operário Prensado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Linha de Prensas',
    mobName: 'Pistoneiro Hidráulico',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Pátio de Carga',
    mobName: 'Arrastador de Correntes',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Pátio de Carga',
    mobName: 'Barata de Depósito Oleosa',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Pátio de Carga',
    mobName: 'Carregador de Paletes Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 2,
    mapName: 'Distrito da Ferrugem',
    subMapName: 'Pátio de Carga',
    mobName: 'Operador de Empilhadeira Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Pálido',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Comum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Ala de Isolamento',
    mobName: 'Centopeia de Tubulação Contaminada',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Ala de Isolamento',
    mobName: 'Enfermeira de Isolamento Infectada',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Ala de Isolamento',
    mobName: 'Interno Retorcido do Isolamento',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Ala de Isolamento',
    mobName: 'Técnico Selado de Descontaminação',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Centro Cirúrgico',
    mobName: 'Anestesista Colapsado',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Centro Cirúrgico',
    mobName: 'Cirurgião-Chefe Necrosado',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Incomum',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Centro Cirúrgico',
    mobName: 'Instrumentador Cirúrgico Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Centro Cirúrgico',
    mobName: 'Sanguessuga de Bolsa Hemática',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Triagem Vazia',
    mobName: 'Entubado da Triagem',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Triagem Vazia',
    mobName: 'Maqueiro Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Triagem Vazia',
    mobName: 'Mosca de Ferida Contaminada',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 3,
    mapName: 'Hospital Santa Ruína',
    subMapName: 'Triagem Vazia',
    mobName: 'Paciente Febril Errante',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Cabine Final',
    mobName: 'Cobrador Fundido',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Cabine Final',
    mobName: 'Condutor Sem Mandíbula',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Cabine Final',
    mobName: 'Escorpião de Painel Elétrico',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Cabine Final',
    mobName: 'Regente da Cabine Lacrada',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Incomum',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Plataformas Mortas',
    mobName: 'Casulo de Traças de Plataforma',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Plataformas Mortas',
    mobName: 'Corcunda do Bagageiro',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Plataformas Mortas',
    mobName: 'Sinaleiro Sem Rosto',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Plataformas Mortas',
    mobName: 'Verme de Escapamento Tóxico',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Saguão de Embarque',
    mobName: 'Amontoado de Bagagens Vivas',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Saguão de Embarque',
    mobName: 'Enxame de Carrapatos Hemáticos',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Saguão de Embarque',
    mobName: 'Farejador Mutado da Segurança',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 4,
    mapName: 'Terminal dos Esquecidos',
    subMapName: 'Saguão de Embarque',
    mobName: 'Mandibulado do Embarque',
    drops: [
      {
        itemName: 'Resíduo Infecto Amarelado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Incomum',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Cercas Internas',
    mobName: 'Arameiro de Contenção',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Cercas Internas',
    mobName: 'Lesma de Canaleta Química',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Cercas Internas',
    mobName: 'Sentinela Eletrocutado',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Cercas Internas',
    mobName: 'Vazador Tóxico de Grade',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Posto de Comando',
    mobName: 'Coronel Lacrado da Zona 9',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Raro',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Posto de Comando',
    mobName: 'Oficial de Contenção Necrosado',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Posto de Comando',
    mobName: 'Operador de Rádio Infectado',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Posto de Comando',
    mobName: 'Parasita de Mesa Tática',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Triagem Externa',
    mobName: 'Cadáver de Maca Quarentenado',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Triagem Externa',
    mobName: 'Isolado da Tenda Rasgada',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Triagem Externa',
    mobName: 'Larva de Descarte Biológico',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 5,
    mapName: 'Zona de Quarentena 9',
    subMapName: 'Triagem Externa',
    mobName: 'Portador de Máscara Fundida',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Câmara da Fornalha',
    mobName: 'Besta da Escória Fervente',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Câmara da Fornalha',
    mobName: 'Carvoeiro Sem Pele',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Câmara da Fornalha',
    mobName: 'Forjado em Cinzas',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Câmara da Fornalha',
    mobName: 'Guardião da Fornalha Morta',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Raro',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tanques Vazios',
    mobName: 'Afogado em Óleo Cinzento',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tanques Vazios',
    mobName: 'Homem-Tanque Rachado',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tanques Vazios',
    mobName: 'Respirador de Cinzas',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tanques Vazios',
    mobName: 'Salamandra de Borra Cinzenta',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tubulação Quente',
    mobName: 'Aracnídeo de Canos Ferventes',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tubulação Quente',
    mobName: 'Operário Escaldado de Vapor',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tubulação Quente',
    mobName: 'Pressurizado Sem Face',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 6,
    mapName: 'Refinaria do Pó Cinzento',
    subMapName: 'Tubulação Quente',
    mobName: 'Queimado de Tubulação Viva',
    drops: [
      {
        itemName: 'Resíduo Infecto Tóxico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Raro',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Becos de Caça',
    mobName: 'Boca de Bueiro Faminta',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Becos de Caça',
    mobName: 'Caçador de Neon Quebrado',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Becos de Caça',
    mobName: 'Corpo-Parede dos Becos',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Becos de Caça',
    mobName: 'Predador de Viela Cega',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Cruzamento Central',
    mobName: 'Fendido do Asfalto',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Cruzamento Central',
    mobName: 'Semafórico de Carne Exposta',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Cruzamento Central',
    mobName: 'Tirano do Cruzamento Morto',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Épico',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Cruzamento Central',
    mobName: 'Trauma de Sirene Quebrada',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Faixa Engarrafada',
    mobName: 'Buzinador Sem Cabeça',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Faixa Engarrafada',
    mobName: 'Cervídeo Atropelado Mutado',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Faixa Engarrafada',
    mobName: 'Colosso do Para-Choque',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 7,
    mapName: 'Avenida dos Caídos',
    subMapName: 'Faixa Engarrafada',
    mobName: 'Motorista Fundido ao Volante',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Ala de Observação',
    mobName: 'Observado de Vidro Vivo',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Ala de Observação',
    mobName: 'Olho Helix Suspenso',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Ala de Observação',
    mobName: 'Réplica Neural Incompleta',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Ala de Observação',
    mobName: 'Técnico de Monitoração Fundido',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Câmaras Seladas',
    mobName: 'Cobaia de Tanque Rompido',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Câmaras Seladas',
    mobName: 'Gêmeos de Cápsula Fundida',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Câmaras Seladas',
    mobName: 'Guardião de Acrílico Selado',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Câmaras Seladas',
    mobName: 'Larva de Amostra Helix',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Diretoria Helix',
    mobName: 'Arquivo Vivo Helix',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Diretoria Helix',
    mobName: 'Assessor Biomecânico',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Diretoria Helix',
    mobName: 'Doutor Helix Primeiro Vetor',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Épico',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 8,
    mapName: 'Complexo Helix',
    subMapName: 'Diretoria Helix',
    mobName: 'Executivo Parasitado',
    drops: [
      {
        itemName: 'Resíduo Infecto Mutagênico',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Épico',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Coração da Usina',
    mobName: 'Forjado de Aço Necrosado',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Coração da Usina',
    mobName: 'Parasita de Caldeira Morta',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Coração da Usina',
    mobName: 'Soberano da Usina Morta',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Lendário',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Coração da Usina',
    mobName: 'Turbina de Carne Pulsante',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Esteiras Mortas',
    mobName: 'Boneco de Cabos Nervosos',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Esteiras Mortas',
    mobName: 'Caranguejo de Sucata Orgânica',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Esteiras Mortas',
    mobName: 'Costurado da Esteira Morta',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Esteiras Mortas',
    mobName: 'Triturador de Membros Rejeitados',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Pátio de Escória',
    mobName: 'Besouro de Fornalha Necrosado',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Pátio de Escória',
    mobName: 'Colosso de Fuligem Coagulada',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Pátio de Escória',
    mobName: 'Fundido de Escória Humana',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 9,
    mapName: 'Necrópole Industrial',
    subMapName: 'Pátio de Escória',
    mobName: 'Mutilado de Metal Derretido',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Anel Externo',
    mobName: 'Cervical Aberta do Marco',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Craniano Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Anel Externo',
    mobName: 'Eco Humano Saturado',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Anel Externo',
    mobName: 'Lacraia de Cinza Primária',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial de Mobilidade Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Anel Externo',
    mobName: 'Sentinela de Carne Cristalizada',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Núcleo do Colapso',
    mobName: 'Carcaça do Primeiro Paciente',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Articular Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Núcleo do Colapso',
    mobName: 'Coração do Marco Zero',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Núcleo Infectado de Elite Lendário',
        dropChance: 25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Núcleo do Colapso',
    mobName: 'Forma Primária do Surto',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Núcleo do Colapso',
    mobName: 'Serafim do Colapso Biológico',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Cortante Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Zona de Saturação',
    mobName: 'Anjo de Pele Invertida',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Torácico Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Zona de Saturação',
    mobName: 'Besta de Radiação Orgânica',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Zona de Saturação',
    mobName: 'Corpo Saturado de Mil Vozes',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
  {
    tier: 10,
    mapName: 'Marco Zero',
    subMapName: 'Zona de Saturação',
    mobName: 'Raiz Neural do Surto',
    drops: [
      {
        itemName: 'Resíduo Infecto Saturado',
        dropChance: 45,
        minQuantity: 1,
        maxQuantity: 2,
      },
      {
        itemName: 'Biomaterial Reativo Lendário',
        dropChance: 35,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ],
  },
];
