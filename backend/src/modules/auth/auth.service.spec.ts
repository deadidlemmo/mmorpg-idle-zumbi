import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService password recovery', () => {
  const usersService = {
    findByEmail: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn() };
  const prisma = {
    passwordResetToken: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const mailService = { sendPasswordReset: jest.fn() };
  const auditService = { recordSafely: jest.fn() };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    }),
  };
  const service = new AuthService(
    usersService as never,
    jwtService as never,
    prisma as never,
    mailService as never,
    auditService as never,
    configService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (
        input:
          | Array<Promise<unknown>>
          | ((client: typeof prisma) => Promise<unknown>),
      ) => (typeof input === 'function' ? input(prisma) : Promise.all(input)),
    );
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-1' });
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    mailService.sendPasswordReset.mockResolvedValue(undefined);
  });

  it('nao revela se o e-mail esta cadastrado', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.requestPasswordReset('desconhecido@example.com', '127.0.0.1'),
    ).resolves.toEqual({
      message:
        'Se o e-mail estiver cadastrado, enviaremos as instrucoes de recuperacao.',
    });

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('persiste somente o hash e envia o token bruto por e-mail', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'survivor@example.com',
      isSuspended: false,
    });
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    await service.requestPasswordReset(' Survivor@Example.com ');

    const [, sentToken] = mailService.sendPasswordReset.mock
      .calls[0] as unknown as [string, string];
    const [createInput] = prisma.passwordResetToken.create.mock
      .calls[0] as unknown as [{ data: { tokenHash: string } }];
    const persistedData = createInput.data;

    expect(sentToken).toMatch(/^[0-9a-f]{64}$/);
    expect(persistedData.tokenHash).toBe(
      createHash('sha256').update(sentToken).digest('hex'),
    );
    expect(persistedData.tokenHash).not.toBe(sentToken);
  });

  it('invalida todas as sessoes e tokens ao redefinir a senha', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { isSuspended: false },
    });

    await service.confirmPasswordReset('a'.repeat(64), 'nova-senha-segura');

    const [userUpdate] = prisma.user.updateMany.mock.calls[0] as unknown as [
      {
        where: { id: string; isSuspended: boolean };
        data: { passwordHash: string; tokenVersion: { increment: number } };
      },
    ];
    const [tokenUpdate] = prisma.passwordResetToken.updateMany.mock
      .calls[1] as unknown as [
      {
        where: { userId: string; usedAt: null };
        data: { usedAt: Date };
      },
    ];

    expect(userUpdate.where).toEqual({
      id: 'user-1',
      isSuspended: false,
    });
    expect(userUpdate.data.passwordHash).not.toBe('nova-senha-segura');
    expect(userUpdate.data.tokenVersion).toEqual({ increment: 1 });
    expect(tokenUpdate.where).toEqual({ userId: 'user-1', usedAt: null });
    expect(tokenUpdate.data.usedAt).toBeInstanceOf(Date);
  });

  it('permite consumir o token apenas uma vez sob concorrencia', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { isSuspended: false },
    });
    prisma.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.confirmPasswordReset('b'.repeat(64), 'nova-senha-segura'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
