import {
  AutoCombatSessionPhase,
  CharacterStatus,
  type Prisma,
} from '@prisma/client';
import { ActiveCharacterPresenceService } from './active-character-presence.service';

describe('ActiveCharacterPresenceService', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');

  it('conta personagens online e em atividade apenas uma vez', async () => {
    const findMany = jest
      .fn<Promise<Array<{ id: string }>>, [Prisma.CharacterFindManyArgs]>()
      .mockResolvedValue([
        { id: 'online-and-active' },
        { id: 'offline-active-1' },
        { id: 'offline-active-2' },
      ]);
    const service = new ActiveCharacterPresenceService(
      {
        character: { findMany },
      } as never,
      { getResolvedAppearances: jest.fn() } as never,
    );

    const status = await service.getStatus(
      ['online-idle', 'online-and-active', 'online-idle'],
      now,
    );

    expect(status).toEqual({
      activeCharacters: 4,
      onlineCharacters: 2,
      activityCharacters: 3,
      offlineActivityCharacters: 2,
      onlinePlayers: 4,
      updatedAt: now.toISOString(),
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('filtra as atividades pelo estado e pelo prazo canonico', async () => {
    const findMany = jest
      .fn<Promise<Array<{ id: string }>>, [Prisma.CharacterFindManyArgs]>()
      .mockResolvedValue([]);
    const service = new ActiveCharacterPresenceService(
      {
        character: { findMany },
      } as never,
      { getResolvedAppearances: jest.fn() } as never,
    );

    await service.getStatus([], now);

    const query = findMany.mock.calls[0]?.[0];
    const activityFilters = query?.where?.OR ?? [];

    expect(query?.where?.deletedAt).toBeNull();
    expect(query?.where?.status).toBe(CharacterStatus.ACTIVE);
    expect(query?.select).toEqual({ id: true });
    expect(activityFilters).toHaveLength(6);
    expect(activityFilters).toContainEqual({ infirmaryEndsAt: { gt: now } });
    expect(
      activityFilters.some((filter) => 'autoCombatSessions' in filter),
    ).toBe(true);
    expect(
      activityFilters.some((filter) => 'gatheringSessions' in filter),
    ).toBe(true);
    expect(activityFilters.some((filter) => 'craftingSessions' in filter)).toBe(
      true,
    );
    expect(
      activityFilters.some((filter) => 'incursionSessions' in filter),
    ).toBe(true);
    expect(
      activityFilters.some((filter) => 'worldBossParticipations' in filter),
    ).toBe(true);
    const worldBossFilter = activityFilters.find(
      (filter) => 'worldBossParticipations' in filter,
    );
    expect(worldBossFilter).toMatchObject({
      worldBossParticipations: {
        some: {
          leftAt: null,
          confirmedAt: { not: null },
          event: {
            status: {
              in: ['ACTIVE'],
            },
          },
        },
      },
    });
  });

  it('lista online primeiro e informa quando a presenca vem apenas de atividade', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'online-and-active' },
        { id: 'offline-active' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'offline-active',
          name: 'Bia',
          level: 20,
          xp: 200,
          avatarKey: 'bia',
          class: { id: 'medico', name: 'Médico' },
          map: { id: 'map-2', name: 'Distrito', tier: 2 },
        },
        {
          id: 'online-only',
          name: 'Ana',
          level: 10,
          xp: 100,
          avatarKey: 'ana',
          class: { id: 'lutador', name: 'Lutador' },
          map: { id: 'map-1', name: 'Subúrbio', tier: 1 },
        },
        {
          id: 'online-and-active',
          name: 'Caio',
          level: 5,
          xp: 50,
          avatarKey: 'caio',
          class: { id: 'atirador', name: 'Atirador' },
          map: { id: 'map-1', name: 'Subúrbio', tier: 1 },
        },
      ]);
    const getResolvedAppearances = jest.fn().mockResolvedValue({
      'online-only': { accentColor: '#fff' },
    });
    const service = new ActiveCharacterPresenceService(
      { character: { findMany } } as never,
      { getResolvedAppearances } as never,
    );

    const result = await service.getActiveCharacters(
      ['online-only', 'online-and-active'],
      now,
    );

    expect(result).toMatchObject({
      activeCharacters: 3,
      onlineCharacters: 2,
      activityCharacters: 2,
      offlineActivityCharacters: 1,
      updatedAt: now.toISOString(),
    });
    expect(result.characters.map(({ character }) => character.id)).toEqual([
      'online-only',
      'online-and-active',
      'offline-active',
    ]);
    expect(result.characters[0]).toMatchObject({
      appearance: { accentColor: '#fff' },
      presence: { online: true, inActivity: false, status: 'ONLINE' },
    });
    expect(result.characters[2]).toMatchObject({
      presence: { online: false, inActivity: true, status: 'ACTIVITY' },
    });
    expect(getResolvedAppearances).toHaveBeenCalledWith([
      'offline-active',
      'online-only',
      'online-and-active',
    ]);
  });

  it('descreve a atividade atual de cada sobrevivente', async () => {
    const map = { id: 'map-1', name: 'Distrito da Ferrugem', tier: 2 };
    const baseCharacter = {
      level: 11,
      xp: 100,
      avatarKey: null,
      class: { id: 'lutador', name: 'Lutador' },
      map,
    };
    const characters = [
      {
        ...baseCharacter,
        id: 'boss',
        name: 'Boss',
        worldBossParticipations: [
          {
            event: {
              worldBoss: { name: 'Capataz Enferrujado' },
            },
          },
        ],
      },
      {
        ...baseCharacter,
        id: 'incursion',
        name: 'Incursão',
        incursionSessions: [{ incursion: { name: 'Ruptura no Viaduto' } }],
      },
      {
        ...baseCharacter,
        id: 'hunting',
        name: 'Rastreio',
        autoCombatSessions: [
          {
            phase: AutoCombatSessionPhase.HUNTING,
            map: { name: 'Distrito da Ferrugem' },
            subMap: { name: 'Galpão do Capataz' },
          },
        ],
      },
      {
        ...baseCharacter,
        id: 'combat',
        name: 'Combate',
        autoCombatSessions: [
          {
            phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
            map: { name: 'Distrito da Ferrugem' },
            subMap: { name: 'Galpão do Capataz' },
          },
        ],
      },
      {
        ...baseCharacter,
        id: 'gathering',
        name: 'Coleta',
        gatheringSessions: [{ targetMaterial: { name: 'Sucata Oxidada' } }],
      },
      {
        ...baseCharacter,
        id: 'crafting',
        name: 'Criação',
        craftingSessions: [{ outputItem: { name: 'Armadura de Retalhos' } }],
      },
      {
        ...baseCharacter,
        id: 'infirmary',
        name: 'Enfermaria',
        infirmaryEndsAt: new Date('2026-08-27T13:00:00.000Z'),
      },
    ];
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(characters.map(({ id }) => ({ id })))
      .mockResolvedValueOnce(characters);
    const service = new ActiveCharacterPresenceService(
      { character: { findMany } } as never,
      { getResolvedAppearances: jest.fn().mockResolvedValue({}) } as never,
    );

    const result = await service.getActiveCharacters([], now);
    const activityByCharacter = Object.fromEntries(
      result.characters.map((entry) => [
        entry.character.id,
        entry.presence.activity,
      ]),
    );

    expect(activityByCharacter).toMatchObject({
      boss: {
        type: 'WORLD_BOSS',
        label: 'Ameaça Global: Capataz Enferrujado',
      },
      incursion: {
        type: 'INCURSION',
        label: 'Incursão: Ruptura no Viaduto',
      },
      hunting: {
        type: 'AUTO_COMBAT',
        label: 'Rastreando em Distrito da Ferrugem',
      },
      combat: {
        type: 'AUTO_COMBAT',
        label: 'Auto combate em Distrito da Ferrugem',
      },
      gathering: {
        type: 'GATHERING',
        label: 'Coletando Sucata Oxidada',
      },
      crafting: {
        type: 'CRAFTING',
        label: 'Fabricando Armadura de Retalhos',
      },
      infirmary: { type: 'INFIRMARY', label: 'Na enfermaria' },
    });
  });

  it('lista somente rastreadores do mesmo mapa e submapa', async () => {
    const findFirstCharacter = jest
      .fn<Promise<{ id: string } | null>, [Prisma.CharacterFindFirstArgs]>()
      .mockResolvedValue({ id: 'local' });
    const findFirstSession = jest
      .fn<
        Promise<{
          id: string;
          mapId: string;
          subMapId: string;
        } | null>,
        [Prisma.AutoCombatSessionFindFirstArgs]
      >()
      .mockResolvedValue({
        id: 'session-local',
        mapId: 'map-1',
        subMapId: 'submap-1',
      });
    const findManySessions = jest
      .fn<
        Promise<
          Array<{
            phase: AutoCombatSessionPhase;
            startedAt: Date;
            huntBatch: {
              cycleStartedAt: Date | null;
              cycleEndsAt: Date | null;
            } | null;
            character: {
              id: string;
              name: string;
              avatarKey: string | null;
            };
          }>
        >,
        [Prisma.AutoCombatSessionFindManyArgs]
      >()
      .mockResolvedValue([
        {
          phase: AutoCombatSessionPhase.HUNTING,
          startedAt: new Date('2026-08-27T11:30:00.000Z'),
          huntBatch: {
            cycleStartedAt: new Date('2026-08-27T11:30:05.000Z'),
            cycleEndsAt: new Date('2026-08-27T11:30:20.000Z'),
          },
          character: {
            id: 'remote-1',
            name: 'Helena',
            avatarKey: 'helena',
          },
        },
        {
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          startedAt: new Date('2026-08-27T11:00:00.000Z'),
          huntBatch: null,
          character: {
            id: 'remote-2',
            name: 'Carlos',
            avatarKey: null,
          },
        },
      ]);
    const service = new ActiveCharacterPresenceService(
      {
        character: { findFirst: findFirstCharacter },
        autoCombatSession: {
          findFirst: findFirstSession,
          findMany: findManySessions,
        },
      } as never,
      { getResolvedAppearances: jest.fn() } as never,
    );

    const result = await service.getHuntingPresences('user-1', 'local', now);

    expect(findFirstCharacter.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'local', userId: 'user-1' },
    });
    expect(findManySessions.mock.calls[0]?.[0]).toMatchObject({
      where: {
        characterId: { not: 'local' },
        mapId: 'map-1',
        subMapId: 'submap-1',
        phase: {
          in: [
            AutoCombatSessionPhase.HUNTING,
            AutoCombatSessionPhase.ENCOUNTER_READY,
          ],
        },
      },
      distinct: ['characterId'],
      take: 24,
      select: {
        huntBatch: {
          select: {
            cycleStartedAt: true,
            cycleEndsAt: true,
          },
        },
      },
    });
    expect(result).toEqual({
      mapId: 'map-1',
      subMapId: 'submap-1',
      updatedAt: now.toISOString(),
      characters: [
        {
          id: 'remote-1',
          name: 'Helena',
          avatarKey: 'helena',
          phase: AutoCombatSessionPhase.HUNTING,
          startedAt: '2026-08-27T11:30:00.000Z',
          cycleStartedAt: '2026-08-27T11:30:05.000Z',
          cycleEndsAt: '2026-08-27T11:30:20.000Z',
        },
        {
          id: 'remote-2',
          name: 'Carlos',
          avatarKey: null,
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          startedAt: '2026-08-27T11:00:00.000Z',
          cycleStartedAt: null,
          cycleEndsAt: null,
        },
      ],
    });
  });

  it('retorna a area vazia quando o personagem nao esta rastreando', async () => {
    const service = new ActiveCharacterPresenceService(
      {
        character: { findFirst: jest.fn().mockResolvedValue({ id: 'local' }) },
        autoCombatSession: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
        },
      } as never,
      { getResolvedAppearances: jest.fn() } as never,
    );

    await expect(
      service.getHuntingPresences('user-1', 'local', now),
    ).resolves.toEqual({
      mapId: null,
      subMapId: null,
      updatedAt: now.toISOString(),
      characters: [],
    });
  });
});
