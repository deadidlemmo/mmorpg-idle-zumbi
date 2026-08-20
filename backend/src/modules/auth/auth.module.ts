import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { SocketAuthService } from './socket-auth.service';

function getJwtExpirySeconds(value?: string) {
  const normalized = value?.trim().toLowerCase() || '7d';
  const match = normalized.match(/^(\d+)([smhd])?$/);

  if (!match) return 7 * 24 * 60 * 60;

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multiplier: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return amount * (multiplier[unit] ?? 1);
}

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: getJwtExpirySeconds(
            configService.get<string>('JWT_EXPIRES_IN'),
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, SocketAuthService],
  exports: [RolesGuard, SocketAuthService],
})
export class AuthModule {}
