import { OperationalAlertDispatcher } from './operational-alert-dispatcher.service';

describe('OperationalAlertDispatcher', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envia alerta com bearer token ao webhook configurado', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    const values: Record<string, string> = {
      ALERT_WEBHOOK_URL: 'https://alerts.example.test/dead-idle',
      ALERT_WEBHOOK_TOKEN: 'alert-secret',
      ALERT_WEBHOOK_TIMEOUT_MS: '1000',
      NODE_ENV: 'test',
    };
    const dispatcher = new OperationalAlertDispatcher({
      get: jest.fn((key: string) => values[key]),
    } as never);

    await dispatcher.dispatch({
      code: 'BACKUP_FAILED',
      severity: 'critical',
      message: 'Falha no backup.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestedUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestedUrl).toBe(values.ALERT_WEBHOOK_URL);
    expect(requestInit?.method).toBe('POST');
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer alert-secret',
    );
  });

  it('nao realiza chamada quando o webhook nao esta configurado', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const dispatcher = new OperationalAlertDispatcher({
      get: jest.fn(() => undefined),
    } as never);

    await dispatcher.dispatch({
      code: 'HIGH_HEAP_USAGE',
      severity: 'warning',
      message: 'Heap elevado.',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
