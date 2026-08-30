import {
  AutoCombatHuntBatchStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { io, type Socket } from 'socket.io-client';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
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

type LoadTestOptions = {
  users: number;
  durationSeconds: number;
  warmupSeconds: number;
  sampleIntervalMs: number;
  baseUrl: string;
  outputJson: string;
  metricsToken: string;
  battleQuantity: number;
  fixtureConcurrency: number;
  rampBatchSize: number;
  rampDelayMs: number;
};

type EquipmentSeedItem = (typeof equipmentDefinitions)[number];

type FixtureTemplate = {
  className: string;
  classId: string;
  tier: number;
  level: number;
  mapId: string;
  mapName: string;
  subMapId: string;
  subMapName: string;
  encounterId: string;
  mobId: string;
  mobName: string;
  encounterWeight: number;
  maxHp: number;
  equipmentData: ReturnType<typeof buildEquipmentUpdateData>;
  gatheringSkills: ReturnType<typeof buildGatheringSkills>;
  huntingLevel: number;
  potionItemId: string;
};

type VirtualUser = {
  index: number;
  userId: string;
  email: string;
  token: string;
  characterId: string;
  characterName: string;
  className: string;
  tier: number;
  level: number;
  encounterId: string;
  mobId: string;
  mobName: string;
};

type SocketState = {
  virtualUser: VirtualUser;
  socket: Socket;
  initialConnectedAtMs: number | null;
  initialJoinedAtMs: number | null;
  forcedReconnectAtMs: number | null;
  transportReconnectedAtMs: number | null;
  roomRejoinedAtMs: number | null;
  reconciliationFinishedAtMs: number | null;
  reconciliationSucceeded: boolean;
  eventsReceived: number;
  connectErrors: string[];
  socketErrors: string[];
  reconciliationPromise: Promise<void> | null;
};

type PostgresSample = {
  total: number;
  active: number;
  idle: number;
  maxConnections: number;
};

type MetricSample = {
  recordedAtMs: number;
  cpuSeconds: number;
  rssBytes: number;
  heapUsedBytes: number;
  activeLoops: number;
  activeSockets: number;
  ticks: number;
  tickErrors: number;
  distributedLockMisses: number;
  realtimeEvents: number;
  socketPayloadBytes: number;
  tickDurationP95Ms: number;
  tickDurationP99Ms: number;
  tickDurationMaxMs: number;
  tickSchedulingLagP95Ms: number;
  tickSchedulingLagP99Ms: number;
  tickSchedulingLagMaxMs: number;
  postgres: PostgresSample;
};

type RequestResult = {
  ok: boolean;
  status: number;
  durationMs: number;
  body: unknown;
  error: string | null;
  attempts?: number;
};

const prisma = new PrismaClient();

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

function splitArg(arg: string) {
  const separatorIndex = arg.indexOf('=');
  return separatorIndex < 0
    ? ([arg, undefined] as const)
    : ([arg.slice(0, separatorIndex), arg.slice(separatorIndex + 1)] as const);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(): LoadTestOptions {
  const defaultOutput = resolve(
    process.cwd(),
    '..',
    '_reports',
    'load-test',
    `auto-combat-${Date.now()}.json`,
  );
  const options: LoadTestOptions = {
    users: 50,
    durationSeconds: 60,
    warmupSeconds: 5,
    sampleIntervalMs: 1000,
    baseUrl: 'http://127.0.0.1:3101',
    outputJson: defaultOutput,
    metricsToken: process.env.METRICS_TOKEN ?? '',
    battleQuantity: 1000,
    fixtureConcurrency: 8,
    rampBatchSize: 10,
    rampDelayMs: 100,
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = splitArg(arg);

    switch (key) {
      case '--users':
        options.users = Math.min(500, positiveInteger(value, options.users));
        break;
      case '--duration-seconds':
        options.durationSeconds = positiveInteger(
          value,
          options.durationSeconds,
        );
        break;
      case '--warmup-seconds':
        options.warmupSeconds = positiveInteger(value, options.warmupSeconds);
        break;
      case '--sample-interval-ms':
        options.sampleIntervalMs = Math.max(
          250,
          positiveInteger(value, options.sampleIntervalMs),
        );
        break;
      case '--base-url':
        options.baseUrl = String(value ?? options.baseUrl).replace(/\/+$/, '');
        break;
      case '--output-json':
        options.outputJson = resolve(String(value ?? defaultOutput));
        break;
      case '--metrics-token':
        options.metricsToken = String(value ?? '');
        break;
      case '--battle-quantity':
        options.battleQuantity = positiveInteger(value, options.battleQuantity);
        break;
      case '--fixture-concurrency':
        options.fixtureConcurrency = positiveInteger(
          value,
          options.fixtureConcurrency,
        );
        break;
      case '--ramp-batch-size':
        options.rampBatchSize = positiveInteger(value, options.rampBatchSize);
        break;
      case '--ramp-delay-ms':
        options.rampDelayMs = positiveInteger(value, options.rampDelayMs);
        break;
      default:
        break;
    }
  }

  return options;
}

function normalizeKey(value?: string | null) {
  return String(value ?? '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function assertIsolatedDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL nao definido para o teste de carga.');
  }

  const parsed = new URL(databaseUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//, '');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);

  if (!isLocal || !/^mmorpg_zumbi_load_test_[a-z0-9_]+$/i.test(databaseName)) {
    throw new Error(
      `Recusado: o runner exige banco local descartavel com prefixo mmorpg_zumbi_load_test_. Recebido: ${hostname}/${databaseName}`,
    );
  }
}

function getEquipmentItemStatsTotal(item: EquipmentSeedItem) {
  return EQUIPMENT_STAT_KEYS.reduce(
    (sum, stat) => sum + Math.max(0, Number(item[stat]) || 0),
    0,
  );
}

function getSeedEquipmentItems(className: string, tier: number) {
  const classKey = normalizeKey(className);
  const classItems = equipmentDefinitions.filter(
    (item) =>
      normalizeKey(item.className) === classKey &&
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

function buildGatheringSkills(className: string, level: number) {
  const recommended = new Set(
    RECOMMENDED_GATHERING_ORIGINS_BY_CLASS[normalizeKey(className)] ?? [],
  );

  return GATHERING_ORIGINS.map((origin) => ({
    origin,
    level: recommended.has(origin) ? level : 1,
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
      throw new Error(`Slot invalido no fixture de carga: ${slot}.`);
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

async function loadFixtureTemplate(
  className: string,
  tier: number,
): Promise<FixtureTemplate> {
  const level = tier * 10;
  const gameClass = await prisma.gameClass.findFirst({
    where: { name: { equals: className, mode: 'insensitive' } },
  });
  const map = await prisma.gameMap.findFirst({
    where: { tier, minLevel: { lte: level }, maxLevel: { gte: level } },
    orderBy: [{ minLevel: 'asc' }, { name: 'asc' }],
  });

  if (!gameClass || !map) {
    throw new Error(`Classe ou mapa ausente para ${className} T${tier}.`);
  }

  const subMap = await prisma.subMap.findFirst({
    where: {
      mapId: map.id,
      minLevel: { lte: level },
      maxLevel: { gte: level },
    },
    orderBy: [{ minLevel: 'asc' }, { name: 'asc' }],
  });

  if (!subMap) {
    throw new Error(`Submapa ausente para ${className} T${tier}.`);
  }

  const encounter = await prisma.subMapEncounter.findFirst({
    where: { subMapId: subMap.id, isActive: true },
    include: { mob: true },
    orderBy: [{ weight: 'desc' }, { id: 'asc' }],
  });

  if (!encounter) {
    throw new Error(`Encontro ausente para ${className} T${tier}.`);
  }

  const seedEquipment = getSeedEquipmentItems(className, tier);

  if (seedEquipment.length !== EQUIPMENT_SLOT_ORDER.length) {
    throw new Error(
      `Fixture esperava ${EQUIPMENT_SLOT_ORDER.length} equipamentos para ${className} T${tier}, encontrou ${seedEquipment.length}.`,
    );
  }

  const equipmentItems = await prisma.item.findMany({
    where: { name: { in: seedEquipment.map((item) => item.name) } },
  });

  if (equipmentItems.length !== EQUIPMENT_SLOT_ORDER.length) {
    throw new Error(
      `Equipamentos canonicos incompletos para ${className} T${tier}.`,
    );
  }

  const potionDefinition = getAutoCombatPotionForTier(tier);
  const potionItem = await prisma.item.findUnique({
    where: { name: potionDefinition.name },
  });

  if (!potionItem) {
    throw new Error(`Pocao canonica ausente para T${tier}.`);
  }

  const gatheringLevel = Math.min(level, GATHERING_LEVEL_CAP);
  const gatheringSkills = buildGatheringSkills(className, gatheringLevel);
  const gatheringBonus: PrimaryStats =
    calculateGatheringPrimaryBonus(gatheringSkills);
  const stats = calculateFullStats(
    gameClass,
    equipmentItems,
    level,
    gatheringBonus,
  );

  return {
    className,
    classId: gameClass.id,
    tier,
    level,
    mapId: map.id,
    mapName: map.name,
    subMapId: subMap.id,
    subMapName: subMap.name,
    encounterId: encounter.id,
    mobId: encounter.mobId,
    mobName: encounter.mob.name,
    encounterWeight: encounter.weight,
    maxHp: stats.derivedCombatStats.maxHp,
    equipmentData: buildEquipmentUpdateData(equipmentItems),
    gatheringSkills,
    huntingLevel: Math.min(level, AUTO_COMBAT_HUNTING_LEVEL_CAP),
    potionItemId: potionItem.id,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, consume),
  );
  return results;
}

async function prepareVirtualUsers(options: LoadTestOptions) {
  const runId = `${Date.now().toString(36)}-${process.pid}`;
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET nao definido para gerar tokens do teste.');
  }

  const templates = new Map<string, FixtureTemplate>();

  for (const definition of classDefinitions) {
    for (let tier = 1; tier <= 5; tier += 1) {
      const template = await loadFixtureTemplate(definition.name, tier);
      templates.set(`${normalizeKey(definition.name)}:${tier}`, template);
    }
  }

  const jwt = new JwtService({ secret: jwtSecret });
  const indexes = Array.from({ length: options.users }, (_, index) => index);

  return mapWithConcurrency(
    indexes,
    options.fixtureConcurrency,
    async (index): Promise<VirtualUser> => {
      const className = classDefinitions[index % classDefinitions.length].name;
      const tier = (index % 5) + 1;
      const template = templates.get(`${normalizeKey(className)}:${tier}`);

      if (!template) {
        throw new Error(`Template nao carregado para ${className} T${tier}.`);
      }

      const email = `load-${runId}-${String(index + 1).padStart(3, '0')}@local.test`;
      const characterName = `Carga ${String(index + 1).padStart(3, '0')}`;
      const now = new Date();
      const endsAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);

      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash: 'load-test-token-only',
            role: UserRole.PLAYER,
            premiumUntil: null,
            termsAcceptedAt: now,
            termsVersion: 'load-test',
            privacyAcceptedAt: now,
            privacyVersion: 'load-test',
          },
        });
        const character = await tx.character.create({
          data: {
            userId: user.id,
            classId: template.classId,
            mapId: template.mapId,
            name: characterName,
            status: CharacterStatus.ACTIVE,
            level: template.level,
            xp: 0,
            gold: 999_999,
            cash: 0,
            currentHp: template.maxHp,
            maxHp: template.maxHp,
            avatarKey: `${normalizeKey(template.className)}-01`,
          },
        });

        await tx.equipment.create({
          data: { characterId: character.id, ...template.equipmentData },
        });
        await tx.characterGatheringSkill.createMany({
          data: template.gatheringSkills.map((skill) => ({
            characterId: character.id,
            ...skill,
          })),
        });
        await tx.characterHuntingSkill.create({
          data: {
            characterId: character.id,
            level: template.huntingLevel,
            xp: 0,
            totalXp: 0,
          },
        });
        await tx.inventoryItem.create({
          data: {
            characterId: character.id,
            itemId: template.potionItemId,
            type: InventoryItemType.CONSUMABLE,
            quantity: 99_999,
          },
        });
        await tx.characterPotionConfig.create({
          data: {
            characterId: character.id,
            potionItemId: template.potionItemId,
            enabled: true,
            hpThresholdPercent: 35,
            useInManualCombat: true,
            useInAutoCombat: true,
          },
        });
        const session = await tx.autoCombatSession.create({
          data: {
            characterId: character.id,
            mapId: template.mapId,
            subMapId: template.subMapId,
            status: AutoCombatSessionStatus.ACTIVE,
            phase: AutoCombatSessionPhase.ENCOUNTER_READY,
            startedAt: now,
            endsAt,
            lastProcessedAt: now,
            durationSeconds: 21_600,
            roundDurationSeconds: 1,
            huntStartedAt: now,
            huntStoppedAt: now,
            lastHuntProcessedAt: now,
            huntingLevelAtStart: template.huntingLevel,
            foundEnemiesCount: options.battleQuantity,
            selectedEncounterId: template.encounterId,
            selectedEncounterMobId: template.mobId,
            currentCombatIndex: 1,
          },
        });
        const batch = await tx.autoCombatHuntBatch.create({
          data: {
            characterId: character.id,
            mapId: template.mapId,
            sessionId: session.id,
            status: AutoCombatHuntBatchStatus.READY,
            startedAt: now,
            stoppedAt: now,
            lastProcessedAt: now,
            huntingLevelAtStart: template.huntingLevel,
            foundEnemiesCount: options.battleQuantity,
            selectedEncounterId: template.encounterId,
            selectedEncounterMobId: template.mobId,
            huntSequence: options.battleQuantity,
          },
        });
        await tx.autoCombatHuntBatchMob.create({
          data: {
            batchId: batch.id,
            mobId: template.mobId,
            encounterId: template.encounterId,
            foundCount: options.battleQuantity,
            remainingCount: options.battleQuantity,
            weightSnapshot: template.encounterWeight,
            firstFoundAt: now,
            lastFoundAt: now,
          },
        });

        return { user, character };
      });

      const token = await jwt.signAsync({
        sub: created.user.id,
        email: created.user.email,
        role: created.user.role,
        tokenVersion: created.user.tokenVersion,
      });

      return {
        index,
        userId: created.user.id,
        email,
        token,
        characterId: created.character.id,
        characterName,
        className,
        tier,
        level: template.level,
        encounterId: template.encounterId,
        mobId: template.mobId,
        mobName: template.mobName,
      };
    },
  );
}

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function requestJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<RequestResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = text;

    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      body,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function connectVirtualUser(
  virtualUser: VirtualUser,
  baseUrl: string,
): Promise<SocketState> {
  const startedAt = performance.now();
  const socket = io(`${baseUrl}/auto-combat`, {
    autoConnect: false,
    transports: ['websocket'],
    auth: { token: virtualUser.token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 250,
    reconnectionDelayMax: 2_000,
    timeout: 10_000,
    forceNew: true,
    multiplex: false,
  });
  const state: SocketState = {
    virtualUser,
    socket,
    initialConnectedAtMs: null,
    initialJoinedAtMs: null,
    forcedReconnectAtMs: null,
    transportReconnectedAtMs: null,
    roomRejoinedAtMs: null,
    reconciliationFinishedAtMs: null,
    reconciliationSucceeded: false,
    eventsReceived: 0,
    connectErrors: [],
    socketErrors: [],
    reconciliationPromise: null,
  };

  const initialJoin = new Promise<void>((resolveJoin, rejectJoin) => {
    const timeout = setTimeout(() => {
      rejectJoin(
        new Error(`Timeout ao conectar ${virtualUser.characterName}.`),
      );
    }, 15_000);

    socket.on('connect', () => {
      const connectedAt = performance.now();

      if (state.initialConnectedAtMs === null) {
        state.initialConnectedAtMs = connectedAt - startedAt;
      } else if (
        state.forcedReconnectAtMs !== null &&
        state.transportReconnectedAtMs === null
      ) {
        state.transportReconnectedAtMs = connectedAt;
      }
    });

    socket.on('auto-combat:connected', () => {
      socket.emit('auto-combat:join', {
        characterId: virtualUser.characterId,
      });
    });

    socket.on('auto-combat:joined', (payload: { characterId?: string }) => {
      if (payload?.characterId !== virtualUser.characterId) return;
      const joinedAt = performance.now();

      if (state.initialJoinedAtMs === null) {
        state.initialJoinedAtMs = joinedAt - startedAt;
        clearTimeout(timeout);
        resolveJoin();
        return;
      }

      if (
        state.forcedReconnectAtMs !== null &&
        state.roomRejoinedAtMs === null
      ) {
        state.roomRejoinedAtMs = joinedAt;
        state.reconciliationPromise = reconcileAfterReconnect(state, baseUrl);
      }
    });

    socket.on('connect_error', (error: Error) => {
      state.connectErrors.push(error.message);
    });

    socket.on('auto-combat:error', (payload: { message?: string }) => {
      state.socketErrors.push(
        payload?.message ?? 'Erro Socket.IO sem mensagem.',
      );
    });

    socket.on('auto-combat:event', () => {
      state.eventsReceived += 1;
    });

    socket.connect();
  });

  try {
    await initialJoin;
    return state;
  } catch (error) {
    socket.removeAllListeners();
    socket.disconnect();
    throw error;
  }
}

async function reconcileAfterReconnect(state: SocketState, baseUrl: string) {
  state.socket.emit('auto-combat:telemetry', {
    characterId: state.virtualUser.characterId,
    kind: 'LIFECYCLE',
    context: 'reconnected',
    lifecycle: 'RECONNECTED',
  });
  const result = await requestJson(
    `${baseUrl}/auto-combat/${state.virtualUser.characterId}/status?_ts=${Date.now()}`,
    {
      headers: { Authorization: `Bearer ${state.virtualUser.token}` },
    },
  );
  state.reconciliationFinishedAtMs = performance.now();
  state.reconciliationSucceeded = result.ok;
}

async function connectAll(users: VirtualUser[], options: LoadTestOptions) {
  const states: SocketState[] = [];

  for (let index = 0; index < users.length; index += options.rampBatchSize) {
    const batch = users.slice(index, index + options.rampBatchSize);
    const connected = await Promise.all(
      batch.map((user) => connectVirtualUser(user, options.baseUrl)),
    );
    states.push(...connected);

    if (index + options.rampBatchSize < users.length) {
      await sleep(options.rampDelayMs);
    }
  }

  return states;
}

async function startBattles(users: VirtualUser[], options: LoadTestOptions) {
  const results: Array<RequestResult & { characterId: string }> = [];

  for (let index = 0; index < users.length; index += options.rampBatchSize) {
    const batch = users.slice(index, index + options.rampBatchSize);
    const batchResults = await Promise.all(
      batch.map(async (user) => {
        let result: RequestResult | null = null;

        for (let attempt = 1; attempt <= 5; attempt += 1) {
          result = await requestJson(
            `${options.baseUrl}/auto-combat/${user.characterId}/battle/start`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${user.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                mobId: user.mobId,
                encounterId: user.encounterId,
                quantity: options.battleQuantity,
              }),
            },
            30_000,
          );

          if (result.ok || result.status !== 409) {
            return {
              ...result,
              attempts: attempt,
              characterId: user.characterId,
            };
          }

          await sleep(50 * attempt);
        }

        return {
          ...(result as RequestResult),
          attempts: 5,
          characterId: user.characterId,
        };
      }),
    );
    results.push(...batchResults);

    if (index + options.rampBatchSize < users.length) {
      await sleep(options.rampDelayMs);
    }
  }

  return results;
}

