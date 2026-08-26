import { getIncursionStatusScheduleDelayMs } from './incursions.gateway';

describe('getIncursionStatusScheduleDelayMs', () => {
  const nowMs = Date.parse('2026-08-26T12:00:00.000Z');

  it('agenda a próxima emissão logo depois do fim canônico da incursão', () => {
    expect(
      getIncursionStatusScheduleDelayMs(
        {
          activeSession: {
            status: 'ACTIVE',
            timeline: { endsAt: '2026-08-26T12:00:05.000Z' },
          },
        },
        nowMs,
      ),
    ).toBe(5_075);
  });

  it('usa heartbeat sem data válida e não agenda sessão encerrada', () => {
    expect(
      getIncursionStatusScheduleDelayMs(
        { activeSession: { status: 'ACTIVE' } },
        nowMs,
      ),
    ).toBe(30_000);
    expect(
      getIncursionStatusScheduleDelayMs(
        { activeSession: { status: 'COMPLETED' } },
        nowMs,
      ),
    ).toBeNull();
  });

  it('aceita payload de início e limita prazos extremos', () => {
    expect(
      getIncursionStatusScheduleDelayMs(
        {
          session: {
            status: 'ACTIVE',
            endsAt: '2026-08-26T12:01:00.000Z',
          },
        },
        nowMs,
      ),
    ).toBe(30_000);
    expect(
      getIncursionStatusScheduleDelayMs(
        {
          session: {
            status: 'ACTIVE',
            endsAt: '2026-08-26T11:59:59.000Z',
          },
        },
        nowMs,
      ),
    ).toBe(25);
  });
});
