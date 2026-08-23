import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  buildAllowedCorsOrigins,
  isCorsOriginAllowed,
} from './common/config/cors.util';
import { isConfigEnabled } from './common/redis/redis-client.factory';
import { ConfiguredIoAdapter } from './common/websocket/configured-io.adapter';
import { RedisIoAdapter } from './common/websocket/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV');
  const production = nodeEnv?.trim().toLowerCase() === 'production';
  const allowedOrigins = buildAllowedCorsOrigins({
    nodeEnv,
    frontendUrl: configService.get<string>('FRONTEND_URL'),
    configuredOrigins: configService.get<string>('CORS_ALLOWED_ORIGINS'),
  });
  const trustProxyHops = Number(configService.get<string>('TRUST_PROXY_HOPS'));

  if (production && allowedOrigins.size === 0) {
    throw new Error(
      'Configure FRONTEND_URL ou CORS_ALLOWED_ORIGINS em producao.',
    );
  }

  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.use(helmet());

  app.enableShutdownHooks();

  if (isConfigEnabled(configService, 'SOCKET_REDIS_ADAPTER_ENABLED')) {
    const redisIoAdapter = new RedisIoAdapter(app, configService);
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
  } else {
    app.useWebSocketAdapter(new ConfiguredIoAdapter(app, configService));
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (
        isCorsOriginAllowed({
          origin,
          allowedOrigins,
          allowDevelopmentTunnels: !production,
        })
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin não permitida pelo CORS: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Cache-Control',
      'Content-Type',
      'Expires',
      'Pragma',
      'X-Requested-With',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT || process.env.APP_PORT) || 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`Backend rodando em http://localhost:${port}`);
}

void bootstrap();
