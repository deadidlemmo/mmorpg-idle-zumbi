import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.configService
      .get<string>('METRICS_TOKEN')
      ?.trim();
    const production =
      this.configService.get<string>('NODE_ENV')?.toLowerCase() ===
      'production';

    if (!expectedToken) {
      if (production) {
        throw new ServiceUnavailableException(
          'Endpoint de metricas indisponivel sem METRICS_TOKEN.',
        );
      }

      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const receivedToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';
    const expectedBuffer = Buffer.from(expectedToken);
    const receivedBuffer = Buffer.from(receivedToken);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('Token de metricas invalido.');
    }

    return true;
  }
}
