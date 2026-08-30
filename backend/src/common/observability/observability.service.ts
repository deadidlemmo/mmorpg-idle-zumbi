import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS_COORDINATION_CLIENT } from '../redis/redis.constants';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BackupStatusService,
  type BackupOperationalStatus,
} from './backup-status.service';
import {
  OperationalAlertDispatcher,
  type OperationalAlert,
} from './operational-alert-dispatcher.service';

type RouteMetrics = {
  requests: number;
  errors: number;
  durationMs: number;
  maxDurationMs: number;
  recentDurations: TimedMetricSample[];
};

type TimedMetricSample = {
  value: number;
  recordedAt: number;
  sequence: number;
};

type HttpErrorSample = {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  recordedAt: number;
  sequence: number;
};

type MetricSeriesSummary = {
  samples: number;
  average: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

type AutoCombatTelemetryContext =
  | 'combat-page'
  | 'other-page'
  | 'tab-hidden'
  | 'reconnected'
  | 'unknown';

type AutoCombatContextCounters = {
  reports: number;
  eventsReceived: number;
  duplicateEvents: number;
  suppressedEvents: number;
  reconciliationRuns: number;
  reconciledEvents: number;
  realSequenceGaps: number;
  visualCycles: number;
  visualCyclesAfterVisibilityReturn: number;
  visibilityReturns: number;
  reconnects: number;
};

type AutoCombatOperationalMetrics = {
  ticks: number;
  tickErrors: number;
  distributedLockMisses: number;
  activeLoops: number;
  realtimeEventsEmitted: number;
  realtimeEventsByType: Map<string, number>;
  socketPayloadEmissions: number;
  socketPayloadBytes: number;
  socketPayloadEmissionsByEvent: Map<string, number>;
  socketPayloadBytesByEvent: Map<string, number>;
  socketConnections: number;
  socketDisconnects: number;
  activeSockets: number;
  clientEventReports: number;
  clientEventsByType: Map<string, number>;
  visualCycleReports: number;
  sequenceGaps: number;
  duplicateEvents: number;
  suppressedEvents: number;
  reconciliationRuns: number;
  reconciledEvents: number;
  realSequenceGaps: number;
  visibilityReturns: number;
  reconnects: number;
  eventEmissionDelaySamples: number;
  clientTransitDelaySamples: number;
  outOfOrderEvents: number;
  compressedVisualCycles: number;
  visualCyclesAfterVisibilityReturn: number;
  telemetryByContext: Map<
    AutoCombatTelemetryContext,
    AutoCombatContextCounters
  >;
  tickDurations: TimedMetricSample[];
  processingLockWaitDurations: TimedMetricSample[];
  eventEmissionDelays: TimedMetricSample[];
  clientEventTransitDelays: TimedMetricSample[];
  clientQueueDepths: TimedMetricSample[];
  visualCycleDurations: TimedMetricSample[];
  visualCycleRatios: TimedMetricSample[];
  hiddenDurations: TimedMetricSample[];
  visualCycleAfterVisibilityDurations: TimedMetricSample[];
  visualCycleAfterVisibilityRatios: TimedMetricSample[];
};

type AutoCombatCounterBaseline = {
  ticks: number;
  tickErrors: number;
  distributedLockMisses: number;
  realtimeEventsEmitted: number;
  realtimeEventsByType: Map<string, number>;
  socketPayloadEmissions: number;
  socketPayloadBytes: number;
  socketPayloadEmissionsByEvent: Map<string, number>;
  socketPayloadBytesByEvent: Map<string, number>;
  socketConnections: number;
  socketDisconnects: number;
  clientEventReports: number;
  clientEventsByType: Map<string, number>;
  visualCycleReports: number;
  sequenceGaps: number;
  duplicateEvents: number;
  suppressedEvents: number;
  reconciliationRuns: number;
  reconciledEvents: number;
  realSequenceGaps: number;
  visibilityReturns: number;
  reconnects: number;
  eventEmissionDelaySamples: number;
  clientTransitDelaySamples: number;
  outOfOrderEvents: number;
  compressedVisualCycles: number;
  visualCyclesAfterVisibilityReturn: number;
  telemetryByContext: Map<
    AutoCombatTelemetryContext,
    AutoCombatContextCounters
  >;
};

type HttpCounterBaseline = Map<
  string,
  Pick<RouteMetrics, 'requests' | 'errors' | 'durationMs'>
>;

type AutoCombatCapture = {
  id: string;
  startedAt: number;
  minimumSampleSequence: number;
  source: 'BOOT' | 'ADMIN';
  autoCombatBaseline: AutoCombatCounterBaseline;
  httpBaseline: HttpCounterBaseline;
};

type AlertContext = {
  database?: 'up' | 'down';
  redis?: 'up' | 'down' | 'disabled';
  redisRequired?: boolean;
  requestDurationMs?: number;
};

const METRIC_WINDOW_MS = 15 * 60 * 1000;
const MAX_SERIES_SAMPLES = 50_000;
const MAX_RECENT_HTTP_ERRORS = 250;
const AUTO_COMBAT_TELEMETRY_CONTEXTS: AutoCombatTelemetryContext[] = [
  'combat-page',
  'other-page',
  'tab-hidden',
  'reconnected',
  'unknown',
];
const AUTO_COMBAT_EVENT_TYPES = new Set([
  'HUNT_TARGET_FOUND',
  'MOB_SPAWNED',
  'PLAYER_HIT',
  'MOB_HIT',
  'DODGE',
  'POTION_USED',
  'MOB_DEFEATED',
  'PLAYER_DEFEATED',
  'SESSION_STARTED',
  'SESSION_UPDATED',
  'SESSION_FINISHED',
  'SESSION_STOPPED',
  'SESSION_ERROR',
]);

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly metrics = new Map<string, RouteMetrics>();
  private readonly autoCombatMetrics: AutoCombatOperationalMetrics = {
    ticks: 0,
    tickErrors: 0,
    distributedLockMisses: 0,
    activeLoops: 0,
    realtimeEventsEmitted: 0,
    realtimeEventsByType: new Map<string, number>(),
    socketPayloadEmissions: 0,
    socketPayloadBytes: 0,
    socketPayloadEmissionsByEvent: new Map<string, number>(),
    socketPayloadBytesByEvent: new Map<string, number>(),
    socketConnections: 0,
    socketDisconnects: 0,
    activeSockets: 0,
    clientEventReports: 0,
    clientEventsByType: new Map<string, number>(),
    visualCycleReports: 0,
    sequenceGaps: 0,
    duplicateEvents: 0,
    suppressedEvents: 0,
    reconciliationRuns: 0,
    reconciledEvents: 0,
    realSequenceGaps: 0,
    visibilityReturns: 0,
    reconnects: 0,
    eventEmissionDelaySamples: 0,
    clientTransitDelaySamples: 0,
    outOfOrderEvents: 0,
    compressedVisualCycles: 0,
    visualCyclesAfterVisibilityReturn: 0,
    telemetryByContext: new Map(
      AUTO_COMBAT_TELEMETRY_CONTEXTS.map((context) => [
        context,
        {
          reports: 0,
          eventsReceived: 0,
          duplicateEvents: 0,
          suppressedEvents: 0,
          reconciliationRuns: 0,
          reconciledEvents: 0,
          realSequenceGaps: 0,
          visualCycles: 0,
          visualCyclesAfterVisibilityReturn: 0,
          visibilityReturns: 0,
          reconnects: 0,
        },
      ]),
    ),
    tickDurations: [],
    processingLockWaitDurations: [],
    eventEmissionDelays: [],
    clientEventTransitDelays: [],
    clientQueueDepths: [],
    visualCycleDurations: [],
    visualCycleRatios: [],
    hiddenDurations: [],
    visualCycleAfterVisibilityDurations: [],
    visualCycleAfterVisibilityRatios: [],
  };
  private readonly recentErrors: number[] = [];
  private readonly recentHttpErrors: HttpErrorSample[] = [];
  private readonly lastAlertAt = new Map<string, number>();
  private autoCombatCapture: AutoCombatCapture;
  private inFlightRequests = 0;
  private metricSampleSequence = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional()
    @Inject(REDIS_COORDINATION_CLIENT)
    private readonly redis: Redis | null,
    private readonly backupStatusService: BackupStatusService,
    private readonly alertDispatcher: OperationalAlertDispatcher,
  ) {
    this.autoCombatCapture = this.createAutoCombatCapture('BOOT');
  }

  startRequest() {
    this.inFlightRequests += 1;
  }

  finishRequest(params: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }) {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
    const normalizedRoute = this.normalizeRoute(params.route);
    const key = `${params.method.toUpperCase()} ${normalizedRoute}`;
    const current = this.metrics.get(key) ?? {
      requests: 0,
      errors: 0,
      durationMs: 0,
      maxDurationMs: 0,
      recentDurations: [],
    };

    current.requests += 1;
    current.durationMs += params.durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, params.durationMs);
    this.recordSeriesSample(current.recentDurations, params.durationMs);

    if (params.statusCode >= 500) {
      const recordedAt = Date.now();
      current.errors += 1;
      this.recentErrors.push(recordedAt);
      this.recentHttpErrors.push({
        method: params.method.toUpperCase(),
        route: normalizedRoute,
        statusCode: Math.floor(params.statusCode),
        durationMs: Math.max(0, params.durationMs),
        recordedAt,
        sequence: this.nextMetricSampleSequence(),
      });
      this.pruneRecentHttpErrors(recordedAt);
    }

    this.metrics.set(key, current);
    this.pruneRecentErrors();
    this.emitOperationalAlerts(params.durationMs);

    const slowRequestMs =
      Number(this.configService.get<string>('SLOW_REQUEST_THRESHOLD_MS')) ||
      1500;

    if (params.durationMs >= slowRequestMs) {
      this.logger.warn(
        JSON.stringify({
          event: 'slow_request',
          method: params.method,
          route: normalizedRoute,
          statusCode: params.statusCode,
          durationMs: params.durationMs,
        }),
      );
    }
  }

  recordAutoCombatTick(params: { durationMs: number; acquired: boolean }) {
    this.autoCombatMetrics.ticks += 1;
    this.recordSeriesSample(
      this.autoCombatMetrics.tickDurations,
      params.durationMs,
    );

    if (!params.acquired) {
      this.autoCombatMetrics.distributedLockMisses += 1;
    }
  }

  recordAutoCombatTickError() {
    this.autoCombatMetrics.tickErrors += 1;
  }

  setAutoCombatActiveLoops(activeLoops: number) {
    this.autoCombatMetrics.activeLoops = Math.max(
      0,
      Math.floor(Number(activeLoops) || 0),
    );
  }

  recordAutoCombatProcessingLockWait(durationMs: number) {
    this.recordSeriesSample(
      this.autoCombatMetrics.processingLockWaitDurations,
      durationMs,
    );
  }

  recordAutoCombatRealtimeEvent(params: {
    eventType?: string | null;
    emissionDelayMs?: number | null;
  }) {
    this.autoCombatMetrics.realtimeEventsEmitted += 1;
    this.incrementMetricCounter(
      this.autoCombatMetrics.realtimeEventsByType,
      this.normalizeAutoCombatEventType(params.eventType),
    );

    const emissionDelayMs = this.toNonNegativeFiniteNumber(
      params.emissionDelayMs,
    );

    if (emissionDelayMs !== null) {
      this.autoCombatMetrics.eventEmissionDelaySamples += 1;
      this.recordSeriesSample(
        this.autoCombatMetrics.eventEmissionDelays,
        emissionDelayMs,
      );
    }
  }

  recordAutoCombatSocketEmission(params: {
    eventName?: string | null;
    payloadBytes?: number | null;
  }) {
    const eventName = String(params.eventName ?? 'unknown').trim() || 'unknown';
    const payloadBytes = Math.max(
      0,
      Math.floor(Number(params.payloadBytes) || 0),
    );

    this.autoCombatMetrics.socketPayloadEmissions += 1;
    this.autoCombatMetrics.socketPayloadBytes += payloadBytes;
    this.incrementMetricCounter(
      this.autoCombatMetrics.socketPayloadEmissionsByEvent,
      eventName,
    );
    this.incrementMetricCounterBy(
      this.autoCombatMetrics.socketPayloadBytesByEvent,
      eventName,
      payloadBytes,
    );
  }

  recordAutoCombatSocketConnection(connected: boolean) {
    if (connected) {
      this.autoCombatMetrics.socketConnections += 1;
      this.autoCombatMetrics.activeSockets += 1;
      return;
    }

    this.autoCombatMetrics.socketDisconnects += 1;
    this.autoCombatMetrics.activeSockets = Math.max(
      0,
      this.autoCombatMetrics.activeSockets - 1,
    );
  }

  recordAutoCombatClientTelemetry(params: {
    kind:
      | 'EVENT_RECEIVED'
      | 'EVENT_DISPOSITION'
      | 'VISUAL_CYCLE'
      | 'VISIBILITY'
      | 'RECONCILIATION'
      | 'LIFECYCLE';
    context?: string | null;
    eventType?: string | null;
    transitDelayMs?: number | null;
    queueDepth?: number | null;
    sequenceGap?: number | null;
    outOfOrder?: boolean;
    disposition?: 'DUPLICATE' | 'SUPPRESSED' | null;
    reconciledEvents?: number | null;
    realSequenceGaps?: number | null;
    hiddenDurationMs?: number | null;
    lifecycle?: 'RECONNECTED' | null;
    visualDurationMs?: number | null;
    expectedDurationMs?: number | null;
    afterVisibilityReturn?: boolean;
  }) {
    const context = this.normalizeAutoCombatTelemetryContext(params.context);
    const contextCounters = this.getAutoCombatContextCounters(context);
    contextCounters.reports += 1;

    if (params.kind === 'EVENT_RECEIVED') {
      this.autoCombatMetrics.clientEventReports += 1;
      contextCounters.eventsReceived += 1;
      this.incrementMetricCounter(
        this.autoCombatMetrics.clientEventsByType,
        this.normalizeAutoCombatEventType(params.eventType),
      );

      const transitDelayMs = this.toNonNegativeFiniteNumber(
        params.transitDelayMs,
      );

      if (transitDelayMs !== null) {
        this.autoCombatMetrics.clientTransitDelaySamples += 1;
        this.recordSeriesSample(
          this.autoCombatMetrics.clientEventTransitDelays,
          transitDelayMs,
        );
      }

      if (params.queueDepth !== null && params.queueDepth !== undefined) {
        this.recordSeriesSample(
          this.autoCombatMetrics.clientQueueDepths,
          params.queueDepth,
        );
      }

      this.autoCombatMetrics.sequenceGaps += Math.max(
        0,
        Math.floor(Number(params.sequenceGap) || 0),
      );

      if (params.outOfOrder) {
        this.autoCombatMetrics.outOfOrderEvents += 1;
      }

      return;
    }

    if (params.kind === 'EVENT_DISPOSITION') {
      if (params.disposition === 'DUPLICATE') {
        this.autoCombatMetrics.duplicateEvents += 1;
        contextCounters.duplicateEvents += 1;
      } else if (params.disposition === 'SUPPRESSED') {
        this.autoCombatMetrics.suppressedEvents += 1;
        contextCounters.suppressedEvents += 1;
      }

      return;
    }

    if (params.kind === 'RECONCILIATION') {
      const reconciledEvents = Math.max(
        0,
        Math.floor(Number(params.reconciledEvents) || 0),
      );
      const realSequenceGaps = Math.max(
        0,
        Math.floor(Number(params.realSequenceGaps) || 0),
      );

      this.autoCombatMetrics.reconciliationRuns += 1;
      this.autoCombatMetrics.reconciledEvents += reconciledEvents;
      this.autoCombatMetrics.realSequenceGaps += realSequenceGaps;
      contextCounters.reconciliationRuns += 1;
      contextCounters.reconciledEvents += reconciledEvents;
      contextCounters.realSequenceGaps += realSequenceGaps;
      return;
    }

    if (params.kind === 'VISIBILITY') {
      const hiddenDurationMs = this.toNonNegativeFiniteNumber(
        params.hiddenDurationMs,
      );

      if (hiddenDurationMs !== null) {
        this.autoCombatMetrics.visibilityReturns += 1;
        contextCounters.visibilityReturns += 1;
        this.recordSeriesSample(
          this.autoCombatMetrics.hiddenDurations,
          hiddenDurationMs,
        );
      }

      return;
    }

    if (params.kind === 'LIFECYCLE') {
      if (params.lifecycle === 'RECONNECTED') {
        this.autoCombatMetrics.reconnects += 1;
        contextCounters.reconnects += 1;
      }

      return;
    }

    const visualDurationMs = this.toNonNegativeFiniteNumber(
      params.visualDurationMs,
    );
    const expectedDurationMs = this.toNonNegativeFiniteNumber(
      params.expectedDurationMs,
    );

    if (visualDurationMs === null || expectedDurationMs === null) {
      return;
    }

    this.autoCombatMetrics.visualCycleReports += 1;
    contextCounters.visualCycles += 1;
    this.recordSeriesSample(
      this.autoCombatMetrics.visualCycleDurations,
      visualDurationMs,
    );

    if (params.afterVisibilityReturn) {
      this.autoCombatMetrics.visualCyclesAfterVisibilityReturn += 1;
      contextCounters.visualCyclesAfterVisibilityReturn += 1;
      this.recordSeriesSample(
        this.autoCombatMetrics.visualCycleAfterVisibilityDurations,
        visualDurationMs,
      );
    }

    if (expectedDurationMs > 0) {
      const ratioPercent = (visualDurationMs / expectedDurationMs) * 100;
      this.recordSeriesSample(
        this.autoCombatMetrics.visualCycleRatios,
        ratioPercent,
      );

      if (params.afterVisibilityReturn) {
        this.recordSeriesSample(
          this.autoCombatMetrics.visualCycleAfterVisibilityRatios,
          ratioPercent,
        );
      }

      if (ratioPercent < 90) {
        this.autoCombatMetrics.compressedVisualCycles += 1;
      }
    }
  }

  startAutoCombatCapture() {
    this.autoCombatCapture = this.createAutoCombatCapture('ADMIN');
    return this.buildCaptureMetadata();
  }

  async getHealth() {
    let database: 'up' | 'down' = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    const redisRequired =
      this.configService.get<string>('REDIS_REQUIRED')?.toLowerCase() ===
      'true';
    const redis = this.redis
      ? this.redis.status === 'ready'
        ? 'up'
        : 'down'
      : 'disabled';
    const memory = process.memoryUsage();
    const backup = this.backupStatusService.getStatus();
    const alerts = this.getAlerts(memory.heapUsed, backup, {
      database,
      redis,
      redisRequired,
    });
    const ready = database === 'up' && (!redisRequired || redis === 'up');
    this.emitAlerts(alerts);

    return {
      status: ready ? 'ok' : 'degraded',
      ready,
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: { database, redis },
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      backup: {
        state: backup.state,
        maxAgeHours: backup.maxAgeHours,
        verificationMaxAgeHours: backup.verificationMaxAgeHours,
        offsiteMaxAgeHours: backup.offsiteMaxAgeHours,
        backupAgeHours: backup.backupAgeHours,
        verificationAgeHours: backup.verificationAgeHours,
        offsiteAgeHours: backup.offsiteAgeHours,
        integrity: backup.integrity.state,
      },
      alerts,
    };
  }

  async getOperationalSnapshot() {
    const now = Date.now();
    const capture = this.autoCombatCapture;
    const publicHealth = await this.getHealth();
    const health = {
      ...publicHealth,
      backup: this.backupStatusService.getStatus(),
    };
    const routeMetrics = [...this.metrics.entries()]
      .map(([route, metric]) => {
        const baseline = capture.httpBaseline.get(route);
        const requests = Math.max(
          0,
          metric.requests - (baseline?.requests ?? 0),
        );
        const errors = Math.max(0, metric.errors - (baseline?.errors ?? 0));
        const durationMs = Math.max(
          0,
          metric.durationMs - (baseline?.durationMs ?? 0),
        );
        const recentLatency = this.summarizeSeries(
          metric.recentDurations,
          now,
          capture.startedAt,
          capture.minimumSampleSequence,
        );

        return {
          route,
          requests,
          errors,
          errorRatePercent:
            requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0,
          averageDurationMs:
            requests > 0 ? Number((durationMs / requests).toFixed(2)) : 0,
          maxDurationMs: recentLatency.max,
          recentLatency,
        };
      })
      .filter(
        (metric) => metric.requests > 0 || metric.recentLatency.samples > 0,
      );
    const totals = routeMetrics.reduce(
      (result, metric) => ({
        requests: result.requests + metric.requests,
        errors: result.errors + metric.errors,
        durationMs:
          result.durationMs + metric.averageDurationMs * metric.requests,
        maxDurationMs: Math.max(result.maxDurationMs, metric.maxDurationMs),
      }),
      { requests: 0, errors: 0, durationMs: 0, maxDurationMs: 0 },
    );
    const httpLatency = this.summarizeSeries(
      [...this.metrics.values()].flatMap((metric) => metric.recentDurations),
      now,
      capture.startedAt,
      capture.minimumSampleSequence,
    );
    const autoCombat = this.buildAutoCombatSnapshot(capture);
    this.pruneRecentHttpErrors(now);

    return {
      generatedAt: new Date().toISOString(),
      capture: this.buildCaptureMetadata(now),
      health,
      http: {
        sampleWindowMinutes: METRIC_WINDOW_MS / 60_000,
        inFlightRequests: this.inFlightRequests,
        requests: totals.requests,
        errors: totals.errors,
        errorRatePercent:
          totals.requests > 0
            ? Number(((totals.errors / totals.requests) * 100).toFixed(2))
            : 0,
        averageDurationMs:
          totals.requests > 0
            ? Number((totals.durationMs / totals.requests).toFixed(2))
            : 0,
        maxDurationMs: totals.maxDurationMs,
        recentLatency: httpLatency,
        recentErrors: this.recentHttpErrors
          .filter(
            (error) =>
              error.recordedAt >= capture.startedAt &&
              error.sequence > capture.minimumSampleSequence,
          )
          .slice(-20)
          .reverse()
          .map((error) => ({
            method: error.method,
            route: error.route,
            statusCode: error.statusCode,
            durationMs: error.durationMs,
            recordedAt: new Date(error.recordedAt).toISOString(),
          })),
        routes: routeMetrics
          .sort(
            (left, right) =>
              right.recentLatency.p95 - left.recentLatency.p95 ||
              right.averageDurationMs - left.averageDurationMs,
          )
          .slice(0, 10),
      },
      autoCombat,
    };
  }

  renderPrometheusMetrics() {
    const lines = [
      '# HELP dead_idle_http_requests_total Total de requisicoes HTTP.',
      '# TYPE dead_idle_http_requests_total counter',
    ];

    for (const [key, metric] of [...this.metrics.entries()].sort()) {
      const separator = key.indexOf(' ');
      const method = key.slice(0, separator);
      const route = key.slice(separator + 1).replace(/"/g, '\\"');
      const labels = `method="${method}",route="${route}"`;
      lines.push(`dead_idle_http_requests_total{${labels}} ${metric.requests}`);
      lines.push(`dead_idle_http_errors_total{${labels}} ${metric.errors}`);
      lines.push(
        `dead_idle_http_request_duration_ms_sum{${labels}} ${metric.durationMs}`,
      );
      lines.push(
        `dead_idle_http_request_duration_ms_max{${labels}} ${metric.maxDurationMs}`,
      );
      const recentLatency = this.summarizeSeries(metric.recentDurations);
      lines.push(
        `dead_idle_http_request_duration_recent_samples{${labels}} ${recentLatency.samples}`,
      );
      lines.push(
        `dead_idle_http_request_duration_ms_p50{${labels}} ${recentLatency.p50}`,
      );
      lines.push(
        `dead_idle_http_request_duration_ms_p95{${labels}} ${recentLatency.p95}`,
      );
      lines.push(
        `dead_idle_http_request_duration_ms_p99{${labels}} ${recentLatency.p99}`,
      );
    }

    const memory = process.memoryUsage();
    lines.push('# TYPE dead_idle_http_in_flight_requests gauge');
    lines.push(`dead_idle_http_in_flight_requests ${this.inFlightRequests}`);
    lines.push('# TYPE dead_idle_process_uptime_seconds gauge');
    lines.push(
      `dead_idle_process_uptime_seconds ${process.uptime().toFixed(3)}`,
    );
    lines.push('# TYPE dead_idle_process_resident_memory_bytes gauge');
    lines.push(`dead_idle_process_resident_memory_bytes ${memory.rss}`);
    lines.push('# TYPE dead_idle_process_heap_used_bytes gauge');
    lines.push(`dead_idle_process_heap_used_bytes ${memory.heapUsed}`);
    this.appendAutoCombatPrometheusMetrics(lines);
    const backup = this.backupStatusService.getStatus();
    lines.push('# TYPE dead_idle_backup_last_success_timestamp_seconds gauge');
    lines.push(
      `dead_idle_backup_last_success_timestamp_seconds ${this.toTimestampSeconds(
        backup.lastBackup?.createdAt,
      )}`,
    );
    lines.push(
      '# TYPE dead_idle_backup_last_verification_timestamp_seconds gauge',
    );
    lines.push(
      `dead_idle_backup_last_verification_timestamp_seconds ${this.toTimestampSeconds(
        backup.lastVerification?.verifiedAt,
      )}`,
    );

    return `${lines.join('\n')}\n`;
  }

  private getAlerts(
    heapUsedBytes: number,
    backup: BackupOperationalStatus,
    context: AlertContext = {},
  ): OperationalAlert[] {
    this.pruneRecentErrors();
    const alerts: Array<{
      code: string;
      severity: 'warning' | 'critical';
      message: string;
    }> = [];
    const maxErrors =
      Number(this.configService.get<string>('ALERT_MAX_ERRORS_5M')) || 25;
    const maxHeapMb =
      Number(this.configService.get<string>('ALERT_MAX_HEAP_MB')) || 768;
    const maxRequestDurationMs =
      Number(this.configService.get<string>('ALERT_MAX_REQUEST_DURATION_MS')) ||
      5000;

    if (this.recentErrors.length >= maxErrors) {
      alerts.push({
        code: 'HTTP_5XX_SPIKE',
        severity: 'critical',
        message: `${this.recentErrors.length} erros HTTP 5xx nos ultimos 5 minutos.`,
      });
    }

    if (heapUsedBytes >= maxHeapMb * 1024 * 1024) {
      alerts.push({
        code: 'HIGH_HEAP_USAGE',
        severity: 'warning',
        message: `Heap acima de ${maxHeapMb} MB.`,
      });
    }

    if (
      context.requestDurationMs !== undefined &&
      context.requestDurationMs >= maxRequestDurationMs
    ) {
      alerts.push({
        code: 'HTTP_LATENCY_HIGH',
        severity: 'warning',
        message: `Requisicao levou ${Math.round(context.requestDurationMs)} ms; limite de ${maxRequestDurationMs} ms.`,
      });
    }

    if (context.database === 'down') {
      alerts.push({
        code: 'DATABASE_DOWN',
        severity: 'critical',
        message: 'PostgreSQL indisponivel no health check.',
      });
    }

    if (context.redis === 'down') {
      alerts.push({
        code: 'REDIS_DOWN',
        severity: context.redisRequired ? 'critical' : 'warning',
        message: context.redisRequired
          ? 'Redis obrigatorio indisponivel no health check.'
          : 'Redis indisponivel; recursos coordenados estao degradados.',
      });
    }

    if (backup.state === 'failed') {
      alerts.push({
        code: 'BACKUP_FAILED',
        severity: 'critical',
        message:
          'A ultima operacao de backup, verificacao ou restauracao falhou.',
      });
    } else if (backup.state === 'stale') {
      alerts.push({
        code: 'BACKUP_STALE',
        severity: 'critical',
        message: 'O backup ou seu teste de restauracao ultrapassou o prazo.',
      });
    } else if (
      backup.state === 'unknown' &&
      this.configService.get<string>('NODE_ENV')?.toLowerCase() === 'production'
    ) {
      alerts.push({
        code: 'BACKUP_STATUS_UNKNOWN',
        severity: 'warning',
        message: 'Nenhum backup verificado foi registrado nesta instancia.',
      });
    }

    return alerts;
  }

  private pruneRecentErrors() {
    const cutoff = Date.now() - 5 * 60 * 1000;

    while (this.recentErrors[0] && this.recentErrors[0] < cutoff) {
      this.recentErrors.shift();
    }
  }

  private pruneRecentHttpErrors(now = Date.now()) {
    const cutoff = now - METRIC_WINDOW_MS;

    while (
      this.recentHttpErrors[0] &&
      this.recentHttpErrors[0].recordedAt < cutoff
    ) {
      this.recentHttpErrors.shift();
    }

    if (this.recentHttpErrors.length > MAX_RECENT_HTTP_ERRORS) {
      this.recentHttpErrors.splice(
        0,
        this.recentHttpErrors.length - MAX_RECENT_HTTP_ERRORS,
      );
    }
  }

  private emitOperationalAlerts(requestDurationMs: number) {
    const now = Date.now();
    const backup = this.backupStatusService.getStatus(now);
    const alerts = this.getAlerts(process.memoryUsage().heapUsed, backup, {
      requestDurationMs,
    });
    this.emitAlerts(alerts, now);
  }

  private emitAlerts(alerts: OperationalAlert[], now = Date.now()) {
    const cooldownSeconds =
      Number(this.configService.get<string>('ALERT_COOLDOWN_SECONDS')) || 300;
    const alertCooldownMs = cooldownSeconds * 1000;

    for (const alert of alerts) {
      if (now - (this.lastAlertAt.get(alert.code) ?? 0) < alertCooldownMs) {
        continue;
      }

      this.lastAlertAt.set(alert.code, now);
      const serialized = JSON.stringify({
        event: 'operational_alert',
        ...alert,
      });

      if (alert.severity === 'critical') this.logger.error(serialized);
      else this.logger.warn(serialized);
      void this.alertDispatcher.dispatch(alert);
    }
  }

  private toTimestampSeconds(value?: string) {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
  }

  private buildAutoCombatSnapshot(capture?: AutoCombatCapture) {
    const baseline = capture?.autoCombatBaseline;
    const minimumRecordedAt = capture?.startedAt ?? 0;
    const minimumSampleSequence = capture?.minimumSampleSequence ?? 0;
    const now = Date.now();
    const ticks = this.counterDelta(
      this.autoCombatMetrics.ticks,
      baseline?.ticks,
    );
    const realtimeEventsEmitted = this.counterDelta(
      this.autoCombatMetrics.realtimeEventsEmitted,
      baseline?.realtimeEventsEmitted,
    );
    const socketPayloadEmissions = this.counterDelta(
      this.autoCombatMetrics.socketPayloadEmissions,
      baseline?.socketPayloadEmissions,
    );
    const socketPayloadBytes = this.counterDelta(
      this.autoCombatMetrics.socketPayloadBytes,
      baseline?.socketPayloadBytes,
    );
    const clientEventReports = this.counterDelta(
      this.autoCombatMetrics.clientEventReports,
      baseline?.clientEventReports,
    );
    const eventEmissionDelaySamples = this.counterDelta(
      this.autoCombatMetrics.eventEmissionDelaySamples,
      baseline?.eventEmissionDelaySamples,
    );
    const clientTransitDelaySamples = this.counterDelta(
      this.autoCombatMetrics.clientTransitDelaySamples,
      baseline?.clientTransitDelaySamples,
    );
    const elapsedSeconds = Math.max(
      0.001,
      (now - (capture?.startedAt ?? now)) / 1000,
    );

    return {
      sampleWindowMinutes: METRIC_WINDOW_MS / 60_000,
      ticks,
      tickErrors: this.counterDelta(
        this.autoCombatMetrics.tickErrors,
        baseline?.tickErrors,
      ),
      distributedLockMisses: this.counterDelta(
        this.autoCombatMetrics.distributedLockMisses,
        baseline?.distributedLockMisses,
      ),
      activeLoops: this.autoCombatMetrics.activeLoops,
      realtimeEventsEmitted,
      realtimeEventsByType: this.toMetricCounterDeltaRecord(
        this.autoCombatMetrics.realtimeEventsByType,
        baseline?.realtimeEventsByType,
      ),
      socketPayloadEmissions,
      socketPayloadBytes,
      averageSocketPayloadBytes:
        socketPayloadEmissions > 0
          ? this.roundMetric(socketPayloadBytes / socketPayloadEmissions)
          : 0,
      socketPayloadEmissionsByEvent: this.toMetricCounterDeltaRecord(
        this.autoCombatMetrics.socketPayloadEmissionsByEvent,
        baseline?.socketPayloadEmissionsByEvent,
      ),
      socketPayloadBytesByEvent: this.toMetricCounterDeltaRecord(
        this.autoCombatMetrics.socketPayloadBytesByEvent,
        baseline?.socketPayloadBytesByEvent,
      ),
      socketConnections: this.counterDelta(
        this.autoCombatMetrics.socketConnections,
        baseline?.socketConnections,
      ),
      socketDisconnects: this.counterDelta(
        this.autoCombatMetrics.socketDisconnects,
        baseline?.socketDisconnects,
      ),
      activeSockets: this.autoCombatMetrics.activeSockets,
      clientEventReports,
      clientEventsByType: this.toMetricCounterDeltaRecord(
        this.autoCombatMetrics.clientEventsByType,
        baseline?.clientEventsByType,
      ),
      visualCycleReports: this.counterDelta(
        this.autoCombatMetrics.visualCycleReports,
        baseline?.visualCycleReports,
      ),
      sequenceGaps: this.counterDelta(
        this.autoCombatMetrics.sequenceGaps,
        baseline?.sequenceGaps,
      ),
      candidateSequenceGaps: this.counterDelta(
        this.autoCombatMetrics.sequenceGaps,
        baseline?.sequenceGaps,
      ),
      duplicateEvents: this.counterDelta(
        this.autoCombatMetrics.duplicateEvents,
        baseline?.duplicateEvents,
      ),
      suppressedEvents: this.counterDelta(
        this.autoCombatMetrics.suppressedEvents,
        baseline?.suppressedEvents,
      ),
      reconciliationRuns: this.counterDelta(
        this.autoCombatMetrics.reconciliationRuns,
        baseline?.reconciliationRuns,
      ),
      reconciledEvents: this.counterDelta(
        this.autoCombatMetrics.reconciledEvents,
        baseline?.reconciledEvents,
      ),
      realSequenceGaps: this.counterDelta(
        this.autoCombatMetrics.realSequenceGaps,
        baseline?.realSequenceGaps,
      ),
      visibilityReturns: this.counterDelta(
        this.autoCombatMetrics.visibilityReturns,
        baseline?.visibilityReturns,
      ),
      reconnects: this.counterDelta(
        this.autoCombatMetrics.reconnects,
        baseline?.reconnects,
      ),
      visualCyclesAfterVisibilityReturn: this.counterDelta(
        this.autoCombatMetrics.visualCyclesAfterVisibilityReturn,
        baseline?.visualCyclesAfterVisibilityReturn,
      ),
      telemetryByContext: this.buildAutoCombatContextSnapshot(
        baseline?.telemetryByContext,
      ),
      coverage: {
        eventEmissionDelay: this.buildCoverage(
          eventEmissionDelaySamples,
          realtimeEventsEmitted,
        ),
        clientTransitDelay: this.buildCoverage(
          clientTransitDelaySamples,
          clientEventReports,
        ),
      },
      rates: {
        ticksPerSecond: this.roundMetric(ticks / elapsedSeconds),
        eventsPerSecond: this.roundMetric(
          realtimeEventsEmitted / elapsedSeconds,
        ),
        clientReportsPerSecond: this.roundMetric(
          clientEventReports / elapsedSeconds,
        ),
        socketPayloadBytesPerSecond: this.roundMetric(
          socketPayloadBytes / elapsedSeconds,
        ),
      },
      outOfOrderEvents: this.counterDelta(
        this.autoCombatMetrics.outOfOrderEvents,
        baseline?.outOfOrderEvents,
      ),
      compressedVisualCycles: this.counterDelta(
        this.autoCombatMetrics.compressedVisualCycles,
        baseline?.compressedVisualCycles,
      ),
      tickDuration: this.summarizeSeries(
        this.autoCombatMetrics.tickDurations,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      processingLockWait: this.summarizeSeries(
        this.autoCombatMetrics.processingLockWaitDurations,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      eventEmissionDelay: this.summarizeSeries(
        this.autoCombatMetrics.eventEmissionDelays,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      clientEventTransitDelay: this.summarizeSeries(
        this.autoCombatMetrics.clientEventTransitDelays,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      clientQueueDepth: this.summarizeSeries(
        this.autoCombatMetrics.clientQueueDepths,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      visualCycleDuration: this.summarizeSeries(
        this.autoCombatMetrics.visualCycleDurations,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      visualCycleRatioPercent: this.summarizeSeries(
        this.autoCombatMetrics.visualCycleRatios,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      hiddenDuration: this.summarizeSeries(
        this.autoCombatMetrics.hiddenDurations,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      visualCycleAfterVisibilityDuration: this.summarizeSeries(
        this.autoCombatMetrics.visualCycleAfterVisibilityDurations,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
      visualCycleAfterVisibilityRatioPercent: this.summarizeSeries(
        this.autoCombatMetrics.visualCycleAfterVisibilityRatios,
        now,
        minimumRecordedAt,
        minimumSampleSequence,
      ),
    };
  }

  private appendAutoCombatPrometheusMetrics(lines: string[]) {
    const snapshot = this.buildAutoCombatSnapshot();
    const counters = {
      dead_idle_auto_combat_ticks_total: snapshot.ticks,
      dead_idle_auto_combat_tick_errors_total: snapshot.tickErrors,
      dead_idle_auto_combat_distributed_lock_misses_total:
        snapshot.distributedLockMisses,
      dead_idle_auto_combat_realtime_events_emitted_total:
        snapshot.realtimeEventsEmitted,
      dead_idle_auto_combat_socket_payload_emissions_total:
        snapshot.socketPayloadEmissions,
      dead_idle_auto_combat_socket_payload_bytes_total:
        snapshot.socketPayloadBytes,
      dead_idle_auto_combat_socket_connections_total:
        snapshot.socketConnections,
      dead_idle_auto_combat_socket_disconnects_total:
        snapshot.socketDisconnects,
      dead_idle_auto_combat_client_event_reports_total:
        snapshot.clientEventReports,
      dead_idle_auto_combat_visual_cycle_reports_total:
        snapshot.visualCycleReports,
      dead_idle_auto_combat_sequence_gaps_total: snapshot.sequenceGaps,
      dead_idle_auto_combat_duplicate_events_total: snapshot.duplicateEvents,
      dead_idle_auto_combat_suppressed_events_total: snapshot.suppressedEvents,
      dead_idle_auto_combat_reconciliation_runs_total:
        snapshot.reconciliationRuns,
      dead_idle_auto_combat_reconciled_events_total: snapshot.reconciledEvents,
      dead_idle_auto_combat_real_sequence_gaps_total: snapshot.realSequenceGaps,
      dead_idle_auto_combat_visibility_returns_total:
        snapshot.visibilityReturns,
      dead_idle_auto_combat_reconnects_total: snapshot.reconnects,
      dead_idle_auto_combat_visual_cycles_after_visibility_return_total:
        snapshot.visualCyclesAfterVisibilityReturn,
      dead_idle_auto_combat_out_of_order_events_total:
        snapshot.outOfOrderEvents,
      dead_idle_auto_combat_compressed_visual_cycles_total:
        snapshot.compressedVisualCycles,
    };

    for (const [name, value] of Object.entries(counters)) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    lines.push(
      '# TYPE dead_idle_auto_combat_realtime_events_by_type_total counter',
    );
    for (const [eventType, value] of Object.entries(
      snapshot.realtimeEventsByType,
    )) {
      lines.push(
        `dead_idle_auto_combat_realtime_events_by_type_total{event_type="${eventType}"} ${value}`,
      );
    }

    lines.push(
      '# TYPE dead_idle_auto_combat_socket_payload_bytes_by_event_total counter',
    );
    for (const [eventName, value] of Object.entries(
      snapshot.socketPayloadBytesByEvent,
    )) {
      lines.push(
        `dead_idle_auto_combat_socket_payload_bytes_by_event_total{event_name="${eventName}"} ${value}`,
      );
    }

    lines.push(
      '# TYPE dead_idle_auto_combat_client_events_by_type_total counter',
    );
    for (const [eventType, value] of Object.entries(
      snapshot.clientEventsByType,
    )) {
      lines.push(
        `dead_idle_auto_combat_client_events_by_type_total{event_type="${eventType}"} ${value}`,
      );
    }

    lines.push(
      '# TYPE dead_idle_auto_combat_client_telemetry_by_context_total counter',
    );
    for (const [context, metrics] of Object.entries(
      snapshot.telemetryByContext,
    )) {
      for (const [metric, value] of Object.entries(metrics)) {
        lines.push(
          `dead_idle_auto_combat_client_telemetry_by_context_total{context="${context}",metric="${metric}"} ${value}`,
        );
      }
    }

    lines.push('# TYPE dead_idle_auto_combat_active_loops gauge');
    lines.push(`dead_idle_auto_combat_active_loops ${snapshot.activeLoops}`);
    lines.push('# TYPE dead_idle_auto_combat_active_sockets gauge');
    lines.push(
      `dead_idle_auto_combat_active_sockets ${snapshot.activeSockets}`,
    );

    const series: Array<[string, MetricSeriesSummary]> = [
      ['tick_duration_ms', snapshot.tickDuration],
      ['processing_lock_wait_ms', snapshot.processingLockWait],
      ['event_emission_delay_ms', snapshot.eventEmissionDelay],
      ['client_event_transit_delay_ms', snapshot.clientEventTransitDelay],
      ['client_queue_depth', snapshot.clientQueueDepth],
      ['visual_cycle_duration_ms', snapshot.visualCycleDuration],
      ['visual_cycle_ratio_percent', snapshot.visualCycleRatioPercent],
      ['hidden_duration_ms', snapshot.hiddenDuration],
      [
        'visual_cycle_after_visibility_duration_ms',
        snapshot.visualCycleAfterVisibilityDuration,
      ],
      [
        'visual_cycle_after_visibility_ratio_percent',
        snapshot.visualCycleAfterVisibilityRatioPercent,
      ],
    ];

    for (const [name, summary] of series) {
      const metricName = `dead_idle_auto_combat_${name}`;
      lines.push(`# TYPE ${metricName} gauge`);
      lines.push(`${metricName}{stat="samples"} ${summary.samples}`);
      lines.push(`${metricName}{stat="average"} ${summary.average}`);
      lines.push(`${metricName}{stat="p50"} ${summary.p50}`);
      lines.push(`${metricName}{stat="p95"} ${summary.p95}`);
      lines.push(`${metricName}{stat="p99"} ${summary.p99}`);
      lines.push(`${metricName}{stat="max"} ${summary.max}`);
    }
  }

  private recordSeriesSample(
    series: TimedMetricSample[],
    rawValue: number,
    now = Date.now(),
  ) {
    const value = this.toNonNegativeFiniteNumber(rawValue);

    if (value === null) {
      return;
    }

    series.push({
      value,
      recordedAt: now,
      sequence: this.nextMetricSampleSequence(),
    });
    this.pruneSeries(series, now);
  }

  private summarizeSeries(
    series: TimedMetricSample[],
    now = Date.now(),
    minimumRecordedAt = 0,
    minimumSequence = 0,
  ): MetricSeriesSummary {
    this.pruneSeries(series, now);
    const cutoff = Math.max(now - METRIC_WINDOW_MS, minimumRecordedAt);
    const values = series
      .filter(
        (sample) =>
          sample.recordedAt >= cutoff && sample.sequence > minimumSequence,
      )
      .map((sample) => sample.value)
      .sort((left, right) => left - right);

    if (values.length === 0) {
      return { samples: 0, average: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    }

    const total = values.reduce((sum, value) => sum + value, 0);

    return {
      samples: values.length,
      average: this.roundMetric(total / values.length),
      p50: this.roundMetric(this.getPercentile(values, 0.5)),
      p95: this.roundMetric(this.getPercentile(values, 0.95)),
      p99: this.roundMetric(this.getPercentile(values, 0.99)),
      max: this.roundMetric(values[values.length - 1]),
    };
  }

  private pruneSeries(series: TimedMetricSample[], now = Date.now()) {
    const cutoff = now - METRIC_WINDOW_MS;
    let firstValidIndex = 0;

    while (
      firstValidIndex < series.length &&
      series[firstValidIndex].recordedAt < cutoff
    ) {
      firstValidIndex += 1;
    }

    if (firstValidIndex > 0) {
      series.splice(0, firstValidIndex);
    }

    if (series.length > MAX_SERIES_SAMPLES) {
      series.splice(0, series.length - MAX_SERIES_SAMPLES);
    }
  }

  private getPercentile(sortedValues: number[], percentile: number) {
    const index = Math.max(
      0,
      Math.min(
        sortedValues.length - 1,
        Math.ceil(sortedValues.length * percentile) - 1,
      ),
    );

    return sortedValues[index];
  }

  private roundMetric(value: number) {
    return Number(value.toFixed(2));
  }

  private incrementMetricCounter(counter: Map<string, number>, key: string) {
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }

  private incrementMetricCounterBy(
    counter: Map<string, number>,
    key: string,
    amount: number,
  ) {
    counter.set(key, (counter.get(key) ?? 0) + amount);
  }

  private toMetricCounterDeltaRecord(
    counter: Map<string, number>,
    baseline?: Map<string, number>,
  ): Record<string, number> {
    const entries = [...counter.entries()]
      .map(([key, value]): [string, number] => [
        key,
        this.counterDelta(value, baseline?.get(key)),
      ])
      .filter(([, value]) => value > 0)
      .sort(([left], [right]) => left.localeCompare(right));

    return Object.fromEntries(entries);
  }

  private createAutoCombatCapture(
    source: AutoCombatCapture['source'],
  ): AutoCombatCapture {
    return {
      id: randomUUID(),
      startedAt: Date.now(),
      minimumSampleSequence: this.metricSampleSequence,
      source,
      autoCombatBaseline: this.snapshotAutoCombatCounters(),
      httpBaseline: new Map(
        [...this.metrics.entries()].map(([route, metric]) => [
          route,
          {
            requests: metric.requests,
            errors: metric.errors,
            durationMs: metric.durationMs,
          },
        ]),
      ),
    };
  }

  private buildCaptureMetadata(now = Date.now()) {
    return {
      id: this.autoCombatCapture.id,
      source: this.autoCombatCapture.source,
      startedAt: new Date(this.autoCombatCapture.startedAt).toISOString(),
      elapsedSeconds: Math.max(
        0,
        Math.floor((now - this.autoCombatCapture.startedAt) / 1000),
      ),
    };
  }

  private snapshotAutoCombatCounters(): AutoCombatCounterBaseline {
    return {
      ticks: this.autoCombatMetrics.ticks,
      tickErrors: this.autoCombatMetrics.tickErrors,
      distributedLockMisses: this.autoCombatMetrics.distributedLockMisses,
      realtimeEventsEmitted: this.autoCombatMetrics.realtimeEventsEmitted,
      realtimeEventsByType: new Map(
        this.autoCombatMetrics.realtimeEventsByType,
      ),
      socketPayloadEmissions: this.autoCombatMetrics.socketPayloadEmissions,
      socketPayloadBytes: this.autoCombatMetrics.socketPayloadBytes,
      socketPayloadEmissionsByEvent: new Map(
        this.autoCombatMetrics.socketPayloadEmissionsByEvent,
      ),
      socketPayloadBytesByEvent: new Map(
        this.autoCombatMetrics.socketPayloadBytesByEvent,
      ),
      socketConnections: this.autoCombatMetrics.socketConnections,
      socketDisconnects: this.autoCombatMetrics.socketDisconnects,
      clientEventReports: this.autoCombatMetrics.clientEventReports,
      clientEventsByType: new Map(this.autoCombatMetrics.clientEventsByType),
      visualCycleReports: this.autoCombatMetrics.visualCycleReports,
      sequenceGaps: this.autoCombatMetrics.sequenceGaps,
      duplicateEvents: this.autoCombatMetrics.duplicateEvents,
      suppressedEvents: this.autoCombatMetrics.suppressedEvents,
      reconciliationRuns: this.autoCombatMetrics.reconciliationRuns,
      reconciledEvents: this.autoCombatMetrics.reconciledEvents,
      realSequenceGaps: this.autoCombatMetrics.realSequenceGaps,
      visibilityReturns: this.autoCombatMetrics.visibilityReturns,
      reconnects: this.autoCombatMetrics.reconnects,
      eventEmissionDelaySamples:
        this.autoCombatMetrics.eventEmissionDelaySamples,
      clientTransitDelaySamples:
        this.autoCombatMetrics.clientTransitDelaySamples,
      outOfOrderEvents: this.autoCombatMetrics.outOfOrderEvents,
      compressedVisualCycles: this.autoCombatMetrics.compressedVisualCycles,
      visualCyclesAfterVisibilityReturn:
        this.autoCombatMetrics.visualCyclesAfterVisibilityReturn,
      telemetryByContext: new Map(
        [...this.autoCombatMetrics.telemetryByContext.entries()].map(
          ([context, counters]) => [context, { ...counters }],
        ),
      ),
    };
  }

  private buildAutoCombatContextSnapshot(
    baseline?: Map<AutoCombatTelemetryContext, AutoCombatContextCounters>,
  ): Record<AutoCombatTelemetryContext, AutoCombatContextCounters> {
    return Object.fromEntries(
      AUTO_COMBAT_TELEMETRY_CONTEXTS.map((context) => {
        const current = this.getAutoCombatContextCounters(context);
        const previous = baseline?.get(context);

        return [
          context,
          {
            reports: this.counterDelta(current.reports, previous?.reports),
            eventsReceived: this.counterDelta(
              current.eventsReceived,
              previous?.eventsReceived,
            ),
            duplicateEvents: this.counterDelta(
              current.duplicateEvents,
              previous?.duplicateEvents,
            ),
            suppressedEvents: this.counterDelta(
              current.suppressedEvents,
              previous?.suppressedEvents,
            ),
            reconciliationRuns: this.counterDelta(
              current.reconciliationRuns,
              previous?.reconciliationRuns,
            ),
            reconciledEvents: this.counterDelta(
              current.reconciledEvents,
              previous?.reconciledEvents,
            ),
            realSequenceGaps: this.counterDelta(
              current.realSequenceGaps,
              previous?.realSequenceGaps,
            ),
            visualCycles: this.counterDelta(
              current.visualCycles,
              previous?.visualCycles,
            ),
            visualCyclesAfterVisibilityReturn: this.counterDelta(
              current.visualCyclesAfterVisibilityReturn,
              previous?.visualCyclesAfterVisibilityReturn,
            ),
            visibilityReturns: this.counterDelta(
              current.visibilityReturns,
              previous?.visibilityReturns,
            ),
            reconnects: this.counterDelta(
              current.reconnects,
              previous?.reconnects,
            ),
          },
        ] as [AutoCombatTelemetryContext, AutoCombatContextCounters];
      }),
    ) as Record<AutoCombatTelemetryContext, AutoCombatContextCounters>;
  }

  private getAutoCombatContextCounters(
    context: AutoCombatTelemetryContext,
  ): AutoCombatContextCounters {
    const existing = this.autoCombatMetrics.telemetryByContext.get(context);

    if (existing) {
      return existing;
    }

    const counters: AutoCombatContextCounters = {
      reports: 0,
      eventsReceived: 0,
      duplicateEvents: 0,
      suppressedEvents: 0,
      reconciliationRuns: 0,
      reconciledEvents: 0,
      realSequenceGaps: 0,
      visualCycles: 0,
      visualCyclesAfterVisibilityReturn: 0,
      visibilityReturns: 0,
      reconnects: 0,
    };
    this.autoCombatMetrics.telemetryByContext.set(context, counters);
    return counters;
  }

  private normalizeAutoCombatTelemetryContext(
    value?: string | null,
  ): AutoCombatTelemetryContext {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase() as AutoCombatTelemetryContext;

    return AUTO_COMBAT_TELEMETRY_CONTEXTS.includes(normalized)
      ? normalized
      : 'unknown';
  }

  private buildCoverage(sampled: number, eligible: number) {
    return {
      eligible,
      sampled,
      percent:
        eligible > 0
          ? this.roundMetric(Math.min(100, (sampled / eligible) * 100))
          : 0,
    };
  }

  private nextMetricSampleSequence() {
    this.metricSampleSequence += 1;
    return this.metricSampleSequence;
  }

  private counterDelta(current: number, baseline = 0) {
    return Math.max(0, current - baseline);
  }

  private normalizeAutoCombatEventType(value?: string | null) {
    const normalized =
      typeof value === 'string' ? value.trim().toUpperCase() : '';

    return AUTO_COMBAT_EVENT_TYPES.has(normalized) ? normalized : 'OTHER';
  }

  private toNonNegativeFiniteNumber(value: unknown) {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }

  private normalizeRoute(route: string) {
    return route
      .split('?')[0]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }
}
