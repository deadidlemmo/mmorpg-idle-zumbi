import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS_COORDINATION_CLIENT } from './redis.constants';

export type LockExecutionResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly localLocks = new Set<string>();

  constructor(
    @Inject(REDIS_COORDINATION_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  async runExclusive<T>(
    key: string,
    ttlMs: number,
    task: () => Promise<T>,
  ): Promise<LockExecutionResult<T>> {
    if (!this.redis) {
      return this.runWithLocalLock(key, task);
    }

    const token = randomUUID();
    let acquired: 'OK' | null;

    try {
      acquired = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    } catch (error) {
      this.logger.error(
        `Redis indisponivel ao adquirir lock ${key}: ${this.getErrorMessage(error)}`,
      );
      return { acquired: false };
    }

    if (acquired !== 'OK') return { acquired: false };

    try {
      return { acquired: true, value: await task() };
    } finally {
      try {
        await this.redis.eval(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
          1,
          key,
          token,
        );
      } catch (error) {
        this.logger.warn(
          `Falha ao liberar lock ${key}: ${this.getErrorMessage(error)}`,
        );
      }
    }
  }

  private async runWithLocalLock<T>(
    key: string,
    task: () => Promise<T>,
  ): Promise<LockExecutionResult<T>> {
    if (this.localLocks.has(key)) return { acquired: false };

    this.localLocks.add(key);

    try {
      return { acquired: true, value: await task() };
    } finally {
      this.localLocks.delete(key);
    }
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
