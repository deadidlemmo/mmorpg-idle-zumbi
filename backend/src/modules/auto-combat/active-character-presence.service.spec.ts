import type { Prisma } from '@prisma/client';
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
});
