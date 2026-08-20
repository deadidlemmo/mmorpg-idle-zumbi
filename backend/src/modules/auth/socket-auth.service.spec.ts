import { UnauthorizedException } from '@nestjs/common';
import { SocketAuthService } from './socket-auth.service';

describe('SocketAuthService', () => {
  const jwtService = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const service = new SocketAuthService(jwtService as never, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('aceita somente a versao atual do token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      tokenVersion: 3,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'survivor@example.com',
      tokenVersion: 3,
      isSuspended: false,
    });

    await expect(service.authenticate('token')).resolves.toEqual({
      id: 'user-1',
      email: 'survivor@example.com',
    });
  });

  it('recusa token revogado por troca de senha ou suspensao', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      tokenVersion: 2,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'survivor@example.com',
      tokenVersion: 3,
      isSuspended: false,
    });

    await expect(service.authenticate('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'survivor@example.com',
      tokenVersion: 2,
      isSuspended: true,
    });

    await expect(service.authenticate('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('recusa tokens antigos sem versao de sessao', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

    await expect(service.authenticate('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
