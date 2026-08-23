import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
};

type MetricSeriesSummary = {
  samples: number;
  average: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

type AutoCombatOperationalMetrics = {
  ticks: number;
  tickErrors: number;
  distributedLockMisses: number;
  activeLoops: number;
  realtimeEventsEmitted: number;
  realtimeEventsByType: Map<string, number>;
  socketConnections: number;
  socketDisconnects: number;
  activeSockets: number;
  clientEventReports: number;
  clientEventsByType: Map<string, number>;
  visualCycleReports: number;
  sequenceGaps: number;
  outOfOrderEvents: number;
  compressedVisualCycles: number;
  tickDurations: TimedMetricSample[];
  processingLockWaitDurations: TimedMetricSample[];
  eventEmissionDelays: TimedMetricSample[];
  clientEventTransitDelays: TimedMetricSample[];
  clientQueueDepths: TimedMetricSample[];
  visualCycleDurations: TimedMetricSample[];
  visualCycleRatios: TimedMetricSample[];
};

type AlertContext = {
  database?: 'up' | 'down';
  redis?: 'up' | 'down' | 'disabled';
  redisRequired?: boolean;
  requestDurationMs?: number;
};

const METRIC_WINDOW_MS = 15 * 60 * 1000;
const MAX_SERIES_SAMPLES = 50_000;
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
    socketConnections: 0,
    socketDisconnects: 0,
    activeSockets: 0,
    clientEventReports: 0,
    clientEventsByType: new Map<string, number>(),
    visualCycleReports: 0,
    sequenceGaps: 0,
    outOfOrderEvents: 0,
    compressedVisualCycles: 0,
    tickDurations: [],
    processingLockWaitDurations: [],
    eventEmissionDelays: [],
    clientEventTransitDelays: [],
    clientQueueDepths: [],
    visualCycleDurations: [],
    visualCycleRatios: [],
  };
  private readonly recentErrors: number[] = [];
  private readonly lastAlertAt = new Map<string, number>();
  private inFlightRequests = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional()
    @Inject(REDIS_COORDINATION_CLIENT)
    private readonly redis: Redis | null,
    private readonly backupStatusService: BackupStatusService,
    private readonly alertDispatcher: OperationalAlertDispatcher,
  ) {}

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
      current.errors += 1;
      this.recentErrors.push(Date.now());
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

    if (
      params.emissionDelayMs !== null &&
      params.emissionDelayMs !== undefined
    ) {
      this.recordSeriesSample(
        this.autoCombatMetrics.eventEmissionDelays,
        params.emissionDelayMs,
      );
    }
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
    kind: 'EVENT_RECEIVED' | 'VISUAL_CYCLE';
    eventType?: string | null;
    transitDelayMs?: number | null;
    queueDepth?: number | null;
    sequenceGap?: number | null;
    outOfOrder?: boolean;
    visualDurationMs?: number | null;
    expectedDurationMs?: number | null;
  }) {
    if (params.kind === 'EVENT_RECEIVED') {
      this.autoCombatMetrics.clientEventReports += 1;
      this.incrementMetricCounter(
        this.autoCombatMetrics.clientEventsByType,
        this.normalizeAutoCombatEventType(params.eventType),
      );

      if (
        params.transitDelayMs !== null &&
        params.transitDelayMs !== undefined
      ) {
        this.recordSeriesSample(
          this.autoCombatMetrics.clientEventTransitDelays,
          params.transitDelayMs,
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
    this.recordSeriesSample(
      this.autoCombatMetrics.visualCycleDurations,
      visualDurationMs,
    );

    if (expectedDurationMs > 0) {
      const ratioPercent = (visualDurationMs / expectedDurationMs) * 100;
      this.recordSeriesSample(
        this.autoCombatMetrics.visualCycleRatios,
        ratioPercent,
      );

      if (ratioPercent < 90) {
        this.autoCombatMetrics.compressedVisualCycles += 1;
      }
    }
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
        backupAgeHours: backup.backupAgeHours,
        verificationAgeHours: backup.verificationAgeHours,
      },
      alerts,
    };
  }

  async getOperationalSnapshot() {
    const publicHealth = await this.getHealth();
    const health = {
      ...publicHealth,
      backup: this.backupStatusService.getStatus(),
    };
    const routeMetrics = [...this.metrics.entries()].map(([route, metric]) => {
      const recentLatency = this.summarizeSeries(metric.recentDurations);

      return {
        route,
        requests: metric.requests,
        errors: metric.errors,
        errorRatePercent:
          metric.requests > 0
            ? Number(((metric.errors / metric.requests) * 100).toFixed(2))
            : 0,
        averageDurationMs:
          metric.requests > 0
            ? Number((metric.durationMs / metric.requests).toFixed(2))
            : 0,
        maxDurationMs: metric.maxDurationMs,
        recentLatency,
      };
    });
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
    );
    const autoCombat = this.buildAutoCombatSnapshot();

    return {
      generatedAt: new Date().toISOString(),
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

  private buildAutoCombatSnapshot() {
    return {
      sampleWindowMinutes: METRIC_WINDOW_MS / 60_000,
      ticks: this.autoCombatMetrics.ticks,
      tickErrors: this.autoCombatMetrics.tickErrors,
      distributedLockMisses: this.autoCombatMetrics.distributedLockMisses,
      activeLoops: this.autoCombatMetrics.activeLoops,
      realtimeEventsEmitted: this.autoCombatMetrics.realtimeEventsEmitted,
      realtimeEventsByType: this.toMetricCounterRecord(
        this.autoCombatMetrics.realtimeEventsByType,
      ),
      socketConnections: this.autoCombatMetrics.socketConnections,
      socketDisconnects: this.autoCombatMetrics.socketDisconnects,
      activeSockets: this.autoCombatMetrics.activeSockets,
      clientEventReports: this.autoCombatMetrics.clientEventReports,
      clientEventsByType: this.toMetricCounterRecord(
        this.autoCombatMetrics.clientEventsByType,
      ),
      visualCycleReports: this.autoCombatMetrics.visualCycleReports,
      sequenceGaps: this.autoCombatMetrics.sequenceGaps,
      outOfOrderEvents: this.autoCombatMetrics.outOfOrderEvents,
      compressedVisualCycles: this.autoCombatMetrics.compressedVisualCycles,
      tickDuration: this.summarizeSeries(this.autoCombatMetrics.tickDurations),
      processingLockWait: this.summarizeSeries(
        this.autoCombatMetrics.processingLockWaitDurations,
      ),
      eventEmissionDelay: this.summarizeSeries(
        this.autoCombatMetrics.eventEmissionDelays,
      ),
      clientEventTransitDelay: this.summarizeSeries(
        this.autoCombatMetrics.clientEventTransitDelays,
      ),
      clientQueueDepth: this.summarizeSeries(
        this.autoCombatMetrics.clientQueueDepths,
      ),
      visualCycleDuration: this.summarizeSeries(
        this.autoCombatMetrics.visualCycleDurations,
      ),
      visualCycleRatioPercent: this.summarizeSeries(
        this.autoCombatMetrics.visualCycleRatios,
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
      dead_idle_auto_combat_socket_connections_total:
        snapshot.socketConnections,
      dead_idle_auto_combat_socket_disconnects_total:
        snapshot.socketDisconnects,
      dead_idle_auto_combat_client_event_reports_total:
        snapshot.clientEventReports,
      dead_idle_auto_combat_visual_cycle_reports_total:
        snapshot.visualCycleReports,
      dead_idle_auto_combat_sequence_gaps_total: snapshot.sequenceGaps,
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
      '# TYPE dead_idle_auto_combat_client_events_by_type_total counter',
    );
    for (const [eventType, value] of Object.entries(
      snapshot.clientEventsByType,
    )) {
      lines.push(
        `dead_idle_auto_combat_client_events_by_type_total{event_type="${eventType}"} ${value}`,
      );
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

    series.push({ value, recordedAt: now });
    this.pruneSeries(series, now);
  }

  private summarizeSeries(
    series: TimedMetricSample[],
    now = Date.now(),
  ): MetricSeriesSummary {
    this.pruneSeries(series, now);
    const values = series
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

  private toMetricCounterRecord(counter: Map<string, number>) {
    return Object.fromEntries(
      [...counter.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }

  private normalizeAutoCombatEventType(value?: string | null) {
    const normalized =
      typeof value === 'string' ? value.trim().toUpperCase() : '';

    return AUTO_COMBAT_EVENT_TYPES.has(normalized) ? normalized : 'OTHER';
  }

  private toNonNegativeFiniteNumber(value: unknown) {
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
