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
    });
    expect(snapshot.http.routes[0].route).toBe('GET /characters/:id/status');
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
});
