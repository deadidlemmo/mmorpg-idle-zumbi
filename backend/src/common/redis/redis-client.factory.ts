import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export function isConfigEnabled(
  configService: ConfigService,
  key: string,
): boolean {
  return configService.get<string>(key)?.trim().toLowerCase() === 'true';
}

export function createRedisClient(
  configService: ConfigService,
  connectionName: string,
): Redis {
  const redisUrl = configService.get<string>('REDIS_URL')?.trim();
  const password = configService.get<string>('REDIS_PASSWORD')?.trim();
  const commonOptions = {
    connectionName,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: (attempt: number) => Math.min(attempt * 250, 2000),
  };

  if (redisUrl) {
    return new Redis(redisUrl, commonOptions);
  }

  return new Redis({
    ...commonOptions,
    host: configService.get<string>('REDIS_HOST')?.trim() || 'localhost',
    port: Number(configService.get<string>('REDIS_PORT')) || 6379,
    username: configService.get<string>('REDIS_USERNAME')?.trim() || undefined,
    password: password || undefined,
    tls: isConfigEnabled(configService, 'REDIS_TLS') ? {} : undefined,
  });
}
