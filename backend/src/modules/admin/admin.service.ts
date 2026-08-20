import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { UpdateUserSuspensionDto } from './dto/update-user-suspension.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getSummary() {
    const [
      users,
      suspendedUsers,
      characters,
      activeAutoCombats,
      activeGathering,
      activeCrafting,
      activeIncursions,
      activeWorldBossParticipants,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.prisma.character.count({ where: { deletedAt: null } }),
      this.prisma.autoCombatSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.gatheringSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.craftingSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.characterIncursionSession.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.worldBossParticipant.count({ where: { leftAt: null } }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { actor: { select: { id: true, email: true, role: true } } },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        users,
        suspendedUsers,
        characters,
        activeAutoCombats,
        activeGathering,
        activeCrafting,
        activeIncursions,
        activeWorldBossParticipants,
      },
      recentAuditLogs,
    };
  }

  async listUsers(query: ListAdminUsersDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 25));
    const where = query.search
      ? {
          email: {
            contains: query.search.toLowerCase(),
            mode: 'insensitive' as const,
          },
        }
      : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          role: true,
          premiumUntil: true,
          isSuspended: true,
          suspendedAt: true,
          suspensionReason: true,
          lastLoginAt: true,
          termsVersion: true,
          privacyVersion: true,
          createdAt: true,
          _count: { select: { characters: true } },
        },
      }),
    ]);

    return {
      users,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async updateSuspension(
    actorUserId: string,
    targetUserId: string,
    dto: UpdateUserSuspensionDto,
  ) {
    if (actorUserId === targetUserId) {
      throw new BadRequestException('Voce nao pode suspender a propria conta.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Usuario nao encontrado.');

    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isSuspended: dto.suspended,
        suspendedAt: dto.suspended ? new Date() : null,
        suspensionReason: dto.suspended ? dto.reason?.trim() || null : null,
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        role: true,
        isSuspended: true,
        suspendedAt: true,
        suspensionReason: true,
      },
    });

    await this.auditService.record({
      actorUserId,
      action: dto.suspended ? 'ADMIN_USER_SUSPENDED' : 'ADMIN_USER_RESTORED',
      entityType: 'User',
      entityId: targetUserId,
      metadata: { reason: dto.reason?.trim() || null },
    });

    return { user };
  }

  async listAuditLogs(page = 1, pageSize = 50) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        include: { actor: { select: { id: true, email: true, role: true } } },
      }),
    ]);

    return { logs, total, page: safePage, pageSize: safePageSize };
  }
}
