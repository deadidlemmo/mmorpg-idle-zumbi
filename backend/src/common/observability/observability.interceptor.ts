import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { HttpException } from '@nestjs/common';
import { ObservabilityService } from './observability.service';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    let errorStatusCode: number | null = null;
    this.observability.startRequest();

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          errorStatusCode =
            error instanceof HttpException ? error.getStatus() : 500;
        },
      }),
      finalize(() => {
        this.observability.finishRequest({
          method: request.method,
          route: request.originalUrl,
          statusCode: errorStatusCode ?? response.statusCode,
          durationMs: Date.now() - startedAt,
        });
      }),
    );
  }
}
