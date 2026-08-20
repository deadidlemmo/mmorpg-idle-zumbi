import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { createRedisClient } from '../redis/redis-client.factory';
import { ConfiguredIoAdapter } from './configured-io.adapter';

export class RedisIoAdapter extends ConfiguredIoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private publisher?: Redis;
  private subscriber?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app, configService);
  }

  async connectToRedis() {
    this.publisher = createRedisClient(
      this.configService,
      'socket-io-publisher',
    );
    this.subscriber = createRedisClient(
      this.configService,
      'socket-io-subscriber',
    );

    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    this.adapterConstructor = createAdapter(this.publisher, this.subscriber);
    this.logger.log('Adapter Redis do Socket.IO conectado.');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options);

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }

  async disconnectRedis() {
    const clients = [this.publisher, this.subscriber].filter(
      (client): client is Redis => Boolean(client),
    );

    await Promise.all(
      clients.map(async (client) => {
        if (client.status === 'ready') await client.quit();
        else client.disconnect(false);
      }),
    );
  }
}