function parseLabels(rawLabels: string | undefined) {
  const labels: Record<string, string> = {};

  for (const match of rawLabels?.matchAll(/([a-zA-Z_][\w]*)="([^"]*)"/g) ??
    []) {
    labels[match[1]] = match[2];
  }

  return labels;
}

function readMetric(
  text: string,
  metricName: string,
  expectedLabels: Record<string, string> = {},
) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(metricName)) continue;
    const match = line.match(/^([^\s{]+)(?:\{([^}]*)\})?\s+(.+)$/);

    if (!match || match[1] !== metricName) continue;
    const labels = parseLabels(match[2]);
    const matchesLabels = Object.entries(expectedLabels).every(
      ([key, value]) => labels[key] === value,
    );

    if (!matchesLabels) continue;
    const value = Number(match[3]);
    return Number.isFinite(value) ? value : 0;
  }

  return 0;
}

async function readPostgresConnections(): Promise<PostgresSample> {
  const rows = await prisma.$queryRaw<
    Array<{
      total: number;
      active: number;
      idle: number;
      maxConnections: number;
    }>
  >`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE state = 'active')::int AS active,
      COUNT(*) FILTER (WHERE state = 'idle')::int AS idle,
      current_setting('max_connections')::int AS "maxConnections"
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
  `;

  return rows[0] ?? { total: 0, active: 0, idle: 0, maxConnections: 0 };
}

