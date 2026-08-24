import { AutoCombatGateway } from './auto-combat.gateway';

describe('AutoCombatGateway realtime transport', () => {
  function createGateway() {
    const emit = jest.fn<void, [event: string, payload: unknown]>();
    const to = jest.fn(() => ({ emit }));
    const observability = {
      recordAutoCombatSocketEmission: jest.fn(),
    };
    const gateway = new AutoCombatGateway(
      {} as never,
      {} as never,
      observability as never,
    );

    gateway.server = { to } as never;

    return { gateway, emit, to, observability };
  }

  it('compacta e suprime o segundo snapshot identico do mesmo ciclo', () => {
    const { gateway, emit, observability } = createGateway();
    const status = {
      active: true,
      serverNow: '2026-08-24T12:00:00.000Z',
      session: {
        id: 'session-1',
        status: 'ACTIVE',
        phase: 'COMBAT_ACTIVE',
      },
      currentMob: {
        id: 'mob-1',
        name: 'Síndico Devorado',
        battleProgress: {
          activityInstanceId: 'session-1',
          cycleEndsAt: '2026-08-24T12:00:03.000Z',
          serverNow: '2026-08-24T12:00:00.000Z',
        },
      },
      inventory: Array.from({ length: 100 }, (_, index) => ({ index })),
    };

    gateway.emitStatus('character-1', status);
    gateway.emitSessionUpdated('character-1', status);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toBe('auto-combat:status');
    expect(emit.mock.calls[0]?.[1]).toMatchObject({
      active: true,
      currentMob: { id: 'mob-1' },
    });
    expect(emit.mock.calls[0]?.[1]).not.toHaveProperty('inventory');
    expect(observability.recordAutoCombatSocketEmission).toHaveBeenCalledTimes(
      1,
    );
  });

  it('publica cada evento apenas no canal canonico', () => {
    const { gateway, emit } = createGateway();
    const event = {
      type: 'MOB_DEFEATED',
      eventId: 'event-1',
      sequence: 10,
    };

    gateway.emitMobDefeated('character-1', event);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('auto-combat:event', event);
  });
});
