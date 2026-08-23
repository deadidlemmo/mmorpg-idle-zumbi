import { NotFoundException } from '@nestjs/common';
import { GatheringService } from './gathering.service';

describe('GatheringService ownership', () => {
  it('não expõe o status de um personagem fora da conta autenticada', async () => {
    const prisma = {
      character: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      gatheringSession: {
        findFirst: jest.fn(),
      },
    };
    const service = new GatheringService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getStatus('user-1', 'foreign-character'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.character.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-character',
        userId: 'user-1',
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(prisma.gatheringSession.findFirst).not.toHaveBeenCalled();
  });
});