async function collectMetricSample(options: LoadTestOptions) {
  const metrics = await requestJson(
    `${options.baseUrl}/metrics`,
    {
      headers: options.metricsToken
        ? { Authorization: `Bearer ${options.metricsToken}` }
        : {},
    },
    10_000,
  );

  if (!metrics.ok || typeof metrics.body !== 'string') {
    throw new Error(
      `Falha ao coletar /metrics: ${metrics.error ?? metrics.status}`,
    );
  }

  const text = metrics.body;
  return {
    recordedAtMs: Date.now(),
    cpuSeconds:
      readMetric(text, 'dead_idle_process_cpu_user_seconds_total') +
      readMetric(text, 'dead_idle_process_cpu_system_seconds_total'),
    rssBytes: readMetric(text, 'dead_idle_process_resident_memory_bytes'),
    heapUsedBytes: readMetric(text, 'dead_idle_process_heap_used_bytes'),
    activeLoops: readMetric(text, 'dead_idle_auto_combat_active_loops'),
    activeSockets: readMetric(text, 'dead_idle_auto_combat_active_sockets'),
    ticks: readMetric(text, 'dead_idle_auto_combat_ticks_total'),
    tickErrors: readMetric(text, 'dead_idle_auto_combat_tick_errors_total'),
    distributedLockMisses: readMetric(
      text,
      'dead_idle_auto_combat_distributed_lock_misses_total',
    ),
    realtimeEvents: readMetric(
      text,
      'dead_idle_auto_combat_realtime_events_emitted_total',
    ),
    socketPayloadBytes: readMetric(
      text,
      'dead_idle_auto_combat_socket_payload_bytes_total',
    ),
    tickDurationP95Ms: readMetric(
      text,
      'dead_idle_auto_combat_tick_duration_ms',
      { stat: 'p95' },
    ),
    tickDurationP99Ms: readMetric(
      text,
      'dead_idle_auto_combat_tick_duration_ms',
      { stat: 'p99' },
    ),
    tickDurationMaxMs: readMetric(
      text,
      'dead_idle_auto_combat_tick_duration_ms',
      { stat: 'max' },
    ),
    tickSchedulingLagP95Ms: readMetric(
      text,
      'dead_idle_auto_combat_tick_scheduling_lag_ms',
      { stat: 'p95' },
    ),
    tickSchedulingLagP99Ms: readMetric(
      text,
      'dead_idle_auto_combat_tick_scheduling_lag_ms',
      { stat: 'p99' },
    ),
    tickSchedulingLagMaxMs: readMetric(
      text,
      'dead_idle_auto_combat_tick_scheduling_lag_ms',
      { stat: 'max' },
    ),
    postgres: await readPostgresConnections(),
  } satisfies MetricSample;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return sorted[index];
}

