import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type AuthUserResponseSource = {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

type JwtPayloadData = {
  sub: string;
  email: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);

    const user = await this.usersService.create({
      email,
      passwordHash,
    });

    const accessToken = await this.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
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

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const accessToken = await this.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: this.buildUserResponse(user),
      accessToken,
    };
  }

  private async generateToken(payload: JwtPayloadData) {
    return this.jwtService.signAsync(payload);
  }

  private buildUserResponse(user: AuthUserResponseSource) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
