import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

type SocketJwtPayload = {
  sub?: string;
  tokenVersion?: number;
};

export type AuthenticatedSocketUser = {
  id: string;
  email: string;
};

@Injectable()
export class SocketAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(token: string): Promise<AuthenticatedSocketUser> {
    const payload = await this.jwtService.verifyAsync<SocketJwtPayload>(token);

    if (!payload.sub || !Number.isInteger(payload.tokenVersion)) {
      throw new UnauthorizedException('Token de WebSocket invalido.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        tokenVersion: true,
        isSuspended: true,
      },
    });

    if (
      !user ||
      user.isSuspended ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException(
        'Sessao de WebSocket invalida ou expirada.',
      );
    }

    return { id: user.id, email: user.email };
  }
}
