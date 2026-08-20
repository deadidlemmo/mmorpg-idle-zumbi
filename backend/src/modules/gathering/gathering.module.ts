import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GatheringController } from './gathering.controller';
import { GatheringGateway } from './gathering.gateway';
import { GatheringService } from './gathering.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule, AuthModule],
  controllers: [GatheringController],
  providers: [GatheringService, GatheringGateway],
  exports: [GatheringService],
})
export class GatheringModule {}
