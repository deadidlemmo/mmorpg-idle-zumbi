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
    const service = new ActiveCharacterPresenceService({
      character: { findMany },
    } as never);

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
    const service = new ActiveCharacterPresenceService({
      character: { findMany },
    } as never);

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
  });
});
