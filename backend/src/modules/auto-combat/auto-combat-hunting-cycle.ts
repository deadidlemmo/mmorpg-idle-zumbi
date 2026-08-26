export const MIN_AUTO_COMBAT_HUNTING_CYCLE_DURATION_MS = 1_000;

export type AutoCombatHuntingCycleState = {
  startedAt: Date;
  endsAt: Date;
  durationMs: number;
  version: number;
};

export type AutoCombatHuntingCycleResolution = {
  quantity: number;
  processedAt: Date;
  reachedCapacity: boolean;
  reachedSessionEnd: boolean;
  cycle: AutoCombatHuntingCycleState;
};

function normalizePositiveInteger(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} deve ser positivo.`);
  }

  return Math.max(1, Math.ceil(value));
}

function normalizeNonNegativeInteger(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} nao pode ser negativo.`);
  }

  return Math.max(0, Math.floor(value));
}

function normalizeTimestamp(value: Date, field: string) {
  const timestamp = value.getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} deve ser uma data valida.`);
  }

  return timestamp;
}

export function createAutoCombatHuntingCycle(params: {
  startedAt: Date;
  durationMs: number;
  version: number;
}): AutoCombatHuntingCycleState {
  const startedAtMs = normalizeTimestamp(params.startedAt, 'startedAt');
  const durationMs = normalizePositiveInteger(params.durationMs, 'durationMs');
  const version = normalizePositiveInteger(params.version, 'cycleVersion');

  return {
    startedAt: new Date(startedAtMs),
    endsAt: new Date(startedAtMs + durationMs),
    durationMs,
    version,
  };
}

export function resolveAutoCombatHuntingCycle(params: {
  serverNow: Date;
  sessionEndsAt: Date;
  currentCycle: AutoCombatHuntingCycleState;
  nextCycleDurationMs: number;
  maxCompletions: number;
}): AutoCombatHuntingCycleResolution {
  const serverNowMs = normalizeTimestamp(params.serverNow, 'serverNow');
  const sessionEndsAtMs = normalizeTimestamp(
    params.sessionEndsAt,
    'sessionEndsAt',
  );
  const cycleStartedAtMs = normalizeTimestamp(
    params.currentCycle.startedAt,
    'cycleStartedAt',
  );
  const cycleEndsAtMs = normalizeTimestamp(
    params.currentCycle.endsAt,
    'cycleEndsAt',
  );
  const cycleDurationMs = normalizePositiveInteger(
    params.currentCycle.durationMs,
    'cycleDurationMs',
  );
  const nextCycleDurationMs = normalizePositiveInteger(
    params.nextCycleDurationMs,
    'nextCycleDurationMs',
  );
  const version = normalizePositiveInteger(
    params.currentCycle.version,
    'cycleVersion',
  );
  const maxCompletions = normalizeNonNegativeInteger(
    params.maxCompletions,
    'maxCompletions',
  );

  if (cycleEndsAtMs - cycleStartedAtMs !== cycleDurationMs) {
    throw new Error(
      'O intervalo do ciclo deve corresponder a cycleDurationMs.',
    );
  }

  const processingNowMs = Math.min(serverNowMs, sessionEndsAtMs);
  const reachedSessionEnd = serverNowMs >= sessionEndsAtMs;

  if (processingNowMs < cycleEndsAtMs || maxCompletions === 0) {
    return {
      quantity: 0,
      processedAt: new Date(cycleStartedAtMs),
      reachedCapacity: maxCompletions === 0,
      reachedSessionEnd,
      cycle: {
        startedAt: new Date(cycleStartedAtMs),
        endsAt: new Date(cycleEndsAtMs),
        durationMs: cycleDurationMs,
        version,
      },
    };
  }

  const elapsedAfterFirstCycleMs = Math.max(0, processingNowMs - cycleEndsAtMs);
  const additionalCompletions = Math.floor(
    elapsedAfterFirstCycleMs / nextCycleDurationMs,
  );
  const availableCompletions = 1 + additionalCompletions;
  const quantity = Math.min(availableCompletions, maxCompletions);
  const lastCompletionAtMs =
    cycleEndsAtMs + Math.max(0, quantity - 1) * nextCycleDurationMs;

  return {
    quantity,
    processedAt: new Date(lastCompletionAtMs),
    reachedCapacity: quantity >= maxCompletions,
    reachedSessionEnd,
    cycle: {
      startedAt: new Date(lastCompletionAtMs),
      endsAt: new Date(lastCompletionAtMs + nextCycleDurationMs),
      durationMs: nextCycleDurationMs,
      version: version + quantity,
    },
  };
}
