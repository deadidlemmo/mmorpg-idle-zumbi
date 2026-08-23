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
};

type AlertContext = {
  database?: 'up' | 'down';
  redis?: 'up' | 'down' | 'disabled';
  redisRequired?: boolean;
  requestDurationMs?: number;
};

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly metrics = new Map<string, RouteMetrics>();
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
    };

    current.requests += 1;
    current.durationMs += params.durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, params.durationMs);

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
    const routeMetrics = [...this.metrics.entries()].map(([route, metric]) => ({
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
    }));
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

    return {
      generatedAt: new Date().toISOString(),
      health,
      http: {
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
        routes: routeMetrics
          .sort(
            (left, right) => right.averageDurationMs - left.averageDurationMs,
          )
          .slice(0, 10),
      },
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

  private normalizeRoute(route: string) {
    return route
      .split('?')[0]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }
}
