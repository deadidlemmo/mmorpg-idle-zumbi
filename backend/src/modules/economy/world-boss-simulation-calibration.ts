import { T1_ECONOMY_CONFIG } from '../../common/config/economy.config';

type WorldBossSimulationSlot =
  (typeof T1_ECONOMY_CONFIG.simulation.worldBossCalendar.slots)[number];

export type WorldBossCalibrationSource = 'TELEMETRY' | 'FALLBACK';

export type WorldBossTelemetryTerminalStatus =
  | 'DEFEATED'
  | 'EXPIRED'
  | 'REWARDED';

export interface WorldBossTelemetryEvent {
  status: WorldBossTelemetryTerminalStatus;
  slotIndex: number;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  maxHp: number;
  currentHp: number;
  totalDamage: number;
  participantCount: number;
  participantRecords: number;
  hpLockedAt: Date | null;
  defeatedAt: Date | null;
}

export interface WorldBossCalibrationPercentageMetric {
  value: number;
  source: WorldBossCalibrationSource;
  sampleSize: number;
  minimumSampleSize: number;
  confidenceInterval95: { min: number; max: number } | null;
}

export interface WorldBossCalibrationRangeMetric {
  value: { min: number; max: number };
  source: WorldBossCalibrationSource;
  sampleSize: number;
  minimumSampleSize: number;
  percentileRange: 'P25_P75' | null;
}

export interface WorldBossSimulationSlotCalibration {
  index: WorldBossSimulationSlot['index'];
  key: WorldBossSimulationSlot['key'];
  label: string;
  validEvents: number;
  emptyEvents: number;
  activatedEvents: number;
  defeatedEvents: number;
  expiredActivatedEvents: number;
  activationChancePercent: WorldBossCalibrationPercentageMetric;
  defeatChancePercent: WorldBossCalibrationPercentageMetric;
  defeatedDurationMinutes: WorldBossCalibrationRangeMetric;
  expiredProgressPercent: WorldBossCalibrationRangeMetric;
}

export interface WorldBossSimulationCalibration {
  mode: 'TELEMETRY_WITH_FALLBACKS' | 'FALLBACK_ONLY';
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  lookbackDays: number;
  quality: {
    queriedEvents: number;
    acceptedEvents: number;
    rejectedEvents: number;
    rejectedByReason: Record<string, number>;
  };
  readiness: {
    rewardReviewReady: boolean;
    fallbackMetrics: string[];
  };
  slots: WorldBossSimulationSlotCalibration[];
}

interface CalibrationOptions {
  asOf?: Date;
  lookbackDays?: number;
}

const calibrationConfig =
  T1_ECONOMY_CONFIG.simulation.worldBossCalendar.telemetryCalibration;

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentage(successes: number, sampleSize: number) {
  return sampleSize > 0 ? round((successes / sampleSize) * 100) : 0;
}

