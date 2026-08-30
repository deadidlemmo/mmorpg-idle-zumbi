import { WorldBossesGateway } from './world-bosses.gateway';

describe('WorldBossesGateway authentication', () => {
  it('aguarda a autenticacao antes de inscrever o socket na sala', async () => {
    let resolveAuthentication: ((user: { id: string }) => void) | undefined;
    const authentication = new Promise<{ id: string }>((resolve) => {
      resolveAuthentication = resolve;
    });
    const socketAuth = {
      authenticate: jest.fn().mockReturnValue(authentication),
    };
    const worldBossesService = {
      getEventStatus: jest.fn().mockResolvedValue({
        event: { id: 'event-1', status: 'SCHEDULED' },
      }),
    };
    const gateway = new WorldBossesGateway(
      socketAuth as never,
      worldBossesService as never,
    );
    const client = {
      id: 'socket-1',
      data: {},
      handshake: {
        auth: { token: 'token-1' },
        headers: {},
      },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    const connection = gateway.handleConnection(client as never);
    const roomJoin = gateway.handleJoin(client as never, {
      eventId: 'event-1',
      characterId: 'character-1',
    });

    await Promise.resolve();
    expect(client.join).not.toHaveBeenCalled();

    resolveAuthentication?.({ id: 'user-1' });
    await Promise.all([connection, roomJoin]);

    expect(client.join).toHaveBeenCalledWith('world-boss:event-1');
    expect(worldBossesService.getEventStatus).toHaveBeenCalledWith(
      'user-1',
      'character-1',
      'event-1',
    );
    expect(client.emit).not.toHaveBeenCalledWith('worldBoss:error', {
      message: 'Socket não autenticado.',
    });
    expect(client.disconnect).not.toHaveBeenCalled();

    gateway.handleDisconnect(client as never);
  });
});

describe('WorldBossesGateway public room updates', () => {
  it('não transmite participante, elegibilidade ou recompensas privadas para a sala', () => {
    const gateway = new WorldBossesGateway({} as never, {} as never);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    const payload = {
      event: { id: 'event-1', status: 'SCHEDULED' },
      participant: { id: 'participant-1' },
      eligible: { canJoin: true },
      rewardsGranted: [{ rewardType: 'GOLD', quantity: 10 }],
      stoppedActivities: ['AUTO_COMBAT'],
      message: 'Inscrição confirmada.',
    };

    gateway.emitRegistered('event-1', payload);

    expect(to).toHaveBeenCalledWith('world-boss:event-1');
    expect(emit).toHaveBeenCalledWith('worldBoss:registered', {
      event: payload.event,
    });
    expect(emit).toHaveBeenCalledWith('worldBoss:lobbyUpdated', {
      event: payload.event,
    });
  });
});
