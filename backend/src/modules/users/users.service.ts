import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        tokenVersion: true,
        isSuspended: true,
        termsVersion: true,
        privacyVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    termsAcceptedAt: Date;
    termsVersion: string;
    privacyAcceptedAt: Date;
    privacyVersion: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        termsAcceptedAt: data.termsAcceptedAt,
        termsVersion: data.termsVersion,
        privacyAcceptedAt: data.privacyAcceptedAt,
        privacyVersion: data.privacyVersion,
      },
      select: {
        id: true,
        email: true,
        role: true,
        tokenVersion: true,
        termsVersion: true,
        privacyVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async recordLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
      select: {
        id: true,
        email: true,
        role: true,
        tokenVersion: true,
        termsVersion: true,
        privacyVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
