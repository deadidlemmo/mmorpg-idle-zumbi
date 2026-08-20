import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SocialService } from './social.service';

describe('SocialService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    friendship: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new SocialService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa a mesma chave para pedidos nos dois sentidos', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      isSuspended: false,
    });
    prisma.friendship.findUnique.mockResolvedValue({ id: 'friendship-1' });

    await expect(
      service.sendRequest('user-z', 'survivor@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.friendship.findUnique).toHaveBeenCalledWith({
      where: { pairKey: 'user-a:user-z' },
    });
    expect(prisma.friendship.create).not.toHaveBeenCalled();
  });

  it('permite aceitar o pedido apenas ao destinatario', async () => {
    prisma.friendship.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.accept('intruso', 'friendship-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const [updateInput] = prisma.friendship.updateMany.mock
      .calls[0] as unknown as [
      {
        where: {
          id: string;
          addresseeId: string;
          status: string;
        };
        data: { status: string; acceptedAt: Date };
      },
    ];

    expect(updateInput.where).toEqual({
      id: 'friendship-1',
      addresseeId: 'intruso',
      status: 'PENDING',
    });
    expect(updateInput.data.status).toBe('ACCEPTED');
    expect(updateInput.data.acceptedAt).toBeInstanceOf(Date);
  });
});
