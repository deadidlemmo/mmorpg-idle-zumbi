import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntryInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  deduplicationKey?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntryInput) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        deduplicationKey: entry.deduplicationKey ?? null,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  recordSafely(entry: AuditEntryInput) {
    void this.record(entry).catch((error) => {
      this.logger.warn(
        `Falha ao registrar auditoria ${entry.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  recordMilestoneSafely(entry: AuditEntryInput & { deduplicationKey: string }) {
    void this.record(entry).catch((error) => {
      if (this.isUniqueConstraintError(error)) return;

      this.logger.warn(
        `Falha ao registrar marco ${entry.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
