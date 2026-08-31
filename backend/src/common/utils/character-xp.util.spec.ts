import type { Prisma } from '@prisma/client';
import { getTotalXpRequiredForLevel } from './level.util';
import { grantCharacterXp } from './character-xp.util';

describe('grantCharacterXp', () => {
  it('usa incremento atomico e persiste o nivel derivado do XP retornado', async () => {
    const totalXp = getTotalXpRequiredForLevel(3);
    const update = jest
      .fn()
      .mockResolvedValueOnce({ level: 1, xp: totalXp })
      .mockResolvedValueOnce({ level: 3, xp: totalXp });
    const tx = {
      character: { update },
    } as unknown as Prisma.TransactionClient;

    const result = await grantCharacterXp(tx, 'character-1', totalXp);

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'character-1' },
      data: { xp: { increment: totalXp } },
      select: { level: true, xp: true },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'character-1' },
      data: { level: 3 },
    });
    expect(result).toMatchObject({
      oldLevel: 1,
      newLevel: 3,
      currentXp: 0,
      gainedXp: totalXp,
      totalXp,
    });
  });

  it('nao reduz XP quando recebe recompensa invalida', async () => {
    const currentXp = getTotalXpRequiredForLevel(5) + 1234;
    const findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ level: 5, xp: currentXp });
    const update = jest.fn();
    const tx = {
      character: { findUniqueOrThrow, update },
    } as unknown as Prisma.TransactionClient;

    const result = await grantCharacterXp(tx, 'character-1', -100);

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'character-1' },
      select: { level: true, xp: true },
    });
    expect(update).not.toHaveBeenCalled();
    expect(result.totalXp).toBe(currentXp);
    expect(result.gainedXp).toBe(0);
  });
});
