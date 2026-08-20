import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../../common/config/legal.config';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type AuthUserResponseSource = {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
  termsVersion?: string | null;
  privacyVersion?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type JwtPayloadData = {
  sub: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
};

const PASSWORD_RESET_EXPIRY_MS = 30 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_GENERIC_MESSAGE =
  'Se o e-mail estiver cadastrado, enviaremos as instrucoes de recuperacao.';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 12);
    const acceptedAt = new Date();

    const user = await this.usersService.create({
      email,
      passwordHash,
      termsAcceptedAt: acceptedAt,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyAcceptedAt: acceptedAt,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });

    const accessToken = await this.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    this.auditService.recordSafely({
      actorUserId: user.id,
      action: 'AUTH_REGISTER',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      },
    });

    return {
      user: this.buildUserResponse(user),
      accessToken,
    };
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('E-mail ou senha invalidos.');
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const authenticatedUser = await this.usersService.recordLogin(user.id);
    const accessToken = await this.generateToken({
      sub: authenticatedUser.id,
      email: authenticatedUser.email,
      role: authenticatedUser.role,
      tokenVersion: authenticatedUser.tokenVersion,
    });

    this.auditService.recordSafely({
      actorUserId: authenticatedUser.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: authenticatedUser.id,
    });

    return {
      user: this.buildUserResponse(authenticatedUser),
      accessToken,
    };
  }

  async requestPasswordReset(emailInput: string, requestedIp?: string | null) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user || user.isSuspended) {
      return { message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const now = new Date();
    const cooldownStartedAt = new Date(
      now.getTime() - PASSWORD_RESET_COOLDOWN_MS,
    );
    const recentRequest = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        createdAt: { gte: cooldownStartedAt },
      },
      select: { id: true },
    });

    if (recentRequest) {
      return { message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRY_MS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          requestedIp: requestedIp ?? null,
        },
      }),
    ]);

    try {
      await this.mailService.sendPasswordReset(user.email, token);
    } catch {
      await this.prisma.passwordResetToken.deleteMany({
        where: { tokenHash, usedAt: null },
      });
    }

    this.auditService.recordSafely({
      actorUserId: user.id,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: requestedIp ?? null,
    });

    const exposeToken =
      this.configService.get<string>('NODE_ENV') !== 'production' &&
      this.configService
        .get<string>('PASSWORD_RESET_EXPOSE_TOKEN')
        ?.toLowerCase() === 'true';

    return {
      message: PASSWORD_RESET_GENERIC_MESSAGE,
      ...(exposeToken ? { developmentToken: token } : {}),
    };
  }

  async confirmPasswordReset(token: string, password: string) {
    const tokenHash = this.hashResetToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() <= now.getTime() ||
      resetToken.user.isSuspended
    ) {
      throw new BadRequestException(
        'Este link de recuperacao e invalido ou expirou.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.$transaction(
      async (tx) => {
        const claimedToken = await tx.passwordResetToken.updateMany({
          where: {
            id: resetToken.id,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });

        if (claimedToken.count !== 1) {
          throw new BadRequestException(
            'Este link de recuperacao e invalido ou expirou.',
          );
        }

        const updatedUser = await tx.user.updateMany({
          where: { id: resetToken.userId, isSuspended: false },
          data: {
            passwordHash,
            tokenVersion: { increment: 1 },
          },
        });

        if (updatedUser.count !== 1) {
          throw new BadRequestException(
            'Este link de recuperacao e invalido ou expirou.',
          );
        }

        await tx.passwordResetToken.updateMany({
          where: { userId: resetToken.userId, usedAt: null },
          data: { usedAt: now },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    this.auditService.recordSafely({
      actorUserId: resetToken.userId,
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: resetToken.userId,
    });

    return { message: 'Senha redefinida. Entre novamente com a nova senha.' };
  }

  private async generateToken(payload: JwtPayloadData) {
    return this.jwtService.signAsync(payload);
  }

  private buildUserResponse(user: AuthUserResponseSource) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      termsVersion: user.termsVersion ?? null,
      privacyVersion: user.privacyVersion ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
