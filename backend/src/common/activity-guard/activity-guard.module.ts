import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ActivityGuardService } from './activity-guard.service';

@Module({
  imports: [PrismaModule],
  providers: [ActivityGuardService],
  exports: [ActivityGuardService],
})
export class ActivityGuardModule {}