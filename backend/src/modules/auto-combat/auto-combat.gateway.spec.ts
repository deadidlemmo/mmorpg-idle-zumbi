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

  it('deduplica a presença do personagem entre sockets e limpa ao sair', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          name: 'Sobrevivente',
        }),
      },
    };
    const observability = {
      recordAutoCombatSocketConnection: jest.fn(),
    };
    const gateway = new AutoCombatGateway(
      {} as never,
      prisma as never,
      observability as never,
    );
    const createSocket = (id: string) => ({
      id,
      data: {
        userId: 'user-1',
        joinedCharacterRooms: new Set<string>(),
        joinedCharacterIds: new Set<string>(),
      },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
    });
    const firstSocket = createSocket('socket-1');
    const secondSocket = createSocket('socket-2');

    await gateway.handleJoinAutoCombatRoom(firstSocket as never, {
      characterId: 'character-1',
    });
    await gateway.handleJoinAutoCombatRoom(secondSocket as never, {
      characterId: 'character-1',
    });

    expect([...gateway.getOnlineCharacterIds()]).toEqual(['character-1']);

    await gateway.handleLeaveAutoCombatRoom(firstSocket as never, {
      characterId: 'character-1',
    });
    expect([...gateway.getOnlineCharacterIds()]).toEqual(['character-1']);

    gateway.handleDisconnect(secondSocket as never);
    expect(gateway.getOnlineCharacterIds().size).toBe(0);
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
