import {
  AvatarPresentation,
  AvatarRepresentation,
  CosmeticAccessType,
  CosmeticType,
  Rarity,
} from '@prisma/client';
import type { CosmeticSeedData } from './cosmetics.seed-data';

export const REQUIRED_AVATAR_PRESENTATIONS = [
  AvatarPresentation.MASCULINE,
  AvatarPresentation.FEMININE,
] as const;

export const REQUIRED_AVATAR_REPRESENTATIONS = [
  AvatarRepresentation.WHITE,
  AvatarRepresentation.JAPANESE,
  AvatarRepresentation.BLACK,
  AvatarRepresentation.OTHER,
] as const;

export const COMPLETE_AVATAR_COLLECTION_KEYS = [
  'premium-ultimo-abrigo',
  'premium-nucleo-helix',
  'premium-protocolo-carmesim',
] as const;

type AvatarSlot = {
  presentation: AvatarPresentation;
  representation: AvatarRepresentation;
  slug: string;
  codename: string;
  representationLabel?: string;
  sortOrder: number;
};

const AVATAR_SLOTS: AvatarSlot[] = [
  {
    presentation: AvatarPresentation.MASCULINE,
    representation: AvatarRepresentation.WHITE,
    slug: 'm-white',
    codename: 'Atlas',
    sortOrder: 10,
  },
  {
    presentation: AvatarPresentation.MASCULINE,
    representation: AvatarRepresentation.JAPANESE,
    slug: 'm-japanese',
    codename: 'Vetor',
    sortOrder: 11,
  },
  {
    presentation: AvatarPresentation.MASCULINE,
    representation: AvatarRepresentation.BLACK,
    slug: 'm-black',
    codename: 'Bastião',
    sortOrder: 12,
  },
  {
    presentation: AvatarPresentation.MASCULINE,
    representation: AvatarRepresentation.OTHER,
    slug: 'm-other',
    codename: 'Rastro',
    representationLabel: 'Latino',
    sortOrder: 13,
  },
  {
    presentation: AvatarPresentation.FEMININE,
    representation: AvatarRepresentation.WHITE,
    slug: 'f-white',
    codename: 'Aurora',
    sortOrder: 14,
  },
  {
    presentation: AvatarPresentation.FEMININE,
    representation: AvatarRepresentation.JAPANESE,
    slug: 'f-japanese',
    codename: 'Íris',
    sortOrder: 15,
  },
  {
    presentation: AvatarPresentation.FEMININE,
    representation: AvatarRepresentation.BLACK,
    slug: 'f-black',
    codename: 'Nova',
    sortOrder: 16,
  },
  {
    presentation: AvatarPresentation.FEMININE,
    representation: AvatarRepresentation.OTHER,
    slug: 'f-other',
    codename: 'Vega',
    representationLabel: 'Indígena brasileira',
    sortOrder: 17,
  },
];

type ClassAvatarMatrixConfig = {
  className: string;
  classSlug: string;
  baseName: string;
  existingSlot: string;
};

type CollectionAvatarMatrixConfig = {
  collectionKey: (typeof COMPLETE_AVATAR_COLLECTION_KEYS)[number];
  collectionName: string;
  assetPrefix: string;
  accessType: CosmeticAccessType;
  rarity: Rarity;
  accentColor: string;
  classes: ClassAvatarMatrixConfig[];
};

function slotKey(
  presentation: AvatarPresentation,
  representation: AvatarRepresentation,
) {
  return `${presentation}:${representation}`;
}

