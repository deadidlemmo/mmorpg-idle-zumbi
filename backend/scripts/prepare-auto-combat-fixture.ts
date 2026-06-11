import {
  ActivityStatus,
  AutoCombatHuntBatchStatus,
  AutoCombatSessionStatus,
  CharacterStatus,
  IncursionSessionStatus,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUTO_COMBAT_HUNTING_LEVEL_CAP } from '../src/common/config/auto-combat.config';
import { GATHERING_LEVEL_CAP } from '../src/common/config/gathering.config';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
  type PrimaryStats,
} from '../src/common/utils/stats.util';
import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import { equipmentDefinitions } from '../prisma/seed-data/items.seed-data';
import { getAutoCombatPotionForTier } from './auto-combat-potion-balancing';

type FixtureOptions = {
  apply: boolean;
  allowNonLocal: boolean;
  email: string;
  password: string;
  level: number;
  tier: number;
  potions: number;
  gatheringLevel: number;
  huntingLevel: number;
};

type EquipmentSeedItem = (typeof equipmentDefinitions)[number];

type PreparedCharacter = {
  className: string;
  characterName: string;
  characterId: string;
  level: number;
  mapName: string;
  subMapName: string | null;
  equipmentPoints: number;
  maxHp: number;
  potionName: string;
  gatheringLevel: number;
  huntingLevel: number;
  route: string;
};

const DEFAULT_EMAIL = 'autocombat.fixture@local.test';
const DEFAULT_PASSWORD = 'Teste123';
const DEFAULT_LEVEL = 97;
const DEFAULT_POTION_QUANTITY = 9999;

const EQUIPMENT_SLOT_ORDER = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;

const EQUIPMENT_STAT_KEYS = [
  'strengthBonus',
  'vitalityBonus',
  'agilityBonus',
  'precisionBonus',
  'techniqueBonus',
  'willpowerBonus',
] as const satisfies Array<keyof EquipmentSeedItem>;

const GATHERING_ORIGINS = [
  MaterialOrigin.DESMANCHE,
  MaterialOrigin.COLETA,
  MaterialOrigin.CONTENCAO,
  MaterialOrigin.ARSENAL,
  MaterialOrigin.PATRULHA,
  MaterialOrigin.TECNOVARREDURA,
] as const;

const RECOMMENDED_GATHERING_ORIGINS_BY_CLASS: Record<string, MaterialOrigin[]> =
  {
    lutador: [
      MaterialOrigin.DESMANCHE,
      MaterialOrigin.COLETA,
      MaterialOrigin.CONTENCAO,
    ],
    assassino: [
      MaterialOrigin.PATRULHA,
      MaterialOrigin.ARSENAL,
      MaterialOrigin.DESMANCHE,
    ],
    atirador: [
      MaterialOrigin.ARSENAL,
      MaterialOrigin.TECNOVARREDURA,
      MaterialOrigin.PATRULHA,
    ],
    medico: [
      MaterialOrigin.TECNOVARREDURA,
      MaterialOrigin.CONTENCAO,
      MaterialOrigin.COLETA,
    ],
  };

const prisma = new PrismaClient();