function wilsonConfidenceInterval95(successes: number, sampleSize: number) {
  if (sampleSize <= 0) return null;

  const z = 1.96;
  const ratio = successes / sampleSize;
  const denominator = 1 + (z * z) / sampleSize;
  const center = (ratio + (z * z) / (2 * sampleSize)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt(
      (ratio * (1 - ratio)) / sampleSize +
        (z * z) / (4 * sampleSize * sampleSize),
    );

  return {
    min: round(Math.max(0, center - margin) * 100),
    max: round(Math.min(1, center + margin) * 100),
  };
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * ratio;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = ordered[lowerIndex];
  const upper = ordered[upperIndex];
  return lower + (upper - lower) * (position - lowerIndex);
}

function telemetryRange(
  samples: number[],
  minimumSampleSize: number,
  fallback: { min: number; max: number },
): WorldBossCalibrationRangeMetric {
  if (samples.length < minimumSampleSize) {
    return {
      value: fallback,
      source: 'FALLBACK',
      sampleSize: samples.length,
      minimumSampleSize,
      percentileRange: null,
    };
  }

  const p25 = percentile(samples, 0.25) ?? fallback.min;
  const p75 = percentile(samples, 0.75) ?? fallback.max;
  return {
    value: {
      min: Math.max(0, Math.round(Math.min(p25, p75))),
      max: Math.max(0, Math.round(Math.max(p25, p75))),
    },
    source: 'TELEMETRY',
    sampleSize: samples.length,
    minimumSampleSize,
    percentileRange: 'P25_P75',
  };
}

function calibratedPercentage(params: {
  successes: number;
  sampleSize: number;
  minimumSampleSize: number;
  fallback: number;
}): WorldBossCalibrationPercentageMetric {
  const enoughSamples = params.sampleSize >= params.minimumSampleSize;
  return {
    value: enoughSamples
      ? percentage(params.successes, params.sampleSize)
      : params.fallback,
    source: enoughSamples ? 'TELEMETRY' : 'FALLBACK',
    sampleSize: params.sampleSize,
    minimumSampleSize: params.minimumSampleSize,
    confidenceInterval95: enoughSamples
      ? wilsonConfidenceInterval95(params.successes, params.sampleSize)
      : null,
  };
}

function getQualityRejectionReason(
  event: WorldBossTelemetryEvent,
  periodStart: Date,
  periodEnd: Date,
) {
  const config = T1_ECONOMY_CONFIG.simulation.worldBossCalendar;
  if (!config.slots.some((slot) => slot.index === event.slotIndex)) {
    return 'UNKNOWN_SLOT';
  }
  if (event.startsAt < periodStart || event.startsAt > periodEnd) {
    return 'OUTSIDE_LOOKBACK';
  }
  if (event.endsAt < event.startsAt) return 'INVALID_TIMELINE';
  if (event.createdAt > event.endsAt) return 'CREATED_AFTER_CLOSE';
  if (
    event.createdAt.getTime() >
    event.startsAt.getTime() + config.entryWindowMinutes * 60_000
  ) {
    return 'BACKFILLED_AFTER_ENTRY_WINDOW';
  }
  if (
    event.maxHp <= 0 ||
    event.currentHp < 0 ||
    event.currentHp > event.maxHp ||
    event.totalDamage < 0
  ) {
    return 'INVALID_COMBAT_VALUES';
  }
  if (
    event.hpLockedAt &&
    (event.hpLockedAt < event.startsAt || event.hpLockedAt > event.endsAt)
  ) {
    return 'INVALID_HP_LOCK_TIME';
  }
  if (
    event.defeatedAt &&
    (event.defeatedAt < event.startsAt || event.defeatedAt > event.endsAt)
  ) {
    return 'INVALID_DEFEAT_TIME';
  }
  return null;
}

function hasActivationEvidence(event: WorldBossTelemetryEvent) {
  return (
    event.hpLockedAt !== null ||
    event.totalDamage > 0 ||
    event.currentHp < event.maxHp ||
    event.defeatedAt !== null ||
    event.status === 'DEFEATED'
  );
}

function wasDefeated(event: WorldBossTelemetryEvent) {
  return (
    event.status === 'DEFEATED' ||
    event.defeatedAt !== null ||
    event.currentHp === 0
  );
}

function fallbackSlotCalibration(
  slot: WorldBossSimulationSlot,
): WorldBossSimulationSlotCalibration {
  const calendar = T1_ECONOMY_CONFIG.simulation.worldBossCalendar;
  return {
    index: slot.index,
    key: slot.key,
    label: slot.label,
    validEvents: 0,
    emptyEvents: 0,
    activatedEvents: 0,
    defeatedEvents: 0,
    expiredActivatedEvents: 0,
    activationChancePercent: calibratedPercentage({
      successes: 0,
      sampleSize: 0,
      minimumSampleSize: calibrationConfig.minimumEventSampleSize,
      fallback: calendar.fallbackActivationChancePercent,
    }),
    defeatChancePercent: calibratedPercentage({
      successes: 0,
      sampleSize: 0,
      minimumSampleSize: calibrationConfig.minimumActivatedEventSampleSize,
      fallback: slot.defeatChancePercent,
    }),
    defeatedDurationMinutes: telemetryRange(
      [],
      calibrationConfig.minimumDefeatedEventSampleSize,
      slot.defeatedDurationMinutes,
    ),
    expiredProgressPercent: telemetryRange(
      [],
      calibrationConfig.minimumExpiredActivatedEventSampleSize,
      slot.expiredProgressPercent,
    ),
  };
}

function buildReadiness(slots: WorldBossSimulationSlotCalibration[]) {
  const metricEntries = slots.flatMap((slot) => [
    {
      name: `${slot.key}.activationChancePercent`,
      source: slot.activationChancePercent.source,
    },
    {
      name: `${slot.key}.defeatChancePercent`,
      source: slot.defeatChancePercent.source,
    },
    {
      name: `${slot.key}.defeatedDurationMinutes`,
      source: slot.defeatedDurationMinutes.source,
    },
    {
      name: `${slot.key}.expiredProgressPercent`,
      source: slot.expiredProgressPercent.source,
    },
  ]);
  const fallbackMetrics = metricEntries
    .filter((metric) => metric.source === 'FALLBACK')
    .map((metric) => metric.name);
  return {
    rewardReviewReady: fallbackMetrics.length === 0,
    fallbackMetrics,
  };
}

export function createFallbackWorldBossSimulationCalibration(
  options: CalibrationOptions = {},
): WorldBossSimulationCalibration {
  const asOf = options.asOf ?? new Date();
  const lookbackDays = Math.max(
    1,
    Math.floor(options.lookbackDays ?? calibrationConfig.lookbackDays),
  );
  const periodStart = new Date(asOf.getTime() - lookbackDays * 86_400_000);
  const slots = T1_ECONOMY_CONFIG.simulation.worldBossCalendar.slots.map(
    fallbackSlotCalibration,
  );
  return {
    mode: 'FALLBACK_ONLY',
    generatedAt: asOf.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: asOf.toISOString(),
    lookbackDays,
    quality: {
      queriedEvents: 0,
      acceptedEvents: 0,
      rejectedEvents: 0,
      rejectedByReason: {},
    },
    readiness: buildReadiness(slots),
    slots,
  };
}

export function calibrateWorldBossSimulation(
  events: WorldBossTelemetryEvent[],
  options: CalibrationOptions = {},
): WorldBossSimulationCalibration {
  const asOf = options.asOf ?? new Date();
  const lookbackDays = Math.max(
    1,
    Math.floor(options.lookbackDays ?? calibrationConfig.lookbackDays),
  );
  const periodStart = new Date(asOf.getTime() - lookbackDays * 86_400_000);
  const rejectedByReason: Record<string, number> = {};
  const acceptedEvents = events.filter((event) => {
    const reason = getQualityRejectionReason(event, periodStart, asOf);
    if (!reason) return true;
    rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1;
    return false;
  });

  const slots = T1_ECONOMY_CONFIG.simulation.worldBossCalendar.slots.map(
    (slot): WorldBossSimulationSlotCalibration => {
      const slotEvents = acceptedEvents.filter(
        (event) => event.slotIndex === slot.index,
      );
      const activatedEvents = slotEvents.filter(hasActivationEvidence);
      const defeatedEvents = activatedEvents.filter(wasDefeated);
      const expiredActivatedEvents = activatedEvents.filter(
        (event) => !wasDefeated(event),
      );
      const defeatedDurations = defeatedEvents
        .filter((event) => event.defeatedAt !== null)
        .map((event) =>
          Math.max(
            0,
            (event.defeatedAt!.getTime() - event.startsAt.getTime()) / 60_000,
          ),
        );
      const expiredProgress = expiredActivatedEvents.map((event) =>
        Math.max(
          0,
          Math.min(
            100,
            (Math.max(event.totalDamage, event.maxHp - event.currentHp) /
              event.maxHp) *
              100,
          ),
        ),
      );

      return {
        index: slot.index,
        key: slot.key,
        label: slot.label,
        validEvents: slotEvents.length,
        emptyEvents: slotEvents.length - activatedEvents.length,
        activatedEvents: activatedEvents.length,
        defeatedEvents: defeatedEvents.length,
        expiredActivatedEvents: expiredActivatedEvents.length,
        activationChancePercent: calibratedPercentage({
          successes: activatedEvents.length,
          sampleSize: slotEvents.length,
          minimumSampleSize: calibrationConfig.minimumEventSampleSize,
          fallback:
            T1_ECONOMY_CONFIG.simulation.worldBossCalendar
              .fallbackActivationChancePercent,
        }),
        defeatChancePercent: calibratedPercentage({
          successes: defeatedEvents.length,
          sampleSize: activatedEvents.length,
          minimumSampleSize: calibrationConfig.minimumActivatedEventSampleSize,
          fallback: slot.defeatChancePercent,
        }),
        defeatedDurationMinutes: telemetryRange(
          defeatedDurations,
          calibrationConfig.minimumDefeatedEventSampleSize,
          slot.defeatedDurationMinutes,
        ),
        expiredProgressPercent: telemetryRange(
          expiredProgress,
          calibrationConfig.minimumExpiredActivatedEventSampleSize,
          slot.expiredProgressPercent,
        ),
      };
    },
  );

  return {
    mode: 'TELEMETRY_WITH_FALLBACKS',
    generatedAt: asOf.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: asOf.toISOString(),
    lookbackDays,
    quality: {
      queriedEvents: events.length,
      acceptedEvents: acceptedEvents.length,
      rejectedEvents: events.length - acceptedEvents.length,
      rejectedByReason,
    },
    readiness: buildReadiness(slots),
    slots,
  };
}