function average(values: number[]) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarize(values: number[], decimals = 2) {
  return {
    samples: values.length,
    average: round(average(values), decimals),
    p50: round(percentile(values, 0.5), decimals),
    p95: round(percentile(values, 0.95), decimals),
    p99: round(percentile(values, 0.99), decimals),
    max: round(values.length > 0 ? Math.max(...values) : 0, decimals),
  };
}

function delta(
  first: MetricSample,
  last: MetricSample,
  key: keyof MetricSample,
) {
  const firstValue = first[key];
  const lastValue = last[key];
  return typeof firstValue === 'number' && typeof lastValue === 'number'
    ? Math.max(0, lastValue - firstValue)
    : 0;
}

function buildDistribution(users: VirtualUser[]) {
  const byTier: Record<string, number> = {};
  const byClass: Record<string, number> = {};

  for (const user of users) {
    byTier[`T${user.tier}`] = (byTier[`T${user.tier}`] ?? 0) + 1;
    byClass[user.className] = (byClass[user.className] ?? 0) + 1;
  }

  return { byTier, byClass };
}

function mib(bytes: number) {
  return bytes / 1024 / 1024;
}

function buildMarkdown(report: ReturnType<typeof buildReport>) {
  const assessment = report.assessment;
  const status = assessment.passed ? 'APROVADO' : 'REPROVADO';
  const cpu = report.resources.processCpuPercentOfOneCore;
  const rss = report.resources.rssMiB;
  const postgres = report.resources.postgresConnections;
  const autoCombat = report.autoCombat;
  const sockets = report.sockets;

  return `# Teste de carga do autocombate - ${report.config.users} personagens

> Resultado ${status}. Esta e carga sintetica em banco, Redis e backend descartaveis. Ela mede capacidade tecnica e nao substitui telemetria economica real T2-T5.

## Cenario

| Campo | Valor |
| --- | ---: |
| Personagens simultaneos | ${report.config.users} |
| Duracao estavel | ${report.config.durationSeconds}s |
| Distribuicao por tier | ${Object.entries(report.distribution.byTier)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')} |
| Distribuicao por classe | ${Object.entries(report.distribution.byClass)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')} |
| Queda de sockets | ${report.config.reconnectStormPercent}% simultaneamente |

## Recursos

| Metrica | Media | P95 | Maximo |
| --- | ---: | ---: | ---: |
| CPU do backend (% de 1 nucleo) | ${cpu.average}% | ${cpu.p95}% | ${cpu.max}% |
| RSS do backend | ${rss.average} MiB | ${rss.p95} MiB | ${rss.max} MiB |
| Conexoes PostgreSQL | ${postgres.average} | ${postgres.p95} | ${postgres.max} |
| Conexoes PostgreSQL ativas | ${postgres.activeAverage} | ${postgres.activeP95} | ${postgres.activeMax} |

## Autocombate

| Metrica | Valor |
| --- | ---: |
| Ticks processados | ${autoCombat.ticks} |
| Ticks por segundo | ${autoCombat.ticksPerSecond} |
| Erros de tick | ${autoCombat.tickErrors} |
| Falhas de lock distribuido | ${autoCombat.distributedLockMisses} |
| Duracao do tick P95 / P99 / max | ${autoCombat.tickDurationMs.p95} / ${autoCombat.tickDurationMs.p99} / ${autoCombat.tickDurationMs.max} ms |
| Atraso do agendador P95 / P99 / max | ${autoCombat.tickSchedulingLagMs.p95} / ${autoCombat.tickSchedulingLagMs.p99} / ${autoCombat.tickSchedulingLagMs.max} ms |
| Eventos realtime | ${autoCombat.realtimeEvents} |
| Trafego Socket.IO emitido | ${autoCombat.socketPayloadMiB} MiB |

## Sockets e reconciliacao

| Metrica | Valor |
| --- | ---: |
| Conexoes iniciais | ${sockets.initialConnectionsSucceeded}/${sockets.initialConnectionsAttempted} |
| Reconexoes de transporte | ${sockets.transportReconnectsSucceeded}/${sockets.reconnectsAttempted} |
| Salas reingressadas | ${sockets.roomRejoinsSucceeded}/${sockets.reconnectsAttempted} |
| Reconciliacoes REST | ${sockets.reconciliationsSucceeded}/${sockets.reconnectsAttempted} |
| Reconexao de transporte P95 | ${sockets.transportReconnectMs.p95} ms |
| Sala pronta P95 | ${sockets.roomRejoinMs.p95} ms |
| Reconciliacao completa P95 | ${sockets.reconciliationMs.p95} ms |

## Criterios

${assessment.checks.map((check) => `- ${check.passed ? '[x]' : '[ ]'} ${check.name}: ${check.actual} (meta ${check.target})`).join('\n')}

## Limite da evidencia

O ensaio confirma o comportamento tecnico da instancia local sob carga sintetica. Ele nao demonstra que recompensas, drops ou pets estao economicamente equilibrados e nao reduz a estimativa de 496-860 horas dos insumos de pets. O proximo passo economico continua sendo capturar amostras reais suficientes por atividade e tier.
`;
}

