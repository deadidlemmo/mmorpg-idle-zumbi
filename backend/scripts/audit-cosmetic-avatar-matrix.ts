import {
  AvatarPresentation,
  AvatarRepresentation,
  CosmeticAccessType,
  CosmeticType,
} from '@prisma/client';
import {
  COMPLETE_AVATAR_COLLECTION_KEYS,
  REQUIRED_AVATAR_PRESENTATIONS,
  REQUIRED_AVATAR_REPRESENTATIONS,
} from '../prisma/seed-data/cosmetic-avatar-matrix.seed-data';
import {
  cosmeticCollectionDefinitions,
  cosmeticDefinitions,
  retiredCosmeticCollectionKeys,
} from '../prisma/seed-data/cosmetics.seed-data';

const REQUIRED_CLASSES = ['Lutador', 'Assassino', 'Atirador', 'Médico'];
const expectedAccessByCollection = new Map<string, CosmeticAccessType>([
  ['premium-ultimo-abrigo', CosmeticAccessType.PREMIUM],
  ['premium-nucleo-helix', CosmeticAccessType.ENTITLEMENT],
  ['premium-protocolo-carmesim', CosmeticAccessType.ENTITLEMENT],
]);

const failures: string[] = [];
const assetKeys = new Set<string>();
const activeCollectionKeys = new Set(
  cosmeticCollectionDefinitions.map((collection) => collection.key),
);

if (activeCollectionKeys.size !== expectedAccessByCollection.size) {
  failures.push(
    `catálogo ativo possui ${activeCollectionKeys.size} coleções, esperado ${expectedAccessByCollection.size}.`,
  );
}

for (const collectionKey of expectedAccessByCollection.keys()) {
  if (!activeCollectionKeys.has(collectionKey)) {
    failures.push(`catálogo ativo não contém ${collectionKey}.`);
  }
}

for (const collectionKey of retiredCosmeticCollectionKeys) {
  if (activeCollectionKeys.has(collectionKey)) {
    failures.push(`coleção aposentada continua ativa: ${collectionKey}.`);
  }
  if (
    cosmeticDefinitions.some((item) => item.collectionKey === collectionKey)
  ) {
    failures.push(
      `coleção aposentada ainda possui itens no seed: ${collectionKey}.`,
    );
  }
}

for (const collectionKey of COMPLETE_AVATAR_COLLECTION_KEYS) {
  const collectionItems = cosmeticDefinitions.filter(
    (item) => item.collectionKey === collectionKey,
  );
  const expectedAccessType = expectedAccessByCollection.get(collectionKey);

  for (const item of collectionItems) {
    if (item.accessType !== expectedAccessType) {
      failures.push(
        `${item.key}: acesso ${item.accessType}, esperado ${expectedAccessType}.`,
      );
    }
  }

  for (const className of REQUIRED_CLASSES) {
    const avatars = collectionItems.filter(
      (item) =>
        item.type === CosmeticType.AVATAR && item.className === className,
    );
    const slots = new Set(
      avatars.map(
        (item) =>
          `${item.avatarPresentation ?? 'NULL'}:${item.avatarRepresentation ?? 'NULL'}`,
      ),
    );

    if (avatars.length !== 8) {
      failures.push(
        `${collectionKey}/${className}: ${avatars.length} avatares, esperado 8.`,
      );
    }

    for (const presentation of REQUIRED_AVATAR_PRESENTATIONS) {
      for (const representation of REQUIRED_AVATAR_REPRESENTATIONS) {
        const slot = `${presentation}:${representation}`;
        if (!slots.has(slot)) {
          failures.push(`${collectionKey}/${className}: falta ${slot}.`);
        }
      }
    }

    for (const avatar of avatars) {
      if (!avatar.assetKey) {
        failures.push(`${avatar.key}: avatar sem assetKey.`);
        continue;
      }
      if (assetKeys.has(avatar.assetKey)) {
        failures.push(`${avatar.key}: assetKey duplicado ${avatar.assetKey}.`);
      }
      assetKeys.add(avatar.assetKey);

      if (
        avatar.avatarRepresentation === AvatarRepresentation.OTHER &&
        !avatar.representationLabel
      ) {
        failures.push(`${avatar.key}: OTHER sem representationLabel.`);
      }
      if (
        avatar.avatarPresentation !== AvatarPresentation.MASCULINE &&
        avatar.avatarPresentation !== AvatarPresentation.FEMININE
      ) {
        failures.push(`${avatar.key}: apresentação inválida.`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Auditoria da matriz de avatares falhou:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Matriz cosmética válida: ${assetKeys.size} avatares em ${COMPLETE_AVATAR_COLLECTION_KEYS.length} coleções.`,
);
