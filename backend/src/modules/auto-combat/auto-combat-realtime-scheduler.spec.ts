import { getAutoCombatNextRealtimeTickDelayMs } from './auto-combat-realtime-scheduler';

describe('getAutoCombatNextRealtimeTickDelayMs', () => {
  it('agenda o combate pelo restante absoluto do ciclo', () => {
    expect(
      getAutoCombatNextRealtimeTickDelayMs(
        {
          active: true,
          phase: 'COMBAT_ACTIVE',
          battleProgress: {
            remainingMs: 2_340.2,
          },
        },
        250,
      ),
    ).toBe(2_341);
  });

  it('deriva o restante pelos timestamps quando necessario', () => {
    expect(
      getAutoCombatNextRealtimeTickDelayMs(
        {
          active: true,
          phase: 'COMBAT_ACTIVE',
          serverNow: '2026-08-23T12:00:00.000Z',
          battleProgress: {
            cycleEndsAt: '2026-08-23T12:00:01.750Z',
          },
        },
        250,
      ),
    ).toBe(1_750);
  });

  it('agenda a caca pelo vencimento canonico do proximo ciclo', () => {
    expect(
      getAutoCombatNextRealtimeTickDelayMs(
        {
          active: true,
          phase: 'HUNTING',
          serverNow: '2026-08-23T12:00:00.000Z',
          hunting: {
            timeline: {
              endsAt: '2026-08-23T12:00:09.250Z',
            },
          },
        },
        250,
      ),
    ).toBe(9_250);
  });

  it('usa o fallback quando a caca ainda nao possui timeline', () => {
    expect(
      getAutoCombatNextRealtimeTickDelayMs(
        {
          active: true,
          phase: 'HUNTING',
        },
        250,
      ),
    ).toBe(250);
  });

  it('encerra o scheduler quando a sessao deixa de estar ativa', () => {
    expect(
      getAutoCombatNextRealtimeTickDelayMs(
        {
          active: false,
          phase: 'FINISHED',
        },
        250,
      ),
    ).toBeNull();
  });
});
