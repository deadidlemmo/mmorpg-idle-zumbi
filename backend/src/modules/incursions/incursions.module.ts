import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { IncursionsController } from './incursions.controller';
import { IncursionsService } from './incursions.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule],
  controllers: [IncursionsController],
  providers: [IncursionsService],
  exports: [IncursionsService],
})
export class IncursionsModule {}
