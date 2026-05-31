import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AutoCombatController } from './auto-combat.controller';
import { AutoCombatGateway } from './auto-combat.gateway';
import { AutoCombatService } from './auto-combat.service';

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
  controllers: [AutoCombatController],
  providers: [AutoCombatService, AutoCombatGateway],
  exports: [AutoCombatService],
})
export class AutoCombatModule {}