export const COSMETIC_AVATAR_MATRIX_COLLECTIONS: CollectionAvatarMatrixConfig[] =
  [
    {
      collectionKey: 'premium-ultimo-abrigo',
      collectionName: 'Último Abrigo',
      assetPrefix: 'ultimo-abrigo',
      accessType: CosmeticAccessType.PREMIUM,
      rarity: Rarity.EPIC,
      accentColor: '#72d94c',
      classes: [
        {
          className: 'Lutador',
          classSlug: 'lutador',
          baseName: 'Vanguarda do Abrigo',
          existingSlot: slotKey(
            AvatarPresentation.MASCULINE,
            AvatarRepresentation.WHITE,
          ),
        },
        {
          className: 'Assassino',
          classSlug: 'assassino',
          baseName: 'Espectro do Perímetro',
          existingSlot: slotKey(
            AvatarPresentation.FEMININE,
            AvatarRepresentation.WHITE,
          ),
        },
        {
          className: 'Atirador',
          classSlug: 'atirador',
          baseName: 'Sentinela da Muralha',
          existingSlot: slotKey(
            AvatarPresentation.MASCULINE,
            AvatarRepresentation.OTHER,
          ),
        },
        {
          className: 'Médico',
          classSlug: 'medico',
          baseName: 'Bio-operador de Campo',
          existingSlot: slotKey(
            AvatarPresentation.FEMININE,
            AvatarRepresentation.OTHER,
          ),
        },
      ],
    },
    {
      collectionKey: 'premium-nucleo-helix',
      collectionName: 'Núcleo Helix',
      assetPrefix: 'helix',
      accessType: CosmeticAccessType.ENTITLEMENT,
      rarity: Rarity.LEGENDARY,
      accentColor: '#65d8e8',
      classes: [
        {
          className: 'Lutador',
          classSlug: 'lutador',
          baseName: 'Baluarte Helix',
          existingSlot: slotKey(
            AvatarPresentation.FEMININE,
            AvatarRepresentation.BLACK,
          ),
        },
        {
          className: 'Assassino',
          classSlug: 'assassino',
          baseName: 'Espectro Helix',
          existingSlot: slotKey(
            AvatarPresentation.FEMININE,
            AvatarRepresentation.JAPANESE,
          ),
        },
        {
          className: 'Atirador',
          classSlug: 'atirador',
          baseName: 'Vidente Helix',
          existingSlot: slotKey(
            AvatarPresentation.MASCULINE,
            AvatarRepresentation.OTHER,
          ),
        },
        {
          className: 'Médico',
          classSlug: 'medico',
          baseName: 'Guardavida Helix',
          existingSlot: slotKey(
            AvatarPresentation.FEMININE,
            AvatarRepresentation.OTHER,
          ),
        },
      ],
    },
    {
      collectionKey: 'premium-protocolo-carmesim',
      collectionName: 'Protocolo Carmesim',
      assetPrefix: 'carmesim',
      accessType: CosmeticAccessType.ENTITLEMENT,
      rarity: Rarity.LEGENDARY,
      accentColor: '#ef5a56',
      classes: [
        {
          className: 'Lutador',
          classSlug: 'lutador',
          baseName: 'Égide Carmesim',
          existingSlot: slotKey(
            AvatarPresentation.MASCULINE,
            AvatarRepresentation.WHITE,
          ),
        },
        {
          className: 'Assassino',
          classSlug: 'assassino',
          baseName: 'Lâmina Rubra',
          existingSlot: slotKey(
            AvatarPresentation.FEMININE,
            AvatarRepresentation.OTHER,
          ),
        },
        {
          className: 'Atirador',
          classSlug: 'atirador',
          baseName: 'Olho do Protocolo',
          existingSlot: slotKey(
            AvatarPresentation.FEMININE,
            AvatarRepresentation.BLACK,
          ),
        },
        {
          className: 'Médico',
          classSlug: 'medico',
          baseName: 'Cirurgião de Ruptura',
          existingSlot: slotKey(
            AvatarPresentation.MASCULINE,
            AvatarRepresentation.JAPANESE,
          ),
        },
      ],
    },
  ];

export const additionalCosmeticAvatarDefinitions: CosmeticSeedData[] =
  COSMETIC_AVATAR_MATRIX_COLLECTIONS.flatMap((collection) =>
    collection.classes.flatMap((classConfig) =>
      AVATAR_SLOTS.filter(
        (slot) =>
          slotKey(slot.presentation, slot.representation) !==
          classConfig.existingSlot,
      ).map((slot) => {
        const assetKey = [
          'avatar',
          collection.assetPrefix,
          classConfig.classSlug,
          slot.slug,
        ].join('-');

        return {
          key: assetKey,
          name: `${classConfig.baseName} ${slot.codename}`,
          description: `Retrato exclusivo de ${collection.collectionName} para ${classConfig.className}.`,
          type: CosmeticType.AVATAR,
          accessType: collection.accessType,
          rarity: collection.rarity,
          collectionKey: collection.collectionKey,
          className: classConfig.className,
          assetKey,
          accentColor: collection.accentColor,
          avatarPresentation: slot.presentation,
          avatarRepresentation: slot.representation,
          representationLabel: slot.representationLabel,
          sortOrder: slot.sortOrder,
        };
      }),
    ),
  );
