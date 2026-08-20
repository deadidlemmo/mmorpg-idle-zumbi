import { UnauthorizedException } from '@nestjs/common';
import { GatheringController } from './gathering.controller';

describe('GatheringController', () => {
  const gatheringService = {
    start: jest.fn(),
    getStatus: jest.fn(),
    collect: jest.fn(),
    stop: jest.fn(),
  };

  const controller = new GatheringController(gatheringService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('encaminha o usuário autenticado ao iniciar gathering', async () => {
    gatheringService.start.mockResolvedValue({ active: true });
    const dto = { characterId: 'character-1' };

    await expect(
      controller.start({ user: { id: 'user-1' } }, dto as never),
    ).resolves.toEqual({ active: true });

    expect(gatheringService.start).toHaveBeenCalledWith('user-1', dto);
  });

  it('rejeita chamadas sem identidade autenticada', () => {
    expect(() => controller.getStatus({}, 'character-1')).toThrow(
      UnauthorizedException,
    );
    expect(gatheringService.getStatus).not.toHaveBeenCalled();
  });

  it('encaminha ownership em status, coleta e encerramento', async () => {
    gatheringService.getStatus.mockResolvedValue({ active: false });
    gatheringService.collect.mockResolvedValue({ collected: 2 });
    gatheringService.stop.mockResolvedValue({ active: false });
    const request = { user: { id: 'user-1' } };

    await controller.getStatus(request, 'character-1');
    await controller.collect(request, 'character-1');
    await controller.stop(request, 'character-1');

    expect(gatheringService.getStatus).toHaveBeenCalledWith(
      'user-1',
      'character-1',
    );
    expect(gatheringService.collect).toHaveBeenCalledWith(
      'user-1',
      'character-1',
    );
    expect(gatheringService.stop).toHaveBeenCalledWith('user-1', 'character-1');
  });
});
