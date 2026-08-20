import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  tokenVersion: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (
      !user ||
      user.isSuspended ||
      payload.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException('Sessao invalida ou expirada.');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
