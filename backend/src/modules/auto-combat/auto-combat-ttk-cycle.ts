export const MIN_AUTO_COMBAT_TTK_DURATION_MS = 1_000;

export type AutoCombatTtkCycleResolution = {
  completions: number;
  availableCompletions: number;
  progressMs: number;
  activeDurationMs: number;
  processingLimited: boolean;
};

function normalizeNonNegativeInteger(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} nao pode ser negativo.`);
  }

  return Math.max(0, Math.floor(value));
}

function normalizeDuration(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} deve ser positivo.`);
  }

  return Math.max(MIN_AUTO_COMBAT_TTK_DURATION_MS, Math.ceil(value));
}

export function resolveAutoCombatTtkCycle(params: {
  elapsedMs: number;
  progressMs: number;
  currentDurationMs: number;
  nextDurationMs: number;
  maxCompletions: number;
}): AutoCombatTtkCycleResolution {
  const elapsedMs = normalizeNonNegativeInteger(params.elapsedMs, 'elapsedMs');
  const progressMs = normalizeNonNegativeInteger(
    params.progressMs,
    'progressMs',
  );
  const currentDurationMs = normalizeDuration(
    params.currentDurationMs,
    'currentDurationMs',
  );
  const nextDurationMs = normalizeDuration(
    params.nextDurationMs,
    'nextDurationMs',
  );
  const maxCompletions = normalizeNonNegativeInteger(
    params.maxCompletions,
    'maxCompletions',
  );
  const accumulatedProgressMs = progressMs + elapsedMs;

  if (accumulatedProgressMs < currentDurationMs || maxCompletions === 0) {
    return {
      completions: 0,
      availableCompletions:
        accumulatedProgressMs < currentDurationMs
          ? 0
          : 1 +
            Math.floor(
              (accumulatedProgressMs - currentDurationMs) / nextDurationMs,
            ),
      progressMs: accumulatedProgressMs,
      activeDurationMs: currentDurationMs,
      processingLimited: maxCompletions === 0,
    };
  }

  const availableCompletions =
    1 +
    Math.floor((accumulatedProgressMs - currentDurationMs) / nextDurationMs);
  const completions = Math.min(availableCompletions, maxCompletions);
  const consumedProgressMs =
    currentDurationMs + Math.max(0, completions - 1) * nextDurationMs;

  return {
    completions,
    availableCompletions,
    progressMs: Math.max(0, accumulatedProgressMs - consumedProgressMs),
    activeDurationMs: nextDurationMs,
    processingLimited: availableCompletions > completions,
  };
}
