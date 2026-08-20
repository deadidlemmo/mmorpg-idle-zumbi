import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { REDIS_COORDINATION_CLIENT } from '../redis/redis.constants';
import { PrismaService } from '../../prisma/prisma.service';

type RouteMetrics = {
  requests: number;
  errors: number;
  durationMs: number;
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
    };

    current.requests += 1;
    current.durationMs += params.durationMs;

    if (params.statusCode >= 500) {
      current.errors += 1;
      this.recentErrors.push(Date.now());
    }

    this.metrics.set(key, current);
    this.pruneRecentErrors();
    this.emitOperationalAlerts();

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
    const alerts = this.getAlerts(memory.heapUsed);
    const ready = database === 'up' && (!redisRequired || redis === 'up');

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
      alerts,
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

    return `${lines.join('\n')}\n`;
  }

  private getAlerts(heapUsedBytes: number) {
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

    return alerts;
  }

  private pruneRecentErrors() {
    const cutoff = Date.now() - 5 * 60 * 1000;

    while (this.recentErrors[0] && this.recentErrors[0] < cutoff) {
      this.recentErrors.shift();
    }
  }

  private emitOperationalAlerts() {
    const now = Date.now();
    const alertCooldownMs = 5 * 60 * 1000;
    const maxErrors =
      Number(this.configService.get<string>('ALERT_MAX_ERRORS_5M')) || 25;
    const maxHeapMb =
      Number(this.configService.get<string>('ALERT_MAX_HEAP_MB')) || 768;
    const heapUsedMb = process.memoryUsage().heapUsed / 1024 / 1024;

    if (
      this.recentErrors.length >= maxErrors &&
      now - (this.lastAlertAt.get('HTTP_5XX_SPIKE') ?? 0) >= alertCooldownMs
    ) {
      this.lastAlertAt.set('HTTP_5XX_SPIKE', now);
      this.logger.error(
        JSON.stringify({
          event: 'operational_alert',
          code: 'HTTP_5XX_SPIKE',
          errorsInFiveMinutes: this.recentErrors.length,
        }),
      );
    }

    if (
      heapUsedMb >= maxHeapMb &&
      now - (this.lastAlertAt.get('HIGH_HEAP_USAGE') ?? 0) >= alertCooldownMs
    ) {
      this.lastAlertAt.set('HIGH_HEAP_USAGE', now);
      this.logger.warn(
        JSON.stringify({
          event: 'operational_alert',
          code: 'HIGH_HEAP_USAGE',
          heapUsedMb: Math.round(heapUsedMb),
          thresholdMb: maxHeapMb,
        }),
      );
    }
  }

  private normalizeRoute(route: string) {
    return route
      .split('?')[0]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }
}
