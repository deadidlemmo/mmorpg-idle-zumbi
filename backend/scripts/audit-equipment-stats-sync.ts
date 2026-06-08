import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  equipmentDefinitions,
  starterEquipmentDefinitions,
} from '../prisma/seed-data/items.seed-data';

type SeedEquipmentItem = (typeof equipmentDefinitions)[number];

type ComparedField =
  | 'className'
  | 'tier'
  | 'rarity'
  | 'slot'
  | 'family'
  | 'strengthBonus'
  | 'vitalityBonus'
  | 'agilityBonus'
  | 'precisionBonus'
  | 'techniqueBonus'
  | 'willpowerBonus';

type AuditOptions = {
  strict: boolean;
  limit: number;
  includeStarter: boolean;
};

type Mismatch = {
  item: string;
  field: ComparedField;
  expected: string | number;
  actual: string | number | null;
};

const DEFAULT_LIMIT = 20;

const COMPARED_FIELDS: ComparedField[] = [
  'className',
  'tier',
  'rarity',
  'slot',
  'family',
  'strengthBonus',
  'vitalityBonus',
  'agilityBonus',
  'precisionBonus',
  'techniqueBonus',
  'willpowerBonus',
];

const prisma = new PrismaClient();

function parseNonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(): AuditOptions {
  const options: AuditOptions = {
    strict: false,
    limit: DEFAULT_LIMIT,
    includeStarter: true,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    if (arg === '--no-starter') {
      options.includeStarter = false;
      continue;
    }

    const [key, value] = arg.split('=');

    if (key === '--limit') {
      options.limit = parseNonNegativeInteger(value, DEFAULT_LIMIT);
    }
  }

  return options;
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadBackendEnv() {
  const envPath = resolve(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    process.env[key] ??= unquoteEnvValue(rawValue);
  }
}

function buildExpectedEquipment(includeStarter: boolean) {
  const items = includeStarter
    ? [...starterEquipmentDefinitions, ...equipmentDefinitions]
    : [...equipmentDefinitions];
  const byName = new Map<string, SeedEquipmentItem>();
  const duplicates: string[] = [];

  for (const item of items) {
    if (byName.has(item.name)) {
      duplicates.push(item.name);
      continue;
    }

    byName.set(item.name, item);
  }

  return {
    byName,
    duplicates,
  };
}

function getExpectedValue(item: SeedEquipmentItem, field: ComparedField) {
  if (field === 'className') {
    return item.className;
  }

  if (
    field === 'strengthBonus' ||
    field === 'vitalityBonus' ||
    field === 'agilityBonus' ||
    field === 'precisionBonus' ||
    field === 'techniqueBonus' ||
    field === 'willpowerBonus'
  ) {
    return item[field] ?? 0;
  }

  return item[field];
}

function getActualValue(
  item: Awaited<ReturnType<typeof fetchDatabaseEquipment>>[number],
  field: ComparedField,
) {
  if (field === 'className') {
    return item.class?.name ?? null;
  }

  return item[field];
}

async function fetchDatabaseEquipment(names: string[]) {
  return prisma.item.findMany({
    where: {
      name: {
        in: names,
      },
    },
    select: {
      name: true,
      tier: true,
      rarity: true,
      slot: true,
      family: true,
      strengthBonus: true,
      vitalityBonus: true,
      agilityBonus: true,
      precisionBonus: true,
      techniqueBonus: true,
      willpowerBonus: true,
      class: {
        select: {
          name: true,
        },
      },
    },
  });
}

function compareEquipment(params: {
  expectedByName: Map<string, SeedEquipmentItem>;
  databaseItems: Awaited<ReturnType<typeof fetchDatabaseEquipment>>;
}) {
  const databaseByName = new Map(
    params.databaseItems.map((item) => [item.name, item]),
  );
  const missing = [...params.expectedByName.keys()].filter(
    (name) => !databaseByName.has(name),
  );
  const mismatches: Mismatch[] = [];

  for (const [name, expected] of params.expectedByName) {
    const actual = databaseByName.get(name);

    if (!actual) {
      continue;
    }

    for (const field of COMPARED_FIELDS) {
      const expectedValue = getExpectedValue(expected, field);
      const actualValue = getActualValue(actual, field);

      if (String(expectedValue) !== String(actualValue)) {
        mismatches.push({
          item: name,
          field,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }
  }

  return {
    missing,
    mismatches,
  };
}

async function main() {
  loadBackendEnv();

  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL nao definido. Configure backend/.env ou a variavel de ambiente antes de auditar o banco.',
    );
    process.exitCode = 1;
    return;
  }

  const options = parseArgs();
  const expected = buildExpectedEquipment(options.includeStarter);
  const databaseItems = await fetchDatabaseEquipment([
    ...expected.byName.keys(),
  ]);
  const result = compareEquipment({
    expectedByName: expected.byName,
    databaseItems,
  });
  const hasProblems =
    expected.duplicates.length > 0 ||
    result.missing.length > 0 ||
    result.mismatches.length > 0;

  console.log('Equipment stats sync audit');
  console.log(
    'Note: dry-run only. This script reads the database and does not update items.',
  );
  console.log(`Starter equipment included: ${options.includeStarter}`);
  console.log(`Expected seed equipment: ${expected.byName.size}`);
  console.log(`Database rows found: ${databaseItems.length}`);
  console.log(`Duplicate seed names: ${expected.duplicates.length}`);
  console.log(`Missing database items: ${result.missing.length}`);
  console.log(`Mismatched fields: ${result.mismatches.length}`);

  if (expected.duplicates.length > 0 && options.limit > 0) {
    console.log(`\nFirst ${options.limit} duplicate seed names`);
    console.table(
      expected.duplicates.slice(0, options.limit).map((name) => ({ name })),
    );
  }

  if (result.missing.length > 0 && options.limit > 0) {
    console.log(`\nFirst ${options.limit} missing database items`);
    console.table(
      result.missing.slice(0, options.limit).map((name) => ({ name })),
    );
  }

  if (result.mismatches.length > 0 && options.limit > 0) {
    console.log(`\nFirst ${options.limit} mismatched fields`);
    console.table(result.mismatches.slice(0, options.limit));
  }

  console.log(`\nStatus: ${hasProblems ? 'out of sync' : 'in sync'}`);

  if (options.strict && hasProblems) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
