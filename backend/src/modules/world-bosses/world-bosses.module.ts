import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorldBossesController } from './world-bosses.controller';
import { WorldBossesGateway } from './world-bosses.gateway';
import { WorldBossesService } from './world-bosses.service';

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
  controllers: [WorldBossesController],
  providers: [WorldBossesService, WorldBossesGateway],
  exports: [WorldBossesService],
})
export class WorldBossesModule {}