function buildReport(params: {
  options: LoadTestOptions;
  users: VirtualUser[];
  socketStates: SocketState[];
  battleStarts: Array<RequestResult & { characterId: string }>;
  samples: MetricSample[];
  startedAt: Date;
  finishedAt: Date;
}) {
  const { options, users, socketStates, battleStarts, samples } = params;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const cpuPercent: number[] = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const elapsedSeconds =
      (current.recordedAtMs - previous.recordedAtMs) / 1000;

    if (elapsedSeconds > 0) {
      cpuPercent.push(
        ((current.cpuSeconds - previous.cpuSeconds) / elapsedSeconds) * 100,
      );
    }
  }

  const transportReconnectMs = socketStates
    .filter(
      (state) =>
        state.forcedReconnectAtMs !== null &&
        state.transportReconnectedAtMs !== null,
    )
    .map(
      (state) =>
        (state.transportReconnectedAtMs as number) -
        (state.forcedReconnectAtMs as number),
    );
  const roomRejoinMs = socketStates
    .filter(
      (state) =>
        state.forcedReconnectAtMs !== null && state.roomRejoinedAtMs !== null,
    )
    .map(
      (state) =>
        (state.roomRejoinedAtMs as number) -
        (state.forcedReconnectAtMs as number),
    );
  const reconciliationMs = socketStates
    .filter(
      (state) =>
        state.forcedReconnectAtMs !== null &&
        state.reconciliationFinishedAtMs !== null,
    )
    .map(
      (state) =>
        (state.reconciliationFinishedAtMs as number) -
        (state.forcedReconnectAtMs as number),
    );
  const postgresTotals = samples.map((sample) => sample.postgres.total);
  const postgresActive = samples.map((sample) => sample.postgres.active);
  const tickDurationMs = {
    p95: round(last.tickDurationP95Ms),
    p99: round(last.tickDurationP99Ms),
    max: round(last.tickDurationMaxMs),
  };
  const tickSchedulingLagMs = {
    p95: round(last.tickSchedulingLagP95Ms),
    p99: round(last.tickSchedulingLagP99Ms),
    max: round(last.tickSchedulingLagMaxMs),
  };
  const ticks = delta(first, last, 'ticks');
  const elapsedSeconds = Math.max(
    0.001,
    (last.recordedAtMs - first.recordedAtMs) / 1000,
  );
  const reconnectsAttempted = socketStates.filter(
    (state) => state.forcedReconnectAtMs !== null,
  ).length;
  const transportReconnectsSucceeded = transportReconnectMs.length;
  const roomRejoinsSucceeded = roomRejoinMs.length;
  const reconciliationsSucceeded = socketStates.filter(
    (state) => state.reconciliationSucceeded,
  ).length;
  const maxLoops = Math.max(...samples.map((sample) => sample.activeLoops));
  const maxSockets = Math.max(...samples.map((sample) => sample.activeSockets));
  const tickErrors = delta(first, last, 'tickErrors');
  const distributedLockMisses = delta(first, last, 'distributedLockMisses');
  const checks = [
    {
      name: 'Todas as batalhas iniciaram',
      passed: battleStarts.every((result) => result.ok),
      actual: `${battleStarts.filter((result) => result.ok).length}/${options.users}`,
      target: `${options.users}/${options.users}`,
    },
    {
      name: 'Loops simultaneos atingiram a carga alvo',
      passed: maxLoops >= options.users,
      actual: String(maxLoops),
      target: `>= ${options.users}`,
    },
    {
      name: 'Sockets simultaneos atingiram a carga alvo',
      passed: maxSockets >= options.users,
      actual: String(maxSockets),
      target: `>= ${options.users}`,
    },
    {
      name: 'Reconexao de transporte',
      passed:
        reconnectsAttempted > 0 &&
        transportReconnectsSucceeded / reconnectsAttempted >= 0.99,
      actual: `${transportReconnectsSucceeded}/${reconnectsAttempted}`,
      target: '>= 99%',
    },
    {
      name: 'Reentrada na sala',
      passed:
        reconnectsAttempted > 0 &&
        roomRejoinsSucceeded / reconnectsAttempted >= 0.99,
      actual: `${roomRejoinsSucceeded}/${reconnectsAttempted}`,
      target: '>= 99%',
    },
    {
      name: 'Reconciliacao REST apos reconexao',
      passed:
        reconnectsAttempted > 0 &&
        reconciliationsSucceeded / reconnectsAttempted >= 0.99,
      actual: `${reconciliationsSucceeded}/${reconnectsAttempted}`,
      target: '>= 99%',
    },
    {
      name: 'Sem erros de tick',
      passed: tickErrors === 0,
      actual: String(tickErrors),
      target: '0',
    },
    {
      name: 'Sem falhas de lock distribuido',
      passed: distributedLockMisses === 0,
      actual: String(distributedLockMisses),
      target: '0',
    },
    {
      name: 'Atraso P95 do agendador',
      passed: tickSchedulingLagMs.p95 <= 250,
      actual: `${tickSchedulingLagMs.p95} ms`,
      target: '<= 250 ms',
    },
    {
      name: 'Duracao P95 do tick',
      passed: tickDurationMs.p95 <= 500,
      actual: `${tickDurationMs.p95} ms`,
      target: '<= 500 ms',
    },
    {
      name: 'Conexoes PostgreSQL abaixo de 80% do limite',
      passed:
        Math.max(...postgresTotals) <=
        Math.max(1, last.postgres.maxConnections * 0.8),
      actual: `${Math.max(...postgresTotals)}/${last.postgres.maxConnections}`,
      target: '<= 80%',
    },
  ];

  return {
    schemaVersion: 1,
    synthetic: true,
    startedAt: params.startedAt.toISOString(),
    finishedAt: params.finishedAt.toISOString(),
    host: {
      platform: platform(),
      release: release(),
      cpuModel: cpus()[0]?.model ?? 'unknown',
      logicalCpus: cpus().length,
      totalMemoryMiB: round(mib(totalmem())),
      freeMemoryAtReportMiB: round(mib(freemem())),
    },
    config: {
      users: options.users,
      durationSeconds: options.durationSeconds,
      warmupSeconds: options.warmupSeconds,
      sampleIntervalMs: options.sampleIntervalMs,
      battleQuantity: options.battleQuantity,
      reconnectStormPercent: 100,
    },
    distribution: buildDistribution(users),
    startup: {
      fixturesPrepared: users.length,
      initialSocketConnectMs: summarize(
        socketStates
          .map((state) => state.initialConnectedAtMs)
          .filter((value): value is number => value !== null),
      ),
      initialRoomJoinMs: summarize(
        socketStates
          .map((state) => state.initialJoinedAtMs)
          .filter((value): value is number => value !== null),
      ),
      battleStartMs: summarize(battleStarts.map((result) => result.durationMs)),
      battleStartRetries: battleStarts.reduce(
        (sum, result) => sum + Math.max(0, (result.attempts ?? 1) - 1),
        0,
      ),
      battlesStarted: battleStarts.filter((result) => result.ok).length,
      battleStartErrors: battleStarts
        .filter((result) => !result.ok)
        .map((result) => ({
          characterId: result.characterId,
          status: result.status,
          error: result.error,
          body: result.body,
        })),
    },
    resources: {
      processCpuPercentOfOneCore: summarize(cpuPercent),
      rssMiB: summarize(samples.map((sample) => mib(sample.rssBytes))),
      heapUsedMiB: summarize(
        samples.map((sample) => mib(sample.heapUsedBytes)),
      ),
      postgresConnections: {
        ...summarize(postgresTotals),
        activeAverage: round(average(postgresActive)),
        activeP95: round(percentile(postgresActive, 0.95)),
        activeMax: Math.max(...postgresActive),
        configuredMax: last.postgres.maxConnections,
      },
    },
    autoCombat: {
      ticks,
      ticksPerSecond: round(ticks / elapsedSeconds),
      tickErrors,
      distributedLockMisses,
      tickDurationMs,
      tickSchedulingLagMs,
      realtimeEvents: delta(first, last, 'realtimeEvents'),
      socketPayloadMiB: round(mib(delta(first, last, 'socketPayloadBytes')), 3),
      activeLoops: summarize(samples.map((sample) => sample.activeLoops)),
    },
    sockets: {
      initialConnectionsAttempted: options.users,
      initialConnectionsSucceeded: socketStates.filter(
        (state) => state.initialConnectedAtMs !== null,
      ).length,
      reconnectsAttempted,
      transportReconnectsSucceeded,
      roomRejoinsSucceeded,
      reconciliationsSucceeded,
      transportReconnectMs: summarize(transportReconnectMs),
      roomRejoinMs: summarize(roomRejoinMs),
      reconciliationMs: summarize(reconciliationMs),
      eventsReceived: socketStates.reduce(
        (sum, state) => sum + state.eventsReceived,
        0,
      ),
      connectErrors: socketStates.flatMap((state) => state.connectErrors),
      socketErrors: socketStates.flatMap((state) => state.socketErrors),
    },
    assessment: {
      passed: checks.every((check) => check.passed),
      checks,
    },
  };
}

