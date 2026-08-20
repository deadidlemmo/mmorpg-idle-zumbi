import { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'node:http';
import type { ServerOptions } from 'socket.io';
import {
  buildAllowedCorsOrigins,
  isCorsOriginAllowed,
} from '../config/cors.util';

type SocketIoOptions = Partial<ServerOptions>;

export function applySocketIoSecurityOptions(
  configService: ConfigService,
  options: SocketIoOptions = {},
): SocketIoOptions {
  const nodeEnv = configService.get<string>('NODE_ENV');
  const production = nodeEnv?.trim().toLowerCase() === 'production';
  const allowedOrigins = buildAllowedCorsOrigins({
    nodeEnv,
    frontendUrl: configService.get<string>('FRONTEND_URL'),
    configuredOrigins: configService.get<string>('CORS_ALLOWED_ORIGINS'),
  });
  const originalAllowRequest = options.allowRequest;
  const isAllowed = (origin?: string) =>
    isCorsOriginAllowed({
      origin,
      allowedOrigins,
      allowDevelopmentTunnels: !production,
    });

  return {
    ...options,
    cors: {
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: [
        'Accept',
        'Authorization',
        'Cache-Control',
        'Content-Type',
      ],
      origin: (origin, callback) => {
        if (isAllowed(origin)) {
          callback(null, true);
          return;
        }

        callback(
          new Error(`Origin nao permitida pelo Socket.IO: ${origin}`),
          false,
        );
      },
    },
    allowRequest: (
      request: IncomingMessage,
      callback: (error: string | null | undefined, success: boolean) => void,
    ) => {
      const origin = request.headers.origin;

      if (!isAllowed(origin)) {
        callback(`Origin nao permitida pelo Socket.IO: ${origin}`, false);
        return;
      }

      if (originalAllowRequest) {
        originalAllowRequest(request, callback);
        return;
      }

      callback(null, true);
    },
  };
}
