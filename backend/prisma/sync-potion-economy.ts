import { ItemSlot, Prisma, PrismaClient, type Item } from '@prisma/client';
import type { ConsumableSeedData } from './seed-types';
import { consumableDefinitions } from './seed-data/consumables.seed-data';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

const POTION_FIELDS = [
  'description',
  'tier',
  'rarity',
  'family',
  'healFlat',
  'healPercent',
  'minTier',
  'maxTier',
  'isSellable',
  'isTradable',
  'isCraftable',
] as const;

type PotionField = (typeof POTION_FIELDS)[number];
type PotionSnapshot = Pick<Item, PotionField>;

type PotionChange = {
  name: string;
  action: 'CREATE' | 'UPDATE';
  changedFields: PotionField[];
  current: PotionSnapshot | null;
  next: PotionSnapshot;
};

function toPotionSnapshot(definition: ConsumableSeedData): PotionSnapshot {
  return {
    description: definition.description,
    tier: definition.tier,
    rarity: definition.rarity,
    family: definition.family,
    healFlat: definition.healFlat,
    healPercent: definition.healPercent,
    minTier: definition.minTier,
    maxTier: definition.maxTier,
    isSellable: definition.isSellable ?? true,
    isTradable: definition.isTradable ?? true,
    isCraftable: definition.isCraftable ?? false,
  };
}

function toPotionItemData(definition: ConsumableSeedData) {
  return {
    ...toPotionSnapshot(definition),
    name: definition.name,
    slot: ItemSlot.CONSUMABLE,
    classId: null,
    mapId: null,
    materialOrigin: null,
    materialSlot: null,
    isGatheringMaterial: false,
    requiredGatheringLevel: 1,
    gatheringXpPerUnit: 0,
    baseGatheringRatePerHour: null,
    strengthBonus: 0,
    vitalityBonus: 0,
    agilityBonus: 0,
    precisionBonus: 0,
    techniqueBonus: 0,
    willpowerBonus: 0,
    usableInCombat: true,
    usableOutOfCombat: true,
    baseItemId: null,
    enhancementLevel: 0,
  } satisfies Prisma.ItemUncheckedCreateInput;
}

function getChangedFields(
  current: PotionSnapshot,
  next: PotionSnapshot,
): PotionField[] {
  return POTION_FIELDS.filter((field) => current[field] !== next[field]);
}

async function buildChangePlan() {
  const currentItems = await prisma.item.findMany({
    where: {
      name: { in: consumableDefinitions.map((definition) => definition.name) },
    },
  });
  const currentByName = new Map(currentItems.map((item) => [item.name, item]));

  return consumableDefinitions.flatMap((definition): PotionChange[] => {
    const current = currentByName.get(definition.name);
    const next = toPotionSnapshot(definition);

    if (!current) {
      return [
        {
          name: definition.name,
          action: 'CREATE',
          changedFields: [...POTION_FIELDS],
          current: null,
          next,
        },
      ];
    }

    const currentSnapshot = Object.fromEntries(
      POTION_FIELDS.map((field) => [field, current[field]]),
    ) as PotionSnapshot;
    const changedFields = getChangedFields(currentSnapshot, next);

    return changedFields.length > 0
      ? [
          {
            name: definition.name,
            action: 'UPDATE',
            changedFields,
            current: currentSnapshot,
            next,
          },
        ]
      : [];
  });
}

async function main() {
  const changes = await buildChangePlan();

  console.log('Sincronizacao seletiva da economia de pocoes');
  console.table({
    pocoesCanonicas: consumableDefinitions.length,
    pocoesComAlteracao: changes.length,
    modo: shouldApply ? 'APLICAR' : 'SIMULACAO',
  });

  if (changes.length > 0) {
    console.table(
      changes.map((change) => ({
        acao: change.action,
        pocao: change.name,
        campos: change.changedFields.join(', '),
        curaAtual: change.current
          ? `${change.current.healFlat} + ${change.current.healPercent}%`
          : '-',
        curaNova: `${change.next.healFlat} + ${change.next.healPercent}%`,
        faixaNova: `T${change.next.minTier}-T${change.next.maxTier}`,
      })),
    );
  }

  if (!shouldApply) {
    console.log(
      'Modo simulacao: nenhum dado foi alterado. Execute com --apply para confirmar.',
    );
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const definition of consumableDefinitions) {
        const itemData = toPotionItemData(definition);

        await tx.item.upsert({
          where: { name: definition.name },
          create: itemData,
          update: itemData,
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.log(
    `${changes.length} pocoes sincronizadas em uma unica transacao. Inventarios, Gold e configuracoes nao foram alterados.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
