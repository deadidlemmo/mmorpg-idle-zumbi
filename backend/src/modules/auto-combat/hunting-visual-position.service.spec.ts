import {
  HuntingVisualPositionService,
  parseStoredHuntingVisualPose,
} from './hunting-visual-position.service';

describe('HuntingVisualPositionService', () => {
  const pose = {
    areaId: 'casa-abandonada' as const,
    tileX: 12.5,
    tileY: 9.5,
    direction: 'left' as const,
  };

  it('recupera a posicao da sessao ativa do proprio usuario', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'session-1',
      mapId: 'map-1',
      subMapId: 'sub-1',
    });
    const get = jest.fn().mockResolvedValue(JSON.stringify(pose));
    const service = new HuntingVisualPositionService(
      { autoCombatSession: { findFirst } } as never,
      { status: 'ready', get } as never,
    );
    expect(
      await service.getForCharacter('user-1', 'character-1'),
    ).toMatchObject({
      sessionId: 'session-1',
      mapId: 'map-1',
      pose,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        character: { userId: 'user-1', status: 'ACTIVE', deletedAt: null },
        status: 'ACTIVE',
        phase: { in: ['HUNTING', 'ENCOUNTER_READY', 'COMBAT_ACTIVE'] },
        endsAt: { gt: expect.any(Date) as Date },
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, mapId: true, subMapId: true },
    });
    expect(get).toHaveBeenCalledWith('auto-combat:visual-position:session-1');
  });

  it('nao revela nem reutiliza a posicao sem uma sessao ativa', async () => {
    const get = jest.fn();
    const service = new HuntingVisualPositionService(
      {
        autoCombatSession: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { status: 'ready', get } as never,
    );
    expect(
      await service.getForCharacter('user-2', 'character-1'),
    ).toMatchObject({
      sessionId: null,
      pose: null,
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('lista apenas pares ativos do mesmo submapa com pose valida', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'peer-1',
        phase: 'COMBAT_ACTIVE',
        currentCombatIndex: 4,
        currentMobId: 'mob-1',
        currentMob: { name: 'Errante do Subúrbio' },
        character: { id: 'character-2', name: 'Aliado' },
      },
      {
        id: 'peer-2',
        phase: 'HUNTING',
        currentCombatIndex: 1,
        currentMobId: null,
        currentMob: null,
        character: { id: 'character-3', name: 'Sem pose' },
      },
    ]);
    const get = jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(key.endsWith('peer-1') ? JSON.stringify(pose) : null),
      );
    const service = new HuntingVisualPositionService(
      {
        autoCombatSession: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'session-1',
            mapId: 'map-1',
            subMapId: 'sub-1',
          }),
          findMany,
        },
      } as never,
      { status: 'ready', get } as never,
    );
    const result = await service.getPeersForCharacter('user-1', 'character-1', [
      'character-1',
      'character-2',
      'character-3',
    ]);
    expect(result).toEqual({
      mapId: 'map-1',
      subMapId: 'sub-1',
      players: [
        {
          characterId: 'character-2',
          displayName: 'Aliado',
          ...pose,
          visualState: 'combat',
          moving: false,
          combatMobName: 'Errante do Subúrbio',
          combatCycleKey: 'peer-1:4:mob-1',
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 'session-1' },
        characterId: {
          not: 'character-1',
          in: ['character-2', 'character-3'],
        },
        mapId: 'map-1',
        subMapId: 'sub-1',
        status: 'ACTIVE',
        phase: { in: ['HUNTING', 'ENCOUNTER_READY', 'COMBAT_ACTIVE'] },
        endsAt: { gt: expect.any(Date) as Date },
        character: { status: 'ACTIVE', deletedAt: null },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      distinct: ['characterId'],
      take: 24,
      select: {
        id: true,
        phase: true,
        currentCombatIndex: true,
        currentMobId: true,
        currentMob: { select: { name: true } },
        character: { select: { id: true, name: true } },
      },
    });
  });

  it('valida bounds e salva por sessao com expiracao', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const service = new HuntingVisualPositionService(
      {} as never,
      { status: 'ready', set } as never,
    );
    await service.save('session-1', pose);
    expect(set).toHaveBeenCalledWith(
      'auto-combat:visual-position:session-1',
      JSON.stringify(pose),
      'EX',
      86400,
    );
    expect(parseStoredHuntingVisualPose({ ...pose, tileX: 44 })).toBeNull();
    expect(
      parseStoredHuntingVisualPose({ ...pose, areaId: '__proto__' }),
    ).toBeNull();
    expect(
      parseStoredHuntingVisualPose({ ...pose, direction: 'diagonal' }),
    ).toBeNull();
    await service.save('session-1', { ...pose, tileX: 44 });
    expect(set).toHaveBeenCalledTimes(1);
  });
});
