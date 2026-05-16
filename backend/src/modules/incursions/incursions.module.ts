import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { IncursionsController } from './incursions.controller';
import { IncursionsGateway } from './incursions.gateway';
import { IncursionsService } from './incursions.service';

@Module({
  imports: [
    PrismaModule,
    ActivityGuardModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [IncursionsController],
  providers: [IncursionsService, IncursionsGateway],
  exports: [IncursionsService],
})
export class IncursionsModule {}
