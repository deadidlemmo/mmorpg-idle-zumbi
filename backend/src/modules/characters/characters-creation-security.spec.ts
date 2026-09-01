import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CharactersService,
  resolveInitialCharacterGold,
} from './characters.service';

describe('CharactersService creation security', () => {
  it('concede Gold inicial somente quando a conta nunca recebeu o beneficio', () => {
    expect(resolveInitialCharacterGold(null)).toBe(250);
    expect(resolveInitialCharacterGold(new Date())).toBe(0);
    expect(resolveInitialCharacterGold(null, true)).toBe(0);
  });

  it('bloqueia a conta antes de contar os personagens ativos', async () => {
    const stoppedAfterCount = new Error('stop-after-count');
    const queryRaw = jest
      .fn()
      .mockResolvedValue([{ id: 'user-1', starterGoldGrantedAt: null }]);
    const count = jest.fn().mockRejectedValue(stoppedAfterCount);
    const tx = {
      $queryRaw: queryRaw,
      character: { count },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new CharactersService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create('user-1', {
        name: 'Novo Heroi',
        className: 'Lutador',
      }),
    ).rejects.toBe(stoppedAfterCount);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      count.mock.invocationCallOrder[0],
    );
  });

  it('interrompe a criacao quando a conta nao existe', async () => {
    const count = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      character: { count },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new CharactersService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create('missing-user', {
        name: 'Novo Heroi',
        className: 'Lutador',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(count).not.toHaveBeenCalled();
  });
});
