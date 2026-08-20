import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

type AuthenticatedRequest = Request & {
  user?: { id?: string };
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method.toUpperCase();

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const startedAt = Date.now();
    const path = request.originalUrl.split('?')[0];
    const rawEntityId =
      request.params?.id ?? request.params?.characterId ?? null;
    const entityId = Array.isArray(rawEntityId)
      ? (rawEntityId[0] ?? null)
      : rawEntityId;

    return next.handle().pipe(
      tap({
        next: () => {
          this.auditService.recordSafely({
            actorUserId: request.user?.id ?? null,
            action: `HTTP_${method}`,
            entityType: path,
            entityId,
            ipAddress: request.ip,
            userAgent: request.get('user-agent') ?? null,
            metadata: {
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
            },
          });
        },
      }),
    );
  }
}
