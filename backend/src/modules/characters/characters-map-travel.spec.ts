import { CharacterStatus } from '@prisma/client';
import { CharactersService } from './characters.service';

describe('CharactersService map travel', () => {
  it('permite que personagem de nível 1 viaje para um mapa de tier alto', async () => {
    const overview = { character: { id: 'character-1' } };
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'character-1',
          level: 1,
          status: CharacterStatus.ACTIVE,
        }),
        update: jest.fn().mockResolvedValue({ id: 'character-1' }),
      },
      gameMap: {
        findUnique: jest.fn().mockResolvedValue({ id: 'map-t5' }),
      },
    };
    const activityGuard = {
      ensureCanTravelMap: jest.fn().mockResolvedValue({}),
    };
    const service = new CharactersService(
      prisma as never,
      activityGuard as never,
      {} as never,
      {} as never,
    );

    jest.spyOn(service, 'getOverview').mockResolvedValue(overview as never);

    await expect(
      service.updateCurrentMap('user-1', 'character-1', 'map-t5'),
    ).resolves.toBe(overview);

    expect(activityGuard.ensureCanTravelMap).toHaveBeenCalledWith({
      userId: 'user-1',
      characterId: 'character-1',
    });
    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'character-1' },
      data: { mapId: 'map-t5' },
    });
  });
});
