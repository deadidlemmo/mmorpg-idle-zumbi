import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  function createService(
    options: {
      databaseAvailable?: boolean;
      config?: Record<string, string>;
    } = {},
  ) {
    const prisma = {
      $queryRaw:
        options.databaseAvailable === false
          ? jest.fn().mockRejectedValue(new Error('offline'))
          : jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          ALERT_MAX_ERRORS_5M: '10',
          ALERT_MAX_HEAP_MB: '99999',
          ALERT_MAX_REQUEST_DURATION_MS: '5000',
          ALERT_COOLDOWN_SECONDS: '300',
          REDIS_REQUIRED: 'false',
          NODE_ENV: 'test',
          ...options.config,
        };
        return values[key];
      }),
    };
    const backupStatus = {
      getStatus: jest.fn(() => ({
        state: 'healthy',
        maxAgeHours: 26,
        verificationMaxAgeHours: 168,
        backupAgeHours: 1,
        verificationAgeHours: 1,
        lastBackup: {
          status: 'success',
          createdAt: '2026-08-21T10:00:00.000Z',
        },
        lastVerification: {
          status: 'success',
          verifiedAt: '2026-08-21T10:30:00.000Z',
        },
        lastRestore: null,
      })),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const service = new ObservabilityService(
      prisma as never,
      config as never,
      null,
      backupStatus as never,
      dispatcher as never,
    );

    return { service, dispatcher };
  }

  it('agrega requisicoes, erros e latencia no snapshot administrativo', async () => {
    const { service } = createService();
    service.startRequest();
    service.finishRequest({
      method: 'GET',
      route: '/characters/87a3497e-1f71-4dc8-9f3d-853cd0a9db46/status',
      statusCode: 200,
      durationMs: 40,
    });
    service.startRequest();
    service.finishRequest({
      method: 'GET',
      route: '/characters/87a3497e-1f71-4dc8-9f3d-853cd0a9db46/status',
      statusCode: 500,
      durationMs: 80,
    });

    const snapshot = await service.getOperationalSnapshot();

    expect(snapshot.http).toMatchObject({
      inFlightRequests: 0,
      requests: 2,
      errors: 1,
      errorRatePercent: 50,
      averageDurationMs: 60,
      maxDurationMs: 80,
      sampleWindowMinutes: 15,
      recentLatency: {
        samples: 2,
        average: 60,
        p50: 40,
        p95: 80,
        p99: 80,
        max: 80,
      },
    });
    expect(snapshot.http.routes[0].route).toBe('GET /characters/:id/status');
    expect(snapshot.http.routes[0].recentLatency).toEqual({
      samples: 2,
      average: 60,
      p50: 40,
      p95: 80,
      p99: 80,
      max: 80,
    });
    expect(snapshot.health.backup.lastBackup).toMatchObject({
      status: 'success',
    });
  });

  it('nao expoe detalhes internos do backup no health publico', async () => {
    const { service } = createService();

    const health = await service.getHealth();

    expect(health.backup).toMatchObject({
      state: 'healthy',
      backupAgeHours: 1,
      verificationAgeHours: 1,
    });
    expect(health.backup).not.toHaveProperty('lastBackup');
    expect(health.backup).not.toHaveProperty('lastRestore');
  });

  it('alerta quando o banco de dados fica indisponivel', async () => {
    const { service, dispatcher } = createService({
      databaseAvailable: false,
    });

    const health = await service.getHealth();

    expect(health.ready).toBe(false);
    expect(health.alerts).toContainEqual({
      code: 'DATABASE_DOWN',
      severity: 'critical',
      message: 'PostgreSQL indisponivel no health check.',
    });
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it('alerta quando uma requisicao ultrapassa o limite de latencia', () => {
    const { service, dispatcher } = createService({
      config: { ALERT_MAX_REQUEST_DURATION_MS: '50' },
    });

    service.startRequest();
    service.finishRequest({
      method: 'GET',
      route: '/health',
      statusCode: 200,
      durationMs: 80,
    });

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it('expoe timestamps de backup nas metricas Prometheus', () => {
    const { service } = createService();
    const metrics = service.renderPrometheusMetrics();

    expect(metrics).toContain(
      'dead_idle_backup_last_success_timestamp_seconds 1787306400',
    );
    expect(metrics).toContain(
      'dead_idle_backup_last_verification_timestamp_seconds 1787308200',
    );
  });

  it('registra a linha de base operacional do auto-combate', async () => {
    const { service } = createService();

    service.setAutoCombatActiveLoops(2);
    service.recordAutoCombatTick({ durationMs: 80, acquired: true });
    service.recordAutoCombatTick({ durationMs: 240, acquired: false });
    service.recordAutoCombatTickError();
    service.recordAutoCombatProcessingLockWait(150);
    service.recordAutoCombatRealtimeEvent({
      eventType: 'MOB_SPAWNED',
      emissionDelayMs: 35,
    });
    service.recordAutoCombatSocketConnection(true);
    service.recordAutoCombatClientTelemetry({
      kind: 'EVENT_RECEIVED',
      eventType: 'MOB_SPAWNED',
      transitDelayMs: 480,
      queueDepth: 3,
      sequenceGap: 2,
      outOfOrder: true,
    });
    service.recordAutoCombatClientTelemetry({
      kind: 'VISUAL_CYCLE',
      visualDurationMs: 420,
      expectedDurationMs: 1000,
    });

    const snapshot = await service.getOperationalSnapshot();

    expect(snapshot.autoCombat).toMatchObject({
      sampleWindowMinutes: 15,
      ticks: 2,
      tickErrors: 1,
      distributedLockMisses: 1,
      activeLoops: 2,
      realtimeEventsEmitted: 1,
      realtimeEventsByType: { MOB_SPAWNED: 1 },
      socketConnections: 1,
      activeSockets: 1,
      clientEventReports: 1,
      clientEventsByType: { MOB_SPAWNED: 1 },
      visualCycleReports: 1,
      sequenceGaps: 2,
      outOfOrderEvents: 1,
      compressedVisualCycles: 1,
      tickDuration: {
        samples: 2,
        average: 160,
        p50: 80,
        p95: 240,
      },
      clientEventTransitDelay: {
        samples: 1,
        p95: 480,
      },
      visualCycleRatioPercent: {
        samples: 1,
        p50: 42,
      },
    });

    const metrics = service.renderPrometheusMetrics();
    expect(metrics).toContain('dead_idle_auto_combat_ticks_total 2');
    expect(metrics).toContain(
      'dead_idle_auto_combat_client_event_transit_delay_ms{stat="p95"} 480',
    );
    expect(metrics).toContain(
      'dead_idle_auto_combat_realtime_events_by_type_total{event_type="MOB_SPAWNED"} 1',
    );
  });

  it('remove amostras anteriores a janela movel de quinze minutos', async () => {
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-08-23T12:00:00.000Z'));

    try {
      const { service } = createService();
      service.recordAutoCombatTick({ durationMs: 900, acquired: true });

      nowSpy.mockReturnValue(Date.parse('2026-08-23T12:16:00.000Z'));
      service.recordAutoCombatTick({ durationMs: 120, acquired: true });

      const snapshot = await service.getOperationalSnapshot();

      expect(snapshot.autoCombat.tickDuration).toEqual({
        samples: 1,
        average: 120,
        p50: 120,
        p95: 120,
        p99: 120,
        max: 120,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });
});
