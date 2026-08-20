import {
  Global,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { DistributedLockService } from './distributed-lock.service';
import { createRedisClient, isConfigEnabled } from './redis-client.factory';
import { REDIS_COORDINATION_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_COORDINATION_CLIENT,
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService,
      ): Promise<Redis | null> => {
        if (!isConfigEnabled(configService, 'REDIS_COORDINATION_ENABLED')) {
          return null;
        }

        const client = createRedisClient(configService, 'game-coordination');

        try {
          await client.connect();
          await client.ping();
          return client;
        } catch (error) {
          client.disconnect(false);

          if (isConfigEnabled(configService, 'REDIS_REQUIRED')) {
            throw error;
          }

          new Logger('RedisCoordination').warn(
            `Redis indisponivel; usando coordenacao local: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return null;
        }
      },
    },
    DistributedLockService,
    {
      provide: 'REDIS_COORDINATION_SHUTDOWN',
      inject: [REDIS_COORDINATION_CLIENT],
      useFactory: (client: Redis | null): OnApplicationShutdown => ({
        async onApplicationShutdown() {
          if (client?.status === 'ready') await client.quit();
          else client?.disconnect(false);
        },
      }),
    },
  ],
  exports: [DistributedLockService, REDIS_COORDINATION_CLIENT],
})
export class RedisCoordinationModule {}
