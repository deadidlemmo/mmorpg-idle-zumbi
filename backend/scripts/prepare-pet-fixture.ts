import 'dotenv/config';

import {
  CharacterPetStatus,
  EconomyCurrency,
  InventoryItemType,
  PrismaClient,
} from '@prisma/client';

type FixtureOptions = {
  apply: boolean;
  allowNonLocal: boolean;
  email: string;
  characterName: string;
  characterId: string | null;
  cocoonsPerPet: number;
  fragmentsPerTier: number;
  gold: number;
};

const DEFAULT_EMAIL = 'autocombat.fixture@local.test';
const DEFAULT_CHARACTER_NAME = 'AC V42 Lutador';
const DEFAULT_COCOONS_PER_PET = 3;
const DEFAULT_FRAGMENTS_PER_TIER = 999;
const DEFAULT_GOLD = 999_999;
const EXPECTED_PET_DEFINITIONS = 40;
const EXPECTED_SPECIALIZATIONS = 8;

const prisma = new PrismaClient();

function splitArg(argument: string) {
  const separatorIndex = argument.indexOf('=');
  return separatorIndex < 0
    ? ([argument, undefined] as const)
    : ([
        argument.slice(0, separatorIndex),
        argument.slice(separatorIndex + 1),
      ] as const);
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(): FixtureOptions {
  const options: FixtureOptions = {
    apply: false,
    allowNonLocal: false,
    email: DEFAULT_EMAIL,
    characterName: DEFAULT_CHARACTER_NAME,
    characterId: null,
    cocoonsPerPet: DEFAULT_COCOONS_PER_PET,
    fragmentsPerTier: DEFAULT_FRAGMENTS_PER_TIER,
    gold: DEFAULT_GOLD,
  };

  for (const argument of process.argv.slice(2)) {
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (argument === '--allow-non-local') {
      options.allowNonLocal = true;
      continue;
    }

    const [key, value] = splitArg(argument);
    switch (key) {
      case '--email':
        options.email = String(value ?? DEFAULT_EMAIL).trim().toLowerCase();
        break;
      case '--character':
        options.characterName = String(value ?? DEFAULT_CHARACTER_NAME).trim();
        break;
      case '--character-id':
        options.characterId = String(value ?? '').trim() || null;
        break;
      case '--cocoons':
        options.cocoonsPerPet = parsePositiveInteger(
          value,
          DEFAULT_COCOONS_PER_PET,
        );
        break;
      case '--fragments':
        options.fragmentsPerTier = parsePositiveInteger(
          value,
          DEFAULT_FRAGMENTS_PER_TIER,
        );
        break;
      case '--gold':
        options.gold = parsePositiveInteger(value, DEFAULT_GOLD);
        break;
      default:
        break;
    }
  }

  return options;
}

function isLocalDatabaseUrl(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}

async function main() {
  const options = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL nao definido no backend/.env.');
  }

  const isLocalDatabase = isLocalDatabaseUrl(databaseUrl);
  if (options.apply && !isLocalDatabase && !options.allowNonLocal) {
    throw new Error(
      'Recusado: --apply so pode alterar um DATABASE_URL local. Nao use esta fixture em producao.',
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: options.email },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(
      `Conta ${options.email} nao encontrada. Prepare primeiro a fixture de auto-combate.`,
    );
  }

  const character = await prisma.character.findFirst({
    where: {
      userId: user.id,
      deletedAt: null,
      ...(options.characterId
        ? { id: options.characterId }
        : { name: options.characterName }),
    },
    select: { id: true, name: true, equippedPetId: true },
  });
  if (!character) {
    throw new Error(
      `Personagem ${options.characterId ?? options.characterName} nao encontrado na conta ${user.email}.`,
    );
  }

  const definitions = await prisma.petDefinition.findMany({
    where: { isActive: true, tier: { gte: 1, lte: 5 } },
    include: { cocoonItem: { select: { id: true, name: true } } },
    orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }],
  });
  const specializationCount = new Set(
    definitions.map((definition) => definition.specialization),
  ).size;
  if (
    definitions.length !== EXPECTED_PET_DEFINITIONS ||
    specializationCount !== EXPECTED_SPECIALIZATIONS
  ) {
    throw new Error(
      `Catalogo incompleto: esperados ${EXPECTED_PET_DEFINITIONS} pets e ${EXPECTED_SPECIALIZATIONS} especializacoes; encontrados ${definitions.length} e ${specializationCount}.`,
    );
  }

  if (options.apply) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: character.id },
        data: { gold: options.gold },
      });

      for (const tier of [1, 2, 3, 4, 5]) {
        await tx.characterEconomyBalance.upsert({
          where: {
            characterId_currency_tier: {
              characterId: character.id,
              currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
              tier,
            },
          },
          create: {
            characterId: character.id,
            currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
            tier,
            balance: options.fragmentsPerTier,
          },
          update: { balance: options.fragmentsPerTier },
        });
      }

      for (const definition of definitions) {
        await tx.characterPet.upsert({
          where: {
            characterId_petDefinitionId: {
              characterId: character.id,
              petDefinitionId: definition.id,
            },
          },
          create: {
            characterId: character.id,
            petDefinitionId: definition.id,
            status: CharacterPetStatus.AVAILABLE,
            incubationRequestId: `pet-fixture:${character.id}:${definition.key}`,
            incubationStartedAt: now,
            incubationEndsAt: now,
            hatchedAt: now,
          },
          update: {
            status: CharacterPetStatus.AVAILABLE,
            incubationEndsAt: now,
            hatchedAt: now,
          },
        });
        await tx.inventoryItem.upsert({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: definition.cocoonItemId,
            },
          },
          create: {
            characterId: character.id,
            itemId: definition.cocoonItemId,
            quantity: options.cocoonsPerPet,
            type: InventoryItemType.MATERIAL,
          },
          update: {
            quantity: options.cocoonsPerPet,
            type: InventoryItemType.MATERIAL,
          },
        });
      }
    });
  }

  console.log('Fixture local de pets');
  console.log(`Modo: ${options.apply ? 'aplicado' : 'dry-run'}`);
  console.log(`Banco local: ${isLocalDatabase ? 'sim' : 'nao'}`);
  console.log(`Conta: ${user.email}`);
  console.log(`Personagem: ${character.name} (${character.id})`);
  console.log(`Pets disponiveis: ${definitions.length}`);
  console.log(`Especializacoes: ${specializationCount}`);
  console.log(`Casulos por pet: ${options.cocoonsPerPet}`);
  console.log(`Fragmentos por tier: ${options.fragmentsPerTier}`);
  console.log(`Gold: ${options.gold}`);
  console.log(
    options.apply
      ? `Rota: /dashboard/${character.id}/resources?tab=incubator&tier=1`
      : 'Nenhuma alteracao foi feita. Execute novamente com --apply.',
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
