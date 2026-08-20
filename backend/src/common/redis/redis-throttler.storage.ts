import { Logger } from '@nestjs/common';
import {
  ThrottlerStorageService,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Redis } from 'ioredis';

const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local blockedHits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { blockedHits, redis.call('PTTL', KEYS[1]), 1, blockTtl }
end

local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local hitsTtl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, hitsTtl, 1, tonumber(ARGV[3]) }
end

return { hits, hitsTtl, 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private lastFallbackWarningAt = 0;

  constructor(
    private readonly redis: Redis,
    private readonly fallback: ThrottlerStorage = new ThrottlerStorageService(),
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const namespace = `dead-idle:throttle:{${key}}:${throttlerName}`;

    try {
      const result = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        `${namespace}:hits`,
        `${namespace}:block`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      return {
        totalHits: Number(result[0]),
        timeToExpire: this.toSeconds(result[1]),
        isBlocked: Number(result[2]) === 1,
        timeToBlockExpire: this.toSeconds(result[3]),
      };
    } catch (error) {
      const now = Date.now();

      if (now - this.lastFallbackWarningAt >= 60_000) {
        this.lastFallbackWarningAt = now;
        this.logger.warn(
          `Redis indisponivel para rate limit; usando memoria local: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  private toSeconds(milliseconds: number) {
    return milliseconds > 0 ? Math.ceil(milliseconds / 1000) : 0;
  }
}
