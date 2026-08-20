import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { IncursionsController } from './incursions.controller';
import { IncursionsGateway } from './incursions.gateway';
import { IncursionsService } from './incursions.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule, AuthModule],
  controllers: [IncursionsController],
  providers: [IncursionsService, IncursionsGateway],
  exports: [IncursionsService],
})
export class IncursionsModule {}