function splitArg(arg: string) {
  const separatorIndex = arg.indexOf('=');

  if (separatorIndex < 0) {
    return [arg, undefined] as const;
  }

  return [arg.slice(0, separatorIndex), arg.slice(separatorIndex + 1)] as const;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getTierForLevel(level: number) {
  return Math.max(1, Math.ceil(level / 10));
}

function parseArgs(): FixtureOptions {
  const options: FixtureOptions = {
    apply: false,
    allowNonLocal: false,
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
    level: DEFAULT_LEVEL,
    tier: getTierForLevel(DEFAULT_LEVEL),
    potions: DEFAULT_POTION_QUANTITY,
    gatheringLevel: Math.min(DEFAULT_LEVEL, GATHERING_LEVEL_CAP),
    huntingLevel: Math.min(DEFAULT_LEVEL, AUTO_COMBAT_HUNTING_LEVEL_CAP),
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--allow-non-local') {
      options.allowNonLocal = true;
      continue;
    }

    const [key, value] = splitArg(arg);

    switch (key) {
      case '--email':
        options.email = String(value ?? DEFAULT_EMAIL)
          .trim()
          .toLowerCase();
        break;
      case '--password':
        options.password = String(value ?? DEFAULT_PASSWORD);
        break;
      case '--level':
        options.level = Math.min(
          100,
          parsePositiveInteger(value, DEFAULT_LEVEL),
        );
        options.tier = getTierForLevel(options.level);
        options.gatheringLevel = Math.min(options.level, GATHERING_LEVEL_CAP);
        options.huntingLevel = Math.min(
          options.level,
          AUTO_COMBAT_HUNTING_LEVEL_CAP,
        );
        break;
      case '--tier':
        options.tier = Math.min(10, parsePositiveInteger(value, options.tier));
        break;
      case '--potions':
        options.potions = parsePositiveInteger(value, DEFAULT_POTION_QUANTITY);
        break;
      case '--gathering-level':
        options.gatheringLevel = Math.min(
          GATHERING_LEVEL_CAP,
          parsePositiveInteger(value, options.gatheringLevel),
        );
        break;
      case '--hunting-level':
        options.huntingLevel = Math.min(
          AUTO_COMBAT_HUNTING_LEVEL_CAP,
          parsePositiveInteger(value, options.huntingLevel),
        );
        break;
      default:
        break;
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

function normalizeClassKey(value?: string | null) {
  return String(value ?? '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function displayClassName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getEquipmentItemStatsTotal(item: EquipmentSeedItem) {
  return EQUIPMENT_STAT_KEYS.reduce(
    (sum, stat) => sum + Math.max(0, Number(item[stat]) || 0),
    0,
  );
}

function getSeedEquipmentItems(className: string, tier: number) {
  const classKey = normalizeClassKey(className);
  const classItems = equipmentDefinitions.filter(
    (item) =>
      normalizeClassKey(item.className) === classKey &&
      Math.floor(Number(item.tier) || 0) === tier,
  );

  return EQUIPMENT_SLOT_ORDER.flatMap((slot) => {
    const selected = classItems
      .filter((item) => item.slot === slot)
      .sort(
        (left, right) =>
          getEquipmentItemStatsTotal(right) - getEquipmentItemStatsTotal(left),
      )[0];

    return selected ? [selected] : [];
  });
}

function getRecommendedGatheringOrigins(className: string) {
  return (
    RECOMMENDED_GATHERING_ORIGINS_BY_CLASS[normalizeClassKey(className)] ?? []
  );
}

function buildGatheringSkills(className: string, gatheringLevel: number) {
  const recommendedOrigins = new Set(getRecommendedGatheringOrigins(className));

  return GATHERING_ORIGINS.map((origin) => ({
    origin,
    level: recommendedOrigins.has(origin) ? gatheringLevel : 1,
    xp: 0,
    totalXp: 0,
  }));
}

function getSlotField(slot: ItemSlot) {
  switch (slot) {
    case ItemSlot.MAIN_HAND:
      return 'mainHandId';
    case ItemSlot.OFF_HAND:
      return 'offHandId';
    case ItemSlot.HEAD:
      return 'headId';
    case ItemSlot.ARMOR:
      return 'armorId';
    case ItemSlot.PANTS:
      return 'pantsId';
    case ItemSlot.BOOTS:
      return 'bootsId';
    default:
      throw new Error(`Slot de equipamento invalido para fixture: ${slot}.`);
  }
}

function buildEquipmentUpdateData(
  items: Array<{ id: string; slot: ItemSlot }>,
) {
  const data = {
    mainHandId: null as string | null,
    offHandId: null as string | null,
    headId: null as string | null,
    armorId: null as string | null,
    pantsId: null as string | null,
    bootsId: null as string | null,
  };

  for (const item of items) {
    data[getSlotField(item.slot)] = item.id;
  }

  return data;
}

function getCharacterName(className: string) {
  return `AC V42 ${displayClassName(className)}`;
}

async function stopFixtureCharacterActivities(characterId: string, now: Date) {
  await prisma.autoCombatSession.updateMany({
    where: {
      characterId,
      status: AutoCombatSessionStatus.ACTIVE,
    },
    data: {
      status: AutoCombatSessionStatus.STOPPED,
      finishedAt: now,
    },
  });
  await prisma.autoCombatHuntBatch.updateMany({
    where: {
      characterId,
      status: {
        in: [
          AutoCombatHuntBatchStatus.HUNTING,
          AutoCombatHuntBatchStatus.READY,
        ],
      },
    },
    data: {
      status: AutoCombatHuntBatchStatus.CANCELLED,
      stoppedAt: now,
      cancelledAt: now,
    },
  });
  await prisma.gatheringSession.updateMany({
    where: {
      characterId,
      status: ActivityStatus.ACTIVE,
    },
    data: {
      status: ActivityStatus.STOPPED,
    },
  });
  await prisma.craftingSession.updateMany({
    where: {
      characterId,
      status: ActivityStatus.ACTIVE,
    },
    data: {
      status: ActivityStatus.STOPPED,
      completedAt: now,
    },
  });
  await prisma.characterIncursionSession.updateMany({
    where: {
      characterId,
      status: IncursionSessionStatus.ACTIVE,
    },
    data: {
      status: IncursionSessionStatus.FAILED,
      completedAt: now,
    },
  });
}

async function prepareCharacter(params: {
  userId: string;
  className: string;
  level: number;
  tier: number;
  gatheringLevel: number;
  huntingLevel: number;
  potions: number;
  apply: boolean;
}) {
  const classKey = normalizeClassKey(params.className);
  const classDefinition =
    classDefinitions.find(
      (definition) => normalizeClassKey(definition.name) === classKey,
    ) ?? null;
  const gameClass = await prisma.gameClass.findFirst({
    where: {
      name: {
        equals: params.className,
        mode: 'insensitive',
      },
    },
  });
  const map = await prisma.gameMap.findFirst({
    where: {
      tier: params.tier,
    },
    orderBy: [
      {
        minLevel: 'asc',
      },
      {
        name: 'asc',
      },
    ],
  });

  if (!classDefinition || !gameClass) {
    throw new Error(`Classe nao encontrada para fixture: ${params.className}.`);
  }

  if (!map) {
    throw new Error(`Mapa de tier ${params.tier} nao encontrado.`);
  }

  const subMap = await prisma.subMap.findFirst({
    where: {
      mapId: map.id,
      minLevel: {
        lte: params.level,
      },
      maxLevel: {
        gte: params.level,
      },
    },
    orderBy: [
      {
        minLevel: 'asc',
      },
      {
        name: 'asc',
      },
    ],
  });
  const seedEquipment = getSeedEquipmentItems(params.className, params.tier);

  if (seedEquipment.length !== EQUIPMENT_SLOT_ORDER.length) {
    throw new Error(
      `Fixture esperava ${EQUIPMENT_SLOT_ORDER.length} itens T${params.tier} para ${params.className}, encontrou ${seedEquipment.length}.`,
    );
  }

  const equipmentItems = await prisma.item.findMany({
    where: {
      name: {
        in: seedEquipment.map((item) => item.name),
      },
    },
  });
  const missingEquipmentNames = seedEquipment
    .map((item) => item.name)
    .filter((name) => !equipmentItems.some((item) => item.name === name));

  if (missingEquipmentNames.length > 0) {
    throw new Error(
      `Itens de equipamento ausentes no banco: ${missingEquipmentNames.join(', ')}.`,
    );
  }

  const potionDefinition = getAutoCombatPotionForTier(params.tier);
  const potionItem = await prisma.item.findUnique({
    where: {
      name: potionDefinition.name,
    },
  });

  if (!potionItem) {
    throw new Error(
      `Pocao de tier "${potionDefinition.name}" nao encontrada. Rode o seed.`,
    );
  }

  const gatheringSkills = buildGatheringSkills(
    params.className,
    params.gatheringLevel,
  );
  const gatheringBonus: PrimaryStats =
    calculateGatheringPrimaryBonus(gatheringSkills);
  const stats = calculateFullStats(
    gameClass,
    equipmentItems,
    params.level,
    gatheringBonus,
  );
  const maxHp = stats.derivedCombatStats.maxHp;
  const characterName = getCharacterName(params.className);
  const now = new Date();
  let character = await prisma.character.findUnique({
    where: {
      userId_name: {
        userId: params.userId,
        name: characterName,
      },
    },
  });

  if (params.apply) {
    character = await prisma.character.upsert({
      where: {
        userId_name: {
          userId: params.userId,
          name: characterName,
        },
      },
      create: {
        name: characterName,
        userId: params.userId,
        classId: gameClass.id,
        mapId: map.id,
        status: CharacterStatus.ACTIVE,
        level: params.level,
        xp: 0,
        gold: 999999,
        cash: 0,
        currentHp: maxHp,
        maxHp,
        avatarKey: `${classKey}-01`,
        deletedAt: null,
      },
      update: {
        classId: gameClass.id,
        mapId: map.id,
        status: CharacterStatus.ACTIVE,
        level: params.level,
        xp: 0,
        gold: 999999,
        cash: 0,
        currentHp: maxHp,
        maxHp,
        avatarKey: `${classKey}-01`,
        deletedAt: null,
        infirmaryStartedAt: null,
        infirmaryEndsAt: null,
      },
    });

    await stopFixtureCharacterActivities(character.id, now);

    await prisma.equipment.upsert({
      where: {
        characterId: character.id,
      },
      create: {
        characterId: character.id,
        ...buildEquipmentUpdateData(equipmentItems),
      },
      update: buildEquipmentUpdateData(equipmentItems),
    });

    for (const skill of gatheringSkills) {
      await prisma.characterGatheringSkill.upsert({
        where: {
          characterId_origin: {
            characterId: character.id,
            origin: skill.origin,
          },
        },
        create: {
          characterId: character.id,
          origin: skill.origin,
          level: skill.level,
          xp: 0,
          totalXp: 0,
        },
        update: {
          level: skill.level,
          xp: 0,
          totalXp: 0,
        },
      });
    }

    await prisma.characterHuntingSkill.upsert({
      where: {
        characterId: character.id,
      },
      create: {
        characterId: character.id,
        level: params.huntingLevel,
        xp: 0,
        totalXp: 0,
      },
      update: {
        level: params.huntingLevel,
        xp: 0,
        totalXp: 0,
      },
    });

    await prisma.inventoryItem.upsert({
      where: {
        characterId_itemId: {
          characterId: character.id,
          itemId: potionItem.id,
        },
      },
      create: {
        characterId: character.id,
        itemId: potionItem.id,
        type: InventoryItemType.CONSUMABLE,
        quantity: params.potions,
      },
      update: {
        type: InventoryItemType.CONSUMABLE,
        quantity: params.potions,
      },
    });

    await prisma.characterPotionConfig.upsert({
      where: {
        characterId: character.id,
      },
      create: {
        characterId: character.id,
        potionItemId: potionItem.id,
        enabled: true,
        hpThresholdPercent: 35,
        useInManualCombat: true,
        useInAutoCombat: true,
      },
      update: {
        potionItemId: potionItem.id,
        enabled: true,
        hpThresholdPercent: 35,
        useInManualCombat: true,
        useInAutoCombat: true,
      },
    });
  }

  return {
    className: displayClassName(params.className),
    characterName,
    characterId: character?.id ?? '(sera criado com --apply)',
    level: params.level,
    mapName: map.name,
    subMapName: subMap?.name ?? null,
    equipmentPoints: equipmentItems.reduce(
      (sum, item) =>
        sum +
        Number(item.strengthBonus) +
        Number(item.vitalityBonus) +
        Number(item.agilityBonus) +
        Number(item.precisionBonus) +
        Number(item.techniqueBonus) +
        Number(item.willpowerBonus),
      0,
    ),
    maxHp,
    potionName: potionItem.name,
    gatheringLevel: params.gatheringLevel,
    huntingLevel: params.huntingLevel,
    route: character?.id
      ? `/dashboard/${character.id}/auto-combat`
      : '(disponivel apos --apply)',
  } satisfies PreparedCharacter;
}

async function main() {
  loadBackendEnv();

  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL nao definido. Configure backend/.env ou a variavel de ambiente antes de preparar o fixture.',
    );
    process.exitCode = 1;
    return;
  }

  const options = parseArgs();
  const isLocalDatabase = isLocalDatabaseUrl(process.env.DATABASE_URL);

  if (options.apply && !isLocalDatabase && !options.allowNonLocal) {
    console.error(
      'Recusado: --apply so roda automaticamente em DATABASE_URL local. Use --allow-non-local apenas se voce tiver certeza.',
    );
    process.exitCode = 1;
    return;
  }

  const playableClassNames = classDefinitions.map(
    (definition) => definition.name,
  );
  const passwordHash = options.apply
    ? await bcrypt.hash(options.password, 10)
    : null;
  const user = options.apply
    ? await prisma.user.upsert({
        where: {
          email: options.email,
        },
        create: {
          email: options.email,
          passwordHash: passwordHash as string,
          role: UserRole.PLAYER,
          premiumUntil: null,
        },
        update: {
          passwordHash: passwordHash as string,
          role: UserRole.PLAYER,
          premiumUntil: null,
        },
      })
    : await prisma.user.findUnique({
        where: {
          email: options.email,
        },
      });
  const userId = user?.id ?? '(sera criado com --apply)';
  const preparedCharacters: PreparedCharacter[] = [];

  for (const className of playableClassNames) {
    preparedCharacters.push(
      await prepareCharacter({
        userId: user?.id ?? 'dry-run-user-id',
        className,
        level: options.level,
        tier: options.tier,
        gatheringLevel: options.gatheringLevel,
        huntingLevel: options.huntingLevel,
        potions: options.potions,
        apply: options.apply,
      }),
    );
  }

  console.log('Auto-combat fixture');
  console.log(
    `Mode: ${options.apply ? 'apply' : 'dry-run'}${isLocalDatabase ? ' / local database' : ' / non-local database'}`,
  );
  console.log(`Account: ${options.email}`);
  console.log(`Password: ${options.password}`);
  console.log(`User id: ${userId}`);
  console.log(`Level: ${options.level}`);
  console.log(`Equipment tier: ${options.tier}`);
  console.log(`Recommended gathering level: ${options.gatheringLevel}`);
  console.log(`Hunting level: ${options.huntingLevel}`);
  console.log(`Potion quantity per character: ${options.potions}`);
  console.log(
    'Premium: disabled for this fixture, so XP can be compared with the non-premium simulator.',
  );
  console.log(
    options.apply
      ? 'Note: fixture created/updated in the configured database.'
      : 'Note: dry-run does not write. Use --apply to create/update the fixture.',
  );
  console.log('');
  console.table(
    preparedCharacters.map((character) => ({
      class: character.className,
      name: character.characterName,
      id: character.characterId,
      level: character.level,
      map: character.mapName,
      submap: character.subMapName,
      equipment_points: character.equipmentPoints,
      hp: character.maxHp,
      potion: character.potionName,
      gathering_level: character.gatheringLevel,
      hunting_level: character.huntingLevel,
      route: character.route,
    })),
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
