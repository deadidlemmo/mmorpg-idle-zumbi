import { getCraftingStatusScheduleDelayMs } from './crafting.gateway';

describe('getCraftingStatusScheduleDelayMs', () => {
  const nowMs = Date.parse('2026-08-26T12:00:00.000Z');

  it('agenda a próxima emissão logo depois do fim canônico da criação', () => {
    expect(
      getCraftingStatusScheduleDelayMs(
        {
          active: true,
          activeSession: {
            timeline: { endsAt: '2026-08-26T12:00:05.000Z' },
          },
        },
        nowMs,
      ),
    ).toBe(5_075);
  });

  it('usa heartbeat sem data válida e não agenda criação inativa', () => {
    expect(
      getCraftingStatusScheduleDelayMs(
        { active: true, activeSession: {} },
        nowMs,
      ),
    ).toBe(30_000);
    expect(
      getCraftingStatusScheduleDelayMs({ active: false }, nowMs),
    ).toBeNull();
  });

  it('limita sessões longas ao heartbeat e vencidas ao atraso mínimo', () => {
    expect(
      getCraftingStatusScheduleDelayMs(
        {
          active: true,
          activeSession: { completesAt: '2026-08-26T12:01:00.000Z' },
        },
        nowMs,
      ),
    ).toBe(30_000);
    expect(
      getCraftingStatusScheduleDelayMs(
        {
          active: true,
          activeSession: { completesAt: '2026-08-26T11:59:59.000Z' },
        },
        nowMs,
      ),
    ).toBe(25);
  });
});
