import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WorldBossesController } from './world-bosses.controller';
import { WorldBossesGateway } from './world-bosses.gateway';
import { WorldBossesService } from './world-bosses.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule, AuthModule],
  controllers: [WorldBossesController],
  providers: [WorldBossesService, WorldBossesGateway],
  exports: [WorldBossesService],
})
export class WorldBossesModule {}
