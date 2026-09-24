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
      { save: jest.fn() } as never,
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
      { save: jest.fn() } as never,
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

    await gateway.handleDisconnect(secondSocket as never);
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

  it('projeta eventos reais da batalha na presenca visual proxima', () => {
    const visualEmit = jest.fn();
    const characterEmit = jest.fn();
    const client = {
      data: {
        huntingVisual: {
          characterId: 'character-1',
          displayName: 'Sobrevivente',
          mapId: 'map-1',
          subMapId: 'sub-1',
          areaId: 'suburbio',
          tileX: 10,
          tileY: 12,
          direction: 'right',
          visualState: 'walking',
          moving: true,
          updatedAt: 1,
        },
      },
      to: jest.fn(() => ({ emit: visualEmit })),
    };
    const gateway = new AutoCombatGateway(
      {} as never,
      {} as never,
      { recordAutoCombatSocketEmission: jest.fn() } as never,
      { save: jest.fn() } as never,
    );
    gateway.server = {
      sockets: { sockets: new Map([['socket-1', client]]) },
      to: jest.fn(() => ({ emit: characterEmit })),
    } as never;

    gateway.emitMobSpawned('character-1', {
      type: 'MOB_SPAWNED',
      eventId: 'event-spawn',
      enemyInstanceId: 'enemy-1',
      mobName: 'Errante do Subúrbio',
    });

    expect(visualEmit).toHaveBeenCalledWith(
      'auto-combat:visual:pose',
      expect.objectContaining({
        characterId: 'character-1',
        visualState: 'combat',
        moving: false,
        combatMobName: 'Errante do Subúrbio',
        combatCycleKey: 'enemy-1',
        combatEventType: 'MOB_SPAWNED',
        combatEventKey: 'event-spawn',
      }),
    );
    expect(characterEmit).toHaveBeenCalledWith(
      'auto-combat:event',
      expect.objectContaining({ eventId: 'event-spawn' }),
    );

    gateway.emitMobDefeated('character-1', {
      type: 'MOB_DEFEATED',
      eventId: 'event-death',
      enemyInstanceId: 'enemy-1',
      mobName: 'Errante do Subúrbio',
    });
    expect(visualEmit).toHaveBeenLastCalledWith(
      'auto-combat:visual:pose',
      expect.objectContaining({
        combatEventType: 'MOB_DEFEATED',
        combatEventKey: 'event-death',
      }),
    );
    const terminalCombat = client.data.huntingVisualCombat as unknown as {
      active: boolean;
      lockedUntil: number;
      anchor: { tileX: number; tileY: number };
    };
    expect(terminalCombat.active).toBe(false);
    expect(typeof terminalCombat.lockedUntil).toBe('number');
    expect(terminalCombat.anchor).toMatchObject({ tileX: 10, tileY: 12 });
  });

  describe('presenca visual autenticada', () => {
    function setup() {
      type VisualSessionQuery = {
        where: {
          characterId: string;
          phase?: { in?: string[] };
        };
      };
      const sockets: Array<{
        id: string;
        data: Record<string, unknown>;
        emit: jest.Mock;
        join: jest.Mock;
        leave: jest.Mock;
        to: jest.Mock;
      }> = [];
      const findFirstQueries: VisualSessionQuery[] = [];
      const findFirst = jest
        .fn()
        .mockImplementation((query: VisualSessionQuery) => {
          findFirstQueries.push(query);
          return Promise.resolve({
            id: 'session',
            mapId: query.where.characterId === 'other' ? 'other-map' : 'map-1',
            subMapId: 'submap-1',
            character: { name: query.where.characterId },
          });
        });
      const save = jest.fn().mockResolvedValue(undefined);
      const gateway = new AutoCombatGateway(
        {} as never,
        { autoCombatSession: { findFirst } } as never,
        { recordAutoCombatSocketConnection: jest.fn() } as never,
        { save } as never,
      );
      gateway.server = {
        in: (room: string) => ({
          fetchSockets: () =>
            Promise.resolve(
              sockets.filter((socket) =>
                (socket.data.rooms as Set<string>).has(room),
              ),
            ),
        }),
      } as never;
      const socket = (id: string, characterId = id) => {
        const rooms = new Set<string>();
        const client = {
          id,
          data: {
            userId: 'user-1',
            joinedCharacterIds: new Set([characterId]),
            rooms,
          } as Record<string, unknown>,
          emit: jest.fn(),
          join: jest.fn((room: string) => {
            rooms.add(room);
            return Promise.resolve();
          }),
          leave: jest.fn((room: string) => {
            rooms.delete(room);
            return Promise.resolve();
          }),
          to: jest.fn(() => ({ emit: jest.fn() })),
        };
        sockets.push(client);
        return client;
      };
      const pose = (characterId: string) => ({
        characterId,
        areaId: 'suburbio',
        tileX: 12.5,
        tileY: 14.5,
        direction: 'down',
        visualState: 'investigating',
        moving: false,
      });
      return { gateway, findFirst, findFirstQueries, socket, pose, save };
    }

    it('aceita e higieniza o estado visual de combate remoto', () => {
      const { gateway, pose } = setup();
      const parsed = (
        gateway as unknown as {
          parseHuntingVisualPose: (value: unknown) => unknown;
        }
      ).parseHuntingVisualPose({
        ...pose('first'),
        visualState: 'combat',
        combatMobName: '  Síndico Devorado  ',
        combatCycleKey: ' session-1:round-4 ',
      });

      expect(parsed).toMatchObject({
        visualState: 'combat',
        moving: false,
        combatMobName: 'Síndico Devorado',
        combatCycleKey: 'session-1:round-4',
      });
    });

    it('grava a pose autenticada no ingresso, durante o trajeto e ao sair', async () => {
      const { gateway, findFirstQueries, socket, pose, save } = setup();
      const client = socket('first');
      await gateway.handleHuntingVisualJoin(
        client as never,
        pose('first') as never,
      );
      expect(save).toHaveBeenCalledWith('session', pose('first'));
      expect(findFirstQueries[0]?.where.phase?.in).toEqual([
        'HUNTING',
        'ENCOUNTER_READY',
        'COMBAT_ACTIVE',
      ]);

      client.data.huntingVisualSavedAt = Date.now() - 1500;
      const nextPose = { ...pose('first'), tileX: 12.8, moving: true };
      expect(
        await gateway.handleHuntingVisualPose(
          client as never,
          nextPose as never,
        ),
      ).toEqual({ ok: true });
      expect(save).toHaveBeenCalledWith('session', nextPose);

      await gateway.handleDisconnect(client as never);
      expect(save).toHaveBeenCalledTimes(3);
      expect(save).toHaveBeenLastCalledWith('session', {
        ...nextPose,
        displayName: 'first',
        mapId: 'map-1',
        subMapId: 'submap-1',
        updatedAt: expect.any(Number) as number,
      });
    });

    it('isola por mapa e area, com snapshot e saida ao desconectar', async () => {
      const { gateway, socket, pose } = setup();
      const first = socket('first');
      const second = socket('second');
      const otherMap = socket('other');
      expect(
        await gateway.handleHuntingVisualJoin(
          first as never,
          pose('first') as never,
        ),
      ).toEqual({ ok: true });
      await gateway.handleHuntingVisualJoin(
        otherMap as never,
        pose('other') as never,
      );
      await gateway.handleHuntingVisualJoin(
        second as never,
        pose('second') as never,
      );
      expect(second.emit).toHaveBeenCalledWith('auto-combat:visual:snapshot', {
        areaId: 'suburbio',
        players: [expect.objectContaining({ characterId: 'first' })],
      });
      await gateway.handleDisconnect(first as never);
      expect(first.to).toHaveBeenCalledWith(
        'auto-combat:visual:map-1:submap-1:suburbio',
      );
      const broadcast = first.to.mock.results.at(-1)?.value as {
        emit: jest.Mock;
      };
      expect(broadcast.emit).toHaveBeenCalledWith('auto-combat:visual:left', {
        characterId: 'first',
      });
    });

    it('rejeita ator alheio, limites invalidos e saltos anormais', async () => {
      const { gateway, socket, pose, findFirst } = setup();
      const client = socket('first');
      expect(
        await gateway.handleHuntingVisualJoin(
          client as never,
          pose('second') as never,
        ),
      ).toEqual({ ok: false });
      expect(findFirst).not.toHaveBeenCalled();
      expect(
        await gateway.handleHuntingVisualJoin(
          client as never,
          {
            ...pose('first'),
            tileX: 48,
          } as never,
        ),
      ).toEqual({ ok: false });
      expect(
        await gateway.handleHuntingVisualJoin(
          client as never,
          { ...pose('first'), areaId: '__proto__' } as never,
        ),
      ).toEqual({ ok: false });
      await gateway.handleHuntingVisualJoin(
        client as never,
        pose('first') as never,
      );
      expect(
        await gateway.handleHuntingVisualPose(
          client as never,
          {
            ...pose('first'),
            tileX: 30,
          } as never,
        ),
      ).toEqual({ ok: false });
      expect(
        await gateway.handleHuntingVisualPose(
          client as never,
          {
            ...pose('first'),
            tileX: 12.8,
          } as never,
        ),
      ).toEqual({ ok: true });
      expect(
        await gateway.handleHuntingVisualPose(
          client as never,
          {
            ...pose('first'),
            tileX: 13,
          } as never,
        ),
      ).toEqual({ ok: false });
    });

    it('transfere de sala sem manter retrato no exterior', async () => {
      const { gateway, socket, pose } = setup();
      const client = socket('first');
      await gateway.handleHuntingVisualJoin(
        client as never,
        pose('first') as never,
      );
      await gateway.handleHuntingVisualJoin(
        client as never,
        {
          ...pose('first'),
          areaId: 'casa-abandonada',
          tileX: 10,
          tileY: 10,
        } as never,
      );
      expect((client.data.rooms as Set<string>).size).toBe(1);
      expect(
        (client.data.rooms as Set<string>).has(
          'auto-combat:visual:map-1:submap-1:casa-abandonada',
        ),
      ).toBe(true);
      await gateway.handleHuntingVisualLeave(client as never);
      expect((client.data.rooms as Set<string>).size).toBe(0);
    });

    it('congela a posição publicada enquanto o combate estiver ativo', async () => {
      const { gateway, socket, pose } = setup();
      const client = socket('first');
      await gateway.handleHuntingVisualJoin(
        client as never,
        pose('first') as never,
      );
      client.data.huntingVisualCombat = {
        active: true,
        mobName: 'Mob mob-1',
        cycleKey: 'session:1:mob-1',
        eventType: 'PLAYER_HIT',
        eventKey: 'event-1',
        anchor: {
          areaId: 'suburbio',
          tileX: 12.5,
          tileY: 14.5,
          direction: 'down',
        },
        lockedUntil: null,
      };
      client.data.huntingVisualSentAt = 0;

      await gateway.handleHuntingVisualPose(
        client as never,
        {
          ...pose('first'),
          tileX: 14,
          tileY: 15,
          direction: 'right',
          moving: true,
        } as never,
      );

      expect(client.data.huntingVisual).toMatchObject({
        tileX: 12.5,
        tileY: 14.5,
        direction: 'down',
        visualState: 'combat',
        moving: false,
        combatMobName: 'Mob mob-1',
      });
    });
  });
});
