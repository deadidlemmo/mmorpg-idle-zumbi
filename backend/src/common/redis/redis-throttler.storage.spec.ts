import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('converte o resultado atomico do Redis para o contrato do throttler', async () => {
    const redis = { eval: jest.fn().mockResolvedValue([4, 5_500, 1, 3_100]) };
    const fallback = { increment: jest.fn() };
    const storage = new RedisThrottlerStorage(redis as never, fallback);

    await expect(
      storage.increment('request-key', 60_000, 3, 10_000, 'api'),
    ).resolves.toEqual({
      totalHits: 4,
      timeToExpire: 6,
      isBlocked: true,
      timeToBlockExpire: 4,
    });
    expect(fallback.increment).not.toHaveBeenCalled();
  });

  it('usa armazenamento local quando o Redis falha', async () => {
    const redis = { eval: jest.fn().mockRejectedValue(new Error('offline')) };
    const fallbackResult = {
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
    const fallback = {
      increment: jest.fn().mockResolvedValue(fallbackResult),
    };
    const storage = new RedisThrottlerStorage(redis as never, fallback);

    await expect(
      storage.increment('request-key', 60_000, 3, 10_000, 'api'),
    ).resolves.toEqual(fallbackResult);
    expect(fallback.increment).toHaveBeenCalledTimes(1);
  });
});