async function main() {
  assertIsolatedDatabase();
  const options = parseArgs();
  const startedAt = new Date();
  const socketStates: SocketState[] = [];

  console.log(
    `[load] Preparando ${options.users} personagens em banco descartavel...`,
  );

  try {
    const users = await prepareVirtualUsers(options);
    await prisma.$disconnect();
    await prisma.$connect();
    console.log(
      `[load] Fixtures prontas: ${users.length}. Conectando sockets...`,
    );
    socketStates.push(...(await connectAll(users, options)));
    console.log(
      `[load] Sockets conectados: ${socketStates.length}. Iniciando combates...`,
    );

    const battleStarts = await startBattles(users, options);
    const failedBattles = battleStarts.filter((result) => !result.ok);

    if (failedBattles.length > 0) {
      throw new Error(
        `${failedBattles.length} batalhas falharam ao iniciar. Primeira falha: ${JSON.stringify(failedBattles[0].body)}`,
      );
    }

    console.log(`[load] Aquecimento de ${options.warmupSeconds}s...`);
    await sleep(options.warmupSeconds * 1000);

    const samples: MetricSample[] = [await collectMetricSample(options)];
    const steadyStartedAt = Date.now();
    const reconnectAtMs =
      steadyStartedAt + Math.floor((options.durationSeconds * 1000) / 2);
    const finishAtMs = steadyStartedAt + options.durationSeconds * 1000;
    let reconnectForced = false;

    while (Date.now() < finishAtMs) {
      if (!reconnectForced && Date.now() >= reconnectAtMs) {
        reconnectForced = true;
        const forcedAt = performance.now();
        console.log(
          `[load] Forcando reconexao simultanea de ${socketStates.length} sockets...`,
        );

        for (const state of socketStates) {
          state.forcedReconnectAtMs = forcedAt;
          state.socket.io.engine?.close();
        }
      }

      await sleep(options.sampleIntervalMs);
      samples.push(await collectMetricSample(options));
    }

    const reconnectDeadline = Date.now() + 20_000;

    while (
      Date.now() < reconnectDeadline &&
      socketStates.some(
        (state) =>
          state.forcedReconnectAtMs !== null &&
          state.reconciliationFinishedAtMs === null,
      )
    ) {
      await sleep(250);
    }

    await Promise.allSettled(
      socketStates
        .map((state) => state.reconciliationPromise)
        .filter((promise): promise is Promise<void> => promise !== null),
    );

    samples.push(await collectMetricSample(options));
    const report = buildReport({
      options,
      users,
      socketStates,
      battleStarts,
      samples,
      startedAt,
      finishedAt: new Date(),
    });
    const markdownPath = options.outputJson.replace(/\.json$/i, '.md');

    await mkdir(dirname(options.outputJson), { recursive: true });
    await writeFile(options.outputJson, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(markdownPath, buildMarkdown(report));

    console.log(`[load] JSON: ${options.outputJson}`);
    console.log(`[load] Markdown: ${markdownPath}`);
    console.log(
      `[load] Resultado: ${report.assessment.passed ? 'APROVADO' : 'REPROVADO'}.`,
    );

    if (!report.assessment.passed) {
      process.exitCode = 2;
    }
  } finally {
    for (const state of socketStates) {
      state.socket.removeAllListeners();
      state.socket.disconnect();
    }

    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
