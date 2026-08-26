import {
  GatheringGateway,
  getGatheringStatusScheduleDelayMs,
} from './gathering.gateway';

function createSocket(token?: string) {
  return {
    id: 'socket-1',
    data: {},
    handshake: {
      auth: token ? { token } : {},
      query: {},
      headers: {},
    },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  };
}

describe('GatheringGateway', () => {
  const socketAuth = {
    authenticate: jest.fn(),
  };
  const prisma = {
    character: {
      findFirst: jest.fn(),
    },
  };
  const gatheringService = {
    getStatus: jest.fn(),
  };

  let gateway: GatheringGateway;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    gateway = new GatheringGateway(
      socketAuth as never,
      prisma as never,
      gatheringService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('desconecta sockets sem JWT', async () => {
    const socket = createSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.emit).toHaveBeenCalledWith('gathering:error', {
      message: 'Token de autenticação não enviado no WebSocket.',
    });
    expect(socketAuth.authenticate).not.toHaveBeenCalled();
  });

  it('impede entrar na sala de personagem de outro usuário', async () => {
    const socket = createSocket('valid-token');
    socketAuth.authenticate.mockResolvedValue({
      id: 'user-1',
      email: 'survivor@example.com',
    });
    prisma.character.findFirst.mockResolvedValue(null);

    await gateway.handleConnection(socket as never);
    const result = await gateway.handleJoin(socket as never, {
      characterId: 'foreign-character',
    });

    expect(prisma.character.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-character',
        userId: 'user-1',
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    expect(socket.join).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      message: 'Personagem não encontrado para este usuário.',
    });
  });

  it('entra apenas na sala autorizada e consulta status com userId', async () => {
    const socket = createSocket('valid-token');
    socketAuth.authenticate.mockResolvedValue({
      id: 'user-1',
      email: 'survivor@example.com',
    });
    prisma.character.findFirst.mockResolvedValue({
      id: 'character-1',
      name: 'Sobrevivente',
    });
    gatheringService.getStatus.mockResolvedValue({ active: false });

    await gateway.handleConnection(socket as never);
    const result = await gateway.handleJoin(socket as never, {
      characterId: 'character-1',
    });

    expect(socket.join).toHaveBeenCalledWith('gathering:character-1');
    expect(gatheringService.getStatus).toHaveBeenCalledWith(
      'user-1',
      'character-1',
    );
    expect(result).toEqual({
      ok: true,
      characterId: 'character-1',
      room: 'gathering:character-1',
    });

    gateway.handleDisconnect(socket as never);
  });
});

describe('getGatheringStatusScheduleDelayMs', () => {
  const nowMs = Date.parse('2026-08-26T12:00:00.000Z');

  it('agenda a próxima emissão logo depois do fim canônico do ciclo', () => {
    expect(
      getGatheringStatusScheduleDelayMs(
        {
          active: true,
          timeline: {
            endsAt: '2026-08-26T12:00:05.000Z',
          },
        },
        nowMs,
      ),
    ).toBe(5_075);
  });

  it('usa heartbeat sem timeline e não agenda gathering inativo', () => {
    expect(getGatheringStatusScheduleDelayMs({ active: true }, nowMs)).toBe(
      30_000,
    );
    expect(
      getGatheringStatusScheduleDelayMs({ active: false }, nowMs),
    ).toBeNull();
  });

  it('limita ciclos longos ao heartbeat e ciclos vencidos ao atraso mínimo', () => {
    expect(
      getGatheringStatusScheduleDelayMs(
        {
          active: true,
          session: {
            timeline: {
              endsAt: '2026-08-26T12:01:00.000Z',
            },
          },
        },
        nowMs,
      ),
    ).toBe(30_000);
    expect(
      getGatheringStatusScheduleDelayMs(
        {
          active: true,
          productionPreview: {
            timeline: {
              endsAt: '2026-08-26T11:59:59.000Z',
            },
          },
        },
        nowMs,
      ),
    ).toBe(25);
  });
});
